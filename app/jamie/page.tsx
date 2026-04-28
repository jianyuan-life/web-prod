'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from './layout'
import { adminFetch } from '@/lib/admin-fetch'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件擇吉', E2:'月度單盤',
}

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

type AdminData = {
  range: string
  overview: {
    unique_visitors: number; total_pageviews: number; total_orders: number
    completed_reports: number; total_revenue_usd: number
    free_tool_usage: number; conversion_rate_pct: number
    bot_pageviews?: number; test_orders?: number
  }
  top_products: { plan: string; count: number; revenue: number }[]
  top_pages: { path: string; count: number }[]
  geo_distribution: { country: string; count: number; pct: number }[]
  device_distribution: Record<string, number>
  recent_orders: { id: string; client_name: string; plan_code: string; amount_usd: number; status: string; created_at: string }[]
  daily_revenue?: { date: string; revenue: number; orders: number }[]
}

const PAGE_NAMES: Record<string, string> = {
  '/': '首頁', '/pricing': '方案與定價', '/tools/bazi': '免費八字速算',
  '/tools/ziwei': '免費紫微速算', '/tools/name': '免費姓名鑑定',
  '/checkout': '結帳頁', '/auth/login': '登入', '/auth/signup': '註冊',
  '/dashboard': '用戶儀表板', '/blog': '知識部落格', '/jamie': '管理後台',
}

const COUNTRY_NAMES: Record<string, string> = {
  TW:'台灣', HK:'香港', CN:'中國', JP:'日本', SG:'新加坡', US:'美國',
  MY:'馬來西亞', AU:'澳洲', CA:'加拿大', GB:'英國', KR:'韓國',
  DE:'德國', FR:'法國', NL:'荷蘭', IN:'印度', TH:'泰國', PH:'菲律賓',
  '':'未知',
}

type AIBalance = {
  name: string
  balance: string
  currency: string
  status: 'ok' | 'warning' | 'critical' | 'error'
  detail?: string
}

