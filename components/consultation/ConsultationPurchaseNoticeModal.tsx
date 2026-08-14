'use client'

import { useEffect, useId, useRef, useState } from 'react'
// @ts-expect-error react-dom types are provided by Next at runtime but are not installed as a direct dependency
import { createPortal } from 'react-dom'
import {
  CONSULTATION_PURCHASE_NOTICES,
  CONSULTATION_REFUND_SUMMARY,
  CONSULTATION_SERVICE_GUARANTEES,
  type ConsultationPurchasePlan,
} from '@/lib/checkout/consultation-purchase-notice'
import { PLAN_PRICES } from '@/lib/plan-names'
import styles from './ConsultationPurchaseNoticeModal.module.css'

type ConsultationPurchaseNoticeModalProps = {
  planCode: ConsultationPurchasePlan
  onConfirm: () => void
  onCancel: () => void
  confirming?: boolean
  confirmError?: string
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'summary',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function ConsultationPurchaseNoticeModal({
  planCode,
  onConfirm,
  onCancel,
  confirming = false,
  confirmError = '',
}: ConsultationPurchaseNoticeModalProps) {
  const [mounted, setMounted] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const actionHintId = useId()
  const notice = CONSULTATION_PURCHASE_NOTICES[planCode]
  const noticePrice = PLAN_PRICES[planCode] / 100

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => dialogRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!confirming) onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [confirming, mounted, onCancel])

  if (!mounted) return null

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className={styles.shell}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>{notice.eyebrow}</p>
              <h2 id={titleId} className={styles.title}>{notice.title}</h2>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onCancel}
              disabled={confirming}
              aria-label="關閉確認視窗"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div className={styles.body}>
            <p id={descriptionId} className={styles.introduction}>{notice.introduction}</p>

            <div className={styles.priceCard} aria-label={`一次性價格 USD ${noticePrice}`}>
              <span>一次性價格</span>
              <strong>USD {noticePrice}</strong>
              <small>非訂閱；下一頁仍可核對優惠與實付金額</small>
            </div>

            <section className={styles.section} aria-labelledby={`${titleId}-deliverables`}>
              <h3 id={`${titleId}-deliverables`} className={styles.sectionTitle}>您會收到什麼</h3>
              <ol className={styles.numberedList}>
                {notice.deliverables.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </section>

            <section className={styles.section} aria-labelledby={`${titleId}-before`}>
              <h3 id={`${titleId}-before`} className={styles.sectionTitle}>繼續前請先確認</h3>
              <ul className={styles.plainList}>
                {notice.beforeContinuing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>

            <div className={styles.timingCard}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <p>{notice.timing}</p>
            </div>

            <details className={`${styles.section} ${styles.guaranteeCard}`}>
              <summary>付款、生成與退費保障</summary>
              <ul className={styles.plainList}>
                {CONSULTATION_SERVICE_GUARANTEES.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className={styles.refundSummary}>{CONSULTATION_REFUND_SUMMARY}</p>
            </details>

            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={agreed}
                disabled={confirming}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>
                我已確認方案內容與一次性價格，也理解下一步會先填寫與核對資料，送出後才前往 Stripe 付款。
              </span>
            </label>
          </div>

          <footer className={styles.footer}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={confirming}>先不要</button>
            <div className={styles.primaryArea}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onConfirm}
                disabled={!agreed || confirming}
                aria-disabled={!agreed || confirming}
                aria-busy={confirming}
                aria-describedby={actionHintId}
              >
                {confirming ? '正在確認登入狀態…' : '繼續填寫資料'}
              </button>
              <p id={actionHintId} className={styles.actionHint} aria-live="polite">
                {confirmError
                  ? <span className={styles.actionError} role="alert">{confirmError}</span>
                  : confirming
                    ? '正在安全確認您的登入狀態。'
                    : agreed
                      ? '下一頁仍可再次核對資料與金額。'
                      : '勾選確認後，即可繼續填寫資料。'}
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}
