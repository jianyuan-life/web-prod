'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// 處理 Google OAuth 登入後的待處理推薦碼
// 在 signup 頁面點 Google 登入前，推薦碼已存入 localStorage
// OAuth 回來後此元件讀取並寫入 referrals 表
export default function ReferralHandler() {
  useEffect(() => {
    async function handlePendingReferral() {
      const pendingCode = localStorage.getItem('pending_referral_code')
      if (!pendingCode) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      try {
        const res = await fetch('/api/referral/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referralCode: pendingCode,
            userId: user.id,
            email: user.email,
          }),
        })

        if (res.ok) {
          // 成功或冪等成功，清除 localStorage
          localStorage.removeItem('pending_referral_code')
        }
      } catch {
        // 靜默失敗，下次載入頁面時會重試
      }
    }

    handlePendingReferral()
  }, [])

  return null
}
