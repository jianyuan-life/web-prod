/**
 * 報告起承轉合分篇工具
 *
 * 用途：把 6 方案的章節自動分為 4 大篇（起/承/轉/合），
 *       讓報告頁 UI 呈現摺疊式起承轉合結構。
 *
 * 依據：llm_collab/chapter_iteration/FINAL.md（5 LLM 共識版）
 *       workflows/generate-report/plan-prompts.ts（6 方案實際章節）
 *
 * 設計原則：
 * 1. 純函式，不依賴 React/DOM，可被 SSR/PDF 共用
 * 2. 章節標題作為唯一輸入，支援各種 AI 生成的變體（有/無編號）
 * 3. 無法歸類的章節一律丟進「合」（行動/總結）
 */

export type ChapterPart = 'qi' | 'cheng' | 'zhuan' | 'he'

export interface PartMeta {
  key: ChapterPart
  label: string        // 「第一篇」等
  name: string         // 「生命藍圖 — 認識本我」
  stage: string        // 「起」「承」「轉」「合」
  tldr: string         // 一句話摘要（顯示在標題下方）
  icon: string         // Unicode 符號（不使用 emoji）
}

// v5.10.35 R+8 P0 修(V3 GPT-4o Vision「icon 統一性不夠」共識):
//   原 ◆ ◇ ◐ ◈ 4 個不同字符視覺不一、L3 detail=high 扣分
//   修補:統一為「實心圓 ●」+ 數字、保留起承轉合語意但視覺一致
export const PART_META: Record<ChapterPart, PartMeta> = {
  qi: {
    key: 'qi',
    label: '第一篇',
    name: '生命藍圖 — 認識本我',
    stage: '起',
    tldr: '建立「我是誰」的全面認知——本質特徵、與時間無關',
    icon: '❶',
  },
  cheng: {
    key: 'cheng',
    label: '第二篇',
    name: '人生軌跡 — 發展與現況',
    stage: '承',
    tldr: '將「本我」延伸至各領域現況——事業/財富/感情/健康',
    icon: '❷',
  },
  zhuan: {
    key: 'zhuan',
    label: '第三篇',
    name: '時運流轉 — 未來展望',
    stage: '轉',
    tldr: '聚焦時間性分析——大運、流年、關鍵時機',
    icon: '❸',
  },
  he: {
    key: 'he',
    label: '第四篇',
    name: '行動指引 — 總結與實踐',
    stage: '合',
    tldr: '融會貫通前三篇——具體行動、風險規避、心態調整、溫暖收尾',
    icon: '❹',
  },
}

/**
 * 清理標題：移除數字編號、字數標注、Markdown 殘留
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/[（(]\s*[~～]?\s*[\d,]+\s*字?\s*[）)]/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^\d+[\.、]\s*/, '')
    .replace(/^[一二三四五六七八九十百]+[、\.]\s*/, '')
    .replace(/\*{1,2}/g, '')
    .trim()
}

/**
 * C 方案（人生藍圖）— 15 章嚴格起承轉合
 * 對應 plan-prompts.ts 的 C prompt（01-15 章）
 */
