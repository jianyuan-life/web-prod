// v5.10.234 — JianyuanNavBar 新版(Jamie 規格 5.1、不取代既有 Navbar.tsx、純加新元件供 /r/* 路由用)
//
// 內容(Jamie 規格):鑒源 Logo / 系統介紹 / 方案定價 / 知識 / 免費速算 ▾ / 簡繁 / 我的報告 / 登出 / 頭像
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface JianyuanNavBarProps {
  userEmail?: string | null
  locale?: 'zh-TW' | 'zh-CN'
  onLocaleChange?: (locale: 'zh-TW' | 'zh-CN') => void
  onLogout?: () => void
  className?: string
}

const NAV_LINKS = [
  { href: '/about', label: '系統介紹' },
  { href: '/pricing', label: '方案定價' },
  { href: '/blog', label: '知識' },
] as const

const FREE_TOOLS = [
  { href: '/tools/bazi', label: '八字' },
  { href: '/tools/ziwei', label: '紫微' },
  { href: '/tools/qimen', label: '奇門' },
  { href: '/tools/name', label: '姓名' },
] as const

export function JianyuanNavBar({
  userEmail,
  locale = 'zh-TW',
  onLocaleChange,
  onLogout,
  className = '',
}: JianyuanNavBarProps) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header
      className={cn(
        'sticky top-0 z-40 backdrop-blur-xl border-b',
        className,
      )}
      style={{
        backgroundColor: 'rgba(10, 14, 34, 0.85)',
        borderBottomColor: 'var(--jy-border-hairline)',
      }}
      role="banner"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded">
          <span
            className="text-xl font-bold"
            style={{
              fontFamily: 'var(--jy-font-display)',
              background: 'var(--jy-gold-shimmer)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.1em',
            }}
          >
            鑒源
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-6 flex-1" aria-label="主選單">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href}>{link.label}</NavLink>
          ))}

          {/* Free tools dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setToolsOpen(!toolsOpen)}
              onBlur={() => setTimeout(() => setToolsOpen(false), 200)}
              className="text-sm text-[var(--jy-text-secondary)] hover:text-[var(--jy-text-gold)] transition-colors flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded"
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
            >
              免費速算 <span className="text-xs" aria-hidden>▾</span>
            </button>
            {toolsOpen && (
              <div
                className="absolute top-full mt-2 left-0 min-w-[160px] rounded-lg border shadow-[var(--jy-shadow-card)] py-2"
                style={{
                  backgroundColor: 'var(--jy-bg-nebula)',
                  borderColor: 'var(--jy-border-soft)',
                }}
                role="menu"
              >
                {FREE_TOOLS.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    role="menuitem"
                    className="block px-4 py-2 text-sm text-[var(--jy-text-secondary)] hover:bg-[rgba(229,185,92,0.10)] hover:text-[var(--jy-text-gold)] transition-colors"
                  >
                    {tool.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Locale toggle */}
          {onLocaleChange && (
            <button
              type="button"
              onClick={() => onLocaleChange(locale === 'zh-TW' ? 'zh-CN' : 'zh-TW')}
              className="text-xs px-2 py-1 rounded border border-[var(--jy-border-soft)] text-[var(--jy-text-tertiary)] hover:text-[var(--jy-text-gold)] hover:border-[var(--jy-text-gold)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2"
              aria-label={`切換到${locale === 'zh-TW' ? '簡體' : '繁體'}中文`}
            >
              {locale === 'zh-TW' ? '繁' : '簡'}
            </button>
          )}

          {userEmail ? (
            <>
              <Link
                href="/dashboard"
                className="hidden md:inline text-sm text-[var(--jy-text-secondary)] hover:text-[var(--jy-text-gold)] transition-colors"
              >
                我的報告
              </Link>
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  background: 'var(--jy-gold-shimmer)',
                  color: '#0A0E1A',
                }}
                title={userEmail}
              >
                {userEmail.slice(0, 1).toUpperCase()}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="hidden md:inline text-xs text-[var(--jy-text-muted)] hover:text-[var(--jy-text-secondary)] transition-colors"
                  aria-label="登出"
                >
                  登出
                </button>
              )}
            </>
          ) : (
            <Link
              href="/auth/login"
              className="text-sm text-[var(--jy-text-secondary)] hover:text-[var(--jy-text-gold)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded px-2 py-1"
            >
              登入
            </Link>
          )}

          {/* Mobile menu button */}
          <button
            type="button"
            className="lg:hidden text-[var(--jy-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? '關閉選單' : '開啟選單'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[var(--jy-border-hairline)] py-4 px-6 space-y-3" style={{ backgroundColor: 'var(--jy-bg-nebula)' }}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="block text-[var(--jy-text-secondary)]" onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          <details>
            <summary className="text-[var(--jy-text-secondary)] cursor-pointer">免費速算</summary>
            <div className="mt-2 ml-4 space-y-2">
              {FREE_TOOLS.map((tool) => (
                <Link key={tool.href} href={tool.href} className="block text-sm text-[var(--jy-text-tertiary)]" onClick={() => setMobileOpen(false)}>
                  {tool.label}
                </Link>
              ))}
            </div>
          </details>
          {userEmail && (
            <Link href="/dashboard" className="block text-[var(--jy-text-secondary)]" onClick={() => setMobileOpen(false)}>
              我的報告
            </Link>
          )}
        </div>
      )}
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-[var(--jy-text-secondary)] hover:text-[var(--jy-text-gold)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded"
    >
      {children}
    </Link>
  )
}
