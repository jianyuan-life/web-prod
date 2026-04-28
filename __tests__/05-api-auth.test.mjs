// 測試 5：API 權限檢查
// 掃描所有 API route 檔案，確認需要認證的端點有認證保護

import { suite, test, assert, skip, done } from './harness.mjs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ── 遞迴掃描所有 route.ts 檔案 ──

const API_DIR = join(process.cwd(), 'app', 'api')

function findRouteFiles(dir, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        findRouteFiles(full, results)
      } else if (entry === 'route.ts') {
        results.push(full)
      }
    }
  } catch { /* 目錄不存在則跳過 */ }
  return results
}

const routeFiles = findRouteFiles(API_DIR)

// ── 分類 API 端點 ──

// 用正規化路徑（forward slash）做分類
function normPath(fullPath) {
  return fullPath.replace(/\\/g, '/')
}

// 公開端點（不需認證）：免費工具、結帳、Stripe Webhook、統計、追蹤
const PUBLIC_PATTERNS = [
  /free-bazi/, /free-ziwei/, /free-name/,  // 免費工具
  /checkout\/route\.ts$/,                  // Stripe 結帳建立
  /webhook\/stripe/,                       // Stripe Webhook（Stripe 自己驗簽名）
  /\/track\//,                             // 訪客追蹤
  /\/stats\//,                             // 公開統計（顯示用戶數）
  /coupons\/validate/,                     // 優惠碼驗證（客戶端呼叫）
  /report-progress/,                       // 報告進度查詢（SSE，含 runId）
  /\/feedback\/route\.ts$/,                // 客戶反饋提交
  /\/report-view\//,                       // 報告瀏覽追蹤（不需認證，報告頁自帶 token）
  /\/promotions\/active/,                  // 促銷活動查詢（前端定價頁用）
  /\/referral\/validate/,                  // 推薦碼驗證（註冊頁用，不需登入）
  /\/referral\/my-code/,                   // 取得推薦碼（需登入，cookie auth）
  /\/points\/balance/,                     // 點數餘額查詢（需登入，cookie auth）
  /\/points\/use/,                         // 點數折抵（需登入，cookie auth）
  // v5.4.15 新分類(原未分類端點):
  /\/ab-events\//,                         // A/B 測試事件追蹤(前端打點、無 PII)
  /\/free-qimen\//,                        // 免費奇門排盤(同 free-bazi)
  /\/unsubscribe\//,                       // 退訂(URL 帶 token、不需 admin)
]

// 需要 ADMIN_KEY 的端點
const ADMIN_PATTERNS = [
  /\/admin\//,
]

// 需要 CRON_SECRET 的端點
const CRON_PATTERNS = [
  /\/cron\//,
]

// 需要 Supabase Auth 的端點
const AUTH_PATTERNS = [
  /\/reports\/route\.ts$/,      // 用戶報告查詢
  /\/reports\/generate-pdf/,    // PDF 補生成(需 user 已購)v5.4.15 新增
  /\/reports\/update-birth-location/, // 補出生地(需 user 持有報告)v5.4.15 新增
  /family-members/,             // 家庭成員管理
  /checkout\/search-reports/,   // 搜尋已完成報告（G15用）
  /checkout\/verify-family/,    // 家族驗證
  /\/points\/transfer/,         // 積分贈與(需登入、Authorization header)v5.4.15 新增
  /\/referral\/register/,       // 推薦碼註冊(需 user 認證)v5.4.15 新增
]

// 內部端點（由其他伺服器呼叫）
const INTERNAL_PATTERNS = [
  /generate-report/,           // 報告生成（webhook 觸發）
  /\/workflows\//,             // Workflow 端點（內部 CRON_SECRET/ADMIN_KEY 驗證）
]

function getRelativePath(fullPath) {
  return fullPath.replace(API_DIR, '').replace(/\\/g, '/')
}

function isPublic(path) {
  const np = normPath(path)
  return PUBLIC_PATTERNS.some(p => p.test(np))
}

// ── 測試開始 ──

suite('API 權限檢查')

test(`發現 ${routeFiles.length} 個 API route 檔案`, () => {
  assert(routeFiles.length > 0, '應至少有 1 個 API route')
  assert(routeFiles.length >= 20, `預期至少 20 個 route，實際 ${routeFiles.length}`)
})

// 測試每個 admin 端點都有 ADMIN_KEY 驗證
// v5.4.15 修:接受 ADMIN_KEY 字串 OR checkAdminAuth() helper(包裝 ADMIN_KEY、line 9 admin-auth.ts 真實在 process.env.ADMIN_KEY)
test('所有 /admin/ 端點必須有 ADMIN_KEY 驗證', () => {
  const adminRoutes = routeFiles.filter(f => ADMIN_PATTERNS.some(p => p.test(normPath(f))))
  const unprotected = []
  for (const file of adminRoutes) {
    const content = readFileSync(file, 'utf-8')
    const hasAuthHelper = content.includes('checkAdminAuth(') || content.includes('checkAdminAuth ')
    const hasRawKey = content.includes('ADMIN_KEY')
    if (!hasAuthHelper && !hasRawKey) {
      unprotected.push(getRelativePath(file))
    }
  }
  assert(unprotected.length === 0,
    `以下 admin 端點缺少 ADMIN_KEY 或 checkAdminAuth() 保護: ${unprotected.join(', ')}`)
})

