'use client'

// ============================================================
// Sprint 5 — 客戶自助更新出生地資料元件
// 用在 dashboard 每份報告旁邊，讓客戶自己補正時區
//
// 使用者情境：
//   1. 客戶發現報告中 DST 沒算到（如紐約 1985-07-15 EDT 應該 UTC-4 而非 -5）
//   2. 點開「更新出生地」小視窗
//   3. 從 500+ 城市下拉選新的城市 → 帶出正確 IANA 時區
//   4. 送出後系統重算，免費
// ============================================================

import { useState } from 'react'
import { searchCitiesTz, type CityTz } from '@/lib/cities-with-tz'

interface Props {
  reportId: string
  authToken: string
  currentTimezone?: string | null
  currentCity?: string | null
  onSuccess?: (remainingUpdates: number) => void
}

export default function UpdateBirthLocation({ reportId, authToken, currentTimezone, currentCity, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CityTz | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const results = query.length >= 1 ? searchCitiesTz(query, 8) : []

  const handleSubmit = async () => {
    if (!selected) {
      setMessage('請先選擇城市')
      return
    }
    if (!authToken) {
      setMessage('登入狀態失效，請重新登入')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const res = await fetch('/api/reports/update-birth-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          reportId,
          timezone: selected.timezone,
          birth_city: selected.name,
          birth_country: selected.countryCode,
          birth_lat: selected.lat,
          birth_lng: selected.lng,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`✓ ${data.message || '更新成功'}（剩餘 ${data.remaining_updates} 次）`)
        setTimeout(() => {
          setOpen(false)
          setMessage('')
          onSuccess?.(data.remaining_updates)
        }, 2500)
      } else {
        setMessage(`✗ ${data.error || '更新失敗'}`)
      }
    } catch (e) {
      setMessage(`✗ 網路錯誤：${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] text-text-muted/60 hover:text-gold underline transition-colors"
        title="更正出生地資料並重新生成報告"
      >
        更新出生地資料
      </button>
    )
  }

  return (
    <div className="mt-3 bg-gold/5 border border-gold/20 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-gold">更新出生地資料</div>
          <div className="text-[10px] text-text-muted mt-1">
            目前：{currentCity || '(未設定)'}{currentTimezone ? ` · ${currentTimezone}` : ''}
          </div>
        </div>
        <button onClick={() => { setOpen(false); setMessage('') }}
          className="text-text-muted hover:text-white text-xs">✕</button>
      </div>

      <p className="text-[11px] text-text-muted/80 leading-relaxed">
        若發現報告時區不對（例如紐約出生卻沒有處理夏令時），可在此重選城市，
        系統會<span className="text-gold">免費重新生成一次報告</span>（每份報告最多 2 次）。
      </p>

      <div>
        <label className="block text-[10px] text-text-muted mb-1">搜尋出生城市</label>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
          placeholder="例如：紐約、Taipei、London"
          className="w-full bg-black/40 border border-gold/20 rounded px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none"
        />
        {results.length > 0 && !selected && (
          <div className="mt-1 bg-black border border-gold/20 rounded max-h-40 overflow-y-auto">
            {results.map(c => (
              <button
                key={`${c.name_en}-${c.country}`}
                onClick={() => setSelected(c)}
                className="w-full text-left px-3 py-2 text-xs text-white hover:bg-gold/10 border-b border-gold/5 last:border-0 flex justify-between"
              >
                <span>{c.name}（{c.country}）</span>
                <span className="text-[10px] text-text-muted/60 font-mono">{c.timezone}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-gold/10 rounded px-3 py-2">
          <div className="text-xs text-white font-bold">{selected.name}（{selected.country}）</div>
          <div className="text-[10px] text-text-muted mt-1 font-mono">
            {selected.timezone} · 標準時 UTC{selected.tz >= 0 ? '+' : ''}{selected.tz}
            {' · '}{selected.lat.toFixed(2)}°, {selected.lng.toFixed(2)}°
          </div>
        </div>
      )}

      {message && (
        <div className={`text-xs ${message.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
          {message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => { setOpen(false); setMessage('') }}
          className="px-3 py-1.5 text-xs text-text-muted border border-white/10 rounded hover:bg-white/5"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className="px-4 py-1.5 text-xs text-dark bg-gold rounded font-bold hover:bg-gold/90 disabled:opacity-40"
        >
          {submitting ? '處理中...' : '更新並重算'}
        </button>
      </div>
    </div>
  )
}
