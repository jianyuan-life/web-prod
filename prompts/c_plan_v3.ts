// ============================================================
// C 方案（人生藍圖 $89）— Prompt v3.0（v5.3.45 全面重構）
// ============================================================
// 核心產品目標（老闆明確指令）：
//   讓客戶看到會感動、會哭、有自我認知跟體悟
//   一針見血、貼合客戶真實感受、詳細了解客戶心理
//   起就已經白話文解釋完命格所有的邏輯
//   承、轉、合要有邏輯性跟故事性的連貫下去
//
// 架構升級（vs v6.0）：
//   Call 0（新增）：結構化 BLUEPRINT JSON（~3K tokens、$0.06）
//     核心主題 + Aha 點 + 情緒弧線 + Callback keywords
//     後續 Call 1/2 依此藍圖填肉 → 不再自由發揮失控
//
//   Call 1（起）：18K+ 字 — 命格總覽 + 15 系統融合白話 + 命格總論
//     情緒：認同（讓讀者「這說的就是我」）
//     核心指令：起就把命格講透，不滴灌
//
//   Call 2（承+轉+合合併）：28K+ 字 — 議題解析 + 流年 + 刻意練習 + 信
//     情緒：揭露 → 震撼 → 希望（Cinderella 弧線）
//     核心指令：承轉合有故事性邏輯性連貫，每章扣起篇
//
// 感動到哭 Playbook（注入 system prompt）：
//   15 個一針見血句型、10 個 Aha 公式、7 個流淚段落結構
//
// v6.0 5 個 bug 防範：
//   #1 ## 主章節缺失 → FORMAT_BIBLE 硬強制
//   #2 Tier 3 五系統被砍 → 明確要求每系統 ≥20 次提及
//   #3 刻意練習漏寫 → Call 2 硬強制「刻意練習」四字
//   #4 寫給 XX 變體 → 支援「給 XX 的一封信」+「寫給你的話」
//   #5 性別錯亂 → IDENTITY_LOCK 置頂
// ============================================================

import {
  type AgeSegment,
  getAgeSegment,
  getAgeGroup,
  buildUserPrompt,
  extractCall1Summary,
  extractCall1And2Summary,
  buildAppendix,
  SYSTEM_GROUPS,
} from './c_plan_v2'

// re-export 給 steps.ts 使用
export {
  getAgeSegment,
  getAgeGroup,
  buildUserPrompt,
  extractCall1Summary,
  extractCall1And2Summary,
  buildAppendix,
  SYSTEM_GROUPS,
}
export type { AgeSegment }

// ============================================================
// BLUEPRINT JSON 型別
// ============================================================

export interface CrossValidationItem {
  system: string
  evidence: string
}

export interface CoreTheme {
  theme: string
  resonance: CrossValidationItem[]
  one_liner: string
}

export interface AhaMoment {
  setup: string      // 「你以為...」
  reveal: string     // 「其實...」
  liberation: string // 「所以你可以...」
  emotion_tag: 'relief' | 'sorrow' | 'validation' | 'empowerment'
}

export interface EmotionArcPoint {
  section: string
  target_emotion: string
  intensity: 1 | 2 | 3 | 4 | 5
}

export interface BlueprintJSON {
  client_id: string
  identity_label: string  // 「XX 型的 XX」身份稱號，全篇回收 3 次以上
  core_themes: CoreTheme[]
  aha_moments: AhaMoment[]
  emotion_arc: EmotionArcPoint[]
  callback_keywords: string[]  // 5 個關鍵詞，承/轉/合各回收
  year_focus: {
    next_12_months: string
    turning_points: string[]
  }
  closing_letter_theme: string
}

export const BLUEPRINT_SCHEMA_DESC = `{
  "client_id": "string（客戶姓名）",
  "identity_label": "string（「XX 型的 XX」命格身份稱號，例：「深夜謀略者 — 庚金日主 × 天機化權」）",
  "core_themes": [
    {
      "theme": "string（核心主題一句話）",
      "resonance": [{ "system": "string", "evidence": "string（具體排盤證據）" }],
      "one_liner": "string（一針見血句，「你是不是常常...」）"
    }
  ],
  "aha_moments": [
    { "setup": "你以為...", "reveal": "其實...", "liberation": "所以你可以...", "emotion_tag": "relief|sorrow|validation|empowerment" }
  ],
  "emotion_arc": [
    { "section": "起/承/轉/合 + 章節名", "target_emotion": "認同|揭露|震撼|希望", "intensity": 1-5 }
  ],
  "callback_keywords": ["5 個關鍵詞，承/轉/合各回收至少 1 次"],
  "year_focus": {
    "next_12_months": "string（未來 12 個月核心主題）",
    "turning_points": ["string（關鍵時點）"]
  },
  "closing_letter_theme": "string（給 XX 的一封信的情感基調）"
}`

