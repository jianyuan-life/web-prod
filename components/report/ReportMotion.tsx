'use client'

/**
 * v5.10.416 UI 重構 Phase 1 — 報告章節進場動效驅動器(ui-ux-pro-max skill 規範)
 *
 * 行為:
 * - flag:NEXT_PUBLIC_FF_REPORT_MOTION === 'true' 才啟用(default off、現有客戶零影響)
 * - 啟用時 html 加 data-motion="on"、對 main 內各章節 section[id^="sec-"] 掛 .rv、
 *   IntersectionObserver 進視窗時加 .rv-in(觸發 globals.css transform/opacity 過場)
 * - stagger:同批進視窗的章節依序 +40ms(skill §7 stagger-sequence 30-50ms)
 * - 零 CLS:動畫只用 transform/opacity(skill §7 layout-shift-avoid);
 *   未啟用/reduced-motion 時不掛 class、與現狀 100% 相同
 * - 防呆:只觀察一次(進場後 unobserve)、SPA 卸載時 disconnect
 */
import { useEffect } from 'react'

export default function ReportMotion() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FF_REPORT_MOTION !== 'true') return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    document.documentElement.setAttribute('data-motion', 'on')
    // v2:選真章節容器(.section-card = CollapsibleSection 外層;.glass[id^=sec-] = 出門訣卡)。
    // 不可用裸 [id^=sec-]:歷次 dead-anchor 修補的零尺寸 sentinel span 也叫 sec-*、
    // threshold>0 的 IO 對零面積元素永不觸發 → .rv 掛上後永遠 opacity:0(dev 實測 39 個全隱形)。
    const sections = [...document.querySelectorAll<HTMLElement>('main .section-card, main .glass[id^="sec-"]')]
      .filter((el) => el.getBoundingClientRect().height > 40)
    if (sections.length === 0) return

    let batchIdx = 0
    let batchTime = 0
    const io = new IntersectionObserver(
      (entries) => {
        const now = performance.now()
        // 同一幀批次重置 stagger 計數(skill:stagger 只對「同批出現」的元素)
        if (now - batchTime > 120) batchIdx = 0
        batchTime = now
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          el.style.setProperty('--rv-delay', `${Math.min(batchIdx, 4) * 40}ms`)
          el.classList.add('rv-in')
          batchIdx++
          io.unobserve(el)
        }
      },
      // v5.10.422:threshold 0 + 預觸發帶(production 快滾實測 11 章卡死隱形 — 快速滾動
      // 元素可在兩幀間整個跳過視窗、threshold>0 永不滿足)
      { rootMargin: '300px 0px 300px 0px', threshold: 0 }
    )
    for (const s of sections) {
      // 已在首屏可視範圍的不做動效(避免進頁閃動、skill §7 no-blocking)
      const r = s.getBoundingClientRect()
      if (r.top < window.innerHeight * 0.9) continue
      s.classList.add('rv')
      io.observe(s)
    }
    // v5.10.422 安全網:scroll 後掃描「已在/曾過視窗上方」但沒進場的 .rv、強制顯示。
    // 雙保險、保證任何滾速下零卡死隱形(客戶級不可接受風險)。
    let sweepTimer: ReturnType<typeof setTimeout> | null = null
    const sweep = () => {
      if (sweepTimer) return
      sweepTimer = setTimeout(() => {
        sweepTimer = null
        for (const el of document.querySelectorAll<HTMLElement>('.rv:not(.rv-in)')) {
          const r = el.getBoundingClientRect()
          if (r.top < window.innerHeight * 1.1) {
            el.classList.add('rv-in')
            io.unobserve(el)
          }
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
