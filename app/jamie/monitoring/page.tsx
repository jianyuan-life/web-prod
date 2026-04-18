'use client'

// v5.3.2 監控總覽儀表板（2026-04-18）
// 對應 API：/api/admin/monitoring-dashboard
// 每 30 秒自動刷新

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

type LlmBalance = {
  provider: string
  balance: number | null
  currency: string
  balance_usd: number | null
  status: 'ok' | 'low' | 'critical' | 'unknown' | 'error'
  error_message: string | null
  checked_at: string
}

type MonitorData = {
  timestamp: string
  alerts: string[]
  llm_balances: LlmBalance[]
  today: {
    reports: { total: number; completed: number; failed: number; generating: number; pending: number }
    revenue_usd: number
    cost_usd: number
    cost_by_provider: Record<string, { calls: number; total: number; failed: number }>
    budget_usd: number
    budget_usage_pct: number
  }
  month: {
    cost_usd: number
    cost_by_provider: Record<string, number>
    budget_usd: number
    budget_usage_pct: number
  }
  stuck_reports: Array<{
    id: string
    client_name: string
    plan_code: string
    minutes_stuck: number
    current_step: string | null
    started_at: string
  }>
  funnel_7d: {
    visit_pricing: number
    start_checkout: number
    begin_payment: number
    payment_success: number
    report_generated: number
    report_viewed: number
    pdf_downloaded: number
    conversion_pct: {
      visit_to_checkout: number
      checkout_to_pay: number
      pay_to_view: number
    }
  }
  email_7d: {
    total: number
    sent: number
    failed: number
    success_rate_pct: number
    by_type: Record<string, { sent: number; failed: number }>
  }
  feedback_7d: {
    total: number
    avg: number
    distribution: Record<string, number>
    low_ratings_count: number
  }
}

const REFRESH_INTERVAL_MS = 30_000

const STATUS_DOT: Record<LlmBalance['status'], string> = {
  ok: 'bg-green-500',
  low: 'bg-amber-500',
  critical: 'bg-red-500 animate-pulse',
  unknown: 'bg-gray-500',
  error: 'bg-red-400',
}

const STATUS_TEXT_COLOR: Record<LlmBalance['status'], string> = {
  ok: 'text-green-400',
  low: 'text-amber-400',
  critical: 'text-red-400',
  unknown: 'text-gray-400',
  error: 'text-red-300',
}

const PROVIDER_COLOR: Record<string, string> = {
  claude: '#4E9AC7',
  anthropic: '#4E9AC7',
  deepseek: '#10b981',
  kimi: '#f59e0b',
  moonshot: '#8b5cf6',
  openai: '#34d399',
  gemini: '#60a5fa',
  qwen: '#ec4899',
  other: '#6b7280',
}

const EMAIL_TYPE_LABEL: Record<string, string> = {
  report_ready: '報告完成',
  report_failed_apology: '失敗致歉',
  referral_reward: '推薦獎勵',
  refund_notice: '退款通知',
  welcome: '註冊歡迎',
  password_reset: '密碼重設',
  weekly_digest: '週報',
  admin_alert: '管理告警',
  other: '其他',
}

function fmtUsd(n: number | null | undefined): string {
  if (typeof n !== 'number') return '$--'
  return `$${n.toFixed(2)}`
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins} 分`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}時${m}分`
}

