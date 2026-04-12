'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('密碼至少 6 個字元')
      return
    }
    if (password !== confirm) {
      setError('兩次密碼不一致')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2">設定新密碼</h1>
        <p className="text-center text-text-muted text-sm mb-8">
          請輸入你的新密碼
        </p>

        {done ? (
          <div className="glass rounded-2xl p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <p className="text-cream font-semibold">密碼已更新</p>
            <p className="text-sm text-text-muted">你的密碼已成功重設，現在可以用新密碼登入。</p>
            <a href="/auth/login"
              className="inline-block mt-4 px-6 py-2.5 bg-gold text-dark font-bold rounded-xl btn-glow">
              前往登入
            </a>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">新密碼</label>
              <input
                type="password" required placeholder="至少 8 個字元"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">確認新密碼</label>
              <input
                type="password" required placeholder="再輸入一次"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none"
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50">
              {loading ? '更新中...' : '確認更新密碼'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
