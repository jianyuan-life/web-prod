// ============================================================
// Cron 重試端點 — 自動偵測卡住的 pending 報告並重新觸發生成
// 每 5 分鐘由 Vercel Cron 呼叫一次
//
// 關鍵設計（防止重複觸發）：
// 1. 只處理 pending 和 failed 狀態（NEVER reset generating to pending）
// 2. generating 狀態的報告有獨立超時邏輯（30 分鐘），超時直接標 failed
// 3. 用 generation_progress.started_at 判斷真實的 workflow 啟動時間
// 4. 觸發新 workflow 前先搶佔狀態，防止多個 cron 實例競爭
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Vercel Cron 最長執行時間 60 秒
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // 驗證 cron secret（防止外部未授權呼叫）
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  let retriedCount = 0
  let generatingCount = 0
  let timedOutCount = 0

  // ── Part A: 處理 pending/failed 報告（可安全重新觸發）──
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: pendingReports, error: queryErr } = await supabase
    .from('paid_reports')
    .select('id, retry_count, status, created_at')
    .in('status', ['pending', 'failed'])
    .lt('created_at', fiveMinAgo)
    .order('created_at', { ascending: true })
    .limit(5)

  if (queryErr) {
    console.error('❌ 查詢卡住報告失敗:', queryErr)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  for (const report of (pendingReports || [])) {
    const currentRetry = report.retry_count || 0

    if (currentRetry >= 3) {
      // 超過 3 次重試，標記為 failed（僅對 pending 做，failed 已經是了）
      if (report.status === 'pending') {
        await supabase.from('paid_reports').update({
          status: 'failed',
          error_message: `重試 ${currentRetry} 次仍失敗，請人工介入`,
        }).eq('id', report.id)
        console.info(`⚠️ 報告 ${report.id} 超過重試上限，標記為 failed`)
      }
      continue
    }

    // failed 狀態才重試（pending 理論上應該已被 webhook 觸發過了）
    // 但如果 pending 超過 5 分鐘還沒開始，也要重試
    // 用原子操作搶佔：只有 pending/failed 能被搶
    const { data: grabbed, error: grabErr } = await supabase
      .from('paid_reports')
      .update({
        status: 'pending', // 保持 pending，workflow 的 loadReportRecord 會搶佔為 generating
        retry_count: currentRetry + 1,
        generation_progress: { cron_retry_at: new Date().toISOString() },
      })
      .eq('id', report.id)
      .in('status', ['pending', 'failed'])
      .select('id')

    if (grabErr || !grabbed?.length) {
      console.info(`⏭️ 報告 ${report.id} 已被其他程序處理，跳過`)
      continue
    }

    // 觸發 workflow
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      await fetch(`${siteUrl}/api/workflows/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({ reportId: report.id }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      retriedCount++
      console.info(`✅ 重試報告 ${report.id}（第${currentRetry + 1}次）`)
    } catch (err) {
      console.error(`❌ 重試報告 ${report.id} 失敗:`, err)
    }
  }

  // ── Part B: 監控 generating 報告（只看不碰，除非真的超時）──
  // 30 分鐘超時：C 方案 3-call + 品質重試 最長需要 20 分鐘
  // 設 30 分鐘留足緩衝，避免誤殺正在跑的 workflow
  const { data: generatingReports } = await supabase
    .from('paid_reports')
    .select('id, created_at, generation_progress')
    .eq('status', 'generating')
    .order('created_at', { ascending: true })
    .limit(20)

  for (const report of (generatingReports || [])) {
    generatingCount++
    const progress = report.generation_progress as Record<string, string> | null

    // 用 generation_progress.started_at 判斷真實 workflow 啟動時間
    // 如果沒有 started_at，fallback 到 created_at（相容舊記錄）
    const startedAt = progress?.started_at || report.created_at
    const startedTime = new Date(startedAt).getTime()
    const sixtyMinAgo = Date.now() - 60 * 60 * 1000

    // 檢查最後活動時間（progress_updated_at），如果最近 15 分鐘有更新就不標超時
    const lastActivity = progress?.progress_updated_at || progress?.started_at || report.created_at
    const lastActivityTime = new Date(lastActivity).getTime()
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000

    if (startedTime < sixtyMinAgo && lastActivityTime < fifteenMinAgo) {
      // 真正超時：60 分鐘都沒跑完且最近 15 分鐘無活動，標記 failed
      await supabase.from('paid_reports').update({
        status: 'failed',
        error_message: `生成超時：Workflow 執行超過 60 分鐘且無活動（啟動: ${startedAt}，最後活動: ${lastActivity}）`,
      }).eq('id', report.id).eq('status', 'generating')
      timedOutCount++
      console.info(`⏰ 報告 ${report.id} 生成超時（60 分鐘+無活動），標記為 failed`)
    } else {
      const elapsed = Math.round((Date.now() - startedTime) / 1000)
      console.info(`⏳ 報告 ${report.id} 正在生成中（已 ${elapsed} 秒），不干預`)
    }
  }

  return NextResponse.json({
    message: '重試完成',
    retriedCount,
    generatingCount,
    timedOutCount,
    totalPending: pendingReports?.length || 0,
  })
}
