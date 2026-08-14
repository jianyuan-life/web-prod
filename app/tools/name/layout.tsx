import type { Metadata } from 'next'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: { absolute: '姓名學速算 康熙筆畫｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶)
  description: PUBLIC_CLAIMS.tools.nameMetadata,
  keywords: '姓名學, 姓名速算, 康熙筆畫, 五格剖象, 三才配置, 數理吉凶, 姓名分析, 免費姓名學',
  openGraph: {
    title: '姓名學速算｜鑒源 JianYuan',
    description: PUBLIC_CLAIMS.tools.nameMetadata,
    url: 'https://jianyuan.life/tools/name',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/name' },
}

export default function NameLayout({ children }: { children: React.ReactNode }) {
  return children
}
