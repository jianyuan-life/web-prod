'use client'

// ============================================================
// /jamie/quality-reports — 5 LLM Post-Gen QA 儀表板
// ============================================================
// Post-Gen 5 LLM QA Pipeline (2026-04-18)
//
// 功能：
//  - 列最近 50 份報告的 5 LLM 平均分
//  - 篩選：最低分 < 95 / 平均分 < 93 / needs_human_review / 紅色警報
//  - 點開看各 LLM 的 issues / critical_errors
//  - 可手動觸發重生 (regenerate) / 放行 (release)
// ============================================================

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

type ReportRow = {
  report_id: string
  plan_code: string
  client_name: string
  customer_email: string
  status: string
  error_message: string
  latest_round: number
  scores: Record<string, number>
  avg: number
  min: number
  max: number
  critical_count: number
  created_at: string | null
  updated_at: string | null
}

type ListResp = {
  filter: string
  count: number
  reports: ReportRow[]
  summary: {
    total: number
    avg_below_93: number
    avg_below_85: number
    min_below_95: number
    needs_review: number
  }
  note?: string
}

type DetailResp = {
  report: {
    id: string
    plan_code: string
    client_name: string
    customer_email: string
    status: string
    created_at: string
    error_message: string
  } | null
  rounds: Array<{
    round: number
    reviewers: Array<{
      reviewer: string
      model: string
      score: number
      passed: boolean
      issues: string[]
      critical_errors: string[]
      strengths: string[]
      suggestions: string[]
      latency_ms: number | null
      cost_usd: number
      error_message: string | null
    }>
    summary: {
      avg: number
      min: number
      max: number
      scores: Record<string, number>
      passed: boolean
      total_cost_usd: number
      total_critical: number
    }
  }>
}

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
  R: '合否？', E1: '事件出門訣', E2: '月盤出門訣',
}

const REVIEWER_LABELS: Record<string, string> = {
  gpt: 'GPT-4o',
  qwen: 'Qwen Max',
  gemini: 'Gemini 2.5',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
}

type FilterKey = 'all' | 'low_min' | 'low_avg' | 'red' | 'needs_review'

