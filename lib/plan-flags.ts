// ════════════════════════════════════════════════════════════
// 四方案 v4 漸進式報告 Feature Flag — 單一 SSOT 讀法
// ════════════════════════════════════════════════════════════
// 建立：2026-06-13（LOGIC_AUDIT_2026-06-13.md P1 #1/#2 收斂）
//
// 背景：USE_PLAN_V4_* flag 原本散落三套讀法：
//   - 生成端（plan-prompts.ts getter）：`!== 'false'`（default ON）
//   - quality gate（steps.ts 多處）：`=== 'true'`（default OFF）
//   - C 生成（steps.ts module-const）：`=== 'true'` + 靠 `??= 'true'` 跨模組補
// 三套寫法在 env unset 時語意分歧 → v4 報告被 v2 gate 判 hardFail + 假 Telegram 告警。
//
// 修：全站統一走本檔 `isV4(plan)`，語意鎖死「default ON、Vercel env 設 'false' 即 kill switch」。
//   生成端與 gate 端都 import 同一個函式 → 不可能再 drift。
//
// 為什麼是 access-time（function 而非 const）：
//   workflow durable runtime 的 env / module 求值時序與 regular route 不同
//   （v5.10.434 / .441 已實證 module-load-time 凍結值會用到舊狀態）。
//   本檔每次「呼叫時」才讀 process.env，繞開 module-load 時序陷阱。
//
// kill switch：Vercel dashboard 設 `USE_PLAN_V4_C='false'`（或 D/G15/R）即回退該方案 v2。
//   四方案各自獨立。現有舊報告不受影響（只影響新生成）。
// ════════════════════════════════════════════════════════════

export type V4Plan = 'C' | 'D' | 'G15' | 'R'

/**
 * 該方案是否走 v4 漸進式報告（L1/L2/L3、起承轉合、解審閱疲勞）。
 *
 * 語意：**預設啟用（default ON）**。只有 Vercel env 明確設成字串 'false' 才關閉。
 * env 未設（undefined）/ 設成其他值 → 一律視為啟用。
 *
 * 生成端（prompt 選擇）與 gate 端（quality gate 門檻）必須都呼叫本函式，
 * 確保「產什麼版本」與「用什麼門檻驗」永遠同步。
 */
export function isV4(plan: V4Plan): boolean {
  return process.env[`USE_PLAN_V4_${plan}`] !== 'false'
}
