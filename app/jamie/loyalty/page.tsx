'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

type LoyaltyCustomer = {
  userId: string
  email: string
  fullName: string
  balance: number
  totalEarned: number
  totalUsed: number
  referralCount: number
  referralCode: string
  createdAt: string
}

type LoyaltyStats = {
  totalReferrers: number
  totalPointsCirculation: number
  activeReferrers: number
}

// 忠誠度等級判定
function getLoyaltyTier(totalEarned: number): { label: string; color: string; bgColor: string } {
  if (totalEarned >= 500) return { label: '鑽石會員', color: 'text-cyan-300', bgColor: 'bg-cyan-500/10 border-cyan-500/30' }
  if (totalEarned >= 200) return { label: '金牌會員', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/30' }
  if (totalEarned >= 50) return { label: '銀牌會員', color: 'text-gray-300', bgColor: 'bg-gray-400/10 border-gray-400/30' }
  return { label: '一般會員', color: 'text-gray-500', bgColor: 'bg-white/5 border-white/10' }
}

// 排名顏色（前三名）
function getRankStyle(index: number): string {
  if (index === 0) return 'text-amber-400'   // 金
  if (index === 1) return 'text-gray-300'     // 銀
  if (index === 2) return 'text-orange-400'   // 銅
  return 'text-gray-500'
}

function getRankBg(index: number): string {
  if (index === 0) return 'bg-amber-500/5'
  if (index === 1) return 'bg-gray-400/5'
  if (index === 2) return 'bg-orange-500/5'
  return ''
}

export default function LoyaltyPage() {
  const { adminKey } = useAdminAuth()
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([])
  const [stats, setStats] = useState<LoyaltyStats>({ totalReferrers: 0, totalPointsCirculation: 0, activeReferrers: 0 })
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/loyalty`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
        setStats(data.stats || { totalReferrers: 0, totalPointsCirculation: 0, activeReferrers: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [adminKey])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="p-6 max-w-7xl">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">客戶忠誠度</h1>
          <p className="text-xs text-gray-500">積分與推薦排名總覽</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 頂部統計卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">總推薦人數</p>
          <p className="text-2xl font-bold text-white">{stats.totalReferrers}</p>
          <p className="text-[10px] text-gray-600 mt-1">擁有推薦碼的用戶</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">總積分流通量</p>
          <p className="text-2xl font-bold text-amber-400">{stats.totalPointsCirculation.toLocaleString()}</p>
          <p className="text-[10px] text-gray-600 mt-1">所有用戶累計獲得的積分</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 mb-1">活躍推薦人數</p>
          <p className="text-2xl font-bold text-green-400">{stats.activeReferrers}</p>
          {stats.totalReferrers > 0 && (
            <p className="text-[10px] text-gray-600 mt-1">
              活躍率 {Math.round(stats.activeReferrers / stats.totalReferrers * 100)}%
            </p>
          )}
        </div>
      </div>

      {/* 忠誠度等級說明 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4 mb-6">
        <h3 className="text-xs font-semibold text-gray-400 mb-3">忠誠度等級</h3>
        <div className="flex flex-wrap gap-3">
          {[
            { label: '一般會員', range: '0-49 點', color: 'text-gray-500', dot: 'bg-gray-500' },
            { label: '銀牌會員', range: '50-199 點', color: 'text-gray-300', dot: 'bg-gray-300' },
            { label: '金牌會員', range: '200-499 點', color: 'text-amber-400', dot: 'bg-amber-400' },
            { label: '鑽石會員', range: '500+ 點', color: 'text-cyan-300', dot: 'bg-cyan-300' },
          ].map(tier => (
            <div key={tier.label} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
              <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
              <span className={`text-xs font-medium ${tier.color}`}>{tier.label}</span>
              <span className="text-[10px] text-gray-600">{tier.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 客戶排名表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium w-10">#</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">姓名</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium">等級</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">可用積分</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">累計獲得</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">累計使用</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">推薦人數</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium">註冊日期</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => {
                const tier = getLoyaltyTier(c.totalEarned)
                const rankColor = getRankStyle(i)
                const rankBg = getRankBg(i)
                return (
                  <tr key={c.userId} className={`border-b border-white/5 hover:bg-white/[0.02] ${rankBg}`}>
                    <td className={`px-4 py-3 text-sm font-bold ${rankColor}`}>
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-200 max-w-[120px] truncate">
                      {c.fullName || '(未填姓名)'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">
                      {c.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tier.bgColor} ${tier.color}`}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-right text-white font-medium">
                      {c.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right text-amber-400 font-medium">
                      {c.totalEarned.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right text-gray-400">
                      {c.totalUsed.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right text-gray-400">
                      {c.referralCount > 0 ? (
                        <span className="text-green-400">{c.referralCount}</span>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-right text-gray-500">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('zh-TW') : '-'}
                    </td>
                  </tr>
                )
              })}
              {customers.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500 text-sm">
                    暫無積分用戶數據
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500 text-sm">
                    載入中...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 底部統計 */}
        {customers.length > 0 && (
          <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              共 {customers.length} 位用戶
            </span>
            <div className="flex gap-4">
              <span className="text-[10px] text-gray-600">
                鑽石 {customers.filter(c => c.totalEarned >= 500).length}
              </span>
              <span className="text-[10px] text-gray-600">
                金牌 {customers.filter(c => c.totalEarned >= 200 && c.totalEarned < 500).length}
              </span>
              <span className="text-[10px] text-gray-600">
                銀牌 {customers.filter(c => c.totalEarned >= 50 && c.totalEarned < 200).length}
              </span>
              <span className="text-[10px] text-gray-600">
                一般 {customers.filter(c => c.totalEarned < 50).length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* v5.4.3 Item 1 批次 4:手動發放積分 UI(API 已存、UI 缺) */}
      <GrantPointsPanel adminKey={adminKey || ''} onSuccess={() => fetchData()} />
    </div>
  )
}

function GrantPointsPanel({ adminKey, onSuccess }: { adminKey: string; onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [points, setPoints] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleGrant = async () => {
    if (!adminKey) return
    if (!email.trim()) {
      setResult({ ok: false, message: '請輸入 email' })
      return
    }
    if (!points || points === 0) {
      setResult({ ok: false, message: '請輸入點數(可為負數扣點)' })
      return
    }
    if (!description.trim()) {
      setResult({ ok: false, message: '請填寫發放原因(audit log 用)' })
      return
    }
    // v5.4.3 補:Gemini+Codex 共識 P1 confirm dialog(尤其負數)
    const action = points > 0 ? '發放' : '扣除'
    const absPoints = Math.abs(points)
    const confirmMsg = `確認${action} ${absPoints} 點給 ${email}?\n\n原因:${description}\n\n${points < 0 ? '⚠️ 此為扣點操作、不可逆!' : ''}`
    if (!window.confirm(confirmMsg)) return

    setSubmitting(true)
    setResult(null)
    try {
      const res = await adminFetch('/api/admin/grant-points', {
        adminKey,
        method: 'POST',
        body: JSON.stringify({
          key: adminKey,
          email: email.trim(),
          points,
          description: description.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({ ok: true, message: `成功${action} ${absPoints} 點給 ${email}` })
        setEmail('')
        setPoints(0)
        setDescription('')
        onSuccess()
      } else {
        // v5.4.3 Codex P1:細化錯誤訊息(401/403/429/parse fail)
        let errMsg = data?.error || data?.message || ''
        if (!errMsg) {
          if (res.status === 401) errMsg = '未授權(401)、請重新登入'
          else if (res.status === 403) errMsg = '權限不足(403)'
          else if (res.status === 429) errMsg = '請求過於頻繁(429)、稍後再試'
          else if (res.status >= 500) errMsg = `伺服器錯誤(${res.status})`
          else errMsg = `操作失敗(HTTP ${res.status})`
        }
        setResult({ ok: false, message: errMsg })
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'network error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-6 bg-[#1a1a1a] rounded-xl border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-white mb-1">手動發放/扣除積分</h3>
      <p className="text-xs text-gray-500 mb-4">
        補償客訴 / 行銷活動加碼 / 修正異常扣點。所有操作寫入 audit_log、原因必填。
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">客戶 Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="w-full px-3 py-2 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-gray-600 focus:border-blue-500/50 outline-none"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">點數(可為負數扣點)</label>
          <input
            type="number"
            value={points || ''}
            onChange={(e) => setPoints(Number(e.target.value))}
            placeholder="例如 10 或 -5"
            className="w-full px-3 py-2 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-gray-600 focus:border-blue-500/50 outline-none"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">原因(必填、audit log)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如:客訴補償 #ORD-1234"
            className="w-full px-3 py-2 text-xs bg-black/30 border border-white/10 rounded text-white placeholder-gray-600 focus:border-blue-500/50 outline-none"
            disabled={submitting}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleGrant}
          disabled={submitting || !email || !points || !description}
          className={`px-4 py-2 text-xs rounded border disabled:opacity-40 ${
            points < 0
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30'
              : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border-blue-500/30'
          }`}
        >
          {submitting
            ? (points < 0 ? '扣除中...' : '發放中...')
            : (points < 0 ? '⚠️ 確認扣除' : '確認發放')}
        </button>
        {result && (
          <span className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
            {result.ok ? '✓' : '✗'} {result.message}
          </span>
        )}
      </div>
    </div>
  )
}