// 測試每個 cron 端點都有 CRON_SECRET 驗證
test('所有 /cron/ 端點必須有 CRON_SECRET 驗證', () => {
  const cronRoutes = routeFiles.filter(f => CRON_PATTERNS.some(p => p.test(normPath(f))))
  const unprotected = []
  for (const file of cronRoutes) {
    const content = readFileSync(file, 'utf-8')
    if (!content.includes('CRON_SECRET')) {
      unprotected.push(getRelativePath(file))
    }
  }
  assert(unprotected.length === 0,
    `以下 cron 端點缺少 CRON_SECRET 保護: ${unprotected.join(', ')}`)
})

// 測試需認證端點有 auth 檢查
// v5.4.15 修:接受多種合法 auth pattern
test('需認證端點必須有 Authorization 或 auth 驗證', () => {
  const authRoutes = routeFiles.filter(f => AUTH_PATTERNS.some(p => p.test(normPath(f))))
  const unprotected = []
  for (const file of authRoutes) {
    const content = readFileSync(file, 'utf-8')
    const hasAuth = content.includes('Authorization') ||
                    content.includes('getAuthEmail') ||
                    content.includes('getAuth') ||
                    content.includes('supabase.auth') ||
                    content.includes('session_id') ||
                    content.includes('access_token') ||  // v5.4.15:報告 token 認
                    content.includes('admin.getUserById') ||  // v5.4.15:service role 驗 userId(referral/register 用)
                    content.includes('verifyAccessToken') ||
                    content.includes('getAuthUserId')  // v5.4.15:lib/auth-helper.ts 統一 user id 取得(family-members / points 等)
    if (!hasAuth) {
      unprotected.push(getRelativePath(file))
    }
  }
  assert(unprotected.length === 0,
    `以下端點缺少認證保護: ${unprotected.join(', ')}`)
})

// 確認 Stripe webhook 有簽名驗證
test('Stripe webhook 必須有簽名驗證', () => {
  const webhookFiles = routeFiles.filter(f => /webhook\/stripe/.test(normPath(f)))
  for (const file of webhookFiles) {
    const content = readFileSync(file, 'utf-8')
    assert(
      content.includes('constructEvent') || content.includes('WEBHOOK_SECRET') || content.includes('stripe.webhooks'),
      `${getRelativePath(file)} 缺少 Stripe 簽名驗證`
    )
  }
})

// 確認 generate-report 不是完全公開的
test('generate-report 端點有防護機制', () => {
  const genFiles = routeFiles.filter(f => /generate-report\/route\.ts$/.test(normPath(f)) && !/workflows/.test(normPath(f)))
  for (const file of genFiles) {
    const content = readFileSync(file, 'utf-8')
    // 至少要有 reportId 檢查或 supabase 查詢防重複
    assert(
      content.includes('reportId') || content.includes('existingReport'),
      `${getRelativePath(file)} 缺少基本防護（reportId 或重複檢查）`
    )
  }
})

// 確認 workflow 端點有 CRON_SECRET 或 ADMIN_KEY 驗證
test('workflow 端點必須有 CRON_SECRET 或 ADMIN_KEY 驗證', () => {
  const workflowFiles = routeFiles.filter(f => /workflows/.test(normPath(f)))
  for (const file of workflowFiles) {
    const content = readFileSync(file, 'utf-8')
    assert(
      content.includes('CRON_SECRET') || content.includes('ADMIN_KEY'),
      `${getRelativePath(file)} 缺少 CRON_SECRET/ADMIN_KEY 驗證`
    )
  }
})

// 掃描所有端點，列出未分類的（可能是新增但遺漏認證的）
test('所有端點都有明確分類（公開/admin/cron/auth/internal）', () => {
  const allPatterns = [...PUBLIC_PATTERNS, ...ADMIN_PATTERNS, ...CRON_PATTERNS, ...AUTH_PATTERNS, ...INTERNAL_PATTERNS]
  const unclassified = routeFiles.filter(f => !allPatterns.some(p => p.test(normPath(f))))
  if (unclassified.length > 0) {
    console.log(`  [警告] 未分類端點: ${unclassified.map(getRelativePath).join(', ')}`)
    // 不 fail，但列出來提醒
  }
  // 只確認不超過合理數量
  assert(unclassified.length <= 5,
    `太多未分類端點 (${unclassified.length})，可能有新增端點遺漏認證`)
})

// 檢查敏感端點的 birth_data 處理
test('admin/orders 有 ADMIN_KEY 保護（birth_data 只限 admin 存取）', () => {
  const ordersFile = routeFiles.find(f => /admin\/orders\/route\.ts$/.test(normPath(f)))
  if (!ordersFile) { skip('admin/orders 不存在'); return }
  const content = readFileSync(ordersFile, 'utf-8')
  // admin 端點有 ADMIN_KEY 保護，所以 birth_data 不會被未授權存取
  // v5.4.15 修:接受 checkAdminAuth() helper(包裝 ADMIN_KEY)
  const hasAuthHelper = content.includes('checkAdminAuth(') || content.includes('checkAdminAuth ')
  const hasRawKey = content.includes('ADMIN_KEY')
  assert(hasAuthHelper || hasRawKey, 'admin/orders 應有 ADMIN_KEY 或 checkAdminAuth() 保護')
})

done()
