// 報告重構 2026-06-23:命盤綜合量化卡(deterministic 真實五行/四柱、零幻覺、零 contamination)
// 資料來源:report_result.full_charts(extractFullCharts 從排盤算出)。無資料則不渲染(graceful、舊報告零影響)。
// 純展示、用既有 token(MASTER §1、禁裸 hex)。

interface BaziPillar { gan?: string; zhi?: string; nayin?: string; shishen?: string }
interface FullChartsShape {
  bazi?: {
    four_pillars?: { year?: BaziPillar; month?: BaziPillar; day?: BaziPillar; hour?: BaziPillar }
    day_master?: string
    five_elements?: Record<string, number>
    yongshen?: string
    xishen?: string
  }
}

const WX_COLOR: Record<string, string> = {
  '木': 'var(--wx-wood, #5B8F6E)', '火': 'var(--wx-fire, #C26A55)', '土': 'var(--wx-earth, #C9A84C)',
  '金': 'var(--wx-metal, #C6C2B6)', '水': 'var(--wx-water, #5181A8)',
}
const WX_ORDER = ['木', '火', '土', '金', '水']

export function ChartSummaryCard({ fullCharts }: { fullCharts?: unknown }) {
  const fc = (fullCharts && typeof fullCharts === 'object' ? fullCharts : null) as FullChartsShape | null
  const bazi = fc?.bazi
  const fe = bazi?.five_elements
  // 無 deterministic 資料 → 不渲染(graceful、舊報告/萃取失敗零影響)
  if (!bazi || !fe || Object.keys(fe).length === 0) return null

  const total = WX_ORDER.reduce((s, k) => s + (Number(fe[k]) || 0), 0) || 1
  const pillars = bazi.four_pillars
  const hasPillars = !!(pillars?.day?.gan)

  return (
    <section
      aria-label="命盤綜合量化"
      style={{
        background: 'linear-gradient(160deg, var(--jy-bg-card, #111A30), var(--jy-bg-raised, #0E1428))',
        border: '1px solid var(--jy-border, rgba(201,168,76,0.16))',
        borderRadius: '18px', padding: '28px 26px', margin: '0 0 40px',
      }}
    >
      <p style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC", serif)', fontSize: '0.8rem', letterSpacing: '0.24em', color: 'var(--jy-text-gold-300, #E0C679)', marginBottom: '18px' }}>
        命 盤 綜 合 量 化
      </p>

      {/* 四柱 */}
      {hasPillars && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '22px' }}>
          {([['年', pillars!.year], ['月', pillars!.month], ['日', pillars!.day], ['時', pillars!.hour]] as const).map(([label, p]) =>
            p?.gan ? (
              <div key={label} style={{ flex: '1 1 70px', textAlign: 'center', background: 'var(--jy-bg-sunken, #060912)', borderRadius: '12px', padding: '12px 8px', border: label === '日' ? '1px solid var(--jy-text-gold, #C9A84C)' : '1px solid transparent' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--jy-text-secondary, #B3B8C5)', marginBottom: '6px' }}>{label}柱{label === '日' ? '（日主）' : ''}</div>
                <div style={{ fontFamily: 'var(--jy-font-serif, serif)', fontSize: '1.4rem', color: 'var(--jy-text-gold-light, #E0C068)' }}>{p.gan}{p.zhi || ''}</div>
                {p.shishen ? <div style={{ fontSize: '0.7rem', color: 'var(--jy-text-secondary, #B3B8C5)', marginTop: '4px' }}>{p.shishen}</div> : null}
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* 五行能量條 */}
      <div>
        {WX_ORDER.map((k) => {
          const v = Number(fe[k]) || 0
          const pct = Math.round((v / total) * 100)
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <span style={{ width: '1.6em', fontFamily: 'var(--jy-font-serif, serif)', fontSize: '1rem', color: 'var(--jy-text-primary, #E8E4DE)' }}>{k}</span>
              <div style={{ flex: 1, height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', borderRadius: '999px', background: WX_COLOR[k] }} />
              </div>
              <span style={{ width: '3em', textAlign: 'right', fontSize: '0.85rem', color: 'var(--jy-text-secondary, #B3B8C5)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
          )
        })}
      </div>

      {(bazi.yongshen || bazi.day_master) && (
        <p style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--jy-text-secondary, #B3B8C5)' }}>
          {bazi.day_master ? <>日主 <span style={{ color: 'var(--jy-text-gold, #C9A84C)' }}>{bazi.day_master}</span>　</> : null}
          {bazi.yongshen ? <>用神 <span style={{ color: 'var(--jy-text-gold, #C9A84C)' }}>{bazi.yongshen}</span></> : null}
        </p>
      )}
    </section>
  )
}
