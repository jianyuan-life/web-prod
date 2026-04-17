import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '姓名學速算 康熙筆畫｜鑒源 JianYuan',
  description: '免費姓名學速算工具——五格剖象法、三才配置、數理吉凶分析。採用康熙字典筆畫共 102,998 字完整覆蓋，精準計算天地人外總五格。',
  keywords: '姓名學, 姓名速算, 康熙筆畫, 五格剖象, 三才配置, 數理吉凶, 姓名分析, 免費姓名學',
  openGraph: {
    title: '姓名學速算｜鑒源 JianYuan',
    description: '免費姓名學分析，康熙筆畫精準、五格三才完整呈現。',
    url: 'https://jianyuan.life/tools/name',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/name' },
}

export default function NameLayout({ children }: { children: React.ReactNode }) {
  return children
}
