import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'

function getStripe() {
  // @ts-expect-error - Stripe SDK version mismatch
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' })
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )
}

export async function POST(req: NextRequest) {
  // 安全防護：如果 webhook secret 未設定或為空字串，直接拒絕請求
  // 避免用空字串做簽名驗證，防止偽造 webhook 事件
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET 未設定，拒絕處理 webhook')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const stripe = getStripe()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig || '', webhookSecret)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const planCode = session.metadata?.plan_code || 'C'
    const draftId = session.metadata?.draft_id
    const birthDataStr = session.metadata?.birth_data // 向後兼容舊格式
    const sessionLocale = session.metadata?.locale || 'zh-TW'
    const amount = (session.amount_total || 0) / 100
    const customerEmail = (session.customer_details?.email || session.customer_email || '').toLowerCase()

    console.info(`✅ 付款成功！方案${planCode}, $${amount}`)

    const supabase = getSupabase()

    // 冪等性檢查：防止同一個 Stripe session 被處理兩次
    const { data: existingReport } = await supabase
      .from('paid_reports')
      .select('id, status')
      .eq('stripe_session_id', session.id)
      .maybeSingle()

    if (existingReport) {
      console.info(`⚠️ Stripe session ${session.id} 已處理過（報告 ${existingReport.id}，狀態 ${existingReport.status}），跳過`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    let birthData = null
    if (draftId) {
      // 從 Supabase checkout_drafts 取回完整 birthData（無 500 字元限制）
      const { data: draft, error: draftErr } = await supabase
        .from('checkout_drafts')
        .select('birth_data, plan_code, locale')
        .eq('id', draftId)
        .single()

      if (draftErr) {
        console.error('checkout_drafts 讀取失敗:', draftErr)
      } else if (draft) {
        birthData = draft.birth_data
        // 標記已使用，避免重複取用
        const { error: usedAtErr } = await supabase
          .from('checkout_drafts')
          .update({ used_at: new Date().toISOString() })
          .eq('id', draftId)
        if (usedAtErr) {
          console.error('checkout_drafts used_at 更新失敗:', usedAtErr)
        }
      }
    } else if (birthDataStr) {
      // 向後兼容：舊的 Stripe metadata 直接存 JSON 字串格式
      try { birthData = JSON.parse(birthDataStr) } catch { /* ignore */ }
    }

    // 先存入 Supabase（狀態 pending）
    let reportId = ''
    let accessToken = ''
    try {
      const { data: insertData, error: insertErr } = await supabase.from('paid_reports').insert({
        client_name: birthData?.plan_type === 'family_email' || birthData?.plan_type === 'family_reports'
          ? (birthData?.member_names?.filter(Boolean).join('、') || 'Unknown')
          : birthData?.plan === 'R'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join(' × ') || 'Unknown')
          : birthData?.plan_type === 'family'
          ? (birthData?.members?.map((m: { name?: string }) => m.name).filter(Boolean).join('、') || 'Unknown')
          : (birthData?.name || 'Unknown'),
        plan_code: planCode,
        amount_usd: amount,
        stripe_session_id: session.id,
        birth_data: birthData,
        customer_email: customerEmail,
        status: 'pending',
      }).select('id, access_token').single()

      if (insertErr) {
        console.error('❌ Supabase insert 失敗（嚴重）:', insertErr)
        // insert 失敗 = 客戶付了錢但報告永遠不會生成，回傳 500 讓 Stripe 重試 webhook
        return NextResponse.json({ error: 'Supabase insert failed' }, { status: 500 })
      }
      reportId = insertData?.id || ''
      accessToken = insertData?.access_token || ''
      console.info('✅ 報告記錄已建立:', reportId)
    } catch (err) {
      console.error('❌ Supabase 連線異常（嚴重）:', err)
      return NextResponse.json({ error: 'Supabase connection error' }, { status: 500 })
    }

    // 呼叫 Fly.io 異步報告生成 Pipeline（無超時限制，完整排盤數據）
    if (birthData && reportId) {
      try {
        console.info('觸發 Workflow 報告生成...')
        const additionalData = birthData.additionalPeople ? JSON.parse(birthData.additionalPeople) : undefined

        // 注入 locale（報告語言：zh-TW 繁體 / zh-CN 簡體）
        if (!birthData.locale) {
          birthData.locale = sessionLocale
        }
        // 確保 customer_note 傳入 birth_data
        if (session.metadata?.customer_note && !birthData.customer_note) {
          birthData.customer_note = session.metadata.customer_note
        }
        // D 方案的 topic/question
        if (session.metadata?.topic && !birthData.topic) {
          birthData.topic = session.metadata.topic
        }
        if (session.metadata?.question && !birthData.question) {
          birthData.question = session.metadata.question
        }

        // 記錄優惠碼使用
        const couponCodeUsed = session.metadata?.coupon_code
        if (couponCodeUsed) {
          try {
            const { data: couponRow } = await supabase.from('coupons').select('id, used_count').eq('code', couponCodeUsed).single()
            if (couponRow) {
              await supabase.from('coupons').update({ used_count: (couponRow.used_count || 0) + 1 }).eq('id', couponRow.id)
              await supabase.from('coupon_uses').insert({
                coupon_id: couponRow.id,
                coupon_code: couponCodeUsed,
                order_id: session.id,
                customer_email: customerEmail,
                plan_code: planCode,
                original_amount: (session.amount_subtotal || session.amount_total || 0) / 100,
                discount_applied: ((session.amount_subtotal || 0) - (session.amount_total || 0)) / 100,
              })
            }
          } catch (couponErr) {
            console.error('優惠碼記錄失敗:', couponErr)
          }
        }

        // 觸發 Vercel Workflow 生成報告（持久化、自動重試、不受超時限制）
        // 更新 birth_data 到 Supabase（workflow 從 DB 讀取）
        await supabase.from('paid_reports').update({
          birth_data: birthData,
        }).eq('id', reportId)

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
        const PLAN_NAMES: Record<string, string> = { C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件出門訣', E2: '月盤出門訣' }

        // 付款後立即發訂單確認信（讓客戶知道我們收到了）
        try {
          const resend = new Resend(process.env.RESEND_API_KEY || '')
          const planName = PLAN_NAMES[planCode] || planCode
          const dashboardUrl = `${siteUrl}/dashboard?session_id=${session.id}`

          // 組裝客戶填寫的資料確認區塊
          const clientName = birthData?.name || birthData?.client_name || ''
          const orderInfoRows: string[] = []
          if (clientName) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">姓名</td><td style="padding:4px 0;">${clientName}</td></tr>`)

          // 出生日期
          const birthDate = birthData?.birthDate || birthData?.birth_date || ''
          if (birthDate) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生日期</td><td style="padding:4px 0;">${birthDate}</td></tr>`)

          // 出生時辰
          const birthTime = birthData?.birthTime || birthData?.birth_time || birthData?.time || ''
          if (birthTime) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生時辰</td><td style="padding:4px 0;">${birthTime}</td></tr>`)

          // 出生地區
          const birthPlace = birthData?.birthCity || birthData?.birth_city || birthData?.city || birthData?.region || ''
          if (birthPlace) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">出生地區</td><td style="padding:4px 0;">${birthPlace}</td></tr>`)

          // R方案（合否？）顯示雙方姓名
          if (planCode === 'R' && birthData?.members && Array.isArray(birthData.members)) {
            const memberNames = (birthData.members as Array<{ name?: string }>).map(m => m.name).filter(Boolean).join(' × ')
            if (memberNames) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">比對對象</td><td style="padding:4px 0;">${memberNames}</td></tr>`)
          }

          // G15方案（家族藍圖）顯示家族成員
          if (planCode === 'G15') {
            const familyNames = birthData?.member_names
              ? (birthData.member_names as string[]).filter(Boolean).join('、')
              : birthData?.members
              ? (birthData.members as Array<{ name?: string }>).map(m => m.name).filter(Boolean).join('、')
              : ''
            if (familyNames) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">家族成員</td><td style="padding:4px 0;">${familyNames}</td></tr>`)
          }

          // D方案（心之所惑）顯示主題
          const topic = birthData?.topic || birthData?.analysis_topic || ''
          if (topic) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">分析主題</td><td style="padding:4px 0;">${topic}</td></tr>`)

          // 出門訣顯示事件
          if ((planCode === 'E1' || planCode === 'E2') && (birthData?.event_description || birthData?.eventDescription)) {
            const eventDesc = (birthData.event_description || birthData.eventDescription || '') as string
            if (eventDesc) orderInfoRows.push(`<tr><td style="color:#999;padding:4px 12px 4px 0;white-space:nowrap;">事件描述</td><td style="padding:4px 0;">${eventDesc.slice(0, 50)}</td></tr>`)
          }

          const orderInfoHtml = orderInfoRows.length > 0
            ? `
              <div style="background: #faf8f3; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="font-size: 13px; color: #999; margin: 0 0 8px 0;">您填寫的資料確認：</p>
                <table style="font-size: 14px; color: #333; border-collapse: collapse;">${orderInfoRows.join('')}</table>
              </div>
            `
            : ''

          await resend.emails.send({
            from: '鑒源命理 <noreply@jianyuan.life>',
            to: customerEmail,
            subject: `${clientName || '您'}，已收到您的「${planName}」訂單`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #333;">
                <!-- 品牌頭部 -->
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 18px; font-weight: bold; color: #1a1a2e; letter-spacing: 4px;">鑒 源</span>
                  <div style="font-size: 11px; color: #999; margin-top: 4px;">JIANYUAN</div>
                </div>

                <h2 style="color: #1a1a2e; margin-bottom: 16px; font-size: 18px;">感謝您的購買</h2>
                <p>${clientName ? `${clientName}，您好！` : '您好！'}</p>
                <p>我們已收到您的<strong>「${planName}」</strong>訂單，系統正在啟動分析。</p>

                ${orderInfoHtml}

                <p style="background: #f8f6f0; padding: 16px; border-radius: 8px; border-left: 3px solid #c9a84c;">
                  報告預計 <strong>30-60 分鐘</strong>內完成。完成後會再寄信通知您。<br/>
                  您也可以隨時到儀表板查看進度。
                </p>
                <p style="margin-top: 24px; text-align: center;">
                  <a href="${dashboardUrl}" style="display: inline-block; background: #c9a84c; color: #1a1a2e; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">查看報告進度</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
                <p style="font-size: 11px; color: #bbb; text-align: center;">鑒源命理 jianyuan.life</p>
                ${getUnsubscribeHtml(customerEmail)}
              </div>
            `,
          })
          console.info('✅ 訂單確認信已發送:', customerEmail)
        } catch (emailErr) {
          console.error('訂單確認信發送失敗（不影響報告生成）:', emailErr)
        }

        // 觸發 Workflow（帶超時確認 + Fallback 機制）
        let workflowTriggered = false

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000) // 5 秒超時

          const workflowRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
            body: JSON.stringify({ reportId }),
            signal: controller.signal,
          })
          clearTimeout(timeout)

          if (workflowRes.ok) {
            workflowTriggered = true
            console.info('✅ Workflow 觸發成功')
          } else {
            console.error('❌ Workflow 觸發失敗:', await workflowRes.text())
          }
        } catch (workflowErr) {
          console.error('❌ Workflow 觸發異常:', workflowErr)
        }

        // Fallback: 直接呼叫 generate-report
        if (!workflowTriggered) {
          console.info('⚠️ Workflow 失敗，啟動 Fallback...')
          try {
            const fallbackController = new AbortController()
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000) // 8 秒超時

            const fallbackRes = await fetch(`${siteUrl}/api/generate-report`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
              body: JSON.stringify({ reportId }),
              signal: fallbackController.signal,
            })
            clearTimeout(fallbackTimeout)

            if (fallbackRes.ok) {
              console.info('✅ Fallback 觸發成功')
            } else {
              // 兩者都失敗，記錄到 Supabase
              const errText = await fallbackRes.text().catch(() => 'unknown')
              console.error('❌ Fallback 也失敗:', errText)
              await supabase.from('paid_reports').update({
                error_message: `Webhook: Workflow 和 Fallback 都失敗 (${errText})`,
              }).eq('id', reportId)
            }
          } catch (fallbackErr) {
            console.error('❌ Fallback 觸發異常:', fallbackErr)
            await supabase.from('paid_reports').update({
              error_message: `Webhook 觸發全部失敗: ${fallbackErr}`,
            }).eq('id', reportId)
          }
        }
      } catch (err) {
        console.error('報告觸發失敗:', err)
      }
    }

    // === 點數折抵扣除（付款成功才真正扣）— 原子操作版 ===
    try {
      const pointsUsed = parseInt(session.metadata?.points_used || '0')
      const pointsUserId = session.metadata?.points_user_id || ''
      if (pointsUsed > 0 && pointsUserId) {
        // 原子操作：用 .gte('balance', pointsUsed) 確保餘額足夠才扣除，防止併發導致負數
        const { data: updated, error: deductErr } = await supabase.rpc('deduct_points', {
          p_user_id: pointsUserId,
          p_amount: pointsUsed,
        })

        // 如果 RPC 不存在，fallback 為帶條件的 update（仍比 read-then-write 安全）
        if (deductErr?.message?.includes('function') || deductErr?.code === '42883') {
          console.warn('⚠️ deduct_points RPC 不存在，使用 fallback 帶條件更新')
          const { data: pts } = await supabase
            .from('user_points')
            .select('balance, total_used')
            .eq('user_id', pointsUserId)
            .gte('balance', pointsUsed)
            .single()

          if (pts) {
            const newBalance = pts.balance - pointsUsed
            const { error: updateErr } = await supabase
              .from('user_points')
              .update({
                balance: newBalance,
                total_used: (pts.total_used || 0) + pointsUsed,
              })
              .eq('user_id', pointsUserId)
              .gte('balance', pointsUsed) // 二次確認：防止在 select 和 update 之間被其他請求修改

            if (!updateErr) {
              await supabase.from('point_transactions').insert({
                user_id: pointsUserId,
                type: 'use_checkout',
                amount: -pointsUsed,
                balance_after: newBalance,
                description: `${({ C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件出門訣', E2: '月盤出門訣' } as Record<string,string>)[planCode] || planCode} 訂單折抵`,
                reference_id: session.id,
              })
              console.info(`✅ 點數扣除（fallback）：${pointsUserId} -${pointsUsed}點，餘額 ${newBalance}`)
            }
          }
        } else if (!deductErr && updated !== null) {
          // RPC 成功，updated 為新餘額
          const newBalance = typeof updated === 'number' ? updated : 0
          await supabase.from('point_transactions').insert({
            user_id: pointsUserId,
            type: 'use_checkout',
            amount: -pointsUsed,
            balance_after: newBalance,
            description: `${({ C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否？', E1: '事件出門訣', E2: '月盤出門訣' } as Record<string,string>)[planCode] || planCode} 訂單折抵`,
            reference_id: session.id,
          })
          console.info(`✅ 點數扣除（RPC）：${pointsUserId} -${pointsUsed}點，餘額 ${newBalance}`)
        }
      }
    } catch (ptsErr) {
      console.error('⚠️ 點數扣除失敗（不影響報告生成）:', ptsErr)
    }

    // === 推薦碼首次購買點數發放 ===
    try {
      if (customerEmail) {
        // 1. 從 referrals 表直接用 referred_email 找（最可靠，不依賴 auth view）
        let userId: string | undefined

        // 先查 referrals 表是否有此 email 的記錄（register API 已寫入）
        const { data: refByEmail } = await supabase
          .from('referrals')
          .select('referred_user_id')
          .eq('referred_email', customerEmail)
          .eq('status', 'registered')
          .maybeSingle()

        userId = refByEmail?.referred_user_id

        // 如果 referrals 沒查到（可能 email 大小寫不同），嘗試 auth view
        if (!userId) {
          const { data: authUser } = await supabase
            .from('auth_users_view')
            .select('id')
            .eq('email', customerEmail)
            .maybeSingle()
          userId = authUser?.id
        }

        if (userId) {
          // 2. 查詢 referrals 表：是否有 status='registered' 的推薦記錄
          const { data: referral } = await supabase
            .from('referrals')
            .select('id, referrer_user_id, referral_code')
            .eq('referred_user_id', userId)
            .eq('status', 'registered')
            .maybeSingle()

          if (referral) {
            // 防重複發放：用 stripe session_id 當 reference_id，若已存在則跳過
            const { data: existingTx } = await supabase
              .from('point_transactions')
              .select('id')
              .eq('reference_id', session.id)
              .eq('type', 'earn_referral')
              .maybeSingle()

            if (existingTx) {
              console.info(`ℹ️ 此筆交易 ${session.id} 已發放過推薦積分，跳過`)
            } else {
              // 3. 查購買次數，首購 10 點、回購 5 點
              const { count: reportCount } = await supabase
                .from('paid_reports')
                .select('id', { count: 'exact', head: true })
                .eq('customer_email', customerEmail)
                .in('status', ['completed', 'generating', 'pending'])

              const isFirstPurchase = reportCount !== null && reportCount <= 1
              const REFERRER_POINTS = isFirstPurchase ? 10 : 5
              const now = new Date().toISOString()
              const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
              const referrerId = referral.referrer_user_id

              // 首購時更新 referrals 狀態
              if (isFirstPurchase) {
                await supabase
                  .from('referrals')
                  .update({
                    status: 'purchased',
                    purchased_at: now,
                    referrer_points_awarded: REFERRER_POINTS,
                    referred_points_awarded: 0, // 被推薦人已在註冊時得到積分
                  })
                  .eq('id', referral.id)
              }

              // 推薦人加點數 — 安全加值（先查後更新，不存在則新建）
              async function addPointsSafe(targetUserId: string, points: number): Promise<number> {
                const { data: existing } = await supabase
                  .from('user_points')
                  .select('balance, total_earned')
                  .eq('user_id', targetUserId)
                  .maybeSingle()

                if (existing) {
                  const newBal = (existing.balance || 0) + points
                  await supabase
                    .from('user_points')
                    .update({
                      balance: newBal,
                      total_earned: (existing.total_earned || 0) + points,
                    })
                    .eq('user_id', targetUserId)
                  return newBal
                } else {
                  await supabase
                    .from('user_points')
                    .insert({
                      user_id: targetUserId,
                      balance: points,
                      total_earned: points,
                      total_used: 0,
                    })
                  return points
                }
              }

              // 只發放推薦人積分（被推薦人已在註冊時得到積分）
              const referrerFinalBalance = await addPointsSafe(referrerId, REFERRER_POINTS)

              // 寫入 point_transactions（用 session.id 作為 reference_id 防重複）
              await supabase.from('point_transactions').insert({
                user_id: referrerId,
                type: 'earn_referral',
                amount: REFERRER_POINTS,
                balance_after: referrerFinalBalance,
                description: isFirstPurchase ? '推薦用戶首次購買獎勵' : '推薦用戶回購獎勵',
                reference_id: session.id,
                expires_at: expiresAt,
              })

              // 首購時更新 referral_codes.total_referrals
              if (isFirstPurchase && referral.referral_code) {
                const { data: codeRow } = await supabase
                  .from('referral_codes')
                  .select('total_referrals')
                  .eq('code', referral.referral_code)
                  .single()

                if (codeRow) {
                  await supabase
                    .from('referral_codes')
                    .update({ total_referrals: (codeRow.total_referrals || 0) + 1 })
                    .eq('code', referral.referral_code)
                }
              }

              console.info(`✅ 推薦碼點數發放完成：推薦人 ${referrerId} +${REFERRER_POINTS}點（${isFirstPurchase ? '首購' : '回購'}）`)
            }
          }
        }
      }
    } catch (referralErr) {
      // 推薦碼邏輯失敗不影響報告生成
      console.error('⚠️ 推薦碼點數發放失敗（不影響報告生成）:', referralErr)
    }

  }

  return NextResponse.json({ received: true })
}
