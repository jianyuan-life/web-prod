// Monthly P&L Cron（v5.3.3 2026-04-18）
// GET /api/cron/monthly-pnl
// Schedule: 0 1 1 * *（每月 1 日 01:00）
// Auth: Bearer $CRON_SECRET
//
// 功能：
//   1. 計算上月 P&L 並 upsert 到 monthly_pnl_snapshot
//   2. 透過 Telegram 推送月結報表給老闆
//   3. 超預算/虧損自動警報
//
// 手動觸發（測試用）：
//   GET /api/cron/monthly-pnl?force=1&target=2026-03

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcPeriodPnL, monthRange } from '@/lib/accounting'

export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
  R: '合否？', E1: '事件出門訣', E2: '月盤出門訣',
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
  } catch { /* noop */ }
}

export async function GET(req: NextRequest) {
  // 驗證 cron secret
  const authHeader = req.headers.get('authorization')
  const force = req.nextUrl.searchParams.get('force')
  const adminKey = req.headers.get('x-admin-key')
  // v5.3.33 安全修：force=1 必須搭配 ADMIN_KEY，否則不可跳過 CRON_SECRET
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminForce = force === '1' && !!adminKey && adminKey === process.env.ADMIN_KEY
  if (!isCronAuth && !isAdminForce) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 目標月份：預設上個月，可用 target=YYYY-MM 覆寫
  const target = req.nextUrl.searchParams.get('target')
  const now = new Date()
  let ym: string
  if (target && /^\d{4}-\d{2}$/.test(target)) {
    ym = target
  } else {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  }

  const { start, end } = monthRange(ym)
  const pnl = await calcPeriodPnL(start, end, ym)

  const supabase = getSupabase()

  // by_plan 細節
  const { data: revRows } = await supabase
    .from('revenue_log')
    .select('plan_code, amount_usd, net_revenue_usd')
    .gte('created_at', start)
    .lt('created_at', end)
    .limit(50000)

  const byPlan: Record<string, { count: number; revenue: number; net_revenue: number }> = {}
  for (const r of (revRows || [])) {
    const code = (r.plan_code || 'UNKNOWN').toUpperCase()
    if (!byPlan[code]) byPlan[code] = { count: 0, revenue: 0, net_revenue: 0 }
    byPlan[code].count += 1
    byPlan[code].revenue += Number(r.amount_usd || 0)
    byPlan[code].net_revenue += Number(r.net_revenue_usd || 0)
  }

  const snapshotData = {
    year_month: ym,
    total_revenue_usd: pnl.revenue.total_usd,
    net_revenue_usd: pnl.revenue.net_usd,
    stripe_fee_total_usd: pnl.revenue.stripe_fee_total_usd,
    points_discount_total_usd: pnl.revenue.points_discount_total_usd,
    coupon_discount_total_usd: pnl.revenue.coupon_discount_total_usd,
    ai_cost_usd: pnl.expense.ai_cost_usd,
    hosting_cost_usd: pnl.expense.hosting_cost_usd,
    refund_usd: pnl.expense.refund_usd,
    marketing_cost_usd: pnl.expense.marketing_cost_usd,
    other_expense_usd: pnl.expense.other_usd + pnl.expense.email_cost_usd,
    total_expense_usd: pnl.expense.total_usd,
    gross_profit_usd: pnl.profit.gross_profit_usd,
    net_profit_usd: pnl.profit.net_profit_usd,
    profit_margin_pct: pnl.profit.profit_margin_pct,
    report_count: pnl.report_count,
    refund_count: pnl.refund_count,
    avg_revenue_per_report: pnl.avg_revenue_per_report,
    avg_cost_per_report: pnl.avg_cost_per_report,
    avg_profit_per_report: pnl.avg_profit_per_report,
    by_plan: byPlan,
    is_finalized: true,
    finalized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error: upErr } = await supabase
    .from('monthly_pnl_snapshot')
    .upsert(snapshotData, { onConflict: 'year_month' })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // Telegram 月結報表
  const profitEmoji = pnl.profit.net_profit_usd >= 0 ? '🟢' : '🔴'
  const planLines = Object.entries(byPlan)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([code, v]) => `• ${PLAN_NAMES[code] || code}：${v.count} 份 / $${v.revenue.toFixed(2)}`)
    .join('\n')

  const text = `
<b>📊 鑑源月結報表 ${ym}</b>

<b>營收</b>
• 總收入：$${pnl.revenue.total_usd}
• 實收（扣 Stripe）：$${pnl.revenue.net_usd}
• 報告數：${pnl.report_count} 份
• 單份平均：$${pnl.avg_revenue_per_report}

<b>支出</b>
• AI 成本：$${pnl.expense.ai_cost_usd}
• Hosting：$${pnl.expense.hosting_cost_usd}
• 退款：$${pnl.expense.refund_usd}（${pnl.refund_count} 筆）
• 行銷：$${pnl.expense.marketing_cost_usd}
• 其他：$${pnl.expense.other_usd}
• 總支出：$${pnl.expense.total_usd}

<b>${profitEmoji} 淨利</b>
• 毛利：$${pnl.profit.gross_profit_usd}
• 淨利：<b>$${pnl.profit.net_profit_usd}</b>
• 利潤率：${pnl.profit.profit_margin_pct}%
• 單份淨利：$${pnl.avg_profit_per_report}

<b>方案分解</b>
${planLines || '(無資料)'}
  `.trim()

  await sendTelegram(text)

  // 虧損警報
  if (pnl.profit.net_profit_usd < 0) {
    await sendTelegram(`🚨 <b>警報：${ym} 月虧損</b>\n淨利 $${pnl.profit.net_profit_usd}（利潤率 ${pnl.profit.profit_margin_pct}%）`)
  }

  return NextResponse.json({ success: true, snapshot: snapshotData })
}
