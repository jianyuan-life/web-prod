'use client'

import { SHICHEN } from './types'

interface BirthTimeFieldProps {
  timeMode: 'unknown' | 'shichen' | 'exact'
  setTimeMode: (m: 'unknown' | 'shichen' | 'exact') => void
  hour: string
  minute: string
  onChange: (field: 'hour' | 'minute', val: string) => void
  idPrefix?: string
  consultationWording?: boolean
}

export default function BirthTimeField({
  timeMode,
  setTimeMode,
  hour,
  minute,
  onChange,
  idPrefix = 'checkout-birth-time',
  consultationWording = false,
}: BirthTimeFieldProps) {
  return (
    <fieldset>
      <legend className="block text-xs text-text-muted mb-1">出生時間</legend>
      <div className="flex rounded-lg overflow-hidden border border-gold/20 mb-3" role="group" aria-label="出生時間精確度">
        {([
          { key: 'unknown', label: '不確定' },
          { key: 'shichen', label: '知道時辰' },
          { key: 'exact', label: '知道精確時間' },
        ] as const).map(({ key, label }) => (
          <button key={key} type="button"
            onClick={() => setTimeMode(key)}
            aria-pressed={timeMode === key}
            className={`flex-1 py-2 text-xs font-medium transition-all ${
              timeMode === key
                ? 'bg-gold/20 text-gold border-b-2 border-gold'
                : 'bg-white/5 text-text-muted hover:text-white'
            }`}
          >{label}</button>
        ))}
      </div>
      {timeMode === 'unknown' && (
        <div className="bg-white/5 border border-gold/10 rounded-lg px-4 py-3 text-text-muted text-sm" role="note">
          內部佔位時間不會用來支撐任何依賴時辰的結論；不必猜一個最接近的時辰。<br/>
          <span className="text-[10px] text-text-muted/60">
            {consultationWording
              ? '若之後找到出生證明，請聯絡客服核對是否適合重新生成；目前報告會清楚標出停用項目。'
              : '若之後找到出生證明，可以再用精確資料重新生成；目前報告會清楚標出停用項目。'}
          </span>
        </div>
      )}
      {timeMode === 'shichen' && (
        <div>
          <label htmlFor={`${idPrefix}-shichen`} className="sr-only">出生時辰</label>
          <select id={`${idPrefix}-shichen`} value={hour} onChange={(e) => onChange('hour', e.target.value)}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {SHICHEN.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}
      {timeMode === 'exact' && (
        <>
          <div className="flex gap-3">
            <label htmlFor={`${idPrefix}-hour`} className="sr-only">出生小時</label>
            <select id={`${idPrefix}-hour`} value={hour} onChange={(e) => onChange('hour', e.target.value)}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}時</option>
              ))}
            </select>
            <label htmlFor={`${idPrefix}-minute`} className="sr-only">出生分鐘</label>
            <select id={`${idPrefix}-minute`} value={minute} onChange={(e) => onChange('minute', e.target.value)}
              className="flex-1 bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
              {Array.from({ length: 60 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}分</option>
              ))}
            </select>
          </div>
          <div className="mt-2 text-[10px] text-text-muted/70 leading-relaxed">
            填得越精確、報告越準確。西洋占星上升點 / 吠陀 Lagna 約每 4 分鐘移動 1 度、整點誤差可能跨星座;
            人類圖設計圖閘門 / Profile / 類型對精確時間極敏感、整點誤差可能跨閘門邊界、影響類型與權威判定。
            強烈建議補到分鐘(可查戶口名簿、出生證明)。
          </div>
        </>
      )}
    </fieldset>
  )
}
