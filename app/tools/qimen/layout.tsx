import type { Metadata } from 'next'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: { absolute: '奇門遁甲排盤 免費工具｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶)
  description: PUBLIC_CLAIMS.tools.qimenMetadata,
  keywords: '奇門遁甲, 奇門排盤, 九星八門, 時盤日盤, 奇門格局, 免費奇門, 奇門遁甲工具',
  openGraph: {
    title: '奇門遁甲排盤｜鑒源 JianYuan',
    description: PUBLIC_CLAIMS.tools.qimenMetadata,
    url: 'https://jianyuan.life/tools/qimen',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/qimen' },
}

export default function QimenLayout({ children }: { children: React.ReactNode }) {
  return children
}
