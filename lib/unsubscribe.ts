// ============================================================
// Email 退訂工具函式
// 產生退訂 token（HMAC-SHA256）和退訂連結
// ============================================================

import { createHmac } from 'crypto'

// 使用 CRON_SECRET 作為退訂 HMAC 密鑰（避免新增環境變數）
function getSecret(): string {
  return process.env.CRON_SECRET || process.env.STRIPE_WEBHOOK_SECRET || 'jianyuan-unsubscribe-fallback'
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
 */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  return token === expected
}

/**
 * 產生退訂連結
 */
export function getUnsubscribeUrl(email: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const token = generateUnsubscribeToken(email)
  return `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}

/**
 * 產生退訂 HTML 片段（插入在 Email 底部）
 */
export function getUnsubscribeHtml(email: string): string {
  const url = getUnsubscribeUrl(email)
  return `<p style="font-size:11px;color:#bbb;text-align:center;margin-top:20px;">如不想收到此類郵件，<a href="${url}" style="color:#999;">點此退訂</a></p>`
}
