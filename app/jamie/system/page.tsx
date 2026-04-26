'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

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
      const res = await adminFetch(`/api/admin/system`, { adminKey })
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

          {/* v5.4.1 Item 1 批次 3:Telegram 告警測試 UI(API 已存、UI 補齊) */}
          <TelegramTestPanel adminKey={adminKey || ''} />
        </>
      )}
    </div>
  )
}

function TelegramTestPanel({ adminKey }: { adminKey: string }) {
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{ event: string; ok: boolean; message?: string } | null>(null)

  const events = [
    { id: 'failed', label: '報告失敗告警', desc: '模擬 1 份報告生成失敗、檢查 [TEST] 訊息' },
    { id: 'high_cost', label: '高成本警報', desc: '模擬單份報告超預算、檢查告警是否送達' },
    { id: 'quality_gate', label: '品質閘門失敗', desc: '模擬 AI 報告未過 QA 閘門、檢查通知' },
    { id: 'daily', label: '每日摘要', desc: '模擬每日 09:00 自動摘要、檢查格式' },
    { id: 'llm_balance_low', label: 'LLM 餘額低', desc: '模擬 Claude/DeepSeek 餘額警告' },
    { id: 'llm_balance_critical', label: 'LLM 餘額危急', desc: '模擬餘額即將耗盡' },
  ]

  const trigger = async (eventId: string) => {
    if (!adminKey) return
    setRunning(eventId)
    setResult(null)
    try {
      const res = await adminFetch(`/api/admin/telegram-test?event=${eventId}`, {
        adminKey,
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      setResult({ event: eventId, ok: res.ok, message: data?.message || (res.ok ? '已觸發、請檢查 Telegram' : '失敗') })
    } catch (e: any) {
      setResult({ event: eventId, ok: false, message: e?.message || 'network error' })
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-5">
      <h3 className="text-sm font-semibold text-white mb-2">Telegram 告警測試</h3>
      <p className="text-xs text-gray-500 mb-4">每個按鈕觸發一個告警事件、實際送 [TEST] 前綴訊息到 Telegram、確認管道暢通</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {events.map(e => (
          <div key={e.id} className="bg-black/30 rounded-lg p-3 border border-white/5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-sm text-white font-medium">{e.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{e.desc}</div>
              </div>
              <button
                onClick={() => trigger(e.id)}
                disabled={running !== null}
                className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 disabled:opacity-40 whitespace-nowrap"
              >
                {running === e.id ? '送出中...' : '觸發'}
              </button>
            </div>
            {result?.event === e.id && (
              <div className={`text-[10px] mt-1 ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                {result.ok ? '✓' : '✗'} {result.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
