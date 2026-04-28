'use client'

// 鑒源完整會計系統 Admin 頁面（v5.3.3 2026-04-18）
// 路徑：/jamie/accounting
//
// 功能：
//   - 核心 KPI（累計收入、支出、淨利；本月/上月對比）
//   - 每日收支趨勢圖
//   - 方案利潤分解
//   - 支出分類圓餅
//   - 損益兩平（本月固定成本 vs 要賣幾份才回本）
//   - 月結快照列表 + 手動觸發月結
//   - 手動記錄一筆支出（飛快錄入一次性費用）
//   - CSV 導出

import React, { useCallback, useEffect, useState } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

type PeriodKey = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'quarter' | 'year' | 'all'

type PnL = {
  period: { start: string; end: string; label: string }
  revenue: {
    total_usd: number; net_usd: number; stripe_fee_total_usd: number
    points_discount_total_usd: number; coupon_discount_total_usd: number; count: number
  }
  expense: {
    total_usd: number; ai_cost_usd: number; hosting_cost_usd: number
    refund_usd: number; marketing_cost_usd: number; email_cost_usd: number; other_usd: number
  }
  profit: { gross_profit_usd: number; net_profit_usd: number; profit_margin_pct: number }
  report_count: number; refund_count: number
  avg_revenue_per_report: number; avg_cost_per_report: number; avg_profit_per_report: number
}

type KpiSet = {
  gross_margin_pct: number
  net_margin_pct: number
  avg_ai_cost_per_report: number
  samples: number
  margin_color?: 'green' | 'yellow' | 'red'
}
type Summary = {
  period: { start: string; end: string; label: string }
  period_pnl: PnL
  all_time_pnl: PnL
  this_month_pnl: PnL
  last_month_pnl: PnL
  ai_budget_usd: number
  ai_budget_pct: number
  alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string }>
  break_even: {
    this_month_fixed_cost_usd: number
    avg_margin_per_plan: Record<string, number>
    break_even_count_per_plan: Record<string, number>
  }
  kpi?: {
    period: KpiSet
    all_time: KpiSet
    this_month: KpiSet
    last_month: KpiSet
    roi_pct: number
    roi_color: 'green' | 'red'
  }
}

type Daily = {
  daily: Array<{
    date: string; revenue: number; net_revenue: number; stripe_fee: number
    ai_cost: number; hosting: number; refund: number; marketing: number; email: number; other: number
    total_expense: number; net_profit: number; report_count: number
  }>
}

type ByPlan = {
  by_plan: Array<{
    code: string; name: string; count: number
    revenue: number; net_revenue: number; stripe_fee: number
    ai_cost: number; refund: number; gross_profit: number
    avg_revenue: number; avg_ai_cost: number; avg_profit: number; margin_pct: number
  }>
}

type ByCategory = {
  categories: Array<{
    category: string; total_usd: number; count: number
    subcategories: Array<{ name: string; amount_usd: number }>
  }>
  total_expense_usd: number
  recent_entries: Array<{
    id: string; category: string; subcategory: string | null
    amount_usd: number; description: string | null; source: string
    report_id: string | null; occurred_at: string | null
  }>
}

type MonthlySnapshots = {
  snapshots: Array<{
    year_month: string
    total_revenue_usd: number; net_revenue_usd: number; total_expense_usd: number
    ai_cost_usd: number; hosting_cost_usd: number; refund_usd: number
    gross_profit_usd: number; net_profit_usd: number; profit_margin_pct: number
    report_count: number; refund_count: number; by_plan: Record<string, { count: number; revenue: number; net_revenue: number }>
    is_finalized: boolean
  }>
}

// v5.3.5 擴充到 12+ 類
const CATEGORY_NAMES: Record<string, string> = {
  ai_cost: 'AI 成本',
  hosting_monthly: 'Hosting 月費',
  domain_annual: '網域年費',
  domain_setup: '網域一次性',
  ai_subscription: 'AI 訂閱工具',
  api_credit_topup: 'API 充值',
  stripe_fee: 'Stripe 手續費',
  font_license: '字體授權',
  external_service: '其他 SaaS',
  api_setup: 'API 開通費',
  domain: '域名（舊）',
  refund: '退款',
  marketing: '行銷',
  email: '郵件',
  other: '其他',
}

const CATEGORY_COLORS: Record<string, string> = {
  ai_cost: '#4E9AC7',
  hosting_monthly: '#f59e0b',
  domain_annual: '#10b981',
  domain_setup: '#22c55e',
  ai_subscription: '#a855f7',
  api_credit_topup: '#ec4899',
  stripe_fee: '#06b6d4',
  font_license: '#eab308',
  external_service: '#f97316',
  api_setup: '#8b5cf6',
  domain: '#10b981',
  refund: '#ef4444',
  marketing: '#ec4899',
  email: '#14b8a6',
  other: '#6b7280',
}

const EXPENSE_CATEGORIES = [
  { value: 'hosting_monthly', label: 'Hosting 月費' },
  { value: 'domain_annual', label: '網域年費' },
  { value: 'domain_setup', label: '網域一次性' },
  { value: 'ai_subscription', label: 'AI 訂閱工具' },
  { value: 'api_credit_topup', label: 'API 充值' },
  { value: 'font_license', label: '字體授權' },
  { value: 'external_service', label: '其他 SaaS' },
  { value: 'api_setup', label: 'API 開通費' },
  { value: 'marketing', label: '行銷' },
  { value: 'email', label: '郵件' },
  { value: 'other', label: '其他' },
]

type TabKey = 'overview' | 'subscriptions' | 'expenses' | 'unit_econ' | 'export'

