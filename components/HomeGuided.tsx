'use client'

/**
 * v5.10.419 UI 重構 Phase 3 — 首頁區塊引導進場(flag: NEXT_PUBLIC_FF_HOME_GUIDED、default off)
 *
 * 復用 Phase 1 的 .rv/.rv-in CSS 機制(globals.css、html[data-motion="on"] 閘):
 * - 觀察首頁 main 直屬 <section> 區塊(跳過 hero=第一個與已在視窗內的、避免進頁閃動)
 * - 進視窗 → .rv-in(260ms transform+opacity、零 CLS、reduced-motion 自動全關)
 * - 教訓:選擇器選「有實際高度的真區塊」(height>80 過濾、防 sentinel/空容器)
 */
import { useEffect } from 'react'

export default function HomeGuided() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FF_HOME_GUIDED !== 'true') return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    document.documentElement.setAttribute('data-motion', 'on')
    const blocks = [...document.querySelectorAll<HTMLElement>('main > section, main > div > section')]
      .filter((el, i) => i > 0 && el.getBoundingClientRect().height > 80)
    if (blocks.length === 0) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).classList.add('rv-in')
          io.unobserve(e.target)
        }
      },
      // v5.10.422 同 ReportMotion:threshold 0 + 預觸發帶 + 滾動安全網(快滾零卡死)
      { rootMargin: '300px 0px 300px 0px', threshold: 0 }
    )
    for (const s of blocks) {
      if (s.getBoundingClientRect().top < window.innerHeight * 0.95) continue
      s.classList.add('rv')
      io.observe(s)
    }
    let sweepTimer: ReturnType<typeof setTimeout> | null = null
    const sweep = () => {
      if (sweepTimer) return
      sweepTimer = setTimeout(() => {
        sweepTimer = null
        for (const el of document.querySelectorAll<HTMLElement>('.rv:not(.rv-in)')) {
          const r = el.getBoundingClientRect()
          if (r.top < window.innerHeight * 1.1) { el.classList.add('rv-in'); io.unobserve(el) }
        }
      }, 150)
    }
    window.addEventListener('scroll', sweep, { passive: true })
    return () => {
      window.removeEventListener('scroll', sweep)
      if (sweepTimer) clearTimeout(sweepTimer)
      io.disconnect()
      document.documentElement.removeAttribute('data-motion')
    }
  }, [])

  return null
}
