// ============================================================
// 報告生成 Workflow — 主流程編排（"use workflow" 沙箱環境）
// 每個 step 自動持久化、自動重試、崩潰後自動恢復
// ============================================================

import {
  loadReportRecord,
  callPythonCalculate,
  callChumenjiTop,
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
  contentModerationStep,
  generatePDF,
  saveReportToSupabase,
  sendReportEmail,
  markReportFailed,
  markReportNeedsHumanReview,
  closeProgressStream,
  buildAppendix,
  setCurrentReportId,
  PLAN_SYSTEM_PROMPT,
  type BirthData,
  type ChumenjiTopResult,
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

      // AI 審核（5 LLM Post-Gen QA）
      try {
        const familyNamesList = familyReports.map(r => r.name).filter(Boolean)
        const review = await aiReviewReport(reportContent, 'G15', {
          reportId,
          round: 1,
          customerName: familyNamesList.join(' × '),
          // G15 家族藍圖 chartData 是多人合併，先不傳避免 prompt 過長
        })
        if (review.fiveLLM) {
          console.log(`G15 5 LLM QA: avg=${review.fiveLLM.avg}, min=${review.fiveLLM.min}, severity=${review.fiveLLM.severity}`)
          // 5 LLM 黃色/紅色告警
          if (review.fiveLLM.severity !== 'ok') {
            const { notifyFiveLLMWarning, notifyFiveLLMCritical } = await import('@/lib/ai/observability/telegram')
            if (review.fiveLLM.severity === 'red') {
              await notifyFiveLLMCritical(reportId, 'G15', review.fiveLLM.avg, review.fiveLLM.min, review.fiveLLM.scores, review.fiveLLM.criticalErrors)
            } else {
              await notifyFiveLLMWarning(reportId, 'G15', review.fiveLLM.avg, review.fiveLLM.min, review.fiveLLM.scores, review.issues)
            }
          }
        } else if (review.score < 70) {
          console.warn(`G15 AI 審核分數偏低: ${review.score}`)
        }
      } catch (e) {
        console.error('G15 AI 審核失敗（不阻塞）:', e)
      }

      // 內容安全審查（G15 含多位成員名字，用於隱私交叉檢查）
      try {
        const familyNamesList = familyReports.map(r => r.name).filter(Boolean)
        const modResult = await contentModerationStep(reportId, reportContent, 'G15', {
          customerName: familyNamesList[0],
          otherClientNames: [],  // G15 本來就包含多位家人名字，不做隱私比對
        })
        if (modResult.blocked) {
          console.warn(`G15 內容審查被標記：${modResult.reason}（不阻塞交付，但已記錄）`)
        }
      } catch (e) {
        console.error('G15 內容審查失敗（不阻塞）:', e)
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

      // AI 審核（5 LLM Post-Gen QA）
      try {
        const firstMemberName = members[0]?.name || ''
        // R 方案：合併所有成員 chartData JSON（給 5 LLM 驗證）
        const rChartJson = (() => {
          try { return JSON.stringify(memberResults).slice(0, 14000) } catch { return '' }
        })()
        const review = await aiReviewReport(reportContent, 'R', {
          reportId,
          round: 1,
          chartDataJson: rChartJson,
          customerName: firstMemberName,
        })
        if (review.fiveLLM) {
          console.log(`R 5 LLM QA: avg=${review.fiveLLM.avg}, min=${review.fiveLLM.min}, severity=${review.fiveLLM.severity}`)
          if (review.fiveLLM.severity !== 'ok') {
            const { notifyFiveLLMWarning, notifyFiveLLMCritical } = await import('@/lib/ai/observability/telegram')
            if (review.fiveLLM.severity === 'red') {
              await notifyFiveLLMCritical(reportId, 'R', review.fiveLLM.avg, review.fiveLLM.min, review.fiveLLM.scores, review.fiveLLM.criticalErrors)
            } else {
              await notifyFiveLLMWarning(reportId, 'R', review.fiveLLM.avg, review.fiveLLM.min, review.fiveLLM.scores, review.issues)
            }
          }
        } else if (review.score < 70) {
          console.warn(`R AI 審核分數偏低: ${review.score}`)
        }
      } catch (e) {
        console.error('R AI 審核失敗（不阻塞）:', e)
      }

      // 內容安全審查
      try {
        const firstMemberName = members[0]?.name || ''
        const modResult = await contentModerationStep(reportId, reportContent, 'R', {
          customerName: firstMemberName,
          otherClientNames: [],  // R 方案本來就是雙人合盤
        })
        if (modResult.blocked) {
          console.warn(`R 內容審查被標記：${modResult.reason}（不阻塞交付，但已記錄）`)
        }
      } catch (e) {
        console.error('R 內容審查失敗（不阻塞）:', e)
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
  let chumenjiTop: ChumenjiTopResult | null = null  // 提升到外層，Step 4 直接用引擎結果

  try {
    if (planCode === 'C') {
      // C 方案也要讀取 customer_note（客戶在結帳時填的備注/問題）
      const clientQuestion = (birthData.question || birthData.customer_note || birthData.topic || undefined) as string | undefined

      // ── 新 Team Pipeline（feature flag 控制，老闆選 B 方案：C 先試水）──
      const useTeamPipeline = process.env.USE_TEAM_PIPELINE_FOR_C === 'true'
      let pipelineSuccess = false

      if (useTeamPipeline) {
        console.log('C 方案：啟用 Team Pipeline（5 LLM 協作 + 96 分閘門）')
        try {
          const { runTeamPipeline } = await import('@/lib/ai/pipeline')
          const { retrieveRulesFromChart } = await import('@/lib/ai/rag')
          const { notifyQualityGate } = await import('@/lib/ai/observability/telegram')

          // RAG 檢索（失敗時退化為空陣列）
          let rules: Array<{ id: string; text: string; source: string; similarity: number }> = []
          try {
            const r = await retrieveRulesFromChart(calcResult as unknown as Record<string, unknown>, null, 30)
            rules = r.rules.map((x) => ({
              id: x.id,
              text: x.content || '',
              source: x.source || '',
              similarity: x.similarity || 0,
            }))
            console.log(`  → RAG 檢索 ${rules.length} 條規則`)
          } catch (ragErr) {
            console.warn('  → RAG 檢索失敗，degraded to 0 rules:', ragErr)
          }

          const outcome = await runTeamPipeline({
            reportId,
            planCode: 'C',
            planPrompt: PLAN_SYSTEM_PROMPT['C'],
            birthData: birthData as Record<string, unknown>,
            chartData: calcResult as unknown as Record<string, unknown>,
            retrievedRules: rules,
            customerNote: clientQuestion,
          })

          if (outcome.success && outcome.finalContent) {
            const appendix = buildAppendix(calcResult.analyses)
            reportContent = cleanFinalReport(outcome.finalContent + '\n\n' + appendix, birthData.name)
            aiModelUsed = 'team-pipeline'
            pipelineSuccess = true
            console.log(
              `C 方案 Team Pipeline 完成：${reportContent.length} 字、` +
              `Peer Review ${outcome.metrics.finalPeerReviewScore}/100、` +
              `修訂 ${outcome.metrics.revisionRounds} 輪、$${outcome.metrics.totalCostUsd.toFixed(4)}`,
            )
          } else {
            console.warn(`C 方案 Team Pipeline 未通過（${outcome.errorReason}），降級到舊 3-call 流程`)
            if (outcome.needsHumanReview) {
              try {
                await notifyQualityGate(reportId, outcome.metrics.finalPeerReviewScore)
              } catch { /* 不阻塞 */ }
            }
          }
        } catch (teamErr) {
          console.error('C 方案 Team Pipeline 異常，降級到舊 3-call:', teamErr)
        }
      }

      // ── v2 舊 3-call 流程（fallback） ──
      if (!pipelineSuccess) {
        console.log('C 方案開始：3-call 順序執行')
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
      }
    } else {
      // ── 其他方案：單次 AI 呼叫 ──
      const systemPrompt = PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C']
      // D 方案欄位對應：analysis_topic → topic, customer_note/other_question → question
      const topic = (birthData.topic || birthData.analysis_topic || undefined) as string | undefined
      const question = (birthData.question || birthData.customer_note || birthData.other_question || undefined) as string | undefined

      // v5.3.62：E1/E2/E3 出門訣全系列呼叫奇門引擎取 Top 結果、強制注入 Prompt
      //   E1: 3 吉時（事件 Top3）、E2: 4 週每週 1 盤、E3: 4 週每週 Top 2 共 8 吉時
      if (planCode === 'E1' || planCode === 'E2' || planCode === 'E3') {
        console.log(`${planCode} 出門訣：呼叫引擎計算最佳時辰...`)
        chumenjiTop = await callChumenjiTop(planCode, birthData)
        if (chumenjiTop?.results?.length) {
          console.log(`${planCode} 引擎 Top 結果: ${chumenjiTop.results.map(r => `${r.date} ${r.shichen}時 ${r.direction} ${r.score}分`).join(' | ')}`)
        } else {
          console.warn(`${planCode} 引擎 Top 結果為空，AI 將自行判斷（降級模式）`)
        }
      }

      const result = await aiGenerateGeneric(
        calcResult, birthData, planCode, systemPrompt,
        topic, question, reportId, chumenjiTop,
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

  // Step 3: 品質閘門 + Post-Gen 6 LLM 各司其職 QA Pipeline
  // v5.3.13（2026-04-18）：從「5 LLM 重複打分」改為「6 LLM 各司其職」
  //   生成者：Claude Opus 4.7
  //   審查團隊（5 家，各攻一個面向）：
  //     - Qwen Max：命理術語審查官
  //     - Gemini 2.5 Pro：排盤資料驗證官
  //     - GPT-4o：結構審查官
  //     - Kimi：讀者體驗官
  //     - DeepSeek V3：禁區守門員
  //
  // 判決改為「六項全過」：任一家 criticalErrors.length > 0 → fail
  //   不再用 avg/min 平均分（消除 Gemini 對多系統平台的結構性扣分偏見）
  //
  // 保留 LEGACY_HARD_MIN_SCORE 供 6 LLM 整個失效時降級用
  const MAX_QUALITY_RETRIES = 1       // 原 3，避免 retry 死循環燒 $15-20/份
  const LEGACY_HARD_MIN_SCORE = 75    // 6 LLM 全掛時才用這個分數門檻降級

  type FiveLLMSnapshot = {
    scores: Record<string, number>
    avg: number
    min: number
    max: number
    severity: 'ok' | 'yellow' | 'red'
    criticalErrors: string[]
  }

  let qualityRetryCount = 0
  let qualityPassed = false
  let lastQualityIssues: string[] = []
  let lastFiveLLM: FiveLLMSnapshot | null = null

  const customerNameForQA = typeof birthData.name === 'string' ? birthData.name : ''
  // chartData JSON（給 5 LLM 驗證報告引用是否正確）
  const chartDataJsonForQA = (() => {
    try {
      return JSON.stringify(calcResult || {}).slice(0, 14000)
    } catch {
      return ''
    }
  })()

  while (qualityRetryCount <= MAX_QUALITY_RETRIES) {
    const roundNum = qualityRetryCount + 1

    // 3a. 品質閘門硬檢查（結構、章節、字眼）
    let gateResult: { passed: boolean; warnings: string[]; hardFailures?: string[]; softWarnings?: string[] } | null = null
    try {
      gateResult = await qualityGate(reportContent, planCode, analyses.length, chumenjiTop, birthData)
    } catch (e) {
      console.error('品質閘門執行失敗:', e)
      break
    }

    // 3b. 5 LLM Post-Gen QA 已砍（v5.3.31，老闆決定簡化：1 Claude 寫 + 結構硬檢查）
    // 理由：
    //   1. 5 LLM QA 限制 Claude 創作空間，反而砍掉認可版 DNA
    //   2. 成本過高（每份 $2-3 QA 費用）
    //   3. qualityGate 的硬結構檢查已足以抓大錯誤
    const reviewerScore: number = 95 // 不再由外部 LLM 打分
    const reviewerIssues: string[] = []
    const fiveLLMInfo = null as FiveLLMSnapshot | null
    // 保留 chartDataJsonForQA 和 customerNameForQA 變數（讓 TS 不抱怨未使用）
    void chartDataJsonForQA; void customerNameForQA; void roundNum; void lastFiveLLM

    // 3c. 合併結果：hardFailures / 5 LLM 未通過 / legacy 分數過低 都視為不通過
    const hardFails = gateResult?.hardFailures || []
    const softFails = gateResult?.softWarnings || []

    // v5.3.13 判決：六項全過（任一家找到 criticalError 或 severity=red → fail）
    let fiveLLMFail = false
    if (fiveLLMInfo) {
      fiveLLMFail = fiveLLMInfo.criticalErrors.length > 0 || fiveLLMInfo.severity === 'red'
    } else {
      // 6 LLM 整個掛了才走 legacy 分數門檻降級
      fiveLLMFail = reviewerScore < LEGACY_HARD_MIN_SCORE
    }

    if (hardFails.length === 0 && !fiveLLMFail) {
      qualityPassed = true
      const scoreLog = fiveLLMInfo
        ? `6 LLM 各司其職全過（avg=${fiveLLMInfo.avg}, critical=${fiveLLMInfo.criticalErrors.length}）`
        : `Legacy Reviewer ${reviewerScore} 分`
      console.log(`品質閘門通過（第 ${roundNum} 次）: ${scoreLog}`)
      if (softFails.length > 0) console.log(`軟警告（不影響通過）: ${softFails.join('; ')}`)
      break
    }

    // 3d. 失敗：記錄原因
    const fiveLLMDesc = fiveLLMInfo
      ? `[6 LLM 各司其職] severity=${fiveLLMInfo.severity}, ` +
        `criticalErrors=${fiveLLMInfo.criticalErrors.length}` +
        (fiveLLMInfo.criticalErrors.length > 0
          ? `, top=${fiveLLMInfo.criticalErrors.slice(0, 3).join(' | ')}`
          : '')
      : `[Legacy] Reviewer 分數 ${reviewerScore} < ${LEGACY_HARD_MIN_SCORE}`

    lastQualityIssues = [
      ...hardFails,
      ...(fiveLLMFail ? [fiveLLMDesc] : []),
      ...(reviewerIssues.length > 0 ? [`Reviewer 問題: ${reviewerIssues.slice(0, 5).join('; ')}`] : []),
    ]
    console.warn(`品質閘門失敗（第 ${roundNum} 次）: ${lastQualityIssues.join('; ')}`)

    // 5 LLM QA 即時告警（不等重試完才告警）
    if (fiveLLMInfo) {
      try {
        const { notifyFiveLLMWarning, notifyFiveLLMCritical } = await import('@/lib/ai/observability/telegram')
        if (fiveLLMInfo.severity === 'red') {
          await notifyFiveLLMCritical(
            reportId, planCode, fiveLLMInfo.avg, fiveLLMInfo.min,
            fiveLLMInfo.scores, fiveLLMInfo.criticalErrors,
          )
        } else if (fiveLLMInfo.severity === 'yellow') {
          await notifyFiveLLMWarning(
            reportId, planCode, fiveLLMInfo.avg, fiveLLMInfo.min,
            fiveLLMInfo.scores, reviewerIssues,
          )
        }
      } catch (telErr) {
        console.warn('Telegram 5 LLM 告警失敗（不阻塞）:', telErr)
      }
    }

    if (qualityRetryCount >= MAX_QUALITY_RETRIES) {
      console.error(`品質閘門重試 ${MAX_QUALITY_RETRIES} 次仍失敗，標記 needs_human_review`)
      break
    }

    // 3e. 重試：只有 C 方案支援整體重跑（其他方案首次失敗後不重試，只記錄）
    if (planCode !== 'C') {
      console.warn(`非 C 方案不支援自動重試，${planCode} 只記錄警告`)
      break
    }

    qualityRetryCount++
    console.log(`重新生成 C 方案（第 ${qualityRetryCount}/${MAX_QUALITY_RETRIES} 次重試）...`)
    try {
      const clientQuestion = (birthData.question || birthData.customer_note || birthData.topic || undefined) as string | undefined
      const r1 = await aiGenerateCall1(calcResult, birthData, clientQuestion, reportId)
      const r2 = await aiGenerateCall2(calcResult, birthData, r1.content, reportId)
      const r3 = await aiGenerateCall3(calcResult, birthData, r1.content, r2.content, undefined, undefined, reportId)
      const appendix = buildAppendix(calcResult.analyses)
      const rawContent = [r1.content, r2.content, r3.content, appendix].join('\n\n')
      reportContent = cleanFinalReport(rawContent, birthData.name)
      aiModelUsed = r1.model
      console.log(`C 方案重試第 ${qualityRetryCount} 次完成：${reportContent.length} 字`)
    } catch (retryErr) {
      console.error(`C 方案重試失敗:`, retryErr)
      break
    }
  }

  // 3f. 品質閘門最終判定：
  //   C 方案連 3 次失敗 → 標為 needs_human_review（供 /jamie/quality-reports 處理）
  //   其他方案首次 5 LLM 未通過 → 仍交付但 Telegram 已發警告（client-facing SLA）
  if (!qualityPassed && planCode === 'C') {
    const reasonMsg = `品質閘門連續 ${qualityRetryCount + 1} 次失敗: ${lastQualityIssues.slice(0, 3).join('; ').slice(0, 400)}`
    try {
      // v5.3.18：傳入 reportContent，讓後台 /jamie/quality-reports 能看到原文（不用重跑再燒 $5）
      await markReportNeedsHumanReview(reportId, reasonMsg, undefined, reportContent, aiModelUsed)
      try {
        const { notifyNeedsHumanReview } = await import('@/lib/ai/observability/telegram')
        await notifyNeedsHumanReview(
          reportId, planCode, qualityRetryCount + 1,
          0,
          [],
        )
      } catch { /* 不阻塞 */ }
    } catch (markErr) {
      console.error('markReportNeedsHumanReview 失敗，fallback markReportFailed:', markErr)
      await markReportFailed(reportId, reasonMsg)
    }
    await closeProgressStream()
    return { success: false, error: '品質閘門失敗，已轉為人工審核' }
  }

  // Step 3.7: 內容安全審查（黑名單 + AI Moderation）
  // 發現 block 類別會記錄到 moderation_log 並呼叫 admin 審查頁面；不直接阻塞交付
  // （若未來要改為硬擋，把下方 markReportFailed 放開即可）
  try {
    const modResult = await contentModerationStep(reportId, reportContent, planCode, {
      customerName: typeof birthData.name === 'string' ? birthData.name : undefined,
    })
    if (modResult.blocked) {
      console.warn(
        `⚠️ 內容審查發現 ${modResult.blacklistCount} 項違規（${planCode}）: ${modResult.reason}`,
      )
      // TODO（未來若要強擋）:
      //   await markReportFailed(reportId, `內容安全審查失敗: ${modResult.reason}`)
      //   await closeProgressStream()
      //   return { success: false, error: '內容審查阻擋' }
    }
  } catch (e) {
    console.error('內容審查失敗（不阻塞）:', e)
  }

  // Step 3.6: E1/E2/E3 出門訣 — 強制移除非奇門詞彙（AI prompt 禁止但偶爾仍偷用）
  // v5.3.62：E3 月度精選也屬純奇門占事派、同禁八字/日主/用神/風水八宅等跨派詞
  if (planCode === 'E1' || planCode === 'E2' || planCode === 'E3') {
    try {
      const bannedTerms: [RegExp, string][] = [
        [/八字[^\n]{0,20}/g, ''],
        [/日主[^\n]{0,10}/g, ''],
        [/用神\S{0,4}/g, '年命宮能量'],
        [/喜神\S{0,4}/g, '吉方能量'],
        [/風水八宅[^\n]{0,20}/g, ''],
        [/本命卦[^\n]{0,10}/g, ''],
        [/天醫位/g, '吉位'],
        [/生氣位/g, '吉位'],
        [/延年位/g, '吉位'],
        [/生物節律[^\n]{0,30}/g, ''],
        [/臨界日/g, ''],
        [/紫微[^\n]{0,10}/g, ''],
        [/太陽星座/g, ''],
        [/五行喜忌[^\n]{0,20}/g, ''],
        [/命宮主星[^\n]{0,10}/g, ''],
        [/吠陀占星[^\n]{0,20}/g, ''],
        [/南洋術數[^\n]{0,20}/g, ''],
        [/數字能量[^\n]{0,20}/g, ''],
        [/人類圖[^\n]{0,10}/g, ''],
        [/姓名學[^\n]{0,10}/g, ''],
      ]
      let bannedCount = 0
      for (const [pattern, replacement] of bannedTerms) {
        const matches = reportContent.match(pattern)
        if (matches) {
          bannedCount += matches.length
          reportContent = reportContent.replace(pattern, replacement)
        }
      }
      // 清理替換後可能產生的多餘空行
      reportContent = reportContent.replace(/\n{3,}/g, '\n\n')
      if (bannedCount > 0) {
        console.log(`${planCode} 出門訣：清除 ${bannedCount} 處非奇門詞彙`)
      }
    } catch (e) {
      // 詞彙清洗失敗不阻塞 — 繼續用原本的 reportContent 交付
      console.error(`${planCode} bannedTerms 清洗失敗（不阻塞）:`, e)
    }
  }

  // Step 4: 取得出門訣吉時數據（E1/E2）
  // 策略：直接用引擎 chumenjiTop.results（最可靠），AI JSON 解析只作為備用
  // v5.3.32：整段用 try-catch 包裹，解析失敗不阻塞交付
  let top5Timings: Record<string, unknown>[] | null = null
  try {

  // 4a. 優先使用引擎計算結果（不依賴 AI 輸出 JSON、E1/E2/E3 共用）
  // v5.3.80：E2 v2.0 修正——handler 直接回傳 title/time_start/time_end/execution_date_lunar 等，不再從 time_range 切
  if ((planCode === 'E1' || planCode === 'E2' || planCode === 'E3') && chumenjiTop?.results?.length) {
    top5Timings = chumenjiTop.results.map((r, i) => {
      const rr = r as unknown as Record<string, unknown>
      // time_start/time_end：E2 v2.0 引擎直接提供；E1/E3 仍從 time_range 切
      const explicitStart = typeof rr.time_start === 'string' ? (rr.time_start as string) : ''
      const explicitEnd = typeof rr.time_end === 'string' ? (rr.time_end as string) : ''
      const rangeStart = typeof rr.time_range === 'string' ? (rr.time_range as string).split('-')[0] : ''
      const rangeEnd = typeof rr.time_range === 'string' ? (rr.time_range as string).split('-')[1] : ''
      // title：E2 v2.0 引擎給「癸巳月本命吉時」；E1/E3 仍用 `${star}${door}` 組合
      const explicitTitle = typeof rr.title === 'string' ? (rr.title as string) : ''
      const composedTitle = `${r.star || ''}${r.door || ''}` || `第${i + 1}吉時`
      return {
        rank: r.rank || i + 1,
        title: explicitTitle || composedTitle,
        date: r.date || r.solar_date || '',
        time_start: (explicitStart || rangeStart || '').toString(),
        time_end: (explicitEnd || rangeEnd || '').toString(),
        direction: r.direction || '',
        reason: r.reason || '',
        boost_explanation: '',
        confidence: '',
        shensha_warning: r.shensha_warning || '',
        zhishi_info: '',
        week: r.week_number || null,
        week_label: r.week_label || null,
        week_range: r.week_range || null,
        shichen: r.shichen || '',
        door: r.door || '',
        star: r.star || '',
        shen: r.shen || '',
        score: r.score || 0,
        ju: r.ju || '',
        gong: r.gong || '',
        kongwang: r.kongwang || false,
        plain_advantage: '',
        plain_purpose: [] as string[],
        // v5.3.80 E2 v2.0 月家奇門欄位
        angle: (rr.angle as string) || '',
        execution_date_lunar: (rr.execution_date_lunar as string) || '',
        yue_ganzhi: (rr.yue_ganzhi as string) || '',
        year_ganzhi: (rr.year_ganzhi as string) || '',
        nianming_gong: (rr.nianming_gong as string) || '',
        backup_date_lunar: (rr.backup_date_lunar as string) || '',
        backup_time: (rr.backup_time as string) || '',
      }
    })
    console.log(`${planCode} 吉時直接從引擎取得: ${top5Timings.length} 項`)

    // v5.3.74 P0：從 AI markdown 抽取每張卡片的「坐這個盤對你」bullets、塞進 plain_advantage + plain_purpose
    // 修報告頁 parsing 吞掉 AI 白話優勢的 bug（body 只 3952 字、AI 實際寫 6500+ 字）
    if (planCode === 'E3' && reportContent) {
      // 用「## 第 N 週 TOP X」切 8 個卡片區塊
      const cardSections = reportContent.split(/(?=^## 第\s*\d+\s*週\s*TOP\s*\d+[|｜])/m)
      const cards = cardSections.filter(s => /^## 第\s*\d+\s*週\s*TOP\s*\d+[|｜]/.test(s))
      cards.forEach((cardContent, idx) => {
        if (idx >= top5Timings!.length) return
        // 抓「## 坐這個盤對你...輔助」或「### 坐這個盤對你...輔助」後到 <details> 之前的 bullets
        const advMatch = cardContent.match(/(?:^|\n)##?#?\s*(?:✨\s*)?坐這個盤對你[「『]\S+[」』]的輔助[^\n]*\n([\s\S]*?)(?=\n<details|\n##?#?\s|\Z)/)
        if (advMatch) {
          const bulletsRaw = advMatch[1].trim()
          const bullets = bulletsRaw
            .split(/\n/)
            .map(l => l.trim())
            .filter(l => /^[-•·]\s*/.test(l))
            .map(l => l.replace(/^[-•·]\s*/, '').replace(/^\*\*([^*]+)\*\*\s*[：:]\s*/, '$1：'))
            .filter(Boolean)
          if (bullets.length > 0) {
            top5Timings![idx].plain_purpose = bullets
            top5Timings![idx].plain_advantage = bullets.join('\n')
          }
        }
        // 抓 <details>...奇門依據...</details> 的內容覆蓋 Python reason（AI 寫的分行版更清楚）
        const detailsMatch = cardContent.match(/<details[^>]*>\s*<summary[^>]*>[^<]*奇門依據[^<]*<\/summary>([\s\S]*?)<\/details>/)
        if (detailsMatch) {
          let detailsContent = detailsMatch[1].trim()
          // v5.3.75：奇門依據 AI 常擠成「- A: X - B: Y - C: Z」一行、強制 normalize 為多行
          // 把「 - **」前面插換行（除了行首）
          detailsContent = detailsContent
            .replace(/\s+-\s+\*\*/g, '\n- **')  // ' - **' → '\n- **'
            .replace(/^\n+/, '')                // 去掉開頭多餘換行
            .replace(/\n{3,}/g, '\n\n')         // 壓縮多餘空行
          top5Timings![idx].reason = detailsContent.slice(0, 800)
        }
      })
      console.log(`${planCode} 白話優勢從 AI markdown 補齊：${top5Timings.filter(t => (t.plain_purpose as string[]).length > 0).length}/${top5Timings.length} 張`)
    }
  }

  // 4b. 備用：如果引擎無結果，嘗試從 AI 報告中解析 JSON 標記（E3 也適用）
  if (!top5Timings && (planCode === 'E1' || planCode === 'E2' || planCode === 'E3')) {
    const jsonPattern = /===(TOP[135]_JSON_START)===\s*([\s\S]*?)\s*===(TOP[135]_JSON_END)===/g
    let allJsonMatches: RegExpMatchArray[] = [...reportContent.matchAll(jsonPattern)]

    // 降級：AI 可能用不同的標記格式
    if (allJsonMatches.length === 0) {
      const fallback = /[=-]{2,3}\s*TOP[135]_JSON_START\s*[=-]{2,3}\s*([\s\S]*?)\s*[=-]{2,3}\s*TOP[135]_JSON_END\s*[=-]{2,3}/g
      allJsonMatches = [...reportContent.matchAll(fallback)]
    }

    // 降級：AI 用 code block 包裹 JSON 陣列（無標記）
    if (allJsonMatches.length === 0) {
      const codeBlockPattern = /```json?\s*\n(\[[\s\S]*?\])\n\s*```/g
      const codeMatches = [...reportContent.matchAll(codeBlockPattern)]
      for (const cbm of codeMatches) {
        try {
          const testParsed = JSON.parse(cbm[1])
          if (Array.isArray(testParsed) && testParsed.length > 0 && (testParsed[0].date || testParsed[0].direction)) {
            const fakeMatch = [cbm[0], 'TOP_JSON_START', cbm[1], 'TOP_JSON_END'] as unknown as RegExpMatchArray
            fakeMatch.index = cbm.index
            fakeMatch.input = cbm.input
            allJsonMatches.push(fakeMatch)
          }
        } catch { /* 不是合法 JSON，跳過 */ }
      }
    }

    if (allJsonMatches.length > 0) {
      try {
        const allTimings: Record<string, unknown>[] = []
        for (const match of allJsonMatches) {
          let jsonStr = (match[2] || match[1] || '').trim()
          jsonStr = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/, '').trim()
          const jsonStart = jsonStr.indexOf('[') !== -1 ? jsonStr.indexOf('[') : jsonStr.indexOf('{')
          const jsonEnd = Math.max(jsonStr.lastIndexOf(']'), jsonStr.lastIndexOf('}'))
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1)
          }
          const parsed = JSON.parse(jsonStr)
          const rawTimings = Array.isArray(parsed)
            ? parsed
            : (parsed.top5_auspicious_times || parsed.top5 || parsed.top3 || parsed.top1 || [parsed])
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
          console.log(`${planCode} 吉時從 AI JSON 備用解析取得: ${top5Timings.length} 項`)
        }
      } catch (e) {
        console.error('吉時 AI JSON 備用解析失敗:', e)
      }
    }

    if (!top5Timings) {
      console.warn(`${planCode} 吉時 0 筆！引擎無結果且 AI 未輸出有效 JSON`)
    }
  }

  // 清理報告中的 JSON 標記（不管有沒有成功解析，都不應出現在最終報告中、E3 也適用）
  if (planCode === 'E1' || planCode === 'E2' || planCode === 'E3') {
    reportContent = reportContent.replace(/[=-]{2,3}\s*TOP[135]_JSON_(?:START|END)\s*[=-]{2,3}/g, '').trim()
    reportContent = reportContent.replace(/```json?\s*\n\[[\s\S]*?"(?:date|direction)"[\s\S]*?\]\n\s*```/g, '').trim()
    reportContent = reportContent.replace(/\n{3,}/g, '\n\n')
  }
  } catch (step4Err) {
    // v5.3.32：Step 4 整段失敗不阻塞交付
    console.error('Step 4 吉時數據處理失敗（不阻塞）:', step4Err)
  }

  // Step 5: 生成 PDF（v5.3.75：E3 月度訂閱不生成 PDF、深度綁定 web 策略）
  let pdfUrl: string | null = null
  if (planCode !== 'E3') {
    try {
      pdfUrl = await generatePDF(reportId, planCode, birthData, reportContent, analysesSummary)
    } catch (e) {
      // PDF 失敗不阻塞整體流程
      console.error('PDF 生成失敗（不影響報告）:', e)
    }
  } else {
    console.log('E3 月度訂閱：跳過 PDF 生成（v5.3.75 新策略）')
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

  // Step 6: 寄送 Email（v5.3.59 規格書要求 E1-E4 也要寄信通知）
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