export default function AdminOverview() {
  const { adminKey } = useAdminAuth()
  const [data, setData] = useState<AdminData | null>(null)
  const [range, setRange] = useState('7d')
  const [loading, setLoading] = useState(false)
  const [aiBalances, setAiBalances] = useState<AIBalance[]>([])
  const [aiCheckedAt, setAiCheckedAt] = useState('')

  const fetchData = useCallback(async (r: string) => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin?range=${r}`, { adminKey })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [adminKey])

  const fetchAIBalance = useCallback(async () => {
    if (!adminKey) return
    try {
      const res = await adminFetch(`/api/admin/ai-balance`, { adminKey })
      if (res.ok) {
        const d = await res.json()
        setAiBalances(d.balances || [])
        setAiCheckedAt(d.checked_at || '')
      }
    } catch { /* ignore */ }
  }, [adminKey])

  useEffect(() => { fetchData(range) }, [range, fetchData])
  useEffect(() => { fetchAIBalance() }, [fetchAIBalance])

  if (!data) return <div className="p-8 text-gray-500">載入中...</div>

  const o = data.overview
  const pieData = data.top_products.map(p => ({ name: PLAN_NAMES[p.plan] || p.plan, value: p.count }))
  const recentActivity = data.recent_orders.slice(0, 5)

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">總覽</h1>
          <p className="text-xs text-gray-500">鑒源後台管理</p>
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${range === r ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {r === '7d' ? '7天' : r === '30d' ? '30天' : '90天'}
            </button>
          ))}
          <button onClick={() => fetchData(range)} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: '訪客數', value: o.unique_visitors, color: 'text-blue-400' },
          { label: '瀏覽量', value: o.total_pageviews, color: 'text-cyan-400' },
          { label: '免費速算', value: o.free_tool_usage, color: 'text-purple-400' },
          { label: '訂單數', value: o.total_orders, color: 'text-green-400' },
          { label: '完成報告', value: o.completed_reports, color: 'text-emerald-400' },
          { label: '營收（美元）', value: `$${o.total_revenue_usd}`, color: 'text-amber-400' },
          { label: '轉化率', value: `${o.conversion_rate_pct}%`, color: 'text-rose-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5">
            <div className="text-[10px] text-gray-500 mb-1">{kpi.label}</div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* AI API 餘額監控 */}
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">AI API 餘額監控</h3>
          <div className="flex items-center gap-2">
            {aiCheckedAt && <span className="text-[10px] text-gray-500">更新：{new Date(aiCheckedAt).toLocaleTimeString('zh-TW')}</span>}
            <button onClick={fetchAIBalance} className="px-2 py-1 bg-white/5 rounded text-[10px] text-gray-400 hover:bg-white/10">刷新</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {aiBalances.map(b => (
            <div key={b.name} className={`rounded-lg p-4 border ${
              b.status === 'ok' ? 'border-green-500/30 bg-green-500/5' :
              b.status === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
              b.status === 'critical' ? 'border-red-500/30 bg-red-500/5 animate-pulse' :
              'border-gray-500/30 bg-gray-500/5'
            }`}>
              <div className="text-[10px] text-gray-400 mb-1">{b.name}</div>
              <div className={`text-lg font-bold ${
                b.status === 'ok' ? 'text-green-400' :
                b.status === 'warning' ? 'text-yellow-400' :
                b.status === 'critical' ? 'text-red-400' :
                'text-gray-400'
              }`}>{b.balance}</div>
              {b.detail && <div className="text-[10px] text-gray-500 mt-1">{b.detail}</div>}
            </div>
          ))}
          {aiBalances.length === 0 && <div className="text-xs text-gray-500 col-span-3">載入中...</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* 收入折線圖 */}
        <div className="lg:col-span-2 bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-400 rounded-full" />
              收入趨勢
            </h3>
            <span className="text-[10px] text-gray-500">USD / 日</span>
          </div>
          {data.daily_revenue && data.daily_revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily_revenue}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-gray-500">
              營收數據將在有訂單後顯示
            </div>
          )}
        </div>

        {/* 方案圓餅圖 */}
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-amber-400 rounded-full" />
            方案分佈
          </h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {pieData.map((d, i) => (
                  <span key={d.name} className="text-[10px] text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          ) : <div className="h-[180px] flex items-center justify-center text-sm text-gray-500">暫無訂單</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* 即時活動流 */}
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-4">最近活動</h3>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map(order => (
                <div key={order.id} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${order.status === 'completed' ? 'bg-green-400' : order.status === 'generating' ? 'bg-blue-400' : order.status === 'pending' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-white">{order.client_name}</span>
                    <span className="text-gray-500 mx-1.5">購買</span>
                    <span className="text-amber-400">{PLAN_NAMES[order.plan_code] || order.plan_code}</span>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{new Date(order.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">暫無活動</p>}
        </div>

        {/* 客戶地理分佈 */}
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <h3 className="text-sm font-semibold text-white mb-4">地理分佈</h3>
          {data.geo_distribution.length > 0 ? (
            <div className="space-y-2">
              {data.geo_distribution.slice(0, 8).map((g, i) => (
                <div key={g.country} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-3">{i + 1}</span>
                  <span className="text-xs text-white flex-1">{COUNTRY_NAMES[g.country] || g.country}</span>
                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${g.pct}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-8 text-right">{g.pct}%</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">暫無數據</p>}
        </div>
      </div>

      {/* 熱門頁面 */}
      <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
        <h3 className="text-sm font-semibold text-white mb-4">熱門頁面 Top 10</h3>
        {data.top_pages.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {data.top_pages.map((p, i) => (
              <div key={p.path} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-gray-500 w-3">{i + 1}</span>
                  <span className="text-xs text-gray-300 truncate">{PAGE_NAMES[p.path] || (p.path.startsWith('/report/') ? `客戶報告頁` : p.path.startsWith('/blog/') ? '部落格文章' : p.path)}</span>
                </div>
                <span className="text-[10px] text-gray-500 shrink-0 ml-2">{p.count}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">暫無數據</p>}
      </div>
    </div>
  )
}
