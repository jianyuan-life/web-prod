'use client'

import { useEffect, useState } from 'react'

/**
 * Footer / 聯絡頁的 email link。
 *
 * 為何要延遲 render：
 * Cloudflare Email Obfuscation（Scrape Shield）會在 edge 層把 HTML 裡的
 * `support@jianyuan.life` 自動替換為 `/cdn-cgi/l/email-protection` 形式。
 * 這會造成 server render 的 HTML 與 React JSX 不一致 → React #418 hydration mismatch。
 *
 * 解法：server render 時不輸出 email（純 span），client mount 後才用 useEffect
 * 組合 email 字串。這樣 Cloudflare edge 看不到明文 email 就不會替換。
 */
export default function EmailLink({
  className = '',
  label = '客服信箱',
}: {
  className?: string
  label?: string
}) {
  const [email, setEmail] = useState('')

  useEffect(() => {
    // 故意 split join 組出 email，避免 server render 時直接塞明文字串
    setEmail(['support', 'jianyuan.life'].join('@'))
  }, [])

  if (!email) {
    // SSR / client mount 前顯示 label（無 @ 符號，不會被 Cloudflare 偵測）
    return <span className={className}>{label}</span>
  }

  return (
    <a href={`mailto:${email}`} className={className}>
      {email}
    </a>
  )
}
