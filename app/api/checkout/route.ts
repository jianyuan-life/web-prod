import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendEmailWithRetry } from '@/lib/resend-helper'  // T12b v5.10.370(retry + dead-letter)
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { trackFunnelServer } from '@/lib/funnel-tracker'
import { PLAN_NAMES, PRICE_MAP, isVisiblePlan } from '@/lib/plan-names'  // v5.10.x:PRICE_MAP 移到 lib/plan-names SSOT(原本 inline、違反方案常數不 inline 鐵律)
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)
import {
  G15_SELECTION_COLUMNS,
  getG15ValidationHttpStatus,
  prepareCheckoutBirthData,
} from '@/lib/checkout/prepare-checkout-birth-data'
import {
  G15_CONSENT_RECEIPT_COLUMNS,
  G15_CONSENT_SELECTION_COLUMNS,
} from '@/lib/checkout/g15-independent-consent'
import {
  buildStripeCheckoutSessionParams,
  getCheckoutPaymentPath,
} from '@/lib/checkout/server-checkout-contract'
import { assertConsultationCalculatorReady } from '@/lib/consultation/calculator-readiness.server'
import {
  bindConsultationOrderReleaseContract,
  shouldUseConsultationReportV1,
} from '@/lib/consultation/runtime-config'
import {
  operationalErrorClass,
  operationalFingerprint,
} from '@/lib/security/operational-telemetry'

const CHECKOUT_PROVIDER_ERROR = '目前無法建立付款頁，請稍後再試'
const CHECKOUT_INTERNAL_ERROR = '結帳服務暫時無法使用，請稍後再試'

