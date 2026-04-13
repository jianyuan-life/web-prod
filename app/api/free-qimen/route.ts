import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// 免費奇門遁甲排盤 API — 呼叫 Fly.io Python API
// ============================================================

const PYTHON_API = 'https://fortune-reports-api.fly.dev'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      year, month, day, hour, minute = 0,
      pan_type = 'hour', // hour | day | year
    } = body

    // 呼叫 Python API 排盤，超時 25 秒（Fly.io 冷啟動可能較久）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(`${PYTHON_API}/api/free-qimen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year, month, day, hour, minute,
        pan_type,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '排盤失敗')
      return NextResponse.json(
        { detail: `排盤引擎錯誤：${errText}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { detail: '排盤引擎啟動中，請稍候再試（約需 10-15 秒）' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : '排盤失敗，請稍後再試' },
      { status: 500 }
    )
  }
}
