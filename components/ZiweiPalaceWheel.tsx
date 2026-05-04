'use client'

// v5.7.94 紫微 12 宮輪盤(視覺化、Gemini #2 +6 分)
// 12 宮按傳統位置排列(命遷財官等 12 宮)、用顏色區分強弱

const PALACE_POSITIONS = [
  // 12 宮的相對位置(順時針、命宮在 12 點方向)
  { key: '命', label: '命宮', angle: -90, important: true },
  { key: '父母', label: '父母宮', angle: -60 },
  { key: '福德', label: '福德宮', angle: -30 },
  { key: '田宅', label: '田宅宮', angle: 0 },
  { key: '官祿', label: '官祿宮', angle: 30, important: true },
  { key: '僕役', label: '僕役宮', angle: 60 },
  { key: '遷移', label: '遷移宮', angle: 90 },
  { key: '疾厄', label: '疾厄宮', angle: 120 },
  { key: '財帛', label: '財帛宮', angle: 150, important: true },
  { key: '子女', label: '子女宮', angle: 180 },
  { key: '夫妻', label: '夫妻宮', angle: -150, important: true },
  { key: '兄弟', label: '兄弟宮', angle: -120 },
]

export default function ZiweiPalaceWheel({ mingGong, mingZhu }: { mingGong?: string; mingZhu?: string }) {
  if (!mingGong && !mingZhu) return null

  return (
    <div className="my-6 p-5 rounded-2xl" style={{
      background: 'rgba(155,89,182,0.06)',
      border: '1px solid rgba(155,89,182,0.25)',
    }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-cream">紫微 12 宮命盤</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            命宮 <span className="text-purple-300">{mingGong || '—'}</span>
            {mingZhu && ` · 主星 ${mingZhu}`} · 4 大主宮(命/官/財/夫)金邊強調
          </p>
        </div>
      </div>

      <div className="relative mx-auto" style={{ width: '280px', height: '280px' }}>
        {/* 中心圓 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full flex flex-col items-center justify-center" style={{
          background: 'radial-gradient(circle, rgba(155,89,182,0.30), rgba(155,89,182,0.10))',
          border: '2px solid rgba(155,89,182,0.55)',
        }}>
          <div className="text-purple-300/65 text-[8px] tracking-[2px]">命主星</div>
          <div className="text-cream text-sm font-bold mt-0.5">{mingZhu || mingGong || '—'}</div>
        </div>

        {/* 12 宮環繞 */}
        {PALACE_POSITIONS.map((p) => {
          const radius = 110
          const rad = (p.angle * Math.PI) / 180
          const x = Math.cos(rad) * radius + 140
          const y = Math.sin(rad) * radius + 140
          const isMing = p.key === '命'
          return (
            <div
              key={p.key}
              className="absolute flex items-center justify-center text-[10px] rounded-lg"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: '54px',
                height: '34px',
                transform: 'translate(-50%, -50%)',
                background: isMing ? 'rgba(197,150,58,0.25)' : p.important ? 'rgba(155,89,182,0.15)' : 'rgba(0,0,0,0.30)',
                border: isMing ? '1.5px solid rgba(197,150,58,0.7)' : p.important ? '1px solid rgba(155,89,182,0.4)' : '1px solid rgba(245,240,232,0.10)',
                color: isMing ? '#c9a84c' : p.important ? '#bb8fce' : 'rgba(245,240,232,0.55)',
                fontWeight: isMing ? 700 : p.important ? 600 : 400,
              }}
            >
              {p.label}
            </div>
          )
        })}

        {/* 連線(命遷對沖、官夫對沖 等) */}
        <svg className="absolute inset-0 pointer-events-none" width="280" height="280">
          {[
            { from: 0, to: 6 },   // 命 ↔ 遷
            { from: 4, to: 10 },  // 官 ↔ 夫
            { from: 8, to: 2 },   // 財 ↔ 福
          ].map((line, i) => {
            const f = PALACE_POSITIONS[line.from]
            const t = PALACE_POSITIONS[line.to]
            const r = 110
            const x1 = Math.cos((f.angle * Math.PI) / 180) * r + 140
            const y1 = Math.sin((f.angle * Math.PI) / 180) * r + 140
            const x2 = Math.cos((t.angle * Math.PI) / 180) * r + 140
            const y2 = Math.sin((t.angle * Math.PI) / 180) * r + 140
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(155,89,182,0.20)" strokeWidth="1" strokeDasharray="3 3" />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 text-[10px]">
        <div className="flex items-center gap-1.5 text-text-muted">
          <span className="w-2 h-2 rounded-full" style={{ background: '#c9a84c' }} />
          命宮(本人)
        </div>
        <div className="flex items-center gap-1.5 text-text-muted">
          <span className="w-2 h-2 rounded-full" style={{ background: '#bb8fce' }} />
          4 大主宮(財/官/夫/命)
        </div>
        <div className="flex items-center gap-1.5 text-text-muted">
          <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(245,240,232,0.4)' }} />
          其他 8 宮
        </div>
      </div>
    </div>
  )
}
