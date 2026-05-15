// T11 v5.10.360 (Master Plan Sprint 7、stability sub-agent P1 #20):
// client-side 統一上報 silent failure、取代散落 9 處 catch { /* 靜默 */ }
//
// 用法:
//   import { reportClientFailure } from '@/lib/security/client-audit'
//   try {
//     await fetch(...)
//   } catch (e) {
//     reportClientFailure('referral_register', e, { extra: 'context' })
//     // 不阻塞 UX、繼續往下
//   }
//
// 設計:
// - 用 sendBeacon 不阻塞 UI(若可用)、fallback fetch+keepalive
// - 上報 /api/error-report(T9 已建、edge runtime + audit-event helper)
// - 不 throw、catch 內部所有 error、絕不影響 client 主邏輯

const ERROR_REPORT_ENDPOINT = '/api/error-report'

export interface ClientFailureContext {
  /** 失敗來源(如 'referral_register' / 'feedback_submit')、便於 grep */
  source: string
  /** 額外 context、會 stringify */
  extra?: Record<string, unknown>
  /** 嚴重程度、預設 'warn' */
  severity?: 'info' | 'warn' | 'error' | 'critical'
}

/**
 * 上報 client-side silent failure(取代 catch 內靜默)
 *
 * @param source 失敗來源(grep-able)
 * @param error 原 error 物件 / message
 * @param context 額外 context
 */
export function reportClientFailure(
  source: string,
  error: unknown,
  context?: Omit<ClientFailureContext, 'source'>,
): void {
  if (typeof window === 'undefined') return  // SSR 不上報

  try {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined
    const payload = {
      ts: new Date().toISOString(),
      source,
      severity: context?.severity || 'warn',
      message: errMsg.slice(0, 500),
      stack: errStack?.split('\n').slice(0, 5).join(' | '),
      url: window.location.pathname,
      ua: navigator.userAgent.slice(0, 200),
      extra: context?.extra ? JSON.stringify(context.extra).slice(0, 1000) : undefined,
    }

    // 優先 sendBeacon(不阻塞 + 頁面 unload 也能送)
    if ('sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(ERROR_REPORT_ENDPOINT, blob)
      return
    }

    // Fallback fetch + keepalive
    fetch(ERROR_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* 上報失敗也靜默、不影響主邏輯 */
    })
  } catch {
    /* 連 sendBeacon 都失敗、放棄上報、不影響 client */
  }
}
