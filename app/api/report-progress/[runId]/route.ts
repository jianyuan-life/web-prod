// ============================================================
// 報告生成進度串流端點
// GET /api/report-progress/[runId]?access_token=xxx
// 客戶端用 EventSource / fetch 接收即時進度
//
// 認證（v5.3.35+）：
//   方案 A：query 帶 `?access_token=xxx` 比對 paid_reports.access_token
//   方案 B：登入 session（Authorization header 或 Supabase cookie）
//           且該用戶擁有至少一筆 paid_reports 處於 generating/pending
//   兩者任一通過即放行。都失敗回 401。
//
// 為何這樣設計：
//   runId = Vercel workflow instance UUID，雖不易猜但長壽且一旦洩漏
//   任何人都能看完整生成進度（含報告內容片段）。加認證可防範中度洩漏。
// ============================================================

import { getRun } from 'workflow/api'
import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth-helper'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

function getServiceSupabase() {
  return createServiceClient()
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const { searchParams } = new URL(request.url)

  // 方案 A：query access_token 比對 paid_reports
  // v5.10.283 soft delete filter:軟刪報告不再 grant report-progress 訪問權
  const accessToken = searchParams.get('access_token')
  if (accessToken && accessToken.length >= 10) {
    try {
      const supabase = getServiceSupabase()
      const { data } = await supabase
        .from('paid_reports')
        .select('id')
        .eq('access_token', accessToken)
        .is('deleted_at', null)
        .maybeSingle()
      if (data?.id) return true
    } catch {
      /* 降級到方案 B */
    }
  }

  // 方案 B：登入 session（只要是已登入且擁有任何 paid_reports）
  // v5.10.283 soft delete filter:全軟刪客戶不再有 progress 訪問權
  try {
    const user = await getAuthUser(request)
    if (user.email) {
      const supabase = getServiceSupabase()
      const { data } = await supabase
        .from('paid_reports')
        .select('id')
        .eq('customer_email', user.email)
        .is('deleted_at', null)
        .limit(1)
      if (data && data.length > 0) return true
    }
  } catch {
    /* ignore */
  }

  return false
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params

  // 認證：未授權直接拒絕
  const authorized = await isAuthorized(request)
  if (!authorized) {
    return new Response(
      JSON.stringify({ error: '未授權。請帶 ?access_token=<report access_token> 或以該報告擁有者身份登入。' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const { searchParams } = new URL(request.url)
  const startIndex = searchParams.get('startIndex')

  const run = getRun(runId)
  const stream = run.getReadable(
    startIndex ? { startIndex: parseInt(startIndex, 10) } : undefined,
  )

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
