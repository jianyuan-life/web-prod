import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
const config = readFileSync('next.config.ts', 'utf8')
const workflowFiles = readdirSync('.github/workflows')
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => `.github/workflows/${name}`)

test('CI production build uses a hostname accepted by the app SSRF allowlist', () => {
  const ciUrl = ci.match(/NEXT_PUBLIC_API_URL:\s*(https:\/\/[^\s]+)/u)?.[1]
  assert.ok(ciUrl, 'CI build NEXT_PUBLIC_API_URL is missing')
  const hostname = new URL(ciUrl).hostname
  assert.match(config, new RegExp(`['"]${hostname.replaceAll('.', '\\.') }['"]`, 'u'))
  assert.doesNotMatch(hostname, /placeholder/u)
})

test('every external GitHub Action is pinned to an immutable full commit SHA', () => {
  for (const workflowFile of workflowFiles) {
    const workflow = readFileSync(workflowFile, 'utf8')
    const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)]
    assert.ok(uses.length > 0, `${workflowFile} has no action references to audit`)
    for (const match of uses) {
      const action = match[1]
      assert.match(
        action,
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/u,
        `${workflowFile} action must be pinned by full commit SHA: ${action}`,
      )
    }
  }
})

test('production deploy is fenced by successful CI and checks out that exact main SHA', () => {
  const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8')
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
  assert.equal(vercel.git?.deploymentEnabled?.main, false)
  assert.match(deploy, /workflow_run:\s*\n\s+workflows:\s*\['CI Quality Gate'\]/u)
  assert.doesNotMatch(deploy, /^\s{2}push:/mu)
  assert.match(deploy, /workflow_run\.conclusion == 'success'/u)
  assert.match(deploy, /workflow_run\.event == 'push'/u)
  assert.match(deploy, /workflow_run\.head_branch == 'main'/u)
  assert.match(deploy, /ref:\s*\$\{\{ github\.event\.workflow_run\.head_sha \}\}/u)
  assert.match(deploy, /group:\s*production-deploy-main/u)
  assert.match(deploy, /environment:\s*\n\s+name:\s*production/u)
  assert.match(deploy, /git rev-parse origin\/main/u)
  assert.match(deploy, /test -n "\$VERCEL_TOKEN"/u)
})

test('production smoke waits for a successful deploy and inspects the deployed SHA', () => {
  const smoke = readFileSync('.github/workflows/production-smoke.yml', 'utf8')
  assert.match(smoke, /workflow_run:\s*\n\s+workflows:\s*\['Auto Deploy to Vercel Production'\]/u)
  assert.doesNotMatch(smoke, /^\s{2}push:/mu)
  assert.match(smoke, /workflow_run\.conclusion == 'success'/u)
  assert.match(smoke, /workflow_run\.head_branch == 'main'/u)
  assert.match(smoke, /ref:\s*\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/u)
})

test('all workflows explicitly minimize the GitHub token to contents read', () => {
  for (const workflowFile of workflowFiles) {
    const workflow = readFileSync(workflowFile, 'utf8')
    assert.match(workflow, /^permissions:\s*\n\s{2}contents:\s*read\s*$/mu, workflowFile)
  }
})
