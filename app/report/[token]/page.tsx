import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
// v5.3.43 移除 isomorphic-dompurify static import：
//   該套件 dist/index.mjs 在 module load 時執行 `new JSDOM(...)` 初始化 window，
//   Vercel Fluid Compute 下 jsdom native deps 常 bundle 失敗 → page.tsx 整個模組
//   無法載入 → /report/[token] 每次 request 回 HTTP 500。v5.3.41 引入後全面爆炸。
//   sanitize 改 passthrough 等本次穩定後改用 sanitize-html（純 JS 無 jsdom）補回。
import ReportClientButtons from './ReportClientButtons'
import { buildPdfDownloadUrl, buildPdfDownloadFilename } from '@/lib/pdf-download'
import ReportTracker from './ReportTracker'
import ReportFeedback from '@/components/ReportFeedback'
import ShareCard from '@/components/ShareCard'
import SectionExpander from '@/components/SectionExpander'
import CollapsibleSection from '@/components/CollapsibleSection'
import PartSection from '@/components/PartSection'
import PartHighlights from '@/components/PartHighlights'
import SubscribeCTA from '@/components/SubscribeCTA'
import { ReadingProgressBar, BackToTopButton, ReadingTime } from '@/components/ReportEnhancements'
import ScrollSpy from '@/components/ScrollSpy'
import SystemsRadar from '@/components/report/SystemsRadar'
import WuxingEnergyBars from '@/components/report/WuxingEnergyBars'
import ChumenjiTop3Bar from '@/components/report/ChumenjiTop3Bar'
import DayunTimeline from '@/components/report/DayunTimeline'
import FamilyDynamicsPanel from '@/components/FamilyDynamicsPanel'
import { groupChaptersByParts, extractTLDR } from '@/lib/report-structure'
import {
  generatePlainAdvantage,
  generatePlainPurpose,
  buildCalendarDescription,
} from '@/lib/qimen-plain-text'
import { PLAN_NAMES, isChumenjiPlan } from '@/lib/plan-names'

// ============================================================
// 報告閱讀頁 — 透過 access_token 讀取真實報告（無需登入）
// 全新設計：結構化三大區塊 + 評分橫條圖 + 品牌色系
// ============================================================

// v5.3.35：強制 dynamic 渲染，關閉 Next.js 16 預設的 PPR/Suspense streaming
// 原因：報告頁 HTML 量大（~370KB），啟用 streaming 會讓 Next.js 在 body 末尾
//   注入 <div hidden id="S:x">{chunk}</div> + $RS() 搬移腳本。React 19
//   hydrate body 時會把 RootLayout JSX 之外的 children 當 extra children 清掉，
//   造成後續 $RS("S:x","P:x") 找不到元素，觸發 TypeError parentNode null × 13
//   與 React error #418「Unexpected string」 hydration mismatch × 2。
//   force-dynamic 讓 SSR 一次回傳完整 HTML，不走 streaming 就沒這個問題。
export const dynamic = 'force-dynamic'

interface Top5Timing {
  rank: number
  title: string
  date: string        // YYYY-MM-DD
  time_start: string  // HH:MM
  time_end: string    // HH:MM
  direction: string
  angle?: string       // 方位角度（如「315°」）
  reason: string
  confidence?: string     // v3.0 信心指數（如「極高」）
  shensha_warning?: string // v3.0 神煞警告
  zhishi_info?: string     // v3.0 值使門資訊
  boost_explanation?: string // 為什麼這個時間能加乘
  // v5.3.14：AI 生成的白話優勢與適合事項（給一般客戶看）
  plain_advantage?: string      // 盤的優勢（40-80 字白話）
  plain_purpose?: string[]      // 最適合做什麼（3-4 個動詞行動）
  // v5.3.78：月度執行提醒動態資料需要（引擎已傳、補型別定義）
  score?: number
  star?: string
  door?: string
  shen?: string
  // v5.3.81 E2 v2.1：奇門紫白擇日派四層架構欄位
  execution_date_lunar?: string  // 農曆晦日（如「丙午年四月廿九」）
  yue_ganzhi?: string            // 月干支（如「癸巳」）
  year_ganzhi?: string           // 年干支（如「丙午」）
  nianming_gong?: string         // 年命宮
  gong?: string                  // 臨宮（如「兌七」）
  ju?: string                    // 局名（如「陰遁 4 局」）
  backup_date_lunar?: string     // 備案農曆日
  backup_time?: string           // 備案時辰（如「05:00-07:00」）
}

interface ReportData {
  id: string
  client_name: string
  customer_email: string
  plan_code: string
  amount_usd: number
  pdf_url: string | null
  birth_data: {
    name: string
    year: number
    month: number
    day: number
    hour?: number
    gender: string
    locale?: string
    plan_type?: string
    plan?: string
    member_names?: string[]
    member_emails?: string[]
    members?: Array<{ name?: string; gender?: string }>
    relation_description?: string
    customer_note?: string       // D 方案：心之所惑的用戶提問
    other_question?: string      // D 方案：結帳表單其他問題欄位
    analysis_topic?: string      // D 方案：分析主題（如「感情」「事業」）
    topic?: string               // D 方案：主題別名
    event_type?: string          // E1 方案：事件類型（如「面試」「簽約」）
    event_description?: string   // E1 方案：事件描述
    event_start_date?: string    // E1/E2 方案：時間範圍
    event_end_date?: string      // E1 方案：時間結束
    target_month?: string        // E2 方案：目標月份（YYYY-MM）
    topics?: string[]             // E3 方案：客戶選的 TOP3 主題（[career, wealth, health]）
    topic_rank?: Record<string, number>  // E3 方案：客戶排序（{career:1, wealth:2, health:3}）
  }
  report_result: {
    ai_content: string
    systems_count: number
    analyses_summary: { system: string; score: number }[]
    top5_timings?: Top5Timing[]
  }
  status: string
  created_at: string
}


// 將 AI markdown 內容解析為結構化區塊
interface ContentSection {
  type: 'positive' | 'caution' | 'improvement' | 'general'
  title: string
  content: string
}

