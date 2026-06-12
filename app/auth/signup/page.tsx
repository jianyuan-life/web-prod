'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { internalGet, internalPost } from '@/lib/api'  // T10b v5.10.375(timeout + 429 handling)
import TurnstileWidget from '@/components/security/TurnstileWidget'  // Phase 5 v5.10.377 老闆按鈕 #5(Turnstile bot 防護)

function SignupForm() {
  const params = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [refCode, setRefCode] = useState(params.get('ref') || '')
  const [refValid, setRefValid] = useState<string | null>(null) // 推薦人名字
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  // Phase 5 v5.10.377 — Turnstile token state(老闆灌 NEXT_PUBLIC_TURNSTILE_SITE_KEY 後 widget 自動顯示)
  const [turnstileToken, setTurnstileToken] = useState('')

  // 推薦碼驗證
  useEffect(() => {
    if (!refCode || refCode.length < 5) { setRefValid(null); return }
    const timer = setTimeout(async () => {
      try {
        // T10b v5.10.375 — internalGet 統一處理(timeout + RateLimitError silent fail)
        const data = await internalGet(`/api/referral/validate?code=${encodeURIComponent(refCode)}`) as { valid?: boolean; referrerName?: string }
        setRefValid(data.valid ? (data.referrerName ?? null) : null)
      } catch { setRefValid(null) }
    }, 500)
    return () => clearTimeout(timer)
  }, [refCode])

  const handleGoogleLogin = async () => {
    // Google OAuth 前先存推薦碼到 localStorage（callback 時寫入 referrals 表）
    if (refCode && refValid) {
      localStorage.setItem('pending_referral_code', refCode)
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('兩次輸入的密碼不一致')
      setLoading(false)
      return
    }

    // Phase 5 v5.10.377 — Turnstile bot 防護:有 site key 時必驗(沒設則 stub mode 自動 pass)
    // dev 模式下 widget 不顯示、token 留空、server 回 stub success(本地測試友好)
    // production:沒設 secret = fail-closed 拒絕(已在 lib/security/turnstile.ts 處理)
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (turnstileSiteKey) {
      try {
        const verifyRes = await internalPost('/api/auth/turnstile-verify', { token: turnstileToken }) as { success?: boolean; errorCodes?: string[] }
        if (!verifyRes.success) {
          setError('人機驗證失敗、請重新嘗試')
          setLoading(false)
          return
        }
      } catch {
        setError('人機驗證系統異常、請稍後再試')
        setLoading(false)
        return
      }
    }

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      // Supabase 英文錯誤訊息中文化
      const msgMap: Record<string, string> = {
        'User already registered': '此 Email 已註冊',
        'Password should be at least 8 characters': '密碼至少需要 8 個字元',
      }
      const zhMsg = Object.entries(msgMap).find(([key]) => error.message.includes(key))?.[1] || error.message
      setError(zhMsg)
      setLoading(false)
    } else {
      // 註冊成功後、寫入推薦關係到 referrals 表
      if (refCode && refValid && signUpData?.user?.id) {
        try {
          // T10b v5.10.375 — internalPost 統一處理(timeout + RateLimitError 視為成功 fall-through)
          await internalPost('/api/referral/register', {
            referralCode: refCode,
            userId: signUpData.user.id,
            email: form.email,
          })
        } catch {
          // 推薦碼寫入失敗不影響註冊流程
          console.error('推薦關係建立失敗')
        }
      }
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-6">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">&#9993;</div>
          <h2 className="text-xl font-bold text-text mb-2">請查看 Email</h2>
          <p className="text-sm text-text-muted">我們已寄出驗證信到 <span className="text-gold">{form.email}</span>，請點擊信中連結完成註冊。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-text mb-2">建立帳號</h1>
        <p className="text-center text-text-muted text-sm mb-8">開始你的命理探索之旅</p>

        <form onSubmit={handleSignup} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="signup-name" className="block text-xs text-text-muted mb-1">姓名 <span className="text-red-400">*</span></label>
            <input id="signup-name" name="name" type="text" required placeholder="你的姓名"
              autoComplete="name"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none transition-colors" />
          </div>
          <div>
            <label htmlFor="signup-email" className="block text-xs text-text-muted mb-1">Email <span className="text-red-400">*</span></label>
            <input id="signup-email" name="email" type="email" required placeholder="your@email.com"
              autoComplete="email"
              inputMode="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none transition-colors" />
          </div>
          <div>
            <label htmlFor="signup-password" className="block text-xs text-text-muted mb-1">密碼 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input id="signup-password" name="new-password" type={showPassword ? 'text' : 'password'} required placeholder="至少 8 個字元" minLength={8}
                autoComplete="new-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 pr-10 text-cream focus:border-gold/40 focus:outline-none transition-colors" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-text-muted/50 hover:text-gold transition-colors" tabIndex={-1}>
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {/* 密碼強度指示器 */}
            {form.password && (() => {
              const hasLen = form.password.length >= 8
              const hasLetter = /[a-zA-Z]/.test(form.password)
              const hasNumber = /\d/.test(form.password)
              const hasSymbol = /[^a-zA-Z0-9]/.test(form.password)
              const score = [hasLen, hasLetter, hasNumber, hasSymbol].filter(Boolean).length
              const labels = ['太弱', '一般', '不錯', '強', '非常強']
              const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-500']
              const textColors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-emerald-400']
              return (
                <div className="mt-1.5">
                  <div className="flex gap-1 mb-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${i < score ? colors[Math.min(score-1, 4)] : 'bg-white/5'}`} />
                    ))}
                  </div>
                  <p className={`text-[10px] ${textColors[Math.min(score, 4)]}`}>
                    強度：{labels[Math.min(score, 4)]}
                    {!hasLen && '（需至少 8 字元）'}
                  </p>
                </div>
              )
            })()}
            {!form.password && <p className="text-[10px] text-text-muted/60 mt-1">密碼至少 8 個字元，建議包含英數字</p>}
          </div>
          <div>
            <label htmlFor="signup-confirm-password" className="block text-xs text-text-muted mb-1">確認密碼 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input id="signup-confirm-password" name="confirm-password" type={showConfirmPassword ? 'text' : 'password'} required placeholder="再輸入一次密碼" minLength={8}
                autoComplete="new-password"
                value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className={`w-full bg-white/5 border rounded-lg px-4 py-2.5 pr-10 text-cream focus:outline-none transition-colors ${form.confirmPassword && form.confirmPassword !== form.password ? 'border-red-400/50 focus:border-red-400' : 'border-gold/10 focus:border-gold/40'}`} />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-text-muted/50 hover:text-gold transition-colors" tabIndex={-1}>
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {form.confirmPassword && form.confirmPassword !== form.password && (
              <p className="text-[10px] text-red-400 mt-1">密碼不一致</p>
            )}
            {form.confirmPassword && form.confirmPassword === form.password && form.confirmPassword.length >= 8 && (
              <p className="text-[10px] text-green-400 mt-1">&#10003; 密碼一致</p>
            )}
          </div>

          {/* 推薦碼（選填） */}
          <div>
            <label htmlFor="signup-refcode" className="block text-xs text-text-muted mb-1">推薦碼（選填）</label>
            <input id="signup-refcode" name="referral-code" type="text" placeholder="JY-XXXXX" maxLength={8}
              autoComplete="off"
              value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none uppercase tracking-wider transition-colors" />
            {refValid && (
              <p className="text-[11px] text-green-400 mt-1">&#10003; 由 {refValid} 推薦，首次購買雙方都可獲得獎勵點數</p>
            )}
            {refCode.length >= 5 && !refValid && (
              <p className="text-[10px] text-text-muted/50 mt-1">驗證中...</p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Phase 5 v5.10.377 — Cloudflare Turnstile bot 防護(老闆灌 NEXT_PUBLIC_TURNSTILE_SITE_KEY 後自動 render、未設則隱身) */}
          <TurnstileWidget onVerify={setTurnstileToken} />

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50">
            {loading ? '註冊中...' : '免費註冊'}
          </button>
          <p className="text-[10px] text-text-muted/60 text-center">
            註冊即表示同意<Link href="/terms" className="text-gold">使用條款</Link>和<Link href="/privacy" className="text-gold">隱私政策</Link>
          </p>
        </form>

        <div className="mt-6 text-center space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gold/10" /></div>
            <div className="relative flex justify-center"><span className="px-3 text-xs text-text-muted/60" style={{ background: 'var(--color-dark)' }}>或</span></div>
          </div>
          <button onClick={handleGoogleLogin}
            className="w-full max-w-md py-2.5 glass rounded-xl text-sm text-text hover:bg-white/10 transition-colors">
            使用 Google 帳號直接註冊
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          已有帳號？ <Link href="/auth/login" className="inline-flex items-center min-h-[44px] align-middle text-gold hover:underline">登入</Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-text-muted">載入中...</div>}>
      <SignupForm />
    </Suspense>
  )
}
