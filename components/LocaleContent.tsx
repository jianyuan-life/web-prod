'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getLocale, toSimplified } from '@/lib/i18n'
import { translateToEn } from '@/lib/i18n-en'

// 儲存 placeholder/title/alt 等屬性的原始值
const CONVERTIBLE_ATTRS = ['placeholder', 'title', 'alt', 'aria-label'] as const

// 英文模式時，單一 text-node 原文轉英文（命中字典才轉，否則保留中文）
// dev 環境下對未命中項目 console.warn 一次，方便補齊字典
const warnedMiss = new Set<string>()
function convertToEn(original: string): string {
  const en = translateToEn(original)
  if (en !== null) return en
  // 只對「含中文字元 + 至少 2 字」的字串警告，避免把標點/數字刷屏
  if (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    /[一-鿿]{2,}/.test(original) &&
    !warnedMiss.has(original.trim())
  ) {
    warnedMiss.add(original.trim())
    // eslint-disable-next-line no-console
    console.warn('[i18n-en] missing key:', JSON.stringify(original.trim()))
  }
  return original
}

export default function LocaleContent({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const originalTexts = useRef(new Map<Node, string>())
  const originalAttrs = useRef(new Map<string, string>())

  // 儲存原始繁體文字，轉換時用
  // Bug #14 防護：所有 node 操作前先確認仍掛在 document 上（避免 React reconciliation
  // 期間訪問已 detached 的 node 造成 $RS parentNode null 錯誤）
  const saveOriginal = useCallback((node: Node) => {
    if (!node || !node.isConnected) return
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      if (!originalTexts.current.has(node)) {
        originalTexts.current.set(node, node.textContent)
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const tag = el.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return

      // 儲存可轉換屬性的原始值
      for (const attr of CONVERTIBLE_ATTRS) {
        const val = el.getAttribute(attr)
        if (val) {
          if (!el.hasAttribute('data-__lcid')) {
            const id = `lc_${originalAttrs.current.size}`
            ;(el as HTMLElement).dataset.__lcid = id
          }
          const stableKey = `${(el as HTMLElement).dataset.__lcid}:${attr}`
          if (!originalAttrs.current.has(stableKey)) {
            originalAttrs.current.set(stableKey, val)
          }
        }
      }

      // 不遍歷 INPUT/TEXTAREA/SELECT 的子節點，但仍處理其屬性
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      node.childNodes.forEach(child => saveOriginal(child))
    }
  }, [])

  const convertAll = useCallback((locale: string) => {
    if (!ref.current || !ref.current.isConnected) return

    // 保存原始文字
    saveOriginal(ref.current)

    const isCN = locale === 'zh-CN'
    const isEN = locale === 'en'

    const transform = (original: string): string => {
      if (isEN) return convertToEn(original)
      if (isCN) return toSimplified(original)
      return original
    }

    function convertNode(node: Node) {
      // Bug #14 防護：node 已被 React detach 時略過
      if (!node || !node.isConnected) return
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        const original = originalTexts.current.get(node) || node.textContent
        node.textContent = transform(original)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        const tag = el.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE') return

        // 轉換屬性（placeholder/title/alt 等）
        const lcid = (el as HTMLElement).dataset.__lcid
        if (lcid) {
          for (const attr of CONVERTIBLE_ATTRS) {
            const key = `${lcid}:${attr}`
            const original = originalAttrs.current.get(key)
            if (original !== undefined) {
              el.setAttribute(attr, transform(original))
            }
          }
        }

        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        node.childNodes.forEach(child => convertNode(child))
      }
    }

    convertNode(ref.current)

    // 切換字體 class + <html lang>
    const html = document.documentElement
    html.classList.remove('locale-cn', 'locale-en')
    if (isCN) {
      html.classList.add('locale-cn')
      html.setAttribute('lang', 'zh-CN')
    } else if (isEN) {
      html.classList.add('locale-en')
      html.setAttribute('lang', 'en')
    } else {
      html.setAttribute('lang', 'zh-TW')
    }
  }, [saveOriginal])

  useEffect(() => {
    // 初次載入時轉換
    const locale = getLocale()
    if (locale === 'zh-CN' || locale === 'en') {
      setTimeout(() => convertAll(locale), 100)
    }

    // 監聽語言切換事件（不 reload）
    const handler = (e: Event) => {
      const locale = (e as CustomEvent).detail
      convertAll(locale)
    }
    window.addEventListener('locale-change', handler)

    // 監聽動態內容（AI 生成等）
    // Bug #14：使用 debounce + isConnected 守衛，避免在 React reconciliation 期間修改 DOM
    //   造成 parentNode=null 的 $RS 崩潰（重複 11 次）
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      const locale = getLocale()
      if (locale !== 'zh-CN' && locale !== 'en') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!ref.current || !ref.current.isConnected) return
        saveOriginal(ref.current)
        convertAll(locale)
      }, 150)
    })
    if (ref.current) {
      observer.observe(ref.current, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener('locale-change', handler)
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [convertAll, saveOriginal])

  return <div ref={ref}>{children}</div>
}
