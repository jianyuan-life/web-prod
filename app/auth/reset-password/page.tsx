'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthShell from '@/components/auth/AuthShell'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })

    if (error) {
      const msgMap: Record<string, string> = {
        'User not found': '查無此 Email 帳號',
        'rate limit': '請求次數過多，請稍後再試',
        'Unable to validate email address': '信箱格式錯誤',
      }
      const zhMsg = Object.entries(msgMap).find(([key]) => error.message.toLowerCase().includes(key.toLowerCase()))?.[1] || error.message
      setError(zhMsg)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title={sent ? '請查看 Email' : '重設密碼'}
      description={sent ? '重設連結已寄出，只有持有該信箱的人能繼續。' : '輸入帳號 Email，我們會寄送一次性的重設連結。'}
      contextTitle="安全地取回你的私人檔案"
      contextBody="重設密碼不會改動已購買的報告、訂單或出生資料。"
    >
      {sent ? (
        <div className="jy-auth-status" role="status">
          <span className="jy-auth-status__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </span>
          <h2>重設連結已寄出</h2>
          <p>請檢查 <strong>{email}</strong> 的收件匣與垃圾郵件夾，並點擊信中連結設定新密碼。</p>
          <Link href="/auth/login" className="jy-button jy-button--secondary">返回登入</Link>
        </div>
      ) : (
        <form onSubmit={handleReset} className="jy-auth-form">
          <div className="jy-field">
            <label htmlFor="reset-email">Email</label>
            <input id="reset-email" name="email" type="email" required placeholder="your@email.com" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {error && <p className="jy-alert jy-alert--danger" role="alert">{error}</p>}

          <button type="submit" disabled={loading} className="jy-button jy-button--primary">
            {loading ? '發送中...' : '寄送重設連結'}
          </button>
        </form>
      )}

      {!sent && <p className="jy-auth-switch">想起密碼了？ <Link href="/auth/login">返回登入</Link></p>}
    </AuthShell>
  )
}