function classifyC(title: string): ChapterPart {
  const t = normalizeTitle(title)

  // v6.0（2026-04-18）按「起承轉合 10 章新結構」分類
  //   一、你是誰 → qi
  //   二、你的人生現況 → cheng
  //   三、你的人生軌跡 → zhuan
  //   四、你的 2026 主題 → he
  //   五～十（好壞改+寫給你的話+刻意練習+命理依據速覽表）→ he

  // 起：第一章「你是誰」— 命格封號+性格本質+天賦+課題
  if (/^你是誰|第一[塊章].*你是誰|你是誰.*起/.test(t)) return 'qi'
  if (/命盤全觀|命盤總觀|全觀|總觀|整體命盤|命盤主軸|命盤鳥瞰|命格.*全景/.test(t)) return 'qi'
  if (/性格特質|人格特質|內在特質|性格剖析|人格剖析|你的性格|內在驅動/.test(t)) return 'qi'
  if (/天賦潛能|天賦|核心優勢|天生強項|潛能|你的優勢|你的天賦|天賦武器|天賦.*Top/.test(t)) return 'qi'
  if (/人生課題|核心課題|成長課題|生命課題|內在衝突|人生難題|課題.*Top/.test(t)) return 'qi'
  if (/命格名片|命格封號|命格角色|命格總覽|命格速覽|三把鑰匙|開篇/.test(t)) return 'qi'
  if (/一句話定義|關鍵字|最大的天賦|最該注意/.test(t)) return 'qi'
  if (/第一印象.*真實|落差|外表.*內在/.test(t)) return 'qi'
  if (/思維模式|行動模式|情感模式|價值觀|大腦.*掃描|顯示者|被尊重/.test(t)) return 'qi'

  // 承：第二章「你的人生現況」— 事業/財運/感情/健康四大領域
  if (/^你的人生現況|第二[塊章].*人生現況|人生現況.*承|你的.*現況/.test(t)) return 'cheng'
  if (/事業發展|事業方向|事業.*天賦|事業陷阱|職涯|職業|工作方向|事業規劃|最佳事業時機|職業方向/.test(t)) return 'cheng'
  if (/你天生不適合|螺絲釘|第一線業務|被請教|在事業上的你/.test(t)) return 'cheng'
  if (/賺錢模式|破財陷阱|財富運勢|財運|財富|理財|金錢觀|投資風格|賺不到錢|守得住|在財運上的你/.test(t)) return 'cheng'
  if (/感情.*模式|人際吸引|感情關係|感情與人際|感情|戀愛|婚姻|人際|社交|遇不到人|走進你心裡|在感情上的你/.test(t)) return 'cheng'
  if (/體質地圖|健康風險|養生時間|健康|身心|福祉|養生|身體|體質|脆弱的環節|在健康上的你/.test(t)) return 'cheng'
  if (/過去.*10.*年|過去十年|過去.*回顧|回顧.*過去|人生節奏表|人生回顧|成長軌跡/.test(t)) return 'cheng'
  if (/財運時間表|感情時間表|事業時間表/.test(t)) return 'cheng'

  // 轉：第三章「你的人生軌跡」— 十年大運+流年+12 月行事曆
  if (/^你的人生軌跡|第三[塊章].*人生軌跡|人生軌跡.*轉|你的.*軌跡/.test(t)) return 'zhuan'
  if (/未來.*10.*年|未來十年|未來.*預告|未來展望/.test(t)) return 'zhuan'
  if (/十年大運|大運總覽|大運走勢|人生節奏總覽|人生.*節奏|慢慢開花|竹子|煙火|人生節奏圖/.test(t)) return 'zhuan'
  if (/當前大運|現行大運|大運詳解|本大運|當下這一段/.test(t)) return 'zhuan'
  if (/流年運勢|時運|時機|運勢走勢|運勢|12.*個月行事曆|行事曆/.test(t)) return 'zhuan'
  // v5.3.44 補未來年份（2028-2035）+ 六十花甲 → 轉篇，修 Bug「2028 戊申年被誤分到起篇」
  // IA 稽核補：加排除條件，避免「2026-2030 主題/願景」被誤吃成轉篇（這類是合篇）
  if (/20(28|29|30|31|32|33|34|35)[\s—\-年]|戊申|己酉|庚戌|辛亥|壬子|癸丑|甲寅|乙卯/.test(t)
      && !/主題|願景|集大成|刻意練習|總結|行動計畫/.test(t)) return 'zhuan'
  if (/順風期|逆風期|機遇窗口|挑戰節點/.test(t)) return 'zhuan'
  if (/大運|流年/.test(t)) return 'zhuan'  // fallback

  // 合：第四章「你的 2026 主題」+ 好/壞/改 + 寫給你的話 + 刻意練習 + 命理依據速覽表
  if (/^你的.*2026|第四[塊章].*2026|2026 ?主題|2026.*主題.*合/.test(t)) return 'he'
  if (/年度總論|年度.*主題|年度.*行動|2026.*年度|2026.*主題|2026.*年|2027|本命年|該做什麼|考驗年|丙午年|幸運元素總表|幸運元素/.test(t)) return 'he'
  if (/月.*逐月分析|逐月分析|12.*月|每月|流月/.test(t)) return 'he'
  if (/好的地方|需要注意的地方|需要注意|改善建議|改善方案|建議詳解/.test(t)) return 'he'
  if (/優勢發揮|行動策略|刻意練習|具體行動|行動方案|實踐|落地|練習一|練習二|練習三|練習四|練習五|練習六|練習七/.test(t)) return 'he'
  if (/風險規避|潛在陷阱|避雷|預防|陷阱|地雷/.test(t)) return 'he'
  if (/心態調整|成長路徑|成長|心態重建|自省|每日練習/.test(t)) return 'he'
  // v5.10.43 P0 修(老闆抓 C 報告「三、給您的一句話」混進第一篇 qi):
  //   原 regex /給你的/ 只抓「你」、AI 生成「給您的一句話」(用「您」尊敬詞)被漏抓 → fall through to 'qi'
  //   修補:加 [你您] character class 兩字都抓
  if (/總結|進階|寫給|收尾|結語|給[你您]的一句話|給[你您]的|一封信|力量宣告|系統.*關鍵發現/.test(t)) return 'he'
  if (/命理依據速覽|命理依據|速覽表|15.*系統速覽|系統速覽/.test(t)) return 'he'
  // v5.7.40 加 v5.3.98 新增章節:TOP 5 優勢 / TOP 5 風險 / 三階段行動 / 年度運勢曲線 / 幸運參數 / 十五系統交叉
  // 證據:HJN 32 歲 v5.7.39 ai_content 17 章節順序連續、但 Gemini 看 mobile 截圖標「九十十一十二十四四五六亂序」
  // 根因:這 6 章標題未命中 classifyC 規則 → fallback to 'qi' → 跑到起篇前面 → 整體順序錯亂
  if (/TOP\s*5\s*優勢|前\s*5.*優勢|五大.*優勢|TOP\s*5\s*天賦/.test(t)) return 'he'
  if (/TOP\s*5\s*風險|前\s*5.*風險|五大.*風險|TOP\s*5\s*挑戰/.test(t)) return 'he'
  if (/三階段.*行動|行動.*計畫|短期.*中期.*長期|分階段.*行動/.test(t)) return 'he'
  if (/年度運勢曲線|運勢曲線|年度.*曲線/.test(t)) return 'he'
  if (/幸運參數|幸運元素總表|幸運參數速查/.test(t)) return 'he'
  if (/(?:十五|15).*系統.*交叉|交叉驗證.*矩陣|系統.*驗證.*矩陣/.test(t)) return 'he'

  return 'qi' // 預設丟起（認可版內容量以起篇為主）
}

