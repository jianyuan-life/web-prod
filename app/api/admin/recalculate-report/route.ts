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
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'
import { writeAuditLog } from '@/lib/admin-audit-log'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

// dry-run 模式會「同步」await generate-report 跑完整排盤+AI(數分鐘)、需放寬 function timeout
// 一般(非 dryRun)recalculate 走 fire-and-forget 6-8s、不受此影響
// Hobby plan 上限 60s、dryRun C 方案長跑需 Vercel Pro(Phase 5 #1)、否則只適用 D/R/E 等較快方案
export const maxDuration = 300

function getSupabase() {
  return createServiceClient()
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
    dryRun?: boolean   // Phase 6 #1 regression:不寫 DB / 不改 status / 不發 email、同步回傳重生內容
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
  const dryRun = body.dryRun === true   // 嚴格 === true、預設 false → 既有 admin/cron 行為不變
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

  // ── 🔴 dry-run 分支(Phase 6 #1 regression、v5.10.384)──
  // 走完整重生流程「但不留任何副作用」:不寫 paid_reports、不改 status、不備份
  // previous_report_result、不寫 audit log、不觸發 async workflow(workflow durable
  // 無法同步回內容)。改為「同步 await /api/generate-report 帶 dryRun:true」、relay
  // 生成內容供 regression similarity diff。報告現況(report_result / status / pdf
  // / email)100% 不受影響。
  // 注意:此分支在 auth + rate-limit + 輸入驗證 + report 讀取 + 狀態檢查「之後」、
  //       任何 DB 寫入「之前」、確保 dryRun 不繞過任何安全檢查、也不產生副作用。
  if (dryRun) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const internalSecret = process.env.CRON_SECRET || ''

    // L3 Codex R4 P2:workflow-only 方案(R 多成員存 birth_data.members、G15 家族)
    // fallback /api/generate-report 不支援其 payload 結構 → 會 500 或單人無效比對。
    // 與 G15 一致:在 relay 前 clean skip(回 skipped、script 標 SKIP 非 ERROR/假 FAIL)、
    // 且省一次注定失敗的 generate-report 呼叫(含 AI 成本)。
    const _bdPre = (updatedBirthData || {}) as Record<string, unknown>
    const isMultiMemberR = report.plan_code === 'R' || Array.isArray(_bdPre.members)
    if (isMultiMemberR) {
      return NextResponse.json({
        ok: false,
        dryRun: true,
        reportId,
        status: report.status,            // 未變更
        skipped: 'R-workflow-only',
        reason: 'R 合否?為多成員方案(birth_data.members)、僅走 durable workflow R branch、fallback generate-report 無法忠實重現、regression 經 dry-run 無效',
      })
    }

    try {
      // 傳「合併修正後的 updatedBirthData + planCode」(L3 Codex P2):
      //  - regression 用例:無帶 timezone 等修正 → updatedBirthData == report.birth_data
      //    → 等同「同生辰、新 prompt/引擎」對照(行為與只傳 reportId 一致)
      //  - admin fix-preview 用例:有帶 timezone/city/經緯度修正 → 預覽即反映修正後排盤
      //    (修 Codex P2:原只傳 reportId 會 reload 舊 birth_data、與 updated_fields 矛盾誤導)
      // 用 raw 原生請求 + AbortController:刻意對齊本檔下方既有 server→server internal
      // 觸發模式(workflow / fallback)。codebase 慣例 = client→internal 用 lib/api.ts
      // internalPost、server→server internal 用原生請求 [L2 IA P1-1 建議]
      // L3 Codex R3 P2-1:D 方案 topic/question 存在 birth_data、generate-report 只從
      // top-level body 讀(L1066-1067、無 birth_data fallback)。dryRun 只傳 birthData
      // 會讓 D 方案 regenerate 丟失客戶問題、similarity regression 失真。
      // 用與 webhook(route.ts:308)+ steps.ts(L1877-1878)相同 canonical key 映射 hydrate。
      // ⚠️ anti-drift:若 steps.ts:1877-1878 的 topic/question key 映射變更、此處需同步
      const _bd = updatedBirthData as Record<string, unknown>
      const hydratedTopic = (_bd.topic || _bd.analysis_topic || '') as string
      const hydratedQuestion = (_bd.question || _bd.customer_note || _bd.other_question || '') as string
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 290000) // 290s < maxDuration 300
      const genRes = await fetch(`${siteUrl}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({
          reportId,
          dryRun: true,
          birthData: updatedBirthData,        // 合併修正後(無修正時 = 原 birth_data)
          planCode: report.plan_code,
          topic: hydratedTopic,               // D 方案分析方向(忠實重現、similarity 才有效)
          question: hydratedQuestion,         // D 方案客戶問題描述
        }),
        signal: controller.signal,
      })
      clearTimeout(t)
      const genJson = await genRes.json().catch(() => ({} as Record<string, unknown>))

      // G15 等只走 workflow path 的方案:generate-report 回 200 + skipped(非 error)
      if (genJson?.skipped) {
        return NextResponse.json({
          ok: false,
          dryRun: true,
          reportId,
          status: report.status,            // 未變更
          skipped: genJson.skipped,
          reason: genJson.reason,
        })
      }
      if (!genRes.ok || genJson?.dryRun !== true) {
        return NextResponse.json({
          ok: false,
          dryRun: true,
          reportId,
          status: report.status,            // 未變更
          error: 'dry-run 重生失敗(generate-report 未回有效 dryRun 內容)',
          detail: typeof genJson?.error === 'string' ? genJson.error : `HTTP ${genRes.status}`,
        }, { status: 502 })
      }
      return NextResponse.json({
        ok: true,
        dryRun: true,
        reportId,
        status: report.status,              // 未變更(仍是原 completed/failed/pending)
        updated_fields: updatedFields,      // 若有帶 timezone 等、列出「若真重算會改的欄位」
        would_update: { ...topLevelUpdate },
        ai_model: genJson.ai_model,
        content_length: genJson.content_length,
        generated_content: genJson.generated_content,
        top5_timings: genJson.top5_timings,
        // L2 IA P1-2 + lesson #146:透傳 regression 對照範圍限制給消費端
        path: genJson.path || 'fallback-generate-report',
        scope_note: genJson.scope_note,
      })
    } catch (e) {
      // raw fetch abort → AbortError(name='AbortError' / message 含 'abort')
      const isTimeout = e instanceof Error && (e.name === 'AbortError' || e.message.toLowerCase().includes('abort'))
      return NextResponse.json({
        ok: false,
        dryRun: true,
        reportId,
        status: report.status,              // 全程未變更
        error: isTimeout ? 'dry-run 重生超時(C 方案長跑需 Vercel Pro / 改測較快方案)' : 'dry-run 重生失敗(網路錯誤)',
        detail: e instanceof Error ? e.message : String(e),
      }, { status: isTimeout ? 504 : 502 })
    }
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
