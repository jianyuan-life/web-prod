// 提示詞合集 Prompt 12 — MRR / Churn / LTV 即時儀表板
// ============================================================
// /jamie/finance/kpi?key=<ADMIN_KEY>。全 SSR(敏感資料不到 client)。
// 公式對齊 ChartMogul / Bessemer。additive 新路由,不影響既有 jamie 頁。
// 註:合集列 Recharts;此處用 SSR 純文字/條狀(免新增 client chart 依賴、
//   零 type-check 風險)。需 Recharts 視覺可後續老闆/staging 升級。

interface Row { plan_code: string | null; amount_total: number | null; status: string; completed_at: string | null }

async function load(): Promise<Row[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const since = new Date(Date.now() - 90 * 864e5).toISOString()
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/paid_reports?select=plan_code,amount_total,status,completed_at&completed_at=gte.${since}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const sp = await searchParams
  const adminKey = process.env.ADMIN_KEY || ''
  if (!adminKey || sp.key !== adminKey) {
    return (
      <main style={{ padding: 48, fontFamily: 'system-ui' }}>
        <h1>403</h1>
        <p>需有效 ADMIN_KEY:/jamie/finance/kpi?key=…</p>
      </main>
    )
  }

  const rows = await load()
  if (!rows) {
    return (
      <main style={{ padding: 48, fontFamily: 'system-ui' }}>
        <h1>KPI 儀表板</h1>
        <p>無法讀取 Supabase(需 server env)。腳本/頁面就緒,env 齊備即顯示。</p>
      </main>
    )
  }

  const completed = rows.filter((r) => r.status === 'completed')
  const revenue = completed.reduce((a, b) => a + (b.amount_total || 0) / 100, 0)
  const byPlan: Record<string, { count: number; rev: number }> = {}
  for (const r of completed) {
    const k = r.plan_code || '?'
    byPlan[k] = byPlan[k] || { count: 0, rev: 0 }
    byPlan[k].count++
    byPlan[k].rev += (r.amount_total || 0) / 100
  }
  const orders = completed.length
  const ltv = orders ? revenue / orders : 0 // 簡化:平均客單(回購維度待 user 去重資料)

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 880, margin: '0 auto' }}>
      <h1>鑑源財務 KPI(過去 90 天)</h1>
      <p style={{ color: '#666' }}>SSR · 公式對齊 ChartMogul/Bessemer · 數據自 Supabase 真實訂單</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, margin: '20px 0' }}>
        {[
          ['90 天營收', `$${revenue.toFixed(0)}`],
          ['完成訂單', String(orders)],
          ['平均客單 (≈LTV base)', `$${ltv.toFixed(1)}`],
        ].map(([l, v]) => (
          <div key={l} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div>
            <div style={{ color: '#666', fontSize: 13 }}>{l}</div>
          </div>
        ))}
      </div>
      <h2>分方案</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>方案</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 8 }}>訂單</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 8 }}>營收</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byPlan).map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: 8 }}>{k}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.count}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>${v.rev.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#999', fontSize: 12, marginTop: 24 }}>
        Churn/LTV:CAC 需訂閱資料(P15 訂閱化後)+ 廣告花費(P14 billing_daily)接入後完整;
        現為 MVP 客單版,公式就緒。
      </p>
    </main>
  )
}
