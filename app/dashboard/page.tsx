'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import * as gtag from '@/lib/gtag'
import * as fbpixel from '@/lib/fbpixel'
import ReportProgress from '@/components/ReportProgress'
import FamilyMembersManager from '@/components/FamilyMembersManager'
import ReferralCard from '@/components/ReferralCard'

const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖', D: '心之所惑',
  G15: '家族藍圖', R: '合否？',
  E1: '事件出門訣', E2: '月度出門訣',
  E3: '週度補運', E4: '年度方案',
}

// E 系列（出門訣）識別：用於判斷 PDF/Email/狀態文案
const CHUMENJI_CODES = new Set(['E1', 'E2', 'E3', 'E4'])

type Report = {
  id: string
  client_name: string
  plan_code: string
  amount_usd: number
  status: string
  pdf_url: string | null
  access_token: string | null
  report_result: {
    systems_count?: number
    analyses_summary?: { system: string; score: number }[]
  } | null
  created_at: string
  error_message?: string | null
  retry_count?: number
  generation_progress?: {
    step?: string
    progress?: number
    message?: string
    progress_updated_at?: string
    [key: string]: unknown
  } | null
  // Sprint 5 國際化
  timezone?: string | null
  birth_city?: string | null
  self_update_count?: number | null
}

// 各方案使用的命理系統數量（0 表示不顯示系統數）
const PLAN_SYSTEMS: Record<string, number> = {
  C: 15, D: 0, G15: 15, R: 0, E1: 1, E2: 1,
}

