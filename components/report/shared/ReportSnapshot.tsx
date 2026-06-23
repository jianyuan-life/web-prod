// 報告重構 2026-06-23:速覽層(Executive Snapshot)— 一螢幕一重點大卡
// 借鏡 CliftonStrengths P1 速覽頁 + Spotify Wrapped 開場(research_report_ui_world_2026-06-23_apps.md #1/#3)
// 設計 spec:_audit_ui/goal_2026-06-23/prototype_C_v1.html .snapshot
// 純展示 server component、無互動;data 由各 report 型別元件從 schema 衍生(避免新增 schema 欄位)
// token 用 globals.css --jy-* / --color-*(MASTER §1、禁裸 hex)

export interface SnapshotItem {
  /** 小標籤,如「你是誰」「今年主軸」「最該把握」 */
  label: string
  /** 主結論句(可含 <b> 強調,用 emphasis 欄位另傳避免 XSS) */
  headline: string
  /** headline 中要金色強調的關鍵詞(可選,精準包字、不用 dangerouslySetInnerHTML) */
  emphasis?: string
  /** 補充說明一句 */
  sub?: string
}

function renderHeadline(headline: string, emphasis?: string) {
  if (!emphasis || !headline.includes(emphasis)) return headline
  const idx = headline.indexOf(emphasis)
  return (
    <>
      {headline.slice(0, idx)}
      <b style={{ fontWeight: 600, color: 'var(--jy-text-gold, #E0C068)' }}>{emphasis}</b>
      {headline.slice(idx + emphasis.length)}
    </>
  )
}

export function ReportSnapshot({ items }: { items: SnapshotItem[] }) {
  if (!items || items.length === 0) return null
  return (
    <section
      aria-label="重點速覽"
      className="grid gap-4 sm:gap-[18px] mb-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, minmax(0, 1fr))` }}
    >
      {items.slice(0, 3).map((it, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-[18px] p-7"
          style={{
            background:
              'linear-gradient(160deg, var(--jy-bg-card, #111A30), var(--jy-bg-raised, #0E1428))',
            border: '1px solid var(--jy-border, rgba(201,168,76,0.14))',
          }}
        >
          {/* 頂部金色細線 */}
          <span
            aria-hidden
            className="absolute left-0 top-0 h-[2px] w-full opacity-60"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--jy-text-gold, #C9A84C), transparent)',
            }}
          />
          <p
            className="mb-3.5 text-[0.78rem] tracking-[0.24em]"
            style={{
              fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
              color: 'var(--jy-text-gold-300, #E0C679)',
            }}
          >
            {it.label}
          </p>
          <p
            className="leading-[1.4]"
            style={{
              fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
              fontWeight: 300,
              fontSize: 'clamp(1.5rem, 2.6vw, 2rem)',
              color: 'var(--jy-text-primary, #E8E4DE)',
            }}
          >
            {renderHeadline(it.headline, it.emphasis)}
          </p>
          {it.sub && (
            <p
              className="mt-3 text-[0.9rem] leading-[1.7]"
              style={{ color: 'var(--jy-text-secondary, #B3B8C5)' }}
            >
              {it.sub}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
