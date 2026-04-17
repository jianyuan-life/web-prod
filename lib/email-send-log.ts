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
    await supabase.from('email_send_log').insert({
      resend_id: input.resendId || null,
      to_email: input.toEmail,
      from_email: input.fromEmail || 'noreply@jianyuan.life',
      email_type: input.emailType,
      subject: input.subject,
      report_id: input.reportId || null,
      user_id: input.userId || null,
      status: input.status || 'sent',
      error_message: input.errorMessage || null,
      metadata: input.metadata || {},
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-send-log] 寫入失敗:', err)
  }
}
