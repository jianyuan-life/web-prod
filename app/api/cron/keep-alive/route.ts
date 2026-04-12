// ============================================================
// Cron 保活端點 — 每 4 分鐘 ping Fly.io Python API，消滅冷啟動
// ============================================================

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  // 驗證 cron secret（防止外部未授權呼叫）
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
