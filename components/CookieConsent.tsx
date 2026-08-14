'use client'

// v5.6.10 Round D:GDPR / ePrivacy Cookie Consent Banner
// 對應 QA Agent P0 finding「Cookie consent 機制 0 實作 → 歐盟客戶觸發違規(罰款上限營收 4%)」
// 實作:預設 GA4 consent denied、用戶選「全部接受」或「自訂」後升級

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isConsultationReaderPath } from '@/lib/consultation/routes'
import {
  CONSENT_SETTINGS_EVENT,
  readStoredConsent,
  saveStoredConsent,
  subscribeToConsent,
  type ConsentSnapshot,
} from '@/lib/privacy/consent'

export default function CookieConsent() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [saveError, setSaveError] = useState('')
  const firstActionRef = useRef<HTMLButtonElement>(null)

  // v5.10.183 P0 修(4 plans desktop UI Vision audit 共通發現):
  // Cookie 彈窗在 report 閱讀頁右下角擋住 CTA「分享報告」+ 章節 cue + 五行進度條
  // v5.10.186 修(Codex GDPR finding):不能在 /report hide(GA4+Meta Pixel 仍 set cookie、違 GDPR)
  // 改:report 頁仍顯示、但 toast 移到頂部 max-w-sm、不擋下方 reading area
  const isConsultationReport = isConsultationReaderPath(pathname)
  const isPrivateChrome = pathname?.startsWith('/report/')
    || pathname?.startsWith('/r/')
    || isConsultationReport
    || pathname?.startsWith('/dashboard')
    || pathname?.startsWith('/jamie')
  const isFormFlow = pathname?.startsWith('/auth/')
    || pathname?.startsWith('/checkout')
  // v5.6.10 (Codex L3 review fix):自訂偏好預設關閉(對齊 GDPR「明確同意」原則)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    const hydrate = (stored: ConsentSnapshot) => {
      setAnalytics(stored.analytics)
      setMarketing(stored.marketing)
      if (!stored.decided) setShow(true)
    }
    const openSettings = () => {
      const stored = readStoredConsent()
      hydrate(stored)
      setSaveError('')
      setShowCustom(true)
      setShow(true)
    }

    hydrate(readStoredConsent())
    const unsubscribe = subscribeToConsent(hydrate)
    window.addEventListener(CONSENT_SETTINGS_EVENT, openSettings)
    return () => {
      unsubscribe()
      window.removeEventListener(CONSENT_SETTINGS_EVENT, openSettings)
    }
  }, [])

  useEffect(() => {
    if (!show) return
    const frame = window.requestAnimationFrame(() => firstActionRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [show, showCustom])

  function save(prefs: { analytics: boolean; marketing: boolean }) {
    const persisted = saveStoredConsent(prefs)
    if (
      !persisted.decided
      || persisted.analytics !== prefs.analytics
      || persisted.marketing !== prefs.marketing
    ) {
      setAnalytics(persisted.analytics)
      setMarketing(persisted.marketing)
      setSaveError('偏好未能儲存，現有設定保持不變。')
      setShow(true)
      setShowCustom(true)
      return
    }

    setSaveError('')
    setShow(false)
    setShowCustom(false)
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

  // Mobile 使用有高度上限的 bottom sheet，不參與文流、不把 hero 主動作推出首屏。
  // Desktop 保留原本的右上／右下非模態 toast，表單流程仍使用文流卡片。
  const positionClass = isConsultationReport
    ? 'jy-cookie--consultation'
    : isFormFlow
    ? 'jy-cookie--flow'
    : isPrivateChrome
      ? 'jy-cookie--top'
      : 'jy-cookie--bottom'

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-desc-short"
      data-view={showCustom ? 'custom' : 'compact'}
      className={`jy-cookie ${positionClass}`}
    >
      <div>
        {!showCustom ? (
          <div className="jy-cookie__compact">
            <div>
              <p id="cookie-consent-title" className="jy-cookie__title">
                Cookie 與隱私偏好
              </p>
              <p id="cookie-desc-short" className="jy-cookie__copy">
                必要 Cookie 維持登入與結帳；分析與行銷 Cookie 由你決定。詳見 <a href="/privacy">隱私政策</a>。
              </p>
            </div>
            <div className="jy-cookie__actions">
              <button
                ref={firstActionRef}
                onClick={() => setShowCustom(true)}
                className="jy-cookie__button jy-cookie__button--quiet"
              >
                自訂偏好
              </button>
              <button
                onClick={acceptNecessary}
                className="jy-cookie__button jy-cookie__button--quiet"
              >
                僅使用必要項目
              </button>
              <button
                onClick={acceptAll}
                className="jy-cookie__button jy-cookie__button--primary"
              >
                全部接受
              </button>
            </div>
          </div>
        ) : (
          <div className="jy-cookie__custom">
            <p id="cookie-consent-title" className="jy-cookie__title">自訂 Cookie 偏好</p>
            <p id="cookie-desc-short" className="jy-cookie__copy">非必要項目預設關閉；可隨時在隱私設定重新選擇。</p>
            <div className="jy-cookie__choices">
              <label className="jy-cookie__choice jy-cookie__choice--disabled">
                <input type="checkbox" checked disabled className="mt-1" />
                <div>
                  <strong>必要 Cookie（無法關閉）</strong>
                  <span>
                    維持登入狀態、結帳流程、安全性。網站運作必須。
                  </span>
                </div>
              </label>
              <label className="jy-cookie__choice">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <strong>分析 Cookie（Google Analytics 4）</strong>
                  <span>匿名統計頁面瀏覽與停留時間，幫助改善網站體驗。</span>
                </div>
              </label>
              <label className="jy-cookie__choice">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <strong>行銷 Cookie（Meta Pixel／廣告）</strong>
                  <span>衡量廣告成效。關閉不影響網站功能。</span>
                </div>
              </label>
            </div>
            <div className="jy-cookie__custom-actions">
              <button
                ref={firstActionRef}
                onClick={() => setShowCustom(false)}
                className="jy-cookie__button jy-cookie__button--quiet"
              >
                取消
              </button>
              <button
                onClick={saveCustom}
                className="jy-cookie__button jy-cookie__button--primary"
              >
                儲存偏好
              </button>
            </div>
            {saveError && (
              <p className="jy-cookie__copy" role="status" aria-live="polite">{saveError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
