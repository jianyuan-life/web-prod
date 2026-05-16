'use client'

/**
 * v5.10.395 Warm Light Theme v1.1 — NavBar 主切換 toggle(2 選 dark / light)
 *
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.3 NavBar 路徑
 * 4 LLM 共識:
 *   L2 IA + L3 Qwen Round 1 P0:Theme switcher 應 NavBar+Footer 雙路、非只 Footer
 *   L2 IA Round 1 P0-2:三選對 25-55 跨齡用戶認知過載、icon+文字 label
 *
 * UI:
 *   - Icon + 中文 label 二字(暖白 / 深色)
 *   - 桌面 mobile 同寫法、不藏進 dropdown
 *   - 完整三選器(含 system)放 Footer ThemeLanguageSettings
 *
 * a11y:
 *   - aria-label 動態描述
 *   - focus-visible 雙主題對應(rule 在 globals.css)
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggleSimple() {
  const { theme, setTheme, systemTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Hydration mismatch 防護:client 端才 render 真實狀態(避免 SSR vs client text 不對)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // SSR / pre-mount: render skeleton avoid hydration mismatch
    return (
      <button
        type="button"
        aria-label="切換主題(載入中)"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-line text-xs"
        disabled
      >
        <Sun size={14} aria-hidden />
        <span className="hidden sm:inline">主題</span>
      </button>
    )
  }

  const current = resolvedTheme === 'light' ? 'light' : 'dark'
  const next = current === 'light' ? 'dark' : 'light'
  const nextLabel = next === 'light' ? '暖白' : '深色'
  const currentIcon = current === 'light' ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next)
        // GA event(P1 §11.4)
        if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
          ;(window as any).gtag('event', 'theme_selected', {
            event_category: 'preference',
            theme_value: next,
            previous_theme: theme,
            is_first_visit: false,
            source_location: 'navbar',
            resolved_theme: next,
          })
        }
      }}
      aria-label={`切換至${nextLabel}主題`}
      title={`切換至${nextLabel}主題`}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-line hover:border-line-strong transition-colors text-xs"
    >
      {currentIcon}
      <span className="hidden sm:inline">{nextLabel}</span>
    </button>
  )
}