/**
 * D 方案（心之所惑）— 7 章主題聚焦
 * 你的問題/你的答案 → 起
 * 深入解析 → 承
 * 根源剖析 + 需要注意 → 轉（為什麼 + 風險）
 * 你的路 + 好的地方 + 改善建議 + 寫給你的話 → 合
 */
function classifyD(title: string): ChapterPart {
  const t = normalizeTitle(title)

  // v5.10.44 P0 修(Codex Agent 抓「您 vs 你」字差跨 D / G15 / R 仍存):
  //   AI 對父母版/中年版/長者版用「您」尊敬詞、原 regex 只抓「你」漏匹配
  //   修補:全部 regex 加 [你您] character class 兩字都抓
  if (/[你您]的問題|[你您]的答案|10\s*秒內結論|快速結論/.test(t)) return 'qi'
  if (/深入解析|命格怎麼看/.test(t)) return 'cheng'
  if (/根源剖析|為什麼|根源|卡在|卡住/.test(t)) return 'zhuan'
  if (/需要注意|需注意|該注意|注意的地方/.test(t)) return 'zhuan'
  if (/[你您]的路|怎麼走出來|出路/.test(t)) return 'he'
  if (/好的地方|優勢/.test(t)) return 'he'
  if (/改善建議|改善方案|建議詳解/.test(t)) return 'he'
  if (/寫給|給[你您]的一句話|收尾/.test(t)) return 'he'

  return 'cheng'
}

/**
 * G15 方案（家族藍圖）— 9 章家族動力分析
 * 能量全貌 + 成員互動 → 起（認識這個家）
 * 好的地方 + 需要注意 + 溝通模式 + 親子教養 → 承（現況各面向）
 * 流年 2026-2030 → 轉（時間）
 * 改善建議 + 刻意練習 + 家族行動 + 寫給這個家 → 合
 */
