'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { internalGet, internalPost } from '@/lib/api'  // T10b v5.10.373(timeout + 429 handling)
import { SHICHEN } from './types'

const TIME_BLOCK_NAMES = [
  '子時 (23:00-01:00)', '丑時 (01:00-03:00)', '寅時 (03:00-05:00)', '卯時 (05:00-07:00)',
  '辰時 (07:00-09:00)', '巳時 (09:00-11:00)', '午時 (11:00-13:00)', '未時 (13:00-15:00)',
  '申時 (15:00-17:00)', '酉時 (17:00-19:00)', '戌時 (19:00-21:00)', '亥時 (21:00-23:00)',
]

interface ConfirmationModalProps {
  show: boolean
  onClose: () => void
  onConfirm: () => void
  planCode: string
  finalPrice?: number
  totalPrice?: number
  pointsUsed?: number
  pointsDiscount?: number
  onPointsChange?: (pts: number, discount: number) => void
  couponApplied?: { code: string; discountAmount: number } | null
  form: {
    name: string
    year: string
    month: string
    day: string
    hour: string
    minute: string
    gender: string
    marital_status: string
    guardian_name: string
    guardian_relationship: string
    guardian_consent: boolean
    birthCity: string
    timezone: string
    countryCode: string
    calendarType: 'solar' | 'lunar'
  }
  timeMode: 'unknown' | 'shichen' | 'exact'
  loading: boolean
  e1EndDate?: string
  e1EventType?: string
  e1HasExactTime?: 'yes' | 'no'
  eSelectedBlocks?: boolean[]
  customerNote?: string
}