function getSupabase() {
  return createServiceClient()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { planCode, birthData, totalPrice, locale, couponCode, couponDiscount, userEmail, pointsToUse, checkoutRequestKey } = body

    const plan = PRICE_MAP[planCode]
    if (!plan) {
      return NextResponse.json({ error: '無效的方案代碼' }, { status: 400 })
    }

    // v5.10.467:方案可見性防護(2026-08-01 拍板:對外只售 C/G15/E3、其餘隱藏)
    // 只擋「新購」;既有客戶的報告/儀表板/PDF 不經過此路徑、完全不受影響
    if (!isVisiblePlan(planCode)) {
      return NextResponse.json({ error: '此方案目前未開放購買,歡迎選擇人生藍圖、家族藍圖或月度精選' }, { status: 400 })
    }

    // C/G15 的新報告合約必須由獸立 flag 明確開啟。缺值或 false
    // 都在任何資料庫、點數或 Stripe 作業前停止，不回落舊流程。
    if (
      (planCode === 'C' || planCode === 'G15')
      && !shouldUseConsultationReportV1(planCode)
    ) {
      return NextResponse.json(
        {
          error: '此報告方案目前尚未開放新訂單',
          code: 'CONSULTATION_RELEASE_DISABLED',
        },
        { status: 503 },
      )
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

    // G15 只能使用登入者有權存取的已完成人生藍圖。client 傳入的姓名不可信，
    // 必須以 paid_reports 的明確最小欄位重新驗證與重建。
    const preparedBirthData = await prepareCheckoutBirthData({
      planCode,
      birthData,
      auth: { userId: verifiedUserId, email: verifiedEmail },
      queryReports: async (reportIds) => {
        const { data, error } = await getSupabase()
          .from('paid_reports')
          .select(G15_SELECTION_COLUMNS)
          .in('id', [...reportIds])
        return { data, error }
      },
      queryConsent: async ({ selectionId, purchaserUserId }) => {
        const supabase = getSupabase()
        const selectionResult = await supabase
          .from('g15_consent_selections')
          .select(G15_CONSENT_SELECTION_COLUMNS)
          .eq('id', selectionId)
          .eq('purchaser_user_id', purchaserUserId)
          .maybeSingle()
        if (selectionResult.error || !selectionResult.data) {
          return {
            selection: null,
            receipts: [],
            error: selectionResult.error,
          }
        }
        const receiptsResult = await supabase
          .from('g15_consent_receipts')
          .select(G15_CONSENT_RECEIPT_COLUMNS)
          .eq('selection_id', selectionId)
        return {
          selection: selectionResult.data,
          receipts: receiptsResult.data,
          error: receiptsResult.error,
        }
      },
    })
    if (!preparedBirthData.ok) {
      return NextResponse.json(
        { error: preparedBirthData.message },
        { status: getG15ValidationHttpStatus(preparedBirthData.code) },
      )
    }
    let trustedBirthData = preparedBirthData.birthData as typeof birthData
    if (planCode === 'C' || planCode === 'G15') {
      trustedBirthData = bindConsultationOrderReleaseContract(
        planCode,
        trustedBirthData,
      ) as typeof birthData
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
    const customerEmail = (verifiedEmail || bodyEmail).toLowerCase().trim()
    if (!customerEmail) {
      return NextResponse.json({ error: '請提供 email 或先登入' }, { status: 400 })
    }
    // v5.10.461 D4 修(bizaudit P1:結帳不驗 email 格式 → 打錯信箱付了錢收不到報告):
    //   基本 RFC 格式驗證(qaia P2-2:先 trim、手機自動填字尾端空白不誤擋)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Email 格式不正確、請確認後再試(報告將寄到此信箱)' }, { status: 400 })
    }
    // 拋棄式信箱黑名單(qaia P2-3:只擋訪客新輸入;已登入客戶 email 是既成帳號、擋了無 recourse)
    if (!verifiedEmail) {
      const { isDisposableEmail } = await import('@/lib/disposable-email-domains')
      if (isDisposableEmail(customerEmail)) {
        return NextResponse.json({ error: '請使用常用信箱(暫時性信箱可能收不到報告與後續服務)' }, { status: 400 })
      }
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    const placeholderStripeKey = ['sk', 'test', 'placeholder'].join('_')
    if (!stripeKey || stripeKey === placeholderStripeKey) {
      return NextResponse.json({ error: 'Stripe 尚未設定' }, { status: 500 })
    }

    // C／G15 付款前先以不含客戶資料的固定合成案例驗證 strict producer。
    // 只有 exact-byte 驗章成功且完整通過 15 槽 ledger、coverage 與逐槽
    // provenance 契約的 200 response 才能繼續；此閘必須在任何寫入、
    // 點數扣除與 Stripe session 之前。
    if (planCode === 'C' || planCode === 'G15') {
      try {
        await assertConsultationCalculatorReady()
      } catch {
        return NextResponse.json(
          {
            error: '排盤服務暫時未就緒，請稍後再試',
            code: 'CONSULTATION_CALCULATOR_NOT_READY',
          },
          { status: 503 },
        )
      }
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
      const { data: promo, error: promoError } = await supabase
        .from('promotions')
        .select('name, discount_percent, applicable_plans')
        .eq('is_active', true)
        .lte('start_at', now)
        .gte('end_at', now)
        .order('discount_percent', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (promoError) {
        return NextResponse.json(
          {
            error: '目前無法確認促銷狀態，請稍後再試',
            code: 'PROMOTION_STATE_UNAVAILABLE',
          },
          { status: 503 },
        )
      }

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
      const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.trim().toUpperCase())
        .eq('is_active', true)
        .single()

      if (couponError) {
        return NextResponse.json(
          {
            error: '目前無法確認優惠碼狀態，請稍後再試',
            code: 'COUPON_STATE_UNAVAILABLE',
          },
          { status: 503 },
        )
      }

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
    const promotionAmount = promoDiscountPercent > 0
      ? Math.round(baseAmount * (1 - promoDiscountPercent / 100))
      : baseAmount
    let finalAmount = baseAmount
    if (couponIsFree) {
      // 免費碼優先
      finalAmount = 0
    } else {
      // 計算優惠碼折扣後金額
      let couponAmount = baseAmount
      if (couponDiscountPercent > 0) {
        couponAmount = Math.round(baseAmount * (1 - couponDiscountPercent / 100))
      } else if (couponFixedAmount > 0) {
        couponAmount = Math.max(0, baseAmount - couponFixedAmount)
      }
      // 取較低金額（= 較高折扣）
      finalAmount = Math.min(promotionAmount, couponAmount)

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

    // 促銷與點數的資料來源不在同一個 DB transaction 內。在完成
    // 單一原子定價邊界前明確禁止疊加，不得用促銷後金額推算點數。
    if (
      typeof pointsToUse === 'number'
      && pointsToUse > 0
      && promoDiscountPercent > 0
    ) {
      return NextResponse.json(
        {
          error: '促銷優惠與點數暫不可同時使用',
          code: 'PROMOTION_POINTS_STACKING_UNAVAILABLE',
        },
        { status: 409 },
      )
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
        const { data: pts, error: pointsError } = await supabase
          .from('user_points')
          .select('balance')
          .eq('user_id', verifiedUserId)
          .single()
        if (pointsError) {
          return NextResponse.json(
            {
              error: '目前無法確認積分餘額，請稍後再試',
              code: 'POINTS_STATE_UNAVAILABLE',
            },
            { status: 503 },
          )
        }
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

    const paymentPath = getCheckoutPaymentPath({
      finalAmount,
      verifiedCouponCode,
      verifiedPointsToUse,
    })

    // 免費結帳只支援 C/G15，且所有資料庫變更只能由單一 transaction RPC 完成。
    // E3 的既有 paid path 保持不變；免費 E3 在完成同等原子化前 fail closed。
    if (paymentPath === 'free') {
      if (planCode === 'G15') {
        return NextResponse.json(
          {
            error: '家族藍圖免費結帳尚未與逐位成員同意原子綁定，目前不會建立訂單',
            code: 'G15_FREE_CONSENT_ATOMIC_UNAVAILABLE',
          },
          { status: 503 },
        )
      }
      if (planCode !== 'C' && planCode !== 'G15') {
        return NextResponse.json(
          { error: '此方案暫時無法使用免費結帳，請稍後再試', code: 'FREE_CHECKOUT_UNAVAILABLE' },
          { status: 503 },
        )
      }

      if (!verifiedUserId) {
        return NextResponse.json(
          { error: '免費結帳需要先登入，以確保折抵與訂單歸屬正確', code: 'FREE_CHECKOUT_LOGIN_REQUIRED' },
          { status: 401 },
        )
      }

      if (
        typeof checkoutRequestKey !== 'string'
        || !/^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(checkoutRequestKey)
      ) {
        return NextResponse.json(
          { error: '結帳識別碼無效，請重新整理後再試', code: 'INVALID_CHECKOUT_REQUEST_KEY' },
          { status: 400 },
        )
      }

      const supabase = getSupabase()
      const clientName = trustedBirthData?.plan_type === 'family_reports'
        ? (trustedBirthData?.member_names?.filter(Boolean).join('、') || 'Unknown')
        : (trustedBirthData?.name || 'Unknown')
      const normalizedLocale = typeof locale === 'string' && locale.trim() ? locale.trim() : 'zh-TW'
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
        planCode,
        birthData: trustedBirthData,
        locale: normalizedLocale,
        customerEmail,
        userId: verifiedUserId || null,
        couponCode: verifiedCouponCode || null,
        pointsToUse: verifiedPointsToUse,
        baseAmount,
        clientName,
      })).digest('hex')
      const rpcArgs = {
        p_request_key: checkoutRequestKey,
        p_payload_hash: payloadHash,
        p_plan_code: planCode,
        p_birth_data: trustedBirthData,
        p_locale: normalizedLocale,
        p_customer_email: customerEmail,
        p_user_id: verifiedUserId || null,
        p_coupon_code: verifiedCouponCode || null,
        p_points_to_use: verifiedPointsToUse,
        p_base_amount_cents: baseAmount,
        p_client_name: clientName,
        p_mark_workflow_failed: false,
      }

      let rpcData: unknown
      let rpcError: unknown
      try {
        const result = await supabase.rpc('create_free_checkout_once', rpcArgs)
        rpcData = result.data
        rpcError = result.error
      } catch (rpcTransportError) {
        console.error('[checkout][free] RPC transport failure', {
          errorType: operationalErrorClass(rpcTransportError),
        })
        return NextResponse.json(
          { error: '免費結帳暫時無法完成，請使用相同頁面重試', code: 'FREE_CHECKOUT_RETRY' },
          { status: 503 },
        )
      }

      const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData
      const outcome = typeof rpcRow === 'object' && rpcRow !== null && 'outcome' in rpcRow
        ? String(rpcRow.outcome)
        : ''
      const reportId = typeof rpcRow === 'object' && rpcRow !== null && 'report_id' in rpcRow
        ? String(rpcRow.report_id)
        : ''
      const fakeSessionId = typeof rpcRow === 'object' && rpcRow !== null && 'session_id' in rpcRow
        ? String(rpcRow.session_id)
        : ''
      if (
        rpcError
        || !['applied', 'already'].includes(outcome)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)
        || !/^free_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fakeSessionId)
      ) {
        console.error('[checkout][free] RPC rejected or returned an ambiguous result')
        return NextResponse.json(
          { error: '免費結帳暫時無法完成，請使用相同頁面重試', code: 'FREE_CHECKOUT_RETRY' },
          { status: 503 },
        )
      }

      let workflowStarted = false
      const cronSecret = process.env.CRON_SECRET
      if (typeof cronSecret === 'string' && cronSecret.trim()) {
        try {
          const wfController = new AbortController()
          const wfTimeout = setTimeout(() => wfController.abort(), 5000)
          const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': cronSecret },
            body: JSON.stringify({ reportId }),
            signal: wfController.signal,
          })
          clearTimeout(wfTimeout)
          const wfBody = await wfRes.json().catch(() => null) as { success?: unknown; runId?: unknown; skipped?: unknown } | null
          workflowStarted = wfRes.ok
            && wfBody?.success === true
            && ((typeof wfBody.runId === 'string' && wfBody.runId.length > 0) || wfBody.skipped === true)
        } catch (wfErr) {
          console.error('[checkout][free-workflow] trigger exception', {
            errorType: operationalErrorClass(wfErr),
          })
        }
      }

      if (!workflowStarted) {
        try {
          await supabase.rpc('create_free_checkout_once', {
            ...rpcArgs,
            p_mark_workflow_failed: true,
          })
        } catch { /* retry remains safe through the same idempotency key */ }
        return NextResponse.json(
          { error: '訂單已安全保留，但報告尚未啟動；請按原頁面重試', code: 'FREE_WORKFLOW_RETRY' },
          { status: 503 },
        )
      }

      // 只有 durable workflow 明確接受後才寄出已接單通知。
      if (customerEmail) {
        const planName = PLAN_NAMES[planCode] || planCode
        const freeSubject = verifiedCouponCode
          ? `已收到您的訂單 — ${planName}（優惠碼 ${verifiedCouponCode}）`
          : `已收到您的訂單 — ${planName}（積分折抵）`
        try {
          // T12b v5.10.370 — sendEmailWithRetry 取代 raw new Resend + send
          // helper 自動 record + dead-letter、本處不再手動 recordEmailSend
          const freeSendResult = await sendEmailWithRetry({
            from: '鑒源命理 <noreply@jianyuan.life>',
            to: customerEmail,
            emailType: 'checkout_receipt',
            reportId: reportId || null,
            metadata: { plan: planCode, free: true, coupon: verifiedCouponCode || null },
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
          // T12b v5.10.370 — sendEmailWithRetry 已自動 record + dead-letter
          // freeSendResult.success / .resendId / .attempts / .error 已寫進 email_send_log
          if (!freeSendResult.success) {
            console.warn('[checkout][free-send] dead-letter', {
              reportFingerprint: operationalFingerprint(reportId),
              attempts: freeSendResult.attempts,
            })
          }
        } catch (freeErr) {
          // sendEmailWithRetry 內部已 catch + dead-letter、外層 try-catch 只接 import 失敗等 fatal
          console.error('[checkout][free-send] fatal', {
            errorType: operationalErrorClass(freeErr),
          })
          /* 確認信失敗不影響報告生成 */
        }
      }

      return NextResponse.json({ url: `${siteUrl}/dashboard?payment=success&free=1&session_id=${encodeURIComponent(fakeSessionId)}` })
    }

    // Stripe sessions without a money-equivalent reservation retain their
    // existing producer contract. C/G15 always use the durable path below;
    // other plans join it only when a paid coupon is actually reserved.
    // Stripe session legacy producer boundary (no coupon/points reservation).
    const requiresPaidReservation = (
      planCode === 'C'
      || planCode === 'G15'
      || Boolean(verifiedCouponCode)
      || verifiedPointsToUse > 0
    )
    if (!requiresPaidReservation) {
      const params = buildStripeCheckoutSessionParams({
        siteUrl,
        planCode,
        planName: plan.name,
        finalAmount,
        customerEmail,
        verifiedUserId,
        verifiedCouponCode,
        promotionName: promoName,
        verifiedPointsToUse,
        pointsUserId,
        locale,
      })
      if (trustedBirthData) {
        const { data: draft, error: draftErr } = await getSupabase()
          .from('checkout_drafts')
          .insert({
            plan_code: planCode,
            birth_data: trustedBirthData,
            locale: locale || 'zh-TW',
          })
          .select('id')
          .single()
        if (draftErr || !draft?.id) {
          return NextResponse.json(
            { error: CHECKOUT_INTERNAL_ERROR, code: 'CHECKOUT_DRAFT_UNAVAILABLE' },
            { status: 500 },
          )
        }
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
        const providerErrorType = typeof data?.error?.type === 'string'
          ? operationalErrorClass(data.error.type)
          : 'StripeProviderError'
        const providerRequestFingerprint = operationalFingerprint(
          res.headers.get('request-id') || data?.request_log_url || `${res.status}:${planCode}`,
        )
        console.error('[checkout][stripe] provider request failed', {
          status: res.status,
          errorType: providerErrorType,
          requestFingerprint: providerRequestFingerprint,
        })
        try {
          const { notifyStripeFailed } = await import('@/lib/ai/observability/telegram')
          void notifyStripeFailed(providerRequestFingerprint, providerErrorType)
        } catch { /* ignore */ }
        return NextResponse.json(
          { error: CHECKOUT_PROVIDER_ERROR, code: 'CHECKOUT_PROVIDER_UNAVAILABLE' },
          { status: 500 },
        )
      }
      if (!/^cs_(test|live)_[A-Za-z0-9_]{10,220}$/.test(String(data.id || ''))) {
        return NextResponse.json(
          { error: CHECKOUT_PROVIDER_ERROR, code: 'CHECKOUT_PROVIDER_UNAVAILABLE' },
          { status: 500 },
        )
      }
      try {
        await trackFunnelServer({
          sessionId: data.id,
          step: 'begin_payment',
          planCode,
          userId: pointsUserId || null,
          amountUsd: isVariablePrice ? Number(totalPrice || 0) : ((plan as { amount?: number; price?: number } | undefined)?.amount || (plan as { amount?: number; price?: number } | undefined)?.price || 0),
          metadata: { stripe_session: data.id, coupon: null },
        })
      } catch { /* tracking is non-blocking */ }
      return NextResponse.json({ url: data.url })
    }

    // Value-bearing paid Sessions receive a durable request identity. This
    // preserves the exact provider body and removes email/user/points PII from
    // Stripe metadata: webhook authority comes from the protected DB ledger.
    if (
      typeof checkoutRequestKey !== 'string'
      || !/^jyco_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(checkoutRequestKey)
    ) {
      return NextResponse.json(
        { error: '結帳識別碼無效，請重新整理後再試', code: 'INVALID_CHECKOUT_REQUEST_KEY' },
        { status: 400 },
      )
    }
    if (verifiedPointsToUse > 0 && (planCode !== 'C' && planCode !== 'G15')) {
      return NextResponse.json(
        { error: '此方案暫時無法使用積分折抵', code: 'PAID_POINTS_UNAVAILABLE' },
        { status: 409 },
      )
    }
    if (planCode === 'G15' && !verifiedUserId) {
      return NextResponse.json(
        { error: '家族藍圖結帳需要登入', code: 'G15_CHECKOUT_RESERVATION_CONFLICT' },
        { status: 409 },
      )
    }

    const checkoutNowEpochSeconds = Math.floor(Date.now() / 1000)
    const normalizedLocale = typeof locale === 'string' && locale.trim() ? locale.trim() : 'zh-TW'
    const normalizedG15Locale = normalizedLocale
    const createPaidCheckoutDraft = planCode !== 'G15'
    const paidReservationTtlSeconds = 35 * 60
    const paidPayloadHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
      planCode,
      siteUrl,
      planName: plan.name,
      promotionName: promoName || null,
      promotionAmount,
      birthData: trustedBirthData,
      locale: normalizedLocale,
      customerEmail,
      checkoutUserId: verifiedUserId || null,
      couponCode: verifiedCouponCode || null,
      pointsUserId: verifiedPointsToUse > 0 ? pointsUserId : null,
      pointsAmount: verifiedPointsToUse,
      baseAmount,
      finalAmount,
      createPaidCheckoutDraft,
      paidReservationTtlSeconds,
    })).digest('hex')}`
    const requestedReservationExpiresAt = new Date(
      (checkoutNowEpochSeconds + paidReservationTtlSeconds) * 1000,
    ).toISOString()
    const supabase = getSupabase()
    const { data: paidReservationData, error: paidReservationError } = await supabase.rpc(
      'reserve_paid_checkout_value',
      {
        p_request_key: checkoutRequestKey,
        p_payload_hash: paidPayloadHash,
        p_plan_code: planCode,
        p_checkout_user_id: verifiedUserId || null,
        p_coupon_code: verifiedCouponCode || null,
        p_points_user_id: verifiedPointsToUse > 0 ? pointsUserId : null,
        p_points_amount: verifiedPointsToUse,
        p_birth_data: trustedBirthData,
        p_locale: normalizedLocale,
        p_base_amount_cents: baseAmount,
        p_promotion_amount_cents: promotionAmount,
        p_final_amount_cents: finalAmount,
        p_create_checkout_draft: createPaidCheckoutDraft,
        p_expires_at: requestedReservationExpiresAt,
      },
    )
    const paidReservation = Array.isArray(paidReservationData)
      ? paidReservationData[0]
      : paidReservationData
    const expectedResourceKind = verifiedCouponCode
      ? 'coupon'
      : verifiedPointsToUse > 0 ? 'points' : 'none'
    const abandonPaidReservationBeforeProvider = async () => {
      try {
        const { data, error } = await supabase.rpc('abandon_paid_checkout_before_provider', {
          p_request_key: checkoutRequestKey,
          p_payload_hash: paidPayloadHash,
        })
        const receipt = Array.isArray(data) ? data[0] : data
        return !error
          && ['abandoned', 'already_released'].includes(String(receipt?.outcome))
          && receipt?.request_key === checkoutRequestKey
          && receipt?.resource_kind === expectedResourceKind
      } catch {
        return false
      }
    }
    const reservedCouponValue = Number(paidReservation?.coupon_discount_value)
    const reservationResourceShapeValid = (
      expectedResourceKind === 'none'
      && paidReservation?.coupon_code === null
      && paidReservation?.coupon_discount_type === null
      && paidReservation?.coupon_discount_value === null
      && paidReservation?.points_user_id === null
      && paidReservation?.points_amount === null
    ) || (
      expectedResourceKind === 'coupon'
      && paidReservation?.coupon_code === verifiedCouponCode
      && ['percentage', 'fixed'].includes(String(paidReservation?.coupon_discount_type))
      && Number.isFinite(reservedCouponValue)
      && reservedCouponValue > 0
      && (paidReservation?.coupon_discount_type !== 'percentage' || reservedCouponValue <= 100)
      && paidReservation?.points_user_id === null
      && paidReservation?.points_amount === null
    ) || (
      expectedResourceKind === 'points'
      && paidReservation?.coupon_code === null
      && paidReservation?.coupon_discount_type === null
      && paidReservation?.coupon_discount_value === null
      && paidReservation?.points_user_id === pointsUserId
      && paidReservation?.points_amount === verifiedPointsToUse
    )
    let checkoutDraftId = typeof paidReservation?.checkout_draft_id === 'string'
      ? paidReservation.checkout_draft_id.toLowerCase()
      : ''
    const paidReservationExpiresAt = typeof paidReservation?.reservation_expires_at === 'string'
      ? paidReservation.reservation_expires_at
      : ''
    const paidReservationExpiresEpochSeconds = Date.parse(paidReservationExpiresAt) / 1000
    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    if (
      paidReservationError
      || !['reserved', 'already_reserved', 'already_bound'].includes(String(paidReservation?.outcome))
      || paidReservation?.request_key !== checkoutRequestKey
      || paidReservation?.resource_kind !== expectedResourceKind
      || paidReservation?.checkout_user_id !== (verifiedUserId || null)
      || !reservationResourceShapeValid
      || (planCode !== 'G15' && !validUuid.test(checkoutDraftId))
      || !Number.isInteger(paidReservationExpiresEpochSeconds)
      || paidReservationExpiresEpochSeconds <= checkoutNowEpochSeconds
    ) {
      await abandonPaidReservationBeforeProvider()
      return NextResponse.json(
        { error: '付款額度目前無法安全保留，請使用相同頁面重試', code: 'PAID_CHECKOUT_RESERVATION_CONFLICT' },
        { status: 503 },
      )
    }

    let g15ReservationId = ''
    let g15ReservationReportId = ''
    let g15ReservationExpiresEpochSeconds = paidReservationExpiresEpochSeconds
    if (planCode === 'G15') {
      g15ReservationId = checkoutRequestKey.slice('jyco_'.length)
      const g15PayloadHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
        planCode,
        siteUrl,
        planName: plan.name,
        promotionName: promoName,
        birthData: trustedBirthData,
        locale: normalizedLocale,
        customerEmail,
        verifiedUserId,
        verifiedCouponCode: verifiedCouponCode || null,
        verifiedPointsToUse,
        finalAmount,
      })).digest('hex')}`
      const { data: reservationData, error: reservationError } = await supabase.rpc(
        'reserve_g15_consent_for_checkout',
        {
          p_selection_id: trustedBirthData.consent_selection_id,
          p_purchaser_user_id: verifiedUserId,
          p_reservation_id: g15ReservationId,
          p_request_payload_hash: g15PayloadHash,
          p_birth_data: trustedBirthData,
          p_locale: normalizedLocale,
          p_expires_at: paidReservationExpiresAt,
        },
      )
      const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData
      checkoutDraftId = typeof reservation?.checkout_draft_id === 'string'
        ? reservation.checkout_draft_id.toLowerCase()
        : ''
      g15ReservationReportId = typeof reservation?.report_id === 'string'
        ? reservation.report_id.toLowerCase()
        : ''
      const g15ExpiresAt = typeof reservation?.reservation_expires_at === 'string'
        ? reservation.reservation_expires_at
        : ''
      g15ReservationExpiresEpochSeconds = Date.parse(g15ExpiresAt) / 1000
      if (
        reservationError
        || !['reserved', 'already_reserved', 'already_bound'].includes(String(reservation?.outcome))
        || reservation?.reservation_id !== g15ReservationId
        || !validUuid.test(checkoutDraftId)
        || !validUuid.test(g15ReservationReportId)
        || !Number.isInteger(g15ReservationExpiresEpochSeconds)
        || Date.parse(g15ExpiresAt) !== Date.parse(paidReservationExpiresAt)
      ) {
        await abandonPaidReservationBeforeProvider()
        return NextResponse.json(
          { error: '這份家族同意已被另一個結帳流程保留，請回原頁面繼續', code: 'G15_CHECKOUT_RESERVATION_CONFLICT' },
          { status: 409 },
        )
      }
    }

    const params = buildStripeCheckoutSessionParams({
      siteUrl,
      planCode,
      planName: plan.name,
      finalAmount,
      customerEmail,
      verifiedUserId,
      verifiedCouponCode,
      promotionName: promoName,
      verifiedPointsToUse,
      pointsUserId,
      locale: planCode === 'G15' ? normalizedG15Locale : locale,
      nowEpochSeconds: checkoutNowEpochSeconds,
    })
    params.set('expires_at', String(g15ReservationExpiresEpochSeconds))
    params.set('metadata[draft_id]', checkoutDraftId)
    params.delete('metadata[login_email]')
    params.delete('metadata[login_user_id]')
    params.delete('metadata[points_used]')
    params.delete('metadata[points_user_id]')
    params.set('metadata[paid_checkout_contract]', 'v1')
    params.set('metadata[paid_checkout_request_key]', checkoutRequestKey)
    if (planCode === 'G15') {
      params.set('metadata[g15_consent_reservation_id]', g15ReservationId)
      params.set('metadata[g15_report_id]', g15ReservationReportId)
    }

    const { data: frozenData, error: frozenError } = await supabase.rpc(
      'freeze_paid_checkout_session',
      {
        p_request_key: checkoutRequestKey,
        p_payload_hash: paidPayloadHash,
        p_checkout_draft_id: checkoutDraftId,
        p_stripe_request_body: params.toString(),
      },
    )
    const frozen = Array.isArray(frozenData) ? frozenData[0] : frozenData
    const frozenBody = typeof frozen?.stripe_request_body === 'string'
      ? frozen.stripe_request_body
      : ''
    const frozenParams = new URLSearchParams(frozenBody)
    if (
      frozenError
      || !['prepared', 'already_prepared'].includes(String(frozen?.outcome))
      || frozen?.request_key !== checkoutRequestKey
      || frozen?.checkout_draft_id !== checkoutDraftId
      || Date.parse(String(frozen?.reservation_expires_at || '')) !== Date.parse(paidReservationExpiresAt)
      || frozenParams.get('metadata[paid_checkout_contract]') !== 'v1'
      || frozenParams.get('metadata[paid_checkout_request_key]') !== checkoutRequestKey
      || frozenParams.get('metadata[draft_id]') !== checkoutDraftId
      || frozenParams.get('expires_at') !== String(paidReservationExpiresEpochSeconds)
    ) {
      await abandonPaidReservationBeforeProvider()
      return NextResponse.json(
        { error: '付款請求目前無法安全重播，請稍後再試', code: 'PAID_CHECKOUT_BODY_CONFLICT' },
        { status: 503 },
      )
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': planCode === 'G15'
          ? `jianyuan-g15-${g15ReservationId}`
          : `jianyuan-paid-${checkoutRequestKey.slice('jyco_'.length)}`,
      },
      body: frozenBody,
    })

    const data = await res.json()

    if (
      !res.ok
      || !data.url
      || !/^cs_(test|live)_[A-Za-z0-9_]{10,220}$/.test(String(data.id || ''))
    ) {
      const providerErrorType = typeof data?.error?.type === 'string'
        ? operationalErrorClass(data.error.type)
        : 'StripeProviderError'
      const providerRequestFingerprint = operationalFingerprint(
        res.headers.get('request-id') || data?.request_log_url || `${res.status}:${planCode}`,
      )
      console.error('[checkout][stripe] provider request failed', {
        status: res.status,
        errorType: providerErrorType,
        requestFingerprint: providerRequestFingerprint,
      })
      // Stripe failed → Telegram 告警（非同步，不阻塞 response）
      try {
        const { notifyStripeFailed } = await import('@/lib/ai/observability/telegram')
        void notifyStripeFailed(
          providerRequestFingerprint,
          providerErrorType,
        )
      } catch { /* ignore */ }
      return NextResponse.json(
        { error: CHECKOUT_PROVIDER_ERROR, code: 'CHECKOUT_PROVIDER_UNAVAILABLE' },
        { status: 500 },
      )
    }

    const expireUnusableStripeSession = async () => {
      try {
        await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(String(data.id))}/expire`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        })
      } catch { /* fail closed: URL is never returned */ }
    }

    const { data: paidBindingData, error: paidBindingError } = await supabase.rpc(
      'bind_paid_checkout_session',
      {
        p_request_key: checkoutRequestKey,
        p_payload_hash: paidPayloadHash,
        p_stripe_session_id: data.id,
      },
    )
    const paidBinding = Array.isArray(paidBindingData) ? paidBindingData[0] : paidBindingData
    if (
      paidBindingError
      || !['bound', 'already_bound'].includes(String(paidBinding?.outcome))
      || paidBinding?.request_key !== checkoutRequestKey
      || paidBinding?.checkout_draft_id !== checkoutDraftId
      || paidBinding?.stripe_session_id !== data.id
    ) {
      await expireUnusableStripeSession()
      return NextResponse.json(
        { error: '目前無法安全綁定付款頁，請稍後再試', code: 'PAID_CHECKOUT_BINDING_CONFLICT' },
        { status: 503 },
      )
    }

    if (planCode === 'G15') {
      const { data: bindingData, error: bindingError } = await supabase.rpc(
        'bind_g15_checkout_consent_session',
        {
          p_reservation_id: g15ReservationId,
          p_purchaser_user_id: verifiedUserId,
          p_stripe_session_id: data.id,
        },
      )
      const binding = Array.isArray(bindingData) ? bindingData[0] : bindingData
      if (
        bindingError
        || !['bound', 'already_bound'].includes(String(binding?.outcome))
        || binding?.reservation_id !== g15ReservationId
        || binding?.checkout_draft_id !== checkoutDraftId
        || binding?.report_id !== g15ReservationReportId
      ) {
        // 不把未綁定的付款 URL 交給客戶。終止失敗時仍保留
        // reservation，provider webhook 也無法繞過綁定閨門生成報告。
        await expireUnusableStripeSession()
        return NextResponse.json(
          { error: '目前無法安全綁定付款頁，請稍後再試', code: 'G15_CHECKOUT_RESERVATION_CONFLICT' },
          { status: 503 },
        )
      }
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
    console.error('[checkout] internal failure', {
      errorType: operationalErrorClass(err),
      errorFingerprint: operationalFingerprint(
        err instanceof Error ? `${err.name}:${err.message}` : typeof err,
      ),
    })
    return NextResponse.json(
      { error: CHECKOUT_INTERNAL_ERROR, code: 'CHECKOUT_INTERNAL_FAILURE' },
      { status: 500 },
    )
  }
}
