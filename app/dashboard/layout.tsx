import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '我的報告',  // root layout template 會補「| 鑒源 JianYuan」、此處只寫純標題避免品牌名重複
  description: '查看和下載您的命理報告。',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
