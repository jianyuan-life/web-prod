'use client'

/**
 * v5.10.395 Warm Light Theme v1.1 — Footer 完整 settings(三選 + 語言)
 *
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.3 Footer 路徑
 * 4 LLM 共識:
 *   L2 IA Round 1 P0-2:三選認知過載 → mobile 同三選器但每按鈕加文字 label
 *   L1 QA Round 3 P1-3:GA event 規格(§11.4)
 *   L4 Gemini Round 3 P1:a11y role + aria-pressed
 *
 * UI:
 *   - 三選器(淺 / 自動 / 深),每按鈕 icon + 中文兩字 label
 *   - 語言切換放右側(LocaleSwitcher 既有元件)
 *   - a11y: role=radiogroup + aria-pressed
 */

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import LocaleSwitcher from './LocaleSwitcher'

type ThemeOption = 'light' | 'system' | 'dark'

const OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '暖白', icon: Sun },
  { value: 'system', label: '自動', icon: Monitor },
  { value: 'dark', label: '深色', icon: Moon },
]

export function ThemeLanguageSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <section
      aria-label="外觀與語言設定"
      className="border-t border-line/40 mt-8 pt-6 pb-2"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto px-4">
        {/* 主題切換 */}
        <fieldset>
          <legend className="text-[11px] uppercase tracking-[0.24em] text-text-muted mb-2">
            主題
          </legend>
          <div
            role="radiogroup"
            aria-label="主題選擇"
            className="inline-flex gap-1 rounded-full bg-bg-card/60 p-1 border border-line"
          >
            {OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = mounted && theme === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${label}主題`}
                  onClick={() => {
                    setTheme(value)
                    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
                      ;(window as any).gtag('event', 'theme_selected', {
                        event_category: 'preference',
                        theme_value: value,
                        previous_theme: theme,
                        is_first_visit: false,
                        source_location: 'footer',
                      })
                    }
                  }}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors',
                    active
                      ? 'bg-vermillion-500/15 text-vermillion-700 dark:bg-gold-500/20 dark:text-gold-300'
                      : 'text-text-muted hover:text-text-primary',
                  ].join(' ')}
                >
                  <Icon size={14} aria-hidden />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* 語言切換(沿用既有 LocaleSwitcher)*/}
        <fieldset>
          <legend className="text-[11px] uppercase tracking-[0.24em] text-text-muted mb-2">
            語言
          </legend>
          <div className="inline-flex">
            <LocaleSwitcher />
          </div>
        </fieldset>
      </div>
    </section>
  )
}
