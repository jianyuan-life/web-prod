'use client'
// A/B 測試後台看板（列表頁）
// 2026-04-17 | 網頁製作部門
// 顯示所有實驗 + 每個 variant 的 impression/click/conversion/revenue

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAdminAuth } from '../layout'
import { zTestTwoProportions } from '@/lib/ab-test'
import { internalGet, internalPost } from '@/lib/api'  // T10b v5.10.381(timeout + 429)

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

export default function ABTestsPage() {
  const { adminKey } = useAdminAuth()
  const [experiments, setExperiments] = useState<ExperimentWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // T10b v5.10.381 — internalGet 統一處理(timeout + 429 + ApiError)
      const data = await internalGet('/api/admin/ab-tests', {
        headers: { 'x-admin-key': adminKey },
      }) as { experiments?: ExperimentWithStats[] }
      setExperiments(data.experiments || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (adminKey) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey])

  if (loading) {
    return <div className="p-6 text-gray-400">載入中...</div>
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">A/B 測試</h1>
          <p className="text-sm text-gray-400 mt-1">自建輕量 A/B 測試框架 — 測定價、文案、CTA、佈局、流程</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold"
        >
          + 建立新實驗
        </button>
      </div>

      {err && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded">{err}</div>}

      {experiments.length === 0 ? (
        <div className="p-8 bg-white/5 border border-white/10 rounded-xl text-gray-400 text-center">
          還沒有實驗。點右上「建立新實驗」開始測試。
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <ExperimentCard key={exp.key} exp={exp} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
          adminKey={adminKey}
        />
      )}
    </div>
  )
}

