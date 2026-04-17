'use client'

// 後台稽核日誌頁（L7+ 2026-04-17）
// 對應 API：/api/admin/audit-log

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

type AuditLogEntry = {
  id: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: '登入', color: 'text-gray-300 bg-gray-500/10' },
  refund: { label: '退款', color: 'text-red-400 bg-red-500/10' },
  grant_points: { label: '發放積分', color: 'text-green-400 bg-green-500/10' },
  deduct_points: { label: '扣除積分', color: 'text-orange-400 bg-orange-500/10' },
  delete_coupon: { label: '刪除優惠碼', color: 'text-red-400 bg-red-500/10' },
  update_coupon: { label: '修改優惠碼', color: 'text-blue-400 bg-blue-500/10' },
  create_coupon: { label: '建立優惠碼', color: 'text-green-400 bg-green-500/10' },
  delete_promotion: { label: '刪除促銷', color: 'text-red-400 bg-red-500/10' },
  update_promotion: { label: '修改促銷', color: 'text-blue-400 bg-blue-500/10' },
  create_promotion: { label: '建立促銷', color: 'text-green-400 bg-green-500/10' },
  retry_report: { label: '重新生成報告', color: 'text-amber-400 bg-amber-500/10' },
  resend_email: { label: '重發 Email', color: 'text-blue-400 bg-blue-500/10' },
  block_user: { label: '封鎖用戶', color: 'text-red-400 bg-red-500/10' },
  unblock_user: { label: '解封用戶', color: 'text-green-400 bg-green-500/10' },
  delete_user: { label: '刪除用戶', color: 'text-red-400 bg-red-500/10' },
  update_order_status: { label: '修改訂單狀態', color: 'text-blue-400 bg-blue-500/10' },
}

export default function AuditLogPage() {
  const { adminKey } = useAdminAuth()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [summary, setSummary] = useState<{ total: number; by_action: Record<string, number> }>({ total: 0, by_action: {} })
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [filterAction, setFilterAction] = useState<string>('')
  const [filterTargetType, setFilterTargetType] = useState<string>('')
  const [days, setDays] = useState<number>(30)

  const fetchLogs = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAction) params.append('action', filterAction)
      if (filterTargetType) params.append('target_type', filterTargetType)
      params.append('days', String(days))
      params.append('limit', '500')
      const res = await adminFetch(`/api/admin/audit-log?${params}`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setSummary(data.summary || { total: 0, by_action: {} })
        setNote(data.note || null)
      }
    } finally { setLoading(false) }
  }, [adminKey, filterAction, filterTargetType, days])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const exportCSV = () => {
    const headers = ['時間', '動作', '目標類型', '目標 ID', 'IP', 'User-Agent', 'Metadata']
    const rows = logs.map(l => [
      l.created_at,
      l.action,
      l.target_type || '',
      l.target_id || '',
      l.ip || '',
      l.user_agent || '',
      JSON.stringify(l.metadata || {}),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">稽核日誌</h1>
          <p className="text-xs text-gray-500">後台敏感動作的留痕紀錄｜共 {summary.total} 筆</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={logs.length === 0}
            className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10 disabled:opacity-30">
            匯出 CSV
          </button>
          <button onClick={fetchLogs} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {note && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          ⓘ {note}
        </div>
      )}

      {/* 篩選器 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">全部動作</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({k})</option>
          ))}
        </select>
        <select value={filterTargetType} onChange={e => setFilterTargetType(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          <option value="">全部類型</option>
          <option value="user">用戶</option>
          <option value="order">訂單</option>
          <option value="report">報告</option>
          <option value="coupon">優惠碼</option>
          <option value="promotion">促銷</option>
          <option value="points">積分</option>
          <option value="refund">退款</option>
          <option value="system">系統</option>
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
          <option value={180}>最近 180 天</option>
        </select>
      </div>

      {/* 動作分布 */}
      {Object.keys(summary.by_action).length > 0 && (
        <div className="mb-4 bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <div className="text-xs text-gray-500 mb-2">動作分布</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.by_action)
              .sort((a, b) => b[1] - a[1])
              .map(([action, count]) => (
                <button key={action} onClick={() => setFilterAction(filterAction === action ? '' : action)}
                  className={`px-2 py-1 rounded text-xs transition ${
                    filterAction === action ? 'ring-1 ring-amber-400 ' : ''
                  }${ACTION_LABELS[action]?.color || 'text-gray-400 bg-gray-500/10'}`}>
                  {ACTION_LABELS[action]?.label || action} × {count}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 日誌表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">時間</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">動作</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">目標</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">IP</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">User-Agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <Fragment key={log.id}>
                  <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(log.created_at).toLocaleString('zh-TW', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${ACTION_LABELS[log.action]?.color || 'text-gray-400 bg-gray-500/10'}`}>
                        {ACTION_LABELS[log.action]?.label || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {log.target_type && <span className="text-amber-400">{log.target_type}</span>}
                      {log.target_id && <span className="text-gray-500 ml-1">#{log.target_id.slice(0, 12)}{log.target_id.length > 12 ? '…' : ''}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ip || '-'}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-500 truncate max-w-xs">
                      {log.user_agent ? log.user_agent.slice(0, 50) + (log.user_agent.length > 50 ? '…' : '') : '-'}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="text-[10px] text-gray-500 mb-1">完整 Metadata：</div>
                        <pre className="text-[10px] text-gray-300 bg-black/30 p-3 rounded overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                        {log.target_id && (
                          <div className="text-[10px] text-gray-500 mt-2">
                            完整 Target ID：<span className="text-white font-mono">{log.target_id}</span>
                          </div>
                        )}
                        {log.user_agent && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            User-Agent：<span className="text-gray-300">{log.user_agent}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">暫無紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
