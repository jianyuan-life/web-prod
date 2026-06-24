// DEV-ONLY 預覽(驗 ReportNarrativeCard + ChartSummaryCard 視覺、mock、驗完刪)、production guard
import { notFound } from 'next/navigation'
import { ChartSummaryCard } from '@/components/report/ChartSummaryCard'
import { ReportNarrativeCard } from '@/components/report/ReportNarrativeCard'
export const dynamic = 'force-dynamic'
const CHART = {
  bazi: {
    four_pillars: { year: { gan: '戊', zhi: '戌', shishen: '食神' }, month: { gan: '庚', zhi: '申', shishen: '偏財' }, day: { gan: '丙', zhi: '子' }, hour: { gan: '乙', zhi: '未', shishen: '正印' } },
    day_master: '丙', five_elements: { '木': 18, '火': 38, '土': 24, '金': 12, '水': 8 }, yongshen: '用神水，喜神木',
  },
}
const NARR = {
  archetype: '匠人型領袖',
  oneLiner: '你是一把淬鍊過的精鋼刀——天生帶著鋒芒與殺伐決斷力，以技立身、以智謀財',
  talentsTop3: ['直覺判斷力：資訊不完整時做出的判斷，通常比多數人花大量時間分析更準', '專業深度壁壘：認真投入某領域能達到的精度遠超同行', '審美與品味：對「好不好看、品質高不高」的判斷近乎天生'],
  risksTop3: ['午午自刑內耗：「自己打自己」的精神消耗是今年最大威脅', '快收成就換跑道：最容易在快有結果時放棄，財富積累最大破口', '婚姻冷戰升級：壓力大時關閉情感表達，讓配偶覺得被排斥'],
}
export default function P() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <div style={{ background: '#080B16', minHeight: '100vh', padding: '60px 20px' }} data-theme="dark">
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <ReportNarrativeCard narrative={NARR} />
        <ChartSummaryCard fullCharts={CHART} />
        <p style={{ color: '#666', fontSize: 12 }}>↑ ReportNarrativeCard + ChartSummaryCard dev 預覽（mock）</p>
      </div>
    </div>
  )
}
