'use client'

// v5.10.282 P1 補(Codex P0#5 orphan endpoint):/api/admin/email-log 有 endpoint 但無對應頁面
//
// 用途:ops 查 Email 寄送紀錄、debug Resend 失敗 / 客戶說沒收到信
// 資料:email_send_log table(Resend webhook 寫入)
// API:GET /api/admin/email-log?days=30&type=&status=&limit=500

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import { maskEmail } from '@/lib/privacy-mask'

type EmailLog = {
  id: string
  resend_id: string | null
  to_email: string
  from_email: string
  email_type: string
  subject: string | null
  report_id: string | null
  user_id: string | null
  status: string
  error_message: string | null
  delivered_at: string | null
  bounced_at: string | null
  complained_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type Summary = {
  total: number
  by_type: Record<string, number>
  by_status: Record<string, number>
}

const STATUS_COLORS: Record<string, string> = {
  delivered: 'text-green-400 bg-green-400/10',
  sent: 'text-blue-400 bg-blue-400/10',
  bounced: 'text-red-400 bg-red-400/10',
  complained: 'text-orange-400 bg-orange-400/10',
  failed: 'text-red-400 bg-red-400/10',
  queued: 'text-yellow-400 bg-yellow-400/10',
}

const TYPE_LABELS: Record<string, string> = {
  report_ready: '報告完成通知',
  feedback_reminder: '評價邀請',
  followup_email: '跟進信',
  refund_notification: '退款通知',
  welcome: '歡迎信',
  password_reset: '密碼重設',
  other: '其他',
}

export default function EmailLogPage() {
  const { adminKey } = useAdminAuth()
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(30)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    setNote(null)
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (typeFilter) params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await adminFetch(`/api/admin/email-log?${params.toString()}`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setSummary(data.summary || null)
        if (data.note) setNote(data.note)
      } else {
        const err = await res.json()
        setNote(err.error || '讀取失敗')
      }
    } finally {
      setLoading(false)
    }
  }, [adminKey, days, typeFilter, statusFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (l.to_email || '').toLowerCase().includes(q)
      || (l.subject || '').toLowerCase().includes(q)
      || (l.report_id || '').toLowerCase().includes(q)
      || (l.error_message || '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Email 送達紀錄</h1>
          <p className="text-xs text-gray-500">
            共 {filtered.length} 筆({summary?.total ?? 0} 總)、最近 {days} 天
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* Note(若 table 未建)*/}
      {note && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4 text-yellow-300 text-xs">
          ⚠ {note}
        </div>
      )}

      {/* Summary stats */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">總數</div>
            <div className="text-2xl font-bold text-white">{summary.total}</div>
          </div>
          {summary.by_status && Object.entries(summary.by_status).slice(0, 3).map(([s, n]) => (
            <div key={s} className="bg-[#1a1a1a] border border-white/5 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">{s}</div>
              <div className={`text-2xl font-bold ${STATUS_COLORS[s]?.split(' ')[0] || 'text-gray-300'}`}>{n}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="搜尋 email/subject/report_id/error..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-500 focus:outline-none" />
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none">
          <option value={7}>7 天</option>
          <option value={30}>30 天</option>
          <option value={90}>90 天</option>
          <option value={180}>180 天</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none">
          <option value="">全類型</option>
          {summary?.by_type && Object.keys(summary.by_type).map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t] || t}({summary.by_type[t]})</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none">
          <option value="">全狀態</option>
          {summary?.by_status && Object.keys(summary.by_status).map(s => (
            <option key={s} value={s}>{s}({summary.by_status[s]})</option>
          ))}
        </select>
      </div>

      {/* Logs list */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">收件人</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">類型</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">主旨</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">狀態</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">時間</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <Fragment key={log.id}>
                  <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                    <td className="px-4 py-3 text-gray-300">
                      <span title={log.to_email}>{maskEmail(log.to_email)}</span>
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-xs">
                      {TYPE_LABELS[log.email_type] || log.email_type}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-md truncate" title={log.subject || ''}>
                      {log.subject || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status] || 'text-gray-400 bg-gray-400/10'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(log.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">完整收件人:</span>
                            <span className="text-white ml-1">{log.to_email}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">寄件人:</span>
                            <span className="text-white ml-1">{log.from_email}</span>
                          </div>
                          {log.resend_id && (
                            <div>
                              <span className="text-gray-500">Resend ID:</span>
                              <span className="text-white ml-1 font-mono">{log.resend_id}</span>
                            </div>
                          )}
                          {log.report_id && (
                            <div>
                              <span className="text-gray-500">Report ID:</span>
                              <span className="text-white ml-1 font-mono">{log.report_id}</span>
                            </div>
                          )}
                          {log.delivered_at && (
                            <div>
                              <span className="text-gray-500">送達時間:</span>
                              <span className="text-green-400 ml-1">{new Date(log.delivered_at).toLocaleString('zh-TW')}</span>
                            </div>
                          )}
                          {log.bounced_at && (
                            <div>
                              <span className="text-gray-500">退信時間:</span>
                              <span className="text-red-400 ml-1">{new Date(log.bounced_at).toLocaleString('zh-TW')}</span>
                            </div>
                          )}
                          {log.error_message && (
                            <div className="col-span-2">
                              <span className="text-gray-500">錯誤訊息:</span>
                              <span className="text-red-400 ml-1">{log.error_message}</span>
                            </div>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="col-span-2">
                              <span className="text-gray-500">Metadata:</span>
                              <pre className="text-gray-400 mt-1 bg-black/30 rounded p-2 overflow-x-auto text-[10px]">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {note ? '請先建立 email_send_log 表' : '暫無 email 紀錄'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
