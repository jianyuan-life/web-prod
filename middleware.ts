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
import { validateAccessToken } from '@/lib/security/token-validator'
import { checkTokenRateLimit } from '@/lib/security/token-rate-limit'
import { logAuditEvent, makeAuditEvent } from '@/lib/security/audit-event'

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

const BRANDED_ERROR_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

type BrandedErrorKind = 'forbidden' | 'rate-limited' | 'report-not-found'

const BRANDED_ERROR_COPY: Record<BrandedErrorKind, {
  eyebrow: string
  title: string
  body: string
  guidance: string
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
}> = {
  forbidden: {
    eyebrow: '存取受限',
    title: '這次無法開啟此頁',
    body: '系統已停止這次存取，以保護私人資料與服務穩定。請確認連結與網路環境後再試。',
    guidance: '若你正在使用自動化工具、代理服務或封鎖型瀏覽器擴充功能，請暫停後重新開啟。',
    primaryHref: '/',
    primaryLabel: '返回鑑源首頁',
  },
  'rate-limited': {
    eyebrow: '存取稍緩',
    title: '請稍候，再繼續',
    body: '短時間內收到較多請求，系統暫時放慢存取，以維持每份私人報告的穩定服務。',
    guidance: '請保留此頁，稍候一分鐘後再重新整理。重複送出不會加快處理。',
    primaryHref: '',
    primaryLabel: '重新整理此頁',
    secondaryHref: '/',
    secondaryLabel: '返回首頁',
  },
  'report-not-found': {
    eyebrow: '私人報告',
    title: '找不到這份私人報告',
    body: '這個連結可能不完整、已過期，或不是有效的私人報告入口。為保護報告內容，我們不會顯示更多連結細節。',
    guidance: '請從鑑源寄出的完整 Email 連結重新開啟，或登入查看你的報告清單。',
    primaryHref: '/dashboard',
    primaryLabel: '登入查看報告',
    secondaryHref: '/',
    secondaryLabel: '返回首頁',
  },
}

function isHtmlNavigation(request: NextRequest, pathname: string): boolean {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false

  const accept = request.headers.get('accept')?.toLowerCase() || ''
  const fetchMode = request.headers.get('sec-fetch-mode')?.toLowerCase()
  return accept.includes('text/html') || fetchMode === 'navigate'
}

