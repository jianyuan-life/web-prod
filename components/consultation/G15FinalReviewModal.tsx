'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
// @ts-expect-error react-dom types are provided by Next at runtime but are not installed as a direct dependency
import { createPortal } from 'react-dom'

import type { G15SelectedReport } from '@/components/checkout/types'
import type { G15ConsentMemberState } from '@/components/consultation/checkout-types'
import styles from './G15FinalReviewModal.module.css'

type G15FinalReviewModalProps = {
  show: boolean
  members: G15SelectedReport[]
  consentMembers: G15ConsentMemberState[]
  relationshipContext: string
  consultationGoals: string
  totalPrice: number
  finalPrice: number
  couponCode?: string
  couponDiscount?: number
  pointsUsed?: number
  pointsDiscount?: number
  submitError?: string
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export default function G15FinalReviewModal({
  show,
  members,
  consentMembers,
  relationshipContext,
  consultationGoals,
  totalPrice,
  finalPrice,
  couponCode,
  couponDiscount = 0,
  pointsUsed = 0,
  pointsDiscount = 0,
  submitError = '',
  loading,
  onClose,
  onConfirm,
}: G15FinalReviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!show) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [show])

  if (!show) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !loading) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
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

  return createPortal(
    <div className={styles.overlay} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose()
    }}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={loading}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div>
            <p>家族藍圖 · 付款前確認</p>
            <h2 id={titleId}>最後核對家庭資料</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={loading} aria-label="關閉付款前確認">×</button>
        </header>

        <div className={styles.body}>
          <p id={descriptionId} className={styles.intro}>付款後會依下列成員與家庭情境生成報告。請先確認姓名、關係與目標都正確。</p>

          <section className={styles.section} aria-labelledby={`${titleId}-members`}>
            <h3 id={`${titleId}-members`}>家庭成員（{members.length} 位）</h3>
            <ol className={styles.members}>
              {members.map((member, index) => (
                <li key={member.reportId}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{member.name}</strong>
                  <small>{consentMembers.find((consent) => consent.reportId === member.reportId)?.status === 'accepted' ? '逐位同意：已完成' : '逐位同意：待確認'}</small>
                  {member.createdAt ? <small>人生藍圖完成於 {new Date(member.createdAt).toLocaleDateString('zh-TW')}</small> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.contextGrid}>
            <article>
              <h3>成員之間的關係</h3>
              <p>{relationshipContext}</p>
            </article>
            <article>
              <h3>這次最想理解或改善的事</h3>
              <p>{consultationGoals}</p>
            </article>
          </section>

          <section className={styles.price} aria-label="付款金額">
            <div><span>方案原價</span><strong>USD {totalPrice}</strong></div>
            {couponCode ? <div><span>優惠碼折抵（{couponCode}）</span><strong>− USD {couponDiscount}</strong></div> : null}
            {pointsUsed > 0 ? <div><span>積分折抵（{pointsUsed} 點）</span><strong>− USD {pointsDiscount}</strong></div> : null}
            <div className={styles.total}><span>本次實付</span><strong>USD {finalPrice}</strong></div>
          </section>

          <p className={styles.security}>
            {finalPrice === 0
              ? '本次無須刷卡；確認後會直接建立報告，不會前往 Stripe。'
              : '卡片資料由 Stripe 直接處理；完成付款後才會開始生成家族藍圖。'}
          </p>
          {submitError ? <p className={styles.error} role="alert">{submitError} 您可以留在此頁重新嘗試。</p> : null}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={loading}>返回修改</button>
          <button type="button" className={styles.primary} onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading
              ? finalPrice === 0 ? '正在建立報告…' : '正在連接 Stripe…'
              : finalPrice === 0 ? '確認並建立報告' : '前往 Stripe 安全付款'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
