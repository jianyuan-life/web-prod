import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: '奇門遁甲排盤 免費工具｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶)
  description: '免費奇門遁甲排盤——時盤、日盤、年盤即時生成，含九星、八門、八神、格局判斷。採用轉盤飛盤雙演算法，交叉驗證精準。',
  keywords: '奇門遁甲, 奇門排盤, 九星八門, 時盤日盤, 奇門格局, 免費奇門, 奇門遁甲工具',
  openGraph: {
    title: '奇門遁甲排盤｜鑒源 JianYuan',
    description: '免費奇門遁甲排盤，天地盤、九星八門、格局判斷完整呈現。',
    url: 'https://jianyuan.life/tools/qimen',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/qimen' },
}

export default function QimenLayout({ children }: { children: React.ReactNode }) {
  return children
}
