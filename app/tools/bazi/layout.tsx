import type { Metadata } from 'next'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: { absolute: '八字命理速算 免費排盤｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶)
  description: PUBLIC_CLAIMS.tools.baziMetadata,
  keywords: '八字速算, 免費八字, 四柱八字, 五行分析, 十神, 大運流年, 喜用神, 八字命盤, 排盤工具',
  openGraph: {
    title: '八字命理速算｜鑒源 JianYuan',
    description: PUBLIC_CLAIMS.tools.baziMetadata,
    url: 'https://jianyuan.life/tools/bazi',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/bazi' },
}

export default function BaziLayout({ children }: { children: React.ReactNode }) {
  return children
}
