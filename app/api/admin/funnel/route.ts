import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 已知 bot User-Agent 關鍵字（過濾非真人訪客）
const BOT_UA_PATTERNS = [
  'HeadlessChrome', 'vercel-screenshot', 'bot', 'crawler', 'spider',
  'Googlebot', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider',
  'YandexBot', 'facebookexternalhit', 'Twitterbot',
]
const isBot = (ua: string) => BOT_UA_PATTERNS.some(p => ua.toLowerCase().includes(p.toLowerCase()))

// GET — 漏斗分析 API
export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const daysParam = req.nextUrl.searchParams.get('days')
  const days = Math.min(Math.max(parseInt(daysParam || '30', 10) || 30, 1), 365)

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceISO = since.toISOString()
  const supabase = getSupabase()

  // 並行查詢所有數據
  const [
    visitorsRes,
    checkoutVisitorsRes,
    reportsRes,
  ] = await Promise.all([
    // 全部訪客事件（含 user_agent 用於 bot 過濾）
    supabase.from('visitor_events')
      .select('session_id, user_agent')
      .gte('created_at', sinceISO),
    // 結帳頁訪客（page_path 含 /checkout）
    supabase.from('visitor_events')
      .select('session_id, user_agent')
      .gte('created_at', sinceISO)
      .like('page_path', '%/checkout%'),
    // 付費報告（paid_reports 無 updated_at，用 email_sent_at 近似完成時間）
    supabase.from('paid_reports')
      .select('id, plan_code, amount_usd, status, created_at, email_sent_at, customer_email')
      .gte('created_at', sinceISO),
  ])

  // 註冊數：嘗試用 Supabase Admin API listUsers
  // 如果失敗就用 paid_reports 的去重 email 作為 fallback
  let signups = 0
  let signupsFallback = false
  try {
    // Supabase Admin API 分頁取得用戶（每頁 1000）
    let page = 1
    let totalInRange = 0
    let hasMore = true
    while (hasMore) {
      const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      })
      if (usersErr || !usersData?.users) {
        throw new Error(usersErr?.message || '無法取得用戶列表')
      }
      // 篩選期間內建立的用戶
      for (const u of usersData.users) {
        if (u.created_at && new Date(u.created_at) >= since) {
          totalInRange++
        }
      }
      // 如果回傳不滿 1000 筆表示已到最後一頁
      if (usersData.users.length < 1000) {
        hasMore = false
      } else {
        page++
      }
    }
    signups = totalInRange
  } catch {
    // Fallback：用 paid_reports 的去重 email 數量估算
    const uniqueEmails = new Set(
      (reportsRes.data || []).map(r => r.customer_email).filter(Boolean)
    )
    signups = uniqueEmails.size
    signupsFallback = true
  }

  // 計算訪客數（過濾 bot，去重 session_id）
  const allVisitors = visitorsRes.data || []
  const realVisitors = allVisitors.filter(v => !isBot(v.user_agent || ''))
  const visitors = new Set(realVisitors.map(v => v.session_id)).size

  // 計算結帳頁訪客（過濾 bot，去重 session_id）
  const allCheckout = checkoutVisitorsRes.data || []
  const realCheckout = allCheckout.filter(v => !isBot(v.user_agent || ''))
  const checkoutViews = new Set(realCheckout.map(v => v.session_id)).size

  // 付費報告統計
  const reports = reportsRes.data || []
  const validReports = reports.filter(r => r.status !== 'failed')
  const payments = validReports.length
  const completedReports = reports.filter(r => r.status === 'completed').length

  // 轉換率計算
  const pct = (num: number, den: number) =>
    den > 0 ? `${(num / den * 100).toFixed(1)}%` : '0.0%'

  const conversionRates = {
    visitorToSignup: pct(signups, visitors),
    signupToCheckout: pct(checkoutViews, signups),
    checkoutToPayment: pct(payments, checkoutViews),
    paymentToCompleted: pct(completedReports, payments),
    overallConversion: pct(payments, visitors),
  }

  // 各方案統計
  const byPlan: Record<string, { payments: number; revenue: number }> = {}
  let totalRevenue = 0
  for (const r of validReports) {
    const plan = (r.plan_code || 'unknown').split(/\s/)[0]
    const amt = parseFloat(r.amount_usd) || 0
    if (!byPlan[plan]) byPlan[plan] = { payments: 0, revenue: 0 }
    byPlan[plan].payments++
    byPlan[plan].revenue += amt
    totalRevenue += amt
  }
  // 四捨五入各方案營收
  for (const k of Object.keys(byPlan)) {
    byPlan[k].revenue = Math.round(byPlan[k].revenue * 100) / 100
  }

  // ARPU（平均每付費用戶收入）= 總收入 / 去重付費 email 數
  const paidEmails = new Set(
    validReports.map(r => r.customer_email).filter(Boolean)
  )
  const arpu = paidEmails.size > 0
    ? Math.round(totalRevenue / paidEmails.size * 100) / 100
    : 0

  // 平均報告生成時間（分鐘）— 用 email_sent_at 作為完成時間戳
  const completedWithTime = reports.filter(r =>
    r.status === 'completed' && r.created_at && r.email_sent_at
  )
  let avgGenerationMinutes = 0
  if (completedWithTime.length > 0) {
    const totalMinutes = completedWithTime.reduce((sum, r) => {
      const created = new Date(r.created_at).getTime()
      const updated = new Date(r.email_sent_at as string).getTime()
      return sum + (updated - created) / 60000
    }, 0)
    avgGenerationMinutes = Math.round(totalMinutes / completedWithTime.length * 10) / 10
  }

  return NextResponse.json({
    period: `${days}d`,
    funnel: {
      visitors,
      signups,
      checkoutViews,
      payments,
      completedReports,
    },
    conversionRates,
    byPlan,
    arpu,
    avgGenerationMinutes,
    // 額外資訊
    _meta: {
      signupsFallback,
      botFiltered: allVisitors.length - realVisitors.length,
    },
  })
}