function DashboardContent() {
  const params = useSearchParams()
  const paymentSuccess = params.get('payment') === 'success'
  const stripeSessionId = params.get('session_id') || '' // Stripe checkout session ID（auth fallback 用）

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [pollStartTime] = useState(() => Date.now())
  const [userEmail, setUserEmail] = useState<string>('')
  const [authToken, setAuthToken] = useState<string>('')
  const [authFailed, setAuthFailed] = useState(false)
  // v5.3.1：API 失敗時顯示錯誤訊息，避免客戶以為「沒有報告」
  const [fetchError, setFetchError] = useState<string | null>(null)
  // 追蹤剛完成的報告 ID（用於顯示完成提示動畫）
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set())
  // 付款成功事件只觸發一次
  const purchaseTracked = useRef(false)
  // 已送過推播的報告 ID（避免重複通知）
  const [notifiedIds] = useState<Set<string>>(() => new Set())

  // 推播通知：報告完成時通知用戶
  const sendNotification = (report: Report) => {
    if (notifiedIds.has(report.id)) return
    notifiedIds.add(report.id)
    // Safari 某些版本、iOS Web 沒有 Notification API
    if (typeof Notification === 'undefined') return
    const planName = PLAN_NAMES[report.plan_code] || report.plan_code
    try {
      if (Notification.permission === 'granted') {
        new Notification('鑒源命理', {
          body: `您的${planName}報告已完成！`,
          icon: '/favicon.ico',
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission()
      }
    } catch {
      // iOS Safari 在非 HTTPS 或不支援時會丟例外
    }
  }

  // 建立帶 auth 的 fetch headers
  const getAuthHeaders = (): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }
    return headers
  }

  // 帶 auth 的報告查詢
  const fetchReports = async (): Promise<Report[]> => {
    // 每次 fetch 前嘗試取得最新 token（Supabase 可能已自動 refresh）
    let token = authToken
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.access_token) {
        token = sessionData.session.access_token
        setAuthToken(token)
      }
    } catch { /* 靜默 */ }

    // P1-1：若既無 token 也無 stripeSessionId，直接不打 API，避免 console 噴 401
    if (!token && !stripeSessionId) {
      setAuthFailed(true)
      return []
    }

    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // 建構查詢 URL：auth token 為主，Stripe session_id 為安全 fallback
    let url = '/api/reports'
    if (stripeSessionId) {
      url += `?session_id=${encodeURIComponent(stripeSessionId)}`
    }

    // v5.6.10 (Round C):加 30s timeout 防 dashboard 永久「載入中...」(對應 Codex P1 + Claude Playwright 親見)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    let res: Response
    try {
      res = await fetch(url, {
        headers,
        credentials: 'include',
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timeoutId)
      if (e instanceof Error && e.name === 'AbortError') {
        console.error('fetchReports timeout(30s)')
        throw new Error('TIMEOUT')
      }
      throw e
    }
    clearTimeout(timeoutId)

    if (res.status === 401) {
      // Auth 失敗：嘗試重新取得 session
      const { data: retrySession } = await supabase.auth.getSession()
      if (retrySession.session?.access_token) {
        setAuthToken(retrySession.session.access_token)
        const retryController = new AbortController()
        const retryTimeoutId = setTimeout(() => retryController.abort(), 30000)
        try {
          const retryRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${retrySession.session.access_token}` },
            credentials: 'include',
            signal: retryController.signal,
          })
          clearTimeout(retryTimeoutId)
          if (retryRes.ok) {
            const data = await retryRes.json()
            setAuthFailed(false)
            return data.reports || []
          }
        } catch (e) {
          clearTimeout(retryTimeoutId)
          if (e instanceof Error && e.name === 'AbortError') throw new Error('TIMEOUT')
          throw e
        }
      }
      setAuthFailed(true)
      return []
    }

    if (res.ok) {
      const data = await res.json()
      setAuthFailed(false)
      return data.reports || []
    }

    // 非 200/401 的其他錯誤（5xx、403 等）：
    // 關鍵修復：丟例外讓呼叫端知道「API 失敗」而非「沒有報告」
    // 避免客戶看到「還沒有報告」誤導訊息（v5.3.1 自檢修復）
    const errText = await res.text().catch(() => '')
    console.error(`fetchReports 非預期狀態 ${res.status}`, errText)
    throw new Error(`API_ERROR_${res.status}`)
  }

  // 取得用戶 email + auth token（多種方式確保取到）
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 5 // Stripe 重導回來後最多等 15 秒讓 auth 初始化

    async function getEmail() {
      // 方法1: getSession（比 getUser 更可靠，不需要伺服器驗證）
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user?.email) {
        const email = sessionData.session.user.email
        setUserEmail(email)
        setAuthToken(sessionData.session.access_token || '')
        try {
          sessionStorage.setItem('jianyuan_email', email)
          localStorage.setItem('jianyuan_email', email) // 持久化，Stripe 重導後不丟失
        } catch {}
        return
      }
      // 方法2: getUser（需要伺服器端驗證 token）
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user?.email) {
        const email = userData.user.email
        setUserEmail(email)
        try {
          sessionStorage.setItem('jianyuan_email', email)
          localStorage.setItem('jianyuan_email', email)
        } catch {}
        return
      }
      // 方法3: 從 sessionStorage / localStorage 恢復
      try {
        const cached = sessionStorage.getItem('jianyuan_email') || localStorage.getItem('jianyuan_email')
        if (cached) {
          setUserEmail(cached)
          return
        }
      } catch {}
      // 付款成功重導回來但 auth 還沒初始化 → 等待重試
      if (paymentSuccess && retryCount < maxRetries) {
        retryCount++
        setTimeout(getEmail, 3000)
        return
      }
      // 所有方法均失敗，且不是付款成功重導向、也沒有 session_id → 跳轉登入頁
      if (!paymentSuccess && !stripeSessionId) {
        window.location.href = '/auth/login?redirect=/dashboard'
      }
    }
    getEmail()
    // 監聽 auth 變化（Stripe 重導回來後 auth 可能延遲恢復）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email)
        setAuthToken(session.access_token || '')
        setAuthFailed(false)
        try {
          sessionStorage.setItem('jianyuan_email', session.user.email)
          localStorage.setItem('jianyuan_email', session.user.email)
        } catch {}
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentSuccess])

  const [finalConfirmId, setFinalConfirmId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeletedIds(prev => new Set(prev).add(id))
    setReports(prev => prev.filter(r => r.id !== id))
    try {
      await fetch('/api/reports', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ id, email: userEmail }),
      })
    } catch {
      setDeletedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    } finally {
      setDeletingId(null)
      setConfirmId(null)
      setFinalConfirmId(null)
    }
  }

  // 重試失敗的報告
  const handleRetry = async (id: string) => {
    setRetryingId(id)
    try {
      const res = await fetch('/api/reports', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ id, email: userEmail }),
      })
      if (res.ok) {
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'pending', error_message: null } : r))
      } else {
        const data = await res.json()
        alert(data.error || '重試失敗')
      }
    } catch {
      alert('重試請求失敗，請稍後再試')
    } finally {
      setRetryingId(null)
    }
  }

  // 判斷 pending 是否超過 30 分鐘
  const isPendingTooLong = (r: Report) => {
    if (r.status !== 'pending' && r.status !== 'generating') return false
    const elapsed = Date.now() - new Date(r.created_at).getTime()
    return elapsed > 30 * 60 * 1000
  }

  useEffect(() => {
    // 有 userEmail 或有 stripeSessionId 都可以查報告
    if (!userEmail && !stripeSessionId) return
    fetchReports()
      .then(rpts => {
        setReports(rpts)
        setFetchError(null)
        setLoading(false)
        // 有 pending/generating 報告時，請求通知權限
        const hasPendingReports = rpts.some((r: Report) => r.status === 'pending' || r.status === 'generating')
        if (hasPendingReports && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission()
        }
      })
      .catch((err) => {
        // v5.3.1：API 失敗時標記錯誤，避免顯示「還沒有報告」誤導
        // v5.6.10 (Round C):timeout 顯示更明確訊息
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[dashboard] 查詢報告失敗:', msg)
        const userMsg = msg === 'TIMEOUT'
          ? '伺服器回應逾時(30 秒)、請按右上「我的報告」重新整理。若問題持續請聯絡 support@jianyuan.life'
          : '系統暫時無法查詢您的報告，請稍後重新整理。若問題持續請聯絡 support@jianyuan.life'
        setFetchError(userMsg)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, stripeSessionId])

  // 付款成功時觸發 GA4 purchase + Meta Purchase 事件（只觸發一次）
  useEffect(() => {
    if (!paymentSuccess || loading || purchaseTracked.current) return
    if (reports.length === 0) return
    purchaseTracked.current = true
    // 取最新一筆報告的金額與方案
    const latestReport = reports[0]
    const value = latestReport?.amount_usd || 0
    const planCode = latestReport?.plan_code || ''
    const planName = PLAN_NAMES[planCode] || planCode
    // GA4 purchase 事件
    gtag.event('purchase', {
      currency: 'USD',
      value,
      plan_code: planCode,
      plan_name: planName,
    })
    // Meta Pixel Purchase 事件
    fbpixel.trackEvent('Purchase', {
      currency: 'USD',
      value,
      content_name: planName,
    })
  }, [paymentSuccess, loading, reports])

  // 付款成功後輪詢等待報告生成（5秒間隔，60分鐘上限）
  useEffect(() => {
    if (!paymentSuccess || (!userEmail && !stripeSessionId)) return
    const interval = setInterval(() => {
      if (Date.now() - pollStartTime > 60 * 60 * 1000) {
        clearInterval(interval)
        return
      }
      fetchReports()
        .then(allReports => {
          const newReports = allReports.filter(
            (r: Report) => !deletedIds.has(r.id)
          )
          const previousPendingIds = new Set(reports.filter(r => r.status === 'pending' || r.status === 'generating').map(r => r.id))
          const newlyCompleted = newReports.filter(
            (r: Report) => r.status === 'completed' && previousPendingIds.has(r.id)
          )
          if (newlyCompleted.length > 0) {
            setJustCompletedIds(prev => {
              const next = new Set(prev)
              newlyCompleted.forEach((r: Report) => next.add(r.id))
              return next
            })
            // 推播通知
            newlyCompleted.forEach((r: Report) => sendNotification(r))
            setTimeout(() => {
              setJustCompletedIds(prev => {
                const next = new Set(prev)
                newlyCompleted.forEach((r: Report) => next.delete(r.id))
                return next
              })
            }, 5000)
          }
          setReports(newReports)
          if (!newReports.some((r: Report) => r.status === 'pending' || r.status === 'generating')) {
            clearInterval(interval)
          }
        })
        .catch(() => {/* 靜默 */})
    }, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentSuccess, deletedIds, pollStartTime, userEmail, stripeSessionId])

  // 無論是否剛付款，只要有 pending/generating 報告就持續輪詢（15秒間隔，60分鐘上限）
  useEffect(() => {
    if (loading || (!userEmail && !stripeSessionId)) return
    const hasPending = reports.some(r => r.status === 'pending' || r.status === 'generating')
    if (!hasPending) return

    const interval = setInterval(() => {
      if (Date.now() - pollStartTime > 60 * 60 * 1000) {
        clearInterval(interval)
        return
      }
      fetchReports()
        .then(allReports => {
          const newReports = allReports.filter(
            (r: Report) => !deletedIds.has(r.id)
          )
          const previousPendingIds = new Set(reports.filter(r => r.status === 'pending' || r.status === 'generating').map(r => r.id))
          const newlyCompleted = newReports.filter(
            (r: Report) => r.status === 'completed' && previousPendingIds.has(r.id)
          )
          if (newlyCompleted.length > 0) {
            setJustCompletedIds(prev => {
              const next = new Set(prev)
              newlyCompleted.forEach((r: Report) => next.add(r.id))
              return next
            })
            // 推播通知
            newlyCompleted.forEach((r: Report) => sendNotification(r))
            setTimeout(() => {
              setJustCompletedIds(prev => {
                const next = new Set(prev)
                newlyCompleted.forEach((r: Report) => next.delete(r.id))
                return next
              })
            }, 5000)
          }
          setReports(newReports)
          if (!newReports.some((r: Report) => r.status === 'pending' || r.status === 'generating')) {
            clearInterval(interval)
          }
        })
        .catch(() => {/* 靜默 */})
    }, 15000)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, deletedIds, loading, pollStartTime, userEmail, stripeSessionId])

  // 評分系統已移除（命不該有分數）

  return (
    <div className="py-20">
      <div className="max-w-5xl mx-auto px-6">
        {/* 付款成功提示 */}
        {paymentSuccess && (
          <div className="glass rounded-xl p-5 mb-6 border-l-2 border-green-500/50">
            <div className="flex items-center gap-3">
              <span className="text-green-400 text-xl">&#10003;</span>
              <div>
                <p className="text-cream font-semibold">付款成功，命理分析啟動中</p>
                <p className="text-sm text-text-muted">
                  系統已開始為您進行命理排盤與深度解析。
                  <strong className="text-gold/80"> 每位成員的完整報告平均需要 30 分鐘以上，出門訣計算需 40 分鐘以上</strong>，
                  請耐心等候——我們寧可多花時間，也要確保每份報告的準確性與深度。
                  完成後此頁面將自動更新，無需手動刷新。
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>我的報告</h1>
            <p className="text-sm text-text-muted">查看和下載已生成的命理報告</p>
          </div>
          <Link href="/pricing" className="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm btn-glow">
            + 新的探索
          </Link>
        </div>

        {/* 出門訣推廣 banner — 只對已有其他方案報告但沒有出門訣報告的用戶顯示 */}
        {!loading && reports.length > 0 &&
          reports.some(r => r.status === 'completed' && !CHUMENJI_CODES.has(r.plan_code)) &&
          !reports.some(r => CHUMENJI_CODES.has(r.plan_code)) && (
          <div className="glass rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-center gap-4" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.06), rgba(15,22,40,0.3))', border: '1px solid rgba(201,168,76,0.15)' }}>
            <div className="text-3xl shrink-0">&#9788;</div>
            <div className="flex-1">
              <p className="text-sm text-cream font-semibold">想讓命理能量真正落地？</p>
              <p className="text-xs text-text-muted mt-1">您已完成命格分析，下一步可以試試「出門訣」——根據奇門遁甲找出最適合您的出行吉時與方位，採取行動把握最佳時機。</p>
            </div>
            <Link href="/pricing" className="shrink-0 px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-xs btn-glow">
              了解出門訣
            </Link>
          </div>
        )}

        {loading ? (
          <div className="glass rounded-2xl p-16 text-center">
            <div className="w-8 h-8 border-2 border-gold/50 border-t-gold rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-muted">載入中...</p>
          </div>
        ) : authFailed && !stripeSessionId ? (
          <div className="glass rounded-2xl p-10 text-center">
            <div className="text-4xl mb-4">&#128274;</div>
            <h3 className="text-lg font-semibold text-cream mb-2">登入狀態已過期</h3>
            <p className="text-sm text-text-muted mb-2">
              {paymentSuccess
                ? '付款已成功！但從 Stripe 返回時登入狀態中斷。'
                : '您的登入憑證已過期，或需要重新登入才能看到報告。'}
            </p>
            <p className="text-sm text-text-muted mb-6">
              請重新登入即可查看您的報告，報告資料完全保留。
            </p>
            <Link href="/auth/login?redirect=/dashboard"
              className="px-6 py-2.5 bg-gold text-dark font-semibold rounded-lg btn-glow inline-block">
              重新登入查看報告
            </Link>
          </div>
        ) : reports.length > 0 ? (
          <div className="space-y-4">
            {reports.map((r) => (
              <div key={r.id} className={`glass rounded-xl p-5 transition-all hover:border-gold/30 ${justCompletedIds.has(r.id) ? 'ring-2 ring-green-500/50 animate-pulse' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center text-gold font-bold text-lg shrink-0" style={{ fontFamily: 'var(--font-sans)' }}>
                      {(r.client_name && r.client_name.length > 0) ? r.client_name[0] : '?'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-cream truncate">{r.client_name}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                        <span>{PLAN_NAMES[r.plan_code] || `方案 ${r.plan_code}`}</span>
                        <span>
                          {CHUMENJI_CODES.has(r.plan_code)
                            ? (r.plan_code === 'E1' ? '事件擇吉 Top3'
                              : r.plan_code === 'E2' ? '月度單盤'
                              : r.plan_code === 'E3' ? '週度補運 8 吉時'
                              : r.plan_code === 'E4' ? '年度全局佈局'
                              : '古法奇門出門訣')
                            : (() => {
                                const count = r.report_result?.systems_count ?? PLAN_SYSTEMS[r.plan_code] ?? 0
                                return count > 0 ? `${count} 套系統` : r.plan_code === 'D' ? '深度主題分析' : '關係合盤分析'
                              })()}
                        </span>
                        <span>${r.amount_usd}</span>
                        <span>{new Date(r.created_at).toLocaleDateString('zh-TW')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === 'completed' ? (
                      <>
                        <div className="flex gap-2">
                          {r.access_token && (
                            <a href={`/report/${r.access_token}`}
                              className="px-3 py-1.5 bg-gold/15 border border-gold/30 rounded-lg text-xs text-gold hover:bg-gold/25 transition-colors font-medium">
                              查看報告
                            </a>
                          )}
                          {r.access_token && (
                            <button
                              onClick={(e) => {
                                const btn = e.currentTarget
                                const url = `${window.location.origin}/report/${r.access_token}`
                                navigator.clipboard.writeText(url).then(() => {
                                  const original = btn.textContent
                                  btn.textContent = '已複製 ✓'
                                  btn.classList.add('text-green-400', 'bg-green-500/10')
                                  setTimeout(() => {
                                    btn.textContent = original
                                    btn.classList.remove('text-green-400', 'bg-green-500/10')
                                  }, 1500)
                                }).catch(() => {
                                  window.prompt('複製此連結分享：', url)
                                })
                              }}
                              className="px-3 py-1.5 glass rounded-lg text-xs text-text-muted hover:text-gold hover:bg-gold/10 transition-colors"
                              title="複製報告連結"
                            >
                              分享
                            </button>
                          )}
                          {r.pdf_url && !CHUMENJI_CODES.has(r.plan_code) && (
                            <a href={r.pdf_url} target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 glass rounded-lg text-xs text-gold hover:bg-gold/10 transition-colors">
                              下載 PDF
                            </a>
                          )}
                        </div>
                      </>
                    ) : (r.status === 'pending' || r.status === 'generating') ? (
                      <div className="flex items-center gap-2">
                        {isPendingTooLong(r) ? (
                          <div className="text-right">
                            <span className="text-xs text-amber-400 block">處理時間較長</span>
                            <span className="text-[10px] text-text-muted/50">
                              報告仍在生成中，請耐心等候
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="w-4 h-4 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
                            <div className="text-right">
                              <span className="text-xs text-gold/70 block">{r.status === 'generating' ? '深度分析中' : '分析中'}</span>
                              <span className="text-[10px] text-text-muted/50">
                                {r.plan_code === 'E1' ? '約 5-10 分鐘'
                                  : r.plan_code === 'E2' ? '約 10-20 分鐘'
                                  : r.plan_code === 'E3' ? '約 20-40 分鐘'
                                  : r.plan_code === 'E4' ? '約 30-60 分鐘'
                                  : '約 30 分鐘以上'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : r.status === 'failed' ? (
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="text-xs text-red-400 block">生成失敗</span>
                          <span className="text-[10px] text-text-muted/50 max-w-[200px] truncate block">
                            {r.error_message || '未知錯誤'}
                          </span>
                        </div>
                        {(r.retry_count ?? 0) < 3 && (
                          <button
                            onClick={() => handleRetry(r.id)}
                            disabled={retryingId === r.id}
                            className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg text-xs text-amber-400 hover:bg-amber-500/25 transition-colors font-medium disabled:opacity-50"
                          >
                            {retryingId === r.id ? '重試中...' : '重試'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-red-400">狀態異常</span>
                    )}
                    {/* 刪除按鈕 */}
                    <button
                      onClick={() => setConfirmId(confirmId === r.id ? null : r.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="刪除報告"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* 剛完成的報告提示 */}
                {justCompletedIds.has(r.id) && (
                  <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
                    <span className="text-green-400">&#10003;</span>
                    <span className="text-sm text-green-300">報告已完成！點擊「查看報告」閱讀完整分析結果。</span>
                  </div>
                )}
                {/* pending 時顯示進度條 */}
                {(r.status === 'pending' || r.status === 'generating') && (
                  <ReportProgress createdAt={r.created_at} planCode={r.plan_code} generationProgress={r.generation_progress} />
                )}
                {/* v5.3.15：移除「更新出生地」— 我們沒有重算功能，不該讓客戶以為可以 */}
                {/* 刪除確認 — 強調不可復原 + 隱私保護 */}
                {confirmId === r.id && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-red-400 text-lg mt-0.5">&#9888;</span>
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-red-300">確定要永久刪除這份報告嗎？</p>
                        <p className="text-xs text-red-300/70 leading-relaxed">
                          刪除後將<strong className="text-red-300">無法復原</strong>——報告內容、PDF 檔案都會被永久移除。
                          <br/>我們重視您的隱私，刪除即代表所有相關數據將從伺服器上完全清除。
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setConfirmId(null); setFinalConfirmId(null) }}
                        className="px-4 py-1.5 text-xs text-text-muted border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        取消
                      </button>
                      {finalConfirmId === r.id ? (
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="px-4 py-1.5 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 animate-pulse"
                        >
                          {deletingId === r.id ? '刪除中...' : '最終確認：永久刪除'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setFinalConfirmId(r.id)}
                          className="px-4 py-1.5 text-xs text-white bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
                        >
                          確認永久刪除
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : fetchError ? (
          /* v5.3.1：API 失敗時顯示具體錯誤，避免客戶誤以為報告消失 */
          <div className="glass rounded-2xl p-16 text-center border border-red-500/30">
            <div className="text-4xl mb-4">&#9888;</div>
            <h3 className="text-lg font-semibold text-cream mb-2">暫時無法載入您的報告</h3>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">{fetchError}</p>
            <button
              onClick={() => { setLoading(true); setFetchError(null); fetchReports().then(setReports).catch(() => {}).finally(() => setLoading(false)) }}
              className="px-6 py-2.5 bg-gold text-dark font-semibold rounded-lg btn-glow"
            >
              重新整理
            </button>
          </div>
        ) : (
          <div className="glass rounded-2xl p-16 text-center">
            <div className="text-4xl mb-4" style={{ fontFamily: 'var(--font-sans)' }}>&#9788;</div>
            <h3 className="text-lg font-semibold text-cream mb-2">還沒有報告</h3>
            <p className="text-sm text-text-muted mb-6">選擇一個方案，開始你的命理探索之旅</p>
            <Link href="/tools/bazi" className="px-6 py-2.5 bg-gold text-dark font-semibold rounded-lg btn-glow">
              先免費體驗
            </Link>
          </div>
        )}

        {/* 推薦與點數 */}
        <ReferralCard />

        {/* 我的家人 */}
        <FamilyMembersManager />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-text-muted">載入中...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
