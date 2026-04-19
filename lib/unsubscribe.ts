// ============================================================
// Email 退訂工具函式
// 產生退訂 token（HMAC-SHA256）和退訂連結
// ============================================================

import { createHmac, timingSafeEqual } from 'crypto'

// 使用 CRON_SECRET 作為退訂 HMAC 密鑰（避免新增環境變數）
// v5.3.34 修復：移除硬編碼 fallback secret — 若兩個 env 都沒設，直接 throw
//   原硬編碼 'jianyuan-unsubscribe-fallback' 的問題：部署 misconfig 時攻擊者能暴力算出所有人 token
function getSecret(): string {
  const s = process.env.CRON_SECRET || process.env.STRIPE_WEBHOOK_SECRET || ''
  if (!s) {
    throw new Error('[unsubscribe] CRON_SECRET / STRIPE_WEBHOOK_SECRET 皆未設定，無法產生 HMAC')
  }
  return s
}

/**
 * 產生退訂 token（email + secret 的 HMAC-SHA256 前 16 碼）
 */
export function generateUnsubscribeToken(email: string): string {
  const hmac = createHmac('sha256', getSecret())
  hmac.update(email.toLowerCase().trim())
  return hmac.digest('hex').slice(0, 16)
}

/**
 * 驗證退訂 token 是否正確
 * v5.3.34 修復：改用 timingSafeEqual 防時序攻擊（原本用 === 比對）
 *   長度相同才進 timingSafeEqual；不同長度先做等長假比對再回 false
 */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token || typeof token !== 'string') return false
  let expected: string
  try {
    expected = generateUnsubscribeToken(email)
  } catch {
    return false
  }
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // 等長假比對避免從時間差推出 expected 長度
    const dummy = Buffer.alloc(b.length)
    try { timingSafeEqual(dummy, b) } catch { /* noop */ }
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * 產生退訂連結
 * 若 secret 未設定則 throw（由呼叫端決定要不要 catch）
 */
export function getUnsubscribeUrl(email: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const token = generateUnsubscribeToken(email)
  return `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}

/**
 * 產生退訂 HTML 片段（插入在 Email 底部）
 * v5.3.34：若 secret 未設定時 silently 回空字串，避免中斷訂單確認信流程
 *   （Email 沒退訂連結雖不符 CAN-SPAM，但比「付款信發不出去」輕微）
 */
export function getUnsubscribeHtml(email: string): string {
  try {
    const url = getUnsubscribeUrl(email)
    return `<p style="font-size:11px;color:#bbb;text-align:center;margin-top:20px;">如不想收到此類郵件，<a href="${url}" style="color:#999;">點此退訂</a></p>`
  } catch (err) {
    console.warn('[unsubscribe] getUnsubscribeHtml 失敗，回空字串:', err instanceof Error ? err.message : String(err))
    return ''
  }
}
