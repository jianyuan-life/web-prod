// v5.10.328 (P0 #2 rate-limit 升級 — 滑動窗近似演算法、in-memory)
// 解現有 fixed-window 邊界 burst 問題:
//   Fixed window:00:59 與 01:00 之間若客戶各跑 maxCount 次、瞬間實際 2× burst
//   Sliding window:加上「前一窗計數 × 線性比例」近似真實 sliding 速率
//
// 演算法:Cloudflare 公開的 sliding-window approximation(2017 paper、業界標準)
//   - 每窗(60 秒)記錄 count
//   - 收到請求時、計算「前一窗的剩餘權重」+ 當前窗已有 count
//   - 估算速率 = prev * (window_remaining_pct) + current
//
// 對比 Upstash sliding-window-redis(distributed):
//   - 本檔:單區域內準確、跨區不同步(現況一致)
//   - 升級路徑:env 設 UPSTASH_REDIS_REST_URL/TOKEN 後改用 @upstash/ratelimit、跨區同步

interface WindowState {
  prev: number
  current: number
  windowStart: number
}

const stores = new Map<string, Map<string, WindowState>>()
const WINDOW_MS = 60_000

/**
 * 取得 / 建立指定 key prefix 的 store(避免不同 limit 用途互相污染)
 */
function getStore(name: string): Map<string, WindowState> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

/**
 * 滑動窗速率限制(in-memory、單區域)
 *
 * @param storeName 用途名稱(如 'global' / 'free-api' / 'admin')
 * @param key 限制 key(通常是 IP 或 IP:path)
 * @param maxPerWindow 每窗(60 秒)上限
 * @param windowMs 窗大小毫秒(預設 60 秒)
 *
 * @returns
 *   - allowed:是否允許
 *   - remaining:剩餘額度
 *   - resetMs:窗結束的剩餘毫秒
 *   - estimateRate:當前估算速率(sliding rate)
 */
export function slidingWindowLimit(
  storeName: string,
  key: string,
  maxPerWindow: number,
  windowMs = WINDOW_MS,
): {
  allowed: boolean
  remaining: number
  resetMs: number
  estimateRate: number
} {
  const store = getStore(storeName)
  const now = Date.now()
  const state = store.get(key)

  if (!state) {
    // 第一次:建立窗
    store.set(key, { prev: 0, current: 1, windowStart: now })
    return {
      allowed: 1 <= maxPerWindow,
      remaining: maxPerWindow - 1,
      resetMs: windowMs,
      estimateRate: 1,
    }
  }

  // 計算當前窗的進度(0.0 - 1.0)
  const elapsed = now - state.windowStart

  if (elapsed >= 2 * windowMs) {
    // 兩窗都過了:整個重置
    store.set(key, { prev: 0, current: 1, windowStart: now })
    return {
      allowed: 1 <= maxPerWindow,
      remaining: maxPerWindow - 1,
      resetMs: windowMs,
      estimateRate: 1,
    }
  }

  if (elapsed >= windowMs) {
    // 跨入新窗:當前 → prev、重啟 current
    state.prev = state.current
    state.current = 1
    state.windowStart = now - (elapsed - windowMs) // 對齊新窗
    const remainingPct = 1 - (now - state.windowStart) / windowMs
    const estimate = state.prev * remainingPct + state.current
    return {
      allowed: estimate <= maxPerWindow,
      remaining: Math.max(0, maxPerWindow - Math.ceil(estimate)),
      resetMs: windowMs - (now - state.windowStart),
      estimateRate: estimate,
    }
  }

  // 同一窗內
  const currentWindowProgress = elapsed / windowMs
  const prevWindowRemainingPct = 1 - currentWindowProgress
  const estimate = state.prev * prevWindowRemainingPct + state.current

  if (estimate >= maxPerWindow) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: windowMs - elapsed,
      estimateRate: estimate,
    }
  }

  state.current++
  const newEstimate = state.prev * prevWindowRemainingPct + state.current
  return {
    allowed: true,
    remaining: Math.max(0, maxPerWindow - Math.ceil(newEstimate)),
    resetMs: windowMs - elapsed,
    estimateRate: newEstimate,
  }
}

/**
 * 定期清理過期 entry(避免長時間運行 memory leak)
 * 呼叫端應在 ~1% 機率下跑一次(對應現有 middleware pattern)
 */
export function cleanupSlidingWindow(maxAgeMs = 5 * 60_000) {
  const now = Date.now()
  for (const [storeName, store] of stores.entries()) {
    for (const [key, state] of store.entries()) {
      if (now - state.windowStart > maxAgeMs) {
        store.delete(key)
      }
    }
  }
}

/**
 * 觀察用:取得 store 大小(memory diagnostic)
 */
export function getStoreSize(storeName: string): number {
  return stores.get(storeName)?.size || 0
}
