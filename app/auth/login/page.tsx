'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { getSafeRedirect } from '@/lib/safe-redirect'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const safeRedirect = getSafeRedirect(redirectTo, '/dashboard')

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (error) {
      // Supabase 英文錯誤訊息中文化
      const msgMap: Record<string, string> = {
        'Invalid login credentials': '帳號或密碼錯誤',
        'User already registered': '此 Email 已註冊',
        'Password should be at least': '密碼至少需要 8 個字元',
      }
      const zhMsg = Object.entries(msgMap).find(([key]) => error.message.includes(key))?.[1] || error.message
      setError(zhMsg)
      setLoading(false)
    } else {
      // 登入成功後存 email 到 localStorage（防止 Stripe 重導後丟失）
      try { localStorage.setItem('jianyuan_email', form.email) } catch {}
      window.location.href = safeRedirect
    }
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(safeRedirect)}` },
    })
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2">歡迎回來</h1>
        <p className="text-center text-text-muted text-sm mb-8">登入你的鑒源帳號</p>

        <form onSubmit={handleLogin} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs text-text-muted mb-1">Email</label>
            <input
              id="login-email"
              name="email"
              type="email" required placeholder="your@email.com"
              autoComplete="email"
              inputMode="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs text-text-muted mb-1">密碼</label>
            <input
              id="login-password"
              name="password"
              type="password" required placeholder="••••••••"
              autoComplete="current-password"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex justify-end">
            <a href="/auth/reset-password" className="text-xs text-gold/70 hover:text-gold hover:underline">
              忘記密碼？
            </a>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50">
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gold/10" /></div>
            <div className="relative flex justify-center"><span className="px-3 text-xs text-text-muted/60" style={{ background: 'var(--color-dark)' }}>或</span></div>
          </div>
          <button onClick={handleGoogleLogin}
            className="w-full max-w-md py-2.5 glass rounded-xl text-sm text-white hover:bg-white/10 transition-colors">
            Google 登入
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          還沒有帳號？ <a href="/auth/signup" className="text-gold hover:underline">立即註冊</a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-text-muted">載入中...</div>}>
      <LoginForm />
    </Suspense>
  )
}
