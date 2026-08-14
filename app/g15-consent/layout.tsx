import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '家族藍圖資料使用確認 | 鑒源',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
}

export default function G15ConsentLayout({ children }: { children: React.ReactNode }) {
  return children
}
