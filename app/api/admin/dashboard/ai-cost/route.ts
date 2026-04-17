// Dashboard AI 成本 API（L7+ BI 2026-04-17）
// GET /api/admin/dashboard/ai-cost?period=30d
// Headers: x-admin-key
//
// 回傳：
//   - 每日總花費（USD）
//   - 按 provider 分解（claude / deepseek / kimi）
//   - 按方案分解（C / D / G15 / R / E1 / E2）
//   - Top N 貴的單次呼叫
//   - 本月累計 + 預算告警（BUDGET_USD_PER_MONTH env，預設 500）

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

type CostRow = {
  id: string
  report_id: string | null
  plan_code: string | null
  provider: string
  model: string
  call_stage: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost_usd: number | string | null
  latency_ms: number | null
  status: string | null
  created_at: string | null
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const period = req.nextUrl.searchParams.get('period') || '30d'
  const days = period === '90d' ? 90 : period === '7d' ? 7 : 30
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const supabase = getSupabase()

  const { data: rows, error } = await supabase
    .from('ai_cost_log')
    .select('id, report_id, plan_code, provider, model, call_stage, prompt_tokens, completion_tokens, cost_usd, latency_ms, status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000)

  if (error) {
    // ai_cost_log 表不存在時返回空數據（migration 還沒跑）
    if (String(error.message).includes('ai_cost_log') || String(error.code) === '42P01') {
      return NextResponse.json({
        period,
        since,
        total_cost_usd: 0,
        daily: [],
        by_provider: {},
        by_plan: {},
        by_model: [],
        top_expensive_calls: [],
        month_to_date_usd: 0,
        budget_usd: Number(process.env.AI_BUDGET_USD_PER_MONTH) || 500,
        budget_usage_pct: 0,
        alert: null,
        note: 'ai_cost_log 表未建立（請於 Supabase 執行 migration create_ai_cost_log.sql）',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const costs: CostRow[] = (rows as CostRow[]) || []

  // 總花費
  const totalCost = costs.reduce((s, c) => s + Number(c.cost_usd || 0), 0)

  // 每日花費
  const dailyMap: Record<string, { total: number; claude: number; deepseek: number; kimi: number; moonshot: number; other: number }> = {}
  for (const c of costs) {
    const day = (c.created_at || '').slice(0, 10)
    if (!day) continue
    if (!dailyMap[day]) dailyMap[day] = { total: 0, claude: 0, deepseek: 0, kimi: 0, moonshot: 0, other: 0 }
    const cost = Number(c.cost_usd || 0)
    dailyMap[day].total += cost
    const provider = (c.provider || 'other').toLowerCase()
    if (provider === 'claude') dailyMap[day].claude += cost
    else if (provider === 'deepseek') dailyMap[day].deepseek += cost
    else if (provider === 'kimi') dailyMap[day].kimi += cost
    else if (provider === 'moonshot') dailyMap[day].moonshot += cost
    else dailyMap[day].other += cost
  }
  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({
      date,
      total: Math.round(v.total * 10000) / 10000,
      claude: Math.round(v.claude * 10000) / 10000,
      deepseek: Math.round(v.deepseek * 10000) / 10000,
      kimi: Math.round(v.kimi * 10000) / 10000,
      moonshot: Math.round(v.moonshot * 10000) / 10000,
      other: Math.round(v.other * 10000) / 10000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 按 provider
  const byProvider: Record<string, { cost: number; calls: number; prompt_tokens: number; completion_tokens: number }> = {}
  for (const c of costs) {
    const p = c.provider || 'other'
    if (!byProvider[p]) byProvider[p] = { cost: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 }
    byProvider[p].cost += Number(c.cost_usd || 0)
    byProvider[p].calls += 1
    byProvider[p].prompt_tokens += Number(c.prompt_tokens || 0)
    byProvider[p].completion_tokens += Number(c.completion_tokens || 0)
  }
  const byProviderOut: Record<string, { cost_usd: number; calls: number; prompt_tokens: number; completion_tokens: number; avg_cost_usd: number }> = {}
  for (const [k, v] of Object.entries(byProvider)) {
    byProviderOut[k] = {
      cost_usd: Math.round(v.cost * 10000) / 10000,
      calls: v.calls,
      prompt_tokens: v.prompt_tokens,
      completion_tokens: v.completion_tokens,
      avg_cost_usd: v.calls > 0 ? Math.round((v.cost / v.calls) * 10000) / 10000 : 0,
    }
  }

  // 按方案
  const byPlan: Record<string, { cost: number; calls: number }> = {}
  for (const c of costs) {
    const plan = (c.plan_code || 'unknown').split(/\s/)[0].toUpperCase()
    if (!byPlan[plan]) byPlan[plan] = { cost: 0, calls: 0 }
    byPlan[plan].cost += Number(c.cost_usd || 0)
    byPlan[plan].calls += 1
  }
  const byPlanOut: Record<string, { cost_usd: number; calls: number; avg_cost_usd: number }> = {}
  for (const [k, v] of Object.entries(byPlan)) {
    byPlanOut[k] = {
      cost_usd: Math.round(v.cost * 10000) / 10000,
      calls: v.calls,
      avg_cost_usd: v.calls > 0 ? Math.round((v.cost / v.calls) * 10000) / 10000 : 0,
    }
  }

  // 按 model
  const byModelMap: Record<string, { provider: string; cost: number; calls: number }> = {}
  for (const c of costs) {
    const key = `${c.provider}|${c.model}`
    if (!byModelMap[key]) byModelMap[key] = { provider: c.provider, cost: 0, calls: 0 }
    byModelMap[key].cost += Number(c.cost_usd || 0)
    byModelMap[key].calls += 1
  }
  const byModel = Object.entries(byModelMap)
    .map(([key, v]) => ({
      model: key.split('|')[1],
      provider: v.provider,
      cost_usd: Math.round(v.cost * 10000) / 10000,
      calls: v.calls,
      avg_cost_usd: v.calls > 0 ? Math.round((v.cost / v.calls) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  // Top 10 最貴呼叫
  const topExpensive = [...costs]
    .sort((a, b) => Number(b.cost_usd || 0) - Number(a.cost_usd || 0))
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      report_id: c.report_id,
      plan_code: c.plan_code,
      provider: c.provider,
      model: c.model,
      cost_usd: Math.round(Number(c.cost_usd || 0) * 10000) / 10000,
      prompt_tokens: c.prompt_tokens,
      completion_tokens: c.completion_tokens,
      created_at: c.created_at,
    }))

  // 本月累計
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const mtdCost = costs
    .filter(c => c.created_at && new Date(c.created_at) >= monthStart)
    .reduce((s, c) => s + Number(c.cost_usd || 0), 0)
  const budget = Number(process.env.AI_BUDGET_USD_PER_MONTH) || 500
  const budgetPct = budget > 0 ? Math.round((mtdCost / budget) * 1000) / 10 : 0
  let alert: string | null = null
  if (budgetPct >= 100) alert = 'critical'
  else if (budgetPct >= 80) alert = 'warning'

  return NextResponse.json({
    period,
    since,
    total_cost_usd: Math.round(totalCost * 10000) / 10000,
    daily,
    by_provider: byProviderOut,
    by_plan: byPlanOut,
    by_model: byModel,
    top_expensive_calls: topExpensive,
    month_to_date_usd: Math.round(mtdCost * 10000) / 10000,
    budget_usd: budget,
    budget_usage_pct: budgetPct,
    alert,
  })
}
