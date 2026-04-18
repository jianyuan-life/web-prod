// ============================================================
// Telegram Bot — 老闆即時告警
// ============================================================
// 用途：關鍵事件即時推播到 Telegram（報告失敗、成本異常、品質閘門、每日摘要）
// 環境變數：
//   TELEGRAM_BOT_TOKEN   — Bot token（@BotFather 拿）
//   TELEGRAM_CHAT_ID     — 接收訊息的 chat_id（個人或群組）
//
// 設計原則：
// 1. 只用 fetch，不加 npm 依賴
// 2. env 未設 → console.warn 但不 throw（監控壞了不能把主流程搞掛）
// 3. 所有訊息用 HTML parse mode（避開 MarkdownV2 字元轉義的地獄）
// ============================================================

/* eslint-disable no-console */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

export type DailySummary = {
  /** 日期（YYYY-MM-DD）*/
  date: string
  totalReports: number
  successReports: number
  failedReports: number
  /** USD */
  totalCostUsd: number
  /** USD */
  totalRevenueUsd?: number
  newCustomers?: number
  topPlans?: Array<{ plan: string; count: number }>
  notes?: string
}

// ── 核心發送 ────────────────────────────────────────────────

type SendOptions = {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disableNotification?: boolean
  disableWebPagePreview?: boolean
}

/**
 * 底層 sendMessage。env 未設 → console.warn + 回 false。
 */
async function sendTelegramMessage(text: string, opts: SendOptions = {}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 未設定，跳過告警')
    console.warn('[telegram:fallback]', text.slice(0, 500))
    return false
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000), // Telegram 上限 4096，留 buffer
        parse_mode: opts.parseMode || 'HTML',
        disable_notification: opts.disableNotification || false,
        disable_web_page_preview: opts.disableWebPagePreview ?? true,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[telegram] sendMessage ${res.status}: ${body.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[telegram] sendMessage 失敗:', err)
    return false
  }
}

// ── HTML escape（Telegram HTML parse mode）──────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  return `$${n.toFixed(2)}`
}

// ── 公開 API ────────────────────────────────────────────────

/**
 * 報告生成失敗告警（最重要，直接影響客戶）
 */
export async function notifyFailed(reportId: string, reason: string): Promise<boolean> {
  const msg =
    `🚨 <b>報告生成失敗</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>失敗原因：</b>${esc(reason).slice(0, 500)}\n\n` +
    `<i>請到後台 /jamie 查看並重試</i>`
  return sendTelegramMessage(msg)
}

/**
 * 成本異常告警（單次/累積花費超過閾值）
 */
export async function notifyHighCost(amount: number, threshold: number): Promise<boolean> {
  const overBy = amount - threshold
  const pct = threshold > 0 ? ((overBy / threshold) * 100).toFixed(1) : '∞'
  const msg =
    `💸 <b>AI 成本異常</b>\n\n` +
    `<b>本次金額：</b>${fmtUsd(amount)}\n` +
    `<b>警戒閾值：</b>${fmtUsd(threshold)}\n` +
    `<b>超出：</b>${fmtUsd(overBy)}（+${pct}%）\n\n` +
    `<i>請檢查 ai_cost_log 找出異常呼叫</i>`
  return sendTelegramMessage(msg)
}

/**
 * 品質閘門 3 次失敗告警（AI 寫出來的內容過不了檢查）
 */
export async function notifyQualityGate(reportId: string, score: number): Promise<boolean> {
  const msg =
    `⚠️ <b>品質閘門 3 次失敗</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>最後分數：</b>${score}\n\n` +
    `<i>AI 連續 3 次寫出不及格內容，已轉為待人工介入</i>`
  return sendTelegramMessage(msg)
}

/**
 * 每日摘要（晚上固定推送當日營運狀況）
 */
