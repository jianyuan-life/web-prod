import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: '八字命理速算 免費排盤｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶)
  description: '免費八字排盤速算工具——輸入姓名與生辰，即時取得四柱八字、五行分佈、十神分析、大運流年、喜用神。採用壽星天文曆精準計算，結果可重複驗證。',
  keywords: '八字速算, 免費八字, 四柱八字, 五行分析, 十神, 大運流年, 喜用神, 八字命盤, 排盤工具',
  openGraph: {
    title: '八字命理速算｜鑒源 JianYuan',
    description: '免費八字排盤工具，精準計算四柱、五行、十神、大運。',
    url: 'https://jianyuan.life/tools/bazi',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/bazi' },
}

export default function BaziLayout({ children }: { children: React.ReactNode }) {
  return children
}
