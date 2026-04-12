'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

type ReferralRecord = {
  id: string; referrerEmail: string; referrerCode: string
  referredEmail: string; status: string
  referrerPoints: number; referredPoints: number
  createdAt: string; purchasedAt: string | null
}

type Stats = {
  totalReferrals: number; purchasedCount: number; totalPointsAwarded: number
}

export default function ReferralsPage() {
  const { adminKey } = useAdminAuth()
  const [records, setRecords] = useState<ReferralRecord[]>([])
  const [stats, setStats] = useState<Stats>({ totalReferrals: 0, purchasedCount: 0, totalPointsAwarded: 0 })
  const [loading, setLoading] = useState(false)

  // 手動發放積分
  const [grantEmail, setGrantEmail] = useState('')
  const [grantPoints, setGrantPoints] = useState('')
  const [grantDesc, setGrantDesc] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantResult, setGrantResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleGrantPoints = async () => {
    if (!grantEmail || !grantPoints) return
    setGrantLoading(true)
    setGrantResult(null)
    try {
      const res = await fetch('/api/jamie/grant-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: adminKey, email: grantEmail, points: parseInt(grantPoints), description: grantDesc || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setGrantResult({ ok: true, msg: `已發放 ${data.pointsGranted} 點給 ${data.email}，餘額 ${data.newBalance}` })
        setGrantEmail(''); setGrantPoints(''); setGrantDesc('')
      } else {
        setGrantResult({ ok: false, msg: data.error })
      }
    } catch { setGrantResult({ ok: false, msg: '網路錯誤' }) }
    finally { setGrantLoading(false) }
  }

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/jamie/referrals?key=${adminKey}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setStats(data.stats || { totalReferrals: 0, purchasedCount: 0, totalPointsAwarded: 0 })
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchData() }, [fetchData])

  const statusLabel = (status: string) => {
    switch (status) {
      case 'registered': return { text: '已註冊', color: 'bg-blue-500/10 text-blue-400' }
      case 'purchased': return { text: '已購買', color: 'bg-green-500/10 text-green-400' }
      default: return { text: status, color: 'bg-gray-500/10 text-gray-400' }
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">推薦碼</h1>
          <p className="text-xs text-gray-500">推薦碼使用記錄與統計</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 手動發放積分 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-amber-500/20 p-4 mb-6">
        <h3 className="text-sm font-semibold text-amber-400 mb-3">手動發放積分</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] text-gray-500 block mb-1">用戶 Email</label>
            <input value={grantEmail} onChange={e => setGrantEmail(e.target.value)} placeholder="user@email.com"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/40 focus:outline-none" />
          </div>
          <div className="w-24">
            <label className="text-[10px] text-gray-500 block mb-1">點數</label>
            <input value={grantPoints} onChange={e => setGrantPoints(e.target.value.replace(/\D/g, ''))} placeholder="100" type="text"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/40 focus:outline-none" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-[10px] text-gray-500 block mb-1">說明（選填）</label>
            <input value={grantDesc} onChange={e => setGrantDesc(e.target.value)} placeholder="活動獎勵"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500/40 focus:outline-none" />
          </div>
          <button onClick={handleGrantPoints} disabled={grantLoading || !grantEmail || !grantPoints}
            className="px-4 py-2 bg-amber-500/80 text-black font-semibold rounded-lg text-sm hover:bg-amber-500 disabled:opacity-40 transition-colors">
            {grantLoading ? '發放中...' : '發放'}
          </button>
        </div>
        {grantResult && (
          <p className={`text-xs mt-2 ${grantResult.ok ? 'text-green-400' : 'text-red-400'}`}>{grantResult.msg}</p>
        )}
      </div>

      {/* 頂部統計 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">總推薦數</p>
          <p className="text-2xl font-bold text-white">{stats.totalReferrals}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">成功購買數</p>
          <p className="text-2xl font-bold text-green-400">{stats.purchasedCount}</p>
          {stats.totalReferrals > 0 && (
            <p className="text-[10px] text-gray-500 mt-1">
              轉化率 {Math.round(stats.purchasedCount / stats.totalReferrals * 100)}%
            </p>
          )}
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">發放點數總量</p>
          <p className="text-2xl font-bold text-amber-400">{stats.totalPointsAwarded}</p>
        </div>
      </div>

      {/* 推薦記錄列表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">推薦人</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">推薦碼</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">被推薦人</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">狀態</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">點數</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">時間</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const st = statusLabel(r.status)
                return (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-xs text-gray-300 max-w-[180px] truncate">{r.referrerEmail}</td>
                    <td className="px-4 py-3 text-xs text-amber-400 font-mono">{r.referrerCode}</td>
                    <td className="px-4 py-3 text-xs text-gray-300 max-w-[180px] truncate">{r.referredEmail}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-right text-gray-400">
                      {r.status === 'purchased' ? `+${r.referrerPoints} / +${r.referredPoints}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-right text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString('zh-TW')}
                    </td>
                  </tr>
                )
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500 text-sm">暫無推薦記錄</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
