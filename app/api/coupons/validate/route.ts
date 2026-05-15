import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getSupabase() {
  return createServiceClient()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') || '').trim().toUpperCase()
  const planCode = searchParams.get('plan') || ''
  const amount = parseFloat(searchParams.get('amount') || '0')

  if (!code) return NextResponse.json({ valid: false, message: '請輸入優惠碼' })

  // 基本輸入驗證：限制長度，防止惡意輸入
  if (code.length > 50) return NextResponse.json({ valid: false, message: '優惠碼格式無效' })

  const supabase = getSupabase()
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single()

  if (error || !coupon) return NextResponse.json({ valid: false, message: '優惠碼不存在或已停用' })
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
    return NextResponse.json({ valid: false, message: '優惠碼已過期' })
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, message: '優惠碼已達使用上限' })
  }
  if (coupon.applicable_products && coupon.applicable_products.length > 0 && planCode) {
    if (!coupon.applicable_products.includes(planCode)) {
      return NextResponse.json({ valid: false, message: `此優惠碼不適用於此方案` })
    }
  }

  let discountAmount = 0
  let finalAmount = amount

  if (coupon.discount_type === 'percentage') {
    discountAmount = Math.round(amount * coupon.discount_value / 100 * 100) / 100
    finalAmount = Math.max(0, amount - discountAmount)
  } else if (coupon.discount_type === 'fixed') {
    discountAmount = Math.min(coupon.discount_value, amount)
    finalAmount = Math.max(0, amount - discountAmount)
  } else if (coupon.discount_type === 'free') {
    discountAmount = amount
    finalAmount = 0
  }

  return NextResponse.json({
    valid: true,
    couponId: coupon.id,
    discountType: coupon.discount_type,
    discountValue: coupon.discount_value,
    discountAmount,
    finalAmount,
    message: coupon.discount_type === 'free'
      ? '免費體驗優惠碼已套用！'
      : coupon.discount_type === 'percentage'
        ? `折扣 ${coupon.discount_value}% 已套用`
        : `折抵 $${coupon.discount_value} 已套用`,
  })
}
