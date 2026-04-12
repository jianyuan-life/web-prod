'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

type ServiceHealth = {
  name: string; status: 'ok' | 'error' | 'warn'; latency_ms: number; message: string
}

type SystemData = {
  timestamp: string
  services: ServiceHealth[]
  env_vars: { name: string; set: boolean }[]
  overall: string
}

export default function SystemPage() {
  const { adminKey } = useAdminAuth()
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(false)

  const runChecks = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/system?key=${adminKey}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { runChecks() }, [runChecks])

  const statusIcon = (s: string) => s === 'ok' ? '●' : s === 'error' ? '●' : '●'
  const statusColor = (s: string) => s === 'ok' ? 'text-green-400' : s === 'error' ? 'text-red-400' : 'text-yellow-400'
  const overallColor = (s: string) => s === 'healthy' ? 'text-green-400 bg-green-400/10' : s === 'unhealthy' ? 'text-red-400 bg-red-400/10' : 'text-yellow-400 bg-yellow-400/10'
  const overallLabel = (s: string) => s === 'healthy' ? '系統正常' : s === 'unhealthy' ? '系統異常' : '部分降級'

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">系統監控</h1>
          {data && <p className="text-xs text-gray-500">上次檢查：{new Date(data.timestamp).toLocaleString('zh-TW')}</p>}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${overallColor(data.overall)}`}>
              {overallLabel(data.overall)}
            </span>
          )}
          <button onClick={runChecks} className="px-3 py-1.5 bg-amber-600 rounded-lg text-xs text-white hover:bg-amber-500">
            {loading ? '檢查中...' : '執行健康檢查'}
          </button>
        </div>
      </div>

      {!data && !loading && <div className="text-gray-500 text-sm">點擊「執行健康檢查」開始</div>}
      {loading && !data && <div className="text-gray-500 text-sm">正在檢查各項服務...</div>}

      {data && (
        <>
          {/* 服務狀態卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {data.services.map(svc => (
              <div key={svc.name} className="bg-[#1a1a1a] rounded-xl border border-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{svc.name}</span>
                  <span className={`text-lg ${statusColor(svc.status)}`}>{statusIcon(svc.status)}</span>
                </div>
                <div className="text-xs text-gray-400 mb-1">{svc.message}</div>
                <div className="text-[10px] text-gray-500">延遲：{svc.latency_ms}ms</div>
              </div>
            ))}
          </div>

          {/* 環境變數狀態 */}
          <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">環境變數</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.env_vars.map(v => (
                <div key={v.name} className="flex items-center gap-2 py-1">
                  <span className={`text-xs ${v.set ? 'text-green-400' : 'text-red-400'}`}>
                    {v.set ? '●' : '●'}
                  </span>
                  <span className="text-xs font-mono text-gray-300">{v.name}</span>
                  <span className="text-[10px] text-gray-500 ml-auto">{v.set ? '已設定' : '未設定'}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
