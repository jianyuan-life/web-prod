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

export const PART_META: Record<ChapterPart, PartMeta> = {
  qi: {
    key: 'qi',
    label: '第一篇',
    name: '生命藍圖 — 認識本我',
    stage: '起',
    tldr: '建立「我是誰」的全面認知——本質特徵、與時間無關',
    icon: '◆',
  },
  cheng: {
    key: 'cheng',
    label: '第二篇',
    name: '人生軌跡 — 發展與現況',
    stage: '承',
    tldr: '將「本我」延伸至各領域現況——事業/財富/感情/健康',
    icon: '◇',
  },
  zhuan: {
    key: 'zhuan',
    label: '第三篇',
    name: '時運流轉 — 未來展望',
    stage: '轉',
    tldr: '聚焦時間性分析——大運、流年、關鍵時機',
    icon: '◐',
  },
  he: {
    key: 'he',
    label: '第四篇',
    name: '行動指引 — 總結與實踐',
    stage: '合',
    tldr: '融會貫通前三篇——具體行動、風險規避、心態調整、溫暖收尾',
    icon: '◈',
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

  // 起：01-04（命盤全觀/性格特質/天賦潛能/人生課題）
  if (/命盤全觀|命盤總觀|全觀|總觀|整體命盤|命盤主軸|命盤鳥瞰|命格.*全景/.test(t)) return 'qi'
  if (/性格特質|人格特質|內在特質|性格剖析|人格剖析|你的性格|內在驅動/.test(t)) return 'qi'
  if (/天賦潛能|天賦|核心優勢|天生強項|潛能|你的優勢|你的天賦/.test(t)) return 'qi'
  if (/人生課題|核心課題|成長課題|生命課題|內在衝突|人生難題/.test(t)) return 'qi'
  if (/命格名片|你是誰|命格角色|命格總覽/.test(t)) return 'qi'

  // 承：05-08（事業/財富/感情/健康）
  if (/事業發展|事業方向|事業與天賦|職涯|職業|工作方向|事業規劃/.test(t)) return 'cheng'
  if (/財富運勢|財運|財富|理財|金錢觀|投資風格/.test(t)) return 'cheng'
  if (/感情關係|感情與人際|感情|戀愛|婚姻|人際|社交/.test(t)) return 'cheng'
  if (/健康|身心|福祉|養生|身體|體質/.test(t)) return 'cheng'

  // 轉：09-11（大運/流年）
  if (/十年大運|大運總覽|未來.*10.*年|未來十年/.test(t)) return 'zhuan'
  if (/當前大運|現行大運|大運詳解|本大運/.test(t)) return 'zhuan'
  if (/流年運勢|流年重點|流年聚焦|今年|明年|2026|2027|當年運勢/.test(t)) return 'zhuan'
  if (/時運|時機|未來展望|運勢走勢|運勢/.test(t)) return 'zhuan'
  if (/大運|流年/.test(t)) return 'zhuan'  // fallback

  // 合：12-15（行動/風險/心態/總結）
  if (/優勢發揮|行動策略|刻意練習|具體行動|行動方案|實踐|落地/.test(t)) return 'he'
  if (/風險規避|潛在陷阱|避雷|預防|陷阱|地雷/.test(t)) return 'he'
  if (/心態調整|成長路徑|成長|心態重建|自省|每日練習/.test(t)) return 'he'
  if (/總結|進階|寫給|收尾|結語|給你的一句話|給你的|一封信/.test(t)) return 'he'

  return 'he' // 預設丟合（避免漏章）
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

  if (/你的問題|你的答案|10\s*秒內結論|快速結論/.test(t)) return 'qi'
  if (/深入解析|命格怎麼看/.test(t)) return 'cheng'
  if (/根源剖析|為什麼|根源|卡在|卡住/.test(t)) return 'zhuan'
  if (/需要注意|需注意|該注意|注意的地方/.test(t)) return 'zhuan'
  if (/你的路|怎麼走出來|出路/.test(t)) return 'he'
  if (/好的地方|優勢/.test(t)) return 'he'
  if (/改善建議|改善方案|建議詳解/.test(t)) return 'he'
  if (/寫給|給你的一句話|收尾/.test(t)) return 'he'

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

  if (/能量全貌|家.*全貌|全家.*能量/.test(t)) return 'qi'
  if (/成員互動|互動關係/.test(t)) return 'qi'

  if (/好的地方|家庭.*優勢/.test(t)) return 'cheng'
  if (/需要注意|需注意|挑戰/.test(t)) return 'cheng'
  if (/溝通模式|家庭溝通/.test(t)) return 'cheng'
  if (/親子教養|教養/.test(t)) return 'cheng'

  if (/家族流年|流年運勢|家族.*\d{4}/.test(t)) return 'zhuan'

  if (/改善建議|改善方案/.test(t)) return 'he'
  if (/刻意練習/.test(t)) return 'he'
  if (/家族行動|行動指南|家庭行動/.test(t)) return 'he'
  if (/寫給這個家|寫給.*家|給這個家/.test(t)) return 'he'

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

  if (/你們的問題|你們的答案|10\s*秒/.test(t)) return 'qi'
  if (/化學反應|你們的化學/.test(t)) return 'cheng'
  if (/最好的地方|好的地方|優勢/.test(t)) return 'zhuan'
  if (/最該注意|需要注意|注意/.test(t)) return 'zhuan'
  if (/關係流年|你們的.*\d{4}|流年/.test(t)) return 'zhuan'

  if (/改善建議|關係處方|改善方案/.test(t)) return 'he'
  if (/刻意練習/.test(t)) return 'he'
  if (/寫給你們|寫給.*你們|給你們的話/.test(t)) return 'he'

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

  // 優先：第一個引言框
  const quoteMatch = content.match(/^>\s*\**(.+?)\**\s*$/m)
  if (quoteMatch) {
    return truncate(stripMd(quoteMatch[1]), maxLen)
  }

  // 其次：第一段純文字（跳過表格、清單、空行）
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

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
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
  return order
    .filter(k => buckets[k].length > 0)
    .map(k => ({ part: PART_META[k], chapters: buckets[k] }))
}
