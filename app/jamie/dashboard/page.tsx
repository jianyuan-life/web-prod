'use client'

// BI 儀表板總覽頁（L7+ 2026-04-17）
// 將今日快照、營收趨勢、方案銷售排行、客戶 Funnel、AI 成本、系統健康整合成一頁

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { PLAN_NAMES, ALL_PLAN_CODES } from '@/lib/plan-names'


const PLAN_COLORS: Record<string, string> = {
  C: '#4E9AC7', D: '#10b981', G15: '#f59e0b',
  R: '#ef4444', E1: '#8b5cf6', E2: '#ec4899', other: '#6b7280',
}

type Snapshot = {
  today: {
    orders: number; orders_delta_pct: number | null
    revenue_usd: number; revenue_twd: number; revenue_delta_pct: number | null
    reports_completed: number; reports_failed: number; reports_generating: number
    dau: number; dau_delta_pct: number | null
    paying_customers: number; paying_customers_delta_pct: number | null
    free_tool_usage: number
  }
  yesterday: {
    orders: number; revenue_usd: number; dau: number; paying_customers: number
  }
}

type RevenueTrend = {
  period: string; granularity: string
  total_revenue_usd: number; aov: number; mrr_usd: number
  growth_pct: number | null
  trend: Array<{ bucket: string; total: number } & Record<string, number>>
  plan_ranking: Array<{ plan: string; orders: number; revenue_usd: number; unique_customers: number; aov: number }>
  e2_cohort: {
    first_purchase_users: number
    m2_retention_users: number
    m3_retention_users: number
    m6_retention_users: number
    m12_retention_users: number
  }
}

type FunnelData = {
  funnel: Array<{ step: string; label: string; count: number; conversion_from_prev_pct: number | null; conversion_from_top_pct: number | null }>
  note?: string
}

type AIBalance = {
  name: string; balance: string; currency: string
  status: 'ok' | 'warning' | 'critical' | 'error'
  detail?: string
}

type SystemHealth = {
  services: Array<{ name: string; status: 'ok' | 'warn' | 'error'; latency_ms: number; message: string }>
  email_delivery: { total: number; sent: number; delivered: number; bounced: number; failed: number; delivery_rate_pct: number | null; note: string | null }
  report_generation: { total: number; completed: number; failed: number; generating: number; success_rate_pct: number | null }
  overall: string
}

