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
