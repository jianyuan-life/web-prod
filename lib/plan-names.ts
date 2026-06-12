// v5.7.10:集中管理所有方案命名(對應 IA round 5 P0:19 處 PLAN_NAMES dict 散落 + 大半缺 E3/E4)
// 日後加方案或改名只改此檔、不再 sed 全 repo

export const PLAN_NAMES: Record<string, string> = {
  C: '人生藍圖',
  D: '心之所惑',
  G15: '家族藍圖',
  R: '合否？',
  E1: '事件擇吉',
  E2: '月度單盤',
  E3: '月度精選',
  E4: '年度全運',
}

// 方案代碼 → 中文名(含 fallback 到代碼本身)
export function getPlanName(code: string | undefined | null): string {
  if (!code) return ''
  return PLAN_NAMES[code] || code
}

// 出門訣方案代碼集合
export const CHUMENJI_CODES: Set<string> = new Set(['E1', 'E2', 'E3', 'E4'])
export const isChumenjiPlan = (code: string | undefined | null): boolean =>
  code ? CHUMENJI_CODES.has(code) : false

// 方案代碼列表(對應 8 方案)
export const ALL_PLAN_CODES: readonly string[] = ['C', 'D', 'G15', 'R', 'E1', 'E2', 'E3', 'E4']

// v5.10.x:結帳定價集中管理(SSOT、對應 CLAUDE.md「方案常數絕不在 production code inline 定義」鐵律)
// - 原本散落在 app/api/checkout/route.ts inline PRICE_MAP、移到此處唯一定義
// - 加方案 / 改價只動此檔一處、不再 inline
//
// 定價(美分、Stripe unit_amount 直接用、與 currency=usd 對齊):
export const PLAN_PRICES: Record<string, number> = {
  C: 8900,
  D: 3900,
  G15: 5900,
  R: 5900,
  // E 系列四方案(對應 pricing page 和 checkout types)
  E1: 5900,   // v5.7.6 命名統一(原「事件出門訣」)
  E2: 2900,   // v5.7.6 命名統一(原「月度出門訣」)
  E3: 8900,   // v5.7.6 命名統一(原「週度補運」、實為當月 8 吉時)
  E4: 27900,  // v5.7.6 命名統一(原「年度方案」)
  'R-ADD': 1900,  // 加人附加費(R 第 3 人起每人 +$19、G15 已改固定 $59 不再加價)
}

// R-ADD 是加人附加費、非獨立方案、故意不進 PLAN_NAMES;此處給它 Stripe line item 顯示名
const ADDON_NAMES: Record<string, string> = {
  'R-ADD': '合否？加1人',
}

// 結帳用 { amount(美分) + name(Stripe line item 顯示名) }
// name 一律從 PLAN_NAMES 取(anti-drift:改方案名只動 PLAN_NAMES 一處、PRICE_MAP 自動同步)、
// 僅 R-ADD 等 addon 用 ADDON_NAMES。
export const PRICE_MAP: Record<string, { amount: number; name: string }> = Object.fromEntries(
  Object.entries(PLAN_PRICES).map(([code, amount]) => [
    code,
    { amount, name: PLAN_NAMES[code] || ADDON_NAMES[code] || code },
  ]),
)