export async function notifyDaily(summary: DailySummary): Promise<boolean> {
  const successRate =
    summary.totalReports > 0
      ? ((summary.successReports / summary.totalReports) * 100).toFixed(1)
      : '0.0'

  let topPlansText = ''
  if (summary.topPlans && summary.topPlans.length > 0) {
    topPlansText =
      `\n<b>熱門方案：</b>\n` +
      summary.topPlans
        .slice(0, 5)
        .map((p, i) => `  ${i + 1}. ${esc(p.plan)} × ${p.count}`)
        .join('\n')
  }

  const revenueText =
    typeof summary.totalRevenueUsd === 'number'
      ? `<b>當日營收：</b>${fmtUsd(summary.totalRevenueUsd)}\n`
      : ''

  const newCustomersText =
    typeof summary.newCustomers === 'number'
      ? `<b>新增客戶：</b>${summary.newCustomers} 人\n`
      : ''

  const notesText = summary.notes ? `\n<i>${esc(summary.notes)}</i>` : ''

  const msg =
    `📊 <b>鑑源每日摘要 ${esc(summary.date)}</b>\n\n` +
    `<b>報告總數：</b>${summary.totalReports}\n` +
    `<b>成功 / 失敗：</b>${summary.successReports} / ${summary.failedReports}（${successRate}%）\n` +
    `<b>AI 總成本：</b>${fmtUsd(summary.totalCostUsd)}\n` +
    revenueText +
    newCustomersText +
    topPlansText +
    notesText

  return sendTelegramMessage(msg, { disableNotification: true })
}

/**
 * 通用訊息（其他部門/腳本可直接用）
 */
export async function notify(title: string, body: string): Promise<boolean> {
  const msg = `<b>${esc(title)}</b>\n\n${esc(body)}`
  return sendTelegramMessage(msg)
}

// ============================================================
// v5.3.2 監控告警系統擴充（2026-04-18）
// ============================================================

/**
 * LLM 餘額不足警告（< $10）
 */
export async function notifyLLMBalanceLow(
  provider: string,
  balance: number,
  currency: string = 'USD',
): Promise<boolean> {
  const sym = currency === 'CNY' ? '¥' : '$'
  const msg =
    `⚠️ <b>LLM 餘額不足</b>\n\n` +
    `<b>Provider：</b>${esc(provider)}\n` +
    `<b>目前餘額：</b>${sym}${balance.toFixed(2)} ${esc(currency)}\n` +
    `<b>建議：</b>儘快充值（閾值 $10）\n\n` +
    `<i>若繼續往下燒會切到 fallback provider，品質可能下降</i>`
  return sendTelegramMessage(msg)
}

/**
 * LLM 餘額告急（< $3，紅色緊急）
 */
export async function notifyLLMBalanceCritical(
  provider: string,
  balance: number,
  currency: string = 'USD',
): Promise<boolean> {
  const sym = currency === 'CNY' ? '¥' : '$'
  const msg =
    `🔴 <b>LLM 餘額告急（緊急）</b>\n\n` +
    `<b>Provider：</b>${esc(provider)}\n` +
    `<b>目前餘額：</b>${sym}${balance.toFixed(2)} ${esc(currency)}\n` +
    `<b>狀態：</b>即將耗盡（閾值 $3）\n\n` +
    `<i>立刻充值！再過幾份報告就會 402 無法生成</i>`
  return sendTelegramMessage(msg)
}

/**
 * Stripe 付款失敗
 */
export async function notifyStripeFailed(
  sessionId: string,
  reason: string,
  amount?: number,
): Promise<boolean> {
  const amountText = typeof amount === 'number' ? `<b>金額：</b>${fmtUsd(amount)}\n` : ''
  const msg =
    `💳 <b>Stripe 付款失敗</b>\n\n` +
    `<b>Session：</b><code>${esc(sessionId)}</code>\n` +
    amountText +
    `<b>原因：</b>${esc(reason).slice(0, 400)}\n\n` +
    `<i>客戶可能在結帳流程卡住，請查看 Stripe Dashboard</i>`
  return sendTelegramMessage(msg)
}

/**
 * Resend 寄信失敗（客戶收不到報告連結）
 */
export async function notifyEmailFailed(
  reportId: string,
  toEmail: string,
  reason: string,
): Promise<boolean> {
  const msg =
    `📭 <b>Email 寄信失敗</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>收件人：</b>${esc(toEmail)}\n` +
    `<b>失敗原因：</b>${esc(reason).slice(0, 400)}\n\n` +
    `<i>客戶將收不到報告通知，請手動補發</i>`
  return sendTelegramMessage(msg)
}

