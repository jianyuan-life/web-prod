// v5.10.325 (P0 #1 監控對齊)
// 公開健康檢查 endpoint — 供 Vercel cron / UptimeRobot / Pingdom 監控
// 故意不接 Supabase / Stripe / Anthropic 等外部依賴(避免 cascade failure)
// 只回 process uptime + 版本 + memory + region

import { NextResponse } from 'next/server'
import pkg from '../../../package.json'

export const runtime = 'nodejs'
// 不要快取(每次必須真實檢查)
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // v5.10.333 (Codex L3 P2 修):縮減公開資訊、避免 fingerprint
  // 公開請求只回 status + timestamp;附 ?detailed=1 + ADMIN_KEY 才回完整
  const url = new URL(req.url)
  const wantDetailed = url.searchParams.get('detailed') === '1'
  const adminKey = process.env.ADMIN_KEY
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const isAdmin = wantDetailed && adminKey && auth === adminKey

  if (isAdmin) {
    const memoryUsage = process.memoryUsage()
    return NextResponse.json(
      {
        status: 'ok',
        version: pkg.version,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        memory: {
          rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
          heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        },
        region: process.env.VERCEL_REGION || 'local',
        env: process.env.VERCEL_ENV || 'development',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Health-Check': 'ok' },
      },
    )
  }

  // 公開:最小化(僅 status + 時間戳)
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Health-Check': 'ok' },
    },
  )
}

// 也支援 HEAD(uptime monitor 多用 HEAD 省 bandwidth)
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-Health-Check': 'ok',
      'X-Version': pkg.version,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
