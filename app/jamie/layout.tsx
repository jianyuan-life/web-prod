'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// 全域 Admin 認證 Context
const AdminAuthContext = createContext<{ authed: boolean; adminKey: string; setAuthed: (v: boolean) => void; setAdminKey: (k: string) => void }>({
  authed: false, adminKey: '', setAuthed: () => {}, setAdminKey: () => {},
})

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}

const NAV_ITEMS = [
  { label: '總覽', href: '/jamie', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { label: 'BI 儀表板', href: '/jamie/dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: '訂單管理', href: '/jamie/orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: '用戶管理', href: '/jamie/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: '報告管理', href: '/jamie/reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: '5 LLM 品質 QA', href: '/jamie/quality-reports', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { label: '退款', href: '/jamie/refunds', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
  { label: 'AI 成本', href: '/jamie/ai-cost', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: '會計系統', href: '/jamie/accounting', icon: 'M9 7h6m-6 4h6m-6 4h4m-9 3V5a2 2 0 012-2h10a2 2 0 012 2v14M5 21h14M12 11.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z' },
  { label: '優惠碼', href: '/jamie/coupons', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { label: '促銷活動', href: '/jamie/promotions', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { label: '推薦碼', href: '/jamie/referrals', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: '客戶忠誠度', href: '/jamie/loyalty', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.756 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.783.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.05 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z' },
  { label: '數據分析', href: '/jamie/analytics', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { label: 'A/B 測試', href: '/jamie/ab-tests', icon: 'M7 4v16M17 4v16M3 8h4M17 8h4M3 12h4M17 12h4M3 16h4M17 16h4M9 4h6v16H9V4z' },
  { label: '監控總覽', href: '/jamie/monitoring', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { label: '系統監控', href: '/jamie/system', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { label: '稽核日誌', href: '/jamie/audit-log', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: '客戶反饋', href: '/jamie/feedback', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { label: '內容安全審查', href: '/jamie/content-review', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { label: '時區補填重算', href: '/jamie/recalculate', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()

  // 不再從 sessionStorage 恢復明文密碼（L7 P0 修復 2026-04-17）
  // 每次頁面刷新都要重新輸入，降低 XSS 外洩風險。
  // 未來可升級為 HttpOnly cookie + 短 TTL session。
  useEffect(() => {
    // 清除任何舊版留下的 sessionStorage 密碼（向下相容）
    try { sessionStorage.removeItem('admin_key') } catch {}
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    setLoginError('')
    try {
      // 用 x-admin-key header 驗證（不再塞到 URL query）
      const res = await fetch(`/api/admin?range=7d`, {
        headers: { 'x-admin-key': keyInput },
      })
      if (res.ok) {
        setAdminKey(keyInput)
        setAuthed(true)
      } else if (res.status === 429) {
        setLoginError('嘗試次數過多，請稍後再試')
      } else {
        setLoginError('密碼錯誤')
      }
    } catch { setLoginError('連線失敗') }
    finally { setLoading(false) }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div className="bg-[#1a1a1a] rounded-2xl p-8 w-full max-w-sm border border-white/10">
          <h1 className="text-xl font-bold text-white mb-2">鑒源管理後台</h1>
          <p className="text-sm text-gray-400 mb-6">請輸入管理密碼</p>
          <input type="password" placeholder="密碼" value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setLoginError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white mb-4 focus:border-amber-500 focus:outline-none" />
          {loginError && <p className="text-red-400 text-sm mb-3">{loginError}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-[#1a1a1a] font-bold rounded-lg hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 transition-all">
            {loading ? '驗證中...' : '進入後台'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <AdminAuthContext.Provider value={{ authed, adminKey, setAuthed, setAdminKey }}>
      <div className="min-h-screen flex" style={{ background: '#0f0f0f', color: '#e5e5e5' }}>
        {/* 側邊導航 */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} shrink-0 border-r border-white/5 bg-[#141414] transition-all duration-200 flex flex-col max-md:hidden`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            {!sidebarCollapsed && <span className="text-sm font-bold text-amber-400">鑒源後台</span>}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-gray-500 hover:text-white p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={sidebarCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
              </svg>
            </button>
          </div>
          <nav className="flex-1 py-2">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href || (item.href !== '/jamie' && pathname.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                    active ? 'text-amber-400 bg-amber-500/10 border-r-2 border-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d={item.icon} />
                  </svg>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              )
            })}
          </nav>
          <div className="p-4 border-t border-white/5">
            <button onClick={() => { setAuthed(false); setAdminKey(''); try { sessionStorage.removeItem('admin_key') } catch {} }}
              className={`text-xs text-gray-500 hover:text-red-400 ${sidebarCollapsed ? 'text-center w-full' : ''}`}>
              {sidebarCollapsed ? 'X' : '登出'}
            </button>
          </div>
        </aside>

        {/* 主內容 */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          {children}
        </main>

        {/* 手機版底部導航（可橫向滾動） */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#141414] border-t border-white/10 z-50">
          <div className="flex overflow-x-auto py-2 px-1 gap-1 scrollbar-hide">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href || (item.href !== '/jamie' && pathname.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] shrink-0 ${active ? 'text-amber-400' : 'text-gray-500'}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </AdminAuthContext.Provider>
  )
}
