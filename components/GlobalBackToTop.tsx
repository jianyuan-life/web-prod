'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * 全站「回到頂部」浮動按鈕
 * - 滾動超過 600px 才顯示
 * - 報告頁自己的 BackToTopButton 優先（這裡排除 /report）
 * - 後台 /jamie 不顯示
 */
export default function GlobalBackToTop() {
  const [show, setShow] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 報告頁、後台不渲染（避免重疊）
  if (pathname?.startsWith('/report/')) return null
  if (pathname?.startsWith('/jamie')) return null

  if (!show) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
      style={{
        background: 'linear-gradient(135deg, #c9a84c 0%, #e4c26a 100%)',
        color: '#0a0e1a',
        boxShadow: '0 6px 20px rgba(201,168,76,0.35)',
      }}
      aria-label="回到頂部"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
