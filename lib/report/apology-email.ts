// ============================================================
// 報告終局失敗客戶致歉信 — 模板 SSOT + 補寄函式
//
// v5.10.461(P0-3 修、2026-07-03 bizaudit):
//   致歉信原本只活在 workflows/generate-report/steps.ts markReportFailed(workflow path);
//   cron retry-pending 的兩條「最典型終局失敗」路徑(重試≥3 標 failed、生成超時 60 分標 failed)
//   直接 update DB、繞過致歉信 → faq/terms/checkout 白紙黑字承諾的「24 小時人工接手」沒兌現。
//
// ⚠️ 模板 SSOT 警告(lesson #116 同款):此檔是致歉信 HTML 唯一來源。
//   steps.ts markReportFailed 已改用 buildApologyEmail()、勿在他處再 inline 複製模板。
// ============================================================

import { sendEmailWithRetry } from '@/lib/resend-helper'
import { getUnsubscribeHtml, getUnsubscribeUrl } from '@/lib/unsubscribe'
import { notifyEmailFailed } from '@/lib/ai/observability/telegram'
import { createServiceClient } from '@/lib/supabase'
import { PLAN_NAMES } from '@/lib/plan-names'

export function buildApologyEmail(opts: {
  reportId: string
  planCode: string
  customerEmail: string
  locale?: string
}): { subject: string; from: string; html: string } {
  const { reportId, planCode, customerEmail } = opts
  const planName = PLAN_NAMES[planCode] || '命理報告'
  const isCN = opts.locale === 'zh-CN'
  const emailFont = isCN
    ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
    : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"
  const emailLang = isCN ? 'zh-CN' : 'zh-TW'

  const supportEmail = 'support@jianyuan.life'
  const supportMailtoSubject = encodeURIComponent((isCN ? '报告处理协助 ' : '報告處理協助 ') + reportId.slice(0, 8))
  const supportMailtoUrl = `mailto:${supportEmail}?subject=${supportMailtoSubject}&body=${encodeURIComponent('您好、我的報告生成失敗、煩請協助補開新單。報告編號:' + reportId.slice(0, 8))}`
  const subject = isCN
    ? `关于您的${planName}报告 — 我们正在处理`
    : `關於您的${planName}報告 — 我們正在處理`
  const from = isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>'

  const apologyHtml = isCN ? `
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">您好，</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">很抱歉通知您，您的<strong style="color:#c9a84c;">${planName}</strong>报告在生成过程中遇到技术问题，系统经多次自动重试仍未能完成。</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">我们的团队已收到告警并介入处理：</p>
      <ul style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 20px 0;padding-left:20px;">
        <li><strong style="color:#c9a84c;">24 小时内</strong>客服将协助您补开新单（不会多扣款）</li>
        <li>报告已进入优先处理队列、由人工接手生成</li>
        <li>请留意您的邮箱、若有任何疑问随时联系客服</li>
      </ul>
      ` : `
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">您好，</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">很抱歉通知您，您的<strong style="color:#c9a84c;">${planName}</strong>報告在生成過程中遇到技術問題，系統經多次自動重試仍未能完成。</p>
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 16px 0;">我們的團隊已收到告警並介入處理：</p>
      <ul style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 20px 0;padding-left:20px;">
        <li><strong style="color:#c9a84c;">24 小時內</strong>客服將協助您補開新單(不會多扣款)</li>
        <li>報告已進入優先處理佇列、由人工接手生成</li>
        <li>請留意您的信箱、若有任何疑問隨時聯繫客服</li>
      </ul>
      `

  const ctaSupport = isCN ? '联系客服补开' : '聯繫客服補開'
  const ctaContact = isCN ? '联系客服' : '聯繫客服'
  const refIdLabel = isCN ? '报告编号' : '報告編號'
  const brand = isCN ? '鉴 源' : '鑒 源'
  const subtitle = isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台'
  const notice = isCN ? '✦ 报告处理通知' : '✦ 報告處理通知'
  const titleText = isCN ? '您的报告正在人工处理中' : '您的報告正在人工處理中'
  const copyright = isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life'
  const footer = isCN ? '如有任何疑问，请联系' : '如有任何疑問，請聯繫'
  // (List-Unsubscribe header 由呼叫端各自組、builder 只負責 html/subject/from — qaia P2-1 去 dead 變數)

  const html = `<!DOCTYPE html>
<html lang="${emailLang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${subtitle}</div>
    </div>
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;letter-spacing:2px;margin-bottom:8px;">${notice}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 16px 0;">${titleText}</h1>
      ${apologyHtml}
      <div style="margin-top:24px;">
        <a href="${supportMailtoUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;letter-spacing:1px;margin:4px 8px 4px 0;">${ctaSupport}</a>
        <a href="mailto:${supportEmail}?subject=${encodeURIComponent((isCN ? '报告处理询问 ' : '報告處理詢問 ') + reportId.slice(0, 8))}" style="display:inline-block;background:transparent;color:#c9a84c;border:1px solid #c9a84c;font-weight:700;font-size:14px;padding:11px 24px;border-radius:8px;text-decoration:none;letter-spacing:1px;margin:4px 0;">${ctaContact}</a>
      </div>
      <p style="color:#6b7280;font-size:12px;margin:20px 0 0 0;">${refIdLabel}：${reportId.slice(0, 8)}</p>
    </div>
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${footer} <a href="mailto:${supportEmail}" style="color:#c9a84c;">${supportEmail}</a></p>
      <p style="margin-top:8px;">${copyright}</p>
      ${getUnsubscribeHtml(customerEmail)}
    </div>
  </div>
</body>
</html>`

  return { subject, from, html }
}

