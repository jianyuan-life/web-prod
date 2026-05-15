// v5.10.345 (Sprint 6 收尾):統一安全事件 log 格式
// 取代散落各處的 console.warn('[SOMETHING]', JSON.stringify({...}))
// 統一格式 → Vercel logs / Datadog / Splunk 都好查、未來可路由到 Supabase 持久化

export type AuditEventType =
  | 'csrf-block' // CSRF Origin/Referer fail
  | 'bot-block' // UA classifier / fingerprint
  | 'ip-block' // hardcode + Edge Config 黑名單
  | 'geo-block' // 國家封鎖
  | 'rate-limit-exceeded' // global / per-route / per-token
  | 'token-invalid' // entropy / format / weak
  | 'token-share-detected' // 8+ IP/min 同 token
  | 'admin-auth-fail' // ADMIN_KEY mismatch
  | 'admin-auth-locked' // 5 fails → 30 min lock
  | 'honeypot-hit' // attacker scan /wp-admin etc
  | 'csp-violation' // browser CSP report
  | 'invalid-internal-request' // cron secret fail
  | 'turnstile-fail-closed' // production no secret
  | 'client-error' // T9 v5.10.353:client-side error.tsx 自動上報(L1+L4 抓 P1)
  | 'email-send-failed' // T12 v5.10.361:Resend send 失敗 3 次後 dead-letter

export interface AuditEvent {
  type: AuditEventType
  ts: string // ISO 8601
  ip?: string
  country?: string
  pathname?: string
  method?: string
  userAgent?: string
  reason?: string
  details?: Record<string, unknown>
  /** 嚴重程度:info / warn / error / critical */
  severity?: 'info' | 'warn' | 'error' | 'critical'
}

/**
 * 寫一條安全事件到 logs(後續可路由到 Supabase / Datadog)
 *
 * 命名 convention:console 輸出 `[AUDIT.<TYPE>]` prefix、便於 grep
 * Severity 對應:
 *   - info:正常事件(rate limit、bot 已知 SEO)
 *   - warn:可疑事件(CSP violation、honeypot 第 1 次)
 *   - error:單次攻擊(IP block、token invalid)
 *   - critical:多次攻擊 / production fail-closed(admin lock、turnstile fail)
 */
export function logAuditEvent(event: AuditEvent): void {
  const severity = event.severity || 'warn'
  const tag = `[AUDIT.${event.type.toUpperCase()}]`

  // log level 對應 console method
  const fn =
    severity === 'critical' || severity === 'error'
      ? console.error
      : severity === 'warn'
        ? console.warn
        : console.info

  fn(tag, JSON.stringify({
    ts: event.ts,
    severity,
    ip: event.ip,
    country: event.country,
    pathname: event.pathname,
    method: event.method,
    ua: event.userAgent?.slice(0, 200),
    reason: event.reason,
    ...event.details,
  }))

  // Sprint 7 階段:同步寫進 Supabase security_events table(若 table 存在)
  // 目前 stub、需 DB schema 建立後 wire
  // try {
  //   if (process.env.SUPABASE_SERVICE_ROLE_KEY && severity !== 'info') {
  //     // async fire-and-forget、不阻塞 middleware
  //     persistToSupabase(event).catch(() => {})
  //   }
  // } catch {}
}

/**
 * 快速建構 event(less typing)
 */
export function makeAuditEvent(
  type: AuditEventType,
  data: Omit<AuditEvent, 'type' | 'ts'>,
): AuditEvent {
  return {
    type,
    ts: new Date().toISOString(),
    ...data,
  }
}
