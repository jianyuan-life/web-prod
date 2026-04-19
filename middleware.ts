// API 速率限制中間件 — 防止濫用燒 AI 費用 + 推薦系統反作弊
// 使用 in-memory Map：Vercel Edge 每個區域共用同一進程，
// 單實例內的 Map 已能有效防禦單一 IP 的短時間爆量請求。
// 對於分散式場景（多區域部署），可未來升級至 Upstash Redis。
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 每分鐘速率限制
const rateLimit = new Map<string, { count: number; resetTime: number }>()

// 每日速率限制（免費工具每 IP 每天 30 次）
const dailyLimit = new Map<string, { count: number; resetTime: number }>()

// 推薦碼驗證失敗計數（防爆破）— 單一 IP 連續失敗 5 次封鎖 1 小時
const referralValidateFails = new Map<string, { fails: number; blockUntil: number }>()
const REFERRAL_BRUTEFORCE_THRESHOLD = 5
const REFERRAL_BRUTEFORCE_BLOCK_MS = 60 * 60 * 1000 // 1 小時

// 從 Vercel/Cloudflare 取得真實 IP（按可靠度排序）
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // P0 隱私強化 (2026-04-19)：報告頁 / 儀表板 / 後台 / auth 路徑
  // 加 HTTP header 防止被索引（meta 標籤是第一層，header 是第二層，robots.txt 是第三層）
  // X-Robots-Tag 涵蓋所有爬蟲 + 還能控制非 HTML（圖片、PDF）的索引
  const isPrivatePath =
    pathname.startsWith('/report/') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/jamie') ||
    pathname.startsWith('/auth/')

  if (isPrivatePath) {
    const response = NextResponse.next()
    // noindex/nofollow/noarchive/nosnippet/noimageindex：對所有爬蟲
    response.headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate',
    )
    // 防止 referrer 洩漏 access_token URL 給第三方網站
    response.headers.set('Referrer-Policy', 'no-referrer')
    // 不讓瀏覽器 / CDN 快取（即使客戶登出或 token 失效後，不會被後人取得）
    response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0')
    return response
  }

  // 只對 API 路由做速率限制
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const ip = getClientIp(request)
  const path = pathname
  const key = `${ip}:${path}`
  const now = Date.now()

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
    // 推薦碼驗證：10/min（防爆破）
    maxPerMinute = 10
  } else if (path.startsWith('/api/points/transfer')) {
    // 積分贈與：5/min（防濫用）
    maxPerMinute = 5
  } else if (path.startsWith('/api/ab-events')) {
    // A/B 測試事件追蹤：每頁可能有多個 impression/click，放寬到 120/min
    maxPerMinute = 120
  } else if (path === '/api/webhook/stripe' || path.startsWith('/api/webhook/stripe')) {
    // Stripe webhook 白名單：大促/批量結帳時 Stripe 可能在同一分鐘送多個事件
    // (checkout.session.completed / payment_intent.succeeded / charge.succeeded 等)
    // 預設 30/min 會被 429 擋，造成客戶付款不入帳 + Stripe 自動重試風暴
    // 放寬到 120/min，且 Stripe 本身有簽名驗證（webhookSecret）防偽造，不怕被濫用
    maxPerMinute = 120
    console.info(`[rate-limit] Stripe webhook 套用白名單 120/min（ip=${ip}）`)
  }

  // 推薦碼驗證 brute force 封鎖檢查（先於速率限制，失敗 5 次封 1 小時）
  if (path.startsWith('/api/referral/validate')) {
    const bfKey = `${ip}:referral-validate`
    const bf = referralValidateFails.get(bfKey)
    if (bf && bf.blockUntil > now) {
      const retry = Math.ceil((bf.blockUntil - now) / 1000)
      return NextResponse.json(
        { error: '驗證失敗次數過多，請稍後再試' },
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
        { error: '請求過於頻繁，請稍後再試' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxPerMinute),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
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
          { error: '今日免費使用次數已達上限，請明天再試' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((dailyEntry.resetTime - now) / 1000)),
              'X-RateLimit-Limit': '30',
              'X-RateLimit-Remaining': '0',
            },
          },
        )
      }
      dailyEntry.count++
    } else {
      dailyLimit.set(dailyKey, { count: 1, resetTime: now + oneDayMs })
    }
  }

  // 定期清理過期 entries（約每 100 次請求清一次）
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimit.entries()) {
      if (now > v.resetTime) rateLimit.delete(k)
    }
    for (const [k, v] of dailyLimit.entries()) {
      if (now > v.resetTime) dailyLimit.delete(k)
    }
  }

  // 加上速率限制回應標頭，方便前端偵錯
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Limit', String(maxPerMinute))
  response.headers.set('X-RateLimit-Remaining', String(Math.max(maxPerMinute - currentCount, 0)))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)))
  return response
}

export const config = {
  // API 路由（速率限制）+ 隱私路徑（X-Robots-Tag header）
  matcher: [
    '/api/:path*',
    '/report/:path*',
    '/dashboard/:path*',
    '/jamie/:path*',
    '/auth/:path*',
  ],
}
