'use client'

import { useEffect, useState } from 'react'

export const CONSENT_STORAGE_KEY = 'jy_cookie_consent_v1'
export const CONSENT_UPDATED_EVENT = 'jy:consent-updated'
export const CONSENT_SETTINGS_EVENT = 'jy:consent-settings'

export type ConsentSnapshot = Readonly<{
  necessary: true
  analytics: boolean
  marketing: boolean
  decided_at: string | null
  decided: boolean
}>

export type ConsentChoice = Readonly<{
  analytics: boolean
  marketing: boolean
}>

export const DENIED_CONSENT: ConsentSnapshot = Object.freeze({
  necessary: true,
  analytics: false,
  marketing: false,
  decided_at: null,
  decided: false,
})

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

export function parseStoredConsent(value: string | null): ConsentSnapshot {
  if (!value) return DENIED_CONSENT

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return DENIED_CONSENT

    const candidate = parsed as Record<string, unknown>
    if (
      candidate.necessary !== true
      || typeof candidate.analytics !== 'boolean'
      || typeof candidate.marketing !== 'boolean'
      || !isIsoTimestamp(candidate.decided_at)
    ) {
      return DENIED_CONSENT
    }

    return Object.freeze({
      necessary: true,
      analytics: candidate.analytics,
      marketing: candidate.marketing,
      decided_at: candidate.decided_at,
      decided: true,
    })
  } catch {
    return DENIED_CONSENT
  }
}

export function readStoredConsent(): ConsentSnapshot {
  if (typeof window === 'undefined') return DENIED_CONSENT

  try {
    return parseStoredConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    return DENIED_CONSENT
  }
}

export function subscribeToConsent(listener: (snapshot: ConsentSnapshot) => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const syncFromStorage = () => listener(readStoredConsent())
  window.addEventListener(CONSENT_UPDATED_EVENT, syncFromStorage)
  window.addEventListener('storage', syncFromStorage)

  return () => {
    window.removeEventListener(CONSENT_UPDATED_EVENT, syncFromStorage)
    window.removeEventListener('storage', syncFromStorage)
  }
}

function notifyConsentUpdated(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(CONSENT_UPDATED_EVENT))
  } catch {
    // Storage remains the authority even if this document cannot dispatch.
  }
}

export function saveStoredConsent(choice: ConsentChoice): ConsentSnapshot {
  if (typeof window === 'undefined') return DENIED_CONSENT

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      necessary: true,
      analytics: choice.analytics === true,
      marketing: choice.marketing === true,
      decided_at: new Date().toISOString(),
    }))
  } catch {
    const persisted = readStoredConsent()
    applyStoredConsentToVendors()
    notifyConsentUpdated()
    return persisted
  }

  const persisted = readStoredConsent()
  applyStoredConsentToVendors()
  notifyConsentUpdated()
  return persisted
}

function canonicalPathname(value: string): string | null {
  let pathname: string
  try {
    pathname = new URL(value, 'https://consent.invalid').pathname
  } catch {
    return null
  }

  for (let round = 0; round < 3; round += 1) {
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return null
    }
    if (decoded === pathname) break
    pathname = decoded
  }

  return pathname.replace(/\\/gu, '/').toLowerCase()
}

export function isTelemetryEligiblePath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const pathname = canonicalPathname(value)
  if (!pathname) return false
  return pathname !== '/consultation'
    && !pathname.startsWith('/consultation/')
    && pathname !== '/g15-consent'
    && !pathname.startsWith('/g15-consent/')
}

function currentPathname(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.location.pathname
  } catch {
    return null
  }
}

export function hasAnalyticsConsent(pathname = currentPathname()): boolean {
  return pathname !== null
    && isTelemetryEligiblePath(pathname)
    && readStoredConsent().analytics
}

export function hasMarketingConsent(pathname = currentPathname()): boolean {
  return pathname !== null
    && isTelemetryEligiblePath(pathname)
    && readStoredConsent().marketing
}

export function applyStoredConsentToVendors(pathname = currentPathname()): void {
  if (typeof window === 'undefined') return

  const eligible = pathname !== null && isTelemetryEligiblePath(pathname)
  const stored = readStoredConsent()
  const analytics = eligible && stored.analytics
  const marketing = eligible && stored.marketing
  const browser = window as Window & {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }

  browser.gtag?.('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied',
  })
  browser.fbq?.('consent', marketing ? 'grant' : 'revoke')
}

export function useStoredConsent(): ConsentSnapshot {
  const [snapshot, setSnapshot] = useState<ConsentSnapshot>(DENIED_CONSENT)

  useEffect(() => {
    const syncFromStorage = () => setSnapshot(readStoredConsent())
    syncFromStorage()
    return subscribeToConsent(setSnapshot)
  }, [])

  return snapshot
}
