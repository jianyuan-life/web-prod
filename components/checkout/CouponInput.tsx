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
}

export default function CouponInput({
  couponInput, setCouponInput,
  couponApplied, setCouponApplied,
  couponLoading, couponError, setCouponError,
  applyCoupon,
}: CouponInputProps) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[11px] text-text-muted/70 mb-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
        優惠碼（輸入後套用享折扣）
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="例：WELCOME10"
          value={couponInput}
          onChange={(e) => { setCouponInput(e.target.value); setCouponError(''); if (couponApplied) setCouponApplied(null) }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCoupon())}
          className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-4 py-2 text-cream text-sm focus:border-gold/40 focus:outline-none uppercase"
        />
        <button type="button" onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()}
          className="px-4 py-2 bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg hover:bg-gold/30 disabled:opacity-40 whitespace-nowrap">
          {couponLoading ? '...' : '套用'}
        </button>
      </div>
      {couponError && <p className="text-red-400 text-xs mt-1">{couponError}</p>}
      {couponApplied && (
        <div className="flex items-center justify-between mt-1">
          <p className="text-green-400 text-xs">{couponApplied.message}</p>
          <button type="button" onClick={() => { setCouponApplied(null); setCouponInput('') }}
            className="text-xs text-text-muted/50 hover:text-red-400 ml-2">移除</button>
        </div>
      )}
    </div>
  )
}
