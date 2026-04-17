// 客戶漏斗事件追蹤 API（L7+ 2026-04-17）
// POST /api/track/funnel
// Body: { session_id, step, plan_code?, report_id?, amount_usd?, metadata? }
//
// 對應 table: customer_funnel_events（RLS 允許 anon INSERT）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_STEPS = [
  'visit_pricing',
  'start_checkout',
  'begin_payment',
  'payment_success',
  'report_generated',
  'report_viewed',
  'pdf_downloaded',
] as const

export async function POST(req: NextRequest) {
  let body: {
    session_id?: string
    step?: string
    plan_code?: string | null
    report_id?: string | null
    amount_usd?: number | null
    metadata?: Record<string, unknown>
    user_id?: string | null
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  if (!body.session_id || !body.step) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }
  if (!VALID_STEPS.includes(body.step as typeof VALID_STEPS[number])) {
    return NextResponse.json({ error: 'invalid_step' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 })
  }

  const supabase = createClient(url, anon)
  const { error } = await supabase.from('customer_funnel_events').insert({
    session_id: body.session_id,
    step: body.step,
    plan_code: body.plan_code || null,
    report_id: body.report_id || null,
    amount_usd: body.amount_usd || null,
    user_id: body.user_id || null,
    metadata: body.metadata || {},
  })

  // UNIQUE violation 算成功（同一 session 同步驟只記一次）
  if (error && !String(error.message).includes('duplicate')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
