import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

// GET — 取得所有促銷活動
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const { data, error } = await getSupabase()
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ promotions: data || [] })
}

// POST — 建立新促銷活動
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const body = await req.json()
  const { name, discount_percent, start_at, end_at, applicable_plans } = body

  if (!name || !name.trim()) {
    return NextResponse.json({ error: '促銷名稱不能為空' }, { status: 400 })
  }
  if (typeof discount_percent !== 'number' || discount_percent < 1 || discount_percent > 99) {
    return NextResponse.json({ error: '折扣百分比必須在 1-99 之間' }, { status: 400 })
  }
  if (!start_at || !end_at) {
    return NextResponse.json({ error: '必須設定開始與結束時間' }, { status: 400 })
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: '結束時間必須晚於開始時間' }, { status: 400 })
  }

  const { data, error } = await getSupabase()
    .from('promotions')
    .insert({
      name: name.trim(),
      discount_percent,
      start_at,
      end_at,
      applicable_plans: applicable_plans?.length ? applicable_plans : null,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await writeAuditLog(req, 'create_promotion', 'promotion', data?.id ? String(data.id) : null, {
    name, discount_percent,
  })
  return NextResponse.json({ promotion: data })
}

// PATCH — 更新/切換啟用/停用促銷活動
export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  const body = await req.json()
  const { id, action, key: bodyKey, ...updates } = body

  const authFail = checkAdminAuth(req, bodyKey)
  if (authFail) return authFail

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = getSupabase()

  // 切換啟用/停用
  if (action === 'toggle') {
    const { data: current } = await supabase
      .from('promotions')
      .select('is_active')
      .eq('id', id)
      .single()
    if (!current) return NextResponse.json({ error: '找不到該促銷活動' }, { status: 404 })

    const newActive = !current.is_active
    const { error } = await supabase
      .from('promotions')
      .update({ is_active: newActive })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'update_promotion', 'promotion', String(id), { is_active: newActive })
    return NextResponse.json({ ok: true })
  }

  // 刪除
  if (action === 'delete') {
    const { error } = await supabase.from('promotions').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'delete_promotion', 'promotion', String(id), null)
    return NextResponse.json({ ok: true })
  }

  // 更新欄位（name, discount_percent, start_at, end_at, applicable_plans）
  if (action === 'update') {
    const allowed: Record<string, unknown> = {}
    if (updates.name !== undefined) allowed.name = updates.name.trim()
    if (updates.discount_percent !== undefined) allowed.discount_percent = updates.discount_percent
    if (updates.start_at !== undefined) allowed.start_at = updates.start_at
    if (updates.end_at !== undefined) allowed.end_at = updates.end_at
    if (updates.applicable_plans !== undefined) {
      allowed.applicable_plans = updates.applicable_plans?.length ? updates.applicable_plans : null
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 })
    }

    const { error } = await supabase
      .from('promotions')
      .update(allowed)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'update_promotion', 'promotion', String(id), allowed)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '未知 action' }, { status: 400 })
}
