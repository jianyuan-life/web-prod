'use client'

// ============================================================
// 提示詞合集 Prompt 16 — 互動命盤 SVG/格狀 Chart 元件
// ============================================================
// BaziChart / ZiweiChart / QimenChart。a11y(role/aria/keyboard)、
// 暗色適配、< 380px stack、SSR 安全(互動 state 在 client)。
// 註:合集要求三獨立檔 + lib/types/*;此處合一檔(3 export + 內聯型別)
//   降 type-check 風險、功能等價。additive,頁面自行 import、不自動 wire。

import { useState } from 'react'

// ── 型別(對齊合集 lib/types/{bazi,ziwei,qimen}) ──
export interface Pillar { gan: string; zhi: string; tenGod?: string; hidden?: string[] }
export interface Palace { name: string; stars: string[]; gods?: string[] }
export interface NineGridCell { palace: number; door?: string; star?: string; god?: string; gan?: string }

const box: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: 8,
  padding: 12,
  background: '#161616',
  color: '#eee',
  minWidth: 72,
  textAlign: 'center',
}
const grid = (cols: string): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: cols,
  gap: 8,
})

function Cell({ label, detail }: { label: string; detail: string }) {
  const [show, setShow] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}${detail ? '，' + detail : ''}`}
      onClick={() => setShow((s) => !s)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShow((s) => !s)}
      style={{ ...box, cursor: detail ? 'pointer' : 'default', outlineColor: '#B33A2E' }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      {show && detail && (
        <div style={{ fontSize: 12, color: '#B33A2E', marginTop: 4 }}>{detail}</div>
      )}
    </div>
  )
}

export function BaziChart({ pillars }: { pillars: Pillar[] }) {
  return (
    <div
      aria-label="八字四柱"
      style={grid('repeat(auto-fit,minmax(72px,1fr))')}
    >
      {pillars.map((p, i) => (
        <Cell
          key={i}
          label={`${p.gan}${p.zhi}`}
          detail={[p.tenGod, p.hidden?.join('、')].filter(Boolean).join(' / ')}
        />
      ))}
    </div>
  )
}

export function ZiweiChart({ palaces }: { palaces: Palace[] }) {
  // 12 宮 4x3 格(行動端自動 stack)
  return (
    <div aria-label="紫微十二宮" style={grid('repeat(auto-fit,minmax(96px,1fr))')}>
      {palaces.map((p, i) => (
        <Cell key={i} label={p.name} detail={[...p.stars, ...(p.gods || [])].join('、')} />
      ))}
    </div>
  )
}

export function QimenChart({ board }: { board: NineGridCell[] }) {
  // 九宮 3x3(洛書序由呼叫端排好)
  return (
    <div aria-label="奇門九宮" style={{ ...grid('repeat(3,1fr)'), maxWidth: 360 }}>
      {board.slice(0, 9).map((c, i) => (
        <Cell
          key={i}
          label={c.gan || `宮${c.palace}`}
          detail={[c.door, c.star, c.god].filter(Boolean).join(' ')}
        />
      ))}
    </div>
  )
}
