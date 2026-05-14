// v5.10.324 全方面強化
//   - 整合 lib/security/bot-detect classifier(攔 AI 訓練 bot + 攻擊 scanner)
//   - 改用 lib/security/get-client-ip 統一 IP 解析(消 3 處重複實作)
//   - 加 X-Bot-Block / X-Bot-Category 觀察 header
//   - 公開路徑(非 /api/)也跑 bot 分類、攻擊型 / AI scraper 直接 403
//
// 既有功能保留:
//   - /report/* /dashboard/* /jamie/* /auth/* 加 X-Robots-Tag noindex
//   - /api/* 速率限制(per-IP per-route per-minute、in-memory Map)
//   - /api/free-* 每日 30 次
//   - 推薦碼驗證 brute-force 鎖(5 次失敗 1 小時)
//   - Stripe webhook 白名單(120/min)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getClientIp, getClientContext } from '@/lib/security/get-client-ip'
import { classifyUserAgent } from '@/lib/security/bot-detect'
import { classifyTraffic } from '@/lib/security/ip-blocklist'
import { isEdgeBlockedIp, isEdgeAllowedIp, isBlockedCountry } from '@/lib/security/edge-blocklist'
import { checkCsrf } from '@/lib/security/csrf'
import { getFingerprint, shouldBlockByFingerprint } from '@/lib/security/fingerprint'

// 每分鐘速率限制
const rateLimit = new Map<string, { count: number; resetTime: number }>()

// 每日速率限制(免費工具每 IP 每天 30 次)
const dailyLimit = new Map<string, { count: number; resetTime: number }>()

// 全站每 IP 每分鐘 hard-cap(防 DDoS、不分 path)
const globalLimit = new Map<string, { count: number; resetTime: number }>()
const GLOBAL_PER_MIN = 240 // 一般用戶看 5-10 個頁面 + 內部 API/font/image 已含、240 充裕

