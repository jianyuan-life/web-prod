// ============================================================
// Sprint 5 — 報告重算 API
//
// 用途：
//   1. 管理員在 /jamie/recalculate 發現 timezone 填錯或未填的報告
//   2. 補填正確的 timezone / birth_city / birth_country
//   3. 重新觸發 /api/generate-report 走完整排盤 + AI 分析流程
//
// 權限：使用 lib/admin-auth.ts 的 checkAdminAuth()，內部驗證 ADMIN_KEY env var
//
// POST /api/admin/recalculate-report
// Headers:
//   x-admin-key: <ADMIN_KEY>  // 對應 env var ADMIN_KEY
// Body:
//   {
//     reportId: string,                      // paid_reports.id（必填）
//     timezone?: string,                     // IANA 時區（可選：補填）
//     birth_city?: string,                   // 可選：補填
//     birth_country?: string,                // ISO 3166-1 alpha-2（可選）
//     birth_lat?: number,                    // 可選：補填經緯度
//     birth_lng?: number,
//     force?: boolean,                       // true=強制重算（略過狀態檢查）
//     reason?: string,                       // 稽核用
//   }
//
// 回傳：
//   { ok: true, reportId, status: 'pending', updated_fields: [...] }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 白名單檢查：只接受常見 IANA 時區前綴，避免 SQL injection/惡意輸入
function isValidIanaTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  // 基本格式：Area/Location 或 Area/SubArea/Location
  if (!/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(tz)) return false
  const validPrefixes = [
    'Africa/', 'America/', 'Antarctica/', 'Asia/', 'Atlantic/',
    'Australia/', 'Europe/', 'Indian/', 'Pacific/',
  ]
  return validPrefixes.some(p => tz.startsWith(p))
}

export async function POST(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail

  type Body = {
    reportId?: string
    timezone?: string
    birth_city?: string
    birth_country?: string
    birth_lat?: number
    birth_lng?: number
    force?: boolean
    reason?: string
    key?: string
  }
  let body: Body = {}
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const authFail = checkAdminAuth(req, body.key)
  if (authFail) return authFail

  const { reportId, timezone, birth_city, birth_country, birth_lat, birth_lng, force, reason } = body
  if (!reportId) {
    return NextResponse.json({ error: '必須提供 reportId' }, { status: 400 })
  }

  // 驗證 timezone
  if (timezone !== undefined && timezone !== '' && !isValidIanaTimezone(timezone)) {
    return NextResponse.json({ error: `無效的 IANA 時區字串：${timezone}` }, { status: 400 })
  }
  // 驗證 country code
  if (birth_country !== undefined && birth_country !== '') {
    const cc = birth_country.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) {
      return NextResponse.json({ error: '無效的國家碼（需 ISO 3166-1 alpha-2）' }, { status: 400 })
    }
  }

  const supabase = getSupabase()

  // 1. 取得報告資料(v5.10.274 加 report_result 給 history 備份)
  // v5.10.289:soft delete filter — 軟刪報告不允許 admin 重算(若需重算應先 restore)
  const { data: report, error: readErr } = await supabase
    .from('paid_reports')
    .select('id, status, birth_data, plan_code, customer_email, timezone, birth_city, birth_country, birth_lat, birth_lng, report_result')
    .eq('id', reportId)
    .is('deleted_at', null)
    .maybeSingle()

  if (readErr || !report) {
    return NextResponse.json({ error: '找不到報告(或已軟刪、需先 restore 才能重算)' }, { status: 404 })
  }

  if (!force && !['completed', 'failed', 'pending'].includes(report.status)) {
    return NextResponse.json({
      error: `目前狀態 ${report.status} 不適合重算。傳 force=true 覆寫`,
    }, { status: 400 })
  }

  // 2. 合併補填欄位到 birth_data 與 top-level
  type BirthDataLike = Record<string, unknown>
  const updatedBirthData: BirthDataLike = { ...(report.birth_data as BirthDataLike) }
  const topLevelUpdate: Record<string, string | number | null> = {}
  const updatedFields: string[] = []

  if (timezone !== undefined) {
    updatedBirthData.timezone = timezone || null
    topLevelUpdate.timezone = timezone || null
    updatedFields.push('timezone')
  }
  if (birth_city !== undefined) {
    updatedBirthData.birth_city = birth_city || null
    topLevelUpdate.birth_city = birth_city || null
    updatedFields.push('birth_city')
  }
  if (birth_country !== undefined) {
    const cc = birth_country ? birth_country.trim().toUpperCase() : null
    updatedBirthData.birth_country = cc
    topLevelUpdate.birth_country = cc
    updatedFields.push('birth_country')
  }
  if (birth_lat !== undefined) {
    updatedBirthData.latitude = birth_lat
    updatedBirthData.cityLat = birth_lat
    topLevelUpdate.birth_lat = birth_lat
    updatedFields.push('birth_lat')
  }
  if (birth_lng !== undefined) {
    updatedBirthData.longitude = birth_lng
    updatedBirthData.cityLng = birth_lng
    topLevelUpdate.birth_lng = birth_lng
    updatedFields.push('birth_lng')
  }

  // 3. 寫回 Supabase，並把 status 拉回 pending 以重觸發生成
  // v5.10.274 P0 修(Gemini P0#4):recalculate 前 backup 原 report_result
  //   - 客戶 dispute「新的不對、要回舊版」時、admin 可從 previous_report_result 還原
  //   - admin actor(目前用 reason 字段、Sprint 2.x 改 user_id)
  const { error: updateErr } = await supabase
    .from('paid_reports')
    .update({
      ...topLevelUpdate,
      birth_data: updatedBirthData,
      status: 'pending',
      error_message: null,
      tz_migrated_at: timezone ? new Date().toISOString() : undefined,
      // v5.10.274:備份原 report_result 給 audit/restore
      previous_report_result: report.report_result || null,
      recalculated_at: new Date().toISOString(),
      recalculated_by: reason || 'admin:recalculate-report',
    })
    .eq('id', reportId)

  if (updateErr) {
    console.error('[recalculate-report] update 失敗:', updateErr)
    return NextResponse.json({ error: '更新資料庫失敗' }, { status: 500 })
  }

  // 4. 稽核日誌（action 型別目前不含 recalculate_report，先用 retry_report）
  try {
    await writeAuditLog(req, 'retry_report', 'report', reportId, {
      updated_fields: updatedFields,
      new_timezone: timezone,
      new_country: birth_country,
      reason: reason || 'timezone 補填 + 重算（Sprint 5 國際化）',
    })
  } catch (e) {
    console.warn('[recalculate-report] audit log 失敗:', e)
  }

  // 5. 觸發 Workflow 重跑 + fallback
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const internalSecret = process.env.CRON_SECRET || ''
  let triggered = false
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 6000)
    const wfRes = await fetch(`${siteUrl}/api/workflows/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ reportId }),
      signal: controller.signal,
    })
    clearTimeout(t)
    if (wfRes.ok) triggered = true
  } catch (e) {
    console.warn('[recalculate-report] workflow 觸發失敗，啟用 fallback:', e)
  }
  if (!triggered) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      await fetch(`${siteUrl}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ reportId }),
        signal: controller.signal,
      })
      clearTimeout(t)
      triggered = true
    } catch (e) {
      console.error('[recalculate-report] fallback 也失敗:', e)
    }
  }

  return NextResponse.json({
    ok: true,
    reportId,
    status: 'pending',
    updated_fields: updatedFields,
    triggered,
    message: triggered
      ? '已補填資料並重新觸發報告生成'
      : '資料已更新但觸發生成失敗，請手動重試',
  })
}
