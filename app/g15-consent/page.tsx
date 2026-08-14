'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { internalPost } from '@/lib/api'

type ConsentStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

type ConsentResponse = {
  status?: ConsentStatus
  expiresAt?: string
  error?: string
  outcome?: string
  consumedAt?: string | null
}

async function postConsentAction(input: {
  action: 'inspect' | 'accept' | 'revoke'
  token: string
}): Promise<ConsentResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const authToken = session?.access_token || ''
  if (!authToken) throw new Error('請先登入與這份報告綁定的帳號，再回到本頁重試')
  return await internalPost(
    '/api/g15-consents/action',
    input,
    { authToken },
  ) as ConsentResponse
}

export default function G15ConsentPage() {
  const [acceptToken, setAcceptToken] = useState('')
  const [revokeToken, setRevokeToken] = useState('')
  const [status, setStatus] = useState<ConsentStatus | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [consumedAt, setConsumedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ''))
    const accept = fragment.get('accept') || ''
    const revoke = fragment.get('revoke') || ''
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setAcceptToken(accept)
    setRevokeToken(revoke)
    const inspectToken = revoke || accept
    if (!inspectToken) {
      setError('此連結缺少必要的確認資料；請使用邀請信中的完整連結。')
      setLoading(false)
      return () => { active = false }
    }
    void postConsentAction({ action: 'inspect', token: inspectToken })
      .then((data) => {
        if (!active) return
        setStatus(data.status || '')
        setExpiresAt(data.expiresAt || '')
        setConsumedAt(data.consumedAt || '')
      })
      .catch((inspectError) => {
        if (active) setError(inspectError instanceof Error ? inspectError.message : '此連結無法使用')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const acceptConsent = async () => {
    if (!acceptToken) return
    setLoading(true)
    setError('')
    try {
      const data = await postConsentAction({ action: 'accept', token: acceptToken })
      setStatus(data.status || 'accepted')
      setExpiresAt(data.expiresAt || expiresAt)
      setConsumedAt(data.consumedAt || '')
      setAcceptToken('')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '目前無法完成同意')
    } finally {
      setLoading(false)
    }
  }

  const revokeConsent = async () => {
    if (!revokeToken) return
    setLoading(true)
    setError('')
    try {
      const data = await postConsentAction({ action: 'revoke', token: revokeToken })
      if (data.outcome === 'consumed') {
        setStatus('accepted')
        setConsumedAt(data.consumedAt || '')
        setError('付款訂單已原子綁定這次同意，現在無法再阻止該訂單生成；如需後續刪除或限制請聯絡客服。')
        return
      }
      if (data.outcome === 'revoked' && data.status === 'revoked') {
        setStatus('revoked')
        setAcceptToken('')
        setRevokeToken('')
        return
      }
      setStatus(data.status || 'accepted')
      setConsumedAt(data.consumedAt || '')
      setError('撤回結果尚未確認；原同意狀態維持不變，請稍後重試。')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '目前無法撤回同意')
    } finally {
      setLoading(false)
    }
  }

  const statusText = status === 'accepted'
    ? '您已同意本次資料使用。'
    : status === 'revoked'
      ? '您已撤回同意；購買者目前不能使用這份資料完成付款。'
      : status === 'expired'
        ? '這份邀請已過期，未授予資料使用權限。'
        : status === 'pending'
          ? '尚未作出決定。請閱讀範圍後自行選擇。'
          : ''

  return (
    <main className="min-h-screen bg-[#0b0d12] px-4 py-12 text-[#f5f0e6]">
      <article className="mx-auto max-w-2xl rounded-2xl border border-[#d5ae62]/25 bg-white/[0.035] p-6 shadow-2xl sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d5ae62]">家族藍圖 · 個人決定</p>
        <h1 className="mt-3 text-2xl font-semibold">確認本次資料使用</h1>
        <p className="mt-4 text-sm leading-7 text-white/70">
          購買者希望把您已完成的「人生藍圖」加入一次家族藍圖分析。是否同意由您決定；不回覆或拒絕，不會授予使用權限。
        </p>

        <section className="mt-6 space-y-4 rounded-xl border border-white/10 bg-black/15 p-4" aria-labelledby="consent-scope-heading">
          <h2 id="consent-scope-heading" className="font-semibold text-[#d5ae62]">同意範圍</h2>
          <dl className="space-y-3 text-sm leading-6 text-white/75">
            <div><dt className="font-medium text-white">用途</dt><dd>只用於準備及生成這一次家族藍圖。</dd></div>
            <div><dt className="font-medium text-white">使用資料</dt><dd>您的人生藍圖與其排盤所需出生資料。</dd></div>
            <div><dt className="font-medium text-white">分享範圍</dt><dd>只向購買者及本次選定的成年成員提供家庭互動摘要，不作公開展示。</dd></div>
            <div><dt className="font-medium text-white">撤回</dt><dd>付款頁尚未建立時可直接撤回；付款頁已建立時，系統會先確認並終止仍未付款的付款頁，完成後才顯示為已撤回。付款一旦完成或開始處理，就不能用本頁阻止該訂單生成。</dd></div>
          </dl>
        </section>

        <p className="mt-4 text-xs leading-6 text-white/55">
          請登入與這份報告 user_id 相同的 Supabase 帳號；邀請連結本身不能取代帳號擁有者驗證，也不等於 KYC。請勿把連結轉寄他人。
        </p>
        {consumedAt && <p className="mt-2 text-xs text-amber-200">本次同意已於 {new Date(consumedAt).toLocaleString('zh-TW')} 綁定付款訂單，無法透過本頁阻止該訂單生成。</p>}
        {error.includes('登入') && (
          <p className="mt-3 text-sm"><Link href="/auth/login" target="_blank" rel="noopener noreferrer" className="text-[#d5ae62] underline underline-offset-2">在新分頁登入報告擁有者帳號</Link>，然後回到本頁重新整理。</p>
        )}
        {expiresAt && <p className="mt-2 text-xs text-white/50">邀請有效至 {new Date(expiresAt).toLocaleString('zh-TW')}</p>}

        <div className="mt-6 rounded-xl border border-[#d5ae62]/20 bg-[#d5ae62]/[0.07] p-4" aria-live="polite">
          {loading ? <p role="status">正在安全讀取狀態…</p> : <p>{statusText || error}</p>}
        </div>
        {error && statusText && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {status === 'pending' && acceptToken && (
            <button type="button" onClick={acceptConsent} disabled={loading} className="rounded-xl bg-[#d5ae62] px-5 py-3 font-semibold text-[#111318] disabled:opacity-50">
              我同意本次資料使用
            </button>
          )}
          {(status === 'pending' || status === 'accepted') && revokeToken && (
            <button type="button" onClick={revokeConsent} disabled={loading} className="rounded-xl border border-red-300/35 px-5 py-3 font-semibold text-red-200 disabled:opacity-50">
              撤回同意
            </button>
          )}
        </div>

        <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-6 text-white/55">
          詳細資料處理方式請見 <Link href="/privacy" className="text-[#d5ae62] underline underline-offset-2">隱私政策</Link>。如您不認識邀請者，請直接關閉本頁並刪除邀請信。
        </p>
      </article>
    </main>
  )
}
