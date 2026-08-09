import { readFileSync } from 'node:fs'

let passed = 0
let failed = 0
let fixtureServer

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('\n--- E3 本機 Supabase fixture server ---')

await check('fixture server 可載入', async () => {
  fixtureServer = await import('../scripts/lib/e3-fixture-server.mjs')
  assert(typeof fixtureServer.createE3FixtureServer === 'function', '缺少 createE3FixtureServer')
})

if (fixtureServer?.createE3FixtureServer) {
  const fixtureUrl = new URL('./fixtures/e3-freeze/runtime-fixtures.json', import.meta.url)
  const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'))
  const server = await fixtureServer.createE3FixtureServer({ fixture, port: 0 })

  try {
    await check('auth user 只回傳合成帳號', async () => {
      const response = await fetch(`${server.origin}/auth/v1/user`, {
        headers: { Authorization: 'Bearer e3-freeze-access-token' },
      })
      const body = await response.json()
      assert(response.status === 200, `status=${response.status}`)
      assert(body.email === 'e3-freeze@example.invalid', `email=${body.email}`)
    })

    await check('paid_reports single query 回傳正式 E3 renderer 所需 fixture', async () => {
      const response = await fetch(`${server.origin}/rest/v1/paid_reports?select=*&access_token=eq.e3Freeze_20260809_SyntheticToken_A1b2C3`, {
        headers: { Accept: 'application/vnd.pgrst.object+json' },
      })
      const body = await response.json()
      assert(response.status === 200, `status=${response.status}`)
      assert(body.plan_code === 'E3', `plan_code=${body.plan_code}`)
      assert(body.report_result.top5_timings.length === 8, '應有 8 個合成吉時')
    })

    await check('paid_reports 缺少或使用錯誤 token filter 必須 fail closed', async () => {
      for (const query of ['select=*', 'select=*&access_token=eq.wrong-token']) {
        const response = await fetch(`${server.origin}/rest/v1/paid_reports?${query}`, {
          headers: { Accept: 'application/vnd.pgrst.object+json' },
        })
        assert(response.status === 406, `${query} status=${response.status}`)
        const body = await response.json()
        assert(body.code === 'PGRST116', `${query} code=${body.code}`)
      }
    })

    await check('非資料讀取型 audit request 僅收空成功回應', async () => {
      const response = await fetch(`${server.origin}/rest/v1/report_access_log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ synthetic: true }),
      })
      assert(response.status === 201, `status=${response.status}`)
      assert((await response.text()) === '', 'audit fixture 不應回傳資料')
    })
  } finally {
    await server.close()
  }
}

console.log(JSON.stringify({ suite: 'E3 本機 Supabase fixture server', passed, failed, skipped: 0 }))
if (failed > 0) process.exitCode = 1
