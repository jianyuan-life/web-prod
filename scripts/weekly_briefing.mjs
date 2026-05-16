// 提示詞合集 Prompt 22 — Weekly Briefing
// ============================================================
// 讀 Supabase 過去 7 天 orders/report/Stripe + lessons.md 新增
// + git log + crisis_events → 產 tasks/briefings/YYYY-MM-DD.md。
// Resend 寄 backup901012@gmail.com。cron 每週六 09:00 UTC+8。
//
// 🔴 自治邊界:腳本=自治;cron 排程=老闆(auto-sync 例外 e)。
// 註:提示詞合集列 weekly_briefing.ts;本 repo scripts 慣例為 .mjs
//   (run-tests.mjs / check-no-raw-clients.mjs)→ 用 .mjs 可直接 node 跑。
//
// 跑法:node scripts/weekly_briefing.mjs [--dry]

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const HQ = join(REPO, '..')
const DRY = process.argv.includes('--dry')
const ALERT = process.env.BRIEFING_EMAIL || 'backup901012@gmail.com'

function env(...names) {
  for (const f of ['.env.local', '.env.production', '.env']) {
    const p = join(REPO, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i).trim()
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  for (const n of names) if (process.env[n]) return process.env[n]
  return ''
}

async function sbGet(path) {
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

function gitLog7d() {
  try {
    return execSync('git log --since="7 days ago" --oneline', { cwd: REPO }).toString().trim()
  } catch {
    return '(git log 不可用)'
  }
}

function lessons7d() {
  const p = join(HQ, 'tasks', 'lessons.md')
  if (!existsSync(p)) return '(無 lessons.md)'
  const txt = readFileSync(p, 'utf-8')
  const heads = [...txt.matchAll(/^## #\d+.*$/gm)].slice(0, 5).map((m) => m[0])
  return heads.length ? heads.join('\n') : '(本週無新 lesson 標題擷取)'
}

function energyAvg() {
  const p = join(HQ, 'tasks', 'energy_log.md')
  if (!existsSync(p)) return 'N/A(energy_log.md 未建)'
  const nums = [...readFileSync(p, 'utf-8').matchAll(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*(\d)\s*\|/gm)].map(
    (m) => +m[1],
  )
  if (!nums.length) return 'N/A'
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
}

const since = new Date(Date.now() - 7 * 864e5).toISOString()
const orders = (await sbGet(`paid_reports?select=plan_code,status,amount_total&completed_at=gte.${since}`)) || []
const crisis = (await sbGet(`crisis_events?select=id&ts=gte.${since}`)) || []

const byPlan = {}
let rev = 0
for (const o of orders) {
  byPlan[o.plan_code] = (byPlan[o.plan_code] || 0) + 1
  rev += (o.amount_total || 0) / 100
}

const today = new Date().toISOString().slice(0, 10)
const md = `# 鑑源週報 ${today}

## ① 營收 / 訂單(過去 7 天)
- 總訂單:${orders.length}、營收 ~$${rev.toFixed(2)}
- 分方案:${Object.entries(byPlan).map(([k, v]) => `${k}=${v}`).join(' / ') || '(無資料/需 Supabase env)'}

## ② Crisis events(過去 7 天)
- ${crisis.length} 筆${crisis.length ? ' ⚠️ 需心理研究室 review' : ''}

## ③ Top lessons(最新 5)
${lessons7d()}

## ④ git 活動(過去 7 天)
\`\`\`
${gitLog7d().slice(0, 1500)}
\`\`\`

## ⑤ Energy 平均
- ${energyAvg()}(規則:連 3 天 ≤2 強制 24h sabbatical;週均 hours>50 警告)

## ⑥ 下週建議
- 提示詞合集進度:見 tasks/prompt_collection_progress_2026-05-16.md
- Decision backlog(Tier 3 待老闆):見 tasks/decision_autonomy_tiers.md
`

if (DRY) {
  console.log(md)
  process.exit(0)
}

const dir = join(HQ, 'tasks', 'briefings')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `${today}.md`), md, 'utf-8')
console.log(`[ok] 寫 tasks/briefings/${today}.md`)

const rk = env('RESEND_API_KEY')
if (rk) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${rk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '鑑源總監室 <noreply@jianyuan.life>',
        to: [ALERT],
        subject: `[鑑源週報] ${today}`,
        html: `<pre>${md.replace(/</g, '&lt;')}</pre>`,
      }),
    })
    console.log(`[ok] 已寄 ${ALERT}`)
  } catch (e) {
    console.log(`[warn] Resend: ${e}`)
  }
}