// KPI 卡
function KpiCard({ label, value, delta, prefix = '', suffix = '', hint }:
  { label: string; value: number | string; delta?: number | null; prefix?: string; suffix?: string; hint?: string }) {
  return (
    <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5 hover:border-[#4E9AC7]/40 transition">
      <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold text-white">
        {prefix}{value}{suffix}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`text-[10px] mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs 昨日
        </div>
      )}
      {hint && <div className="text-[10px] text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { adminKey } = useAdminAuth()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revenue, setRevenue] = useState<RevenueTrend | null>(null)
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [aiBalances, setAiBalances] = useState<AIBalance[]>([])
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '12m'>('30d')
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async (p: typeof period) => {
    if (!adminKey) return
    setLoading(true)
    try {
      const [snapRes, revRes, funRes, healthRes, aiRes] = await Promise.all([
        adminFetch('/api/admin/dashboard/snapshot', { adminKey }),
        adminFetch(`/api/admin/dashboard/revenue?period=${p}`, { adminKey }),
        adminFetch(`/api/admin/dashboard/funnel?days=${p === '12m' ? 365 : p === '90d' ? 90 : p === '30d' ? 30 : 7}`, { adminKey }),
        adminFetch('/api/admin/dashboard/system-health', { adminKey }),
        adminFetch('/api/admin/ai-balance', { adminKey }),
      ])
      if (snapRes.ok) setSnapshot(await snapRes.json())
      if (revRes.ok) setRevenue(await revRes.json())
      if (funRes.ok) setFunnel(await funRes.json())
      if (healthRes.ok) setHealth(await healthRes.json())
      if (aiRes.ok) {
        const d = await aiRes.json()
        setAiBalances(d.balances || [])
      }
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { fetchAll(period) }, [period, fetchAll])

  const snap = snapshot?.today

  return (
    <div className="p-6 max-w-[1400px] mx-auto" style={{ background: '#0A0F1E', minHeight: '100vh' }}>
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">BI 儀表板</h1>
          <p className="text-xs text-gray-400">
            {snapshot ? `快照時間：${new Date().toLocaleString('zh-TW')}` : '載入中...'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {(['7d', '30d', '90d', '12m'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${period === p ? 'bg-[#4E9AC7] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {p === '7d' ? '7 天' : p === '30d' ? '30 天' : p === '90d' ? '90 天' : '12 月'}
            </button>
          ))}
          <button onClick={() => fetchAll(period)} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '更新中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 系統健康條（最上面） */}
      {health && (
        <div className={`mb-6 rounded-xl border p-3 flex items-center justify-between ${
          health.overall === 'healthy' ? 'border-green-500/30 bg-green-500/5' :
          health.overall === 'unhealthy' ? 'border-red-500/30 bg-red-500/5' :
          'border-yellow-500/30 bg-yellow-500/5'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${
              health.overall === 'healthy' ? 'bg-green-400' : health.overall === 'unhealthy' ? 'bg-red-400' : 'bg-yellow-400'
            } animate-pulse`} />
            <span className="text-sm font-medium text-white">
              系統狀態：{health.overall === 'healthy' ? '健康' : health.overall === 'unhealthy' ? '異常' : '部分降級'}
            </span>
            <span className="text-xs text-gray-400">
              （{health.services.filter(s => s.status === 'ok').length} / {health.services.length} 正常）
            </span>
          </div>
          <div className="flex gap-4 text-xs">
            {health.services.map(s => (
              <span key={s.name} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'ok' ? 'bg-green-400' : s.status === 'error' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <span className="text-gray-400">{s.name}</span>
                <span className="text-gray-500">{s.latency_ms}ms</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 今日快照 KPI */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">今日快照</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="今日訂單" value={snap?.orders ?? 0} delta={snap?.orders_delta_pct} />
          <KpiCard label="今日營收" prefix="$" value={snap?.revenue_usd?.toFixed(2) ?? '0.00'} suffix=" USD" delta={snap?.revenue_delta_pct}
            hint={`≈ NT$${snap?.revenue_twd?.toFixed(0) || 0}`} />
          <KpiCard label="DAU" value={snap?.dau ?? 0} delta={snap?.dau_delta_pct} />
          <KpiCard label="付費客戶" value={snap?.paying_customers ?? 0} delta={snap?.paying_customers_delta_pct} />
          <KpiCard label="報告完成" value={snap?.reports_completed ?? 0} hint={`生成中 ${snap?.reports_generating ?? 0}`} />
          <KpiCard label="報告失敗" value={snap?.reports_failed ?? 0}
            hint={snap && snap.reports_failed > 0 ? '⚠ 需關注' : ''} />
          <KpiCard label="免費工具" value={snap?.free_tool_usage ?? 0} hint="今日使用量" />
        </div>
      </div>

      {/* 今日財務（會計系統） */}
      <TodayAccountingCard />

      {/* 營收趨勢（堆疊面積圖） */}
      {revenue && (
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">營收趨勢</h2>
              <p className="text-[11px] text-gray-400">
                總營收：${revenue.total_revenue_usd} USD
                {revenue.growth_pct !== null && (
                  <span className={`ml-2 ${revenue.growth_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {revenue.growth_pct >= 0 ? '▲' : '▼'} {Math.abs(revenue.growth_pct)}%
                  </span>
                )}
                <span className="ml-3 text-gray-500">AOV ${revenue.aov}</span>
                <span className="ml-3 text-gray-500">MRR ${revenue.mrr_usd}（E2）</span>
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenue.trend}>
              <defs>
                {Object.keys(PLAN_COLORS).map(k => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PLAN_COLORS[k]} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={PLAN_COLORS[k]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ALL_PLAN_CODES.map(k => (
                <Area key={k} type="monotone" dataKey={k} stackId="1"
                  stroke={PLAN_COLORS[k]} fill={`url(#grad-${k})`}
                  name={PLAN_NAMES[k]} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 方案銷售排行 & Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* 方案銷售排行 */}
        {revenue && (
          <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-3">方案銷售排行</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue.plan_ranking.map(p => ({ ...p, name: PLAN_NAMES[p.plan] || p.plan }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#e5e5e5' }} width={80} />
                <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="revenue_usd" fill="#4E9AC7" name="營收 USD" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1 text-xs">
              {revenue.plan_ranking.map(p => (
                <div key={p.plan} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                  <span className="text-white">{PLAN_NAMES[p.plan] || p.plan}</span>
                  <span className="text-gray-400">
                    {p.orders} 筆 / ${p.revenue_usd} / 獨立客戶 {p.unique_customers} / AOV ${p.aov}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Funnel 轉化漏斗 */}
        {funnel && (
          <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-3">客戶轉化漏斗</h2>
            <div className="space-y-2">
              {funnel.funnel.map((step, i) => {
                const pct = step.conversion_from_top_pct ?? 0
                return (
                  <div key={step.step} className="relative">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-white">{step.label}</span>
                      <span className="text-gray-400">
                        {step.count} 人
                        {step.conversion_from_prev_pct !== null && i > 0 && (
                          <span className={`ml-2 ${step.conversion_from_prev_pct >= 50 ? 'text-green-400' : step.conversion_from_prev_pct >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                            ({step.conversion_from_prev_pct}% ↓)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 bg-white/5 rounded overflow-hidden">
                      <div className="h-full rounded flex items-center justify-end pr-2 text-[10px] text-white/80 font-medium"
                        style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, #4E9AC7 0%, ${PLAN_COLORS[ALL_PLAN_CODES[i % ALL_PLAN_CODES.length]] || '#4E9AC7'} 100%)` }}>
                        {pct}%
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {funnel.note && (
              <div className="mt-3 text-[10px] text-amber-400">
                ⓘ {funnel.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* E2 續訂 Cohort & AI 餘額 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {revenue && (
          <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-3">E2 月度單盤 — 續訂留存</h2>
            <p className="text-[11px] text-gray-400 mb-4">以首次購買者為 100%，計算第 2/3/6/12 個月仍有回購的比例</p>
            <div className="grid grid-cols-4 gap-3">
              {(['m2', 'm3', 'm6', 'm12'] as const).map(k => {
                const totalKey = `${k}_retention_users` as keyof typeof revenue.e2_cohort
                const num = revenue.e2_cohort[totalKey]
                const base = revenue.e2_cohort.first_purchase_users
                const pct = base > 0 ? Math.round((num / base) * 1000) / 10 : 0
                return (
                  <div key={k} className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-gray-400 mb-1">M{k.slice(1)}</div>
                    <div className="text-xl font-bold text-[#4E9AC7]">{pct}%</div>
                    <div className="text-[10px] text-gray-500 mt-1">{num} / {base}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AI 餘額 */}
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-base font-semibold text-white mb-3">AI API 餘額（7 家）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {aiBalances.map(b => (
              <div key={b.name} className={`rounded-lg p-3 border ${
                b.status === 'ok' ? 'border-green-500/30 bg-green-500/5' :
                b.status === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                b.status === 'critical' ? 'border-red-500/30 bg-red-500/5 animate-pulse' :
                'border-gray-500/30 bg-gray-500/5'
              }`}>
                <div className="text-[10px] text-gray-400 mb-1">{b.name}</div>
                <div className={`text-lg font-bold ${
                  b.status === 'ok' ? 'text-green-400' :
                  b.status === 'warning' ? 'text-yellow-400' :
                  b.status === 'critical' ? 'text-red-400' : 'text-gray-400'
                }`}>{b.balance}</div>
                {b.detail && <div className="text-[10px] text-gray-500 mt-1">{b.detail}</div>}
              </div>
            ))}
            {aiBalances.length === 0 && <div className="text-xs text-gray-500 col-span-full py-4">載入中...</div>}
          </div>
        </div>
      </div>

      {/* Email 送達 & 報告生成成功率 */}
      {health && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-3">Email 送達率（24h）</h2>
            {health.email_delivery.delivery_rate_pct !== null ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '已送達', value: health.email_delivery.sent },
                        { name: '退信', value: health.email_delivery.bounced },
                        { name: '失敗', value: health.email_delivery.failed },
                      ].filter(x => x.value > 0)}
                      dataKey="value" nameKey="name"
                      innerRadius={50} outerRadius={75}
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#4E9AC7]">{health.email_delivery.delivery_rate_pct}%</div>
                  <div className="text-[10px] text-gray-500">
                    總共 {health.email_delivery.total} 封｜退信 {health.email_delivery.bounced}｜失敗 {health.email_delivery.failed}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-amber-400">
                {health.email_delivery.note}
              </div>
            )}
          </div>

          <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
            <h2 className="text-base font-semibold text-white mb-3">報告生成成功率（24h）</h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[
                  { name: '完成', value: health.report_generation.completed },
                  { name: '失敗', value: health.report_generation.failed },
                  { name: '生成中', value: health.report_generation.generating },
                ].filter(x => x.value > 0)} dataKey="value" nameKey="name"
                  innerRadius={50} outerRadius={75}>
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#4E9AC7" />
                </Pie>
                <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#4E9AC7]">
                {health.report_generation.success_rate_pct ?? 0}%
              </div>
              <div className="text-[10px] text-gray-500">
                完成 {health.report_generation.completed} / 失敗 {health.report_generation.failed} / 生成中 {health.report_generation.generating}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 快速連結 */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-3">深入查看</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <a href="/jamie/orders" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">訂單管理 →</a>
          <a href="/jamie/reports" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">報告管理 →</a>
          <a href="/jamie/refunds" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">退款管理 →</a>
          <a href="/jamie/accounting" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">會計系統 →</a>
          <a href="/jamie/ai-cost" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">AI 成本監控 →</a>
          <a href="/jamie/monitoring" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">系統監控 →</a>
          <a href="/jamie/audit-log" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">稽核日誌 →</a>
          <a href="/jamie/loyalty" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">客戶忠誠度 →</a>
          <a href="/jamie/feedback" className="p-3 bg-white/5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition">客戶反饋 →</a>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 今日財務卡片 — 會計系統 Summary
// ────────────────────────────────────────────────────────────
function TodayAccountingCard() {
  const { adminKey } = useAdminAuth()
  type TAC = {
    today_revenue: number; today_ai_cost: number; today_net_profit: number
    month_revenue: number; month_expense: number; month_net_profit: number
    ai_budget_pct: number; ai_budget_usd: number
  }
  const [data, setData] = useState<TAC | null>(null)

  useEffect(() => {
    if (!adminKey) return
    Promise.all([
      adminFetch('/api/admin/accounting/summary?period=this_month', { adminKey }),
      adminFetch('/api/admin/accounting/daily?period=7d', { adminKey }),
    ]).then(async ([s, d]) => {
      if (!s.ok || !d.ok) return
      const sj = await s.json()
      const dj = await d.json()
      const today = new Date().toISOString().slice(0, 10)
      const todayRow = (dj.daily || []).find((x: { date: string }) => x.date === today)
      setData({
        today_revenue: todayRow?.revenue || 0,
        today_ai_cost: todayRow?.ai_cost || 0,
        today_net_profit: todayRow?.net_profit || 0,
        month_revenue: sj.this_month_pnl?.revenue?.total_usd || 0,
        month_expense: sj.this_month_pnl?.expense?.total_usd || 0,
        month_net_profit: sj.this_month_pnl?.profit?.net_profit_usd || 0,
        ai_budget_pct: sj.ai_budget_pct || 0,
        ai_budget_usd: sj.ai_budget_usd || 0,
      })
    }).catch(() => { /* noop */ })
  }, [adminKey])

  if (!data) return null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">今日財務</h2>
        <a href="/jamie/accounting" className="text-xs text-[#4E9AC7] hover:underline">查看完整會計 →</a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">今日收入</div>
          <div className="text-xl font-bold text-green-400">${data.today_revenue.toFixed(2)}</div>
        </div>
        <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">今日 AI 成本</div>
          <div className="text-xl font-bold text-red-400">${data.today_ai_cost.toFixed(4)}</div>
        </div>
        <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">今日淨利</div>
          <div className={`text-xl font-bold ${data.today_net_profit >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {data.today_net_profit >= 0 ? '+' : ''}${data.today_net_profit.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">本月累計收入</div>
          <div className="text-xl font-bold text-green-300">${data.month_revenue.toFixed(2)}</div>
        </div>
        <div className="bg-[#141c2e] rounded-xl p-4 border border-white/5">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">本月累計支出</div>
          <div className="text-xl font-bold text-red-300">${data.month_expense.toFixed(2)}</div>
        </div>
        <div className={`rounded-xl p-4 border ${
          data.month_net_profit >= 0 ? 'bg-[#141c2e] border-amber-500/30' : 'bg-red-500/5 border-red-500/40'
        }`}>
          <div className="text-[10px] text-gray-400 mb-1 uppercase">本月淨利</div>
          <div className={`text-xl font-bold ${data.month_net_profit >= 0 ? 'text-amber-300' : 'text-red-300'}`}>
            {data.month_net_profit >= 0 ? '+' : ''}${data.month_net_profit.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            AI 預算 {data.ai_budget_pct}% / ${data.ai_budget_usd}
          </div>
        </div>
      </div>
    </div>
  )
}
