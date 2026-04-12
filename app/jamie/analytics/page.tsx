'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
  R: '合否？', E1: '事件出門訣', E2: '月盤出門訣',
}

type FunnelData = {
  period: string
  funnel: {
    visitors: number
    signups: number
    checkoutViews: number
    payments: number
    completedReports: number
  }
  conversionRates: {
    visitorToSignup: string
    signupToCheckout: string
    checkoutToPayment: string
    paymentToCompleted: string
    overallConversion: string
  }
  byPlan: Record<string, { payments: number; revenue: number }>
  arpu: number
  avgGenerationMinutes: number
  _meta: {
    signupsFallback: boolean
    botFiltered: number
  }
}

const RANGES = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
]

// 漏斗階段定義
const FUNNEL_STAGES = [
  { key: 'visitors', label: '訪客', color: '#f59e0b' },
  { key: 'signups', label: '註冊', color: '#3b82f6' },
  { key: 'checkoutViews', label: '結帳頁', color: '#8b5cf6' },
  { key: 'payments', label: '付款', color: '#10b981' },
  { key: 'completedReports', label: '報告完成', color: '#06b6d4' },
] as const

export default function AnalyticsPage() {
  const { adminKey } = useAdminAuth()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchFunnel = useCallback(async (d: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/jamie/funnel?key=${encodeURIComponent(adminKey)}&days=${d}`)
      if (!res.ok) throw new Error('API 錯誤')
      const json = await res.json()
      setData(json)
    } catch {
      setError('無法載入數據')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => {
    if (adminKey) fetchFunnel(days)
  }, [adminKey, days, fetchFunnel])

  const handleRangeChange = (d: number) => {
    setDays(d)
  }

  // 漏斗最大值（用於計算寬度比例）
  const maxVal = data ? Math.max(data.funnel.visitors, 1) : 1

  // 各階段之間的轉化率
  const getStepRate = (idx: number): string => {
    if (!data || idx === 0) return ''
    const keys = FUNNEL_STAGES.map(s => s.key)
    const prev = data.funnel[keys[idx - 1] as keyof typeof data.funnel] as number
    const curr = data.funnel[keys[idx] as keyof typeof data.funnel] as number
    if (prev === 0) return '0.0%'
    return `${(curr / prev * 100).toFixed(1)}%`
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 標題與時間選擇 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">數據分析</h1>
          <p className="text-sm text-gray-400 mt-1">轉化漏斗與營收分析</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => handleRangeChange(r.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                days === r.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500/50 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button onClick={() => fetchFunnel(days)} className="mt-3 text-sm text-amber-400 hover:underline">
            重試
          </button>
        </div>
      ) : data ? (
        <>
          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KPICard label="總訪客" value={data.funnel.visitors.toLocaleString()} />
            <KPICard label="總營收" value={`$${Object.values(data.byPlan).reduce((s, p) => s + p.revenue, 0).toFixed(2)}`} />
            <KPICard label="平均客單價" value={`$${data.arpu.toFixed(2)}`} sub="平均每付費用戶收入" />
            <KPICard label="平均生成時間" value={`${data.avgGenerationMinutes} 分鐘`} />
          </div>

          {/* 轉化漏斗 */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-6 mb-8">
            <h2 className="text-lg font-bold text-white mb-6">轉化漏斗</h2>
            <div className="space-y-4">
              {FUNNEL_STAGES.map((stage, idx) => {
                const val = data.funnel[stage.key as keyof typeof data.funnel] as number
                const widthPct = Math.max((val / maxVal) * 100, 4)
                const stepRate = getStepRate(idx)
                return (
                  <div key={stage.key}>
                    {/* 階段間轉化率箭頭 */}
                    {idx > 0 && (
                      <div className="flex items-center gap-2 ml-4 mb-2 text-xs text-gray-500">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                        <span>{stepRate}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-20 shrink-0 text-sm text-gray-400 text-right">{stage.label}</div>
                      <div className="flex-1 relative">
                        <div
                          className="h-10 rounded-lg flex items-center px-4 transition-all duration-500"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: stage.color,
                            minWidth: '60px',
                          }}
                        >
                          <span className="text-sm font-bold text-white whitespace-nowrap">
                            {val.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* 總體轉化率 */}
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-sm text-gray-400">總體轉化率（訪客 → 付款）</span>
              <span className="text-lg font-bold text-amber-400">{data.conversionRates.overallConversion}</span>
            </div>
            {data._meta.signupsFallback && (
              <p className="text-xs text-gray-600 mt-2">* 註冊數為估算值（基於付費用戶去重）</p>
            )}
          </div>

          {/* 方案營收表 */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-6 mb-8">
            <h2 className="text-lg font-bold text-white mb-4">各方案營收</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">方案</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">付款數</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">營收（美元）</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-medium">佔比</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byPlan)
                    .sort(([, a], [, b]) => b.revenue - a.revenue)
                    .map(([plan, info]) => {
                      const totalRev = Object.values(data.byPlan).reduce((s, p) => s + p.revenue, 0)
                      const pct = totalRev > 0 ? (info.revenue / totalRev * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={plan} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-white font-medium">{PLAN_NAMES[plan] || plan}</td>
                          <td className="py-3 px-4 text-right text-gray-300">{info.payments}</td>
                          <td className="py-3 px-4 text-right text-amber-400 font-medium">${info.revenue.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-gray-400">{pct}%</td>
                        </tr>
                      )
                    })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10">
                    <td className="py-3 px-4 text-white font-bold">合計</td>
                    <td className="py-3 px-4 text-right text-white font-bold">
                      {Object.values(data.byPlan).reduce((s, p) => s + p.payments, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-400 font-bold">
                      ${Object.values(data.byPlan).reduce((s, p) => s + p.revenue, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-400">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 額外資訊 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard label="Bot 訪問已過濾" value={data._meta.botFiltered.toLocaleString()} sub="已自動排除" />
            <KPICard label="報告完成率" value={data.conversionRates.paymentToCompleted} sub="付款 → 完成" />
            <KPICard label="分析期間" value={data.period} />
          </div>
        </>
      ) : null}
    </div>
  )
}

// KPI 卡片元件
function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}
