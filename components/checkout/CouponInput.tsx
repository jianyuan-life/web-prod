'use client'

interface CouponInputProps {
  couponInput: string
  setCouponInput: (v: string) => void
  couponApplied: { code: string; discountAmount: number; message: string } | null
  setCouponApplied: (v: null) => void
  couponLoading: boolean
  couponError: string
  setCouponError: (v: string) => void
  applyCoupon: () => void
  consultationMode?: boolean
}

export default function CouponInput({
  couponInput, setCouponInput,
  couponApplied, setCouponApplied,
  couponLoading, couponError, setCouponError,
  applyCoupon,
  consultationMode = false,
}: CouponInputProps) {
  return (
    <div aria-busy={consultationMode ? couponLoading : undefined}>
      <label htmlFor="checkout-coupon" className="flex items-center gap-1 text-[11px] text-text-muted/70 mb-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
        {consultationMode ? '優惠碼（選填）' : '優惠碼（輸入後套用享折扣）'}
      </label>
      <div className="flex gap-2">
        <input
          id="checkout-coupon"
          type="text"
          disabled={consultationMode ? couponLoading : undefined}
          aria-invalid={!!couponError}
          aria-describedby={couponError ? 'checkout-coupon-error' : couponApplied ? 'checkout-coupon-status' : undefined}
          placeholder="例：WELCOME10"
          value={couponInput}
          onChange={(e) => { setCouponInput(e.target.value); setCouponError(''); if (couponApplied) setCouponApplied(null) }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (!consultationMode || !couponLoading) applyCoupon()
          }}
          className={consultationMode
            ? 'flex-1 bg-white/5 border border-gold/10 rounded-lg px-4 py-2 text-cream text-sm focus:border-gold/40 focus:outline-none uppercase disabled:cursor-wait disabled:opacity-60'
            : 'flex-1 bg-white/5 border border-gold/10 rounded-lg px-4 py-2 text-cream text-sm focus:border-gold/40 focus:outline-none uppercase'}
        />
        <button type="button" onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()} aria-busy={couponLoading}
          className={consultationMode
            ? 'px-4 py-2 bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg hover:bg-gold/30 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap'
            : 'px-4 py-2 bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg hover:bg-gold/30 disabled:opacity-40 whitespace-nowrap'}>
          {couponLoading ? consultationMode ? '驗證中…' : '...' : '套用'}
        </button>
      </div>
      {consultationMode && couponLoading && <p className="mt-1 text-xs text-text-muted" role="status" aria-live="polite">正在確認優惠碼，請稍候。</p>}
      {couponError && <p id="checkout-coupon-error" className="text-red-400 text-xs mt-1" role="alert">{couponError}</p>}
      {couponApplied && (
        <div className="flex items-center justify-between mt-1">
          <p id="checkout-coupon-status" className="text-green-400 text-xs" role="status">{couponApplied.message}</p>
          <button type="button" onClick={() => { setCouponApplied(null); setCouponInput('') }}
            className="text-xs text-text-muted/50 hover:text-red-400 ml-2">移除</button>
        </div>
      )}
    </div>
  )
}
