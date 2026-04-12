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
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="輸入優惠碼"
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
