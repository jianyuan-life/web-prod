import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Bug #29：瀏覽器端用 globalThis singleton，確保 HMR / 多次 import 不會建立多個 GoTrueClient 實例
//   ( "Multiple GoTrueClient instances detected" + "Lock was released because another request stole it" )
//   server 端每次 request 獨立，不需要 singleton。
type GlobalWithSupabase = typeof globalThis & {
  __jianyuanSupabase?: SupabaseClient
}

function getBrowserClient(): SupabaseClient {
  const g = globalThis as GlobalWithSupabase
  if (!g.__jianyuanSupabase) {
    g.__jianyuanSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-jianyuan-auth',
      },
    })
  }
  return g.__jianyuanSupabase
}

// 瀏覽器端 singleton；server 端每次調用獨立（不會有多實例警告問題）
//
// v5.10.482 P0 修:本模組被拉進 Vercel Workflow 的 orchestrator sandbox bundle;
// supabase-js 2.105 建構時初始化 RealtimeClient、sandbox 無 WebSocket → 模組載入即
// throw「Unknown JavaScript runtime without WebSocket support」、整條 generate-report
// workflow 起跑即崩(2026-08-15 production 實測 wrun_01M02J7RX2JFRTDJH7M81JEMZM)。
// 修法:頂層「先試建、失敗退為 lazy Proxy」— Node/瀏覽器路徑先試建成功、行為與原版
// 完全一致(同一個 eager client、非 Proxy);只有 sandbox 這類建構會炸的環境改走
// lazy Proxy、模組載入不再有副作用;若 sandbox 內真的有程式去「使用」client、
// 會在使用點拋錯(fail closed)、而不是在載入點炸掉整個 workflow。
function buildDefaultClient(): SupabaseClient {
  return typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : getBrowserClient()
}

let _defaultClient: SupabaseClient | null = null
try {
  _defaultClient = buildDefaultClient()
} catch {
  // Workflow sandbox 等無 WebSocket 環境:延後到首次使用再建
  _defaultClient = null
}

// fallback Proxy 只在 sandbox 類環境生效。兩個硬性設計:
// 1. 只有白名單的真實 API 屬性才觸發建構 — runtime 對 export 的探測
//    (await 的 then 檢查、symbol probe、序列化)一律回 undefined、零副作用。
//    production 實測教訓:任意屬性存取即建構、會被 sandbox 的探測誤觸、
//    GoTrueClient autoRefresh 的 setInterval 直接炸 workflow
//    (wrun_01M02JPDVH38HG1NNWYB1ABMP9)。
// 2. 真的要用時、以關閉 autoRefresh/persist/detectSessionInUrl 的設定建構 —
//    sandbox 內沒有互動 session、也絕不允許建構期偷跑 setInterval。
const SUPABASE_REAL_PROPS = new Set([
  'auth', 'from', 'rpc', 'schema', 'storage', 'functions',
  'realtime', 'channel', 'getChannels', 'removeChannel', 'removeAllChannels',
])

function buildSandboxClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export const supabase: SupabaseClient =
  _defaultClient ??
  (new Proxy({} as SupabaseClient, {
    get(_target, prop, _receiver) {
      if (typeof prop !== 'string' || !SUPABASE_REAL_PROPS.has(prop)) return undefined
      if (!_defaultClient) _defaultClient = buildSandboxClient()
      const client = _defaultClient as unknown as Record<string, unknown>
      const value = client[prop]
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(_defaultClient)
        : value
    },
    has(_target, prop) {
      // 不建構、只回答;探測不得有副作用
      return typeof prop === 'string' && SUPABASE_REAL_PROPS.has(prop)
    },
  }) as SupabaseClient)

// 伺服器端用 service role
// T7 v5.10.359 (Master Plan Sprint 7、L2 IA P0 #14 修):
// 加 module-level singleton cache、warm container 跨 request 共用同 client、避免 SSL handshake 重複開銷
// 100 並發用戶在同 warm container 共用 1 個 connection pool、解 stability sub-agent 抓的 P0
//
// 限制(預期):
// - Vercel serverless cold start 每次仍 new(每 region 第一個 request)、warm 跨 request 共用
// - module-level cache 在 Edge runtime 邏輯上同(global scope per worker)
// - 84 個既有 callers 直接呼叫 createClient(...)、未走 helper、屬 lesson #146 partial wire
// - T7b(Sprint 8)會做 84 個 callers full migration + ESLint rule 禁 raw createClient
let _cachedServiceClient: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (_cachedServiceClient) return _cachedServiceClient
  _cachedServiceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
      auth: {
        // server-side singleton 不需 persist / refresh、明確關掉
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
  return _cachedServiceClient
}

/** T7 v5.10.359:給測試 / hot-reload 場景重置 cache */
export function _resetServiceClientCacheForTest(): void {
  _cachedServiceClient = null
}
