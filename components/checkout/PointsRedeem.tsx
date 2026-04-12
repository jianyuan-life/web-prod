'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
        const res = await fetch('/api/points/balance', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
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
      const res = await fetch('/api/points/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ pointsToUse: pts, planCode, orderAmount }),
      })
      const data = await res.json()
      if (data.success) {
        setPointsUsed(data.pointsUsed)
        onPointsChange(data.pointsUsed, data.discountAmount)
      } else {
        setError(data.error || '驗證失敗')
      }
    } catch {
      setError('網路錯誤，請稍後再試')
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
          <div className="flex gap-2">
            <input
              type="number" min={1} max={maxPoints}
              placeholder={`積分折抵（${balance}點可用）`}
              value={pointsInput}
              onChange={(e) => { setPointsInput(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyPoints())}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-4 py-2 text-cream text-sm focus:border-green-500/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button type="button" onClick={applyPoints} disabled={validating || !pointsInput.trim()}
              className="px-4 py-2 bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg hover:bg-gold/30 disabled:opacity-40 whitespace-nowrap">
              {validating ? '...' : '折抵'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </>
      )}
    </div>
  )
}
