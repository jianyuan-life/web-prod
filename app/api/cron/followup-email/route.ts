// ============================================================
// Cron 跟進信端點 — 報告完成 3 天後自動發送跟進郵件
// 每小時由 Vercel Cron 呼叫一次
//
// 設計邏輯：
// 1. 查詢 status = 'completed' 且 updated_at 在 70-74 小時前的報告
// 2. 排除 generation_progress.followup_sent = true 的已發送記錄
// 3. 從報告內容提取 3 個重點發現
// 4. 發送跟進信 + 出門訣引導 CTA
// 5. 標記 followup_sent = true
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import { PLAN_NAMES, isChumenjiPlan } from '@/lib/plan-names'
import { checkCronAuth } from '@/lib/cron-auth'

export const maxDuration = 60


// 從報告內容提取 3 個重點發現
function extractKeyFindings(planCode: string, reportContent: string): string[] {
  const findings: string[] = []
  const text = (reportContent || '').replace(/[#*`]/g, '')

  if (planCode === 'C') {
    // 人生藍圖：命格角色 + 年度關鍵詞 + 天賦特質
    const role = text.match(/命格角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/角色名稱[：:]\s*(.{2,20})/)?.[1]
    if (role) findings.push(`你的命格角色是「${role.trim()}」— 這背後藏著你的核心天賦`)

    const keyword = text.match(/年度關鍵[詞词][：:]\s*(.{2,30})/)?.[1]
    if (keyword) findings.push(`今年的年度關鍵詞：${keyword.trim()}`)

    const talent = text.match(/(?:天賦|核心優勢|最大的優勢)[：:]\s*(.{5,40})/)?.[1]
    if (talent) findings.push(talent.trim().slice(0, 40))
  } else if (planCode === 'D') {
    // 心之所惑：提取核心分析要點
    const core = text.match(/(?:核心分析|深度分析|關鍵發現)[：:]\s*(.{10,50})/)?.[1]
    if (core) findings.push(core.trim().slice(0, 45))
    findings.push('多個命理系統交叉比對了你的疑問')
  } else if (planCode === 'G15') {
    findings.push('家族成員之間的能量互動模式已解析完成')
    findings.push('每位成員的角色定位與互動建議已整理')
  } else if (isChumenjiPlan(planCode)) {
    const bestTime = text.match(/(?:最佳|第一|Top\s*1)[吉時时]*[：:]\s*(.{2,20})/)?.[1]
    if (bestTime) findings.push(`最佳吉時：${bestTime.trim()}`)
    const direction = text.match(/(?:最佳|建議)方位[：:]\s*(.{2,10})/)?.[1]
    if (direction) findings.push(`建議方位：${direction.trim()}`)
    findings.push('奇門遁甲 25+ 步精算完成，吉時排名已確定')
  } else if (planCode === 'R') {
    findings.push('雙方命格交叉比對完成，互動模式已解析')
    findings.push('關係中的契合點與需要注意的地方已整理')
  }

  // 通用提取：嘗試從報告結論提取
  if (findings.length < 3) {
    const conclusion = text.match(/(?:總結|結語|最後)[：:]\s*(.{10,60})/)?.[1]
    if (conclusion && findings.length < 3) {
      findings.push(conclusion.trim().slice(0, 50))
    }
  }

  // 保底
  while (findings.length < 3) {
    const fallbacks = [
      '報告中有針對你個人的具體行動建議',
      '東西方命理系統已完成交叉驗證',
      '你的報告包含了深度個人化分析',
    ]
    const f = fallbacks[findings.length] || fallbacks[0]
    if (!findings.includes(f)) findings.push(f)
    else break
  }

  return findings.slice(0, 3)
}

export async function GET(req: NextRequest) {
  // v5.10.279 fail-closed auth(Codex P0#3)
  const authFail = checkCronAuth(req)
  if (authFail) return authFail

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'

  // v5.3.33 放寬 window + 修掉 forward reference 型別
  // 窄 window 若 cron 失敗就整批錯過，現改成 >= 70h 且 <= 14 天
  // 真正判斷是否已發過用 generation_progress.followup_sent flag
  type RawReport = {
    id: string; client_name: string; plan_code: string; customer_email: string;
    access_token: string; report_result: unknown; generation_progress: unknown; birth_data: unknown;
  }

  const now = Date.now()
  const seventyHoursAgo = new Date(now - 70 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

  let reports: RawReport[] = []

  try {
    // paid_reports 無 updated_at，用 email_sent_at 作為完成時間戳
    // v5.10.283 soft delete filter:軟刪報告不再寄跟進信
    const { data, error: queryErr } = await supabase
      .from('paid_reports')
      .select('id, client_name, plan_code, customer_email, access_token, report_result, generation_progress, birth_data')
      .eq('status', 'completed')
      .lt('email_sent_at', seventyHoursAgo)
      .gte('email_sent_at', fourteenDaysAgo)
      .is('deleted_at', null)
      .order('email_sent_at', { ascending: true })
      .limit(50)

    if (queryErr) {
      console.error('❌ 查詢跟進信報告失敗:', JSON.stringify(queryErr))
      return NextResponse.json({ error: '查詢失敗', detail: queryErr.message }, { status: 500 })
    }
    reports = (data as RawReport[]) || []
  } catch (err) {
    console.error('❌ 跟進信查詢例外:', err)
    return NextResponse.json({ error: '查詢例外' }, { status: 500 })
  }

  let sentCount = 0
  let skippedCount = 0

  const resend = new Resend(process.env.RESEND_API_KEY || '')

  for (const report of reports) {
    // 排除已發過跟進信的
    const progress = report.generation_progress as Record<string, unknown> | null
    if (progress?.followup_sent) {
      skippedCount++
      continue
    }

    // 排除無 email 的
    if (!report.customer_email) {
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

    // 出門訣報告不發跟進信（已含出門訣引導 CTA，改為引導其他方案）
    const planCode = report.plan_code || 'C'
    const planName = PLAN_NAMES[planCode] || '命理分析'
    const clientName = report.client_name || '您'
    const isChumenji = isChumenjiPlan(planCode)

    // 提取報告內容
    const reportContent = typeof report.report_result === 'string'
      ? report.report_result
      : JSON.stringify(report.report_result || '')

    const findings = extractKeyFindings(planCode, reportContent)
    const reportUrl = `${siteUrl}/report/${report.access_token}`

    // 底部 CTA：非出門訣方案引導出門訣；出門訣方案引導人生藍圖
    const bottomCta = isChumenji
      ? { text: '想更深入了解自己的命格？', link: `${siteUrl}/pricing`, label: '探索人生藍圖 →' }
      : { text: '想把握最佳時機行動？', link: `${siteUrl}/pricing`, label: '了解出門訣 →' }

    const birthData = report.birth_data as Record<string, string> | null
    const isCN = birthData?.locale === 'zh-CN'
    const emailFont = isCN
      ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
      : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"

    try {
      await resend.emails.send({
        from: '鑒源命理 <noreply@jianyuan.life>',
        to: report.customer_email,
        subject: `${clientName}，你報告中最重要的 3 個發現`,
        html: `
          <div style="font-family: ${emailFont}; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #333;">
            <!-- 品牌頭部 -->
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 18px; font-weight: bold; color: #1a1a2e; letter-spacing: 4px;">鑒 源</span>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">JIANYUAN</div>
            </div>

            <h2 style="color: #1a1a2e; margin-bottom: 8px; font-size: 18px;">${clientName}，你的「${planName}」報告中有幾個重要發現</h2>
            <p style="color: #666; font-size: 14px; margin-bottom: 24px;">你的報告已完成 3 天，以下是我們從分析中挑出的 3 個關鍵重點：</p>

            <!-- 3 個重點發現 -->
            ${findings.map((f, i) => `
              <div style="background: #f8f6f0; padding: 14px 16px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid #c9a84c;">
                <span style="color: #c9a84c; font-weight: bold; margin-right: 8px;">${i + 1}.</span>
                <span style="color: #333; font-size: 14px;"><strong>${f}</strong></span>
              </div>
            `).join('')}

            <p style="color: #666; font-size: 14px; margin-top: 20px;">這些只是報告中的冰山一角。完整報告裡還有更多個人化的深度分析與行動建議。</p>

            <!-- 主要 CTA：回去看報告 -->
            <div style="text-align: center; margin: 28px 0;">
              <a href="${reportUrl}" style="display: inline-block; background: #c9a84c; color: #1a1a2e; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px;">回顧完整報告 →</a>
            </div>

            <!-- 分隔線 -->
            <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />

            <!-- 底部引導 CTA -->
            <div style="background: #faf8f3; padding: 16px; border-radius: 8px; text-align: center;">
              <p style="color: #666; font-size: 13px; margin-bottom: 12px;">${bottomCta.text}</p>
              <a href="${bottomCta.link}" style="color: #c9a84c; font-weight: bold; text-decoration: none; font-size: 14px;">${bottomCta.label}</a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0;" />
            <p style="font-size: 11px; color: #bbb; text-align: center;">鑒源命理 jianyuan.life</p>
            ${getUnsubscribeHtml(report.customer_email)}
          </div>
        `,
      })

      // 標記已發送
      const existing = (progress || {}) as Record<string, unknown>
      await supabase.from('paid_reports').update({
        generation_progress: {
          ...existing,
          followup_sent: true,
          followup_sent_at: new Date().toISOString(),
        },
      }).eq('id', report.id)

      sentCount++
      console.info(`✅ 跟進信已發送: ${report.customer_email} (${planName})`)
    } catch (emailErr) {
      console.error(`❌ 跟進信發送失敗 ${report.id}:`, emailErr)
    }
  }

  return NextResponse.json({
    message: '跟進信處理完成',
    sentCount,
    skippedCount,
    totalChecked: reports?.length || 0,
  })
}
