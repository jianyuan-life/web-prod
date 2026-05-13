'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import LocaleSwitcher from './LocaleSwitcher'
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

  return (
    <nav
      className={`fixed top-0 w-full z-50 border-b border-gold/10 transition-shadow duration-300 ${scrolled ? 'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]' : ''}`}
      style={{ background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-jianyuan.svg?v=11" alt="鑒源" className="h-9 w-9" />
          <span className="text-gold font-serif text-lg font-semibold tracking-[3px]">鑒源</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/#systems" className="text-text-muted hover:text-gold transition-colors">{txt.nav_systems}</Link>
          <Link href="/pricing" className="text-text-muted hover:text-gold transition-colors">{txt.nav_pricing}</Link>
          <Link href="/blog" className="text-text-muted hover:text-gold transition-colors">{txt.nav_blog}</Link>
          <div
            ref={toolsContainerRef}
            className="relative"
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              type="button"
              className="text-text-muted hover:text-gold transition-colors flex items-center gap-1 py-2 px-2.5 rounded-lg bg-gold/[0.08] border border-gold/10"
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
              <span className="text-[9px] font-bold bg-gold text-dark px-1.5 py-0.5 rounded-full leading-none">FREE</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {toolsOpen && (
              <div className="absolute top-full left-0 pt-1 w-48">
                <div
                  id="tools-menu"
                  role="menu"
                  aria-label="免費工具"
                  className="glass rounded-lg border border-gold/15 py-2 shadow-xl"
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
                  <Link href="/tools/bazi" role="menuitem" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">八字命理速算</Link>
                  <Link href="/tools/ziwei" role="menuitem" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">紫微斗數速算</Link>
                  <Link href="/tools/qimen" role="menuitem" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">奇門遁甲排盤</Link>
                  <Link href="/tools/name" role="menuitem" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">姓名學速算</Link>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {/* 桌面版用戶區域 */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link href="/dashboard" className="text-sm text-text-muted hover:text-gold transition-colors">{txt.nav_my_reports}</Link>
                <button onClick={handleLogout} className="text-sm text-text-muted/60 hover:text-text-muted transition-colors">{txt.nav_logout}</button>
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-xs font-bold">
                  {(user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                </div>
              </>
            ) : isReportPage ? (
              // v5.7.75 報告頁訪客 = 已透過 token 取得、不再推銷註冊(Gemini P0「不該顯示免費註冊」修)
              <Link href="/auth/login" className="text-sm text-text-muted hover:text-gold transition-colors">{txt.nav_login}</Link>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm text-text-muted hover:text-gold transition-colors">{txt.nav_login}</Link>
                <Link href="/auth/signup" className="px-4 py-2 bg-gold/90 text-dark font-semibold rounded-lg text-sm btn-glow hover:bg-gold">
                  {txt.nav_signup}
                </Link>
              </>
            )}
          </div>
          {/* 手機漢堡選單按鈕 */}
          <button
            className="md:hidden p-2 text-text-muted hover:text-gold transition-colors"
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
          className="md:hidden fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 手機版展開選單 */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          role="menu"
          className="md:hidden relative z-50 border-t border-gold/10 px-6 py-4 space-y-3 animate-slide-down"
          style={{ background: 'rgba(10,14,26,0.97)' }}
        >
          <Link href="/#systems" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_systems}</Link>
          <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_pricing}</Link>
          <Link href="/blog" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_blog}</Link>
          <div className="border-t border-gold/10 pt-2">
            <p className="text-xs text-gold/60 mb-2">{txt.nav_free}</p>
            <Link href="/tools/bazi" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">八字命理速算</Link>
            <Link href="/tools/ziwei" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">紫微斗數速算</Link>
            <Link href="/tools/qimen" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">奇門遁甲排盤</Link>
            <Link href="/tools/name" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">姓名學速算</Link>
          </div>
          <div className="border-t border-gold/10 pt-2">
            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_my_reports}</Link>
                <button onClick={() => { setMobileMenuOpen(false); handleLogout() }} className="block text-sm text-text-muted/60 hover:text-text-muted py-1">{txt.nav_logout}</button>
              </>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_login}</Link>
                <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gold font-semibold py-1">{txt.nav_signup}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
