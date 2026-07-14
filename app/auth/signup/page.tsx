'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { internalGet, internalPost } from '@/lib/api'
import TurnstileWidget from '@/components/security/TurnstileWidget'
import AuthShell from '@/components/auth/AuthShell'

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
  )
}

function SignupForm() {
  const params = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [refCode, setRefCode] = useState(params.get('ref') || '')
  const [refValid, setRefValid] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    if (!refCode || refCode.length < 5) { setRefValid(null); return }
    const timer = setTimeout(async () => {
      try {
        const data = await internalGet(`/api/referral/validate?code=${encodeURIComponent(refCode)}`) as { valid?: boolean; referrerName?: string }
        setRefValid(data.valid ? (data.referrerName ?? null) : null)
      } catch { setRefValid(null) }
    }, 500)
    return () => clearTimeout(timer)
  }, [refCode])

  const handleGoogleLogin = async () => {
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
      const msgMap: Record<string, string> = {
        'User already registered': '此 Email 已註冊',
        'Password should be at least 8 characters': '密碼至少需要 8 個字元',
      }
      const zhMsg = Object.entries(msgMap).find(([key]) => error.message.includes(key))?.[1] || error.message
      setError(zhMsg)
      setLoading(false)
    } else {
      if (refCode && refValid && signUpData?.user?.id) {
        try {
          await internalPost('/api/referral/register', {
            referralCode: refCode,
            userId: signUpData.user.id,
            email: form.email,
          })
        } catch {
          console.error('推薦關係建立失敗')
        }
      }
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell
        eyebrow="EMAIL VERIFICATION"
        title="請查看 Email"
        description="完成信箱驗證後，你的私人報告檔案庫才會正式啟用。"
      >
        <div className="jy-auth-status" role="status">
          <span className="jy-auth-status__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </span>
          <h2>驗證信已寄出</h2>
          <p>我們已寄到 <strong>{form.email}</strong>。請點擊信中連結完成註冊；若未看見，也請檢查垃圾郵件夾。</p>
          <Link href="/auth/login" className="jy-button jy-button--secondary">返回登入</Link>
        </div>
      </AuthShell>
    )
  }

  const hasLen = form.password.length >= 8
  const hasLetter = /[a-zA-Z]/.test(form.password)
  const hasNumber = /\d/.test(form.password)
  const hasSymbol = /[^a-zA-Z0-9]/.test(form.password)
  const passwordScore = [hasLen, hasLetter, hasNumber, hasSymbol].filter(Boolean).length
  const strengthLabels = ['尚未符合', '基本', '一般', '良好', '強']

  return (
    <AuthShell
      eyebrow="CREATE PRIVATE ARCHIVE"
      title="建立帳號"
      description="保存已購買的報告、追蹤生成進度，並管理你的資料。"
    >
      <form onSubmit={handleSignup} className="jy-auth-form">
        <div className="jy-field">
          <label htmlFor="signup-name">姓名 <span className="jy-field__required" aria-hidden="true">*</span></label>
          <input id="signup-name" name="name" type="text" required placeholder="你的姓名" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="jy-field">
          <label htmlFor="signup-email">Email <span className="jy-field__required" aria-hidden="true">*</span></label>
          <input id="signup-email" name="email" type="email" required placeholder="your@email.com" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <div className="jy-field">
          <label htmlFor="signup-password">密碼 <span className="jy-field__required" aria-hidden="true">*</span></label>
          <div className="jy-password-field">
            <input id="signup-password" name="new-password" type={showPassword ? 'text' : 'password'} required placeholder="至少 8 個字元" minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-describedby="signup-password-help" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="jy-password-toggle" aria-label={showPassword ? '隱藏密碼' : '顯示密碼'} aria-pressed={showPassword}>
              <EyeIcon hidden={!showPassword} />
            </button>
          </div>
          <p id="signup-password-help" className="jy-field-help">
            至少 8 個字元，建議混合英文字母、數字與符號。{form.password && `目前強度：${strengthLabels[passwordScore]}`}
          </p>
        </div>

        <div className="jy-field">
          <label htmlFor="signup-confirm-password">確認密碼 <span className="jy-field__required" aria-hidden="true">*</span></label>
          <div className="jy-password-field">
            <input id="signup-confirm-password" name="confirm-password" type={showConfirmPassword ? 'text' : 'password'} required placeholder="再輸入一次密碼" minLength={8} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} aria-invalid={Boolean(form.confirmPassword && form.confirmPassword !== form.password)} aria-describedby="signup-confirm-help" />
            <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} className="jy-password-toggle" aria-label={showConfirmPassword ? '隱藏確認密碼' : '顯示確認密碼'} aria-pressed={showConfirmPassword}>
              <EyeIcon hidden={!showConfirmPassword} />
            </button>
          </div>
          {form.confirmPassword && form.confirmPassword !== form.password && <p id="signup-confirm-help" className="jy-field-help jy-field-help--danger">兩次輸入的密碼不一致。</p>}
          {form.confirmPassword && form.confirmPassword === form.password && form.confirmPassword.length >= 8 && <p id="signup-confirm-help" className="jy-field-help jy-field-help--success">兩次密碼一致。</p>}
        </div>

        <div className="jy-field">
          <label htmlFor="signup-refcode">推薦碼（選填）</label>
          <input id="signup-refcode" name="referral-code" type="text" placeholder="JY-XXXXX" maxLength={8} autoComplete="off" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }} />
          {refValid && <p className="jy-field-help jy-field-help--success">由 {refValid} 推薦，首次購買雙方都可獲得獎勵點數。</p>}
          {refCode.length >= 5 && !refValid && <p className="jy-field-help">正在驗證推薦碼...</p>}
        </div>

        {error && <p className="jy-alert jy-alert--danger" role="alert">{error}</p>}

        <TurnstileWidget onVerify={setTurnstileToken} />

        <button type="submit" disabled={loading} className="jy-button jy-button--primary">
          {loading ? '建立帳號中...' : '免費建立帳號'}
        </button>
        <p className="jy-auth-terms">
          建立帳號即表示同意 <Link href="/terms">使用條款</Link> 與 <Link href="/privacy">隱私政策</Link>。
        </p>
      </form>

      <div className="jy-auth-divider"><span>或</span></div>
      <button type="button" onClick={handleGoogleLogin} className="jy-button jy-button--secondary" style={{ width: '100%' }}>
        使用 Google 帳號建立
      </button>

      <p className="jy-auth-switch">
        已有帳號？ <Link href="/auth/login">登入</Link>
      </p>
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="jy-page py-20 text-center">載入中...</div>}>
      <SignupForm />
    </Suspense>
  )
}
