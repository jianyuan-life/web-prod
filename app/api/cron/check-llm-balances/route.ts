// v5.3.2 LLM 餘額檢查 Cron（2026-04-18）
//
// GET /api/cron/check-llm-balances
// Header: Authorization: Bearer ${CRON_SECRET}
// 每小時跑一次
//
// 這是 Node.js 版的 `scripts/check_llm_balances.py`（雲端 Vercel 跑）。
// Python 版供本機 Windows Task Scheduler 跑，兩者功能相同。
//
// 會：
//   1. 查各 provider 餘額（能查到的）
//   2. 寫入 llm_balance_log（Supabase）
//   3. low/critical 發 Telegram 告警

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyLLMBalanceLow, notifyLLMBalanceCritical, notify } from '@/lib/ai/observability/telegram'

export const maxDuration = 60

const LOW_THRESHOLD_USD = 10
const CRITICAL_THRESHOLD_USD = 3
const CNY_PER_USD = 7.2

type BalanceRow = {
  provider: string
  balance: number | null
  currency: string
  balance_usd: number | null
  status: 'ok' | 'low' | 'critical' | 'unknown' | 'error'
  error_message: string | null
  raw: Record<string, unknown>
}

function classify(balanceUsd: number | null): BalanceRow['status'] {
  if (balanceUsd === null) return 'unknown'
  if (balanceUsd < CRITICAL_THRESHOLD_USD) return 'critical'
  if (balanceUsd < LOW_THRESHOLD_USD) return 'low'
  return 'ok'
}

