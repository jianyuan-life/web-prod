// v5.10.333 (Codex L3 P0 #1 修):防 IP header spoofing
// 原問題:盲信 x-real-ip / cf-connecting-ip / x-forwarded-for、attacker 可 spoof 繞 IP block + rate limit + 白名單
// 修補策略:
//   1. 優先用 Vercel 驗證過的 header(x-vercel-forwarded-for、x-vercel-ip-*)— 邊緣強制覆寫、不可偽造
//   2. cf-connecting-ip 必須配 cf-ray header 才信(證明真的經過 Cloudflare CDN)
//   3. x-real-ip 必須配 x-forwarded-host 等 proxy header 才信
//   4. x-forwarded-for 取「最右側」(最內層 proxy)、不取最左(client 可塞任意值)
//   5. 全部 fallback 為 'unknown'、middleware 拒絕信任 unknown IP

import type { NextRequest } from 'next/server'

/**
 * 從 proxy header 取得真實 client IP(優先序:reliability + 反 spoofing)
 *
 * 部署平台 trust matrix(v5.10.343 加 fingerprint 收緊、Codex round 2 P1 #1 修):
 * - Vercel:x-vercel-forwarded-for(邊緣強制覆寫、不可偽造、最高信任)
 * - Cloudflare:cf-connecting-ip(必同時有 cf-ray + cf-ipcountry、才證明真經 CF)
 * - 其他:x-real-ip(必同時有 x-forwarded-host + 主機名為 jianyuan.life、才信)
 * - 通用 fallback:x-forwarded-for 取最右(最內層 proxy)
 *
 * 不再信任「最左 x-forwarded-for」、單獨「cf-ray」(可被 hop-by-hop attacker 添加)
 */
export function getClientIp(request: NextRequest | Request): string {
  const headers =
    'headers' in request && typeof (request as NextRequest).headers.get === 'function'
      ? (request as NextRequest).headers
      : (request as Request).headers

  // 1. Vercel 驗證 header(最高信任度、邊緣強制覆寫)
  const vercelIp = headers.get('x-vercel-forwarded-for')
  if (vercelIp && vercelIp.trim()) {
    // x-vercel-forwarded-for 可能也是 comma-separated、取最左(Vercel 強制把真實 client 放最左)
    const ip = vercelIp.split(',')[0]?.trim()
    if (ip && ip !== 'unknown') return ip
  }

  // 2. Cloudflare 驗證(v5.10.343 收緊:必同時有 cf-ray + cf-ipcountry、才證明真經 CF)
  // 原問題:單獨 cf-ray 可被 hop-by-hop attacker 添加、不夠安全
  const cfRay = headers.get('cf-ray')
  const cfCountry = headers.get('cf-ipcountry')
  if (cfRay && cfCountry) {
    const cfIp = headers.get('cf-connecting-ip')
    if (cfIp && cfIp.trim()) return cfIp.trim()
  }

  // 3. x-real-ip 配 x-forwarded-host 才信(必為 jianyuan.life 才放行)
  // v5.10.343 收緊:host 必為 jianyuan.life / *.jianyuan.life、防內網 host header 攻擊
  const fwdHost = headers.get('x-forwarded-host')?.trim().toLowerCase()
  if (fwdHost && (fwdHost === 'jianyuan.life' || fwdHost.endsWith('.jianyuan.life'))) {
    const realIp = headers.get('x-real-ip')
    if (realIp && realIp.trim()) return realIp.trim()
  }

  // 4. fallback:x-forwarded-for 取最右(最內層 proxy 添加的、client 偽造的會被覆蓋)
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean)
    // 取最右(最後 proxy 看到的)、不取最左(client 可塞任意)
    const rightmost = parts[parts.length - 1]
    if (rightmost && rightmost !== 'unknown') return rightmost
  }

  return 'unknown'
}

/**
 * 取得 client context(IP + 國家 + UA)
 * country 改用 x-vercel-ip-country(Vercel 驗證) > cf-ipcountry(配 cf-ray) > unknown
 */
export function getClientContext(request: NextRequest | Request): {
  ip: string
  country: string
  userAgent: string
  trusted: boolean
} {
  const headers =
    'headers' in request && typeof (request as NextRequest).headers.get === 'function'
      ? (request as NextRequest).headers
      : (request as Request).headers

  const ip = getClientIp(request)

  // Country:Vercel 優先、然後 CF(配 cf-ray)
  let country = headers.get('x-vercel-ip-country')?.trim() || ''
  if (!country) {
    const cfRay = headers.get('cf-ray')
    if (cfRay) {
      country = headers.get('cf-ipcountry')?.trim() || ''
    }
  }
  if (!country) country = 'unknown'

  return {
    ip,
    country: country.toUpperCase(),
    userAgent: headers.get('user-agent') || '',
    trusted: ip !== 'unknown',
  }
}
