// Email 送達紀錄 helper（L7+ 2026-04-17）
//
// 每次透過 Resend 發信前/後呼叫本函式，寫入 email_send_log 供後台追蹤。
// 對應 migration：supabase/migrations/create_email_send_log.sql

import { createClient } from '@supabase/supabase-js'

export type EmailType =
  | 'report_ready'
  | 'report_failed_apology'
  | 'referral_reward'
  | 'refund_notice'
  | 'welcome'
  | 'password_reset'
  | 'weekly_digest'
  | 'admin_alert'
  | 'feedback_reminder'   // T12b v5.10.370 — 反饋提醒 cron
  | 'followup_email'      // T12b v5.10.370 — 後續推銷 cron
  | 'checkout_receipt'    // T12b v5.10.370 — 結帳通知
  | 'stripe_webhook'      // T12b v5.10.370 — Stripe webhook 通知
  | 'report_link'         // T12b v5.10.370 — 報告連結寄送(generate-report)
  | 'other'

export type EmailLogInput = {
  resendId?: string | null
  toEmail: string
  fromEmail?: string
  emailType: EmailType
  subject: string
  reportId?: string | null
  userId?: string | null
  status?: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export async function recordEmailSend(input: EmailLogInput): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const supabase = createClient(url, key)

    // v5.3.32：schema drift 修復
    //   實際 schema：recipient(NOT NULL), subject, template, resend_id,
    //               status(default 'sent'), error_message, metadata(jsonb)
    //   to_email → recipient；email_type → template；from_email/report_id/user_id 塞 metadata
    const metadata: Record<string, unknown> = {
      ...(input.metadata || {}),
      from_email: input.fromEmail || 'noreply@jianyuan.life',
    }
    if (input.reportId) metadata.report_id = input.reportId
    if (input.userId) metadata.user_id = input.userId

    await supabase.from('email_send_log').insert({
      recipient: input.toEmail,
      subject: input.subject,
      template: input.emailType,
      resend_id: input.resendId || null,
      status: input.status || 'sent',
      error_message: input.errorMessage || null,
      metadata,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-send-log] 寫入失敗:', err)
  }
}