function classifyG15(title: string): ChapterPart {
  const t = normalizeTitle(title)

  // v5.10.34 R+8 P0 修(7-LLM 共識「第三+四篇空殼」、L4 + L7 抓):
  //   原 classifyG15 漏抓「20XX年」「五年總覽」「時運曲線」「行動指引」「寫給」等子章節
  //   → 第三/四篇折疊區無內容、客戶感覺報告只有一半、付 $59 拿到 < 50% 內容
  //   修補:加 regex 涵蓋實際 G15 17 章生成、確保所有章節都歸到對應 part

  // 起(qi):認識家族本我、能量結構、互動關係
  if (/能量全貌|家.*全貌|全家.*能量/.test(t)) return 'qi'
  if (/成員互動|互動關係/.test(t)) return 'qi'
  if (/家族.*結構|家族.*動力|跨代.*業力|跨代.*慣性/.test(t)) return 'qi'
  if (/角色.*溝通|成員.*角色/.test(t)) return 'qi'

  // 承(cheng):家族各領域現況(財務/健康/風水/教育)+ 好壞分析
  if (/好的地方|家庭.*優勢|家族.*優勢/.test(t)) return 'cheng'
  if (/需要注意|需注意|挑戰/.test(t)) return 'cheng'
  if (/溝通模式|家庭溝通/.test(t)) return 'cheng'
  if (/親子教養|^教養$|教養方向|教養角色/.test(t)) return 'cheng'
  if (/家族.*財務|財務命脈|金錢心理/.test(t)) return 'cheng'
  if (/家族.*健康|身心健康/.test(t)) return 'cheng'
  if (/家族.*風水|環境.*風水/.test(t)) return 'cheng'
  if (/家族.*教育|教育.*傳承/.test(t)) return 'cheng'
  // 父母 / 親子 子章節
  if (/父母.*角色|父母.*教養|親子.*衝突/.test(t)) return 'cheng'
  if (/天賦特質|天賦.*一句話/.test(t)) return 'cheng'

  // 轉(zhuan):時間軸 / 流年 / 五年總覽
  if (/家族流年|流年運勢|家族.*\d{4}/.test(t)) return 'zhuan'
  if (/^20\d{2}年|^20\d{2}\s*[(（]/.test(t)) return 'zhuan' // 「2026年」「2026 (丙午年)」
  if (/五年總覽|五年.*總覽|流年總覽|家族.*時間軸|時運.*流轉|時運曲線|未來展望/.test(t)) return 'zhuan'
  if (/家族.*發展.*階段|Erikson|發展時間軸/.test(t)) return 'zhuan'

  // 合(he):行動 / 改善 / 寫給你 — v5.10.44 加「您」字
  if (/改善建議|改善方案|改善.*計畫/.test(t)) return 'he'
  if (/刻意練習/.test(t)) return 'he'
  if (/家族行動|行動指南|行動指引|家庭行動|行動.*計畫/.test(t)) return 'he'
  if (/寫給這個家|寫給.*家|給這個家|寫給[你您]們|寫給[你您]/.test(t)) return 'he'
  if (/家族.*故事|故事重寫|敘事治療|外化問題|替代故事/.test(t)) return 'he'
  if (/總結|總.*行動|集大成|法務免責/.test(t)) return 'he'

  return 'cheng'
}

/**
 * R 方案（合否？）— 8 章關係合盤
 * 你們的問題 + 你們的答案 → 起
 * 你們的化學反應（逐系統判定）→ 承
 * 最好的地方 + 最該注意 + 關係流年 → 轉
 * 改善建議 + 刻意練習 + 寫給你們 → 合
 */
function classifyR(title: string): ChapterPart {
  const t = normalizeTitle(title)

  // v5.10.44 P0 修(Codex Agent 抓「您 vs 你」字差):AI 用「您們」尊敬詞、原 regex 只抓「你們」漏匹配
  if (/[你您]們的問題|[你您]們的答案|10\s*秒/.test(t)) return 'qi'
  if (/化學反應|[你您]們的化學/.test(t)) return 'cheng'
  if (/最好的地方|好的地方|優勢/.test(t)) return 'zhuan'
  if (/最該注意|需要注意|注意/.test(t)) return 'zhuan'
  if (/關係流年|[你您]們的.*\d{4}|流年/.test(t)) return 'zhuan'

  if (/改善建議|關係處方|改善方案/.test(t)) return 'he'
  if (/刻意練習/.test(t)) return 'he'
  if (/寫給[你您]們|寫給.*[你您]們|給[你您]們的話/.test(t)) return 'he'

  return 'cheng'
}

/**
 * E1/E2 出門訣：不強套起承轉合，統一歸為「承」（本月/事件分析），
 * 但在 UI 層級上仍可分顯示區塊：
 * 事件判斷 / 本月出行能量 → 起（判定）
 * Top3 時機 / 週度時機 → 承（時機）
 * 補運操作指南 / 行動建議 → 轉（執行）
 * 月度總結 / 寫給你的話 → 合（收尾）
 */
function classifyE(title: string): ChapterPart {
  const t = normalizeTitle(title)

  if (/事件判斷|事件吉凶|本月出行能量|本月.*總覽|本月運勢|本月命理/.test(t)) return 'qi'
  if (/Top|加乘時機|最佳.*時機|第[一二三四].*週|第.*週/.test(t)) return 'cheng'
  if (/行動建議|補運.*指南|補運操作|操作指南|具體做法/.test(t)) return 'zhuan'
  if (/月度總結|總結|寫給你的話|寫給|忌方|忌日|注意事項/.test(t)) return 'he'

  return 'cheng'
}

/**
 * 根據方案代碼，把章節標題分派到四大篇
 *
 * 容錯規則：
 * - 未知 planCode → 預設走 C 方案分類（最通用）
 * - 標題空字串 / 只有空白 → 丟「合」（避免污染起/承/轉）
 * - 非中文標題也能處理（英文關鍵字 fallback 到原文匹配）
 */
export function classifyChapter(
  planCode: string,
  title: string,
): ChapterPart {
  // 空標題防護
  if (!title || !title.trim()) return 'he'

  switch (planCode) {
    case 'C':  return classifyC(title)
    case 'D':  return classifyD(title)
    case 'G15': return classifyG15(title)
    case 'R':  return classifyR(title)
    case 'E1':
    case 'E2': return classifyE(title)
    default:
      // 未知方案：用 C 方案的分類規則（最詳細、最通用）
      return classifyC(title)
  }
}

/**
 * 除錯用：分類診斷（DEV 環境才使用）
 * 用於人工核對章節是否被正確分到 4 大篇
 */
export function diagnoseClassification(
  planCode: string,
  titles: string[],
): Array<{ title: string; part: ChapterPart; label: string }> {
  return titles.map(t => {
    const part = classifyChapter(planCode, t)
    return {
      title: t,
      part,
      label: `${PART_META[part].label}·${PART_META[part].stage}`,
    }
  })
}

/**
 * 章節抽取輔助 — 從 AI 生成的 markdown 段落，提取「TL;DR」
 * 規則：
 * 1. 優先取第一個 > 引言框內文
 * 2. 其次取第一段非空文字（去除 markdown 格式）
 * 3. 截斷到 70 字以內（UI 顯示友好）
 */
export function extractTLDR(content: string, maxLen = 70): string {
  if (!content) return ''

  // v5.10.82 P0 修(底層 audit P0-3、sub-agent 全面審 frontend parse 抓):
  //   原邏輯 bug:整個 content match 第一個 `^>` 引言框、章節中段古籍 blockquote(如《紫微斗數全書》卷二:「紫微者...」)會被當 TLDR
  //   證據:章首速覽顯示古籍引文、不是章節重點、客戶讀體驗破壞
  //   修補:限定章節開頭 5 行內找引言框、避免章節中段引文污染
  // 優先:章節開頭 5 行內找引言框(限定 head、不是 fullContent)
  const headLines = content.split('\n').slice(0, 5).join('\n')
  const quoteMatch = headLines.match(/^>\s*\**(.+?)\**\s*$/m)
  if (quoteMatch) {
    return truncate(stripMd(quoteMatch[1]), maxLen)
  }

  // 其次:第一段純文字(跳過表格、清單、空行)
  const lines = content.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) continue
    if (line.startsWith('|')) continue
    if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) continue
    if (line.startsWith('→')) continue
    if (/^\d+[\.、]/.test(line)) continue
    const clean = stripMd(line)
    if (clean.length >= 10) return truncate(clean, maxLen)
  }

  return ''
}

