'use client'

// 退款管理頁（L7+ 2026-04-17）
// 對應 API：/api/admin/refunds（GET）、/api/admin/refund（POST）

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'
import { maskEmail } from '@/lib/privacy-mask'

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖',
  R: '合否？', E1: '事件出門訣', E2: '月度出門訣',
}

type RefundRow = {
  id: string
  client_name: string
  customer_email: string
  plan_code: string
  amount_usd: number
  status: string
  created_at: string
  refunded_at: string | null
  refunded_amount_usd: number | null
  refund_reason: string | null
  stripe_refund_id: string | null
  stripe_session_id: string | null
  error_message: string | null
}

type Summary = {
  total_rows: number
  refunded_count: number
  total_refunded_usd: number
  reason_breakdown: Record<string, { count: number; total_usd: number }>
}

const REASON_LABELS: Record<string, string> = {
  duplicate: '重複付款',
  fraudulent: '詐騙交易',
  requested_by_customer: '客戶要求',
  admin_manual: '管理員手動',
  unspecified: '未指定',
}

export default function RefundsPage() {
  const { adminKey } = useAdminAuth()
  const [rows, setRows] = useState<RefundRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'all' | 'refunded' | 'candidate'>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 退款表單
  const [refundTarget, setRefundTarget] = useState<RefundRow | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState<'requested_by_customer' | 'duplicate' | 'fraudulent'>('requested_by_customer')
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundError, setRefundError] = useState('')

  const fetchRows = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/refunds?status=${status}`, { adminKey })
      if (res.ok) {
        const d = await res.json()
        setRows(d.rows || [])
        setSummary(d.summary || null)
      }
    } finally { setLoading(false) }
  }, [adminKey, status])

  useEffect(() => { fetchRows() }, [fetchRows])

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (r.client_name || '').toLowerCase().includes(q)
      || (r.customer_email || '').toLowerCase().includes(q)
      || (r.stripe_session_id || '').toLowerCase().includes(q)
      || (r.stripe_refund_id || '').toLowerCase().includes(q)
      || (r.id || '').toLowerCase().includes(q)
  })

  const handleRefund = async () => {
    if (!refundTarget) return
    setRefundLoading(true)
    setRefundError('')
    try {
      const body: Record<string, unknown> = {
        reportId: refundTarget.id,
        reason: refundReason,
      }
      if (refundAmount) body.amount = Number(refundAmount)
      const res = await adminFetch('/api/admin/refund', {
        adminKey,
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`退款成功\n金額：$${data.refunded_amount_usd}\n推薦積分回收：${data.points_clawed_back}`)
        setRefundTarget(null)
        setRefundAmount('')
        fetchRows()
      } else {
        setRefundError(data.error || data.detail || '退款失敗')
      }
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : '網路錯誤')
    } finally {
      setRefundLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">退款管理</h1>
          <p className="text-xs text-gray-500">
            {summary && (
              <>
                已退款 <span className="text-red-400">{summary.refunded_count}</span> 筆
                {' / '}
                退款總額 <span className="text-red-400">${summary.total_refunded_usd}</span>
              </>
            )}
          </p>
        </div>
        <button onClick={fetchRows} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 退款理由統計 */}
      {summary && Object.keys(summary.reason_breakdown).length > 0 && (
        <div className="mb-4 bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
          <div className="text-xs text-gray-500 mb-2">退款理由分佈</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(summary.reason_breakdown)
              .sort((a, b) => b[1].total_usd - a[1].total_usd)
              .map(([reason, d]) => (
                <span key={reason} className="px-2 py-1 rounded bg-red-500/10 text-red-400">
                  {REASON_LABELS[reason] || reason}：{d.count} 筆 / ${d.total_usd}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* 篩選 */}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="搜尋 客戶名/Email/Session ID..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-500 focus:outline-none" />
        <div className="flex gap-1">
          {(['all', 'candidate', 'refunded'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition ${status === s ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {s === 'all' ? '全部' : s === 'candidate' ? '可退款' : '已退款'}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">客戶</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">方案</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">金額</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">狀態</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">下單日期</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isRefunded = !!r.refunded_at
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                      <td className="px-4 py-3">
                        <div className="text-white">{r.client_name || '-'}</div>
                        <div className="text-[10px] text-gray-500" title="個資保護:點退款詳情查完整 email">{maskEmail(r.customer_email)}</div>
                      </td>
                      <td className="px-4 py-3 text-amber-400">{PLAN_NAMES[r.plan_code] || r.plan_code}</td>
                      <td className="px-4 py-3 text-white">
                        ${r.amount_usd}
                        {isRefunded && r.refunded_amount_usd !== null && (
                          <span className="text-[10px] text-red-400 ml-1">(已退 ${r.refunded_amount_usd})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isRefunded ? (
                          <span className="text-xs px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">已退款</span>
                        ) : r.status === 'completed' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full text-green-400 bg-green-500/10">已完成</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full text-gray-400 bg-gray-500/10">{r.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(r.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td className="px-4 py-3">
                        {!isRefunded ? (
                          <button onClick={e => { e.stopPropagation(); setRefundTarget(r); setRefundAmount(''); setRefundError('') }}
                            className="px-2 py-1 bg-red-500/20 rounded text-xs text-red-400 hover:bg-red-500/30">
                            退款
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-500">{r.refund_reason ? (REASON_LABELS[r.refund_reason] || r.refund_reason) : ''}</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr className="bg-white/[0.02]">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                            <div>報告 ID：<span className="text-white font-mono">{r.id}</span></div>
                            <div>Stripe Session：<span className="text-white font-mono">{r.stripe_session_id || '-'}</span></div>
                            {r.stripe_refund_id && <div>Stripe Refund ID：<span className="text-white font-mono">{r.stripe_refund_id}</span></div>}
                            {r.refunded_at && <div>退款時間：<span className="text-white">{new Date(r.refunded_at).toLocaleString('zh-TW')}</span></div>}
                            {r.error_message && <div className="col-span-2">錯誤訊息：<span className="text-red-400">{r.error_message}</span></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">暫無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 退款彈窗 */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => !refundLoading && setRefundTarget(null)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-3">確認退款</h3>
            <div className="text-sm text-gray-300 mb-4">
              客戶:<span className="text-white">{refundTarget.client_name}</span> (<span title="個資保護:確認後可在 audit log 查完整 email">{maskEmail(refundTarget.customer_email)}</span>)
              <br />
              方案：<span className="text-amber-400">{PLAN_NAMES[refundTarget.plan_code] || refundTarget.plan_code}</span>
              <br />
              原金額：<span className="text-white">${refundTarget.amount_usd}</span>
            </div>

            <label className="block text-xs text-gray-400 mb-1">退款金額（USD，留空=全額退）</label>
            <input type="number" step="0.01" placeholder={String(refundTarget.amount_usd)}
              value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3" />

            <label className="block text-xs text-gray-400 mb-1">退款理由</label>
            <select value={refundReason} onChange={e => setRefundReason(e.target.value as typeof refundReason)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-4">
              <option value="requested_by_customer">客戶要求</option>
              <option value="duplicate">重複付款</option>
              <option value="fraudulent">詐騙交易</option>
            </select>

            {refundError && (
              <div className="mb-3 text-red-400 text-xs">{refundError}</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setRefundTarget(null)} disabled={refundLoading}
                className="flex-1 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 text-sm">
                取消
              </button>
              <button onClick={handleRefund} disabled={refundLoading}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 text-sm disabled:opacity-50">
                {refundLoading ? '處理中...' : '確認退款'}
              </button>
            </div>

            <div className="mt-3 text-[10px] text-gray-500">
              ⓘ 此操作會呼叫 Stripe Refund API，並自動扣回已發放的推薦積分，並留痕到稽核日誌。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
