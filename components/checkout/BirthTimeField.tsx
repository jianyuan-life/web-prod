'use client'

import { SHICHEN } from './types'

interface BirthTimeFieldProps {
  timeMode: 'unknown' | 'shichen' | 'exact'
  setTimeMode: (m: 'unknown' | 'shichen' | 'exact') => void
  hour: string
  minute: string
  onChange: (field: 'hour' | 'minute', val: string) => void
}

export default function BirthTimeField({ timeMode, setTimeMode, hour, minute, onChange }: BirthTimeFieldProps) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">出生時間</label>
      <div className="flex rounded-lg overflow-hidden border border-gold/20 mb-3">
        {([
          { key: 'unknown', label: '不確定' },
          { key: 'shichen', label: '知道時辰' },
          { key: 'exact', label: '知道精確時間' },
        ] as const).map(({ key, label }) => (
          <button key={key} type="button"
            onClick={() => setTimeMode(key)}
            className={`flex-1 py-2 text-xs font-medium transition-all ${
              timeMode === key
                ? 'bg-gold/20 text-gold border-b-2 border-gold'
                : 'bg-white/5 text-text-muted hover:text-white'
            }`}
          >{label}</button>
        ))}
      </div>
      {timeMode === 'unknown' && (
        <div className="bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-text-muted text-sm">
          將以正午（12:00）計算，部分時辰相關分析可能有偏差。<br/>
          <span className="text-[10px] text-text-muted/60">小提示：可詢問父母或查看出生證明，知道大概時段也可以選「知道時辰」。</span>
        </div>
      )}
      {timeMode === 'shichen' && (
        <select value={hour} onChange={(e) => onChange('hour', e.target.value)}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
          {SHICHEN.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      {timeMode === 'exact' && (
        <>
          <div className="flex gap-3">
            <select value={hour} onChange={(e) => onChange('hour', e.target.value)}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}時</option>
              ))}
            </select>
            <select value={minute} onChange={(e) => onChange('minute', e.target.value)}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
              {Array.from({ length: 60 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}分</option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] text-text-muted/70 leading-relaxed">
            💡 填得越精確、報告越準確。西洋占星上升點 / 吠陀 Lagna 約每 4 分鐘移動 1 度、整點誤差可能跨星座;
            人類圖設計圖閘門 / Profile / 類型對精確時間極敏感、整點誤差可能跨閘門邊界、影響類型與權威判定。
            強烈建議補到分鐘(可查戶口名簿、出生證明)。
          </div>
        </>
      )}
    </div>
  )
}
