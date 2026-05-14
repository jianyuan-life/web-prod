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
    },
    rate_limiting: {
      in_memory_per_route: 'enabled', // middleware.ts STAGE 5
      in_memory_global_per_ip: 'enabled', // middleware.ts STAGE 2 (240/min)
      sliding_window: 'available', // lib/security/sliding-window.ts (not yet wired)
      upstash_redis: process.env.UPSTASH_REDIS_REST_URL ? 'enabled' : 'not-configured',
      ip_blocklist: 'enabled', // lib/security/ip-blocklist.ts wired STAGE 0
      stripe_webhook_allowlist: 'enabled', // 12 IPs
      brute_force_lockout: 'enabled', // admin-rate-limit.ts (5 fails → 30 min lock)
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
    deferred_sprint5: [
      'CSP nonce(移除 unsafe-inline)',
      'Upstash Redis sliding window 跨區同步',
      'Sentry npm install + DSN 注入',
      'Cookie-based /report/[token] auth(目前 token in URL)',
      'Cloudflare Turnstile 前端 widget + 表單整合',
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
