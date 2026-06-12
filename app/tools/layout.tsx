import type { Metadata } from 'next'

// 工具總入口 — 子路由（bazi/ziwei/qimen/name）各自覆蓋 title
export const metadata: Metadata = {
  title: { absolute: '免費命理速算｜鑒源 JianYuan' },  // absolute 防 root template 再補品牌名(title 已自帶;子路由各自覆蓋)
  description: '免費體驗鑒源命理速算：八字排盤、紫微斗數、奇門遁甲、姓名學分析。即時出結果，不需註冊。',
  keywords: '免費算命, 八字速算, 紫微斗數, 奇門遁甲, 奇門排盤, 姓名學, 五行分析, 免費命理, 姓名筆畫',
}

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children
}
