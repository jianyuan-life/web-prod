'use client'

/**
 * v5.10.395 Warm Light Theme v1.1 — 首訪 inline banner
 *
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.1
 * 4 LLM 共識(L4 Gemini Round 2 P0-3 首屏分裂風險解):
 *   - defaultTheme="system" + 首訪 banner 主動引導 Warm Light(對齊 Jamie 5/16 暖色指示)
 *   - 解 system OR localStorage OR brand 三輸入導致首訪外觀隨機
 *   - L2 IA Round 3 P1:OS=light 用戶看到暖底時、文案分支
 *
 * 顯示條件:
 *   - 沒 localStorage 'theme' key(首訪)
 *   - 沒 localStorage 'dismiss-warm-banner' key
 *   - FF_WARM_LIGHT_THEME 啟用
 *
 * a11y:
 *   - role=region
 *   - aria-label
 *   - dismissible 鍵盤可操作
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { Sun, X } from 'lucide-react'

const DISMISS_KEY = 'jy_warm_banner_dismissed_v1'

export function FirstVisitWarmBanner() {
  const { resolvedTheme, setTheme } = useTheme()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  // v5.10.408:/report/* forcedTheme=dark(報告 light 適配未完成)、此 banner 在報告頁
  // 宣傳「暖白閱讀主題」與實際深色閱讀區矛盾、且點切換對閱讀區無效 → 報告頁不顯示。
  const onReport = pathname?.startsWith('/report/') ?? false

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    // v5.10.408(L1 QA P2-1 + L3 Codex P3 雙家):報告頁 banner 不渲染、effect 也不可
    // 發 warm_banner_shown(否則 GA 記到從未顯示的 impression、且 dismiss 狀態錯亂)。
    // onReport 來自 usePathname、首載固定、不需進 deps。
    if (onReport) return
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY)
      const themeSet = window.localStorage.getItem('theme')
      // 首訪 = 沒 theme key + 沒 dismiss
      if (!dismissed && !themeSet) {
        setVisible(true)
        // GA event:banner shown
        const osPrefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        if (typeof (window as any).gtag === 'function') {
          ;(window as any).gtag('event', 'warm_banner_shown', {
            event_category: 'engagement',
            os_prefers: osPrefers,
          })
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  const dismiss = (action: 'switch_light' | 'switch_dark' | 'dismiss') => {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      ;(window as any).gtag('event', 'warm_banner_action', {
        event_category: 'engagement',
        action,
      })
    }
  }

  if (!mounted || !visible || onReport) return null

  const isLight = resolvedTheme === 'light'

  return (
    <div
      role="region"
      aria-label="主題體驗推薦"
      className="fixed top-16 inset-x-0 z-40 mx-auto max-w-3xl px-4 animate-[onboarding-fade-in_0.35s_ease-out]"
    >
      <div className="rounded-xl bg-bg-card/95 backdrop-blur-md border border-vermillion-500/30 shadow-lg px-4 py-3 flex items-center gap-3">
        <Sun size={18} className="text-vermillion-500 shrink-0" aria-hidden />
        <p className="text-sm text-text-primary flex-1">
          {isLight ? (
            <>
              <span className="font-medium">✨ 您正在體驗鑒源全新「暖白閱讀主題」</span>
              <span className="text-text-secondary"> · 亦可隨時切換深邃宇宙模式</span>
            </>
          ) : (
            <>
              <span className="font-medium">✨ 鑒源推出「暖白閱讀主題」</span>
              <span className="text-text-secondary"> · 歡迎切換體驗</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {isLight ? (
            <button
              type="button"
              onClick={() => {
                setTheme('dark')
                dismiss('switch_dark')
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-bg-card-hi text-text-primary hover:bg-bg-card transition-colors"
            >
              體驗深色
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTheme('light')
                dismiss('switch_light')
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-vermillion-500 text-text-on-gold hover:bg-vermillion-700 transition-colors"
            >
              切換暖白
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss('dismiss')}
            aria-label="關閉提示"
            className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-card-hi transition-colors"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
