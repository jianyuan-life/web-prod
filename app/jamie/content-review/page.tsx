'use client'

// ============================================================
// 內容安全審查後台（/jamie/content-review）
// 列出 AI 報告中被 flagged 的項目，admin 可強制放行或重新生成
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { maskEmail } from '@/lib/privacy-mask'
import { PLAN_NAMES } from '@/lib/plan-names'


const CATEGORY_LABEL: Record<string, string> = {
  politics: '政治',
  medical: '醫療承諾',
  investment: '投資誘導',
  extreme_fortune: '極端命理',
  discrimination: '歧視/仇恨',
  sexual: '性內容',
  violence: '暴力',
  privacy: '隱私洩漏',
}

const CATEGORY_COLOR: Record<string, string> = {
  politics: 'bg-red-500/10 text-red-400 border-red-500/30',
  medical: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  investment: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  extreme_fortune: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  discrimination: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  sexual: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  violence: 'bg-red-600/10 text-red-500 border-red-600/30',
  privacy: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
}

type Hit = {
  category: string
  severity: 'block' | 'warn'
  reason: string
  pattern: string
  matched_text: string
  snippet: string
}

type ModerationItem = {
  id: string
  report_id: string | null
  plan_code: string
  action: string
  blocked: boolean
  reason: string
  hits: Hit[]
  ai_scores: Record<string, number>
  content_preview: string
  retry_attempt: number
  status: string
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  paid_reports: {
    client_name: string
    customer_email: string
    plan_code: string
    status: string
  } | null
}

type StatusFilter = 'flagged' | 'force_passed' | 'regenerated' | 'dismissed' | 'all'

