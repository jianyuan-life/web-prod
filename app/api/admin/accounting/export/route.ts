// Admin Accounting Export API（v5.3.3 2026-04-18）
// GET /api/admin/accounting/export?period=30d&type=revenue|expense|combined
// Headers: x-admin-key
//
// 回傳：CSV 檔（UTF-8 BOM + Excel 友善）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { resolvePeriod, PeriodKey } from '@/lib/accounting'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  // 加 UTF-8 BOM 讓 Excel 正確辨識繁體中文
  return '\uFEFF' + lines.join('\r\n')
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = (req.nextUrl.searchParams.get('period') || '30d') as PeriodKey
  const type = req.nextUrl.searchParams.get('type') || 'combined'
  const range = resolvePeriod(period)

  const supabase = getSupabase()

  const { data: revRows } = await supabase
    .from('revenue_log')
    .select('created_at, plan_code, amount_usd, stripe_fee_usd, net_revenue_usd, points_discount_usd, coupon_discount_usd, customer_email, stripe_session_id, report_id')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(50000)

  const { data: expRows } = await supabase
    .from('expense_log')
    .select('occurred_at, category, subcategory, amount_usd, description, source, report_id')
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .order('occurred_at', { ascending: false })
    .limit(50000)

  let csv = ''
  let filename = ''

  if (type === 'revenue') {
    filename = `revenue_${period}.csv`
    csv = toCsv(
      ['日期', '方案', '原金額USD', 'Stripe手續費', '實收USD', '積分折抵', '優惠碼折抵', '客戶Email', 'Stripe Session ID', '報告ID'],
      (revRows || []).map(r => [
        r.created_at, r.plan_code, r.amount_usd, r.stripe_fee_usd, r.net_revenue_usd,
        r.points_discount_usd, r.coupon_discount_usd, r.customer_email, r.stripe_session_id, r.report_id,
      ]),
    )
  } else if (type === 'expense') {
    filename = `expense_${period}.csv`
    csv = toCsv(
      ['日期', '大類', '小類', '金額USD', '描述', '來源', '報告ID'],
      (expRows || []).map(e => [
        e.occurred_at, e.category, e.subcategory, e.amount_usd, e.description, e.source, e.report_id,
      ]),
    )
  } else {
    // combined
    filename = `accounting_${period}.csv`
    const header = ['日期', '類型', '項目', '金額USD', '描述', '關聯ID']
    const rows: unknown[][] = []
    for (const r of (revRows || [])) {
      rows.push([r.created_at, 'revenue', r.plan_code, r.amount_usd, `收入: ${r.customer_email || ''}`, r.stripe_session_id || ''])
    }
    for (const e of (expRows || [])) {
      rows.push([e.occurred_at, 'expense', `${e.category}/${e.subcategory || ''}`, e.amount_usd, e.description || '', e.report_id || ''])
    }
    rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    csv = toCsv(header, rows)
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
