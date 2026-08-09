import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0

function assert(condition, message = '斷言失敗') {
  if (!condition) throw new Error(message)
}

function test(name, run) {
  try {
    run()
    passed += 1
    console.log(`  [PASS] ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  [FAIL] ${name}`)
    console.log(`         ${error instanceof Error ? error.message : String(error)}`)
  }
}

const auditScript = join(
  process.cwd(),
  '__tests__',
  'fixtures',
  'consultation-pdf',
  'audit_rendered_pdf.py',
)

function baseManifest() {
  return {
    outputDirectory: join(tmpdir(), 'jianyuan-consultation-pdf-audit-output'),
    files: {
      C: {
        path: join(tmpdir(), 'not-opened-in-validation-only.pdf'),
        plan: 'C',
        planTitle: '人生藍圖',
        reportNumber: 'C-TEST',
        asOfDate: '2026-08-09',
        expectedBodyCjk: 50_000,
        expectedTextMarkers: { '章末完整標記': 1 },
        tailMarkers: ['章末完整標記'],
      },
    },
  }
}

function validate(manifest) {
  const directory = mkdtempSync(join(tmpdir(), 'jianyuan-pdf-manifest-contract-'))
  const manifestPath = join(directory, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return spawnSync('python', [auditScript, manifestPath, '--validate-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

console.log('\n--- C／G15 PDF audit manifest contract ---')

test('expectedTextMarkers 是審計器與 manifest producer 的單一正式欄位', () => {
  const result = validate(baseManifest())
  assert(result.status === 0, result.stderr || result.stdout)
  assert(result.stdout.includes('"status": "valid"'))
})

test('舊 expectedSeedCounts 欄位 fail closed，不會在渲染後才 KeyError', () => {
  const manifest = baseManifest()
  const spec = manifest.files.C
  spec.expectedSeedCounts = spec.expectedTextMarkers
  delete spec.expectedTextMarkers
  const result = validate(manifest)
  assert(result.status !== 0, '舊欄位必須被拒絕')
  assert(`${result.stderr}${result.stdout}`.includes('obsolete expectedSeedCounts'))
})

test('段尾標記未納入 expectedTextMarkers 時 fail closed', () => {
  const manifest = baseManifest()
  manifest.files.C.tailMarkers.push('未列入的段尾標記')
  const result = validate(manifest)
  assert(result.status !== 0, '未綁定的段尾標記必須被拒絕')
  assert(`${result.stderr}${result.stdout}`.includes('absent from expectedTextMarkers'))
})

test('標記次數非正整數時 fail closed', () => {
  const manifest = baseManifest()
  manifest.files.C.expectedTextMarkers['章末完整標記'] = 0
  const result = validate(manifest)
  assert(result.status !== 0, '非正整數次數必須被拒絕')
  assert(`${result.stderr}${result.stdout}`.includes('counts must be positive integers'))
})

test('可攜式政策校準會拒絕假 tagged、視覺逆序與正文藏入 Artifact', () => {
  const result = spawnSync('python', [auditScript, '--policy-self-test'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert(result.status === 0, result.stderr || result.stdout)
  const calibration = JSON.parse(result.stdout)
  assert(calibration.status === 'passed')
  assert(calibration.rejectedCounterexamples.includes('marked-false'))
  assert(calibration.rejectedCounterexamples.includes('visual-order-bottom-top-middle'))
  assert(calibration.rejectedCounterexamples.includes('body-hidden-as-artifact'))
  assert(calibration.rejectedCounterexamples.includes('parent-tree-key-order'))
  assert(calibration.rejectedCounterexamples.includes('parent-tree-limits'))
  assert(calibration.rejectedCounterexamples.includes('text-below-page-bounds'))
  assert(calibration.rejectedCounterexamples.includes('receipt-same-bytes-toctou'))
})

console.log(JSON.stringify({
  suite: 'C／G15 PDF audit manifest contract',
  passed,
  failed,
  skipped: 0,
}))
if (failed > 0) process.exitCode = 1
