// ============================================================
// Cron 反饋提醒 — 報告完成 48 小時後自動發送反饋郵件
// 每 4 小時由 Vercel Cron 呼叫一次
//
// 設計邏輯：
// 1. 查詢 status = 'completed' 且 email_sent_at 在 46-50 小時前的報告
// 2. 排除 generation_progress.feedback_sent = true 的已發送記錄
// 3. 用 Resend 發送簡短 2 題反饋郵件
// 4. 發送後標記 feedback_sent = true
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { checkCronAuth } from '@/lib/cron-auth'

// Vercel Cron 最長執行時間 60 秒
export const maxDuration = 60

// 出生資料型別（只取需要的欄位）
interface BirthData {
  name?: string
  locale?: string
  plan_type?: string
  member_names?: string[]
  members?: Array<{ name?: string }>
}

export async function GET(req: NextRequest) {
  // v5.10.279 fail-closed auth(Codex P0#3)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
  const resend = new Resend(process.env.RESEND_API_KEY || '')

  // v5.3.33 放寬 window：只要完成 >= 46 小時且 <= 7 天都納入
  // 真正判斷是否已發過用 generation_progress.feedback_sent flag
  // 避免單次 cron 失敗就整批錯過反饋機會
  const hourAgo46 = new Date(Date.now() - 46 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 查詢已完成報告：email_sent_at 在 46 小時前至 7 天內
  const { data: reports, error: queryErr } = await supabase
    .from('paid_reports')
    .select('id, customer_email, birth_data, plan_code, access_token, generation_progress, email_sent_at')
    .eq('status', 'completed')
    .lt('email_sent_at', hourAgo46)
    .gte('email_sent_at', sevenDaysAgo)
    .order('email_sent_at', { ascending: true })
    .limit(20)

  if (queryErr) {
    console.error('❌ 查詢反饋郵件候選報告失敗:', queryErr)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  let sentCount = 0
  let skippedCount = 0

  for (const report of (reports || [])) {
    // 排除已發過反饋提醒的
    const progress = report.generation_progress as Record<string, unknown> | null
    if (progress?.feedback_sent) {
      skippedCount++
      continue
    }

    const birthData = report.birth_data as BirthData | null
    const isCN = birthData?.locale === 'zh-CN'

    // 取得客戶姓名
    const clientName = getClientName(birthData)
    if (!clientName || !report.customer_email) {
      skippedCount++
      continue
    }

    // 排除已退訂的 email
    const { data: unsub } = await supabase
      .from('email_unsubscribes')
      .select('email')
      .eq('email', report.customer_email.toLowerCase())
      .maybeSingle()
    if (unsub) {
      skippedCount++
      continue
    }

    // 發送反饋郵件
    try {
      const reportUrl = `https://jianyuan.life/report/${report.access_token}`
      const emailFont = isCN
        ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
        : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"

      const subject = isCN
        ? `${clientName}，你的报告看完了吗？`
        : `${clientName}，你的報告看完了嗎？`

      const from = isCN
        ? '鉴源命理 <reports@jianyuan.life>'
        : '鑒源命理 <reports@jianyuan.life>'

      const html = buildFeedbackEmailHtml({
        clientName,
        reportUrl,
        emailFont,
        isCN,
        customerEmail: report.customer_email,
      })

      await resend.emails.send({
        from,
        to: report.customer_email,
        subject,
        html,
      })

      // 標記 feedback_sent = true（合併既有 generation_progress）
      const existingProgress = (progress || {}) as Record<string, unknown>
      await supabase.from('paid_reports').update({
        generation_progress: {
          ...existingProgress,
          feedback_sent: true,
          feedback_sent_at: new Date().toISOString(),
        },
      }).eq('id', report.id)

      sentCount++
      console.info(`✅ 反饋郵件已寄送至 ${report.customer_email}（報告 ${report.id}）`)
    } catch (err) {
      console.error(`❌ 反饋郵件寄送失敗（報告 ${report.id}）:`, err)
    }
  }

  return NextResponse.json({
    message: '反饋提醒完成',
    sentCount,
    skippedCount,
    totalCandidates: reports?.length || 0,
  })
}

// ── 取得客戶姓名 ──
function getClientName(birthData: BirthData | null): string {
  if (!birthData) return ''
  if (birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports') {
    return birthData.member_names?.filter(Boolean).join('、') || ''
  }
  if (birthData.plan_type === 'family') {
    return birthData.members?.map(m => m.name).filter(Boolean).join('、') || ''
  }
  return birthData.name || ''
}

// ── 建構反饋郵件 HTML ──
function buildFeedbackEmailHtml(params: {
  clientName: string
  reportUrl: string
  emailFont: string
  isCN: boolean
  customerEmail: string
}): string {
  const { clientName, reportUrl, emailFont, isCN, customerEmail } = params

  const text = {
    brand: isCN ? '鉴 源' : '鑒 源',
    subtitle: isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台',
    greeting: isCN
      ? `${clientName}，你好 👋`
      : `${clientName}，你好 👋`,
    intro: isCN
      ? '你的报告已送出两天了，不知道你是否已经看完？我们很想听听你的感受。'
      : '你的報告已送出兩天了，不知道你是否已經看完？我們很想聽聽你的感受。',
    q1Label: isCN ? '问题一' : '問題一',
    q1: isCN
      ? '1 到 10 分，你会推荐鉴源给朋友吗？'
      : '1 到 10 分，你會推薦鑒源給朋友嗎？',
    q2Label: isCN ? '问题二' : '問題二',
    q2: isCN
      ? '报告中哪个部分最让你有共鸣？（一句话就好）'
      : '報告中哪個部分最讓你有共鳴？（一句話就好）',
    cta: isCN ? '重新查看报告' : '重新查看報告',
    replyHint: isCN
      ? '直接回复这封邮件就能告诉我们，不需要额外操作。'
      : '直接回覆這封郵件就能告訴我們，不需要額外操作。',
    thanks: isCN
      ? '谢谢你花时间分享，每一份反馈都让我们变得更好。'
      : '謝謝你花時間分享，每一份反饋都讓我們變得更好。',
    footer: isCN ? '如有任何问题，请联系' : '如有任何問題，請聯繫',
    copyright: isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life',
  }

  return `<!DOCTYPE html>
<html lang="${isCN ? 'zh-CN' : 'zh-TW'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${text.brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${text.subtitle}</div>
    </div>
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <h1 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 16px 0;">${text.greeting}</h1>
      <p style="color:#9ca3af;font-size:14px;line-height:1.8;margin:0 0 24px 0;">${text.intro}</p>

      <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="color:#c9a84c;font-size:11px;letter-spacing:2px;margin-bottom:6px;">${text.q1Label}</div>
        <p style="color:#e5e7eb;font-size:15px;line-height:1.6;margin:0;">${text.q1}</p>
      </div>

      <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="color:#c9a84c;font-size:11px;letter-spacing:2px;margin-bottom:6px;">${text.q2Label}</div>
        <p style="color:#e5e7eb;font-size:15px;line-height:1.6;margin:0;">${text.q2}</p>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.7;margin:0 0 24px 0;text-align:center;">${text.replyHint}</p>

      <div style="text-align:center;margin-bottom:16px;">
        <a href="${reportUrl}" style="display:inline-block;background:transparent;border:1px solid #c9a84c;color:#c9a84c;font-weight:600;font-size:14px;padding:10px 28px;border-radius:8px;text-decoration:none;letter-spacing:1px;">${text.cta}</a>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.7;margin:0;text-align:center;">${text.thanks}</p>
    </div>
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${text.footer} <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a></p>
      <p style="margin-top:8px;">${text.copyright}</p>
      ${getUnsubscribeHtml(customerEmail)}
    </div>
  </div>
</body>
</html>`
}
