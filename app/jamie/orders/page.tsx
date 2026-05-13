'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import { maskEmail } from '@/lib/privacy-mask'
import { PLAN_NAMES } from '@/lib/plan-names'


const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: 'text-green-400 bg-green-400/10' },
  pending: { label: '處理中', color: 'text-yellow-400 bg-yellow-400/10' },
  generating: { label: '生成中', color: 'text-blue-400 bg-blue-400/10' },
  failed: { label: '失敗', color: 'text-red-400 bg-red-400/10' },
}

type Order = {
  id: string; client_name: string; customer_email: string; plan_code: string
  amount_usd: number; status: string; created_at: string; error_message?: string
  retry_count?: number; birth_data?: Record<string, string>
}

// v5.10.278:get_history response shape
type ReportHistory = {
  current: unknown
  previous: unknown
  recalculated_at: string | null
  recalculated_by: string | null
  has_backup: boolean
}

export default function OrdersPage() {
  const { adminKey } = useAdminAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchOrders = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin?range=90d`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setOrders(data.recent_orders || [])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  // 用獨立 API 取完整訂單（直接用 paid_reports 全量）
  const fetchFullOrders = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/orders`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      } else {
        // fallback 到總覽 API
        await fetchOrders()
      }
    } catch {
      await fetchOrders()
    } finally { setLoading(false) }
  }, [adminKey, fetchOrders])

  useEffect(() => { fetchFullOrders() }, [fetchFullOrders])

  // 篩選
  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (o.client_name || '').toLowerCase().includes(q)
        || (o.customer_email || '').toLowerCase().includes(q)
        || (o.plan_code || '').toLowerCase().includes(q)
        || (o.id || '').toLowerCase().includes(q)
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // 重試失敗報告
  const retryOrder = async (id: string) => {
    const res = await adminFetch('/api/admin/orders', {
      adminKey,
      method: 'PATCH',
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'pending', error_message: undefined } : o))
    } else {
      const err = await res.json()
      alert(err.error || '重試失敗')
    }
  }

  // v5.10.278:查報告歷史(配 v5.10.276 endpoint)— ops 可看 previous_report_result
  const viewHistory = async (id: string) => {
    const res = await adminFetch('/api/admin/orders', {
      adminKey,
      method: 'POST',
      body: JSON.stringify({ id, action: 'get_history' }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error || '查歷史失敗')
      return
    }
    const data: ReportHistory = await res.json()
    if (!data.has_backup) {
      alert('此報告從未 recalculate、無備份可看')
      return
    }
    const summary = [
      `Report ID: ${id}`,
      `最後 recalculate: ${data.recalculated_at || 'n/a'}`,
      `觸發者: ${data.recalculated_by || 'n/a'}`,
      '',
      '若要還原舊版、回主列表點「還原舊版」按鈕(會 swap)',
    ].join('\n')
    alert(summary)
  }

  // v5.10.278:還原舊版(typed confirmation 避免誤點)
  const restoreOrder = async (id: string, clientName: string) => {
    // typed confirmation:必須輸入「還原 <client>」才執行(對應 Codex P0「危險 action 缺確認」)
    const expected = `還原 ${clientName}`
    const input = prompt(`⚠️ 此操作會把報告 swap 回 previous_report_result\n\n客戶:${clientName}\n\n請輸入「${expected}」確認:`)
    if (input !== expected) {
      if (input !== null) alert('輸入不符、已取消')
      return
    }
    const res = await adminFetch('/api/admin/orders', {
      adminKey,
      method: 'POST',
      body: JSON.stringify({ id, action: 'restore' }),
    })
    if (res.ok) {
      alert('✅ 已還原至上一版、客戶下次看會看舊版內容')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'completed', error_message: undefined } : o))
    } else {
      const err = await res.json()
      alert(err.error || '還原失敗')
    }
  }

  // CSV 匯出
  const exportCSV = () => {
    const headers = ['ID', '客戶名', 'Email', '方案', '金額(USD)', '狀態', '建立時間']
    const rows = filtered.map(o => [
      o.id, o.client_name, o.customer_email,
      PLAN_NAMES[o.plan_code] || o.plan_code,
      o.amount_usd, o.status, o.created_at,
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">訂單管理</h1>
          <p className="text-xs text-gray-500">共 {filtered.length} 筆訂單</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            匯出 CSV
          </button>
          <button onClick={fetchFullOrders} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 搜尋與篩選 */}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="搜尋客戶名/Email/ID..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-500 focus:outline-none" />
        <div className="flex gap-1">
          {['all', 'completed', 'generating', 'pending', 'failed'].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {s === 'all' ? '全部' : STATUS_LABELS[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* 訂單列表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">客戶</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">方案</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">金額</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">狀態</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">日期</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(order => (
              <Fragment key={order.id}>
                <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                  <td className="px-4 py-3">
                    <div className="text-white">{order.client_name}</div>
                    <div className="text-[10px] text-gray-500" title="個資保護:點訂單詳情查完整 email">{maskEmail(order.customer_email)}</div>
                  </td>
                  <td className="px-4 py-3 text-amber-400">{PLAN_NAMES[order.plan_code] || order.plan_code}</td>
                  <td className="px-4 py-3 text-white">${order.amount_usd}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LABELS[order.status]?.color || 'text-gray-400'}`}>
                      {STATUS_LABELS[order.status]?.label || order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(order.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center">
                      <button onClick={e => { e.stopPropagation(); retryOrder(order.id) }}
                        className={`text-xs hover:opacity-80 ${order.status === 'completed' ? 'text-blue-400' : 'text-amber-400'}`}>
                        {order.status === 'completed' ? '重新生成' : order.status === 'failed' ? '重試' : '強制重試'}
                      </button>
                      {/* v5.10.278:歷史 + 還原(配 v5.10.276 endpoint、Codex P0#6 + Gemini P0#4 完整收尾) */}
                      <button onClick={e => { e.stopPropagation(); viewHistory(order.id) }}
                        className="text-xs text-gray-400 hover:text-gray-200" title="查看上一版備份">
                        歷史
                      </button>
                      <button onClick={e => { e.stopPropagation(); restoreOrder(order.id, order.client_name) }}
                        className="text-xs text-purple-400 hover:opacity-80" title="還原到上一版(需 typed confirmation)">
                        還原
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === order.id && (
                  <tr key={`${order.id}-detail`} className="bg-white/[0.02]">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-gray-500">訂單 ID：</span>
                          <span className="text-white ml-1 font-mono text-[10px]">{order.id}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">重試次數：</span>
                          <span className="text-white ml-1">{order.retry_count ?? 0}</span>
                        </div>
                        {order.error_message && (
                          <div className="col-span-2">
                            <span className="text-gray-500">錯誤訊息：</span>
                            <span className="text-red-400 ml-1">{order.error_message}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">暫無訂單</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10 disabled:opacity-30">上一頁</button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10 disabled:opacity-30">下一頁</button>
        </div>
      )}
    </div>
  )
}
