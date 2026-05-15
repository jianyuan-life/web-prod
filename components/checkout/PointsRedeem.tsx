'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { internalGet, internalPost, RateLimitError } from '@/lib/api'  // T10b v5.10.373(429 友好倒數 + timeout)
import { useRetryCountdown } from '@/components/hooks/useRetryCountdown'

interface PointsRedeemProps {
  planCode: string
  orderAmount: number
  couponApplied: { code: string; discountAmount: number; message: string } | null
  onPointsChange: (pointsUsed: number, discountAmount: number) => void
}

export default function PointsRedeem({
  planCode,
  orderAmount,
  couponApplied,
  onPointsChange,
}: PointsRedeemProps) {
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pointsInput, setPointsInput] = useState('')
  const [pointsUsed, setPointsUsed] = useState(0)
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  // T10 v5.10.353:429 倒數
  const { secondsLeft, isReady, start: startCountdown } = useRetryCountdown()

  const hasCoupon = !!couponApplied
  const maxPoints = Math.min(balance, Math.floor(orderAmount))

  // 載入點數餘額
  useEffect(() => {
    setLoading(true)
    async function loadBalance() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) { setBalance(0); setLoading(false); return }
        // T10b v5.10.373 — internalGet 統一處理(原 raw fetch 無 timeout)
        const data = await internalGet('/api/points/balance', { authToken: token }) as { balance?: number }
        setBalance(data.balance || 0)
      } catch { setBalance(0) }
      finally { setLoading(false) }
    }
    loadBalance()
  }, [])

  // 優惠碼啟用時，清除點數折抵
  useEffect(() => {
    if (hasCoupon && pointsUsed > 0) {
      setPointsUsed(0)
      setPointsInput('')
      setError('')
      onPointsChange(0, 0)
    }
  }, [hasCoupon]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPoints = async () => {
    const pts = parseInt(pointsInput)
    if (!pts || pts <= 0) {
      setError('請輸入有效的點數')
      return
    }
    if (pts > balance) {
      setError(`可用點數不足，目前餘額 ${balance} 點`)
      return
    }
    if (pts > maxPoints) {
      setError(`最多可使用 ${maxPoints} 點`)
      return
    }

    setValidating(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      // T10b v5.10.373 — internalPost 統一處理 RateLimitError(原 raw fetch + 手動解析 Retry-After)
      const data = await internalPost('/api/points/use', {
        pointsToUse: pts, planCode, orderAmount,
      }, { authToken: token }) as { success: boolean; pointsUsed?: number; discountAmount?: number; error?: string }

      if (data.success && typeof data.pointsUsed === 'number') {
        setPointsUsed(data.pointsUsed)
        onPointsChange(data.pointsUsed, data.discountAmount ?? 0)
      } else {
        setError(data.error || '驗證失敗')
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        // T10 v5.10.353 + T10b v5.10.373:429 倒數 UI(從 helper 拿 retryAfter、不需手動 parse Retry-After header)
        startCountdown(err.retryAfter)
        setError(`請求過於頻繁、請等 ${err.retryAfter} 秒後重試`)
      } else {
        setError(err instanceof Error ? err.message : '網路錯誤、請稍後再試')
      }
    } finally {
      setValidating(false)
    }
  }

  const removePoints = () => {
    setPointsUsed(0)
    setPointsInput('')
    setError('')
    onPointsChange(0, 0)
  }

  // 沒有點數，不顯示
  if (!loading && balance <= 0) return null

  return (
    <div className={`${hasCoupon ? 'opacity-30 pointer-events-none' : ''}`}>
      {loading ? (
        <p className="text-text-muted text-xs">載入點數...</p>
      ) : pointsUsed > 0 ? (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
          <span className="text-green-400 text-sm">✓ 已折抵 {pointsUsed} 點（-${pointsUsed}）</span>
          <button type="button" onClick={removePoints} className="text-xs text-text-muted/50 hover:text-red-400 transition-colors ml-2">取消</button>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-1 text-[11px] text-text-muted/70 mb-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
            積分折抵（1 點 = 1 美元，共 {balance} 點可用）
          </label>
          <div className="flex gap-2">
            <input
              type="number" min={1} max={maxPoints}
              placeholder={`最多 ${maxPoints} 點`}
              value={pointsInput}
              onChange={(e) => { setPointsInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyPoints())}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-4 py-2 text-cream text-sm focus:border-green-500/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={applyPoints}
              disabled={validating || !pointsInput.trim() || !isReady}
              className="px-4 py-2 bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg hover:bg-gold/30 disabled:opacity-40 whitespace-nowrap"
              aria-label={!isReady ? `${secondsLeft} 秒後可折抵` : '折抵點數'}
            >
              {validating
                ? '...'
                : !isReady
                  ? `等 ${secondsLeft}s`
                  : '折抵'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          {/* T10 v5.10.353 L1 QA 抓 ux 補:倒數 UI 即時顯示 */}
          {!isReady && (
            <p className="text-amber-400/70 text-xs mt-1" role="status" aria-live="polite">
              請等 {secondsLeft} 秒後再試
            </p>
          )}
        </>
      )}
    </div>
  )
}