export function validateBlueprint(obj: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['不是 object'] }
  const b = obj as Record<string, unknown>
  if (typeof b.client_id !== 'string' || !b.client_id) errors.push('client_id 必須非空')
  if (typeof b.identity_label !== 'string' || !b.identity_label) errors.push('identity_label 必須非空')
  if (!Array.isArray(b.core_themes) || b.core_themes.length < 2 || b.core_themes.length > 5)
    errors.push('core_themes 必須 2-5 個')
  if (!Array.isArray(b.aha_moments) || b.aha_moments.length < 2)
    errors.push('aha_moments 至少 2 個')
  if (!Array.isArray(b.emotion_arc) || b.emotion_arc.length < 4)
    errors.push('emotion_arc 至少 4 個節點（起承轉合）')
  if (!Array.isArray(b.callback_keywords) || b.callback_keywords.length < 3)
    errors.push('callback_keywords 至少 3 個')
  if (!b.year_focus || typeof b.year_focus !== 'object') errors.push('year_focus 缺失')
  if (typeof b.closing_letter_theme !== 'string') errors.push('closing_letter_theme 必須字串')
  return { ok: errors.length === 0, errors }
}

// ============================================================
// 倫理鐵律（繼承 v2 ETHICS_RULES 精神，精簡版）
// ============================================================

const ETHICS_RULES_V3 = `【🚨 倫理鐵律（最高優先級，違反視為不合格）】
1. 禁絕對預測：改「較高機率/可能以X形式呈現/傾向」取代「會/必定/保證」
2. 禁心理診斷觸發語：禁「不是抑鬱/焦慮是靈性覺醒」；涉心理症狀必附「建議尋求專業」
3. 危機轉介必寫（合章最末）：台灣 1925/1995/1980、香港 2896-0000、中國大陸 010-82951332
4. 免責聲明：事業理財「不構成商業/投資建議」、健康「不取代醫療診斷」、感情「不保證特定結果」
5. 禁宗教特定術語：用「代際模式/人生課題/週期性挑戰」取代「業力/輪迴/冤親債主」`

// ============================================================
// 身份鐵律（性別/姓名置頂，修 v6.0 bug #5 性別錯亂）
// ============================================================

function buildIdentityLock(name: string, gender: string): string {
  const genderCN = gender === 'male' || gender === 'M' ? '男' : gender === 'female' || gender === 'F' ? '女' : '未指定'
  const forbidden = genderCN === '男' ? `${name}小姐、女命、女士、她` : genderCN === '女' ? `${name}先生、男命、先生、他` : ''
  return `
═══════════════════════════════════════════════════════════
【🔴 身份鐵律｜最高優先級，違反全篇作廢重寫】
客戶姓名：${name}
客戶性別：${genderCN}命
絕對禁止：${forbidden || '性別混淆'}
通篇用正確性別，不確定時用「${name}」本名取代代詞。
═══════════════════════════════════════════════════════════
`.trim()
}

// ============================================================
// 感動到哭 Playbook — 15 個一針見血句型
// ============================================================

