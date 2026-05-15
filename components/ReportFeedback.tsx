'use client'

import { useState, useEffect, useCallback } from 'react'
import { reportClientFailure } from '@/lib/security/client-audit'
import { internalGet, internalPost } from '@/lib/api'  // T10b v5.10.373(timeout + ApiError + RateLimitError)
// Bug #29：改用全站 singleton，避免 GoTrueClient 多實例衝突
//   （「Multiple GoTrueClient instances detected」+「Lock was released because another request stole it」）
import { supabase } from '@/lib/supabase'

// 各方案對應的「最有價值的部分」選項
const SECTION_OPTIONS: Record<string, string[]> = {
  C: ['命格名片', '事業', '財運', '感情', '健康', '大運', '流年', '刻意練習', '寫給你的話'],
  D: ['命格名片', '事業', '財運', '感情', '健康', '寫給你的話'],
  G15: ['命格名片', '家族互動', '事業', '感情', '寫給你的話'],
  R: ['合盤分析', '感情', '事業', '寫給你的話'],
  E1: ['出門訣', '寫給你的話'],
  E2: ['出門訣', '寫給你的話'],
}

interface ReportFeedbackProps {
  reportId: string
  planCode: string
  customerEmail: string
}

export default function ReportFeedback({ reportId, planCode, customerEmail }: ReportFeedbackProps) {
  const [user, setUser] = useState<{ id: string; email: string; accessToken: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // 表單狀態
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState('')
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null)

  const sections = SECTION_OPTIONS[planCode] || SECTION_OPTIONS.C

  // 載入已有的反饋
  const loadExistingFeedback = useCallback(async (accessToken: string) => {
    try {
      // T10b v5.10.373 — internalGet 統一處理(原 raw fetch 無 timeout)
      const data = await internalGet(`/api/feedback?report_id=${reportId}`, {
        authToken: accessToken,
      }) as { feedback?: { rating: number; most_valuable?: string[]; suggestion?: string; would_recommend?: boolean | null } }
      const feedback = data?.feedback
      if (feedback) {
        setRating(feedback.rating)
        setSelectedSections(feedback.most_valuable || [])
        setSuggestion(feedback.suggestion || '')
        setWouldRecommend(feedback.would_recommend ?? null)
        setSubmitted(true)
      }
    } catch (e) {
      reportClientFailure('feedback_load_existing', e, { extra: { reportId } })
    }
  }, [reportId])

  // 檢查登入狀態 + 驗證是否為報告擁有者
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.email || !session.access_token) {
          setLoading(false)
          return
        }
        // 比對 email 是否為報告擁有者
        if (session.user.email.toLowerCase() !== customerEmail.toLowerCase()) {
          setLoading(false)
          return
        }
        setUser({
          id: session.user.id,
          email: session.user.email,
          accessToken: session.access_token,
        })
        await loadExistingFeedback(session.access_token)
      } catch (e) {
        reportClientFailure('feedback_check_auth', e)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [customerEmail, loadExistingFeedback])

  // 不顯示：未登入、非擁有者、載入中
  if (loading || !user) return null

  const toggleSection = (section: string) => {
    setSelectedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  const handleSubmit = async () => {
    if (rating === 0) return
    setSubmitting(true)
    try {
      // T10b v5.10.373 — internalPost 統一處理 ApiError + RateLimitError
      await internalPost('/api/feedback', {
        report_id: reportId,
        rating,
        most_valuable: selectedSections,
        suggestion: suggestion.trim() || null,
        would_recommend: wouldRecommend,
      }, { authToken: user.accessToken })
      setSubmitted(true)
      setIsEditing(false)
    } catch (e) {
      // T11 v5.10.360:用戶填了 feedback 失敗、加 audit 上報(無 error UI state、保 silent UX)
      reportClientFailure('feedback_submit', e, { extra: { reportId, rating }, severity: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  // 已提交 + 非編輯模式：顯示感謝 + 已填內容
  if (submitted && !isEditing) {
    return (
      <div className="no-print section-card" style={{
        background: 'rgba(106, 176, 76, 0.06)',
        border: '1px solid rgba(106, 176, 76, 0.2)',
        borderRadius: '16px',
        padding: '32px',
      }}>
        <div className="text-center">
          <div className="text-3xl mb-3">&#10003;</div>
          <h3 className="text-lg font-semibold text-cream mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
            感謝您的反饋！
          </h3>
          <p className="text-text-muted text-sm mb-4">
            您的意見將幫助我們持續改善服務品質
          </p>
          <div className="flex justify-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map(star => (
              <span key={star} className="text-xl" style={{ color: star <= rating ? '#c9a84c' : 'rgba(255,255,255,0.1)' }}>
                &#9733;
              </span>
            ))}
          </div>
          {selectedSections.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {selectedSections.map(s => (
                <span key={s} className="text-xs px-3 py-1 rounded-full" style={{
                  background: 'rgba(197, 150, 58, 0.15)',
                  color: 'var(--color-gold)',
                  border: '1px solid rgba(197, 150, 58, 0.25)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-text-muted/60 hover:text-gold transition-colors mt-2"
          >
            修改反饋
          </button>
        </div>
      </div>
    )
  }

  // 表單
  return (
    <div className="no-print section-card" style={{
      background: 'linear-gradient(135deg, rgba(197,150,58,0.06), rgba(15,22,40,0.4))',
      border: '1px solid rgba(197,150,58,0.15)',
      borderRadius: '16px',
      padding: '32px',
    }}>
      {/* 標題 */}
      <div className="text-center mb-8">
        <div className="text-xs tracking-widest text-gold/50 mb-2">FEEDBACK</div>
        <h3 className="text-lg font-semibold text-gold mb-1" style={{ fontFamily: 'var(--font-sans)' }}>
          您的反饋對我們很重要
        </h3>
        <p className="text-text-muted text-sm">
          幫助我們為您和更多人提供更好的服務
        </p>
      </div>

      {/* 星星評分 */}
      <div className="mb-8">
        <label className="block text-sm text-cream/80 mb-3 text-center">整體滿意度</label>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
              className="text-3xl transition-all hover:scale-110 focus:outline-none"
              style={{
                color: star <= (hoverRating || rating) ? '#c9a84c' : 'rgba(255,255,255,0.12)',
                filter: star <= (hoverRating || rating) ? 'drop-shadow(0 0 6px rgba(201,168,76,0.4))' : 'none',
              }}
            >
              &#9733;
            </button>
          ))}
        </div>
        {rating > 0 && (
          <p className="text-center text-xs text-gold/60 mt-2">
            {rating === 1 ? '需要改善' : rating === 2 ? '不太滿意' : rating === 3 ? '還可以' : rating === 4 ? '很滿意' : '非常滿意'}
          </p>
        )}
      </div>

      {/* 最有價值的部分 */}
      <div className="mb-8">
        <label className="block text-sm text-cream/80 mb-3 text-center">最有價值的部分（可多選）</label>
        <div className="flex flex-wrap justify-center gap-2">
          {sections.map(section => {
            const isSelected = selectedSections.includes(section)
            return (
              <button
                key={section}
                type="button"
                onClick={() => toggleSection(section)}
                className="text-sm px-4 py-2 rounded-full transition-all"
                style={{
                  background: isSelected ? 'rgba(197, 150, 58, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${isSelected ? 'rgba(197, 150, 58, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: isSelected ? 'var(--color-gold)' : 'var(--color-text-muted)',
                }}
              >
                {section}
              </button>
            )
          })}
        </div>
      </div>

      {/* 改善建議 */}
      <div className="mb-8">
        <label className="block text-sm text-cream/80 mb-3 text-center">改善建議（選填）</label>
        <textarea
          value={suggestion}
          onChange={e => setSuggestion(e.target.value.slice(0, 500))}
          placeholder="告訴我們哪裡可以做得更好..."
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gold/40"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--color-cream)',
          }}
        />
        <p className="text-right text-xs text-text-muted/40 mt-1">{suggestion.length}/500</p>
      </div>

      {/* 是否推薦 */}
      <div className="mb-8">
        <label className="block text-sm text-cream/80 mb-3 text-center">是否願意推薦給朋友？</label>
        <div className="flex justify-center gap-3">
          {[
            { value: true, label: '願意推薦' },
            { value: false, label: '暫時不會' },
          ].map(option => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setWouldRecommend(option.value)}
              className="text-sm px-6 py-2.5 rounded-full transition-all"
              style={{
                background: wouldRecommend === option.value
                  ? (option.value ? 'rgba(106, 176, 76, 0.15)' : 'rgba(224, 150, 58, 0.15)')
                  : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${wouldRecommend === option.value
                  ? (option.value ? 'rgba(106, 176, 76, 0.3)' : 'rgba(224, 150, 58, 0.3)')
                  : 'rgba(255, 255, 255, 0.08)'}`,
                color: wouldRecommend === option.value
                  ? (option.value ? '#6ab04c' : '#e0963a')
                  : 'var(--color-text-muted)',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* 提交按鈕 */}
      <div className="text-center">
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          style={{
            background: rating > 0 ? 'linear-gradient(135deg, #c9a84c, #e8c87a)' : 'rgba(255,255,255,0.06)',
            color: rating > 0 ? '#0a0e1a' : 'var(--color-text-muted)',
          }}
        >
          {submitting ? '提交中...' : isEditing ? '更新反饋' : '提交反饋'}
        </button>
        {rating === 0 && !submitting && (
          <p className="text-xs text-text-muted/50 mt-2">請先點選星星評分</p>
        )}
        {isEditing && (
          <button
            onClick={() => setIsEditing(false)}
            className="block mx-auto mt-3 text-xs text-text-muted/60 hover:text-gold transition-colors"
          >
            取消
          </button>
        )}
      </div>
    </div>
  )
}