export default function AccountingPage() {
  const { adminKey } = useAdminAuth()
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [daily, setDaily] = useState<Daily | null>(null)
  const [byPlan, setByPlan] = useState<ByPlan | null>(null)
  const [byCategory, setByCategory] = useState<ByCategory | null>(null)
  const [snapshots, setSnapshots] = useState<MonthlySnapshots | null>(null)
  const [loading, setLoading] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const fetchAll = useCallback(async (p: PeriodKey) => {
    if (!adminKey) return
    setLoading(true)
    try {
      const [s, d, bp, bc, snap] = await Promise.all([
        adminFetch(`/api/admin/accounting/summary?period=${p}`, { adminKey }),
        adminFetch(`/api/admin/accounting/daily?period=${p}`, { adminKey }),
        adminFetch(`/api/admin/accounting/by-plan?period=${p}`, { adminKey }),
        adminFetch(`/api/admin/accounting/by-expense-category?period=${p}`, { adminKey }),
        adminFetch(`/api/admin/accounting/monthly-snapshots`, { adminKey }),
      ])
      if (s.ok) setSummary(await s.json())
      if (d.ok) setDaily(await d.json())
      if (bp.ok) setByPlan(await bp.json())
      if (bc.ok) setByCategory(await bc.json())
      if (snap.ok) setSnapshots(await snap.json())
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchAll(period) }, [period, fetchAll])

  const exportCsv = async (type: 'revenue' | 'expense' | 'combined') => {
    if (!adminKey) return
    const res = await adminFetch(`/api/admin/accounting/export?period=${period}&type=${type}`, { adminKey })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accounting_${type}_${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const triggerMonthlySnapshot = async (yearMonth: string) => {
    if (!adminKey) return
    if (!confirm(`手動產生 ${yearMonth} 月結快照？會覆蓋既有資料。`)) return
    const res = await adminFetch('/api/admin/accounting/monthly-snapshots', {
      method: 'POST', adminKey,
      body: JSON.stringify({ year_month: yearMonth }),
    })
    if (res.ok) { alert(`${yearMonth} 月結已產生`); fetchAll(period) }
    else alert('產生失敗')
  }

  if (!summary) return <div className="p-8 text-gray-500">載入中…</div>

  const kpi = summary.all_time_pnl
  const thisM = summary.this_month_pnl
  const lastM = summary.last_month_pnl

  return (
    <div className="p-6 max-w-[1400px]" style={{ background: '#0A0F1E', minHeight: '100vh' }}>
      {/* 頂部 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">完整會計系統</h1>
          <p className="text-xs text-gray-400">整個鑑源項目：收入、支出、淨利、月結</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            ['this_month', '本月'], ['last_month', '上月'],
            ['7d', '7 天'], ['30d', '30 天'], ['90d', '90 天'],
            ['quarter', '本季'], ['year', '本年'], ['all', '全部'],
          ] as Array<[PeriodKey, string]>).map(([v, label]) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                period === v ? 'bg-[#4E9AC7] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}>{label}</button>
          ))}
          <button onClick={() => fetchAll(period)}
            className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* v5.3.5 Tab Nav */}
      <div className="flex gap-1 mb-5 border-b border-white/10 overflow-x-auto">
        {([
          ['overview', '📊 總覽'],
          ['subscriptions', '🔁 固定訂閱'],
          ['expenses', '💸 建設成本明細'],
          ['unit_econ', '📈 單位經濟學'],
          ['export', '📥 報表匯出'],
        ] as Array<[TabKey, string]>).map(([v, label]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap ${
              activeTab === v
                ? 'text-[#4E9AC7] border-b-2 border-[#4E9AC7]'
                : 'text-gray-400 hover:text-white border-b-2 border-transparent'
            }`}>{label}</button>
        ))}
      </div>

      {activeTab === 'subscriptions' && (
        <SubscriptionsTab adminKey={adminKey} onRefresh={() => fetchAll(period)} />
      )}
      {activeTab === 'expenses' && (
        <ExpensesTab adminKey={adminKey} />
      )}
      {activeTab === 'unit_econ' && (
        <UnitEconomicsTab adminKey={adminKey} period={period} />
      )}
      {activeTab === 'export' && (
        <ExportTab exportCsv={exportCsv} />
      )}

      {activeTab !== 'overview' && null}

      {activeTab === 'overview' && (
      <>

      {/* 警報 */}
      {summary.alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {summary.alerts.map((a, i) => (
            <div key={i} className={`p-3 rounded-lg border text-sm ${
              a.level === 'critical' ? 'bg-red-500/10 border-red-500/40 text-red-300 animate-pulse' :
              a.level === 'warning' ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300' :
              'bg-blue-500/10 border-blue-500/40 text-blue-300'
            }`}>
              {a.level === 'critical' ? '🚨 ' : a.level === 'warning' ? '⚠️ ' : 'ℹ️ '}{a.message}
            </div>
          ))}
        </div>
      )}

      {/* 累計 KPI — 讓老闆一眼看到「花了多少賺了多少」 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl border border-green-500/30 p-4">
          <div className="text-[10px] text-green-400 uppercase mb-1">累計總收入</div>
          <div className="text-2xl font-bold text-green-300">${kpi.revenue.total_usd}</div>
          <div className="text-[10px] text-gray-500 mt-1">{kpi.report_count} 份報告</div>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-orange-500/5 rounded-xl border border-red-500/30 p-4">
          <div className="text-[10px] text-red-400 uppercase mb-1">累計總支出</div>
          <div className="text-2xl font-bold text-red-300">${kpi.expense.total_usd}</div>
          <div className="text-[10px] text-gray-500 mt-1">AI ${kpi.expense.ai_cost_usd} · 其他 ${(kpi.expense.total_usd - kpi.expense.ai_cost_usd).toFixed(2)}</div>
        </div>
        <div className={`rounded-xl border p-4 ${
          kpi.profit.net_profit_usd >= 0
            ? 'bg-gradient-to-br from-amber-500/15 to-yellow-500/5 border-amber-500/40'
            : 'bg-gradient-to-br from-red-600/15 to-red-700/5 border-red-600/40'
        }`}>
          <div className={`text-[10px] uppercase mb-1 ${kpi.profit.net_profit_usd >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            累計淨利
          </div>
          <div className={`text-2xl font-bold ${kpi.profit.net_profit_usd >= 0 ? 'text-amber-300' : 'text-red-300'}`}>
            ${kpi.profit.net_profit_usd}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">利潤率 {kpi.profit.profit_margin_pct}%</div>
        </div>
        <div className={`rounded-xl border p-4 ${
          thisM.profit.net_profit_usd >= 0 ? 'bg-[#141c2e] border-green-500/20' : 'bg-[#141c2e] border-red-500/30'
        }`}>
          <div className="text-[10px] text-gray-400 uppercase mb-1">本月損益</div>
          <div className={`text-2xl font-bold ${thisM.profit.net_profit_usd >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {thisM.profit.net_profit_usd >= 0 ? '+' : ''}${thisM.profit.net_profit_usd}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            上月 {lastM.profit.net_profit_usd >= 0 ? '+' : ''}${lastM.profit.net_profit_usd}
          </div>
        </div>
      </div>

      {/* v5.3.5 盈虧率 KPI 卡片（期間） */}
      {summary.kpi && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiCard
            label="毛利率"
            value={`${summary.kpi.period.gross_margin_pct}%`}
            subLabel={`${summary.period.label}`}
            color={summary.kpi.period.margin_color}
          />
          <KpiCard
            label="淨利率"
            value={`${summary.kpi.period.net_margin_pct}%`}
            subLabel={`期間 ${summary.kpi.period.samples} 份`}
            color={summary.kpi.period.margin_color}
          />
          <KpiCard
            label="累計 ROI 回本率"
            value={`${summary.kpi.roi_pct}%`}
            subLabel={`累計淨利/總支出`}
            color={summary.kpi.roi_color}
          />
          <KpiCard
            label="每份平均 AI 成本"
            value={`$${summary.kpi.period.avg_ai_cost_per_report}`}
            subLabel="期間樣本"
            color="yellow"
          />
          <KpiCard
            label="本月損益兩平"
            value={`${Math.min(...Object.values(summary.break_even.break_even_count_per_plan))}`}
            subLabel="最少份數（最佳方案）"
            color="yellow"
          />
        </div>
      )}

      {/* 期間 P&L 明細 + 手動記錄支出 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">{summary.period.label} 損益</h2>
            <div className="flex gap-2">
              <button onClick={() => exportCsv('revenue')} className="text-xs px-2.5 py-1 bg-white/5 text-gray-400 hover:text-white rounded">
                收入 CSV
              </button>
              <button onClick={() => exportCsv('expense')} className="text-xs px-2.5 py-1 bg-white/5 text-gray-400 hover:text-white rounded">
                支出 CSV
              </button>
              <button onClick={() => exportCsv('combined')} className="text-xs px-2.5 py-1 bg-[#4E9AC7]/20 text-[#4E9AC7] hover:bg-[#4E9AC7]/30 rounded">
                完整 CSV
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">收入</div>
              <div className="text-lg font-semibold text-green-400">${summary.period_pnl.revenue.total_usd}</div>
              <div className="text-[10px] text-gray-500">實收 ${summary.period_pnl.revenue.net_usd}</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">支出</div>
              <div className="text-lg font-semibold text-red-400">${summary.period_pnl.expense.total_usd}</div>
              <div className="text-[10px] text-gray-500">AI ${summary.period_pnl.expense.ai_cost_usd}</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">毛利</div>
              <div className="text-lg font-semibold text-amber-400">${summary.period_pnl.profit.gross_profit_usd}</div>
              <div className="text-[10px] text-gray-500">退款 ${summary.period_pnl.expense.refund_usd}</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">淨利</div>
              <div className={`text-lg font-semibold ${summary.period_pnl.profit.net_profit_usd >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                ${summary.period_pnl.profit.net_profit_usd}
              </div>
              <div className="text-[10px] text-gray-500">{summary.period_pnl.profit.profit_margin_pct}%</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">單份平均收入</div>
              <div className="text-base font-semibold text-white">${summary.period_pnl.avg_revenue_per_report}</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">單份平均成本</div>
              <div className="text-base font-semibold text-white">${summary.period_pnl.avg_cost_per_report}</div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">單份平均淨利</div>
              <div className={`text-base font-semibold ${summary.period_pnl.avg_profit_per_report >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                ${summary.period_pnl.avg_profit_per_report}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-3">
              <div className="text-[10px] text-gray-500">退款數</div>
              <div className="text-base font-semibold text-red-300">{summary.period_pnl.refund_count}</div>
              <div className="text-[10px] text-gray-500">
                退款率 {summary.period_pnl.report_count > 0
                  ? ((summary.period_pnl.refund_count / summary.period_pnl.report_count) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">損益兩平（本月）</h2>
            <button onClick={() => setShowExpenseModal(true)}
              className="text-xs px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded">
              + 記錄費用
            </button>
          </div>
          <div className="text-xs text-gray-400 mb-2">
            本月固定支出：<span className="text-amber-400">${summary.break_even.this_month_fixed_cost_usd}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(summary.break_even.break_even_count_per_plan).map(([code, count]) => (
              <div key={code} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                <span className="text-gray-300">
                  {({ C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件擇吉', E2: '月度單盤' } as Record<string, string>)[code] || code}
                </span>
                <span className="text-amber-300">
                  賣 {count} 份回本 <span className="text-gray-500">(毛利 ${summary.break_even.avg_margin_per_plan[code]}/份)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 每日收支趨勢 */}
      {daily && daily.daily.length > 0 && (
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
          <h2 className="text-base font-semibold text-white mb-3">每日收入 vs 支出 vs 淨利</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={daily.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" name="收入" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total_expense" name="支出" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net_profit" name="淨利" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 方案利潤分解 + 支出分類圓餅 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-base font-semibold text-white mb-3">按方案分解（哪個最賺）</h2>
          {byPlan && byPlan.by_plan.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byPlan.by_plan}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#e5e5e5' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="revenue" name="收入" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gross_profit" name="毛利" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 max-h-[200px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] text-gray-500">
                    <tr className="border-b border-white/5">
                      <th className="text-left px-2 py-1">方案</th>
                      <th className="text-right px-2 py-1">份數</th>
                      <th className="text-right px-2 py-1">收入</th>
                      <th className="text-right px-2 py-1">毛利</th>
                      <th className="text-right px-2 py-1">利潤率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPlan.by_plan.map(p => (
                      <tr key={p.code} className="border-b border-white/5">
                        <td className="px-2 py-1 text-white">{p.name}</td>
                        <td className="px-2 py-1 text-right text-gray-400">{p.count}</td>
                        <td className="px-2 py-1 text-right text-green-400">${p.revenue}</td>
                        <td className="px-2 py-1 text-right text-amber-400">${p.gross_profit}</td>
                        <td className="px-2 py-1 text-right text-gray-400">{p.margin_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">暫無資料</div>
          )}
        </div>

        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-base font-semibold text-white mb-3">支出分解（花在哪）</h2>
          {byCategory && byCategory.categories.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byCategory.categories.map(c => ({ name: CATEGORY_NAMES[c.category] || c.category, value: c.total_usd, cat: c.category }))}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={75}
                    label={(entry) => `$${entry.value}`} labelLine={false}>
                    {byCategory.categories.map(c => (
                      <Cell key={c.category} fill={CATEGORY_COLORS[c.category] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1 text-xs">
                {byCategory.categories.map(c => (
                  <div key={c.category} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[c.category] || '#6b7280' }} />
                      <span className="text-white">{CATEGORY_NAMES[c.category] || c.category}</span>
                    </div>
                    <span className="text-gray-400">${c.total_usd} · {c.count} 筆</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">暫無資料</div>
          )}
        </div>
      </div>

      {/* 月結快照 */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">月結快照</h2>
          <button
            onClick={() => {
              const now = new Date()
              const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
              const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
              triggerMonthlySnapshot(ym)
            }}
            className="text-xs px-3 py-1.5 bg-[#4E9AC7]/20 text-[#4E9AC7] hover:bg-[#4E9AC7]/30 rounded">
            重算上月月結
          </button>
        </div>
        {snapshots && snapshots.snapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-gray-500">
                  <th className="text-left px-3 py-2">月份</th>
                  <th className="text-right px-3 py-2">收入</th>
                  <th className="text-right px-3 py-2">實收</th>
                  <th className="text-right px-3 py-2">AI 成本</th>
                  <th className="text-right px-3 py-2">Hosting</th>
                  <th className="text-right px-3 py-2">退款</th>
                  <th className="text-right px-3 py-2">總支出</th>
                  <th className="text-right px-3 py-2">淨利</th>
                  <th className="text-right px-3 py-2">利潤率</th>
                  <th className="text-right px-3 py-2">份數</th>
                  <th className="text-right px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.snapshots.map(s => (
                  <tr key={s.year_month} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-white font-mono">{s.year_month}</td>
                    <td className="px-3 py-2 text-right text-green-400">${s.total_revenue_usd}</td>
                    <td className="px-3 py-2 text-right text-gray-300">${s.net_revenue_usd}</td>
                    <td className="px-3 py-2 text-right text-gray-400">${s.ai_cost_usd}</td>
                    <td className="px-3 py-2 text-right text-gray-400">${s.hosting_cost_usd}</td>
                    <td className="px-3 py-2 text-right text-red-400">${s.refund_usd}</td>
                    <td className="px-3 py-2 text-right text-orange-400">${s.total_expense_usd}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${s.net_profit_usd >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      ${s.net_profit_usd}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400">{s.profit_margin_pct}%</td>
                    <td className="px-3 py-2 text-right text-gray-400">{s.report_count}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => triggerMonthlySnapshot(s.year_month)}
                        className="text-[10px] text-gray-400 hover:text-white">重算</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-gray-500 text-sm">尚無月結快照（每月 1 日自動產生，也可點擊「重算上月月結」）</div>
        )}
      </div>

      {/* 最近支出明細 */}
      {byCategory && byCategory.recent_entries.length > 0 && (
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
          <h2 className="text-base font-semibold text-white mb-3">最近支出明細</h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#141c2e]">
                <tr className="border-b border-white/5 text-[10px] text-gray-500">
                  <th className="text-left px-3 py-2">時間</th>
                  <th className="text-left px-3 py-2">類別</th>
                  <th className="text-left px-3 py-2">描述</th>
                  <th className="text-right px-3 py-2">金額</th>
                  <th className="text-left px-3 py-2">來源</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.recent_entries.map(e => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-gray-400 text-[10px]">
                      {e.occurred_at ? new Date(e.occurred_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {CATEGORY_NAMES[e.category] || e.category}
                      {e.subcategory && <span className="text-gray-500"> / {e.subcategory}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-300 truncate max-w-[300px]">{e.description || '-'}</td>
                    <td className="px-3 py-2 text-right text-red-300 font-mono">${Math.round(e.amount_usd * 100) / 100}</td>
                    <td className="px-3 py-2 text-gray-500 text-[10px]">{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-500 p-3">
        ⓘ 收入來自 Stripe webhook 自動寫入 <code className="text-gray-400">revenue_log</code>。
        AI 成本由 <code className="text-gray-400">ai_cost_log</code> trigger 鏡像到 <code className="text-gray-400">expense_log</code>。
        固定月費每月 1 日 cron 自動入帳。一次性費用用「+ 記錄費用」手動錄入。
      </div>

      </>
      )}

      {/* 手動記錄支出 Modal */}
      {showExpenseModal && (
        <ExpenseModal
          adminKey={adminKey}
          onClose={() => setShowExpenseModal(false)}
          onSaved={() => { setShowExpenseModal(false); fetchAll(period) }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// v5.3.5 KPI 卡片
// ────────────────────────────────────────────────────────────
function KpiCard({ label, value, subLabel, color }: {
  label: string; value: string; subLabel?: string
  color?: 'green' | 'yellow' | 'red'
}) {
  const cls =
    color === 'green' ? 'from-green-500/10 to-emerald-500/5 border-green-500/30 text-green-300' :
    color === 'red' ? 'from-red-500/10 to-orange-500/5 border-red-500/30 text-red-300' :
    'from-amber-500/10 to-yellow-500/5 border-amber-500/30 text-amber-300'
  return (
    <div className={`bg-gradient-to-br ${cls} rounded-xl border p-4`}>
      <div className="text-[10px] uppercase mb-1 opacity-80">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {subLabel && <div className="text-[10px] text-gray-500 mt-1">{subLabel}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// v5.3.5 Tab：固定訂閱
// ────────────────────────────────────────────────────────────
type SubRow = {
  id: string
  service_name: string
  vendor: string | null
  service_url: string | null
  category: string
  amount_usd: number
  frequency: string
  started_at: string
  ended_at: string | null
  is_active: boolean
  notes: string | null
  accumulated_usd: number
  created_at: string
}
type SubsResponse = {
  subscriptions: SubRow[]
  totals?: {
    total_accumulated_usd: number
    monthly_run_rate: number
    annual_run_rate: number
    active_count: number
  }
  note?: string
}

function SubscriptionsTab({ adminKey, onRefresh }: { adminKey: string; onRefresh: () => void }) {
  const [data, setData] = useState<SubsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showBackfill, setShowBackfill] = useState(false)

  const fetchSubs = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch('/api/admin/accounting/subscriptions', { adminKey })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  const deactivate = async (id: string, serviceName: string) => {
    if (!confirm(`確認停用「${serviceName}」？會設 ended_at=today，保留歷史不硬刪。`)) return
    const res = await adminFetch(`/api/admin/accounting/subscriptions?id=${id}`, { method: 'DELETE', adminKey })
    if (res.ok) { fetchSubs(); onRefresh() } else alert('停用失敗')
  }

  if (!data) return <div className="p-8 text-gray-500">載入中…</div>

  return (
    <div>
      {data.note && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          ⓘ {data.note}
        </div>
      )}

      {/* 頂部統計 */}
      {data.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard label="累計支出" value={`$${data.totals.total_accumulated_usd}`} color="red" />
          <KpiCard label="月固定 Run Rate" value={`$${data.totals.monthly_run_rate}`} color="yellow" />
          <KpiCard label="年固定 Run Rate" value={`$${data.totals.annual_run_rate}`} color="yellow" />
          <KpiCard label="啟用中訂閱" value={`${data.totals.active_count}`} color="green" />
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">固定訂閱清單</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowBackfill(true)}
            className="text-xs px-3 py-1.5 bg-[#4E9AC7]/20 text-[#4E9AC7] hover:bg-[#4E9AC7]/30 rounded">
            🔄 一鍵回填歷史
          </button>
          <button onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded">
            + 新增訂閱
          </button>
          <button onClick={fetchSubs} className="text-xs px-3 py-1.5 bg-white/5 text-gray-400 hover:bg-white/10 rounded">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[10px] text-gray-500 bg-white/[0.02]">
              <th className="text-left px-3 py-2">服務名</th>
              <th className="text-left px-3 py-2">類別</th>
              <th className="text-left px-3 py-2">頻率</th>
              <th className="text-right px-3 py-2">單次 USD</th>
              <th className="text-right px-3 py-2">累計至今</th>
              <th className="text-left px-3 py-2">起始日</th>
              <th className="text-left px-3 py-2">結束日</th>
              <th className="text-center px-3 py-2">狀態</th>
              <th className="text-right px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.subscriptions.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-500">
                尚無訂閱，請點「一鍵回填歷史」或「新增訂閱」
              </td></tr>
            ) : data.subscriptions.map(s => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-white">
                  {s.service_name}
                  {s.vendor && <span className="text-gray-500 text-[10px] ml-1">/ {s.vendor}</span>}
                </td>
                <td className="px-3 py-2 text-gray-300">{CATEGORY_NAMES[s.category] || s.category}</td>
                <td className="px-3 py-2 text-gray-400">{
                  s.frequency === 'monthly' ? '月付' :
                  s.frequency === 'annual' ? '年付' :
                  s.frequency === 'one_time' ? '一次性' :
                  s.frequency === 'prepaid' ? '預付額度' : s.frequency
                }</td>
                <td className="px-3 py-2 text-right text-amber-400">${Number(s.amount_usd).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-red-300 font-semibold">${s.accumulated_usd.toFixed(2)}</td>
                <td className="px-3 py-2 text-gray-400">{s.started_at}</td>
                <td className="px-3 py-2 text-gray-400">{s.ended_at || '—'}</td>
                <td className="px-3 py-2 text-center">
                  {s.is_active ? (
                    <span className="text-green-400 text-[10px]">啟用</span>
                  ) : (
                    <span className="text-gray-500 text-[10px]">停用</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.is_active && (
                    <button onClick={() => deactivate(s.id, s.service_name)}
                      className="text-[10px] text-red-400 hover:text-red-300">停用</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddSubscriptionModal
          adminKey={adminKey}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchSubs(); onRefresh() }}
        />
      )}
      {showBackfill && (
        <BackfillSubscriptionsModal
          adminKey={adminKey}
          onClose={() => setShowBackfill(false)}
          onSaved={() => { setShowBackfill(false); fetchSubs(); onRefresh() }}
        />
      )}
    </div>
  )
}

// 新增訂閱 modal
function AddSubscriptionModal({ adminKey, onClose, onSaved }: {
  adminKey: string; onClose: () => void; onSaved: () => void
}) {
  const [serviceName, setServiceName] = useState('')
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState('hosting_monthly')
  const [frequency, setFrequency] = useState('monthly')
  const [amount, setAmount] = useState('')
  const [started, setStarted] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    const amt = Number(amount)
    if (!serviceName.trim()) { setErr('請填服務名'); return }
    if (!(amt > 0)) { setErr('金額需 > 0'); return }
    setSaving(true)
    try {
      const res = await adminFetch('/api/admin/accounting/subscriptions', {
        method: 'POST', adminKey,
        body: JSON.stringify({
          service_name: serviceName.trim(),
          vendor: vendor.trim() || undefined,
          category, frequency,
          amount_usd: amt,
          started_at: started,
          notes: notes.trim() || undefined,
          also_log_expense: true,
        }),
      })
      if (res.ok) onSaved()
      else { const body = await res.json().catch(() => ({ error: '儲存失敗' })); setErr(body.error || '儲存失敗') }
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-[#141c2e] rounded-xl border border-white/10 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-4">+ 新增固定訂閱</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">服務名 *</label>
            <input value={serviceName} onChange={e => setServiceName(e.target.value)}
              placeholder="例：Vercel Pro"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">供應商（選填）</label>
            <input value={vendor} onChange={e => setVendor(e.target.value)}
              placeholder="例：Vercel Inc"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">類別 *</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <option value="hosting_monthly">Hosting 月費</option>
                <option value="domain_annual">網域年費</option>
                <option value="domain_setup">網域一次性</option>
                <option value="ai_subscription">AI 訂閱工具</option>
                <option value="api_credit_topup">API 充值</option>
                <option value="font_license">字體授權</option>
                <option value="external_service">其他 SaaS</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">頻率 *</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <option value="monthly">月付</option>
                <option value="annual">年付</option>
                <option value="one_time">一次性</option>
                <option value="prepaid">預付額度</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">金額 USD *</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">起始日 *</label>
              <input type="date" value={started} onChange={e => setStarted(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">備註</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="例：老闆用 $200 Anthropic credit"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          {err && <div className="text-xs text-red-400">{err}</div>}
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 一鍵回填 modal
const DEFAULT_BACKFILL_ITEMS = [
  { service_name: 'Vercel Pro', vendor: 'Vercel Inc', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 20, started_at: '2026-04-01', checked: true },
  { service_name: 'Supabase Pro', vendor: 'Supabase', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 25, started_at: '2026-04-01', checked: false },
  { service_name: 'Fly.io Basic', vendor: 'Fly.io', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 10, started_at: '2026-04-01', checked: true },
  { service_name: 'Resend Pro', vendor: 'Resend', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 20, started_at: '2026-04-01', checked: false },
  { service_name: 'Cloudflare Workers Paid', vendor: 'Cloudflare', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 5, started_at: '2026-04-01', checked: false },
  { service_name: 'Upstash Redis Pro', vendor: 'Upstash', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 10, started_at: '2026-04-01', checked: false },
  { service_name: 'Sentry Team', vendor: 'Sentry', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 26, started_at: '2026-04-01', checked: false },
  { service_name: 'LangFuse Cloud', vendor: 'LangFuse', category: 'hosting_monthly', frequency: 'monthly', amount_usd: 29, started_at: '2026-04-01', checked: false },
  { service_name: 'jianyuan.life 域名', vendor: 'Namecheap', category: 'domain_annual', frequency: 'annual', amount_usd: 10, started_at: '2026-04-06', checked: true },
  { service_name: 'Claude Max Pro', vendor: 'Anthropic', category: 'ai_subscription', frequency: 'monthly', amount_usd: 200, started_at: '2026-04-01', checked: false },
  { service_name: 'Cursor Pro', vendor: 'Cursor', category: 'ai_subscription', frequency: 'monthly', amount_usd: 20, started_at: '2026-04-01', checked: false },
  { service_name: 'Anthropic 首次充值', vendor: 'Anthropic', category: 'api_credit_topup', frequency: 'prepaid', amount_usd: 200, started_at: '2026-04-06', checked: false },
]

function BackfillSubscriptionsModal({ adminKey, onClose, onSaved }: {
  adminKey: string; onClose: () => void; onSaved: () => void
}) {
  const [items, setItems] = useState(DEFAULT_BACKFILL_ITEMS.map(i => ({ ...i })))
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string>('')

  const run = async () => {
    setResult('')
    const selected = items.filter(i => i.checked).map(({ checked: _checked, ...rest }) => rest)
    if (selected.length === 0) { setResult('請至少勾選一項'); return }
    setSaving(true)
    try {
      const res = await adminFetch('/api/admin/accounting/subscriptions/backfill', {
        method: 'POST', adminKey,
        body: JSON.stringify({ items: selected, also_log_expense: true }),
      })
      if (res.ok) {
        const body = await res.json() as { results: Array<{ service_name: string; status: string }> }
        const inserted = body.results.filter(r => r.status === 'inserted').length
        const skipped = body.results.filter(r => r.status === 'skipped_duplicate').length
        setResult(`✅ 回填完成：新增 ${inserted} 筆、略過 ${skipped} 筆重複`)
        setTimeout(() => onSaved(), 1500)
      } else {
        const body = await res.json().catch(() => ({ error: '失敗' }))
        setResult(`❌ ${body.error || '失敗'}`)
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-[#141c2e] rounded-xl border border-white/10 p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-2">🔄 一鍵回填常見訂閱</h2>
        <p className="text-xs text-gray-400 mb-4">勾選目前有在用的服務，系統會寫入 fixed_subscriptions + expense_log（重複會自動跳過）。</p>
        <div className="space-y-2 mb-4">
          {items.map((it, i) => (
            <label key={i} className="flex items-center gap-3 p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer">
              <input type="checkbox" checked={it.checked}
                onChange={e => {
                  const next = [...items]
                  next[i] = { ...next[i], checked: e.target.checked }
                  setItems(next)
                }}
                className="w-4 h-4" />
              <div className="flex-1">
                <div className="text-sm text-white">{it.service_name}</div>
                <div className="text-[10px] text-gray-500">{it.vendor} · {CATEGORY_NAMES[it.category] || it.category} · {it.frequency === 'monthly' ? '月' : it.frequency === 'annual' ? '年' : it.frequency === 'one_time' ? '一次' : '預付'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-amber-400">${it.amount_usd}</div>
                <input type="date" value={it.started_at}
                  onChange={e => {
                    const next = [...items]
                    next[i] = { ...next[i], started_at: e.target.value }
                    setItems(next)
                  }}
                  className="text-[10px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-gray-400" />
              </div>
            </label>
          ))}
        </div>
        {result && <div className="mb-3 text-sm text-green-300">{result}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white">關閉</button>
          <button onClick={run} disabled={saving}
            className="px-4 py-2 bg-[#4E9AC7] hover:bg-[#4E9AC7]/80 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? '寫入中...' : `寫入勾選的 ${items.filter(i => i.checked).length} 項`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// v5.3.5 Tab：建設成本明細（expense_log 流水）
// ────────────────────────────────────────────────────────────
type ExpenseEntry = {
  id: string
  category: string
  subcategory: string | null
  amount_usd: number
  description: string | null
  source: string
  occurred_at: string | null
  report_id: string | null
}

function ExpensesTab({ adminKey }: { adminKey: string }) {
  const [entries, setEntries] = useState<ExpenseEntry[]>([])
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      // 透過 by-expense-category 拿最近明細；所有類別都要
      const res = await adminFetch(`/api/admin/accounting/by-expense-category?period=all`, { adminKey })
      if (res.ok) {
        const body = await res.json() as ByCategory
        setEntries((body.recent_entries || []) as ExpenseEntry[])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { load() }, [load])

  const filtered = filterCategory
    ? entries.filter(e => e.category === filterCategory)
    : entries
  const total = filtered.reduce((s, e) => s + Number(e.amount_usd || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-white">建設成本明細流水</h2>
        <div className="flex gap-2">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white">
            <option value="">全部類別</option>
            {Object.entries(CATEGORY_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="text-xs px-3 py-1.5 bg-white/5 text-gray-400 hover:bg-white/10 rounded">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      <div className="mb-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between">
        <span className="text-xs text-gray-400">顯示 {filtered.length} 筆</span>
        <span className="text-sm text-white">合計 <span className="text-red-300 font-semibold">${total.toFixed(2)}</span></span>
      </div>

      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[10px] text-gray-500 bg-white/[0.02]">
              <th className="text-left px-3 py-2">日期</th>
              <th className="text-left px-3 py-2">類別</th>
              <th className="text-left px-3 py-2">子類/服務</th>
              <th className="text-left px-3 py-2">描述</th>
              <th className="text-right px-3 py-2">金額</th>
              <th className="text-left px-3 py-2">來源</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">尚無符合條件的紀錄</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-gray-400 text-[10px]">
                  {e.occurred_at ? new Date(e.occurred_at).toLocaleString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                </td>
                <td className="px-3 py-2 text-gray-300">{CATEGORY_NAMES[e.category] || e.category}</td>
                <td className="px-3 py-2 text-gray-400">{e.subcategory || '—'}</td>
                <td className="px-3 py-2 text-gray-300 max-w-[360px] truncate">{e.description || '—'}</td>
                <td className="px-3 py-2 text-right text-red-300 font-mono">${Number(e.amount_usd).toFixed(2)}</td>
                <td className="px-3 py-2 text-gray-500 text-[10px]">{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// v5.3.5 Tab：單位經濟學
// ────────────────────────────────────────────────────────────
type PlanUE = {
  plan_code: string; name: string; price: number
  sold_count: number; completed_count: number
  total_revenue: number; total_cost: number; total_stripe_fee: number
  contribution: number
  avg_cost: number; avg_margin: number; margin_rate: number
  color: 'green' | 'yellow' | 'red'
  anomaly_count: number
}
type UEResponse = {
  period: { label: string }
  samples_too_few: boolean
  total_samples: number
  plans: PlanUE[]
  strategy: null | {
    total_sold: number; total_contribution_usd: number; avg_margin_usd: number
    best_plan: { code: string; name: string; margin_rate: number } | null
    worst_plan: { code: string; name: string; margin_rate: number } | null
    cac_ceiling_usd: number
  }
  anomalies: Array<{ report_id: string; client_name: string; plan_code: string; price: number; ai_cost: number; margin_pct: number; message: string }>
  suggestions: string[]
  details: Array<{
    id: string; client_name: string; plan_code: string; created_at: string
    price: number; ai_cost: number; stripe_fee: number; gross_margin: number; margin_pct: number
    status: string
    cost_by_stage: Record<string, number>
    cost_by_model: Record<string, number>
  }>
  note?: string
}

function UnitEconomicsTab({ adminKey, period }: { adminKey: string; period: PeriodKey }) {
  const [data, setData] = useState<UEResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/accounting/unit-economics?period=${period}`, { adminKey })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [adminKey, period])

  useEffect(() => { load() }, [load])

  if (!data) return <div className="p-8 text-gray-500">載入中…</div>

  return (
    <div>
      {data.note && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          ⓘ {data.note}
        </div>
      )}
      {data.samples_too_few && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs">
          ℹ️ 樣本總數 {data.total_samples} 份，可信度低，建議累積到 10+ 份再做戰略決策
        </div>
      )}

      {/* 6 方案排行榜 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {data.plans.length === 0 ? (
          <div className="col-span-3 p-8 text-center text-gray-500 bg-[#141c2e] rounded-xl border border-white/5">
            期間內尚無任何報告
          </div>
        ) : data.plans.map(p => {
          const colorCls =
            p.color === 'green' ? 'from-green-500/10 to-emerald-500/5 border-green-500/30' :
            p.color === 'yellow' ? 'from-yellow-500/10 to-amber-500/5 border-yellow-500/30' :
            'from-red-500/10 to-orange-500/5 border-red-500/30'
          return (
            <div key={p.plan_code} className={`bg-gradient-to-br ${colorCls} rounded-xl border p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-white">{p.name}</div>
                  <div className="text-[10px] text-gray-400">{p.plan_code} · 售價 ${p.price}</div>
                </div>
                <div className={`text-2xl font-bold ${
                  p.color === 'green' ? 'text-green-300' : p.color === 'yellow' ? 'text-yellow-300' : 'text-red-300'
                }`}>{p.margin_rate.toFixed(1)}%</div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-400">
                <div>售出：<span className="text-white">{p.sold_count}</span> 份</div>
                <div>完成：<span className="text-white">{p.completed_count}</span></div>
                <div>平均成本：<span className="text-amber-400">${p.avg_cost.toFixed(2)}</span></div>
                <div>平均毛利：<span className="text-green-400">${p.avg_margin.toFixed(2)}</span></div>
                <div>總貢獻：<span className="text-amber-300">${p.contribution.toFixed(2)}</span></div>
                {p.anomaly_count > 0 && <div>異常：<span className="text-red-400">{p.anomaly_count} 份</span></div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* 戰略 KPI */}
      {data.strategy && (
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
          <h2 className="text-base font-semibold text-white mb-3">戰略 KPI</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="最強方案" value={data.strategy.best_plan?.name || '—'} subLabel={data.strategy.best_plan ? `${data.strategy.best_plan.margin_rate.toFixed(1)}%` : ''} color="green" />
            <KpiCard label="最弱方案" value={data.strategy.worst_plan?.name || '—'} subLabel={data.strategy.worst_plan ? `${data.strategy.worst_plan.margin_rate.toFixed(1)}%` : ''} color="red" />
            <KpiCard label="平均每份毛利" value={`$${data.strategy.avg_margin_usd}`} subLabel={`樣本 ${data.strategy.total_sold} 份`} color="yellow" />
            <KpiCard label="建議 CAC 上限" value={`$${data.strategy.cac_ceiling_usd}`} subLabel="= 平均毛利 × 80%" color="green" />
          </div>
        </div>
      )}

      {/* 自動戰略建議 */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
          <h2 className="text-base font-semibold text-white mb-3">💡 自動戰略建議</h2>
          <ul className="space-y-1.5">
            {data.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-2">
                <span className="text-amber-400">▸</span><span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 異常清單 */}
      {data.anomalies && data.anomalies.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold text-red-300 mb-3">🔴 異常預警（毛利率 &lt; 50%）</h2>
          <div className="space-y-1">
            {data.anomalies.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-red-500/10 last:border-0">
                <span className="text-red-300 truncate flex-1 mr-3">{a.message}</span>
                <span className="text-[10px] text-gray-500 font-mono">{a.report_id.slice(0, 8)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 單份明細 Table */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">單份報告明細</h2>
          <button onClick={load} className="text-xs px-3 py-1.5 bg-white/5 text-gray-400 hover:bg-white/10 rounded">
            {loading ? '...' : '刷新'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-gray-500 bg-white/[0.02]">
                <th className="text-left px-3 py-2">日期</th>
                <th className="text-left px-3 py-2">客戶</th>
                <th className="text-left px-3 py-2">方案</th>
                <th className="text-right px-3 py-2">售價</th>
                <th className="text-right px-3 py-2">AI 成本</th>
                <th className="text-right px-3 py-2">Stripe 費</th>
                <th className="text-right px-3 py-2">毛利</th>
                <th className="text-right px-3 py-2">毛利率</th>
                <th className="text-center px-3 py-2">狀態</th>
                <th className="text-center px-3 py-2">展開</th>
              </tr>
            </thead>
            <tbody>
              {data.details.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">期間內尚無任何報告</td></tr>
              ) : data.details.map(d => (
                <React.Fragment key={d.id}>
                  <tr className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-gray-400 text-[10px]">
                      {d.created_at ? new Date(d.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-3 py-2 text-white">{d.client_name || '—'}</td>
                    <td className="px-3 py-2 text-amber-400">{d.plan_code}</td>
                    <td className="px-3 py-2 text-right text-green-400">${d.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-amber-400">${d.ai_cost.toFixed(4)}</td>
                    <td className="px-3 py-2 text-right text-cyan-400">${d.stripe_fee.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-300">${d.gross_margin.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      d.margin_pct >= 80 ? 'text-green-400' : d.margin_pct >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{d.margin_pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-center text-[10px] text-gray-400">{d.status}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                        className="text-[10px] text-[#4E9AC7] hover:text-[#4E9AC7]/80">
                        {expandedId === d.id ? '收合' : '展開'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === d.id && (
                    <tr>
                      <td colSpan={10} className="bg-white/[0.02] p-4">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="text-gray-400 mb-1 font-semibold">按階段 breakdown</div>
                            <div className="space-y-1">
                              {Object.entries(d.cost_by_stage).map(([stage, cost]) => (
                                <div key={stage} className="flex justify-between text-gray-300">
                                  <span>{stage}</span>
                                  <span className="text-amber-400">${cost.toFixed(4)}</span>
                                </div>
                              ))}
                              {Object.keys(d.cost_by_stage).length === 0 && (
                                <span className="text-gray-500">無 ai_cost_log 紀錄</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400 mb-1 font-semibold">按模型 breakdown</div>
                            <div className="space-y-1">
                              {Object.entries(d.cost_by_model).map(([model, cost]) => (
                                <div key={model} className="flex justify-between text-gray-300">
                                  <span className="font-mono text-[10px]">{model}</span>
                                  <span className="text-amber-400">${cost.toFixed(4)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// v5.3.5 Tab：匯出
// ────────────────────────────────────────────────────────────
function ExportTab({ exportCsv }: { exportCsv: (type: 'revenue' | 'expense' | 'combined') => Promise<void> }) {
  return (
    <div className="bg-[#141c2e] rounded-xl border border-white/5 p-6">
      <h2 className="text-lg font-bold text-white mb-4">報表匯出</h2>
      <p className="text-sm text-gray-400 mb-6">匯出 CSV 給會計師或自用 Excel 分析。</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button onClick={() => exportCsv('revenue')}
          className="p-5 bg-green-500/5 hover:bg-green-500/10 border border-green-500/30 rounded-xl text-left transition">
          <div className="text-2xl mb-2">💰</div>
          <div className="text-sm font-semibold text-green-300">收入 CSV</div>
          <div className="text-[10px] text-gray-500 mt-1">每筆 Stripe 付款</div>
        </button>
        <button onClick={() => exportCsv('expense')}
          className="p-5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/30 rounded-xl text-left transition">
          <div className="text-2xl mb-2">💸</div>
          <div className="text-sm font-semibold text-red-300">支出 CSV</div>
          <div className="text-[10px] text-gray-500 mt-1">AI / Hosting / 退款等</div>
        </button>
        <button onClick={() => exportCsv('combined')}
          className="p-5 bg-[#4E9AC7]/5 hover:bg-[#4E9AC7]/10 border border-[#4E9AC7]/30 rounded-xl text-left transition">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-sm font-semibold text-[#4E9AC7]">完整報表 CSV</div>
          <div className="text-[10px] text-gray-500 mt-1">收入 + 支出 + P&amp;L</div>
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 手動記錄支出 Modal
// ────────────────────────────────────────────────────────────
function ExpenseModal({ adminKey, onClose, onSaved }: {
  adminKey: string; onClose: () => void; onSaved: () => void
}) {
  const [category, setCategory] = useState('other')
  const [subcategory, setSubcategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    const amt = Number(amount)
    if (!(amt > 0)) { setErr('金額需 > 0'); return }
    setSaving(true)
    try {
      const res = await adminFetch('/api/admin/accounting/expense', {
        method: 'POST', adminKey,
        body: JSON.stringify({
          category, subcategory: subcategory || null,
          amount_usd: amt,
          description: description || null,
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        }),
      })
      if (res.ok) onSaved()
      else {
        const body = await res.json().catch(() => ({ error: '儲存失敗' }))
        setErr(body.error || '儲存失敗')
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-[#141c2e] rounded-xl border border-white/10 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-4">+ 記錄一筆費用</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">類別</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">小類別（選填，如 vercel / openai_credit）</label>
            <input type="text" value={subcategory} onChange={e => setSubcategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="例：vercel、voyage_credit、google_ads" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">金額 USD *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">日期</label>
            <input type="date" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="例：購買 Voyage AI API credit $50" />
          </div>
        </div>
        {err && <p className="text-red-400 text-xs mt-3">{err}</p>}
        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg text-sm hover:bg-white/10">
            取消
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-[#4E9AC7] text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
