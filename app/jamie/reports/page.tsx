'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件出門訣', E2:'月盤出門訣',
}

type Report = {
  id: string; client_name: string; customer_email: string; plan_code: string
  amount_usd: number; status: string; created_at: string; updated_at?: string
  error_message?: string; retry_count?: number; access_token?: string
}

export default function ReportsPage() {
  const { adminKey } = useAdminAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<string>('all')

  const fetchReports = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/orders?key=${adminKey}`)
      if (res.ok) {
        const data = await res.json()
        setReports(data.orders || [])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchReports() }, [fetchReports])

  const filtered = tab === 'all' ? reports : tab === 'pending' ? reports.filter(r => r.status === 'pending' || r.status === 'generating') : reports.filter(r => r.status === tab)

  const counts = {
    all: reports.length,
    pending: reports.filter(r => r.status === 'pending' || r.status === 'generating').length,
    completed: reports.filter(r => r.status === 'completed').length,
    failed: reports.filter(r => r.status === 'failed').length,
  }

  // 批量重試所有失敗報告
  const batchRetry = async () => {
    const failedIds = reports.filter(r => r.status === 'failed' && (r.retry_count ?? 0) < 3).map(r => r.id)
    if (failedIds.length === 0) { alert('沒有可重試的報告'); return }
    if (!confirm(`確認重試 ${failedIds.length} 筆失敗報告？`)) return
    for (const id of failedIds) {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, key: adminKey }),
      })
    }
    fetchReports()
  }

  // 單筆重試（用 admin 直接更新 Supabase）
  const retryOne = async (id: string) => {
    const res = await fetch('/api/admin/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, key: adminKey }),
    })
    if (res.ok) {
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'pending', error_message: undefined } : r))
    } else {
      const err = await res.json()
      alert(err.error || '重試失敗')
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">報告管理</h1>
          <p className="text-xs text-gray-500">管理所有已付費報告的生成狀態</p>
        </div>
        <div className="flex gap-2">
          {counts.failed > 0 && (
            <button onClick={batchRetry} className="px-3 py-1.5 bg-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/30">
              批量重試失敗 ({counts.failed})
            </button>
          )}
          <button onClick={fetchReports} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 狀態 Tab */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: '全部', count: counts.all },
          { key: 'pending', label: '處理中', count: counts.pending },
          { key: 'completed', label: '已完成', count: counts.completed },
          { key: 'failed', label: '失敗', count: counts.failed },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${tab === t.key ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* 報告列表 */}
      <div className="space-y-2">
        {filtered.map(report => (
          <div key={report.id} className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                report.status === 'completed' ? 'bg-green-400' :
                report.status === 'generating' ? 'bg-blue-400 animate-pulse' :
                report.status === 'pending' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{report.client_name}</span>
                  <span className="text-amber-400 text-xs">{PLAN_NAMES[report.plan_code] || report.plan_code}</span>
                  <span className="text-gray-500 text-xs">${report.amount_usd}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {report.customer_email} / {new Date(report.created_at).toLocaleString('zh-TW')}
                  {report.access_token && report.status === 'completed' && (
                    <a href={`/report/${report.access_token}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 ml-2">查看報告</a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {report.status === 'pending' && (
                  <span className="text-xs text-yellow-400">等待中...</span>
                )}
                {report.status === 'generating' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-400">AI 生成中...</span>
                    <button onClick={() => retryOne(report.id)}
                      className="px-2 py-1 bg-amber-500/20 rounded text-xs text-amber-400 hover:bg-amber-500/30" title="強制重新觸發生成">強制重試</button>
                  </div>
                )}
                {report.status === 'failed' && (
                  <>
                    <span className="text-[10px] text-gray-500">重試 {report.retry_count ?? 0}/3</span>
                    {(report.retry_count ?? 0) < 3 && (
                      <button onClick={() => retryOne(report.id)}
                        className="px-2 py-1 bg-amber-500/20 rounded text-xs text-amber-400 hover:bg-amber-500/30">重試</button>
                    )}
                  </>
                )}
                {report.status === 'completed' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">完成</span>
                    <button onClick={() => retryOne(report.id)}
                      className="px-2 py-1 bg-blue-500/20 rounded text-xs text-blue-400 hover:bg-blue-500/30">重新生成</button>
                  </div>
                )}
              </div>
            </div>
            {report.error_message && (
              <div className="mt-2 px-4 py-2 bg-red-500/10 rounded-lg text-xs text-red-400">
                {report.error_message}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">暫無報告</div>
        )}
      </div>
    </div>
  )
}
