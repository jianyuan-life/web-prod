// Feature Flag 系統 — 鑑源 web
// 2026-04-26 | 網頁製作部門
//
// 設計原則(對齊 PDF《Claude Code 業界共識自動化工作流 SOP》v1.0 Section 4):
// 1. REGISTRY 模式:任何啟用的 flag 必須註冊、防 drift
// 2. 環境變數慣例:FF_<DOMAIN>_<NAME>(全大寫、底線分隔)
// 3. 預設 false:trunk 永遠安全(merge main 不破壞 prod)
// 4. 短壽命:每個 flag 標 retireBy(預期清理日期、業界 Unleash/LaunchDarkly 共識)
// 5. 所有 owner 必填:出問題知道找誰
//
// 跟 lib/ab-test.ts 區別:
// - ab-test:流量分流到 variant、看效果(實驗用、weight 配置)
// - feature-flags:單純開關(true/false、緊急 kill switch、未驗收功能藏起來)
//
// 用法:
//   import { isFlagEnabled } from '@/lib/feature-flags'
//   if (isFlagEnabled('FF_PROMPT_OPUS47_CACHE')) { ... }

interface FlagDef {
  default: boolean      // 預設值(env var 沒設時用)
  owner: string         // 負責人(出問題找誰)
  retireBy: string      // 預期清理時間(YYYY-Q? 或 YYYY-MM-DD)
  description: string   // 一句話說明 flag 用途
  scope?: 'server' | 'client' | 'both'  // 預設 both
}

// REGISTRY:所有 flag 必須在這裡註冊、未註冊的 flag 視為不存在
// 新增 flag 流程:
//   1. 在 REGISTRY 加 entry(default: false、retireBy 必填)
//   2. 在 .env.local 加 FF_XXX=true 開測試
//   3. 驗收完成 → 開 prod env(.env.production)
//   4. 完全穩定 → 移除 flag(把 if (isFlagEnabled(...)) 包的 code 變預設)
const REGISTRY: Record<string, FlagDef> = {
  // 範例:之後實際加新 flag 時放這裡
  FF_EXAMPLE_NEW_FEATURE: {
    default: false,
    owner: 'jamie',
    retireBy: '2026-Q3',
    description: '範例 flag、實際使用時刪除這條',
    scope: 'both',
  },

  // ── 提示詞合集 Prompt 1:Anthropic Prompt Caching ──
  // 付費報告 claudeStreamingCall 把 system prompt(角色+語氣鐵律+知識庫、
  // 數萬 token 靜態前綴)標 cache_control: ephemeral,
  // 同方案/同 call 客戶 5 分鐘內命中 → input token 計費降至 0.1x,
  // 同 call 重試(lesson #058 燒 $21 路徑)100% 命中。
  // 用戶排盤 JSON 在 user message、不 cache(個人化)。
  // 預設 false(trunk 安全)。staging 驗 cache hit + 品質不變後開 prod。
  FF_AI_PROMPT_CACHE: {
    default: false,
    owner: 'jamie',
    retireBy: '2026-Q4',
    description: '付費報告 Claude system prompt prompt-caching(token 成本 ↓ 70-90%)',
    scope: 'server',
  },
} as const

export type FlagName = keyof typeof REGISTRY

/**
 * 判斷 flag 是否啟用
 * 優先序:env var > REGISTRY default
 *
 * @example
 *   if (isFlagEnabled('FF_NEW_PROMPT_C_PLAN')) {
 *     return newPromptC()
 *   }
 *   return oldPromptC()
 */
export function isFlagEnabled(name: FlagName): boolean {
  const def = REGISTRY[name]
  if (!def) {
    // 防呆:呼叫了未註冊的 flag、log 警告但回 false(安全)
    if (typeof console !== 'undefined') {
      console.warn(`[feature-flags] Flag "${name}" not in REGISTRY. Returning false.`)
    }
    return false
  }

  // env var 優先(允許 prod / staging / dev 不同設定)
  const envValue = typeof process !== 'undefined' ? process.env[name] : undefined
  if (envValue !== undefined) {
    return ['true', '1', 'yes', 'on'].includes(envValue.toLowerCase().trim())
  }

  return def.default
}

/**
 * 列出所有已註冊 flag(管理用、debug 用)
 * /jamie 後台可加頁面顯示
 */
export function listAllFlags(): Array<{ name: string; def: FlagDef; current: boolean }> {
  return Object.entries(REGISTRY).map(([name, def]) => ({
    name,
    def,
    current: isFlagEnabled(name as FlagName),
  }))
}

/**
 * 找已過期該清理的 flag
 * 跑 cron / dev 時 console.warn 提醒
 */
export function findExpiredFlags(today: Date = new Date()): string[] {
  const expired: string[] = []
  for (const [name, def] of Object.entries(REGISTRY)) {
    const retire = parseRetireBy(def.retireBy)
    if (retire && retire < today) {
      expired.push(name)
    }
  }
  return expired
}

function parseRetireBy(retireBy: string): Date | null {
  // 支援 "2026-Q3" / "2026-04-26" / "2026-04"
  if (/^\d{4}-Q[1-4]$/.test(retireBy)) {
    const [year, q] = retireBy.split('-Q')
    const month = (parseInt(q) - 1) * 3 + 2  // Q1→2 (Mar末)、Q2→5、Q3→8、Q4→11
    return new Date(parseInt(year), month, 31)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(retireBy)) {
    return new Date(retireBy)
  }
  if (/^\d{4}-\d{2}$/.test(retireBy)) {
    return new Date(retireBy + '-28')
  }
  return null
}

/**
 * 開發 / staging 環境啟動時跑一次:報告過期 flag
 * 加進 next.config / instrumentation.ts 即可
 */
export function warnExpiredFlagsAtStartup(): void {
  if (process.env.NODE_ENV === 'production') return
  const expired = findExpiredFlags()
  if (expired.length > 0) {
    console.warn(
      `[feature-flags] ⚠️  ${expired.length} flag 已過 retireBy:\n` +
        expired.map((n) => `  - ${n} (owner: ${REGISTRY[n].owner})`).join('\n') +
        `\n清理方式:把 if (isFlagEnabled('${expired[0]}')) 包的 code 變預設、然後從 REGISTRY 移除。`
    )
  }
}
