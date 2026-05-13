// v5.10.208 — BaziPillars 八字四柱(Jamie 規格 20+ 元件之一)
//
// 樣式:4 柱方框、干在上字大、支在下、五行顏色字、十神 chip(選用)
import { cn } from '@/lib/utils'

export interface BaziPillarsData {
  year: string // 年柱(2 字、如「戊戌」)
  month: string
  day: string
  hour: string
  dayMaster?: string // 日主(可選 highlight)
  tenGods?: { year?: string; month?: string; hour?: string } // 十神(年/月/時 對日主)
}

export interface BaziPillarsProps {
  data: BaziPillarsData
  highlightDayMaster?: boolean // 強調日柱
  className?: string
}

// 五行對應色
function getElementColor(char: string): string {
  // 天干五行
  const TIANGAN = {
    '甲': 'wood', '乙': 'wood',
    '丙': 'fire', '丁': 'fire',
    '戊': 'earth', '己': 'earth',
    '庚': 'metal', '辛': 'metal',
    '壬': 'water', '癸': 'water',
  } as const
  // 地支五行(本氣)
  const DIZHI = {
    '寅': 'wood', '卯': 'wood',
    '巳': 'fire', '午': 'fire',
    '辰': 'earth', '戌': 'earth', '丑': 'earth', '未': 'earth',
    '申': 'metal', '酉': 'metal',
    '亥': 'water', '子': 'water',
  } as const

  const element = (TIANGAN as Record<string, string>)[char] || (DIZHI as Record<string, string>)[char]
  if (!element) return 'var(--jy-text-secondary)'

  const COLOR_MAP: Record<string, string> = {
    wood: 'var(--jy-semantic-wood)',
    fire: 'var(--jy-semantic-fire)',
    earth: 'var(--jy-semantic-earth)',
    metal: 'var(--jy-semantic-metal)',
    water: 'var(--jy-semantic-water)',
  }
  return COLOR_MAP[element] || 'var(--jy-text-secondary)'
}

export function BaziPillars({ data, highlightDayMaster = true, className = '' }: BaziPillarsProps) {
  const PILLAR_LABELS = ['年', '月', '日', '時']
  const pillars = [data.year, data.month, data.day, data.hour]
  const tenGods = [data.tenGods?.year, data.tenGods?.month, '日主', data.tenGods?.hour]

  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>
      {pillars.map((pillar, i) => {
        const isDayMaster = i === 2
        const tianGan = pillar.charAt(0)
        const diZhi = pillar.charAt(1)
        const tianGanColor = getElementColor(tianGan)
        const diZhiColor = getElementColor(diZhi)

        return (
          <div
            key={i}
            className={cn(
              'relative rounded-xl p-4 text-center',
              'border transition-colors',
              isDayMaster && highlightDayMaster
                ? 'border-[var(--jy-border-gold)] bg-[rgba(229,185,92,0.08)]'
                : 'border-[var(--jy-border-soft)] bg-[var(--jy-bg-card)]/40',
            )}
          >
            {/* 柱位 label */}
            <div className="text-xs text-[var(--jy-text-muted)] mb-2">
              {PILLAR_LABELS[i]}柱
              {isDayMaster && highlightDayMaster && (
                <span className="ml-1 text-[var(--jy-text-gold)]">★</span>
              )}
            </div>

            {/* 天干(大字)*/}
            <div
              className="font-bold leading-none mb-2"
              style={{
                fontFamily: 'var(--jy-font-display)',
                fontSize: 'clamp(36px, 4vw, 56px)',
                color: tianGanColor,
              }}
              aria-label={`${PILLAR_LABELS[i]}柱天干 ${tianGan}`}
            >
              {tianGan}
            </div>

            {/* 地支(中字)*/}
            <div
              className="font-medium"
              style={{
                fontFamily: 'var(--jy-font-display)',
                fontSize: 'clamp(20px, 2vw, 28px)',
                color: diZhiColor,
              }}
              aria-label={`${PILLAR_LABELS[i]}柱地支 ${diZhi}`}
            >
              {diZhi}
            </div>

            {/* 十神 chip */}
            {tenGods[i] && (
              <div className="mt-3 inline-flex items-center px-2 py-0.5 rounded-full text-[11px]"
                style={{
                  backgroundColor: 'rgba(229, 185, 92, 0.12)',
                  color: 'var(--jy-text-gold)',
                  border: '1px solid var(--jy-border-hairline)',
                }}
              >
                {tenGods[i]}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
