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
    </div>
  )
}
