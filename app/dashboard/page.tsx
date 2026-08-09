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
import { PLAN_NAMES, CHUMENJI_CODES } from '@/lib/plan-names'
import { buildPdfRoute, buildReportRoute, isConsultationPlan } from '@/lib/consultation/routes'
import { ApiError, RateLimitError, internalDelete } from '@/lib/api'
import UpsellModal from '@/components/UpsellModal'  // P11
import { isFlagEnabled } from '@/lib/feature-flags'  // P11 FF_UPSELL_MODAL
import {
  Archive,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

type Report = {
  id: string
  client_name: string
  plan_code: string
  amount_usd: number
  status: string
  pdf_url: string | null
  access_token: string | null
  report_result: {
    schemaVersion?: string
    consultation_report?: {
      schemaVersion?: string
    } | null
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
// v5.7.18:IA round 9 P0 — 補 E3 + E4(原缺漏會讓 E3/E4 客戶 dashboard 顯示「0 套系統」、實際 E3/E4 是奇門)
// v5.3.95 對外 14 套(原 15 套清零、E2 v2.0 月家奇門古法為主、其他輔助)
const PLAN_SYSTEMS: Record<string, number> = {
  C: 14, D: 0, G15: 14, R: 0, E1: 1, E2: 1, E3: 1, E4: 1,
}

type DashboardPdfReport = Pick<
  Report,
  'access_token' | 'pdf_url' | 'plan_code' | 'report_result'
>

function safeStoredPdfHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return undefined
  if (/[\s\p{Cc}]/u.test(value)) return undefined
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined
    return value
  } catch {
    return undefined
  }
}

function resolveDashboardPdfHref(report: DashboardPdfReport): string | undefined {
  // 出門訣系列維持既有行事曆交付，不在此新增 PDF 行為。
  if (CHUMENJI_CODES.has(report.plan_code)) return undefined

  const storedPdfHref = safeStoredPdfHref(report.pdf_url)
  if (!isConsultationPlan(report.plan_code)) return storedPdfHref

  const contract = report.report_result?.consultation_report
  const structured = typeof contract === 'object'
    && contract !== null
    && contract.schemaVersion === 'consultation-report/v1'
  if (!structured || !report.access_token) return storedPdfHref

  try {
    return buildPdfRoute(report.plan_code, report.access_token) ?? storedPdfHref
  } catch {
    // A malformed historic token must not crash the whole report library.
    return storedPdfHref
  }
}

const getReportStatus = (status: string) => {
  if (status === 'completed') return { label: '可閱讀', tone: 'ready', icon: CheckCircle2 }
  if (status === 'pending') return { label: '等待分析', tone: 'pending', icon: Clock3 }
  if (status === 'generating') return { label: '深度分析中', tone: 'pending', icon: Clock3 }
  if (status === 'failed') return { label: '需要處理', tone: 'failed', icon: TriangleAlert }
  if (status === 'needs_human_review') return { label: '人工把關中', tone: 'review', icon: LockKeyhole }
  if (status === 'refunded') return { label: '已退款處理', tone: 'muted', icon: FileText }
  return { label: '狀態待確認', tone: 'failed', icon: TriangleAlert }
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
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  // 追蹤剛完成的報告 ID（用於顯示完成提示動畫）
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set())
  // 付款成功事件只觸發一次
  const purchaseTracked = useRef(false)
  // 已送過推播的報告 ID（避免重複通知）
  const [notifiedIds] = useState<Set<string>>(() => new Set())
  const [copiedReportId, setCopiedReportId] = useState<string | null>(null)

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
    const reportToDelete = reports.find(report => report.id === id)
    const consultationDeletion = !!reportToDelete && isConsultationPlan(reportToDelete.plan_code)

    // E3 與其他既有方案保留原本的 optimistic 流程，避免改動其行為。
    if (!consultationDeletion) {
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
      return
    }

    if (consultationDeletion) {
      setDeletingId(id)
      setDeleteErrors(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      try {
        await internalDelete('/api/reports', {
          authToken,
          body: { id, email: userEmail },
        })
        setDeletedIds(prev => new Set(prev).add(id))
        setReports(prev => prev.filter(r => r.id !== id))
      } catch (error) {
        const requestReachedServer = error instanceof ApiError || error instanceof RateLimitError
        setDeleteErrors(prev => ({
          ...prev,
          [id]: requestReachedServer
            ? '目前無法從清單移除這份報告。報告仍保留在帳號中，請稍後再試；若問題持續，請聯絡客服。'
            : '連線中斷，未能從清單移除這份報告。報告仍保留在帳號中，請檢查網路後再試。',
        }))
      } finally {
        setDeletingId(null)
        setConfirmId(null)
        setFinalConfirmId(null)
      }
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

  const handleCopyPrivateLink = async (report: Report) => {
    if (!report.access_token) return
    const url = `${window.location.origin}${buildReportRoute(report.plan_code, report.access_token)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedReportId(report.id)
      setTimeout(() => setCopiedReportId(current => current === report.id ? null : current), 1800)
    } catch {
      window.prompt('複製這份報告的私密連結：', url)
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
    // v5.10.461 D2 修(bizaudit P1:purchase 缺 transaction_id → 重整頁面重複計轉換、ROAS 失真)
    //   用 stripe session_id(優先、跨 session 去重)或 report id 當 transaction_id、GA4 自動去重
    const txId = stripeSessionId || latestReport?.id || ''
    // GA4 purchase 事件
    gtag.event('purchase', {
      transaction_id: txId,
      currency: 'USD',
      value,
      plan_code: planCode,
      plan_name: planName,
    })
    // Meta Pixel Purchase 事件(eventID 供 CAPI 去重、Meta 端同 ID 只計一次)
    fbpixel.trackEvent('Purchase', {
      currency: 'USD',
      value,
      content_name: planName,
    }, txId ? { eventID: txId } : undefined)
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

  // P11 — Post-purchase upsell:有 completed 報告 + FF_UPSELL_MODAL on 時
  //   彈加購 modal(UpsellModal 內含映射、無對應方案自動 return null)。
  //   flag off(預設)→ upsellSourcePlan='' → 不渲染、零行為變化。
  const upsellSourcePlan = isFlagEnabled('FF_UPSELL_MODAL')
    ? (reports?.find(r => r.status === 'completed')?.plan_code || '')
    : ''

  const readyCount = reports.filter(r => r.status === 'completed').length
  const processingCount = reports.filter(r => r.status === 'pending' || r.status === 'generating').length
  const attentionCount = reports.filter(r => r.status === 'failed' || r.status === 'needs_human_review').length

  return (
    <div className="dashboard-vault">
      <div className="dashboard-vault__atmosphere" aria-hidden="true" />
      {upsellSourcePlan && <UpsellModal sourcePlan={upsellSourcePlan} />}
      <div className="dashboard-vault__shell">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {loading
            ? '正在載入您的私人報告檔案庫'
            : fetchError
              ? '目前無法載入報告'
              : `已載入 ${reports.length} 份報告，其中 ${readyCount} 份可以閱讀、${processingCount} 份處理中、${attentionCount} 份需要留意。`}
        </div>
        {/* Stripe 回跳只代表付款流程返回；待伺服器資料同步後再以報告狀態為準。 */}
        {paymentSuccess && (
          <div className="dashboard-payment-check" role="status" aria-live="polite">
            <div className="dashboard-payment-check__icon" aria-hidden="true">
              <RefreshCw size={19} />
            </div>
            <div>
              <p className="dashboard-payment-check__title">正在核對付款與報告資料</p>
              <p className="dashboard-payment-check__copy">
                付款流程資訊已送回鑒源，系統正在安全同步訂單與報告狀態。以下方報告清單為準；同步完成後會自動更新，請勿重複付款。
              </p>
            </div>
          </div>
        )}

        <header className="dashboard-hero">
          <div className="dashboard-hero__copy">
            <div className="dashboard-eyebrow">
              <Archive size={15} aria-hidden="true" />
              <span>PRIVATE ARCHIVE · 私人檔案庫</span>
            </div>
            <h1>我的報告檔案庫</h1>
            <p>查看製作進度、安全開啟完成的報告，並管理只屬於您的私人資料。</p>
          </div>
          <Link href="/pricing" className="dashboard-primary-action">
            <Plus size={18} aria-hidden="true" />
            <span>開始新的探索</span>
          </Link>
        </header>

        {!loading && reports.length > 0 && (
          <section className="dashboard-index" aria-label="報告狀態摘要">
            <div className="dashboard-index__intro">
              <span className="dashboard-index__label">檔案索引</span>
              <strong>{reports.length}</strong>
              <span>份私人報告</span>
            </div>
            <dl className="dashboard-index__states">
              <div className="dashboard-index__state dashboard-index__state--ready">
                <dt><CheckCircle2 size={15} aria-hidden="true" /> 可閱讀</dt>
                <dd>{readyCount}</dd>
              </div>
              <div className="dashboard-index__state dashboard-index__state--pending">
                <dt><Clock3 size={15} aria-hidden="true" /> 製作中</dt>
                <dd>{processingCount}</dd>
              </div>
              <div className="dashboard-index__state dashboard-index__state--attention">
                <dt><TriangleAlert size={15} aria-hidden="true" /> 需留意</dt>
                <dd>{attentionCount}</dd>
              </div>
            </dl>
          </section>
        )}

        {loading ? (
          <section className="dashboard-state-panel" role="status" aria-live="polite" aria-busy="true">
            <div className="dashboard-loader" aria-hidden="true" />
            <h2>正在開啟私人檔案庫</h2>
            <p>正在安全讀取您的報告狀態。</p>
          </section>
        ) : authFailed && !stripeSessionId ? (
          <section className="dashboard-state-panel dashboard-state-panel--auth" role="alert">
            <div className="dashboard-state-panel__icon" aria-hidden="true"><LockKeyhole size={24} /></div>
            <h2>需要重新確認會員身分</h2>
            <p>
              {paymentSuccess
                ? '我們已收到付款流程的返回資訊，但目前無法確認會員身分。'
                : '您的登入憑證已過期，或需要重新登入才能看到報告。'}
            </p>
            <p>
              請重新登入後查看最新的訂單與報告狀態；系統不會要求您再次付款。
            </p>
            <Link href="/auth/login?redirect=/dashboard"
              className="dashboard-primary-action">
              <LockKeyhole size={17} aria-hidden="true" />
              重新登入查看報告
            </Link>
          </section>
        ) : reports.length > 0 ? (
          <section className="dashboard-library" aria-labelledby="dashboard-library-title">
            <div className="dashboard-library__heading">
              <div>
                <span>REPORT ARCHIVE</span>
                <h2 id="dashboard-library-title">報告檔案</h2>
              </div>
              <p>完成的報告會保留在這裡；製作中的報告會自動更新。</p>
            </div>
            <div className="dashboard-report-list">
            {reports.map((r, index) => {
              const statusMeta = getReportStatus(r.status)
              const StatusIcon = statusMeta.icon
              return (
              <article
                key={r.id}
                className={`dashboard-report dashboard-report--${statusMeta.tone} ${justCompletedIds.has(r.id) ? 'dashboard-report--just-completed' : ''}`}
                aria-labelledby={`report-title-${r.id}`}
              >
                <div className="dashboard-report__spine" aria-hidden="true">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="dashboard-report__body">
                <div className="dashboard-report__header">
                  <div className="dashboard-report__identity">
                    <div className="dashboard-report__seal" aria-hidden="true">
                      {(r.client_name && r.client_name.length > 0) ? r.client_name[0] : '?'}
                    </div>
                    <div>
                      {/* v5.10.297:砍 truncate(客戶名重要、不可截)、加 CJK keep-all */}
                      <h3
                        id={`report-title-${r.id}`}
                        style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                      >
                        {r.client_name}
                      </h3>
                      <p className="dashboard-report__plan">{PLAN_NAMES[r.plan_code] || `方案 ${r.plan_code}`}</p>
                    </div>
                  </div>
                  <div className={`dashboard-status-badge dashboard-status-badge--${statusMeta.tone}`}>
                    <StatusIcon size={15} aria-hidden="true" />
                    <span>{statusMeta.label}</span>
                  </div>
                </div>

                <dl className="dashboard-report__metadata">
                  <div>
                    <dt>分析範圍</dt>
                    <dd>
                          {CHUMENJI_CODES.has(r.plan_code)
                            ? (r.plan_code === 'E1' ? '事件擇吉 Top3'
                              : r.plan_code === 'E2' ? '月度單盤'
                              : r.plan_code === 'E3' ? '月度精選 8 吉時'
                              : r.plan_code === 'E4' ? '年度全局佈局'
                              : '古法奇門出門訣')
                            : (() => {
                                const count = r.report_result?.systems_count ?? PLAN_SYSTEMS[r.plan_code] ?? 0
                                return count > 0 ? `${count} 套系統` : r.plan_code === 'D' ? '深度主題分析' : '關係合盤分析'
                              })()}
                    </dd>
                  </div>
                  <div>
                    <dt>付款紀錄</dt>
                    <dd>${Number(r.amount_usd).toFixed(2)} USD</dd>
                  </div>
                  <div>
                    <dt>建立日期</dt>
                    <dd><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString('zh-TW')}</time></dd>
                  </div>
                </dl>

                <div className="dashboard-report__controls">
                  <div className="dashboard-report__actions">
                    {r.status === 'completed' ? (
                      <>
                        {r.access_token ? (
                          <>
                            {isConsultationPlan(r.plan_code) ? (
                              <a
                                href={buildReportRoute(r.plan_code, r.access_token)}
                                className="dashboard-report-action dashboard-report-action--primary"
                              >
                                <BookOpenText size={17} aria-hidden="true" />
                                <span>開啟報告</span>
                              </a>
                            ) : (
                              <Link
                                href={buildReportRoute(r.plan_code, r.access_token)}
                                className="dashboard-report-action dashboard-report-action--primary"
                              >
                                <BookOpenText size={17} aria-hidden="true" />
                                <span>開啟報告</span>
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCopyPrivateLink(r)}
                              className="dashboard-report-action"
                              aria-describedby={`private-link-note-${r.id}`}
                            >
                              {copiedReportId === r.id ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                              <span>{copiedReportId === r.id ? '已複製私密連結' : '複製私密連結'}</span>
                            </button>
                          </>
                        ) : (
                          <p className="dashboard-status-context">報告連結正在準備，請稍後重新整理。</p>
                        )}
                        {(() => {
                          const pdfHref = resolveDashboardPdfHref(r)
                          if (!pdfHref) return null
                          return (
                            <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="dashboard-report-action">
                              <Download size={17} aria-hidden="true" />
                              <span>下載 PDF</span>
                            </a>
                          )
                        })()}
                      </>
                    ) : (r.status === 'pending' || r.status === 'generating') ? (
                      <p className={`dashboard-status-context ${isPendingTooLong(r) ? 'dashboard-status-context--attention' : ''}`}>
                        {isPendingTooLong(r)
                          ? '處理時間較長，系統仍在追蹤這份報告。完成後此處會自動更新。'
                          : '報告正在製作，您可以離開此頁；完成後會在檔案庫中開放閱讀。'}
                      </p>
                    ) : r.status === 'failed' ? (
                      <>
                        <p className="dashboard-status-context dashboard-status-context--error">
                          <strong>這份報告尚未完成。</strong>
                          <span>系統目前無法完成這份報告。您可以重新嘗試；若問題持續，請聯繫客服並提供下方參考碼。</span>
                          <span className="mt-2 font-mono text-[0.72rem] tracking-wide">
                            報告參考碼：{r.id.slice(0, 8).toUpperCase()}
                          </span>
                        </p>
                        {(r.retry_count ?? 0) < 3 && (
                          <button
                            type="button"
                            onClick={() => handleRetry(r.id)}
                            disabled={retryingId === r.id}
                            className="dashboard-report-action dashboard-report-action--retry"
                          >
                            <RotateCcw size={17} aria-hidden="true" />
                            <span>{retryingId === r.id ? '正在重試' : '重新嘗試'}</span>
                          </button>
                        )}
                      </>
                    ) : r.status === 'needs_human_review' ? (
                      // v5.10.461 P0-2 修:needs_human_review 原顯「狀態異常」紅字 = 客戶恐慌且無路可走。
                      // 改誠實引導(對齊 4 大保證:人工接手、不多扣款)。Codex P2:只對此 status、
                      // 其他狀態(refunded 等)不可誤標「把關中」。
                      <p className="dashboard-status-context dashboard-status-context--attention">
                        報告已進入人工品質把關；完成後會以 Email 通知。需要協助可聯繫{' '}
                        <a href="mailto:support@jianyuan.life">support@jianyuan.life</a>。
                      </p>
                    ) : r.status === 'refunded' ? (
                      <p className="dashboard-status-context">這筆報告已進入退款處理狀態。</p>
                    ) : (
                      <p className="dashboard-status-context dashboard-status-context--error">目前無法辨識報告狀態，請稍後重新整理或聯繫客服。</p>
                    )}
                  </div>
                    {/* 刪除按鈕 */}
                    <button
                      type="button"
                      onClick={() => setConfirmId(confirmId === r.id ? null : r.id)}
                      className="dashboard-report-action dashboard-report-action--icon dashboard-report-action--remove"
                      aria-label={`從清單移除 ${r.client_name} 的報告`}
                      aria-expanded={confirmId === r.id}
                      aria-controls={`remove-report-${r.id}`}
                      title="從報告清單移除"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                {r.status === 'completed' && r.access_token && (
                  <p id={`private-link-note-${r.id}`} className="dashboard-private-link-note">
                    <LockKeyhole size={14} aria-hidden="true" />
                    此連結即為報告存取憑證；持有連結者可閱讀內容，請只傳給您信任的人。
                  </p>
                )}
                {/* 剛完成的報告提示 */}
                {justCompletedIds.has(r.id) && (
                  <div className="dashboard-completed-note" role="status" aria-live="polite">
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>這份報告已完成，現在可以開啟閱讀。</span>
                  </div>
                )}
                {deleteErrors[r.id] && (
                  <div
                    className="dashboard-status-context dashboard-status-context--error"
                    role="alert"
                  >
                    <TriangleAlert size={16} aria-hidden="true" />
                    <span>{deleteErrors[r.id]}</span>
                  </div>
                )}
                {/* pending 時顯示進度條 */}
                {(r.status === 'pending' || r.status === 'generating') && (
                  <div className="dashboard-report__progress">
                    <ReportProgress createdAt={r.created_at} planCode={r.plan_code} generationProgress={r.generation_progress} />
                  </div>
                )}
                {/* v5.3.15：移除「更新出生地」— 我們沒有重算功能，不該讓客戶以為可以 */}
                {/* 僅描述目前 API 的 soft-delete 行為，不承諾永久清除。 */}
                {confirmId === r.id && (
                  <div
                    id={`remove-report-${r.id}`}
                    className="dashboard-remove-confirm"
                    role="group"
                    aria-labelledby={`remove-report-title-${r.id}`}
                  >
                    <div className="dashboard-remove-confirm__copy">
                      <TriangleAlert size={19} aria-hidden="true" />
                      <div>
                        <p id={`remove-report-title-${r.id}`}>從帳號清單移除這份報告？</p>
                        <p>
                          移除後，這份報告不再顯示於您的帳號清單，也無法在此頁自行復原。相關訂單與資料會依隱私政策及適用的保存要求處理。
                        </p>
                      </div>
                    </div>
                    <div className="dashboard-remove-confirm__actions">
                      <button
                        type="button"
                        onClick={() => { setConfirmId(null); setFinalConfirmId(null) }}
                        className="dashboard-report-action"
                      >
                        取消
                      </button>
                      {finalConfirmId === r.id ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="dashboard-report-action dashboard-report-action--danger"
                        >
                          {deletingId === r.id ? '正在移除' : '再次確認：從清單移除'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFinalConfirmId(r.id)}
                          className="dashboard-report-action dashboard-report-action--danger"
                        >
                          確認從清單移除
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </article>
              )
            })}
            </div>
          </section>
        ) : fetchError ? (
          /* v5.3.1：API 失敗時顯示具體錯誤，避免客戶誤以為報告消失 */
          <section className="dashboard-state-panel dashboard-state-panel--error" role="alert">
            <div className="dashboard-state-panel__icon" aria-hidden="true"><TriangleAlert size={24} /></div>
            <h2>暫時無法載入您的報告</h2>
            <p>{fetchError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); setFetchError(null); fetchReports().then(setReports).catch(() => {}).finally(() => setLoading(false)) }}
              className="dashboard-primary-action"
            >
              <RefreshCw size={17} aria-hidden="true" />
              重新整理
            </button>
          </section>
        ) : (
          <section className="dashboard-state-panel dashboard-state-panel--empty" role={paymentSuccess ? 'status' : undefined} aria-live={paymentSuccess ? 'polite' : undefined}>
            <div className="dashboard-state-panel__icon" aria-hidden="true">
              {paymentSuccess ? <RefreshCw size={24} /> : <Archive size={24} />}
            </div>
            <h2>{paymentSuccess ? '正在同步您的報告檔案' : '檔案庫目前是空的'}</h2>
            <p>
              {paymentSuccess
                ? '目前還沒有可顯示的報告。系統仍在核對付款與建立檔案，請稍後重新整理；請勿重複付款。'
                : '完成第一次探索後，報告與製作進度會安全保存在這裡。'}
            </p>
            {paymentSuccess ? (
              <button
                type="button"
                onClick={() => { setLoading(true); fetchReports().then(setReports).catch(() => {}).finally(() => setLoading(false)) }}
                className="dashboard-secondary-action"
              >
                <RefreshCw size={17} aria-hidden="true" />
                再次檢查
              </button>
            ) : (
              <Link href="/tools/bazi" className="dashboard-primary-action">
                <Sparkles size={17} aria-hidden="true" />
                先免費體驗
              </Link>
            )}
          </section>
        )}

        {/* 次要內容在報告檔案之後，避免搶走等待／失敗狀態的注意力。 */}
        {!loading && reports.length > 0 && (
          <aside className="dashboard-preview" aria-labelledby="daily-section-title">
            <div className="dashboard-preview__content">
              <div className="dashboard-preview__copy">
                <div className="dashboard-preview__heading">
                  <Sparkles size={16} aria-hidden="true" />
                  <h2 id="daily-section-title">您的今日能量</h2>
                  <span>即將推出</span>
                </div>
                <p>
                  鑒源正在規劃「每日能量」功能，預計整合八字命盤、奇門時盤、紫微流日與生物節律，整理當日的行動方向、吉時與避忌方位。
                </p>
              </div>
              <div className="dashboard-preview__date" aria-label="今日日期">
                {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}
              </div>
            </div>
          </aside>
        )}

        {/* 出門訣推廣 — 只對已有其他完成報告、但沒有出門訣報告的會員顯示。 */}
        {!loading && reports.length > 0 &&
          reports.some(r => r.status === 'completed' && !CHUMENJI_CODES.has(r.plan_code)) &&
          !reports.some(r => CHUMENJI_CODES.has(r.plan_code)) && (
          <aside className="dashboard-next-step" aria-label="下一步探索">
            <div className="dashboard-next-step__mark" aria-hidden="true">方</div>
            <div className="dashboard-next-step__copy">
              <p className="dashboard-next-step__label">下一步探索</p>
              <h2>把分析帶進日常行動</h2>
              <p>您已完成命格分析；「出門訣」會依奇門遁甲整理適合的出行吉時與方位。</p>
            </div>
            <Link href="/pricing" className="dashboard-secondary-action">
              <span>了解出門訣</span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </aside>
        )}

        <div className="dashboard-support-grid">
          {/* 推薦與點數 */}
          <section id="referral" aria-label="推薦與點數">
            <ReferralCard />
          </section>

          {/* 我的家人 */}
          <section aria-label="家人資料">
            <FamilyMembersManager />
          </section>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="dashboard-suspense" role="status">正在開啟私人檔案庫…</div>}>
      <DashboardContent />
    </Suspense>
  )
}
