'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件出門訣', E2:'月盤出門訣',
}

type FeedbackItem = {
  id: string
  rating: number
  most_valuable: string | null
  suggestion: string | null
  would_recommend: boolean | null
  created_at: string
  updated_at: string | null
  report_id: string
  paid_reports: {
    client_name: string
    plan_code: string
    customer_email: string
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24"
          fill={i <= rating ? '#f59e0b' : 'none'}
          stroke={i <= rating ? '#f59e0b' : '#4b5563'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

export default function FeedbackPage() {
  const { adminKey } = useAdminAuth()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)

  const fetchFeedback = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/jamie/feedback?key=${adminKey}`)
      if (res.ok) {
        const data = await res.json()
        setFeedback(data.feedback || [])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchFeedback() }, [fetchFeedback])

  // 篩選
  const filtered = ratingFilter === null
    ? feedback
    : feedback.filter(f => f.rating === ratingFilter)

  // 統計
  const totalCount = feedback.length
  const avgRating = totalCount > 0
    ? (feedback.reduce((sum, f) => sum + f.rating, 0) / totalCount).toFixed(1)
    : '—'
  const recommendCount = feedback.filter(f => f.would_recommend === true).length
  const recommendAnswered = feedback.filter(f => f.would_recommend !== null).length
  const npsPct = recommendAnswered > 0
    ? Math.round((recommendCount / recommendAnswered) * 100)
    : 0

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">客戶反饋</h1>
          <p className="text-xs text-gray-500">共 {filtered.length} 筆反饋</p>
        </div>
        <button onClick={fetchFeedback} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
          {loading ? '...' : '刷新'}
        </button>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">平均評分</div>
          <div className="text-2xl font-bold text-amber-400">{avgRating}</div>
          <div className="text-[10px] text-gray-500 mt-1">滿分 5 星</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">推薦比例（淨推薦值）</div>
          <div className="text-2xl font-bold text-green-400">{recommendAnswered > 0 ? `${npsPct}%` : '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">{recommendCount} / {recommendAnswered} 人推薦</div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">反饋總數</div>
          <div className="text-2xl font-bold text-blue-400">{totalCount}</div>
          <div className="text-[10px] text-gray-500 mt-1">來自所有方案</div>
        </div>
      </div>

      {/* 篩選 */}
      <div className="flex gap-1 mb-4">
        {[
          { label: '全部', value: null },
          { label: '5 星', value: 5 },
          { label: '4 星', value: 4 },
          { label: '3 星', value: 3 },
          { label: '2 星', value: 2 },
          { label: '1 星', value: 1 },
        ].map(opt => (
          <button key={opt.label} onClick={() => setRatingFilter(opt.value)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${ratingFilter === opt.value ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 反饋列表 */}
      <div className="space-y-3">
        {filtered.map(item => (
          <div key={item.id} className="bg-[#1a1a1a] rounded-xl p-5 border border-white/5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <StarRating rating={item.rating} />
                <span className="text-xs text-amber-400">{PLAN_NAMES[item.paid_reports.plan_code] || item.paid_reports.plan_code}</span>
                {item.would_recommend !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.would_recommend ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                    {item.would_recommend ? '願意推薦' : '不推薦'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-500 shrink-0">
                {new Date(item.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>

            <div className="text-xs text-gray-400 mb-2">
              {item.paid_reports.client_name}
              <span className="text-gray-600 mx-1">|</span>
              {item.paid_reports.customer_email}
            </div>

            {item.most_valuable && (
              <div className="mb-2">
                <span className="text-[10px] text-gray-500">最有價值的部分：</span>
                <p className="text-sm text-gray-300 mt-0.5">{item.most_valuable}</p>
              </div>
            )}

            {item.suggestion && (
              <div>
                <span className="text-[10px] text-gray-500">改善建議：</span>
                <p className="text-sm text-gray-300 mt-0.5">{item.suggestion}</p>
              </div>
            )}

            {!item.most_valuable && !item.suggestion && (
              <p className="text-xs text-gray-600">（僅留下評分，無文字回饋）</p>
            )}
          </div>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="bg-[#1a1a1a] rounded-xl p-8 border border-white/5 text-center text-gray-500 text-sm">
            暫無反饋資料
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
