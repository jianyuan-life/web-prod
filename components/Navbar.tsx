'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import LocaleSwitcher from './LocaleSwitcher'
import { getLocale, UI_TEXT } from '@/lib/i18n'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [txt, setTxt] = useState(UI_TEXT['zh-TW'])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('locale-change', localeHandler)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-gold/10" style={{ background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo-icon.svg" alt="鑒源" className="h-8 w-8" />
          <span className="text-gold font-serif text-lg font-semibold tracking-[3px]">鑒源</span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm">
          <a href="/#systems" className="text-text-muted hover:text-gold transition-colors">{txt.nav_systems}</a>
          <a href="/pricing" className="text-text-muted hover:text-gold transition-colors">{txt.nav_pricing}</a>
          <a href="/blog" className="text-text-muted hover:text-gold transition-colors">{txt.nav_blog}</a>
          <div className="relative" onMouseEnter={() => setToolsOpen(true)} onMouseLeave={() => setToolsOpen(false)}>
            <button className="text-text-muted hover:text-gold transition-colors flex items-center gap-1 py-2 px-2.5 rounded-lg bg-gold/[0.08] border border-gold/10">
              {txt.nav_free}
              <span className="text-[9px] font-bold bg-gold text-dark px-1.5 py-0.5 rounded-full leading-none">FREE</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {toolsOpen && (
              <div className="absolute top-full left-0 pt-1 w-48">
                <div className="glass rounded-lg border border-gold/15 py-2 shadow-xl">
                  <a href="/tools/bazi" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">八字命理速算</a>
                  <a href="/tools/ziwei" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">紫微斗數速算</a>
                  <a href="/tools/name" className="block px-4 py-2 text-sm text-text-muted hover:text-gold hover:bg-gold/5 transition-colors">姓名學速算</a>
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
                <a href="/dashboard" className="text-sm text-text-muted hover:text-gold transition-colors">{txt.nav_my_reports}</a>
                <button onClick={handleLogout} className="text-sm text-text-muted/60 hover:text-text-muted transition-colors">{txt.nav_logout}</button>
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-xs font-bold">
                  {(user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                </div>
              </>
            ) : (
              <>
                <a href="/auth/login" className="text-sm text-text-muted hover:text-gold transition-colors">{txt.nav_login}</a>
                <a href="/auth/signup" className="px-4 py-2 bg-gold/90 text-dark font-semibold rounded-lg text-sm btn-glow hover:bg-gold">
                  {txt.nav_signup}
                </a>
              </>
            )}
          </div>
          {/* 手機漢堡選單按鈕 */}
          <button
            className="md:hidden p-2 text-text-muted hover:text-gold transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="開啟選單"
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

      {/* 手機版展開選單 */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gold/10 px-6 py-4 space-y-3" style={{ background: 'rgba(10,14,26,0.97)' }}>
          <a href="/#systems" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_systems}</a>
          <a href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_pricing}</a>
          <a href="/blog" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_blog}</a>
          <div className="border-t border-gold/10 pt-2">
            <p className="text-xs text-gold/60 mb-2">{txt.nav_free}</p>
            <a href="/tools/bazi" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">八字命理速算</a>
            <a href="/tools/ziwei" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">紫微斗數速算</a>
            <a href="/tools/name" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">姓名學速算</a>
          </div>
          <div className="border-t border-gold/10 pt-2">
            {user ? (
              <>
                <a href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_my_reports}</a>
                <button onClick={() => { setMobileMenuOpen(false); handleLogout() }} className="block text-sm text-text-muted/60 hover:text-text-muted py-1">{txt.nav_logout}</button>
              </>
            ) : (
              <>
                <a href="/auth/login" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-text-muted hover:text-gold py-1">{txt.nav_login}</a>
                <a href="/auth/signup" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gold font-semibold py-1">{txt.nav_signup}</a>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
