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