export default function ContentReviewPage() {
  const { adminKey } = useAdminAuth()
  const [items, setItems] = useState<ModerationItem[]>([])
  const [totalFlagged, setTotalFlagged] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('flagged')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/content-review?status=${statusFilter}`, {
        headers: { 'x-admin-key': adminKey },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotalFlagged(data.stats?.total_flagged || 0)
      }
    } finally { setLoading(false) }
  }, [adminKey, statusFilter])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleAction = async (
    logId: string,
    action: 'force_pass' | 'regenerate' | 'dismiss',
  ) => {
    const prompts: Record<typeof action, string> = {
      force_pass: '確認管理員判斷 OK，強制放行這份報告？',
      regenerate: '將報告狀態拉回 pending 並重新生成，確認嗎？',
      dismiss: '僅標記為已處理，不影響報告交付，確認嗎？',
    }
    if (!window.confirm(prompts[action])) return

    const note = window.prompt('處置備註（可選，會記錄到稽核日誌）') || undefined
    setActionLoading(logId)
    try {
      const res = await fetch('/api/admin/content-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ logId, action, note }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '請求失敗' }))
        window.alert(`操作失敗：${err.error || res.status}`)
      } else {
        await fetchItems()
      }
    } catch (e) {
      window.alert(`網路錯誤：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">內容安全審查</h1>
          <p className="text-xs text-gray-500">
            共 {items.length} 筆｜待處理 flagged：
            <span className="text-amber-400 font-bold"> {totalFlagged}</span>
          </p>
        </div>
        <button onClick={fetchItems}
          className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 狀態篩選 */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {([
          { label: '待審 (flagged)', value: 'flagged' },
          { label: '人工放行', value: 'force_passed' },
          { label: '已重生', value: 'regenerated' },
          { label: '已忽略', value: 'dismissed' },
          { label: '全部', value: 'all' },
        ] as { label: string; value: StatusFilter }[]).map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              statusFilter === opt.value ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
            {/* 標題區 */}
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-amber-400 font-medium">
                  {PLAN_NAMES[item.plan_code] || item.plan_code}
                </span>
                <span className="text-[10px] text-gray-500">|</span>
                <span className="text-xs text-gray-300">
                  {item.paid_reports?.client_name || '(已刪除)'}
                </span>
                <span className="text-[10px] text-gray-500">|</span>
                <span className="text-xs text-gray-500" title="個資保護:點 flag 詳情查完整 email">
                  {item.paid_reports?.customer_email ? maskEmail(item.paid_reports.customer_email) : '—'}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 shrink-0">
                {new Date(item.created_at).toLocaleString('zh-TW', {
                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                })}
              </span>
            </div>

            {/* 狀態 + 觸發原因 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                item.status === 'flagged' ? 'bg-red-500/10 text-red-400'
                : item.status === 'force_passed' ? 'bg-green-500/10 text-green-400'
                : item.status === 'regenerated' ? 'bg-blue-500/10 text-blue-400'
                : 'bg-gray-500/10 text-gray-400'
              }`}>
                {item.status === 'flagged' ? '待審'
                  : item.status === 'force_passed' ? '人工放行'
                  : item.status === 'regenerated' ? '已重生'
                  : item.status === 'dismissed' ? '已忽略'
                  : item.status}
              </span>
              {item.blocked && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-400">
                  已阻擋
                </span>
              )}
              {item.retry_attempt > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-600/20 text-yellow-400">
                  重試 {item.retry_attempt} 次
                </span>
              )}
              <span className="text-xs text-gray-400">{item.reason}</span>
            </div>

            {/* 分類命中 */}
            {item.hits && item.hits.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-gray-500 mb-1.5">黑名單命中（前 10 項）</div>
                <div className="space-y-1.5">
                  {item.hits.slice(0, 10).map((hit, i) => (
                    <div key={i} className={`border rounded-lg p-2.5 ${CATEGORY_COLOR[hit.category] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold">
                          {CATEGORY_LABEL[hit.category] || hit.category}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                          {hit.severity === 'block' ? 'BLOCK' : 'WARN'}
                        </span>
                        <span className="text-[10px] opacity-70">{hit.reason}</span>
                      </div>
                      <div className="text-[11px] font-mono text-white/80 break-all">
                        命中：&ldquo;{hit.matched_text}&rdquo;
                      </div>
                      {hit.snippet && (
                        <div className="text-[10px] text-white/60 mt-1 italic">
                          …{hit.snippet}…
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {item.hits.length > 10 && (
                  <div className="text-[10px] text-gray-500 mt-1">
                    還有 {item.hits.length - 10} 項未顯示
                  </div>
                )}
              </div>
            )}

            {/* AI 分數 */}
            {item.ai_scores && Object.keys(item.ai_scores).length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-gray-500 mb-1.5">AI 審查分數</div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(item.ai_scores)
                    .filter(([, s]) => typeof s === 'number' && s > 0.3)
                    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                    .slice(0, 8)
                    .map(([cat, score]) => (
                      <span key={cat} className={`text-[10px] px-2 py-0.5 rounded ${
                        score >= 0.8 ? 'bg-red-500/20 text-red-400'
                        : score >= 0.6 ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {cat}: {(score as number).toFixed(2)}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* 內容預覽 */}
            {item.content_preview && (
              <details className="mb-3">
                <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                  展開內容預覽（前 500 字）
                </summary>
                <div className="text-xs text-gray-300 mt-2 bg-black/30 rounded p-3 whitespace-pre-wrap leading-relaxed">
                  {item.content_preview}
                </div>
              </details>
            )}

            {/* admin 備註 */}
            {item.admin_note && (
              <div className="mb-3 text-[11px] text-gray-400 bg-white/5 rounded p-2">
                <span className="text-gray-500">備註：</span>{item.admin_note}
                {item.reviewed_at && (
                  <span className="text-[10px] text-gray-500 ml-2">
                    ({new Date(item.reviewed_at).toLocaleString('zh-TW')})
                  </span>
                )}
              </div>
            )}

            {/* 操作按鈕：只有 flagged 狀態才顯示 */}
            {item.status === 'flagged' && (
              <div className="flex gap-2 flex-wrap pt-3 border-t border-white/5">
                <button
                  onClick={() => handleAction(item.id, 'force_pass')}
                  disabled={actionLoading === item.id}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  強制放行
                </button>
                <button
                  onClick={() => handleAction(item.id, 'regenerate')}
                  disabled={actionLoading === item.id}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  重新生成
                </button>
                <button
                  onClick={() => handleAction(item.id, 'dismiss')}
                  disabled={actionLoading === item.id}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-medium rounded-lg disabled:opacity-50">
                  忽略
                </button>
                {item.report_id && (
                  <a href={`/report/${item.report_id}`} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-medium rounded-lg ml-auto">
                    查看報告 →
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-white/5 text-center text-gray-500 text-sm">
            目前沒有需要審查的項目
          </div>
        )}

        {loading && (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-white/5 text-center text-gray-500 text-sm">
            載入中...
          </div>
        )}
      </div>
    </div>
  )
}
