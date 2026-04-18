'use client'

// AI 成本監控頁（L7+ 2026-04-17）
// 對應 API：/api/admin/dashboard/ai-cost

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

type AICost = {
  period: string
  total_cost_usd: number
  daily: Array<{ date: string; total: number; claude: number; deepseek: number; kimi: number; moonshot: number; other: number }>
  by_provider: Record<string, { cost_usd: number; calls: number; prompt_tokens: number; completion_tokens: number; avg_cost_usd: number }>
  by_plan: Record<string, { cost_usd: number; calls: number; avg_cost_usd: number }>
  by_model: Array<{ model: string; provider: string; cost_usd: number; calls: number; avg_cost_usd: number }>
  top_expensive_calls: Array<{ id: string; report_id: string | null; plan_code: string | null; provider: string; model: string; cost_usd: number; prompt_tokens: number | null; completion_tokens: number | null; created_at: string | null }>
  month_to_date_usd: number
  budget_usd: number
  budget_usage_pct: number
  alert: 'critical' | 'warning' | null
  note?: string
}

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
  R: '合否？', E1: '事件出門訣', E2: '月度出門訣',
}

const PROVIDER_COLOR: Record<string, string> = {
  claude: '#4E9AC7',
  deepseek: '#10b981',
  kimi: '#f59e0b',
  moonshot: '#8b5cf6',
  other: '#6b7280',
}

