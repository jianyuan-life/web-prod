// ============================================================
// Team Pipeline 端對端測試
// ============================================================
// 跑 2-3 組實測：呼叫 Python 排盤 API → RAG → 主筆 → 3 方審 → 修訂
// 需要 .env.local 有：CLAUDE_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, QWEN_API_KEY,
//                    DEEPSEEK_API_KEY, MOONSHOT_API_KEY, VOYAGE_API_KEY,
//                    NEXT_PUBLIC_API_URL (Python 排盤), SUPABASE
//
// 執行：npx tsx scripts/test_team_pipeline.ts

import dotenv from 'dotenv'
import { runTeamPipeline } from '../lib/ai/pipeline'
import { retrieveRulesFromChart } from '../lib/ai/rag'
import { PLAN_SYSTEM_PROMPT } from '../workflows/generate-report/plan-prompts'

dotenv.config({ path: '.env.local' })

interface TestCase {
  name: string
  birthData: {
    name: string
    year: number
    month: number
    day: number
    hour: number
    minute: number
    gender: 'M' | 'F'
    latitude?: number
    longitude?: number
    timezone_offset?: number
    calendar_type?: 'solar' | 'lunar'
  }
}

// 3 個測試客戶（排盤引擎已驗證正確）
const TEST_CASES: TestCase[] = [
  {
    name: '何宣逸',
    birthData: {
      name: '何宣逸',
      year: 1990, month: 10, day: 12, hour: 20, minute: 0,
      gender: 'M',
      latitude: 25.0330, longitude: 121.5654,
      timezone_offset: 8,
      calendar_type: 'solar',
    },
  },
  {
    name: '林沅霖（閏月客戶，過去 bug 案例）',
    birthData: {
      name: '林沅霖',
      year: 1993, month: 5, day: 20, hour: 8, minute: 0,
      gender: 'M',
      latitude: 25.0330, longitude: 121.5654,
      timezone_offset: 8,
      calendar_type: 'solar',
    },
  },
]

async function callPythonPaipan(birthData: TestCase['birthData']) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://jianyuan-api.fly.dev'
  const res = await fetch(`${apiUrl}/api/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(birthData),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`排盤 API 失敗: HTTP ${res.status}`)
  return await res.json()
}

async function runOne(tc: TestCase): Promise<{
  name: string
  success: boolean
  peerScore: number
  truthViolations: number
  revisionRounds: number
  totalCost: number
  totalMs: number
  content?: string
  error?: string
}> {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`📝 測試：${tc.name}`)
  console.log(`${'='.repeat(72)}`)

  const startedAt = Date.now()
  const reportId = `test-${Date.now()}-${tc.name.replace(/\W/g, '')}`

  try {
    // 1. 排盤
    console.log('1. 呼叫 Python 排盤 API...')
    const t1 = Date.now()
    const chartData = await callPythonPaipan(tc.birthData)
    console.log(`   → 排盤完成 (${((Date.now() - t1) / 1000).toFixed(1)}s)`)

    // 2. RAG 檢索
    console.log('2. RAG 檢索相關規則...')
    const t2 = Date.now()
    let rules: Array<{ id: string; text: string; source: string; similarity: number }> = []
    try {
      const r = await retrieveRulesFromChart(chartData as unknown as Record<string, unknown>, null, 30)
      rules = r.rules.map(x => ({
        id: x.id,
        text: x.content || '',
        source: x.source || '',
        similarity: x.similarity || 0,
      }))
      console.log(`   → 檢索到 ${rules.length} 條規則 (${((Date.now() - t2) / 1000).toFixed(1)}s)`)
    } catch (e) {
      console.warn(`   → RAG 失敗（degraded to 0）: ${e}`)
    }

    // 3. 跑 Pipeline
    console.log('3. Team Pipeline 啟動（主筆→事實閘門→3方審→修訂）...')
    const outcome = await runTeamPipeline({
      reportId,
      planCode: 'C',
      planPrompt: PLAN_SYSTEM_PROMPT['C'],
      birthData: tc.birthData as Record<string, unknown>,
      chartData: chartData as Record<string, unknown>,
      retrievedRules: rules,
      customerNote: undefined,
      maxRevisionRounds: 3,
    })

    return {
      name: tc.name,
      success: outcome.success,
      peerScore: outcome.metrics.finalPeerReviewScore,
      truthViolations: outcome.metrics.truthGateViolations,
      revisionRounds: outcome.metrics.revisionRounds,
      totalCost: outcome.metrics.totalCostUsd,
      totalMs: Date.now() - startedAt,
      content: outcome.finalContent?.slice(0, 300),
      error: outcome.errorReason,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      name: tc.name,
      success: false,
      peerScore: 0,
      truthViolations: 0,
      revisionRounds: 0,
      totalCost: 0,
      totalMs: Date.now() - startedAt,
      error: msg,
    }
  }
}

async function main() {
  console.log('🧪 Team Pipeline 端對端測試')
  console.log(`測試客戶數：${TEST_CASES.length}`)
  console.log(`啟動時間：${new Date().toISOString()}\n`)

  const results = []
  for (const tc of TEST_CASES) {
    const r = await runOne(tc)
    results.push(r)
  }

  console.log('\n\n' + '='.repeat(72))
  console.log('📊 測試總結')
  console.log('='.repeat(72))
  console.log()
  console.log('| 客戶 | 成功 | Peer | Truth | 修訂 | 時間 | 成本 |')
  console.log('|:---|:---:|---:|---:|---:|---:|---:|')
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.success ? '✅' : '❌'} | ${r.peerScore}/100 | ` +
      `${r.truthViolations} 項 | ${r.revisionRounds} 輪 | ` +
      `${(r.totalMs / 1000).toFixed(0)}s | $${r.totalCost.toFixed(4)} |`,
    )
  }
  console.log()
  const okCount = results.filter(r => r.success && r.peerScore >= 96).length
  console.log(`\n結果：${okCount}/${results.length} 達到 ≥96 分標準`)

  // 寫入詳細結果
  const fs = await import('fs')
  const path = await import('path')
  const outPath = path.join(process.cwd(), 'scripts', 'test_results.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\n完整結果：${outPath}`)
}

main().catch(e => {
  console.error('測試失敗：', e)
  process.exit(1)
})
