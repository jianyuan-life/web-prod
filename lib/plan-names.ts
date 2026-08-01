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

// v5.10.467:方案可見性 SSOT(2026-08-01 老闆拍板:對外只售 C / G15 / E3,其餘隱藏)
// - 「隱藏」= 不接受新購、UI 不呈現;code / 名稱 / 價格 / prompt 全保留,既有客戶
//   的報告 / PDF / dashboard / email 走 paid_reports 既有資料,完全不受影響
// - 本 env 控制的是「購買閘」(/api/checkout + useCheckoutForm);NEXT_PUBLIC_* 是
//   build-time 內嵌,改 env 後必須 redeploy 才生效(Vercel env 變更本來就需 redeploy)
// - ⚠️ 誠實聲明(Codex L3 2026-08-01):銷售 UI(定價頁 / 首頁卡 / OG 圖)是圍繞三方案
//   重設計、非 filter 舊卡;要恢復販售隱藏方案,除了 env 還需要回復該方案的 UI 呈現
//   (git 歷史有完整舊卡資料)。env 單獨改只會重新開放 API 與結帳表單。
// - 緊急全關:env 設 'NONE' 可停止所有方案新購(fail-closed 語意)
// - 全站 UI 與 /api/checkout 一律由 isVisiblePlan() 判斷,不得 inline 寫死方案清單(anti-drift)
const _rawVisiblePlans = process.env.NEXT_PUBLIC_VISIBLE_PLAN_CODES || 'C,G15,E3'
// v5.10.468:大小寫正規化(小寫 env 值原本會被交集 filter 全數丟棄 → 全站無聲停售)
const _parsedVisible: string[] =
  _rawVisiblePlans.trim().toUpperCase() === 'NONE'
    ? []
    : [...new Set(
        _rawVisiblePlans.split(',').map(s => s.trim().toUpperCase()).filter(c => ALL_PLAN_CODES.includes(c)),
      )]
// 非法代碼靜默丟棄太危險(單一錯字=該方案無聲下架):丟棄時留 warn 供排查
const _droppedVisible = _rawVisiblePlans.trim().toUpperCase() === 'NONE' ? [] :
  _rawVisiblePlans.split(',').map(s => s.trim()).filter(Boolean)
    .filter(c => !ALL_PLAN_CODES.includes(c.toUpperCase()))
if (_droppedVisible.length > 0) {
  console.warn(`[plan-visibility] env 含非法方案代碼已丟棄:${_droppedVisible.join(',')};生效清單:${_parsedVisible.join(',') || '(空=全站停售)'}`)
}
export const VISIBLE_PLAN_CODES: readonly string[] = _parsedVisible
export const isVisiblePlan = (code: string | undefined | null): boolean =>
  !!code && VISIBLE_PLAN_CODES.includes(code)

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
