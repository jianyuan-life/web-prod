'use client'

// ============================================================
// Sprint 5 — 管理員國際化資料補填頁
// 路徑：/jamie/recalculate
//
// 功能：
//   1. 列出所有 timezone=null 的報告
//   2. 顯示「建議的 timezone / 國家碼」（lookupCityTz 預測）
//   3. 一鍵採用建議 → 呼叫 /api/admin/recalculate-report 補填 + 重算
//   4. 也支援手動輸入 IANA 時區
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { getAllUniqueTimezones } from '@/lib/cities-with-tz'
import { maskEmail } from '@/lib/privacy-mask'
import { internalGet, internalPost } from '@/lib/api'  // T10b v5.10.381(timeout + 429)

interface Row {
  id: string
  client_name: string | null
  plan_code: string
  status: string
  birth_data: Record<string, unknown> | null
  timezone: string | null
  birth_city: string | null
  birth_country: string | null
  birth_lat: number | null
  birth_lng: number | null
  customer_email: string | null
  created_at: string
  suggested_timezone: string | null
  suggested_country: string | null
  suggested_lat: number | null
  suggested_lng: number | null
  derived_birth_city: string | null
}

const ALL_TIMEZONES = getAllUniqueTimezones()

export default function RecalculatePage() {
  const { adminKey } = useAdminAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [actionMessage, setActionMessage] = useState('')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      // T10b v5.10.381 — internalGet 統一處理(timeout + 429)
      const data = await internalGet('/api/admin/timezone-missing?limit=200', {
        headers: { 'x-admin-key': adminKey },
      }) as { reports?: Row[]; total?: number }
      setRows(data.reports || [])
      setTotal(data.total || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => {
    if (adminKey) fetchList()
  }, [adminKey, fetchList])

  const recalc = async (r: Row, tz: string, country: string | null, lat: number | null, lng: number | null, city: string | null) => {
    if (!tz) {
      setActionMessage('請先選擇 timezone 或輸入 IANA 字串')
      return
    }
    setPending(prev => new Set(prev).add(r.id))
    setActionMessage('')
    try {
      const body: Record<string, unknown> = {
        reportId: r.id,
        timezone: tz,
        reason: '後台補填時區並重算（Sprint 5）',
      }
      if (country) body.birth_country = country
      if (lat != null) body.birth_lat = lat
      if (lng != null) body.birth_lng = lng
      if (city) body.birth_city = city
      // T10b v5.10.381 — internalPost 統一處理(timeout + 429 + ApiError)
      try {
        await internalPost('/api/admin/recalculate-report', body, {
          headers: { 'x-admin-key': adminKey },
        })
        setActionMessage(`✓ 已重算 ${r.client_name || r.id.slice(0, 8)}(${tz})`)
        setRows(prev => prev.filter(x => x.id !== r.id))
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : '未知錯誤'
        setActionMessage(`✗ 失敗:${msg}`)
      }
    } catch (e) {
      setActionMessage(`✗ 網路錯誤:${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setPending(prev => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">時區補填與報告重算</h1>
        <p className="text-sm text-gray-400">
          Sprint 5 國際化：針對 <code className="text-amber-400">timezone IS NULL</code> 的報告，
          依據出生城市推測 IANA 時區，一鍵補填並重跑完整報告流程。
        </p>
        <p className="text-xs text-gray-500 mt-1">
          總計待補填：<span className="text-amber-400 font-bold">{total}</span> 份。
          預設推測策略：中港台 → Asia/Taipei / Asia/Hong_Kong / Asia/Shanghai；
          其他依 birth_city 字串比對。
        </p>
      </div>

      {actionMessage && (
        <div className={`mb-4 p-3 rounded text-sm ${actionMessage.startsWith('✓') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
          {actionMessage}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="bg-green-900/20 border border-green-700/30 rounded p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <div className="text-green-300 font-bold mb-1">全部報告都已補填完畢！</div>
          <div className="text-xs text-gray-400">沒有 timezone=null 的紀錄，Sprint 5 遷移完成。</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <RecalcRow
              key={r.id}
              row={r}
              pending={pending.has(r.id)}
              onSubmit={recalc}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RecalcRow({
  row,
  pending,
  onSubmit,
}: {
  row: Row
  pending: boolean
  onSubmit: (
    r: Row,
    tz: string,
    country: string | null,
    lat: number | null,
    lng: number | null,
    city: string | null,
  ) => void
}) {
  const [manualTz, setManualTz] = useState(row.suggested_timezone || '')
  const [manualCountry, setManualCountry] = useState(row.suggested_country || row.birth_country || '')
  const [manualCity, setManualCity] = useState(row.birth_city || row.derived_birth_city || '')
  const [useSuggested, setUseSuggested] = useState(true)

  const city = manualCity || row.derived_birth_city
  return (
    <div className="bg-[#141414] border border-white/5 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-bold">{row.client_name || '(未命名)'}</span>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded">
              {row.plan_code}
            </span>
            <span className="text-[10px] text-gray-500">{new Date(row.created_at).toLocaleDateString('zh-TW')}</span>
          </div>
          <div className="text-xs text-gray-400">
            <span title="個資保護:點報告詳情查完整 email">{maskEmail(row.customer_email)}</span> · 狀態 <span className="text-gray-300">{row.status}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            id: {row.id.slice(0, 8)}... | city: {city || '(空)'} | country: {row.birth_country || '(空)'} | lat/lng: {row.birth_lat ?? '-'}/{row.birth_lng ?? '-'}
          </div>
        </div>
      </div>

      {row.suggested_timezone && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2 mb-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              checked={useSuggested}
              onChange={() => { setUseSuggested(true); setManualTz(row.suggested_timezone || '') }}
              className="accent-amber-500"
            />
            <span className="text-white">
              採用建議：<code className="text-amber-400">{row.suggested_timezone}</code>
              {row.suggested_country && (
                <span className="text-amber-300/70 text-xs ml-2">
                  · 國家 {row.suggested_country} · lat/lng {row.suggested_lat?.toFixed(2)}/{row.suggested_lng?.toFixed(2)}
                </span>
              )}
            </span>
          </label>
        </div>
      )}

      <div className="bg-white/5 rounded px-3 py-2 mb-3">
        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
          <input
            type="radio"
            checked={!useSuggested}
            onChange={() => setUseSuggested(false)}
            className="accent-amber-500"
          />
          <span className="text-white">手動指定</span>
        </label>
        {!useSuggested && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 ml-6 mt-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">IANA 時區</label>
              <input
                list="all-timezones"
                type="text"
                value={manualTz}
                onChange={(e) => setManualTz(e.target.value)}
                placeholder="Asia/Taipei"
                className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">國家碼（ISO 3166）</label>
              <input
                type="text"
                value={manualCountry}
                onChange={(e) => setManualCountry(e.target.value.toUpperCase())}
                placeholder="TW / US / HK"
                maxLength={2}
                className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-sm text-white uppercase"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">城市（顯示用）</label>
              <input
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="Taipei"
                className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-sm text-white"
              />
            </div>
          </div>
        )}
      </div>

      <datalist id="all-timezones">
        {ALL_TIMEZONES.map(tz => <option key={tz} value={tz} />)}
      </datalist>

      <div className="flex gap-2">
        <button
          disabled={pending || !manualTz}
          onClick={() => onSubmit(
            row,
            useSuggested ? (row.suggested_timezone || '') : manualTz,
            useSuggested ? row.suggested_country : (manualCountry || null),
            useSuggested ? row.suggested_lat : row.birth_lat,
            useSuggested ? row.suggested_lng : row.birth_lng,
            useSuggested ? (row.derived_birth_city || row.birth_city || null) : (manualCity || null),
          )}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded disabled:opacity-40"
        >
          {pending ? '處理中...' : '補填並重算'}
        </button>
        <span className="text-[10px] text-gray-500 self-center">
          將把 status 改為 pending 並觸發完整報告重新生成
        </span>
      </div>
    </div>
  )
}
