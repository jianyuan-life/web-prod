// 一鍵回填常見訂閱 API (v5.3.5 2026-04-18)
//
// POST /api/admin/accounting/subscriptions/backfill
// Headers: x-admin-key
// Body: { items: [{ service_name, category, frequency, amount_usd, started_at }], also_log_expense?: boolean }
//
// 用途：讓老闆在後台「一鍵回填」常見服務（Vercel Pro / Supabase Pro / 域名 / Anthropic credit...）
// - 相同 service_name + started_at 視為重複，自動跳過
// - 可選擇是否同步寫 expense_log 首期

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

type BackfillItem = {
  service_name: string
  vendor?: string
  category: ExpenseCategory
  frequency: 'monthly' | 'annual' | 'one_time' | 'prepaid'
  amount_usd: number
  started_at: string
  notes?: string
}

// 常見服務預設清單（前端展示用，由前端發送到後端 insert）
// 這裡不硬寫在後端，純 passthrough，讓老闆自己在 UI 勾選要填哪幾項

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  let body: { items?: BackfillItem[]; also_log_expense?: boolean; key?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: '缺少 items' }, { status: 400 })
  }

  const supabase = getSupabase()
  const results: Array<{
    service_name: string
    status: 'inserted' | 'skipped_duplicate' | 'error'
    id?: string
    error?: string
  }> = []

  for (const it of items) {
    if (!it.service_name || !it.category || !it.frequency || !(Number(it.amount_usd) > 0) || !it.started_at) {
      results.push({ service_name: it.service_name || 'unknown', status: 'error', error: '欄位不全' })
      continue
    }

    // 檢查是否已存在（相同名字 + 相同起始日）
    const { data: existing } = await supabase
      .from('fixed_subscriptions')
      .select('id')
      .eq('service_name', it.service_name)
      .eq('started_at', it.started_at)
      .maybeSingle()

    if (existing) {
      results.push({ service_name: it.service_name, status: 'skipped_duplicate', id: (existing as { id: string }).id })
      continue
    }

    const { data: inserted, error } = await supabase
      .from('fixed_subscriptions')
      .insert({
        service_name: it.service_name,
        vendor: it.vendor || null,
        category: it.category,
        amount_usd: Number(it.amount_usd),
        frequency: it.frequency,
        started_at: it.started_at,
        is_active: true,
        notes: it.notes || '一鍵回填',
        metadata: { backfill: true, backfilled_at: new Date().toISOString() },
      })
      .select('id')
      .single()

    if (error) {
      if (String(error.message).includes('fixed_subscriptions') || error.code === '42P01') {
        return NextResponse.json({ error: 'fixed_subscriptions 表未建立，請先跑 migration' }, { status: 500 })
      }
      results.push({ service_name: it.service_name, status: 'error', error: error.message })
      continue
    }

    // 同步寫 expense_log 首期（讓看板立刻反映）
    if (body.also_log_expense !== false) {
      try {
        await recordExpense({
          category: it.category,
          subcategory: it.service_name.toLowerCase().replace(/\s+/g, '_'),
          amountUsd: Number(it.amount_usd),
          description: `${it.service_name}（${it.frequency}，回填 ${it.started_at}）`,
          source: 'backfill',
          createdBy: 'admin_backfill',
          occurredAt: it.started_at,
          metadata: { subscription_id: inserted?.id, backfill: true },
        })
      } catch { /* noop */ }
    }

    results.push({ service_name: it.service_name, status: 'inserted', id: inserted?.id })
  }

  await writeAuditLog(req, 'backfill', 'fixed_subscriptions', null, {
    items_count: items.length,
    inserted: results.filter(r => r.status === 'inserted').length,
    skipped: results.filter(r => r.status === 'skipped_duplicate').length,
    errored: results.filter(r => r.status === 'error').length,
  })

  return NextResponse.json({ success: true, results })
}
