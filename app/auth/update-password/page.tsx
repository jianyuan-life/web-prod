'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AuthShell from '@/components/auth/AuthShell'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('密碼至少需要 8 個字元')
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
    <AuthShell
      eyebrow="SECURE PASSWORD UPDATE"
      title={done ? '密碼已更新' : '設定新密碼'}
      description={done ? '你的私人報告與訂單維持不變。' : '請設定至少 8 個字元的新密碼。'}
      contextTitle="更新憑證，不改動你的報告"
      contextBody="新密碼只用於保護帳號；既有報告內容、訂單與生成進度不受影響。"
    >
      {done ? (
        <div className="jy-auth-status" role="status">
          <span className="jy-auth-status__icon" style={{ color: 'var(--jy-ui-success)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          </span>
          <h2>更新完成</h2>
          <p>現在可以使用新密碼登入鑑源帳號。</p>
          <Link href="/auth/login" className="jy-button jy-button--primary">前往登入</Link>
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="jy-auth-form">
          <div className="jy-field">
            <label htmlFor="new-password">新密碼</label>
            <input id="new-password" name="new-password" type="password" required placeholder="至少 8 個字元" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="jy-field">
            <label htmlFor="confirm-new-password">確認新密碼</label>
            <input id="confirm-new-password" name="confirm-new-password" type="password" required placeholder="再輸入一次" minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(confirm && password !== confirm)} />
            {confirm && password !== confirm && <p className="jy-field-help jy-field-help--danger">兩次輸入的密碼不一致。</p>}
          </div>

          {error && <p className="jy-alert jy-alert--danger" role="alert">{error}</p>}

          <button type="submit" disabled={loading} className="jy-button jy-button--primary">
            {loading ? '更新中...' : '確認更新密碼'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
