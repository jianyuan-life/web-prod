#!/usr/bin/env node
/**
 * T7b codemod — 82 檔 raw createClient(SERVICE_ROLE_KEY) → createServiceClient() singleton
 *
 * 對應 lesson #146:T7 v5.10.359 partial wire(只 wire 1 helper、84 callers 仍 raw)
 * 目標:全 production code 改走 lib/supabase.ts createServiceClient(memoized singleton)
 *
 * Pattern matched(allowed multi-line):
 *   const X = createClient(
 *     process.env.NEXT_PUBLIC_SUPABASE_URL || '',
 *     process.env.SUPABASE_SERVICE_ROLE_KEY || '',
 *   )
 *   const Y = createClient(URL, ANON_KEY || SERVICE_ROLE_KEY)  ← 不動(雙 key fallback、可能 client-side)
 *
 * 變化:
 *   1. 移除 `import { createClient } from '@supabase/supabase-js'`(若無其他用)
 *   2. 加 `import { createServiceClient } from '@/lib/supabase'`
 *   3. 替換整段 createClient(...SERVICE_ROLE_KEY...) 為 createServiceClient()
 *
 * Usage:  node scripts/codemod-supabase-service-client.mjs [--dry] [--file <path>]
 *   --dry  只列出會改的檔案、不寫
 *   --file 只跑單檔
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const fileIdx = args.indexOf('--file');
const targetFile = fileIdx >= 0 ? args[fileIdx + 1] : null;

// ── 模式 ──
// 1. createClient(...SERVICE_ROLE_KEY...) — 跨行
//    包括:單行(SERVICE_ROLE_KEY)、雙行(URL, SERVICE_ROLE_KEY)、三行(含 || '')
const SERVICE_CLIENT_PATTERN = /createClient\s*\(\s*[^)]*?SUPABASE_URL[^)]*?,\s*[^)]*?SERVICE_ROLE_KEY[^)]*?\)/gms;

// 2. import line patterns
const IMPORT_CREATE_CLIENT = /import\s*\{\s*([^}]*\bcreateClient\b[^}]*)\s*\}\s*from\s*['"]@supabase\/supabase-js['"]/;
const IMPORT_FROM_LIB_SUPABASE = /import\s*\{[^}]*\bcreateServiceClient\b[^}]*\}\s*from\s*['"]@\/lib\/supabase['"]/;

// 3. 還有非 service client 用法?(避免誤刪 import)
function hasNonServiceUsage(content) {
  // 移除已 match 的 SERVICE pattern 後、看還有沒有 createClient(
  const stripped = content.replace(SERVICE_CLIENT_PATTERN, '__REPLACED__');
  return /createClient\s*\(/.test(stripped);
}

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
        entry.name === 'public' ||
        entry.name === 'scripts'  // skip self
      ) continue;
      listSourceFiles(full, acc);
    } else if (entry.isFile()) {
      if (/\.(ts|tsx)$/.test(entry.name)) {
        acc.push(full);
      }
    }
  }
  return acc;
}

function migrateFile(filePath) {
  const rel = relative(REPO_ROOT, filePath).split(sep).join('/');
  if (rel.endsWith('lib/supabase.ts')) return null;  // 自身

  let content = readFileSync(filePath, 'utf8');
  const matches = content.match(SERVICE_CLIENT_PATTERN);
  if (!matches || matches.length === 0) return null;

  const original = content;

  // Step 1: 替換 createClient(...SERVICE_ROLE_KEY...) → createServiceClient()
  content = content.replace(SERVICE_CLIENT_PATTERN, 'createServiceClient()');

  // Step 2: 加 import { createServiceClient } from '@/lib/supabase'(若還沒)
  if (!IMPORT_FROM_LIB_SUPABASE.test(content)) {
    // 嘗試插在現有 import block 結尾
    // 找最後一個 import line、後面插
    const importLines = content.match(/^import .+$/gm);
    if (importLines && importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      content = content.replace(
        lastImport,
        lastImport + "\nimport { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)",
      );
    } else {
      content = "import { createServiceClient } from '@/lib/supabase'\n" + content;
    }
  }

  // Step 3: 移除 import { createClient } from '@supabase/supabase-js'(若無其他用)
  const importMatch = content.match(IMPORT_CREATE_CLIENT);
  if (importMatch) {
    const otherSymbols = importMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'createClient');
    if (otherSymbols.length === 0 && !hasNonServiceUsage(content)) {
      // 安全移除整行 import
      content = content.replace(/^import\s*\{\s*createClient\s*\}\s*from\s*['"]@supabase\/supabase-js['"]\s*;?\n/m, '');
    } else if (otherSymbols.length > 0) {
      // 保留 import 但移除 createClient
      content = content.replace(
        IMPORT_CREATE_CLIENT,
        `import { ${otherSymbols.join(', ')} } from '@supabase/supabase-js'`,
      );
    }
  }

  if (content === original) return null;

  return { rel, content, occurrences: matches.length };
}

// ── Main ──
let files;
if (targetFile) {
  const full = targetFile.startsWith(REPO_ROOT) ? targetFile : join(REPO_ROOT, targetFile);
  files = [full];
} else {
  files = listSourceFiles(REPO_ROOT);
}

const migrations = [];
for (const file of files) {
  const result = migrateFile(file);
  if (result) migrations.push({ file, ...result });
}

console.log(`━━━ T7b codemod:supabase service client ${isDry ? '(DRY RUN)' : ''}━━━`);
console.log(`掃描 ${files.length} 檔、命中 ${migrations.length} 檔`);
for (const m of migrations) {
  console.log(`  ${m.rel}(${m.occurrences} 次)`);
}

if (isDry) {
  console.log('\n[dry] 不寫檔、移除 --dry 後執行才會改');
  process.exit(0);
}

if (migrations.length === 0) {
  console.log('\n沒有要改的檔');
  process.exit(0);
}

for (const m of migrations) {
  writeFileSync(m.file, m.content, 'utf8');
}
console.log(`\n✅ 寫入 ${migrations.length} 檔、跑 npm run type-check 驗證`);
