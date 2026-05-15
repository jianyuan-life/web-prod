// Admin Fixed Subscriptions CRUD API (v5.3.5 2026-04-18)
//
// GET    /api/admin/accounting/subscriptions           列表 + 累計至今
// POST   /api/admin/accounting/subscriptions           新增
// PATCH  /api/admin/accounting/subscriptions?id=xxx    更新
// DELETE /api/admin/accounting/subscriptions?id=xxx    停用（軟刪）
// POST   /api/admin/accounting/subscriptions/backfill  一鍵回填歷史（預設清單）
//
// Headers: x-admin-key
//
// 行為：
//   - 新增訂閱時會自動在 expense_log 寫一筆「started_at 當月/當年」對應分類的 record
//   - GET 列表時 JOIN expense_log 計算「累計至今」
//   - DELETE 不硬刪，設 is_active=false + ended_at=today

import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { recordExpense, ExpenseCategory } from '@/lib/accounting'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

type SubRow = {
  id: string
  service_name: string
  vendor: string | null
  service_url: string | null
  category: string
  amount_usd: number | string | null
  original_currency: string | null
  original_amount: number | string | null
  frequency: string
  started_at: string
  ended_at: string | null
  is_active: boolean
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

const VALID_FREQUENCIES = ['monthly', 'annual', 'one_time', 'prepaid']

const VALID_SUB_CATEGORIES: ExpenseCategory[] = [
  'hosting_monthly', 'domain_annual', 'domain_setup',
  'ai_subscription', 'api_credit_topup',
  'font_license', 'external_service', 'other',
]

/**
 * 計算某訂閱「累計至今」金額
 * - monthly：從 started_at 到今天（或 ended_at）共幾個月 × 單價
 * - annual：幾年 × 單價
 * - one_time / prepaid：直接用單價
 */
function calcAccumulatedUsd(sub: SubRow, asOf: Date = new Date()): number {
  const amount = Number(sub.amount_usd || 0)
  if (!(amount > 0)) return 0
  const start = new Date(sub.started_at)
  const end = sub.ended_at ? new Date(sub.ended_at) : asOf
  const actualEnd = end < asOf ? end : asOf
  if (actualEnd < start) return 0

  if (sub.frequency === 'monthly') {
    const months =
      (actualEnd.getFullYear() - start.getFullYear()) * 12 +
      (actualEnd.getMonth() - start.getMonth()) + 1
    return amount * Math.max(1, months)
  }
  if (sub.frequency === 'annual') {
    const years = actualEnd.getFullYear() - start.getFullYear() + 1
    return amount * Math.max(1, years)
  }
  // one_time / prepaid：只算 started_at 那一筆
  return amount
}

// ── GET：列表 ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const includeInactive = req.nextUrl.searchParams.get('include_inactive') === '1'

  let query = supabase.from('fixed_subscriptions').select('*')
  if (!includeInactive) query = query.eq('is_active', true)
  query = query.order('started_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    // 表不存在時回空陣列，方便前端 smooth render
    if (String(error.message).includes('fixed_subscriptions') || error.code === '42P01') {
      return NextResponse.json({
        subscriptions: [],
        note: 'fixed_subscriptions 表未建立（請執行 create_fixed_subscriptions.sql migration）',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: SubRow[] = (data as SubRow[]) || []
  const now = new Date()
  const withAccumulated = rows.map(r => {
    const accumulated = calcAccumulatedUsd(r, now)
    return {
      ...r,
      amount_usd: Number(r.amount_usd),
      original_amount: r.original_amount !== null ? Number(r.original_amount) : null,
      accumulated_usd: Math.round(accumulated * 100) / 100,
    }
  })

  // 匯總
  const totals = {
    total_accumulated_usd: Math.round(withAccumulated.reduce((s, r) => s + (r.accumulated_usd || 0), 0) * 100) / 100,
    monthly_run_rate: Math.round(
      withAccumulated
        .filter(r => r.is_active && r.frequency === 'monthly')
        .reduce((s, r) => s + Number(r.amount_usd || 0), 0) * 100,
    ) / 100,
    annual_run_rate: Math.round(
      withAccumulated
        .filter(r => r.is_active && r.frequency === 'annual')
        .reduce((s, r) => s + Number(r.amount_usd || 0), 0) * 100,
    ) / 100,
    active_count: withAccumulated.filter(r => r.is_active).length,
  }

  return NextResponse.json({ subscriptions: withAccumulated, totals })
}

// ── POST：新增一筆訂閱 ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: {
    service_name?: string
    vendor?: string
    service_url?: string
    category?: string
    amount_usd?: number | string
    original_currency?: string
    original_amount?: number | string
    frequency?: string
    started_at?: string
    ended_at?: string
    notes?: string
    key?: string
    // 若 true，同時在 expense_log 寫入對應「首期」金額（方便看板即時反映）
    also_log_expense?: boolean
    metadata?: Record<string, unknown>
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const serviceName = (body.service_name || '').trim()
  const category = (body.category || '').trim() as ExpenseCategory
  const frequency = (body.frequency || '').trim()
  const amount = Number(body.amount_usd || 0)
  const started = (body.started_at || '').trim()

  if (!serviceName) return NextResponse.json({ error: '缺少 service_name' }, { status: 400 })
  if (!VALID_SUB_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `無效 category，允許：${VALID_SUB_CATEGORIES.join(', ')}` }, { status: 400 })
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: `無效 frequency，允許：${VALID_FREQUENCIES.join(', ')}` }, { status: 400 })
  }
  if (!(amount > 0)) return NextResponse.json({ error: 'amount_usd 需 > 0' }, { status: 400 })
  if (!started) return NextResponse.json({ error: '缺少 started_at' }, { status: 400 })

  const supabase = getSupabase()

  const insertRow = {
    service_name: serviceName,
    vendor: body.vendor?.trim() || null,
    service_url: body.service_url?.trim() || null,
    category,
    amount_usd: amount,
    original_currency: body.original_currency?.trim() || 'USD',
    original_amount: body.original_amount !== undefined ? Number(body.original_amount) : null,
    frequency,
    started_at: started,
    ended_at: body.ended_at?.trim() || null,
    is_active: true,
    notes: body.notes?.trim() || null,
    metadata: body.metadata || {},
  }

  const { data: inserted, error } = await supabase
    .from('fixed_subscriptions')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) {
    if (String(error.message).includes('fixed_subscriptions') || error.code === '42P01') {
      return NextResponse.json({ error: 'fixed_subscriptions 表未建立，請先跑 migration' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 同步寫一筆 expense_log（首期）方便看板立即反映
  if (body.also_log_expense !== false) {
    try {
      await recordExpense({
        category,
        subcategory: serviceName.toLowerCase().replace(/\s+/g, '_'),
        amountUsd: amount,
        description: `${serviceName}（${frequency}, ${started} 起）`,
        source: 'manual',
        createdBy: 'admin_subscription',
        occurredAt: started,
        metadata: { subscription_id: inserted?.id, ...body.metadata },
      })
    } catch {
      // expense_log 失敗不影響 subscription 建立
    }
  }

  await writeAuditLog(req, 'create', 'fixed_subscription', inserted?.id || null, {
    service_name: serviceName, category, frequency, amount_usd: amount, started_at: started,
  })

  return NextResponse.json({ success: true, subscription: inserted })
}

// ── PATCH：更新 ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  let body: Partial<{
    service_name: string
    vendor: string
    service_url: string
    amount_usd: number | string
    frequency: string
    started_at: string
    ended_at: string | null
    is_active: boolean
    notes: string
    metadata: Record<string, unknown>
  }> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 }) }

  const update: Record<string, unknown> = {}
  if (body.service_name !== undefined) update.service_name = String(body.service_name).trim()
  if (body.vendor !== undefined) update.vendor = body.vendor?.toString().trim() || null
  if (body.service_url !== undefined) update.service_url = body.service_url?.toString().trim() || null
  if (body.amount_usd !== undefined) update.amount_usd = Number(body.amount_usd)
  if (body.frequency !== undefined) {
    if (!VALID_FREQUENCIES.includes(String(body.frequency))) {
      return NextResponse.json({ error: `無效 frequency` }, { status: 400 })
    }
    update.frequency = body.frequency
  }
  if (body.started_at !== undefined) update.started_at = body.started_at
  if (body.ended_at !== undefined) update.ended_at = body.ended_at
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)
  if (body.notes !== undefined) update.notes = body.notes?.toString().trim() || null
  if (body.metadata !== undefined) update.metadata = body.metadata

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有任何更新欄位' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('fixed_subscriptions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(req, 'update', 'fixed_subscription', id, update as Record<string, unknown>)

  return NextResponse.json({ success: true, subscription: data })
}

// ── DELETE：軟刪（停用）──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const id = req.nextUrl.searchParams.get('id')
  const hard = req.nextUrl.searchParams.get('hard') === '1'
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = getSupabase()

  if (hard) {
    const { error } = await supabase.from('fixed_subscriptions').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(req, 'delete', 'fixed_subscription', id, { hard: true })
    return NextResponse.json({ success: true })
  }

  // 軟刪：設 is_active=false, ended_at=today
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('fixed_subscriptions')
    .update({ is_active: false, ended_at: today })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(req, 'deactivate', 'fixed_subscription', id, { ended_at: today })

  return NextResponse.json({ success: true, deactivated: true, ended_at: today })
}
