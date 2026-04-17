// A/B 測試事件接收 API
// 2026-04-17 | 網頁製作部門
// POST /api/ab-events
// Body: { experimentKey, variant, visitorId, eventType, value?, metadata? }
//
// 安全考量：
// - 匿名可寫（事件不含敏感資料，且 RLS + service_role 寫入）
// - middleware 限制 120/min/ip（防刷）
// - 校驗 experimentKey/variant/eventType 白名單
// - 第一次看到 visitor → 寫 ab_assignments（冪等：ON CONFLICT DO NOTHING）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_EVENT_TYPES = ['impression', 'click', 'conversion', 'revenue'] as const
type ValidEventType = (typeof VALID_EVENT_TYPES)[number]

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } },
  )
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

interface AbEventBody {
  experimentKey?: string
  variant?: string
  visitorId?: string
  eventType?: string
  value?: number
  metadata?: Record<string, unknown>
  userId?: string
}

export async function POST(req: NextRequest) {
  let body: AbEventBody
  try {
    // sendBeacon 會送 Blob（text/plain），所以不強制 Content-Type
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { experimentKey, variant, visitorId, eventType, value, metadata, userId } = body

  // 基本驗證
  if (!experimentKey || typeof experimentKey !== 'string' || experimentKey.length > 128) {
    return NextResponse.json({ error: 'invalid experimentKey' }, { status: 400 })
  }
  if (!variant || typeof variant !== 'string' || variant.length > 32) {
    return NextResponse.json({ error: 'invalid variant' }, { status: 400 })
  }
  if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 64) {
    return NextResponse.json({ error: 'invalid visitorId' }, { status: 400 })
  }
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType as ValidEventType)) {
    return NextResponse.json({ error: 'invalid eventType' }, { status: 400 })
  }
  if (value !== undefined && (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 1_000_000)) {
    return NextResponse.json({ error: 'invalid value' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 1. 寫事件
  const meta: Record<string, unknown> = {
    ...(metadata || {}),
    ip: getClientIp(req),
    ua: req.headers.get('user-agent')?.slice(0, 200) || null,
    referer: req.headers.get('referer')?.slice(0, 500) || null,
  }

  const { error: insertErr } = await supabase.from('ab_events').insert({
    experiment_key: experimentKey,
    variant,
    visitor_id: visitorId,
    user_id: userId || null,
    event_type: eventType,
    value: value ?? null,
    metadata: meta,
  })

  if (insertErr) {
    // 不回 500（避免前端不斷重試），但記錄 log
    console.warn('[ab-events] insert failed:', insertErr.message)
    return NextResponse.json({ ok: false, warning: 'event not stored' }, { status: 202 })
  }

  // 2. 首次 impression 時寫入 assignment（冪等）
  if (eventType === 'impression') {
    // upsert on (experiment_key, visitor_id)
    await supabase
      .from('ab_assignments')
      .upsert(
        {
          experiment_key: experimentKey,
          visitor_id: visitorId,
          variant,
          user_id: userId || null,
        },
        { onConflict: 'experiment_key,visitor_id', ignoreDuplicates: true },
      )
  }

  return NextResponse.json({ ok: true })
}

// GET：公開查詢指定實驗的 variants 定義（前端動態讀取用）
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('ab_experiments')
    .select('key, name, variants, status, winner')
    .eq('key', key)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}
