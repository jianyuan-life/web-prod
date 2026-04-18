import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

// ============================================================
// 報告生成監控 API — 過去 24 小時報告生成狀態、平均時間、花費估算
// GET /api/admin/monitoring  (ADMIN_KEY via x-admin-key header)
// ============================================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// Claude Opus 4.6 費用估算（每份報告）
// C 方案 3-call 架構：每 call 約 8K input + 4K output tokens
// 其他方案 1-call：約 6K input + 3K output tokens
// Opus 4.6: $15/M input, $75/M output
const COST_ESTIMATES: Record<string, number> = {
  C: 1.26,    // 3 calls: (24K*15 + 12K*75) / 1M = $1.26
  D: 0.315,   // 1 call: (6K*15 + 3K*75) / 1M = $0.315
  G15: 0.42,  // 1 call (larger): (8K*15 + 4K*75) / 1M = $0.42
  R: 0.42,    // 1 call (dual): (8K*15 + 4K*75) / 1M = $0.42
  E1: 0.315,  // 1 call: (6K*15 + 3K*75) / 1M = $0.315
  E2: 0.315,  // 1 call: (6K*15 + 3K*75) / 1M = $0.315
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // 查詢過去 24 小時的所有報告（paid_reports 無 updated_at，用 last_viewed_at 最近活動時間近似）
  const { data: reports, error } = await supabase
    .from('paid_reports')
    .select('id, plan_code, status, created_at, last_viewed_at, email_sent_at, retry_count, error_message, client_name, generation_progress')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allReports = reports || []

  // 統計各狀態數量
  const statusCounts = {
    completed: 0,
    failed: 0,
    generating: 0,
    pending: 0,
  }
  for (const r of allReports) {
    const s = r.status as keyof typeof statusCounts
    if (s in statusCounts) statusCounts[s]++
  }

  // 計算平均生成時間（只看已完成的報告，用 email_sent_at 近似 completion 時間）
  const completedReports = allReports.filter(r => r.status === 'completed')
  let avgGenerationMs = 0
  let validDurations = 0
  for (const r of completedReports) {
    // 用 email_sent_at 當完成時間（寄信是完成後最後一步）
    const endAt = r.email_sent_at || r.last_viewed_at
    if (r.created_at && endAt) {
      const created = new Date(r.created_at).getTime()
      const completed = new Date(endAt).getTime()
      const duration = completed - created
      // 排除不合理的值（< 10 秒或 > 60 分鐘）
      if (duration > 10000 && duration < 3600000) {
        avgGenerationMs += duration
        validDurations++
      }
    }
  }
  if (validDurations > 0) avgGenerationMs = Math.round(avgGenerationMs / validDurations)

  // Claude API 花費估算
  let estimatedCost = 0
  for (const r of completedReports) {
    const plan = (r.plan_code || 'C').split(/\s/)[0]
    estimatedCost += COST_ESTIMATES[plan] || COST_ESTIMATES['C']
  }

  // 按方案分類統計
  const planBreakdown: Record<string, { total: number; completed: number; failed: number }> = {}
  for (const r of allReports) {
    const plan = (r.plan_code || 'unknown').split(/\s/)[0]
    if (!planBreakdown[plan]) planBreakdown[plan] = { total: 0, completed: 0, failed: 0 }
    planBreakdown[plan].total++
    if (r.status === 'completed') planBreakdown[plan].completed++
    if (r.status === 'failed') planBreakdown[plan].failed++
  }

  // 最近 10 份報告的詳細狀態
  const recentReports = allReports.slice(0, 10).map(r => {
    const progress = r.generation_progress as Record<string, string> | null
    return {
      id: r.id,
      client_name: r.client_name,
      plan_code: (r.plan_code || '').split(/\s/)[0],
      status: r.status,
      created_at: r.created_at,
      updated_at: r.email_sent_at || r.last_viewed_at || r.created_at,
      retry_count: r.retry_count || 0,
      error_message: r.error_message || null,
      started_at: progress?.started_at || null,
      current_step: progress?.current_step || null,
    }
  })

  // 錯誤分類統計
  const failedReports = allReports.filter(r => r.status === 'failed')
  const errorCategories: Record<string, number> = {}
  for (const r of failedReports) {
    const msg = r.error_message || '未知錯誤'
    let category = '其他'
    if (msg.includes('超時') || msg.includes('timeout')) category = '超時'
    else if (msg.includes('529') || msg.includes('overloaded')) category = 'Claude 過載'
    else if (msg.includes('402') || msg.includes('credit')) category = 'API 額度不足'
    else if (msg.includes('rate') || msg.includes('429')) category = '限流'
    else if (msg.includes('Workflow') || msg.includes('Fallback')) category = '觸發失敗'
    else if (msg.includes('排盤') || msg.includes('Python')) category = '排盤 API 錯誤'
    errorCategories[category] = (errorCategories[category] || 0) + 1
  }

  return NextResponse.json({
    timestamp: now.toISOString(),
    period: '24h',
    summary: {
      total: allReports.length,
      ...statusCounts,
      success_rate: allReports.length > 0
        ? Math.round(statusCounts.completed / allReports.length * 100)
        : 0,
    },
    performance: {
      avg_generation_time_ms: avgGenerationMs,
      avg_generation_time_display: avgGenerationMs > 0
        ? `${Math.round(avgGenerationMs / 1000)}秒`
        : '無數據',
      valid_samples: validDurations,
    },
    cost: {
      estimated_claude_cost_usd: Math.round(estimatedCost * 100) / 100,
      completed_reports: completedReports.length,
      note: '估算值，實際費用請查閱 console.anthropic.com',
    },
    plan_breakdown: planBreakdown,
    error_categories: errorCategories,
    currently_generating: statusCounts.generating,
    recent_reports: recentReports,
  })
}
