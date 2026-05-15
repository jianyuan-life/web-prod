// T12 v5.10.361 (Master Plan Sprint 7、stability sub-agent P1 #18):
// Resend send 統一 retry + dead-letter wrapper
//
// 為什麼:
// - Resend API 可能 5xx / timeout / rate limit
// - 7 處 production code 各自 new Resend + send、無 retry
// - 失敗了客戶看不到報告 ready email、客服不知道
//
// 設計:
// - retry 3 次(指數 backoff:2s / 5s / 12s)
// - 全失敗 → 寫進 email_send_log status='failed' + audit-event critical(dead-letter)
// - 不阻塞 caller(catch 全部、回 result 不 throw)

import { Resend } from 'resend'
import { recordEmailSend, type EmailType } from './email-send-log'

export interface SendEmailParams {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  emailType: EmailType
  reportId?: string | null
  userId?: string | null
  /** 額外 metadata 寫進 email_send_log */
  metadata?: Record<string, unknown>
  /** T12b v5.10.370 新增 — Resend headers(List-Unsubscribe / Gmail/Yahoo bulk sender 硬要求) */
  headers?: Record<string, string>
  /** T12b v5.10.370 新增 — 單次 attempt timeout(預設 30000ms、避免 Resend hang 拖垮 workflow) */
  timeoutMs?: number
}

export interface SendEmailResult {
  success: boolean
  resendId?: string
  attempts: number
  error?: string
}

const MAX_RETRIES = 3
const BACKOFF_MS = [2000, 5000, 12000]  // 2s / 5s / 12s

let _resendClient: Resend | null = null

function getResend(): Resend {
  if (!_resendClient) {
    _resendClient = new Resend(process.env.RESEND_API_KEY || '')
  }
  return _resendClient
}

/**
 * T12:Resend send + retry 3 次 + dead-letter
 *
 * 用法(取代 7 處散落 new Resend + send):
 *   const result = await sendEmailWithRetry({
 *     from, to, subject, html, emailType: 'report_ready', reportId
 *   })
 *   if (!result.success) {
 *     // 已 dead-letter + audit-event critical 上報、caller 無需自己處理
 *   }
 */
export async function sendEmailWithRetry(params: SendEmailParams): Promise<SendEmailResult> {
  const resend = getResend()
  let lastError: string = ''
  // T12b v5.10.370:單次 attempt timeout(預設 30s、防 Resend hang)
  const timeoutMs = params.timeoutMs ?? 30000

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 包 Promise.race 加 timeout、避免 Resend API 卡住
      const sendPayload: Parameters<typeof resend.emails.send>[0] = {
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }
      // T12b v5.10.370:傳遞 headers(List-Unsubscribe 用)
      if (params.headers) {
        (sendPayload as { headers?: Record<string, string> }).headers = params.headers
      }
      const sendPromise = resend.emails.send(sendPayload)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Resend API 超時(${timeoutMs}ms)`)), timeoutMs),
      )
      const { data, error } = await Promise.race([sendPromise, timeoutPromise])

      if (error) {
        lastError = `${error.name || 'unknown'}: ${error.message || String(error)}`
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
          continue
        }
      } else if (data?.id) {
        // 成功
        await recordEmailSend({
          resendId: data.id,
          toEmail: params.to,
          fromEmail: params.from,
          emailType: params.emailType,
          subject: params.subject,
          reportId: params.reportId,
          userId: params.userId,
          status: 'sent',
          metadata: { ...params.metadata, attempts: attempt },
        })
        return { success: true, resendId: data.id, attempts: attempt }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
      }
    }
  }

  // T12:全 retry 失敗 → dead-letter
  await recordEmailSend({
    toEmail: params.to,
    fromEmail: params.from,
    emailType: params.emailType,
    subject: params.subject,
    reportId: params.reportId,
    userId: params.userId,
    status: 'failed',
    errorMessage: lastError,
    metadata: { ...params.metadata, attempts: MAX_RETRIES, dead_letter: true },
  })

  // 上報 audit-event critical(若 sentry-prod 已 wired 會直送 Sentry)
  try {
    const { logAuditEvent, makeAuditEvent } = await import('./security/audit-event')
    logAuditEvent(makeAuditEvent('email-send-failed', {
      ip: 'server',
      reason: 'resend-send-failed-after-retries',
      severity: 'critical',
      details: {
        to: params.to,
        emailType: params.emailType,
        reportId: params.reportId,
        attempts: MAX_RETRIES,
        lastError,
      },
    }))
  } catch {
    /* audit-event 失敗也不阻塞 caller */
  }

  console.error('[resend-helper][DEAD-LETTER]', JSON.stringify({
    to: params.to,
    emailType: params.emailType,
    reportId: params.reportId,
    attempts: MAX_RETRIES,
    lastError,
  }))

  return { success: false, attempts: MAX_RETRIES, error: lastError }
}
