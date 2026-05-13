// v5.10.221 — FeedbackForm 報告回饋(Jamie 規格 SECTION 11)
//
// 樣式:星級 + 「最有價值的部分」多選 chip + 改善建議 textarea + 推薦意願二選一 + 提交
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FeedbackFormProps {
  reportId: string
  reportType: string
  valuableOptions?: string[] // 預設 5 個常用選項
  onSubmit?: (feedback: FeedbackData) => Promise<void> | void
  className?: string
}

export interface FeedbackData {
  reportId: string
  reportType: string
  rating: number // 1-5 stars
  valuable: string[] // 多選
  improvement: string
  recommend: boolean | null // true=推薦 / false=不推薦 / null=未答
  submittedAt: string
}

const DEFAULT_VALUABLE = [
  '命格分析準確',
  '行動建議實用',
  '時機表清晰',
  '心理層面深入',
  '視覺呈現美觀',
]

export function FeedbackForm({
  reportId,
  reportType,
  valuableOptions = DEFAULT_VALUABLE,
  onSubmit,
  className = '',
}: FeedbackFormProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [valuable, setValuable] = useState<Set<string>>(new Set())
  const [improvement, setImprovement] = useState('')
  const [recommend, setRecommend] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleValuable = (opt: string) => {
    setValuable((prev) => {
      const next = new Set(prev)
      if (next.has(opt)) next.delete(opt)
      else next.add(opt)
      return next
    })
  }

  async function handleSubmit() {
    if (rating === 0) {
      setError('請給星級評分')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const data: FeedbackData = {
        reportId,
        reportType,
        rating,
        valuable: Array.from(valuable),
        improvement,
        recommend,
        submittedAt: new Date().toISOString(),
      }
      if (onSubmit) await onSubmit(data)
      // Sprint 2:POST /api/feedback (Supabase insert)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失敗、請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section
        className={cn('rounded-xl p-8 text-center border', className)}
        style={{
          backgroundColor: 'rgba(74, 222, 128, 0.06)',
          borderColor: 'var(--jy-semantic-flow)',
        }}
      >
        <div className="text-4xl mb-3" aria-hidden>🎉</div>
        <h3 className="text-xl font-semibold text-[var(--jy-semantic-flow)] mb-2">感謝您的回饋!</h3>
        <p className="text-sm text-[var(--jy-text-secondary)]">您的意見會幫助我們持續改善鑒源命理。</p>
      </section>
    )
  }

  return (
    <section
      className={cn('rounded-xl p-8 border border-[var(--jy-border-soft)]', className)}
      style={{ backgroundColor: 'var(--jy-bg-card)' }}
      aria-labelledby="feedback-form-title"
    >
      <h3
        id="feedback-form-title"
        className="text-xl font-semibold text-[var(--jy-text-primary)] mb-6"
        style={{ fontFamily: 'var(--jy-font-display)' }}
      >
        💬 您的回饋
      </h3>

      {/* Star rating */}
      <div className="mb-6">
        <p className="text-sm text-[var(--jy-text-secondary)] mb-3">本次報告您給幾顆星?</p>
        <div className="flex gap-1" role="radiogroup" aria-label="星級評分">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              className="text-3xl transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded"
              aria-label={`${n} 顆星`}
              role="radio"
              aria-checked={rating === n}
              style={{
                color: (hoverRating || rating) >= n ? 'var(--jy-text-gold)' : 'var(--jy-text-muted)',
              }}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {/* Valuable parts */}
      <div className="mb-6">
        <p className="text-sm text-[var(--jy-text-secondary)] mb-3">最有價值的部分(可多選):</p>
        <div className="flex flex-wrap gap-2">
          {valuableOptions.map((opt) => {
            const active = valuable.has(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleValuable(opt)}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-full text-sm transition-all',
                  'border focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
                )}
                style={{
                  backgroundColor: active ? 'rgba(229, 185, 92, 0.20)' : 'transparent',
                  color: active ? 'var(--jy-text-gold)' : 'var(--jy-text-secondary)',
                  borderColor: active ? 'var(--jy-text-gold)' : 'var(--jy-border-soft)',
                }}
                aria-pressed={active}
              >
                {active ? '✓ ' : ''}{opt}
              </button>
            )
          })}
        </div>
      </div>

      {/* Improvement textarea */}
      <div className="mb-6">
        <label htmlFor="improvement" className="block text-sm text-[var(--jy-text-secondary)] mb-3">
          改善建議(選填):
        </label>
        <textarea
          id="improvement"
          rows={3}
          value={improvement}
          onChange={(e) => setImprovement(e.target.value)}
          maxLength={500}
          className={cn(
            'w-full rounded-lg p-3 text-sm border resize-y min-h-[80px]',
            'bg-[var(--jy-bg-space)] border-[var(--jy-border-soft)]',
            'text-[var(--jy-text-primary)] placeholder:text-[var(--jy-text-muted)]',
            'focus:border-[var(--jy-text-gold)] focus:outline-none',
          )}
          placeholder="例如:希望多看到具體日期建議..."
        />
        <p className="mt-1 text-xs text-[var(--jy-text-muted)] text-right">{improvement.length}/500</p>
      </div>

      {/* Recommend */}
      <div className="mb-6">
        <p className="text-sm text-[var(--jy-text-secondary)] mb-3">您願意推薦給朋友嗎?</p>
        <div className="flex gap-3">
          <RecommendButton
            label="👍 願意推薦"
            active={recommend === true}
            onClick={() => setRecommend(true)}
            color="var(--jy-semantic-flow)"
          />
          <RecommendButton
            label="👎 暫不推薦"
            active={recommend === false}
            onClick={() => setRecommend(false)}
            color="var(--jy-text-muted)"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 text-sm text-[var(--jy-semantic-danger)]" role="alert">⚠ {error}</p>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-[10px] cursor-pointer w-full md:w-auto',
          'h-12 px-8 text-[15px] font-semibold',
          'text-[#0A0E1A]',
          'shadow-[0_8px_32px_rgba(201,168,76,0.25)]',
          'border border-transparent',
          'hover:-translate-y-0.5 hover:scale-[1.02]',
          'hover:shadow-[0_12px_40px_rgba(201,168,76,0.5)]',
          'active:translate-y-0 active:scale-[0.99]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
          'transition-all duration-200',
          'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
        )}
        style={{
          background: 'linear-gradient(135deg, #D4B36A 0%, #C9A84C 50%, #B8923D 100%)',
        }}
      >
        {submitting ? '提交中...' : '提交回饋'}
      </button>
    </section>
  )
}

function RecommendButton({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-4 py-2 rounded-lg text-sm transition-all',
        'border focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
      )}
      style={{
        backgroundColor: active ? `${color}20` : 'transparent',
        color: active ? color : 'var(--jy-text-secondary)',
        borderColor: active ? color : 'var(--jy-border-soft)',
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
