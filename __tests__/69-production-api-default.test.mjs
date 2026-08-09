import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const configSource = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8')

test('production builds without a branch-scoped API variable use the approved Fly origin', () => {
  for (const source of [configSource, apiSource]) {
    assert.match(source, /process\.env\.NODE_ENV\s*===\s*'production'/u)
    assert.match(source, /https:\/\/fortune-reports-api\.fly\.dev/u)
    assert.match(source, /http:\/\/localhost:8080/u)
  }

  assert.doesNotMatch(
    configSource,
    /const apiUrl\s*=\s*process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:8080'/u,
  )
  assert.doesNotMatch(
    apiSource,
    /const API_URL\s*=\s*process\.env\.NEXT_PUBLIC_API_URL\s*\|\|\s*'http:\/\/localhost:8080'/u,
  )
})
