// 後台 A/B 測試管理 API
// 2026-04-17 | 網頁製作部門
//
// GET  /api/admin/ab-tests            → 列出所有實驗 + 各 variant 統計
// POST /api/admin/ab-tests            → 建立新實驗
// PATCH /api/admin/ab-tests?key=xxx   → 暫停/恢復/結論
//
// 全部走 x-admin-key 驗證（沿用現有機制）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

interface VariantStats {
  variant: string
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  uniqueVisitors: number
}

interface ExperimentWithStats {
  key: string
  name: string
  description: string | null
  status: string
  variants: Array<{ key: string; label?: string; weight: number }>
  primary_metric: string
  winner: string | null
  notes: string | null
  started_at: string
  ended_at: string | null
  stats: VariantStats[]
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()

  // 1. 取所有實驗
  const { data: experiments, error: expErr } = await supabase
    .from('ab_experiments')
    .select('*')
    .order('created_at', { ascending: false })

  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 })
  if (!experiments || experiments.length === 0) {
    return NextResponse.json({ experiments: [] })
  }

  // 2. 批次取事件統計（一次查完，再在 JS 彙整）
  const keys = experiments.map((e) => e.key)
  const { data: events } = await supabase
    .from('ab_events')
    .select('experiment_key, variant, visitor_id, event_type, value')
    .in('experiment_key', keys)
    .limit(100_000) // 上限保險，避免單次拉爆

  // 彙整
  const statsMap = new Map<string, Map<string, VariantStats>>()
  const uniqueVisitorsMap = new Map<string, Map<string, Set<string>>>()

  for (const ev of events || []) {
    const expKey = ev.experiment_key as string
    const variant = ev.variant as string
    if (!statsMap.has(expKey)) statsMap.set(expKey, new Map())
    if (!uniqueVisitorsMap.has(expKey)) uniqueVisitorsMap.set(expKey, new Map())
    const vmap = statsMap.get(expKey)!
    const uvmap = uniqueVisitorsMap.get(expKey)!

    if (!vmap.has(variant)) {
      vmap.set(variant, { variant, impressions: 0, clicks: 0, conversions: 0, revenue: 0, uniqueVisitors: 0 })
    }
    if (!uvmap.has(variant)) uvmap.set(variant, new Set())

    const s = vmap.get(variant)!
    if (ev.event_type === 'impression') s.impressions++
    else if (ev.event_type === 'click') s.clicks++
    else if (ev.event_type === 'conversion') s.conversions++
    else if (ev.event_type === 'revenue') s.revenue += Number(ev.value || 0)

    uvmap.get(variant)!.add(ev.visitor_id as string)
  }

  // 3. 整合
  const result: ExperimentWithStats[] = experiments.map((exp) => {
    const vmap = statsMap.get(exp.key) || new Map<string, VariantStats>()
    const uvmap = uniqueVisitorsMap.get(exp.key) || new Map<string, Set<string>>()
    const variants = (exp.variants || []) as Array<{ key: string; label?: string; weight: number }>

    // 確保每個定義的 variant 都有 row（即使還沒事件）
    const stats: VariantStats[] = variants.map((v) => {
      const s = vmap.get(v.key) || {
        variant: v.key,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        uniqueVisitors: 0,
      }
      s.uniqueVisitors = uvmap.get(v.key)?.size || 0
      return s
    })

    return {
      key: exp.key,
      name: exp.name,
      description: exp.description,
      status: exp.status,
      variants,
      primary_metric: exp.primary_metric || 'conversion',
      winner: exp.winner,
      notes: exp.notes,
      started_at: exp.started_at,
      ended_at: exp.ended_at,
      stats,
    }
  })

  return NextResponse.json({ experiments: result })
}

// 建立新實驗
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  let body: {
    key?: string
    name?: string
    description?: string
    variants?: Array<{ key: string; label?: string; weight: number }>
    primary_metric?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { key, name, description, variants, primary_metric } = body

  if (!key || !/^[a-z0-9_]{3,64}$/.test(key)) {
    return NextResponse.json({ error: 'key 必須為 3-64 字元小寫英數底線' }, { status: 400 })
  }
  if (!name || name.length < 2 || name.length > 200) {
    return NextResponse.json({ error: 'name 必填 2-200 字' }, { status: 400 })
  }
  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 10) {
    return NextResponse.json({ error: 'variants 必須 2-10 個' }, { status: 400 })
  }
  const totalWeight = variants.reduce((s, v) => s + (Number(v.weight) || 0), 0)
  if (totalWeight <= 0) {
    return NextResponse.json({ error: 'weight 總和需大於 0' }, { status: 400 })
  }
  for (const v of variants) {
    if (!v.key || !/^[A-Z0-9_]{1,16}$/.test(v.key)) {
      return NextResponse.json({ error: `variant key 不合法：${v.key}` }, { status: 400 })
    }
  }

  const supabase = getSupabase()
  const { error } = await supabase.from('ab_experiments').insert({
    key,
    name,
    description: description || null,
    variants,
    primary_metric: primary_metric || 'conversion',
    status: 'active',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key })
}

// 暫停/恢復/結論
export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })

  let body: { status?: string; winner?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status) {
    if (!['active', 'paused', 'concluded'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
    if (body.status === 'concluded') update.ended_at = new Date().toISOString()
  }
  if (body.winner !== undefined) update.winner = body.winner || null
  if (body.notes !== undefined) update.notes = body.notes || null

  const supabase = getSupabase()
  const { error } = await supabase.from('ab_experiments').update(update).eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
