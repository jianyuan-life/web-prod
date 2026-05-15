'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { reportClientFailure } from '@/lib/security/client-audit'
import { internalPost } from '@/lib/api'  // T10b v5.10.375(timeout + 429 handling)

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
        // T10b v5.10.375 — internalPost 統一處理(timeout + 429 throw → 下次 OAuth 再 retry)
        await internalPost('/api/referral/register', {
          referralCode: pendingCode,
          userId: user.id,
          email: user.email,
        })
        // 成功或冪等成功、清除 localStorage
        localStorage.removeItem('pending_referral_code')
      } catch (e) {
        // T11 v5.10.360:仍下次重試、加 audit 上報(含 RateLimitError、預期會 retry、降為 info)
        reportClientFailure('referral_register_pending', e, {
          severity: 'info',
        })
      }
    }

    handlePendingReferral()
  }, [])

  return null
}
