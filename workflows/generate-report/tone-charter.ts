// ============================================================
// 提示詞合集 Prompt 7 — 報告語氣鐵律 v1(心理安全層)
// ============================================================
// 性質:命理 × 心理整合的「安全 + 賦能」語氣層,與 plan-prompts.ts
//       既有 v5.10.351「語氣鐵律」(人設 / 可讀性層)互補、不衝突。
//
// 🔴 為什麼是獨立模組、未 wire 進 PLAN_SYSTEM_PROMPT:
//   1. plan-prompts.ts 是「客戶認可版」P0 鎖檔(anti-hallucination-flipflop
//      + lesson v5.3.49/v5.3.98)。改動 = P0、需 promptfoo 90% gate
//      + L1/L2/L3/L4 四層審查 + 老闆拍板(push 鐵律 #147)。
//   2. 提示詞合集要求「貼 system 開頭」,但本 codebase 慘痛教訓
//      v5.3.98 明證:ETHICS/規則放開頭會「稀釋核心人設定位」、
//      4 方案越做越差,已刻意移到末尾。→ 依鐵律 #3(敢於糾正)
//      正確注入點 = 末尾(與 ${ETHICS_RULES} 同位),非開頭。
//   3. 消費點多處 + `app/api/generate-report/route.ts:320` 有獨立
//      重複 PLAN_SYSTEM_PROMPT(lesson #144 雙渲染器分裂)→ 啟用前
//      須先整併雙定義,否則只 wire 一處 = 假綠。
//
// 啟用 SOP(老闆 / staging 階段):
//   ① 整併 route.ts:320 雙定義 → 單一 source
//   ② getPlanSystemPromptWithCharter() 在末尾 append(flag on)
//   ③ promptfoo 對 fixtures/tone_charter/*.yaml(含 lesson #058/#059)
//      跑 90% gate
//   ④ L1 QA + L2 IA + L3 Codex + L4 Gemini 四層審查 ≥ 95
//   ⑤ 老闆拍板 → push → 7-page verify
//
// flag:FF_TONE_CHARTER_V1(default false、見 lib/feature-flags.ts)

import { isFlagEnabled } from '@/lib/feature-flags'

/**
 * 報告語氣鐵律 v1 — 5 條(提示詞合集 Prompt 7 原文,適配本平台用語)
 *
 * 與既有 v5.10.351 語氣鐵律的關係:
 * - 既有 = 人設 / hook / 白話 80-20 / 先結論後證據(讀感層)
 * - 本 charter = 不下定論 / IFS part 翻譯 / ACT 行動 / 危機轉介(安全 + 賦能層)
 * 兩者疊加、無重複條目。
 */
export const TONE_CHARTER_V1 = `

## 🧭 報告語氣鐵律 v1(心理安全層、與上方人設語氣鐵律疊加、違反任一即重寫）

(1) 禁用「命中註定 / 劫數 / 必 / 絕對 / 無解 / 業力深重」等定論詞;
    改用「傾向 / 在某些情境下 / 此階段較容易」。

(2) 禁貼負面標籤(凶 / 煞 / 破 / 不利);把象徵翻成「內在 part」語言(IFS),
    例:「值符」→「你內在那個負責主導決策的 part」。
    (此條與 ETHICS_RULES 既有「不恐嚇」一致、為其心理學細化)

(3) 每章末必含 ACT 句式:
    「你的 value 是 ___,本週可做的最小行動是 ___。」

(4) 🔴 最高優先:偵測「情緒風險訊號」即**立刻停止所有算命/運勢內容**,
    **唯一輸出 <CRISIS_CARD>**(由前端 render 988/1925/TELL),不得照常回答夾帶的命理問題。
    風險訊號含三類(任一即觸發,即使只是夾在其他問題中一句帶過):
    - 自傷意念:死 / 不想活 / 想消失 / 結束一切 / 活不下去 / 解脫 / 想離開
    - 重度憂鬱:沒有未來 / 沒意義 / 毫無意義 / 所有人沒我會更好 / 沒有人需要我 / 活著好累
    - 急性壓力:撐不下去 / 崩潰邊緣 / 失控 / 想傷害他人 / 不想再忍
    （對應 Prompt 6 crisis_detector 三類詞庫;寧可誤判也不可漏判 — 漏判 = 人命風險）

(5) 出門訣不寫「不出門會出事」;
    改寫「這個時辰你的能量較適合 ___ 類行動」。`

/**
 * 取得含 charter 的 system prompt。
 * flag off(預設)→ 原樣回傳,行為與改造前完全一致(trunk 安全)。
 * flag on → 末尾 append charter(對齊 ETHICS_RULES 末尾慣例 + v5.3.98 教訓)。
 *
 * ⚠️ 啟用前必完成上方「啟用 SOP」①-⑤,否則屬假綠 + 動 P0 認可版未審。
 */
export function applyToneCharter(systemPrompt: string): string {
  if (!isFlagEnabled('FF_TONE_CHARTER_V1')) return systemPrompt
  return `${systemPrompt}\n${TONE_CHARTER_V1}`
}