// 推薦碼驗證失敗計數(防爆破)
const referralValidateFails = new Map<string, { fails: number; blockUntil: number }>()
const REFERRAL_BRUTEFORCE_THRESHOLD = 5
const REFERRAL_BRUTEFORCE_BLOCK_MS = 60 * 60 * 1000 // 1 小時

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  // v5.10.334(IA L2 半解修):用 getClientContext 統一過 trust filter、不再直接讀 cf-ipcountry / x-vercel-ip-country
  // 原問題:cf-ipcountry 沒驗 cf-ray 同存、attacker 可塞繞 geo block
  const { ip, country, userAgent: uaFromContext, trusted } = getClientContext(request)
  const ua = uaFromContext || request.headers.get('user-agent')
  const now = Date.now()

  // v5.10.334:unknown / untrusted IP(無任何 verified header)→ 不放行任何防線
  if (!trusted) {
    // 非生產環境、給 dev 方便、log 但放行
    if (process.env.VERCEL_ENV !== 'production') {
      console.warn('[middleware] untrusted request (no verified IP header) — allowing in non-prod')
    } else {
      // production:無 IP = 高度可疑、記 log 後仍放行(避免 false positive、但記錄供事後 audit)
      console.warn('[middleware] PROD untrusted request — no verified IP header from Vercel/CF/proxy')
    }
  }

  // ────────────────────────────────────────────────────────
  // STAGE -1:Edge Config 動態黑名單(Sprint 5、優先於 hardcode)
  //   - 國家層 geo block(Vercel x-vercel-ip-country header)
  //   - IP 層 Edge Config(秒級同步、無需 deploy)
  //   - Edge Config env 沒設 / 失敗 → 自動 fallback 到 STAGE 0 hardcode
  // ────────────────────────────────────────────────────────
  if (await isBlockedCountry(country)) {
    return new NextResponse(JSON.stringify({ error: 'Access denied (geo)' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Geo-Block': country || 'unknown',
        'Cache-Control': 'no-store',
      },
    })
  }
  if (await isEdgeBlockedIp(ip)) {
    return new NextResponse(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-IP-Block': 'edge-config',
        'Cache-Control': 'no-store',
      },
    })
  }
  // v5.10.333(Codex L3 P0 #2 修):白名單只繞 rate limit、不繞 bot classifier / noindex / 安全 header
  // 原邏輯:`if (allowed) return next()` → Stripe IP 也跳過 bot 檢查、若有 IP spoofing 攻擊就完蛋
  // 新邏輯:設 flag、繼續走完所有 STAGE、只在 STAGE 5 rate limit 階段 skip
  const isWhitelisted = (await isEdgeAllowedIp(ip)) || classifyTraffic(ip, ua) === 'allow'

  // ────────────────────────────────────────────────────────
  // STAGE 0:IP 黑/白名單 hardcode fallback(已被 STAGE -1 包進、保留作 defense in depth)
  // ────────────────────────────────────────────────────────
  const trafficClass = classifyTraffic(ip, ua)
  if (trafficClass === 'block') {
    return new NextResponse(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-IP-Block': 'hardcode',
        'Cache-Control': 'no-store',
      },
    })
  }

  // ────────────────────────────────────────────────────────
  // STAGE 0.5(v5.10.336 IA #2 修):Bot fingerprint(Cloudflare/Vercel header)
  //   - Cloudflare cf-bot-score < 30 + 非 verified bot → 403
  //   - x-vercel-bot-score < 30 → 403
  //   - 沒設這些 header(無邊緣 fingerprint)→ 略過、走 STAGE 1 UA 檢查
  // ────────────────────────────────────────────────────────
  const fingerprint = getFingerprint(request)
  if (shouldBlockByFingerprint(fingerprint)) {
    return new NextResponse(JSON.stringify({ error: 'Access denied (bot)' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Block': 'fingerprint',
        'X-Bot-Score-CF': String(fingerprint.cfBotScore ?? ''),
        'X-Bot-Score-Vercel': String(fingerprint.vercelBotScore ?? ''),
        'Cache-Control': 'no-store',
      },
    })
  }

  // ────────────────────────────────────────────────────────
  // STAGE 1:Bot UA classifier(全路徑、不分 api/page)
  // ────────────────────────────────────────────────────────
  const botMatch = classifyUserAgent(ua)
  if (botMatch.hit && !botMatch.allow) {
    // AI 訓練爬蟲 / 攻擊型 scanner — 直接 403
    return new NextResponse(
      JSON.stringify({
        error: 'Access denied',
        reason: botMatch.category,
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Block': '1',
          'X-Bot-Category': botMatch.category,
          'X-Bot-Name': botMatch.name,
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  // ────────────────────────────────────────────────────────
  // STAGE 2:全站 IP hard-cap(防單 IP 短時間 240+ 請求)
  // ────────────────────────────────────────────────────────
  const globalKey = `global:${ip}`
  const globalEntry = globalLimit.get(globalKey)
  if (globalEntry && now < globalEntry.resetTime) {
    if (globalEntry.count >= GLOBAL_PER_MIN) {
      const retry = Math.ceil((globalEntry.resetTime - now) / 1000)
      return NextResponse.json(
        { error: '請求過於頻繁、請稍後再試' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retry),
            'X-RateLimit-Scope': 'global',
            'X-RateLimit-Limit': String(GLOBAL_PER_MIN),
          },
        },
      )
    }
    globalEntry.count++
  } else {
    globalLimit.set(globalKey, { count: 1, resetTime: now + 60_000 })
  }

  // ────────────────────────────────────────────────────────
  // STAGE 3:私密路徑加 noindex / no-cache header
  // ────────────────────────────────────────────────────────
  const isPrivatePath =
    pathname.startsWith('/report/') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/jamie') ||
    pathname.startsWith('/auth/')

  if (isPrivatePath) {
    const response = NextResponse.next()
    response.headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate',
    )
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set(
      'Cache-Control',
      'private, no-store, no-cache, must-revalidate, max-age=0',
    )
    if (botMatch.category !== 'unknown') {
      response.headers.set('X-Bot-Category', botMatch.category)
    }
    return response
  }

  // ────────────────────────────────────────────────────────
  // STAGE 4:非 API 路徑直接放行(已通過 bot + global limit)
  // ────────────────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // ────────────────────────────────────────────────────────
  // STAGE 4.5(v5.10.336 IA #3 修):CSRF protection for state-change methods
  //   - POST/PUT/DELETE/PATCH 必驗 Origin/Referer
  //   - Whitelist:webhook(Stripe 等)+ cron(Vercel 內部)+ csp-report + web-vitals(beacon API 可能無 Origin)
  // ────────────────────────────────────────────────────────
  const isStateChange = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)
  const isCsrfExempt =
    pathname.startsWith('/api/webhook/') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/csp-report' ||
    pathname === '/api/web-vitals' ||
    pathname.startsWith('/api/admin/honeypot') ||
    pathname.startsWith('/api/workflows/') // Workflow internal callbacks

  if (isStateChange && !isCsrfExempt) {
    const csrfResult = checkCsrf(request, false)
    if (!csrfResult.valid) {
      console.warn('[CSRF-BLOCK]', JSON.stringify({
        ts: new Date().toISOString(),
        ip,
        pathname,
        method: request.method,
        reason: csrfResult.reason,
        origin: csrfResult.origin,
        referer: csrfResult.referer,
      }))
      return new NextResponse(
        JSON.stringify({ error: 'CSRF check failed', reason: csrfResult.reason }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Block': csrfResult.reason || '1',
            'Cache-Control': 'no-store',
          },
        },
      )
    }
  }

  // ────────────────────────────────────────────────────────
  // STAGE 5:API per-IP per-path 速率限制
  // ────────────────────────────────────────────────────────
  const path = pathname
  const key = `${ip}:${path}`

  // 根據路徑決定每分鐘上限
  let maxPerMinute = 30
  let isFreeApi = false

  if (path.startsWith('/api/free-')) {
    maxPerMinute = 5
    isFreeApi = true
  } else if (path.includes('generate-report') || path.includes('workflows')) {
    maxPerMinute = 2
  } else if (path.includes('search-reports')) {
    maxPerMinute = 10
  } else if (
    path.startsWith('/api/referral/validate') ||
    path.startsWith('/api/referral/register')
  ) {
    maxPerMinute = 10
  } else if (path.startsWith('/api/points/transfer')) {
    maxPerMinute = 5
  } else if (path.startsWith('/api/ab-events')) {
    maxPerMinute = 120
  } else if (path === '/api/webhook/stripe' || path.startsWith('/api/webhook/stripe')) {
    maxPerMinute = 120
    console.info(`[rate-limit] Stripe webhook 套用白名單 120/min(ip=${ip})`)
  }

  // 推薦碼驗證 brute force 封鎖檢查
  if (path.startsWith('/api/referral/validate')) {
    const bfKey = `${ip}:referral-validate`
    const bf = referralValidateFails.get(bfKey)
    if (bf && bf.blockUntil > now) {
      const retry = Math.ceil((bf.blockUntil - now) / 1000)
      return NextResponse.json(
        { error: '驗證失敗次數過多、請稍後再試' },
        {
          status: 429,
          headers: { 'Retry-After': String(retry) },
        },
      )
    }
  }

  // v5.10.333(Codex P0 #2 修):白名單 IP 在這裡才 skip rate limit、其他 STAGE 仍跑
  if (isWhitelisted) {
    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Bypass', 'whitelist')
    return response
  }

  // 每分鐘速率檢查
  const entry = rateLimit.get(key)
  let currentCount = 1
  let resetTime = now + 60_000

  if (entry && now < entry.resetTime) {
    if (entry.count >= maxPerMinute) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
      return NextResponse.json(
        { error: '請求過於頻繁、請稍後再試' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxPerMinute),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
            'X-RateLimit-Scope': 'per-route',
          },
        },
      )
    }
    entry.count++
    currentCount = entry.count
    resetTime = entry.resetTime
  } else {
    rateLimit.set(key, { count: 1, resetTime: now + 60_000 })
  }

  // 免費工具每日 30 次限制
  if (isFreeApi) {
    const dailyKey = `${ip}:free:daily`
    const dailyEntry = dailyLimit.get(dailyKey)
    const oneDayMs = 86_400_000
    if (dailyEntry && now < dailyEntry.resetTime) {
      if (dailyEntry.count >= 30) {
        return NextResponse.json(
          { error: '今日免費使用次數已達上限、請明天再試' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((dailyEntry.resetTime - now) / 1000)),
              'X-RateLimit-Limit': '30',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Scope': 'free-daily',
            },
          },
        )
      }
      dailyEntry.count++
    } else {
      dailyLimit.set(dailyKey, { count: 1, resetTime: now + oneDayMs })
    }
  }

  // 定期清理過期 entries
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimit.entries()) {
      if (now > v.resetTime) rateLimit.delete(k)
    }
    for (const [k, v] of dailyLimit.entries()) {
      if (now > v.resetTime) dailyLimit.delete(k)
    }
    for (const [k, v] of globalLimit.entries()) {
      if (now > v.resetTime) globalLimit.delete(k)
    }
    for (const [k, v] of referralValidateFails.entries()) {
      if (now > v.blockUntil) referralValidateFails.delete(k)
    }
  }

  // v5.10.332 (Sprint 5 Gemini #5):CSP nonce stage 1 — 每請求 base64 nonce、set X-Nonce header
  // layout.tsx 透過 headers() 讀取、Sprint 5 stage 2 注入到所有 inline script 後可移 unsafe-inline
  const nonce = generateNonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  // 速率限制回應標頭 + nonce 透傳
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set('X-RateLimit-Limit', String(maxPerMinute))
  response.headers.set('X-RateLimit-Remaining', String(Math.max(maxPerMinute - currentCount, 0)))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)))
  response.headers.set('x-nonce', nonce)
  if (botMatch.category === 'seo') {
    response.headers.set('X-Bot-Category', 'seo')
  }
  return response
}

// v5.10.332:base64 URL-safe nonce(16 byte → 22 char)、CSP spec 推薦最小強度
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // base64 URL-safe(無 +/= 字元、避免 HTML entity 轉義)
  let str = ''
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i])
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export const config = {
  // v5.10.324:擴展到全站(所有 page + api、跑 bot classifier + global limit)
  // 例外:_next/static / _next/image / favicon / 字型 / 圖片 / scripts(不跑 middleware、cache 友好)
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon|fonts|images|scripts|icons|.*\\..*).*)',
    },
  ],
}
