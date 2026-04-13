import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '免費命理速算 — 鑒源 JianYuan',
  description: '免費體驗鑒源命理速算：八字排盤、紫微斗數、奇門遁甲、姓名學分析。即時出結果，不需註冊。融合15大命理系統的命理分析平台。',
  keywords: '免費算命, 八字速算, 紫微斗數, 奇門遁甲, 奇門排盤, 姓名學, 五行分析, 免費命理, 姓名筆畫',
}

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children
}
