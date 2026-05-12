// v5.10.206 Sprint 1 — CrisisFooter 三地危機求助專線(Jamie 規格、心理研究室 SOP)
//
// 樣式:深藍底 / 白字 / 💙 icon、四地專線(對齊 Jamie 連發 + 心理研究室 SOP)
//
// 求助專線 source(2026-05 verified):
//   台灣 1925:依舊愛我(衛福部、24h)、安心專線
//   香港 18281080:撒瑪利亞防止自殺會(24h)
//   美國 988:Suicide & Crisis Lifeline(call/text、24h)
//   全球 https://findahelpline.com:跨國 130+ 國
export interface CrisisFooterProps {
  className?: string
  compact?: boolean // 精簡模式(只顯示 icon + 一句話)
}

const HOTLINES = [
  { region: '台灣', name: '1925 依舊愛我', tel: 'tel:1925', label: '24h 安心專線' },
  { region: '香港', name: '撒瑪利亞防止自殺會', tel: 'tel:+85228960000', display: '+852 2896 0000', label: '24h 中文' },
  { region: '美國', name: '988 Suicide & Crisis Lifeline', tel: 'tel:988', label: '24h call/text' },
  { region: '全球', name: 'findahelpline.com', tel: 'https://findahelpline.com', label: '跨國 130+ 國' },
]

export function CrisisFooter({ className = '', compact = false }: CrisisFooterProps) {
  if (compact) {
    return (
      <p className={`text-xs text-[var(--jy-text-tertiary)] ${className}`}>
        💙 若您有任何困擾、請撥打求助專線(台 1925 / 港 +852 2896 0000 / 美 988)
      </p>
    )
  }

  return (
    <aside
      className={`rounded-xl p-6 ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.08), rgba(74, 122, 255, 0.05))',
        border: '1px solid rgba(96, 165, 250, 0.2)',
      }}
      role="complementary"
      aria-labelledby="crisis-footer-title"
    >
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl flex-shrink-0" aria-hidden>💙</span>
        <div className="flex-1">
          <h4 id="crisis-footer-title" className="font-semibold text-[var(--jy-text-primary)]">
            如果您正面臨困擾、請尋求協助
          </h4>
          <p className="mt-1 text-sm text-[var(--jy-text-tertiary)]">
            命理只是參考、生命有它本身的價值。求助是勇氣、不是脆弱。
          </p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {HOTLINES.map((h) => (
          <li key={h.region} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--jy-semantic-water)] min-w-[3rem]">{h.region}</span>
              <a
                href={h.tel}
                target={h.tel.startsWith('http') ? '_blank' : undefined}
                rel={h.tel.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="text-[var(--jy-text-secondary)] hover:text-[var(--jy-text-primary)] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {h.display || h.name}
              </a>
            </div>
            <span className="text-xs text-[var(--jy-text-muted)]">{h.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
