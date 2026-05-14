'use client'

// v5.7.94 紫微 12 宮輪盤(視覺化、Gemini #2 +6 分)
// v5.10.288 加 hover tooltip + click 高亮三方四正(互動升級、Sprint 3 backlog)
// 12 宮按傳統位置排列(命遷財官等 12 宮)、用顏色區分強弱

import { useState } from 'react'

const PALACE_POSITIONS = [
  // 12 宮的相對位置(順時針、命宮在 12 點方向)
  // 對宮 index = (i + 6) % 12;三方四正 index = (i + 4, i + 8) % 12
  { key: '命', label: '命宮', angle: -90, important: true, desc: '主管本人個性、命格高低、人生整體格局' },
  { key: '父母', label: '父母宮', angle: -60, desc: '主管父母、長輩、上司關係' },
  { key: '福德', label: '福德宮', angle: -30, desc: '主管興趣、信仰、心靈喜好、晚年福澤' },
  { key: '田宅', label: '田宅宮', angle: 0, desc: '主管房產、不動產、家庭環境' },
  { key: '官祿', label: '官祿宮', angle: 30, important: true, desc: '主管事業、職業、社會地位、工作成就' },
  { key: '僕役', label: '僕役宮', angle: 60, desc: '主管朋友、下屬、社交圈、合作夥伴' },
  { key: '遷移', label: '遷移宮', angle: 90, desc: '主管出外運、遠行、外緣、與命宮對沖' },
  { key: '疾厄', label: '疾厄宮', angle: 120, desc: '主管健康、體質、慢性疾病傾向' },
  { key: '財帛', label: '財帛宮', angle: 150, important: true, desc: '主管財運、現金流、賺錢方式' },
  { key: '子女', label: '子女宮', angle: 180, desc: '主管子女、創造力、合夥' },
  { key: '夫妻', label: '夫妻宮', angle: -150, important: true, desc: '主管配偶、感情、婚姻、伴侶緣分' },
  { key: '兄弟', label: '兄弟宮', angle: -120, desc: '主管兄弟姊妹、平輩、合作關係' },
]

export default function ZiweiPalaceWheel({ mingGong, mingZhu }: { mingGong?: string; mingZhu?: string }) {
  // v5.10.288 互動 state:hover 顯示描述、click 高亮三方四正
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  if (!mingGong && !mingZhu) return null

  // 三方四正:本宮 + 對宮(+6) + 三合宮(+4, +8)
  const sanFangIndexes = (idx: number): number[] => [idx, (idx + 4) % 12, (idx + 6) % 12, (idx + 8) % 12]

  const activeSet = activeIdx !== null ? new Set(sanFangIndexes(activeIdx)) : null

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
          <p className="text-[10px] text-text-muted mt-1 italic">
            ▸ hover 看宮位作用、click 高亮「三方四正」(本宮+對宮+三合)
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

        {/* 12 宮環繞 — v5.10.288 加 hover + click 互動 */}
        {PALACE_POSITIONS.map((p, idx) => {
          const radius = 110
          const rad = (p.angle * Math.PI) / 180
          const x = Math.cos(rad) * radius + 140
          const y = Math.sin(rad) * radius + 140
          const isMing = p.key === '命'
          const isActive = activeIdx === idx
          const inSanFang = activeSet?.has(idx) && !isActive
          return (
            <div
              key={p.key}
              role="button"
              tabIndex={0}
              aria-label={`${p.label}:${p.desc}`}
              className="absolute flex items-center justify-center text-[10px] rounded-lg cursor-pointer transition-all"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: '54px',
                height: '34px',
                transform: 'translate(-50%, -50%)',
                background: isActive
                  ? 'rgba(197,150,58,0.5)'
                  : inSanFang
                    ? 'rgba(155,89,182,0.35)'
                    : isMing
                      ? 'rgba(197,150,58,0.25)'
                      : p.important
                        ? 'rgba(155,89,182,0.15)'
                        : 'rgba(0,0,0,0.30)',
                border: isActive
                  ? '2px solid rgba(197,150,58,1.0)'
                  : inSanFang
                    ? '1.5px solid rgba(155,89,182,0.7)'
                    : isMing
                      ? '1.5px solid rgba(197,150,58,0.7)'
                      : p.important
                        ? '1px solid rgba(155,89,182,0.4)'
                        : '1px solid rgba(245,240,232,0.10)',
                color: isActive || isMing ? '#c9a84c' : (inSanFang || p.important) ? '#bb8fce' : 'rgba(245,240,232,0.55)',
                fontWeight: isActive ? 700 : isMing ? 700 : p.important ? 600 : 400,
                boxShadow: isActive ? '0 0 12px rgba(197,150,58,0.5)' : undefined,
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveIdx(activeIdx === idx ? null : idx)
                }
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

      {/* v5.10.288 互動 detail panel — hover/click 顯示宮位資訊 */}
      {(hoveredIdx !== null || activeIdx !== null) && (
        <div className="mt-4 p-3 rounded-lg bg-black/30 border border-purple-500/30">
          {(() => {
            const idx = activeIdx ?? hoveredIdx!
            const p = PALACE_POSITIONS[idx]
            const opposite = PALACE_POSITIONS[(idx + 6) % 12]
            const sanHe1 = PALACE_POSITIONS[(idx + 4) % 12]
            const sanHe2 = PALACE_POSITIONS[(idx + 8) % 12]
            return (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-bold text-amber-400">{p.label}</span>
                  {activeIdx !== null && (
                    <span className="text-[10px] text-purple-300">(已鎖定 — 再 click 取消)</span>
                  )}
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{p.desc}</p>
                {activeIdx !== null && (
                  <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-purple-300/80">
                    <span className="text-text-muted">三方四正:</span>
                    <span className="ml-1 text-amber-400">本宮 {p.label}</span>
                    <span className="mx-1 text-text-muted">·</span>
                    <span className="text-purple-300">對宮 {opposite.label}</span>
                    <span className="mx-1 text-text-muted">·</span>
                    <span className="text-purple-300">三合 {sanHe1.label} / {sanHe2.label}</span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