export default function MonitoringPage() {
  const { adminKey } = useAdminAuth()
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch('/api/admin/monitoring-dashboard', { adminKey })
      if (res.ok) {
        setData(await res.json())
        setLastUpdate(new Date())
        setError('')
      } else {
        setError(`HTTP ${res.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '連線失敗')
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => {
    fetchData()
    timerRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchData])

  const triggerTest = async (event: string) => {
    if (!adminKey) return
    setLoading(true)
    try {
      await adminFetch(`/api/admin/telegram-test?event=${event}`, { adminKey, method: 'POST' })
    } finally {
      setLoading(false)
    }
  }

  if (!data) {
    return (
      <div className="p-8" style={{ background: '#0A0F1E', minHeight: '100vh', color: '#e5e5e5' }}>
        <div className="text-sm text-gray-400">{error ? `載入失敗：${error}` : '載入中...'}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto" style={{ background: '#0A0F1E', minHeight: '100vh', color: '#e5e5e5' }}>
      {/* 頂部資訊列 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">監控儀表板</h1>
          <p className="text-xs text-gray-400 mt-1">
            每 30 秒自動刷新{lastUpdate ? ` · 最後更新 ${lastUpdate.toLocaleTimeString('zh-TW')}` : ''}
            {loading && ' · 更新中...'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchData}
            className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10 transition">
            立即刷新
          </button>
          <div className="relative group">
            <button className="px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-xs hover:bg-amber-500/20 transition">
              Telegram 測試 ▾
            </button>
            <div className="hidden group-hover:flex absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg p-2 flex-col gap-1 z-10 w-48">
              {['failed', 'high-cost', 'quality-gate', 'balance-low', 'balance-critical',
                'stripe-failed', 'email-failed', 'stuck', 'abnormal-cost', 'low-rating',
                'workflow-failed', 'daily'].map(ev => (
                <button key={ev} onClick={() => triggerTest(ev)}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-amber-400 hover:bg-white/5 rounded text-left transition">
                  觸發 {ev}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 告警條 */}
      {data.alerts.length > 0 && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl">🚨</span>
            <div className="flex-1">
              <div className="font-bold text-red-300 mb-1">{data.alerts.length} 項告警</div>
              <ul className="text-sm text-red-200 space-y-0.5">
                {data.alerts.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 頂部 KPI：今日 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="今日報告" value={data.today.reports.total} sub={`${data.today.reports.completed}成功/${data.today.reports.failed}失敗`} tone="neutral" />
        <KpiCard label="今日營收" value={fmtUsd(data.today.revenue_usd)} sub={`${data.today.reports.completed} 單完成`} tone="pos" />
        <KpiCard label="今日 AI 成本" value={fmtUsd(data.today.cost_usd)} sub={`預算 ${fmtUsd(data.today.budget_usd)}（${data.today.budget_usage_pct}%）`}
          tone={data.today.budget_usage_pct > 100 ? 'neg' : data.today.budget_usage_pct > 80 ? 'warn' : 'pos'} />
        <KpiCard label="本月 AI 成本" value={fmtUsd(data.month.cost_usd)} sub={`預算 ${fmtUsd(data.month.budget_usd)}（${data.month.budget_usage_pct}%）`}
          tone={data.month.budget_usage_pct > 100 ? 'neg' : data.month.budget_usage_pct > 80 ? 'warn' : 'pos'} />
        <KpiCard label="卡住報告" value={data.stuck_reports.length} sub={data.stuck_reports.length > 0 ? '需人工介入' : '✓ 無'}
          tone={data.stuck_reports.length > 0 ? 'neg' : 'pos'} />
      </div>

      {/* 主內容 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LLM 餘額面板（span 1） */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4">
          <h2 className="font-bold text-white mb-3 flex items-center justify-between">
            LLM 餘額
            <span className="text-xs text-gray-500 font-normal">每小時更新</span>
          </h2>
          <div className="space-y-2">
            {data.llm_balances.length === 0 && (
              <div className="text-xs text-gray-500 py-4">尚無資料。請執行 `python scripts/check_llm_balances.py` 抓取。</div>
            )}
            {data.llm_balances.map(b => (
              <div key={b.provider} className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10 transition">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOT[b.status]}`} />
                  <span className="text-sm font-medium capitalize text-gray-200">{b.provider}</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono ${STATUS_TEXT_COLOR[b.status]}`}>
                    {b.balance_usd !== null ? `$${b.balance_usd.toFixed(2)}` :
                     b.balance !== null ? `${b.currency === 'CNY' ? '¥' : '$'}${b.balance.toFixed(2)}` :
                     '—'}
                  </div>
                  <div className="text-[10px] text-gray-500">{b.status}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 今日成本分 provider */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4">
          <h2 className="font-bold text-white mb-3">今日成本 × Provider</h2>
          <div className="space-y-2">
            {Object.entries(data.today.cost_by_provider).length === 0 && (
              <div className="text-xs text-gray-500 py-4">今日尚無 AI 呼叫。</div>
            )}
            {Object.entries(data.today.cost_by_provider)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([p, v]) => {
                const max = Math.max(...Object.values(data.today.cost_by_provider).map(x => x.total))
                const pct = max > 0 ? (v.total / max) * 100 : 0
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span className="capitalize">{p}</span>
                      <span>{fmtUsd(v.total)} · {v.calls} calls{v.failed > 0 ? ` · ${v.failed} 失敗` : ''}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${pct}%`, background: PROVIDER_COLOR[p] || '#6b7280' }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </section>

        {/* 本月成本 */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4">
          <h2 className="font-bold text-white mb-3">本月累計 vs 預算</h2>
          <div className="mb-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-bold text-white">{fmtUsd(data.month.cost_usd)}</span>
              <span className="text-sm text-gray-400">預算 {fmtUsd(data.month.budget_usd)}</span>
            </div>
            <div className="h-2 bg-white/5 rounded overflow-hidden">
              <div className="h-full rounded transition-all" style={{
                width: `${Math.min(100, data.month.budget_usage_pct)}%`,
                background: data.month.budget_usage_pct > 100 ? '#ef4444' :
                            data.month.budget_usage_pct > 80 ? '#f59e0b' : '#10b981',
              }} />
            </div>
            <div className="text-xs text-gray-400 mt-1">{data.month.budget_usage_pct}% 已使用</div>
          </div>
          <div className="space-y-1 text-xs">
            {Object.entries(data.month.cost_by_provider)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([p, v]) => (
                <div key={p} className="flex justify-between text-gray-400">
                  <span className="capitalize">{p}</span>
                  <span className="font-mono">{fmtUsd(v)}</span>
                </div>
              ))}
          </div>
        </section>

        {/* 卡住報告（span 2） */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4 lg:col-span-2">
          <h2 className="font-bold text-white mb-3 flex items-center justify-between">
            <span>卡住的報告（&gt; 20 分鐘）</span>
            {data.stuck_reports.length > 0 && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">{data.stuck_reports.length} 份</span>
            )}
          </h2>
          {data.stuck_reports.length === 0 ? (
            <div className="text-sm text-green-400 py-4">✓ 目前沒有卡住的報告</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500">
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left">客戶</th>
                    <th className="text-left">方案</th>
                    <th className="text-left">當前步驟</th>
                    <th className="text-right">卡住時長</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stuck_reports.map(r => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 font-mono text-[10px] text-gray-500">{r.id.slice(0, 8)}</td>
                      <td className="text-gray-200">{r.client_name || '—'}</td>
                      <td className="text-amber-400">{r.plan_code}</td>
                      <td className="text-gray-400">{r.current_step || '—'}</td>
                      <td className="text-right font-mono text-red-400">{fmtMinutes(r.minutes_stuck)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 客戶評分 */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4">
          <h2 className="font-bold text-white mb-3">7 日客戶評分</h2>
          <div className="flex items-center gap-4 mb-3">
            <div>
              <div className="text-3xl font-bold text-amber-400">{data.feedback_7d.avg || '—'}</div>
              <div className="text-xs text-gray-500">{data.feedback_7d.total} 筆評分</div>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map(star => {
                const count = data.feedback_7d.distribution[String(star)] || 0
                const total = data.feedback_7d.total || 1
                const pct = (count / total) * 100
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-6">{star}★</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full rounded bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-500 w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          {data.feedback_7d.low_ratings_count > 0 && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
              ⚠️ {data.feedback_7d.low_ratings_count} 份低分 (&lt;3星)
            </div>
          )}
        </section>

        {/* 轉化漏斗（span 2） */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4 lg:col-span-2">
          <h2 className="font-bold text-white mb-3">7 日轉化漏斗</h2>
          <div className="space-y-2">
            {([
              ['訪問定價頁', data.funnel_7d.visit_pricing, null],
              ['進入結帳', data.funnel_7d.start_checkout, data.funnel_7d.conversion_pct.visit_to_checkout],
              ['付款成功', data.funnel_7d.payment_success, data.funnel_7d.conversion_pct.checkout_to_pay],
              ['打開報告', data.funnel_7d.report_viewed, data.funnel_7d.conversion_pct.pay_to_view],
              ['下載 PDF', data.funnel_7d.pdf_downloaded, null],
            ] as Array<[string, number, number | null]>).map(([label, value, convPct], idx) => {
              const top = data.funnel_7d.visit_pricing || 1
              const pct = (value / top) * 100
              return (
                <div key={idx}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400 font-mono">
                      {value}
                      {convPct !== null && <span className="text-cyan-400 ml-2">→ {convPct}%</span>}
                    </span>
                  </div>
                  <div className="h-3 bg-white/5 rounded overflow-hidden">
                    <div className="h-full rounded bg-gradient-to-r from-[#4E9AC7] to-[#7dd3fc]" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          {data.funnel_7d.visit_pricing === 0 && (
            <div className="text-xs text-gray-500 mt-3">尚無漏斗資料。確認前端有呼叫 `trackFunnelClient()`。</div>
          )}
        </section>

        {/* Email 狀態 */}
        <section className="bg-[#141a2e] rounded-lg border border-white/5 p-4">
          <h2 className="font-bold text-white mb-3">7 日 Email 送達</h2>
          <div className="flex items-baseline gap-3 mb-3">
            <span className={`text-3xl font-bold ${data.email_7d.success_rate_pct >= 95 ? 'text-green-400' : 'text-amber-400'}`}>
              {data.email_7d.success_rate_pct}%
            </span>
            <span className="text-xs text-gray-500">
              {data.email_7d.sent} 成功 / {data.email_7d.failed} 失敗
            </span>
          </div>
          <div className="space-y-1 text-xs">
            {Object.entries(data.email_7d.by_type)
              .sort((a, b) => (b[1].sent + b[1].failed) - (a[1].sent + a[1].failed))
              .slice(0, 6)
              .map(([type, v]) => (
                <div key={type} className="flex justify-between text-gray-400">
                  <span>{EMAIL_TYPE_LABEL[type] || type}</span>
                  <span className="font-mono">
                    {v.sent}
                    {v.failed > 0 && <span className="text-red-400"> · {v.failed} 失敗</span>}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Helper 元件 ──────────────────────────────────────────

function KpiCard({
  label, value, sub, tone,
}: {
  label: string
  value: string | number
  sub?: string
  tone: 'pos' | 'neg' | 'warn' | 'neutral'
}) {
  const toneColor: Record<typeof tone, string> = {
    pos: 'text-green-400',
    neg: 'text-red-400',
    warn: 'text-amber-400',
    neutral: 'text-white',
  }
  return (
    <div className="bg-[#141a2e] rounded-lg border border-white/5 p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneColor[tone]}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}
