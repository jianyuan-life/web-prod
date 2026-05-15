'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { reportClientFailure } from '@/lib/security/client-audit'
import FamilyMemberModal from './FamilyMemberModal'

export interface SavedFamilyMember {
  id: string
  name: string
  gender: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  time_mode: string
  calendar_type: string
  lunar_leap: boolean
  birth_city: string
  city_lat: number
  city_lng: number
  city_tz: number
  created_at: string
  updated_at: string
}

export default function FamilyMembersManager() {
  const [members, setMembers] = useState<SavedFamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [authToken, setAuthToken] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState<SavedFamilyMember | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // 取得 auth token
  useEffect(() => {
    async function getToken() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        setAuthToken(data.session.access_token)
      }
    }
    getToken()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token || '')
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchMembers = useCallback(async () => {
    if (!authToken) return
    try {
      const res = await fetch('/api/family-members', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members || [])
      }
    } catch (e) {
      // T11 v5.10.360:取代 catch /* 靜默 */ 改用 client-audit 上報
      reportClientFailure('family_members_fetch', e)
    }
    setLoading(false)
  }, [authToken])

  useEffect(() => {
    if (authToken) fetchMembers()
  }, [authToken, fetchMembers])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/family-members/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      })
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== id))
      }
    } catch (e) {
      // T11 v5.10.360
      reportClientFailure('family_members_delete', e, { extra: { memberId: id } })
    }
    setDeletingId(null)
    setConfirmDeleteId(null)
  }

  const handleSaved = () => {
    setShowModal(false)
    setEditingMember(null)
    fetchMembers()
  }

  // 未登入不顯示
  if (!authToken) return null

  const SHICHEN_LABELS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

  const formatTime = (m: SavedFamilyMember) => {
    if (m.time_mode === 'unknown') return '時辰不確定'
    if (m.time_mode === 'exact') return `${String(m.hour).padStart(2, '0')}:${String(m.minute).padStart(2, '0')}`
    // shichen
    const idx = Math.floor(((m.hour + 1) % 24) / 2)
    return `${SHICHEN_LABELS[idx]}時`
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>我的家人</h2>
          <p className="text-sm text-text-muted">儲存家人資料，結帳時一鍵選取</p>
        </div>
        <button
          onClick={() => { setEditingMember(null); setShowModal(true) }}
          disabled={members.length >= 20}
          className="px-4 py-2 bg-gold/15 border border-gold/30 rounded-lg text-sm text-gold hover:bg-gold/25 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 新增家人
        </button>
      </div>

      {loading ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="w-6 h-6 border-2 border-gold/50 border-t-gold rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">載入中...</p>
        </div>
      ) : members.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-3xl mb-3" style={{ fontFamily: 'var(--font-sans)' }}>&#128106;</div>
          <p className="text-text-muted text-sm mb-3">還沒有儲存任何家人資料</p>
          <p className="text-text-muted/60 text-xs">新增後，結帳時可以直接選擇，不用每次重新輸入</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <div key={m.id} className="glass rounded-xl p-4 hover:border-gold/30 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center text-gold font-bold shrink-0">
                    {m.name[0]}
                  </div>
                  <div className="min-w-0">
                    {/* v5.10.297:成員姓名 + 城市重要、加 title hover + CJK keep-all */}
                    <h3
                      className="font-semibold text-cream truncate"
                      title={m.name}
                      style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                    >
                      {m.name}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {m.gender === 'M' ? '男' : '女'} | {m.calendar_type === 'lunar' ? '農曆' : ''}{m.year}年{m.month}月{m.day}日 | {formatTime(m)}
                    </p>
                    {m.birth_city && (
                      <p
                        className="text-xs text-text-muted/60 mt-0.5 truncate"
                        title={m.birth_city}
                        style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                      >
                        {m.birth_city}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => { setEditingMember(m); setShowModal(true) }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-gold hover:bg-gold/10 transition-colors"
                    title="編輯"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(confirmDeleteId === m.id ? null : m.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="刪除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              {confirmDeleteId === m.id && (
                <div className="mt-3 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <span className="text-xs text-red-300">確定刪除？</span>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-text-muted border border-white/10 rounded hover:bg-white/5">取消</button>
                    <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} className="px-2 py-1 text-xs text-white bg-red-500/80 rounded hover:bg-red-500 disabled:opacity-50">
                      {deletingId === m.id ? '刪除中...' : '確認'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {members.length > 0 && members.length < 20 && (
        <p className="text-xs text-text-muted/40 text-center mt-3">已儲存 {members.length}/20 位</p>
      )}

      {/* 新增/編輯 Modal */}
      {showModal && (
        <FamilyMemberModal
          authToken={authToken}
          member={editingMember}
          onClose={() => { setShowModal(false); setEditingMember(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