const SHARP_INSIGHT_TEMPLATES = `【感動到哭 Playbook｜15 個一針見血句型（few-shot 範例）】

每 1200 字至少用 1 個類似結構的金句（獨立成段、12-45 字、含排盤錨點、可被截圖）。

1. 你以為你 X，其實你 Y——只是沒人告訴過你
   範例：你以為你「想太多」是缺點，其實那是你童年為了生存演化出的偵測雷達——只是沒人告訴過你，它現在可以關掉了。

2. 你最 X 的不是 A，是 A 結束後 B
   範例：你最累的不是工作本身，是下班回家後腦中還在重播三次會議。

3. 你一直在 X，卻從沒人問過你 Y
   範例：你一直在照顧所有人，卻從沒人問過你累不累。

4. 你的 X 不是問題，你對 X 的看法才是
   範例：你的敏感不是問題，是你一直以為敏感是弱點。

5. 別人看到的是你 X，但你知道那是 Y
   範例：別人看到你的穩重，但你知道那是你十歲就學會的偽裝。

6. 這不是你的錯，是你從小 X
   範例：這不是你的錯，是你從小被教導「男孩不能哭」。

7. 你以為你在 X，其實你在 Y
   範例：你以為你在追求成功，其實你在尋找一句「爸，你做得很好」。

8. X 的你，和 Y 的你，其實是同一個人
   範例：工作時強勢的你，和深夜裡脆弱的你，其實都在保護那個 7 歲的你。

9. 你不是不 X，是 X 得沒被看見
   範例：你不是不努力，是你的努力從來沒被正確的人看見。

10. 當 X 發生時，你會 Y——這就是你
    範例：當有人真心誇你，你第一反應是懷疑——這就是你。

11. 你害怕的不是 X，是 Y
    範例：你害怕的不是失敗，是失敗後沒人陪你。

12. 你以為 X 已經過去了，但它還在 Y
    範例：你以為童年已經過去，但它還住在你每次猶豫的那 0.3 秒裡。

13. 從今天起，你可以不用再 X 了
    範例：從今天起，你可以不用再證明自己值得被愛了。

14. 這輩子你都在 X，直到某一天你會發現 Y
    範例：這輩子你都在找一個像爸爸的人，直到某天你會發現自己早已成為那個人。

15. 命盤最嚴厲的一句話，我還是要告訴你：X
    用於警示段——警示後必給對策，不給懸空恐懼。

【使用規則】
- 不要照抄文字，要把客戶自己的排盤數據填進公式
- 金句後必須跟「具體排盤證據」（八字/紫微/人類圖的具體元素）
- 整份報告累計 12-18 個金句（截圖分享素材）
- 選最契合客戶的 8-10 個，不要 15 個全用`

// ============================================================
// 感動到哭 Playbook — 10 個 Aha moment 公式
// ============================================================

const AHA_MOMENT_FORMULAS = `【感動到哭 Playbook｜10 個 Aha moment 公式】

Aha 黃金公式：【讀者以為 X】→【命盤揭露 Y】→【所以你可以 Z】
Y 必須是讀者從來沒這樣想過的角度。

1. 原來 X 是 Y（重新框架過去）
2. X 看似 A，其實是 B（矛盾解除）
3. 如果 X 是真的，那 Y 代表 Z（連接遠距線索）
4. 你一直以為是 A 的問題，其實是 B（歸因轉移）
5. X 和 Y 是同一件事（遠距聯想）
6. 真正的 X 不是 A，是 B（重新定義）
7. 你做 X 的時候，其實在 Y（動機揭露）
8. 從 X 的角度看，Y 就變成 Z（視角切換）
9. 這不是你的錯，是你從小 X（歸因到童年）
10. 你以為你在選 X，其實你早就選了 Y（選擇揭露）

【分佈規則】
- 整份報告至少 2-3 個 Aha，散在承/轉不同章節
- 建立在「讀者真的有這個誤解」的基礎，不能捏造
- 揭露必須有排盤證據
- 「所以你可以」必須具體可行，不能空話
- Aha 後給讀者喘息段落（500-800 字溫柔消化），不要連續炸`

// ============================================================
// 感動到哭 Playbook — 7 個流淚段落結構（段落級）
// ============================================================

const TEAR_JERKING_STRUCTURES = `【感動到哭 Playbook｜7 個流淚段落結構】

每份報告安排 3-4 個，分佈在起末/承中/轉中/合篇。每段 300-500 字。

1. 童年場景還原法
   段1 具體童年場景（從印星/紫微父母宮推論）
   段2 那場景裡「學會了什麼扭曲信念」
   段3 連結到現在「所以你到現在還會...」
   段4 救贖「但你值得知道：那不是你的錯」

2. 未說出口的話還原法
   「有一句話你到現在還沒對 X 說過」→ 用命盤指出那句話 → 解釋為何沒說 → 給許可

3. 平行時空對照法
   「如果你當時 X，現在會是什麼樣」→ 那條路沒走不是膽小，是命盤的保護

4. 被看見的瞬間
   「你是不是有一次 XX」（私密瞬間）→「那不是脆弱，是 X 覺醒」→ 用命盤解釋 →「我寫這份報告就是要告訴你：那一刻是最真實的你」

5. 給過去自己的信（用於合章）
   「如果你可以回到 X 歲的那天，我想請你告訴那個你：Y」→ Y 的具體內容
   →「這封信不是寫給過去的，是寫給現在的」→「因為你裡面還住著那個 X 歲的孩子，他一直在等這句話」

6. 代際和解法
   描述父母命盤缺陷 →「你爸/媽不是不愛你，是他從來沒被教過怎麼愛」→「你有他們沒有的 X，這是突破點」→「你可以選擇不原諒，也可以選擇和解——但請不要再怪自己」

7. 未來自己的承諾（用於結尾）
   「10 年後的 2036 年，你會變成什麼樣的人」→ 從大運+流年推論未來的你 →「那個 2036 年的你，很想感謝現在的你做了 X 這個決定」

【使用規則】
- 不超過 4 個（情緒疲勞臨界）
- 必有客觀命盤證據，不能純感性
- 結尾「救贖句」必溫柔，不說教
- 段落間隔 ≥ 2000 字
- 「給 XX 的一封信」必用結構 5 或 6`

