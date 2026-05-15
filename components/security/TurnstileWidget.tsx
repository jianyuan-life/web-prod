'use client'

// Phase 5 老闆按鈕 #5 wire — Cloudflare Turnstile widget
//
// 對應 lib/security/turnstile.ts(server-side verify)+ lib/security/audit-event.ts
// 實現 Cloudflare 官方 vanilla JS API、無 npm dependency
//
// 用法(客戶端表單嵌入):
//   import TurnstileWidget from '@/components/security/TurnstileWidget'
//   const [token, setToken] = useState('')
//   <TurnstileWidget onVerify={setToken} />
//   // 提交時把 token 傳給 server、server 呼叫 verifyTurnstileToken(token, req.ip)
//
// 環境變數:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY(老闆按鈕後灌、widget 自動 render)
//   未設時:widget 不顯示、token 留空、server-side stub 模式 OK(dev)/ fail-closed(prod)
//
// 啟用:Phase 5 老闆按鈕後 NEXT_PUBLIC_TURNSTILE_SITE_KEY 灌進去 → 自動生效

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact'
          appearance?: 'always' | 'execute' | 'interaction-only'
        },
      ) => string  // widget id
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit'

interface TurnstileWidgetProps {
  /** 驗證成功 callback、收到 token 後傳給 server */
  onVerify: (token: string) => void
  /** 驗證失敗 callback(可選) */
  onError?: () => void
  /** token 過期 callback(可選、預設自動 reset) */
  onExpired?: () => void
  /** widget 主題、預設 auto(跟系統)*/
  theme?: 'light' | 'dark' | 'auto'
  /** widget 大小、結帳/註冊用 normal、輕量場景 compact */
  size?: 'normal' | 'compact'
  /** 隱藏 mode:'execute' = 預先 challenge / 'interaction-only' = 只在需要時 / 'always' = 永遠顯示 */
  appearance?: 'always' | 'execute' | 'interaction-only'
}

export default function TurnstileWidget({
  onVerify,
  onError,
  onExpired,
  theme = 'dark',  // 鑑源 dark UI
  size = 'normal',
  appearance = 'always',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // Step 1:載入 Turnstile script(只一次、global)
  useEffect(() => {
    if (!siteKey) return  // 沒設 site key、widget 隱身、token 留空

    // 如果 script 已存在(別的 widget instance 已載過)、直接標記 loaded
    if (typeof window !== 'undefined' && window.turnstile) {
      setScriptLoaded(true)
      return
    }

    // 檢查 script tag 是否已存在
    const existingScript = document.querySelector(`script[src*="challenges.cloudflare.com/turnstile"]`)
    if (existingScript) {
      // script 在載中、等 turnstile global 出現
      const checkInterval = setInterval(() => {
        if (window.turnstile) {
          setScriptLoaded(true)
          clearInterval(checkInterval)
        }
      }, 100)
      return () => clearInterval(checkInterval)
    }

    // 第一次載入:設 onload callback、注入 script
    window.onloadTurnstileCallback = () => setScriptLoaded(true)
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    return () => {
      // 不 remove script(其他 widget 可能在用)、僅清 callback
    }
  }, [siteKey])

  // Step 2:script 載完 → render widget
  useEffect(() => {
    if (!siteKey || !scriptLoaded || !containerRef.current || !window.turnstile) return

    // 防 double render
    if (widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current)
      return
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => {
        onVerify(token)
      },
      'error-callback': () => {
        onError?.()
      },
      'expired-callback': () => {
        if (onExpired) {
          onExpired()
        } else if (widgetIdRef.current && window.turnstile) {
          // 預設:自動 reset、讓客戶重新驗證
          window.turnstile.reset(widgetIdRef.current)
        }
      },
      theme,
      size,
      appearance,
    })
    widgetIdRef.current = widgetId

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* widget 可能已被卸載 */
        }
        widgetIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, scriptLoaded])

  // 沒設 site key:不顯示 widget(dev mode、stub 不需 token)
  if (!siteKey) return null

  return (
    <div
      ref={containerRef}
      className="my-3 flex justify-center"
      data-turnstile-container
    />
  )
}
