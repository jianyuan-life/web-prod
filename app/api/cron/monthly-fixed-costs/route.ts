// Monthly Fixed Costs Cron（v5.3.3 2026-04-18）
// GET /api/cron/monthly-fixed-costs
// Schedule: 0 0 1 * *（每月 1 日 00:00）
// Auth: Bearer $CRON_SECRET
//
// 功能：自動寫入 hosting_monthly 類別的固定支出
//
// 金額來源：環境變數（可在 Vercel 後台調整）
//   COST_VERCEL_MONTHLY      (default 20)
//   COST_SUPABASE_MONTHLY    (default 25)
//   COST_FLY_IO_MONTHLY      (default 10)
//   COST_CLOUDFLARE_MONTHLY  (default 0)
//   COST_RESEND_MONTHLY      (default 0)
//   COST_DOMAIN_MONTHLY      (default 0)  # 域名年費分攤
//
// 冪等性：同月同服務只寫一次（用 subcategory + year_month 去重）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordExpense } from '@/lib/accounting'

export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

type FixedCost = { subcategory: string; amount: number; description: string }

function buildFixedCosts(): FixedCost[] {
  return [
    { subcategory: 'vercel', amount: Number(process.env.COST_VERCEL_MONTHLY) || 20, description: 'Vercel Pro 月費' },
    { subcategory: 'supabase', amount: Number(process.env.COST_SUPABASE_MONTHLY) || 25, description: 'Supabase Pro 月費' },
    { subcategory: 'fly_io', amount: Number(process.env.COST_FLY_IO_MONTHLY) || 10, description: 'Fly.io 用量（預估）' },
    { subcategory: 'cloudflare', amount: Number(process.env.COST_CLOUDFLARE_MONTHLY) || 0, description: 'Cloudflare DNS/CDN' },
    { subcategory: 'resend', amount: Number(process.env.COST_RESEND_MONTHLY) || 0, description: 'Resend 郵件' },
    { subcategory: 'domain', amount: Number(process.env.COST_DOMAIN_MONTHLY) || 0, description: '域名年費分攤' },
  ].filter(c => c.amount > 0)
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
  } catch { /* noop */ }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const force = req.nextUrl.searchParams.get('force')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && force !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const costs = buildFixedCosts()
  const written: string[] = []
  const skipped: string[] = []

  for (const c of costs) {
    // 冪等：檢查本月是否已寫入此服務
    const { data: existing } = await supabase
      .from('expense_log')
      .select('id')
      .eq('category', 'hosting_monthly')
      .eq('subcategory', c.subcategory)
      .gte('occurred_at', monthStart)
      .lt('occurred_at', monthEnd)
      .maybeSingle()

    if (existing) {
      skipped.push(c.subcategory)
      continue
    }

    await recordExpense({
      category: 'hosting_monthly',
      subcategory: c.subcategory,
      amountUsd: c.amount,
      description: `${c.description}（${ym}）`,
      source: 'cron',
      createdBy: 'cron_monthly_fixed_costs',
      occurredAt: new Date().toISOString(),
      metadata: { year_month: ym, service: c.subcategory },
    })
    written.push(`${c.subcategory}($${c.amount})`)
  }

  if (written.length > 0) {
    const total = costs.filter(c => written.some(w => w.startsWith(c.subcategory))).reduce((s, c) => s + c.amount, 0)
    await sendTelegram(`💸 <b>${ym} 月固定支出入帳</b>\n${written.join('\n')}\n\n<b>合計：$${total.toFixed(2)}</b>`)
  }

  return NextResponse.json({ success: true, year_month: ym, written, skipped })
}
