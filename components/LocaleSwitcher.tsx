'use client'

import { getLocale, setLocale, type Locale } from '@/lib/i18n'
import { useEffect, useState } from 'react'

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
    const newLocale = locale === 'zh-TW' ? 'zh-CN' : 'zh-TW'
    setLoc(newLocale)
    setLocale(newLocale) // 不會 reload，只發事件
  }

  return (
    <button
      onClick={toggle}
      className="text-xs text-text-muted hover:text-gold transition-colors px-2 py-1 rounded border border-gold/10 hover:border-gold/30"
      title={locale === 'zh-TW' ? '切換為簡體中文' : '切换为繁体中文'}
      aria-label={locale === 'zh-TW' ? '切換為簡體中文' : '切換為繁體中文'}
    >
      {locale === 'zh-TW' ? '简' : '繁'}
    </button>
  )
}
