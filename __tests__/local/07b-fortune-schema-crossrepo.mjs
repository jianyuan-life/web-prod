// 跨 repo 契約檢查（本機限定）：web 端要求命理研究 repo 的 api_server.py 具備
// i18n Phase 2 Sprint 4 schema。CI runner 沒有那個私有 repo，所以本檔不在
// __tests__ 的 .test.mjs glob 內、由 npm run check:crossrepo（pre-deploy）在本機執行。
// 同一契約的擁有方版本：fortune repo api_server/tests/test_web_i18n_contract_20260814.py。
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const apiServerCandidates = [
  process.env.JIANYUAN_FORTUNE_RESEARCH_ROOT,
  join(process.cwd(), '..', 'Claude-鑑源命理研究部門'),
  join(process.cwd(), '..', '..', 'Claude-鑑源', 'Claude-鑑源命理研究部門'),
  join(process.cwd(), '..', 'fortune-full-audit-20260813'),
].filter(Boolean).map((candidate) => resolve(candidate))
const apiServerPath = apiServerCandidates
  .map((candidate) => join(candidate, 'api_server', 'api_server.py'))
  .find((candidate) => existsSync(candidate))
assert(apiServerPath, `找不到命理研究 repo；已檢查 ${apiServerCandidates.join('、')}，或請設定 JIANYUAN_FORTUNE_RESEARCH_ROOT`)
const apiServerSrc = readFileSync(apiServerPath, 'utf-8')

test('Python BirthRequest 有 timezone 欄位', () => {
  assert(apiServerSrc.includes('timezone: Optional[str]'), 'BirthRequest 缺 timezone')
})
test('Python BirthRequest 有 birth_city 欄位', () => {
  assert(apiServerSrc.includes('birth_city: Optional[str]'), 'BirthRequest 缺 birth_city')
})
test('Python BirthRequest 有 birth_country 欄位', () => {
  assert(apiServerSrc.includes('birth_country: Optional[str]'), 'BirthRequest 缺 birth_country')
})
test('_to_birth_input 映射 timezone 到 BirthInput', () => {
  assert(apiServerSrc.includes('timezone=req.timezone'), '_to_birth_input 未傳 timezone')
})
