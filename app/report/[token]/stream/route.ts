// 提示詞合集 Prompt 10 — 報告 streaming route(additive)
// ============================================================
// GET /report/[token]/stream → 以 SSE 逐段吐「已 completed 報告」內容,
// 讓前端可做漸進浮出 UX(首字 < 1s)。
//
// 🔴 自治邊界 + 不燒錢設計:本 route **不重新呼叫 AI**(重生成 = 動真錢
//   + 改付費生成流程 = P0)。只把「已存在的 completed 報告」分段串流,
//   純交付格式變更、零額外成本、零行為風險。
//   page.tsx 改 streamUI(改既有關鍵頁)= P0,需 webapp-testing + 老闆,
//   故本批只加 route、不動 page(最小 blast radius)。
// additive 新嵌套路由,不影響既有 /report/[token]。

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return new Response('service unavailable', { status: 503 })
  }

  let content = ''
  let status = 'unknown'
  try {
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/paid_reports?select=report_result,status&access_token=eq.${encodeURIComponent(token)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (r.ok) {
      const rows = await r.json()
      const row = Array.isArray(rows) ? rows[0] : null
      status = row?.status || 'not_found'
      const rr = row?.report_result
      content = typeof rr === 'string' ? rr : rr ? JSON.stringify(rr) : ''
    }
  } catch {
    return new Response('error', { status: 500 })
  }

  if (!content || status !== 'completed') {
    // 未完成 → 回 SSE 告知前端繼續用既有 polling(不在此重生成)
    return new Response(`event: pending\ndata: ${JSON.stringify({ status })}\n\n`, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    })
  }

  // 分段串流既有內容(每 ~400 字一個 chunk、模擬漸進浮出)
  const enc = new TextEncoder()
  const chunks: string[] = []
  for (let i = 0; i < content.length; i += 400) chunks.push(content.slice(i, i + 400))

  const stream = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(enc.encode(`event: chunk\ndata: ${JSON.stringify({ text: c })}\n\n`))
        await new Promise((res) => setTimeout(res, 15))
      }
      controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
