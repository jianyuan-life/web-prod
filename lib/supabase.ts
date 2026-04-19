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
export const supabase: SupabaseClient =
  typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : getBrowserClient()

// 伺服器端用 service role
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}
