'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import { maskEmail } from '@/lib/privacy-mask'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件擇吉', E2:'月度單盤',
}

type UserReport = {
  id: string; plan_code: string; client_name: string
  amount_usd: number; status: string; created_at: string
}

type AdminUser = {
  id: string; email: string; full_name: string
  created_at: string; last_sign_in_at: string | null
  purchase_count: number; total_spent: number; reports: UserReport[]
}

export default function UsersPage() {
  const { adminKey } = useAdminAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [order, setOrder] = useState('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [segment, setSegment] = useState<string>('all')

  const fetchUsers = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/users?sort=${sort}&order=${order}`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } finally { setLoading(false) }
  }, [adminKey, sort, order])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleSort = (field: string) => {
    if (sort === field) { setOrder(o => o === 'desc' ? 'asc' : 'desc') }
    else { setSort(field); setOrder('desc') }
  }

  // 篩選
  const filtered = users.filter(u => {
    if (segment === 'paying' && u.purchase_count === 0) return false
    if (segment === 'free' && u.purchase_count > 0) return false
    if (search) {
      const q = search.toLowerCase()
      return u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)
    }
    return true
  })

  const totalSpentAll = filtered.reduce((s, u) => s + u.total_spent, 0)
  const totalPurchases = filtered.reduce((s, u) => s + u.purchase_count, 0)

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">用戶管理</h1>
          <p className="text-xs text-gray-500">共 {filtered.length} 位用戶 / 累計消費 ${Math.round(totalSpentAll)} / 累計 {totalPurchases} 筆訂單</p>
        </div>
        <button onClick={fetchUsers} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 搜尋與分群 */}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="搜尋 Email 或姓名..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-500 focus:outline-none" />
        <div className="flex gap-1">
          {[
            { key: 'all', label: '全部' },
            { key: 'paying', label: '付費用戶' },
            { key: 'free', label: '免費用戶' },
          ].map(s => (
            <button key={s.key} onClick={() => setSegment(s.key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${segment === s.key ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 用戶列表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">用戶</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort('purchase_count')}>
                訂單數 {sort === 'purchase_count' ? (order === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort('total_spent')}>
                累計消費 {sort === 'total_spent' ? (order === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort('created_at')}>
                註冊時間 {sort === 'created_at' ? (order === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">最後登入</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <Fragment key={user.id}>
                <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}>
                  <td className="px-4 py-3">
                    <div className="text-white">{user.full_name || '(未填姓名)'}</div>
                    <div className="text-[10px] text-gray-500" title="個資保護:點用戶詳情查完整 email">{maskEmail(user.email)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={user.purchase_count > 0 ? 'text-green-400' : 'text-gray-500'}>{user.purchase_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={user.total_spent > 0 ? 'text-amber-400' : 'text-gray-500'}>${user.total_spent}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(user.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                  </td>
                </tr>
                {expandedId === user.id && user.reports.length > 0 && (
                  <tr key={`${user.id}-reports`} className="bg-white/[0.02]">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="text-xs text-gray-500 mb-2">購買記錄</div>
                      <div className="space-y-1.5">
                        {user.reports.map(r => (
                          <div key={r.id} className="flex items-center gap-3 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === 'completed' ? 'bg-green-400' : r.status === 'generating' ? 'bg-blue-400' : r.status === 'pending' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                            <span className="text-amber-400">{PLAN_NAMES[r.plan_code] || r.plan_code}</span>
                            <span className="text-gray-500">—</span>
                            <span className="text-white">{r.client_name}</span>
                            <span className="text-gray-500 ml-auto">${r.amount_usd}</span>
                            <span className="text-gray-500">{new Date(r.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">暫無用戶</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
