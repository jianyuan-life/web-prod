import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

const PRICE_MAP: Record<string, { amount: number; name: string }> = {
  C: { amount: 8900, name: '人生藍圖' },
  D: { amount: 3900, name: '心之所惑' },
  G15: { amount: 5900, name: '家族藍圖' },
  R: { amount: 5900, name: '合否？' },
  E1: { amount: 11900, name: '事件出門訣' },
  E2: { amount: 8900, name: '月盤出門訣' },
  // 加人附加費（G15 已改為固定 $59，不再加人加價）
  'R-ADD': { amount: 1900, name: '合否？加1人' },
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planCode, birthData, totalPrice, locale, couponCode, couponDiscount, userEmail, pointsToUse } = body

    const plan = PRICE_MAP[planCode]
    if (!plan) {
      return NextResponse.json({ error: '無效的方案代碼' }, { status: 400 })
    }

    // 從 Supabase Auth 取得用戶真實 email（不依賴前端傳值）
    let verifiedEmail = ''
    try {
      const supabaseAuth = getSupabase()
      // 嘗試用 cookie 中的 token 驗證用戶
      const cookies = req.headers.get('cookie') || ''
      const accessTokenMatch = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
      if (accessTokenMatch) {
        try {
          const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]))
          const token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
          if (typeof token === 'string' && token.length > 20) {
            const { data } = await supabaseAuth.auth.getUser(token)
            if (data?.user?.email) verifiedEmail = data.user.email
          }
        } catch { /* token 解析失敗，用 fallback */ }
      }
    } catch { /* auth 驗證失敗，用 fallback */ }
    // Fallback: 前端傳來的 email
    const customerEmail = (verifiedEmail || userEmail || birthData?.email || '').toLowerCase()

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      return NextResponse.json({ error: 'Stripe 尚未設定' }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'

    // G15 家族藍圖：固定 $59，不再按人數加價
    // R 方案：可加人（前端傳 totalPrice），但必須驗證最低價格
    // 其他方案：使用固定金額
    const isVariablePrice = planCode === 'R' && typeof totalPrice === 'number'
    let baseAmount = isVariablePrice
      ? Math.round(totalPrice * 100)
      : plan.amount

    // 伺服器端價格驗證：前端傳來的金額不得低於方案定價
    if (baseAmount < plan.amount) {
      return NextResponse.json({ error: '金額低於方案最低定價' }, { status: 400 })
    }

    // 1. 檢查全網促銷活動
    let promoDiscountPercent = 0
    let promoName = ''
    {
      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data: promo } = await supabase
        .from('promotions')
        .select('name, discount_percent, applicable_plans')
        .eq('is_active', true)
        .lte('start_at', now)
        .gte('end_at', now)
        .order('discount_percent', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (promo) {
        const planAllowed = !promo.applicable_plans || promo.applicable_plans.includes(planCode)
        if (planAllowed) {
          promoDiscountPercent = promo.discount_percent
          promoName = promo.name
        }
      }
    }

    // 2. 驗證優惠碼
    let couponDiscountPercent = 0
    let couponFixedAmount = 0
    let couponIsFree = false
    let verifiedCouponCode = ''
    if (couponCode) {
      const supabase = getSupabase()
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.trim().toUpperCase())
        .eq('is_active', true)
        .single()

      if (coupon) {
        const now = new Date()
        const notExpired = !coupon.valid_until || new Date(coupon.valid_until) > now
        const notExhausted = coupon.max_uses === null || coupon.used_count < coupon.max_uses
        const planAllowed = !coupon.applicable_products || coupon.applicable_products.includes(planCode)

        if (notExpired && notExhausted && planAllowed) {
          verifiedCouponCode = coupon.code
          if (coupon.discount_type === 'percentage') {
            couponDiscountPercent = coupon.discount_value
          } else if (coupon.discount_type === 'fixed') {
            couponFixedAmount = Math.round(coupon.discount_value * 100)
          } else if (coupon.discount_type === 'free') {
            couponIsFree = true
          }
        }
      }
    }

    // 3. 計算最終金額：促銷 vs 優惠碼，取較高折扣（不疊加）
    let finalAmount = baseAmount
    if (couponIsFree) {
      // 免費碼優先
      finalAmount = 0
    } else {
      // 計算促銷折扣後金額
      const promoAmount = promoDiscountPercent > 0
        ? Math.round(baseAmount * (1 - promoDiscountPercent / 100))
        : baseAmount
      // 計算優惠碼折扣後金額
      let couponAmount = baseAmount
      if (couponDiscountPercent > 0) {
        couponAmount = Math.round(baseAmount * (1 - couponDiscountPercent / 100))
      } else if (couponFixedAmount > 0) {
        couponAmount = Math.max(0, baseAmount - couponFixedAmount)
      }
      // 取較低金額（= 較高折扣）
      finalAmount = Math.min(promoAmount, couponAmount)
    }

    // 4. 點數折抵（與優惠碼互斥，前端控制；後端再驗證）
    let verifiedPointsToUse = 0
    let pointsUserId = ''
    if (pointsToUse && pointsToUse > 0 && !verifiedCouponCode && finalAmount > 0) {
      const supabase = getSupabase()
      // 取得用戶 ID
      let userId = ''
      try {
        const cookies = req.headers.get('cookie') || ''
        const tokenMatch = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
        if (tokenMatch) {
          const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]))
          const token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
          if (typeof token === 'string' && token.length > 20) {
            const { data } = await supabase.auth.getUser(token)
            if (data?.user?.id) userId = data.user.id
          }
        }
      } catch {}

      if (userId) {
        pointsUserId = userId
        // 驗證餘額
        const { data: pts } = await supabase.from('user_points').select('balance').eq('user_id', userId).single()
        const balance = pts?.balance || 0
        // 最多用到餘額，且不超過訂單50%
        const maxPoints = Math.floor(finalAmount / 100 / 2) // 50% 上限，單位美元
        verifiedPointsToUse = Math.min(pointsToUse, balance, maxPoints)
        if (verifiedPointsToUse > 0) {
          finalAmount = Math.max(0, finalAmount - verifiedPointsToUse * 100)
        }
      }
    }

    // 免費方案：跳過 Stripe，直接建立訂單
    if (finalAmount === 0 && verifiedCouponCode) {
      const supabase = getSupabase()
      const draftRes = await supabase.from('checkout_drafts').insert({
        plan_code: planCode, birth_data: birthData, locale: locale || 'zh-TW',
      }).select('id').single()

      if (!draftRes.data) return NextResponse.json({ error: '暫存資料失敗' }, { status: 500 })

      // 標記 draft 已使用
      await supabase.from('checkout_drafts').update({ used_at: new Date().toISOString() }).eq('id', draftRes.data.id)

      // 直接插入訂單並觸發報告生成
      const fakeSessionId = `free_${crypto.randomUUID()}`
      await supabase.from('orders').insert({
        stripe_session_id: fakeSessionId,
        plan_code: planCode,
        amount_usd: 0,
        status: 'pending',
        customer_email: customerEmail,
        birth_data: birthData,
        coupon_code: verifiedCouponCode,
      })

      // 建立 paid_reports 記錄（跟 webhook 一樣的流程）
      const accessToken = crypto.randomUUID()
      const { data: reportData } = await supabase.from('paid_reports').insert({
        client_name: birthData?.plan_type === 'family_email' || birthData?.plan_type === 'family_reports'
          ? (birthData?.member_names?.filter(Boolean).join('、') || 'Unknown')
          : birthData?.plan === 'R'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join(' × ') || 'Unknown')
          : birthData?.plan_type === 'family'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join('、') || 'Unknown')
          : (birthData?.name || 'Unknown'),
        plan_code: planCode,
        amount_usd: 0,
        stripe_session_id: fakeSessionId,
        birth_data: birthData,
        status: 'pending',
        access_token: accessToken,
        customer_email: customerEmail,
      }).select('id').single()

      const reportId = reportData?.id || ''

      // 記錄優惠碼使用
      const { data: couponRow } = await supabase.from('coupons').select('id, used_count').eq('code', verifiedCouponCode).single()
      if (couponRow) {
        await supabase.from('coupons').update({ used_count: (couponRow.used_count || 0) + 1 }).eq('id', couponRow.id)
        await supabase.from('coupon_uses').insert({
          coupon_id: couponRow.id, coupon_code: verifiedCouponCode,
          order_id: fakeSessionId, customer_email: customerEmail,
          plan_code: planCode, original_amount: baseAmount / 100, discount_applied: baseAmount / 100,
        })
      }

      // 免費方案也發訂單確認信
      if (customerEmail) {
        try {
          const PLAN_NAMES: Record<string, string> = { C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件出門訣', E2: '月盤出門訣' }
          const resend = new Resend(process.env.RESEND_API_KEY || '')
          const planName = PLAN_NAMES[planCode] || planCode
          await resend.emails.send({
            from: '鑒源命理 <noreply@jianyuan.life>',
            to: customerEmail,
            subject: `已收到您的訂單 — ${planName}（優惠碼 ${verifiedCouponCode}）`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #333;">
                <h2 style="color: #1a1a2e; margin-bottom: 16px;">感謝您的購買</h2>
                <p>您好，</p>
                <p>您使用優惠碼 <strong>${verifiedCouponCode}</strong> 免費獲得了<strong>「${planName}」</strong>，系統正在啟動分析。</p>
                <p style="background: #f8f6f0; padding: 16px; border-radius: 8px; border-left: 3px solid #c9a84c;">
                  報告預計 <strong>30-60 分鐘</strong>內完成。完成後會再寄信通知您。
                </p>
                <p style="margin-top: 24px;">
                  <a href="${siteUrl}/dashboard" style="display: inline-block; background: #c9a84c; color: #1a1a2e; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">查看報告進度</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                <p style="font-size: 12px; color: #999;">鑒源命理 jianyuan.life</p>
              </div>
            `,
          })
        } catch { /* 確認信失敗不影響報告生成 */ }
      }

      // 觸發 Workflow 生成報告（await + fallback，與 webhook 一致）
      if (reportId) {
        let workflowTriggered = false
        try {
          const wfController = new AbortController()
          const wfTimeout = setTimeout(() => wfController.abort(), 5000)
          const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
            body: JSON.stringify({ reportId }),
            signal: wfController.signal,
          })
          clearTimeout(wfTimeout)
          if (wfRes.ok) workflowTriggered = true
          else console.error('免費方案 Workflow 觸發失敗:', await wfRes.text())
        } catch (wfErr) {
          console.error('免費方案 Workflow 觸發異常:', wfErr)
        }

        // Fallback: 直接呼叫 generate-report
        if (!workflowTriggered) {
          try {
            const fbController = new AbortController()
            const fbTimeout = setTimeout(() => fbController.abort(), 8000)
            await fetch(`${siteUrl}/api/generate-report`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
              body: JSON.stringify({ reportId }),
              signal: fbController.signal,
            })
            clearTimeout(fbTimeout)
          } catch (fbErr) {
            console.error('免費方案 Fallback 也失敗:', fbErr)
            await supabase.from('paid_reports').update({
              error_message: `免費方案：Workflow 和 Fallback 都失敗`,
            }).eq('id', reportId)
          }
        }
      }

      return NextResponse.json({ url: `${siteUrl}/dashboard?payment=success&free=1&session_id=${encodeURIComponent(fakeSessionId)}` })
    }

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', `${siteUrl}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`)
    params.set('cancel_url', `${siteUrl}/pricing`)
    params.set('line_items[0][price_data][currency]', 'usd')
    params.set('line_items[0][price_data][product_data][name]', `鑒源命理 - ${plan.name}`)
    params.set('line_items[0][price_data][unit_amount]', finalAmount.toString())
    params.set('line_items[0][quantity]', '1')
    params.set('metadata[plan_code]', planCode)
    if (verifiedCouponCode) params.set('metadata[coupon_code]', verifiedCouponCode)
    if (promoName) params.set('metadata[promotion]', promoName)
    if (verifiedPointsToUse > 0) {
      params.set('metadata[points_used]', verifiedPointsToUse.toString())
      params.set('metadata[points_user_id]', pointsUserId)
    }
    // locale 單獨存，不佔 birth_data 500 字元額度
    if (locale) {
      params.set('metadata[locale]', locale)
    }
    // 將完整 birthData 存入 Supabase checkout_drafts，避免 Stripe metadata 500 字元限制
    if (birthData) {
      const supabase = getSupabase()
      const { data: draft, error: draftErr } = await supabase
        .from('checkout_drafts')
        .insert({
          plan_code: planCode,
          birth_data: birthData,
          locale: locale || 'zh-TW',
        })
        .select('id')
        .single()

      if (draftErr || !draft) {
        console.error('checkout_drafts insert 失敗:', draftErr)
        return NextResponse.json({ error: '暫存資料失敗' }, { status: 500 })
      }

      // Stripe metadata 只存 draft_id（36 字元 UUID，遠低於 500 字元限制）
      params.set('metadata[draft_id]', draft.id)
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await res.json()

    if (!res.ok || !data.url) {
      console.error('Stripe error:', JSON.stringify(data))
      const errMsg = data.error?.message || '建立付款失敗'
      const errParam = data.error?.param || ''
      return NextResponse.json(
        { error: `${errMsg}${errParam ? ` (param: ${errParam})` : ''}`, debug: { status: res.status, stripe_error: data.error } },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: data.url })
  } catch (err) {
    console.error('Checkout error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '系統錯誤' },
      { status: 500 },
    )
  }
}