function renderBrandedErrorPage(kind: BrandedErrorKind, status: 403 | 404 | 429): string {
  const copy = BRANDED_ERROR_COPY[kind]
  const secondaryAction = copy.secondaryHref && copy.secondaryLabel
    ? `<a class="action action-secondary" href="${copy.secondaryHref}">${copy.secondaryLabel}</a>`
    : ''

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${copy.title}｜鑑源</title>
  <style>
    :root { color-scheme: dark; --canvas:#080b12; --surface:#111925; --ink:#f4efe6; --muted:#bec4ce; --gold:#d5b261; --line:rgba(213,178,97,.28); }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--canvas); }
    body { min-height: 100vh; margin: 0; color: var(--ink); background: radial-gradient(circle at 50% -10%, #1b2637 0, var(--canvas) 48%); font-family: "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif; }
    main { min-height: 100vh; display: grid; place-items: center; padding: clamp(1.25rem,4vw,3rem); }
    .dossier { position: relative; width: min(46rem,100%); overflow: hidden; border: 1px solid var(--line); background: linear-gradient(145deg,rgba(17,25,37,.98),rgba(9,14,23,.98)); box-shadow: 0 2rem 5rem rgba(0,0,0,.34); }
    .dossier::before { content:""; position:absolute; inset:0 auto 0 0; width:3px; background:linear-gradient(180deg,transparent,var(--gold) 24%,var(--gold) 76%,transparent); }
    .inner { display:grid; grid-template-columns: 9rem 1fr; gap: clamp(1.5rem,5vw,3.5rem); padding: clamp(2rem,7vw,4.5rem); }
    .seal { position:relative; display:grid; place-items:center; width:8rem; height:8rem; margin-top:.25rem; border:1px solid var(--line); border-radius:50%; color:var(--gold); font: 500 1.5rem/1 Georgia,"Times New Roman",serif; letter-spacing:.12em; }
    .seal::before,.seal::after { content:""; position:absolute; border-radius:50%; }
    .seal::before { inset:.55rem; border:1px solid rgba(213,178,97,.48); }
    .seal::after { inset:50% -1rem auto; border-top:1px solid rgba(213,178,97,.2); transform:rotate(-24deg); }
    .eyebrow { margin:0 0 .9rem; color:var(--gold); font-size:.78rem; font-weight:700; letter-spacing:.22em; }
    h1 { margin:0; max-width:13ch; font-family:"Noto Serif TC","Source Han Serif TC","Songti TC",serif; font-size:clamp(2rem,6vw,3.3rem); font-weight:600; line-height:1.18; letter-spacing:.025em; }
    .body { margin:1.4rem 0 0; max-width:34rem; color:var(--muted); font-size:1.04rem; line-height:1.85; }
    .guidance { margin:1.25rem 0 0; padding-top:1.25rem; border-top:1px solid var(--line); color:#d9d5cd; font-size:.94rem; line-height:1.75; }
    .actions { display:flex; flex-wrap:wrap; gap:.75rem; margin-top:1.8rem; }
    .action { min-height:2.75rem; display:inline-flex; align-items:center; justify-content:center; padding:.7rem 1.15rem; border:1px solid transparent; color:#14110b; background:var(--gold); font-weight:700; text-decoration:none; }
    .action-secondary { color:var(--ink); border-color:var(--line); background:transparent; }
    .action:focus-visible { outline:3px solid #91c7ff; outline-offset:3px; }
    .footer { display:flex; justify-content:space-between; gap:1rem; padding:1rem clamp(2rem,7vw,4.5rem); border-top:1px solid var(--line); color:#8f98a6; font-size:.76rem; letter-spacing:.08em; }
    @media (max-width: 38rem) {
      .inner { grid-template-columns:1fr; }
      .seal { width:5.25rem; height:5.25rem; font-size:1rem; }
      .actions { align-items:stretch; flex-direction:column; }
      .action { width:100%; }
      .footer { align-items:flex-start; flex-direction:column; }
    }
    @media (forced-colors: active) { .dossier,.seal,.action { border:1px solid CanvasText; } }
  </style>
</head>
<body>
  <main aria-labelledby="error-title">
    <section class="dossier" aria-describedby="error-description error-guidance">
      <div class="inner">
        <div class="seal" aria-hidden="true">${status}</div>
        <div>
          <p class="eyebrow">鑑源 · ${copy.eyebrow}</p>
          <h1 id="error-title">${copy.title}</h1>
          <p class="body" id="error-description">${copy.body}</p>
          <p class="guidance" id="error-guidance">${copy.guidance}</p>
          <nav class="actions" aria-label="後續操作">
            <a class="action" href="${copy.primaryHref}">${copy.primaryLabel}</a>
            ${secondaryAction}
          </nav>
        </div>
      </div>
      <footer class="footer"><span>Jianyuan Private Advisory</span><span>錯誤代碼 ${status}</span></footer>
    </section>
  </main>
</body>
</html>`
}

function brandedPageErrorResponse(
  request: NextRequest,
  pathname: string,
  kind: BrandedErrorKind,
  status: 403 | 404 | 429,
  existingHeaders: Record<string, string>,
): NextResponse | null {
  if (!isHtmlNavigation(request, pathname)) return null

  const headers = new Headers(existingHeaders)
  headers.set('Content-Type', 'text/html')
  headers.set('Content-Security-Policy', BRANDED_ERROR_CSP)
  return new NextResponse(renderBrandedErrorPage(kind, status), { status, headers })
}

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
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Geo-Block': country || 'unknown',
      'Cache-Control': 'no-store',
    }
    const pageResponse = brandedPageErrorResponse(
      request,
      pathname,
      'forbidden',
      403,
      responseHeaders,
    )
    if (pageResponse) return pageResponse

    return new NextResponse(JSON.stringify({ error: 'Access denied (geo)' }), {
      status: 403,
      headers: responseHeaders,
    })
  }
  if (await isEdgeBlockedIp(ip)) {
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-IP-Block': 'edge-config',
      'Cache-Control': 'no-store',
    }
    const pageResponse = brandedPageErrorResponse(
      request,
      pathname,
      'forbidden',
      403,
      responseHeaders,
    )
    if (pageResponse) return pageResponse

    return new NextResponse(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: responseHeaders,
    })
  }
  // v5.10.333(Codex L3 P0 #2 修):白名單只繞 rate limit、不繞 bot classifier / noindex / 安全 header
  // 原邏輯:`if (allowed) return next()` → Stripe IP 也跳過 bot 檢查、若有 IP spoofing 攻擊就完蛋
  // 新邏輯:設 flag、繼續走完所有 STAGE、只在 STAGE 5 rate limit 階段 skip
  const isWhitelisted = (await isEdgeAllowedIp(ip)) || classifyTraffic(ip, request) === 'allow'

  // ────────────────────────────────────────────────────────
  // STAGE 0:IP 黑/白名單 hardcode fallback(已被 STAGE -1 包進、保留作 defense in depth)
  // ────────────────────────────────────────────────────────
  const trafficClass = classifyTraffic(ip, request)
  if (trafficClass === 'block') {
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-IP-Block': 'hardcode',
      'Cache-Control': 'no-store',
    }
    const pageResponse = brandedPageErrorResponse(
      request,
      pathname,
      'forbidden',
      403,
      responseHeaders,
    )
    if (pageResponse) return pageResponse

    return new NextResponse(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: responseHeaders,
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
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Bot-Block': 'fingerprint',
      'X-Bot-Score-CF': String(fingerprint.cfBotScore ?? ''),
      'X-Bot-Score-Vercel': String(fingerprint.vercelBotScore ?? ''),
      'Cache-Control': 'no-store',
    }
    const pageResponse = brandedPageErrorResponse(
      request,
      pathname,
      'forbidden',
      403,
      responseHeaders,
    )
    if (pageResponse) return pageResponse

    return new NextResponse(JSON.stringify({ error: 'Access denied (bot)' }), {
      status: 403,
      headers: responseHeaders,
    })
  }

  // ────────────────────────────────────────────────────────
  // STAGE 1:Bot UA classifier(全路徑、不分 api/page)
  // ────────────────────────────────────────────────────────
  const botMatch = classifyUserAgent(ua)
  if (botMatch.hit && !botMatch.allow) {
    // AI 訓練爬蟲 / 攻擊型 scanner — 直接 403
    const responseHeaders = {
      'Content-Type': 'application/json',
      'X-Bot-Block': '1',
      'X-Bot-Category': botMatch.category,
      'X-Bot-Name': botMatch.name,
      'Cache-Control': 'no-store',
    }
    const pageResponse = brandedPageErrorResponse(
      request,
      pathname,
      'forbidden',
      403,
      responseHeaders,
    )
    if (pageResponse) return pageResponse

    return new NextResponse(
      JSON.stringify({
        error: 'Access denied',
        reason: botMatch.category,
      }),
      {
        status: 403,
        headers: responseHeaders,
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
      const responseHeaders = {
        'Retry-After': String(retry),
        'X-RateLimit-Scope': 'global',
        'X-RateLimit-Limit': String(GLOBAL_PER_MIN),
      }
      const pageResponse = brandedPageErrorResponse(
        request,
        pathname,
        'rate-limited',
        429,
        responseHeaders,
      )
      if (pageResponse) return pageResponse

      return NextResponse.json(
        { error: '請求過於頻繁、請稍後再試' },
        {
          status: 429,
          headers: responseHeaders,
        },
      )
    }
    globalEntry.count++
  } else {
    globalLimit.set(globalKey, { count: 1, resetTime: now + 60_000 })
  }

  // ────────────────────────────────────────────────────────
  // STAGE 2.5(v5.10.340 真修):/report/[token] token 驗證 + rate limit
  //   原因:在 page.tsx 用 notFound() Next.js streaming SSR 仍回 200(headers 已送)
  //   修補:middleware 直接 return 404 NextResponse、無 streaming 問題
  // ────────────────────────────────────────────────────────
  if (pathname.startsWith('/report/')) {
    const tokenMatch = pathname.match(/^\/report\/([^\/]+)/)
    if (tokenMatch) {
      const token = decodeURIComponent(tokenMatch[1])
      const tokenCheck = validateAccessToken(token)
      if (!tokenCheck.valid) {
        logAuditEvent(makeAuditEvent('token-invalid', {
          ip,
          country,
          pathname,
          userAgent: ua || undefined,
          reason: tokenCheck.reason,
          severity: 'warn',
          details: {
            tokenLength: token?.length || 0,
            entropy: tokenCheck.entropy,
          },
        }))
        // 直接 404、不洩漏「token format check」存在
        const responseHeaders = {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
          'X-Token-Reject': tokenCheck.reason || '1',
        }
        const pageResponse = brandedPageErrorResponse(
          request,
          pathname,
          'report-not-found',
          404,
          responseHeaders,
        )
        if (pageResponse) return pageResponse

        return new NextResponse(null, {
          status: 404,
          headers: responseHeaders,
        })
      }

      const rateResult = checkTokenRateLimit(token, ip)
      if (!rateResult.allowed) {
        logAuditEvent(makeAuditEvent('rate-limit-exceeded', {
          ip,
          country,
          pathname,
          severity: rateResult.uniqueIps >= 8 ? 'error' : 'warn',
          details: {
            scope: 'token',
            tokenPrefix: token.slice(0, 8) + '...',
            count: rateResult.count,
            uniqueIps: rateResult.uniqueIps,
          },
        }))
        const responseHeaders = {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
          'X-Token-Reject': 'rate-limit',
        }
        const pageResponse = brandedPageErrorResponse(
          request,
          pathname,
          'report-not-found',
          404,
          responseHeaders,
        )
        if (pageResponse) return pageResponse

        return new NextResponse(null, {
          status: 404, // 不回 429 避免洩 token 存在
          headers: responseHeaders,
        })
      }
    }
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
    pathname.startsWith('/api/workflows/') || // Workflow internal callbacks
    pathname === '/api/generate-report' // v5.10.349 hotfix:cron retry fallback、x-internal-secret 已驗、無需 CSRF

  // v5.10.342 (Codex round 2 P1 #2 修):敏感 endpoint 用 strict mode
  // /api/admin/*、/api/points/*、/api/referral/* → strict(必有 valid Origin、Referer 也驗)
  // 一般 API → 寬鬆(任一 valid 就 pass)
  const isSensitive =
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/points/') ||
    pathname.startsWith('/api/referral/') ||
    pathname.startsWith('/api/family-members') ||
    pathname.startsWith('/api/checkout')

  if (isStateChange && !isCsrfExempt) {
    const csrfResult = checkCsrf(request, isSensitive)
    if (!csrfResult.valid) {
      logAuditEvent(makeAuditEvent('csrf-block', {
        ip,
        country,
        pathname,
        method: request.method,
        userAgent: ua || undefined,
        reason: csrfResult.reason,
        severity: isSensitive ? 'error' : 'warn',
        details: {
          origin: csrfResult.origin,
          referer: csrfResult.referer,
          strict: isSensitive,
        },
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
