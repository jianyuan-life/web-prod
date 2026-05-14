// v5.10.332 (Sprint 5 honeypot)
// 偽裝成 admin 登入 endpoint(常被 attacker 掃描的 path、如 wp-admin / phpmyadmin / .env)
// 任何 IP 命中 = 自動加 internal blocklist + 寫進 logs
//
// 路徑:Vercel.json 加 rewrite 把以下路徑全 route 到本檔
//   /wp-admin → /api/admin/honeypot?trap=wp-admin
//   /phpmyadmin → /api/admin/honeypot?trap=phpmyadmin
//   /.env → /api/admin/honeypot?trap=env
//   /admin → /api/admin/honeypot?trap=admin
//   /administrator → /api/admin/honeypot?trap=administrator
//
// 回傳 200 with 假 login 表單 HTML(讓 scanner 認為「成功」、繼續嘗試其他 endpoint、消耗其資源)

import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/security/get-client-ip'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// In-memory honeypot hit tracker(單區域、cron 定期 dump 進 Edge Config)
const honeypotHits = new Map<string, { count: number; firstSeen: number; traps: Set<string> }>()
const MAX_HITS_BEFORE_BLOCK = 3 // 命中 3 次同 IP 自動考慮加 blocklist

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const ip = getClientIp(req)
  const trap = req.nextUrl.searchParams.get('trap') || req.nextUrl.pathname
  const ua = req.headers.get('user-agent')?.slice(0, 200) || 'unknown'
  const now = Date.now()

  // 紀錄
  const existing = honeypotHits.get(ip)
  if (existing) {
    existing.count++
    existing.traps.add(trap)
  } else {
    honeypotHits.set(ip, {
      count: 1,
      firstSeen: now,
      traps: new Set([trap]),
    })
  }
  const entry = honeypotHits.get(ip)!

  // 寫進 Vercel logs(進 log drain 後可手動加 Edge Config blocklist)
  console.warn('[HONEYPOT-HIT]', JSON.stringify({
    ts: new Date().toISOString(),
    ip,
    trap,
    ua,
    count: entry.count,
    traps: Array.from(entry.traps),
    suggest_block: entry.count >= MAX_HITS_BEFORE_BLOCK,
  }))

  // 回假 login 表單(讓 scanner 認為「找到了」、繼續浪費時間)
  // 不回 401 或 403、避免 scanner 直接 skip
  return new NextResponse(
    `<!DOCTYPE html>
<html><head><title>Admin Login</title><meta name="robots" content="noindex"></head>
<body><form method="post"><input name="user"><input name="pass" type="password"><button>Login</button></form></body></html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Honeypot': '1',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
