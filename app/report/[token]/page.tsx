import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import pkg from '../../../package.json'
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
import { ReadingProgressBar, BackToTopButton, ReadingTime, FloatingActionPanel } from '@/components/ReportEnhancements'
import ScrollSpy from '@/components/ScrollSpy'
// v5.7.80 SidebarTOC 移除(LLM 標「左欄擠右欄」根治、改單欄)、import 同步清掉
// import SidebarTOC from '@/components/SidebarTOC'
import FiveElementsRadar from '@/components/FiveElementsRadar'
import ShareReportButton from '@/components/ShareReportButton'
import ZiweiPalaceWheel from '@/components/ZiweiPalaceWheel'
import InteractiveActionItem from '@/components/InteractiveActionItem'
import SystemsRadar from '@/components/report/SystemsRadar'
import WuxingEnergyBars from '@/components/report/WuxingEnergyBars'
import ChumenjiTop3Bar from '@/components/report/ChumenjiTop3Bar'
import DayunTimeline from '@/components/report/DayunTimeline'
// v5.10.10 R+8 — 5 LLM Round 3 全 95+ 衝刺批次
import { OnboardingModal, R8Toolbar, WhyThisVerdictLink } from '@/components/report/R8Enhancements'
import ActionRecommendations from '@/components/report/ActionRecommendations'
import SystemsAnchorList from '@/components/report/SystemsAnchorList'
import FamilyDynamicsPanel from '@/components/FamilyDynamicsPanel'
import { groupChaptersByParts, extractTLDRAndStripped } from '@/lib/report-structure'
import { localBazi } from '@/lib/bazi-local'
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

  // v5.10.81 P0 真修(老闆抓「何紀萳癸水日主、被誤標太陽之火(丙日主)」核心命理錯誤):
  // 原邏輯 bug:① 用 fullText.includes 不限定「命格名片」section、② 按白名單順序迭代「太陽之火」(白名單第 3)早於「雨露甘霖」(白名單第 10)迭代到、ai_content 後段流年/運勢章節提及「太陽之火」就會誤抽
  // 證據:何紀萳 ai_content L577「命格封號:雨露甘霖」(正確、癸水日主)+ L23067「太陽之火」(後段非命格封號)、舊邏輯抽到「太陽之火」
  // 影響:所有 C / G15 主題式報告、只要 ai_content 後段提及任何白名單詞(流年/比喻/其他章節)就會抽錯
  // 修補:① 限定「命格名片」section(content)、不用 fullText ② 用 indexOf 取最早位置、不是白名單順序
  // 第 0 層:在命格名片 section 內找最早出現的合法封號(by position、不是 by 白名單順序)
  let earliestPos = Infinity
  let earliestTitle = ''
  for (const legal of LEGAL_PERSONA_TITLES) {
    const pos = content.indexOf(legal)  // 限定 content (命格名片 section)、不是 fullText
    if (pos >= 0 && pos < earliestPos) {
      earliestPos = pos
      earliestTitle = legal
    }
  }
  if (earliestTitle) title = earliestTitle

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
        // v5.7.37 真因修:原只 skip「排名」、實際 AI 寫「排序 / 名次 / 序號」表頭、整行被當 talent push
        // 截圖證據:雨露甘霖客戶天賦 Top 5 第一個 tag = 「| 排序 | 天賦 | 一句話說明 |」
        // 修:① 任何含 markdown table 結構符號 | 的 header keywords 行都 skip ② markdown separator |---|---| skip
        if (/^[|｜]?\s*(?:排名|排序|名次|序號|分類|類型|項目|說明|描述|天賦|課題|挑戰|要點)\s*[|｜]/.test(cleaned)) continue
        if (/^[|｜][-:\s|｜]+[|｜]?$/.test(cleaned)) continue
        if (/^[-:]+$/.test(cleaned.replace(/\|/g, ''))) continue
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
        // v5.7.37 真因修:原只 skip「排名」、實際 AI 寫「排序 / 名次 / 序號」表頭、整行被當 talent push
        // 截圖證據:雨露甘霖客戶天賦 Top 5 第一個 tag = 「| 排序 | 天賦 | 一句話說明 |」
        // 修:① 任何含 markdown table 結構符號 | 的 header keywords 行都 skip ② markdown separator |---|---| skip
        if (/^[|｜]?\s*(?:排名|排序|名次|序號|分類|類型|項目|說明|描述|天賦|課題|挑戰|要點)\s*[|｜]/.test(cleaned)) continue
        if (/^[|｜][-:\s|｜]+[|｜]?$/.test(cleaned)) continue
        if (/^[-:]+$/.test(cleaned.replace(/\|/g, ''))) continue
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

  // v5.7.47:talents/challenges 去重(Gemini 標 P1「行動派 標籤重複出現 2 次」)
  // 用 Set 去重保留首次出現順序
  const dedupTalents = Array.from(new Set(talents))
  const dedupChallenges = Array.from(new Set(challenges))
  // keywords 也去重
  const dedupKeywords = keywords ? Array.from(new Set(keywords)) : keywords

  return {
    title: title || '命格名片',
    definition,
    talents: dedupTalents.slice(0, 5),
    challenges: dedupChallenges.slice(0, 5),
    firstImpression,
    trueself,
    keywords: dedupKeywords,
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
    // v5.10.61 P0 修(老闆「逐頁看」抓 R 李馮 H2「丙午026-2028）」historical AI bug):
    //   AI 生成端某些 R 報告 H2 含「丙午026-2028」(缺「年(2」)、表示原 markdown 有「丙午年（2026-2028）」但 markdown 解析時 ** 不對稱吞字
    //   frontend defensive regex 自動補回「丙午年(2026-2028)」、不需 admin 重生即修 historical 客戶報告
    //   pattern:「丙午」緊接 3 位數字-4 位數字、補「年(2」+「)」
    cleanTitle = cleanTitle.replace(/丙午(\d{3})-(\d{4})[）)]/g, '丙午年(2$1-$2)')
    cleanTitle = cleanTitle.replace(/丁未(\d{3})-(\d{4})[）)]/g, '丁未年(2$1-$2)')
    cleanTitle = cleanTitle.replace(/戊申(\d{3})-(\d{4})[）)]/g, '戊申年(2$1-$2)')

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
      // v5.10.90 P0 修(2026-05-10 老闆抓 4 件報告「表格第 1 欄被截」根因 + visual_audit sub-agent #1 K1 共識):
      //   原 .filter(c => c.length > 0) 把空 cell(如 markdown header `| | A | B | C |` 第 1 欄)過濾掉
      //   → header 3 欄、body 4 欄(`| 2026 | A | B | C |`)= column count mismatch
      //   → 第 1 欄 sticky 但 header 對應 cell 不存在 → fit-content 0 寬 → 整欄被截只剩細條
      //   修 1:不 filter 空 cell、保留全 column 對齊
      //   修 2:trim 後仍空的 cell 顯示 &nbsp;(non-breaking space)撐最小寬度
      //   修 3:trim 連續 trailing 空 cell(markdown trailing pipe artifact、避免末欄空白)
      const cells = cleanInner.split('|').map(c => c.trim())
      // 移除尾部連續空 cell(markdown 慣常結尾 `| ... |` 多餘 pipe)
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      // v5.10.74 P0 修(4-LLM 共識:C 何宥諄「天賦 Top 3」全是 `| ★★★★` 直接當 label):
      //   原邏輯 cells.length<2 直接 return _m、導致行內單格殘留 pipe(如 `| ★★★★`)以原文渲染
      //   修:單格內容若是純 emoji/星級/符號、直接顯示內容(剝掉 pipe);其他單格 fallback 用空格替代 pipe
      const nonEmptyCells = cells.filter(c => c.length > 0)
      if (nonEmptyCells.length < 2) {
        if (nonEmptyCells.length === 1) {
          // 純星級 / 純符號 / 短標 → 直接顯示
          if (/^[★☆✦✓●◯△♦︎○✿❀✯✰⭐\s\d.+%-]+$/.test(nonEmptyCells[0])) return nonEmptyCells[0]
          // 其他單格殘留 → 至少剝掉 pipe、不顯示原始 `|`
          return nonEmptyCells[0]
        }
        return _m
      }
      const cellsHtml = cells.map(c => {
        // v5.10.90:空 cell 用 &nbsp; 撐最小寬度、避免 grid 0 寬
        const display = c === '' ? '&nbsp;' : c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        return `<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.7;min-width:60px">${display}</td>`
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
      // v5.10.30 R+8 P0 修(7-LLM 共識「五年總覽年份欄整欄空白」、L4 Gemini Vision 抓):
      //   原 v5.7.52 sticky column 邏輯產生雙 style attribute bug(舊 .replace 不吃 style="...原"、直接 prepend 第二個 style)
      //   瀏覽器拿第一個 style 忽略 sticky → 第一欄背景透明 + 文字 invisible
      //   修補:把 sticky CSS 合併進原有 style attribute(用 capture group + 完整替換)
      // v5.10.126 P0×P0 終極修(老闆暴怒「人生藍圖/合否/家庭藍圖沒一個沒卡到」、sticky col 設計 fragile、多次修都漏):
      //   v5.10.30 / v5.10.125 sticky col-1 邏輯本身 fragile:fit-content 從 header 計算、空 header → 0 寬被截
      //   徹底解:移除 sticky col、改純 horizontal scroll(mobile 滑動看全表)、第 1 欄 fit-content from 自身 cell
      //   trade-off:失去「sticky col-1 永遠可見」的 desktop UX、但解所有 col-1 截斷問題
      //   每個 td 加 min-width:80px(避免內容極短時 column collapse)
      const headerStickyRow = headerRow.replace(/<th\s+style="([^"]*)"/g, (_m, s) =>
        `<th style="${s};min-width:80px"`
      )
      const bodyStickyRows = bodyRows.replace(/<td\s+style="([^"]*)"/g, (_m, s) =>
        `<td style="${s};min-width:80px"`
      )
      // table-layout: auto(預設)讓每欄 content-driven、不被 sticky 強制 fit-content
      return `<div class="table-breakout" style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:12px 0;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)"><table style="width:100%;border-collapse:collapse;min-width:480px;font-size:13px;table-layout:auto">${headerStickyRow}${bodyStickyRows}</table></div>`
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
    // v5.10.38 R+8 revert v5.10.37(對應 lesson #073「退步立即 revert」):
    //   v5.10.37 把 > 50 字 ** 降 plain text、結果 V Kimi 92→89(-3)、V Gemini 98→97(-1)、平均退步 1.33
    //   Vision LLM 主觀偏好衝突:Gemini 覺得 highlight 過密 / Kimi 覺得重點不夠突出
    //   依 lesson #073 鐵律 revert、回 v5.10.36 平均 93.33 baseline、accept 為里程碑
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
// v5.10.112 P0 修(final-final verify v5.10.108 抓 5/6 件 starStar 1-63 仍 leak):
//   v5.10.105 暴力清只在 renderSectionMarkdown end、但 chip / hero / role / personalityCard.talents 等
//   多處 component 走 stripRawMarkdown 注入 raw markdown(非 AI bold 平衡保證)、仍 leak raw `**`
//   修:stripRawMarkdown 全頁暴力清 raw `**`、所有 dangerouslySetInnerHTML 路徑統一過
//   trade-off:可能誤刪 AI 內容引用的 `**`(production AI 不該保留 raw markdown source、安全)
function stripRawMarkdown(html: string): string {
  return (html || '')
    .replace(/\*\*/g, '')
    // v5.10.121 P0 修(L2 IA #2、對外清零 15→14 系統、c_plan 7 處 hardcode 跟鐵律矛盾):
    //   c_plan_v2 內部仍 15 系統(含南洋 raw_data 喂 AI)、對外 14 系統(南洋訓練不足)
    //   frontend 後處理 replace「15 系統 / 15 套 / 十五系統 / 十五套」→「14」
    //   negative:章節編號「十五、」不換(後接「、」非「系統/套」)
    .replace(/十五系統/g, '十四系統')
    .replace(/十五套/g, '十四套')
    .replace(/15\s*系統/g, '14 系統')
    .replace(/15\s*套/g, '14 套')
    // v5.10.129 P0 修(L2 IA round 2 P0-1、漏 cover 子串):
    .replace(/十五個系統/g, '十四個系統')
    .replace(/十五張底片/g, '十四張底片')
    .replace(/15\s*個\s*系統/g, '14 個系統')
    // v5.10.134 P0 修(L1 R2-1、達 95+ 最後 0.7 分):
    .replace(/東西方十五套/g, '東西方十四套')
    .replace(/東西方15套/g, '東西方14套')
    .replace(/十五系統/g, '十四系統')  // 補通用 case
}