export default function ConfirmationModal({
  show, onClose, onConfirm, planCode, form, timeMode, loading,
  e1EndDate, e1EventType, e1HasExactTime, eSelectedBlocks, customerNote,
  finalPrice, totalPrice, pointsUsed, pointsDiscount, onPointsChange, couponApplied,
}: ConfirmationModalProps) {
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

  // 格式化出生時間顯示
  const getTimeDisplay = () => {
    if (timeMode === 'unknown') return '不確定'
    if (timeMode === 'shichen') {
      const shichen = SHICHEN.find(s => s.value === parseInt(form.hour))
      return shichen ? `${shichen.label}（以時辰計）` : `${form.hour}時（以時辰計）`
    }
    return `${form.hour}時${form.minute}分（知道精確時間）`
  }

  const getGenderDisplay = () => form.gender === 'M' ? '男' : '女'
  const getCalendarDisplay = () => form.calendarType === 'solar' ? '國曆' : '農曆'
  const getRelationshipDisplay = () => ({
    single: '單身',
    partnered: '穩定交往或有伴侶',
    married: '已婚',
    separated: '分居',
    divorced: '離婚',
    widowed: '喪偶',
    not_applicable: '不適用',
    prefer_not_to_say: '不願回答',
    unmarried: '未婚',
  }[form.marital_status] || '未提供')
  const originalPrice = totalPrice ?? finalPrice ?? 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!loading) onClose() }}
        aria-hidden="true"
      />

      {/* 彈窗內容 */}
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
        <p className="checkout-order-kicker text-center">{planCode === 'C' ? '付款前確認' : 'Final review'}</p>
        <h3 id="checkout-confirm-title" className="text-lg font-bold text-gold text-center mb-4">
          {planCode === 'C' ? '最後核對人生藍圖資料' : '請確認您的出生資料'}
        </h3>

        <div className="space-y-3 mb-5">
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">姓名</span>
            <span className="text-white font-medium">{form.name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">性別</span>
            <span className="text-white font-medium">{getGenderDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">曆法</span>
            <span className="text-white font-medium">{getCalendarDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生日期</span>
            <span className="text-white font-medium">{form.year}年{form.month}月{form.day}日</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生時間</span>
            <span className="text-white font-medium">{getTimeDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生地區</span>
            <span className="text-white font-medium">{form.birthCity}</span>
          </div>
          {planCode === 'C' && (
            <>
              <div className="flex justify-between items-center gap-4 py-2 border-b border-white/10">
                <span className="text-text-muted text-sm">目前關係狀態</span>
                <span className="text-white font-medium text-right">{getRelationshipDisplay()}</span>
              </div>
              <div className="py-2 border-b border-white/10">
                <span className="text-text-muted text-sm block">這次最想理解或改善的事</span>
                <span className="text-white text-sm mt-1 block whitespace-pre-wrap">{customerNote?.trim() || '未另外填寫'}</span>
              </div>
              <div className="py-2 border-b border-white/10">
                <span className="text-text-muted text-sm block">出生地計算設定</span>
                <span className="text-white text-sm mt-1 block">{form.timezone} · {form.countryCode}</span>
              </div>
            </>
          )}

          {/* E1 專屬：事件類型+日期+時間+可配合時辰+事件描述 */}
          {/* v5.3.93 修正：E2 不走這裡(E2 單月 1 盤、不需事件日期) */}
          {planCode === 'E1' && (
            <>
              {e1EventType && (
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm">事件類型</span>
                  <span className="text-white font-medium">{e1EventType}</span>
                </div>
              )}
              {e1HasExactTime && (
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm">有無固定時間</span>
                  <span className="text-white font-medium">{e1HasExactTime === 'yes' ? '有（固定時間）' : '無（找最佳吉時）'}</span>
                </div>
              )}
              {e1EndDate && (
                <div className="py-2 border-b border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-sm">事件日期</span>
                    <span className="text-white font-medium">{e1EndDate}</span>
                  </div>
                  {/* v5.3.93 透明度提示：讓客戶在付款前知道系統會從哪天開始找吉時 */}
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-text-muted/70 text-[11px]">吉時搜尋區間</span>
                    <span className="text-gold/80 text-[11px]">
                      {(() => {
                        const tPlus1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        return `${tPlus1} ~ ${e1EndDate} 找 Top 3`
                      })()}
                    </span>
                  </div>
                </div>
              )}
              {eSelectedBlocks && eSelectedBlocks.some(b => b) && (
                <div className="py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm block mb-1">可配合出行時間</span>
                  <div className="flex flex-wrap gap-1">
                    {eSelectedBlocks.map((checked, i) => checked && (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-gold/20 text-gold border border-gold/30">
                        {TIME_BLOCK_NAMES[i]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {customerNote && (
                <div className="py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm block mb-1">事件描述</span>
                  <span className="text-white text-sm">{customerNote}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 警告提示 */}
        <div className="bg-gold/10 border border-gold/20 rounded-xl p-3 mb-5">
          <p id="checkout-confirm-description" className="text-xs text-gold/90 leading-relaxed text-center">
            {planCode === 'C'
              ? finalPrice === 0
                ? '出生資料一旦提交將用於排盤計算。本次無須刷卡；確認後會直接建立報告。'
                : '出生資料一旦提交將用於排盤計算；確認後才會前往 Stripe 付款。'
              : '出生資料一旦提交將用於排盤計算，請務必確認正確。'}
          </p>
        </div>

        {/* 積分折抵（嵌入彈窗內） */}
        <ModalPointsRedeem
          totalPrice={totalPrice || finalPrice || 0}
          pointsUsed={pointsUsed || 0}
          pointsDiscount={pointsDiscount || 0}
          onPointsChange={onPointsChange}
          hasCoupon={!!couponApplied}
          planCode={planCode}
          consultationMode={planCode === 'C'}
        />

        {/* 金額明細 */}
        {finalPrice !== undefined && planCode === 'C' ? (
          <div className="mb-4 space-y-2 rounded-lg px-3 py-3" style={{ background: 'rgba(201,168,76,0.08)' }} aria-label="付款金額明細">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-text-muted">方案原價</span>
              <span className="text-cream">USD {originalPrice}</span>
            </div>
            {couponApplied && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-text-muted">優惠碼折抵（{couponApplied.code}）</span>
                <span className="text-cream">− USD {couponApplied.discountAmount}</span>
              </div>
            )}
            {(pointsDiscount || 0) > 0 && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-text-muted">積分折抵（{pointsUsed || 0} 點）</span>
                <span className="text-cream">− USD {pointsDiscount}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-gold/15 pt-2">
              <span className="text-sm font-semibold text-text-muted">本次實付</span>
              <span className="text-xl font-bold text-gold">USD {finalPrice}</span>
            </div>
          </div>
        ) : finalPrice !== undefined ? (
          <div className="flex justify-between items-center mb-4 px-2 py-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.08)' }}>
            <span className="text-sm text-text-muted">一次性應付金額</span>
            <span className="text-xl font-bold text-gold">USD {finalPrice}</span>
          </div>
        ) : null}

        {/* 按鈕 */}
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
            {loading ? <span role="status">跳轉付款中...</span> : finalPrice === 0 ? '確認無誤，建立報告' : '確認無誤，前往 Stripe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 嵌入確認彈窗的積分折抵元件
function ModalPointsRedeem({ totalPrice, pointsUsed, pointsDiscount, onPointsChange, hasCoupon, planCode, consultationMode }: {
  totalPrice: number; pointsUsed: number; pointsDiscount: number;
  onPointsChange?: (pts: number, discount: number) => void; hasCoupon: boolean; planCode: string; consultationMode: boolean;
}) {
  const [balance, setBalance] = useState(0)
  const [loadingPts, setLoadingPts] = useState(true)
  const [inputVal, setInputVal] = useState(pointsUsed > 0 ? String(pointsUsed) : '')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const pointsRequestInFlight = useRef(false)

  useEffect(() => {
    async function loadBalance() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) { setLoadingPts(false); return }
        // T10b v5.10.373 — internalGet 統一處理(timeout + RateLimitError)
        const d = await internalGet('/api/points/balance', { authToken: token }) as { balance?: number }
        setBalance(d.balance || 0)
      } catch {} finally { setLoadingPts(false) }
    }
    loadBalance()
  }, [])

  if (loadingPts) return null
  if (balance <= 0 && pointsUsed <= 0) return null
  if (hasCoupon) return null

  const maxPoints = Math.min(balance, totalPrice)

  const applyPoints = async () => {
    if (consultationMode && (validating || pointsRequestInFlight.current)) return
    const pts = parseInt(inputVal)
    if (!pts || pts <= 0 || pts > maxPoints) {
      if (consultationMode) setError(`請輸入 1 至 ${maxPoints} 點。`)
      return
    }
    if (consultationMode) {
      pointsRequestInFlight.current = true
      setValidating(true)
      setError('')
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      // T10b v5.10.373 — internalPost 統一處理(原 raw fetch + 手動 headers)
      const data = await internalPost('/api/points/use', {
        pointsToUse: pts, planCode, orderAmount: totalPrice,
      }, { authToken: token }) as { success?: boolean; pointsUsed?: number; discountAmount?: number }
      if (data.success && onPointsChange && typeof data.pointsUsed === 'number') {
        onPointsChange(data.pointsUsed, data.discountAmount ?? 0)
      } else if (consultationMode) {
        setError('積分暫時無法套用，請稍後再試。')
      }
    } catch {
      if (consultationMode) setError('積分暫時無法套用，請稍後再試。')
    } finally {
      if (consultationMode) {
        pointsRequestInFlight.current = false
        setValidating(false)
      }
    }
  }

  const removePoints = () => {
    setInputVal('')
    if (onPointsChange) onPointsChange(0, 0)
  }

  return (
    <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(106,176,76,0.06)', border: '1px solid rgba(106,176,76,0.15)' }} aria-busy={consultationMode ? validating : undefined}>
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
          <label htmlFor="modal-points-input" className="sr-only">要折抵的積分點數</label>
          <input id="modal-points-input" inputMode="numeric" value={inputVal} disabled={consultationMode ? validating : undefined} onChange={e => { setInputVal(e.target.value.replace(/\D/g, '')); if (consultationMode) setError('') }}
            placeholder={`最多 ${maxPoints} 點`}
            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-green-500/40 focus:outline-none" />
          <button type="button" onClick={applyPoints} disabled={!inputVal || (consultationMode && validating)}
            className="px-3 py-1.5 bg-green-500/80 text-white text-xs font-semibold rounded-lg hover:bg-green-500 disabled:opacity-40 transition-colors">
            {consultationMode && validating ? '確認中…' : '折抵'}
          </button>
        </div>
      )}
      {consultationMode && error && <p className="mt-2 text-xs text-red-300" role="alert">{error}</p>}
    </div>
  )
}
