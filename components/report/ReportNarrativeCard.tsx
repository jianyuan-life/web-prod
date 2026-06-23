// 報告重構 2026-06-23:敘事綜合卡(命格原型 + 一句話 + TOP3 天賦/課題)
// 資料來源:report_result.narrative_summary(aiExtractNarrative、Gemini 忠於原文、黃金驗證過 平均可追溯率 1.0)
// 無有效資料則不渲染(graceful)。純展示、用既有 token。

interface NarrativeShape {
  archetype?: string | null
  oneLiner?: string | null
  talentsTop3?: string[] | null
  risksTop3?: string[] | null
}

export function ReportNarrativeCard({ narrative }: { narrative?: unknown }) {
  const n = (narrative && typeof narrative === 'object' ? narrative : null) as NarrativeShape | null
  if (!n) return null
  const archetype = n.archetype && String(n.archetype).trim() && n.archetype !== 'null' ? String(n.archetype).trim() : ''
  const oneLiner = n.oneLiner && String(n.oneLiner).trim() && n.oneLiner !== 'null' ? String(n.oneLiner).trim() : ''
  const talents = Array.isArray(n.talentsTop3) ? n.talentsTop3.filter(Boolean).map(String) : []
  const risks = Array.isArray(n.risksTop3) ? n.risksTop3.filter(Boolean).map(String) : []
  // 全空 → 不渲染
  if (!archetype && !oneLiner && talents.length === 0 && risks.length === 0) return null

  return (
    <section
      aria-label="命格綜合"
      style={{
        background: 'linear-gradient(160deg, var(--jy-bg-card, #111A30), var(--jy-bg-raised, #0E1428))',
        border: '1px solid var(--jy-border, rgba(201,168,76,0.16))',
        borderRadius: '18px', padding: '30px 28px', margin: '0 0 36px',
      }}
    >
      {/* 命格原型 hero */}
      {archetype && (
        <div style={{ textAlign: 'center', marginBottom: oneLiner || talents.length || risks.length ? '24px' : '0' }}>
          <p style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC", serif)', fontSize: '0.78rem', letterSpacing: '0.28em', color: 'var(--jy-text-gold-300, #E0C679)', marginBottom: '12px' }}>命 格 原 型</p>
          <h2 style={{ fontFamily: 'var(--jy-font-serif, serif)', fontWeight: 300, fontSize: 'clamp(1.9rem, 4vw, 2.8rem)', letterSpacing: '0.08em', color: 'var(--jy-text-gold-light, #E0C068)', lineHeight: 1.25 }}>{archetype}</h2>
          {oneLiner && <p style={{ fontFamily: 'var(--jy-font-serif, serif)', fontWeight: 300, fontSize: 'clamp(1rem, 2.2vw, 1.3rem)', color: 'var(--jy-text-secondary, #B3B8C5)', marginTop: '14px', letterSpacing: '0.04em', maxWidth: '28em', marginInline: 'auto' }}>{oneLiner}</p>}
        </div>
      )}
      {!archetype && oneLiner && (
        <p style={{ fontFamily: 'var(--jy-font-serif, serif)', fontWeight: 300, fontSize: 'clamp(1.15rem, 2.4vw, 1.5rem)', color: 'var(--jy-text-primary, #E8E4DE)', textAlign: 'center', marginBottom: talents.length || risks.length ? '24px' : '0', letterSpacing: '0.04em' }}>{oneLiner}</p>
      )}

      {/* TOP3 天賦 / 課題 */}
      {(talents.length > 0 || risks.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: talents.length && risks.length ? '1fr 1fr' : '1fr', gap: '24px' }}>
          {talents.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--jy-font-serif, serif)', fontSize: '0.98rem', letterSpacing: '0.1em', color: 'var(--wx-wood, #5B8F6E)', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid var(--jy-border-soft, rgba(201,168,76,0.1))' }}>TOP 3 天賦</h3>
              {talents.slice(0, 3).map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '12px' }}>
                  <span style={{ fontFamily: 'var(--jy-font-serif, serif)', fontSize: '1.1rem', color: 'var(--jy-text-gold-700, #8E6F2A)', fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.92rem', color: 'var(--jy-text-secondary, #B3B8C5)', lineHeight: 1.65 }}>{t}</span>
                </div>
              ))}
            </div>
          )}
          {risks.length > 0 && (
            <div>
              <h3 style={{ fontFamily: 'var(--jy-font-serif, serif)', fontSize: '0.98rem', letterSpacing: '0.1em', color: 'var(--wx-fire, #C26A55)', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid var(--jy-border-soft, rgba(201,168,76,0.1))' }}>TOP 3 課題</h3>
              {risks.slice(0, 3).map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '12px' }}>
                  <span style={{ fontFamily: 'var(--jy-font-serif, serif)', fontSize: '1.1rem', color: 'var(--jy-text-gold-700, #8E6F2A)', fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.92rem', color: 'var(--jy-text-secondary, #B3B8C5)', lineHeight: 1.65 }}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
