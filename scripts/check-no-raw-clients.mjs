#!/usr/bin/env node
/**
 * Sprint 8 ESLint-rule equivalent — 防新增 raw fetch / raw createClient(SERVICE_ROLE_KEY) / new Resend
 *
 * 對應 lesson #146:T9 sanitize 22 patterns / T10 apiPost / T12 sendEmailWithRetry / T7 service client singleton
 * production code 必走 lib/api.ts(apiPost+RateLimitError)/ lib/supabase.ts(getServiceClient)/ lib/resend-helper.ts(sendEmailWithRetry)
 *
 * Usage:  node scripts/check-no-raw-clients.mjs
 * Exit:   0 = baseline 一致 / 1 = 有新增違規(CI block)
 *
 * Baseline:scripts/.raw-clients-baseline.json(commit 進 repo、新增超過此數即 fail)
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const BASELINE_PATH = join(__dirname, '.raw-clients-baseline.json');

// ─── 規則定義 ───
const RULES = [
  {
    id: 'no-raw-fetch',
    label: 'raw fetch (應改用 lib/api.ts apiGet/apiPost、含 RateLimitError handling)',
    pattern: /(?<![\w.])fetch\s*\(/g,
    skipFiles: [
      'lib/api.ts',                 // 自身
      'lib/security/turnstile.ts',  // server-only Cloudflare API
      'lib/ai/observability/',      // observability fetch 已封 retry
      'workflows/',                 // workflow 內 service-to-service fetch、有自己 retry
      'lib/feature-flags.ts',       // Edge Config fetch
    ],
  },
  {
    id: 'no-raw-supabase-service-client',
    label: 'raw createClient(URL, SERVICE_ROLE_KEY) (應改用 lib/supabase.ts createServiceClient memoized singleton)',
    // multi-line:`createClient(\n  URL,\n  SERVICE_ROLE_KEY)`常見、必用 [\s\S] 跨行
    pattern: /createClient\s*\([\s\S]{0,200}?SERVICE_ROLE_KEY/g,
    skipFiles: [
      'lib/supabase.ts',  // 自身、唯一允許 raw createClient + SERVICE_ROLE_KEY 的 module
    ],
  },
  {
    id: 'no-raw-resend',
    label: 'raw new Resend() (應改用 lib/resend-helper.ts sendEmailWithRetry、含 retry + dead-letter)',
    pattern: /new\s+Resend\s*\(/g,
    skipFiles: [
      'lib/resend-helper.ts',  // 自身
    ],
  },
];

// ─── 掃描 ───
function listSourceFiles(dir, acc = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'out' ||
        entry.name.startsWith('.') ||
        entry.name === 'public'
      ) continue;
      listSourceFiles(full, acc);
    } else if (entry.isFile()) {
      if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function shouldSkipFile(relPath, skipPatterns) {
  const normalized = relPath.split(sep).join('/');
  return skipPatterns.some((p) => normalized.includes(p));
}

function scan() {
  const files = listSourceFiles(REPO_ROOT);
  const violations = {};

  for (const rule of RULES) {
    violations[rule.id] = [];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/');
      if (shouldSkipFile(rel, rule.skipFiles)) continue;

      let content;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      // skip files that are tests of these rules themselves
      if (rel.includes('__tests__/') && rel.includes(rule.id)) continue;
      // skip the scanner + codemod scripts themselves(會 match 自己 regex string)
      if (rel.endsWith('scripts/check-no-raw-clients.mjs')) continue;
      if (rel.endsWith('scripts/codemod-supabase-service-client.mjs')) continue;

      const matches = content.match(rule.pattern);
      if (matches && matches.length > 0) {
        violations[rule.id].push({ file: rel, count: matches.length });
      }
    }
    violations[rule.id].sort((a, b) => a.file.localeCompare(b.file));
  }

  return violations;
}

// ─── Baseline 對比 ───
function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function summarize(violations) {
  const out = {};
  for (const [id, list] of Object.entries(violations)) {
    out[id] = {
      fileCount: list.length,
      totalOccurrences: list.reduce((acc, v) => acc + v.count, 0),
    };
  }
  return out;
}

// ─── Main ───
const args = process.argv.slice(2);
const isUpdate = args.includes('--update-baseline');

const violations = scan();
const summary = summarize(violations);

console.log('━━━ Raw Client Scanner(T7b/T10b/T12b 防新增 baseline)━━━');
for (const rule of RULES) {
  const s = summary[rule.id];
  console.log(`  [${rule.id}] ${s.fileCount} 檔 / ${s.totalOccurrences} 次 — ${rule.label}`);
}

if (isUpdate) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ generated: new Date().toISOString(), summary, details: violations }, null, 2),
    'utf8',
  );
  console.log(`\n✅ baseline 已寫入 ${relative(REPO_ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

const baseline = loadBaseline();
if (!baseline) {
  console.log('\n⚠️ baseline 不存在、首次執行請跑:node scripts/check-no-raw-clients.mjs --update-baseline');
  process.exit(0);
}

let failed = false;
for (const rule of RULES) {
  const cur = summary[rule.id];
  const base = baseline.summary?.[rule.id] ?? { fileCount: 0, totalOccurrences: 0 };
  if (cur.totalOccurrences > base.totalOccurrences) {
    failed = true;
    console.log(
      `\n❌ [${rule.id}] 新增違規:` +
        `${base.totalOccurrences} → ${cur.totalOccurrences}(+${cur.totalOccurrences - base.totalOccurrences})`,
    );
    const baseFiles = new Set((baseline.details?.[rule.id] ?? []).map((v) => v.file));
    const newFiles = violations[rule.id].filter((v) => !baseFiles.has(v.file));
    if (newFiles.length > 0) {
      console.log(`  新增檔案:`);
      for (const v of newFiles) console.log(`    - ${v.file} (${v.count} 次)`);
    }
  } else if (cur.totalOccurrences < base.totalOccurrences) {
    console.log(
      `\n📉 [${rule.id}] 減少:${base.totalOccurrences} → ${cur.totalOccurrences}` +
        `(可跑 --update-baseline 更新基準線)`,
    );
  }
}

if (failed) {
  console.log('\n━━━ 修法 ━━━');
  console.log('  1. raw fetch        → import { apiPost } from "@/lib/api";');
  console.log('  2. raw createClient → import { getServiceClient } from "@/lib/supabase";');
  console.log('  3. raw new Resend   → import { sendEmailWithRetry } from "@/lib/resend-helper";');
  console.log('\n如為 legitimate 例外、請加進 RULES[].skipFiles + 註解原因');
  process.exit(1);
}

console.log('\n✅ 沒有新增違規');
process.exit(0);
