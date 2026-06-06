import { NextRequest, NextResponse } from 'next/server'
import { sendEmailWithRetry } from '@/lib/resend-helper'  // T12b v5.10.370(retry + dead-letter)
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import {
  getAgeGroup,
  buildCall1Prompt, buildCall2Prompt, buildCall3Prompt,
  buildUserPrompt, buildAppendix,
  extractCall1Summary, extractCall1And2Summary,
  SYSTEM_GROUPS,
} from '@/prompts/c_plan_v2'
import { validateReportAgainstData } from '@/workflows/generate-report/steps'
import { recordAIUsage } from '@/lib/ai-cost-tracker'
import { PLAN_NAMES, isChumenjiPlan } from '@/lib/plan-names'
import { PLAN_SYSTEM_PROMPT } from '@/workflows/generate-report/plan-prompts'  // v5.10.399:fallback 用 SSOT(含 v2/v4 wire + v5.10.x 全修補)、取代本檔脫節 inline 舊版
import { notifyModelDowngrade } from '@/lib/ai/observability/telegram'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

// ============================================================
// 付費報告生成 API — 排盤 + AI 深度分析 + 自動寄信
// C 方案：Claude Opus 4.6 多步並行生成
// 其他方案：DeepSeek
// ============================================================

// Vercel Pro 方案最長 300 秒
export const maxDuration = 300

const PYTHON_API = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || ''

