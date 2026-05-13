// ============================================================
// Cron 保活端點 — 每 4 分鐘 ping Fly.io Python API，消滅冷啟動
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  // v5.10.279:fail-closed auth(Codex P0#3 修)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'
  const healthUrl = `${apiUrl}/health`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const status = res.status
    const body = await res.text().catch(() => '')

    console.info(`Fly.io 保活 ping: ${status} (${body.slice(0, 100)})`)

    return NextResponse.json({
      ok: res.ok,
      status,
      flyUrl: apiUrl,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知錯誤'
    console.error(`Fly.io 保活 ping 失敗: ${message}`)

    return NextResponse.json({
      ok: false,
      error: message,
      flyUrl: apiUrl,
      timestamp: new Date().toISOString(),
    }, { status: 502 })
  }
}
