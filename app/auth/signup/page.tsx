'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
  const params = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [refCode, setRefCode] = useState(params.get('ref') || '')
  const [refValid, setRefValid] = useState<string | null>(null) // 推薦人名字
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // 推薦碼驗證
  useEffect(() => {
    if (!refCode || refCode.length < 5) { setRefValid(null); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(refCode)}`)
        const data = await res.json()
        setRefValid(data.valid ? data.referrerName : null)
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
      // 註冊成功後，寫入推薦關係到 referrals 表
      if (refCode && refValid && signUpData?.user?.id) {
        try {
          await fetch('/api/referral/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referralCode: refCode,
              userId: signUpData.user.id,
              email: form.email,
            }),
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
          <h2 className="text-xl font-bold text-white mb-2">請查看 Email</h2>
          <p className="text-sm text-text-muted">我們已寄出驗證信到 <span className="text-gold">{form.email}</span>，請點擊信中連結完成註冊。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2">建立帳號</h1>
        <p className="text-center text-text-muted text-sm mb-8">開始你的命理探索之旅</p>

        <form onSubmit={handleSignup} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">姓名</label>
            <input type="text" required placeholder="你的姓名"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input type="email" required placeholder="your@email.com"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">密碼</label>
            <input type="password" required placeholder="至少 8 個字元" minLength={8}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none" />
            <p className="text-[10px] text-text-muted/60 mt-1">密碼至少 8 個字元</p>
          </div>

          {/* 推薦碼（選填） */}
          <div>
            <label className="block text-xs text-text-muted mb-1">推薦碼（選填）</label>
            <input type="text" placeholder="JY-XXXXX" maxLength={8}
              value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none uppercase tracking-wider" />
            {refValid && (
              <p className="text-[11px] text-green-400 mt-1">&#10003; 由 {refValid} 推薦，首次購買雙方都可獲得獎勵點數</p>
            )}
            {refCode.length >= 5 && !refValid && (
              <p className="text-[10px] text-text-muted/50 mt-1">驗證中...</p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50">
            {loading ? '註冊中...' : '免費註冊'}
          </button>
          <p className="text-[10px] text-text-muted/60 text-center">
            註冊即表示同意<a href="/terms" className="text-gold">使用條款</a>和<a href="/privacy" className="text-gold">隱私政策</a>
          </p>
        </form>

        <div className="mt-6 text-center space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gold/10" /></div>
            <div className="relative flex justify-center"><span className="px-3 text-xs text-text-muted/60" style={{ background: 'var(--color-dark)' }}>或</span></div>
          </div>
          <button onClick={handleGoogleLogin}
            className="w-full max-w-md py-2.5 glass rounded-xl text-sm text-white hover:bg-white/10 transition-colors">
            使用 Google 帳號直接註冊
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          已有帳號？ <a href="/auth/login" className="text-gold hover:underline">登入</a>
        </p>
      </div>
    </div>
  )
}
