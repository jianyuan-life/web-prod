'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import LocaleSwitcher from './LocaleSwitcher'
import { ThemeToggleSimple } from './ThemeToggleSimple'
import { getLocale, UI_TEXT } from '@/lib/i18n'

export default function Navbar() {
  const pathname = usePathname()
  // v5.7.75 在 /report/* 頁面隱藏「免費註冊」按鈕(訪客已透過 access_token 取得報告 = 視為已登入感)
  const isReportPage = pathname?.startsWith('/report/')
  const [user, setUser] = useState<User | null>(null)
  const [txt, setTxt] = useState(UI_TEXT['zh-TW'])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const toolsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTxt(UI_TEXT[getLocale()])
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    // 監聽語言切換，即時更新 Navbar 文字
    const localeHandler = (e: Event) => {
      const locale = (e as CustomEvent).detail
      setTxt(UI_TEXT[locale as keyof typeof UI_TEXT] || UI_TEXT['zh-TW'])
    }
    window.addEventListener('locale-change', localeHandler)
    // 滾動陰影（P2-7）
    const scrollHandler = () => setScrolled(window.scrollY > 50)
    scrollHandler()
    window.addEventListener('scroll', scrollHandler, { passive: true })
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('locale-change', localeHandler)
      window.removeEventListener('scroll', scrollHandler)
    }
  }, [])

  // 手機選單開啟時鎖定背景捲動
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  // WCAG 2.1.1 鍵盤導航：ESC 關閉下拉選單、點擊外部關閉、Tab 離開關閉
  useEffect(() => {
    if (!toolsOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolsOpen(false)
        // 還原焦點到觸發按鈕
        const btn = toolsContainerRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        btn?.focus()
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsContainerRef.current && !toolsContainerRef.current.contains(e.target as Node)) {
        setToolsOpen(false)
      }
    }
    const handleFocusOut = (e: FocusEvent) => {
      // Tab 離開容器時關閉
      if (toolsContainerRef.current && !toolsContainerRef.current.contains(e.relatedTarget as Node)) {
        setToolsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    toolsContainerRef.current?.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
      toolsContainerRef.current?.removeEventListener('focusout', handleFocusOut)
    }
  }, [toolsOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  // v5.10.428:/jamie 後台有自己的 sidebar chrome、不渲染公開站 navbar
  // (UI 100 審查 P1:後台頂部洩漏公開 navbar = 系統介紹/登入/免費註冊 對 admin 無意義)
  if (pathname?.startsWith('/jamie') || pathname?.startsWith('/report/') || pathname?.startsWith('/r/')) return null

  return (
    <nav
      className={`jy-navbar ${scrolled ? 'jy-navbar--scrolled' : ''}`}
    >
      <div className="jy-navbar__inner">
        {/* v5.10.428 logo 品牌感升級(benchmark P2:≥40px + 寬字距 + 細線分隔修飾)*/}
        <Link href="/" className="jy-brand">
          <img src="/logo-jianyuan.png?v=14" alt="" className="jy-brand__mark" />
          <span className="flex items-baseline gap-2">
            <span className="jy-brand__name">鑒源</span>
            <span className="jy-brand__latin">JianYuan</span>
          </span>
        </Link>
        <div className="jy-navbar__links max-[820px]:hidden">
          <Link href="/#systems" className="jy-nav-link">{txt.nav_systems}</Link>
          <Link href="/pricing" className="jy-nav-link">{txt.nav_pricing}</Link>
          <Link href="/blog" className="jy-nav-link">{txt.nav_blog}</Link>
          <div
            ref={toolsContainerRef}
            className="relative"
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              type="button"
              className="jy-nav-tool"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              {...(toolsOpen ? { 'aria-controls': 'tools-menu' } : {})}
              aria-label={`${txt.nav_free}（免費工具選單）`}
              onClick={() => setToolsOpen(prev => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setToolsOpen(true)
                  // 下一幀聚焦第一個 menuitem
                  requestAnimationFrame(() => {
                    const first = toolsContainerRef.current?.querySelector<HTMLAnchorElement>('[role="menuitem"]')
                    first?.focus()
                  })
                }
              }}
            >
              {txt.nav_free}
              <span className="jy-nav-free">FREE</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {toolsOpen && (
              <div className="absolute top-full left-0 pt-1 w-48">
                <div
                  id="tools-menu"
                  role="menu"
                  aria-label="免費工具"
                  className="jy-nav-menu py-2"
                  onKeyDown={(e) => {
                    const items = Array.from(
                      toolsContainerRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []
                    )
                    const currentIndex = items.findIndex(el => el === document.activeElement)
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      const next = items[(currentIndex + 1) % items.length]
                      next?.focus()
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      const prev = items[(currentIndex - 1 + items.length) % items.length]
                      prev?.focus()
                    } else if (e.key === 'Home') {
                      e.preventDefault()
                      items[0]?.focus()
                    } else if (e.key === 'End') {
                      e.preventDefault()
                      items[items.length - 1]?.focus()
                    }
                  }}
                >
                  <Link href="/tools/bazi" role="menuitem" className="jy-nav-menu__item">八字命理速算</Link>
                  <Link href="/tools/ziwei" role="menuitem" className="jy-nav-menu__item">紫微斗數速算</Link>
                  <Link href="/tools/qimen" role="menuitem" className="jy-nav-menu__item">奇門遁甲排盤</Link>
                  <Link href="/tools/name" role="menuitem" className="jy-nav-menu__item">姓名學速算</Link>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="jy-navbar__actions">
          {/* v5.10.395 Warm Light Theme v1.1 — NavBar 主切換 toggle(FF 控制)*/}
          {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === 'true' && (
            <div className="jy-theme-desktop">
              <ThemeToggleSimple />
            </div>
          )}
          <LocaleSwitcher />
          {/* 桌面版用戶區域 */}
          <div className="jy-navbar__user max-[820px]:hidden">
            {user ? (
              <>
                <Link href="/dashboard" className="jy-nav-link">{txt.nav_my_reports}</Link>
                <button onClick={handleLogout} className="jy-nav-link">{txt.nav_logout}</button>
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-xs font-bold">
                  {(user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                </div>
              </>
            ) : isReportPage ? (
              // v5.7.75 報告頁訪客 = 已透過 token 取得、不再推銷註冊(Gemini P0「不該顯示免費註冊」修)
              <Link href="/auth/login" className="jy-nav-link">{txt.nav_login}</Link>
            ) : (
              <>
                <Link href="/auth/login" className="jy-nav-link">{txt.nav_login}</Link>
                <Link href="/auth/signup" className="jy-button jy-button--primary min-h-10 px-4 py-2 text-sm">
                  {txt.nav_signup}
                </Link>
              </>
            )}
          </div>
          {/* 手機漢堡選單按鈕 */}
          <button
            className="jy-nav-icon min-[821px]:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? '關閉選單' : '開啟選單'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileMenuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* 手機版 backdrop（點擊關閉選單）— P1-9 */}
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="關閉選單"
          className="jy-mobile-backdrop min-[821px]:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 手機版展開選單 */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          role="menu"
          className="jy-mobile-menu min-[821px]:hidden"
        >
          <div className="jy-mobile-menu__group">
            <Link href="/#systems" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">{txt.nav_systems}</Link>
            <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">{txt.nav_pricing}</Link>
            <Link href="/blog" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">{txt.nav_blog}</Link>
          </div>
          <div className="jy-mobile-menu__group">
            <p className="text-xs text-gold/60 mb-2">{txt.nav_free}</p>
            <Link href="/tools/bazi" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">八字命理速算</Link>
            <Link href="/tools/ziwei" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">紫微斗數速算</Link>
            <Link href="/tools/qimen" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">奇門遁甲排盤</Link>
            <Link href="/tools/name" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">姓名學速算</Link>
          </div>
          <div className="jy-mobile-menu__group">
            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">{txt.nav_my_reports}</Link>
                <button onClick={() => { setMobileMenuOpen(false); handleLogout() }} className="jy-mobile-link w-full">{txt.nav_logout}</button>
              </>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link">{txt.nav_login}</Link>
                <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)} className="jy-mobile-link text-[color:var(--jy-ui-link)]">{txt.nav_signup}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