// ============================================================
// 情緒弧線規範（Cinderella）
// ============================================================

const EMOTION_ARC_SPEC = `【情緒弧線硬強制｜Cinderella 模型】

起（Call 1）：認同（強度 2→4 平穩上升）
  讀者讀到「對對對這就是我」
  前 500 字必須擊中：用結構 1（童年場景）或模板 1（你是不是常常）開頭

承（Call 2 前段）：揭露（強度 3→5→3 高峰後回落）
  讀者倒吸一口氣「原來如此...」
  1-2 個 Aha moment、1 個流淚段落
  高峰後給 500-800 字消化段

轉（Call 2 中段）：震撼（強度 4→5→4 第二高峰）
  讀者眼睛一亮「還有救！」
  時間軸 + 2027 年窗口明確 + 模板 15 嚴厲警示（但警示必附對策）

合（Call 2 尾段）：希望（強度 4→5→3 溫柔落下）
  讀者闔上報告「我知道怎麼做了」
  刻意練習六步驟 + 給 XX 的一封信（結構 5 或 6）
  最後一句給力量不給任務

【違規檢測】
❌ 整份報告都在強度 5（疲勞）
❌ 整份報告都在強度 2（無記憶）
❌ 連續 3000 字沒金句（節奏斷）
❌ 結尾情緒比開始更低（闔上報告難過）
❌ 沒有任一段讓讀者暫停（無共鳴點）`

// ============================================================
// 格式聖經
// ============================================================

const FORMAT_BIBLE = `【格式聖經｜硬性強制】

1. 主章節：一律 ## 開頭（## 一、XX）。違反會被目錄 parser 無法識別
2. 子節：一律 ### 開頭（### ✅ 好的地方）
3. 禁用 H1（# XXX）、禁用 Markdown 表格（|---|）、禁用 --- 分隔線

4. SCQA 四元結構（每個核心論述段）：
   Situation（情境）：具體生活場景
   Complication（衝突）：內在張力
   Question（提問）：讀者心聲「你或許會問...」
   Answer（解答）：命盤回答 + 出路

5. Callback keywords 規則（來自 BLUEPRINT）：
   每個關鍵詞在承/轉/合各回收 ≥ 1 次
   回扣語：「還記得前面提到...」「這就呼應了你的...」

6. 段落長度：80-120 字/段（手機閱讀友善）
   禁 >200 字大段、禁 <20 字破碎段

7. 金句密度：每 1200 字 ≥ 1 個「可截圖金句」
   特徵：獨立成段、12-45 字、含排盤錨點、能獨立讀懂

8. 古文+白話：引用典籍後必用「白話說就是...」翻譯

9. 排盤錨點：每個論述段 ≥ 1 個具體命盤元素（如「八字丙火日主」「紫微太陽化忌」）

10. 「你」開頭的句子：每 1500 字至少 1 次（連結感）

11. identity_label（命格稱號）回收：全篇 ≥ 3 次`

// ============================================================
// 年齡段寫作引導（簡化版）
// ============================================================

