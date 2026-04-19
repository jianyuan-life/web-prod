'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getLocale, toSimplified } from '@/lib/i18n'

// 儲存 placeholder/title/alt 等屬性的原始值
const CONVERTIBLE_ATTRS = ['placeholder', 'title', 'alt', 'aria-label'] as const

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

    function convertNode(node: Node) {
      // Bug #14 防護：node 已被 React detach 時略過
      if (!node || !node.isConnected) return
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        const original = originalTexts.current.get(node) || node.textContent
        node.textContent = isCN ? toSimplified(original) : original
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
              el.setAttribute(attr, isCN ? toSimplified(original) : original)
            }
          }
        }

        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        node.childNodes.forEach(child => convertNode(child))
      }
    }

    convertNode(ref.current)

    // 切換字體 class：簡體模式用 SC 字體
    const html = document.documentElement
    if (isCN) {
      html.classList.add('locale-cn')
      html.setAttribute('lang', 'zh-CN')
    } else {
      html.classList.remove('locale-cn')
      html.setAttribute('lang', 'zh-TW')
    }
  }, [saveOriginal])

  useEffect(() => {
    // 初次載入時轉換
    const locale = getLocale()
    if (locale === 'zh-CN') {
      setTimeout(() => convertAll('zh-CN'), 100)
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
      if (locale !== 'zh-CN') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!ref.current || !ref.current.isConnected) return
        saveOriginal(ref.current)
        convertAll('zh-CN')
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
