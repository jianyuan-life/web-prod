// v5.10.330 (Sprint 5 Gemini #4 — Edge Config 動態 IP blocklist)
// 解 lib/security/ip-blocklist.ts hardcode 痛點:封新 IP 要改 code + commit + deploy
// Edge Config 改一次、邊緣秒級全球同步、不用 deploy
//
// 啟用步驟(Vercel Dashboard):
//   1. https://vercel.com/dashboard/stores 建 Edge Config 名 jianyuan-blocklist
//   2. attach 到 jianyuan-life project(自動注 EDGE_CONFIG env)
//   3. Edge Config items 加:
//      key: "blocked_ips" → value: ["1.2.3.4", "5.6.7.0/24"]
//      key: "allowed_ips" → value: ["3.18.12.63", ...]
//      key: "blocked_countries" → value: ["KP", "IR"](ISO-3166-1 alpha-2)
//
// 不需 npm install:@vercel/edge-config 已安裝
// 沒設 EDGE_CONFIG env → fallback 到 lib/security/ip-blocklist.ts hardcode 清單(零中斷)

import { get } from '@vercel/edge-config'
import { isBlockedIp as fallbackIsBlocked, isAllowedIp as fallbackIsAllowed } from './ip-blocklist'

interface CachedBlocklist {
  blockedIps: Set<string>
  blockedPrefixes: string[]
  allowedIps: Set<string>
  blockedCountries: Set<string>
  fetchedAt: number
}

let cache: CachedBlocklist | null = null
const CACHE_TTL_MS = 60_000 // 1 分鐘 cache、降低 Edge Config 呼叫成本

const EMPTY: CachedBlocklist = {
  blockedIps: new Set(),
  blockedPrefixes: [],
  allowedIps: new Set(),
  blockedCountries: new Set(),
  fetchedAt: 0,
}

/**
 * 從 Edge Config 抓最新 blocklist(有 cache、失敗回 EMPTY)
 *
 * 注意:Edge Config 沒設 env(EDGE_CONFIG)時 get() throw、catch 後 fallback 給呼叫端走 hardcode
 */
async function fetchBlocklist(): Promise<CachedBlocklist> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache
  }

  try {
    const [blocked, allowed, countries] = await Promise.all([
      get<string[]>('blocked_ips').catch(() => null),
      get<string[]>('allowed_ips').catch(() => null),
      get<string[]>('blocked_countries').catch(() => null),
    ])

    const blockedIps = new Set<string>()
    const blockedPrefixes: string[] = []
    if (Array.isArray(blocked)) {
      for (const item of blocked) {
        if (typeof item !== 'string') continue
        if (item.endsWith('.') || item.endsWith('/24') || item.endsWith('/16')) {
          // CIDR 或 prefix 標記、放 prefix 陣列
          blockedPrefixes.push(item.replace(/\/(24|16)$/, '.'))
        } else {
          blockedIps.add(item)
        }
      }
    }

    const allowedIps = new Set<string>()
    if (Array.isArray(allowed)) {
      for (const item of allowed) {
        if (typeof item === 'string') allowedIps.add(item)
      }
    }

    const blockedCountries = new Set<string>()
    if (Array.isArray(countries)) {
      for (const item of countries) {
        if (typeof item === 'string') blockedCountries.add(item.toUpperCase())
      }
    }

    cache = {
      blockedIps,
      blockedPrefixes,
      allowedIps,
      blockedCountries,
      fetchedAt: now,
    }
    return cache
  } catch (err) {
    // Edge Config 連線失敗(env 沒設 / 服務 down)→ 回 EMPTY、上層走 hardcode
    if (!cache) cache = EMPTY
    return EMPTY
  }
}

/**
 * 檢查 IP 是否被 Edge Config 黑名單(若 Edge Config 失敗、自動 fallback hardcode)
 */
export async function isEdgeBlockedIp(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false

  try {
    const list = await fetchBlocklist()
    if (list.blockedIps.has(ip)) return true
    for (const prefix of list.blockedPrefixes) {
      if (ip.startsWith(prefix)) return true
    }
    // Edge Config 沒命中、再查 hardcode
    return fallbackIsBlocked(ip)
  } catch {
    return fallbackIsBlocked(ip)
  }
}

/**
 * 檢查 IP 是否在白名單(Edge Config 加 hardcode 雙保險)
 */
export async function isEdgeAllowedIp(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false

  try {
    const list = await fetchBlocklist()
    if (list.allowedIps.has(ip)) return true
    return fallbackIsAllowed(ip)
  } catch {
    return fallbackIsAllowed(ip)
  }
}

/**
 * 檢查國家是否被封(geo blocking、來自 Vercel x-vercel-ip-country header)
 */
export async function isBlockedCountry(country: string | null | undefined): Promise<boolean> {
  if (!country) return false

  try {
    const list = await fetchBlocklist()
    return list.blockedCountries.has(country.toUpperCase())
  } catch {
    return false
  }
}

/**
 * 強制重置 cache(管理介面更新 Edge Config 後手動觸發)
 */
export function resetBlocklistCache(): void {
  cache = null
}

/**
 * 觀察用:回 cache 狀態(diagnostic / admin endpoint 顯示用)
 */
export function getBlocklistDiagnostic() {
  return {
    cached: cache !== null,
    cacheAge: cache ? Date.now() - cache.fetchedAt : null,
    blockedIps: cache?.blockedIps.size || 0,
    blockedPrefixes: cache?.blockedPrefixes.length || 0,
    allowedIps: cache?.allowedIps.size || 0,
    blockedCountries: cache?.blockedCountries.size || 0,
    edgeConfigEnabled: Boolean(process.env.EDGE_CONFIG),
  }
}
