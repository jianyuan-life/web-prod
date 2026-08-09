'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { exchangeConsultationFragment } from '@/lib/consultation/access-client'

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
    <section className="min-h-screen bg-[#080b12] px-5 py-16 text-[#f4efe6] sm:px-8" aria-labelledby="access-title">
      <div className="mx-auto grid min-h-[70vh] w-full max-w-2xl place-items-center">
        <div className="w-full border border-[#d5b261]/25 bg-[#101722] p-8 shadow-2xl shadow-black/30 sm:p-12">
          <p className="mb-4 text-xs font-semibold tracking-[0.24em] text-[#d5b261]">鑑源・私人報告</p>
          <h1 id="access-title" className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">
            {failed ? '這次無法開啟報告' : '正在開啟你的私人報告'}
          </h1>
          <div className="mt-7 border-l-2 border-[#d5b261]/60 pl-5" role="status" aria-live="polite">
            {state === 'opening' ? (
              <p className="leading-8 text-[#c8cdd5]">正在安全確認連結，完成後會自動繼續。</p>
            ) : (
              <p className="leading-8 text-[#c8cdd5]">
                {state === 'invalid'
                  ? '連結不完整或格式不正確。請從鑑源寄出的 Email 或報告檔案庫重新開啟。'
                  : '目前無法完成安全確認。請稍後從原始 Email 連結或報告檔案庫再試一次。'}
              </p>
            )}
          </div>
          {failed && (
            <nav className="mt-8 flex flex-col gap-3 sm:flex-row" aria-label="後續操作">
              {state === 'unavailable' && (
                <button
                  type="button"
                  onClick={() => { setState('opening'); setAttempt((value) => value + 1) }}
                  className="inline-flex min-h-11 items-center justify-center bg-[#d5b261] px-5 font-semibold text-[#15110a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#91c7ff]"
                >
                  重試安全確認
                </button>
              )}
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center border border-[#d5b261]/35 px-5 font-semibold text-[#f4efe6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#91c7ff]"
              >
                登入查看報告
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center border border-[#d5b261]/35 px-5 font-semibold text-[#f4efe6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#91c7ff]"
              >
                返回首頁
              </Link>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}
