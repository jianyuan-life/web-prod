'use client'

/**
 * v5.10.395 Warm Light Theme v1.1 — Classical Quote component
 *
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §8.2
 *
 * 4 LLM 共識(Round 1+2+3 全票)：
 *   L2 IA Round 1 P0-5:古籍永遠繁中對簡中讀者斷裂 — 必加白話譯文
 *   L3 Qwen Round 1 P0-1:台港陸三地古籍接受度差異 — 雙軌渲染
 *   L4 Gemini Round 3 P1:無
 *
 * 行為:
 *   - 預設繁中渲染原文(語意 lang="zh-Hant"、權威性保留)
 *   - zh-Hans locale 時、`<details>` 折疊白話譯文
 *   - 古籍字體:Source Han Serif TC + .classical class
 *
 * 使用:
 *   <ClassicalQuote
 *     textHant="五行不戾、八字不偏"
 *     source="《滴天髓》卷一"
 *     vernacular="五行平衡無偏頗、八字格局中正不傾。"
 *   />
 */

import { useEffect, useState } from 'react'

export interface ClassicalQuoteProps {
  /** 繁中原文(權威版、永遠存在)*/
  textHant: string
  /** 簡中譯文(可選、OpenCC 自動轉、人工校對)*/
  textHans?: string
  /** 出處(如「《滴天髓》卷一」)*/
  source: string
  /** 白話翻譯(zh-Hans 用戶折疊顯示;若無則不顯示展開區)*/
  vernacular?: string
  /** 對齊既有 LocaleContent 機制:可由 props 傳入 locale、不傳則自動偵測 */
  locale?: 'zh-Hant' | 'zh-Hans' | 'en'
}

export function ClassicalQuote({
  textHant,
  textHans,
  source,
  vernacular,
  locale: localeProp,
}: ClassicalQuoteProps) {
  const [locale, setLocale] = useState<'zh-Hant' | 'zh-Hans' | 'en'>('zh-Hant')

  useEffect(() => {
    if (localeProp) {
      setLocale(localeProp)
      return
    }
    // 自動偵測:讀 <html lang> 或 localStorage(對齊既有 LocaleContent)
    if (typeof document === 'undefined') return
    const htmlLang = document.documentElement.lang
    if (htmlLang === 'zh-CN' || htmlLang === 'zh-Hans') setLocale('zh-Hans')
    else if (htmlLang === 'en') setLocale('en')
    else setLocale('zh-Hant')
  }, [localeProp])

  // zh-Hans 主介面:顯示簡中譯文(若有)、否則仍顯繁中(權威)
  const displayText = locale === 'zh-Hans' && textHans ? textHans : textHant

  return (
    <blockquote className="classical" lang="zh-Hant">
      <p>{displayText}</p>
      <cite className="block mt-2 text-sm text-text-muted not-italic">— {source}</cite>

      {/* 簡中用戶看到白話譯文折疊(L2 P0-5 修)*/}
      {locale === 'zh-Hans' && vernacular && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-gold-700 hover:text-vermillion-500 transition-colors select-none">
            白話譯文
          </summary>
          <p className="mt-2 pl-4 border-l border-line text-text-secondary not-italic" style={{ fontStyle: 'normal' }}>
            {vernacular}
          </p>
        </details>
      )}
    </blockquote>
  )
}
