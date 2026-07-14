'use client'

import { TIME_BLOCKS } from './types'

interface TimeBlockPickerProps {
  eSelectedBlocks: boolean[]
  setESelectedBlocks: (v: boolean[]) => void
}

// 根據當前小時判斷目前是哪個時辰
function getCurrentShichen(): number {
  const hour = new Date().getHours()
  // 子時23-1, 丑時1-3, 寅時3-5, 卯時5-7, 辰時7-9, 巳時9-11
  // 午時11-13, 未時13-15, 申時15-17, 酉時17-19, 戌時19-21, 亥時21-23
  if (hour >= 23 || hour < 1) return 0  // 子
  if (hour < 3) return 1   // 丑
  if (hour < 5) return 2   // 寅
  if (hour < 7) return 3   // 卯
  if (hour < 9) return 4   // 辰
  if (hour < 11) return 5  // 巳
  if (hour < 13) return 6  // 午
  if (hour < 15) return 7  // 未
  if (hour < 17) return 8  // 申
  if (hour < 19) return 9  // 酉
  if (hour < 21) return 10 // 戌
  return 11                 // 亥
}

export default function TimeBlockPicker({ eSelectedBlocks, setESelectedBlocks }: TimeBlockPickerProps) {
  const currentShichen = getCurrentShichen()

  return (
    <fieldset className="border-t border-gold/10 pt-4 space-y-3">
      <legend className="text-sm font-semibold text-gold">可配合出行的時辰 *</legend>
      <p className="text-xs text-text-muted leading-relaxed">
        奇門遁甲以兩小時為一個時辰計算。請勾選您方便出門的時辰，系統將只在這些時段內為您找出最佳吉時。
        <span className="text-gold/70 ml-1">目前是{TIME_BLOCKS[currentShichen]?.label.split(' ')[0]}（{TIME_BLOCKS[currentShichen]?.label.split(' ')[1]}）</span>
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {TIME_BLOCKS.map((block, i) => {
          const isCurrent = i === currentShichen
          return (
            <label key={block.label} className={`checkout-choice flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-2 transition-all text-center ${
              eSelectedBlocks[i]
                ? 'border-gold/40 bg-gold/10'
                : 'border-gold/10 bg-white/5 hover:bg-white/8'
            } ${isCurrent ? 'ring-1 ring-gold/30' : ''}`}>
              <input
                type="checkbox"
                checked={eSelectedBlocks[i]}
                onChange={() => {
                  const updated = [...eSelectedBlocks]
                  updated[i] = !updated[i]
                  setESelectedBlocks(updated)
                }}
                className="accent-gold shrink-0"
              />
              <div className="flex flex-col items-start">
                <span className="text-xs font-medium text-text">{block.label.split(' ')[0]}</span>
                <span className="text-[10px] text-text-muted">{block.label.split(' ')[1]}</span>
              </div>
              {isCurrent && <span className="text-[9px] text-gold ml-auto">現在</span>}
            </label>
          )
        })}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setESelectedBlocks([
          false, false, false, false, true, true, true, true, true, true, false, false
        ])} className="text-[10px] text-gold/60 hover:text-gold">白天時辰（辰～酉）</button>
        <button type="button" onClick={() => setESelectedBlocks(new Array(12).fill(true))} className="text-[10px] text-gold/60 hover:text-gold">全選</button>
        <button type="button" onClick={() => setESelectedBlocks(new Array(12).fill(false))} className="text-[10px] text-gold/60 hover:text-gold">清除</button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">已選 {eSelectedBlocks.filter(Boolean).length} 個時辰</p>
      {!eSelectedBlocks.some(b => b) && (
        <p className="text-[10px] text-red-400/80" role="alert">請至少勾選一個時辰</p>
      )}
    </fieldset>
  )
}
