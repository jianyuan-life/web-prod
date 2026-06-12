// v5.10.224 — ReportToolbar 報告浮動工具列(Jamie 規格 SECTION 0)
//
// 樣式:sticky top-0 z-40 backdrop-blur-xl bg-void/70 border-b border-hairline
// 內容:精簡/完整 segmented + 術語 toggle + 淺色 toggle + 分享 + 下載 PDF + 預約諮詢
// scroll 時 logo 收起、報告名顯示
'use client'

import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ReportToolbarProps {
  reportTitle?: string // scroll 後顯示
  mode?: 'concise' | 'full' // 精簡版 / 完整版
  onModeChange?: (mode: 'concise' | 'full') => void
  termsEnabled?: boolean
  onTermsToggle?: () => void
  themeMode?: 'dark' | 'light'
  onThemeToggle?: () => void
  onShare?: () => void
  onDownloadPDF?: () => void
  consultUrl?: string // 預約諮詢 URL
  className?: string
}

export function ReportToolbar({
  reportTitle,
  mode = 'full',
  onModeChange,
  termsEnabled = false,
  onTermsToggle,
  themeMode = 'dark',
  onThemeToggle,
  onShare,
  onDownloadPDF,
  consultUrl = '/contact',
  className = '',
}: ReportToolbarProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onScroll() {
      setScrolled(window.scrollY > 80)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        'backdrop-blur-xl border-b',
        className,
      )}
      style={{
        backgroundColor: 'rgba(10, 14, 34, 0.7)',
        borderBottomColor: 'var(--jy-border-hairline)',
      }}
      role="banner"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        {/* Logo + report title(scroll 切換)*/}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {scrolled && reportTitle ? (
            <span
              className="text-sm font-medium text-[var(--jy-text-primary)] truncate"
              style={{ fontFamily: 'var(--jy-font-display)' }}
              title={reportTitle}  /* v5.10.295:hover 顯示完整 title 防 truncate 截到重點看不到 */
            >
              {reportTitle}
            </span>
          ) : (
            <span
              className="text-sm font-bold"
              style={{
                fontFamily: 'var(--jy-font-display)',
                color: 'var(--jy-text-gold)',
                letterSpacing: '0.1em',
              }}
            >
              鑒源
            </span>
          )}
        </div>

        {/* Segmented control:精簡/完整 */}
        {onModeChange && (
          <ToggleGroup.Root
            type="single"
            value={mode}
            onValueChange={(v) => v && onModeChange(v as 'concise' | 'full')}
            className="inline-flex h-9 rounded-lg p-0.5 border border-[var(--jy-border-soft)]"
            aria-label="閱讀版本"
          >
            <ToolbarToggleItem value="concise">精簡</ToolbarToggleItem>
            <ToolbarToggleItem value="full">完整</ToolbarToggleItem>
          </ToggleGroup.Root>
        )}

        {/* Terms toggle */}
        {onTermsToggle && (
          <ToolbarIconButton
            label="術語解釋"
            active={termsEnabled}
            onClick={onTermsToggle}
            icon="📖"
          />
        )}

        {/* Theme toggle */}
        {onThemeToggle && (
          <ToolbarIconButton
            label="切換主題"
            active={themeMode === 'light'}
            onClick={onThemeToggle}
            icon={themeMode === 'dark' ? '🌙' : '☀'}
          />
        )}

        {/* Action buttons — v5.10.430 老闆指令:砍「分享」(反人性命盤)+「預約諮詢」(不該有)
            保留下載 PDF = 正當功能 */}
        {onDownloadPDF && (
          <ToolbarIconButton label="下載 PDF" onClick={onDownloadPDF} icon="📥" />
        )}
      </div>
    </header>
  )
}

function ToolbarToggleItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <ToggleGroup.Item
      value={value}
      className={cn(
        'inline-flex items-center px-3 rounded-md text-sm transition-colors cursor-pointer',
        'text-[var(--jy-text-tertiary)] hover:text-[var(--jy-text-primary)]',
        'data-[state=on]:bg-[rgba(229,185,92,0.15)] data-[state=on]:text-[var(--jy-text-gold)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
      )}
    >
      {children}
    </ToggleGroup.Item>
  )
}

function ToolbarIconButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all',
        'hover:bg-[rgba(255,255,255,0.05)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2',
      )}
      style={{
        backgroundColor: active ? 'rgba(229, 185, 92, 0.15)' : 'transparent',
        color: active ? 'var(--jy-text-gold)' : 'var(--jy-text-tertiary)',
      }}
    >
      <span aria-hidden>{icon}</span>
    </button>
  )
}
