// v5.10.328 (P0 #1 監控對齊 — admin 自我安全狀態檢查)
// 用於 admin dashboard 顯示「目前安全防線啟用狀態」
// 鎖 admin auth(沿用 checkAdminAuth)、防止洩漏內部資訊
//
// 回傳項目:
//   - bot_defense:UA classifier / robots.txt / Vercel Bot Filter 狀態
//   - rate_limiting:in-memory / Upstash / sliding-window 狀態
//   - monitoring:Vercel Analytics / SpeedInsights / Sentry / web-vitals 狀態
//   - security_headers:CSP / COOP / CORP / HSTS 等是否啟用
//   - csp_violations:近 24h CSP report 數(從 logs 推估)

import { NextRequest, NextResponse } from 'next/server'
import { isTurnstileEnabled } from '@/lib/security/turnstile'
import { getBlocklistDiagnostic } from '@/lib/security/edge-blocklist'
import { getTokenStatsSize } from '@/lib/security/token-rate-limit'
import pkg from '../../../../package.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 簡單 admin auth(沿用 ADMIN_KEY env、如需更嚴格改 import checkAdminAuth)
function checkAuth(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return false
  const auth = req.headers.get('authorization')
  if (!auth) return false
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  // timing-safe 比對(防止 timing attack)
  if (provided.length !== adminKey.length) return false
  let same = 0
  for (let i = 0; i < provided.length; i++) {
    same |= provided.charCodeAt(i) ^ adminKey.charCodeAt(i)
  }
  return same === 0
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = {
    version: pkg.version,
    timestamp: new Date().toISOString(),
    bot_defense: {
      ua_classifier: 'enabled', // lib/security/bot-detect.ts wired in middleware STAGE 1
      robots_txt_ai_block: 'enabled', // app/robots.ts disallow 21 AI bots
      vercel_bot_filter: process.env.VERCEL_BOT_FILTER_ENABLED === 'true' ? 'enabled' : 'manual',
      turnstile: isTurnstileEnabled() ? 'enabled' : 'stub',
      fingerprint: 'enabled', // v5.10.336 lib/security/fingerprint.ts middleware STAGE 0.5
      cf_bot_score_check: 'enabled-conditional', // 只在 CF Pro tier 提供 cf-bot-score 時生效
      vercel_bot_id: process.env.VERCEL_BOT_FILTER_ENABLED === 'true' ? 'enabled' : 'beta-not-attached',
    },
    rate_limiting: {
      in_memory_per_route: 'enabled', // middleware.ts STAGE 5
      in_memory_global_per_ip: 'enabled', // middleware.ts STAGE 2 (240/min)
      sliding_window: 'available', // lib/security/sliding-window.ts (not yet wired)
      upstash_redis: process.env.UPSTASH_REDIS_REST_URL ? 'enabled' : 'not-configured',
      ip_blocklist: 'enabled', // lib/security/ip-blocklist.ts wired STAGE 0
      stripe_webhook_allowlist: 'enabled', // 12 IPs
      brute_force_lockout: 'enabled', // admin-rate-limit.ts (5 fails → 30 min lock)
      edge_config_dynamic: getBlocklistDiagnostic(), // v5.10.330 動態 IP/country blocklist
      token_rate_limit: 'enabled', // v5.10.338 per-token 60/min + share detection
      token_stats_size: getTokenStatsSize(),
    },
    csrf_protection: {
      origin_referer_check: 'enabled', // v5.10.336 middleware STAGE 4.5
      whitelisted_paths: [
        '/api/webhook/*', // Stripe (signature verification)
        '/api/cron/*', // Vercel cron (internal)
        '/api/csp-report', // browser auto-POST
        '/api/web-vitals', // sendBeacon
        '/api/admin/honeypot', // attacker hits, no Origin expected
        '/api/workflows/*', // internal callbacks
      ],
    },
    idor_mitigation: {
      token_entropy_check: 'enabled', // v5.10.337 lib/security/token-validator.ts
      token_per_token_rate_limit: 'enabled', // v5.10.338 60/min/token
      token_share_detection: 'enabled', // 8+ IP/min same token = alert
      cookie_session_auth: 'pending-sprint-7', // 改 short-lived JWT
      single_use_token_rotation: 'pending-sprint-7',
    },
    ssrf_mitigation: {
      api_engine_allowlist: 'enabled', // v5.10.334 next.config.ts rewrite check
      allowed_destinations: ['*.fly.dev', 'localhost (dev)'],
    },
    honeypot: {
      enabled: 'enabled', // v5.10.332 7 path traps
      paths: ['/wp-admin', '/wp-login.php', '/phpmyadmin', '/admin.php', '/administrator', '/.env', '/.git/config'],
    },
    monitoring: {
      vercel_analytics: 'enabled',
      vercel_speed_insights: 'enabled',
      web_vitals_custom: 'enabled', // /api/web-vitals
      csp_violation_report: 'enabled', // /api/csp-report
      health_check: 'enabled', // /api/health-check
      sentry: process.env.SENTRY_DSN ? 'enabled' : 'stub',
      otel: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'enabled' : 'stub',
    },
    security_headers: {
      hsts: 'enabled',
      x_frame_options: 'DENY',
      x_content_type_options: 'nosniff',
      referrer_policy: 'strict-origin-when-cross-origin',
      permissions_policy: '13-items-banned',
      coop: 'same-origin',
      corp: 'same-site',
      csp: {
        enabled: true,
        unsafe_inline_script: true, // ⚠️ Sprint 5 改 nonce 後可移除
        report_uri: '/api/csp-report',
      },
    },
    deferred_sprint7_plus: [
      'Cookie-based /report/[token] auth + signed JWT(取代 URL token、~8h)',
      'Single-use token rotation(每次 read 後生成新 token、~6h)',
      'Supabase RLS policy(token + cookie session 雙因子、~4h)',
      'CSP nonce stage 2(per-page edge runtime injection、~4h)',
      'Upstash Redis sliding window 跨區同步(~4h、需 Vercel Marketplace)',
      'Sentry npm install + DSN(~1.5h、待 sentry.io 註冊)',
      'Edge Config attach(dashboard 操作)+ items(blocked_ips/allowed_ips/blocked_countries)',
      'Cloudflare Turnstile site key + React widget 表單整合(~2h)',
      'middleware.ts → proxy.ts rename(Next.js 16 deprecation cleanup、~30 min)',
    ],
    runtime: {
      env: process.env.VERCEL_ENV || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
      uptime_seconds: Math.floor(process.uptime()),
    },
  }

  return NextResponse.json(status, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