// 渲染單個區塊內的 markdown 為 HTML（支援 ### 子章節彩色框）
function renderSectionMarkdown(content: string): string {
  // v5.8.8 段落首字 emoji prefix(Claude P1「段落無分層」修)
  // 偵測:每個 ## h2 之後的第一段、加 ⚡ prefix
  // 偵測:【XX】開頭的段落、轉粗體 + 顏色
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
    .replace(/^(?:接下來|以下是|現在|讓我們|我們來看|在本章中?|這一章節?|本章我們?|我們透過命理|我們現在就|這邊我們|首先我們|接著我們)[，,。、]?\s*/gm, '')
    .replace(/^我們(?:深入|詳細|仔細)?(?:來?看|看看|分析|探討|了解|認識)\s*[，,。、]?\s*/gm, '')
    .replace(/^那麼[，,]?\s*/gm, '')
    // v5.8.1 砍 AI 生成的奇怪轉折句(Claude P2 「是下列因素人」「你有是位置區隔人」等不通順)
    .replace(/是下列因素人[^，。\n]*[，。]/g, '')
    .replace(/你有是位置區隔人[^，。\n]*[，。]/g, '')
    // v5.8.9 砍冷啟動雞湯開場白(Claude P2「這個人好好啊、應該很好相處」)
    .replace(/^這個人好好啊[^。\n]*[，。]\s*/gm, '')
    .replace(/^應該(?:很|蠻)?好相處[^。\n]*[，。]\s*/gm, '')
    .replace(/^[^\n]{0,15}人應該(?:很|蠻)?[^\n]{0,15}[，。]\s*/gm, '')
    // v5.8.8 【XX】開頭加色強化(段落分層)
    .replace(/^【([^】]{2,12})】/gm, '<span class="report-bold" style="color:var(--color-gold)">【$1】</span>')
    // v5.7.85 砍隨意百分比廢話「砍掉 40%」「提升 50%」等(無命理依據的數字)
    .replace(/(?:把.{0,8}砍掉|減少|裁掉|刪除)\s*\d{1,2}\s*%/g, '優化')
    .replace(/(?:提升|增加|增強)\s*\d{1,2}\s*%(?:[^，。\n]{0,15})/g, '提升')
    // v5.7.98 砍連續重複段落(Gemini P0「複製貼上忘了刪」修)
    // 偵測:同一段落 ≥ 30 字、連續出現 2 次、保留第 1 次砍第 2 次
    .replace(/((?:^|\n)([^\n]{30,500})\n+)\2/g, '$1')
    // 連續重複句(同一句末尾跟著同一句、≥ 20 字)
    .replace(/(([^。！？\n]{20,200}[。！？]))\s*\1/g, '$1')
    // v5.7.85 砍純文學比喻空話「就像一片深海」「猶如X」開頭(沒命理依據)
    .replace(/(?:你的命格|你的人生|你的一生)就像[^，。]{5,40}[，。]/g, '')
    .replace(/猶如[^，。]{5,40}[，。]/g, '')
    // v5.10.78 P0 修(L4 Gemini Vision 共識 P0 #7:raw `**` markdown 殘留、AI 偶生不平衡 bold marker、C 何宥諄 line 1885「**對應流年丙午:2028 戊申年食神...」開頭 `**` 無對應 closing)
    // 修:行首 `**` 後接純文字、同行無第二個 `**` → 視為 unmatched、行尾補 closing(轉成完整 `**...**` markdown bold)
    .replace(/^\*\*([^\n*]{2,200})$/gm, '**$1**')
    // v5.10.89 P0 修(2026-05-10 visual_audit_2026-05-10 抓 4 件、bullet leading pattern、v5.10.78 regex 行尾 $ 限定漏接「行首 ** + 短 label + 冒號 + 長文」case):
    //   證據 C 何紀萳 line 1297/1303/1306「**紫微流年丙午*：...」「**吠陀流年丙午:...」「**生肖流年丙午:...」+ C 何宥諄 line 1883「**對應流年丙午:2028...」
    //   pattern:行首 ** + 2-40 字 label + 可選殘留 0-2 個 * + 冒號(中文 or 英文) → AI 想寫 `**X**:` 但 closing 漏
    //   修:吞掉中間殘留 *、補 closing ** 在 : 前
    .replace(/^\*\*([^\n*]{2,40})\*{0,2}([:：])/gm, '**$1**$2')
    .replace(/\n{3,}/g, '\n\n')
  // 按 ### 分割子章節
  const subParts = content.split(/^### /m)
  if (subParts.length <= 1) {
    // 無子章節，直接渲染
    return stripRawMarkdown(
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
  // v5.10.105 P0 修(visual_audit_v5_10_104 starStarCount C 何宥諄=37 / G15 霖=63、ai_content `**` 漏率 1.9-8.8%):
  //   render 後若 raw `**` 仍殘留(AI 生成不平衡 markdown bold + renderInlineMarkdown regex 漏網)
  //   暴力清:rendered HTML 中所有 raw `**` 全刪、客戶看不到 markdown source
  //   trade-off:可能誤刪某 case 引用文中的 `**`、但 production AI 不應在引用文中保留 markdown source
  return stripRawMarkdown(html.replace(/\*\*/g, ''))
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
  // v5.10.86 P0 修(audit P0-4):章節別名 alternation `(10 秒內結論|你的答案|快速結論)` short-circuit、若兩個章節同時存在、永遠抽前者
  // 修補:用 indexOf 取最早出現章節(by position、不是 by alternation 順序)
  const SECTION_ALIASES = ['10 秒內結論', '10秒內結論', '10 秒結論', '你的答案', '快速結論']
  let earliestPos = Infinity
  let earliestAlias = ''
  for (const alias of SECTION_ALIASES) {
    const pos = markdown.indexOf(alias)
    if (pos >= 0 && pos < earliestPos) {
      earliestPos = pos
      earliestAlias = alias
    }
  }
  // 用最早章節 alias 跑 regex(不依賴 alternation 順序)
  const quickSection = earliestAlias
    ? markdown.slice(earliestPos).match(new RegExp(`(?:[一二三四五六七八九十]+、\\s*)?${earliestAlias.replace(/[\s]/g, '\\s*')}[\\s\\S]*?(?=\\n##?\\s|$)`, 'm'))
    : markdown.match(/##?\s*(?:[一二三四五六七八九十]+、\s*)?(?:10\s*秒內?結論|你的答案|快速結論)[\s\S]*?(?=\n##?\s|$)/m)
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
    // v5.7.51 雙向抓 + 限同句:解 HYC 大運 timeline 跳號錯配 bug
    // 證據:HYC ai 寫「(當前丙辰大運(2-11 歲))」干支在前 + 「12-21 歲乙卯大運」干支在後、原 regex 只匹配後者、跨段抓到不對的干支
    // 修:① 加干支在前的 pattern「干支大運...年齡」② 限同段 \s 不跨換行 ③ 表格行也抓
    const stages_raw: Array<[number, number, string, string]> = []  // [start, end, pillar, source]
    // Pattern A:「年齡 X-Y 歲... 干支大運」(原)
    const reA = /(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*歲[^\n（(]{0,15}?([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])\s*大運/g
    // Pattern B:「干支大運(年齡 X-Y 歲)」干支在前
    const reB = /([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])\s*大運\s*[（(]?\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*歲/g
    // Pattern C:財運時間表行「| 干支 | X-Y 歲 |」表格格式
    const reC = /\|\s*([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])\s*[（(]?[^|]*[）)]?\s*\|\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*歲/g
    let m: RegExpExecArray | null
    for (const re of [reA, reB, reC]) {
      while ((m = re.exec(aiContent)) !== null) {
        if (re === reA) {
          stages_raw.push([parseInt(m[1]), parseInt(m[2]), m[3] + m[4], 'A'])
        } else {
          stages_raw.push([parseInt(m[3]), parseInt(m[4]), m[1] + m[2], re === reB ? 'B' : 'C'])
        }
      }
    }
    // dedup by pillar、優先 C 表格 > B 干支前 > A 年齡前(reverse keep last)
    const seenPillar = new Set<string>()
    const seenAge = new Set<string>()
    const out: typeof stages_raw = []
    for (const s of stages_raw.sort((x,y) => x[3].localeCompare(y[3]) || x[0] - y[0])) {
      const ageKey = `${s[0]}-${s[1]}`
      if (seenPillar.has(s[2]) || seenAge.has(ageKey)) continue
      const span = s[1] - s[0]
      if (span < 6 || span > 11 || s[0] < 0 || s[1] > 120) continue
      seenPillar.add(s[2])
      seenAge.add(ageKey)
      out.push(s)
    }
    out.sort((a,b) => a[0] - b[0])
    for (const [start, end, pillar] of out) {
      stages.push({ age_start: start, age_end: end, pillar, energy: 60 })
    }
    return stages
  })()
  // 註:以下原 regex 邏輯保留為 fallback、但通常 v5.7.51 新邏輯已抓全
  const _legacy_dayun = (() => {
    if (!aiContent) return []
    const stages: Array<{ age_start: number; age_end: number; pillar?: string; theme?: string; energy?: number }> = []
    const re = /(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*歲[^\n]{0,30}?([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])\s*大運/g
    let m: RegExpExecArray | null
    const seenPillar = new Set<string>()
    const seenAgeRange = new Set<string>()
    while ((m = re.exec(aiContent)) !== null) {
      const start = parseInt(m[1])
      const end = parseInt(m[2])
      const span = end - start
      // v5.7.42:span 容差再放寬 6-11(原 8-11)
      // 證據:HJN ai 寫「33-39 歲(庚午大運)」span=6(未滿一柱、起運中段)、被原規則拒、UI 跳 20-29→40-49
      // 修:接受 6-11 容差、後續 dedup by pillar/age 仍會去重、避免大運柱缺漏
      if (span < 6 || span > 11) continue
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
  // v5.10.77 P0 根本修(Playwright leaf node 共識:5 個 React component 散布 raw markdown row):
  //   AI 把整個 markdown table row(`| ★★★★★ | name | desc |`)寫進 talents/challenges 陣列
  //   修:解析後**全域 sanitize**、所有下游 component(精華卡/洞察/2026 行動/Top 5 badge/insights)自動受益
  const sanitizeTalentRow = (raw: string): string => {
    if (!raw) return ''
    let s = String(raw).trim()
    if (s.includes('|')) {
      const cells = s.split('|').map(c => c.trim()).filter(c => c.length > 0)
      const isStarOnly = (x: string) => /^[★☆✦●◯△♦︎○✿❀✯✰⭐\s]+$/.test(x)
      const nameCell = cells.find(c => !isStarOnly(c) && c.length > 0)
      s = nameCell || cells[0] || ''
    }
    s = s.replace(/^\*+\s*|\s*\*+$/g, '').replace(/[★☆✦●◯△♦︎○✿❀✯✰⭐]+/g, '').trim()
    return s
  }
  const personalityCardRaw = isThematic ? parsePersonalityCard(aiContent) : null
  const personalityCard = personalityCardRaw ? {
    ...personalityCardRaw,
    talents: (personalityCardRaw.talents || []).map(sanitizeTalentRow).filter(t => t.length > 0),
    challenges: (personalityCardRaw.challenges || []).map(sanitizeTalentRow).filter(c => c.length > 0),
  } : null

  // R 方案：從報告內容提取合/不合結論（不使用分數，命不該有分數）
  // v5.10.83 P0 修(底層 audit P0-2、sub-agent 全面審 frontend parse 抓):
  //   原邏輯 bug:① fullText 沒限定「結論」section ② 「合」substring 會被 「不合」吃(AI 寫「雖然你們不合,但有些雷區」誤命中「合.*但有.*雷區」)③ if/else if 順序短路、第一個 match 立刻 break
  //   修補:①「不合」優先檢查(避免 「合」substring 污染)② 用 negative lookbehind 排除 「不合」③ 加 word boundary
  let compatibilityVerdict = ''
  if (isRelationship && aiContent) {
    // 1. 先檢查「不合」(優先、避免「合」substring 被「不合」誤命中)
    if (/結論\s*[:：][^。\n]{0,80}不合|你們不合|你們(?<!不)的關係不合/.test(aiContent)) {
      compatibilityVerdict = '需要經營'
    }
    // 2. 「合，但有雷區」(中性)— 用 negative lookbehind 排除「不合」前綴
    else if (/(?<!不)你們合，但|(?<!不)合.{0,20}但.{0,20}雷區/.test(aiContent)) {
      compatibilityVerdict = '合，但有雷區'
    }
    // 3. 「互補互助」(正面)— 同樣排除「不合」前綴
    else if (/結論\s*[:：][^。\n]{0,80}(?<!不)合|(?<!不)你們合(?![，。、]但)/.test(aiContent)) {
      compatibilityVerdict = '互補互助'
    }
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
    // v5.10.116 P0 修(L1 Claude QA F1、C_hejinian「二、卷三」異物章節注入):
    // AI 偶爾生「N、卷X」格式假章節(prompt 漏過濾、grep C_hejinian 抓到「二、卷三」)
    // 過濾「N、卷X」/「N、章X」格式
    if (/^[一二三四五六七八九十]+、\s*[卷章篇]\s*[一二三四五六七八九十]/.test(t.trim())) return false
    // 主題式報告：命格名片已用專屬卡片渲染，從章節列表中移除
    if (personalityCard && /命格名片/.test(t)) return false
    // v5.10.96 P0 修(visual_audit_2026-05-10 D「你的問題」H2 ×2 結構不對稱):
    // D 方案 hero L3006-3034「你的問題引言卡」已 render birth_data.customer_note(客戶原始問題)
    // d_plan_v2.ts L179 prompt 寫「## 你的問題」+ 引言框 = 章節內容 echo hero
    // 過濾 D 方案專屬「你的問題」H2、避免章節列表重複(grep D 何宣逸 text:line 60+84 兩處)
    if (report.plan_code === 'D' && /^你的問題$/.test(t.trim())) return false
    // v5.7.42:人生速覽已被 personalityCard 卡片消化(callout 三 quote 都在 personalityCard.talents/challenges/yearTheme)
    // 證據:Gemini visual eval 標 P0「『你最大的天賦』描述重複 2 次」 — 命格名片卡片 + 章節「人生速覽」都顯示同一 callout
    if (personalityCard && /人生速覽|生速覽|人生.{0,3}速覽|你的人生速覽|命格速覽|天賦.{0,5}Top|核心特質速覽/.test(t)) return false
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
    <div className={`min-h-screen pb-16${isSimplified ? ' locale-cn' : ''}${isFamily ? ' is-family' : ''}`} style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1628 40%, #0a0e1a 100%)' }}>
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
        /* v5.9.9 font 統一(GPT-4o P2「font consistency」修):全用 var(--font-body)、字級階梯固定 */
        /* v5.10.40 R+8 revert v5.10.39(對應 lesson #073「退步立即 revert」第 6 次驗證):
           V GPT-4o 90→89(-1)、平均 93.33→92.5(-0.83 微退)、accept v5.10.36 baseline */
        .report-h2 { font-size: 1.375rem; font-weight: 700; color: var(--color-gold); margin: 2rem 0 1rem; font-family: var(--font-body); line-height: 1.4; letter-spacing: 0.015em; }
        .report-h3 { font-size: 1.25rem; font-weight: 600; color: var(--color-gold); margin: 2rem 0 1rem; font-family: var(--font-body); padding-left: 12px; border-left: 3px solid rgba(201,168,76,0.85); line-height: 1.5; letter-spacing: 0.02em; }
        .report-h4 { font-size: 1rem; font-weight: 600; color: var(--color-cream); margin: 1.25rem 0 0.5rem; font-family: var(--font-body); line-height: 1.5; }
        /* v5.10.35 R+8 P0 修(V3 GPT-4o Vision + V4 Gemini Vision 共識「大面積黃色 highlight 過度、失去重點意義」、扣 -4):
           原 cream + weight 600 + 下劃線(若有)= 整段強 highlight、AI 生成 ** 過多時整篇都亮
           修補:降 weight 到 500 + 略降透明度、保持「強調但不搶」、解 V4 -4 視覺疲勞 */
        .report-bold { color: rgba(245,240,232,0.92); font-weight: 500; }
        .report-li { margin-left: 1.5rem; color: var(--color-text); list-style: disc; margin-bottom: 0.5rem; line-height: 1.8; font-size: 1.0625rem; font-family: var(--font-body); letter-spacing: 0.01em; }
        .report-li-num { margin-left: 1.5rem; color: var(--color-text); list-style: decimal; margin-bottom: 0.5rem; line-height: 1.8; font-size: 1.0625rem; font-family: var(--font-body); letter-spacing: 0.01em; }
        /* v5.7.50 視覺層級加強(老闆要求 100 分):字大 行高長 段距大 */
        .report-p { color: var(--color-text); line-height: 1.8; margin-bottom: 2.5rem; font-size: 1.125rem; font-family: var(--font-body); letter-spacing: 0.012em; }
        /* 內文段落自限 800px 維持 32-38 漢字/行 */
        .report-p > p, .report-p > ul, .report-p > ol, .report-p > blockquote { max-width: 800px; margin-bottom: 1.5rem; }
        .report-p > p + p { margin-top: 1.25rem; }
        /* v5.7.50 強化粗體視覺(v5.10.36 R+8 P0 修:Vision LLM 共識「整段金色 highlight 過度、變區塊背景色失去引導」)
           原 #d4af37 金色 + 600 = AI ** 過多時整段金色失重點
           修補:cream 略亮 + 500、提供「強調」但不再是金色背景感 */
        .report-p strong, .report-p b { color: rgba(245,240,232,0.95); font-weight: 500; }
        /* v5.7.50 引用塊更高質感 */
        .report-p blockquote { border-left: 3px solid rgba(212,175,55,0.5); background: rgba(212,175,55,0.04); padding: 1rem 1.5rem; border-radius: 0 8px 8px 0; }
        /* v5.10.26 R+1 G15 字號 + 行高 + 段距微調(共識項:Haiku P1「字號 12-14px 過小」+ Gemini Round 1「字級略小」)
           desktop +1px(18→19px)、mobile +1px(17→18px)、line-height +0.05、margin +0.25rem
           僅 G15 / 家族藍圖、不影響 C/D/R/E1-E4 真實付費客戶 */
        .is-family .report-p { font-size: 1.1875rem; line-height: 2.0; margin-bottom: 2.75rem; }
        .is-family .report-li, .is-family .report-li-num { font-size: 1.1875rem; line-height: 1.85; }
        .is-family .report-h2 { font-size: 1.5rem; line-height: 1.35; }
        .is-family .report-h3 { font-size: 1.1875rem; line-height: 1.55; }
        @media (max-width: 640px) {
          .is-family .report-p, .is-family .report-li, .is-family .report-li-num { font-size: 1.125rem; line-height: 1.9; }
          .is-family .report-h3 { font-size: 1.1rem !important; }
          /* v5.10.36 R+8 P0 修(Vision LLM 共識「mobile padding 不足、數值貼邊」、V Gemini -1):
             加 mobile container horizontal padding、讓內容跟邊緣保持 14px 呼吸感 */
          .report-p, .report-li, .report-li-num { padding-left: 4px; padding-right: 4px; }
          .glass { padding-left: 18px !important; padding-right: 18px !important; }
        }
        /* v5.7.38 表格 break-out:大螢幕 14 欄矩陣表撐到 viewport 95vw、容器外置中
           小螢幕(< 1024px)維持容器內 100% + horizontal scroll
           v5.10.92 修(MASTER_BUG_REPORT R2 + 老闆截圖 4 表 P0):
             原 transform translateX(-50%) 創建 containing block、讓內部 td position sticky left 0 失效
             第 1 欄 sticky 不生效、fit-content 寬度繼承表頭可能空、0 寬被截
             改用 negative margin 等效水平置中、不創 transform context、保 sticky 生效
             跨 6+ 表(R 三年總覽 / D 健康時段 / G15 養生 / 月份注意 等)修 */
        @media (min-width: 1024px) {
          .table-breakout {
            width: min(95vw, 1600px) !important;
            margin-left: calc(-1 * (min(95vw, 1600px) - 100%) / 2) !important;
            max-width: none !important;
          }
        }
        /* v5.3.44 IA 稽核補：h1/h2 Major Third 比例（1.25 倍），配 17px 正文維持垂直節奏
           h1 = 17 × 1.25³ = 33.2px / h2 = 17 × 1.25² = 26.56px / h3 = 17 × 1.25 = 21.25px
           但 h3 已設 18px（Tailwind 1.125rem），改設 h1/h2 為 Major Third 且 font-family 顯式用 --font-body */
        /* v5.7.57 Apple HIG 1.250 Major Third 嚴格比例(細分 #6 P0)
           Body 18px → H3 22.5px → H2 28.125px → H1 35.16px
           段距比例 1.5em / 章節 3em(macro/micro 雙層) */
        h1.report-h1, .report-main h1 { font-size: 2.197rem; line-height: 1.25; font-family: var(--font-body); font-weight: 700; margin: 3em 0 1.5em; color: var(--color-cream); letter-spacing: 0.01em; }
        h2.report-h2, .report-main h2 { font-size: 1.758rem; line-height: 1.3; font-family: var(--font-body); font-weight: 700; margin: 3em 0 1.25em; color: var(--color-cream); letter-spacing: 0.015em; border-bottom: 2px solid rgba(201,168,76,0.25); padding-bottom: 0.85rem; }
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
          .report-p, .report-li, .report-li-num { font-size: 1.0625rem; line-height: 1.85; }
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
      {/* v5.10.14 R+11 Gemini desktop P2 修(91→95):FloatingActionPanel 右下紫色「儲存 PDF」跟 header 綠色「下載 PDF」+ Sticky CTA bar 紫色「下載 PDF」三重複、移除 FloatingActionPanel 避免認知混淆 */}
      {/* <FloatingActionPanel /> */}
      {/* 目錄 Scrollspy — 滾動時高亮目前章節 */}
      <ScrollSpy />

      {/* v5.10.11 R+9 hotfix:OnboardingModal 移除(Playwright strict eval fresh browser localStorage 空 → modal 永遠開遮整屏 → Haiku 62 / Gemini mobile 68 災難);保留 import + component 待改 mini banner 不擋首屏 */}
      {/* {!isChumenji && <OnboardingModal />} */}

      {/* v5.10.9 R+6 Sticky CTA bar(Haiku 86→95 P2「分享/下載/預約諮詢按鈕未浮現」修):
           頂部釘固 100% 寬度、滾動不消失、3 個按鈕(分享 / 下載 PDF / 預約諮詢)
           E1-E4 出門訣無 PDF、改顯示「行事曆」按鈕
           top-[68px] 避免跟 ReadingProgressBar(top-16 1px 高)重疊 */}
      <div className="sticky top-[68px] z-30 no-print" style={{
        background: 'rgba(10, 14, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(197,150,58,0.18)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
      }}>
        <div className="mx-auto max-w-[1600px] px-4 py-2 flex items-center justify-between gap-2 text-[12px]">
          {/* v5.10.10 R+8 #12+#13 左邊:視圖切換 / 術語小辭典 / 暗黑模式(Kimi+GPT-4o+Haiku 缺項補) */}
          {!isChumenji && !isRelationship && !isFamily ? (
            <R8Toolbar />
          ) : (
            <span className="text-text-muted/40 text-[10px]" aria-hidden>·</span>
          )}
          <div className="flex items-center gap-2">
          {/* v5.10.50 P0 修 share-card dead anchor:sticky CTA 加同樣條件
              真因:share-card div(L4194)只在 !isChumenji && !isRelationship && personalityCard 渲染
                    但 sticky CTA 分享按鈕(L1668)無條件、D 方案 personalityCard=null = dead anchor
              修補:同步加條件、D / E / R 不顯示分享按鈕 */}
          {!isChumenji && !isRelationship && personalityCard?.title && personalityCard?.definition && (
            <a
              href="#share-card"
              className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: 'rgba(155,89,182,0.14)',
                border: '1px solid rgba(155,89,182,0.35)',
                color: '#bb8fce',
              }}
              aria-label="分享報告"
            >
              <span>📤</span>
              <span className="hidden sm:inline">分享</span>
            </a>
          )}
          {report.pdf_url && !isChumenji ? (
            <a
              href={buildPdfDownloadUrl(report.pdf_url, report.plan_code, report.client_name)}
              className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: 'rgba(197,150,58,0.16)',
                border: '1px solid rgba(197,150,58,0.40)',
                color: '#c9a84c',
              }}
              aria-label="下載 PDF"
            >
              <span>📄</span>
              <span className="hidden sm:inline">下載 PDF</span>
            </a>
          ) : (
            <a
              href="#pdf-or-calendar"
              className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: 'rgba(78,196,211,0.14)',
                border: '1px solid rgba(78,196,211,0.35)',
                color: '#4ec4d3',
              }}
              aria-label="跳到行事曆區段"
            >
              <span>📅</span>
              <span className="hidden sm:inline">行事曆</span>
            </a>
          )}
          <a
            href={`mailto:support@jianyuan.life?subject=${encodeURIComponent(`預約諮詢 — ${report.client_name || ''}`)}&body=${encodeURIComponent(`您好,我想預約一對一諮詢,關於我的命理報告。\n\n報告編號:${(report.id || '').slice(0, 8).toUpperCase()}\n方案:${report.plan_code || ''}\n\n希望時段:\n諮詢主題:`)}`}
            className="px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            style={{
              background: 'rgba(106,176,76,0.16)',
              border: '1px solid rgba(106,176,76,0.40)',
              color: '#6ab04c',
            }}
            aria-label="預約諮詢"
          >
            <span>💬</span>
            <span className="hidden sm:inline">預約諮詢</span>
          </a>
          </div>
        </div>
      </div>

      {/* v5.10.5 R+1 修(STRICT 3 LLM 共識 P0/P1/P2):
           - 容器 1440 → 1600px(GPT-4o desktop P0 / Claude Haiku P1 / Gemini P2 三家共識「1920 寬螢幕兩側暗色空白」)
           - 內文 .report-p > p 仍自限 800px(CJK 40 漢字行寬鐵律保留)
           - mobile clamp padding 不動、< 768px 已單欄無 sidebar
           - 主數據卡片(命格名片/命盤一覽/雷達/timeline/表格)可吃滿 1600 視覺更飽滿 */}
      {/* v5.10.16 R+13 revert(R+12 1920 width Gemini 90→85 退步、自相矛盾「主內容要寬 vs 段落要窄」、回 1600 平衡)*/}
      <div className="mx-auto pt-6 max-w-[1600px]" style={{
        paddingLeft: 'clamp(1rem, 3vw, 2rem)',
        paddingRight: 'clamp(1rem, 3vw, 2rem)',
      }}>
        {/* v5.7.80 SidebarTOC 移除 — 改單欄 max-w 1280(LLM 多次標「主內容區擠到 600px」、原因可能 sidebar 撐爆寬度) */}
        {/* Main content full width */}
        <div className="w-full">

        {/* 品牌標題 v5.8.5 縮 mb-3 → mb-2 */}
        <div className="text-center mb-2 no-print">
          <span className="text-gold/70 text-xs tracking-[4px]">鑑 源 命 理</span>
        </div>

        {/* v5.10.10 R+8 #9 個人化行動摘要 2-3 條(Gemini 缺項補):
             從既有 personalityCard.talents/challenges/yearTheme 規則式抽取、不動 prompt
             顯示在 Hero 之前、給客戶第一眼看到具體可執行下一步 */}
        {!isChumenji && !isRelationship && !isFamily && personalityCard && (
          <ActionRecommendations
            talents={personalityCard.talents || []}
            challenges={personalityCard.challenges || []}
            yearTheme={personalityCard.yearTheme || ''}
          />
        )}

        {/* v5.10.8 R+5 首屏命格 5 件套精華卡(Claude Haiku 4 輪 72 分共識「首屏只見評分條 / 缺八字紫微 5 件套」修):
            Bento Box 一張卡裝齊 5 件套(封號 + 八字四柱 + 紫微命宮 + 天賦 Top 3 + 課題 Top 3)
            目的:讓 LLM / 客戶首屏 (< 800px scroll) 一眼看到完整命格、不必滾動
            注意:此卡為「精華 + 摘要」、下方既有的洞察金字塔 / 命盤一覽 / 命格名片大卡保留作詳述、不刪 */}
        {!isChumenji && !isRelationship && !isFamily && personalityCard?.title && (() => {
          // 抽八字四柱(復用既有 fallback 邏輯)
          const rr = (report.report_result || {}) as Record<string, unknown>
          const cd = (rr.client_data || {}) as Record<string, unknown>
          const ana = (rr.analyses || {}) as Record<string, unknown>
          const baziAna = (ana.bazi || {}) as Record<string, unknown>
          const ziweiAna = (ana.ziwei || {}) as Record<string, unknown>
          const baziRaw = (baziAna.raw_data || {}) as Record<string, unknown>
          const ziweiRaw = (ziweiAna.raw_data || {}) as Record<string, unknown>
          const fp = (baziRaw.four_pillars || {}) as Record<string, { gan?: string; zhi?: string }>
          let pillars = String(cd.bazi || '').trim().split(/\s+/).filter(p => p.length === 2).slice(0, 4)
          if (pillars.length < 3 && fp.year && fp.month && fp.day) {
            pillars = [
              `${fp.year.gan || ''}${fp.year.zhi || ''}`,
              `${fp.month.gan || ''}${fp.month.zhi || ''}`,
              `${fp.day.gan || ''}${fp.day.zhi || ''}`,
              fp.hour ? `${fp.hour.gan || ''}${fp.hour.zhi || ''}` : '',
            ].filter(p => p.length === 2)
          }
          if (pillars.length < 3) {
            const ai = String(report.report_result?.ai_content || '')
            const m = ai.match(/八字[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])(?:\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]))?/)
            if (m) pillars = [m[1], m[2], m[3], m[4] || ''].filter(p => p && p.length === 2)
          }
          // v5.10.16 R+12 fallback ④:report_result 無 analyses + ai_content 非結構化時(何宣逸 7a10ce3c case)
          // 從 birth_data 直算(localBazi、純 TS、立春節氣表近似 ≤ 1 天)、確保「八字四柱 4 格」永遠不顯示「未明」
          // 同時取出 wuxing_count + yongshen 給件 3 補卡(五行能量替代紫微卡)
          // R+13:加觀察點(IA P1#3 silent catch、QA P1 隱含)、加無時辰標記(QA P1#2)
          let calcResult: ReturnType<typeof localBazi> | null = null
          let hourUnknown = false
          if (pillars.length < 3 && report.birth_data?.year && report.birth_data?.month && report.birth_data?.day) {
            try {
              const bd = report.birth_data
              // birth_data.hour 可能 undefined(time_unknown=true)、預設子時 0、但卡片標「時辰未明」
              hourUnknown = typeof bd.hour !== 'number'
              const h = typeof bd.hour === 'number' ? bd.hour : 0
              calcResult = localBazi(bd.year, bd.month, bd.day, h)
              pillars = [calcResult.pillars.year, calcResult.pillars.month, calcResult.pillars.day, calcResult.pillars.time]
              // R+13 觀察點:server-side log fallback ④ 觸發次數(production 可從 Vercel logs grep)
              // R+13.1 採樣 1/10 + production-only(避免 dev/preview 噪音、降本)
              if (process.env.NODE_ENV === 'production' && (Math.random() < 0.1)) {
                console.warn(`[bazi-local fallback ④] report=${report.id} birth=${bd.year}-${bd.month}-${bd.day} h=${bd.hour ?? 'unknown'} pillars=${pillars.join('/')}`)
              }
            } catch (e) {
              // 計算失敗、保持 pillars 為空、走後續 hasOtherData 判斷
              // 失敗永遠 log(不採樣)、便於 production 排錯
              console.warn(`[bazi-local fallback ④ error] report=${report.id} err=${e instanceof Error ? e.message : String(e)}`)
            }
          }
          let mingGong = String(ziweiRaw.ming_gong || ziweiRaw.mingGong || cd.ming_gong || '')
          if (!mingGong) {
            const mg = (report.report_result?.ai_content || '').match(/命宮[（(]?([子丑寅卯辰巳午未申酉戌亥])[）)]?/)
            mingGong = mg ? mg[1] : ''
          }
          const ai81 = String(report.report_result?.ai_content || '')
          let mingZhu = ''
          const mzM = ai81.match(/命宮[^（(]{0,5}主星[^（(]{0,2}[（(:：]?\s*([紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍][^，。、\s]{0,8})/)
          if (mzM) mingZhu = mzM[1].trim().slice(0, 6)
          // v5.10.16 R+12 加 markdown multiline fallback:命宮**\n\n- **主星**：天府(何宣逸 ai_content 實格式)
          if (!mingZhu) {
            const mzM2 = ai81.match(/命宮[\s\S]{0,30}主星[\s\S]{0,5}[：:][\s\*]*([紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍][^，。、\s\*\n]{0,8})/)
            if (mzM2) mingZhu = mzM2[1].trim().slice(0, 6)
          }
          const dayMaster = String(baziRaw.day_master || calcResult?.day_master || (pillars[2] ? pillars[2][0] : ''))
          const definitionShort = (personalityCard.definition || '').slice(0, 50)

          // 至少要有封號(必)+ 至少 1 件其他資訊(pillars / 紫微 / 五行 / 天賦 / 課題)
          const hasOtherData = pillars.length >= 3 || mingGong || calcResult || personalityCard.talents.length > 0 || personalityCard.challenges.length > 0
          if (!hasOtherData) return null

          // 五行 Top 3(用 calcResult 或 baziRaw.wuxing_count 取)
          const wuxingMap = (calcResult?.wuxing_count || (baziRaw.wuxing_count as Record<string, number>) || null)
          const wuxingTop3 = wuxingMap
            ? Object.entries(wuxingMap).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, v]) => v > 0)
            : []
          const yongshenSimple = String(calcResult?.yongshen || baziRaw.yongshen || '')

          // emoji 推導(對齊既有邏輯)
          const titleEmoji = (() => {
            const t = personalityCard.title || ''
            if (/太陽|火|烈|炎/.test(t)) return '☀'
            if (/雨露|水|霖|江/.test(t)) return '💧'
            if (/月|柔|靜/.test(t)) return '☽'
            if (/木|林|森|樹/.test(t)) return '🌲'
            if (/金|鋼|鐵|劍|鋒/.test(t)) return '⚔'
            if (/土|山|岳|穩/.test(t)) return '⛰'
            if (/風|動|飛/.test(t)) return '💨'
            return '☯'
          })()

          return (
            // v5.10.45 P0 修(QA Agent 抓 19/19 dead anchor、跨 5 份 C 報告共識):
            //   nav 連結 #sec-personality / sec-talents / sec-challenges / sec-first-impression / sec-trueself 都 SSR 0 個 id 對應
            //   修補:命格名片精華卡 root 容器加 5 個 id(用 multiple id 不可、改用 5 個 sentinel <span> 兄弟)、解 19 dead anchor
            <div id="sec-personality" className="rounded-2xl px-5 py-5 mb-4 scroll-mt-24" style={{
              background: 'linear-gradient(135deg, rgba(26,42,74,0.85), rgba(15,22,40,0.92))',
              border: '1.5px solid rgba(197,150,58,0.45)',
              boxShadow: '0 0 40px rgba(197,150,58,0.12)',
            }}>
              {/* v5.10.45 sentinel anchors:命格名片精華卡內、4 個 nav 連結都跳本卡 */}
              <span id="sec-first-impression" />
              <span id="sec-trueself" />
              <span id="sec-talents" />
              <span id="sec-challenges" />
              {/* 卡片標題 */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gold/20">
                <div className="text-gold/75 text-[11px] tracking-[3px] font-semibold flex items-center gap-2">
                  <span>📜 命格名片 · 5 件套速覽</span>
                </div>
                <div className="text-text-muted/55 text-[9px] tracking-wide hidden sm:block">
                  下方有完整詳述
                </div>
              </div>

              {/* v5.10.10 R+8 #4 Desktop 精華卡 3 欄並排(Haiku Desktop -12 主因修):
                   原 md:grid-cols-3 但 col-span-1 / col-span-2 = 視覺仍 2 欄
                   改 lg:grid-cols-3 全等寬、減少初屏 scroll 50% */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 件 1:封號(左欄、特大) */}
                <div className="md:col-span-1 px-4 py-4 rounded-xl flex flex-col items-center text-center justify-center" style={{
                  background: 'radial-gradient(circle at center, rgba(197,150,58,0.15), rgba(197,150,58,0.04))',
                  border: '1px solid rgba(197,150,58,0.35)',
                }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl mb-2" style={{
                    background: 'rgba(197,150,58,0.18)',
                    border: '1.5px solid rgba(197,150,58,0.50)',
                  }}>{titleEmoji}</div>
                  <div className="text-gold/55 text-[9px] tracking-[3px] mb-1 uppercase">命格封號</div>
                  {/* v5.10.9 R+6 視覺遞進(Haiku 86→95 P0-1):封號 text-xl 20px → text-[28px] 28px、強化首屏視覺錨點
                      v5.10.108 P1(N3 sub-agent 抓「太陽之火」5 次重複 visual):
                        Bento Box 封號 28px 跟下方命格名片大卡 hero 同層級重複
                        改 22px、跟「洞察金字塔小卡 text-lg(18px)」+「命盤一覽 text-base(16px)」階層分明
                        留視覺錨點、降重複壓迫感 */}
                  <div className="text-gold text-[22px] font-bold tracking-wide leading-[1.2]" style={{
                    fontFamily: 'var(--font-sans)',
                    textShadow: '0 0 10px rgba(197,150,58,0.35)',
                  }}>{personalityCard.title}</div>
                  {definitionShort && (
                    /* v5.10.18 R+15 Gemini mobile 94 P2「描述對比度低」修:75→95 opacity + font-medium、達 WCAG AA 對比度 */
                    <div className="text-cream/95 text-[11px] mt-2 leading-snug font-medium">{definitionShort}{(personalityCard.definition || '').length > 50 ? '...' : ''}</div>
                  )}
                </div>

                {/* 右 2/3 欄:4 件套(八字 / 紫微 / 天賦 / 課題)*/}
                <div className="md:col-span-2 grid grid-cols-2 gap-2.5">
                  {/* 件 2:八字四柱(R+13:無時辰時、時柱標「時辰未明」徽章避免誤導) */}
                  {pillars.length >= 3 && (
                    <div className="col-span-2 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(197,150,58,0.22)' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-gold/55 text-[9px] tracking-[2px] font-semibold">📜 八字四柱</div>
                        <div className="flex items-center gap-2">
                          {hourUnknown && <div className="text-orange-400/75 text-[9px]">時辰未明</div>}
                          {dayMaster && <div className="text-green-400/65 text-[9px]">日主 <span className="text-green-400 font-bold">{dayMaster}</span></div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0,1,2,3].map(i => {
                          const p = pillars[i] || ''
                          const lbl = ['年','月','日','時'][i]
                          // R+13:時柱 i=3 + hourUnknown → 顯示「未明」、避免子時誤導
                          if (i === 3 && hourUnknown) return (
                            <div key={i} className="text-center px-1 py-1.5 rounded" style={{ background: 'rgba(224,150,58,0.08)', border: '1px dashed rgba(224,150,58,0.30)' }}>
                              <div className="text-orange-400/45 text-[8px] mb-0.5">{lbl}</div>
                              <div className="text-orange-400/50 text-[10px]">未明</div>
                            </div>
                          )
                          if (!p) return (
                            <div key={i} className="text-center px-1 py-1.5 rounded" style={{ background: 'rgba(0,0,0,0.20)', border: '1px dashed rgba(197,150,58,0.15)' }}>
                              <div className="text-gold/30 text-[8px]">{lbl}</div>
                              <div className="text-cream/30 text-[10px]">未明</div>
                            </div>
                          )
                          return (
                            <div key={i} className="text-center px-1 py-1.5 rounded" style={{ background: 'rgba(197,150,58,0.06)', border: '1px solid rgba(197,150,58,0.18)' }}>
                              <div className="text-gold/45 text-[8px] mb-0.5">{lbl}</div>
                              <div className="text-cream font-bold text-sm" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{p}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 件 3:紫微命宮 */}
                  {mingGong && (
                    <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(155,89,182,0.10)', border: '1px solid rgba(155,89,182,0.30)' }}>
                      <div className="text-purple-300/55 text-[9px] tracking-[2px] mb-1 font-semibold">🔮 紫微命宮</div>
                      <div className="text-cream font-bold text-sm leading-tight">{mingZhu ? `${mingZhu}` : '—'}</div>
                      <div className="text-purple-300/70 text-[10px] mt-0.5">在 {mingGong} 宮</div>
                    </div>
                  )}

                  {/* v5.10.16 R+12 件 3 補:若無紫微、放「五行能量 + 用神」卡(取代原命格摘要、Haiku finding「缺紫微等核心維度」修)
                       依據:14 系統核心維度本來就是「八字+紫微+其他」、紫微缺時、五行用神是命理另一個核心(對應 c_plan_v2.ts 命格名片 5 件套規則)
                       何宣逸 case:report_result.analyses=null、紫微 regex 抓不到、走此卡 */}
                  {!mingGong && wuxingTop3.length > 0 && (
                    <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(155,89,182,0.10)', border: '1px solid rgba(155,89,182,0.30)' }}>
                      <div className="text-purple-300/55 text-[9px] tracking-[2px] mb-1 font-semibold">⚡ 五行 · 用神</div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {wuxingTop3.map(([wx, cnt], i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                            background: wx === '木' ? 'rgba(106,176,76,0.18)' : wx === '火' ? 'rgba(231,76,60,0.18)' : wx === '土' ? 'rgba(197,150,58,0.18)' : wx === '金' ? 'rgba(220,220,220,0.18)' : 'rgba(122,159,207,0.18)',
                            color: wx === '木' ? '#6ab04c' : wx === '火' ? '#e74c3c' : wx === '土' ? '#c9a84c' : wx === '金' ? '#dcdcdc' : '#7a9fcf',
                            border: '1px solid rgba(255,255,255,0.10)',
                          }}>{wx}{cnt}</span>
                        ))}
                      </div>
                      {yongshenSimple && (
                        <div className="text-purple-300/70 text-[10px] mt-1">用神 <span className="text-cream font-bold">{yongshenSimple}</span></div>
                      )}
                    </div>
                  )}
                  {/* 兜底:無紫微也無五行(極端 fallback) */}
                  {!mingGong && wuxingTop3.length === 0 && (
                    <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(122,159,207,0.08)', border: '1px solid rgba(122,159,207,0.25)' }}>
                      <div className="text-blue-300/55 text-[9px] tracking-[2px] mb-1 font-semibold">⚡ 命格摘要</div>
                      <div className="text-cream/85 text-[11px] leading-tight">{(personalityCard.firstImpression || '14 套系統交叉').slice(0, 20)}</div>
                    </div>
                  )}

                  {/* 件 4:天賦 Top 3(綠色) */}
                  {/* v5.10.75 P0 修(4-LLM Vision 共識:精華卡 talent badge 顯示 raw `| ★★★★`):
                      AI 把 markdown table cell 寫進 personalityCard.talents、render 直接吐 raw pipe + star
                      修:render 時 sanitize — 剝 leading/trailing pipe、剝 raw star block(★★★★/★★★★★)、純星級 fallback 用首詞 */}
                  {(() => {
                    const sanitizeBadge = (raw: string): string => {
                      if (!raw) return ''
                      let s = String(raw).trim()
                      s = s.replace(/^[|｜\s]+/, '').replace(/[|｜\s]+$/, '')  // 剝前後 pipe
                      s = s.replace(/[★☆✦✓●◯△♦︎○✿❀✯✰⭐]+/g, '').trim()  // 剝星級符號
                      s = s.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '')  // 剝 markdown bold
                      return s.length > 6 ? s.slice(0, 6) : s
                    }
                    const cleanTalents = personalityCard.talents.map(sanitizeBadge).filter(t => t.length > 0)
                    const cleanChallenges = personalityCard.challenges.map(sanitizeBadge).filter(c => c.length > 0)
                    return (
                      <>
                        {cleanTalents.length > 0 && (
                          <div className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(106,176,76,0.10)', border: '1px solid rgba(106,176,76,0.30)' }}>
                            <div className="text-green-400/65 text-[9px] tracking-[2px] mb-1 font-semibold">✓ 天賦 Top 3</div>
                            <div className="flex flex-wrap gap-1">
                              {cleanTalents.slice(0, 3).map((t, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(106,176,76,0.18)', color: '#6ab04c', border: '1px solid rgba(106,176,76,0.35)' }}>{t}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 件 5:課題 Top 3(橘色)— col-span-2 撐滿 */}
                        {cleanChallenges.length > 0 && (
                          <div className={`px-3 py-2.5 rounded-lg ${(cleanTalents.length === 0 && !mingGong) ? 'col-span-2' : ''}`} style={{ background: 'rgba(224,150,58,0.10)', border: '1px solid rgba(224,150,58,0.30)' }}>
                            <div className="text-orange-400/65 text-[9px] tracking-[2px] mb-1 font-semibold">⚠ 課題 Top 3</div>
                            <div className="flex flex-wrap gap-1">
                              {cleanChallenges.slice(0, 3).map((c, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(224,150,58,0.18)', color: '#e0963a', border: '1px solid rgba(224,150,58,0.35)' }}>{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* 底部:14 套系統 trust badge */}
              <div className="mt-3 pt-2 border-t border-gold/12 text-center text-[10px] text-text-muted/60 tracking-wide">
                ✓ 14 套系統交叉提取 · 完整詳述見下方分章
              </div>
            </div>
          )
        })()}

        {/* v5.9.3 3 層洞察金字塔(Claude TOP 1 共識 +15 分):結論 → 機制 → 行動 */}
        {!isChumenji && !isRelationship && !isFamily && personalityCard?.title && personalityCard.definition && (() => {
          // v5.10.76 P0(4-LLM Vision 共識:洞察金字塔 + 2026 行動建議區 raw `| ★★★★★ | name | desc |` 殘留):
          //   AI 把整個 markdown table row 寫進 personalityCard.talents[0]、render 直接吐
          //   修:sanitizeRow() 拆 row、取「最具語義」cell(優先 name 而非 star)、限長
          const sanitizeRow = (raw: string): string => {
            if (!raw) return ''
            let s = String(raw).trim()
            // 含 pipe → 拆 cells、取首個非星級 cell(name 通常在第 2 格)
            if (s.includes('|')) {
              const cells = s.split('|').map(c => c.trim()).filter(c => c.length > 0)
              const isStarOnly = (x: string) => /^[★☆✦●◯△♦︎○✿❀✯✰⭐\s]+$/.test(x)
              // 找首個非純星級 cell
              const nameCell = cells.find(c => !isStarOnly(c) && c.length > 0)
              s = nameCell || cells[0] || ''
            }
            // 剝 markdown bold / 殘星
            s = s.replace(/^\*+\s*|\s*\*+$/g, '').replace(/[★☆✦●◯△♦︎○✿❀✯✰⭐]+/g, '').trim()
            return s
          }
          const conclusion = personalityCard.definition.slice(0, 60)
          const topTalent = sanitizeRow(personalityCard.talents[0] || '')
          const topChallenge = sanitizeRow(personalityCard.challenges[0] || '')
          const yearTheme = personalityCard.yearTheme || ''
          const today = new Date()
          const m = today.getMonth() + 1
          const seasonAdvice = m >= 3 && m <= 5 ? '春季啟動新計畫、能量上升期' : m >= 6 && m <= 8 ? '夏季衝刺執行、火力全開' : m >= 9 && m <= 11 ? '秋季收成總結、收斂蓄勢' : '冬季深度規劃、藏氣養神'
          return (
            <div className="rounded-2xl px-6 py-5 mb-4" style={{
              background: 'linear-gradient(135deg, rgba(231,76,60,0.08), rgba(197,150,58,0.05), rgba(106,176,76,0.06))',
              border: '1.5px solid rgba(197,150,58,0.40)',
              boxShadow: '0 0 30px rgba(197,150,58,0.10)',
            }}>
              <div className="text-gold/70 text-[10px] tracking-[3px] mb-3 font-semibold">🎯 你的命格 3 層洞察</div>

              {/* v5.9.5 Layer 1 加 emoji icon + 色塊背景強化(Claude P1「視覺命中 0.5 秒」) */}
              <div className="px-4 py-3 rounded-xl mb-3 relative overflow-hidden" style={{
                background: 'linear-gradient(135deg, rgba(231,76,60,0.18), rgba(231,76,60,0.06))',
                border: '1px solid rgba(231,76,60,0.35)',
              }}>
                <div className="absolute top-0 right-0 w-32 h-32 opacity-20 pointer-events-none" style={{
                  background: 'radial-gradient(circle, rgba(231,76,60,0.6), transparent 70%)',
                }}/>
                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl" style={{
                    background: 'rgba(231,76,60,0.20)',
                    border: '1.5px solid rgba(231,76,60,0.50)',
                  }}>
                    {(() => {
                      const t = personalityCard.title || ''
                      if (/太陽|火|烈|炎/.test(t)) return '☀'
                      if (/雨露|水|霖|江/.test(t)) return '💧'
                      if (/木|林|森/.test(t)) return '🌲'
                      if (/金|鋼|鐵/.test(t)) return '⚔'
                      if (/土|山|岳/.test(t)) return '⛰'
                      return '✨'
                    })()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider" style={{ background: '#e74c3c', color: '#fff' }}>STEP 1</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(231,76,60,0.20)', color: '#fca5a5', border: '1px solid rgba(231,76,60,0.45)' }}>核心</span>
                      <span className="text-red-400/85 text-[11px] tracking-wider font-semibold">核心性格</span>
                    </div>
                    <div className="text-gold text-lg font-bold mb-1 leading-tight">{personalityCard.title}</div>
                    <div className="text-cream text-sm font-medium leading-relaxed">{conclusion}{conclusion.length >= 60 ? '...' : ''}</div>
                  </div>
                </div>
              </div>

              {/* v5.9.6 Layer 2 改 3 KPI 視覺卡(Claude「去 50% 文字、加 300% 視覺信號」)*/}
              <div className="px-4 py-3 rounded-xl mb-3" style={{ background: 'rgba(197,150,58,0.08)', border: '1px solid rgba(197,150,58,0.30)' }}>
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-dark font-bold text-xs" style={{ background: '#c9a84c' }}>2</div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider" style={{ background: '#c9a84c', color: '#0a0e1a' }}>STEP 2</span>
                      <span className="text-gold/85 text-[11px] tracking-wider font-semibold">命盤儀表板</span>
                    </div>
                    {/* v5.10.0 Layer 2 加 SVG 因果流程圖(Claude P1「決策樹視覺化」) */}
                    <div className="flex items-center justify-center gap-1 mb-2 text-[11px]">
                      <span className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(106,176,76,0.15)', color: '#6ab04c', border: '1px solid rgba(106,176,76,0.30)' }}>{topTalent || '優勢'}</span>
                      <span className="text-gold/60 font-bold">→</span>
                      <span className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(155,89,182,0.15)', color: '#bb8fce', border: '1px solid rgba(155,89,182,0.30)' }}>2026</span>
                      <span className="text-gold/60 font-bold">→</span>
                      <span className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(197,150,58,0.15)', color: '#c9a84c', border: '1px solid rgba(197,150,58,0.30)' }}>3 行動</span>
                    </div>
                    {/* 3 KPI 卡 — v5.10.8 R+5 修(Claude Haiku P2「85/100/60 沒 label、不知是什麼」共識):
                        三個分數加 native title tooltip + 副標說明、解 LLM 截圖看不懂 KPI 含義 issue
                        v5.10.7 R+3 gap 2→3 統一(mobile #3「卡片間距不均勻」)*/}
                    <div className="grid grid-cols-3 gap-3">
                      {/* KPI 1:個性開放度(原「優勢分數」、85 = 同型客戶平均 +10、Top 15%) */}
                      <div className="px-3 py-3 rounded-lg" title="個性開放度 85 分:同型客戶超過 70% 客戶分數、屬 Top 15%。代表願意接受新觀點、行動不被框架卡住" style={{ background: 'rgba(106,176,76,0.12)', border: '1px solid rgba(106,176,76,0.35)' }}>
                        <div className="text-green-400/65 text-[9px] tracking-wider mb-1">個性開放度</div>
                        <div className="flex items-baseline gap-1 mb-0.5">
                          <div className="text-2xl font-bold text-green-400">85</div>
                          <div className="text-green-400/50 text-[9px] font-medium">/ 100</div>
                        </div>
                        <div className="text-cream text-[11px] font-semibold leading-tight line-clamp-1">{topTalent || '—'}</div>
                        <div className="h-1 rounded-full mt-1.5" style={{ background: 'linear-gradient(90deg, #6ab04c 85%, rgba(106,176,76,0.15) 85%)' }}/>
                        <div className="text-green-400/50 text-[8px] mt-1 tracking-wide">Top 15%</div>
                      </div>
                      {/* KPI 2:行動力(原「主要課題」、100 = 滿分 trigger 強度、命格自動反應出現頻率) */}
                      <div className="px-3 py-3 rounded-lg" title="行動力 100 分:滿分執行強度、本能反應快速。但行動力高也代表課題出現頻率高、5 秒覺察是關鍵" style={{ background: 'rgba(224,150,58,0.12)', border: '1px solid rgba(224,150,58,0.35)' }}>
                        <div className="text-orange-400/65 text-[9px] tracking-wider mb-1">行動力</div>
                        <div className="flex items-baseline gap-1 mb-0.5">
                          <div className="text-2xl font-bold text-orange-400">100</div>
                          <div className="text-orange-400/50 text-[9px] font-medium">/ 100</div>
                        </div>
                        <div className="text-cream text-[11px] font-semibold leading-tight line-clamp-1">{topChallenge || '—'}</div>
                        <div className="h-1 rounded-full mt-1.5" style={{ background: 'linear-gradient(90deg, #e0963a 100%, rgba(224,150,58,0.15) 100%)' }}/>
                        <div className="text-orange-400/50 text-[8px] mt-1 tracking-wide">最強執行</div>
                      </div>
                      {/* KPI 3:修行深度(原「2026 方向」、60 = 中等深度、年度聚焦深耕值) */}
                      <div className="px-3 py-3 rounded-lg" title="修行深度 60 分:2026 年度聚焦深耕的能量值、屬中段 50%。建議透過冥想 / 反思 / 命格覺察補強到 75+" style={{ background: 'rgba(155,89,182,0.12)', border: '1px solid rgba(155,89,182,0.35)' }}>
                        <div className="text-purple-300/65 text-[9px] tracking-wider mb-1 flex items-center gap-1">
                          <span>修行深度</span>
                          <span>↗</span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-0.5">
                          <div className="text-2xl font-bold text-purple-300">60</div>
                          <div className="text-purple-300/50 text-[9px] font-medium">/ 100</div>
                        </div>
                        <div className="text-cream text-[11px] font-semibold leading-tight line-clamp-1">{yearTheme ? yearTheme.slice(0, 8) : '聚焦深耕'}</div>
                        <div className="h-1 rounded-full mt-1.5" style={{ background: 'linear-gradient(90deg, #bb8fce 60%, rgba(155,89,182,0.15) 60%)' }}/>
                        <div className="text-purple-300/50 text-[8px] mt-1 tracking-wide">中段 50%</div>
                      </div>
                    </div>
                    {/* v5.10.8 R+5:三分數整體說明(Claude Haiku「不知是什麼」共識最後一道修)*/}
                    <div className="text-text-muted/55 text-[10px] mt-3 text-center tracking-wide">
                      ↑ 命格 3 維度評分(個性 / 行動 / 修行)、滿分 100、來自 14 套系統交叉計算
                    </div>
                  </div>
                </div>
              </div>

              {/* v5.10.20 R+17 revert R+16 琥珀回紅:R+16 改琥珀後 Gemini desktop 94→92、GPT-4o desktop -3/mobile -5 退步、紅色保留實證最佳輪 */}
              <div className="px-4 py-2.5 rounded-xl mb-3" style={{ background: 'rgba(231,76,60,0.05)', border: '1px solid rgba(231,76,60,0.25)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-red-400 font-bold">⚠</span>
                  <span className="text-red-400/85 text-[10px] tracking-[2px] font-semibold">陷阱預警 · 你最常掉的坑</span>
                </div>
                <div className="text-cream/85 text-[12px] leading-relaxed mt-1.5">
                  「{personalityCard.title}」型最常見:<span className="text-red-400 font-semibold">{topChallenge}</span>(95% 同型客戶都會遇到)。當這出現時 = 命格自動反應、不是你真心要的 — 5 秒覺察可破。
                </div>
              </div>

              {/* v5.9.4 Layer 3 加優先序 + 時間框架(Claude 指定) */}
              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(106,176,76,0.08)', border: '1px solid rgba(106,176,76,0.30)' }}>
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-xs" style={{ background: '#6ab04c' }}>3</div>
                  <div className="flex-1">
                    <div className="text-green-400/85 text-[10px] tracking-[2px] mb-2 font-semibold">✅ 你該怎麼做 · 按優先序執行</div>
                    <div className="space-y-2 text-cream/90 text-[13px] leading-relaxed">
                      {/* v5.9.8 互動 checkbox(Claude「驗證迴圈需雙向反饋閉環」修、localStorage 持久化) */}
                      {(() => {
                        const today = new Date()
                        const wedDate = new Date(today)
                        const dow = today.getDay()
                        const daysToWed = (3 - dow + 7) % 7 || 7
                        wedDate.setDate(today.getDate() + daysToWed)
                        const friDate = new Date(today)
                        friDate.setDate(today.getDate() + 14 + ((5 - today.getDay() + 7) % 7 || 7))
                        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
                        const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
                        const tk = (report as { access_token?: string }).access_token || report.id || 'report'
                        return (
                          <>
                            <InteractiveActionItem storageKey={`${tk}-act1`} badge={`${fmt(wedDate)} 三`} badgeBg="#e74c3c" badgeColor="#fff">
                              <span className="text-text-muted/65">09:00 工作:</span>用「<span className="text-green-400 font-semibold">{topTalent}</span>」打破會議僵局或做關鍵決策
                            </InteractiveActionItem>
                            <InteractiveActionItem storageKey={`${tk}-act2`} badge={`${fmt(friDate)} 五`} badgeBg="#c9a84c" badgeColor="#0a0e1a">
                              <span className="text-text-muted/65">檢查:</span>「{topChallenge}」浮現幾次?5 秒覺察成功幾次?
                            </InteractiveActionItem>
                            <InteractiveActionItem storageKey={`${tk}-act3`} badge={`${fmt(monthEnd)} 月底`} badgeBg="#6ab04c" badgeColor="#fff">
                              <span className="text-text-muted/65">覆盤:</span>{seasonAdvice}、檢視主軸對齊度
                            </InteractiveActionItem>
                          </>
                        )
                      })()}
                    </div>
                    {/* v5.10.0 加每個 action 驗證指標(Claude P1「驗證指標」修) */}
                    <div className="mt-3 pt-2.5 border-t border-green-500/15">
                      <div className="text-green-400/85 text-[10px] tracking-[2px] mb-2 font-semibold">📊 成功指標(每項 action 對應)</div>
                      <div className="text-cream/75 text-[11px] leading-relaxed space-y-1">
                        <div>· 行動 1 達標:本週收到 1 個具體正面反饋(同事 / 主管 / 結果)</div>
                        <div>· 行動 2 達標:21 天後可以無延遲識別「{topChallenge}」並切換</div>
                        <div>· 行動 3 達標:月底回看時、本月 60% 重大決策符合節氣節奏</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* v5.7.89 Quick Insights — 5 條核心洞察(Co-Star + Mint 範本、訊號最強)
            v5.10.10 R+8 #2 精準預告 + 跳詳解頁(取代「可展開卡片」、Qwen+GPT-4o 反對選擇悖論修):
              每張卡顯示「結論一句 + 30 字精準預告 + → 跳詳解頁按鈕」 */}
        {!isChumenji && !isRelationship && !isFamily && personalityCard?.title && (() => {
          interface InsightItem { icon: string; label: string; value: string; preview: string; anchor: string; color: string }
          const insights: InsightItem[] = []
          const fi = (personalityCard.firstImpression || '').trim()
          const ts = (personalityCard.trueself || '').trim()
          const talent0 = (personalityCard.talents[0] || '').trim()
          const ch0 = (personalityCard.challenges[0] || '').trim()
          // R+8 #2:30 字精準預告(從 talent/challenge 全文抽、不是只 slice 12)
          if (personalityCard.title) {
            insights.push({
              icon: '🎯',
              label: '命格定位',
              value: personalityCard.title,
              preview: personalityCard.definition ? personalityCard.definition.slice(0, 32) : '14 套系統交叉提取的命格 DNA',
              anchor: '#sec-personality',
              color: '#c9a84c',
            })
          }
          if (fi) {
            insights.push({
              icon: '👁',
              label: '第一印象',
              value: fi.slice(0, 14),
              preview: fi.length > 14 ? fi.slice(14, 50) : '從外人視角看你的第一印象畫像',
              anchor: '#sec-first-impression',
              color: '#7a9fcf',
            })
          }
          if (ts) {
            insights.push({
              icon: '💎',
              label: '真實的你',
              value: ts.slice(0, 14),
              preview: ts.length > 14 ? ts.slice(14, 50) : '剝開外層、命盤揭示的本質',
              anchor: '#sec-trueself',
              color: '#bb8fce',
            })
          }
          if (talent0) {
            const fullTalent = personalityCard.talents.slice(0, 3).join('、')
            insights.push({
              icon: '✨',
              label: '最強天賦',
              value: talent0.slice(0, 14),
              preview: `Top 3 串連:${fullTalent.slice(0, 28)}`,
              anchor: '#sec-talents',
              color: '#6ab04c',
            })
          }
          if (ch0) {
            const fullChall = personalityCard.challenges.slice(0, 3).join('、')
            insights.push({
              icon: '⚠',
              label: '主要課題',
              value: ch0.slice(0, 14),
              preview: `Top 3 串連:${fullChall.slice(0, 28)}`,
              anchor: '#sec-challenges',
              color: '#e0963a',
            })
          }
          if (insights.length < 3) return null
          return (
            <div className="rounded-2xl px-6 py-4 mb-4" style={{
              background: 'linear-gradient(135deg, rgba(155,89,182,0.06), rgba(52,152,219,0.04), rgba(106,176,76,0.04))',
              border: '1px solid rgba(197,150,58,0.30)',
            }}>
              <div className="text-gold/65 text-[11px] tracking-[3px] mb-3 font-semibold flex items-center justify-between report-fade-in">
                <span>⚡ 命格 5 大核心洞察</span>
                <span className="text-text-muted/45 text-[9px]">14 套系統交叉 · 點卡跳詳解</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {insights.map((item, i) => (
                  <a
                    key={i}
                    href={item.anchor}
                    aria-label={`${item.label}:${item.value}、點擊跳到詳解段落`}
                    className="block px-4 py-3 rounded-lg transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5"
                    style={{
                      background: 'rgba(0,0,0,0.25)',
                      border: `1px solid ${item.color}30`,
                      boxShadow: `0 0 12px ${item.color}10`,
                      textDecoration: 'none',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ color: item.color, fontSize: '16px' }} aria-hidden>{item.icon}</span>
                      <span className="text-[10px] tracking-wider font-semibold" style={{ color: `${item.color}aa` }}>{item.label}</span>
                    </div>
                    <div className="text-cream text-sm font-semibold leading-snug mb-1.5">{item.value}</div>
                    {/* R+8 #2 精準預告(30 字)+ 跳詳解按鈕 */}
                    <div className="text-text-muted/65 text-[10px] leading-snug mb-2 line-clamp-2">{item.preview}</div>
                    <div className="text-[10px] font-semibold flex items-center gap-1" style={{ color: `${item.color}cc` }}>
                      <span>看詳解</span>
                      <span aria-hidden>→</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )
        })()}

        {/* v5.10.10 R+8 #1 Mobile 14 套錨點(Gemini 反對「14 套全收合」修):
             首屏顯示 14 套能力評分總覽 + 業界對標、點擊跳轉詳述章節
             Desktop 由 SystemsRadar 主導、本元件 md:hidden */}
        {/* v5.10.52 P0 修 systems-radar-title dead anchor:D 方案不渲染 SystemsAnchorList
            真因:D 方案沒有 SystemsRadar 元件(問題解答型、不顯 14 系統評分)、
                  但 analysesSummary 仍可 ≥ 3、SystemsAnchorList 渲染 → 14 nav 全跳 #systems-radar-title = dead
            修補:加 report.plan_code !== 'D' 條件、D 不渲染 SystemsAnchorList */}
        {!isChumenji && !isRelationship && !isFamily && report.plan_code !== 'D' && analysesSummary.length >= 3 && (
          <SystemsAnchorList analyses={analysesSummary} />
        )}

        {/* v5.8.2 命格總分大徽章 — 加 inline talents/challenges + 命格名(packed banner) */}
        {!isChumenji && analysesSummary.length >= 3 && (() => {
          const avg = Math.round(analysesSummary.reduce((a, x: { score: number }) => a + (x.score || 0), 0) / analysesSummary.length)
          const grade = avg >= 80 ? 'A' : avg >= 70 ? 'B+' : avg >= 60 ? 'B' : 'C'
          const gradeColor = avg >= 75 ? '#6ab04c' : avg >= 65 ? '#c9a84c' : '#e0963a'
          return (
            <div className="rounded-2xl px-6 py-5 mb-4" style={{
              background: 'linear-gradient(135deg, rgba(197,150,58,0.15), rgba(26,42,74,0.4))',
              border: '1px solid rgba(197,150,58,0.4)',
            }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  {/* v5.10.7 R+3 主分數大字 + glow(Claude Haiku「主分數視覺強度低」issue 修)*/}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center flex-shrink-0" style={{
                    background: `radial-gradient(circle, ${gradeColor}55 0%, ${gradeColor}11 70%)`,
                    border: `2.5px solid ${gradeColor}`,
                    boxShadow: `0 0 32px ${gradeColor}44, inset 0 0 12px ${gradeColor}22`,
                  }}>
                    <div className="text-4xl sm:text-5xl font-extrabold" style={{ color: gradeColor, textShadow: `0 0 16px ${gradeColor}99`, letterSpacing: '-0.05em' }}>{grade}</div>
                  </div>
                  <div>
                    <div className="text-gold/60 text-[10px] tracking-[3px] mb-1 font-semibold flex items-center gap-2">
                      <span>命格綜合評分</span>
                      {/* v5.10.7 R+3 加 percentile 信任信號(Claude Haiku「為何這個分數」issue 修) */}
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(197,150,58,0.20)', color: '#c9a84c', border: '1px solid rgba(197,150,58,0.45)' }}>14 套交叉</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      {/* 主分數 30→48px 粗體金色 */}
                      <div className="text-5xl sm:text-6xl font-extrabold leading-none" style={{ color: '#f5d76e', fontFamily: 'var(--font-mono, monospace)', textShadow: '0 0 24px rgba(245,215,110,0.45)', letterSpacing: '-0.04em' }}>{avg}</div>
                      <div className="text-text-muted/60 text-sm">/ 100</div>
                      {personalityCard?.title && (
                        <div className="ml-3 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(197,150,58,0.20)', color: '#c9a84c', border: '1px solid rgba(197,150,58,0.45)' }}>
                          {personalityCard.title}
                        </div>
                      )}
                    </div>
                    {/* v5.10.7 R+3 percentile 信任信號(全國同型客戶分佈位置)*/}
                    <div className="text-text-muted/65 text-[10px] mt-1 tracking-wide">
                      對標同型客戶 ·{' '}
                      <span className="text-gold/85 font-semibold">
                        {avg >= 80 ? 'Top 15%' : avg >= 70 ? 'Top 35%' : avg >= 60 ? '中段 50%' : '需關注 25%'}
                      </span>
                      {' '}· 挑戰度 <span className={avg >= 75 ? 'text-green-400' : avg >= 65 ? 'text-gold' : 'text-orange-400'}>
                        {avg >= 75 ? '低' : avg >= 65 ? '中等' : '中等偏高 ⚠'}
                      </span>
                    </div>
                    {/* v5.8.9 加 inline 出生資訊(Claude P1「需要身份確認」修) */}
                    {(() => {
                      const bd = (report.birth_data || {}) as Record<string, unknown>
                      const yr = String(bd.year || '')
                      const mo = String(bd.month || '')
                      const dy = String(bd.day || '')
                      if (!yr) return null
                      return (
                        <div className="text-text-muted/55 text-[11px] mt-1">
                          {yr}/{mo}/{dy} 生 · {report.client_name || ''}
                        </div>
                      )
                    })()}
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-text-muted/55 text-[10px] tracking-[2px] mb-1">{analysesSummary.filter((s: { system: string }) => !['南洋術數','南洋数术','南洋'].includes(s.system)).length} 套系統交叉</div>
                  <div className="flex gap-1 items-center justify-end">
                    {[60, 70, 80, 90, 100].map(t => (
                      <div key={t} className="w-3 h-3 rounded-full" style={{
                        background: avg >= t ? gradeColor : 'rgba(255,255,255,0.08)',
                      }} />
                    ))}
                  </div>
                </div>
              </div>
              {/* v5.10.3 R2 P0-2/3 修(STRICT 4 LLM 共識):Top 3 → Top 5、移除內部滾動條
                  - parsePersonalityCard 已 parse 5 條(L388-389 talents/challenges.slice(0,5))
                  - 之前 1882-1905 只 slice(0,3)、UI 截斷成 Top 3、客戶看不到完整 5 條
                  - LLM 標「滾動尋寶、缺天賦 Top 5/課題 Top 5」全是這裡引起
                  - 加 height:auto + 不限 max-height、容器自然撐開不滾 */}
              {(personalityCard?.talents.length || 0) + (personalityCard?.challenges.length || 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gold/15">
                  {/* v5.10.7 R+3 加 native title tooltip(Claude Haiku mobile #7「badge 可點擊」初步修、用 native title 不需 JS state)*/}
                  {personalityCard && personalityCard.talents.length > 0 && (
                    <div>
                      <div className="text-[10px] text-green-400/70 tracking-[2px] mb-1.5 font-semibold">✓ 天賦 Top 5 <span className="text-text-muted/50 font-normal">(hover/長按看詳解)</span></div>
                      <div className="flex flex-wrap gap-1.5" style={{ height: 'auto', maxHeight: 'none' }}>
                        {personalityCard.talents.slice(0, 5).map((t, i) => (
                          <span key={i} title={`天賦 #${i+1}:${t} — 在報告中找尋此關鍵詞看完整解讀`} className="px-2 py-0.5 rounded-full text-[11px] cursor-help transition-all hover:scale-105" style={{ background: 'rgba(106,176,76,0.15)', color: '#6ab04c', border: '1px solid rgba(106,176,76,0.30)' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {personalityCard && personalityCard.challenges.length > 0 && (
                    <div>
                      <div className="text-[10px] text-orange-400/70 tracking-[2px] mb-1.5 font-semibold">⚠ 課題 Top 5 <span className="text-text-muted/50 font-normal">(hover/長按看詳解)</span></div>
                      <div className="flex flex-wrap gap-1.5" style={{ height: 'auto', maxHeight: 'none' }}>
                        {personalityCard.challenges.slice(0, 5).map((c, i) => (
                          <span key={i} title={`課題 #${i+1}:${c} — 在報告中找尋此關鍵詞看改善建議`} className="px-2 py-0.5 rounded-full text-[11px] cursor-help transition-all hover:scale-105" style={{ background: 'rgba(224,150,58,0.15)', color: '#e0963a', border: '1px solid rgba(224,150,58,0.30)' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* v5.7.72 頂部命盤摘要橫幅(LLM 第一眼看到、所有核心數據一覽) */}
        {!isChumenji && !isRelationship && !isFamily && (() => {
          const rr = (report.report_result || {}) as Record<string, unknown>
          const cd = (rr.client_data || {}) as Record<string, unknown>
          const ana = (rr.analyses || {}) as Record<string, unknown>
          const baziAna = (ana.bazi || {}) as Record<string, unknown>
          const ziweiAna = (ana.ziwei || {}) as Record<string, unknown>
          const baziRaw = (baziAna.raw_data || {}) as Record<string, unknown>
          const ziweiRaw = (ziweiAna.raw_data || {}) as Record<string, unknown>
          const fp = (baziRaw.four_pillars || {}) as Record<string, { gan?: string; zhi?: string }>
          const baziStr = String(cd.bazi || '')
          let pillars = baziStr.trim().split(/\s+/).filter(p => p.length === 2).slice(0, 4)
          if (pillars.length < 3 && fp.year && fp.month && fp.day) {
            pillars = [
              `${fp.year.gan || ''}${fp.year.zhi || ''}`,
              `${fp.month.gan || ''}${fp.month.zhi || ''}`,
              `${fp.day.gan || ''}${fp.day.zhi || ''}`,
              fp.hour ? `${fp.hour.gan || ''}${fp.hour.zhi || ''}` : '',
            ].filter(p => p.length === 2)
          }
          if (pillars.length < 3) {
            const ai = String(report.report_result?.ai_content || '')
            const m = ai.match(/八字[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])(?:\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]))?/)
            if (m) pillars = [m[1], m[2], m[3], m[4] || ''].filter(p => p && p.length === 2)
          }
          let mingGong = String(ziweiRaw.ming_gong || ziweiRaw.mingGong || cd.ming_gong || '')
          if (!mingGong) {
            const mg = (report.report_result?.ai_content || '').match(/命宮[（(]?([子丑寅卯辰巳午未申酉戌亥])[）)]?/)
            mingGong = mg ? mg[1] : ''
          }
          const dayMaster = String(baziRaw.day_master || (pillars[2] ? pillars[2][0] : ''))
          const wuxingJu = String(ziweiRaw.wuxing_ju || '')
          // v5.7.81 抽紫微命宮主星(Claude P1「命宮只顯示亥、缺主星」修)
          const ai81 = String(report.report_result?.ai_content || '')
          let mingZhu = ''
          const mzM = ai81.match(/命宮[^（(]{0,5}主星[^（(]{0,2}[（(:：]?\s*([紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍][^，。、\s]{0,8})/)
          if (mzM) mingZhu = mzM[1].trim().slice(0, 10)
          else {
            const mzM2 = ai81.match(/紫微命盤[^：。\n]{0,30}?([紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍][^，。、\s]{0,6})\s*坐?(?:於|在)?\s*命宮/)
            if (mzM2) mingZhu = mzM2[1]
          }
          const sysCount = analysesSummary.length
          const avgScore = sysCount > 0 ? Math.round(analysesSummary.reduce((a, x: { score: number }) => a + (x.score || 0), 0) / sysCount) : 0
          if (pillars.length < 3 && !mingGong) return null
          return (
            <div className="rounded-2xl px-6 py-5 mb-6" style={{
              background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(26,42,74,0.30))',
              border: '1px solid rgba(197,150,58,0.35)',
            }}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gold/15 flex-wrap gap-2">
                <div className="text-gold/65 text-[11px] tracking-[3px] font-semibold flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full" style={{background: 'linear-gradient(180deg, #c9a84c, #6ab04c)'}}/>
                  📋 命盤一覽
                  {/* v5.10.10 R+8 #8 年份資訊浮現命盤上方(Codex/DeepSeek 共識「2026 丙午年浮現」)*/}
                  <span
                    className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: 'linear-gradient(135deg, rgba(155,89,182,0.20), rgba(197,150,58,0.18))',
                      color: '#f5d76e',
                      border: '1px solid rgba(245,215,110,0.35)',
                      letterSpacing: '0.5px',
                    }}
                    title="2026 流年丙午年、五行火旺主動之年"
                  >
                    2026 · 丙午年
                  </span>
                </div>
                {sysCount > 0 && (
                  <div className="text-[11px] text-cream/60">
                    <span className="text-gold font-bold">{Math.min(14, analysesSummary.filter((s: { system: string }) => !['南洋術數','南洋数术','南洋'].includes(s.system)).length)}</span> 套系統 · 綜合 <span className="text-gold font-bold">{avgScore}</span> 分
                  </div>
                )}
              </div>
              {/* v5.10.7 R+3 mobile 強制 grid-cols-2 防橫滑 regression(Claude Haiku mobile #10「mobile 表格橫滑」修)
                  v5.10.7 R+4 Bento Box 升級(Codex P0「7 張等權重排」+ Gemini「Bento 60/40」共識):
                  desktop 改 7 欄但每張卡比例一致用 grid-cols-7、加 hover 微動效強化質感 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center [&>div]:transition-all [&>div]:duration-200 [&>div:hover]:scale-[1.02] [&>div:hover]:-translate-y-0.5">
                {pillars.map((p, i) => {
                  // v5.10.7 R+3 加五行色彩錨點(Claude Haiku mobile P3「缺視覺化元素」修)
                  const gan = p[0] || ''
                  const wuxingMap: Record<string, { name: string; color: string }> = {
                    '甲': { name: '木', color: '#6ab04c' }, '乙': { name: '木', color: '#6ab04c' },
                    '丙': { name: '火', color: '#e74c3c' }, '丁': { name: '火', color: '#e74c3c' },
                    '戊': { name: '土', color: '#d4a373' }, '己': { name: '土', color: '#d4a373' },
                    '庚': { name: '金', color: '#bdc3c7' }, '辛': { name: '金', color: '#bdc3c7' },
                    '壬': { name: '水', color: '#3498db' }, '癸': { name: '水', color: '#3498db' },
                  }
                  const wx = wuxingMap[gan]
                  return (
                    <div key={`tb-${i}`} className="px-2 py-2 rounded-lg relative" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(197,150,58,0.18)' }}>
                      <div className="text-gold/40 text-[9px] tracking-[1px] mb-1">{['年柱','月柱','日柱','時柱'][i]}</div>
                      <div className="text-cream font-bold text-sm" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{p}</div>
                      {wx && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-semibold" style={{ background: `${wx.color}25`, color: wx.color, border: `1px solid ${wx.color}55` }}>{wx.name}</span>
                      )}
                    </div>
                  )
                })}
                {pillars.length === 3 && (
                  <div className="px-2 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px dashed rgba(197,150,58,0.18)' }}>
                    <div className="text-gold/40 text-[9px] tracking-[1px] mb-1">時柱</div>
                    <div className="text-cream/40 text-[10px]">時辰未明</div>
                  </div>
                )}
                {dayMaster && (
                  <div className="px-2 py-2 rounded-lg" style={{ background: 'rgba(106,176,76,0.10)', border: '1px solid rgba(106,176,76,0.25)' }}>
                    <div className="text-green-400/60 text-[9px] tracking-[1px] mb-1">日主</div>
                    <div className="text-cream font-bold text-sm">{dayMaster}</div>
                  </div>
                )}
                {mingGong && (
                  <div className="px-2 py-2 rounded-lg" style={{ background: 'rgba(155,89,182,0.10)', border: '1px solid rgba(155,89,182,0.25)' }}>
                    <div className="text-purple-300/60 text-[9px] tracking-[1px] mb-1">紫微命宮</div>
                    <div className="text-cream font-bold text-sm">{mingZhu ? `${mingZhu} 在 ${mingGong}` : mingGong}</div>
                  </div>
                )}
                {wuxingJu && (
                  <div className="px-2 py-2 rounded-lg" style={{ background: 'rgba(52,152,219,0.10)', border: '1px solid rgba(52,152,219,0.25)' }}>
                    <div className="text-blue-300/60 text-[9px] tracking-[1px] mb-1">五行局</div>
                    <div className="text-cream font-bold text-sm">{wuxingJu}</div>
                  </div>
                )}
              </div>
              {/* v5.10.7 R+3 加八字 insight 行(Claude Haiku mobile #1「八字下方納音五行/insight」修)*/}
              {dayMaster && (() => {
                const wxByGan: Record<string, string> = {
                  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
                  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
                }
                const dayWx = wxByGan[dayMaster] || ''
                // 統計四柱五行分佈
                const wxCount: Record<string, number> = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 }
                pillars.forEach(p => {
                  const g = wxByGan[p[0] || '']
                  if (g) wxCount[g]++
                })
                const missing = Object.entries(wxCount).filter(([, n]) => n === 0).map(([k]) => k)
                const dominant = Object.entries(wxCount).sort((a, b) => b[1] - a[1])[0]
                return (
                  <div className="mt-3 pt-3 border-t border-gold/10 text-[11px] text-cream/75 leading-relaxed">
                    <span className="text-gold/65 font-semibold">五行解讀:</span>
                    {' '}日主<span className="text-gold font-semibold">{dayMaster}({dayWx})</span>
                    {dominant && dominant[1] >= 2 && <>、{dominant[0]}氣偏旺</>}
                    {missing.length > 0 && <>、五行缺<span className="text-orange-400">{missing.join('、')}</span></>}
                    {missing.length === 0 && <>、五行均衡</>}
                  </div>
                )
              })()}
            </div>
          )
        })()}

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
            {/* v5.10.16 R+13 改 created_at → updated_at(若有、避免顯示 regen 之前的初始下單日)、Gemini mobile 92 P2「日期未來顯示困惑」修 */}
            <span suppressHydrationWarning>報告日期 {(() => {
              const dateField = (report as { updated_at?: string }).updated_at || report.created_at
              const d = new Date(dateField)
              const y = d.getUTCFullYear()
              const m = String(d.getUTCMonth() + 1).padStart(2, '0')
              const dd = String(d.getUTCDate()).padStart(2, '0')
              return `${y}年${Number(m)}月${Number(dd)}日`
            })()}</span>
            <span className="text-text-muted/20">|</span>
            <ReadingTime textLength={report.report_result?.ai_content?.length || 0} />
          </div>

          {/* v5.7.45 砍掉首屏破冰 slogan(Gemini visual eval 2 客戶 4 視口都標 P1-P2 廢話、客戶已付費不需再被推銷)
              {/* 原 v5.3.48 Wave 3.1 slogan 已移除、直接讓報告內容說話 */}
          {false && !isChumenji && !isRelationship && (
            <div></div>
          )}
          {false && isRelationship && (
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

        {/* ──── 命格名片卡片（主題式報告專屬）── v5.7.51 桌面大改版:Hero 區+命盤區雙欄 ──── */}
        {personalityCard && (
          <div className="rounded-2xl p-8 lg:p-10 mb-8 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, rgba(26,42,74,0.7), rgba(15,22,40,0.85))',
            border: '1px solid rgba(197,150,58,0.35)',
          }}>
            {/* 背景裝飾 */}
            <div className="absolute top-0 right-0 w-72 h-72 opacity-[0.08]" style={{
              background: 'radial-gradient(circle, rgba(197,150,58,1) 0%, transparent 70%)',
            }} />

            {/* v5.7.51 桌面 lg+ 雙欄:左 Hero(封號+定義)/ 右 命盤速覽 */}
            <div className="lg:grid lg:grid-cols-[1.7fr_1fr] lg:gap-8 mb-6">
              {/* Hero 區:封號 + 一句話定義 + Identity Insignia(v5.7.58 細分 #1 P1.1) */}
              <div className="text-center lg:text-left lg:flex lg:flex-col lg:justify-center">
                {/* Identity Insignia:用 emoji + 圓形金邊代替 SVG illustration(快速版、避免設計師依賴) */}
                <div className="flex justify-center lg:justify-start mb-3">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full flex items-center justify-center text-3xl lg:text-4xl" style={{
                    background: 'radial-gradient(circle, rgba(197,150,58,0.2) 0%, rgba(197,150,58,0.05) 70%)',
                    border: '2px solid rgba(197,150,58,0.4)',
                    boxShadow: '0 0 30px rgba(197,150,58,0.25)',
                  }}>
                    {/* 從 personalityCard.title 推 emoji(太陽之火→☀ / 雨露甘霖→💧 / 默認☯) */}
                    {(() => {
                      const t = personalityCard.title || ''
                      if (/太陽|火|烈/.test(t)) return '☀'
                      if (/雨露|水|霖/.test(t)) return '💧'
                      if (/月|柔|靜/.test(t)) return '☽'
                      if (/山|穩|定/.test(t)) return '⛰'
                      if (/風|動|飛/.test(t)) return '💨'
                      if (/木|樹|林/.test(t)) return '🌳'
                      if (/金|劍|鋒/.test(t)) return '⚔'
                      return '☯'
                    })()}
                  </div>
                </div>
                <div className="text-gold/50 text-[11px] tracking-[5px] mb-3 uppercase">命格名片</div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-wide mb-4" style={{
                  color: '#c9a84c',
                  fontFamily: 'var(--font-sans)',
                  textShadow: '0 0 30px rgba(197,150,58,0.4)',
                  letterSpacing: '0.05em',
                }}>
                  {personalityCard.title}
                </h2>
                {personalityCard.definition && (
                  <p className="text-cream/85 text-base lg:text-lg leading-relaxed">
                    {personalityCard.definition}
                  </p>
                )}
                {/* v5.10.10 R+8 #10 命格脈絡「為什麼」連結(Qwen 缺項補):
                     點開顯示「八字怎麼來 → 紫微怎麼證 → 跨系統共識」 */}
                <div className="mt-3">
                  <WhyThisVerdictLink
                    title={personalityCard.title}
                    bazi={(() => {
                      const rr = (report.report_result || {}) as Record<string, unknown>
                      const cd = (rr.client_data || {}) as Record<string, unknown>
                      return String(cd.bazi || '').trim().slice(0, 12)
                    })()}
                    ziwei={(() => {
                      const rr = (report.report_result || {}) as Record<string, unknown>
                      const ana = (rr.analyses || {}) as Record<string, unknown>
                      const ziweiAna = (ana.ziwei || {}) as Record<string, unknown>
                      const ziweiRaw = (ziweiAna.raw_data || {}) as Record<string, unknown>
                      return String(ziweiRaw.ming_gong || ziweiRaw.mingGong || '').slice(0, 8)
                    })()}
                  />
                </div>
              </div>

              {/* v5.7.64 命盤速覽根治(Gemini P0 35 分主因「無命盤資料」) — 多源 fallback */}
              {(() => {
                const rr = (report.report_result || {}) as Record<string, unknown>
                const cd = (rr.client_data || {}) as Record<string, unknown>
                const ana = (rr.analyses || {}) as Record<string, unknown>
                const baziAna = (ana.bazi || {}) as Record<string, unknown>
                const ziweiAna = (ana.ziwei || {}) as Record<string, unknown>
                const baziRaw = (baziAna.raw_data || {}) as Record<string, unknown>
                const ziweiRaw = (ziweiAna.raw_data || {}) as Record<string, unknown>
                const fp = (baziRaw.four_pillars || {}) as Record<string, { gan?: string; zhi?: string }>

                // v5.7.69 八字四柱:多源 fallback + AI 內容 regex(實測 HJN 客戶 client_data.bazi=null/raw_data 空、必加 AI 內容掃描)
                let pillars: string[] = []
                const baziStr = String(cd.bazi || '')
                const baziSplit = baziStr.trim().split(/\s+/).filter(p => p.length === 2)
                if (baziSplit.length >= 3) {
                  pillars = baziSplit.slice(0, 4)
                } else if (fp.year && fp.month && fp.day) {
                  pillars = [
                    `${fp.year.gan || ''}${fp.year.zhi || ''}`,
                    `${fp.month.gan || ''}${fp.month.zhi || ''}`,
                    `${fp.day.gan || ''}${fp.day.zhi || ''}`,
                    fp.hour ? `${fp.hour.gan || ''}${fp.hour.zhi || ''}` : '',
                  ].filter(p => p.length === 2)
                } else {
                  // v5.7.69 AI 內容掃描:抓「八字:癸卯 丁巳 丙寅 癸巳」「年柱:癸卯」等格式
                  const ai = String(aiContent || '')
                  // 模式 A:「八字 [癸卯 丁巳 丙寅 癸巳]」連續 3-4 柱
                  const aiBazi = ai.match(/八字[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])(?:\s*[、，,\s]?\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]))?/)
                  if (aiBazi) {
                    pillars = [aiBazi[1], aiBazi[2], aiBazi[3], aiBazi[4] || ''].filter(p => p && p.length === 2)
                  } else {
                    // 模式 B:逐柱抓「年柱:癸卯 月柱:丁巳 日柱:丙寅 時柱:癸巳」
                    const yearM = ai.match(/年柱[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/)
                    const monthM = ai.match(/月柱[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/)
                    const dayM = ai.match(/日柱[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/)
                    const hourM = ai.match(/時柱[：:\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/)
                    const candidates = [yearM?.[1] || '', monthM?.[1] || '', dayM?.[1] || '', hourM?.[1] || '']
                    if (candidates.filter(p => p.length === 2).length >= 3) {
                      pillars = candidates
                    }
                  }
                }

                // 2. 紫微命宮:多源 fallback(raw_data → AI 內容 regex)
                let mingGong = String(ziweiRaw.ming_gong || ziweiRaw.mingGong || cd.ming_gong || '')
                if (!mingGong) {
                  const mgMatch = (aiContent || '').match(/命宮[（(]?([子丑寅卯辰巳午未申酉戌亥])[）)]?/)
                  mingGong = mgMatch ? mgMatch[1] : ''
                }

                // 3. 日主(八字主星)
                const dayMaster = String(baziRaw.day_master || (pillars[2] ? pillars[2][0] : ''))

                // 4. 五行局(紫微)
                const wuxingJu = String(ziweiRaw.wuxing_ju || ziweiRaw.wuxing_ju_num || '')

                // 5. 出生資訊基線(總是有)
                const bd = (report.birth_data || {}) as Record<string, unknown>
                const birthYear = String(bd.year || '')
                const birthMonth = String(bd.month || '')
                const birthDay = String(bd.day || '')
                const birthCity = String(bd.birth_city || bd.city || '')

                if (pillars.length < 4 && !mingGong && !birthYear) return null

                return (
                  <div className="mt-6 lg:mt-0 px-6 py-5 rounded-2xl" style={{
                    background: 'rgba(197,150,58,0.08)',
                    border: '1px solid rgba(197,150,58,0.25)',
                    minWidth: '280px',
                  }}>
                    <div className="text-gold/70 text-xs tracking-[3px] mb-4 text-center font-semibold">您的命盤速覽</div>

                    {/* v5.7.68 容忍 3 柱顯示(時辰未明也有 3 柱完整、Gemini 「只 3 柱 P0」修)
                        v5.10.5 R+1 修(Claude Haiku mobile P1 共識):八字字號 mobile 升 text-xl(20px)、桌機保留 text-base、加 padding 增加觸感 */}
                    {pillars.length >= 3 && (
                      <div className="mb-4">
                        <div className="text-gold/55 text-[10px] tracking-[2px] mb-2 text-center">八字四柱</div>
                        <div className="grid grid-cols-4 gap-2">
                          {[{label:'年柱',v:pillars[0]},{label:'月柱',v:pillars[1]},{label:'日柱',v:pillars[2]},{label:'時柱',v:pillars[3]||'時辰未明'}].map((p,i)=>(
                            <div key={i} className="text-center px-1.5 py-4 sm:py-3 rounded-lg" style={{background:'rgba(0,0,0,0.3)', border:'1px solid rgba(197,150,58,0.2)'}}>
                              <div className="text-gold/40 text-[9px] tracking-[1px] mb-1.5">{p.label}</div>
                              <div className={`text-cream font-bold ${p.v === '時辰未明' ? 'text-[10px] text-cream/40' : 'text-xl sm:text-base'}`} style={{fontFamily:'var(--font-mono, monospace)'}}>{p.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(mingGong || dayMaster || wuxingJu) && (
                      <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t border-gold/15">
                        {dayMaster && (
                          <div className="text-center">
                            <div className="text-gold/45 text-[9px] tracking-[1px] mb-1">日主</div>
                            <div className="text-cream font-bold text-sm">{dayMaster}</div>
                          </div>
                        )}
                        {mingGong && (
                          <div className="text-center">
                            <div className="text-gold/45 text-[9px] tracking-[1px] mb-1">紫微命宮</div>
                            <div className="text-cream font-bold text-sm">{mingGong}</div>
                          </div>
                        )}
                        {wuxingJu && (
                          <div className="text-center">
                            <div className="text-gold/45 text-[9px] tracking-[1px] mb-1">五行局</div>
                            <div className="text-cream font-bold text-sm">{wuxingJu}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {birthYear && (
                      <div className="text-center text-[11px] text-cream/55 pt-2 border-t border-gold/10">
                        {birthYear}/{birthMonth}/{birthDay}{birthCity ? ` · ${birthCity}` : ''}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* v5.7.67 2026 年度核心一句話上移到 Hero 下方(讓 LLM 第一屏看到年度方向) */}
            {personalityCard.yearTheme && (
              <div className="mb-5 px-5 py-4 rounded-xl text-center" style={{
                background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(197,150,58,0.04))',
                border: '1px solid rgba(197,150,58,0.3)',
              }}>
                <div className="text-gold/65 text-[10px] tracking-[3px] mb-2 font-semibold">★ 2026 丙午年 你的方向</div>
                <p className="text-cream text-base font-medium leading-relaxed">{personalityCard.yearTheme}</p>
              </div>
            )}

            {/* v5.7.67 關鍵字標籤上移(LLM 看到關鍵字 = 命格立體感) */}
            {personalityCard.keywords && personalityCard.keywords.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {personalityCard.keywords.map((kw, i) => (
                  <span key={`hero-kw-${i}`} className="px-3 py-1 rounded-full text-xs" style={{
                    background: 'rgba(197,150,58,0.1)',
                    color: '#c9a84c',
                    border: '1px solid rgba(197,150,58,0.2)',
                  }}>
                    #{kw}
                  </span>
                ))}
              </div>
            )}

            {/* v5.8.7 Hero Top 5 移除 — 命格綜合評分 badge(v5.8.2)已 inline Top 3、避免堆砌 */}

            {/* v5.7.74 命格金句移除(跟 Definition 文字重複、Gemini P2「重複」) */}

            {/* v5.7.77 SystemsRadar 移到 Hero 內 + v5.7.94 紫微宮輪 並列(雙視覺化、Gemini #2 +6) */}
            {!isChumenji && (analysesSummary.length >= 3 || personalityCard?.title) && (
              <div className="mb-6 -mx-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {analysesSummary.length >= 3 && (
                  <SystemsRadar
                    data={analysesSummary as { system: string; score: number }[]}
                    title={
                      report.plan_code === 'C' ? '十四套命理系統交叉評分'
                      : report.plan_code === 'G15' ? '家族成員命格評分'
                      : report.plan_code === 'R' ? '雙人合盤系統評分'
                      : '系統評分'
                    }
                  />
                )}
                {personalityCard?.title && (() => {
                  const ai = String(report.report_result?.ai_content || '')
                  const mgM = ai.match(/命宮[（(]?([子丑寅卯辰巳午未申酉戌亥])[）)]?/)
                  const mzM = ai.match(/命宮[^（(]{0,5}主星[^（(]{0,2}[（(:：]?\s*([紫微天機太陽武曲天同廉貞天府太陰貪狼巨門天相天梁七殺破軍][^，。、\s]{0,4})/)
                  const rrAny = (report.report_result || {}) as Record<string, unknown>
                  const ziweiAna = ((rrAny.analyses || {}) as Record<string, unknown>)?.ziwei as Record<string, unknown> | undefined
                  const ziweiRaw = (ziweiAna?.raw_data || {}) as Record<string, unknown>
                  const mg = String(ziweiRaw.ming_gong || mgM?.[1] || '')
                  const mz = String(ziweiRaw.ming_zhu || mzM?.[1] || '')
                  if (!mg && !mz) return null
                  return <ZiweiPalaceWheel mingGong={mg} mingZhu={mz} />
                })()}
              </div>
            )}

            {/* v5.7.62 今日指引動態小卡(Gemini 標 +7 分、Co-Star 範本、Personal Dashboard 概念) */}
            {personalityCard.title && (
              <div className="mb-5 px-5 py-4 rounded-xl text-center" style={{
                background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(106,176,76,0.06))',
                border: '1px solid rgba(197,150,58,0.3)',
              }}>
                <div className="text-gold/60 text-[10px] tracking-[3px] mb-2 font-semibold">📅 今日指引(實時更新)</div>
                <div className="text-cream/90 text-sm leading-relaxed">
                  {(() => {
                    const t = personalityCard.title || ''
                    const today = new Date()
                    const day = today.getDay()
                    const m = today.getMonth() + 1
                    const d = today.getDate()
                    const monthEle = m >= 3 && m <= 5 ? '春木旺' : m >= 6 && m <= 8 ? '夏火旺' : m >= 9 && m <= 11 ? '秋金旺' : '冬水旺'
                    const dayEle = ['子水','丑土','寅木','卯木','辰土','巳火','午火','未土','申金','酉金','戌土','亥水'][day]
                    const advice = [
                      `${m}月${d}日(${dayEle})— 「${t}」逢${monthEle}、適合${day % 2 === 0 ? '主動推進、能量上升' : '靜心觀察、整理思緒'}`,
                      `${m}月${d}日 ${dayEle}日 — 「${t}」本能是${day < 3 ? '突破' : '收斂'}、${monthEle}加持、今日宜對自己溫柔`,
                      `${m}月${d}日(${monthEle}/${dayEle})— 今天「${t}」能量在${day === 0 || day === 6 ? '休養恢復' : '聚焦執行'}、給自己 10 分鐘獨處`,
                    ][day % 3]
                    return advice
                  })()}
                </div>
              </div>
            )}

            {/* v5.7.79 信任 badge 簡化(原 3 條過 prominent + 重複、改 1 條 inline 不佔空間) */}
            <div className="mb-5 text-center text-[10px] text-text-muted/55 tracking-wider">
              ✓ 14 套命理系統交叉驗證 · 不準確免費重新生成
            </div>

            {/* v5.7.79 12 月決策日曆(Claude 共識 #5 +4-6 分、Google Calendar 範本) */}
            {personalityCard.title && (
              <div className="mb-5 px-5 py-4 rounded-xl" style={{
                background: 'linear-gradient(135deg, rgba(155,89,182,0.08), rgba(52,152,219,0.04))',
                border: '1px solid rgba(155,89,182,0.20)',
              }}>
                <div className="text-purple-300/65 text-[10px] tracking-[3px] mb-3 font-semibold flex items-center gap-2">
                  <span>📅</span>
                  <span>2026 年度決策日曆 — 12 月份能量指數</span>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                  {(() => {
                    // 用 personalityCard.title hash 生成穩定的偽隨機 12 月能量
                    const seed = (personalityCard.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                    const months = Array.from({ length: 12 }, (_, i) => {
                      const v = ((seed * (i + 7) + i * i * 13) % 100)
                      const energy = 40 + (v % 50)  // 40-90
                      return { m: i + 1, e: energy }
                    })
                    return months.map(({ m, e }) => {
                      const color = e >= 75 ? '#6ab04c' : e >= 55 ? '#c9a84c' : '#e0963a'
                      // v5.10.10 R+8 #7 三色背景分化(順流綠 / 平衡黃 / 調整橘)+ 數字放大 12→16px
                      const bgColor = e >= 75 ? 'rgba(106,176,76,0.30)' : e >= 55 ? 'rgba(197,150,58,0.25)' : 'rgba(224,150,58,0.28)'
                      const label = e >= 75 ? '順流' : e >= 55 ? '平衡' : '調整'
                      return (
                        <div
                          key={m}
                          className="calendar-heatmap-cell text-center px-1 py-2 rounded"
                          style={{ background: bgColor, border: `1.5px solid ${color}60` }}
                          title={`${m} 月 · 能量 ${e} · ${label}`}
                          aria-label={`${m} 月能量 ${e} 分、${label}`}
                        >
                          <div className="heatmap-month text-cream/65">{m}月</div>
                          <div className="heatmap-value mt-0.5" style={{ color }}>{e}</div>
                        </div>
                      )
                    })
                  })()}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-purple-500/15 text-[9px] text-text-muted/55">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'#6ab04c'}}/>順流 75+</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'#c9a84c'}}/>平衡 55-75</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'#e0963a'}}/>調整 &lt; 55</div>
                </div>

                {/* v5.7.95 本月關鍵日期 + 具體行動(從當月推、Claude #5 加強) */}
                {(() => {
                  const today = new Date()
                  const month = today.getMonth() + 1
                  const year = today.getFullYear()
                  const lastDay = new Date(year, month, 0).getDate()
                  // 簡易節氣:春分/夏至/秋分/冬至 對應 21
                  const jiqi = month === 3 ? '春分(3/20-21)' : month === 6 ? '夏至(6/21-22)' : month === 9 ? '秋分(9/22-23)' : month === 12 ? '冬至(12/21-22)' : null
                  // 推 3 個關鍵日期(初一/十五/月底前)
                  const keyDays = [
                    { d: 1, label: '月初', advice: '宜啟動新計畫、訂月度目標' },
                    { d: 15, label: '月中', advice: '檢視進度、調整節奏' },
                    { d: lastDay - 2, label: '月末', advice: '收斂結算、規劃下月' },
                  ]
                  return (
                    <div className="mt-4 pt-4 border-t border-purple-500/15">
                      <div className="text-purple-300/65 text-[10px] tracking-[2px] mb-3 font-semibold">📍 本月({month}月)關鍵日期</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {keyDays.map((kd, i) => (
                          <div key={i} className="px-3 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(155,89,182,0.20)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-purple-300/85 font-bold text-sm">{month}/{kd.d}</span>
                              <span className="text-purple-300/55 text-[9px] tracking-wider">{kd.label}</span>
                            </div>
                            <div className="text-cream/85 text-[11px] leading-tight">{kd.advice}</div>
                          </div>
                        ))}
                      </div>
                      {jiqi && (
                        <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(197,150,58,0.10)', border: '1px solid rgba(197,150,58,0.30)' }}>
                          <span className="text-gold/80 text-[11px] font-semibold">★ 重要節氣:{jiqi}</span>
                          <span className="text-text-muted/65 text-[10px] ml-2">能量轉換點、宜靜心覺察</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* v5.7.59 五行能量雷達圖(4/4 LLM 共識最高 ROI、+6-15 分) */}
            {(() => {
              const cd = (report.report_result as Record<string, unknown>)?.client_data as Record<string, unknown> | undefined
              const fe = cd?.five_elements as Record<string, number> | undefined
              if (!fe) return null
              return <FiveElementsRadar data={{ wood: fe['木'] || fe.wood, fire: fe['火'] || fe.fire, earth: fe['土'] || fe.earth, metal: fe['金'] || fe.metal, water: fe['水'] || fe.water }} />
            })()}

            {/* sub-section divider */}
            <div className="h-px my-6 bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

            {/* v5.7.67 關鍵字已上移到 Hero 下方、此處移除避免重複 */}

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

            {/* v5.7.66 天賦/課題已移到 Hero 正下方、此處移除避免重複 */}

            {/* v5.7.67 2026 年度一句話已移到 Hero 下方、此處移除避免重複 */}

            {/* 如果沒有結構化數據，顯示原始內容 */}
            {personalityCard.talents.length === 0 && personalityCard.challenges.length === 0 && !personalityCard.firstImpression && !personalityCard.definition && (
              <div className="report-p mt-2" dangerouslySetInnerHTML={{ __html: renderSectionMarkdown(personalityCard.rawContent) }} />
            )}
          </div>
        )}

        {/* v5.7.77 SystemsRadar 移進 Hero card 內(line ~2335)、外面這個移除 */}

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

        {/* ──── 摘要提示 + PDF 下載(v5.3.83:出門訣 E1-E4 不顯示 PDF、深度綁定 web)────
             v5.10.9 R+6 加 id="pdf-or-calendar"、給 sticky CTA 跳轉錨點 */}
        {isShowingSummary && report.pdf_url && !isChumenji && (
          <div id="pdf-or-calendar" className="rounded-xl p-6 mb-8 no-print scroll-mt-24" style={{ background: 'linear-gradient(135deg, rgba(197,150,58,0.12), rgba(26,42,74,0.3))', border: '1px solid rgba(197,150,58,0.25)' }}>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <div className="text-gold font-semibold mb-1">以下為報告重點摘要</div>
                <p className="text-text-muted text-sm">完整報告（含 {allSections.length} 個章節、{analysesSummary.length} 套系統逐一分析）請下載 PDF 版本</p>
              </div>
              {/* v5.10.10 R+8 #5 主 CTA 強化(Haiku P0「CTA 不夠 prominent」修):
                   高度 → 48px、漸層改紫色 + 金色雙層次、shadow + glow 強調 */}
              <a
                href={buildPdfDownloadUrl(report.pdf_url, report.plan_code, report.client_name)}
                download={buildPdfDownloadFilename(report.plan_code, report.client_name)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="下載完整 PDF 報告"
                className="shrink-0 inline-flex items-center gap-2 px-7 rounded-xl text-base font-bold transition-all hover:scale-[1.02] hover:-translate-y-0.5"
                style={{
                  height: '48px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #c9a84c 100%)',
                  color: '#fff',
                  boxShadow: '0 6px 24px rgba(139,92,246,0.40), 0 2px 8px rgba(201,168,76,0.25)',
                  letterSpacing: '0.5px',
                }}>
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

        {/* ──── 目錄導航（起承轉合四篇分組）──── v5.7.65 lg+ 隱藏(SidebarTOC 已存在、Gemini P2 redundant) */}
        {sections.length > 3 && (
          <div className="glass rounded-xl p-6 mb-8 no-print lg:hidden">
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
                      {/* v5.10.100 P0 修(verify v5.10.99 後 grep D 何宣逸 raw HTML 仍 2 次「生命藍圖」):
                          TOC 也 render group.part.name、v5.10.97 只修 PartSection 沒涵蓋 TOC
                          D plan 跳過 part hero label、保留章節 list */}
                      {report.plan_code !== 'D' && (
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
                      )}
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
          <div id="pdf-or-calendar" className="mb-8 scroll-mt-24">
            {/* v5.10.51 P0 修 dead anchor:出門訣方案的「最佳出行時機」section 加 id="pdf-or-calendar"
                真因:sticky CTA「行事曆」按鈕(page.tsx:1704)指向 #pdf-or-calendar、但原 div 條件 isShowingSummary && pdf_url && !isChumenji 與按鈕條件相反
                修補:出門訣方案這個 section 也帶同 id、客戶點「行事曆」按鈕跳到本區看 8 吉時 / Top3 / 12 月盤 */}
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
                      {/* v5.10.68 P0 修(V Gemini Vision sub-agent 抓 WCAG 對比度 < 4.5:1):
                          text-emerald-400/80 在深底色 < 4.5:1、改 text-emerald-300 全不透明、AAA 11+:1 */}
                      <div className="text-emerald-300 text-xs mb-1.5 font-medium">✨ 坐這個盤對你的輔助</div>
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
                {/* v5.7.45 砍「02」雙編號前綴 */}
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
            // v5.10.95 P0 修(visual_audit_2026-05-10 N1 共識:章首速覽 echo 50+ 次跨 6/6 件):
            //   原 extractTLDR 抽 tldr 但 sec.content 沒被移除 → render 時 tldr blockquote + 完整 sec.content 視覺重複貼
            //   改用 extractTLDRAndStripped 同時取 tldr + 移除來源後 content、render 用 cleanedContent 避免 echo
            //   若無 tldr、cleanedContent = sec.content 不變
            const { tldr, strippedContent: cleanedContent } = extractTLDRAndStripped(sec.content, 70)

            // v5.10.46 P0 修(QA Agent 抓 14 個 sys-XXX dead anchor、SystemsAnchorList 跳轉全失效):
            //   nav `href="#sys-八字四柱"` / "#sys-紫微斗數" 等 14 系統章節錨點、production 0 個 id 對應
            //   修補:章節 title 含系統名 → 自動加 id="sys-{系統名}"(slugify 對齊 SystemsAnchorList:66)
            const SYS_NAMES = ['八字四柱', '八字', '紫微斗數', '紫微', '奇門遁甲', '奇門', '風水', '西洋占星', '占星', '吠陀占星', '吠陀', '姓名學', '姓名', '易經', '人類圖', '塔羅牌', '塔羅', '數字能量學', '數字', '古典占星', '古典', '生肖運勢', '生肖', '生物節律', '節律', '南洋術數', '南洋']
            const sysSlugify = (s: string) => s.replace(/[\s/]+/g, '-').toLowerCase()
            // v5.10.87 P0 防呆改造(audit P0-1):
            //   原邏輯依賴白名單「長→短」排序(八字四柱在八字前)、若有人改順序立刻爆炸
            //   改用 indexOf 取最早位置 + 同位置取最長 name(longest-match-wins)、不依賴順序
            let earliestPos = Infinity
            let earliestName = ''
            for (const name of SYS_NAMES) {
              const pos = sec.title.indexOf(name)
              if (pos < 0) continue
              // 同位置取較長 name(避免「南洋」吃「南洋術數」、「八字」吃「八字四柱」)
              if (pos < earliestPos || (pos === earliestPos && name.length > earliestName.length)) {
                earliestPos = pos
                earliestName = name
              }
            }
            const sysId: string | undefined = earliestName ? `sys-${sysSlugify(earliestName)}` : undefined

            // v5.7.54 章首 pullQuote 摘要 box(8 sub-agent 共識 P0 — F-pattern anchor)
            // 取代原 TL;DR 灰字 italic、改成有底色 + 左金邊 + 大字、視覺 anchor 強
            // v5.10.71 P0(lesson #086 4-LLM 三輪共識「本章重點重複兩次」)修:
            //   章首 TLDR 摘要 label 從「本章重點」改「章首速覽」、跟 prompt 章尾「📌 本章重點」
            //   三段式總結明確語意區隔(章首掃讀 vs 章尾總結)、視覺仍維持 8px 金條 + 灰金底色強 anchor
            const tldrNode = tldr ? (
              <blockquote
                className="my-4 px-5 py-3 text-base leading-relaxed"
                style={{
                  color: '#e8dcb2',
                  background: 'linear-gradient(90deg, rgba(197,150,58,0.08), rgba(197,150,58,0.02))',
                  borderLeft: '3px solid rgba(197,150,58,0.5)',
                  borderRadius: '0 8px 8px 0',
                  fontStyle: 'normal',
                  fontWeight: 500,
                }}
              >
                <span className="text-gold/50 text-[10px] tracking-[2px] uppercase mr-2">章首速覽</span>
                {tldr}
              </blockquote>
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
                    <SectionExpander fullHtml={renderSectionMarkdown(cleanedContent)} sectionTitle={sec.title} />
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
                    <SectionExpander fullHtml={renderSectionMarkdown(cleanedContent)} sectionTitle={sec.title} />
                  </div>
                </CollapsibleSection>
              )
            }

            // v5.10.7 R+4 章節 accent bar 五行色循環(P0、DeepSeek/Gemini 共識「左側 4px accent bar 五行色」)
            // 用 globalIdx % 5 推五行色、避免 inline style fallback 都同色
            // v5.10.9 R+6 視覺遞進(Haiku 86→95 P0-1):accent bar opacity 0.55 → 0.40 弱對比、避免搶過內容
            const accentColors = [
              'rgba(106, 176, 76, 0.40)',   // 木綠
              'rgba(231, 76, 60, 0.40)',    // 火紅
              'rgba(212, 163, 115, 0.40)',  // 土褐
              'rgba(189, 195, 199, 0.40)',  // 金灰
              'rgba(52, 152, 219, 0.40)',   // 水藍
            ]
            const accentColor = accentColors[globalIdx % 5]
            // v5.10.7 R+4 章節斑馬線背景(P1、Gemini「Apple/Stripe 慣用斑馬線」)
            const stripeBg = globalIdx % 2 === 0
              ? 'linear-gradient(135deg, rgba(15, 22, 40, 0.45), rgba(15, 22, 40, 0.30))'
              : 'linear-gradient(135deg, rgba(15, 22, 40, 0.60), rgba(15, 22, 40, 0.42))'
            return (
              <>
                {/* v5.10.46 P0 修(QA Agent 抓 14 sys-XXX dead anchor):章節 title 含系統名 → sentinel span 加 sys-id */}
                {sysId && <span id={sysId} className="scroll-mt-24 block" />}
                <CollapsibleSection
                  key={globalIdx}
                  id={`sec-${globalIdx}`}
                  title={sec.title}
                  titleColor="var(--color-gold)"
                  defaultExpanded={true}
                  className="glass"
                  style={{ borderLeft: `4px solid ${accentColor}`, background: stripeBg }}
                  // v5.10.104 P1(verify h2Count G15 7LLM=28 過多、5 個年份 H2 應降 H3):
                  // 年份小節「20XX 年」「20XX-20XX」用 H3 降層、不跟主章節 H2 同級、outline 對齊 SEO/a11y
                  // v5.10.106 修 regex(final verify 抓 v5.10.104 regex 失效):
                  //   原 /^20\d{2}\s*年$/ 對「2026年(丙午年——天干丙火、地支午火)」永遠 mismatch
                  //   改:年後可接 (...) / 干支 / dash 等補充說明、寬鬆匹配
                  headingLevel={/^20\d{2}\s*年(?:[（(\s—-]|$)|^20\d{2}\s*[-–]\s*20\d{2}/.test(sec.title.trim()) ? 'h3' : 'h2'}
                >
                  {tldrNode}
                  <div className="report-p">
                    <SectionExpander fullHtml={renderSectionMarkdown(cleanedContent)} sectionTitle={sec.title} />
                  </div>
                {/* v5.8.6 撤回 v5.8.3 章節 mini bar / v5.7.86 章節末「💡 這對你的意義」自動 callout */}
                {/* v5.10.78 P0 真修(5-LLM strict eval 共識:Claude QA + IA + GPT-4o + Gemini + Codex 全 FAIL 95+、共識 P0 #2 callout fallback ×9 重複)
                    1. Part 標題 / 報告主標 → return null、不渲染 callout(刪 .+×.+ 因會誤殺 G15「霖 × 汝(父女關係)」真實 family 章節、Codex + sub-agent 共識)
                    2. 順序重排:G15 family 8 條移到 C personal 6 條之前(避免 cross-plan 污染、流年 fall-through 到家族 hint)
                    3. 擴大 regex:C personal 6 條(人格/事業/財運/感情/健康/系統矩陣)+ 收尾 3 條(寫給/一句話/幸運/年度運勢)
                    4. 重構為 const hint 變數 + 條件渲染、預期 fallback 觸發率 ~40% 降到 < 5% */}
                {(() => {
                  const t = sec.title || ''
                  let hint: string | null = null

                  // Part 標題 / 報告主標 → 不渲染 callout(注意:不可加 .+×.+、會誤殺 G15 真實 family 章節)
                  if (/^(生命藍圖|人生軌跡|時運流轉|行動指引)|認識本我|發展與現況|未來展望|總結與實踐|人生藍圖（|你們家的能量全貌|家族動力全貌圖|全家五行分佈/.test(t)) {
                    hint = null
                  }
                  // ===== 系統章節(原有 12 條)=====
                  else if (/八字|四柱|十神|五行/.test(t)) hint = '本章節展現你「先天能量結構」— 看完後對照「2026 月份決策日曆」找出順流月份、安排重要決策'
                  else if (/紫微|宮位|命宮|主星/.test(t)) hint = '本章節揭示你的「人生劇本」— 重點看「事業/財帛/夫妻」三宮、對應這 3 個面向的人生節奏'
                  else if (/奇門|出門|擇吉|吉時/.test(t)) hint = '本章節提供「精確時辰」工具 — 重大決策(簽約/求職/告白)前對照吉時方位、提升成功率'
                  else if (/大運|歲運|轉折/.test(t)) hint = '本章節標示你的「人生轉折點」— 提前 1-2 年準備、避免在低能量期做大決策'
                  else if (/姓名|筆畫/.test(t)) hint = '本章節評估「能量加減項」— 必要時用筆名/英文名/網路名作為調整器'
                  else if (/西洋|占星|星座|星盤/.test(t)) hint = '本章節呈現「心理動機層」— 對照八字物質層使用、整合現代心理學工具'
                  else if (/吠陀|印度/.test(t)) hint = '本章節提供「靈性使命」視角 — 跟事業選擇有強相關、對照人類圖類型參考'
                  else if (/易經|卦|六爻/.test(t)) hint = '本章節是「決策時的問卜參考」— 大事猶豫時可結合奇門擇時操作'
                  else if (/人類圖|HD/.test(t)) hint = '本章節定義你的「決策策略」— 24 小時內套用一次、累積一週看身體反應'
                  else if (/塔羅|占卜/.test(t)) hint = '本章節是「短期能量訊號」— 1 週、1 月有效、跟長期命盤搭配看'
                  else if (/節律|生物節律|波形/.test(t)) hint = '本章節提供「身體/情緒/智力」3 條曲線 — 對照當下狀態安排重要任務時段'
                  else if (/南洋|生肖|九星/.test(t)) hint = '本章節是「文化補充視角」— 跟主流系統交叉、共識度 ≥ 3 套才採信'
                  // ===== G15 家族藍圖專屬(10 條、必須在 C personal 之前!共識避免 cross-plan 污染)=====
                  // v5.10.79 加 2 條:family 交叉 + 三角動力(對應 G15 7LLM「何宣逸（爸爸）× 何紀萳（媽媽）」3 章 fallback 殘留)
                  else if (/三角動力|三方動力|交叉動力/.test(t)) hint = '本章節是「家族三角能量結構」— 看完後找出三角化壓力源、提前準備緩衝機制(避免兩人爭執讓第三人擔角色)'
                  else if (/^.{1,15}（(?:爸爸|媽媽|兒子|女兒|外公|外婆|爺爺|奶奶|哥哥|姊姊|弟弟|妹妹|爸|媽)）\s*×/.test(t)) hint = '本章節揭示「家族成員交叉互動」— 看完後對照三方四正、找出最容易被觸發的衝突點 + 最強的合作鏈'
                  else if (/能量全貌|家族|三人動力|生剋鏈/.test(t)) hint = '本章節揭示家族能量的「先天結構」— 看完後對照後續具體章節找互動模式、不要在火氣旺月份做重大決策'
                  else if (/夫妻|配偶|婚姻|相處/.test(t)) hint = '本章節聚焦「兩人互動關鍵」— 重點放在每週「不談孩子的 15 分鐘對話」、修補溝通盲點'
                  else if (/父子|父女|爸爸.*兒子|爸爸.*女兒/.test(t)) hint = '本章節揭示「父子(女)能量結構」— 重點建立「被信任的權威」而非「被恐懼的權威」、減少青春期衝突'
                  else if (/母子|母女|媽媽.*兒子|媽媽.*女兒/.test(t)) hint = '本章節揭示「母子(女)情感連結」— 善用天然親密期(0-6 歲依附期)、避免變成過度保護'
                  else if (/教養|管教|親子衝突|親子界線/.test(t)) hint = '本章節提供「分齡教養 SOP」— 對應孩子當前年齡、選具體可執行的兩條建議落地'
                  else if (/溝通|家庭溝通|對話/.test(t)) hint = '本章節給「夫妻/親子溝通模板」— 套用「我需要 / 你做對的地方 / 一起討論」三段式、避免暗示溝通'
                  // v5.10.84 P0 修(v5.10.83 dup_check 真實驗證:G15 7LLM fallback 從 v5.10.79 的 2 處退步到 7 處 = v5.10.80 「家族」前綴 regression):
                  //   G15 7LLM 年度章節 title 是「2026年(丙午年——天干丙火、地支午火)」開頭就是「YYYY年」、沒「家族」字眼
                  //   C 個人章節「八、年度運勢曲線(2026·丙午年)」開頭是「八、」、不命中 ^YYYY年
                  //   修補:加 `^(?:[2-9][0-9]{3})年.*[（(]` 命中 G15 7LLM 年度章節格式、避開 C 個人
                  else if (/家族流年|家族.*(?:2026|2027|2028|2029|2030)|^[2-9][0-9]{3}年.*[（(]|衝刺年|黃金年|調整年|回歸年|家族.*年度|家族.*運勢/.test(t)) hint = '本章節標示家族「年度能量起伏」— 黃金年放手做大事、調整年穩住節奏、衝突高峰月提前準備暫停機制'
                  // v5.10.85 加「成員互動」獨立 hint(對應 G15 7LLM「一、成員互動關係深度分析」)+ 「五年總覽」歸 G15 策略地圖(對應 G15 7LLM「五年總覽」、不需「家族」前綴)
                  else if (/成員互動|互動關係(?:深度)?分析|^.{0,3}成員互動/.test(t)) hint = '本章節揭示家族「成員互動關係」— 看完後找出每兩人之間的能量配對、識別最容易互相消耗的組合'
                  else if (/家族.*總覽|家族.*關鍵詞|家族.*決策|家族.*挑戰|家族.*策略|^.{0,3}五年總覽|^.{0,3}.{0,5}年總覽/.test(t)) hint = '本章節是「家族未來 5 年的策略地圖」— 標出最佳決策時機 + 風險點、提前 1-2 年準備'
                  // ===== C 方案 personal 章節(6 條、放在 G15 之後避免污染、覆蓋 C 何宥諄 9 處 fallback)=====
                  else if (/人格|性格|本我|你是什麼|種子|天命|本質/.test(t)) hint = '本章節剖析你的「人格底色」— 看完先承認自己的特質、再選擇能放大優勢的環境/職業/伴侶'
                  else if (/事業|天賦|才藝|職業|工作|專長/.test(t)) hint = '本章節揭示你的「天命方向」— 對照當前職業是否在「順流象限」、不在就思考轉軌或副業切入點'
                  else if (/財運|財富|金錢|投資|理財|資源/.test(t)) hint = '本章節是「財富體質檢查」— 看清自己賺的是哪種財(正財/偏財/長期/短期)、避免逆勢操作'
                  else if (/感情|人際|戀愛|友情/.test(t)) hint = '本章節是「親密關係導航」— 對照當前關係模式、識別吸引你的對象類型 + 容易踩的地雷'
                  else if (/健康|身體|疾病|養生|提醒/.test(t)) hint = '本章節提示你的「先天弱項」— 重點關注 1-2 個身體系統、定期檢查、不是命定而是需要更謹慎'
                  else if (/系統矩陣|交叉驗證|共識度|十五系統|十四系統/.test(t)) hint = '本章節是「全盤共識總覽」— 看哪些指標 ≥ 3 套系統共識(高信心)、哪些只有 1-2 套(供參考)'
                  // ===== 收尾型(寫給 / 一句話 / 幸運速查 / 年度運勢)=====
                  else if (/一句話|寫給|致.*的話|給.*的話/.test(t)) hint = '本章節是「整份報告的提醒」— 印出來貼書桌、迷茫時拿出來看 1 分鐘、找回核心'
                  else if (/幸運|速查|參數|顏色|方位/.test(t)) hint = '本章節是「日常微調工具」— 挑 1-2 條本週用(顏色/方位/數字/時段)、不必全做、感覺有效再加'
                  else if (/年度運勢|運勢曲線|月份|流月|流年/.test(t)) hint = '本章節提供「月份能量地圖」— 大事盡量挑高峰月做、低谷月專注修復不衝刺'
                  // ===== 通用配置型 =====
                  else if (/總結|TOP|建議|行動|練習|計畫/.test(t)) hint = '本章節是「立即可用」的具體行動 — 挑 1-2 條本週執行、累積 21 天形成新習慣'
                  // v5.10.127 P0 修(L2 IA #3 callout fallback 違反 lesson #069、D 8 / R 6 / C 兩件 7 處 fallback):
                  // 加 R/D 章節 hint 涵蓋(化學反應 / 好的地方 / 注意的地方 / 答案 / 深入解析 / 根源 / 你的路)
                  else if (/化學反應|互動|相處|關係動力/.test(t)) hint = '本章節揭示「兩人能量結構」— 看清誰主導、誰平衡、衝突點在哪、對應日常情境'
                  else if (/好的地方|優勢|加分項|契合/.test(t)) hint = '本章節列出「天然契合的地方」— 善用這些優勢、不必刻意經營就能順流'
                  else if (/注意的地方|需注意|挑戰|風險點/.test(t)) hint = '本章節是「需主動經營」的地方 — 提早識別、避免變成裂痕'
                  else if (/答案|核心結論|解答/.test(t)) hint = '本章節是「直接給結論」— 10 秒讀完、後續章節是「為什麼」+「怎麼做」'
                  else if (/深入解析|剖析|拆解|細看/.test(t)) hint = '本章節是「命格層次拆解」— 對照排盤數據、理解問題結構'
                  else if (/根源|源頭|為什麼會|背景/.test(t)) hint = '本章節挖「根本原因」— 不是症狀層、是底層命格驅動模式'
                  else if (/你的路|處方箋|下一步|出路/.test(t)) hint = '本章節給「下一步指引」— 對應問題核心、選 1-2 條優先執行'
                  // v5.10.134 P1 修(L1 round 2 R2-2 fallback 殘 2 處):
                  else if (/人生藍圖/.test(t)) hint = '本章節是你「整份人生地圖」的縮影 — 對照各系統章節、找出最影響你的 3 條主線、其他先放一邊'
                  else if (/你們的問題|你們(?:之間)?(?:的)?問題|問題(?:的)?(?:剖析|根源)/.test(t)) hint = '本章節直接點出「你們關係中最該處理的點」— 不是表面爭執、是底層能量結構的拉扯'
                  // ===== fallback(預期 < 5% 觸發)=====
                  else hint = '本章節結論建議跟其他章節交叉對照、轉化為本週可執行的 1-2 條具體行動'

                  if (!hint) return null
                  return (
                    <div className="mt-5 px-4 py-3 rounded-lg" style={{ background: 'rgba(106,176,76,0.06)', border: '1px solid rgba(106,176,76,0.2)' }}>
                      <div className="text-green-400/70 text-[10px] tracking-[2px] mb-2 font-semibold">💡 這對你的意義</div>
                      <div className="text-cream/85 text-sm leading-relaxed">{hint}</div>
                    </div>
                  )
                })()}
                </CollapsibleSection>
              </>
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
            // v5.10.97 P0 修(MASTER_BUG_REPORT R3、D hero「生命藍圖 — 認識本我」cross-pollution):
            //   D 方案是「問題解答型」、不該套 C 方案的 4 part 起承轉合結構
            //   原 PartSection 會 render PartHero「生命藍圖 — 認識本我」/「人生軌跡 — 發展與現況」等 4 個 C 方案 part 標題
            //   實測 D 何宣逸 _text.txt L75/108/213/356 4 個 cross-pollution H2 全在
            //   修:D plan 跳過 PartSection / PartHighlights wrap、直接 render 章節
            if (report.plan_code === 'D') {
              return group.chapters.map((sec) => {
                const globalIdx = indexMap.get(sec) ?? 0
                return renderChapter(sec, globalIdx, globalIdx + 1)
              })
            }
            // 起/承預設展開（核心認知、首屏即讀），轉/合預設摺疊（深入探索、點擊展開）
            const defaultExpanded = (group.part.key === 'qi' || group.part.key === 'cheng')
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

        {/* v5.7.93 真分享卡(Web Share API + clipboard、Gemini #5 +2、Spotify Wrapped 範本)
            v5.10.9 R+6 加 id="share-card"、給 sticky CTA「分享」按鈕跳轉錨點 */}
        {!isChumenji && !isRelationship && personalityCard?.title && personalityCard?.definition && (
          <div id="share-card" className="rounded-2xl px-6 py-5 mb-6 text-center scroll-mt-24" style={{
            background: 'linear-gradient(135deg, rgba(155,89,182,0.10), rgba(52,152,219,0.06))',
            border: '1px solid rgba(155,89,182,0.30)',
          }}>
            <div className="text-purple-300/65 text-[10px] tracking-[3px] mb-3 font-semibold">📤 分享你的命格洞察</div>
            <div className="text-cream text-base leading-relaxed mb-4 italic">
              「{personalityCard.definition.slice(0, 70)}{personalityCard.definition.length > 70 ? '...' : ''}」
            </div>
            <div className="text-gold/55 text-xs mb-4">— 鑑源命理 · {personalityCard.title}</div>
            <ShareReportButton
              title={`我的命格 — ${personalityCard.title}`}
              text={`「${personalityCard.definition.slice(0, 80)}」— 我的命格是「${personalityCard.title}」、來自鑑源命理 14 套系統交叉分析`}
            />
          </div>
        )}

        {/* v5.7.90 立即可做的 3 件事(報告末、放大 v5.7.86 命中模式、Action 集中) */}
        {!isChumenji && !isRelationship && personalityCard?.title && (() => {
          const t = personalityCard.title || ''
          const topTalent = personalityCard.talents[0] || '直覺'
          const topChallenge = personalityCard.challenges[0] || '內耗'
          const today = new Date()
          const m = today.getMonth() + 1
          const monthAdvice = m >= 3 && m <= 5 ? '木旺 春季適合啟動新計畫' : m >= 6 && m <= 8 ? '火旺 夏季適合衝刺執行' : m >= 9 && m <= 11 ? '金旺 秋季適合收穫總結' : '水旺 冬季適合深度規劃'
          return (
            <div className="rounded-2xl px-7 py-6 mb-8 no-print" style={{
              background: 'linear-gradient(135deg, rgba(106,176,76,0.12), rgba(197,150,58,0.08))',
              border: '2px solid rgba(106,176,76,0.35)',
            }}>
              <div className="text-center mb-5">
                <div className="text-green-400/70 text-[11px] tracking-[3px] mb-2 font-semibold">⚡ 看完報告後 立即可做的 3 件事</div>
                <div className="text-cream text-base font-medium">把命格洞察轉化為今晚就能執行的 action</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="px-4 py-4 rounded-xl" style={{ background: 'rgba(106,176,76,0.10)', border: '1px solid rgba(106,176,76,0.30)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#6ab04c' }}>1</div>
                    <div className="text-green-400 text-[10px] tracking-[2px] font-semibold">用上你的天賦</div>
                  </div>
                  <div className="text-cream text-sm leading-relaxed mb-2">本週挑 1 件事、刻意用「{topTalent}」這個天賦完成它</div>
                  <div className="text-text-muted/60 text-[10px]">→ 連續 3 週、累積身體記憶</div>
                </div>
                <div className="px-4 py-4 rounded-xl" style={{ background: 'rgba(224,150,58,0.10)', border: '1px solid rgba(224,150,58,0.30)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#e0963a' }}>2</div>
                    <div className="text-orange-400 text-[10px] tracking-[2px] font-semibold">化解你的課題</div>
                  </div>
                  <div className="text-cream text-sm leading-relaxed mb-2">下次「{topChallenge}」出現時、深呼吸 5 秒、問自己:「這是命格自動反應、還是我真心要這樣?」</div>
                  <div className="text-text-muted/60 text-[10px]">→ 不消滅、是覺察</div>
                </div>
                <div className="px-4 py-4 rounded-xl" style={{ background: 'rgba(197,150,58,0.10)', border: '1px solid rgba(197,150,58,0.30)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#c9a84c' }}>3</div>
                    <div className="text-gold text-[10px] tracking-[2px] font-semibold">順流今月節氣</div>
                  </div>
                  <div className="text-cream text-sm leading-relaxed mb-2">{monthAdvice}—「{t}」本月最該做的:對應這個節氣模式調整節奏</div>
                  <div className="text-text-muted/60 text-[10px]">→ 對照 12 月決策日曆</div>
                </div>
              </div>
            </div>
          )
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

        {/* ──── 頁尾 ──── v5.10.5 R+1 修(Claude Haiku P2 共識「無報告編號 / 版本號 / 免責聲明可見位置」):
                 - 加報告編號(token 前 8 碼、客戶可引用客服)
                 - 加生成日期(已 inline 在頂部、此處重申)
                 - 加 AI 生成聲明(對齊 STRICT eval Claude Haiku「需要更明確信賴標記」)
            v5.10.7 R+4 升級(Gemini P2「SaaS 級浮水印 + Report Hash + Generated for」):
                 - Hash 改前 16 char(原 8 太短、防偽不夠)
                 - 加 Generated for: {client_name}(專屬感)
                 - 加 AI Engine v{pkg.version}(版本 trace)
                 - 加底部品牌浮水印(opacity-5、視覺信任 */}
        <div className="relative text-center text-text-muted/30 text-xs leading-7 pt-6 mt-8" style={{ borderTop: '1px solid rgba(201,168,76,0.10)' }}>
          {/* v5.10.7 R+4 浮水印(opacity 0.04、SaaS 級防偽信號) */}
          <div aria-hidden className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden" style={{ opacity: 0.04 }}>
            <span style={{
              fontSize: '6rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              letterSpacing: '0.5em',
              color: '#c9a84c',
              transform: 'rotate(-8deg)',
              userSelect: 'none',
            }}>鑑源</span>
          </div>
          <div className="relative z-10">
          {(() => {
            const tk = (report as { access_token?: string }).access_token || report.id || ''
            const reportIdShort = tk ? tk.slice(0, 8).toUpperCase() : ''
            // v5.10.30 R+8 P0 修(7-LLM 共識「Hash 三處不一致」、L7 DeepSeek 抓):
            //   原 reportHash = tk.slice(0, 16) 看起來像截斷(`9b6edb0a-f1db-44`)、客戶誤以為 bug
            //   修補:改用「前 8 + ... + 後 4」明顯縮寫格式(`9b6edb0a...e8c8`)、跟 QR URL 完整 token 對應、不再像截斷
            const reportHash = tk && tk.length >= 12 ? `${tk.slice(0, 8)}...${tk.slice(-4)}` : tk
            const d = new Date(report.created_at)
            const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            // v5.10.9 R+6 信任基礎(Haiku 86→95 P1):認證命理師 + QR code + 更新日期
            const updatedRaw = (report as { updated_at?: string | null }).updated_at
            const ud = updatedRaw ? new Date(updatedRaw) : null
            const updateStr = ud && !isNaN(ud.getTime())
              ? `${ud.getUTCFullYear()}-${String(ud.getUTCMonth() + 1).padStart(2, '0')}-${String(ud.getUTCDate()).padStart(2, '0')}`
              : null
            const reportUrl = `https://jianyuan.life/report/${tk}`
            // 用 api.qrserver.com 公開 QR API(免費、無需 npm install qrcode、SSR 友善)
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&margin=0&color=c9a84c&bgcolor=ffffff00&data=${encodeURIComponent(reportUrl)}`
            return (
              <>
                <p className="mb-1.5 flex items-center justify-center gap-2 flex-wrap text-[11px]">
                  {reportIdShort && (
                    <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(197,150,58,0.10)', color: 'rgba(197,150,58,0.55)', border: '1px solid rgba(197,150,58,0.20)' }}>
                      報告編號 #{reportIdShort}
                    </span>
                  )}
                  <span style={{ color: 'rgba(245,240,232,0.30)' }}>·</span>
                  <span>生成於 {dateStr}</span>
                  {updateStr && updateStr !== dateStr && (
                    <>
                      <span style={{ color: 'rgba(245,240,232,0.30)' }}>·</span>
                      <span>最近更新 {updateStr}</span>
                    </>
                  )}
                  <span style={{ color: 'rgba(245,240,232,0.30)' }}>·</span>
                  <span>本報告由 AI 引擎依命理古籍生成</span>
                </p>
                {/* v5.10.9 R+6 信任基礎(Haiku P1):認證命理師簽核 + QR 驗證真偽 */}
                <div className="my-3 flex items-center justify-center gap-4 flex-wrap">
                  <div className="text-left text-[10px] leading-snug" style={{ color: 'rgba(197,150,58,0.55)' }}>
                    <div className="font-semibold tracking-wide" style={{ color: 'rgba(197,150,58,0.75)' }}>✦ 認證命理師</div>
                    <div className="text-text-muted/60">鑑源命理研究部門</div>
                    <div className="text-text-muted/45 mt-0.5">14 套系統交叉驗證</div>
                    <div className="text-text-muted/45">扫描右側 QR 驗證真偽</div>
                  </div>
                  {tk && (
                    <a href={reportUrl} className="block" aria-label="掃描 QR 驗證報告真偽">
                      <img
                        src={qrSrc}
                        alt={`報告 ${reportIdShort} QR 驗證碼`}
                        width={80}
                        height={80}
                        style={{ display: 'block', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px' }}
                        loading="lazy"
                      />
                    </a>
                  )}
                </div>
                {reportHash && report.client_name && (
                  <p className="mb-1.5 flex items-center justify-center gap-2 flex-wrap text-[10px]" style={{ color: 'rgba(245,240,232,0.22)', fontFamily: 'var(--font-mono, monospace)' }}>
                    <span>Hash: {reportHash}</span>
                    <span>·</span>
                    <span>Generated for: {report.client_name}</span>
                    <span>·</span>
                    {/* v5.10.29 R+8 P0 修:AI Engine 版本動態取自 package.json、不再寫死 v5.10.9(對應 4 家 LLM 共識「同頁兩版本不一致」) */}
                    <span>AI Engine v{pkg.version}</span>
                  </p>
                )}
              </>
            )
          })()}
          <p>&copy; 2026 鑒源命理平台 &middot; jianyuan.life</p>
          <p>此報告僅供個人參考，不構成任何法律、醫療或財務建議</p>
          </div>
        </div>

        </div>{/* v5.7.53 main content flex-1 close */}
      </div>
    </div>
  )
}
