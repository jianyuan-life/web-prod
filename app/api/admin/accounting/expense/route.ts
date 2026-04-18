// Admin Accounting Expense CRUD API（v5.3.3 2026-04-18）
// POST   /api/admin/accounting/expense     手動新增一筆支出
// DELETE /api/admin/accounting/expense?id= 刪除一筆（僅限 manual 來源）
// Headers: x-admin-key

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { recordExpense, ExpenseCategory } from '@/lib/accounting'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// v5.3.5 擴充到 15 類（含舊類別保留向下相容）
const VALID_CATEGORIES: ExpenseCategory[] = [
  'ai_cost', 'hosting_monthly', 'domain_annual', 'domain_setup',
  'ai_subscription', 'api_credit_topup', 'stripe_fee',
  'refund', 'marketing', 'font_license', 'external_service',
  'api_setup', 'domain', 'email', 'other',
]

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: {
    category?: string
    subcategory?: string
    amount_usd?: number | string
    description?: string
    occurred_at?: string
    report_id?: string
    metadata?: Record<string, unknown>
    key?: string
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const category = (body.category || '').trim() as ExpenseCategory
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `無效類別，僅接受 ${VALID_CATEGORIES.join('/')}` }, { status: 400 })
  }

  const amount = Number(body.amount_usd || 0)
  if (!(amount > 0)) {
    return NextResponse.json({ error: '金額需 > 0' }, { status: 400 })
  }

  await recordExpense({
    category,
    subcategory: body.subcategory?.trim() || null,
    amountUsd: amount,
    description: body.description?.trim() || null,
    source: 'manual',
    createdBy: 'admin',
    reportId: body.report_id || null,
    occurredAt: body.occurred_at || null,
    metadata: body.metadata || {},
  })

  await writeAuditLog(req, 'create', 'expense', null, {
    category,
    subcategory: body.subcategory || null,
    amount_usd: amount,
    description: body.description || null,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = getSupabase()

  // 只允許刪除 manual 來源的（不能刪 AI 鏡像進來的 auto）
  const { data: row } = await supabase
    .from('expense_log')
    .select('id, source, category, amount_usd, description')
    .eq('id', id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: '找不到記錄' }, { status: 404 })
  if (row.source !== 'manual') {
    return NextResponse.json({ error: `僅可刪除手動記錄（此筆來源：${row.source}）` }, { status: 403 })
  }

  const { error: delErr } = await supabase.from('expense_log').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await writeAuditLog(req, 'delete', 'expense', id, {
    category: row.category,
    amount_usd: row.amount_usd,
    description: row.description,
  })

  return NextResponse.json({ success: true })
}
