'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getSafeRedirect } from '@/lib/safe-redirect'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const safeRedirect = getSafeRedirect(redirectTo, '/dashboard')

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPwd, setShowPwd] = useState(false)

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
        <h1 className="text-2xl font-bold text-center text-text mb-2">歡迎回來</h1>
        <p className="text-center text-text-muted text-sm mb-6">登入你的鑒源帳號</p>

        {/* 從結帳頁導回時的溫和提示 */}
        {redirectTo && redirectTo.startsWith('/checkout') && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-gold/20 bg-gold/[0.06] flex items-start gap-2 text-xs">
            <span className="text-gold mt-0.5">&#9432;</span>
            <span className="text-text-muted leading-relaxed">購買報告前需先登入或註冊，完成後會自動回到結帳頁。</span>
          </div>
        )}

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
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPwd ? 'text' : 'password'} required placeholder="••••••••"
                autoComplete="current-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-white/5 border border-gold/10 rounded-lg pl-4 pr-10 py-2.5 text-cream focus:border-gold/40 focus:outline-none transition-colors"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-text-muted/60 hover:text-gold transition-colors">
                {showPwd ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                defaultChecked
                className="w-3.5 h-3.5 rounded border-gold/20 bg-white/5 text-gold focus:ring-gold/30"
              />
              <span>記住我</span>
            </label>
            <Link href="/auth/reset-password" className="text-xs text-gold/70 hover:text-gold hover:underline">
              忘記密碼？
            </Link>
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
            className="w-full max-w-md py-2.5 glass rounded-xl text-sm text-text hover:bg-white/10 transition-colors">
            Google 登入
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          還沒有帳號？ <Link href="/auth/signup" className="text-gold underline hover:no-underline">立即註冊</Link>
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