/**
 * 報告卡住超過 N 分鐘（workflow 掛了沒發現）
 */
export async function notifyReportStuck(
  reportId: string,
  minutes: number,
  clientName?: string,
): Promise<boolean> {
  const nameText = clientName ? `<b>客戶：</b>${esc(clientName)}\n` : ''
  const msg =
    `⏱ <b>報告生成卡住</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    nameText +
    `<b>已卡住：</b>${minutes} 分鐘\n\n` +
    `<i>workflow 可能崩潰，建議到 /jamie/monitoring 查看並重試</i>`
  return sendTelegramMessage(msg)
}

/**
 * 單日 AI 成本超預算
 */
export async function notifyAbnormalCost(
  dailyCost: number,
  budget: number,
): Promise<boolean> {
  const overBy = dailyCost - budget
  const pct = budget > 0 ? ((overBy / budget) * 100).toFixed(1) : '∞'
  const msg =
    `💸 <b>單日 AI 成本超預算</b>\n\n` +
    `<b>今日花費：</b>${fmtUsd(dailyCost)}\n` +
    `<b>日預算：</b>${fmtUsd(budget)}\n` +
    `<b>超出：</b>${fmtUsd(overBy)}（+${pct}%）\n\n` +
    `<i>檢查是否有異常重試、prompt 爆量或被亂用</i>`
  return sendTelegramMessage(msg)
}

/**
 * 客戶低評價（< 3 星）
 */
export async function notifyLowRating(
  reportId: string,
  stars: number,
  comment?: string,
): Promise<boolean> {
  const commentText = comment
    ? `<b>留言：</b>${esc(comment).slice(0, 600)}\n`
    : ''
  const msg =
    `😞 <b>客戶低評價（${stars} 星）</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>評分：</b>${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}\n` +
    commentText +
    `\n<i>儘快跟客戶聯繫補救，避免退款或負評</i>`
  return sendTelegramMessage(msg)
}

/**
 * Workflow 崩潰（整個生成鏈爆炸）
 */
export async function notifyWorkflowFailed(
  reportId: string,
  errorMsg: string,
  stage?: string,
): Promise<boolean> {
  const stageText = stage ? `<b>階段：</b>${esc(stage)}\n` : ''
  const msg =
    `💥 <b>Workflow 崩潰</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    stageText +
    `<b>錯誤：</b>${esc(errorMsg).slice(0, 500)}\n\n` +
    `<i>Workflow 異常退出，系統會自動重試最多 3 次</i>`
  return sendTelegramMessage(msg)
}

// ============================================================
// Post-Gen 5 LLM QA Pipeline 告警（2026-04-18）
// ============================================================

export type FiveLLMScores = {
  gpt?: number
  qwen?: number
  gemini?: number
  kimi?: number
  deepseek?: number
}

/**
 * 5 LLM QA 黃色警告（avg < 93 但 >= 85）：報告交付但品質拉警報
 */
export async function notifyFiveLLMWarning(
  reportId: string,
  planCode: string,
  avg: number,
  min: number,
  scores: FiveLLMScores,
  issues: string[] = [],
): Promise<boolean> {
  const scoreLine = Object.entries(scores)
    .map(([k, v]) => `  ${k.toUpperCase()}: ${v ?? '-'}`)
    .join('\n')
  const issuesText = issues.length > 0
    ? `\n<b>主要問題：</b>\n` + issues.slice(0, 5).map(i => `  • ${esc(i).slice(0, 120)}`).join('\n')
    : ''
  const msg =
    `🟡 <b>5 LLM QA 黃色警告</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>方案：</b>${esc(planCode)}\n` +
    `<b>平均分：</b>${avg}（門檻 93）\n` +
    `<b>最低分：</b>${min}（門檻 95）\n\n` +
    `<b>各 Reviewer 分數：</b>\n${scoreLine}` +
    issuesText +
    `\n\n<i>報告已交付但品質拉警報，請到 /jamie/quality-reports 檢視</i>`
  return sendTelegramMessage(msg)
}

/**
 * 5 LLM QA 紅色警報（avg < 85）：嚴重品質問題
 */
