'use client'

import { useEffect } from 'react'

/**
 * 目錄 Scrollspy — 滾動時高亮目前可見章節在目錄中對應連結
 *
 * 工作原理：
 * 1. 用 IntersectionObserver 觀察所有 `[id^="sec-"]` 章節區塊
 * 2. 當某章節進入視口中央時，在對應的目錄連結上加 `data-active="true"`
 * 3. 對應 CSS：`.toc-link[data-active="true"]` 顯示金色左邊框 + 粗體 + 金色文字
 *
 * 不依賴 scroll event（效能更好，被動觀察）
 */
export default function ScrollSpy() {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.toc-link[href^="#sec-"]'))
    if (!links.length) return

    const byHash = new Map<string, HTMLAnchorElement>()
    links.forEach(a => {
      const h = a.getAttribute('href') || ''
      if (h) byHash.set(h.replace(/^#/, ''), a)
    })

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[id^="sec-"]'))
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        // 找到所有「交集」的章節，取最靠近視口頂端的那個
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (!visible.length) return

        const topId = visible[0].target.id
        // 清除所有 active
        links.forEach(a => a.removeAttribute('data-active'))
        // 設置目前章節
        const activeLink = byHash.get(topId)
        if (activeLink) activeLink.setAttribute('data-active', 'true')
      },
      {
        // 中央 40% 視口觀察
        rootMargin: '-30% 0px -50% 0px',
        threshold: 0.01,
      }
    )

    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  return null
}
