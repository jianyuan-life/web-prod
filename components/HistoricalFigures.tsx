'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Figure {
  name: string
  year: string
  month: string
  day: string
  hour: string
  minute: string
  gender: string
}

interface HistoricalFiguresProps {
  onSelect: (fig: Figure) => void
}

export default function HistoricalFigures({ onSelect }: HistoricalFiguresProps) {
  const [open, setOpen] = useState(false)
  const [figures, setFigures] = useState<Figure[]>([])
  const [loaded, setLoaded] = useState(false)

  // 載入用戶過去輸入過的資料（從歷史報告提取，去重）
  // v5.10.30 R+8 P0 修(7-LLM 共識「/api/reports 401」、L7 DeepSeek 抓 console error):
  //   原邏輯 fetch /api/reports?email=... 沒帶 Authorization header → API 401 拒絕
  //   修補:用 supabase.auth.getSession 取 access_token、加 Bearer header
  useEffect(() => {
    if (loaded) return
    setLoaded(true)
    // 先取得用戶 session(含 email + access_token)、再查詢歷史報告
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session
      const email = session?.user?.email
      const token = session?.access_token
      if (!email || !token) return
      return fetch(`/api/reports?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      })
    })
      .then(r => r?.ok ? r.json() : null)
      .then(data => {
        if (!data?.reports?.length) return
        const seen = new Set<string>()
        const people: Figure[] = []
        for (const r of data.reports) {
          const bd = r.birth_data
          if (!bd?.name) continue
          // 用姓名+生日去重
          const key = `${bd.name}-${bd.year}-${bd.month}-${bd.day}`
          if (seen.has(key)) continue
          seen.add(key)
          people.push({
            name: bd.name,
            year: String(bd.year || '1990'),
            month: String(bd.month || '1'),
            day: String(bd.day || '1'),
            hour: String(bd.hour || '12'),
            minute: String(bd.minute || '0'),
            gender: bd.gender || 'M',
          })
          // 如果是家族/合盤方案，也提取成員
          if (bd.members) {
            for (const m of bd.members) {
              if (!m.name) continue
              const mkey = `${m.name}-${m.year}-${m.month}-${m.day}`
              if (seen.has(mkey)) continue
              seen.add(mkey)
              people.push({
                name: m.name,
                year: String(m.year || '1990'),
                month: String(m.month || '1'),
                day: String(m.day || '1'),
                hour: String(m.hour || '12'),
                minute: String(m.minute || '0'),
                gender: m.gender || 'M',
              })
            }
          }
        }
        setFigures(people)
      })
      .catch(() => {})
  }, [loaded])

  // 沒有歷史資料時不顯示
  if (figures.length === 0) return null

  return (
    <div className="mb-4">
      {/* 觸發條 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-gold/[0.06] border border-gold/15 rounded-xl px-4 py-3.5 hover:bg-gold/10 hover:border-gold/30 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-gold/12 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[13px] font-semibold text-cream">快速填入歷史資料</div>
            <div className="text-[11px] text-text-muted">選擇曾經分析過的人物，一鍵帶入資料</div>
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-gold)" strokeWidth="2"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 展開式人物清單 */}
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[360px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}
      >
        <div className="bg-[rgba(10,14,26,0.5)] border border-gold/[0.08] rounded-xl p-1">
          <ul className="max-h-[280px] overflow-y-auto space-y-0">
            {figures.map((fig) => (
              <li
                key={fig.name}
                className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] hover:bg-gold/[0.06] cursor-pointer transition-all border-b border-white/[0.03] last:border-b-0"
                onClick={() => { onSelect(fig); setOpen(false) }}
              >
                <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-gold/20 to-gold/[0.08] border border-gold/25 flex items-center justify-center text-gold text-[15px] font-bold shrink-0">
                  {fig.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-cream">{fig.name}</div>
                  <div className="text-xs text-text-muted flex items-center gap-2">
                    <span>{fig.year}/{fig.month}/{fig.day}</span>
                    <span className="w-[3px] h-[3px] rounded-full bg-text-muted/40" />
                    <span>{fig.gender === 'M' ? '男' : '女'}</span>
                  </div>
                </div>
                <span className="text-[11px] px-3.5 py-1.5 rounded-[7px] border border-gold/20 text-gold font-semibold hover:bg-gold hover:text-dark hover:border-gold hover:shadow-[0_4px_16px_rgba(201,168,76,0.2)] transition-all shrink-0">
                  選擇
                </span>
              </li>
            ))}
          </ul>
          <div className="text-center py-2 border-t border-white/[0.03]">
            <span className="text-[10px] text-text-muted/60">選擇後自動填入出生資料</span>
          </div>
        </div>
      </div>
    </div>
  )
}
