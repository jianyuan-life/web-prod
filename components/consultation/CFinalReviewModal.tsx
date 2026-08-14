'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { SHICHEN } from '@/components/checkout/types'
import { internalGet, internalPost } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { ConsultationCheckoutFormState } from './checkout-types'

type CFinalReviewModalProps = {
  show: boolean
  onClose: () => void
  onConfirm: () => void
  form: ConsultationCheckoutFormState
  timeMode: 'unknown' | 'shichen' | 'exact'
  loading: boolean
  customerNote?: string
  finalPrice?: number
  totalPrice?: number
  pointsUsed?: number
  pointsDiscount?: number
  onPointsChange?: (points: number, discount: number) => void
  couponApplied?: { code: string; discountAmount: number } | null
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  single: '單身',
  partnered: '穩定交往或有伴侶',
  married: '已婚',
  separated: '分居',
  divorced: '離婚',
  widowed: '喪偶',
  not_applicable: '不適用',
  prefer_not_to_say: '不願回答',
  unmarried: '未婚',
}

export default function CFinalReviewModal({
  show,
  onClose,
  onConfirm,
  form,
  timeMode,
  loading,
  customerNote,
  finalPrice,
  totalPrice,
  pointsUsed,
  pointsDiscount,
  onPointsChange,
  couponApplied,
}: CFinalReviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!show) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => editButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [show])

  if (!show) return null

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!loading) {
        event.preventDefault()
        onClose()
      }
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
    ) || [])
    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const timeDisplay = timeMode === 'unknown'
    ? '不確定'
    : timeMode === 'shichen'
      ? `${SHICHEN.find((item) => item.value === Number.parseInt(form.hour, 10))?.label || `${form.hour}時`}（以時辰計）`
      : `${form.hour}時${form.minute}分（知道精確時間）`
  const originalPrice = totalPrice ?? finalPrice ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!loading) onClose() }}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-confirm-title"
        aria-describedby="checkout-confirm-description"
        aria-busy={loading}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="checkout-dialog relative glass rounded-2xl p-5 sm:p-6 max-w-md w-full border border-gold/20 shadow-2xl"
      >
        <p className="checkout-order-kicker text-center">付款前確認</p>
        <h3 id="checkout-confirm-title" className="text-lg font-bold text-gold text-center mb-4">
          最後核對人生藍圖資料
        </h3>

        <div className="space-y-3 mb-5">
          <ReviewRow label="姓名" value={form.name} />
          <ReviewRow label="性別" value={form.gender === 'M' ? '男' : '女'} />
          <ReviewRow label="曆法" value={form.calendarType === 'solar' ? '國曆' : '農曆'} />
          <ReviewRow label="出生日期" value={`${form.year}年${form.month}月${form.day}日`} />
          <ReviewRow label="出生時間" value={timeDisplay} />
          <ReviewRow label="出生地區" value={form.birthCity} />
          <ReviewRow label="目前關係狀態" value={RELATIONSHIP_LABELS[form.marital_status] || '未提供'} alignRight />
          <div className="py-2 border-b border-white/10">
            <span className="text-text-muted text-sm block">這次最想理解或改善的事</span>
            <span className="text-white text-sm mt-1 block whitespace-pre-wrap">{customerNote?.trim() || '未另外填寫'}</span>
          </div>
          <div className="py-2 border-b border-white/10">
            <span className="text-text-muted text-sm block">出生地計算設定</span>
            <span className="text-white text-sm mt-1 block">{form.timezone} · {form.countryCode}</span>
          </div>
        </div>

        <div className="bg-gold/10 border border-gold/20 rounded-xl p-3 mb-5">
          <p id="checkout-confirm-description" className="text-xs text-gold/90 leading-relaxed text-center">
            {finalPrice === 0
              ? '出生資料一旦提交將用於排盤計算。本次無須刷卡；確認後會直接建立報告。'
              : '出生資料一旦提交將用於排盤計算；確認後才會前往 Stripe 付款。'}
          </p>
        </div>

        <CModalPointsRedeem
          totalPrice={totalPrice || finalPrice || 0}
          pointsUsed={pointsUsed || 0}
          pointsDiscount={pointsDiscount || 0}
          onPointsChange={onPointsChange}
          hasCoupon={!!couponApplied}
        />

        {finalPrice !== undefined ? (
          <div className="mb-4 space-y-2 rounded-lg px-3 py-3" style={{ background: 'rgba(201,168,76,0.08)' }} aria-label="付款金額明細">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-text-muted">方案原價</span>
              <span className="text-cream">USD {originalPrice}</span>
            </div>
            {couponApplied ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-text-muted">優惠碼折抵（{couponApplied.code}）</span>
                <span className="text-cream">− USD {couponApplied.discountAmount}</span>
              </div>
            ) : null}
            {(pointsDiscount || 0) > 0 ? (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-text-muted">積分折抵（{pointsUsed || 0} 點）</span>
                <span className="text-cream">− USD {pointsDiscount}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 border-t border-gold/15 pt-2">
              <span className="text-sm font-semibold text-text-muted">本次實付</span>
              <span className="text-xl font-bold text-gold">USD {finalPrice}</span>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            ref={editButtonRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 border border-gold/30 text-gold rounded-xl font-medium hover:bg-gold/10 transition-colors disabled:opacity-50"
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50"
          >
            {loading
              ? <span role="status">跳轉付款中...</span>
              : finalPrice === 0 ? '確認無誤，建立報告' : '確認無誤，前往 Stripe'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, alignRight = false }: { label: string; value: string; alignRight?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-white/10${alignRight ? ' gap-4' : ''}`}>
      <span className="text-text-muted text-sm">{label}</span>
      <span className={`text-white font-medium${alignRight ? ' text-right' : ''}`}>{value}</span>
    </div>
  )
}

function CModalPointsRedeem({
  totalPrice,
  pointsUsed,
  pointsDiscount,
  onPointsChange,
  hasCoupon,
}: {
  totalPrice: number
  pointsUsed: number
  pointsDiscount: number
  onPointsChange?: (points: number, discount: number) => void
  hasCoupon: boolean
}) {
  const [balance, setBalance] = useState(0)
  const [loadingPoints, setLoadingPoints] = useState(true)
  const [inputValue, setInputValue] = useState(pointsUsed > 0 ? String(pointsUsed) : '')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const pointsRequestInFlight = useRef(false)

  useEffect(() => {
    async function loadBalance() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const data = await internalGet('/api/points/balance', { authToken: session.access_token }) as { balance?: number }
        setBalance(data.balance || 0)
      } catch {
        // A missing balance must not block checkout.
      } finally {
        setLoadingPoints(false)
      }
    }
    loadBalance()
  }, [])

  if (loadingPoints || (balance <= 0 && pointsUsed <= 0) || hasCoupon) return null

  const maxPoints = Math.min(balance, totalPrice)
  const applyPoints = async () => {
    if (validating || pointsRequestInFlight.current) return
    const requestedPoints = Number.parseInt(inputValue, 10)
    if (!requestedPoints || requestedPoints <= 0 || requestedPoints > maxPoints) {
      setError(`請輸入 1 至 ${maxPoints} 點。`)
      return
    }

    pointsRequestInFlight.current = true
    setValidating(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const data = await internalPost('/api/points/use', {
        pointsToUse: requestedPoints,
        planCode: 'C',
        orderAmount: totalPrice,
      }, { authToken: session?.access_token }) as { success?: boolean; pointsUsed?: number; discountAmount?: number }
      if (data.success && onPointsChange && typeof data.pointsUsed === 'number') {
        onPointsChange(data.pointsUsed, data.discountAmount ?? 0)
      } else {
        setError('積分暫時無法套用，請稍後再試。')
      }
    } catch {
      setError('積分暫時無法套用，請稍後再試。')
    } finally {
      pointsRequestInFlight.current = false
      setValidating(false)
    }
  }

  const removePoints = () => {
    setInputValue('')
    onPointsChange?.(0, 0)
  }

  return (
    <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(106,176,76,0.06)', border: '1px solid rgba(106,176,76,0.15)' }} aria-busy={validating}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-green-300">積分折抵</span>
        <span className="text-[10px] text-green-400/60">可用 {balance} 點（1 點 = USD 1）</span>
      </div>
      {pointsUsed > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-400">已折抵 <strong>{pointsUsed} 點（− USD {pointsDiscount}）</strong></span>
          <button type="button" onClick={removePoints} className="text-[10px] text-red-400 hover:text-red-300">取消</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label htmlFor="c-modal-points-input" className="sr-only">要折抵的積分點數</label>
          <input
            id="c-modal-points-input"
            inputMode="numeric"
            value={inputValue}
            disabled={validating}
            onChange={(event) => {
              setInputValue(event.target.value.replace(/\D/g, ''))
              setError('')
            }}
            placeholder={`最多 ${maxPoints} 點`}
            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-green-500/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyPoints}
            disabled={!inputValue || validating}
            className="px-3 py-1.5 bg-green-500/80 text-white text-xs font-semibold rounded-lg hover:bg-green-500 disabled:opacity-40 transition-colors"
          >
            {validating ? '確認中…' : '折抵'}
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-red-300" role="alert">{error}</p> : null}
    </div>
  )
}