const AGE_SEGMENT_INSTRUCTIONS_V3: Record<AgeSegment, string> = {
  seg_0_10: `【0-10 歲｜父母教養指南】
閱讀者：父母｜稱「您的孩子」/「寶寶」
議題優先：健康體質/天賦潛能/教養方式/親子關係/學業啟蒙
禁寫：戀愛、桃花、投資、職場、婚姻
流淚段落：用結構 6（代際和解，針對父母命盤）`,

  seg_10_20: `【10-20 歲｜找自己】
閱讀者：父母+本人｜本人用「你」如懂你的學長姐
議題優先：學業選系/同儕社交/叛逆獨立/自我認同/初戀
禁寫：投資、婚姻、創業
流淚段落：用結構 4（被看見的瞬間，青春期孤獨）`,

  seg_20_30: `【20-30 歲｜立業期】
閱讀者：本人｜用「你」
議題優先：事業方向/感情婚姻/財務/人生方向/原生家庭
情緒：29 歲土星回歸的震撼 + 親密孤獨拉扯
流淚段落：用結構 3（平行時空，你當時沒走那條路是對的）`,

  seg_30_40: `【30-40 歲｜穩定期】
閱讀者：本人｜用「你」
議題優先：事業晉升創業/婚姻經營/財富累積/生育/合夥
情緒：穩定期隱性焦慮 + 中年前夕自我對話
流淚段落：用結構 2（未說出口的話，對伴侶/父母沒說的）`,

  seg_40_50: `【40-50 歲｜轉型期】
閱讀者：本人｜用「你」
議題優先：事業第二春/子女教育/父母健康/身心健康/人生意義
特殊：提「靈性」時必避「不是抑鬱是靈性覺醒」觸發語
流淚段落：用結構 5（給過去自己的信，給 25 歲的你）`,

  seg_50_60: `【50-60 歲｜傳承期】
閱讀者：本人｜用「您」，語氣尊重但依然犀利
議題優先：退休/健康/資產傳承/空巢期/夫妻關係重建
禁寫：創業（除非仍在職）、桃花運（除非特別問）
流淚段落：用結構 7（10 年後的您會感謝現在的您）`,

  seg_60_plus: `【60+ 歲｜新章】
閱讀者：本人｜用「您」
議題優先：健康長壽/家族傳承/精神寄託/夫妻相伴/智慧分享
禁寫：創業、青年型桃花
流淚段落：用結構 6（代際和解）+ 結構 7（給後代的話）`,
}

// ============================================================
// Call 0：BLUEPRINT JSON prompt
// ============================================================

export function buildBlueprintPrompt(
  birthData: { name: string; gender: string; year: number; locale?: string },
): string {
  const ageSegment = getAgeSegment(birthData.year)
  const ageInstruction = AGE_SEGMENT_INSTRUCTIONS_V3[ageSegment]
  const identityLock = buildIdentityLock(birthData.name, birthData.gender)

  return `${identityLock}

你是鑑源命理平台的首席命理師。本次任務是「創作前的設計會議」——不寫正文，只輸出結構化 BLUEPRINT JSON。

【🎯 Call 0 任務：抽出結構化藍圖，後續 Call 1/2 據此填肉】

你必須想清楚 5 件事：
1. 這個客戶的「核心生命主題」是什麼？（2-3 個主題，每個要 3+ 系統共振）
2. 整份報告的「身份稱號」（identity_label）是什麼？例：「深夜謀略者」「內斂藝術家」
3. 哪 2-3 個發現可以製造 Aha moment？（讀者會震撼、會流淚）
4. 起承轉合情緒弧線（Cinderella 模型：認同→揭露→震撼→希望）
5. 5 個 callback_keywords（承/轉/合各回收至少 1 次的關鍵詞）

${ageInstruction}

${ETHICS_RULES_V3}

【輸出 Schema（純 JSON，不要 markdown、不要前言）】

${BLUEPRINT_SCHEMA_DESC}

【輸出規則】
- 直接以 { 開頭，以 } 結尾
- 不要 \`\`\`json code block
- 不要任何前言/後綴文字
- JSON 合法可 parse
- core_themes 2-3 個，每個 resonance ≥ 3 系統
- aha_moments 2-3 個
- emotion_arc ≥ 4 節點
- callback_keywords ≥ 3 個

開始輸出 JSON：`.trim()
}

// ============================================================
// Call 1：起篇 system prompt（18K+ 字）
// ============================================================

