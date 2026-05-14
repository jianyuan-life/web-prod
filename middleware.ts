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
import { getClientIp } from '@/lib/security/get-client-ip'
import { classifyUserAgent } from '@/lib/security/bot-detect'

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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ua = request.headers.get('user-agent')
  const ip = getClientIp(request)
  const now = Date.now()

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

  // 速率限制回應標頭
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Limit', String(maxPerMinute))
  response.headers.set('X-RateLimit-Remaining', String(Math.max(maxPerMinute - currentCount, 0)))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)))
  if (botMatch.category === 'seo') {
    response.headers.set('X-Bot-Category', 'seo')
  }
  return response
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
