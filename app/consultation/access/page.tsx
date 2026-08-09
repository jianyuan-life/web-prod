'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { exchangeConsultationFragment } from '@/lib/consultation/access-client'
import styles from './access.module.css'

declare global {
  interface Window {
    __JY_CONSULTATION_FRAGMENT__?: string
  }
}

type AccessState = 'opening' | 'invalid' | 'unavailable'

export default function ConsultationAccessPage() {
  const [state, setState] = useState<AccessState>('opening')
  const [attempt, setAttempt] = useState(0)
  const fragmentHandoff = useRef<string | null>(null)

  useEffect(() => {
    if (fragmentHandoff.current === null) {
      fragmentHandoff.current = window.__JY_CONSULTATION_FRAGMENT__ ?? window.location.hash
      delete window.__JY_CONSULTATION_FRAGMENT__
    }
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)

    void exchangeConsultationFragment({
      location: window.location,
      history: window.history,
      fetch: window.fetch.bind(window),
      fragment: fragmentHandoff.current,
      signal: controller.signal,
    }).then((result) => {
      if (active && !result.ok) {
        setState(result.code === 'invalid_link' ? 'invalid' : 'unavailable')
      }
    }).catch(() => {
      if (active) setState('unavailable')
    }).finally(() => {
      window.clearTimeout(timeout)
    })

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  const failed = state !== 'opening'
  return (
    <div className={styles.page}>
      <div className={styles.halo} aria-hidden="true" />
      <section className={styles.card} aria-labelledby="access-title">
          <p className={styles.kicker}>鑑源 · 私人報告</p>
          <h1 id="access-title">
            {failed ? '這次無法開啟報告' : '正在開啟你的私人報告'}
          </h1>
          <div className={styles.status} role="status" aria-live="polite">
            {state === 'opening' ? (
              <div className={styles.openingRow}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>正在安全確認連結，完成後會自動開啟報告。</p>
              </div>
            ) : (
              <p>
                {state === 'invalid'
                  ? '連結不完整或格式不正確。請從鑑源寄出的電子郵件或「我的報告」重新開啟。'
                  : '目前無法完成安全確認。這不代表報告遺失，也不會產生任何費用；你可以重試，或回到「我的報告」開啟。'}
              </p>
            )}
          </div>
          {failed && (
            <nav className={styles.actions} aria-label="後續操作">
              {state === 'unavailable' && (
                <button
                  type="button"
                  onClick={() => { setState('opening'); setAttempt((value) => value + 1) }}
                  className={styles.primaryAction}
                >
                  再試一次
                </button>
              )}
              <Link
                href="/dashboard"
                className={styles.secondaryAction}
              >
                前往我的報告
              </Link>
              <Link
                href="/"
                className={styles.tertiaryAction}
              >
                返回首頁
              </Link>
            </nav>
          )}
      </section>
    </div>
  )
}
