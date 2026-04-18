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

  // Provider 正規化（同 lib/ai/pricing.ts canonicalProvider）
  const norm = (p: string): string => {
    const r = (p || '').toLowerCase()
    if (r === 'claude' || r === 'anthropic') return 'anthropic'
    if (r === 'kimi' || r === 'moonshot') return 'moonshot'
    if (r === 'alibaba' || r === 'dashscope' || r === 'qwen') return 'qwen'
    if (r === 'google' || r === 'gemini') return 'gemini'
    if (r === 'voyage' || r === 'voyageai') return 'voyage'
    if (r === 'openai' || r === 'deepseek') return r
    return 'other'
  }

  // 總花費
  const totalCost = costs.reduce((s, c) => s + Number(c.cost_usd || 0), 0)

  // 每日花費（v5.3.5 擴充 7 家 provider bucket）
  type DailyBucket = { total: number; anthropic: number; openai: number; deepseek: number; moonshot: number; qwen: number; gemini: number; voyage: number; other: number }
  const makeEmptyBucket = (): DailyBucket => ({ total: 0, anthropic: 0, openai: 0, deepseek: 0, moonshot: 0, qwen: 0, gemini: 0, voyage: 0, other: 0 })
  const dailyMap: Record<string, DailyBucket> = {}
  for (const c of costs) {
    const day = (c.created_at || '').slice(0, 10)
    if (!day) continue
    if (!dailyMap[day]) dailyMap[day] = makeEmptyBucket()
    const cost = Number(c.cost_usd || 0)
    dailyMap[day].total += cost
    const p = norm(c.provider)
    if (p === 'anthropic') dailyMap[day].anthropic += cost
    else if (p === 'openai') dailyMap[day].openai += cost
    else if (p === 'deepseek') dailyMap[day].deepseek += cost
    else if (p === 'moonshot') dailyMap[day].moonshot += cost
    else if (p === 'qwen') dailyMap[day].qwen += cost
    else if (p === 'gemini') dailyMap[day].gemini += cost
    else if (p === 'voyage') dailyMap[day].voyage += cost
    else dailyMap[day].other += cost
  }
  const round4 = (n: number) => Math.round(n * 10000) / 10000
  const daily = Object.entries(dailyMap)
    .map(([date, v]) => ({
      date,
      total: round4(v.total),
      anthropic: round4(v.anthropic),
      openai: round4(v.openai),
      deepseek: round4(v.deepseek),
      moonshot: round4(v.moonshot),
      qwen: round4(v.qwen),
      gemini: round4(v.gemini),
      voyage: round4(v.voyage),
      other: round4(v.other),
      // 舊欄位別名（維持向下相容，前端可能還用到）
      claude: round4(v.anthropic),
      kimi: round4(v.moonshot),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 按 provider（v5.3.5 正規化 provider 名）
  const byProvider: Record<string, { cost: number; calls: number; prompt_tokens: number; completion_tokens: number }> = {}
  for (const c of costs) {
    const p = norm(c.provider || 'other')
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

  // v5.3.5 按 call_stage 分組
  const stageMap: Record<string, { cost: number; calls: number }> = {}
  for (const c of costs) {
    const rawStage = c.call_stage || 'unknown'
    // 把 team_revision_r1/r2/r3 / Call 1/2/3 / *_fallback_* 等 normalise 成大分類
    let stageKey = rawStage
    if (/^team_revision_r\d/.test(rawStage)) stageKey = 'team_revision'
    else if (/^Call\s*\d/.test(rawStage)) stageKey = 'main_report'
    else if (rawStage.endsWith('_main')) stageKey = 'main_report'
    else if (rawStage.startsWith('free_')) stageKey = 'free_tool'
    else if (rawStage.startsWith('moderation_')) stageKey = 'moderation'
    else if (rawStage.includes('fallback')) stageKey = 'fallback'
    else if (rawStage === 'qa_5llm' || rawStage.startsWith('qa_')) stageKey = 'qa_5llm'
    else if (rawStage.startsWith('team_')) stageKey = 'team_pipeline'
    else if (rawStage === 'embed') stageKey = 'embed'
    else if (rawStage === 'review_legacy') stageKey = 'review_legacy'
    if (!stageMap[stageKey]) stageMap[stageKey] = { cost: 0, calls: 0 }
    stageMap[stageKey].cost += Number(c.cost_usd || 0)
    stageMap[stageKey].calls += 1
  }
  const byStage = Object.entries(stageMap)
    .map(([stage, v]) => ({
      stage,
      cost_usd: round4(v.cost),
      calls: v.calls,
      avg_cost_usd: v.calls > 0 ? round4(v.cost / v.calls) : 0,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  // v5.3.5 異常告警判斷
  const anomalies: Array<{ type: 'expensive_single' | 'daily_exceed'; message: string; data: Record<string, unknown> }> = []
  const EXPENSIVE_SINGLE_THRESHOLD = 5
  const DAILY_EXCEED_THRESHOLD = 30
  for (const c of costs) {
    const cost = Number(c.cost_usd || 0)
    if (cost > EXPENSIVE_SINGLE_THRESHOLD) {
      anomalies.push({
        type: 'expensive_single',
        message: `單筆 $${cost.toFixed(2)} (${c.model})`,
        data: { id: c.id, model: c.model, cost_usd: cost, report_id: c.report_id, call_stage: c.call_stage, created_at: c.created_at },
      })
    }
  }
  for (const d of daily) {
    if (d.total > DAILY_EXCEED_THRESHOLD) {
      anomalies.push({
        type: 'daily_exceed',
        message: `${d.date} 單日 $${d.total.toFixed(2)}`,
        data: { date: d.date, total: d.total },
      })
    }
  }
  anomalies.sort((a, b) => Number((b.data as { cost_usd?: number; total?: number }).cost_usd ?? (b.data as { total?: number }).total ?? 0)
    - Number((a.data as { cost_usd?: number; total?: number }).cost_usd ?? (a.data as { total?: number }).total ?? 0))

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
    by_stage: byStage,                        // v5.3.5
    anomalies: anomalies.slice(0, 50),        // v5.3.5
    top_expensive_calls: topExpensive,
    month_to_date_usd: Math.round(mtdCost * 10000) / 10000,
    budget_usd: budget,
    budget_usage_pct: budgetPct,
    alert,
  })
}
