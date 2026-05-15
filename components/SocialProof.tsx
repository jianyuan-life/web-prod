'use client'

import { useEffect, useState } from 'react'
import { internalGet } from '@/lib/api'  // T10b v5.10.374(timeout)

export default function SocialProof() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // T10b v5.10.374 — internalGet 統一處理(timeout 30s)
    internalGet('/api/stats')
      .then((d) => setCount((d as { count?: number }).count ?? 0))
      .catch(() => {})
  }, [])

  if (count <= 0) return null

  return (
    <p className="text-center text-sm text-gold/80 mb-8">
      &#9733; 已有 <span className="font-bold text-gold">{count.toLocaleString('en-US')}</span> 位用戶選擇鑒源
    </p>
  )
}
