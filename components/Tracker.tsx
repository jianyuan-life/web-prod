'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { reportClientFailure } from '@/lib/security/client-audit'
import { isPrivateConsultationUrl, redactConsultationUrl } from '@/lib/security/private-route-redaction'
import {
  hasAnalyticsConsent,
  isTelemetryEligiblePath,
  subscribeToConsent,
  useStoredConsent,
} from '@/lib/privacy/consent'

const SESSION_KEY = 'jy_session'

function trackingAllowed(pathname: string): boolean {
  return !pathname.startsWith('/admin')
    && !isPrivateConsultationUrl(pathname)
    && isTelemetryEligiblePath(pathname)
    && hasAnalyticsConsent(pathname)
}

function safeReferrer(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

function createSessionId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

export default function Tracker() {
  const pathname = usePathname()
  const consent = useStoredConsent()
  const startTime = useRef(Date.now())
  const sessionId = useRef('')
  const pageviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRequests = useRef(new Set<XMLHttpRequest>())

  const stopTracking = () => {
    if (pageviewTimer.current !== null) {
      clearTimeout(pageviewTimer.current)
      pageviewTimer.current = null
    }
    for (const request of pendingRequests.current) request.abort()
    pendingRequests.current.clear()
    sessionId.current = ''
    try {
      sessionStorage.removeItem('jy_session')
    } catch {
      // Terminal storage may be unavailable; the consent gate remains denied.
    }
  }

  useEffect(() => subscribeToConsent((latest) => {
    if (!latest.analytics) stopTracking()
  }), [])

  useEffect(() => {
    if (!consent.analytics || !trackingAllowed(pathname)) {
      stopTracking()
      return
    }

    try {
      let sid = sessionStorage.getItem(SESSION_KEY)
      if (!sid) {
        sid = createSessionId()
        sessionStorage.setItem(SESSION_KEY, sid)
      }
      sessionId.current = sid
    } catch {
      sessionId.current = ''
    }
  }, [consent.analytics, pathname])

  useEffect(() => {
    startTime.current = Date.now()
    if (!trackingAllowed(pathname) || !sessionId.current) return

    const safePath = redactConsultationUrl(pathname)
    pageviewTimer.current = setTimeout(() => {
      pageviewTimer.current = null
      if (!trackingAllowed(pathname) || !sessionId.current) return

      const browser = window as Window & { gtag?: (...args: unknown[]) => void }
      browser.gtag?.('event', 'page_view', { page_path: safePath })

      const request = new XMLHttpRequest()
      pendingRequests.current.add(request)
      const finish = () => pendingRequests.current.delete(request)
      const reportFailure = (error: unknown) => {
        if (!hasAnalyticsConsent(pathname)) return
        reportClientFailure('tracker_pageview', error, { severity: 'info' })
      }

      try {
        request.open('POST', '/api/track')
        request.timeout = 30_000
        request.setRequestHeader('Content-Type', 'application/json')
        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reportFailure(new Error(`tracking request failed (${request.status})`))
          }
          finish()
        }
        request.onerror = () => {
          reportFailure(new Error('tracking request failed'))
          finish()
        }
        request.ontimeout = () => {
          reportFailure(new Error('tracking request timed out'))
          finish()
        }
        request.onabort = finish
        request.send(JSON.stringify({
          session_id: sessionId.current,
          page_path: safePath,
          event_type: 'pageview',
          referrer: safeReferrer(document.referrer),
        }))
      } catch (error: unknown) {
        finish()
        reportFailure(error)
      }
    }, 100)

    return () => {
      if (pageviewTimer.current !== null) {
        clearTimeout(pageviewTimer.current)
        pageviewTimer.current = null
      }
      for (const request of pendingRequests.current) request.abort()
      pendingRequests.current.clear()

      const duration = Math.round((Date.now() - startTime.current) / 1000)
      if (
        duration > 1
        && duration < 1800
        && sessionId.current
        && hasAnalyticsConsent(pathname)
        && trackingAllowed(pathname)
      ) {
        try {
          navigator.sendBeacon('/api/track', JSON.stringify({
            session_id: sessionId.current,
            page_path: safePath,
            event_type: 'duration',
            duration_seconds: duration,
          }))
        } catch {
          // A failed beacon must not affect navigation.
        }
      }
    }
  }, [consent.analytics, pathname])

  return null
}