export default function AICostPage() {
  const { adminKey } = useAdminAuth()
  const [data, setData] = useState<AICost | null>(null)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async (p: typeof period) => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/dashboard/ai-cost?period=${p}`, { adminKey })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  if (!data) return <div className="p-8 text-gray-500">載入中...</div>

  return (
    <div className="p-6 max-w-[1400px]" style={{ background: '#0A0F1E', minHeight: '100vh' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">AI 成本監控</h1>
          <p className="text-xs text-gray-400">Claude / DeepSeek / Kimi / Moonshot 等 AI 呼叫花費</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${period === p ? 'bg-[#4E9AC7] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {p === '7d' ? '7 天' : p === '30d' ? '30 天' : '90 天'}
            </button>
          ))}
          <button onClick={() => fetchData(period)} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {data.note && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          ⓘ {data.note}
        </div>
      )}

      {/* 預算與本月累計 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-4">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">期間總花費</div>
          <div className="text-2xl font-bold text-white">${data.total_cost_usd}</div>
        </div>
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-4">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">本月累計</div>
          <div className="text-2xl font-bold text-white">${data.month_to_date_usd}</div>
          <div className="text-[10px] text-gray-500 mt-1">預算 ${data.budget_usd}</div>
        </div>
        <div className={`rounded-xl border p-4 ${
          data.alert === 'critical' ? 'border-red-500/40 bg-red-500/5 animate-pulse' :
          data.alert === 'warning' ? 'border-yellow-500/40 bg-yellow-500/5' :
          'border-white/5 bg-[#141c2e]'
        }`}>
          <div className="text-[10px] text-gray-400 mb-1 uppercase">預算使用率</div>
          <div className={`text-2xl font-bold ${
            data.alert === 'critical' ? 'text-red-400' :
            data.alert === 'warning' ? 'text-yellow-400' : 'text-green-400'
          }`}>{data.budget_usage_pct}%</div>
          {data.alert === 'critical' && <div className="text-[10px] text-red-400 mt-1">⚠ 超出月預算</div>}
          {data.alert === 'warning' && <div className="text-[10px] text-yellow-400 mt-1">⚠ 接近預算上限</div>}
        </div>
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-4">
          <div className="text-[10px] text-gray-400 mb-1 uppercase">總呼叫次數</div>
          <div className="text-2xl font-bold text-white">
            {Object.values(data.by_provider).reduce((s, v) => s + v.calls, 0)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {Object.values(data.by_provider).reduce((s, v) => s + v.prompt_tokens + v.completion_tokens, 0).toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* 每日花費趨勢 */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-3">每日花費趨勢（USD）</h2>
        {data.daily.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="claude" stackId="1" stroke={PROVIDER_COLOR.claude} fill={PROVIDER_COLOR.claude} fillOpacity={0.6} />
              <Area type="monotone" dataKey="deepseek" stackId="1" stroke={PROVIDER_COLOR.deepseek} fill={PROVIDER_COLOR.deepseek} fillOpacity={0.6} />
              <Area type="monotone" dataKey="kimi" stackId="1" stroke={PROVIDER_COLOR.kimi} fill={PROVIDER_COLOR.kimi} fillOpacity={0.6} />
              <Area type="monotone" dataKey="moonshot" stackId="1" stroke={PROVIDER_COLOR.moonshot} fill={PROVIDER_COLOR.moonshot} fillOpacity={0.6} />
              <Area type="monotone" dataKey="other" stackId="1" stroke={PROVIDER_COLOR.other} fill={PROVIDER_COLOR.other} fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">暫無資料</div>
        )}
      </div>

      {/* Provider 與 Plan 分解 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-base font-semibold text-white mb-3">按 Provider 分解</h2>
          {Object.keys(data.by_provider).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(data.by_provider).map(([k, v]) => ({ name: k, ...v }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#e5e5e5' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="cost_usd" name="花費 USD" fill="#4E9AC7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">暫無資料</div>
          )}
          <div className="mt-3 space-y-1 text-xs">
            {Object.entries(data.by_provider).map(([name, v]) => (
              <div key={name} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                <span className="text-white capitalize">{name}</span>
                <span className="text-gray-400">
                  ${v.cost_usd} / {v.calls} 次 / 平均 ${v.avg_cost_usd}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5">
          <h2 className="text-base font-semibold text-white mb-3">按方案分解</h2>
          {Object.keys(data.by_plan).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(data.by_plan).map(([k, v]) => ({ plan: PLAN_NAMES[k] || k, ...v }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="plan" tick={{ fontSize: 10, fill: '#e5e5e5' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                <Tooltip contentStyle={{ background: '#0A0F1E', border: '1px solid rgba(78,154,199,0.3)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="cost_usd" name="花費 USD" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">暫無資料</div>
          )}
          <div className="mt-3 space-y-1 text-xs">
            {Object.entries(data.by_plan).map(([plan, v]) => (
              <div key={plan} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                <span className="text-white">{PLAN_NAMES[plan] || plan}</span>
                <span className="text-gray-400">
                  ${v.cost_usd} / {v.calls} 次 / 單次 ${v.avg_cost_usd}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 按 Model */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-3">按 Model 分解</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-gray-500">
                <th className="text-left px-3 py-2">Provider</th>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-right px-3 py-2">呼叫次數</th>
                <th className="text-right px-3 py-2">總花費</th>
                <th className="text-right px-3 py-2">平均每次</th>
              </tr>
            </thead>
            <tbody>
              {data.by_model.map(m => (
                <tr key={`${m.provider}-${m.model}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-gray-300 capitalize">{m.provider}</td>
                  <td className="px-3 py-2 text-white font-mono text-xs">{m.model}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{m.calls}</td>
                  <td className="px-3 py-2 text-right text-amber-400">${m.cost_usd}</td>
                  <td className="px-3 py-2 text-right text-gray-400">${m.avg_cost_usd}</td>
                </tr>
              ))}
              {data.by_model.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-500">暫無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 10 最貴呼叫 */}
      <div className="bg-[#141c2e] rounded-xl border border-white/5 p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-3">Top 10 最貴呼叫</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-gray-500">
                <th className="text-left px-3 py-2">時間</th>
                <th className="text-left px-3 py-2">方案</th>
                <th className="text-left px-3 py-2">Provider / Model</th>
                <th className="text-right px-3 py-2">Tokens</th>
                <th className="text-right px-3 py-2">花費</th>
                <th className="text-left px-3 py-2">報告</th>
              </tr>
            </thead>
            <tbody>
              {data.top_expensive_calls.map(c => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {c.created_at ? new Date(c.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                  </td>
                  <td className="px-3 py-2 text-amber-400">{PLAN_NAMES[c.plan_code || ''] || c.plan_code || '-'}</td>
                  <td className="px-3 py-2 text-white font-mono text-xs">{c.provider} / {c.model}</td>
                  <td className="px-3 py-2 text-right text-gray-400">
                    {(c.prompt_tokens || 0) + (c.completion_tokens || 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-red-400">${c.cost_usd}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs font-mono">{c.report_id ? c.report_id.slice(0, 8) + '…' : '-'}</td>
                </tr>
              ))}
              {data.top_expensive_calls.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-500">暫無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-gray-500 p-3">
        ⓘ 成本記錄來自 <code className="text-gray-400">ai_cost_log</code> 表（每次 AI API 呼叫一筆）。
        若無資料，請於各 AI 呼叫處呼叫 <code className="text-gray-400">recordAIUsage()</code>（詳見 <code className="text-gray-400">lib/ai-cost-tracker.ts</code>）。
        月預算可透過環境變數 <code className="text-gray-400">AI_BUDGET_USD_PER_MONTH</code> 調整（預設 $500）。
      </div>
    </div>
  )
}