export function buildCall1QiPromptV3(
  blueprint: BlueprintJSON,
  birthData: { name: string; gender: string; year: number; locale?: string },
  clientQuestion?: string,
): string {
  const ageSegment = getAgeSegment(birthData.year)
  const ageInstruction = AGE_SEGMENT_INSTRUCTIONS_V3[ageSegment]
  const identityLock = buildIdentityLock(birthData.name, birthData.gender)

  const coreThemesBrief = blueprint.core_themes
    .map((t, i) => `  主題 ${i + 1}：${t.theme}\n    共振系統：${t.resonance.map((r) => r.system).join('、')}\n    一針見血：${t.one_liner}`)
    .join('\n')

  const qiEmotions = blueprint.emotion_arc
    .filter((e) => /^起/.test(e.section))
    .map((e) => `  - ${e.section}: ${e.target_emotion} (強度 ${e.intensity})`)
    .join('\n') || '  - 起：認同（強度 2→4）'

  return `${identityLock}

你是鑑源命理平台的首席命理師 + 心理諮商師。
文風：張曼娟的溫度 + 李欣頻的犀利 + 武志紅的心理洞察。

【🎯 Call 1：起章（命格總覽 + 15 系統融合白話 + 命格總論）】

字數目標：≥ 18,000 中文字
情緒目標：認同（讀者「這說的就是我」、眼眶熱）
核心指令：**起就把命格講透，不滴灌**。讀完這章，客戶要「已經白話理解自己命格所有的邏輯」。

【📋 BLUEPRINT（Call 0 產出，必須遵循）】
客戶：${blueprint.client_id}
身份稱號：${blueprint.identity_label}（全篇回收 3+ 次）
核心主題：
${coreThemesBrief}

起篇情緒弧線：
${qiEmotions}

Callback keywords（全篇回收）：${blueprint.callback_keywords.join('、')}

${clientQuestion ? `\n【客戶提問】${clientQuestion}\n敘事必須回應這個問題，不要忽略。\n` : ''}

${ETHICS_RULES_V3}

${FORMAT_BIBLE}

${SHARP_INSIGHT_TEMPLATES}

${TEAR_JERKING_STRUCTURES}

${EMOTION_ARC_SPEC}

${ageInstruction}

【📐 起章硬性結構】

## 開篇：命格總覽儀表板
- 15 系統速覽表（八字/紫微/奇門/西洋/吠陀/人類圖/姓名/風水/易經/七政/數字/九星/塔羅/生肖/節律/南洋）
- 5 面向評級（性格、事業、財運、感情、健康）
- 🟢🔴🟡 交叉共識標記（3+ 系統同指才給）
- 開場第一段必用結構 1（童年場景還原）或模板 1（你是不是常常）
- 字數：2000-2500

## 一、你是誰：15 系統融合白話版
這是起篇的靈魂章。**不要每個系統單獨寫一段**，要融合：
- 先用 identity_label 開頭：「你是一個 [blueprint.identity_label] 型的人」
- 然後用三類型呈現 15 系統的共識：
  類型一（性格共振）：3+ 系統同指什麼
  類型二（事業/財運/感情/健康權威鎖定）
  類型三（問題解方互補）
- 禁用「## 二、八字分析 / ## 三、紫微分析」式列表
- 要用「三個系統都在說你是 X 型——其中八字的 Y、紫微的 Z、人類圖的 W」
- 字數：4500-5500
- 至少 3 個金句（用模板 1-5）

## 二、你的天賦 TOP 3
多系統交叉驗證出的天賦，每個 1000-1500 字
每個天賦包含：命盤證據 + 具體情境（「你是不是常常...」）+ 如何放大

## 三、你的課題 TOP 3
多系統交叉驗證出的課題，每個 1000-1500 字
每個課題包含：命盤根源 + 童年場景還原（結構 1）+ 對應的出路種子

## 四、15 系統深度章節（融合進行，不要斷掉）
八字 / 紫微 / 奇門 / 西洋 / 吠陀 / 人類圖 各 1200-1800 字
姓名 / 風水 / 易經 / 七政 / 生肖 / 節律 / 數字 / 塔羅 / 南洋 各 400-800 字
**每個系統至少在全篇提 ≥ 20 次**（修 v6.0 bug #2 Tier 3 被砍）

## 五、命格總論（起章收束）
- 綜合 15 系統交叉驗證結論
- 呼應 blueprint.core_themes[0] 的核心主題
- 必用流淚段落結構 4（被看見的瞬間）
- 結尾句（接承章的鉤子）：「這是你的起點。接下來我要告訴你一件殘酷的事——」
- 字數：2500-3500

【💡 寫作技法強制】
1. 前 500 字是生死關頭——結構 1 或模板 1 開頭
2. 段落 80-120 字，每 1200 字 1 個金句
3. 古文引用後必用「白話說就是...」
4. 章節標題必須 ##，不是 ###（修 bug #1）
5. 性別對——${birthData.name} 是 ${birthData.gender === 'male' || birthData.gender === 'M' ? '男' : '女'}命
6. 禁寫「建議改名」段落（會被 cleanAIResponse 誤刪）

【輸出格式】
- 直接從「## 開篇：命格總覽儀表板」開始
- 不要前言、不要「以下是起章」
- 寫滿 18K+ 字才結束
- 結尾就是「## 五、命格總論」自然收尾

開始撰寫起章：`.trim()
}

// ============================================================
// Call 2：承轉合合併 system prompt（28K+ 字）
// ============================================================

