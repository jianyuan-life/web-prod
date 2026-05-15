'use client'
// A/B 測試實驗詳情頁
// 2026-04-17 | 網頁製作部門
// 顯示：單一實驗完整統計、兩兩 variant 顯著性、時間序列、控制台（暫停/結論）

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAdminAuth } from '../../layout'
import { zTestTwoProportions } from '@/lib/ab-test'
import { internalGet, internalPatch } from '@/lib/api'  // T10b v5.10.381(timeout + 429 + REST verb)

interface VariantStats {
  variant: string
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  uniqueVisitors: number
}

interface ExperimentWithStats {
  key: string
  name: string
  description: string | null
  status: string
  variants: Array<{ key: string; label?: string; weight: number }>
  primary_metric: string
  winner: string | null
  notes: string | null
  started_at: string
  ended_at: string | null
  stats: VariantStats[]
}

export default function ExperimentDetailPage() {
  const params = useParams()
  const expKey = decodeURIComponent(params.key as string)
  const { adminKey } = useAdminAuth()
  const [exp, setExp] = useState<ExperimentWithStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // T10b v5.10.381 — internalGet 統一處理(timeout + 429 + ApiError)
      const data = await internalGet('/api/admin/ab-tests', {
        headers: { 'x-admin-key': adminKey },
      }) as { experiments?: ExperimentWithStats[] }
      const found = (data.experiments || []).find((e: ExperimentWithStats) => e.key === expKey)
      if (!found) throw new Error('找不到此實驗')
      setExp(found)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (adminKey) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, expKey])

  const pairwise = useMemo(() => {
    if (!exp || exp.stats.length < 2) return []
    const results: Array<{
      a: string
      b: string
      pValue: number
      lift: number
      significant: boolean
    }> = []
    for (let i = 0; i < exp.stats.length; i++) {
      for (let j = i + 1; j < exp.stats.length; j++) {
        const r = zTestTwoProportions(
          { key: exp.stats[i].variant, impressions: exp.stats[i].impressions, conversions: exp.stats[i].conversions },
          { key: exp.stats[j].variant, impressions: exp.stats[j].impressions, conversions: exp.stats[j].conversions },
        )
        results.push({
          a: exp.stats[i].variant,
          b: exp.stats[j].variant,
          pValue: r.pValue,
          lift: r.lift,
          significant: r.significant,
        })
      }
    }
    return results
  }, [exp])

  const updateStatus = async (status: 'active' | 'paused' | 'concluded', winner?: string) => {
    if (!exp) return
    if (status === 'concluded' && !winner) {
      alert('請先選擇勝出的 variant')
      return
    }
    setActionLoading(true)
    try {
      // T10b v5.10.381 — internalPatch 統一處理(timeout + 429 + ApiError throw)
      await internalPatch(`/api/admin/ab-tests?key=${encodeURIComponent(exp.key)}`, { status, winner }, {
        headers: { 'x-admin-key': adminKey },
      })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失敗')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-6 text-gray-400">載入中...</div>
  if (err) return <div className="p-6 text-red-400">{err}</div>
  if (!exp) return <div className="p-6 text-gray-400">找不到實驗</div>

  const totalImpressions = exp.stats.reduce((s, v) => s + v.impressions, 0)
  const totalConversions = exp.stats.reduce((s, v) => s + v.conversions, 0)
  const totalRevenue = exp.stats.reduce((s, v) => s + v.revenue, 0)

  return (
    <div className="p-6 max-w-7xl">
      <Link href="/jamie/ab-tests" className="text-sm text-amber-400 hover:text-amber-300 mb-4 inline-block">
        ← 返回列表
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded ${
            exp.status === 'active' ? 'bg-green-500/20 text-green-400'
            : exp.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-gray-500/20 text-gray-400'
          }`}>{exp.status.toUpperCase()}</span>
          {exp.winner && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">勝出：{exp.winner}</span>}
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">{exp.name}</h1>
        <div className="text-xs text-gray-500 font-mono mb-2">key: {exp.key}</div>
        {exp.description && <p className="text-sm text-gray-400">{exp.description}</p>}
        <div className="text-xs text-gray-500 mt-2">
          開始：{new Date(exp.started_at).toLocaleString('zh-TW')}
          {exp.ended_at && ` · 結束：${new Date(exp.ended_at).toLocaleString('zh-TW')}`}
        </div>
      </div>

      {/* 控制台 */}
      <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
        <div className="text-sm text-gray-300 font-bold mb-3">控制台</div>
        <div className="flex flex-wrap gap-2">
          {exp.status === 'active' && (
            <button onClick={() => updateStatus('paused')} disabled={actionLoading}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm disabled:opacity-50">
              暫停實驗
            </button>
          )}
          {exp.status === 'paused' && (
            <button onClick={() => updateStatus('active')} disabled={actionLoading}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm disabled:opacity-50">
              恢復實驗
            </button>
          )}
          {exp.status !== 'concluded' && (
            <>
              {exp.variants.map((v) => (
                <button
                  key={v.key}
                  onClick={() => {
                    if (confirm(`確定宣布 ${v.key} 為勝出 variant？此操作會結束實驗，之後所有訪客統一看 ${v.key}。`)) {
                      updateStatus('concluded', v.key)
                    }
                  }}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm disabled:opacity-50"
                >
                  宣布 {v.key} 勝出
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 總覽 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="總曝光" value={totalImpressions.toLocaleString()} />
        <StatCard label="總轉化" value={totalConversions.toLocaleString()} />
        <StatCard label="總收入" value={`$${totalRevenue.toFixed(0)}`} />
        <StatCard
          label="整體 CVR"
          value={totalImpressions > 0 ? `${((totalConversions / totalImpressions) * 100).toFixed(2)}%` : '—'}
        />
      </div>

      {/* Variants 詳情 */}
      <div className="mb-6">
        <div className="text-sm text-gray-300 font-bold mb-3">Variants 詳情</div>
        <div className="overflow-x-auto bg-white/5 border border-white/10 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-white/10">
                <th className="text-left py-3 px-4">Variant</th>
                <th className="text-left py-3 px-4">標籤</th>
                <th className="text-right py-3 px-4">權重</th>
                <th className="text-right py-3 px-4">曝光</th>
                <th className="text-right py-3 px-4">UV</th>
                <th className="text-right py-3 px-4">點擊</th>
                <th className="text-right py-3 px-4">CTR</th>
                <th className="text-right py-3 px-4">轉化</th>
                <th className="text-right py-3 px-4">CVR</th>
                <th className="text-right py-3 px-4">收入</th>
                <th className="text-right py-3 px-4">RPV</th>
              </tr>
            </thead>
            <tbody>
              {exp.stats.map((s) => {
                const def = exp.variants.find((v) => v.key === s.variant)
                const ctr = s.impressions > 0 ? `${((s.clicks / s.impressions) * 100).toFixed(2)}%` : '—'
                const cvr = s.impressions > 0 ? `${((s.conversions / s.impressions) * 100).toFixed(2)}%` : '—'
                const rpv = s.uniqueVisitors > 0 ? `$${(s.revenue / s.uniqueVisitors).toFixed(2)}` : '—'
                return (
                  <tr key={s.variant} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 px-4 font-mono text-amber-400 font-bold">{s.variant}</td>
                    <td className="py-3 px-4 text-gray-300">{def?.label || '—'}</td>
                    <td className="py-3 px-4 text-right text-gray-400">{def?.weight}%</td>
                    <td className="py-3 px-4 text-right text-gray-300">{s.impressions.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{s.uniqueVisitors.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{s.clicks.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-white">{ctr}</td>
                    <td className="py-3 px-4 text-right text-gray-300">{s.conversions.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-white font-bold">{cvr}</td>
                    <td className="py-3 px-4 text-right text-gray-300">${s.revenue.toFixed(0)}</td>
                    <td className="py-3 px-4 text-right text-white">{rpv}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 顯著性矩陣 */}
      {pairwise.length > 0 && (
        <div className="mb-6">
          <div className="text-sm text-gray-300 font-bold mb-3">統計顯著性（Z-test 兩組比例檢定）</div>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-white/10">
                  <th className="text-left py-3 px-4">對比</th>
                  <th className="text-right py-3 px-4">提升幅度</th>
                  <th className="text-right py-3 px-4">p-value</th>
                  <th className="text-center py-3 px-4">是否顯著 (p&lt;0.05)</th>
                </tr>
              </thead>
              <tbody>
                {pairwise.map((p, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 px-4 font-mono text-amber-400">{p.a} vs {p.b}</td>
                    <td className={`text-right py-3 px-4 font-bold ${p.lift >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.lift >= 0 ? '+' : ''}{(p.lift * 100).toFixed(1)}%
                    </td>
                    <td className="text-right py-3 px-4 text-white">{p.pValue.toFixed(4)}</td>
                    <td className="text-center py-3 px-4">
                      {p.significant ? (
                        <span className="text-green-400 font-bold">✓ 顯著</span>
                      ) : (
                        <span className="text-gray-500">未達顯著</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            * 顯著性需 p&lt;0.05 且樣本總數 ≥200。未達顯著代表數據不足或差異不夠大。
          </p>
        </div>
      )}

      {exp.notes && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="text-xs text-gray-500 mb-2">結論備註</div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{exp.notes}</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  )
}
