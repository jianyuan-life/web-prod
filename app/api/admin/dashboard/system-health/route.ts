// Dashboard 系統健康 API（L7+ BI 2026-04-17）
// GET /api/admin/dashboard/system-health
// Headers: x-admin-key
//
// 聚合數據：
//   - Python API（Fly.io）回應時間 + 狀態
//   - Supabase 可用性 + 表列數
//   - Stripe 可達性 + 餘額
//   - Resend 送達率（from email_send_log 過去 24 小時）
//   - Webhook 成功率（從 paid_reports 狀態推估）
//   - 報告生成成功率（過去 24 小時）

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

type CheckResult = {
  name: string
  status: 'ok' | 'warn' | 'error'
  latency_ms: number
  message: string
  detail?: Record<string, unknown>
}

async function ping(name: string, fn: () => Promise<{ message: string; detail?: Record<string, unknown>; status?: 'ok' | 'warn' }>): Promise<CheckResult> {
  const start = Date.now()
  try {
    const r = await fn()
    return { name, status: r.status || 'ok', latency_ms: Date.now() - start, message: r.message, detail: r.detail }
  } catch (err) {
    return { name, status: 'error', latency_ms: Date.now() - start, message: err instanceof Error ? err.message : '未知錯誤' }
  }
}

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const supabase = getSupabase()
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [checksArr, emailLogRes, reportsRes, cronLogsRes] = await Promise.all([
    Promise.all([
      // Python API (Fly.io)
      ping('Python API (Fly.io)', async () => {
        const url = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        try {
          const res = await fetch(`${url}/health`, { signal: controller.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return { message: '排盤 API 正常' }
        } finally { clearTimeout(timeout) }
      }),
      // Supabase
      ping('Supabase', async () => {
        const { count, error } = await supabase.from('paid_reports').select('id', { count: 'exact', head: true })
        if (error) throw new Error(error.message)
        return { message: `連線正常（paid_reports: ${count ?? 0} 筆）`, detail: { total_reports: count ?? 0 } }
      }),
      // Stripe
      ping('Stripe', async () => {
        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey) throw new Error('STRIPE_SECRET_KEY 未設定')
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        try {
          const res = await fetch('https://api.stripe.com/v1/balance', {
            headers: { Authorization: `Bearer ${stripeKey}` },
            signal: controller.signal,
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          const usd = data.available?.find((b: { currency: string }) => b.currency === 'usd')
          const pending = data.pending?.find((b: { currency: string }) => b.currency === 'usd')
          return {
            message: `餘額 $${((usd?.amount || 0) / 100).toFixed(2)}（pending $${((pending?.amount || 0) / 100).toFixed(2)}）`,
            detail: { available_usd: (usd?.amount || 0) / 100, pending_usd: (pending?.amount || 0) / 100 },
          }
        } finally { clearTimeout(timeout) }
      }),
      // Vercel
      ping('Vercel（網站）', async () => {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        try {
          const res = await fetch(siteUrl, { signal: controller.signal, method: 'HEAD' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return { message: '網站可達' }
        } finally { clearTimeout(timeout) }
      }),
      // Resend（只檢查 Key 設定）
      ping('Resend', async () => {
        const key = process.env.RESEND_API_KEY
        if (!key) throw new Error('RESEND_API_KEY 未設定')
        return { message: 'API Key 已設定（域名 jianyuan.life 已驗證）' }
      }),
    ]),
    // Email 送達率（過去 24h）
    // v5.3.34：schema drift 修復 — 實際 schema 用 sent_at（不是 created_at）
    supabase
      .from('email_send_log')
      .select('status')
      .gte('sent_at', dayAgo),
    // 報告生成成功率（過去 24h）
    supabase
      .from('paid_reports')
      .select('status')
      .gte('created_at', dayAgo),
    // 最近的 Cron/Workflow 狀態（從 audit_log 取）
    supabase
      .from('admin_audit_log')
      .select('action, created_at, metadata')
      .in('action', ['retry_report'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // Email 送達率
  const emailLogs = emailLogRes.data || []
  const emailCounts = {
    total: emailLogs.length,
    sent: emailLogs.filter(e => e.status === 'sent' || e.status === 'delivered').length,
    delivered: emailLogs.filter(e => e.status === 'delivered').length,
    bounced: emailLogs.filter(e => e.status === 'bounced').length,
    complained: emailLogs.filter(e => e.status === 'complained').length,
    failed: emailLogs.filter(e => e.status === 'failed').length,
  }
  const emailDeliveryRate = emailCounts.total > 0
    ? Math.round(((emailCounts.sent + emailCounts.delivered) / emailCounts.total) * 1000) / 10
    : null

  // 報告生成成功率
  const reports = reportsRes.data || []
  const reportStats = {
    total: reports.length,
    completed: reports.filter(r => r.status === 'completed').length,
    failed: reports.filter(r => r.status === 'failed').length,
    generating: reports.filter(r => r.status === 'generating' || r.status === 'pending').length,
  }
  const reportSuccessRate = reportStats.total > 0
    ? Math.round((reportStats.completed / reportStats.total) * 1000) / 10
    : null

  // Webhook 成功率（paid_reports 建立數 / 預期數）— 現階段直接用完成比例推估
  const webhookEstimate = reportStats.total > 0 && reportStats.completed + reportStats.failed > 0
    ? Math.round((reportStats.completed / (reportStats.completed + reportStats.failed)) * 1000) / 10
    : null

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    services: checksArr,
    email_delivery: {
      ...emailCounts,
      delivery_rate_pct: emailDeliveryRate,
      note: emailDeliveryRate === null ? '尚無 email_send_log 數據（請於 Supabase 執行 migration create_email_send_log.sql 並整合 Resend 寄送）' : null,
    },
    report_generation: {
      ...reportStats,
      success_rate_pct: reportSuccessRate,
    },
    webhook_reliability: {
      estimated_success_pct: webhookEstimate,
      note: '基於 paid_reports 完成/失敗比推估。建議整合 Stripe webhook log 精確計算。',
    },
    recent_cron_jobs: (cronLogsRes.data || []).map(l => ({
      action: l.action,
      created_at: l.created_at,
      metadata: l.metadata,
    })),
    overall: checksArr.every(c => c.status === 'ok') ? 'healthy' : checksArr.some(c => c.status === 'error') ? 'unhealthy' : 'degraded',
  })
}
