import { NextRequest, NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin-auth'
import { checkAdminRateLimit } from '@/lib/admin-rate-limit'

// ============================================================
// AI API 餘額監控 — 查詢 Claude / DeepSeek / Kimi 的帳戶餘額
// GET /api/admin/ai-balance  (ADMIN_KEY via x-admin-key header)
// ============================================================

export async function GET(req: NextRequest) {
  const rlFail = checkAdminRateLimit(req)
  if (rlFail) return rlFail
  const authFail = checkAdminAuth(req)
  if (authFail) return authFail

  const results: Array<{
    name: string
    balance: string
    currency: string
    status: 'ok' | 'warning' | 'critical' | 'error'
    detail?: string
  }> = []

  // 1. Claude (Anthropic) — 用最便宜的 Haiku 測試額度，再嘗試 Admin API 查精確餘額
  try {
    const claudeKey = process.env.CLAUDE_API_KEY || ''
    if (!claudeKey) {
      results.push({ name: 'Claude (Anthropic)', balance: '未設定', currency: '', status: 'error', detail: '缺少 CLAUDE_API_KEY' })
    } else {
      // Step 1: 用 Haiku（最便宜）測試能不能用
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: '1' }],
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (res.ok) {
        // Step 2: 嘗試 Admin API 查精確用量（需要 Admin Key）
        let costDetail = '可用（Anthropic 不提供餘額 API，請到 console.anthropic.com 查看）'
        try {
          const costRes = await fetch('https://api.anthropic.com/v1/organizations/cost_report', {
            headers: {
              'x-api-key': claudeKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'admin-2025-04-15',
            },
            signal: AbortSignal.timeout(5000),
          })
          if (costRes.ok) {
            const costData = await costRes.json()
            costDetail = `本月用量: $${JSON.stringify(costData).slice(0, 80)}`
          }
        } catch { /* Admin API 不可用，用預設說明 */ }

        results.push({ name: 'Claude (Anthropic)', balance: '可用 ✓', currency: 'USD', status: 'ok', detail: costDetail })
      } else {
        const errData = await res.json().catch(() => ({}))
        const msg = (errData as { error?: { message?: string } })?.error?.message || ''
        if (msg.includes('credit balance is too low')) {
          results.push({ name: 'Claude (Anthropic)', balance: '$0 額度耗盡', currency: 'USD', status: 'critical', detail: '請到 console.anthropic.com 充值' })
        } else if (res.status === 429) {
          results.push({ name: 'Claude (Anthropic)', balance: '可用（限流中）', currency: 'USD', status: 'warning', detail: 'API 暫時限流，稍後恢復' })
        } else {
          results.push({ name: 'Claude (Anthropic)', balance: '異常', currency: 'USD', status: 'error', detail: `HTTP ${res.status}: ${msg.slice(0, 100)}` })
        }
      }
    }
  } catch (e) {
    results.push({ name: 'Claude (Anthropic)', balance: '查詢失敗', currency: '', status: 'error', detail: e instanceof Error ? e.message : '未知錯誤' })
  }

  // 2. DeepSeek — 直接查餘額 API
  try {
    const dsKey = process.env.DEEPSEEK_API_KEY || ''
    if (!dsKey) {
      results.push({ name: 'DeepSeek', balance: '未設定', currency: '', status: 'error', detail: '缺少 DEEPSEEK_API_KEY' })
    } else {
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { 'Authorization': `Bearer ${dsKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json() as { is_available: boolean; balance_infos: Array<{ currency: string; total_balance: string }> }
        const usdInfo = data.balance_infos?.find((b) => b.currency === 'USD')
        const balance = usdInfo?.total_balance || '0'
        const balNum = parseFloat(balance)
        results.push({
          name: 'DeepSeek',
          balance: `$${balance}`,
          currency: 'USD',
          status: balNum > 5 ? 'ok' : balNum > 1 ? 'warning' : 'critical',
          detail: data.is_available ? '服務可用' : '服務不可用',
        })
      } else {
        results.push({ name: 'DeepSeek', balance: '查詢失敗', currency: '', status: 'error', detail: `HTTP ${res.status}` })
      }
    }
  } catch (e) {
    results.push({ name: 'DeepSeek', balance: '查詢失敗', currency: '', status: 'error', detail: e instanceof Error ? e.message : '未知錯誤' })
  }

  // 3. Kimi (Moonshot) — 查餘額 API
  try {
    const kimiKey = process.env.KIMI_API_KEY || ''
    if (!kimiKey) {
      results.push({ name: 'Kimi (Moonshot)', balance: '未設定', currency: '', status: 'error', detail: '缺少 KIMI_API_KEY' })
    } else {
      const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
        headers: { 'Authorization': `Bearer ${kimiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json() as { data: { available_balance: number; cash_balance: number } }
        const balance = data.data?.available_balance || 0
        results.push({
          name: 'Kimi (Moonshot)',
          balance: `¥${balance.toFixed(2)}`,
          currency: 'CNY',
          status: balance > 20 ? 'ok' : balance > 5 ? 'warning' : 'critical',
          detail: `現金餘額 ¥${(data.data?.cash_balance || 0).toFixed(2)}`,
        })
      } else {
        results.push({ name: 'Kimi (Moonshot)', balance: '查詢失敗', currency: '', status: 'error', detail: `HTTP ${res.status}` })
      }
    }
  } catch (e) {
    results.push({ name: 'Kimi (Moonshot)', balance: '查詢失敗', currency: '', status: 'error', detail: e instanceof Error ? e.message : '未知錯誤' })
  }

  return NextResponse.json({ balances: results, checked_at: new Date().toISOString() })
}
