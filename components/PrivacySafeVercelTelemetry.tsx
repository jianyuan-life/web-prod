'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { isPrivateConsultationUrl } from '@/lib/security/private-route-redaction'

const STORAGE_KEY = 'jy_cookie_consent_v1'
const CONSENT_EVENT = 'jy:consent-updated'

type TelemetryEvent = { url: string; route?: string }
type ConsentState = { analytics: boolean; marketing: boolean }
type TelemetryProps = {
  gaMeasurementId?: string
  metaPixelId?: string
}

const NO_CONSENT: ConsentState = { analytics: false, marketing: false }

function suppressPrivateRoute<T extends TelemetryEvent>(event: T): T | null {
  if (isPrivateConsultationUrl(event.url)) return null
  if (event.route && isPrivateConsultationUrl(event.route)) return null
  return event
}

function normalizeConsent(value: unknown): ConsentState {
  if (!value || typeof value !== 'object') return NO_CONSENT
  const candidate = value as Partial<ConsentState>
  return {
    analytics: candidate.analytics === true,
    marketing: candidate.marketing === true,
  }
}

function readStoredConsent(): ConsentState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? normalizeConsent(JSON.parse(stored)) : NO_CONSENT
  } catch {
    return NO_CONSENT
  }
}

/**
 * Third-party telemetry is intentionally client-only. Server rendering and the
 * first hydration pass emit no Google, Meta, or Vercel request surface. A
 * private consultation path always fails closed, even after an SPA navigation.
 */
export default function PrivacySafeVercelTelemetry({
  gaMeasurementId,
  metaPixelId,
}: TelemetryProps) {
  const pathname = usePathname()
  const [consent, setConsent] = useState<ConsentState>(NO_CONSENT)

  useEffect(() => {
    const syncStoredConsent = () => setConsent(readStoredConsent())
    const syncConsentEvent = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      setConsent(detail ? normalizeConsent(detail) : readStoredConsent())
    }

    syncStoredConsent()
    window.addEventListener(CONSENT_EVENT, syncConsentEvent)
    window.addEventListener('storage', syncStoredConsent)
    return () => {
      window.removeEventListener(CONSENT_EVENT, syncConsentEvent)
      window.removeEventListener('storage', syncStoredConsent)
    }
  }, [])

  useEffect(() => {
    if (!pathname || !isPrivateConsultationUrl(pathname)) return

    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq
    fbq?.('consent', 'revoke')
  }, [pathname])

  if (!pathname || isPrivateConsultationUrl(pathname)) return null

  const gaId = gaMeasurementId ? JSON.stringify(gaMeasurementId) : null
  const metaId = metaPixelId ? JSON.stringify(metaPixelId) : null

  return (
    <>
      {consent.analytics && (
        <>
          <Analytics beforeSend={suppressPrivateRoute} />
          <SpeedInsights beforeSend={suppressPrivateRoute} />
          {gaMeasurementId && gaId && (
            <>
              <Script
                id="jy-ga-consented-bootstrap"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                  __html: `
                    window.dataLayer = window.dataLayer || [];
                    window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};
                    window.gtag('consent', 'default', {
                      analytics_storage: 'granted',
                      ad_storage: ${consent.marketing ? "'granted'" : "'denied'"},
                      ad_user_data: ${consent.marketing ? "'granted'" : "'denied'"},
                      ad_personalization: ${consent.marketing ? "'granted'" : "'denied'"},
                      functionality_storage: 'granted',
                      security_storage: 'granted'
                    });
                    window.gtag('js', new Date());
                    window.gtag('config', ${gaId}, { page_path: window.location.pathname });
                  `,
                }}
              />
              <Script
                id="jy-ga-consented-loader"
                src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`}
                strategy="afterInteractive"
              />
            </>
          )}
        </>
      )}

      {consent.marketing && metaPixelId && metaId && (
        <Script
          id="jy-meta-consented-loader"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s){
                if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
                s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
              }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
              window.fbq('consent', 'grant');
              window.fbq('init', ${metaId});
              window.fbq('track', 'PageView');
            `,
          }}
        />
      )}
    </>
  )
}
