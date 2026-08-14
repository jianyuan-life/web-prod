'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PurchaseNoticeModal from '@/components/PurchaseNoticeModal'
import ConsultationCheckoutTrigger from '@/components/consultation/ConsultationCheckoutTrigger'
import { isConsultationCheckoutPlan } from '@/lib/checkout/consultation-presentation'

interface PricingButtonProps {
  code: string
  popular?: boolean
  seasonal?: boolean
  locked?: boolean
}

export default function PricingButton({ code, popular, seasonal, locked }: PricingButtonProps) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const consultationPlan = isConsultationCheckoutPlan(code)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user))
  }, [])

  const handleClick = () => {
    if (seasonal) return
    if (!loggedIn) {
      sessionStorage.setItem('pending_plan', code)
      window.location.href = '/auth/login'
      return
    }
    // 已登入：先顯示購買須知 Modal
    setShowNotice(true)
  }

  const goToLegacyCheckout = () => {
    setShowNotice(false)
    window.location.href = `/checkout?plan=${code}`
  }

  const CTA_LABELS: Record<string, string> = {
    C: '開始我的人生藍圖',
    D: '問出心裡的問題',
    G15: '開始整理家人的互動模式',
    R: '看看我們合不合',
    E1: '為重要時刻做準備',
    E2: '掌握這個月的好時機',
    E3: '開始月度密集補運',
    E4: '鎖定全年擇吉佈局',
  }

  // v5.4.21 P2 修(Gemini UI audit):未登入也直接寫購買導向 CTA、不再「免費註冊」誤導付費客戶
  const label = seasonal
    ? '立春前 30 天開放'
    : locked
      ? '需先有命格分析'
      : (CTA_LABELS[code] || '選擇此方案')

  const buttonClassName = `w-full text-center min-h-[44px] py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
    popular ? 'bg-gold text-dark btn-glow' :
    seasonal ? 'bg-white/5 text-text-muted/40 cursor-not-allowed' :
    locked ? 'glass text-gold hover:bg-gold/10' :
    'glass text-cream hover:bg-white/10'
  }`

  if (consultationPlan) {
    return (
      <ConsultationCheckoutTrigger
        planCode={code}
        className={buttonClassName}
        ariaLabel={`${label}，先查看購買須知`}
      >
        {label}
      </ConsultationCheckoutTrigger>
    )
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={seasonal}
        className={buttonClassName}
      >
        {label}
      </button>
      {showNotice && (
        <PurchaseNoticeModal
          planCode={code as 'E1' | 'E2' | 'E3' | 'E4' | 'D' | 'R'}
          onConfirm={goToLegacyCheckout}
          onCancel={() => setShowNotice(false)}
        />
      )}
    </>
  )
}
