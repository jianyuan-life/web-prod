'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { reportClientFailure } from '@/lib/security/client-audit'

// 自動追蹤每次頁面訪問 + 停留時間
export default function Tracker() {
  const pathname = usePathname()
  const startTime = useRef(Date.now())
  const sessionId = useRef('')

  useEffect(() => {
    // 生成/讀取 session ID
    if (typeof window !== 'undefined') {
      let sid = sessionStorage.getItem('jy_session')
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
        sessionStorage.setItem('jy_session', sid)
      }
      sessionId.current = sid
    }
  }, [])

  useEffect(() => {
    // 每次路由變化時追蹤
    startTime.current = Date.now()

    const track = () => {
      if (pathname.startsWith('/admin')) return // 不追蹤管理後台

      // GA4 路由變化追蹤（SPA 需手動觸發）
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).gtag) {
        ;(window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', 'page_view', { page_path: pathname })
      }

      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          page_path: pathname,
          event_type: 'pageview',
          referrer: document.referrer || '',
        }),
      }).catch((e) => {
        // T11 v5.10.360:tracker 失敗仍 silent UX、加低 severity audit
        reportClientFailure('tracker_pageview', e, { severity: 'info' })
      })
    }

    // 延遲 100ms 確保 session ID 已生成
    const timer = setTimeout(track, 100)

    // 離開頁面時記錄停留時間
    return () => {
      clearTimeout(timer)
      const duration = Math.round((Date.now() - startTime.current) / 1000)
      if (duration > 1 && duration < 1800) { // 1秒-30分鐘才記錄
        navigator.sendBeacon('/api/track', JSON.stringify({
          session_id: sessionId.current,
          page_path: pathname,
          event_type: 'duration',
          duration_seconds: duration,
        }))
      }
    }
  }, [pathname])

  return null // 不渲染任何 UI
}