function ExperimentCard({ exp }: { exp: ExperimentWithStats }) {
  const totalImpressions = exp.stats.reduce((s, v) => s + v.impressions, 0)
  const totalConversions = exp.stats.reduce((s, v) => s + v.conversions, 0)
  const totalRevenue = exp.stats.reduce((s, v) => s + v.revenue, 0)

  // 兩組 variant 算顯著性
  const significance = useMemo(() => {
    if (exp.stats.length < 2) return null
    const a = exp.stats[0]
    const b = exp.stats[1]
    return zTestTwoProportions(
      { key: a.variant, impressions: a.impressions, conversions: a.conversions },
      { key: b.variant, impressions: b.impressions, conversions: b.conversions },
    )
  }, [exp.stats])

  const statusColor =
    exp.status === 'active' ? 'bg-green-500/20 text-green-400'
    : exp.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-gray-500/20 text-gray-400'

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-amber-500/30 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>{exp.status.toUpperCase()}</span>
            {exp.winner && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">勝出：{exp.winner}</span>}
          </div>
          <Link href={`/jamie/ab-tests/${encodeURIComponent(exp.key)}`} className="text-lg font-bold text-white hover:text-amber-400">
            {exp.name}
          </Link>
          <div className="text-xs text-gray-500 mt-0.5">key: {exp.key}</div>
          {exp.description && <p className="text-sm text-gray-400 mt-2">{exp.description}</p>}
        </div>
      </div>

      {/* 總覽數字 */}
      <div className="grid grid-cols-4 gap-3 mb-4 text-center">
        <div className="bg-white/5 rounded p-2">
          <div className="text-xs text-gray-500">曝光</div>
          <div className="text-lg font-bold text-white">{totalImpressions.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded p-2">
          <div className="text-xs text-gray-500">轉化</div>
          <div className="text-lg font-bold text-white">{totalConversions.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 rounded p-2">
          <div className="text-xs text-gray-500">收入</div>
          <div className="text-lg font-bold text-white">${totalRevenue.toFixed(0)}</div>
        </div>
        <div className="bg-white/5 rounded p-2">
          <div className="text-xs text-gray-500">顯著性</div>
          <div className={`text-lg font-bold ${significance?.significant ? 'text-green-400' : 'text-gray-400'}`}>
            {significance ? `p=${significance.pValue.toFixed(3)}` : '—'}
          </div>
        </div>
      </div>

      {/* Variants 表 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-white/10">
              <th className="text-left py-2 pr-3">Variant</th>
              <th className="text-right py-2 px-3">曝光</th>
              <th className="text-right py-2 px-3">獨立訪客</th>
              <th className="text-right py-2 px-3">點擊</th>
              <th className="text-right py-2 px-3">轉化</th>
              <th className="text-right py-2 px-3">CVR</th>
              <th className="text-right py-2 pl-3">收入</th>
            </tr>
          </thead>
          <tbody>
            {exp.stats.map((s) => {
              const cvr = s.impressions > 0 ? ((s.conversions / s.impressions) * 100).toFixed(2) : '—'
              const variantDef = exp.variants.find((v) => v.key === s.variant)
              return (
                <tr key={s.variant} className="border-b border-white/5">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-amber-400">{s.variant}</span>
                    {variantDef?.label && <span className="text-gray-400 ml-2">{variantDef.label}</span>}
                  </td>
                  <td className="text-right py-2 px-3 text-gray-300">{s.impressions.toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-gray-300">{s.uniqueVisitors.toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-gray-300">{s.clicks.toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-gray-300">{s.conversions.toLocaleString()}</td>
                  <td className="text-right py-2 px-3 text-white font-bold">{cvr}{cvr !== '—' && '%'}</td>
                  <td className="text-right py-2 pl-3 text-gray-300">${s.revenue.toFixed(0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {significance && significance.significant && (
        <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded text-sm text-green-400">
          ✓ 已達 95% 統計顯著（p={significance.pValue.toFixed(3)}），B 相對 A 提升 {(significance.lift * 100).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function CreateModal({
  onClose,
  onCreated,
  adminKey,
}: {
  onClose: () => void
  onCreated: () => void
  adminKey: string
}) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [variants, setVariants] = useState([
    { key: 'A', label: '', weight: 50 },
    { key: 'B', label: '', weight: 50 },
  ])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setSaving(true)
    setErr('')
    try {
      // T10b v5.10.381 — internalPost 統一處理(timeout + 429 + ApiError throw)
      await internalPost('/api/admin/ab-tests', { key, name, description, variants }, {
        headers: { 'x-admin-key': adminKey },
      })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const updateVariant = (i: number, field: 'key' | 'label' | 'weight', value: string | number) => {
    const next = [...variants]
    next[i] = { ...next[i], [field]: value }
    setVariants(next)
  }

  const addVariant = () => {
    if (variants.length >= 10) return
    const nextKey = String.fromCharCode(65 + variants.length)
    setVariants([...variants, { key: nextKey, label: '', weight: 50 }])
  }

  const removeVariant = (i: number) => {
    if (variants.length <= 2) return
    setVariants(variants.filter((_, idx) => idx !== i))
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-4">建立新實驗</h2>
        {err && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded">{err}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Key（英數底線，3-64 字，如 pricing_c_20260417）</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="pricing_c_20260417"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">名稱（顯示用）</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="C 方案定價測試 $89 vs $99"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">描述（選填）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="測試提高 $10 是否影響轉化率"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">Variants（2-10 個）</label>
              <button onClick={addVariant} className="text-xs text-amber-400 hover:text-amber-300">
                + 新增
              </button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={v.key}
                    onChange={(e) => updateVariant(i, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16))}
                    className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm font-mono text-center"
                    placeholder="A"
                  />
                  <input
                    value={v.label}
                    onChange={(e) => updateVariant(i, 'label', e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-white text-sm"
                    placeholder="標籤（如：原版 / 新版 / $89）"
                  />
                  <input
                    type="number"
                    value={v.weight}
                    onChange={(e) => updateVariant(i, 'weight', Number(e.target.value) || 0)}
                    className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm text-center"
                    min={0}
                    max={1000}
                  />
                  <span className="text-xs text-gray-500">%</span>
                  {variants.length > 2 && (
                    <button onClick={() => removeVariant(i)} className="text-red-400 hover:text-red-300 text-xs px-2">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving || !key || !name}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-sm disabled:opacity-50"
          >
            {saving ? '儲存中...' : '建立'}
          </button>
        </div>
      </div>
    </div>
  )
}
