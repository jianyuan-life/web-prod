'use client'

import { useEffect, useState } from 'react'
import { formatPrice, getUserCurrency, type CurrencyCode } from '@/lib/currency'

// 價格顯示元件：自動根據用戶地區顯示本地幣種
export default function PriceTag({
  usd,
  className = '',
  size = 'lg',
}: {
  usd: number
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const [display, setDisplay] = useState(`$${usd}`)
  const [currency, setCur] = useState<CurrencyCode>('USD')

  useEffect(() => {
    const cur = getUserCurrency()
    setCur(cur)
    setDisplay(formatPrice(usd, cur))
  }, [usd])

  const sizeClass = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  }[size]

  return (
    <span className={className}>
      <span className={`${sizeClass} font-bold text-[color:var(--jy-ui-ink,var(--color-cream))]`} style={{ fontFamily: 'var(--font-sans)' }}>{display}</span>
      {currency !== 'USD' && (
        <span className="text-xs text-[color:var(--jy-ui-ink-subtle,var(--color-text-muted))] ml-1">(≈${usd} USD)</span>
      )}
    </span>
  )
}
