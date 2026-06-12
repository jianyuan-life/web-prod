import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '帳號',  // root layout template 會補「| 鑒源 JianYuan」、此處只寫純標題避免品牌名重複
  description: '登入或註冊鑒源帳號，開始你的命理探索之旅。',
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
