// ============================================================
// 提示詞合集 Prompt 6 — CrisisCard
// ============================================================
// 報告偵測到情緒風險詞時於最頂 render。讀 lib/i18n/crisis_resources.ts。
// 攸關性命:資源未經法務/臨床核對(CRISIS_RESOURCES_VERIFIED=false)時
// getCrisisResource() 回 null → 改顯示通用 fallback、絕不顯示未驗證號碼。
//
// additive 元件,由報告頁/dashboard 自行 import。本檔不自動 wire。

import { getCrisisResource, getCrisisCardCopy } from '@/lib/i18n/crisis_resources'

export interface CrisisCardProps {
  /** 用戶 locale(BCP-47,如 zh-TW / en / ja) */
  locale?: string
  /** 用戶國別(ISO-3166 alpha-2,從 geo header 取) */
  country?: string
}

export default function CrisisCard({ locale = 'zh-TW', country = 'TW' }: CrisisCardProps) {
  const copy = getCrisisCardCopy(locale)
  const res = getCrisisResource(country)

  return (
    <section
      role="alert"
      aria-live="polite"
      style={{
        background: '#0A0A0A',
        border: '1px solid #B33A2E',
        borderRadius: 12,
        padding: '20px 24px',
        margin: '0 0 28px',
        color: '#f5f5f5',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#fff' }}>
        {copy.title}
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: '0 0 14px', color: '#d0d0d0' }}>
        {copy.subtitle}
      </p>

      {res ? (
        <a
          href={`tel:${res.phone.replace(/[\s-]/g, '')}`}
          style={{
            display: 'inline-block',
            background: '#B33A2E',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: 'none',
          }}
          aria-label={`${copy.cta} ${res.name} ${res.phone}`}
        >
          {copy.cta}:{res.name} {res.phone}
          <span style={{ display: 'block', fontSize: 12, fontWeight: 400, opacity: 0.85 }}>
            {res.open_hours}
          </span>
        </a>
      ) : (
        // 資源未驗證(攸關性命)→ 通用 fallback、不顯示未核對號碼
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: '#e8b4ae' }}>
          {copy.fallback}
        </p>
      )}
    </section>
  )
}
