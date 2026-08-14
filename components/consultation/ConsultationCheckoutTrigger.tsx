'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

import { buildCheckoutRoute } from '@/lib/consultation/routes'
import { CONSULTATION_AUTH_TIMEOUT_MS, withClientTimeout } from '@/lib/checkout/client-timeout'
import { supabase } from '@/lib/supabase'
import ConsultationPurchaseNoticeModal from './ConsultationPurchaseNoticeModal'

type ConsultationCheckoutTriggerProps = {
  planCode: 'C' | 'G15'
  children: ReactNode
  className?: string
  ariaLabel?: string
}

export default function ConsultationCheckoutTrigger({
  planCode,
  children,
  className,
  ariaLabel,
}: ConsultationCheckoutTriggerProps) {
  const [showNotice, setShowNotice] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [navigationError, setNavigationError] = useState('')

  const continueToCheckout = async () => {
    if (continuing) return
    setContinuing(true)
    setNavigationError('')

    try {
      const checkoutRoute = buildCheckoutRoute(planCode)
      const { data, error } = await withClientTimeout(
        supabase.auth.getUser(),
        CONSULTATION_AUTH_TIMEOUT_MS,
        '登入狀態確認逾時',
      )
      if (error) throw error
      if (data.user) {
        window.location.href = checkoutRoute
        return
      }

      window.location.href = `/auth/login?redirect=${encodeURIComponent(checkoutRoute)}`
    } catch {
      setNavigationError('目前無法確認登入狀態，請檢查網路後再試。')
      setContinuing(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={ariaLabel}
        onClick={() => {
          setNavigationError('')
          setShowNotice(true)
        }}
      >
        {children}
      </button>
      {showNotice ? (
        <ConsultationPurchaseNoticeModal
          planCode={planCode}
          onConfirm={continueToCheckout}
          confirming={continuing}
          confirmError={navigationError}
          onCancel={() => {
            if (!continuing) setShowNotice(false)
          }}
        />
      ) : null}
    </>
  )
}
