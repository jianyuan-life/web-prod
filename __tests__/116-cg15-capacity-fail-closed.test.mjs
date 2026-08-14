import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveLocalModule(fullPath) {
  for (const candidate of [`${fullPath}.ts`, `${fullPath}.tsx`, path.join(fullPath, 'index.ts')]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@supabase/supabase-js') {
      return {
        url: `data:text/javascript,${encodeURIComponent('export function createClient(){return globalThis.__capacitySupabase}')}`,
        shortCircuit: true,
      }
    }
    if (specifier.startsWith('@/')) {
      const localUrl = resolveLocalModule(path.join(root, specifier.slice(2)))
      if (localUrl) return { url: localUrl, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

process.env.QIMEN_CAPACITY_MODE = 'open'
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY

const { checkCapacity } = await import('../lib/capacity-monitor.ts')

test('C／G15 無法證明即時容量時 fail closed，E3 保留既有 fail-open 輸出', async () => {
  const cDecision = await checkCapacity('C')
  const g15Decision = await checkCapacity('G15')
  const e3Decision = await checkCapacity('E3')

  assert.deepEqual(cDecision, {
    allowed: false,
    mode: 'capacity_unverified',
    message: '目前無法確認報告處理容量，請稍後再試。',
  })
  assert.deepEqual(g15Decision, cDecision)
  assert.deepEqual(e3Decision, { allowed: true, mode: 'open' })
})

test('C／G15 容量查詢失敗時 fail closed，E3 仍保留既有 fail-open 輸出', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://capacity.example.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role-key'
  const chain = {
    select() { return chain },
    in() { return chain },
    gte() { return chain },
    is: async () => ({ count: null, error: { message: 'synthetic query failure' } }),
  }
  globalThis.__capacitySupabase = { from: () => chain }

  const cDecision = await checkCapacity('C')
  const g15Decision = await checkCapacity('G15')
  const e3Decision = await checkCapacity('E3')

  assert.deepEqual(cDecision, {
    allowed: false,
    mode: 'capacity_unverified',
    message: '目前無法確認報告處理容量，請稍後再試。',
  })
  assert.deepEqual(g15Decision, cDecision)
  assert.deepEqual(e3Decision, { allowed: true, mode: 'open' })
})

test('C／G15 容量檢查發生意外時 fail closed，E3 仍保留既有 fail-open 輸出', async () => {
  globalThis.__capacitySupabase = {
    from() { throw new Error('synthetic capacity exception') },
  }

  const cDecision = await checkCapacity('C')
  const g15Decision = await checkCapacity('G15')
  const e3Decision = await checkCapacity('E3')

  assert.deepEqual(cDecision, {
    allowed: false,
    mode: 'capacity_unverified',
    message: '目前無法確認報告處理容量，請稍後再試。',
  })
  assert.deepEqual(g15Decision, cDecision)
  assert.deepEqual(e3Decision, { allowed: true, mode: 'open' })
})
