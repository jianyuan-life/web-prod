import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// GET — 取得所有優惠碼
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail
  const { data, error } = await getSupabase()
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupons: data || [] })
}

// POST — 新增優惠碼
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail
  const body = await req.json()
  const { code, discount_type, discount_value, applicable_products, max_uses, valid_until, note } = body
  if (!code) return NextResponse.json({ error: '優惠碼不能為空' }, { status: 400 })
  const { data, error } = await getSupabase()
    .from('coupons')
    .insert({
      code: code.toUpperCase().trim(),
      discount_type,
      discount_value: Number(discount_value) || 0,
      applicable_products: applicable_products?.length ? applicable_products : null,
      max_uses: max_uses ?? null,
      valid_until: valid_until || null,
      note: note || '',
      is_active: true,
      used_count: 0,
    })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '優惠碼已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await writeAuditLog(req, 'create_coupon', 'coupon', data?.id ? String(data.id) : null, {
    code: data?.code, discount_type, discount_value,
  })
  return NextResponse.json({ coupon: data })
}

// PATCH — 切換啟用狀態 / 刪除
export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const body = await req.json()
  const { id, action, key } = body
  const authFail = checkAdminAuth(req, key)
  if (authFail) return authFail
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  if (action === 'delete') {
    const { error } = await getSupabase().from('coupons').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'delete_coupon', 'coupon', String(id), null)
    return NextResponse.json({ ok: true })
  }
  if (action === 'toggle') {
    const { data: current } = await getSupabase().from('coupons').select('is_active').eq('id', id).single()
    const newActive = !current?.is_active
    const { error } = await getSupabase().from('coupons').update({ is_active: newActive }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'update_coupon', 'coupon', String(id), { is_active: newActive })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: '未知 action' }, { status: 400 })
}
