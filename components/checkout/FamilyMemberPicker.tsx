'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SavedFamilyMember } from '@/components/FamilyMembersManager'

interface FamilyMemberPickerProps {
  onSelect: (member: SavedFamilyMember) => void
}

export default function FamilyMemberPicker({ onSelect }: FamilyMemberPickerProps) {
  const [members, setMembers] = useState<SavedFamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [authToken, setAuthToken] = useState('')

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!authToken) return
    async function fetch_() {
      try {
        const res = await fetch('/api/family-members', {
          headers: { 'Authorization': `Bearer ${authToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          setMembers(data.members || [])
        }
      } catch { /* 靜默 */ }
      setLoading(false)
    }
    fetch_()
  }, [authToken])

  // 未登入或沒有家人 → 不顯示
  if (!authToken || loading || members.length === 0) return null

  const SHICHEN_LABELS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

  const formatMemberInfo = (m: SavedFamilyMember) => {
    const genderStr = m.gender === 'M' ? '男' : '女'
    let timeStr = ''
    if (m.time_mode === 'unknown') timeStr = '時辰不確定'
    else if (m.time_mode === 'exact') timeStr = `${String(m.hour).padStart(2, '0')}:${String(m.minute).padStart(2, '0')}`
    else {
      const idx = Math.floor(((m.hour + 1) % 24) / 2)
      timeStr = `${SHICHEN_LABELS[idx]}時`
    }
    return `${genderStr} | ${m.year}/${m.month}/${m.day} | ${timeStr}`
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 glass rounded-xl border border-gold/20 hover:border-gold/40 transition-colors"
      >
        <span className="text-sm text-gold font-medium">&#128101; 從已儲存的家人選擇</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gold/60 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m); setOpen(false) }}
              className="w-full text-left glass rounded-lg px-4 py-3 hover:border-gold/40 border border-transparent transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center text-gold font-bold text-sm shrink-0">
                  {m.name[0]}
                </div>
                <div className="min-w-0">
                  {/* v5.10.297:家庭成員姓名重要、加 title hover + CJK keep-all */}
                  <p
                    className="text-sm text-cream font-medium truncate"
                    title={m.name}
                    style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                  >
                    {m.name}
                  </p>
                  <p className="text-xs text-text-muted/60">{formatMemberInfo(m)}</p>
                </div>
              </div>
            </button>
          ))}
          <p className="text-[10px] text-text-muted/40 text-center pt-1">
            選擇後自動填入，仍可手動修改
          </p>
        </div>
      )}
    </div>
  )
}
