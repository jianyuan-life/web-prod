// Phase 6 marathon — k6 load test for 100 concurrent users
//
// 對應 master_100_plan_2026-05-15.md Phase 6 marathon 品質
// 目標:模擬 100 並發用戶尖峰、確認 production 不崩
//
// 啟用前提:
//   1. 安裝 k6:https://k6.io/docs/get-started/installation/
//      Windows:choco install k6
//      Mac:brew install k6
//   2. (可選)Vercel Pro 升級 → serverless 5 min timeout、避免冷啟動 30s 砍
//   3. (可選)Fly.io min_machines=1 → 排盤 API 暖啟動
//
// 跑法:
//   k6 run __tests__/k6/100-concurrent-load-test.js
//   輸出 JSON:k6 run --out json=results.json __tests__/k6/100-concurrent-load-test.js
//
// 評分標準(95 gate Multi-LLM lesson #145):
//   - http_req_duration p95 < 3000ms(L1 QA pass)
//   - http_req_failed rate < 1%(L1 QA pass、絕對不可 5xx)
//   - vu_max_duration < 60s(L2 IA pass、無單一用戶 hang)
//   - 100 並發 30s 全成功 = 95+ gate PASS

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

// 自訂 metrics(超出 default 的部分)
const errorRate = new Rate('error_rate_5xx')
const slowRequests = new Rate('slow_requests_3s_plus')

// stage 設定:warm-up 10 vu → spike 100 vu → sustain → cool-down
export const options = {
  stages: [
    { duration: '20s', target: 10 },   // warm-up:10 並發 20s 預熱 cold start
    { duration: '30s', target: 100 },  // spike:30s 內升到 100 並發
    { duration: '60s', target: 100 },  // sustain:100 並發持續 1 分鐘
    { duration: '20s', target: 0 },    // cool-down:20s 內降到 0
  ],
  thresholds: {
    // 95 gate threshold:
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
    error_rate_5xx: ['rate<0.005'],   // 5xx 率必 < 0.5%
    slow_requests_3s_plus: ['rate<0.10'],  // 慢請求 < 10%
  },
  // 報告:加 percentile detail
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
}

const BASE_URL = __ENV.BASE_URL || 'https://jianyuan.life'

// 測試 page mix(模擬真實流量):
// - 60%:首頁(/)— 訪客最多
// - 15%:定價頁(/pricing)— 考慮買的
// - 10%:免費工具(/tools/bazi)— lead gen
// - 5%:報告頁(/dashboard)— 已登入老客
// - 5%:about/blog/whitepaper(SEO 流量)
// - 5%:health-check(monitoring)
const PAGE_WEIGHTS = [
  { path: '/', weight: 60 },
  { path: '/pricing', weight: 15 },
  { path: '/tools/bazi', weight: 10 },
  { path: '/dashboard', weight: 5 },
  { path: '/about', weight: 2 },
  { path: '/blog', weight: 2 },
  { path: '/whitepaper', weight: 1 },
  { path: '/api/health-check', weight: 5 },
]

function pickWeighted() {
  const totalWeight = PAGE_WEIGHTS.reduce((acc, p) => acc + p.weight, 0)
  const rand = Math.random() * totalWeight
  let acc = 0
  for (const item of PAGE_WEIGHTS) {
    acc += item.weight
    if (rand <= acc) return item.path
  }
  return PAGE_WEIGHTS[0].path
}

export default function () {
  const path = pickWeighted()
  const url = `${BASE_URL}${path}`

  const params = {
    headers: {
      'User-Agent': 'k6-load-test/1.0 (jianyuan-marathon-2026-05-15)',
      'Accept': 'text/html,application/json,*/*',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    timeout: '60s',  // 60s timeout(對應 Vercel Hobby、Pro 升 300s)
    tags: { name: path },
  }

  const res = http.get(url, params)

  // 標記 5xx + slow request
  errorRate.add(res.status >= 500)
  slowRequests.add(res.timings.duration > 3000)

  // 檢查
  check(res, {
    [`${path} status 200/304/308`]: (r) => [200, 304, 308].includes(r.status),
    [`${path} response < 5s`]: (r) => r.timings.duration < 5000,
    [`${path} body not empty`]: (r) => r.body !== null && (typeof r.body === 'string' ? r.body.length > 0 : true),
  })

  // 模擬用戶閱讀:1-3s 隨機停留
  sleep(1 + Math.random() * 2)
}

// teardown:報告 summary(k6 自動印 summary、此 hook 可加額外 metric output)
export function teardown(data) {
  // 自訂 teardown 邏輯(若有)
  console.log('━━━ Phase 6 marathon load test 結束 ━━━')
  console.log('Base URL:', BASE_URL)
  console.log('Result file: results.json(若用 --out json=results.json)')
}
