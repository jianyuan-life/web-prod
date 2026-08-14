'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getSafeRedirect } from '@/lib/safe-redirect'
import AuthShell from '@/components/auth/AuthShell'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const safeRedirect = getSafeRedirect(redirectTo, '/dashboard')
  const isCheckoutReturn = Boolean(redirectTo) && safeRedirect.startsWith('/checkout')
  const signupHref = isCheckoutReturn
    ? `/auth/signup?redirect=${encodeURIComponent(safeRedirect)}`
    : '/auth/signup'

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
      const msgMap: Record<string, string> = {
        'Invalid login credentials': '帳號或密碼錯誤',
        'User already registered': '此 Email 已註冊',
        'Password should be at least': '密碼至少需要 8 個字元',
      }
      const zhMsg = Object.entries(msgMap).find(([key]) => error.message.includes(key))?.[1] || error.message
      setError(zhMsg)
      setLoading(false)
    } else {
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
    <AuthShell
      eyebrow="MEMBER SIGN IN"
      title="歡迎回來"
      description="登入鑑源帳號，繼續查看報告與生成進度。"
    >
      {isCheckoutReturn && (
        <p className="jy-alert" role="status">
          購買報告前需先登入或註冊；完成後會自動回到結帳頁，已填資料不會在這一步送出。
        </p>
      )}

      <form onSubmit={handleLogin} className="jy-auth-form">
        <div className="jy-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            placeholder="your@email.com"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div className="jy-field">
          <label htmlFor="login-password">密碼</label>
          <div className="jy-password-field">
            <input
              id="login-password"
              name="password"
              type={showPwd ? 'text' : 'password'}
              required
              placeholder="輸入你的密碼"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPwd((visible) => !visible)}
              aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
              aria-pressed={showPwd}
              className="jy-password-toggle"
            >
              {showPwd ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
        </div>

        {error && <p className="jy-alert jy-alert--danger" role="alert">{error}</p>}

        <div className="jy-auth-row">
          <Link href="/auth/reset-password" className="jy-text-link">忘記密碼？</Link>
        </div>

        <button type="submit" disabled={loading} className="jy-button jy-button--primary">
          {loading ? '登入中...' : isCheckoutReturn ? '登入並繼續結帳' : '登入並查看報告'}
        </button>
      </form>

      <div className="jy-auth-divider"><span>或</span></div>
      <button type="button" onClick={handleGoogleLogin} className="jy-button jy-button--secondary" style={{ width: '100%' }}>
        使用 Google 帳號登入
      </button>

      <p className="jy-auth-switch">
        還沒有帳號？ <Link href={signupHref}>免費建立帳號</Link>
      </p>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="jy-page py-20 text-center">載入中...</div>}>
      <LoginForm />
    </Suspense>
  )
}
