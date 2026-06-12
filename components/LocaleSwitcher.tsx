'use client'

import { getLocale, setLocale, type Locale } from '@/lib/i18n'
import { useEffect, useState } from 'react'

// 三語循環：繁 → 簡 → EN → 繁
const NEXT: Record<Locale, Locale> = {
  'zh-TW': 'zh-CN',
  'zh-CN': 'en',
  en: 'zh-TW',
}

const LABEL: Record<Locale, string> = {
  'zh-TW': '繁',
  'zh-CN': '简',
  en: 'EN',
}

const TOOLTIP: Record<Locale, string> = {
  'zh-TW': '切換為簡體中文',
  'zh-CN': 'Switch to English',
  en: 'Switch to Traditional Chinese',
}

export default function LocaleSwitcher() {
  const [locale, setLoc] = useState<Locale>('zh-TW')

  useEffect(() => {
    setLoc(getLocale())
    // 監聽切換事件更新按鈕狀態
    const handler = (e: Event) => setLoc((e as CustomEvent).detail)
    window.addEventListener('locale-change', handler)
    return () => window.removeEventListener('locale-change', handler)
  }, [])

  const toggle = () => {
    const next = NEXT[locale]
    setLoc(next)
    setLocale(next) // 不會 reload，只發事件
  }

  // 按鈕顯示「下一個語言的標籤」
  const next = NEXT[locale]

  return (
    <button
      onClick={toggle}
      // WCAG 2.5.5:命中區 ≥ 44×44(inline-flex 置中讓視覺大小不變、只擴大可點區域)
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-xs text-text-muted hover:text-gold transition-colors px-2 py-1 rounded border border-gold/10 hover:border-gold/30"
      title={TOOLTIP[locale]}
      aria-label={TOOLTIP[locale]}
    >
      {LABEL[next]}
    </button>
  )
}