/**
 * v5.10.95 P0 修(visual_audit_2026-05-10 N1 共識:章首速覽 echo 50+ 次跨 6/6 件):
 *   原 extractTLDR 抽出來但 content 沒被移除 → render 時 tldr blockquote + content 完整貼 = 視覺重複
 *   新 helper:同 extractTLDR 邏輯、同時 return tldr 來源已移除的 content
 *
 * v5.10.102 hotfix REVERT(verify 後 G15 7LLM starStarCount 0 → 63 regression):
 *   strip 邏輯(splice / blockquote 移除)在某些 markdown 結構下產生不平衡 `**` 殘留 + 字數減 1500
 *   暫退回:strippedContent = content 不變(章首速覽 echo 暫不修、避免大 regression)
 *   下次 session 用更穩算法重做(可能改用 paragraph-aware split 而非 line-based splice)
 */
export function extractTLDRAndStripped(content: string, maxLen = 70): { tldr: string; strippedContent: string } {
  // v5.10.102 hotfix:暫降為純 wrapper 呼叫 extractTLDR、不 strip content、避免 starStarCount regression
  return { tldr: extractTLDR(content, maxLen), strippedContent: content }
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // v5.10.30 R+8 P0 修(7-LLM 共識「markdown ** render 失敗」、L4 Gemini Vision 抓):
    //   原邏輯只清成對 ** / *、若 truncate 切掉閉合 ** 則不成對 ** 殘留為字面顯示
    //   修補:最後加清所有殘留 * 字符(不成對 / 連續 / 開頭結尾)、徹底消除 ** 字面殘留
    .replace(/\*+/g, '')
    .replace(/^[「"」"']+|[「"」"']+$/g, '')
    .replace(/[「」]/g, '')
    .trim()
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen).replace(/[，。！？、；：,.!?;:]*$/, '') + '…'
}