// ── Email 亮點提取 ──
function getEmailHighlights(planCode: string, reportContent: string, isCN: boolean): string[] {
  const highlights: string[] = []
  const text = reportContent.replace(/[#*`]/g, '')

  if (planCode === 'C') {
    const roleMatch = text.match(/命格角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/你的角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/角色名稱[：:]\s*(.{2,20})/)?.[1]
    if (roleMatch) {
      highlights.push(isCN ? `你的命格角色：${roleMatch.trim()}` : `你的命格角色：${roleMatch.trim()}`)
    }
    const keywordMatch = text.match(/年度關鍵[詞词][：:]\s*(.{2,30})/)?.[1]
      || text.match(/年度关键[詞词][：:]\s*(.{2,30})/)?.[1]
    if (keywordMatch) {
      highlights.push(isCN ? `年度关键词：${keywordMatch.trim()}` : `年度關鍵詞：${keywordMatch.trim()}`)
    }
    highlights.push(isCN ? '东西方命理系统已完成交叉验证' : '東西方命理系統已完成交叉驗證')
  } else if (planCode === 'D') {
    highlights.push(isCN ? '你的问题已从多个角度深度分析' : '你的問題已從多個角度深度分析')
    highlights.push(isCN ? '结合命理与心理学给出具体建议' : '結合命理與心理學給出具體建議')
  } else if (planCode === 'G15') {
    highlights.push(isCN ? '家族成员的互动模式已解析' : '家族成員的互動模式已解析')
    highlights.push(isCN ? '家族能量流动与角色定位已完成' : '家族能量流動與角色定位已完成')
  } else if (isChumenjiPlan(planCode)) {
    const timeMatch = text.match(/(?:最佳|第一|Top\s*1)[吉時时]*[：:]\s*(.{2,20})/)?.[1]
    const dirMatch = text.match(/(?:最佳|建議|建议)方位[：:]\s*(.{2,10})/)?.[1]
    if (timeMatch) {
      highlights.push(isCN ? `最佳吉时：${timeMatch.trim()}` : `最佳吉時：${timeMatch.trim()}`)
    }
    if (dirMatch) {
      highlights.push(isCN ? `建议方位：${dirMatch.trim()}` : `建議方位：${dirMatch.trim()}`)
    }
    highlights.push(isCN ? '奇门遁甲 25+ 步精算完成' : '奇門遁甲 25+ 步精算完成')
  } else if (planCode === 'R') {
    highlights.push(isCN ? '双方命格已完成交叉比对' : '雙方命格已完成交叉比對')
    highlights.push(isCN ? '关系互动模式与建议已生成' : '關係互動模式與建議已生成')
  }

  if (highlights.length === 0) {
    highlights.push(isCN ? '你的专属命理报告已完成深度分析' : '你的專屬命理報告已完成深度分析')
  }

  return highlights
}

function getEmailCta(planCode: string, isCN: boolean): string {
  switch (planCode) {
    case 'C': return isCN ? '查看完整命格报告 →' : '查看完整命格報告 →'
    case 'D': return isCN ? '查看深度解答 →' : '查看深度解答 →'
    case 'G15': return isCN ? '查看家族分析报告 →' : '查看家族分析報告 →'
    case 'E1': case 'E2': return isCN ? '查看最佳吉时推荐 →' : '查看最佳吉時推薦 →'
    case 'R': return isCN ? '查看合盘分析报告 →' : '查看合盤分析報告 →'
    default: return isCN ? '查看完整报告 →' : '查看完整報告 →'
  }
}

// ── AI 回應清理：移除前言、修正品牌名 ──
function cleanAIResponse(text: string): string {
  let cleaned = text

  // 移除 AI 前言（多種模式，從開頭到第一個 ## 或 #### 或 --- 之前的所有廢話）
  // 模式1：「好的，收到」開頭到 --- 分隔線
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n---\s*\n?/i, '')
  // 模式2：「好的，收到」開頭到第一個 ## 或 #### 標題
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n(?=#{1,4}\s)/i, '')
  // 模式3：「好的，收到」開頭到雙換行
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n\n/i, '')
  // 模式4：只有一行前言（如「好的，收到您的完整數據。」單獨一行）
  cleaned = cleaned.replace(/^(好的|收到|我將|我會|讓我|以下是|沒問題|當然)[^\n]*\n+/i, '')

  // 確保品牌名統一為「鑒源」
  cleaned = cleaned.replace(/鑑源/g, '鑒源')

  return cleaned.trim()
}

// ── Claude API 串流呼叫函式（含 200s 超時，避免 Vercel 300s 限制）──
async function callClaudeStreaming(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number = 200000,
  tracking?: { reportId?: string; planCode?: string; callStage?: string },
  // v5.10.277:加 model param 給 Sonnet/Haiku fallback 用、預設仍 Opus 4.6
  model: string = 'claude-opus-4-6',
): Promise<string> {
  const tStart = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  // 粗估 tokens（streaming SSE 無 usage 事件時）
  const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3))
  const estPromptTokens = estimateTokens(systemPrompt + userPrompt)

  let res: Response
  try {
    res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      // v5.10.277:用傳入 model param(預設 Opus、fallback Sonnet)
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    // v5.3.5 記帳：連線失敗
    try {
      await recordAIUsage({
        provider: 'anthropic', model,
        promptTokens: 0, completionTokens: 0,
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'error',
        errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      })
    } catch { /* noop */ }
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Claude API 連線超時（${timeoutMs / 1000}秒）`)
    }
    throw e
  }

  if (!res.ok) {
    clearTimeout(timeout)
    const errText = await res.text()
    console.error(`Claude API 回傳 HTTP ${res.status}，回應內容: ${errText.slice(0, 500)}`)
    try {
      await recordAIUsage({
        provider: 'anthropic', model,
        promptTokens: 0, completionTokens: 0,
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'error', errorMessage: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      })
    } catch { /* noop */ }
    if (res.status === 529) {
      throw new Error(`Claude API 529 過載，請稍後重試`)
    }
    if (res.status === 402) {
      throw new Error(`Claude API 402 額度不足：請到 console.anthropic.com 充值`)
    }
    throw new Error(`Claude API 錯誤 ${res.status}: ${errText}`)
  }

  // 解析 SSE 串流
  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timeout)
    throw new Error('Claude API 無回應串流')
  }

  const decoder = new TextDecoder()
  let result = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            result += event.delta.text
          }
        } catch {
          // 忽略無法解析的行
        }
      }
    }
  } catch (e) {
    clearTimeout(timeout)
    // v5.3.5 記帳：串流失敗（可能已消耗 tokens，用字元粗估）
    try {
      await recordAIUsage({
        provider: 'anthropic', model,
        promptTokens: estPromptTokens,
        completionTokens: estimateTokens(result),
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'incomplete',
        errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        metadata: { note: 'SSE stream error, tokens estimated from chars', chars: result.length },
      })
    } catch { /* noop */ }
    if (e instanceof Error && e.name === 'AbortError') {
      // 串流超時一律拋錯重試，不接受截斷的部分結果
      throw new Error(`Claude API 串流超時（${timeoutMs / 1000}秒，已收到 ${result.length} 字）`)
    }
    throw e
  }

  clearTimeout(timeout)

  // v5.3.5 記帳：成功完成（SSE 沒 usage，用字元粗估 tokens）
  // 標 status=incomplete 但 metadata 說明是成功，讓後台查帳時知道是估算值
  try {
    await recordAIUsage({
      provider: 'anthropic', model,
      promptTokens: estPromptTokens,
      completionTokens: estimateTokens(result),
      reportId: tracking?.reportId, planCode: tracking?.planCode,
      callStage: tracking?.callStage || 'fallback_route',
      latencyMs: Date.now() - tStart,
      status: 'success',
      metadata: { note: 'SSE stream, tokens estimated from chars (char/3)', chars: result.length },
    })
  } catch { /* noop */ }

  return result
}

function getSupabase() {
  return createServiceClient()
}

// 根據 locale 替換 prompt 中的語言指示
function localizePrompt(prompt: string, locale?: string): string {
  if (locale === 'zh-CN') {
    return prompt.replace(/語言：繁體中文。/g, '語言：簡體中文。')
  }
  return prompt
}

// 輔助函式：將報告標記為失敗
async function markReportFailed(reportId: string, errorMessage: string, isDryRun = false) {
  // dry-run(Phase 6 regression):絕不寫 DB / 不改 status / 不發 Sentry+Telegram alert
  // 中央防線 — 即使呼叫端漏傳 isDryRun、預設 false = production 行為不變;dryRun 時這裡硬擋
  if (isDryRun) {
    console.info(`[dryRun] 跳過 markReportFailed(${reportId}):${errorMessage}`)
    return
  }
  try {
    // 取得當前重試次數 + 客戶資訊(for Telegram alert)
    const { data } = await getSupabase()
      .from('paid_reports')
      .select('retry_count, plan_code, customer_email, client_name, amount_usd')
      .eq('id', reportId)
      .single()
    const currentRetry = data?.retry_count ?? 0

    await getSupabase().from('paid_reports').update({
      status: 'failed',
      error_message: errorMessage,
      retry_count: currentRetry,
    }).eq('id', reportId)

    console.error(`報告 ${reportId} 標記為失敗: ${errorMessage}`)

    // Phase 5 v5.10.382 — Sentry critical event(老闆灌 SENTRY_DSN 後即生效、未設則 fallback console)
    try {
      const { captureMessage } = await import('@/lib/ai/observability/sentry-prod')
      const isFinalFail = currentRetry >= 2
      await captureMessage(`報告生成失敗(generate-report fallback):${errorMessage}`, isFinalFail ? 'fatal' : 'error', {
        tags: {
          reportId,
          planCode: data?.plan_code || 'unknown',
          retryCount: currentRetry,
          isFinalFail,
          source: 'api/generate-report',
        },
        extra: {
          customerEmail: data?.customer_email || 'unknown',
          clientName: data?.client_name || 'unknown',
          amount: data?.amount_usd ?? 0,
          errorMessage,
        },
        fingerprint: ['generate-report-failed', data?.plan_code || 'unknown'],
      })
    } catch { /* noop */ }

    // v5.10.270 Codex P0#3 修:retry_count handling 不一致 → markReportFailed 觸發 Telegram alert
    // 客戶花 $29-279 報告失敗、ops 必須立即知道(refund / 重新生成 / 致歉信)
    if (currentRetry >= 2) {
      try {
        const { notify } = await import('@/lib/ai/observability/telegram')
        const planName = data?.plan_code || 'unknown'
        const body =
          `Report ID: ${reportId}\n` +
          `方案: ${planName}\n` +
          `客戶: ${data?.client_name || '?'} / ${data?.customer_email || '?'}\n` +
          `金額: $${data?.amount_usd || '?'}\n` +
          `重試次數: ${currentRetry + 1}/3\n` +
          `失敗原因: ${errorMessage.slice(0, 300)}\n\n` +
          `客戶已付款、立即介入:檢查 Python API/Claude API、考慮 refund 或人工生成`
        await notify('🔴 報告生成失敗(已達/接近重試上限)', body)
      } catch (telegramErr) {
        console.error('Telegram 通知失敗(不阻塞):', telegramErr)
      }
    }
  } catch (e) {
    console.error('標記失敗狀態時出錯:', e)
  }
}

export async function POST(req: NextRequest) {
  // 認證檢查：只允許內部呼叫（Workflow fallback / cron）
  const internalSecret = req.headers.get('x-internal-secret')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !internalSecret || internalSecret !== cronSecret) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  let reportId = ''
  let dryRun = false
  try {
    let { reportId: rid, accessToken, customerEmail, planCode, birthData, additionalPeople, topic, question, dryRun: dr } = await req.json()
    reportId = rid
    // dry-run(Phase 6 #1 regression):走完整排盤+AI 生成、但不寫 DB / 不改 status / 不發 email / 不生 PDF
    // 嚴格 === true、其餘 8 個既有 caller 不帶此欄位 → undefined → false → 既有行為 100% 不變
    dryRun = dr === true

    // Step 0: 檢查重試次數（最多 3 次）+ 從 Supabase 補齊缺失資料
    const { data: existingReport } = await getSupabase()
      .from('paid_reports')
      .select('retry_count, status, birth_data, plan_code, access_token, customer_email')
      .eq('id', reportId)
      .single()

    // 防重複生成：已完成或正在生成中的報告直接跳過
    // dryRun 例外:regression 本來就是「拿 completed 報告用新 prompt 重跑對照」、不可在此 bail
    if (!dryRun && existingReport?.status === 'completed') {
      console.info(`報告 ${reportId} 已完成，跳過 Fallback 重複生成`)
      return NextResponse.json({ message: '報告已完成' })
    }
    if (!dryRun && existingReport?.status === 'generating') {
      console.info(`報告 ${reportId} 正在生成中，跳過 Fallback 重複觸發`)
      return NextResponse.json({ message: '報告正在生成中' })
    }

    // 若 request body 沒帶完整資料，從 Supabase 記錄補齊（支援僅傳 reportId 重新觸發）
    if (!birthData && existingReport?.birth_data) {
      birthData = existingReport.birth_data
    }
    if (!planCode && existingReport?.plan_code) {
      planCode = existingReport.plan_code
    }
    if (!accessToken && existingReport?.access_token) {
      accessToken = existingReport.access_token
    }
    if (!customerEmail && existingReport?.customer_email) {
      customerEmail = existingReport.customer_email
    }

    if (!birthData) {
      return NextResponse.json({ error: '缺少出生資料' }, { status: 400 })
    }

    // G15 家族藍圖必須走 Workflow，舊版 route 不支援
    if (planCode === 'G15' && (birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports')) {
      console.info('G15 家族藍圖應走 Workflow，此路由不支援')
      // dryRun(regression):G15 走 workflow path、此 fallback route 本就不支援。
      // 回 HTTP 200 + 明確 skip 訊號(非 400/error)、讓 regression script 標 SKIP 不是 FAIL
      // (L1 QA P1-2:抽樣含 G15 completed 報告時、避免誤導性 502 + 覆蓋盲區)
      if (dryRun) {
        return NextResponse.json({
          ok: false,
          dryRun: true,
          skipped: 'G15-workflow-only',
          report_id: reportId,
          plan_code: planCode,
          reason: 'G15 家族藍圖僅走 durable workflow path、fallback generate-report 不支援、regression 無法經此 dry-run',
        })
      }
      await markReportFailed(reportId, 'G15 家族藍圖需透過 Workflow 生成，請重試', dryRun)
      return NextResponse.json({ error: 'G15 需透過 Workflow 生成' }, { status: 400 })
    }

    const retryCount = existingReport?.retry_count ?? 0
    // dryRun 不是真重試、不受 3 次上限、且絕不寫 status='failed'(會污染真實 completed 報告)
    if (!dryRun && retryCount >= 3) {
      await getSupabase().from('paid_reports').update({
        status: 'failed',
        error_message: '已達最大重試次數（3次），請聯繫客服 support@jianyuan.life',
      }).eq('id', reportId)
      return NextResponse.json({ error: '已達最大重試次數' }, { status: 429 })
    }

    // 用原子操作搶佔狀態為 generating，防止其他觸發源同時處理
    // 🔴 dryRun:完全跳過此原子搶佔 — 否則會把真實 completed/pending 報告 status 改成 generating
    //    (其他 trigger / cron / 客戶 dashboard 會誤判該報告正在重生)。dryRun 只讀不改狀態。
    if (!dryRun) {
      const { data: claimed, error: claimErr } = await getSupabase().from('paid_reports').update({
        status: 'generating',
        error_message: null,
        retry_count: existingReport?.status === 'failed' ? retryCount + 1 : retryCount,
      })
        .eq('id', reportId)
        .in('status', ['pending', 'failed'])
        .select('id')

      if (claimErr || !claimed?.length) {
        console.info(`報告 ${reportId} 狀態搶佔失敗，可能已被其他程序處理`)
        return NextResponse.json({ message: '報告已被其他程序處理' })
      }
    }

    // Step 1: 呼叫 Python API 排盤
    console.info(`開始生成報告: ${reportId}, 方案${planCode}, 第 ${retryCount + 1} 次嘗試`)

    let calcResult = null
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000) // 60 秒超時
      const res = await fetch(`${PYTHON_API}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: birthData.name,
          year: birthData.year, month: birthData.month, day: birthData.day,
          hour: birthData.hour, minute: birthData.minute || 0,
          gender: birthData.gender,
          // 農曆/國曆 + 真太陽時校正（與 Workflow 版本同步）
          calendar_type: birthData.calendar_type || 'solar',
          lunar_leap: birthData.lunar_leap || false,
          time_unknown: birthData.time_unknown || false,
          time_mode: birthData.time_mode || 'exact',
          ...(birthData.cityLat && birthData.cityLng ? { latitude: birthData.cityLat, longitude: birthData.cityLng } : {}),
          ...(birthData.latitude && birthData.longitude ? { latitude: birthData.latitude, longitude: birthData.longitude } : {}),
          // Sprint 4 國際化：把 IANA 時區與地區資訊傳給 Python
          ...(birthData.timezone_offset !== undefined ? { timezone_offset: birthData.timezone_offset } : {}),
          ...(birthData.timezone ? { timezone: birthData.timezone } : {}),
          ...(birthData.birth_city ? { birth_city: birthData.birth_city } : {}),
          ...(birthData.birth_country ? { birth_country: birthData.birth_country } : {}),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) calcResult = await res.json()
      else console.error('排盤 API 回傳錯誤:', res.status, await res.text())
    } catch (e) { console.error('排盤失敗:', e) }

    if (!calcResult) {
      await markReportFailed(reportId, '排盤計算失敗：Python API 無回應或超時', dryRun)
      return NextResponse.json({ error: '排盤計算失敗', dryRun }, { status: 500 })
    }

    // Step 2: 構建 prompt 並呼叫 AI
    const cd = calcResult.client_data
    const analyses = calcResult.analyses || []

    let reportContent = ''
    let aiModelUsed = 'unknown'

    // ── 構建非 C 方案的通用 user prompt ──
    function buildGenericUserPrompt(): string {
      // 從西洋占星提取關鍵星座數據（防止 AI 幻覺）
      const westernA = analyses.find((a: { system: string }) => a.system === '西洋占星')
      const numA = analyses.find((a: { system: string }) => a.system === '數字能量學')
      let keyDataBlock = ''
      if (westernA?.sub_summary || numA?.sub_summary) {
        keyDataBlock = `\n════════════════════════════════════════
【關鍵數據 — 摘要表必須與此完全一致】
流年：2026年是丙午年（不是乙巳年）
${westernA?.sub_summary ? `西洋占星摘要：${westernA.sub_summary}` : ''}
${numA?.sub_summary ? `數字能量學摘要：${numA.sub_summary}` : ''}
⚠️ 命格摘要表的每一欄必須直接從排盤數據複製，禁止自行推算或記憶。
⚠️ 七政四餘的廟旺按十二宮（子丑寅卯...）判定，不要混用西洋星座名稱。
════════════════════════════════════════\n`
      }

      let userPrompt = `${keyDataBlock}${birthData.name}，${birthData.gender==='M'?'男':'女'}，${birthData.year}年${birthData.month}月${birthData.day}日${birthData.hour}時
八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}
農曆：${cd.lunar_date || ''} | 納音：${cd.nayin || ''} | 命宮：${cd.ming_gong || ''}
${analyses.length}套系統排盤完整數據：
`
      // v5.10.267 P0 修(Codex L3 audit Finding #4):defensive schema validation
      //   - 原:`a.score` undefined → "評分：undefined 分" 給 AI(prompt rule #4 說 skip 但 TS 沒實際 skip)
      //   - 修:strict required field check、缺一即 skip 整個系統 + log warn 給營運(對應 Codex「靜默少資料 hard fail」)
      let skippedSystems = 0
      for (const a of analyses.slice(0, 15)) {
        // 必欄位檢查:system 名 + score(必有 calculator 給才算有效)
        if (!a.system || typeof a.score !== 'number' || isNaN(a.score)) {
          console.warn(`[generate-report] schema-drift skip system:`, {
            reportId, planCode,
            system: a.system,
            scoreType: typeof a.score,
            scoreValue: a.score,
          })
          skippedSystems++
          continue
        }
        userPrompt += `\n【${a.system}】評分：${a.score}分`
        if (a.summary) userPrompt += `\n摘要：${a.summary}`
        if (a.good_points?.length) {
          userPrompt += `\n好的地方：`
          for (const g of a.good_points) userPrompt += `\n- ${g}`
        }
        if (a.bad_points?.length) {
          userPrompt += `\n需要注意：`
          for (const b of a.bad_points) userPrompt += `\n- ${b}`
        }
        if (a.warnings?.length) {
          userPrompt += `\n注意事項：`
          for (const w of a.warnings) userPrompt += `\n- ${w}`
        }
        if (a.improvements?.length) {
          userPrompt += `\n改善建議：`
          for (const imp of a.improvements) userPrompt += `\n- ${imp}`
        }
        if (a.tables?.length) {
          for (const t of a.tables) {
            userPrompt += `\n表格「${t.title}」：\n`
            if (t.headers) userPrompt += `| ${t.headers.join(' | ')} |\n`
            if (t.rows) {
              for (const row of t.rows) userPrompt += `| ${row.join(' | ')} |\n`
            }
          }
        }
        if (a.details) {
          const detail = typeof a.details === 'string' ? a.details : JSON.stringify(a.details)
          userPrompt += `\n詳細排盤：\n${detail}\n`
        }
        if (a.info_boxes?.length) {
          for (const box of a.info_boxes) {
            userPrompt += `\n${box.title || '補充'}：\n`
            if (box.items) {
              for (const item of box.items) userPrompt += `- ${item}\n`
            }
          }
        }
        userPrompt += '\n'
      }

      // v5.10.267 schema-drift 警告:若 skip 太多系統、可能 calculator 半壞
      if (skippedSystems > 0) {
        console.warn(`[generate-report] schema-drift summary: skipped ${skippedSystems}/${analyses.length} systems for report ${reportId}`)
        // 若 skip > 30% 系統、表示 calculator 大半壞、應失敗(防客戶拿到只有 5/15 系統的劣化報告)
        if (skippedSystems > Math.floor(analyses.length * 0.3)) {
          console.error(`[generate-report] CRITICAL: too many systems skipped (${skippedSystems}/${analyses.length}), calculator likely broken`)
          // 注意:這裡仍 continue 跑 AI、log 給營運監控、Sprint 2.x 改 hard fail + apology email
        }
      }

      // 出門訣時間限制：客戶選的可配合時段
      if (birthData.available_time_slots && Array.isArray(birthData.available_time_slots) && birthData.available_time_slots.length > 0) {
        const slotsDesc = birthData.available_time_slots.map((s: { start?: string; end?: string }) => `${s.start || ''}~${s.end || ''}`).join('、')
        userPrompt += `\n【重要】客戶只有以下時段有空出門：${slotsDesc}\n吉時推薦必須只推薦在這些時段內的時機，不可推薦客戶無法出門的時段。\n`
      }

      // E1 事件時間範圍
      if (birthData.event_start_date) {
        userPrompt += `\n事件時間範圍：${birthData.event_start_date} 至 ${birthData.event_end_date || birthData.event_start_date}\n`
      }

      if (topic) userPrompt += `\n分析方向：${topic}\n`
      if (question) userPrompt += `客戶問題描述：${question}\n`

      if (additionalPeople?.length) {
        userPrompt += `\n其他人資料：\n`
        for (const p of additionalPeople) {
          userPrompt += `- ${p.name}，${p.gender === 'M' ? '男' : '女'}，${p.year}年${p.month}月${p.day}日${p.hour === 'unknown' || p.time_unknown ? '（時辰不確定）' : ` ${p.hour}時`}\n`
        }
      }

      userPrompt += `\n請根據以上所有排盤數據，撰寫完整的分析報告。
重要提醒：
1. 現在是2026年丙午年（天干丙火、地支午火）。任何提到2026年流年的地方必須寫「丙午」，絕對不是乙巳年。
2. 你的每一個分析論點都必須引用上方排盤數據中的具體結果，不得編造。
3. 排盤數據中「好的地方」和「需要注意」的每一條都必須在報告中被展開分析，不可遺漏。
4. 如果某個系統數據不完整，跳過該系統，不要瞎編。
5. 命格摘要表的每一欄（太陽星座、月亮星座、上升星座、生命靈數等）必須直接從排盤數據複製，禁止自行推算。
6. 七政四餘的廟旺是按十二宮（子丑寅卯辰巳午未申酉戌亥）判定，不要混用西洋星座名稱。
7. 生命靈數以排盤數據中的計算結果為準，不要自己重新算。`

      return userPrompt
    }

    // ── DeepSeek fallback 呼叫函式 ──
    async function callDeepSeekFallback(systemPrompt: string, userPrompt: string): Promise<string> {
      console.info('Fallback: 呼叫 DeepSeek 生成報告...')
      const tStart = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180000)
      try {
        const res = await fetch(DEEPSEEK_API, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 16000,
            temperature: 0.7,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''
        console.info(`DeepSeek 回覆: ${content.length} 字`)
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: Number(data?.usage?.prompt_tokens || 0),
            completionTokens: Number(data?.usage?.completion_tokens || 0),
            reportId, planCode,
            callStage: `${planCode}_fallback_deepseek`,
            latencyMs: Date.now() - tStart,
            status: content ? 'success' : 'incomplete',
          })
        } catch { /* noop */ }
        return content
      } catch (e) {
        clearTimeout(timeout)
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: 0, completionTokens: 0,
            reportId, planCode,
            callStage: `${planCode}_fallback_deepseek`,
            latencyMs: Date.now() - tStart,
            status: 'error',
            errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
          })
        } catch { /* noop */ }
        throw e
      }
    }

    console.info(`方案 ${planCode}：開始 AI 生成...`)

    if (planCode === 'C') {
      // ============================================================
      // C 方案 Fallback：單次 Claude 呼叫（受 Vercel 300s 限制）
      // 主流程由 Workflow 處理（4-call 順序），這裡是備援
      // ============================================================
      console.info('C 方案 Fallback：使用 Claude Opus 4.6 單次呼叫...')

      if (CLAUDE_API_KEY) {
        try {
          // Fallback route 受 Vercel 300s 限制，4 call 順序執行可能超時
          // 改為單次 generic prompt 呼叫，確保在時限內完成
          const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
          const genericUserPrompt = buildGenericUserPrompt()
          const rawResult = await callClaudeStreaming(systemPrompt, genericUserPrompt, 16000, 200000, {
            reportId, planCode, callStage: 'C_fallback_single',
          })

          // Fallback 單次呼叫，清理後直接使用
          reportContent = cleanAIResponse(rawResult)
          aiModelUsed = 'claude-opus-4-6'
          console.info(`C 方案 Fallback Claude 單次呼叫完成：${reportContent.length} 字`)
        } catch (e) {
          console.error('C 方案 Claude 多步生成失敗，嘗試 DeepSeek fallback:', e)
        }
      } else {
        console.warn('CLAUDE_API_KEY 未設定，C 方案直接使用 DeepSeek fallback')
      }

      // v5.10.277 Opus 失敗 → 改 fallback Claude Sonnet 4.6(同家族、體驗一致、CLAUDE.md「DeepSeek 永久移除」)
      // 順序:Opus 4.6 → Sonnet 4.6 → DeepSeek(legacy backup、未來 Sprint 2.x 移除)
      if (!reportContent && CLAUDE_API_KEY) {
        try {
          console.info('C 方案 Sonnet fallback:嘗試 Claude Sonnet 4.6...')
          const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
          const rawResult = await callClaudeStreaming(systemPrompt, buildGenericUserPrompt(), 16000, 200000, {
            reportId, planCode, callStage: 'C_fallback_sonnet',
          }, 'claude-sonnet-4-6')
          reportContent = cleanAIResponse(rawResult)
          aiModelUsed = 'claude-sonnet-4-6'
          console.info(`C 方案 Sonnet fallback 完成：${reportContent.length} 字`)
          // 仍是 downgrade、ops 該知道(Sonnet 跟 Opus 品質有差、但同 family、客戶感知小)
          // dryRun:不發 Telegram(regression 跑 100 份會洗版 ops 告警、且非真實客戶事件)
          if (!dryRun) notifyModelDowngrade(reportId, planCode, 'claude-opus-4-6', 'claude-sonnet-4-6', 'Opus failed').catch(() => {})
        } catch (e) {
          console.error('C 方案 Sonnet fallback 也失敗、最後嘗試 DeepSeek:', e)
        }
      }

      // Claude 全失敗或 key 未設定 → fallback DeepSeek(legacy 最後 backup、Sprint 2.x 移除)
      if (!reportContent) {
        try {
          const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
          reportContent = cleanAIResponse(await callDeepSeekFallback(systemPrompt, buildGenericUserPrompt()))
          aiModelUsed = 'deepseek-chat'
          console.info(`C 方案 DeepSeek fallback 完成：${reportContent.length} 字`)
          // v5.10.268 Gemini P0「LLM Fallback 體驗斷崖」alert:客戶收到劣化模型、ops 即介入
          if (!dryRun) notifyModelDowngrade(reportId, planCode, 'claude-opus-4-6', 'deepseek-chat', 'Claude Opus + Sonnet both failed').catch(() => {})
        } catch (e) {
          console.error('C 方案 DeepSeek fallback 也失敗:', e)
          await markReportFailed(reportId, `AI 生成失敗：Claude + DeepSeek 均失敗 — ${e instanceof Error ? e.message : '未知錯誤'}`, dryRun)
          return NextResponse.json({ error: 'AI 生成失敗', dryRun }, { status: 500 })
        }
      }
    } else {
      // ============================================================
      // 其他方案（D/R/G15/E1/E2/E3/E4）：Claude 單次呼叫，失敗 fallback DeepSeek
      // ============================================================
      const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
      const userPrompt = buildGenericUserPrompt()

      // 先嘗試 Claude
      if (CLAUDE_API_KEY) {
        try {
          console.info(`方案 ${planCode}：嘗試 Claude Opus 4.6 單次呼叫...`)
          reportContent = cleanAIResponse(await callClaudeStreaming(systemPrompt, userPrompt, 32768, 200000, {
            reportId, planCode, callStage: `${planCode}_fallback_single`,
          }))
          aiModelUsed = 'claude-opus-4-6'
          console.info(`方案 ${planCode} Claude 回覆：${reportContent.length} 字`)
        } catch (e) {
          console.error(`方案 ${planCode} Claude 呼叫失敗，嘗試 DeepSeek fallback:`, e)
        }
      } else {
        console.warn(`CLAUDE_API_KEY 未設定，方案 ${planCode} 直接使用 DeepSeek`)
      }

      // v5.10.277:Opus 失敗 → Sonnet 4.6 fallback(同家族)、最後才 DeepSeek
      if (!reportContent && CLAUDE_API_KEY) {
        try {
          console.info(`方案 ${planCode}:Sonnet fallback 嘗試...`)
          reportContent = cleanAIResponse(await callClaudeStreaming(systemPrompt, userPrompt, 32768, 200000, {
            reportId, planCode, callStage: `${planCode}_fallback_sonnet`,
          }, 'claude-sonnet-4-6'))
          aiModelUsed = 'claude-sonnet-4-6'
          console.info(`方案 ${planCode} Sonnet 完成：${reportContent.length} 字`)
          if (!dryRun) notifyModelDowngrade(reportId, planCode, 'claude-opus-4-6', 'claude-sonnet-4-6', 'Opus failed').catch(() => {})
        } catch (sonnetE) {
          console.error(`方案 ${planCode} Sonnet 也失敗、最後嘗試 DeepSeek:`, sonnetE)
        }
      }

      // Claude 全失敗或 key 未設定 → fallback DeepSeek(legacy)
      if (!reportContent) {
        try {
          reportContent = cleanAIResponse(await callDeepSeekFallback(systemPrompt, userPrompt))
          aiModelUsed = 'deepseek-chat'
          console.info(`方案 ${planCode} DeepSeek fallback 完成：${reportContent.length} 字`)
          // v5.10.268 Gemini P0「LLM Fallback 體驗斷崖」alert(同 C plan、D/R/G15/E* 都會落到這)
          if (!dryRun) notifyModelDowngrade(reportId, planCode, 'claude-opus-4-6', 'deepseek-chat', 'Claude Opus + Sonnet both failed').catch(() => {})
        } catch (e) {
          console.error(`方案 ${planCode} DeepSeek fallback 也失敗:`, e)
          await markReportFailed(reportId, `AI 生成失敗：Claude + DeepSeek 均失敗 — ${e instanceof Error ? e.message : '未知錯誤'}`, dryRun)
          return NextResponse.json({ error: 'AI 生成失敗', dryRun }, { status: 500 })
        }
      }
    }

    if (!reportContent) {
      await markReportFailed(reportId, 'AI 未回覆：AI 回傳空內容', dryRun)
      return NextResponse.json({ error: 'AI 未回覆', dryRun }, { status: 500 })
    }

    // Step 3.2: Post-generation QA — 比對 AI 報告與排盤數據，自動修正幻覺
    try {
      reportContent = validateReportAgainstData(reportContent, calcResult, birthData)
    } catch (e) {
      console.error('Post-generation QA 執行失敗（不阻塞）:', e)
    }

    // Step 3.5: 解析出門訣吉時 JSON（E1/E2/E3/E4 方案）
    // v5.7.10:E2 v2.0 用 TOP1_JSON 單月 1 盤、E1 用 TOP3_JSON Top3 吉時、舊版 TOP5_JSON、parser 三家兼容
    // v5.7.15:E3 fallback prompt 要求 8 個 TOP1_JSON、parser 改 matchAll 抓全部、合併成單一 array(Codex round 8 P2)
    let top5Timings: unknown[] | null = null
    const top1Matches = Array.from(reportContent.matchAll(/===TOP1_JSON_START===\s*([\s\S]*?)\s*===TOP1_JSON_END===/g))
    const top3Match = reportContent.match(/===TOP3_JSON_START===\s*([\s\S]*?)\s*===TOP3_JSON_END===/)
    const top5Match = reportContent.match(/===TOP5_JSON_START===\s*([\s\S]*?)\s*===TOP5_JSON_END===/)
    if (top1Matches.length > 0) {
      try {
        // 多個 TOP1_JSON 區塊(E3 預期 8 個)、合併成單一 array
        const merged: unknown[] = []
        for (const m of top1Matches) {
          const parsed = JSON.parse(m[1])
          if (Array.isArray(parsed)) merged.push(...parsed)
          else merged.push(parsed)
        }
        top5Timings = merged
        console.info(`✅ 解析到 ${merged.length} 筆吉時資料(來自 ${top1Matches.length} 個 TOP1_JSON 區塊)`)
      } catch (e) {
        console.error('TOP1 JSON 解析失敗:', e)
      }
    } else if (top3Match || top5Match) {
      const m = top3Match || top5Match!
      try {
        top5Timings = JSON.parse(m[1])
        console.info(`✅ 解析到 ${(top5Timings as unknown[]).length} 筆吉時資料`)
      } catch (e) {
        console.error('TOP3/5 JSON 解析失敗:', e)
      }
    }
    // 不論解析成功與否、都要移除 TOP1/TOP3/TOP5 JSON 區塊純文字、避免 markers leak 到客戶可見正文
    reportContent = reportContent
      .replace(/===TOP1_JSON_START===[\s\S]*?===TOP1_JSON_END===/g, '')
      .replace(/===TOP3_JSON_START===[\s\S]*?===TOP3_JSON_END===/g, '')
      .replace(/===TOP5_JSON_START===[\s\S]*?===TOP5_JSON_END===/g, '')
      // v5.10.399 Codex L3 P1:E4 fallback 換 SSOT 後用完整 prompt(要 YEAR_JSON)、此 fallback parser 不解析年盤結構、
      //   至少 strip raw YEAR_JSON block 避免吐給客戶(E4 fallback 罕見、主走 workflow、無 structured timings 屬 fallback 可接受限制)
      .replace(/===YEAR_JSON_START===[\s\S]*?===YEAR_JSON_END===/g, '')
      .trim()

    // Step 4: 存入 Supabase
    const reportResult: Record<string, unknown> = {
      report_id: reportId,
      systems_count: analyses.length,
      analyses_summary: analyses.map((a: { system: string; score: number }) => ({ system: a.system, score: a.score })),
      ai_content: reportContent,
      ai_model: aiModelUsed,
      ai_tokens: reportContent.length,
    }
    if (top5Timings) {
      reportResult.top5_timings = top5Timings
    }

    // 🔴 dry-run 早 return(Phase 6 #1 regression):
    //   完整跑完排盤 + AI 生成(reportContent 已過 post-gen QA + 去除 TOP_JSON marker)
    //   但此處直接回傳生成內容、不往下走 → 跳過 PDF 生成 / Supabase 寫回 / status='completed' / Email
    //   → 真實客戶報告(report_result / pdf_url / status / email_sent_at)完全不受影響
    //   ⚠️ dryRun 仍會耗用真實 AI token(ai_cost_log 照常記錄、成本透明)
    if (dryRun) {
      console.info(`[dryRun] ${reportId} 生成完成(${reportContent.length} 字、model=${aiModelUsed})、不持久化`)
      return NextResponse.json({
        ok: true,
        dryRun: true,
        report_id: reportId,
        plan_code: planCode,
        ai_model: aiModelUsed,
        content_length: reportContent.length,
        systems_count: analyses.length,
        generated_content: reportContent,
        top5_timings: top5Timings ?? undefined,
        // L2 IA P1-2 + lesson #146 spec scope:明示 regression 對照範圍
        // dryRun 走 fallback generate-report path、非 production 主路徑 durable workflow
        // → C/G15 等在 workflow path 的 5-LLM QA / qualityGate 迴圈 / merge 步驟「未涵蓋」
        // regression similarity 反映的是 fallback path 輸出、消費端須知此限制
        path: 'fallback-generate-report',
        scope_note: '非 workflow path、workflow-only 步驟(5-LLM QA / qualityGate / merge)未涵蓋',
      })
    }

    const planName = PLAN_NAMES[planCode] || '命理分析報告'

    // Step 4.5: 生成 PDF（非出門訣方案、E1-E4 全跳過）
    let pdfUrl: string | null = null
    if (!isChumenjiPlan(planCode)) {
      try {
        console.info('呼叫 Python API 生成 PDF...')
        // PDF 專用預處理：轉換 Markdown 格式為 PDF 友好格式
        const pdfContent = reportContent
          .replace(/^---+$/gm, '')           // 標準 markdown 橫線
          .replace(/^___+$/gm, '')           // 底線型橫線
          .replace(/^\*\*\*+$/gm, '')        // 星號型橫線
          .replace(/^[\s]*[-─—═]+[\s]*$/gm, '') // 全形橫線/裝飾線
          // 引言框：> 開頭 → 去掉 > 前綴，轉為引用格式
          .replace(/^>\s*(.+)$/gm, '「$1」')
          // Emoji → 文字替代（PDF 字體無法渲染 emoji）
          .replace(/🟢/g, '【好】')
          .replace(/🟡/g, '【注意】')
          .replace(/🔵/g, '【改善】')
          .replace(/📌/g, '【重點】')
          .replace(/✅/g, '【✓】')
          .replace(/⚠️/g, '【!】')
          .replace(/🔧/g, '【建議】')
          .replace(/🎯/g, '【核心】')
          .replace(/💡/g, '【提示】')
          .replace(/❤️/g, '【愛】')
          .replace(/⭐/g, '【星】')
          .replace(/🔑/g, '【關鍵】')
          // 清理其他 emoji（BMP 以外的 Unicode 會在 PDF 中變成方塊）
          .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
          .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
          .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
          .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
          .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
          .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
          .replace(/[\u{2702}-\u{27B0}]/gu, '')
          .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
          .replace(/\n{3,}/g, '\n\n')
        const pdfRes = await fetch(`${PYTHON_API}/api/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: reportId,
            plan_code: planCode,
            client_name: birthData.name,
            plan_name: planName,
            ai_content: pdfContent,
            locale: birthData.locale || 'zh-TW',
            analyses_summary: analyses.map((a: { system: string; score: number }) => ({
              system: a.system,
              score: a.score,
            })),
          }),
        })
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json()
          // Python API 回傳 base64，由 Next.js 上傳到 Supabase Storage
          if (pdfData.pdf_base64) {
            const pdfBytes = Buffer.from(pdfData.pdf_base64, 'base64')
            const storagePath = `${reportId}/report.pdf`
            const { error: uploadErr } = await getSupabase()
      .storage
              .from('reports')
              .upload(storagePath, pdfBytes, {
                contentType: 'application/pdf',
                upsert: true,
              })
            if (uploadErr) {
              console.error('Supabase Storage 上傳失敗:', uploadErr)
            } else {
              const { data: urlData } = getSupabase().storage
                .from('reports')
                .getPublicUrl(storagePath)
              pdfUrl = urlData.publicUrl
              console.info(`✅ PDF 上傳完成: ${pdfUrl} (${pdfData.file_size_kb}KB)`)
            }
          }
        } else {
          console.error('PDF 生成失敗:', await pdfRes.text())
        }
      } catch (pdfErr) {
        console.error('PDF 生成錯誤:', pdfErr)
      }
    }

    const { error: dbError } = await getSupabase().from('paid_reports').update({
      report_result: reportResult,
      pdf_url: pdfUrl,
      status: 'completed',
    }).eq('id', reportId)

    if (dbError) console.error('Supabase 更新失敗:', dbError)

    // Step 5: 寄送報告 Email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const reportUrl = `${siteUrl}/report/${accessToken}`

    // 根據 locale 決定郵件語言
    const isCN = birthData.locale === 'zh-CN'
    const emailLang = isCN ? 'zh-CN' : 'zh-TW'
    const emailFont = isCN
      ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
      : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"
    const emailText = {
      brand: isCN ? '鉴 源' : '鑒 源',
      subtitle: isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台',
      notice: isCN ? '✦ 报告完成通知' : '✦ 報告完成通知',
      title: isCN
        ? `${birthData?.name || ''}，您的报告已完成`
        : `${birthData?.name || ''}，您的報告已完成`,
      systemCount: isChumenjiPlan(planCode)
        ? (isCN ? `${planName} · 奇门遁甲精算` : `${planName} · 奇門遁甲精算`)
        : planCode === 'G15'
        ? (isCN ? `${planName} · 家族互动分析` : `${planName} · 家族互動分析`)
        : planCode === 'C'
        ? (isCN ? `${planName} · 东西方命理系统深度分析` : `${planName} · 東西方命理系統深度分析`)
        : (isCN ? `${planName} · 精选相关命理系统分析` : `${planName} · 精選相關命理系統分析`),
      cta: getEmailCta(planCode, isCN),
      linkNote: isCN ? '此链接专属于您，无需登录即可查看' : '此連結專屬於您，無需登入即可查看',
      promoTitle: isCN ? '🧭 加强您的命理能量' : '🧭 加強您的命理能量',
      promoBody: isCN
        ? '报告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出门诀</strong>能帮您在最佳时机、最佳方位行动，将命理洞察转化为日常决策的参考依据。'
        : '報告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出門訣</strong>能幫您在最佳時機、最佳方位行動，將命理洞察轉化為日常決策的參考依據。',
      promoLink: isCN ? '了解出门诀方案 →' : '了解出門訣方案 →',
      footer: isCN ? '如有任何问题，请联系' : '如有任何問題，請聯繫',
      copyright: isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life',
      subject: isCN
        ? `【鉴源命理】您的${planName}报告已完成 — ${birthData?.name || ''}`
        : `【鑒源命理】您的${planName}報告已完成 — ${birthData?.name || ''}`,
      from: isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>',
    }

    if (customerEmail && accessToken) {
      try {
        // T12b v5.10.370 — sendEmailWithRetry 取代 raw new Resend + send
        const emailHighlights = getEmailHighlights(planCode, reportContent, isCN)
        const highlightsHtml = emailHighlights.map(h =>
          `<div style="color:#d1d5db;font-size:14px;line-height:1.8;margin:0 0 8px 0;"><span style="color:#c9a84c;margin-right:6px;">✦</span>${h}</div>`
        ).join('')

        const reportSendResult = await sendEmailWithRetry({
          from: emailText.from,
          to: customerEmail,
          emailType: 'report_link',
          reportId,
          metadata: { plan: planCode, locale: emailLang },
          subject: emailText.subject,
          html: `
<!DOCTYPE html>
<html lang="${emailLang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- 頂部品牌 -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${emailText.brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${emailText.subtitle}</div>
    </div>

    <!-- 主卡片 -->
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;letter-spacing:2px;margin-bottom:8px;">${emailText.notice}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 8px 0;">${emailText.title}</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px 0;">${emailText.systemCount}</p>

      <!-- 報告亮點 -->
      <div style="background:rgba(255,255,255,0.05);border-left:3px solid #c9a84c;border-radius:4px;padding:16px;margin-bottom:24px;">
        ${highlightsHtml}
      </div>

      <!-- CTA 按鈕 -->
      <div style="text-align:center;">
        <a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:1px;">
          ${emailText.cta}
        </a>
        <p style="color:#6b7280;font-size:12px;margin:12px 0 0 0;">${emailText.linkNote}</p>
      </div>
    </div>

    <!-- 出門訣推廣（非出門訣方案才顯示、E1-E4 全跳過）-->
    ${!isChumenjiPlan(planCode) ? `
    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;font-weight:600;margin-bottom:8px;">${emailText.promoTitle}</div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.7;margin:0 0 16px 0;">
        ${emailText.promoBody}
      </p>
      <a href="https://jianyuan.life/pricing" style="color:#c9a84c;font-size:13px;text-decoration:none;">${emailText.promoLink}</a>
    </div>
    ` : ''}

    <!-- 頁尾 -->
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${emailText.footer} <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a></p>
      <p style="margin-top:8px;">${emailText.copyright}</p>
      ${getUnsubscribeHtml(customerEmail)}
    </div>
  </div>
</body>
</html>`,
        })

        // T12b v5.10.370 — 只在真送成功才標 email_sent_at(避免 dead-letter 後 ghost 標記)
        if (reportSendResult.success) {
          await getSupabase().from('paid_reports')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', reportId)
          console.info(`✅ Email 已寄送至 ${customerEmail}、attempts=${reportSendResult.attempts}`)
        } else {
          // helper 已 dead-letter + audit-event critical
          console.warn(`[generate-report][report-send] dead-letter:${customerEmail} attempts=${reportSendResult.attempts}`)
        }
      } catch (emailErr) {
        console.error('Email 寄送 fatal:', emailErr)
        // 不讓 email 失敗影響整體回傳
      }
    }

    return NextResponse.json({
      success: true,
      report_id: reportId,
      report_url: reportUrl,
      content_length: reportContent.length,
      systems_count: analyses.length,
    })
  } catch (err) {
    console.error('報告生成錯誤:', err)
    const errorMsg = err instanceof Error ? err.message : '未知錯誤'
    if (reportId) {
      await markReportFailed(reportId, `報告生成未預期錯誤: ${errorMsg}`, dryRun)
    }
    return NextResponse.json({ error: errorMsg, dryRun }, { status: 500 })
  }
}