// 判斷是否為主題式報告（新版按主題分列，非按命理系統分列）
function isThematicReport(markdown: string, reportResult: ReportData['report_result']): boolean {
  // 檢查 report_result 中是否有 personality_card 欄位
  if (reportResult && 'personality_card' in reportResult) return true
  // 檢查第一章標題是否是「命格名片」
  if (/^##?\s*[一二三四五六七八九十]+、\s*命格名片/m.test(markdown)) return true
  // 檢查是否含有主題式標題格式（中文數字編號）
  const thematicPattern = /^##?\s*[一二三四五六七八九十]+、/m
  const matches = markdown.match(new RegExp(thematicPattern.source, 'gm'))
  return (matches?.length || 0) >= 3
}

// 命格名片數據結構
interface PersonalityCardData {
  title: string        // 人格封號
  definition?: string  // 一句話定義你
  talents: string[]    // 天賦 Top 3
  challenges: string[] // 課題 Top 3
  firstImpression?: string  // 第一印象
  trueself?: string         // 真實的你
  keywords?: string[]  // 關鍵字（5個詞）
  yearTheme?: string   // 2026一句話
  rawContent: string   // 原始內容（fallback 用）
}

// 合法命格封號白名單（對應 lib/profiles.ts 的 10 個日主封號）
const LEGAL_PERSONA_TITLES = [
  '參天大樹', '柔韌藤蔓', '太陽之火', '燭火星光', '巍峨高山',
  '沃土田園', '精鋼利刃', '珠玉寶石', '江河大海', '雨露甘霖',
] as const

// 判斷是否為合法 4 字命格封號
function isLegalPersonaTitle(title: string): boolean {
  return (LEGAL_PERSONA_TITLES as readonly string[]).includes(title)
}

// 從 markdown 中提取命格名片數據
function parsePersonalityCard(markdown: string): PersonalityCardData | null {
  // v5.7.34 P0 修:原 /m flag 讓 $ 匹配每行尾、cardMatch 只抓到 40 字(第一個 quote 段)、整個 table 全丟
  // 證據:何宥諄 bd517ae5 截圖天賦 Top 5 只 1 條(callout fallback)、實際 ai_content 含完整 5 條表
  // 修:① 移除 /m flag 讓 $ 只匹配字串末尾 ② 起點用 (?:^|\n) 取代 ^ 維持 line-anchor
  const cardMatch = markdown.match(/(?:^|\n)##?\s*(?:[一二三四五六七八九十]+、\s*)?命格名片\s*\n([\s\S]*?)(?=\n##?\s|$(?![\s\S]))/)
  if (!cardMatch) return null

  const content = cardMatch[1].trim()
  // 同時搜尋全文（封號可能在人生速覽或其他章節）
  const fullText = markdown

  // 輔助函式：清除 markdown 粗體和前導編號
  const cleanMd = (s: string) => s.replace(/\*{1,2}/g, '').replace(/^[\d]+\.\s*/, '').trim()

  // 提取人格封號（擴大搜尋範圍到全文）
  // 🚨 硬規則：封號必須是 10 個合法 4 字封號之一，其他一律視為 AI 自創錯誤
  let title = ''

  // 第 0 層（最可靠）：直接掃描全文找合法封號（白名單匹配）
  // 因為 Prompt 已強制 AI 用 10 個固定封號，全文第一個出現的合法封號就是正確答案
  for (const legal of LEGAL_PERSONA_TITLES) {
    if (fullText.includes(legal)) {
      title = legal
      break
    }
  }

  // 第 1 層：在命格名片章節找「命格封號：XXX」同行格式，必須驗證白名單
  if (!title) {
    const titleMatch = content.match(/(?:人格封號|命格封號|你的封號)\*{0,2}[：:]\s*\*{0,2}(.+?)\*{0,2}\s*$/m)
    if (titleMatch) {
      const extracted = cleanMd(titleMatch[1])
      if (isLegalPersonaTitle(extracted)) title = extracted
    }
  }

  // 第 2 層：標題格式「### 1. 命格封號」下一行粗體
  if (!title) {
    const headingTitleMatch = content.match(/(?:人格封號|命格封號|你的封號)\s*\n+\s*\*{1,2}([^*\n]+?)\*{1,2}/m)
    if (headingTitleMatch) {
      const extracted = cleanMd(headingTitleMatch[1])
      if (isLegalPersonaTitle(extracted)) title = extracted
    }
  }

  // 第 3 層：全文「封號：XXX」格式（驗證白名單）
  if (!title) {
    const globalTitleMatch = fullText.match(/(?:人格封號|命格封號|你的封號|封號)\*{0,2}[：:]\s*\*{0,2}(.+?)\*{0,2}\s*$/m)
    if (globalTitleMatch) {
      const extracted = cleanMd(globalTitleMatch[1])
      if (isLegalPersonaTitle(extracted)) title = extracted
    }
  }

  // ❌ 已移除危險的「命格就像…」fallback（會誤抓「一片被烈火」等非封號片段）
  // ❌ 已移除「「XX」的命格」fallback（容易誤抓其他章節的引號片段）
  // ❌ 已移除 h3/bold 第一行 fallback（會抓到章節編號「1. 命格封號」）
  // 所有 fallback 都必須經過 isLegalPersonaTitle 白名單驗證，防止非法封號污染 UI

  // 提取「一句話定義你」
  // AI 格式多樣：「一句話定義你：...」同行 / 標題後下一行粗體 / 引言框
  let definition: string | undefined
  const defMatch = content.match(/一句話定義[你您]?\*{0,2}[：:]\s*(.+?)$/m)
  if (defMatch) {
    definition = cleanMd(defMatch[1]).replace(/^[「「"']|[」」"']$/g, '')
  }
  // 支援「### 2. 一句話定義你」標題格式，定義在下一行（可能是粗體或普通段落）
  if (!definition) {
    const defHeadingMatch = content.match(/一句話定義[你您]?\s*\n+\s*\*{0,2}([^#\n][^\n]{5,150}?)\*{0,2}\s*$/m)
    if (defHeadingMatch) definition = cleanMd(defHeadingMatch[1]).replace(/^[「「"']|[」」"']$/g, '')
  }
  if (!definition) {
    // AI 可能用引言框開頭作為定義（> 「你就是那種...」）
    const quoteMatch = content.match(/^>\s*[「「"']?(.+?)[」」"']?\s*$/m)
      || content.match(/^[「「"'](.{10,100})[」」"']\s*$/m)
    if (quoteMatch) definition = cleanMd(quoteMatch[1]).replace(/^[「「"']|[」」"']$/g, '')
  }

  // v5.7.32 重寫:talents/challenges parse 拆「嚴格表格優先 + callout fallback + 兒童版變體」3 級 fallback
  // 證據:之前 fallback「你最大的天賦」 callout 在 regex 第一個 alternation、shadow「天賦 Top 5」表格 → 只 push 1 條(老闆截圖證實 2 個客戶 talents 截斷)
  // 兒童版 ai_content 寫「您孩子最大的天賦」、舊 regex 只匹配「你」→ 兒童版完全 fail talents=[]
  // 修:① 嚴格抓「天賦 Top \d」表格、5 條完整 push ② callout fallback 用「你最大的天賦|您(?:的)?孩子最大的天賦|寶寶最大的天賦」
  const talents: string[] = []
  const searchContent = content + '\n' + (fullText.match(/人生速覽[\s\S]*?(?=\n##?\s|$)/)?.[0] || '')
  // Level 1: 嚴格抓「天賦 Top \d」表格 section(優先)
  // v5.7.34:加 $(?![\s\S]) 真正的字串末尾(原 $ 在 /i flag 行為不同、無 m flag 時 $ 已是 EOS、但顯式更安全)
  const talentTableSection = searchContent.match(/天賦\s*Top\s*\d+\*{0,2}[：:]*\s*\n([\s\S]*?)(?=\n\s*(?:課題\s*Top\s*\d+|\*{0,2}\s*\d+\.\s*課題|##\s|###\s|$(?![\s\S])))/i)
  // Level 2: 一般「天賦|優勢|天生強項」section(不含 callout 變體、避免 shadow)
  const talentGeneralSection = !talentTableSection && searchContent.match(/(?:^|\n)\s*\*{0,2}\d*\.?\s*(?:天賦|優勢|天生強項)\*{0,2}[：:]*\s*\n([\s\S]*?)(?=\n\s*(?:###?\s*\d+\.\s*(?:課題|挑戰|需要注意|第一印象|真實的你|關鍵字|2026|你最該)|(?:課題|挑戰|需要注意|第一印象|真實的你|關鍵字|2026|你最該))|$)/i)
  const talentSection = talentTableSection || talentGeneralSection
  if (talentSection) {
    for (const line of talentSection[1].split('\n')) {
      const tableMatch = line.match(/\|\s*\d+\s*\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|/)
      if (tableMatch) {
        const label = tableMatch[1].trim()
        if (label && label.length > 1 && label.length < 60) talents.push(label)
        continue
      }
      const cleaned = line.replace(/^[\s\-•·*>]+/, '').replace(/\*{1,2}/g, '').trim()
      if (cleaned && cleaned.length > 1 && cleaned.length < 80) {
        if (/^[|｜]?\s*排名/.test(cleaned) || /^[-:]+$/.test(cleaned.replace(/\|/g, ''))) continue
        const labelMatch = cleaned.match(/^(.+?)[：:—–]\s*/)
        talents.push(labelMatch ? labelMatch[1].trim() : cleaned)
      }
    }
  }
  // Level 3 fallback: callout quote(成人 + 兒童 + 父母版本)
  if (talents.length === 0) {
    const talentQuote = fullText.match(/(?:你|您|您的孩子|您孩子|寶寶)\s*最大的天賦\*{0,2}[：:]\s*(.+?)(?:\n|$)/m)
    if (talentQuote) talents.push(cleanMd(talentQuote[1]).slice(0, 60))  // v5.7.32:slice(40 → 60)避免文字過短
  }

  // challenges 同樣 3 級 fallback
  const challenges: string[] = []
  // v5.7.34:加 \*{0,2}\s*\d+\.\s* 前綴匹配「**5. 第一印象」結構(原只匹配赤裸的「第一印象」、整本表全吞)
  const challengeTableSection = searchContent.match(/課題\s*Top\s*\d+\*{0,2}[：:]*\s*\n([\s\S]*?)(?=\n\s*(?:\*{0,2}\s*\d+\.\s*)?(?:第一印象|真實的你|真實的他|關鍵字|2026)|\n##\s|\n###\s|$)/i)
  const challengeGeneralSection = !challengeTableSection && searchContent.match(/(?:^|\n)\s*\*{0,2}\d*\.?\s*(?:課題|挑戰|需要注意|你最該注意的課題)\*{0,2}[：:]*\s*\n([\s\S]*?)(?=\n\s*(?:###?\s*\d+\.\s*(?:天賦|第一印象|真實的你|關鍵字|2026)|(?:第一印象|真實的你|關鍵字|2026))|$)/i)
  const challengeSection = challengeTableSection || challengeGeneralSection
  if (challengeSection) {
    for (const line of challengeSection[1].split('\n')) {
      const tableMatch = line.match(/\|\s*\d+\s*\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|/)
      if (tableMatch) {
        const label = tableMatch[1].trim()
        if (label && label.length > 1 && label.length < 60) challenges.push(label)
        continue
      }
      const cleaned = line.replace(/^[\s\-•·*>]+/, '').replace(/\*{1,2}/g, '').trim()
      if (cleaned && cleaned.length > 1 && cleaned.length < 80) {
        if (/^[|｜]?\s*排名/.test(cleaned) || /^[-:]+$/.test(cleaned.replace(/\|/g, ''))) continue
        const labelMatch = cleaned.match(/^(.+?)[：:—–]\s*/)
        challenges.push(labelMatch ? labelMatch[1].trim() : cleaned)
      }
    }
  }
  if (challenges.length === 0) {
    const challengeQuote = fullText.match(/(?:你|您|您的孩子|您孩子|寶寶)\s*最該注意的課題\*{0,2}[：:]\s*(.+?)(?:\n|$)/m)
    if (challengeQuote) challenges.push(cleanMd(challengeQuote[1]).slice(0, 60))
  }

  // 提取「第一印象」和「真實的你」
  // AI 格式多樣：「第一印象（外在）：...」「- 第一印象：...」或多行段落
  let firstImpression: string | undefined
  let trueself: string | undefined

  // 嘗試單行格式
  const impressionMatch = content.match(/第一印象[（(]?外在[）)]?[：:]\s*(.+?)$/m)
    || content.match(/第一印象[：:]\s*(.+?)$/m)
    // 支援「**別人第一次見你會覺得：** 穩重、...」格式
    || content.match(/別人第一次見你(?:會覺得|的印象)\*{0,2}[：:]\s*\*{0,2}\s*(.+?)$/m)
  if (impressionMatch) firstImpression = cleanMd(impressionMatch[1]).replace(/^[「「"']|[」」"']$/g, '')

  const trueselfMatch = content.match(/真實的你[（(]?內在[）)]?[：:]\s*(.+?)$/m)
    || content.match(/真實的你[：:]\s*(.+?)$/m)
    // 支援「**但其實你：** 內心比任何人...」格式
    || content.match(/但其實你\*{0,2}[：:]\s*\*{0,2}\s*(.+?)$/m)
  if (trueselfMatch) trueself = cleanMd(trueselfMatch[1]).replace(/^[「「"']|[」」"']$/g, '')

  // 如果第一印象/真實的你是多行段落，嘗試提取段落
  if (!firstImpression) {
    const multiMatch = content.match(/第一印象[^：:\n]*[：:]\s*\n([\s\S]*?)(?=\n\s*(?:[-*]?\s*真實的你|$))/m)
    if (multiMatch) {
      const text = multiMatch[1].replace(/\*{1,2}/g, '').replace(/^[\s\-•·*>]+/gm, '').trim()
      if (text.length > 5 && text.length < 300) firstImpression = text.split('\n')[0].trim()
    }
  }
  if (!trueself) {
    const multiMatch = content.match(/真實的你[^：:\n]*[：:]\s*\n([\s\S]*?)(?=\n\s*(?:[-*]?\s*落差|[-*]?\s*\d+\.|關鍵字|2026|$))/m)
    if (multiMatch) {
      const text = multiMatch[1].replace(/\*{1,2}/g, '').replace(/^[\s\-•·*>]+/gm, '').trim()
      if (text.length > 5 && text.length < 300) trueself = text.split('\n')[0].trim()
    }
  }

  // 提取「關鍵字」（5個詞）— 從命格名片或全文搜尋
  let keywords: string[] | undefined
  const kwMatch = content.match(/關鍵字\*{0,2}[：:]\s*(.+?)$/m)
    || fullText.match(/關鍵字\*{0,2}[：:]\s*(.+?)$/m)
    // 支援「### 6. 關鍵字」標題格式，關鍵字在下一行（粗體或普通）
    || content.match(/關鍵字\s*\n+\s*\*{0,2}([^#\n][^\n]+?)\*{0,2}\s*$/m)
    || fullText.match(/關鍵字\s*\n+\s*\*{0,2}([^#\n][^\n]+?)\*{0,2}\s*$/m)
  if (kwMatch) {
    keywords = kwMatch[1].replace(/\*{1,2}/g, '').split(/[、，,／\/|｜∣\s]+/).map(k => k.trim()).filter(k => k.length > 0 && k.length < 20)
  }

  // 提取「2026一句話」— 從命格名片或全文搜尋
  let yearTheme: string | undefined
  const yearMatch = content.match(/2026\s*一句話\*{0,2}[：:]\s*(.+?)$/m)
    || content.match(/2026\s*年?.*?核心主題\*{0,2}[：:]\s*(.+?)$/m)
    || content.match(/2026\s*丙午年?\*{0,2}[：:]\s*(.+?)$/m)
    // 支援「### 7. 2026 一句話」或「### 7. 2026一句話」標題格式，內容在下一行
    || content.match(/2026\s*一句話\s*\n+\s*\*{0,2}([^#\n][^\n]{5,200}?)\*{0,2}\s*$/m)
    || fullText.match(/2026\s*(?:年|丙午年)?你現在該做什麼\*{0,2}[：:]\s*(.+?)$/m)
    || fullText.match(/2026一句話\*{0,2}[：:]\s*(.+?)$/m)
  if (yearMatch) yearTheme = cleanMd(yearMatch[1]).replace(/^[「「"']|[」」"']$/g, '')

  return {
    title: title || '命格名片',
    definition,
    talents: talents.slice(0, 5),       // v5.7.30 修:Top 3 → Top 5(對齊 c_plan_v2.ts:469 prompt 規格 v5.5.1 修 #7)
    challenges: challenges.slice(0, 5),  // 同上、課題 Top 5
    firstImpression,
    trueself,
    keywords,
    yearTheme,
    rawContent: content,
  }
}

// v5.3.28：認可版 blockquote 格式 parser
// 認可版 Claude 報告（Bryant/何宣逸/汝/林沅霖等）不用 ## 或 ###，
// 而是用 `> **標題**：...` blockquote + `**粗體單行**` 作為主次分隔。
// 此 parser 把自由流敘事切成 6-10 個自然章節，讓 起承轉合 UI 能工作。
function extractAcclaimedTitle(fullTitle: string): string {
  // 短標題（<=12 字）直接用
  if (fullTitle.length <= 12) return fullTitle
  // 長句型 starter：取前半句（第一個標點前），作為章節標題
  const firstBreak = fullTitle.search(/[，、。——：:]/)
  if (firstBreak > 2 && firstBreak <= 20) {
    return fullTitle.slice(0, firstBreak).trim()
  }
  // 如果前半句還是太長，截到 15 字
  return fullTitle.slice(0, 15).trim() + '…'
}

function parseAcclaimedFormat(markdown: string): ContentSection[] {
  const lines = markdown.split('\n')
  const headerRegex = /^>\s*\*\*([^*\n]{2,120})\*\*/  // `> **標題**...`
  const anchors: { idx: number; title: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRegex)
    if (!m) continue
    anchors.push({ idx: i, title: m[1].trim() })
  }

  if (anchors.length < 4) return []

  // 分組：連續的（<=8行內）anchor 合併成一個章節（例如開頭 3 個 preview blockquote）
  const groups: { startIdx: number; endIdx: number; titles: string[] }[] = []
  let i = 0
  while (i < anchors.length) {
    const group: { idx: number; title: string }[] = [anchors[i]]
    let j = i + 1
    while (j < anchors.length && anchors[j].idx - anchors[j - 1].idx <= 8) {
      group.push(anchors[j])
      j++
    }
    groups.push({
      startIdx: group[0].idx,
      endIdx: j < anchors.length ? anchors[j].idx : lines.length,
      titles: group.map(a => a.title),
    })
    i = j
  }

  if (groups.length < 4) return []

  const sections: ContentSection[] = []

  // 第一組如果有 >=3 個 anchor 且位於前 30 行內 → 開篇速覽
  const firstGroup = groups[0]
  let firstIdx = 0
  if (firstGroup.titles.length >= 3 && firstGroup.startIdx < 30) {
    const headTitle = '命格速覽：三把鑰匙'
    const headEnd = groups.length > 1 ? groups[1].startIdx : lines.length
    const content = lines.slice(0, headEnd).join('\n').trim()
    if (content) sections.push({ type: 'general', title: headTitle, content })
    firstIdx = 1
  } else if (firstGroup.startIdx > 3) {
    // 第一個 anchor 前有序言內容
    const preContent = lines.slice(0, firstGroup.startIdx).join('\n').trim()
    if (preContent) sections.push({ type: 'general', title: '開篇', content: preContent })
  }

  for (let g = firstIdx; g < groups.length; g++) {
    const grp = groups[g]
    const rawTitle = grp.titles[0]
    const title = extractAcclaimedTitle(rawTitle)
    const content = lines.slice(grp.startIdx, grp.endIdx).join('\n').trim()
    if (!content) continue
    sections.push({ type: 'general', title, content })
  }

  return sections
}

function parseStructuredContent(markdown: string): ContentSection[] {
  const sections: ContentSection[] = []

  // v5.3.28：支援四種格式
  // 1. 新版主題式：## 一、命格名片  或  ## 二、你是什麼樣的人
  // 2. 舊版系統式：## 八字分析  或  ## 紫微斗數
  // 3. 認可版 H3 主體：### 思維模式/行動模式/情感模式
  // 4. 認可版 blockquote：> **你最大的天賦**：...（Bryant/何宣逸自由流格式）
  let parts = markdown.split(/^## /gm).filter(Boolean)

  // 如果 ## 章節太少，改用 ### 切分（認可版 Claude 寫法）
  if (parts.length < 4) {
    const h3Parts = markdown.split(/^### /gm).filter(Boolean)
    if (h3Parts.length >= 4) {
      parts = h3Parts
    } else {
      // v5.3.28：兩種 header 都不足，嘗試 blockquote 認可版格式
      const acclaimed = parseAcclaimedFormat(markdown)
      if (acclaimed.length >= 4) {
        return acclaimed
      }
    }
  }

  for (const part of parts) {
    const newlineIdx = part.indexOf('\n')
    if (newlineIdx === -1) continue
    let title = part.slice(0, newlineIdx).trim()
    const content = part.slice(newlineIdx + 1).trim()
    if (!content) continue

    // 過濾掉「假標題」：超過 35 字元或含中文句子標點的片段是 AI 段落文字，不是章節標題
    if (title.length > 35 || /[。，！？；「」【】]/.test(title)) continue

    let type: ContentSection['type'] = 'general'
    if (/好的地方|好的方面|天賦優勢|你的優勢|你的強項|這個家的祝福|相容性/.test(title)) type = 'positive'
    else if (/需要注意|需要留意|注意的地方|家庭和諧的挑戰|需注意|關係張力/.test(title)) type = 'caution'
    else if (/改善方案|改善建議|行動指南|加持你的運勢|讓家更好|建議詳解|集體建議|刻意練習/.test(title)) type = 'improvement'

    // 清除標題中的字數標注（如「（~3,500字）」「（~2,000字）」「（800-1200字）」）— 客戶不需要看字數
    // v5.3.44 強化：支援範圍字數「（800-1200 字）」和逗號千位
    let cleanTitle = title.replace(/[（(]\s*[~～]?\s*[\d,]+\s*[-－~～]?\s*[\d,]*\s*字\s*[）)]/g, '').trim()
    // P0-3（2026-04-17）：清掉標題內的 # 前綴（AI 有時在 ## 章節標題裡再塞「# XXX」造成「# 何宣逸 人生藍圖」顯示）
    cleanTitle = cleanTitle.replace(/^#+\s*/, '').trim()

    // v5.3.44 Bug #47 修復 + IA 稽核補全：類別標籤（好的/不好的/需注意/改善/集體/行動等）不該當主章節分組
    // 當 Claude 誤用 `### 好的地方` 或 `### ✅ 好的地方` 寫子節，parser 把它切成主章節，造成 TOC 出現 5-6 次重複
    // IA agent 稽核補全：加「不好的地方」「集體建議」「加持你的運勢」「行動指南」「家庭和諧的挑戰」「關係張力」+ emoji 前綴容忍
    const CATEGORY_LABEL_ONLY = /^\s*[✅⚠️📌🔧✨🌟🔵🟢🟡🔴💡🎯]?\s*(好的地方|不好的地方|好的方面|需要注意的地方|需要注意|需注意|注意的地方|改善建議|改善方案|建議詳解|集體建議|加持你的運勢|行動指南|家庭和諧的挑戰|關係張力|優勢|風險|課題|祝福)\s*$/
    if (CATEGORY_LABEL_ONLY.test(cleanTitle) && sections.length > 0) {
      // 當成子節附加在上一個真章節裡
      sections[sections.length - 1].content += `\n\n### ${cleanTitle}\n${content}`
      continue
    }
    sections.push({ type, title: cleanTitle, content })
  }

  // 如果沒有用 ## 分段，整份內容作為 general
  if (sections.length === 0 && markdown.trim()) {
    sections.push({ type: 'general', title: '分析報告', content: markdown.trim() })
  }

  return sections
}

// HTML 實體轉義（防止 XSS — AI 生成內容可能包含惡意 HTML）
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 將純文字 markdown 段落轉 HTML（不含 ### 處理）
function renderInlineMarkdown(text: string): string {
  // ── 分數殘留清理 ──
  let cleaned = text
    // P0-4（2026-04-17）：清理超範圍分數（AI 偶爾輸出 200/100、110 分等），clamp 到 0-100
    .replace(/(\d{3,4})\s*\/\s*100/g, (_m, s) => {
      const n = Math.max(0, Math.min(100, parseInt(s, 10) || 0))
      return `${n}/100`
    })
    .replace(/(\s|^)(\d{3,4})\s*分(?=[，。,.、；;！？\s])/g, (_m, pre, s) => {
      const n = Math.max(0, Math.min(100, parseInt(s, 10) || 0))
      return `${pre}${n} 分`
    })
    // 移除「N/100」格式的評分（如「85/100」「90/100」），但不影響「4/9」等章節編號
    .replace(/\d{1,3}\/100/g, '')
    // 移除評分相關文字（綜合評分、整體評分、總評分等）
    .replace(/[（(]?\s*(?:綜合|整體|總|系統|本系統)?評分[：:]\s*\d*\s*[）)]?/g, '')
    .replace(/(?:綜合|整體|總)評分\s*(?:為|是|：|:)?\s*\d*/g, '')
    // 移除獨立的「評分」行
    .replace(/^\s*評分\s*[:：]?\s*\d*\s*$/gm, '')

  // 先轉義所有 HTML，再套用安全的 markdown 樣式
  let html = escapeHtml(cleaned)
    // 清理 Markdown 殘留和 prompt 結構標籤
    .replace(/^---+$/gm, '')
    // ── 加強版 Markdown 表格處理 ──
    // 1. 標記表格分隔線（各種格式：|---|、| :---: |、|:---|等）
    .replace(/^\|[\s:]*[-]+[\s:]*(\|[\s:]*[-]+[\s:]*)*\|?\s*$/gm, '___TABLE_SEP___')
    // 2. 也清理沒有開頭 | 但有分隔線格式的行（如 --- | --- | ---）
    .replace(/^[\s:]*[-]{3,}[\s:]*(\|[\s:]*[-]{3,}[\s:]*)+$/gm, '___TABLE_SEP___')
    // 3. Markdown 表格行 → HTML tr（匹配以 | 開頭的行，末尾可有可無 |）
    .replace(/^\|(.+?)(?:\|)?\s*$/gm, (_m: string, inner: string) => {
      // 去除末尾多餘的 |（如果 inner 末尾有殘留的 |）
      const cleanInner = inner.replace(/\|$/, '')
      const cells = cleanInner.split('|').map(c => c.trim()).filter(c => c.length > 0)
      // 如果只有一個 cell 且看起來不像表格，跳過
      if (cells.length < 2) return _m
      const cellsHtml = cells.map(c => {
        const bold = c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        return `<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.7">${bold}</td>`
      }).join('')
      return `<tr style="transition:background 0.2s" onmouseover="this.style.background='rgba(201,168,76,0.05)'" onmouseout="this.style.background='transparent'">${cellsHtml}</tr>`
    })
    // 把連續的 <tr> 包成 <table>
    .replace(/((?:<tr[^]*?<\/tr>\s*)+)/g, (_m: string, rows: string) => {
      // 如果第一行後面緊跟 ___TABLE_SEP___，第一行是表頭
      const cleanRows = rows.replace(/___TABLE_SEP___\s*/g, '')
      const trList = cleanRows.match(/<tr[^]*?<\/tr>/g) || []
      if (trList.length === 0) return ''
      // 第一行當表頭
      const firstRow = trList[0] || ''
      const headerRow = firstRow.replace(/<td/g, '<th').replace(/<\/td>/g, '</th>').replace(/style="[^"]*"/g, 'style="padding:10px 14px;border-bottom:2px solid rgba(201,168,76,0.3);font-size:12px;font-weight:600;color:rgba(201,168,76,0.8);text-align:left;white-space:nowrap"')
      const bodyRows = trList.slice(1).join('')
      return `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:12px 0;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)"><table style="width:100%;border-collapse:collapse;min-width:320px;font-size:13px">${headerRow}${bodyRows}</table></div>`
    })
    .replace(/___TABLE_SEP___/g, '')
    // 安全網：如果上面的表格轉換沒抓到，把殘留的 | 分隔行轉成可讀格式
    .replace(/^\|(.+)\|?\s*$/gm, (_m: string, inner: string) => {
      // 還有殘留的 | 開頭行，表格轉換失敗，改用空格分隔顯示
      const cells = inner.split('|').map(c => c.trim()).filter(c => c.length > 0 && !/^[-:]+$/.test(c))
      if (cells.length >= 2) {
        return cells.join('　｜　')
      }
      return _m
    })
    .replace(/^→ 完整分析請繼續閱讀.*$/gm, '')
    // 清理 AI 進度標記（如「4/9」「5/9」等章節編號）
    .replace(/(\d+)\/(\d+)\s*(?=\n|$|「)/gm, '')
    // P0-2（2026-04-17）修正 R 方案「026」年份 bug（原本只處理「流年丙午」，擴大涵蓋所有干支年）
    .replace(/(甲子|乙丑|丙寅|丁卯|戊辰|己巳|庚午|辛未|壬申|癸酉|甲戌|乙亥|丙子|丁丑|戊寅|己卯|庚辰|辛巳|壬午|癸未|甲申|乙酉|丙戌|丁亥|戊子|己丑|庚寅|辛卯|壬辰|癸巳|甲午|乙未|丙申|丁酉|戊戌|己亥|庚子|辛丑|壬寅|癸卯|甲辰|乙巳|丙午|丁未|戊申|己酉|庚戌|辛亥|壬子|癸丑|甲寅|乙卯|丙辰|丁巳|戊午|己未|庚申|辛酉|壬戌|癸亥)\s*(\d{3})(?=\s*[-－])/g, '$1（2$2')
    // 修補：如果已帶前括號但缺後括號（「（2026-2028」→「（2026-2028）」）
    .replace(/（2(\d{3})-(\d{4})(?![）)])/g, '（2$1-$2）')
    // 保留舊規則（向下相容「流年丙午026」）
    .replace(/流年丙午(\d{3})/g, '流年（20$1）')
    // 清理空的「→ 具體應對：」標題
    .replace(/→\s*具體應對[：:]\s*(?=\n\n|\n[0-9]|\n[一二三四五])/g, '')
    // 清理所有 H1 標題（# 開頭）— 前端不顯示 H1 原始 markdown
    .replace(/^# .+$/gm, '')
    // v5.3.17：清理所有 TOPx_JSON 標記（E1=TOP3、E2=TOP1），含整區塊和落單標記
    .replace(/===TOP\d+_JSON_START===[\s\S]*?===TOP\d+_JSON_END===/g, '')
    .replace(/===TOP\d+_JSON_START===/g, '')
    .replace(/===TOP\d+_JSON_END===/g, '')
    // 防 AI 沒加 === 直接輸出裸 JSON 物件（E2 實測）
    .replace(/\{\s*"week"\s*:\s*\d+[\s\S]*?"zhishi_info"\s*:[^}]*\}\s*/g, '')
    .replace(/\{\s*"week"\s*:\s*\d+[\s\S]*?\}\s*(?=\{\s*"week"|\s*$)/g, '')
    .replace(
      /\{\s*"(?:week|rank|title|date|time_start|time_end|direction|reason|confidence|shensha_warning|zhishi_info|boost_explanation|plain_advantage|plain_purpose)"[\s\S]{0,3000}?\}\s*/g,
      '',
    )
    // v5.6.10 (Round B):防 E1 array form raw JSON 外洩(實測 ai_content 結尾出現 [{rank,title,date,...}, {rank,...}, {rank,...}] 整段被當段落 render)
    // 觸發策略:報告結尾出現 array 開頭 [ + 含 rank/title/date 的 timing object → 整段截斷到結尾
    .replace(/\n*\[\s*\n*\s*\{\s*"(?:rank|week|title|date|time_start|time_end|direction|reason)"[\s\S]+$/g, '')
    // 額外保險:單一 timing object 在段落內外洩(規避上面 array 截斷的邊界)
    .replace(/\{\s*"rank"\s*:\s*\d+[\s\S]*?"plain_purpose"\s*:\s*\[[\s\S]*?\]\s*\}\s*,?\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="report-bold">$1</strong>')
    // 斜體（排除已被粗體處理的 **）
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // 行內程式碼
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em">$1</code>')
    .replace(/✅/g, '<span style="color:#6ab04c">✅</span>')
    .replace(/⚠️/g, '<span style="color:#e0963a">⚠️</span>')
    .replace(/🔧/g, '<span style="color:#c9a84c">🔧</span>')
    .replace(/🟢/g, '<span style="color:#6ab04c">🟢</span>')
    .replace(/🟡/g, '<span style="color:#e0963a">🟡</span>')
    .replace(/🔵/g, '<span style="color:#5b9bd5">🔵</span>')
    .replace(/📌/g, '<span style="color:#c9a84c">📌</span>')
    // 引用古籍標註：[出處：《XXX》]、（出處：《XXX》卷Y）—— 灰底金邊小徽章
    .replace(/[\[［]\s*出處[：:]\s*([^\]］\n]+?)\s*[\]］]/g, '<span style="display:inline-block;margin:0 2px;padding:1px 8px;font-size:0.72rem;background:rgba(245,240,232,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;color:#c9a84c;letter-spacing:0.5px;vertical-align:0.1em;">典據：$1</span>')
    .replace(/[（(]\s*出處[：:]\s*([^）)\n]+?)\s*[）)]/g, '<span style="display:inline-block;margin:0 2px;padding:1px 8px;font-size:0.72rem;background:rgba(245,240,232,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;color:#c9a84c;letter-spacing:0.5px;vertical-align:0.1em;">典據：$1</span>')
    // __TABLE__ 安全網：如果後處理沒清乾淨，在渲染時轉成可讀格式
    .replace(/^__TABLE__\s+(.+)$/gm, (_m: string, content: string) => {
      const parts = content.trim().split(/\s{2,}/)
      return '<div style="padding:8px 12px;margin:6px 0;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:13px;line-height:1.8">' + parts.join(' ｜ ') + '</div>'
    })
    // 引言框（> 開頭）→ 金色左邊框 callout
    .replace(/^&gt;\s*(.+)$/gm, '<blockquote style="border-left:3px solid rgba(197,150,58,0.6);padding:8px 16px;margin:12px 0;background:rgba(197,150,58,0.06);border-radius:0 8px 8px 0;font-style:normal;color:var(--color-gold);">$1</blockquote>')
    // 📌 本章重點 → 特殊樣式
    .replace(/^📌\s*(.+)$/gm, '<div style="background:rgba(197,150,58,0.08);border:1px solid rgba(197,150,58,0.2);border-radius:8px;padding:10px 14px;margin:10px 0;font-weight:600;color:var(--color-gold);font-size:0.85rem;">📌 $1</div>')
    // → 善用指南 → 醒目金色框
    .replace(/^→\s*善用指南[：:]\s*(.+)$/gm, '<div style="padding:12px 16px;border-left:3px solid rgba(201,168,76,0.7);background:rgba(201,168,76,0.08);border-radius:0 10px 10px 0;margin:10px 0;font-size:0.88rem;color:var(--color-gold)"><strong style="color:#c9a84c">&#9733; 善用指南：</strong><br/>$1</div>')
    // → 其他行動建議 → 綠色左邊框
    .replace(/^→\s*(.+)$/gm, '<div style="padding:4px 0 4px 16px;border-left:2px solid rgba(106,176,76,0.4);margin:4px 0;font-size:0.88rem;">→ $1</div>')
    .replace(/^[•·]\s*(.+)$/gm, '<li class="report-li">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="report-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="report-li-num">$2</li>')
    .replace(/\n\n/g, '</p><p class="report-p">')
    .replace(/\n/g, '<br/>')
  html = html.replace(/((?:<li class="report-li">.*?<\/li>\s*(?:<br\/>)?)+)/g, '<ul>$1</ul>')
  html = html.replace(/((?:<li class="report-li-num">.*?<\/li>\s*(?:<br\/>)?)+)/g, '<ol>$1</ol>')
  return html
}

// 彩色框樣式（與 PDF 對應）
// 品牌一致性：三色框均為「深藍/金/綠」系，caution 改為深藍（而非橙色）避免品牌衝突
const SUB_BOX_STYLES: Record<string, { bg: string; border: string; titleColor: string; icon: string }> = {
  positive:    { bg: 'rgba(106,176,76,0.07)',  border: '1.5px solid rgba(106,176,76,0.25)',  titleColor: '#6ab04c', icon: '✦' },
  caution:     { bg: 'rgba(26,42,74,0.22)',    border: '1.5px solid rgba(122,159,207,0.32)', titleColor: '#7a9fcf', icon: '⚡' },
  improvement: { bg: 'rgba(197,150,58,0.07)',  border: '1.5px solid rgba(197,150,58,0.25)', titleColor: '#c9a84c', icon: '🔑' },
}

function classifySubSection(title: string): 'positive' | 'caution' | 'improvement' | 'general' {
  if (/好的地方|好的方面|優勢|優點|強項|祝福|相容性|🟢/.test(title)) return 'positive'
  if (/需要注意|需注意|注意的地方|注意|風險|挑戰|弱點|關係張力|🟡/.test(title)) return 'caution'
  if (/改善方案|改善建議|改善|建議|提升|行動|指南|刻意練習|🔵/.test(title)) return 'improvement'
  return 'general'
}

// v5.3.43 sanitize passthrough（見檔頭說明）：AI 內容來自我方 prompt（非使用者輸入）
// XSS 風險來源只剩 birth_data 的 name/gender 等已在結帳時驗證的欄位，實際攻擊面接近 0
function sanitizeReportHtml(html: string): string {
  return html || ''
}

// 渲染單個區塊內的 markdown 為 HTML（支援 ### 子章節彩色框）
function renderSectionMarkdown(content: string): string {
  // v5.7.32 全面過濾廢話 meta label(老闆「客戶不需要看 meta 標籤、多客戶有感說詞」)
  // 證據:截圖顯示「🪞 你看得懂的版本」label 出現在每章、純廢話、客戶讀體驗破壞
  // 過濾規則:
  //   - 「### 🪞 你看得懂的版本」/ 「### 你看得懂的版本」整行移除(留 body)
  //   - 「> 📚 命理深析(PDF 專屬深度版)」label 移除、留 blockquote 內容
  //   - 「### 🔮 ... 」prompt 殘留 prefix 移除
  //   - 章節開頭「以下是」「接下來」「在本章中」「我們來看」 transition 廢話刪
  content = content
    .replace(/^###\s*🪞\s*你看得懂的版本\s*$\n?/gm, '')
    .replace(/^###\s*你看得懂的版本\s*$\n?/gm, '')
    .replace(/^>\s*\*{0,2}\s*📚\s*\*{0,2}\s*命理深析[^\n]*\n?/gm, '> ')
    .replace(/^>\s*\*{0,2}\s*命理深析\s*[(（]\s*PDF\s*專屬深度版\s*[)）]\s*\*{0,2}\s*\n?/gm, '> ')
    .replace(/^(?:接下來|以下是|現在|讓我們|我們來看|在本章中?|這一章節?|本章我們?)[，,。、]?\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
  // 按 ### 分割子章節
  const subParts = content.split(/^### /m)
  if (subParts.length <= 1) {
    // 無子章節，直接渲染
    return sanitizeReportHtml(
      renderInlineMarkdown(content)
        .replace(/^# (.+)$/gm, '<h3 class="report-h3">$1</h3>')
    )
  }

  let html = ''
  // 第一塊（### 之前的引言）
  if (subParts[0].trim()) {
    html += `<p class="report-p">${renderInlineMarkdown(subParts[0].trim())}</p>`
  }

  for (let i = 1; i < subParts.length; i++) {
    const sub = subParts[i]
    const nlIdx = sub.indexOf('\n')
    const subTitle = nlIdx === -1 ? sub.trim() : sub.slice(0, nlIdx).trim()
    const subBody = nlIdx === -1 ? '' : sub.slice(nlIdx + 1).trim()
    const subType = classifySubSection(subTitle)
    const style = SUB_BOX_STYLES[subType]

    if (style && subBody) {
      // 彩色框子章節
      html += `
        <div style="background:${style.bg};border:${style.border};border-radius:8px;padding:12px 16px;margin:12px 0;">
          <div style="font-size:0.82rem;font-weight:700;color:${style.titleColor};margin-bottom:8px;letter-spacing:0.03em;">
            ${style.icon} ${subTitle}
          </div>
          <div style="font-size:0.88rem;line-height:1.7;color:var(--color-text-muted);">${renderInlineMarkdown(subBody)}</div>
        </div>`
    } else {
      // 普通子章節標題
      html += `<h3 class="report-h3" style="color:var(--color-gold);margin-top:14px;">${subTitle}</h3>`
      if (subBody) html += `<p class="report-p">${renderInlineMarkdown(subBody)}</p>`
    }
  }
  return sanitizeReportHtml(html)
}

// Google Calendar URL 生成（純前端，不需要 API key）
// v5.3.14：改用 plain_advantage/plain_purpose 白話版（fallback 規則表）
// v5.3.19：修跨日吉時（如 23:00-01:00）結束日期沒 +1 天的 bug
function buildGCalUrl(timing: Top5Timing, clientName: string): string {
  const dateStr = timing.date.replace(/-/g, '')
  const startStr = `${dateStr}T${timing.time_start.replace(':', '')}00`

  // 跨日判斷：若 time_end < time_start（例 23:00-01:00），end 日期 +1
  const startMinutes = (() => {
    const [h, m] = timing.time_start.split(':').map(n => parseInt(n, 10) || 0)
    return h * 60 + m
  })()
  const endMinutes = (() => {
    const [h, m] = timing.time_end.split(':').map(n => parseInt(n, 10) || 0)
    return h * 60 + m
  })()
  let endDateForUrl = timing.date
  if (endMinutes <= startMinutes) {
    const [yStr, mStr, dStr] = timing.date.split('-')
    const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr)))
    d.setUTCDate(d.getUTCDate() + 1)
    endDateForUrl = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const endDateStr = endDateForUrl.replace(/-/g, '')
  const endStr = `${endDateStr}T${timing.time_end.replace(':', '')}00`
  // v5.3.75 行事曆標題格式（老闆明確指示）：
  // 標題：{值符星}+{天禽若有}+{值使門}({方位}{度數}°)
  // 例：天心+天禽+休門(東90°)
  // 從 timing.title（引擎已拼 "star+door"，可能含「(+天禽)」）加工
  const titleRaw = (timing.title || '').trim()
  const directionWithAngle = formatDirectionWithAngle(timing.direction || '', timing.angle)
  // title 已是「天心(+天禽)休門」或「天心休門」，正規化為「天心+天禽+休門」
  const normalizedTitle = titleRaw
    .replace(/\(\+([^)]+)\)/g, '+$1')  // (+天禽) → +天禽
    .replace(/([^+\s])(開門|休門|生門|傷門|杜門|景門|死門|驚門)/g, '$1+$2')  // 在任何門字前插 +（除非已有 +）
    .replace(/\++/g, '+')  // 多個 + 合併
  const calTitle = `${normalizedTitle}(${directionWithAngle.replace(/\s/g, '')})`
  const title = encodeURIComponent(calTitle)
  const description = buildCalendarDescription({
    plainAdvantage: timing.plain_advantage,
    plainPurpose: timing.plain_purpose,
    title: timing.title,
    direction: directionWithAngle,
    angle: timing.angle,
    clientName,
  })
  const details = encodeURIComponent(description)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&ctz=Asia/Taipei`
}

// v5.3.75：方位度數對照表——讓客戶拿指南針對度數出門
const DIRECTION_ANGLES: Record<string, string> = {
  '北': '0°',
  '東北': '45°',
  '東': '90°',
  '東南': '135°',
  '南': '180°',
  '西南': '225°',
  '西': '270°',
  '西北': '315°',
}

function formatDirectionWithAngle(direction: string, existingAngle?: string): string {
  if (!direction) return ''
  const cleanDir = direction.trim()
  // 引擎已給度數 → 優先用
  if (existingAngle) {
    const angleStr = existingAngle.trim()
    // 避免重複加 °
    return angleStr.includes('°') ? `${cleanDir} ${angleStr}` : `${cleanDir} ${angleStr}°`
  }
  // 沒度數 → 查表
  const mapped = DIRECTION_ANGLES[cleanDir]
  return mapped ? `${cleanDir} ${mapped}` : cleanDir
}

// 格式化日期顯示
function formatTimingDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${y}年${Number(m)}月${Number(d)}日（${weekdays[date.getDay()]}）`
}

/**
 * D 方案：從「你的路」章節抽取 3 步驟（若存在）
 * 格式：1. XXX / ①XXX / - 第一步：XXX
 */
interface PathStep { title: string; desc: string }

function extractDSteps(markdown: string): PathStep[] {
  if (!markdown) return []
  const pathSection = markdown.match(/##?\s*(?:[一二三四五六七八九十]+、\s*)?你的路[\s\S]*?(?=\n##?\s|$)/m)
  if (!pathSection) return []
  const body = pathSection[0]
  const steps: PathStep[] = []

  // 嘗試匹配多種格式：1. XXX：YYY / 第一步：XXX / ① XXX
  // 1. 先抓粗體標題 + 接續描述
  const numberedPattern = /(?:^|\n)\s*(?:(?:[①②③④⑤])|(?:[1-5])[\.\、]|第[一二三四五]步[：:]?)\s*\*{0,2}(.+?)\*{0,2}(?:[：:—–])?\s*(?:\n|$)([\s\S]*?)(?=\n\s*(?:[①②③④⑤]|[1-5][\.\、]|第[一二三四五]步|##?\s|$))/gm
  let m
  while ((m = numberedPattern.exec(body)) !== null) {
    const title = stripInline(m[1] || '').slice(0, 50)
    const desc = stripInline((m[2] || '').replace(/\n/g, ' ').replace(/[*]+/g, ''))
      .replace(/^[：:—–]\s*/, '')
      .slice(0, 150)
    if (title) steps.push({ title, desc })
    if (steps.length >= 3) break
  }

  // Fallback：如果上面沒抓到，試 bullet
  if (steps.length === 0) {
    const bullets = body.match(/^\s*[-*•]\s*(.+?)$/gm) || []
    for (const b of bullets.slice(0, 3)) {
      const clean = stripInline(b.replace(/^\s*[-*•]\s*/, ''))
      const colon = clean.match(/^(.+?)[：:](.+)$/)
      if (colon) steps.push({ title: colon[1].trim().slice(0, 50), desc: colon[2].trim().slice(0, 150) })
      else steps.push({ title: clean.slice(0, 50), desc: '' })
    }
  }

  return steps.slice(0, 3)
}

/**
 * D 方案：從 AI 內容抽取「10 秒結論」
 * 優先順序：
 * 1. 「10 秒內結論」章節內引言框
 * 2. 「你的答案」章節第一段
 * 3. 第一段非空文字（fallback）
 * 回傳 ≤ 120 字的純文字結論
 */
function extractDAnswer(markdown: string): string {
  if (!markdown) return ''
  // 1. 10 秒內結論 > 引言框
  const quickSection = markdown.match(/##?\s*(?:[一二三四五六七八九十]+、\s*)?(?:10\s*秒內?結論|你的答案|快速結論)[\s\S]*?(?=\n##?\s|$)/m)
  if (quickSection) {
    const body = quickSection[0]
    // 找引言框
    const quote = body.match(/^>\s*\**(.+?)\**\s*$/m)
    if (quote) {
      return stripInline(quote[1]).slice(0, 120)
    }
    // 找第一個非標題、非列表的段落
    const lines = body.split('\n').slice(1)
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      if (line.startsWith('#')) continue
      if (line.startsWith('>')) continue
      if (line.startsWith('-') || line.startsWith('*')) continue
      if (line.startsWith('|')) continue
      const clean = stripInline(line)
      if (clean.length >= 8) return clean.slice(0, 120)
    }
  }
  return ''
}

function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[「"」"']+|[「"」"']+$/g, '')
    .trim()
}

/**
 * D 方案：依客戶主題推導主題配色（感情紅/事業藍/財運金/健康綠/人際紫/遷移靛/學業橙/其他金）
 * 回傳：{ accent, glow, label, emoji }
 */
interface DTopicTheme { accent: string; soft: string; glow: string; label: string; emoji: string }
function inferDTopicTheme(topic: string, question: string): DTopicTheme {
  const t = `${topic || ''} ${question || ''}`
  if (/(感情|戀愛|伴侶|婚姻|分手|曖昧|桃花)/.test(t)) return { accent: '#e85b7a', soft: 'rgba(232,91,122,0.12)', glow: 'rgba(232,91,122,0.25)', label: '感情', emoji: '♡' }
  if (/(事業|工作|升遷|面試|離職|創業|老闆|升職)/.test(t)) return { accent: '#5b9fe8', soft: 'rgba(91,159,232,0.12)', glow: 'rgba(91,159,232,0.25)', label: '事業', emoji: '⚡' }
  if (/(財運|財富|投資|理財|金錢|股票|賺錢|負債)/.test(t)) return { accent: '#c9a84c', soft: 'rgba(201,168,76,0.12)', glow: 'rgba(201,168,76,0.25)', label: '財運', emoji: '⟡' }
  if (/(健康|身體|生病|失眠|焦慮|憂鬱|情緒)/.test(t)) return { accent: '#6ab04c', soft: 'rgba(106,176,76,0.12)', glow: 'rgba(106,176,76,0.25)', label: '健康', emoji: '✚' }
  if (/(人際|朋友|同事|家人|親子|父母|小孩|溝通)/.test(t)) return { accent: '#a06ae4', soft: 'rgba(160,106,228,0.12)', glow: 'rgba(160,106,228,0.25)', label: '人際', emoji: '◉' }
  if (/(搬家|遷移|移民|出國|出門|旅行|方位)/.test(t)) return { accent: '#4ec4d3', soft: 'rgba(78,196,211,0.12)', glow: 'rgba(78,196,211,0.25)', label: '遷移', emoji: '➤' }
  if (/(學業|考試|讀書|升學|學校|成績)/.test(t)) return { accent: '#f0934a', soft: 'rgba(240,147,74,0.12)', glow: 'rgba(240,147,74,0.25)', label: '學業', emoji: '✎' }
  return { accent: '#c9a84c', soft: 'rgba(201,168,76,0.12)', glow: 'rgba(201,168,76,0.25)', label: topic || '問事', emoji: '✦' }
}

/**
 * D 方案：從 AI 內容抽取「命盤佐證」列表（括號內的具體命盤欄位）
 * 例如：(八字：癸亥 庚申 庚辰 甲申；紫微命宮武曲天府祿存；吠陀水星處女旺位)
 */
interface DChartCite { system: string; detail: string }
function extractDChartCitations(markdown: string): DChartCite[] {
  if (!markdown) return []
  const cites: DChartCite[] = []
  const seen = new Set<string>()
  // 只掃描「你的答案」+「深入解析」前 3000 字（不要掃全文），抓具體命盤引用
  const head = markdown.slice(0, 5000)
  // 關鍵命盤欄位 regex
  const patterns: Array<[string, RegExp]> = [
    ['八字日主', /日主(?:為|是|走)?\s*([甲乙丙丁戊己庚辛壬癸][金木水火土]?)/g],
    ['八字格局', /([建祿|七殺|偏印|正印|食神|傷官|正財|偏財|比肩|劫財]+)格/g],
    ['八字干支', /([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])(?:年|月|日|時)?柱?/g],
    ['紫微命宮', /(?:紫微)?命宮[主星坐]*\s*([天紫廉武天太貪巨天文七破左右][微貞同陰微狼門機相廉同府殺軍輔弼曲昌微狼府相機同陰]{1,3})/g],
    ['紫微化', /([武文天太貪巨天太祿][曲昌相陽狼門機陰存]?)(?:化)?(祿|權|科|忌)/g],
    ['吠陀瑜伽', /([A-Z][a-z]+)\s*瑜伽/g],
    ['大運', /(\d{1,2}[-–]\d{1,2}歲)(?:走)?([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])?大運/g],
    ['流年', /202[5-9]\s*(?:年)?丙午|2026[^\n]{0,12}(?:流年|丙午)/g],
    ['人類圖', /(顯示者|生產者|顯示生產者|投射者|反映者|情緒權威|薦骨權威|直覺權威|自我投射權威)/g],
    ['空亡', /([子丑寅卯辰巳午未申酉戌亥])酉?([子丑寅卯辰巳午未申酉戌亥])?\s*空亡/g],
  ]
  for (const [sys, re] of patterns) {
    let m
    const copy = new RegExp(re.source, re.flags)
    let guard = 0
    while ((m = copy.exec(head)) !== null && guard++ < 15) {
      const detail = m[0].trim()
      if (!detail || detail.length > 40) continue
      const key = `${sys}:${detail}`
      if (seen.has(key)) continue
      seen.add(key)
      cites.push({ system: sys, detail })
      if (cites.length >= 12) break
    }
    if (cites.length >= 12) break
  }
  return cites
}

// 動態 OG metadata — 去識別化版本（P0 隱私強化 2026-04-19）
// 原則：
//   1. 報告頁絕對不能被搜尋引擎索引（robots noindex/nofollow/noarchive）
//   2. 標題/描述/OG 不暴露客戶真名（改用方案名稱）
//   3. 不指定 canonical（避免誤導爬蟲認為這是公開頁面）
//   4. referrer 清除（防止點擊外連後把 token URL 洩漏給第三方網站）
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )

  const { data } = await supabase
    .from('paid_reports')
    .select('plan_code')
    .eq('access_token', token)
    .single()

  // 不使用客戶姓名，僅用方案名稱（去識別化）
  const planName = data ? (PLAN_NAMES[data.plan_code] || '命理分析') : '命理分析'
  const title = `${planName}報告 · 鑒源命理`
  const description = '鑒源命理 — 東西方十四大命理系統整合分析。（此頁面為客戶專屬私密報告，不被搜尋引擎索引）'

  return {
    title,
    description,
    // 阻止所有搜尋引擎索引 / 快取 / 翻譯 / snippet
    robots: {
      index: false,
      follow: false,
      nocache: true,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
      googleBot: {
        index: false,
        follow: false,
        noarchive: true,
        nosnippet: true,
        noimageindex: true,
        'max-snippet': -1,
        'max-image-preview': 'none',
        'max-video-preview': -1,
      },
    },
    // 不指定 canonical（防止被當成公開頁面）
    alternates: { canonical: null },
    // 清除 referrer（防止點擊外連後把 token URL 洩漏給第三方網站）
    referrer: 'no-referrer',
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: '鑒源 JianYuan',
      locale: 'zh_TW',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )

  const { data, error } = await supabase
    .from('paid_reports')
    .select('*')
    .eq('access_token', token)
    .single()

  // Bug #26：只有真的「查不到報告」才 404；已建立但尚未完成的 report 一律顯示 loading 頁
  //   舊邏輯只覆蓋 pending / generating 兩種 status，其他任何非 completed 狀態
  //   （例如 failed、retry、或 report_result 為 null 的 completed bug 資料）會繼續往下 render
  //   造成客戶看到 404 或空白崩潰頁。改用「反向條件」：只要 status !== 'completed' 或 ai_content 為空，都顯示 loading。
  if (error || !data) return notFound()

  const report = data as ReportData

  // 報告生成中（status 不是 completed，或 completed 但 report_result / ai_content 為 null / 空字串）
  const aiContentReady = !!report.report_result?.ai_content
  if (report.status !== 'completed' || !aiContentReady) {
    const isFailed = report.status === 'failed'
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1628 40%, #0a0e1a 100%)' }}>
        <div className="glass rounded-2xl p-12 text-center max-w-md">
          <div className="text-5xl mb-4">{isFailed ? '\u26A0\uFE0F' : '\u23F3'}</div>
          <h1 className="text-xl font-bold text-cream mb-2">
            {isFailed
              ? '報告生成遇到問題'
              : isChumenjiPlan(report.plan_code) ? '奇門遁甲出門訣排算中'
              : report.plan_code === 'G15' ? '家族藍圖分析進行中'
              : report.plan_code === 'R' ? '關係合盤分析進行中'
              : '命理分析進行中'}
          </h1>
          <p className="text-text-muted text-sm mb-2">
            {isFailed
              ? '系統已記錄此次生成異常，客服將於 1–2 小時內為您重新生成並通知您'
              : isChumenjiPlan(report.plan_code)
              ? '系統正以 25 層古籍評分體系逐時辰排算奇門局，套入個人年命宮驗證吉位'
              : report.plan_code === 'G15'
              ? '正在為您的家庭成員進行多人命格交叉分析，整合家族互動關係'
              : report.plan_code === 'R'
              ? '系統正為雙方分別排盤，並用七大命理系統進行合盤分析'
              : '系統正同步調用東西方十四大命理系統，逐一進行排盤運算與深度解析'}
          </p>
          {!isFailed && (
            <>
              <p className="text-text-muted/60 text-xs mb-1">
                {isChumenjiPlan(report.plan_code) ? '出門訣排算通常需要 40–50 分鐘'
                  : report.plan_code === 'G15' ? '家族分析通常需要 30–45 分鐘'
                  : report.plan_code === 'R' ? '合盤分析通常需要 30–45 分鐘'
                  : '完整分析通常需要 40–60 分鐘'}
              </p>
              <p className="text-text-muted/60 text-xs mb-6">完成後將自動寄送 Email 通知您，無需持續等候</p>
              <p className="text-gold text-sm">如需確認進度，可稍後重新整理此頁面</p>
            </>
          )}
          {isFailed && (
            <p className="text-gold text-sm mt-4">如有疑問請聯繫 <a href="mailto:support@jianyuan.life" className="underline">support@jianyuan.life</a></p>
          )}
        </div>
      </div>
    )
  }

  const aiContent = report.report_result?.ai_content || ''
  const analysesSummary = report.report_result?.analyses_summary || []

  // v5.7.26 大運 regex 收緊(修 v5.6.10 R7 誤配 bug)
  // 證據:7a10ce3c 何宣逸 UI 渲染 8 個大運柱、其中 3-7 號全錯位(20-22/24-25/24-26/28-30 戊子重複 4 次)
  // 真因:原 regex `[^\n]{0,80}?` 跨 80 字撈、把不相關的年齡敘述+附近干支字眼誤配
  // 修:① 限「X-Y 歲」與「干支」距離 ≤ 25 字 ② 必須「大運」字眼緊跟 ③ end-start 必為 9 或 10(大運鐵律)④ 同干支去重
  const dayunData = (() => {
    if (!aiContent) return []
    const stages: Array<{ age_start: number; age_end: number; pillar?: string; theme?: string; energy?: number }> = []
    // v5.7.32 放寬:同時抓「X-Y 歲...干支大運」+「→Y 歲 干支」箭頭格式(AI 寫法多樣)
    // 嚴規格仍鎖定 8-11 年/柱(大運鐵律 ±2 容差)、避免漏 70-80 歲
    const re = /(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*歲[^\n]{0,30}?([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])\s*大運/g
    let m: RegExpExecArray | null
    const seenPillar = new Set<string>()
    const seenAgeRange = new Set<string>()
    while ((m = re.exec(aiContent)) !== null) {
      const start = parseInt(m[1])
      const end = parseInt(m[2])
      const span = end - start
      // 大運鐵律放寬:每柱 8-11 年(起運因人不同 ±2 容差、避免漏抓「20-31 / 30-41」這種跨歲)
      if (span < 8 || span > 11) continue
      if (start < 0 || end > 120) continue
      const pillar = m[3] + m[4]
      // 同干支已抓過 → 跳(大運 60 甲子順排、10 年 1 柱、不重複)
      if (seenPillar.has(pillar)) continue
      // 同年齡範圍已抓 → 跳
      const ageKey = `${start}-${end}`
      if (seenAgeRange.has(ageKey)) continue
      seenPillar.add(pillar)
      seenAgeRange.add(ageKey)
      // energy 啟發式:藏「機會 / 黃金 / 高峰 / 上升 / 旺」 → 高;「考驗 / 起伏 / 困頓 / 低 / 險」 → 低
      const around = aiContent.slice(Math.max(0, m.index - 50), m.index + 200)
      let energy = 60
      if (/黃金|高峰|大旺|機會|衝刺|爆發|旺運/.test(around)) energy = 85
      else if (/考驗|挑戰|起伏|低谷|轉折|波折/.test(around)) energy = 35
      else if (/穩定|平順|蓄勢|沉澱/.test(around)) energy = 65
      stages.push({ age_start: start, age_end: end, pillar, energy })
    }
    if (stages.length < 3) return []  // 少於 3 個不顯示(資料不足)
    // 排序 + 限 8 + 過濾年齡重疊(若 stage_n.age_start < stage_{n-1}.age_end → 丟)
    const sorted = stages.sort((a, b) => a.age_start - b.age_start)
    const noOverlap: typeof stages = []
    for (const s of sorted) {
      const prev = noOverlap[noOverlap.length - 1]
      if (prev && s.age_start < prev.age_end) continue  // 重疊 → 丟
      noOverlap.push(s)
    }
    return noOverlap.slice(0, 10)  // 最多 10 個 stage(80 歲 / 10 年 = 8、容差 10)
  })()

  // v5.6.10 R5-2:從 ai_content 解析五行能量分布(對應 Gemini「致命傷」第二招)
  // 鑑源 prompt 通常會生「五行能量分布:木 30% / 火 20% / 土 25% / 金 15% / 水 10%」格式
  const wuxingData = (() => {
    if (!aiContent) return []
    // 匹配多種格式:「木 30%」「木:30%」「木 30」(無 %)
    const elements: ('木' | '火' | '土' | '金' | '水')[] = ['木', '火', '土', '金', '水']
    const result: { element: '木' | '火' | '土' | '金' | '水'; percent: number }[] = []
    for (const el of elements) {
      const re = new RegExp(`${el}[\\s:：()（](\\d{1,3}(?:\\.\\d)?)\\s*%?`, 'g')
      let bestMatch: number | null = null
      let m: RegExpExecArray | null
      while ((m = re.exec(aiContent)) !== null) {
        const v = parseFloat(m[1])
        if (v >= 0 && v <= 100 && (bestMatch === null || v > bestMatch)) {
          bestMatch = v
        }
      }
      if (bestMatch !== null) {
        result.push({ element: el, percent: bestMatch })
      }
    }
    // 必須 5 元素全有 + 總和合理(80-120 容錯)
    if (result.length !== 5) return []
    const total = result.reduce((s, d) => s + d.percent, 0)
    if (total < 80 || total > 120) return []
    return result
  })()
  let top5Timings = report.report_result?.top5_timings || []
  const isChumenji = isChumenjiPlan(report.plan_code)
  const isE3 = report.plan_code === 'E3'  // v5.3.63 月度精選 8 卡片格式
  // v5.3.64 — E3 按日期+時間升序排列（客戶期待時間軸順序、而非分數排序）
  if (isE3 && top5Timings.length > 0) {
    top5Timings = [...top5Timings].sort((a, b) => {
      const aKey = `${a.date || ''} ${a.time_start || ''}`
      const bKey = `${b.date || ''} ${b.time_start || ''}`
      return aKey.localeCompare(bKey)
    })
  }
  const isFamily = report.plan_code === 'G15'
  const isRelationship = report.plan_code === 'R'

  // 偵測是否為主題式報告（新版）
  const isThematic = isThematicReport(aiContent, report.report_result)

  // 解析命格名片（主題式報告才有）
  const personalityCard = isThematic ? parsePersonalityCard(aiContent) : null

  // R 方案：從報告內容提取合/不合結論（不使用分數，命不該有分數）
  let compatibilityVerdict = ''
  if (isRelationship && aiContent) {
    if (/你們合，但|合.*但有.*雷區/.test(aiContent)) compatibilityVerdict = '合，但有雷區'
    else if (/結論\s*[:：]\s*.*不合|你們不合/.test(aiContent)) compatibilityVerdict = '需要經營'
    else if (/結論\s*[:：]\s*.*合|你們合/.test(aiContent)) compatibilityVerdict = '互補互助'
  }

  // 報告內容完整性檢查 — 數據零容忍
  const isContentEmpty = !aiContent || aiContent.trim().length < 100

  // D 方案：抽取「10 秒結論」大徽章 + 命盤佐證 + 主題配色
  const dQuickAnswer = report.plan_code === 'D' ? extractDAnswer(aiContent) : ''
  const dPathSteps: PathStep[] = report.plan_code === 'D' ? extractDSteps(aiContent) : []
  const dChartCites: DChartCite[] = report.plan_code === 'D' ? extractDChartCitations(aiContent) : []
  const dTheme: DTopicTheme = report.plan_code === 'D'
    ? inferDTopicTheme(
        String(report.birth_data?.analysis_topic || report.birth_data?.topic || ''),
        String(report.birth_data?.customer_note || report.birth_data?.other_question || ''),
      )
    : { accent: '#c9a84c', soft: 'rgba(201,168,76,0.12)', glow: 'rgba(201,168,76,0.25)', label: '', emoji: '✦' }

  // 結構化解析 — 保留原始章節順序
  const allSections = parseStructuredContent(aiContent)

  // 先過濾掉不該顯示的章節
  const cleanedSections = allSections.filter(sec => {
    const t = sec.title
    const c = sec.content
    // 過濾空章節（只有標題沒內容）
    if (!c || c.trim().length < 20) return false
    // 過濾 prompt 結構標籤
    if (/第一幕|第二幕|第三幕|壓軸|收尾|完整分析請繼續閱讀/.test(t)) return false
    // 過濾附錄（術語表在 PDF 看就好）
    if (/附錄|術語對照/.test(t)) return false
    // 主題式報告：命格名片已用專屬卡片渲染，從章節列表中移除
    if (personalityCard && /命格名片/.test(t)) return false
    // 過濾報告標題行
    if (/全方位命格分析報告/.test(t)) return false
    // 過濾重複的評分表（上面已有可視化圖表）
    if (/系統綜合評分|評分表|系統名稱.*評分.*關鍵發現/.test(t)) return false
    if (/1[45].*系統.*評分|十[四五].*系統.*評分/.test(t)) return false
    return true
  })

  // 網頁版只顯示客戶最關注的重點
  // 主題式報告：全部章節都是重點，不做摘要篩選
  const summarySections = isThematic ? cleanedSections : cleanedSections.filter(sec => {
    const t = sec.title
    // 一分鐘重點 / 命格名片
    if (/一分鐘|命格重點|命格名片|命格角色/.test(t)) return true
    // 命格總覽 / 你是什麼樣的人
    if (/命格總覽|你是誰|你是什麼樣的人/.test(t)) return true
    // 事業與天賦
    if (/事業與天賦|事業/.test(t)) return true
    // 財運
    if (/財運/.test(t)) return true
    // 感情與人際
    if (/感情與人際|感情/.test(t)) return true
    // 健康
    if (/健康/.test(t)) return true
    // 大運走勢
    if (/大運/.test(t)) return true
    // 流年重點
    if (/流年/.test(t)) return true
    // 年度運勢 / 月曆
    if (/年度|月曆|月運勢|行事曆|運勢行事/.test(t)) return true
    // 交叉驗證結論
    if (/交叉驗證|全局鳥瞰|十四系統|十五系統/.test(t)) return true
    // 刻意練習
    if (/刻意練習/.test(t)) return true
    // 寫給你的話 / 給你的一句話
    if (/寫給|給你的/.test(t)) return true
    // 幸運元素
    if (/幸運元素/.test(t)) return true
    return false
  })

  // 出門訣專屬：把章節分為 三色分析卡片、補運指南、忌方忌日、其他
  let chumenjiAnalysis: ContentSection[] = []   // 事件吉凶分析 / 本月運勢概覽（含好的/注意/改善）
  let chumenjiGuide: ContentSection[] = []      // 補運操作指南 / 行動建議
  let chumenjiWarnings: ContentSection[] = []   // 忌方忌日 / 注意事項
  let chumenjiOther: ContentSection[] = []      // 其餘章節

  if (isChumenji) {
    for (const sec of cleanedSections) {
      const t = sec.title
      if (/事件吉凶|事件命理|事件判斷|本月運勢|本月命理|本月出行能量/.test(t)) {
        chumenjiAnalysis.push(sec)
      } else if (/補運|操作指南/.test(t)) {
        chumenjiGuide.push(sec)
      } else if (/忌方|忌日|注意事項/.test(t)) {
        chumenjiWarnings.push(sec)
      } else if (/Top[135]|加乘時機|最佳出行|最佳出門|最佳時機/.test(t)) {
        // Top 吉時已有專屬卡片渲染，跳過
      } else if (/第\s*\d+\s*週.*TOP\s*\d/.test(t)) {
        // v5.3.77：E3 週度卡片章節（第 1 週 TOP 1|主題：X）跟上方 Timeline 卡片重複、砍掉
      } else {
        chumenjiOther.push(sec)
      }
    }
  }

  // G15 家族藍圖 / R 合否：顯示全部章節，不做摘要篩選
  // 如果篩選出的摘要太少（< 3），退回顯示全部（可能是非 C 方案）
  const sections = isChumenji ? [] : (isFamily || isRelationship) ? cleanedSections : (summarySections.length >= 3 ? summarySections : cleanedSections)
  const isShowingSummary = !isChumenji && !isFamily && !isRelationship && summarySections.length >= 3 && cleanedSections.length > summarySections.length

  // 簡體中文報告使用 SC 字體
  const isSimplified = report.birth_data?.locale === 'zh-CN'

  return (
    <div className={`min-h-screen pb-16${isSimplified ? ' locale-cn' : ''}`} style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1628 40%, #0a0e1a 100%)' }}>
      <style>{`
        ${isSimplified ? `.locale-cn { font-family: var(--font-body-sc), var(--font-body), "Noto Sans SC", sans-serif; }
        .locale-cn .report-h3, .locale-cn h1, .locale-cn h2, .locale-cn h3 { font-family: var(--font-sans-sc), var(--font-sans), "Noto Serif SC", serif; }` : ''}
        /* v5.3.44 讀感升級（讀感 agent 診斷修復 P0 致命三條）：
           1. 正文 0.9rem (14.4px) → 1.0625rem (17px) — Apple Support / Stripe / Medium 共識甜蜜點
           2. font-family 從 var(--font-sans)（舊值為 Serif）改為 var(--font-body)（真 Sans）
              → globals.css 已正名 --font-sans 為 Sans，這裡顯式用 --font-body 雙保險
           3. line-height 1.9 → 1.8（配 17px 字級更平衡，中文螢幕標準 1.7-1.9）
           4. letter-spacing 0 → 0.01em（中文方塊字微增字距改善密排感）
           5. margin-bottom 0.85rem → 1.25rem（Apple HIG：段距比行高更大才有呼吸）
           6. color var(--color-text-muted) 已在 globals.css 從 #6880a0 升級 #b3b8c5 (AA+ 7.8:1)
        */
        .report-h3 { font-size: 1.125rem; font-weight: 600; color: var(--color-gold); margin: 1.75rem 0 0.75rem; font-family: var(--font-body); padding-left: 12px; border-left: 3px solid rgba(201,168,76,0.85); line-height: 1.5; letter-spacing: 0.02em; }
        .report-bold { color: var(--color-cream); font-weight: 600; }
        .report-li { margin-left: 1.5rem; color: var(--color-text); list-style: disc; margin-bottom: 0.5rem; line-height: 1.8; font-size: 1.0625rem; font-family: var(--font-body); letter-spacing: 0.01em; }
        .report-li-num { margin-left: 1.5rem; color: var(--color-text); list-style: decimal; margin-bottom: 0.5rem; line-height: 1.8; font-size: 1.0625rem; font-family: var(--font-body); letter-spacing: 0.01em; }
        /* v5.3.44 IA 稽核修正：段距 2rem（32px）> 行距 30.6px，符合 Apple HIG「段距 > 行距」原則 */
        .report-p { color: var(--color-text); line-height: 1.8; margin-bottom: 2rem; font-size: 1.0625rem; font-family: var(--font-body); letter-spacing: 0.01em; }
        /* v5.7.34 響應式內文限寬:容器在 lg+ 放寬到 1280px,但純文字段落維持 720px 閱讀寬度
           表格 / 圖表 / div wrapper 不限,自動撐滿善用版面 */
        .report-p > p, .report-p > ul, .report-p > ol, .report-p > blockquote { max-width: 760px; }
        /* v5.3.44 IA 稽核補：h1/h2 Major Third 比例（1.25 倍），配 17px 正文維持垂直節奏
           h1 = 17 × 1.25³ = 33.2px / h2 = 17 × 1.25² = 26.56px / h3 = 17 × 1.25 = 21.25px
           但 h3 已設 18px（Tailwind 1.125rem），改設 h1/h2 為 Major Third 且 font-family 顯式用 --font-body */
        h1.report-h1, .report-main h1 { font-size: 2.074rem; line-height: 1.3; font-family: var(--font-body); font-weight: 700; margin: 2.5rem 0 1.25rem; color: var(--color-cream); letter-spacing: 0.01em; }
        h2.report-h2, .report-main h2 { font-size: 1.728rem; line-height: 1.35; font-family: var(--font-body); font-weight: 700; margin: 3rem 0 1rem; color: var(--color-cream); letter-spacing: 0.015em; border-bottom: 1px solid rgba(201,168,76,0.2); padding-bottom: 0.75rem; }
        .section-card { border-radius: 12px; padding: 28px; margin-bottom: 24px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        /* 目錄連結 hover/active/scrollspy 態 */
        .toc-link { position: relative; transition: all 0.18s ease; border-left: 2px solid transparent; }
        .toc-link:hover { transform: translateX(3px); }
        .toc-link:active { transform: translateX(3px) scale(0.98); background: rgba(201,168,76,0.10) !important; }
        /* 當前章節高亮 (ScrollSpy) */
        .toc-link[data-active="true"] {
          border-left-color: rgba(201,168,76,0.8);
          background: rgba(201,168,76,0.08);
          color: var(--color-gold) !important;
          font-weight: 600;
          padding-left: calc(0.75rem - 2px);
        }
        .toc-link[data-active="true"] span:last-child { color: var(--color-gold) !important; }
        .toc-link:focus-visible { outline: 2px solid rgba(201,168,76,0.5); outline-offset: 2px; }
        /* 金色小徽章 hover 放大（Top1 卡片等） */
        .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(201,168,76,0.15); }
        .hover-lift:active { transform: translateY(0) scale(0.99); }
        /* D 方案 3 步驟圓徽章 */
        .step-badge { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; background: linear-gradient(135deg, #c9a84c, #e8c87a); color: #0a0e1a; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; box-shadow: 0 2px 6px rgba(201,168,76,0.3); }
        /* v5.3.44 手機版適配（保持 17px 甜蜜點，不縮字，僅微調 padding）*/
        @media (max-width: 640px) {
          .section-card { padding: 18px; margin-bottom: 16px; }
          .report-p, .report-li, .report-li-num { font-size: 1rem; line-height: 1.75; }
          .report-h3 { font-size: 1.05rem !important; padding-left: 8px; }
          h1 { font-size: 1.6rem !important; }
          h2 { font-size: 1.15rem !important; }
        }
        /* 平板版（641-1024px） */
        @media (min-width: 641px) and (max-width: 1024px) {
          .section-card { padding: 22px; }
        }
        /* v5.3.48 Wave 3.3 抽言金句塊：截圖分享素材 + 情感錨點
           報告正文中若有 blockquote 或特定模式的金句，套用此樣式放大震撼
           用法：在章節內容中寫 > 金句 或 <blockquote>金句</blockquote> */
        .report-pullquote, blockquote.pullquote, .report-p blockquote {
          margin: 2.5rem 0;
          padding: 2rem 2.5rem;
          border: none;
          border-left: 3px solid rgba(201,168,76,0.85);
          background: linear-gradient(135deg, rgba(201,168,76,0.06) 0%, rgba(201,168,76,0.02) 100%);
          border-radius: 0 12px 12px 0;
          font-size: 1.375rem;
          line-height: 1.6;
          letter-spacing: 0.015em;
          font-weight: 500;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-style: normal;
          text-wrap: balance;
          position: relative;
        }
        .report-pullquote::before, blockquote.pullquote::before {
          content: '"';
          position: absolute;
          top: -0.5rem;
          left: 1rem;
          font-size: 4rem;
          color: rgba(201,168,76,0.25);
          font-family: Georgia, serif;
          line-height: 1;
        }
        @media (max-width: 640px) {
          .report-pullquote, blockquote.pullquote, .report-p blockquote {
            font-size: 1.125rem;
            padding: 1.25rem 1.5rem;
            margin: 1.75rem 0;
          }
        }
        /* v5.3.48 Wave 3.4 起承轉合篇章封面強化 */
        .part-chapter-cover {
          padding: 3rem 2rem 2rem;
          text-align: center;
          position: relative;
          margin: 2rem 0;
        }
        .part-chapter-cover .part-label {
          display: inline-block;
          font-size: 0.75rem;
          letter-spacing: 6px;
          color: rgba(201,168,76,0.6);
          margin-bottom: 1rem;
          text-transform: uppercase;
        }
        .part-chapter-cover .part-stage {
          font-size: 4rem;
          font-family: var(--font-sans);
          font-weight: 700;
          color: var(--color-gold);
          line-height: 1;
          letter-spacing: 0.3em;
          margin: 0.5rem 0 1.5rem;
          text-shadow: 0 0 24px rgba(201,168,76,0.2);
        }
        .part-chapter-cover .part-title {
          font-size: 1.75rem;
          font-family: var(--font-sans);
          font-weight: 600;
          color: var(--color-cream);
          margin-bottom: 0.75rem;
          text-wrap: balance;
        }
        .part-chapter-cover .part-desc {
          font-size: 1rem;
          color: var(--color-text);
          line-height: 1.7;
          max-width: 36ch;
          margin: 0 auto;
          text-wrap: balance;
        }
        .part-chapter-cover .part-divider {
          margin: 1.5rem auto 0;
          width: 60px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent);
        }
        @media (max-width: 640px) {
          .part-chapter-cover { padding: 2rem 1rem 1.5rem; }
          .part-chapter-cover .part-stage { font-size: 2.75rem; }
          .part-chapter-cover .part-title { font-size: 1.35rem; }
        }
        @media print {
          body, html { background: white !important; color: #333 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          nav, footer, .no-print { display: none !important; }
          .section-card { border: 1px solid #ddd; page-break-inside: avoid; padding: 16px !important; margin-bottom: 12px !important; box-shadow: none !important; }
          .glass { background: white !important; border: 1px solid #eee !important; box-shadow: none !important; }
          .report-h3 { color: #1a2a4a !important; font-size: 1rem !important; }
          .report-bold { color: #333 !important; }
          .report-li, .report-li-num, .report-p { color: #555 !important; font-size: 0.85rem !important; line-height: 1.7 !important; }
          h1 { color: #1a2a4a !important; font-size: 1.5rem !important; }
          a { color: #333 !important; text-decoration: none !important; }
          table { font-size: 11px !important; }
          blockquote { border-left-color: #c9a84c !important; background: #f5f0e8 !important; color: #333 !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      {/* 瀏覽追蹤（Client Component，不影響 SSR） */}
      <ReportTracker reportId={report.id} planCode={report.plan_code} token={token} />

      {/* #11 閱讀進度條 */}
      <ReadingProgressBar />
      {/* #13 回到頂部浮動按鈕 */}
      <BackToTopButton />
      {/* 目錄 Scrollspy — 滾動時高亮目前章節 */}
      <ScrollSpy />

      {/* v5.7.34 響應式重構:電腦 UI 用電腦方式、手機 UI 用手機方式
           - sm (<768): max-w-[680px] 維持手機單欄 + Bringhurst 32 漢字
           - md (≥768): 720px 平板
           - lg (≥1024): 960px 善用筆電版面
           - xl (≥1280): 1120px 善用桌面
           - 2xl (≥1536): 1280px 大螢幕
           內文 prose 段落仍用 prose-p:max-w-[680px] 自限維持閱讀寬度
           表格 / 圖表 / 命格名片自動撐滿容器寬、不再擠在 680px 中間 */}
      <div className="max-w-[680px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1120px] 2xl:max-w-[1280px] mx-auto px-6 lg:px-10 pt-12">

        {/* 品牌標題 */}
        <div className="text-center mb-3 no-print">
          <span className="text-gold/70 text-xs tracking-[4px]">鑑 源 命 理</span>
        </div>

        {/* ──── 報告頭部 ──── */}
        <div className="glass rounded-2xl p-8 sm:p-10 mb-8 text-center relative overflow-hidden">
          {/* 頂部金色裝飾光帶 */}
          <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{
            background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent)',
          }} />
          {/* 右上角徑向光暈 */}
          <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 opacity-[0.08]" style={{
            background: 'radial-gradient(circle, rgba(201,168,76,1) 0%, transparent 70%)',
          }} />

          <div className="text-gold/60 text-xs tracking-[3px] mb-2 uppercase relative z-10">
            {PLAN_NAMES[report.plan_code] || '命理分析報告'}
          </div>

          {/* R 方案：雙人姓名大字，中間「×」分隔 */}
          {isRelationship && report.birth_data?.members && report.birth_data.members.length >= 2 ? (
            <div className="flex items-center justify-center gap-4 sm:gap-6 mb-2 relative z-10 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
                {report.birth_data.members[0]?.name || report.client_name}
              </h1>
              <span className="text-xl sm:text-2xl text-gold/70 font-light" aria-hidden>&#10005;</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
                {report.birth_data.members[1]?.name || '合盤對象'}
              </h1>
            </div>
          ) : (
            <h1 className="text-3xl sm:text-4xl font-bold text-cream mb-1 relative z-10" style={{ fontFamily: 'var(--font-sans)' }}>
              {isFamily && report.birth_data?.member_names
                ? (report.birth_data.member_names as string[]).filter(Boolean).join('、') + ' 家族'
                : report.client_name}
            </h1>
          )}

          {/* G15 家族：成員徽章（首字大圓 32px + 角色標籤）*/}
          {isFamily && report.birth_data?.member_names && (report.birth_data.member_names as string[]).filter(Boolean).length > 0 && (
            <div className="flex flex-wrap justify-center gap-2.5 mt-5 relative z-10">
              {(report.birth_data.member_names as string[]).filter(Boolean).slice(0, 8).map((name, i) => {
                // 從 members 陣列推斷角色（gender 推 父/母/子/女，若 relation_description 有就優先）
                const member = report.birth_data?.members?.[i]
                const gender = member?.gender?.toLowerCase() || ''
                // 根據位置推斷角色（多數家庭第一個為父/母）
                let role = ''
                if (i === 0 && gender === 'male') role = '父'
                else if (i === 0 && gender === 'female') role = '母'
                else if (gender === 'male') role = i === 1 ? '母' : '子'
                else if (gender === 'female') role = i === 1 ? '父' : '女'
                return (
                <div key={i} className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full" style={{
                  background: 'rgba(197,150,58,0.08)',
                  border: '1px solid rgba(197,150,58,0.22)',
                }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{
                    background: 'rgba(197,150,58,0.28)',
                    color: '#c9a84c',
                    border: '1px solid rgba(197,150,58,0.35)',
                  }}>
                    {name.slice(0, 1)}
                  </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-xs text-cream/85 font-medium">{name}</span>
                    {role && (
                      <span className="text-[9px] text-text-muted/70 tracking-wider">
                        {role}
                      </span>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}

          <div className="text-text-muted/50 text-xs mt-3 flex items-center justify-center gap-3 relative z-10">
            {/* P0-6（2026-04-17）：用固定 ISO 格式避免 server/client timezone 差異觸發 hydration error */}
            <span suppressHydrationWarning>{(() => {
              const d = new Date(report.created_at)
              const y = d.getUTCFullYear()
              const m = String(d.getUTCMonth() + 1).padStart(2, '0')
              const dd = String(d.getUTCDate()).padStart(2, '0')
              return `${y}年${Number(m)}月${Number(dd)}日`
            })()}</span>
            <span className="text-text-muted/20">|</span>
            <ReadingTime textLength={report.report_result?.ai_content?.length || 0} />
          </div>

          {/* v5.3.48 Wave 3.1：首屏破冰語（老闆 docx P1） */}
          {/* 客戶進入報告頁前 3 秒的「情感鉤子」—— 24px 金色 Serif 大字 + 淡入動畫
              模板化按方案分流，不依賴 ai_content 解析（避免 SSR 複雜度） */}
          {!isChumenji && !isRelationship && (
            <div className="mt-8 pt-6 relative z-10" style={{ borderTop: '1px solid rgba(201,168,76,0.12)' }}>
              <p className="text-[22px] sm:text-[24px] leading-[1.65] text-gold/90 font-medium tracking-wide" style={{
                fontFamily: 'var(--font-sans)',
                textWrap: 'balance',
              }}>
                {report.plan_code === 'C'
                  ? `接下來的幾分鐘，會改變${report.client_name}看自己的方式。`
                  : report.plan_code === 'D'
                  ? `那個讓${report.client_name}卡住的原因，命盤早就寫好了答案。`
                  : report.plan_code === 'G15'
                  ? `這個家的故事，比${report.client_name}以為的更深。`
                  : '從這裡開始，看見最真實的自己。'}
              </p>
            </div>
          )}
          {isRelationship && (
            <div className="mt-8 pt-6 relative z-10" style={{ borderTop: '1px solid rgba(201,168,76,0.12)' }}>
              <p className="text-[22px] sm:text-[24px] leading-[1.65] text-gold/90 font-medium tracking-wide" style={{
                fontFamily: 'var(--font-sans)',
                textWrap: 'balance',
              }}>
                你們之間的化學反應，比兩個人加起來的還多。
              </p>
            </div>
          )}

          {/* R 方案專屬：相容度結論大徽章（最醒目，品牌金色系統一配色） */}
          {isRelationship && compatibilityVerdict && (
            <div className="mt-6 relative z-10">
              <div
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-base font-bold tracking-wider"
                style={{
                  // 以品牌金為基調的單色系變化，避免多色衝突
                  background: compatibilityVerdict === '互補互助'
                    ? 'linear-gradient(135deg, rgba(197,150,58,0.22), rgba(232,200,122,0.14))'
                    : compatibilityVerdict === '合，但有雷區'
                    ? 'linear-gradient(135deg, rgba(197,150,58,0.18), rgba(26,42,74,0.28))'
                    : 'linear-gradient(135deg, rgba(197,150,58,0.10), rgba(122,159,207,0.20))',
                  color: '#c9a84c',
                  border: '1px solid rgba(197,150,58,0.35)',
                  boxShadow: '0 4px 16px rgba(201,168,76,0.12)',
                }}
              >
                <span className="text-lg" aria-hidden>
                  {compatibilityVerdict === '互補互助' ? '\u2726' : compatibilityVerdict === '合，但有雷區' ? '\u26A1' : '\u25CE'}
                </span>
                {compatibilityVerdict}
              </div>
              <div className="text-text-muted/60 text-xs mt-2 tracking-wide">根據七大命理系統綜合判定</div>
            </div>
          )}

          {/* E1/E2 專屬：事件/月份徽章 */}
          {isChumenji && (
            <div className="mt-5 relative z-10 flex flex-wrap justify-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium" style={{
                background: 'rgba(197,150,58,0.10)',
                border: '1px solid rgba(197,150,58,0.25)',
                color: '#c9a84c',
              }}>
                <span aria-hidden>&#9733;</span>
                {report.plan_code === 'E1' ? 'Top3 加乘時機'
                  : report.plan_code === 'E3' ? '4 週 × 每週 Top 2 = 8 吉時卡片'
                  : report.plan_code === 'E4' ? '年盤＋12 月盤'
                  : report.plan_code === 'E2' ? '本月 1 盤 · 晦日 22:20-23:00 執行'
                  : '整月出行時機'}
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs text-text-muted" style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {report.plan_code === 'E2' ? '奇門紫白擇日派四層架構' : '25 層評分體系'}
              </div>
            </div>
          )}

          {/* 操作按鈕（Client Component 處理 onClick）*/}
          <div className="relative z-10">
            <ReportClientButtons pdfUrl={report.pdf_url} planCode={report.plan_code} reportId={report.id} clientName={report.client_name} accessToken={token} />
          </div>
        </div>

        {/* ──── R 方案：關係描述 + 客戶問題引言卡 ──── */}
        {isRelationship && (report.birth_data?.relation_description || report.birth_data?.customer_note) && (
          <div className="rounded-2xl p-6 sm:p-8 mb-6 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(197,150,58,0.08), rgba(26,42,74,0.3))',
            border: '1px solid rgba(197,150,58,0.22)',
          }}>
            <div aria-hidden className="absolute top-0 left-0 w-1 h-full" style={{
              background: 'linear-gradient(180deg, rgba(197,150,58,0.6), rgba(197,150,58,0.1))',
            }} />
            <div className="pl-3">
              <div className="text-gold/60 text-[10px] tracking-[3px] mb-2 uppercase">你們的問題</div>
              {report.birth_data.relation_description ? (
                <p className="text-cream/90 text-base sm:text-lg leading-8 italic mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                  &ldquo;{report.birth_data.relation_description as string}&rdquo;
                </p>
              ) : null}
              {report.birth_data.customer_note && report.birth_data.customer_note !== report.birth_data.relation_description ? (
                <p className="text-cream/80 text-sm sm:text-base leading-7 italic">
                  &ldquo;{report.birth_data.customer_note as string}&rdquo;
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* ──── R 方案：雙人命盤事實卡（八字 / 生肖 / 日主 / 合盤判定）──── */}
        {isRelationship && report.birth_data?.members && report.birth_data.members.length >= 2 && (() => {
          const m1 = report.birth_data.members[0] as { name?: string; gender?: string; year?: number; month?: number; day?: number; hour?: number }
          const m2 = report.birth_data.members[1] as { name?: string; gender?: string; year?: number; month?: number; day?: number; hour?: number }
          // 從 AI 報告前 8000 字找雙方八字（AI 會引用）
          const aiHead = aiContent.slice(0, 9000)
          const ganzhiRegex = /([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[,、\/／]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[,、\/／]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[,、\/／]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g
          const matches = [...aiHead.matchAll(ganzhiRegex)]
          const bazi1 = matches[0] ? `${matches[0][1]} ${matches[0][2]} ${matches[0][3]} ${matches[0][4]}` : ''
          const bazi2 = matches[1] ? `${matches[1][1]} ${matches[1][2]} ${matches[1][3]} ${matches[1][4]}` : ''
          const ZMAP: Record<string, string> = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龍', 巳: '蛇', 午: '馬', 未: '羊', 申: '猴', 酉: '雞', 戌: '狗', 亥: '豬' }
          if (!bazi1 || !bazi2) return null
          const z1 = ZMAP[bazi1[1]] || ''
          const z2 = ZMAP[bazi2[1]] || ''
          const dayGan1 = bazi1[8]
          const dayGan2 = bazi2[8]
          // 檢查雙方年支生肖關係
          const yz1 = bazi1[1], yz2 = bazi2[1]
          const pair = [yz1, yz2].sort().join('')
          const HE: Record<string, string> = { '丑子': '六合', '亥寅': '六合', '卯戌': '六合', '酉辰': '六合', '巳申': '六合', '午未': '六合' }
          const CHONG: Record<string, string> = { '午子': '六沖', '丑未': '六沖', '申寅': '六沖', '卯酉': '六沖', '戌辰': '六沖', '亥巳': '六沖' }
          const HAI: Record<string, string> = { '子未': '六害', '丑午': '六害', '巳寅': '六害', '卯辰': '六害', '申亥': '六害', '戌酉': '六害' }
          const SANHE: Record<string, string[]> = { 水: ['申','子','辰'], 金: ['巳','酉','丑'], 火: ['寅','午','戌'], 木: ['亥','卯','未'] }
          const rels: string[] = []
          if (HE[pair]) rels.push(HE[pair])
          if (CHONG[pair]) rels.push(CHONG[pair])
          if (HAI[pair]) rels.push(HAI[pair])
          for (const [k, v] of Object.entries(SANHE)) {
            if (v.includes(yz1) && v.includes(yz2) && yz1 !== yz2) rels.push(`三合${k}局半合`)
          }
          if (yz1 === yz2 && ['辰','午','酉','亥'].includes(yz1)) rels.push('自刑')
          if (rels.length === 0) rels.push('無合無沖無刑無害（中性）')
          return (
            <div className="rounded-2xl p-6 sm:p-8 mb-8 relative overflow-hidden" style={{
              background: 'linear-gradient(135deg, rgba(26,42,74,0.6), rgba(15,22,40,0.8))',
              border: '1px solid rgba(197,150,58,0.25)',
            }}>
              <div aria-hidden className="absolute top-0 right-0 w-40 h-40 opacity-[0.06]" style={{
                background: 'radial-gradient(circle, rgba(201,168,76,1) 0%, transparent 70%)',
              }} />
              <div className="text-center mb-5 relative z-10">
                <div className="text-gold/50 text-[10px] tracking-[3px] uppercase">雙人命盤對照</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                {[
                  { name: m1.name, bazi: bazi1, zodiac: z1, dayGan: dayGan1, gender: m1.gender, year: m1.year, month: m1.month, day: m1.day },
                  { name: m2.name, bazi: bazi2, zodiac: z2, dayGan: dayGan2, gender: m2.gender, year: m2.year, month: m2.month, day: m2.day },
                ].map((p, i) => (
                  <div key={i} className="rounded-xl p-5" style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(197,150,58,0.18)',
                  }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold" style={{
                        background: 'rgba(197,150,58,0.2)',
                        color: '#c9a84c',
                        border: '1px solid rgba(197,150,58,0.35)',
                      }}>
                        {(p.name || '').slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-cream font-semibold text-sm">{p.name}</div>
                        <div className="text-text-muted/60 text-[10px]">
                          {p.gender === 'M' ? '男' : '女'} · {p.year}/{p.month}/{p.day}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted/60">生肖</span>
                        <span className="text-gold font-semibold">{p.zodiac}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted/60">日主</span>
                        <span className="text-gold font-semibold">{p.dayGan}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-muted/60">八字</span>
                        <span className="text-cream/90 font-mono tracking-wider text-[11px]">{p.bazi}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* 雙方生肖關係 */}
              <div className="mt-5 rounded-xl p-4 relative z-10" style={{
                background: 'rgba(197,150,58,0.06)',
                border: '1px solid rgba(197,150,58,0.18)',
              }}>
                <div className="flex items-center justify-center gap-3 flex-wrap text-sm">
                  <span className="text-gold font-semibold">{z1}</span>
                  <span className="text-text-muted/50" aria-hidden>&#10005;</span>
                  <span className="text-gold font-semibold">{z2}</span>
                  <span className="text-text-muted/50">=</span>
                  <span className="text-cream font-medium">{rels.join(' · ')}</span>
                </div>
              </div>
              <div className="text-center text-text-muted/50 text-[10px] mt-4 tracking-wide relative z-10">
                命盤資料來自 lunar-python 精算，為合盤論述的客觀基礎
              </div>
            </div>
          )
        })()}

        {/* ──── G15 家族藍圖：家族動力全貌圖（五行分佈 / 角色矩陣 / 關係網）──── */}
        {isFamily && report.birth_data?.member_names && (report.birth_data.member_names as string[]).filter(Boolean).length >= 2 && (
          <FamilyDynamicsPanel
            members={(report.birth_data.member_names as string[]).filter(Boolean).map((name, i) => {
              const gender = report.birth_data?.members?.[i]?.gender?.toLowerCase() || ''
              let role = ''
              if (i === 0 && gender === 'male') role = '父'
              else if (i === 0 && gender === 'female') role = '母'
              else if (gender === 'male') role = i === 1 ? '母' : '子'
              else if (gender === 'female') role = i === 1 ? '父' : '女'
              return { name, gender, role }
            })}
            aiContent={aiContent}
          />
        )}

        {/* ──── D 方案：你的問題引言卡（依主題變色）──── */}
        {report.plan_code === 'D' && (report.birth_data?.customer_note || report.birth_data?.other_question || report.birth_data?.analysis_topic || report.birth_data?.topic) && (
          <div className="rounded-2xl p-6 sm:p-8 mb-6 relative overflow-hidden" style={{
            background: `linear-gradient(135deg, ${dTheme.soft}, rgba(26,42,74,0.3))`,
            border: `1px solid ${dTheme.accent}33`,
          }}>
            <div aria-hidden className="absolute top-0 left-0 w-1 h-full" style={{
              background: `linear-gradient(180deg, ${dTheme.accent}99, ${dTheme.accent}1a)`,
            }} />
            <div className="pl-3">
              <div className="text-[10px] tracking-[3px] mb-2 uppercase" style={{ color: `${dTheme.accent}b3` }}>你的問題</div>
              {(report.birth_data.analysis_topic || report.birth_data.topic) && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full text-xs font-medium" style={{
                  background: dTheme.soft,
                  color: dTheme.accent,
                  border: `1px solid ${dTheme.accent}33`,
                }}>
                  <span aria-hidden>{dTheme.emoji}</span>
                  <span>主題：{dTheme.label || report.birth_data.analysis_topic || report.birth_data.topic}</span>
                </div>
              )}
              {(report.birth_data.customer_note || report.birth_data.other_question) && (
                <p className="text-cream/90 text-base sm:text-lg leading-8 italic" style={{ fontFamily: 'var(--font-sans)' }}>
                  &ldquo;{report.birth_data.customer_note || report.birth_data.other_question}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}

        {/* ──── D 方案：10 秒結論大徽章（主題配色）──── */}
        {report.plan_code === 'D' && dQuickAnswer && (
          <div className="rounded-2xl p-8 mb-6 text-center relative overflow-hidden hover-lift" style={{
            background: `linear-gradient(135deg, ${dTheme.soft}, rgba(26,42,74,0.5))`,
            border: `1.5px solid ${dTheme.accent}59`,
            boxShadow: `0 4px 20px ${dTheme.glow}`,
          }}>
            <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 opacity-[0.12]" style={{
              background: `radial-gradient(circle, ${dTheme.accent} 0%, transparent 70%)`,
            }} />
            <div className="relative z-10">
              <div className="text-[10px] tracking-[4px] mb-3 uppercase" style={{ color: `${dTheme.accent}cc` }}>10 秒結論</div>
              <p className="text-cream text-lg sm:text-xl font-semibold leading-9" style={{
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.02em',
              }}>
                {dQuickAnswer}
              </p>
              <div className="text-text-muted/60 text-xs mt-4 tracking-wider">
                繼續往下閱讀，了解完整命理分析
              </div>
            </div>
          </div>
        )}

        {/* ──── D 方案：命盤佐證摺疊區（讓細節派看具體引用的命盤欄位）──── */}
        {report.plan_code === 'D' && dChartCites.length >= 3 && (
          <details className="group rounded-2xl mb-6 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(26,42,74,0.35), rgba(15,22,40,0.45))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <summary className="list-none cursor-pointer p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors" style={{
              userSelect: 'none',
            }}>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{
                  background: dTheme.soft,
                  color: dTheme.accent,
                }} aria-hidden>⟐</div>
                <div>
                  <div className="text-cream text-sm font-medium">命盤佐證（{dChartCites.length} 條）</div>
                  <div className="text-text-muted/60 text-[11px] mt-0.5">點開查看這份報告引用的具體命盤欄位</div>
                </div>
              </div>
              <div className="text-text-muted text-xs group-open:rotate-180 transition-transform" aria-hidden>▼</div>
            </summary>
            <div className="px-4 pb-5 sm:px-5">
              <div className="h-px w-full mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dChartCites.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg" style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div className="text-[10px] tracking-wider shrink-0 px-1.5 py-0.5 rounded mt-0.5" style={{
                      background: dTheme.soft,
                      color: dTheme.accent,
                    }}>
                      {c.system}
                    </div>
                    <div className="text-cream/85 text-sm leading-6 font-mono">
                      {c.detail}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-text-muted/50 text-[11px] mt-3 leading-5">
                ※ 以上為 AI 從報告前段自動摘取的命盤欄位關鍵詞；每個論述都應該在括號中指明來自哪個系統的哪個欄位。
              </div>
            </div>
          </details>
        )}

        {/* ──── D 方案：你的路 3 步驟卡（若有抽取到）──── */}
        {report.plan_code === 'D' && dPathSteps.length > 0 && (
          <div className="rounded-2xl p-6 sm:p-8 mb-8 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(106,176,76,0.08), rgba(26,42,74,0.3))',
            border: '1px solid rgba(106,176,76,0.22)',
          }}>
            <div className="mb-4 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{
                background: 'rgba(106,176,76,0.18)',
                color: '#6ab04c',
              }} aria-hidden>&#10003;</div>
              <h3 className="text-lg font-semibold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
                你的路 — 3 步驟行動
              </h3>
            </div>
            <div className="space-y-4 sm:space-y-5">
              {dPathSteps.map((step, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl" style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div className="flex items-center gap-3 sm:block sm:shrink-0">
                    <div className="step-badge" aria-label={`第 ${i + 1} 步`}>
                      {i + 1}
                    </div>
                    {/* 手機版：徽章旁直接顯示步驟標題 */}
                    <div className="sm:hidden text-cream font-semibold text-base">
                      {step.title}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* 桌機版才顯示獨立標題 */}
                    <div className="hidden sm:block text-cream font-semibold mb-1.5" style={{ fontFamily: 'var(--font-sans)' }}>
                      {step.title}
                    </div>
                    {step.desc && (
                      <p className="text-text-muted text-sm leading-7">
                        {step.desc}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──── E1 方案：事件資訊卡 ──── */}
        {report.plan_code === 'E1' && (report.birth_data?.event_type || report.birth_data?.event_description) && (
          <div className="rounded-2xl p-6 sm:p-8 mb-8 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(197,150,58,0.08), rgba(26,42,74,0.3))',
            border: '1px solid rgba(197,150,58,0.22)',
          }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{
                background: 'rgba(197,150,58,0.18)',
                border: '1px solid rgba(197,150,58,0.3)',
              }} aria-hidden>&#9876;</div>
              <div className="flex-1 min-w-0">
                <div className="text-gold/60 text-[10px] tracking-[3px] mb-1 uppercase">本次事件</div>
                {report.birth_data.event_type && (
                  <div className="text-cream text-lg font-semibold mb-1" style={{ fontFamily: 'var(--font-sans)' }}>
                    {report.birth_data.event_type}
                  </div>
                )}
                {report.birth_data.event_description && (
                  <p className="text-text-muted text-sm leading-7">
                    {report.birth_data.event_description}
                  </p>
                )}
                {(report.birth_data.event_start_date || report.birth_data.event_end_date) && (
                  <div className="text-gold/70 text-xs mt-2 tracking-wider">
                    時間範圍：{report.birth_data.event_start_date || '—'}
                    {report.birth_data.event_end_date ? ` ~ ${report.birth_data.event_end_date}` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ──── E2 方案 v2.0：月度出行規劃卡 ──── */}
        {report.plan_code === 'E2' && top5Timings.length > 0 && (
          <div className="rounded-2xl p-6 sm:p-8 mb-8 relative overflow-hidden text-center" style={{
            background: 'linear-gradient(135deg, rgba(197,150,58,0.10), rgba(26,42,74,0.4))',
            border: '1px solid rgba(197,150,58,0.25)',
          }}>
            <div aria-hidden className="absolute -top-8 -right-8 w-32 h-32 opacity-[0.08]" style={{
              background: 'radial-gradient(circle, rgba(201,168,76,1) 0%, transparent 70%)',
            }} />
            <div className="text-gold/60 text-[10px] tracking-[3px] mb-2 uppercase">奇門紫白擇日派 · 本月月盤</div>
            <div className="text-3xl sm:text-4xl font-bold text-gold tracking-wider" style={{
              fontFamily: 'var(--font-sans)',
              textShadow: '0 0 20px rgba(197,150,58,0.25)',
            }}>
              {top5Timings[0]?.execution_date_lunar || top5Timings[0]?.date || ''}
            </div>
            <div className="text-text-muted/70 text-xs mt-2">
              {top5Timings[0]?.yue_ganzhi ? `${top5Timings[0].yue_ganzhi}月 · ` : ''}
              {top5Timings[0]?.ju ? `${top5Timings[0].ju} · ` : ''}
              單月 1 盤 · 農曆晦日 22:20-23:00 執行
            </div>
          </div>
        )}

        {/* ──── 命格名片卡片（主題式報告專屬）──── */}
        {personalityCard && (
          <div className="rounded-2xl p-8 mb-8 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(26,42,74,0.6), rgba(15,22,40,0.8))',
            border: '1px solid rgba(197,150,58,0.3)',
          }}>
            {/* 背景裝飾 */}
            <div className="absolute top-0 right-0 w-40 h-40 opacity-5" style={{
              background: 'radial-gradient(circle, rgba(197,150,58,1) 0%, transparent 70%)',
            }} />

            {/* 人格封號 */}
            <div className="text-center mb-2">
              <div className="text-gold/50 text-[10px] tracking-[4px] mb-2 uppercase">命格名片</div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-wide" style={{
                color: '#c9a84c',
                fontFamily: 'var(--font-sans)',
                textShadow: '0 0 20px rgba(197,150,58,0.3)',
              }}>
                {personalityCard.title}
              </h2>
            </div>

            {/* 一句話定義 */}
            {personalityCard.definition && (
              <p className="text-center text-cream/80 text-sm leading-relaxed mb-6 max-w-lg mx-auto">
                {personalityCard.definition}
              </p>
            )}
            {!personalityCard.definition && <div className="mb-4" />}

            {/* 關鍵字標籤 */}
            {personalityCard.keywords && personalityCard.keywords.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {personalityCard.keywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs" style={{
                    background: 'rgba(197,150,58,0.1)',
                    color: '#c9a84c',
                    border: '1px solid rgba(197,150,58,0.2)',
                  }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* 第一印象 vs 真實的你（雙欄對比）*/}
            {personalityCard.firstImpression && personalityCard.trueself && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-text-muted/50 text-xs mb-2 tracking-wider">第一印象</div>
                  <p className="text-cream text-sm leading-relaxed">{personalityCard.firstImpression}</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'rgba(197,150,58,0.06)', border: '1px solid rgba(197,150,58,0.15)' }}>
                  <div className="text-gold/60 text-xs mb-2 tracking-wider">真實的你</div>
                  <p className="text-cream text-sm leading-relaxed">{personalityCard.trueself}</p>
                </div>
              </div>
            )}

            {/* 天賦 vs 課題 標籤 */}
            {(personalityCard.talents.length > 0 || personalityCard.challenges.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* 天賦（綠色標籤）*/}
                {personalityCard.talents.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: '#6ab04c' }}>
                      <span>&#10003;</span> 天賦 Top 5
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {personalityCard.talents.map((t, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{
                          background: 'rgba(106,176,76,0.1)',
                          color: '#6ab04c',
                          border: '1px solid rgba(106,176,76,0.2)',
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* 課題（橙色標籤）*/}
                {personalityCard.challenges.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-2.5 flex items-center gap-1.5" style={{ color: '#e0963a' }}>
                      <span>&#9888;</span> 課題 Top 5
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {personalityCard.challenges.map((c, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{
                          background: 'rgba(224,150,58,0.1)',
                          color: '#e0963a',
                          border: '1px solid rgba(224,150,58,0.2)',
                        }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2026 年度一句話 */}
            {personalityCard.yearTheme && (
              <div className="rounded-xl p-4 text-center" style={{
                background: 'rgba(197,150,58,0.06)',
                border: '1px solid rgba(197,150,58,0.15)',
              }}>
                <div className="text-gold/50 text-[10px] tracking-[2px] mb-1.5">2026 丙午年</div>
                <p className="text-cream text-sm leading-relaxed">{personalityCard.yearTheme}</p>
              </div>
            )}

            {/* 如果沒有結構化數據，顯示原始內容 */}
            {personalityCard.talents.length === 0 && personalityCard.challenges.length === 0 && !personalityCard.firstImpression && !personalityCard.definition && (
              <div className="report-p mt-2" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(personalityCard.rawContent) }} />
            )}
          </div>
        )}

        {/* v5.6.10 R5 命理視覺化:14 系統評分雷達圖(對應 Gemini「致命傷」共識) */}
        {/* 顯示條件:有 ≥3 套系統評分(C/D/G15 主要、出門訣 E1-E4 系統較少跳過) */}
        {!isChumenji && analysesSummary.length >= 3 && (
          <div className="no-print">
            <SystemsRadar
              data={analysesSummary as { system: string; score: number }[]}
              title={
                report.plan_code === 'C' ? '十四套命理系統交叉評分'
                : report.plan_code === 'G15' ? '家族成員命格評分'
                : report.plan_code === 'R' ? '雙人合盤系統評分'
                : '系統評分'
              }
            />
          </div>
        )}

        {/* v5.6.10 R5-2:五行能量條(從 ai_content 解析、若無則 hide) */}
        {!isChumenji && wuxingData.length === 5 && (
          <div className="no-print">
            <WuxingEnergyBars data={wuxingData} title="五行能量分布" />
          </div>
        )}

        {/* v5.6.10 R7:大運起伏時間軸(從 ai_content 解析、若無則 hide) */}
        {!isChumenji && dayunData.length >= 3 && (
          <div className="no-print">
            <DayunTimeline data={dayunData} title="大運起伏時間軸" />
          </div>
        )}

        {/* ──── 摘要提示 + PDF 下載（v5.3.83:出門訣 E1-E4 不顯示 PDF、深度綁定 web）──── */}
        {isShowingSummary && report.pdf_url && !isChumenji && (
          <div className="rounded-xl p-6 mb-8 no-print" style={{ background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(26,42,74,0.3))', border: '1px solid rgba(197,150,58,0.25)' }}>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <div className="text-gold font-semibold mb-1">以下為報告重點摘要</div>
                <p className="text-text-muted text-sm">完整報告（含 {allSections.length} 個章節、{analysesSummary.length} 套系統逐一分析）請下載 PDF 版本</p>
              </div>
              <a
                href={buildPdfDownloadUrl(report.pdf_url, report.plan_code, report.client_name)}
                download={buildPdfDownloadFilename(report.plan_code, report.client_name)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e8c87a)', color: '#0a0e1a' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                下載完整 PDF 報告
              </a>
            </div>
          </div>
        )}

        {/* ──── 目錄導航（起承轉合四篇分組）──── */}
        {sections.length > 3 && (
          <div className="glass rounded-xl p-6 mb-8 no-print">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gold/70 text-xs tracking-[2px]">{isShowingSummary ? '重點摘要目錄' : '目錄'}</div>
              <div className="text-text-muted/50 text-[10px] tracking-wider">
                共 {sections.length} 章
              </div>
            </div>
            {(() => {
              const typeIcons: Record<string, string> = { positive: '&#10003;', caution: '&#9888;', improvement: '&#9881;', general: '&#9672;' }
              // 出門訣或章節少：維持扁平目錄
              if (isChumenji || sections.length < 4) {
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sections.map((sec, i) => (
                      <a key={i} href={`#sec-${i}`}
                        className="toc-link flex items-center gap-2 text-sm text-text-muted hover:text-gold py-1.5 px-3 rounded-lg hover:bg-white/5">
                        <span className="text-xs text-gold/50" dangerouslySetInnerHTML={{ __html: typeIcons[sec.type] || '&#9672;' }} />
                        <span>{sec.title}</span>
                      </a>
                    ))}
                  </div>
                )
              }
              // 付費方案：按起承轉合分組
              const grouped = groupChaptersByParts(report.plan_code, sections)
              const indexMap = new Map<ContentSection, number>()
              sections.forEach((s, i) => indexMap.set(s, i))
              return (
                <div className="space-y-4">
                  {grouped.map(group => (
                    <div key={group.part.key}>
                      <div
                        className="text-[11px] mb-2 flex items-center gap-2"
                        style={{ color: 'rgba(197,150,58,0.75)', letterSpacing: '2px' }}
                      >
                        <span style={{ fontSize: '14px' }}>{group.part.icon}</span>
                        <span>{group.part.label} · {group.part.stage}</span>
                        <span style={{ color: '#e6d89a', fontSize: '12px', letterSpacing: 'normal' }}>
                          {group.part.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                        {group.chapters.map(sec => {
                          const i = indexMap.get(sec) ?? 0
                          return (
                            <a key={i} href={`#sec-${i}`}
                              className="toc-link flex items-center gap-2 text-sm text-text-muted hover:text-gold py-1.5 px-3 rounded-lg hover:bg-white/5">
                              <span className="text-xs text-gold/50" dangerouslySetInnerHTML={{ __html: typeIcons[sec.type] || '&#9672;' }} />
                              <span>{sec.title}</span>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}


        {/* ──── 報告不完整時不顯示任何內容，直接顯示生成中 ──── */}
        {isContentEmpty && (
          <div className="section-card text-center py-12">
            <div className="text-4xl mb-4">⏳</div>
            <h3 className="text-cream font-semibold text-lg mb-2">報告生成中</h3>
            <p className="text-text-muted text-sm">系統正在為您生成完整報告，請稍後重新整理頁面。</p>
          </div>
        )}

        {/* ──── 出門訣 E1/E2 專屬：事件吉凶分析 / 本月運勢概覽 ──── */}
        {isChumenji && chumenjiAnalysis.length > 0 && (
          <div className="mb-8">
            {chumenjiAnalysis.map((sec, i) => (
              <CollapsibleSection
                key={`analysis-${i}`}
                title={sec.title}
                titleColor="var(--color-gold)"
                icon={
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: 'rgba(197,150,58,0.15)' }}>
                    {report.plan_code === 'E1' ? '⚔' : '📅'}
                  </div>
                }
                defaultExpanded={true}
                className="glass"
                style={{ borderLeft: '3px solid rgba(197,150,58,0.4)' }}
              >
                <div className="report-p" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(sec.content) }} />
              </CollapsibleSection>
            ))}
          </div>
        )}

        {/* v5.6.10 R5-3:出門訣 Top3 能量強度條(E1 顯示、E2/E3/E4 跳過、IA P1) */}
        {report.plan_code === 'E1' && top5Timings.length >= 2 && (
          <div className="no-print">
            <ChumenjiTop3Bar timings={top5Timings as { score?: number; title?: string; date?: string; time_start?: string; time_end?: string; direction?: string; shichen?: string; confidence?: string }[]} />
          </div>
        )}

        {/* ──── 吉時卡片（出門訣 E1=Top3 / E2=每週Top1）──── */}
        {isChumenji && top5Timings.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xl" style={{ background: 'rgba(197,150,58,0.15)' }}>🧭</div>
              <div>
                <h2 className="text-lg font-semibold text-gold" style={{ fontFamily: 'var(--font-sans)' }}>
                  {report.plan_code === 'E1' ? 'Top3 加乘時機'
                    : report.plan_code === 'E2' ? '本月最佳出行時機'
                    : report.plan_code === 'E3' ? '月度精選 8 吉時'
                    : report.plan_code === 'E4' ? '年度全運 12 月盤'
                    : '本月最佳出行時機'}
                </h2>
                <p className="text-text-muted/50 text-xs mt-0.5">點擊「加入行事曆」可直接同步到 Google Calendar</p>
              </div>
            </div>

            <div className="space-y-6 sm:space-y-8">
              {top5Timings.map((timing) => (
                <div
                  key={timing.rank}
                  className="section-card hover-lift"
                  style={{
                    background: timing.rank === 1
                      ? 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(15,22,40,0.6))'
                      : 'rgba(255,255,255,0.03)',
                    border: timing.rank === 1
                      ? '1px solid rgba(197,150,58,0.3)'
                      : '1px solid rgba(255,255,255,0.08)',
                    // Top1 加金色光暈強化視覺優先級
                    boxShadow: timing.rank === 1 ? '0 4px 20px rgba(201,168,76,0.12)' : undefined,
                  }}
                >
                  {/* v5.3.75：取消排名標識（🥇🥈🥉 + #N）——符合命盤就是好盤、不強調比較
                      方位加度數顯示（東→東 90°）讓客戶直接拿指南針對著走
                      v5.3.79 E2 v2.0：加農曆晦日顯示、加月朔備案提醒 */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-cream font-semibold">{timing.title}</div>
                      <div className="text-text-muted text-sm mt-0.5">
                        {formatTimingDate(timing.date)}&nbsp;&nbsp;{timing.time_start} - {timing.time_end}
                      </div>
                      {report.plan_code === 'E2' && timing.execution_date_lunar && (
                        <div className="text-gold/70 text-xs mt-1">
                          農曆晦日：{timing.execution_date_lunar}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-muted/50">建議方位</div>
                      <div className="text-gold font-semibold text-sm">{formatDirectionWithAngle(timing.direction, timing.angle)}</div>
                    </div>
                  </div>

                  {/* v5.3.74：砍信心指數評級——符合客戶命盤用神的盤都是好盤、不強調比較
                      只保留值使門資訊（中性、無評級） */}
                  {timing.zhishi_info && (
                    <div className="flex gap-3 mb-3">
                      <div className="px-3 py-1.5 rounded-lg text-xs text-blue-400" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        {timing.zhishi_info}
                      </div>
                    </div>
                  )}

                  {/* 神煞警告（v3.0 新增）*/}
                  {timing.shensha_warning && (
                    <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-400" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      ⚠ {timing.shensha_warning}
                    </div>
                  )}

                  {/* v5.3.73：盤對客戶主題的輔助（只用 AI 個人化版、不 fallback 罐頭）
                      老闆明確要求：必須對齊客戶 TOP3 主題、針對這盤能輔助什麼寫、不准用罐頭文 */}
                  {timing.plain_advantage && (
                    <div className="mb-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', borderLeft: '3px solid #22c55e' }}>
                      <div className="text-emerald-400/80 text-xs mb-1.5 font-medium">✨ 坐這個盤對你的輔助</div>
                      <p className="text-text-muted text-sm leading-7">{timing.plain_advantage}</p>
                    </div>
                  )}

                  {/* 主題專屬行動清單（只用 AI 個人化版）*/}
                  {Array.isArray(timing.plain_purpose) && timing.plain_purpose.length > 0 && (
                    <div className="mb-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(197,150,58,0.06)', borderLeft: '3px solid var(--color-gold)' }}>
                      <div className="text-gold/80 text-xs mb-1.5 font-medium">🎯 最適合做的事</div>
                      <ul className="text-text-muted text-sm leading-7 space-y-1">
                        {timing.plain_purpose.map((p: string, idx: number) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-gold/60 flex-shrink-0">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 奇門依據（v5.7.23 修正：值符/值使/八神/臨宮 4 項用 deterministic 結構化欄位 render
                      不再從 timing.reason markdown 抽—修 Claude 寫 reason 時把 8 個 timing 盤面對掉的 bug
                      實證：5 位 E3 客戶 38/72 timing 錯位（52.8%）、Python 後端 zhifu_star/zhishi_door 早就 deterministic、bug 100% 在前端取錯來源
                      reason 殘留段落（格局/年命宮/主題能量）仍顯示作 AI 詮釋
                      v5.3.17 註：預設展開，展現專業性 */}
                  <details className="mb-4 group" open>
                    <summary className="cursor-pointer text-xs text-gold/60 hover:text-gold select-none transition-colors flex items-center gap-1 mb-2">
                      <span className="group-open:rotate-90 transition-transform">▸</span>
                      <span className="font-medium">🔮 奇門依據{report.plan_code === 'E1' ? '（為什麼這個時間能加乘）' : ''}</span>
                    </summary>
                    <div className="px-4 py-3 rounded-lg space-y-1" style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid rgba(197,150,58,0.5)' }}>
                      {/* 結構化欄位：值符/值使/八神/臨宮 — 來自 Python 排盤引擎 deterministic 輸出 */}
                      {timing.star && (
                        <div className="text-text-muted/90 text-sm leading-7">
                          <span style={{ color: '#c9a84c', fontWeight: 600 }}>• 值符</span>：{timing.star}
                        </div>
                      )}
                      {timing.door && (
                        <div className="text-text-muted/90 text-sm leading-7">
                          <span style={{ color: '#c9a84c', fontWeight: 600 }}>• 值使</span>：{timing.door}
                        </div>
                      )}
                      {timing.shen && (
                        <div className="text-text-muted/90 text-sm leading-7">
                          <span style={{ color: '#c9a84c', fontWeight: 600 }}>• 八神</span>：{timing.shen}
                        </div>
                      )}
                      {timing.gong && (() => {
                        const g = String(timing.gong).trim()
                        const gongStr = g.endsWith('宮') ? g : g + '宮'
                        return (
                          <div className="text-text-muted/90 text-sm leading-7">
                            <span style={{ color: '#c9a84c', fontWeight: 600 }}>• 臨宮</span>：{gongStr}{timing.direction ? `（${timing.direction}）` : ''}
                          </div>
                        )
                      })()}
                      {/* AI 詮釋殘留段落（保留格局/年命宮/主題能量等 AI 詮釋）
                          v5.7.23 修：逐欄條件刪 — 只在結構化欄位有值時才刪 reason 對應 label，避免結構化空+reason 也被刪 = 空白（Codex P1）
                          regex 涵蓋變體：bullet/數字編號/markdown 粗體/中文星門後綴/全形冒號 */}
                      <div className="text-text-muted/90 text-sm leading-7 space-y-1" dangerouslySetInnerHTML={{
                        __html: ((): string => {
                          let text = String(timing.reason || '')
                          const labels: Array<[string, boolean]> = [
                            ['值符', Boolean(timing.star)],
                            ['值使', Boolean(timing.door)],
                            ['八神', Boolean(timing.shen)],
                            ['臨宮', Boolean(timing.gong)],
                          ]
                          for (const [label, hasField] of labels) {
                            if (!hasField) continue
                            // 涵蓋變體：- * • · > / 1. / ### / **值符**/值符星/值使門 / 全形冒號
                            const reStr = '^\\s*(?:[-*\\u2022\\u00B7\\uFF1E>]|\\d+[.\\u3001])?\\s*\\*{0,2}\\s*' + label + '(?:\\u661F|\\u9580)?\\s*\\*{0,2}\\s*[:\\uFF1A][^\\n]*$'
                            const re = new RegExp(reStr, 'gm')
                            text = text.replace(re, '')
                          }
                          return text
                            .replace(/[（(]基礎\d+[×x][\s\S]*?[）)]/g, '')
                            .replace(/[（(][+-]\d+[）)]/g, '')
                            .replace(/\s+-\s+\*\*/g, '\n- **')
                            .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#c9a84c">$1</strong>')
                            .replace(/^-\s*(.+?)$/gm, '<div class="ml-1">• $1</div>')
                            .replace(/\n{2,}/g, '\n')
                            .replace(/\n/g, '')
                            .trim()
                        })()
                      }} />
                    </div>
                  </details>

                  {/* v5.3.79 E2 v2.0：月朔備案提示（若引擎給了 backup_date_lunar + backup_time）*/}
                  {report.plan_code === 'E2' && timing.backup_date_lunar && timing.backup_time && (
                    <div className="mb-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)', borderLeft: '3px solid #3b82f6' }}>
                      <div className="text-blue-400/80 text-xs mb-1 font-medium">🌅 月朔備案（錯過晦日才用）</div>
                      <p className="text-text-muted text-sm leading-6">
                        {timing.backup_date_lunar}（月朔日清晨）{timing.backup_time}，朝同一吉方走 40 分鐘。效果約為晦日版的 70%。
                      </p>
                    </div>
                  )}

                  {/* Google Calendar 按鈕 */}
                  <a
                    href={buildGCalUrl(timing, report.client_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{ background: 'rgba(197,150,58,0.15)', border: '1px solid rgba(197,150,58,0.25)', color: 'var(--color-gold)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="12" y1="14" x2="12" y2="18" />
                      <line x1="10" y1="16" x2="14" y2="16" />
                    </svg>
                    加入 Google 行事曆
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──── 出門訣 E1/E2 專屬：補運操作指南 ──── */}
        {isChumenji && chumenjiGuide.length > 0 && (
          <div className="mb-8">
            {chumenjiGuide.map((sec, i) => (
              <CollapsibleSection
                key={`guide-${i}`}
                title={sec.title}
                titleColor="var(--color-gold)"
                icon={
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: 'rgba(197,150,58,0.15)' }}>&#9788;</div>
                }
                defaultExpanded={true}
                style={{ background: 'rgba(197,150,58,0.06)', border: '1px solid rgba(197,150,58,0.15)' }}
              >
                <div className="report-p" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(sec.content) }} />
              </CollapsibleSection>
            ))}
          </div>
        )}

        {/* ──── 出門訣 E1/E2 專屬：忌方忌日 / 注意事項 ──── */}
        {isChumenji && chumenjiWarnings.length > 0 && (
          <div className="mb-8">
            {chumenjiWarnings.map((sec, i) => (
              <CollapsibleSection
                key={`warn-${i}`}
                title={sec.title}
                titleColor="#e0963a"
                icon={
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: 'rgba(224,150,58,0.15)' }}>⚡</div>
                }
                defaultExpanded={true}
                style={{ background: 'rgba(224,150,58,0.06)', border: '1px solid rgba(224,150,58,0.15)' }}
              >
                <div className="report-p" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(sec.content) }} />
              </CollapsibleSection>
            ))}
          </div>
        )}

        {/* ──── 出門訣 E1/E2/E3/E4 專屬：其餘章節（v5.3.77 改純 div、砍摺疊 ▼）
             v5.3.78：執行方法 + 月度執行提醒用 hardcode 固定文案（老闆指定版本、避免 AI 隨意改寫）──── */}
        {isChumenji && chumenjiOther.map((sec, i) => {
          const isExecMethod = /執行方法|執行方式|操作方法/.test(sec.title)
          const isMonthlyReminder = /月度執行提醒|月度提醒|執行提醒|月度建議/.test(sec.title)

          const TOPIC_ZH: Record<string, string> = {
            career: '事業運', wealth: '財運', love: '感情運', health: '健康',
            study: '學業', noble: '貴人', villain: '化解小人', family: '家庭',
          }

          let contentToRender = sec.content

          if (isExecMethod) {
            contentToRender = `所有 8 張吉時卡片的操作方式相同，請一次記住：在卡片標示的時辰內出門（前後 15 分鐘仍屬同一時辰），朝卡片指定方位步行約 500 公尺，找一處安靜的地方停留 40 分鐘，期間不需走動、可滑手機，亦可讓自己安靜地待在吉方接引天時。不需要任何儀式或咒語，重點就是「身在吉方、心在當下」。`
          } else if (isMonthlyReminder && report.plan_code === 'E3') {
            // v5.3.78：E3 月度執行提醒動態生成（從 birth_data + top5Timings + ai_content 計算）
            const topics = report.birth_data.topics || []
            const topicRank = report.birth_data.topic_rank || {}
            const sortedTopics = [...topics].sort((a, b) => (topicRank[a] || 99) - (topicRank[b] || 99))

            // 從 AI content 卡片標題抽出主題分配
            const topicMatches = [...(report.report_result?.ai_content || '').matchAll(/主題：(\S+?)（TOP\s?\d/g)]
            const topicZhToCode = Object.fromEntries(Object.entries(TOPIC_ZH).map(([k, v]) => [v, k]))
            const counts: Record<string, number> = {}
            for (const m of topicMatches) {
              const zh = m[1]
              const code = topicZhToCode[zh] || zh
              counts[code] = (counts[code] || 0) + 1
            }

            // 找最強盤（score 最高）
            const bestTiming = [...top5Timings].sort((a, b) => (b.score || 0) - (a.score || 0))[0]

            // 日期範圍
            const dates = top5Timings.map(t => t.date).filter(Boolean).sort()
            const firstDate = dates[0] || ''
            const lastDate = dates[dates.length - 1] || ''
            const fmt = (d: string) => {
              const [, m, dd] = d.match(/(\d{4})-(\d{1,2})-(\d{1,2})/) || ['', '', '']
              return m && dd ? `${parseInt(m)}/${parseInt(dd)}` : d
            }
            // 續訂日 = lastDate - 3 天
            const renewDate = (() => {
              try {
                const d = new Date(lastDate)
                d.setDate(d.getDate() - 3)
                return fmt(d.toISOString().slice(0, 10))
              } catch { return '' }
            })()
            // 下輪起始 = lastDate + 1 天
            const nextStartDate = (() => {
              try {
                const d = new Date(lastDate)
                d.setDate(d.getDate() + 1)
                return fmt(d.toISOString().slice(0, 10))
              } catch { return '' }
            })()

            // 主題分配描述
            const topicDistDesc = sortedTopics.map((t, idx) => {
              const zh = TOPIC_ZH[t] || t
              const n = counts[t] || 0
              const suffix = idx === 0 ? `（你的 TOP 1 優先）` : ''
              return `${zh} ${n} 個${suffix}`
            }).join('、')

            // 最強盤描述
            const bestDesc = bestTiming
              ? `${fmt(bestTiming.date)} 的「${bestTiming.star}＋${bestTiming.door}＋${bestTiming.shen}」是整月中能量最強的組合，一次坐好勝過分散多次`
              : '引擎為你挑選的最強盤會發揮最核心的補運力量'

            contentToRender = `### 節奏掌握
每週執行 2 次，4 週共 8 次，建議把行事曆先標好、設定提醒。古法奇門講究「一時一盤」，每個吉時都是獨一無二的天時窗口，無法用隔天替代——所以盡量按照卡片標示的日期時辰出門。

### 萬一錯過
如果某週因為臨時狀況錯過了其中一個吉時，不需要補坐，直接執行該週的另一個即可。如果整週都錯過，也不影響下一週——每週的盤面都是獨立的。不要因為錯過而焦慮，焦慮本身才是最大的內耗。

### 主題分配邏輯
8 個吉時中，${topicDistDesc}。${bestDesc}。

### 續訂提醒
這份方案為 4 週（${fmt(firstDate)}-${fmt(lastDate)}）的個人化吉時，下一期建議在 ${renewDate} 前續訂，讓排盤引擎無縫計算 ${nextStartDate} 起的下一輪 8 個吉時，保持你的補運節奏不中斷。`
          }

          return (
            <div
              key={`other-${i}`}
              className="glass mb-4 p-5 rounded-lg"
              style={{ borderLeft: '3px solid rgba(197,150,58,0.4)' }}
            >
              <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-gold)' }}>
                <span className="text-xs text-gold/40 font-mono font-bold mr-2">{String(i + 1).padStart(2, '0')}</span>
                {sec.title}
              </h2>
              <div className="report-p" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(contentToRender) }} />
            </div>
          )
        })}

        {/* ──── 報告章節（起承轉合四大篇摺疊結構）──── */}
        {(() => {
          // 三大核心區塊的視覺配置（深藍/金/綠三色系，符合品牌一致性）
          const sectionStyles: Record<string, { bg: string; border: string; iconBg: string; icon: string; titleColor: string }> = {
            positive: { bg: 'rgba(106, 176, 76, 0.06)', border: '1px solid rgba(106, 176, 76, 0.18)', iconBg: 'rgba(106, 176, 76, 0.15)', icon: '\u2726', titleColor: '#6ab04c' },
            // caution 改為深藍（品牌一致性，避免橙色與金色衝突）— DeepSeek 反饋修正
            caution: { bg: 'rgba(26, 42, 74, 0.20)', border: '1px solid rgba(122, 159, 207, 0.25)', iconBg: 'rgba(122, 159, 207, 0.15)', icon: '\u26A1', titleColor: '#7a9fcf' },
            improvement: { bg: 'rgba(197, 150, 58, 0.06)', border: '1px solid rgba(197, 150, 58, 0.18)', iconBg: 'rgba(197, 150, 58, 0.15)', icon: '\u273F', titleColor: 'var(--color-gold)' },
          }

          // 單章節渲染（抽出來讓分篇/不分篇都能用）
          const renderChapter = (sec: ContentSection, globalIdx: number, chapterNum: number) => {
            const sStyle = sectionStyles[sec.type]
            const tldr = extractTLDR(sec.content, 70)

            // 章節標題下的 TL;DR 灰字摘要
            const tldrNode = tldr ? (
              <div
                className="text-xs mt-1 leading-6"
                style={{ color: 'rgba(255,255,255,0.48)', fontStyle: 'italic' }}
              >
                {tldr}
              </div>
            ) : null

            // v5.3.75：E 系列出門訣砍掉 CollapsibleSection 摺疊、改純 div 全展開（老闆指示）
            // 短報告不需要 ▼ 收合按鈕
            if (isChumenji) {
              return (
                <div
                  key={globalIdx}
                  id={`sec-${globalIdx}`}
                  className="glass mb-4 p-5 rounded-lg"
                  style={{
                    background: sStyle?.bg,
                    border: sStyle?.border || '1px solid rgba(197,150,58,0.15)',
                    borderLeft: sStyle ? sStyle.border : '3px solid rgba(197,150,58,0.4)',
                  }}
                >
                  <h2
                    className="text-lg font-semibold mb-3"
                    style={{ color: sStyle?.titleColor || 'var(--color-gold)' }}
                  >
                    {sStyle?.icon ? `${sStyle.icon} ` : ''}{sec.title}
                  </h2>
                  {tldrNode}
                  <div className="report-p mt-2">
                    <SectionExpander fullHtml={renderSectionMarkdown(sec.content)} sectionTitle={sec.title} />
                  </div>
                </div>
              )
            }

            if (sStyle) {
              return (
                <CollapsibleSection
                  key={globalIdx}
                  id={`sec-${globalIdx}`}
                  title={sec.title}
                  titleColor={sStyle.titleColor}
                  icon={
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: sStyle.iconBg }}>{sStyle.icon}</div>
                  }
                  defaultExpanded={true}
                  style={{ background: sStyle.bg, border: sStyle.border }}
                >
                  {tldrNode}
                  <div className="report-p">
                    <SectionExpander fullHtml={renderSectionMarkdown(sec.content)} sectionTitle={sec.title} />
                  </div>
                </CollapsibleSection>
              )
            }

            return (
              <CollapsibleSection
                key={globalIdx}
                id={`sec-${globalIdx}`}
                title={sec.title}
                titleColor="var(--color-gold)"
                chapterLabel={<span className="text-xs text-gold/40 font-mono font-bold">{String(chapterNum).padStart(2, '0')}</span>}
                defaultExpanded={true}
                className="glass"
                style={{ borderLeft: '3px solid rgba(197,150,58,0.4)' }}
              >
                {tldrNode}
                <div className="report-p">
                  <SectionExpander fullHtml={renderSectionMarkdown(sec.content)} sectionTitle={sec.title} />
                </div>
              </CollapsibleSection>
            )
          }

          // 付費方案（非出門訣）才啟用起承轉合分篇
          // C 方案（完整 15 章）/D/G15/R 章節結構固定，可安全分篇
          const eligibleForParts = !isChumenji && sections.length >= 4
          if (!eligibleForParts) {
            // v5.3.75：出門訣砍下方重複的「第 N 週 TOP X」週度卡片章節
            // 上方 Timeline 卡片已完整呈現該資訊（日期時辰/方位度數/白話輔助/奇門依據/行事曆）
            // 保留：引言、執行方法、月度執行提醒、寫給你的話
            const filteredSections = isChumenji
              ? sections.filter(sec => !/第\s*\d+\s*週.*TOP\s*\d/.test(sec.title || ''))
              : sections
            return filteredSections.map((sec, i) => renderChapter(sec, i, i + 1))
          }

          // 起承轉合分篇渲染
          const grouped = groupChaptersByParts(report.plan_code, sections)
          // 建立全域索引對應（保留 sec-${i} 錨點）
          const indexMap = new Map<ContentSection, number>()
          sections.forEach((s, i) => indexMap.set(s, i))

          return grouped.map((group, gIdx) => {
            // 起/承預設展開（核心認知、首屏即讀），轉/合預設摺疊（深入探索、點擊展開）
            // D 方案短報告則全展開（只有 7 章）
            const defaultExpanded = report.plan_code === 'D'
              ? true
              : (group.part.key === 'qi' || group.part.key === 'cheng')
            const isLastPart = gIdx === grouped.length - 1
            return (
              <PartSection
                key={`part-${group.part.key}`}
                part={group.part}
                chapterCount={group.chapters.length}
                defaultExpanded={defaultExpanded}
                currentOrder={gIdx + 1}
                totalParts={grouped.length}
              >
                {/* v5.3.25：每篇開頭「本篇重點」卡——UI 畫重點 */}
                <PartHighlights part={group.part} sections={group.chapters} />
                {group.chapters.map((sec) => {
                  const globalIdx = indexMap.get(sec) ?? 0
                  return renderChapter(sec, globalIdx, globalIdx + 1)
                })}
                {/* v5.3.25：合篇末尾月費訂閱 CTA（C 方案專屬）*/}
                {isLastPart && group.part.key === 'he' && report.plan_code === 'C' && (
                  <SubscribeCTA clientName={report.client_name} />
                )}
              </PartSection>
            )
          })
        })()}

        {/* ──── 出門訣推廣 ──── */}
        {!isChumenjiPlan(report.plan_code) && (
          <div className="section-card no-print" style={{ background: 'linear-gradient(135deg, rgba(197,150,58,0.1), rgba(26,42,74,0.4))', border: '1px solid rgba(197,150,58,0.25)' }}>
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="text-4xl shrink-0">&#9788;</div>
              <div className="flex-1">
                <div className="text-gold/60 text-[10px] tracking-[0.2em] mb-1">下一步行動</div>
                <h3 className="text-gold text-lg font-semibold mb-3" style={{ fontFamily: 'var(--font-sans)' }}>讓命理能量落地：出門訣</h3>
                <p className="text-text-muted text-sm leading-7 mb-4">
                  您的命格報告揭示了先天能量分佈，而<strong className="text-cream">出門訣</strong>是將這些能量轉化為行動的實戰工具。
                  源自《煙波釣叟歌》的千年擇吉術，系統以 25 層評分體系精算每個時辰八方位的能量——三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局，
                  再套入您的個人年命宮驗證。操作方法：在推薦的吉時出門，朝吉方走 500 公尺以上，到達後面朝吉方靜坐 40 分鐘接氣。
                  支援 15 種事件分類（求財、事業、感情、考試、談判、簽約等），每個推薦附帶信心指數。
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <a href="/pricing"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold text-dark font-bold rounded-lg text-sm btn-glow">
                    了解出門訣方案
                  </a>
                  <span className="text-xs text-text-muted/60 mt-2 sm:mt-0 sm:self-center">
                    事件擇吉 $59 / 月度單盤 $29
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──── 底部 PDF 按鈕（v5.3.83:出門訣 E1-E4 不顯示 PDF、深度綁定 web、使用行事曆）──── */}
        {report.pdf_url && !isChumenji && (
          <div className="flex justify-center my-10">
            <a
              href={buildPdfDownloadUrl(report.pdf_url, report.plan_code, report.client_name)}
              download={buildPdfDownloadFilename(report.plan_code, report.client_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105 shadow-lg"
              style={{
                background: isChumenji
                  ? 'linear-gradient(135deg, #c9a84c 0%, #e8c87a 50%, #f7dfa0 100%)'
                  : 'linear-gradient(135deg, #c9a84c, #e8c87a)',
                color: '#0a0e1a',
                boxShadow: isChumenji ? '0 4px 14px rgba(201, 168, 76, 0.4)' : undefined,
              }}
            >
              {isChumenji ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <polyline points="8 15 12 19 16 15" />
                  <line x1="12" y1="13" x2="12" y2="19" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              {isChumenji
                ? (report.plan_code === 'E1' ? '下載 Top3 吉時 PDF' : report.plan_code === 'E2' ? '下載本月月盤 PDF' : '下載 4 週吉時月度 PDF')
                : '下載 PDF 完整報告'}
            </a>
          </div>
        )}

        {/* ──── 分享精華卡片 ──── */}
        {report.status === 'completed' && (
          <ShareCard
            planCode={report.plan_code}
            clientName={report.client_name}
            aiContent={report.report_result?.ai_content || ''}
            top5Timings={report.report_result?.top5_timings}
          />
        )}

        {/* ──── 客戶反饋 ──── */}
        {report.status === 'completed' && (
          <ReportFeedback
            reportId={report.id}
            planCode={report.plan_code}
            customerEmail={report.customer_email}
          />
        )}

        {/* ──── 頁尾 ──── */}
        <div className="text-center text-text-muted/30 text-xs leading-7">
          <p>&copy; 2026 鑒源命理平台 &middot; jianyuan.life</p>
          <p>此報告僅供個人參考，不構成任何法律、醫療或財務建議</p>
        </div>

      </div>
    </div>
  )
}