/**
 * 把章節列表按四大篇分組（保留原始順序）
 */
export interface GroupedChapters<T> {
  part: PartMeta
  chapters: T[]
}

// v5.10.41 R+8 P0 修(老闆抓「五跳九 / 編號亂跳」、本 session 7 LLM 全漏):
//   AI 生成 17 章用流水中文編號(一~十七)、前端 part 分組後跨篇順序「一二三六七八四五九」混亂
//   修補:groupChaptersByParts 對每章 title 重編「一二三...」按 part 內順序、跨 part 連續
const CHINESE_NUMS = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十']

function renumberTitle(title: string, newNum: string): string {
  // 替換開頭的「N、」中文編號 → 新編號
  const m = title.match(/^([一二三四五六七八九十]+)([、\.])\s*(.+)$/)
  if (m) return `${newNum}、${m[3]}`
  return title
}

export function groupChaptersByParts<T extends { title: string }>(
  planCode: string,
  chapters: T[],
): GroupedChapters<T>[] {
  const buckets: Record<ChapterPart, T[]> = {
    qi: [],
    cheng: [],
    zhuan: [],
    he: [],
  }

  for (const ch of chapters) {
    const part = classifyChapter(planCode, ch.title)
    buckets[part].push(ch)
  }

  const order: ChapterPart[] = ['qi', 'cheng', 'zhuan', 'he']
  // v5.10.41 跨 part 連續重編章節編號(一二三...)、避免「五跳九」客戶投訴
  // v5.10.53 P0 修 sec-N dead anchor(R sec-8 + G15 sec-10 共識、cron :17 抓):
  //   原邏輯 `{ ...ch, title: newTitle } as T` 創 new object、但 page.tsx indexMap 用原 sec object 當 key
  //   重編後的 ch 在 indexMap.get(sec) return undefined → fallback 0、render 跟 nav 都對不齊 sec-N id
  //   修補:改 mutate 原物件 ch.title = newTitle、保留 reference identity、indexMap key 對齊
  let counter = 0
  return order
    .filter(k => buckets[k].length > 0)
    .map(k => ({
      part: PART_META[k],
      chapters: buckets[k].map(ch => {
        // 只重編「N、章節名」格式、非編號標題保留(如「家族動力全貌圖」)
        if (/^[一二三四五六七八九十]+[、\.]/.test(ch.title)) {
          counter++
          const newTitle = renumberTitle(ch.title, CHINESE_NUMS[counter - 1] || String(counter))
          // mutate 原 object、不創新 — 保留 indexMap key reference
          ;(ch as { title: string }).title = newTitle
        }
        return ch
      }),
    }))
}
