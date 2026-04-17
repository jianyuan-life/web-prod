// Dashboard Funnel API（L7+ BI 2026-04-17）
// GET /api/admin/dashboard/funnel?days=30
// Headers: x-admin-key
//
// 從 customer_funnel_events + visitor_events + paid_reports 整合：
//   visit_pricing → start_checkout → begin_payment → payment_success
//   → report_generated → report_viewed → pdf_downloaded
//
// 若 customer_funnel_events 還沒累積數據，自動回退用 paid_reports 估算主要步驟。

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

const STEPS = [
  'visit_pricing',
  'start_checkout',
  'begin_payment',
  'payment_success',
  'report_generated',
  'report_viewed',
  'pdf_downloaded',
] as const

const STEP_LABEL: Record<string, string> = {
  visit_pricing: '1. 看方案',
  start_checkout: '2. 開始結帳',
  begin_payment: '3. 進入付款',
  payment_success: '4. 付款成功',
  report_generated: '5. 報告生成',
  report_viewed: '6. 查看報告',
  pdf_downloaded: '7. 下載 PDF',
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') || '30')))
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const supabase = getSupabase()

  const [funnelRes, pricingViewsRes, reportsRes] = await Promise.all([
    supabase
      .from('customer_funnel_events')
      .select('session_id, step, plan_code, created_at')
      .gte('created_at', since),
    // 回退：若 funnel_events 沒東西，用 /pricing pageview 當 step1
    supabase
      .from('visitor_events')
      .select('session_id, page_path, user_agent')
      .gte('created_at', since)
      .in('page_path', ['/pricing', '/checkout']),
    supabase
      .from('paid_reports')
      .select('id, status, amount_usd, stripe_session_id, created_at')
      .gte('created_at', since),
  ])

  const BOT_PATTERNS = ['HeadlessChrome', 'vercel-screenshot', 'bot', 'crawler', 'spider', 'Googlebot', 'Bingbot', 'Slurp', 'facebookexternalhit', 'Twitterbot']
  const isBot = (ua: string) => BOT_PATTERNS.some(p => ua.toLowerCase().includes(p.toLowerCase()))

  // ==== 以 customer_funnel_events 為主 ====
  const stepSessions: Record<string, Set<string>> = {}
  for (const step of STEPS) stepSessions[step] = new Set()
  for (const e of (funnelRes.data || [])) {
    if (stepSessions[e.step]) stepSessions[e.step].add(e.session_id)
  }

  // ==== 回退補位：用 visitor_events.page_path 補 visit_pricing / start_checkout ====
  const visitPricingSessions = new Set<string>()
  const startCheckoutSessions = new Set<string>()
  for (const v of (pricingViewsRes.data || [])) {
    if (isBot(v.user_agent || '')) continue
    if (v.page_path === '/pricing') visitPricingSessions.add(v.session_id)
    if (v.page_path === '/checkout') startCheckoutSessions.add(v.session_id)
  }
  // 合併（funnel_events 優先，visitor 補位）
  for (const s of visitPricingSessions) stepSessions['visit_pricing'].add(s)
  for (const s of startCheckoutSessions) stepSessions['start_checkout'].add(s)

  // ==== 回退補位：payment_success / report_generated 用 paid_reports 補 ====
  const reports = reportsRes.data || []
  const paymentSuccessByReport = reports.filter(r => Number(r.amount_usd) > 0).length
  const reportGenerated = reports.filter(r => r.status === 'completed').length

  // ==== 輸出 ====
  const counts: { step: string; label: string; count: number; conversion_from_prev_pct: number | null; conversion_from_top_pct: number | null }[] = []
  let prev = 0
  let top = 0
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    let count = stepSessions[step].size
    // 回退覆蓋：如果 funnel 沒抓到但 paid_reports 有，取較大值
    if (step === 'payment_success' && paymentSuccessByReport > count) count = paymentSuccessByReport
    if (step === 'report_generated' && reportGenerated > count) count = reportGenerated

    if (i === 0) { top = count }
    const convFromPrev = i === 0 ? null : (prev > 0 ? Math.round((count / prev) * 1000) / 10 : null)
    const convFromTop = i === 0 ? 100 : (top > 0 ? Math.round((count / top) * 1000) / 10 : null)
    counts.push({
      step,
      label: STEP_LABEL[step],
      count,
      conversion_from_prev_pct: convFromPrev,
      conversion_from_top_pct: convFromTop,
    })
    prev = count
  }

  return NextResponse.json({
    days,
    since,
    funnel: counts,
    // 幫助前端呈現是否已經有 funnel_events 數據
    funnel_events_count: (funnelRes.data || []).length,
    note: (funnelRes.data || []).length === 0
      ? '尚無 customer_funnel_events 數據，目前 visit_pricing / start_checkout 由 visitor_events 推算、payment_success / report_generated 由 paid_reports 推算'
      : undefined,
  })
}
