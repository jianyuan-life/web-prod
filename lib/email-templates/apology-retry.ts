// ============================================================
// 提示詞合集 Prompt 3 任務 B — 報告生成失敗致歉信模板
// ============================================================
// 觸發點:generate-report retry 3 次仍 fail(呼叫端 wire,本檔僅模板)。
// 對應根 CLAUDE.md 待辦「報告生成失敗自動發致歉信」(🟡 #12/#13)。
//
// 🔴 SSOT:4 大保證文字唯一真相 = 根 CLAUDE.md「退費 policy(v5.7.8)」
//   section。本檔內嵌副本須與該 section 一致(改 policy 必同步此處)。
//   防重發:呼叫端配合 Supabase paid_reports.fail_notified_at 欄位
//   (DB migration = 老闆;欄位未建前呼叫端應自行 guard)。
//
// additive 純模板函式、未自動 wire。

export interface ApologyRetryParams {
  customerName: string
  planName: string
  reportToken?: string
  siteUrl?: string
}

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

// 4 大保證(對齊根 CLAUDE.md「退費 policy(v5.7.8)」、改 policy 必同步)
const GUARANTEES: string[] = [
  '失敗自動重試 3 次,並由真人在 24 小時內接手協助補開新單(不會多扣款)',
  '內容明顯錯誤(出生資料解讀錯)免費重新生成、不再扣款',
  '系統重複扣款,無條件退回多扣金額',
  '未授權扣款(盜刷 / 家人誤購)提供 Stripe 交易紀錄即可申訴退回',
]

export function buildApologyRetryEmail(p: ApologyRetryParams): EmailTemplate {
  const site = p.siteUrl || 'https://jianyuan.life'
  const subject = `${p.customerName},您的「${p.planName}」報告我們正在親自為您處理`
  const liItems = GUARANTEES.map((g) => `<li style="margin:6px 0;line-height:1.7">${g}</li>`).join('')
  const html = `<div style="font-family:system-ui,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="color:#0A0A0A">${p.customerName},先跟您致歉</h2>
  <p style="line-height:1.8">您購買的「<b>${p.planName}</b>」在精密計算過程中遇到系統狀況,
  我們的工程團隊已收到通知,<b>會在 24 小時內親自為您完成並重新寄送</b>,過程不會再向您收取任何費用。</p>
  <p style="line-height:1.8">您的權益我們已用以下保證守住:</p>
  <ul style="padding-left:20px">${liItems}</ul>
  <p style="line-height:1.8">若有任何疑問,直接回覆此信或來信
  <a href="mailto:support@jianyuan.life" style="color:#B33A2E">support@jianyuan.life</a>,我們會優先處理。</p>
  ${p.reportToken ? `<p><a href="${site}/report/${p.reportToken}" style="display:inline-block;background:#B33A2E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">查看處理進度</a></p>` : ''}
  <p style="color:#888;font-size:13px;margin-top:24px">鑑源命理平台 · ${site}</p>
</div>`
  const text =
    `${p.customerName},先跟您致歉。\n\n您購買的「${p.planName}」遇到系統狀況,` +
    `我們會在 24 小時內親自完成並重寄,不會再收費。\n\n4 大保證:\n` +
    GUARANTEES.map((g, i) => `${i + 1}. ${g}`).join('\n') +
    `\n\n有問題請回信或來信 support@jianyuan.life。\n鑑源命理平台 ${site}`
  return { subject, html, text }
}
