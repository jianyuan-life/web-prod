'use client'

import type { Dispatch, SetStateAction } from 'react'
import { E3_TOPICS } from './types'

interface Props {
  selectedTopics: string[]
  onChange: Dispatch<SetStateAction<string[]>>
}

/**
 * E3 週度補運專用 — 8 主題選擇器
 *
 * 規格書要求（E3_月度訂閱規格書.pdf 頁 3、4）：
 * - 8 類固定、選 1-3 個
 * - 選 3 個時 TOP 1/2/3（按點選順序決定、先點 = TOP 1）
 * - 不提供「其他自由文字」
 *
 * 點選順序即 TOP 順序：
 * - 第 1 個點選 → TOP 1（吉時主軸、分配 3 個吉時）
 * - 第 2 個點選 → TOP 2（分配 3 個吉時）
 * - 第 3 個點選 → TOP 3（分配 2 個吉時）
 * - 已選的再點一次 → 取消
 */
export default function ThemePicker({ selectedTopics, onChange }: Props) {
  // 使用 functional setState、確保連續 click 不會被 React batching 吃掉
  const toggle = (code: string) => {
    onChange((prev) => {
      if (prev.includes(code)) {
        // 取消選擇
        return prev.filter(c => c !== code)
      }
      // 超過 3 個提示（但不能在 setter 裡 alert、移外）
      if (prev.length >= 3) return prev
      // 新增
      return [...prev, code]
    })
  }

  // 點擊時若已滿 3、外部再 alert
  const handleClick = (code: string) => {
    if (!selectedTopics.includes(code) && selectedTopics.length >= 3) {
      alert('最多選 3 個主題。若要新增、請先取消其中一個。')
      return
    }
    toggle(code)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-cream mb-1">
          選擇本月重點主題 <span className="text-gold">（1-3 個）</span>
          <span className="text-red-400">*</span>
        </label>
        <p className="text-[11px] text-text-muted/70 leading-[1.6]">
          引擎依古法占事派精算、為每個主題分配專屬吉時。
          <br />
          <span className="text-gold/80">
            順序重要：先點的為 TOP 1（吉時主軸）、依序 TOP 2 / TOP 3
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {E3_TOPICS.map((topic) => {
          const rank = selectedTopics.indexOf(topic.code) + 1 // 0 = 未選、1-3 = TOP N
          const isSelected = rank > 0
          const rankLabel = ['', 'TOP 1', 'TOP 2', 'TOP 3'][rank] || ''
          const rankColor = ['', 'bg-gold text-dark', 'bg-gold/70 text-dark', 'bg-gold/40 text-cream'][rank] || ''

          return (
            <button
              key={topic.code}
              type="button"
              onClick={() => handleClick(topic.code)}
              className={`relative text-left rounded-xl p-3 border transition-all ${
                isSelected
                  ? 'border-gold/60 bg-gold/10 shadow-[0_0_0_1px_rgba(197,150,58,0.3)]'
                  : 'border-gold/10 bg-white/5 hover:bg-white/8 hover:border-gold/20'
              }`}
            >
              {isSelected && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${rankColor}`}>
                  {rankLabel}
                </span>
              )}
              <div className={`text-sm font-semibold mb-0.5 ${isSelected ? 'text-gold' : 'text-cream'}`}>
                {topic.label}
              </div>
              <div className="text-[10px] text-text-muted leading-[1.4]">
                {topic.desc}
              </div>
            </button>
          )
        })}
      </div>

      {/* 狀態提示 */}
      <div className="text-[11px] leading-[1.6]">
        {selectedTopics.length === 0 && (
          <p className="text-red-400/80">⚠ 至少選 1 個主題</p>
        )}
        {selectedTopics.length === 1 && (
          <p className="text-gold/80">✓ 已選 1 個：全部 8 個吉時專注於此主題</p>
        )}
        {selectedTopics.length === 2 && (
          <p className="text-gold/80">✓ 已選 2 個：8 吉時平均分配（4 + 4）</p>
        )}
        {selectedTopics.length === 3 && (
          <p className="text-green-400/90">✓ 已選 3 個：TOP 1 (3 吉時) + TOP 2 (3 吉時) + TOP 3 (2 吉時)</p>
        )}
      </div>
    </div>
  )
}
