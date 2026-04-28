// E1/E2（以及任何方案）補生成 PDF 的輕量端點
// 用途：report_result 已存在但 pdf_url 缺失時，由前端按鈕觸發補生成
// 路徑：POST /api/reports/generate-pdf  body: { report_id }
// 回傳：{ pdf_url } 或 { error }
//
// 注意：本端點不動 workflow steps.ts / lib/ai，只做 PDF 生成這一步
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLAN_NAMES } from '@/lib/plan-names'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

const PYTHON_API = process.env.NEXT_PUBLIC_API_URL || ''

// v5.4.16 P1(Codex 真審):併發 lock map、防同 reportId 同時觸發兩次 PDF gen burn API
const pdfGenInFlight = new Map<string, Promise<string>>()


// 與 steps.ts 對齊的 PDF 預處理（Markdown/emoji 清理）
function preparePdfContent(raw: string): string {
  return raw
    .replace(/^---+$/gm, '')
    .replace(/^___+$/gm, '')
    .replace(/^\*\*\*+$/gm, '')
    .replace(/^[\s]*[-─—═]+[\s]*$/gm, '')
    .replace(/\d{1,3}\/100/g, '')
    .replace(/[（(]?\s*(?:綜合|整體|總|系統|本系統)?評分[：:]\s*\d*\s*[）)]?/g, '')
    .replace(/(?:綜合|整體|總)評分\s*(?:為|是|：|:)?\s*\d*/g, '')
    .replace(/^\s*評分\s*[:：]?\s*\d*\s*$/gm, '')
    .replace(/(\d+)\/(\d+)\s*(?=\n|$|「)/gm, '')
    .replace(/流年丙午(\d{3})/g, '流年（20$1')
    .replace(/→\s*具體應對[：:]\s*(?=\n\n|\n[0-9]|\n[一二三四五])/g, '')
    .replace(/^>\s*(.+)$/gm, '「$1」')
    .replace(/🟢/g, '【好】')
    .replace(/🟡/g, '【注意】')
    .replace(/🔵/g, '【改善】')
    .replace(/📌/g, '【重點】')
    .replace(/✅/g, '【✓】')
    .replace(/⚠️/g, '【!】')
    .replace(/🔧/g, '【建議】')
    .replace(/🎯/g, '【核心】')
    .replace(/💡/g, '【提示】')
    .replace(/❤️/g, '【愛】')
    .replace(/⭐/g, '【星】')
    .replace(/🔑/g, '【關鍵】')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2702}-\u{27B0}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/\u{200D}/gu, '')
    .replace(/\n{3,}/g, '\n\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const reportId = (body?.report_id || '').toString().trim()
    if (!reportId) {
      return NextResponse.json({ error: 'missing report_id' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const { data: report, error } = await supabase
      .from('paid_reports')
      .select('id, plan_code, status, client_name, pdf_url, report_result, birth_data, customer_email, user_id, stripe_session_id, access_token')
      .eq('id', reportId)
      .maybeSingle()

    if (error || !report) {
      return NextResponse.json({ error: 'report not found' }, { status: 404 })
    }

    // v5.4.15 P0 修(test 5 安全 audit):本端點原零認證、任何人可觸發 PDF 生成 burn API
    // 接受 3 種驗證之一:
    //   1. Authorization Bearer ${ADMIN_KEY} — admin 觸發
    //   2. body.access_token === report.access_token — 客戶持有報告 token
    //   3. body.session_id === report.stripe_session_id — 客戶持有 Stripe session
    const authHeader = req.headers.get('authorization') || ''
    const providedAccessToken = (body?.access_token || '').toString().trim()
    const providedSessionId = (body?.session_id || '').toString().trim()
    const adminKey = process.env.ADMIN_KEY
    const isAdminAuth = adminKey ? authHeader === `Bearer ${adminKey}` : false
    const isAccessTokenAuth = providedAccessToken && providedAccessToken === report.access_token
    const isSessionAuth = providedSessionId && providedSessionId === report.stripe_session_id
    if (!isAdminAuth && !isAccessTokenAuth && !isSessionAuth) {
      return NextResponse.json({ error: '未授權:需 admin token / access_token / session_id 之一' }, { status: 401 })
    }

    // 已存在 pdf_url 直接回傳
    if (report.pdf_url) {
      return NextResponse.json({ pdf_url: report.pdf_url, cached: true })
    }

    if (report.status !== 'completed') {
      return NextResponse.json(
        { error: 'report not completed yet', status: report.status },
        { status: 409 },
      )
    }

    // v5.4.16 P1(Codex 真審):in-process lock 防同 reportId 併發 burn API
    // 同一個 reportId 只允許一個 PDF 生成 in-flight、後到的等先到結果
    if (pdfGenInFlight.has(reportId)) {
      // 等先到的完成、或 30s 後 timeout 自己跑
      const existing = pdfGenInFlight.get(reportId)!
      try {
        const result = await Promise.race([
          existing,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('wait existing PDF gen timeout')), 30_000),
          ),
        ])
        return NextResponse.json({ pdf_url: result, cached: false, waited: true })
      } catch {
        // 既存 in-flight failed/timeout、繼續自己跑(刪 stale entry)
        pdfGenInFlight.delete(reportId)
      }
    }

    const ai = report.report_result as { ai_content?: string } | null
    const aiContent = ai?.ai_content || ''
    if (!aiContent) {
      return NextResponse.json({ error: 'report content missing' }, { status: 422 })
    }

    if (!PYTHON_API) {
      return NextResponse.json({ error: 'PYTHON_API not configured' }, { status: 500 })
    }

    const planCode = (report.plan_code || '').toString()
    const planName = PLAN_NAMES[planCode] || '命理分析報告'
    const pdfContent = preparePdfContent(aiContent)

    // 客戶姓名（家族/關係方案用聯合姓名）
    const bd = (report.birth_data || {}) as Record<string, unknown>
    let clientName = (report.client_name || bd.name || 'Unknown').toString()
    const memberNames = bd.member_names as string[] | undefined
    if (Array.isArray(memberNames) && memberNames.length > 0) {
      clientName = memberNames.filter(Boolean).join('、') || clientName
    }

    // v5.4.16 P1(Codex):整個 PDF gen + upload 包進 Promise 註冊到 lock map
    // 同 reportId 後到請求 await 同一 Promise、不會重複 burn
    const genPromise: Promise<string> = (async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 90_000)
      let pdfRes: Response
      try {
        pdfRes = await fetch(`${PYTHON_API}/api/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            report_id: reportId,
            plan_code: planCode,
            client_name: clientName,
            plan_name: planName,
            ai_content: pdfContent,
            locale: (bd.locale as string) || 'zh-TW',
            analyses_summary: [],
            show_header_footer: true,
            show_toc_page: true,
            cover_style: 'compact',
          }),
        })
      } finally {
        clearTimeout(timeout)
      }
      if (!pdfRes.ok) {
        const txt = await pdfRes.text().catch(() => '')
        throw new Error(`python pdf api failed HTTP ${pdfRes.status}: ${txt.slice(0, 300)}`)
      }
      const pdfData = await pdfRes.json() as { pdf_base64?: string; file_size_kb?: number }
      if (!pdfData.pdf_base64) throw new Error('pdf_base64 missing from python response')
      const pdfBytes = Buffer.from(pdfData.pdf_base64, 'base64')
      const storagePath = `${reportId}/report.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('reports')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (uploadErr) throw new Error(`supabase storage upload failed: ${uploadErr.message}`)
      const { data: urlData } = supabase.storage.from('reports').getPublicUrl(storagePath)
      const pdfUrl = urlData.publicUrl
      await supabase.from('paid_reports').update({ pdf_url: pdfUrl }).eq('id', reportId)
      return pdfUrl
    })()

    // 註冊到 lock map(in-flight)、其他併發請求看到會等
    pdfGenInFlight.set(reportId, genPromise)
    try {
      const pdfUrl = await genPromise
      return NextResponse.json({ pdf_url: pdfUrl, cached: false })
    } finally {
      // 完成後從 map 移除(成功或失敗都移)
      pdfGenInFlight.delete(reportId)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 })
  }
}
