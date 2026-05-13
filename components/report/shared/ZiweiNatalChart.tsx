// v5.10.220 — ZiweiNatalChart 紫微 12 宮命盤 SVG(Jamie 規格、無 D3 純 SVG skeleton、Sprint 2 加 D3 互動升級)
//
// 樣式:
//   12 宮排成 4×4 grid(中央 2×2 留空、繪本命/2026 流年資訊)
//   命宮 + 三方四正 (財帛/官祿/遷移)= 大主宮、金邊脈動
//   每宮顯示:宮位名 + 主星 + 干支 + 大運 + 流年
//
// a11y:每宮 <title>+<desc> 朗讀
'use client'

import type { ReactNode } from 'react'

export interface PalaceData {
  palace: string // 宮位名(命宮/兄弟/夫妻/子女/財帛/疾厄/遷移/僕役/官祿/田宅/福德/父母)
  mainPalace?: boolean // 命宮
  bigFour?: boolean // 大主宮(命/財/官/遷)
  stars: string[] // 主星 array
  ganzhi: string // 干支
  brightness?: string // 旺/廟/平/陷
}

export interface ZiweiNatalChartProps {
  palaces: PalaceData[] // 12 宮 array、order 從命宮起
  centerInfo?: {
    yearGanzhi?: string // 2026 丙午
    mainStar?: string // 命主星
    bodyStar?: string // 身宮主星
  }
  size?: number // px、default 600
  className?: string
}

// 12 宮 4×4 grid 位置(順時針從命宮起)
// position index: row * 4 + col(0-15、跳過中央 4 格 5/6/9/10)
const PALACE_POSITIONS = [
  { row: 3, col: 0, name: '命宮' },     // 左下角
  { row: 2, col: 0, name: '兄弟' },     // 左下中
  { row: 1, col: 0, name: '夫妻' },     // 左上中
  { row: 0, col: 0, name: '子女' },     // 左上角
  { row: 0, col: 1, name: '財帛' },     // 上左
  { row: 0, col: 2, name: '疾厄' },     // 上右
  { row: 0, col: 3, name: '遷移' },     // 右上角
  { row: 1, col: 3, name: '僕役' },     // 右上中
  { row: 2, col: 3, name: '官祿' },     // 右下中
  { row: 3, col: 3, name: '田宅' },     // 右下角
  { row: 3, col: 2, name: '福德' },     // 下右
  { row: 3, col: 1, name: '父母' },     // 下左
] as const

const BIG_FOUR = ['命宮', '財帛', '官祿', '遷移']

export function ZiweiNatalChart({
  palaces,
  centerInfo,
  size = 600,
  className = '',
}: ZiweiNatalChartProps) {
  const cellSize = size / 4
  // map palaces by name for quick lookup
  const palaceMap = new Map(palaces.map((p) => [p.palace, p]))

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`紫微斗數 12 宮命盤${centerInfo?.yearGanzhi ? `(${centerInfo.yearGanzhi}年)` : ''}`}
      >
        {/* 外框 */}
        <rect
          x={1}
          y={1}
          width={size - 2}
          height={size - 2}
          fill="none"
          stroke="rgba(229, 185, 92, 0.3)"
          strokeWidth={1.5}
        />

        {/* 12 宮 cells */}
        {PALACE_POSITIONS.map((pos) => {
          const data = palaceMap.get(pos.name)
          const isBigFour = BIG_FOUR.includes(pos.name)
          const x = pos.col * cellSize
          const y = pos.row * cellSize

          return (
            <PalaceCell
              key={pos.name}
              name={pos.name}
              data={data}
              x={x}
              y={y}
              size={cellSize}
              isBigFour={isBigFour}
            />
          )
        })}

        {/* 中央 2×2 — 顯示流年/命主星 */}
        <rect
          x={cellSize}
          y={cellSize}
          width={cellSize * 2}
          height={cellSize * 2}
          fill="rgba(15, 22, 40, 0.4)"
          stroke="rgba(229, 185, 92, 0.4)"
          strokeWidth={1.5}
        />
        {centerInfo && (
          <g>
            <text
              x={size / 2}
              y={size / 2 - 30}
              textAnchor="middle"
              style={{
                fontFamily: 'var(--jy-font-display)',
                fontSize: cellSize / 4,
                fill: 'var(--jy-text-gold)',
                fontWeight: 'bold',
              }}
            >
              {centerInfo.yearGanzhi || ''}
            </text>
            {centerInfo.mainStar && (
              <text
                x={size / 2}
                y={size / 2 + 5}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--jy-font-display)',
                  fontSize: cellSize / 5,
                  fill: 'var(--jy-text-secondary)',
                }}
              >
                命主:{centerInfo.mainStar}
              </text>
            )}
            {centerInfo.bodyStar && (
              <text
                x={size / 2}
                y={size / 2 + 30}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--jy-font-display)',
                  fontSize: cellSize / 6,
                  fill: 'var(--jy-text-tertiary)',
                }}
              >
                身宮:{centerInfo.bodyStar}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  )
}

interface PalaceCellProps {
  name: string
  data?: PalaceData
  x: number
  y: number
  size: number
  isBigFour: boolean
}

function PalaceCell({ name, data, x, y, size, isBigFour }: PalaceCellProps): ReactNode {
  const stroke = isBigFour ? 'rgba(229, 185, 92, 0.7)' : 'rgba(229, 185, 92, 0.2)'
  const strokeWidth = isBigFour ? 2 : 1
  const bg = isBigFour ? 'rgba(229, 185, 92, 0.06)' : 'rgba(15, 22, 40, 0.3)'

  return (
    <g>
      <title>{name}{data?.stars.length ? `:${data.stars.join('、')}` : ''}</title>
      <rect x={x} y={y} width={size} height={size} fill={bg} stroke={stroke} strokeWidth={strokeWidth} />

      {/* 宮位名 */}
      <text
        x={x + 8}
        y={y + 16}
        style={{
          fontSize: size / 12,
          fill: isBigFour ? 'var(--jy-text-gold)' : 'var(--jy-text-tertiary)',
          fontWeight: isBigFour ? 'bold' : 'normal',
        }}
      >
        {name}
      </text>

      {/* 干支 */}
      {data?.ganzhi && (
        <text
          x={x + size - 8}
          y={y + 16}
          textAnchor="end"
          style={{
            fontSize: size / 14,
            fill: 'var(--jy-text-muted)',
          }}
        >
          {data.ganzhi}
        </text>
      )}

      {/* 主星(垂直 list)*/}
      {data?.stars.map((star, i) => (
        <text
          key={i}
          x={x + size / 2}
          y={y + 36 + i * (size / 9)}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: size / 8,
            fill: isBigFour ? 'var(--jy-text-primary)' : 'var(--jy-text-secondary)',
            fontWeight: 'bold',
          }}
        >
          {star}
        </text>
      ))}

      {/* 大主宮 ★ 標記 */}
      {isBigFour && (
        <text
          x={x + size - 8}
          y={y + size - 8}
          textAnchor="end"
          style={{ fontSize: size / 12, fill: 'var(--jy-text-gold)' }}
        >
          ★
        </text>
      )}

      {/* 旺/廟/平/陷 */}
      {data?.brightness && (
        <text
          x={x + 8}
          y={y + size - 8}
          style={{ fontSize: size / 14, fill: 'var(--jy-text-muted)' }}
        >
          {data.brightness}
        </text>
      )}
    </g>
  )
}
