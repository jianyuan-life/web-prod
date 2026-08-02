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
import { createServiceClient } from '@/lib/supabase'

// v5.10.459:flag off = 「即將推出」佔位頁 → noindex 避免收錄空頁;
// flag on(老闆 sign-off 上線)→ 自動恢復可索引(Codex L3 P2:noindex 必須隨 flag 條件化)
export function generateMetadata() {
  const enabled = isFlagEnabled('FF_TRANSPARENCY_PAGE')
  return {
    title: '鑒源 · 透明化',
    description: 'Building in Public',
    ...(enabled ? {} : { robots: { index: false, follow: false } }),
  }
}

async function loadPublicStats(): Promise<{ mrr: number; reports: number; avgRating: number | null } | null> {
  // 僅 flag on 時呼叫。只露彙總、不露個資。
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const { data, error } = await createServiceClient()
      .from('paid_reports')
      .select('amount_total,status')
      .eq('status', 'completed')
    if (error || !data) return null
    const rows = data as { amount_total: number | null }[]
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
      <section className="jy-page jy-public-page jy-transparency-page" aria-labelledby="transparency-title">
        <div className="jy-transparency-page__empty jy-panel">
          <p className="jy-eyebrow">TRANSPARENCY</p>
          <h1 id="transparency-title" className="jy-heading">Building in Public</h1>
          <p className="jy-lede">透明化頁面即將推出。</p>
          <p className="jy-transparency-page__note">公開資料會在完成核對與授權後於此呈現。</p>
        </div>
      </section>
    )
  }

  const s = await loadPublicStats()
  return (
    <section className="jy-page jy-public-page jy-transparency-page" aria-labelledby="transparency-title">
      <div className="jy-container jy-transparency-page__inner">
        <header className="jy-transparency-page__header">
          <p className="jy-eyebrow">TRANSPARENCY</p>
          <h1 id="transparency-title" className="jy-heading">鑒源 · Building in Public</h1>
          <p className="jy-lede">僅呈現經核對的訂單彙總，不公開任何個人資料。</p>
        </header>
        <dl className="jy-transparency-page__stats">
          <Stat label="累計營收 (USD)" value={s ? `$${s.mrr.toLocaleString()}` : '—'} />
          <Stat label="累計報告生成數" value={s ? String(s.reports) : '—'} />
          <Stat label="平均滿意度" value={s?.avgRating != null ? s.avgRating.toFixed(2) : '蒐集中'} />
        </dl>
        <p className="jy-transparency-page__note">
          數據每次載入自 Supabase 真實訂單彙總，不含任何虛構基數。
        </p>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="jy-transparency-page__stat jy-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
