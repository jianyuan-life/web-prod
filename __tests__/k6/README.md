# Phase 6 Marathon — k6 Load Test Suite

> **建立**:2026-05-15、Phase 6 marathon 品質測試
> **對應**:`tasks/master_100_plan_2026-05-15.md` Phase 6
> **目標**:模擬 100 並發用戶尖峰場景、確認 production 不崩

---

## 安裝 k6

| OS | 命令 |
|:---|:---|
| Windows | `choco install k6` 或下載 https://github.com/grafana/k6/releases |
| Mac | `brew install k6` |
| Linux | `sudo apt-get install k6`(adds repo)或 docker run grafana/k6 |
| Docker | `docker run --rm -i grafana/k6 run - < script.js` |

驗證:`k6 version`

---

## 跑測試

### 1. 100 並發 marathon(基本)

```bash
cd D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門
k6 run __tests__/k6/100-concurrent-load-test.js
```

預期執行時間:約 2 分 10 秒(20s warm-up + 30s spike + 60s sustain + 20s cool-down)

### 2. 自訂 base URL(本機 / 預覽 deploy)

```bash
BASE_URL=https://jianyuan-web-prod-git-test-jianyuan.vercel.app k6 run __tests__/k6/100-concurrent-load-test.js
```

### 3. 輸出 JSON 結果(分析用)

```bash
k6 run --out json=results.json __tests__/k6/100-concurrent-load-test.js
# 然後 jq 處理:cat results.json | jq -s 'map(select(.type == "Point" and .metric == "http_req_duration")) | length'
```

### 4. Cloud 模式(若有 k6 Cloud account)

```bash
k6 cloud __tests__/k6/100-concurrent-load-test.js
```

---

## 評分標準(95 gate Multi-LLM、lesson #145)

| 指標 | 門檻 | 對應 LLM 評分 |
|:---|:---|:---:|
| http_req_duration p95 | < 3000ms | L1 QA |
| http_req_duration p99 | < 5000ms | L1 QA |
| http_req_failed rate | < 1% | L1 QA |
| error_rate_5xx | < 0.5% | L2 IA |
| slow_requests_3s_plus | < 10% | L2 IA |
| 100 並發 30s 全成功 | 必過 | L2 IA |

**95 gate**:任一 threshold fail → HOLD、必修。

---

## 流量模擬比例(real-traffic-like)

```
60%  /              訪客最多
15%  /pricing       考慮買的
10%  /tools/bazi    lead gen
 5%  /dashboard     已登入老客
 5%  /api/health-check  monitoring
 2%  /about         SEO
 2%  /blog          SEO
 1%  /whitepaper    SEO
```

---

## 故障判讀

### 若 5xx > 0.5%
- 看 Vercel Logs `Functions → Logs` 找 error stack
- 常見:Anthropic API 429 / DeepSeek 5xx / Supabase pool 滿
- 解:Phase 5 老闆按鈕 wire(Vercel Pro 升 timeout / Upstash rate-limit / Fly.io min=1)

### 若 p95 > 3s
- 多半 cold start(Vercel + Fly.io 排盤 API)
- 解:Phase 5 #6 Fly.io min_machines=1
- 或:Vercel Pro $20 升 5 min serverless timeout

### 若 100 並發掉到 80 vu
- 後端 Supabase pool 不足
- 解:T7 v5.10.359 已 wire `createServiceClient()` singleton、warm container 共用 client
- 若仍掉:Supabase Pro 升級 Pooler

---

## Phase 6 marathon 完整 3 件(本檔只覆蓋第 3 件 k6)

| # | 測試 | 工時 | 工具 | 狀態 |
|:---:|:---|:---:|:---|:---:|
| 1 | 100 客戶 regression(過去半年訂單抽 100、重跑、對照 diff) | 12h | Python script | ⏳ 待寫 |
| 2 | 16 報告 marathon(8 plan × 2 性別) | 8h | Python pytest | ⏳ 待寫 |
| 3 | k6 100 並發 | 6h | k6(本檔)| ✅ 寫好、等跑 |

---

## 啟用日

**2026-05-15、Phase 6 #3 k6 marathon 寫完、可立即跑**。

跑完後:
- 結果 → `tasks/marathon_2026-05-15_results.md`
- 若 95 gate fail → 開 Phase 6 fix sprint
- 若 PASS → master plan 100% 完成、進長期維運模式
