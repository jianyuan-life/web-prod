// ============================================================
// 報告生成 Workflow — 主流程編排（"use workflow" 沙箱環境）
// 每個 step 自動持久化、自動重試、崩潰後自動恢復
// ============================================================

import {
  loadReportRecord,
  callPythonCalculate,
  aiGenerateCall1,
  aiGenerateCall2,
  aiGenerateCall3,
  aiGenerateGeneric,
  loadFamilyReports,
  loadFamilyReportsByIds,
  aiGenerateG15,
  aiGenerateR,
  cleanFinalReport,
  validateReportAgainstData,
  qualityGate,
  aiReviewReport,
  generatePDF,
  saveReportToSupabase,
  sendReportEmail,
  markReportFailed,
  closeProgressStream,
  buildAppendix,
  setCurrentReportId,
  PLAN_SYSTEM_PROMPT,
  type BirthData,
} from './steps'

export async function generateReportWorkflow(reportId: string) {
  "use workflow";

  // 設定全域 reportId，讓 emitProgress 能同步寫入 Supabase
  setCurrentReportId(reportId)

  // Step 0: 從 Supabase 載入報告記錄
  let record
  try {
    record = await loadReportRecord(reportId)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) || '未知錯誤'
    await markReportFailed(reportId, `載入報告記錄失敗: ${errMsg.slice(0, 500)}`)
    await closeProgressStream()
    return { success: false, error: '載入記錄失敗' }
  }

  const { birthData, planCode, accessToken, customerEmail } = record

  // ── G15 家族藍圖：特殊流程（不排盤，直接讀取已有報告）──
  if (planCode === 'G15' && (birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports')) {
    try {
      const memberNames = (birthData.member_names || []) as string[]

      // 載入所有成員的已完成人生藍圖（新版用 report ID，舊版用 email）
      let familyReports
      if (birthData.plan_type === 'family_reports' && birthData.report_ids) {
        const reportIds = (birthData.report_ids || []) as string[]
        familyReports = await loadFamilyReportsByIds(reportIds, memberNames)
      } else {
        const memberEmails = (birthData.member_emails || []) as string[]
        familyReports = await loadFamilyReports(memberEmails, memberNames)
      }

      // AI 生成家族互動分析
      const systemPrompt = PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C']
      const result = await aiGenerateG15(familyReports, planCode, systemPrompt, reportId)
      const reportContent = result.content

      if (!reportContent) {
        await markReportFailed(reportId, 'AI 未回覆：AI 回傳空內容')
        await closeProgressStream()
        return { success: false, error: 'AI 未回覆' }
      }

      // 品質閘門
      try {
        const qResult = await qualityGate(reportContent, 'G15', familyReports.length)
        if (!qResult.passed) {
          console.warn(`G15 品質閘門警告: ${qResult.warnings.join('; ')}`)
        }
      } catch (e) {
        console.error('G15 品質閘門執行失敗:', e)
      }

      // AI 審核
      try {
        const review = await aiReviewReport(reportContent, 'G15')
        if (review.score < 70) {
          console.warn(`G15 AI 審核分數偏低: ${review.score}`)
        }
      } catch (e) {
        console.error('G15 AI 審核失敗（不阻塞）:', e)
      }

      // G15 用全體成員名字
      const familyNames = familyReports.map(r => r.name).join('、')
      const familyBirthData = { ...familyReports[0].birthData, name: familyNames + ' 家族' }

      // 生成 PDF
      let pdfUrl: string | null = null
      try {
        pdfUrl = await generatePDF(reportId, planCode, familyBirthData, reportContent, [])
      } catch (e) {
        console.error('G15 PDF 生成失敗（不影響報告）:', e)
      }

      // 儲存到 Supabase
      await saveReportToSupabase(reportId, reportContent, result.model, [], pdfUrl, null)

      // 寄送 Email
      try {
        await sendReportEmail(reportId, customerEmail, accessToken, familyBirthData, planCode, reportContent, familyReports.length)
      } catch (e) {
        console.error('G15 Email 寄送失敗（報告已完成）:', e)
      }

      await closeProgressStream()
      return {
        success: true,
        reportId,
        contentLength: reportContent.length,
        systemsCount: familyReports.length,
        aiModel: result.model,
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) || '未知錯誤'
      await markReportFailed(reportId, `G15 家族藍圖生成失敗: ${errMsg.slice(0, 500)}`)
      await closeProgressStream()
      return { success: false, error: 'G15 生成失敗' }
    }
  }

  // ── R 方案「合否？」：為每位成員分別排盤，合併後 AI 合盤分析 ──
  if (planCode === 'R' && birthData.plan === 'R' && Array.isArray(birthData.members)) {
    try {
      const members = birthData.members as Array<{
        name?: string; gender?: string; year?: number; month?: number; day?: number;
        hour?: number; minute?: number;
        city_lat?: number; city_lng?: number; cityLat?: number; cityLng?: number;
        latitude?: number; longitude?: number;
        timezone_offset?: number; city_tz?: number; cityTz?: number;
        calendar_type?: string; lunar_leap?: boolean;
        time_unknown?: boolean; time_mode?: string;
      }>
      console.log(`R 方案：為 ${members.length} 位成員分別排盤...`)

      // 為每位成員分別呼叫排盤 API
      const memberResults = []
      for (const member of members) {
        const lat = member.latitude || member.city_lat || member.cityLat
        const lng = member.longitude || member.city_lng || member.cityLng
        const tz = member.timezone_offset || member.city_tz || member.cityTz || 8
        const memberBirthData = {
          name: member.name || '',
          year: member.year || 0,
          month: member.month || 0,
          day: member.day || 0,
          hour: member.hour || 0,
          minute: member.minute || 0,
          gender: member.gender || 'M',
          latitude: lat,
          longitude: lng,
          timezone_offset: tz,
          calendar_type: member.calendar_type || 'solar',
          lunar_leap: member.lunar_leap || false,
          time_unknown: member.time_unknown || false,
          time_mode: member.time_mode || 'shichen',
        }
        const result = await callPythonCalculate(memberBirthData)
        memberResults.push(result)
      }

      // AI 生成合盤分析
      const systemPrompt = PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C']
      const result = await aiGenerateR(memberResults, birthData, systemPrompt, reportId)
      let reportContent = result.content

      if (!reportContent) {
        await markReportFailed(reportId, 'AI 未回覆：AI 回傳空內容')
        await closeProgressStream()
        return { success: false, error: 'AI 未回覆' }
      }

      // Post-generation QA — 逐一比對每位成員的排盤數據
      try {
        for (let i = 0; i < memberResults.length; i++) {
          const memberBD = members[i] ? {
            name: members[i].name || '',
            year: members[i].year || 0,
            month: members[i].month || 0,
            day: members[i].day || 0,
            hour: members[i].hour || 0,
            gender: members[i].gender || 'M',
          } as BirthData : null
          reportContent = validateReportAgainstData(reportContent, memberResults[i], memberBD)
        }
      } catch (e) {
        console.error('R 方案 Post-generation QA 執行失敗（不阻塞）:', e)
      }

      // 品質閘門
      try {
        const qResult = await qualityGate(reportContent, 'R', memberResults.length)
        if (!qResult.passed) {
          console.warn(`R 品質閘門警告: ${qResult.warnings.join('; ')}`)
        }
      } catch (e) {
        console.error('R 品質閘門執行失敗:', e)
      }

      // AI 審核
      try {
        const review = await aiReviewReport(reportContent, 'R')
        if (review.score < 70) {
          console.warn(`R AI 審核分數偏低: ${review.score}`)
        }
      } catch (e) {
        console.error('R AI 審核失敗（不阻塞）:', e)
      }

      // R 方案用 × 連接成員名字
      const memberNames = members.map(m => m.name).filter(Boolean).join(' × ')
      const rBirthData = { ...birthData, name: memberNames }

      // 生成 PDF
      let pdfUrl: string | null = null
      try {
        pdfUrl = await generatePDF(reportId, planCode, rBirthData, reportContent, [])
      } catch (e) {
        console.error('R PDF 生成失敗（不影響報告）:', e)
      }

      // 儲存到 Supabase
      await saveReportToSupabase(reportId, reportContent, result.model, [], pdfUrl, null)

      // 寄送 Email
      try {
        await sendReportEmail(reportId, customerEmail, accessToken, rBirthData, planCode, reportContent, members.length)
      } catch (e) {
        console.error('R Email 寄送失敗（報告已完成）:', e)
      }

      await closeProgressStream()
      return {
        success: true,
        reportId,
        contentLength: reportContent.length,
        systemsCount: members.length,
        aiModel: result.model,
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) || '未知錯誤'
      await markReportFailed(reportId, `R 方案合否生成失敗: ${errMsg.slice(0, 500)}`)
      await closeProgressStream()
      return { success: false, error: 'R 生成失敗' }
    }
  }

  // Step 1: 排盤計算
  let calcResult
  try {
    calcResult = await callPythonCalculate(birthData)
  } catch (e) {
    const errMsg2 = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) || '未知錯誤'
    await markReportFailed(reportId, `排盤計算失敗: ${errMsg2.slice(0, 500)}`)
    await closeProgressStream()
    return { success: false, error: '排盤計算失敗' }
  }

  const analyses = calcResult.analyses || []
  const analysesSummary = analyses.map((a: { system: string; score: number }) => ({
    system: a.system, score: a.score,
  }))

  // Step 2: AI 生成報告內容
  let reportContent = ''
  let aiModelUsed = 'unknown'

  try {
    if (planCode === 'C') {
      // ── C 方案：3 個 AI call 順序執行 + 附錄自動生成 ──
      console.log('C 方案開始：3-call 順序執行')
      // C 方案也要讀取 customer_note（客戶在結帳時填的備注/問題）
      const clientQuestion = (birthData.question || birthData.customer_note || birthData.topic || undefined) as string | undefined
      const r1 = await aiGenerateCall1(calcResult, birthData, clientQuestion, reportId)
      const r2 = await aiGenerateCall2(calcResult, birthData, r1.content, reportId)
      const r3 = await aiGenerateCall3(calcResult, birthData, r1.content, r2.content, undefined, undefined, reportId)

      // Call 3 完整性檢查
      let call3Content = r3.content
      const hasDeliberatePractice = call3Content.includes('刻意練習')
      const hasClosingLetter = call3Content.includes('寫給') && (call3Content.includes('的話') || call3Content.includes('們的話'))

      if (!hasDeliberatePractice || !hasClosingLetter) {
        const missingParts: string[] = []
        if (!hasDeliberatePractice) missingParts.push('刻意練習（投資/感情/事業/健康/人際五大面向，每項至少200字）')
        if (!hasClosingLetter) missingParts.push('寫給客戶的話（至少3段，帶命理依據的回顧過去+看見現在+展望未來）')

        // 重試 Call 3
        const retryR3 = await aiGenerateCall3(calcResult, birthData, r1.content, r2.content, true, missingParts, reportId)
        call3Content = retryR3.content
      }

      // 附錄由程式碼自動生成（不走 AI）
      const appendix = buildAppendix(calcResult.analyses)

      const rawContent = [r1.content, r2.content, call3Content, appendix].join('\n\n')
      reportContent = cleanFinalReport(rawContent, birthData.name)
      aiModelUsed = r1.model
      console.log(`C 方案完成：${reportContent.length} 字（含附錄）`)
    } else {
      // ── 其他方案：單次 AI 呼叫 ──
      const systemPrompt = PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C']
      // D 方案欄位對應：analysis_topic → topic, customer_note/other_question → question
      const topic = (birthData.topic || birthData.analysis_topic || undefined) as string | undefined
      const question = (birthData.question || birthData.customer_note || birthData.other_question || undefined) as string | undefined
      const result = await aiGenerateGeneric(
        calcResult, birthData, planCode, systemPrompt,
        topic, question, reportId,
      )
      reportContent = result.content
      aiModelUsed = result.model
    }
  } catch (e) {
    // Workflow 環境的錯誤可能不是標準 Error 實例，需要多種方式擷取
    const errMsg = e instanceof Error ? e.message
      : typeof e === 'string' ? e
      : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
      : JSON.stringify(e) || '未知錯誤'
    console.error('AI 生成失敗完整錯誤:', e)
    await markReportFailed(reportId, `AI 生成失敗: ${errMsg.slice(0, 500)}`)
    await closeProgressStream()
    return { success: false, error: 'AI 生成失敗' }
  }

  if (!reportContent) {
    await markReportFailed(reportId, 'AI 未回覆：AI 回傳空內容')
    await closeProgressStream()
    return { success: false, error: 'AI 未回覆' }
  }

  // Step 2.5: Post-generation QA — 比對 AI 報告與排盤數據，自動修正幻覺
  try {
    reportContent = validateReportAgainstData(reportContent, calcResult, birthData)
  } catch (e) {
    // QA 失敗不阻塞報告生成
    console.error('Post-generation QA 執行失敗（不阻塞）:', e)
  }

  // Step 3: 品質閘門（只記錄警告，不重跑）
  // 128k tokens 無上限 + 犀利版 Prompt 已經能產出高品質內容
  // 重跑造成的問題（重複章節、浪費 token）比品質警告更嚴重
  try {
    const qResult = await qualityGate(reportContent, planCode, analyses.length)
    if (qResult.passed) {
      console.log('品質閘門通過')
    } else {
      console.warn(`品質閘門警告（不重跑）: ${qResult.warnings.join('; ')}`)
    }
  } catch (e) {
    console.error('品質閘門執行失敗:', e)
  }

  // Step 3.5: AI 審核員（客戶視角品質審查）
  try {
    const review = await aiReviewReport(reportContent, planCode)
    if (review.score < 70) {
      console.warn(`AI 審核分數偏低: ${review.score}，問題: ${review.issues.join('; ')}`)
    } else {
      console.log(`AI 審核通過: ${review.score}分`)
    }
  } catch (e) {
    console.error('AI 審核失敗（不阻塞）:', e)
  }

  // Step 4: 解析出門訣吉時 JSON（E1=Top3, E2=每週Top1×4）
  // 支援三種 JSON 標記：TOP3（E1新版）、TOP1（E2新版）、TOP5（向後相容舊版）
  let top5Timings = null
  const jsonPattern = /===(TOP[135]_JSON_START)===\s*([\s\S]*?)\s*===(TOP[135]_JSON_END)===/g
  const allJsonMatches = [...reportContent.matchAll(jsonPattern)]

  if (allJsonMatches.length > 0) {
    try {
      const allTimings: Record<string, unknown>[] = []

      for (const match of allJsonMatches) {
        let jsonStr = match[2].trim()
        jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim()
        const parsed = JSON.parse(jsonStr)

        // 統一處理：陣列或單一物件都轉成陣列
        const rawTimings = Array.isArray(parsed)
          ? parsed
          : (parsed.top5_auspicious_times || parsed.top5 || parsed.top3 || [parsed])

        if (Array.isArray(rawTimings)) {
          for (const t of rawTimings) {
            allTimings.push({
              rank: t.rank || t.week || allTimings.length + 1,
              title: t.title || t.star_door_combo || `第${allTimings.length + 1}吉時`,
              date: t.date || '',
              time_start: (t.time_start || (typeof t.time_range === 'string' ? (t.time_range as string).split('-')[0] : '') || '').toString(),
              time_end: (t.time_end || (typeof t.time_range === 'string' ? (t.time_range as string).split('-')[1] : '') || '').toString(),
              direction: t.direction || '',
              reason: t.reason || t.analysis || t.detail || '',
              boost_explanation: t.boost_explanation || '',
              confidence: t.confidence || '',
              shensha_warning: t.shensha_warning || '',
              zhishi_info: t.zhishi_info || '',
              week: t.week || null,
            })
          }
        }
      }

      if (allTimings.length > 0) {
        top5Timings = allTimings
      }

      // 移除所有 JSON 標記
      reportContent = reportContent.replace(/===(TOP[135]_JSON_START)===[\s\S]*?===(TOP[135]_JSON_END)===/g, '').trim()
      console.log(`吉時 JSON 解析成功: ${top5Timings?.length || 0} 項`)
    } catch (e) {
      console.error('吉時 JSON 解析失敗:', e)
      reportContent = reportContent.replace(/===(TOP[135]_JSON_START)===[\s\S]*?===(TOP[135]_JSON_END)===/g, '').trim()
    }
  }

  // Step 5: 生成 PDF
  let pdfUrl: string | null = null
  try {
    pdfUrl = await generatePDF(reportId, planCode, birthData, reportContent, analysesSummary)
  } catch (e) {
    // PDF 失敗不阻塞整體流程
    console.error('PDF 生成失敗（不影響報告）:', e)
  }

  // Step 5: 儲存到 Supabase
  try {
    await saveReportToSupabase(reportId, reportContent, aiModelUsed, analysesSummary, pdfUrl, top5Timings)
  } catch (e) {
    const errMsg3 = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e) || '未知錯誤'
    await markReportFailed(reportId, `儲存報告失敗: ${errMsg3.slice(0, 500)}`)
    await closeProgressStream()
    return { success: false, error: '儲存失敗' }
  }

  // Step 6: 寄送 Email
  try {
    await sendReportEmail(reportId, customerEmail, accessToken, birthData, planCode, reportContent, analyses.length)
  } catch (e) {
    // Email 失敗不影響報告完成狀態
    console.error('Email 寄送失敗（報告已完成）:', e)
  }

  // 完成
  await closeProgressStream()

  return {
    success: true,
    reportId,
    contentLength: reportContent.length,
    systemsCount: analyses.length,
    aiModel: aiModelUsed,
  }
}