export async function notifyFiveLLMCritical(
  reportId: string,
  planCode: string,
  avg: number,
  min: number,
  scores: FiveLLMScores,
  criticalErrors: string[] = [],
): Promise<boolean> {
  const scoreLine = Object.entries(scores)
    .map(([k, v]) => `  ${k.toUpperCase()}: ${v ?? '-'}`)
    .join('\n')
  const critText = criticalErrors.length > 0
    ? `\n<b>致命錯誤：</b>\n` + criticalErrors.slice(0, 5).map(i => `  ⚠ ${esc(i).slice(0, 150)}`).join('\n')
    : ''
  const msg =
    `🔴 <b>5 LLM QA 紅色警報</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>方案：</b>${esc(planCode)}\n` +
    `<b>平均分：</b>${avg}（紅色門檻 85）\n` +
    `<b>最低分：</b>${min}\n\n` +
    `<b>各 Reviewer 分數：</b>\n${scoreLine}` +
    critText +
    `\n\n<i>立刻到 /jamie/quality-reports 檢視，不要交付給客戶</i>`
  return sendTelegramMessage(msg)
}

// ============================================================
// v5.3.5 AI 成本監控告警（2026-04-18）
// ============================================================

/**
 * 單日 AI 成本超過閾值（預設 $20）
 * 用於 accounting/check-ai-daily cron
 */
export async function notifyAICostDailyExceed(
  amount: number,
  threshold: number = 20,
): Promise<boolean> {
  const overBy = amount - threshold
  const pct = threshold > 0 ? ((overBy / threshold) * 100).toFixed(1) : '∞'
  const msg =
    `💸 <b>單日 AI 成本超標</b>\n\n` +
    `<b>今日累計：</b>${fmtUsd(amount)}\n` +
    `<b>告警閾值：</b>${fmtUsd(threshold)}\n` +
    `<b>超出：</b>${fmtUsd(overBy)}（+${pct}%）\n\n` +
    `<i>請到 /jamie/ai-cost 查看細項，排查是否有異常 retry 或 prompt 爆量</i>`
  return sendTelegramMessage(msg)
}

/**
 * 單筆 AI 呼叫花費超過閾值（預設 $5）
 * 由 recordAIUsage 自動觸發
 */
export async function notifyAICostSingleCallExpensive(
  model: string,
  cost: number,
  reportId: string | null,
  callStage: string | null,
): Promise<boolean> {
  const reportLine = reportId ? `<b>Report：</b><code>${esc(reportId)}</code>\n` : ''
  const stageLine = callStage ? `<b>階段：</b>${esc(callStage)}\n` : ''
  const msg =
    `🔴 <b>單筆 AI 呼叫超貴</b>\n\n` +
    `<b>Model：</b><code>${esc(model)}</code>\n` +
    `<b>單次花費：</b>${fmtUsd(cost)}\n` +
    reportLine +
    stageLine +
    `\n<i>單筆超過 $5 代表 prompt 過長或 max_tokens 太大，請檢查 /jamie/ai-cost Top 10 最貴呼叫</i>`
  return sendTelegramMessage(msg)
}

/**
 * 5 LLM QA 連續失敗：已標為 needs_human_review
 */
export async function notifyNeedsHumanReview(
  reportId: string,
  planCode: string,
  attempts: number,
  lastAvg: number,
  criticalErrors: string[] = [],
): Promise<boolean> {
  const critText = criticalErrors.length > 0
    ? `\n<b>致命錯誤：</b>\n` + criticalErrors.slice(0, 5).map(i => `  ⚠ ${esc(i).slice(0, 150)}`).join('\n')
    : ''
  const msg =
    `🚨 <b>報告需人工介入</b>\n\n` +
    `<b>Report ID：</b><code>${esc(reportId)}</code>\n` +
    `<b>方案：</b>${esc(planCode)}\n` +
    `<b>已重試次數：</b>${attempts}\n` +
    `<b>最後平均分：</b>${lastAvg}` +
    critText +
    `\n\n<i>status 已改 needs_human_review，請到 /jamie/quality-reports 審理</i>`
  return sendTelegramMessage(msg)
}
