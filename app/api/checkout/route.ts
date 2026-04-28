import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { recordEmailSend } from '@/lib/email-send-log'
import { trackFunnelServer } from '@/lib/funnel-tracker'

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
  // v5.3.53 E 系列四方案定價（對應 pricing page 和 checkout types）
  E1: { amount: 5900, name: '事件擇吉' },     // v5.7.6 命名統一(原「事件出門訣」)
  E2: { amount: 2900, name: '月度單盤' },     // v5.7.6 命名統一(原「月度出門訣」)
  E3: { amount: 8900, name: '月度精選' },     // v5.7.6 命名統一(原「週度補運」、實為當月 8 吉時)
  E4: { amount: 27900, name: '年度全運' },    // v5.7.6 命名統一(原「年度方案」)
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

    // v5.3.70 解除 E1-E4 維護擋
    // 奇門排盤引擎已通過 20 組 Windada+奇門派黃金樣本驗證（19/20 完美匹配、95.0% 一致率）
    // C16（2026-07-23 大暑日當天符頭+4 天未過節氣）為拆補法極端邊緣案例、留 Known Issue

    // v5.3.51 容量監控：結帳前檢查系統負載
    const { checkCapacity } = await import('@/lib/capacity-monitor')
    const cap = await checkCapacity(planCode)
    if (!cap.allowed) {
      return NextResponse.json(
        { error: cap.message, capacity_mode: cap.mode },
        { status: 503 }
      )
    }

    // 從 Authorization header 或 cookie 取得 Supabase access token
    // 優先用 Authorization header（因為 Supabase 前端用 localStorage 存 token，不是 cookie）
    let authAccessToken = ''
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader.startsWith('Bearer ') && authHeader.length > 30) {
      authAccessToken = authHeader.slice(7)
    }
    // Fallback: 嘗試從 cookie 取得（某些環境可能有 cookie）
    if (!authAccessToken) {
      try {
        const cookies = req.headers.get('cookie') || ''
        const accessTokenMatch = cookies.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/)
        if (accessTokenMatch) {
          const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]))
          const token = Array.isArray(tokenData) ? tokenData[0] : tokenData?.access_token || tokenData
          if (typeof token === 'string' && token.length > 20) {
            authAccessToken = token
          }
        }
      } catch { /* cookie 解析失敗 */ }
    }

    // 用取得的 token 驗證用戶身份
    let verifiedEmail = ''
    let verifiedUserId = ''
    if (authAccessToken) {
      try {
        const supabaseAuth = getSupabase()
        const { data } = await supabaseAuth.auth.getUser(authAccessToken)
        if (data?.user?.email) verifiedEmail = data.user.email
        if (data?.user?.id) verifiedUserId = data.user.id
      } catch { /* auth 驗證失敗，當訪客處理 */ }
    }
    // v5.6.10 安全強化(對應 Codex audit P0):
    // - 已登入用戶:body 傳的 email 必須跟 verified email 一致、否則拒(防假冒他人下單)
    // - 未登入訪客:用 body 的 userEmail / birthData.email(保留 guest checkout funnel)
    const bodyEmail = (userEmail || birthData?.email || '').toLowerCase().trim()
    if (verifiedEmail) {
      const verifiedLower = verifiedEmail.toLowerCase()
      if (bodyEmail && bodyEmail !== verifiedLower) {
        return NextResponse.json(
          { error: '無權代他人下單;登入帳號 email 與表單 email 不符' },
          { status: 403 }
        )
      }
    }
    const customerEmail = (verifiedEmail || bodyEmail).toLowerCase()
    if (!customerEmail) {
      return NextResponse.json({ error: '請提供 email 或先登入' }, { status: 400 })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      return NextResponse.json({ error: 'Stripe 尚未設定' }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'

    // G15 家族藍圖：固定 $59，不再按人數加價
    // R 方案：可加人（前端傳 totalPrice），後端必須驗證人數 × 單價
    // 其他方案：使用固定金額
    const isVariablePrice = planCode === 'R' && typeof totalPrice === 'number'
    let baseAmount = isVariablePrice
      ? Math.round(totalPrice * 100)
      : plan.amount

    // R 方案：嚴格驗證人數 × 單價（防價格篡改）
    // 規則：基本 $59（含 2 人），第 3 人起每人 +$19，最多 6 人
    if (planCode === 'R') {
      const rAddPrice = PRICE_MAP['R-ADD'].amount // $19/人
      const R_MIN_MEMBERS = 2
      const R_MAX_MEMBERS = 6

      // 從 birthData.members 取得實際人數
      const members = Array.isArray(birthData?.members) ? birthData.members : []
      const memberCount = members.length

      if (memberCount < R_MIN_MEMBERS || memberCount > R_MAX_MEMBERS) {
        return NextResponse.json({ error: `合否？方案人數需在 ${R_MIN_MEMBERS} 至 ${R_MAX_MEMBERS} 人之間（實際：${memberCount} 人）` }, { status: 400 })
      }

      // 後端計算應付金額：基本價 + (人數 - 2) × 每人加價
      const extraCount = memberCount - R_MIN_MEMBERS
      const expectedAmount = plan.amount + extraCount * rAddPrice

      // 驗證前端傳來的金額必須 === 後端計算的金額（防篡改）
      if (baseAmount !== expectedAmount) {
        console.error(`R 方案金額篡改警告：前端 ${baseAmount}，後端計算 ${expectedAmount}，人數 ${memberCount}`)
        // 強制使用後端計算的金額（不信任前端）
        baseAmount = expectedAmount
      }
    } else if (baseAmount < plan.amount) {
      // 其他方案：金額不得低於方案定價
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

    // Stripe 最低金額：USD $0.50（50 cents），若最終金額 > 0 但 < 50 cents 會被 Stripe 拒絕
    // 參考：https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
    const STRIPE_MIN_CHARGE_CENTS = 50

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

      // 防守：若優惠碼/促銷折抵後金額落在 (0, 50) cents 區間，Stripe 會拒絕
      // 視為折抵到免費處理（一般 $39 以上方案用常見折扣不會觸發，但 fixed 折扣或極端 percentage 可能）
      if (finalAmount > 0 && finalAmount < STRIPE_MIN_CHARGE_CENTS) {
        console.warn(`優惠/促銷後金額 ${finalAmount} cents < Stripe 最低 ${STRIPE_MIN_CHARGE_CENTS} cents，已拉平至 0（視為免費）`)
        finalAmount = 0
        // 若沒有優惠碼但促銷把價格壓到 < 50 cents，仍需走免費流程 → 補記一個識別碼
        if (!couponIsFree && !verifiedCouponCode) {
          couponIsFree = true
        }
      }
    }

    // 4. 點數折抵（與優惠碼互斥，前端控制；後端再驗證）
    let verifiedPointsToUse = 0
    let pointsUserId = ''
    if (pointsToUse && pointsToUse > 0 && !verifiedCouponCode && finalAmount > 0) {
      const supabase = getSupabase()
      // 使用前面已驗證的用戶 ID（從 Authorization header 或 cookie 取得）
      if (verifiedUserId) {
        pointsUserId = verifiedUserId
        // 驗證餘額
        const { data: pts } = await supabase.from('user_points').select('balance').eq('user_id', verifiedUserId).single()
        const balance = pts?.balance || 0
        // 1 點 = $1 = 100 cents；最多折抵到 finalAmount 全額（整除上取，避免丟精度）
        // 原本 Math.floor(finalAmount/100) 在 finalAmount 不是 100 倍數時會少扣一點，
        // 造成剩餘金額 < $0.50 被 Stripe 拒絕。改用「可用點數上限 = 能把金額扣到 0 的最少點數」
        const maxPointsToZero = Math.ceil(finalAmount / 100) // 扣完剩 <= 0
        const maxPoints = Math.min(maxPointsToZero, balance)
        verifiedPointsToUse = Math.min(pointsToUse, maxPoints)

        if (verifiedPointsToUse > 0) {
          const discountCents = verifiedPointsToUse * 100
          const newAmount = finalAmount - discountCents

          if (newAmount <= 0) {
            // 完全折抵：金額歸 0，走免費流程
            finalAmount = 0
          } else if (newAmount < STRIPE_MIN_CHARGE_CENTS) {
            // 折抵後剩餘 < $0.50，Stripe 會拒絕。兩種處理：
            // (a) 若用戶餘額夠再多扣 1 點，把金額扣到 0（最慷慨、用戶體驗最好）
            // (b) 若用戶餘額不夠，退回無折抵狀態（保留完整扣款）
            const extraNeeded = 1
            if (balance >= verifiedPointsToUse + extraNeeded) {
              verifiedPointsToUse += extraNeeded
              finalAmount = 0
            } else {
              // 回退：取消本次積分折抵（避免觸發 Stripe 最低金額限制）
              console.warn(`積分折抵後金額 ${newAmount} cents < Stripe 最低 ${STRIPE_MIN_CHARGE_CENTS} cents，且餘額不足多扣 1 點，已取消折抵`)
              verifiedPointsToUse = 0
              // finalAmount 不變
            }
          } else {
            // 正常情況：扣款後金額 >= $0.50
            finalAmount = newAmount
          }
        }
      }
    }

    // 免費方案（優惠碼或積分全額折抵）：跳過 Stripe，直接建立訂單
    if (finalAmount === 0 && (verifiedCouponCode || verifiedPointsToUse > 0)) {
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
        user_id: verifiedUserId || null, // v5.3.22：明確記錄下單用戶身份
      }).select('id').single()

      const reportId = reportData?.id || ''

      // 記錄優惠碼使用
      if (verifiedCouponCode) {
        const { data: couponRow } = await supabase.from('coupons').select('id, used_count').eq('code', verifiedCouponCode).single()
        if (couponRow) {
          await supabase.from('coupons').update({ used_count: (couponRow.used_count || 0) + 1 }).eq('id', couponRow.id)
          await supabase.from('coupon_uses').insert({
            coupon_id: couponRow.id, coupon_code: verifiedCouponCode,
            order_id: fakeSessionId, customer_email: customerEmail,
            plan_code: planCode, original_amount: baseAmount / 100, discount_applied: baseAmount / 100,
          })
        }
      }

      // 積分全額折抵：直接扣除積分（不經過 Stripe webhook）
      if (verifiedPointsToUse > 0 && pointsUserId) {
        const { data: pts } = await supabase
          .from('user_points')
          .select('balance, total_used')
          .eq('user_id', pointsUserId)
          .gte('balance', verifiedPointsToUse)
          .single()

        if (pts) {
          const newBalance = pts.balance - verifiedPointsToUse
          const { error: updateErr } = await supabase
            .from('user_points')
            .update({
              balance: newBalance,
              total_used: (pts.total_used || 0) + verifiedPointsToUse,
            })
            .eq('user_id', pointsUserId)
            .gte('balance', verifiedPointsToUse)

          if (!updateErr) {
            const PLAN_NAMES_PTS: Record<string, string> = { C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運' }
            await supabase.from('point_transactions').insert({
              user_id: pointsUserId,
              type: 'use_checkout',
              amount: -verifiedPointsToUse,
              balance_after: newBalance,
              description: `${PLAN_NAMES_PTS[planCode] || planCode} 訂單折抵`,
              reference_id: fakeSessionId,
            })
            console.info(`✅ 積分全額折抵扣除：${pointsUserId} -${verifiedPointsToUse}點，餘額 ${newBalance}`)
          }
        }
      }

      // 免費方案也發訂單確認信
      if (customerEmail) {
        const PLAN_NAMES: Record<string, string> = { C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運' }
        const planName = PLAN_NAMES[planCode] || planCode
        const freeSubject = verifiedCouponCode
          ? `已收到您的訂單 — ${planName}（優惠碼 ${verifiedCouponCode}）`
          : `已收到您的訂單 — ${planName}（積分折抵）`
        try {
          const resend = new Resend(process.env.RESEND_API_KEY || '')
          const freeRes = await resend.emails.send({
            from: '鑒源命理 <noreply@jianyuan.life>',
            to: customerEmail,
            subject: freeSubject,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #333;">
                <h2 style="color: #1a1a2e; margin-bottom: 16px;">感謝您的購買</h2>
                <p>您好，</p>
                <p>${verifiedCouponCode
                  ? `您使用優惠碼 <strong>${verifiedCouponCode}</strong> 免費獲得了<strong>「${planName}」</strong>，系統正在啟動分析。`
                  : `您使用積分折抵了<strong>「${planName}」</strong>，系統正在啟動分析。`
                }</p>
                <p style="background: #f8f6f0; padding: 16px; border-radius: 8px; border-left: 3px solid #c9a84c;">
                  報告預計 <strong>30-60 分鐘</strong>內完成。完成後會再寄信通知您。
                </p>
                <p style="margin-top: 24px;">
                  <a href="${siteUrl}/dashboard" style="display: inline-block; background: #c9a84c; color: #1a1a2e; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">查看報告進度</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                <p style="font-size: 12px; color: #999;">鑒源命理 jianyuan.life</p>
                ${getUnsubscribeHtml(customerEmail)}
              </div>
            `,
          })
          await recordEmailSend({
            resendId: (freeRes as unknown as { data?: { id?: string } })?.data?.id || null,
            toEmail: customerEmail,
            fromEmail: '鑒源命理 <noreply@jianyuan.life>',
            emailType: 'welcome',
            subject: freeSubject,
            reportId: reportId || null,
            status: 'sent',
            metadata: { plan: planCode, free: true, coupon: verifiedCouponCode || null },
          })
        } catch (freeErr) {
          await recordEmailSend({
            toEmail: customerEmail,
            emailType: 'welcome',
            subject: freeSubject,
            reportId: reportId || null,
            status: 'failed',
            errorMessage: freeErr instanceof Error ? freeErr.message : String(freeErr),
            metadata: { plan: planCode, free: true },
          })
          /* 確認信失敗不影響報告生成 */
        }
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
    // v5.3.22 P0 隱私修復：Stripe session 強制設定登入用戶的 email
    //   → webhook 接收時 session.customer_email 會有值，不用 fallback 到信用卡 email
    //   → 避免「老公刷卡幫老婆買」→ 報告記到老公 email → 個資外洩給老公
    if (customerEmail) {
      params.set('customer_email', customerEmail)
    }
    params.set('metadata[plan_code]', planCode)
    // v5.3.22：審計軌跡 — 記錄登入用戶的 email 和 user_id 到 Stripe metadata
    if (customerEmail) params.set('metadata[login_email]', customerEmail)
    if (verifiedUserId) params.set('metadata[login_user_id]', verifiedUserId)
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
      // Stripe failed → Telegram 告警（非同步，不阻塞 response）
      try {
        const { notifyStripeFailed } = await import('@/lib/ai/observability/telegram')
        void notifyStripeFailed(
          data.id || 'session-creation-failed',
          `${errMsg}${errParam ? ` (param: ${errParam})` : ''}`,
        )
      } catch { /* ignore */ }
      return NextResponse.json(
        { error: `${errMsg}${errParam ? ` (param: ${errParam})` : ''}`, debug: { status: res.status, stripe_error: data.error } },
        { status: 500 },
      )
    }

    // 成功建立 Stripe session → 追 begin_payment 事件
    try {
      const sid = data.id || String(Date.now())
      await trackFunnelServer({
        sessionId: sid,
        step: 'begin_payment',
        planCode,
        userId: pointsUserId || null,
        amountUsd: isVariablePrice ? Number(totalPrice || 0) : ((plan as { amount?: number; price?: number } | undefined)?.amount || (plan as { amount?: number; price?: number } | undefined)?.price || 0),
        metadata: { stripe_session: sid, coupon: verifiedCouponCode || null },
      })
    } catch { /* 追蹤失敗不阻塞 */ }

    return NextResponse.json({ url: data.url })
  } catch (err) {
    console.error('Checkout error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '系統錯誤' },
      { status: 500 },
    )
  }
}
