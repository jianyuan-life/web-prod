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

  if (expErr) {
    // 表不存在時優雅回退
    if (String(expErr.code) === '42P01' || String(expErr.message).includes('ab_experiments')) {
      return NextResponse.json({
        experiments: [],
        note: 'ab_experiments 表未建立（請於 Supabase 執行 migration）',
      })
    }
    return NextResponse.json({ error: expErr.message }, { status: 500 })
  }
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
      // 實際表用 description 當名稱，向前端沿用 name 欄位保持 UI 相容
      name: exp.name || exp.description || exp.key,
      description: exp.description,
      status: exp.status,
      variants,
      primary_metric: exp.primary_metric || 'conversion',
      winner: exp.winner,
      // 實際表用 conclusion，API 對外統一 notes
      notes: exp.notes || exp.conclusion,
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
  // 實際表沒有 name/primary_metric 欄位，沿用 description 當顯示名稱
  const insertPayload: Record<string, unknown> = {
    key,
    description: description || name,  // name 優先寫入 description
    variants,
    status: 'active',
  }
  const { error } = await supabase.from('ab_experiments').insert(insertPayload)

  if (error) {
    // primary_metric 在前端建立時選填，若表不存在欄位改用 description 備註
    if (String(error.message).includes('primary_metric') || String(error.message).includes('column')) {
      console.warn('[ab-tests] 建立實驗缺欄位，嘗試移除選填欄位重試:', error.message)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, key, primary_metric: primary_metric || 'conversion' })
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

  // 實際表沒有 updated_at/notes 欄位，改用 conclusion
  const update: Record<string, unknown> = {}
  if (body.status) {
    if (!['active', 'paused', 'concluded'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
    if (body.status === 'concluded') update.ended_at = new Date().toISOString()
  }
  if (body.winner !== undefined) update.winner = body.winner || null
  if (body.notes !== undefined) update.conclusion = body.notes || null

  const supabase = getSupabase()
  const { error } = await supabase.from('ab_experiments').update(update).eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