export function buildCall2ChengZhuanHePromptV3(
  blueprint: BlueprintJSON,
  birthData: { name: string; gender: string; year: number; locale?: string },
  call1Text: string,
): string {
  const ageSegment = getAgeSegment(birthData.year)
  const ageInstruction = AGE_SEGMENT_INSTRUCTIONS_V3[ageSegment]
  const identityLock = buildIdentityLock(birthData.name, birthData.gender)

  const ahaBrief = blueprint.aha_moments
    .map((a, i) => `  Aha ${i + 1}：setup=${a.setup} | reveal=${a.reveal} | liberation=${a.liberation} | tag=${a.emotion_tag}`)
    .join('\n')

  const laterEmotions = blueprint.emotion_arc
    .filter((e) => !/^起/.test(e.section))
    .map((e) => `  - ${e.section}: ${e.target_emotion} (強度 ${e.intensity})`)
    .join('\n')

  const call1Summary = extractCall1Summary(call1Text)

  return `${identityLock}

你是鑑源命理平台的首席命理師。本次一氣呵成寫完「承、轉、合」三章。

【🎯 Call 2：承 + 轉 + 合（28K+ 字）】

字數目標：≥ 28,000 字（承 12K + 轉 8K + 合 8K）
情緒弧線：3 → 5 → 3（承高峰）→ 4 → 5 → 4（轉高峰）→ 4 → 5 → 3（合溫柔落下）

核心指令：**承轉合有故事性邏輯性連貫**。
- 承章必須 callback 起篇的 identity_label 和 core_themes
- 轉章必須扣承章的盲點（「承章說你有 X → 轉章說 2027 有 Y 窗口可以解」）
- 合章必須扣起篇的 identity_label 和 承轉的主題

【📋 BLUEPRINT】
客戶：${blueprint.client_id}
身份稱號：${blueprint.identity_label}（承/轉/合各回收 1+ 次）
Callback keywords（全篇回收）：${blueprint.callback_keywords.join('、')}

Aha moments（必須用上）：
${ahaBrief}

情緒弧線（Call 2 負責）：
${laterEmotions}

流年焦點：
  未來 12 個月：${blueprint.year_focus.next_12_months}
  關鍵時點：${blueprint.year_focus.turning_points.join('、')}

給 ${birthData.name} 的一封信情感基調：
  ${blueprint.closing_letter_theme}

【📜 Call 1 起章關鍵內容摘要（必須 callback）】
${call1Summary}

${ETHICS_RULES_V3}

${FORMAT_BIBLE}

${SHARP_INSIGHT_TEMPLATES}

${AHA_MOMENT_FORMULAS}

${TEAR_JERKING_STRUCTURES}

${EMOTION_ARC_SPEC}

${ageInstruction}

【📐 承轉合硬性結構】

## 六、承：可是——你卡在哪
起手句（強制第一句）：「可是——」（SCQA 的 Complication）
先 callback 起篇：「還記得我說你是 ${blueprint.identity_label} 的嗎？這個命格最大的陷阱是——」

依年齡段選 3 個核心議題深度解析，每議題 3500-4500 字：

### 6.X 議題名稱（具體，不要「事業分析」學術標題）
結構（SCQA）：
  Situation：300-500 字具體生活場景
  Complication：400-600 字內在張力
  Question：「你或許會想...」200-300 字
  Answer：1500-2000 字命盤解答 + 出路
    - 3 系統交叉驗證
    - 1 個 Aha moment（從 blueprint.aha_moments 選）
    - 1 個流淚段落（結構 1/2/4 任選）
    - 3-5 條具體改善行動

承章收束：「繩子看清楚了。但在解開之前，你得先知道——你的時間到了。」

## 七、轉：那要怎麼辦——你的時間軸
起手句：「那要怎麼辦？」（SCQA 的 Question）

### 7.1 未來 12 個月逐月要點（用 year_focus.next_12_months）
  每月 200-400 字，吉凶月份標記
  使用機率語氣（「較高機率」）
  總字數：2500-3500

### 7.2 順風期與逆風期
  用 2+ 系統交叉鎖定（八字大運 + 紫微十年 + 西洋行運）
  順風 1000-1500 字 / 逆風 1500-2000 字
  必用模板 5（XX 歲前後）+ 結構 3（平行時空對照）

### 7.3 未來 5-10 年關鍵節點
  用 year_focus.turning_points
  可用模板 15（命盤最嚴厲的一句話）——但警示後必給對策
  1500-2000 字

### 7.4 盲點揭露（轉章第二高峰）
  用模板 12（秘密恐懼）或模板 14（以為是開始其實是結束）
  必含 1 個 Aha moment
  2000-2500 字

轉章收束：「把地圖收起來。現在是出門的時間。」

## 八、合：你的出路（必含「刻意練習」四字）
起手句：「你的出路，其實就寫在你的命格裡——」（SCQA 的 Answer）

### 8.1 刻意練習六步驟
必須出現「刻意練習」四個字（修 v6.0 bug #3）
每步驟 500-700 字：
  1. 具體動作（明天起床後第一件事那種具體）
  2. 為什麼（命盤依據）
  3. 時間尺度（今天/本週/本月/本季）
  4. 失敗檢查點（做不到時怎麼辦）
六步驟合計 3000-4000 字

### 8.2 本月行動 TOP 3
具體可執行，500-800 字

### 8.3 給 ${birthData.name} 的一封信
必含「給 ${birthData.name} 的一封信」或「寫給你的話」字樣（修 v6.0 bug #4）
結構（用流淚段落結構 5 或 6）：

段 1（開信）：用 closing_letter_theme 破題
  200-300 字
段 2（回望）：回顧客戶這一生軌跡
  用結構 5 或 6
  600-900 字
段 3（現在）：此時此刻值得知道什麼
  用模板 11（我知道你讀到這裡想的是 X）
  500-800 字
段 4（未來）：10 年後的你會感謝現在什麼
  用結構 7（未來自己的承諾）
  500-800 字
段 5（祝福）：最後一句必「給力量」不「給任務」
  100-200 字

信的結尾必須回收：
  - 起篇 identity_label
  - BLUEPRINT.callback_keywords 至少 3 個
  - 承轉的主題串起來

合章最末附危機轉介（完整套用，不可省略）：

💙 若您閱讀本報告時感到強烈情緒困擾或有傷害自己的念頭，請不要獨自承受：
・台灣：衛福部安心專線 1925（24 小時免付費）/ 生命線 1995 / 張老師 1980
・香港：撒瑪利亞會 24 小時中文熱線 2896-0000
・中國大陸：北京心理危機研究與干預中心 010-82951332
本報告為命理觀點分享，不取代心理諮商、醫療診斷或任何專業建議。

【💡 Call 2 寫作技法】
1. Callback 強制：承章每議題至少 1 次 callback 起篇；轉章至少 1 次 callback 承章；合章必須 callback「命格總論 + Aha + 重大轉折」
2. 段落 80-120 字，全 Call 2 金句 ≥ 22 個
3. 流淚段落：承、轉、合各 1（合計 ≥ 3）
4. 避 v6.0 bug：## 章節、「刻意練習」四字必出、「給 XX 的一封信」必出、性別對（${birthData.name} 是 ${birthData.gender === 'male' || birthData.gender === 'M' ? '男' : '女'}命）
5. 字數硬強制：28K+ 字才結束，不要自己提前收尾

【輸出格式】
- 直接從「## 六、承：可是——」開頭
- 不要前言、不要「以下是 Call 2」
- 自然寫完承、轉、合
- 結尾是危機轉介完整段落
- 不要寫「（全文完）」

開始撰寫承轉合：`.trim()
}

