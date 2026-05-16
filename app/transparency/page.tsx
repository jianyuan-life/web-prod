// 提示詞合集 Prompt 29 — /transparency 公開 MRR 頁(SSG、無需 auth)
// ============================================================
// 🔴 自治邊界 + One-way door:公開財務 = 不可逆對外決策。
//   FF_TRANSPARENCY_PAGE 預設 false → 本頁顯示「即將推出」佔位、
//   **不撈也不顯示任何真實財務數字**(未經老闆書面同意前絕不公開)。
//   flag on(老闆書面 sign-off 後)→ 顯示真實數據(對齊 jianyuan-truth:
//   不得灌虛假基數;數字一律來自 Supabase 真實 orders)。
//
// additive 新路由,不影響既有頁面。

import { isFlagEnabled } from '@/lib/feature-flags'

export const metadata = {
  title: '鑑源 · 透明化',
  description: 'Building in Public',
}

async function loadPublicStats(): Promise<{ mrr: number; reports: number; avgRating: number | null } | null> {
  // 僅 flag on 時呼叫。只露彙總、不露個資。
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const r = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/paid_reports?select=amount_total,status&status=eq.completed`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (!r.ok) return null
    const rows: { amount_total: number | null }[] = await r.json()
    const rev = rows.reduce((a, b) => a + (b.amount_total || 0) / 100, 0)
    return { mrr: Math.round(rev), reports: rows.length, avgRating: null }
  } catch {
    return null
  }
}

export default async function TransparencyPage() {
  const enabled = isFlagEnabled('FF_TRANSPARENCY_PAGE')

  if (!enabled) {
    return (
      <main style={{ background: '#0A0A0A', color: '#fff', minHeight: '70vh', padding: '64px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28 }}>Building in Public</h1>
        <p style={{ color: '#aaa', marginTop: 12 }}>透明化頁面即將推出。</p>
      </main>
    )
  }

  const s = await loadPublicStats()
  return (
    <main style={{ background: '#0A0A0A', color: '#fff', minHeight: '70vh', padding: '56px 24px' }}>
      <h1 style={{ fontSize: 30, textAlign: 'center' }}>鑑源 · Building in Public</h1>
      <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          maxWidth: 720,
          margin: '32px auto',
        }}
      >
        <Stat label="累計營收 (USD)" value={s ? `$${s.mrr.toLocaleString()}` : '—'} />
        <Stat label="累計報告生成數" value={s ? String(s.reports) : '—'} />
        <Stat label="平均滿意度" value={s?.avgRating != null ? s.avgRating.toFixed(2) : '蒐集中'} />
      </div>
      <p style={{ color: '#666', textAlign: 'center', fontSize: 12 }}>
        數據每次載入自 Supabase 真實訂單彙總,不含任何虛構基數。
      </p>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#B33A2E' }}>{value}</div>
      <div style={{ color: '#aaa', fontSize: 13, marginTop: 6 }}>{label}</div>
    </div>
  )
}
