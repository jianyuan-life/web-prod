// Stripe Refund API（L7 P0 修復 2026-04-17）
// POST /api/admin/refund
// Headers: x-admin-key
// Body: { reportId: string, amount?: number (USD, 可選=全額退), reason?: string }
//
// 執行：
// 1. 查 paid_reports 取 stripe_session_id
// 2. 從 Stripe session 取 payment_intent
// 3. 呼叫 stripe.refunds.create（金額 cents）
// 4. 更新 paid_reports：status='refunded'、refunded_at、refunded_amount_usd、refund_reason、stripe_refund_id
// 5. 扣回已發放的推薦積分（referrals 首購獎勵 + referred 新客獎勵）
// 6. 寫稽核日誌

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { recordExpense } from '@/lib/accounting'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('STRIPE_SECRET_KEY 未設定')
  return new Stripe(secret)
}

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  let body: {
    reportId?: string
    payment_intent_id?: string
    amount?: number
    reason?: string
    key?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const { reportId, payment_intent_id: providedPI, amount, reason } = body
  if (!reportId && !providedPI) {
    return NextResponse.json({ error: '必須提供 reportId 或 payment_intent_id' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 1. 查詢報告資料
  type ReportRow = {
    id: string
    stripe_session_id: string | null
    amount_usd: number | null
    status: string | null
    customer_email: string | null
    refunded_at: string | null
  }
  let report: ReportRow | null = null

  if (reportId) {
    // v5.10.289:soft delete filter — 軟刪報告不允許 admin 觸發退款(若需退款應先 restore)
    const { data, error: fetchErr } = await supabase
      .from('paid_reports')
      .select('id, stripe_session_id, amount_usd, status, customer_email, refunded_at')
      .eq('id', reportId)
      .is('deleted_at', null)
      .single()
    if (fetchErr || !data) {
      return NextResponse.json({ error: '找不到報告(或已軟刪、需先 restore 才能退款)' }, { status: 404 })
    }
    report = data as unknown as ReportRow
    if (report?.refunded_at) {
      return NextResponse.json({ error: '此訂單已退款' }, { status: 409 })
    }
  }

  // 2. 取得 payment_intent_id
  let paymentIntentId = providedPI || ''
  if (!paymentIntentId && report?.stripe_session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(report.stripe_session_id)
      paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id || '')
    } catch (err) {
      return NextResponse.json({
        error: '無法取得 Stripe Session',
        detail: err instanceof Error ? err.message : '未知錯誤',
      }, { status: 500 })
    }
  }
  if (!paymentIntentId) {
    return NextResponse.json({ error: '找不到 payment_intent_id' }, { status: 400 })
  }

  // 3. 呼叫 Stripe Refund API
  let refundResult: Stripe.Refund
  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    }
    if (typeof amount === 'number' && amount > 0) {
      refundParams.amount = Math.round(amount * 100) // USD → cents
    }
    if (reason && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
      refundParams.reason = reason as Stripe.RefundCreateParams.Reason
    }
    refundResult = await getStripe().refunds.create(refundParams)
  } catch (err) {
    return NextResponse.json({
      error: 'Stripe 退款失敗',
      detail: err instanceof Error ? err.message : '未知錯誤',
    }, { status: 500 })
  }

  const refundedAmountUsd = refundResult.amount / 100

  // 4. 更新 paid_reports
  if (report) {
    await supabase
      .from('paid_reports')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        refunded_amount_usd: refundedAmountUsd,
        refund_reason: reason || 'admin_manual',
        stripe_refund_id: refundResult.id,
      })
      .eq('id', report.id)
  }

  // 5. 扣回已發放的推薦積分
  // 邏輯：若此訂單有對應 referrals 記錄（referred_user_id 對應此訂單 user），
  //       且 referrer_points_awarded > 0，扣回給 referrer
  //
  // 注意：原本用 auth.admin.listUsers({ perPage: 1000 })，用戶破千會漏掉需退款客戶。
  //       改為用 email 直接查 auth_users_view（migration add_referred_email 已建立此 view），
  //       避免 listUsers 的分頁上限。auth_users_view 只開放 service_role，安全無虞。
  let pointsClawedBack = 0
  try {
    if (report?.customer_email) {
      const lowerEmail = report.customer_email.toLowerCase()

      // 優先用 auth_users_view 直接查（O(1)，無分頁上限）
      let refundedUserId: string | null = null
      const { data: viewUser, error: viewErr } = await supabase
        .from('auth_users_view')
        .select('id')
        .eq('email', lowerEmail)
        .maybeSingle()

      if (!viewErr && viewUser?.id) {
        refundedUserId = viewUser.id
      } else {
        // Fallback: auth_users_view 尚未建立（migration 還沒跑）→ 分頁掃 listUsers
        //           避免 perPage=1000 單次上限在用戶破千時漏掉目標
        if (viewErr) {
          console.warn('[refund] auth_users_view 查詢失敗，退回分頁 listUsers:', viewErr.message)
        }
        try {
          let page = 1
          const perPage = 1000
          const MAX_PAGES = 100 // 安全網：最多 100 頁 = 100 萬用戶
          while (page <= MAX_PAGES) {
            const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage })
            if (listErr || !listData?.users?.length) break
            const refundedUser = listData.users.find(u => u.email?.toLowerCase() === lowerEmail)
            if (refundedUser) {
              refundedUserId = refundedUser.id
              break
            }
            if (listData.users.length < perPage) break // 最後一頁
            page++
          }
          if (!refundedUserId && page > MAX_PAGES) {
            console.error('[refund] findUserByEmail exceeded 100 pages limit:', lowerEmail)
          }
        } catch (fallbackErr) {
          console.error('[refund] listUsers 分頁 fallback 失敗:', fallbackErr)
        }
      }

      if (refundedUserId) {
        const { data: refs } = await supabase
          .from('referrals')
          .select('id, referrer_user_id, referrer_points_awarded')
          .eq('referred_user_id', refundedUserId)
          .eq('status', 'purchased')
        for (const r of (refs || [])) {
          const pts = r.referrer_points_awarded || 0
          if (pts <= 0) continue
          // 扣回推薦人積分
          const { data: curPts } = await supabase
            .from('user_points')
            .select('balance, total_earned')
            .eq('user_id', r.referrer_user_id)
            .maybeSingle()
          if (curPts) {
            const newBal = Math.max(0, (curPts.balance || 0) - pts)
            const newEarned = Math.max(0, (curPts.total_earned || 0) - pts)
            await supabase
              .from('user_points')
              .update({ balance: newBal, total_earned: newEarned })
              .eq('user_id', r.referrer_user_id)
            await supabase.from('point_transactions').insert({
              user_id: r.referrer_user_id,
              type: 'refund_clawback',
              amount: -pts,
              balance_after: newBal,
              description: `訂單退款扣回推薦積分 (refund ${refundResult.id})`,
              reference_id: `refund_${refundResult.id}`,
            })
            pointsClawedBack += pts
          }
          // 標記 referral 為 refunded
          await supabase
            .from('referrals')
            .update({ status: 'refunded' })
            .eq('id', r.id)
        }
      }
    }
  } catch (err) {
    // 扣積分失敗不應阻擋退款流程，只記 log
    // eslint-disable-next-line no-console
    console.error('[refund] 扣回推薦積分失敗:', err)
  }

  // 6a. 寫入會計支出（會計系統）
  await recordExpense({
    category: 'refund',
    subcategory: 'stripe_refund',
    reportId: report?.id || null,
    amountUsd: refundedAmountUsd,
    description: `退款 ${reason || 'admin_manual'}（${report?.customer_email || paymentIntentId}）`,
    source: 'refund_api',
    createdBy: 'admin',
    metadata: {
      stripe_refund_id: refundResult.id,
      stripe_payment_intent_id: paymentIntentId,
      customer_email: report?.customer_email || null,
      reason: reason || null,
    },
  })

  // 6b. 更新對應 revenue_log 的 refunded_amount_usd（衝銷）
  try {
    if (report?.stripe_session_id) {
      const { data: revRow } = await supabase
        .from('revenue_log')
        .select('id, refunded_amount_usd')
        .eq('stripe_session_id', report.stripe_session_id)
        .maybeSingle()
      if (revRow) {
        const newRefunded = Number(revRow.refunded_amount_usd || 0) + refundedAmountUsd
        await supabase
          .from('revenue_log')
          .update({
            refunded_amount_usd: newRefunded,
            refunded_at: new Date().toISOString(),
          })
          .eq('id', revRow.id)
      }
    }
  } catch (revErr) {
    // eslint-disable-next-line no-console
    console.error('[refund] revenue_log 衝銷失敗（不影響退款）:', revErr)
  }

  // 7. 稽核紀錄
  await writeAuditLog(req, 'refund', 'order', report?.id || paymentIntentId, {
    stripe_refund_id: refundResult.id,
    stripe_payment_intent_id: paymentIntentId,
    refunded_amount_usd: refundedAmountUsd,
    reason: reason || null,
    points_clawed_back: pointsClawedBack,
    customer_email: report?.customer_email || null,
  })

  return NextResponse.json({
    success: true,
    refund_id: refundResult.id,
    refunded_amount_usd: refundedAmountUsd,
    points_clawed_back: pointsClawedBack,
    status: refundResult.status,
  })
}
