'use client'

import { useState, useEffect } from 'react'
import { internalGet } from '@/lib/api'  // T10b v5.10.374(timeout + 429 handling)

interface Promotion {
  name: string
  discountPercent: number
  endAt: string
  applicablePlans: string[] | null
}

function Countdown({ endAt }: { endAt: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const diff = new Date(endAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('已結束'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(d > 0 ? `${d}天 ${h}時 ${m}分 ${s}秒` : `${h}時 ${m}分 ${s}秒`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [endAt])

  return (
    <div className="text-xs text-gold mt-2">
      距離結束：<span className="font-mono font-bold text-red-400">{timeLeft}</span>
    </div>
  )
}

// 頂部橫幅（放在定價頁標題上方）
export function PromotionTopBanner() {
  const [promo, setPromo] = useState<Promotion | null>(null)

  useEffect(() => {
    // T10b v5.10.374 — internalGet 統一處理(timeout + RateLimitError silent fail)
    internalGet('/api/promotions/active')
      .then((d) => setPromo((d as { promotion?: Promotion }).promotion ?? null))
      .catch(() => {})
  }, [])

  if (!promo) return null

  return (
    <div className="bg-gradient-to-r from-red-500/20 via-gold/20 to-red-500/20 border border-red-400/30 rounded-2xl p-4 mb-8 text-center animate-pulse-slow">
      <div className="text-lg font-bold text-red-400 mb-1">{promo.name}</div>
      <div className="text-sm text-cream">
        全站 <span className="text-gold font-bold text-lg">{promo.discountPercent}%</span> 折扣
      </div>
      <Countdown endAt={promo.endAt} />
    </div>
  )
}

// 價格標籤（顯示原價刪除線+促銷價）
export function PromotionPrice({ planCode, originalPrice, children }: {
  planCode: string
  originalPrice: number
  children: React.ReactNode  // 原本的 PriceTag
}) {
  const [promo, setPromo] = useState<Promotion | null>(null)

  useEffect(() => {
    // T10b v5.10.374 — internalGet 統一處理
    internalGet('/api/promotions/active')
      .then((d) => setPromo((d as { promotion?: Promotion }).promotion ?? null))
      .catch(() => {})
  }, [])

  const isApplicable = promo && (!promo.applicablePlans || promo.applicablePlans.includes(planCode))

  if (!isApplicable) return <>{children}</>

  const discountedPrice = Math.round(originalPrice * (1 - promo.discountPercent / 100))

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted line-through">${originalPrice}</span>
        <span className="text-2xl font-bold text-gold">${discountedPrice}</span>
        <span className="text-xs text-red-400 font-bold bg-red-400/10 px-2 py-0.5 rounded-full">
          -{promo.discountPercent}%
        </span>
      </div>
    </div>
  )
}
