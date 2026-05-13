// v5.10.223 — GlobalToast 全域通知(Jamie 規格 AppShell 元件、用 Radix Toast)
//
// 用途:
//   - 提供全域 toast() function、任何元件可呼叫
//   - 4 種 variant:success / error / info / warning
//   - 自動 disappear 5s、可手動 dismiss
//   - a11y:Radix Toast 內建 ARIA live region
//
// 用法:
//   1. 在 root layout 包 ToastProvider:
//      <ToastProvider><App /></ToastProvider>
//   2. 任何元件:
//      const { toast } = useToast()
//      toast({ title: '已複製', variant: 'success' })
'use client'

import * as Toast from '@radix-ui/react-toast'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number // ms、default 5000
}

interface ToastItem extends ToastOptions {
  id: string
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // SSR / 未包 Provider 時、回 noop(不 throw、避免 crash)
    return { toast: () => { /* noop */ } }
  }
  return ctx
}

export interface ToastProviderProps {
  children: ReactNode
  swipeDirection?: 'left' | 'right' | 'up' | 'down'
}

export function GlobalToastProvider({ children, swipeDirection = 'right' }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((opts: ToastOptions) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setItems((prev) => [...prev, { id, ...opts }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      <Toast.Provider swipeDirection={swipeDirection} duration={5000}>
        {children}
        {items.map((item) => (
          <ToastInstance key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
        <Toast.Viewport
          className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[var(--toast-viewport-width,360px)] max-w-[100vw] p-4 outline-none"
        />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}

function ToastInstance({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const VARIANT_META: Record<ToastVariant, { icon: string; color: string; bg: string; border: string }> = {
    success: { icon: '✓', color: 'var(--jy-semantic-flow)', bg: 'rgba(74, 222, 128, 0.10)', border: 'var(--jy-semantic-flow)' },
    error: { icon: '✕', color: 'var(--jy-semantic-danger)', bg: 'rgba(239, 68, 68, 0.10)', border: 'var(--jy-semantic-danger)' },
    info: { icon: 'ℹ', color: 'var(--jy-semantic-water)', bg: 'rgba(96, 165, 250, 0.10)', border: 'var(--jy-semantic-water)' },
    warning: { icon: '⚠', color: 'var(--jy-semantic-balance)', bg: 'rgba(251, 191, 36, 0.10)', border: 'var(--jy-semantic-balance)' },
  }
  const meta = VARIANT_META[item.variant || 'info']

  return (
    <Toast.Root
      duration={item.duration || 5000}
      onOpenChange={(open) => { if (!open) onDismiss() }}
      className={cn(
        'rounded-xl p-4 border-l-4',
        'data-[state=open]:animate-fade-in',
        'data-[state=closed]:animate-fade-out',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
        'data-[swipe=cancel]:translate-x-0',
        'data-[swipe=cancel]:transition-transform',
        'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
      )}
      style={{
        backgroundColor: meta.bg,
        borderLeftColor: meta.border,
        boxShadow: 'var(--jy-shadow-card)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden style={{ color: meta.color, fontSize: '1.25rem' }}>{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <Toast.Title className="font-semibold text-[var(--jy-text-primary)]">
            {item.title}
          </Toast.Title>
          {item.description && (
            <Toast.Description className="mt-1 text-sm text-[var(--jy-text-secondary)]">
              {item.description}
            </Toast.Description>
          )}
        </div>
        <Toast.Close
          aria-label="關閉"
          className="flex-shrink-0 text-[var(--jy-text-muted)] hover:text-[var(--jy-text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--jy-text-gold)] focus-visible:outline-offset-2 rounded"
        >
          ✕
        </Toast.Close>
      </div>
    </Toast.Root>
  )
}
