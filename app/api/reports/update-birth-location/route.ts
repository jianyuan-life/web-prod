// ============================================================
// Sprint 5 — 客戶自助更新出生地資料 + 免費重算
// POST /api/reports/update-birth-location
// Authorization: Bearer <supabase access token>
//
// 用途：
//   客戶在 dashboard 發現時區填錯（如 DST 受影響的紐約客戶），
//   可自行修改出生地並觸發一次免費重算。
//
// 限制：
//   1. 必須是 report 的擁有者（customer_email 要對上 supabase auth email）
//   2. 每份報告最多更新 2 次（避免濫用）
//   3. 只允許更新地區相關欄位，不允許改姓名/出生日期等主資料
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthEmail } from '@/lib/auth-helper'

const MAX_SELF_UPDATES = 2  // 每份報告最多 2 次自助更新

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

function isValidIanaTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  if (!/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(tz)) return false
  return ['Africa/', 'America/', 'Antarctica/', 'Asia/', 'Atlantic/',
          'Australia/', 'Europe/', 'Indian/', 'Pacific/'].some(p => tz.startsWith(p))
}

export async function POST(req: NextRequest) {
  // 1. 驗證用戶身份（雙層 fallback：admin.getUser + JWT decode）
  const userEmail = await getAuthEmail(req)
  if (!userEmail) {
    return NextResponse.json({ error: '登入狀態失效' }, { status: 401 })
  }

  const supabase = getSupabase()

  // 2. 解析 body
  type Body = {
    reportId?: string
    timezone?: string
    birth_city?: string
    birth_country?: string
    birth_lat?: number
    birth_lng?: number
  }
  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const { reportId, timezone, birth_city, birth_country, birth_lat, birth_lng } = body
  if (!reportId) return NextResponse.json({ error: '必須提供 reportId' }, { status: 400 })
  if (!timezone || !isValidIanaTimezone(timezone)) {
    return NextResponse.json({ error: '必須提供有效的 IANA 時區' }, { status: 400 })
  }
  if (birth_country && !/^[A-Z]{2}$/.test(birth_country.trim().toUpperCase())) {
    return NextResponse.json({ error: '國家碼需為 ISO 3166-1 alpha-2' }, { status: 400 })
  }

  // 3. 驗證擁有權 + 自助更新次數
  const { data: report, error: readErr } = await supabase
    .from('paid_reports')
    .select('id, customer_email, status, birth_data, self_update_count')
    .eq('id', reportId)
    .maybeSingle()

  if (readErr || !report) {
    return NextResponse.json({ error: '找不到報告' }, { status: 404 })
  }
  if ((report.customer_email || '').toLowerCase() !== userEmail) {
    return NextResponse.json({ error: '無權修改他人報告' }, { status: 403 })
  }
  const selfUpdateCount = (report.self_update_count as number | null) || 0
  if (selfUpdateCount >= MAX_SELF_UPDATES) {
    return NextResponse.json({
      error: `此報告已達自助更新上限（${MAX_SELF_UPDATES} 次）。如需進一步修改請聯絡客服 support@jianyuan.life`,
    }, { status: 429 })
  }

  // 4. 更新欄位
  type BirthDataLike = Record<string, unknown>
  const updatedBirthData: BirthDataLike = { ...(report.birth_data as BirthDataLike) }
  updatedBirthData.timezone = timezone
  if (birth_city !== undefined) updatedBirthData.birth_city = birth_city || null
  if (birth_country !== undefined) updatedBirthData.birth_country = (birth_country || '').toUpperCase() || null
  if (birth_lat !== undefined) {
    updatedBirthData.latitude = birth_lat
    updatedBirthData.cityLat = birth_lat
  }
  if (birth_lng !== undefined) {
    updatedBirthData.longitude = birth_lng
    updatedBirthData.cityLng = birth_lng
  }

  const topLevelUpdate: Record<string, unknown> = {
    timezone,
    birth_data: updatedBirthData,
    status: 'pending',
    error_message: null,
    self_update_count: selfUpdateCount + 1,
    tz_migrated_at: new Date().toISOString(),
  }
  if (birth_city !== undefined) topLevelUpdate.birth_city = birth_city || null
  if (birth_country !== undefined) topLevelUpdate.birth_country = (birth_country || '').toUpperCase() || null
  if (birth_lat !== undefined) topLevelUpdate.birth_lat = birth_lat
  if (birth_lng !== undefined) topLevelUpdate.birth_lng = birth_lng

  const { error: updErr } = await supabase
    .from('paid_reports')
    .update(topLevelUpdate)
    .eq('id', reportId)
    .eq('customer_email', userEmail)  // 再次確認擁有權

  if (updErr) {
    console.error('[self-update] 更新失敗:', updErr)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }

  // 5. 觸發重算（Workflow → Fallback）
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const internalSecret = process.env.CRON_SECRET || ''
  let triggered = false
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 6000)
    const r = await fetch(`${siteUrl}/api/workflows/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ reportId }),
      signal: c.signal,
    })
    clearTimeout(t)
    if (r.ok) triggered = true
  } catch { /* fallback 後面處理 */ }

  if (!triggered) {
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), 8000)
      await fetch(`${siteUrl}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ reportId }),
        signal: c.signal,
      })
      clearTimeout(t)
      triggered = true
    } catch (e) {
      console.error('[self-update] fallback 失敗:', e)
    }
  }

  return NextResponse.json({
    ok: true,
    reportId,
    remaining_updates: Math.max(0, MAX_SELF_UPDATES - (selfUpdateCount + 1)),
    triggered,
    message: triggered
      ? '已更新出生地資料並重新生成報告，預計 30-60 分鐘完成'
      : '資料已更新但觸發生成失敗，請聯絡客服',
  })
}