/**
 * 終局失敗致歉信補寄(非 workflow 呼叫端用、如 cron retry-pending)。
 * 自帶完整 guard:status=failed + retry_count>=3 + 有 customer_email + 未寄過。
 * 失敗不拋錯(呼叫端不阻塞)。
 */
export async function sendApologyIfFinalFailure(reportId: string, source: string): Promise<{ sent: boolean; reason: string }> {
  try {
    const supabase = createServiceClient()
    // ⚠️ 不 select apology_sent_at:production 實測(2026-07-03)該欄位不存在(42703)、
    //   select 含它會整句 400 → 整個流程靜默失效(steps.ts 舊 select 同病、已一併修)。
    //   防重寄改查 email_send_log(表確定存在、sendEmailWithRetry 每次成功都記 template+report_id)。
    const { data: row } = await supabase
      .from('paid_reports')
      .select('status, retry_count, customer_email, plan_code, birth_data')
      .eq('id', reportId)
      .single()
    if (!row) return { sent: false, reason: 'not-found' }
    if (row.status !== 'failed') return { sent: false, reason: `status=${row.status}` }
    const retryCount = row.retry_count ?? 0
    if (retryCount < 3) return { sent: false, reason: `retry=${retryCount}<3(還會重試、非終局)` }
    if (!row.customer_email) return { sent: false, reason: 'no-email' }
    const alreadySent = await hasApologyBeenSent(reportId)
    if (alreadySent) return { sent: false, reason: 'already-sent' }

    const birthData = (row.birth_data || {}) as Record<string, unknown>
    const locale = typeof birthData.locale === 'string' ? birthData.locale : 'zh-TW'
    const { subject, from, html } = buildApologyEmail({
      reportId,
      planCode: row.plan_code || '',
      customerEmail: row.customer_email,
      locale,
    })

    const unsubscribeUrl = getUnsubscribeUrl(row.customer_email)
    const outcome = await sendEmailWithRetry({
      from,
      to: row.customer_email,
      emailType: 'report_failed_apology',
      reportId,
      metadata: { plan: row.plan_code, retryCount, source },
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@jianyuan.life?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      subject,
      html,
    })

    if (!outcome.success) {
      try { await notifyEmailFailed(reportId, row.customer_email, outcome.error || 'apology send failed') } catch { /* ignore */ }
      return { sent: false, reason: outcome.error || 'send-failed' }
    }

    // 防重寄主防線 = email_send_log(上面查過);apology_sent_at 欄位建立後(migration 待老闆 apply)
    // 此 update 會開始生效、作為第二防線。欄位不存在時只 warn、不影響流程。
    const { error: updErr } = await supabase.from('paid_reports')
      .update({ apology_sent_at: new Date().toISOString() })
      .eq('id', reportId)
    if (updErr) console.warn('apology_sent_at 更新失敗(欄位尚未建立、migration 待 apply):', updErr.message)

    console.log(`📧 終局失敗致歉信已寄(${source}):${reportId.slice(0, 8)} → ${row.customer_email}`)
    return { sent: true, reason: 'ok' }
  } catch (e) {
    console.error('sendApologyIfFinalFailure 失敗(不阻塞):', e)
    return { sent: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 防重寄查詢:email_send_log 有無此報告的成功致歉信紀錄。
 * (metadata.report_id 由 sendEmailWithRetry → recordEmailSend 寫入)
 * 查詢失敗時保守回 true(寧可不寄、不可重複騷擾客戶)。
 * 已知接受風險(L4 Gemini P1、qaia 評極低):workflow 與 cron 同秒並發終局化同一報告
 * 有 TOCTOU 窄窗可能雙寄;正解 = email_send_log 加 partial unique index + claim-insert、
 * 需 migration、列入 add_apology_sent_at.sql 之後的 schema 批次。
 */
export async function hasApologyBeenSent(reportId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('email_send_log')
      .select('id')
      .eq('template', 'report_failed_apology')
      .eq('status', 'sent')
      .eq('metadata->>report_id', reportId)
      .limit(1)
    if (error) {
      console.warn('hasApologyBeenSent 查詢失敗(保守視為已寄):', error.message)
      return true
    }
    return (data?.length ?? 0) > 0
  } catch (e) {
    console.warn('hasApologyBeenSent 例外(保守視為已寄):', e)
    return true
  }
}