async function checkDeepSeek(): Promise<BalanceRow> {
  const key = process.env.DEEPSEEK_API_KEY || ''
  if (!key) {
    return { provider: 'deepseek', balance: null, currency: 'USD', balance_usd: null,
             status: 'unknown', error_message: 'DEEPSEEK_API_KEY 未設定', raw: {} }
  }
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { provider: 'deepseek', balance: null, currency: 'USD', balance_usd: null,
               status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
    }
    const data = await res.json() as { balance_infos: Array<{ currency: string; total_balance: string }> }
    const info = data.balance_infos?.find(b => b.currency === 'USD')
                 || data.balance_infos?.find(b => b.currency === 'CNY')
    if (!info) {
      return { provider: 'deepseek', balance: null, currency: 'USD', balance_usd: null,
               status: 'error', error_message: '無法解析 balance_infos', raw: (data as unknown as Record<string, unknown>) }
    }
    const bal = parseFloat(info.total_balance)
    const bal_usd = info.currency === 'USD' ? bal : Math.round(bal / CNY_PER_USD * 10000) / 10000
    return {
      provider: 'deepseek',
      balance: bal,
      currency: info.currency,
      balance_usd: bal_usd,
      status: classify(bal_usd),
      error_message: null,
      raw: data as unknown as Record<string, unknown>,
    }
  } catch (e) {
    return { provider: 'deepseek', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkMoonshot(): Promise<BalanceRow> {
  const key = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || ''
  if (!key) {
    return { provider: 'moonshot', balance: null, currency: 'CNY', balance_usd: null,
             status: 'unknown', error_message: 'MOONSHOT_API_KEY 未設定', raw: {} }
  }
  try {
    const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { provider: 'moonshot', balance: null, currency: 'CNY', balance_usd: null,
               status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
    }
    const data = await res.json() as { data: { available_balance: number; cash_balance: number } }
    const bal = Number(data.data?.available_balance || 0)
    const bal_usd = Math.round(bal / CNY_PER_USD * 10000) / 10000
    return {
      provider: 'moonshot',
      balance: bal,
      currency: 'CNY',
      balance_usd: bal_usd,
      status: classify(bal_usd),
      error_message: null,
      raw: (data.data as unknown as Record<string, unknown>) || {},
    }
  } catch (e) {
    return { provider: 'moonshot', balance: null, currency: 'CNY', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkAnthropic(): Promise<BalanceRow> {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  if (!key) {
    return { provider: 'anthropic', balance: null, currency: 'USD', balance_usd: null,
             status: 'unknown', error_message: 'CLAUDE_API_KEY 未設定', raw: {} }
  }
  try {
    // Anthropic 沒有 balance API，最多用 Haiku 打一下確認 key 還有效
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: '1' }],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      return { provider: 'anthropic', balance: null, currency: 'USD', balance_usd: null,
               status: 'unknown',
               error_message: 'API 可用，但 Anthropic 無餘額端點（需到 console.anthropic.com 手查）',
               raw: {} }
    }
    const errData = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const msg = errData?.error?.message || ''
    if (msg.includes('credit balance is too low')) {
      return { provider: 'anthropic', balance: 0, currency: 'USD', balance_usd: 0,
               status: 'critical', error_message: '額度耗盡（402）', raw: {} }
    }
    return { provider: 'anthropic', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: `HTTP ${res.status}: ${msg.slice(0, 100)}`, raw: {} }
  } catch (e) {
    return { provider: 'anthropic', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkOpenAI(): Promise<BalanceRow> {
  const key = process.env.OPENAI_API_KEY || ''
  if (!key) {
    return { provider: 'openai', balance: null, currency: 'USD', balance_usd: null,
             status: 'unknown', error_message: 'OPENAI_API_KEY 未設定', raw: {} }
  }
  try {
    // OpenAI 無公開 balance API，用 /v1/models 驗證 key
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      return { provider: 'openai', balance: null, currency: 'USD', balance_usd: null,
               status: 'unknown',
               error_message: 'API 可用，OpenAI 無 balance 端點（請到 platform.openai.com/usage）',
               raw: {} }
    }
    if (res.status === 401) {
      return { provider: 'openai', balance: 0, currency: 'USD', balance_usd: 0,
               status: 'critical', error_message: '401：API key 失效', raw: {} }
    }
    if (res.status === 429) {
      return { provider: 'openai', balance: 0, currency: 'USD', balance_usd: 0,
               status: 'critical', error_message: '429：quota 或 rate limit', raw: {} }
    }
    return { provider: 'openai', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
  } catch (e) {
    return { provider: 'openai', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkQwen(): Promise<BalanceRow> {
  const key = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || ''
  if (!key) {
    return { provider: 'qwen', balance: null, currency: 'CNY', balance_usd: null,
             status: 'unknown', error_message: 'DASHSCOPE_API_KEY / QWEN_API_KEY 未設定', raw: {} }
  }
  try {
    const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-turbo', max_tokens: 1, messages: [{ role: 'user', content: '1' }] }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      return { provider: 'qwen', balance: null, currency: 'CNY', balance_usd: null,
               status: 'unknown',
               error_message: 'API 可用，DashScope 無 balance 端點（請到 bailian.console.aliyun.com）',
               raw: {} }
    }
    if (res.status === 401 || res.status === 403) {
      return { provider: 'qwen', balance: 0, currency: 'CNY', balance_usd: 0,
               status: 'critical', error_message: `HTTP ${res.status}：API key 失效`, raw: {} }
    }
    if (res.status === 429) {
      return { provider: 'qwen', balance: 0, currency: 'CNY', balance_usd: 0,
               status: 'critical', error_message: '429：quota 耗盡', raw: {} }
    }
    return { provider: 'qwen', balance: null, currency: 'CNY', balance_usd: null,
             status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
  } catch (e) {
    return { provider: 'qwen', balance: null, currency: 'CNY', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkVoyage(): Promise<BalanceRow> {
  const key = process.env.VOYAGE_API_KEY || ''
  if (!key) {
    return { provider: 'voyage', balance: null, currency: 'USD', balance_usd: null,
             status: 'unknown', error_message: 'VOYAGE_API_KEY 未設定', raw: {} }
  }
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-3', input: ['1'] }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      return { provider: 'voyage', balance: null, currency: 'USD', balance_usd: null,
               status: 'unknown',
               error_message: 'API 可用，Voyage 無 balance 端點（請到 dash.voyageai.com）',
               raw: {} }
    }
    if (res.status === 401) {
      return { provider: 'voyage', balance: 0, currency: 'USD', balance_usd: 0,
               status: 'critical', error_message: '401：API key 失效', raw: {} }
    }
    if (res.status === 429) {
      return { provider: 'voyage', balance: 0, currency: 'USD', balance_usd: 0,
               status: 'critical', error_message: '429：quota 耗盡', raw: {} }
    }
    return { provider: 'voyage', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
  } catch (e) {
    return { provider: 'voyage', balance: null, currency: 'USD', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

async function checkGemini(): Promise<BalanceRow> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
  if (!key) {
    return { provider: 'gemini', balance: null, currency: 'FREE', balance_usd: null,
             status: 'unknown', error_message: 'GEMINI_API_KEY 未設定（跳過）', raw: {} }
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      return { provider: 'gemini', balance: null, currency: 'FREE', balance_usd: null,
               status: 'ok', error_message: '免費配額制（15 req/min）', raw: {} }
    }
    return { provider: 'gemini', balance: null, currency: 'FREE', balance_usd: null,
             status: 'error', error_message: `HTTP ${res.status}`, raw: {} }
  } catch (e) {
    return { provider: 'gemini', balance: null, currency: 'FREE', balance_usd: null,
             status: 'error', error_message: e instanceof Error ? e.message : 'timeout', raw: {} }
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  // 並行查詢（v5.3.5 擴充到 7 家）
  const [ds, ms, cl, gm, oa, qw, vy] = await Promise.all([
    checkDeepSeek(),
    checkMoonshot(),
    checkAnthropic(),
    checkGemini(),
    checkOpenAI(),
    checkQwen(),
    checkVoyage(),
  ])
  const results = [ds, ms, cl, gm, oa, qw, vy]

  // 寫入 Supabase
  const rows = results.map(r => ({
    provider: r.provider,
    balance: r.balance,
    currency: r.currency,
    balance_usd: r.balance_usd,
    status: r.status,
    error_message: r.error_message,
    raw: r.raw,
  }))
  const { error: insertErr } = await supabase.from('llm_balance_log').insert(rows)

  // 告警（同一 provider 6 小時內只告警一次 — 用最近一次 log 判斷）
  // v5.3.33：實作真正的 6 小時冷卻，避免每小時狂發告警
  const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000
  const sixHoursAgo = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString()
  const { data: recentAlerts } = await supabase
    .from('llm_balance_log')
    .select('provider, status, created_at')
    .gte('created_at', sixHoursAgo)
    .in('status', ['critical', 'low', 'error'])
    .order('created_at', { ascending: false })
    .limit(200)
  // 建立已告警過的 provider 集合（排除本次剛插入的 rows）
  // 只要 6 小時內同一 provider 有過 critical/low/error 狀態，就認為已告警過
  const alertedProviders = new Set<string>()
  const now = Date.now()
  for (const row of (recentAlerts || [])) {
    const t = new Date(row.created_at).getTime()
    // 排除 1 分鐘內的（本次執行剛寫的）
    if (now - t < 60_000) continue
    alertedProviders.add(row.provider)
  }

  let alerted = 0
  for (const r of results) {
    if (alertedProviders.has(r.provider)) continue // 6 小時內已告警，跳過
    if (r.status === 'critical' && r.balance !== null) {
      await notifyLLMBalanceCritical(r.provider, r.balance, r.currency)
      alerted++
    } else if (r.status === 'low' && r.balance !== null) {
      await notifyLLMBalanceLow(r.provider, r.balance, r.currency)
      alerted++
    } else if (r.status === 'error') {
      await notify(`🛠 LLM ${r.provider} 餘額查詢失敗`, r.error_message || '')
      alerted++
    }
  }

  return NextResponse.json({
    message: '完成',
    results: results.map(r => ({
      provider: r.provider,
      balance: r.balance,
      currency: r.currency,
      balance_usd: r.balance_usd,
      status: r.status,
    })),
    insertError: insertErr?.message || null,
    alerted,
  })
}
