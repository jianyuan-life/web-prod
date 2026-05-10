'use client'

// v5.6.10 Round D:GDPR / ePrivacy Cookie Consent Banner
// 對應 QA Agent P0 finding「Cookie consent 機制 0 實作 → 歐盟客戶觸發違規(罰款上限營收 4%)」
// 實作:預設 GA4 consent denied、用戶選「全部接受」或「自訂」後升級

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'jy_cookie_consent_v1'

type ConsentPrefs = {
  necessary: true // 必要 cookie 永遠 true、不可關
  analytics: boolean
  marketing: boolean
  decided_at: string
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

function applyConsent(prefs: ConsentPrefs) {
  if (typeof window === 'undefined') return

  // GA4 consent mode v2 update
  if (window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: prefs.analytics ? 'granted' : 'denied',
      ad_storage: prefs.marketing ? 'granted' : 'denied',
      ad_user_data: prefs.marketing ? 'granted' : 'denied',
      ad_personalization: prefs.marketing ? 'granted' : 'denied',
    })
  }

  // v5.6.10 (Codex L3 review fix):Meta Pixel 也 honor marketing opt-out
  // 行銷拒絕時:停用 Meta Pixel autoConfig + 撤銷 advanced matching、不再送追蹤事件
  // (Meta Pixel 一旦載入無法完全移除、但可關閉資料收集)
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq
  if (fbq) {
    if (prefs.marketing) {
      fbq('consent', 'grant')
    } else {
      fbq('consent', 'revoke')
    }
  }
}

export default function CookieConsent() {
  const [show, setShow] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  // v5.6.10 (Codex L3 review fix):自訂偏好預設關閉(對齊 GDPR「明確同意」原則)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setShow(true)
      }
    } catch {
      setShow(true)
    }
  }, [])

  function save(prefs: Omit<ConsentPrefs, 'decided_at' | 'necessary'>) {
    const full: ConsentPrefs = {
      necessary: true,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      decided_at: new Date().toISOString(),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
    } catch {
      /* localStorage blocked, 仍然 apply 本 session */
    }
    applyConsent(full)
    setShow(false)
  }

  function acceptAll() {
    save({ analytics: true, marketing: true })
  }

  function acceptNecessary() {
    save({ analytics: false, marketing: false })
  }

  function saveCustom() {
    save({ analytics, marketing })
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed bottom-0 inset-x-0 sm:bottom-4 sm:left-auto sm:right-4 sm:inset-x-auto sm:max-w-sm z-[1000] p-3 sm:p-4 bg-dark/95 backdrop-blur-xl border-t sm:border border-gold/30 sm:rounded-xl shadow-2xl max-h-[120px] sm:max-h-none overflow-y-auto sm:overflow-visible"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* v5.10.94 P0 修(MASTER_BUG_REPORT 全 6/6 件 + Jamie 截圖 N1):
          原 fixed bottom-0 inset-x-0 + p-4 sm:p-6 全寬橫條 → desktop 30% / mobile 40% viewport 永久遮閱讀
          修 desktop:右下 max-w-sm(384px)toast、不擋主閱讀區
          修 mobile:仍全寬(避太小)但 padding 縮 + 文案精簡(原 desc 2 行→1 行)
          保留 GDPR 3 選項(自訂/必要/全接受) */}
      <div>
        {!showCustom ? (
          <div className="flex flex-col gap-3">
            <div>
              <h3 id="cookie-consent-title" className="text-cream font-bold text-sm mb-1">
                🍪 Cookie 與隱私偏好
              </h3>
              <p id="cookie-desc-short" className="text-text-muted text-xs leading-relaxed">
                使用 Cookie 改善體驗、可自訂偏好。詳見{' '}
                <a href="/privacy" className="text-gold underline hover:text-gold/80">
                  隱私政策
                </a>
                。
              </p>
            </div>
            <div className="flex flex-row gap-2 shrink-0">
              <button
                onClick={() => setShowCustom(true)}
                className="px-4 py-2 text-sm rounded-lg border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
              >
                自訂偏好
              </button>
              <button
                onClick={acceptNecessary}
                className="px-4 py-2 text-sm rounded-lg border border-cream/30 text-cream hover:bg-cream/5 transition-colors"
              >
                僅必要 Cookie
              </button>
              <button
                onClick={acceptAll}
                className="px-5 py-2 text-sm rounded-lg bg-gold text-dark font-bold hover:bg-gold/90 transition-colors"
              >
                全部接受
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-cream font-bold text-base mb-3">🍪 自訂 Cookie 偏好</h3>
            <div className="space-y-3 mb-4">
              <label className="flex items-start gap-3 cursor-not-allowed opacity-70">
                <input type="checkbox" checked disabled className="mt-1" />
                <div>
                  <div className="text-cream text-sm font-medium">必要 Cookie(無法關閉)</div>
                  <div className="text-text-muted text-xs">
                    維持登入狀態、結帳流程、安全性。網站運作必須。
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <div className="text-cream text-sm font-medium">分析 Cookie(Google Analytics 4)</div>
                  <div className="text-text-muted text-xs">
                    匿名統計頁面瀏覽 / 停留時間、幫助我們改善網站體驗。
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <div className="text-cream text-sm font-medium">行銷 Cookie(Meta Pixel / 廣告)</div>
                  <div className="text-text-muted text-xs">
                    衡量廣告成效、提供相關內容。關閉不影響網站功能。
                  </div>
                </div>
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={() => setShowCustom(false)}
                className="px-4 py-2 text-sm rounded-lg border border-cream/30 text-cream hover:bg-cream/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveCustom}
                className="px-5 py-2 text-sm rounded-lg bg-gold text-dark font-bold hover:bg-gold/90 transition-colors"
              >
                儲存偏好
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
