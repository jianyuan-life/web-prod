'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
      // Supabase 英文錯誤訊息中文化
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
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2">重設密碼</h1>
        <p className="text-center text-text-muted text-sm mb-8">
          輸入你的 Email，我們會寄送重設密碼連結
        </p>

        {sent ? (
          <div className="glass rounded-2xl p-6 text-center space-y-4">
            <div className="text-4xl text-gold">&#9993;</div>
            <p className="text-cream font-semibold">重設連結已寄出</p>
            <p className="text-sm text-text-muted">
              請檢查 <span className="text-gold">{email}</span> 的收件匣（也看看垃圾郵件夾），
              點擊信中的連結即可重設密碼。
            </p>
            <Link href="/auth/login" className="inline-block mt-4 text-sm text-gold hover:underline">
              返回登入
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs text-text-muted mb-1">Email</label>
              <input
                id="reset-email"
                name="email"
                type="email" required placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50">
              {loading ? '發送中...' : '發送重設連結'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-text-muted">
          想起密碼了？ <Link href="/auth/login" className="text-gold hover:underline">返回登入</Link>
        </p>
      </div>
    </div>
  )
}
