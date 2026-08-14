'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PurchaseNoticeModal from '@/components/PurchaseNoticeModal'

interface PricingButtonProps {
  code: string
  popular?: boolean
  seasonal?: boolean
  locked?: boolean
}

export default function PricingButton({ code, popular, seasonal, locked }: PricingButtonProps) {
  // v5.10.482 付款漏斗修:三態 auth('checking' 起始)取代布林 false 起始。
  // 舊版 loggedIn 初始 false + getUser() 非同步 → 頁面載入後數秒內點擊、
  // 已登入客戶被當訪客丟去 /auth/login(且無 redirect 參數、登入後落 dashboard)
  // = 2026-08-14 老闆實測「點付款跳不到付款頁面」的根因。
  const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>('checking')
  const [authWaiting, setAuthWaiting] = useState(false)
  const [showNotice, setShowNotice] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setAuthState(data.user ? 'in' : 'out') })
      .catch(() => { if (alive) setAuthState('out') })
    return () => { alive = false }
  }, [])

  const handleClick = async () => {
    if (seasonal) return
    if (authWaiting) return  // 等待判定期間吞連點、防重複打 auth API
    let state = authState
    if (state === 'checking') {
      // 點擊時 auth 尚未判定 → 當場等判定完成、不搶跑誤導去登入頁
      setAuthWaiting(true)
      try {
        const { data } = await supabase.auth.getUser()
        state = data.user ? 'in' : 'out'
      } catch {
        state = 'out'
      }
      setAuthState(state)
      setAuthWaiting(false)
    }
    if (state === 'out') {
      // 隱私模式/WebView 可能禁 storage、失敗也必須照常導去登入頁
      try { sessionStorage.setItem('pending_plan', code) } catch { /* storage 被拒不擋導航 */ }
      // 帶 redirect:登入完成直接回到該方案結帳頁、購買意圖不再蒸發
      window.location.href = `/auth/login?redirect=${encodeURIComponent(`/checkout?plan=${code}`)}`
      return
    }
    // 已登入：先顯示購買須知 Modal
    setShowNotice(true)
  }

  const goToCheckout = () => {
    setShowNotice(false)
    window.location.href = `/checkout?plan=${code}`
  }

  const CTA_LABELS: Record<string, string> = {
    C: '開始我的人生藍圖',
    D: '問出心裡的問題',
    G15: '為家庭做一次命格體檢',
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

  return (
    <>
      <button
        onClick={handleClick}
        disabled={seasonal || authWaiting}
        aria-busy={authWaiting}
        className={`w-full text-center min-h-[44px] py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
          popular ? 'bg-gold text-dark btn-glow' :
          seasonal ? 'bg-white/5 text-text-muted/40 cursor-not-allowed' :
          locked ? 'glass text-gold hover:bg-gold/10' :
          'glass text-cream hover:bg-white/10'
        }`}
      >
        {label}
      </button>
      {showNotice && (
        <PurchaseNoticeModal
          planCode={code as 'E1' | 'E2' | 'E3' | 'E4' | 'C' | 'D' | 'G15' | 'R'}
          onConfirm={goToCheckout}
          onCancel={() => setShowNotice(false)}
        />
      )}
    </>
  )
}
