// ============================================================
// v5.10.466 D5(bizaudit P1):「completed 但完成信全失敗」無自動補寄 —
// 客戶付了錢、報告好了、卻永遠不知道(email_sent_at=null 沒有任何 cron 撈)。
// 本檔 = 輕量 fallback 通知信(短版、可靠優先;完整精美模板仍在 workflow
// sendReportEmail、此處刻意不重複那 300 行 HTML — 這是備援路徑)。
// 防重寄:DB durable claim + provider idempotency key + email_sent_at。
// ============================================================

import { sendEmailWithRetry } from '@/lib/resend-helper'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { createServiceClient } from '@/lib/supabase'
import { PLAN_NAMES } from '@/lib/plan-names'
import { buildAbsoluteReportUrl } from '@/lib/consultation/routes'
import { deliverClaimedCompletionEmail } from '@/lib/report/completion-email-delivery'

export async function sendCompletionEmailIfMissing(reportId: string, source: string): Promise<{ sent: boolean; reason: string }> {
  try {
    const supabase = createServiceClient()
    const { data: row, error: rowErr } = await supabase
      .from('paid_reports')
      .select('status, deleted_at, customer_email, email_sent_at, plan_code, access_token, birth_data, created_at, generation_progress')
      .eq('id', reportId)
      .single()
    if (rowErr) return { sent: false, reason: 'report-read-failed' }
    if (!row) return { sent: false, reason: 'not-found' }
    if (row.status !== 'completed') return { sent: false, reason: `status=${row.status}` }
    if (row.deleted_at) return { sent: false, reason: 'deleted' }
    if (row.email_sent_at) return { sent: false, reason: 'already-sent' }
    if (!row.customer_email || !row.access_token) return { sent: false, reason: 'no-email-or-token' }
    // Codex L3 P2 修:緩衝基準改「最後活動時間」而非 created_at —
    // C 方案生成 30-60 分鐘、翻 completed 時 created_at 早就 >15min、
    // 原判斷會在 workflow 正常寄信窗內搶跑 = 客戶收兩封。
    // progress_updated_at ≈ 完成時刻;完成後 30 分鐘內不碰(正常路徑 + retry 足夠跑完)。
    const gp = (row.generation_progress || {}) as Record<string, string>
    const lastActivity = gp.progress_updated_at || gp.started_at || row.created_at
    if (Date.now() - new Date(lastActivity).getTime() < 30 * 60 * 1000) return { sent: false, reason: 'too-fresh(完成後 30 分緩衝)' }

    // 防重寄第二防線:email_send_log 查 fallback 與正式完成信
    const { data: logs, error: logErr } = await supabase
      .from('email_send_log')
      .select('id')
      .in('template', ['report_completed_fallback', 'report_ready'])
      .eq('status', 'sent')
      .eq('metadata->>report_id', reportId)
      .limit(1)
    if (logErr) return { sent: false, reason: `log-check-failed(保守不寄): ${logErr.message}` }
    if ((logs?.length ?? 0) > 0) return { sent: false, reason: 'log-already-sent' }

    const planName = PLAN_NAMES[row.plan_code] || '命理報告'
    const isCN = typeof (row.birth_data as Record<string, unknown>)?.locale === 'string' && (row.birth_data as Record<string, unknown>).locale === 'zh-CN'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const reportUrl = buildAbsoluteReportUrl(siteUrl, row.plan_code, row.access_token)
    const subject = isCN ? `您的${planName}报告已完成` : `您的${planName}報告已完成`
    const brand = isCN ? '鉴 源' : '鑒 源'
    const cta = isCN ? '查看我的报告' : '查看我的報告'
    const body = isCN
      ? `您好，您的<strong style="color:#c9a84c;">${planName}</strong>报告已生成完成，点击下方按钮即可查看。报告会长期保存在您的帐号中。`
      : `您好，您的<strong style="color:#c9a84c;">${planName}</strong>報告已生成完成，點擊下方按鈕即可查看。報告會長期保存在您的帳號中。`

    const emailPayload = {
      from: isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>',
      to: row.customer_email,
      subject,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${brand}</div>
    </div>
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;">
      <p style="color:#d1d5db;font-size:15px;line-height:1.9;margin:0 0 20px 0;">${body}</p>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:1px;">${cta}</a>
      </div>
    </div>
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;margin-top:20px;">
      <p>© 2026 ${isCN ? '鉴源命理平台' : '鑒源命理平台'} · jianyuan.life</p>
      ${getUnsubscribeHtml(row.customer_email)}
    </div>
  </div>
</body></html>`,
    }
    const delivery = await deliverClaimedCompletionEmail(
      supabase,
      reportId,
      {
        ...emailPayload,
        emailType: 'report_ready',
        reportId,
        metadata: { plan: row.plan_code, source },
      },
      sendEmailWithRetry,
    )
    if (!delivery.sent) return { sent: false, reason: delivery.reason }

    console.log(`完成信 fallback 補寄已結案(${source}):${reportId.slice(0, 8)}`)
    return { sent: true, reason: 'ok' }
  } catch (e) {
    console.error('sendCompletionEmailIfMissing 失敗(不阻塞):', e)
    return { sent: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