export default function QualityReportsPage() {
  const { adminKey } = useAdminAuth()
  const [data, setData] = useState<ListResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [detail, setDetail] = useState<DetailResp | null>(null)
  const [detailOpenId, setDetailOpenId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchList = useCallback(async (f: FilterKey) => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/quality-reports?filter=${f}&limit=50`, { adminKey })
      if (res.ok) setData(await res.json() as ListResp)
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchList(filter) }, [filter, fetchList])

  const openDetail = async (reportId: string) => {
    if (detailOpenId === reportId) {
      setDetailOpenId(null); setDetail(null); return
    }
    setDetailOpenId(reportId)
    setDetailLoading(true)
    try {
      const res = await adminFetch(`/api/admin/quality-reports?report_id=${reportId}`, { adminKey })
      if (res.ok) setDetail(await res.json() as DetailResp)
    } finally { setDetailLoading(false) }
  }

  const doAction = async (reportId: string, action: 'release' | 'regenerate') => {
    const label = action === 'release' ? '放行' : '重新生成'
    if (!confirm(`確認${label}報告 ${reportId.slice(0, 8)}？`)) return
    setActionLoading(reportId + action)
    try {
      const res = await adminFetch('/api/admin/quality-reports', {
        adminKey,
        method: 'PATCH',
        body: JSON.stringify({ report_id: reportId, action }),
      })
      if (res.ok) {
        alert(`${label}成功`)
        fetchList(filter)
        if (detailOpenId === reportId) { setDetailOpenId(null); setDetail(null) }
      } else {
        const err = await res.json().catch(() => ({ error: '未知錯誤' }))
        alert(`${label}失敗：${err.error || '未知'}`)
      }
    } finally { setActionLoading(null) }
  }

  if (!data) return <div className="p-8 text-gray-500">載入中...</div>

  return (
    <div className="p-6 max-w-[1400px]" style={{ background: '#0A0F1E', minHeight: '100vh' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">5 LLM QA 品質儀表板</h1>
          <p className="text-xs text-gray-400">
            每份報告生成後，GPT / Qwen / Gemini / Kimi / DeepSeek 並行評分；門檻：min ≥ 95 且 avg ≥ 93
          </p>
        </div>
        <button onClick={() => fetchList(filter)} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {data.note && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 text-sm">
          ⚠ {data.note}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="總數（最近 50）" value={data.summary.total} color="#4E9AC7" />
        <StatCard label="平均 < 93" value={data.summary.avg_below_93} color="#f59e0b" />
        <StatCard label="平均 < 85（紅色）" value={data.summary.avg_below_85} color="#ef4444" />
        <StatCard label="最低 < 95" value={data.summary.min_below_95} color="#f59e0b" />
        <StatCard label="需人工審核" value={data.summary.needs_review} color="#a855f7" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { k: 'all',          label: '全部' },
          { k: 'low_min',      label: '最低分 < 95' },
          { k: 'low_avg',      label: '平均分 < 93' },
          { k: 'red',          label: '紅色警報 (< 85)' },
          { k: 'needs_review', label: '需人工審核' },
        ] as Array<{ k: FilterKey; label: string }>).map(t => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === t.k ? 'bg-[#4E9AC7] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141414]">
        <table className="w-full text-xs">
          <thead className="text-gray-400 border-b border-white/10">
            <tr>
              <th className="text-left px-3 py-2">報告</th>
              <th className="text-left px-3 py-2">方案</th>
              <th className="text-left px-3 py-2">狀態</th>
              <th className="text-right px-3 py-2">平均</th>
              <th className="text-right px-3 py-2">最低</th>
              <th className="text-left px-3 py-2">各 Reviewer 分數</th>
              <th className="text-right px-3 py-2">致命</th>
              <th className="text-left px-3 py-2">更新時間</th>
              <th className="text-right px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody className="text-gray-200">
            {data.reports.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-500">沒有資料</td></tr>
            )}
            {data.reports.map(r => {
              const opened = detailOpenId === r.report_id
              return (
                <Fragment key={r.report_id}>
                  <tr className={`border-b border-white/5 ${opened ? 'bg-white/5' : 'hover:bg-white/5'} cursor-pointer`}
                    onClick={() => openDetail(r.report_id)}>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <div>{r.report_id.slice(0, 8)}</div>
                      <div className="text-gray-500">{r.client_name}</div>
                    </td>
                    <td className="px-3 py-2">{PLAN_NAMES[r.plan_code] || r.plan_code || '-'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span style={{ color: avgColor(r.avg) }} className="font-bold">{r.avg || '-'}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span style={{ color: minColor(r.min) }}>{r.min || '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {(['gpt', 'qwen', 'gemini', 'kimi', 'deepseek'] as const).map(k => {
                          const score = r.scores[k]
                          if (score === undefined) return (
                            <span key={k} className="px-1.5 py-0.5 rounded bg-white/5 text-gray-600 text-[10px]">{k.toUpperCase()}</span>
                          )
                          return (
                            <span key={k} className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: scoreBg(score), color: scoreColor(score) }}>
                              {k.toUpperCase()} {score}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.critical_count > 0 ? (
                        <span className="text-red-400 font-bold">{r.critical_count}</span>
                      ) : <span className="text-gray-600">0</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString('zh-TW', { hour12: false }) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        {r.status === 'needs_human_review' && (
                          <button
                            disabled={actionLoading === r.report_id + 'release'}
                            onClick={e => { e.stopPropagation(); doAction(r.report_id, 'release') }}
                            className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px]">
                            放行
                          </button>
                        )}
                        <button
                          disabled={actionLoading === r.report_id + 'regenerate'}
                          onClick={e => { e.stopPropagation(); doAction(r.report_id, 'regenerate') }}
                          className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px]">
                          重生
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* 展開：詳細 5 LLM 評分 */}
                  {opened && (
                    <tr>
                      <td colSpan={9} className="bg-[#0f1422] px-6 py-4 border-b border-white/10">
                        {detailLoading && <div className="text-gray-500 text-xs">載入詳情...</div>}
                        {detail && !detailLoading && (
                          <DetailView detail={detail} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 小元件 ────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#141414] p-3">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed: { label: '完成', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    pending: { label: '待處理', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    generating: { label: '生成中', color: '#4E9AC7', bg: 'rgba(78,154,199,0.15)' },
    failed: { label: '失敗', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    needs_human_review: { label: '人工審核', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  }
  const conf = map[status] || { label: status || '-', color: '#888', bg: 'rgba(136,136,136,0.15)' }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ color: conf.color, background: conf.bg }}>
      {conf.label}
    </span>
  )
}

function DetailView({ detail }: { detail: DetailResp }) {
  return (
    <div className="space-y-4">
      {detail.rounds.map(round => (
        <div key={round.round} className="rounded-lg bg-[#141414] border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-white">
              第 {round.round} 輪評分
              <span className="ml-3 text-xs text-gray-400">
                avg {round.summary.avg} / min {round.summary.min} / max {round.summary.max}
              </span>
              {round.summary.passed ? (
                <span className="ml-2 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">通過</span>
              ) : (
                <span className="ml-2 px-2 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px]">未通過</span>
              )}
            </div>
            <div className="text-[10px] text-gray-500">
              cost ${round.summary.total_cost_usd.toFixed(4)} / 致命 {round.summary.total_critical}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {round.reviewers.map(rv => (
              <div key={rv.reviewer} className="rounded bg-[#0f1422] border border-white/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold" style={{ color: scoreColor(rv.score) }}>
                    {REVIEWER_LABELS[rv.reviewer] || rv.reviewer}
                  </div>
                  <div className="text-lg font-bold" style={{ color: scoreColor(rv.score) }}>
                    {rv.score}
                  </div>
                </div>
                <div className="text-[10px] text-gray-600 mb-2">{rv.model}</div>

                {rv.critical_errors.length > 0 && (
                  <Section title="⚠ 致命錯誤" items={rv.critical_errors} color="#ef4444" />
                )}
                {rv.issues.length > 0 && (
                  <Section title="問題" items={rv.issues} color="#f59e0b" />
                )}
                {rv.suggestions.length > 0 && (
                  <Section title="建議" items={rv.suggestions} color="#4E9AC7" />
                )}
                {rv.error_message && (
                  <div className="text-[10px] text-red-400 mt-1">❌ {rv.error_message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold mb-0.5" style={{ color }}>{title}</div>
      <ul className="space-y-0.5">
        {items.slice(0, 4).map((it, i) => (
          <li key={i} className="text-[10px] text-gray-400 leading-tight">• {it.length > 100 ? it.slice(0, 100) + '...' : it}</li>
        ))}
        {items.length > 4 && (
          <li className="text-[10px] text-gray-600">還有 {items.length - 4} 項</li>
        )}
      </ul>
    </div>
  )
}

// ── 顏色工具 ──────────────────────────────────────────────

function avgColor(avg: number): string {
  if (!avg) return '#888'
  if (avg >= 95) return '#10b981'
  if (avg >= 93) return '#34d399'
  if (avg >= 85) return '#f59e0b'
  return '#ef4444'
}

function minColor(min: number): string {
  if (!min) return '#888'
  if (min >= 95) return '#10b981'
  if (min >= 90) return '#f59e0b'
  return '#ef4444'
}

function scoreColor(score: number): string {
  if (score >= 95) return '#10b981'
  if (score >= 90) return '#34d399'
  if (score >= 85) return '#f59e0b'
  return '#ef4444'
}

function scoreBg(score: number): string {
  if (score >= 95) return 'rgba(16,185,129,0.18)'
  if (score >= 90) return 'rgba(52,211,153,0.18)'
  if (score >= 85) return 'rgba(245,158,11,0.18)'
  return 'rgba(239,68,68,0.18)'
}