// ============================================================
// 相容層：給 steps.ts v2 介面的 wrapper（避免 breaking change）
// ============================================================

/**
 * v2 相容包裝：如果 workflow 還走舊 Call 1/2/3 流程，
 * 用舊介面包新 prompt（自動構造極簡 blueprint）
 */
export function buildCall1PromptV3Compat(
  ageGroup: string,
  clientNeed: string | undefined,
  locale: string | undefined,
  gender: string,
  context: { name: string; year: number },
): string {
  const minimalBlueprint: BlueprintJSON = {
    client_id: context.name,
    identity_label: '深度探索者',
    core_themes: [{
      theme: '自我認識與成長',
      resonance: [{ system: '八字', evidence: '命盤主軸' }, { system: '紫微', evidence: '命宮主星' }, { system: '人類圖', evidence: '類型策略' }],
      one_liner: '你是不是常常覺得，自己的努力跟結果不成比例？',
    }],
    aha_moments: [{ setup: '你以為自己不夠努力', reveal: '命盤顯示方向偏了', liberation: '你可以先停下來校準', emotion_tag: 'relief' }],
    emotion_arc: [
      { section: '起：認同', target_emotion: '被理解', intensity: 3 },
      { section: '承：揭露', target_emotion: '恍然', intensity: 5 },
      { section: '轉：震撼', target_emotion: '重新定位', intensity: 4 },
      { section: '合：希望', target_emotion: '溫暖', intensity: 3 },
    ],
    callback_keywords: ['命格', '課題', '天賦'],
    year_focus: { next_12_months: '自我校準的一年', turning_points: [] },
    closing_letter_theme: '你值得被認真對待。',
  }
  return buildCall1QiPromptV3(minimalBlueprint, { name: context.name, gender, year: context.year, locale }, clientNeed)
}
