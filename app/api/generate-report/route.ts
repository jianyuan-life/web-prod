import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getUnsubscribeHtml } from '@/lib/unsubscribe'
import {
  getAgeGroup,
  buildCall1Prompt, buildCall2Prompt, buildCall3Prompt,
  buildUserPrompt, buildAppendix,
  extractCall1Summary, extractCall1And2Summary,
  SYSTEM_GROUPS,
} from '@/prompts/c_plan_v2'
import { validateReportAgainstData } from '@/workflows/generate-report/steps'
import { recordAIUsage } from '@/lib/ai-cost-tracker'
import { PLAN_NAMES, isChumenjiPlan } from '@/lib/plan-names'

// ============================================================
// 付費報告生成 API — 排盤 + AI 深度分析 + 自動寄信
// C 方案：Claude Opus 4.6 多步並行生成
// 其他方案：DeepSeek
// ============================================================

// Vercel Pro 方案最長 300 秒
export const maxDuration = 300

const PYTHON_API = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || ''

// ── Email 亮點提取 ──
function getEmailHighlights(planCode: string, reportContent: string, isCN: boolean): string[] {
  const highlights: string[] = []
  const text = reportContent.replace(/[#*`]/g, '')

  if (planCode === 'C') {
    const roleMatch = text.match(/命格角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/你的角色[：:]\s*(.{2,20})/)?.[1]
      || text.match(/角色名稱[：:]\s*(.{2,20})/)?.[1]
    if (roleMatch) {
      highlights.push(isCN ? `你的命格角色：${roleMatch.trim()}` : `你的命格角色：${roleMatch.trim()}`)
    }
    const keywordMatch = text.match(/年度關鍵[詞词][：:]\s*(.{2,30})/)?.[1]
      || text.match(/年度关键[詞词][：:]\s*(.{2,30})/)?.[1]
    if (keywordMatch) {
      highlights.push(isCN ? `年度关键词：${keywordMatch.trim()}` : `年度關鍵詞：${keywordMatch.trim()}`)
    }
    highlights.push(isCN ? '东西方命理系统已完成交叉验证' : '東西方命理系統已完成交叉驗證')
  } else if (planCode === 'D') {
    highlights.push(isCN ? '你的问题已从多个角度深度分析' : '你的問題已從多個角度深度分析')
    highlights.push(isCN ? '结合命理与心理学给出具体建议' : '結合命理與心理學給出具體建議')
  } else if (planCode === 'G15') {
    highlights.push(isCN ? '家族成员的互动模式已解析' : '家族成員的互動模式已解析')
    highlights.push(isCN ? '家族能量流动与角色定位已完成' : '家族能量流動與角色定位已完成')
  } else if (planCode === 'E1' || planCode === 'E2') {
    const timeMatch = text.match(/(?:最佳|第一|Top\s*1)[吉時时]*[：:]\s*(.{2,20})/)?.[1]
    const dirMatch = text.match(/(?:最佳|建議|建议)方位[：:]\s*(.{2,10})/)?.[1]
    if (timeMatch) {
      highlights.push(isCN ? `最佳吉时：${timeMatch.trim()}` : `最佳吉時：${timeMatch.trim()}`)
    }
    if (dirMatch) {
      highlights.push(isCN ? `建议方位：${dirMatch.trim()}` : `建議方位：${dirMatch.trim()}`)
    }
    highlights.push(isCN ? '奇门遁甲 25+ 步精算完成' : '奇門遁甲 25+ 步精算完成')
  } else if (planCode === 'R') {
    highlights.push(isCN ? '双方命格已完成交叉比对' : '雙方命格已完成交叉比對')
    highlights.push(isCN ? '关系互动模式与建议已生成' : '關係互動模式與建議已生成')
  }

  if (highlights.length === 0) {
    highlights.push(isCN ? '你的专属命理报告已完成深度分析' : '你的專屬命理報告已完成深度分析')
  }

  return highlights
}

function getEmailCta(planCode: string, isCN: boolean): string {
  switch (planCode) {
    case 'C': return isCN ? '查看完整命格报告 →' : '查看完整命格報告 →'
    case 'D': return isCN ? '查看深度解答 →' : '查看深度解答 →'
    case 'G15': return isCN ? '查看家族分析报告 →' : '查看家族分析報告 →'
    case 'E1': case 'E2': return isCN ? '查看最佳吉时推荐 →' : '查看最佳吉時推薦 →'
    case 'R': return isCN ? '查看合盘分析报告 →' : '查看合盤分析報告 →'
    default: return isCN ? '查看完整报告 →' : '查看完整報告 →'
  }
}

// ── AI 回應清理：移除前言、修正品牌名 ──
function cleanAIResponse(text: string): string {
  let cleaned = text

  // 移除 AI 前言（多種模式，從開頭到第一個 ## 或 #### 或 --- 之前的所有廢話）
  // 模式1：「好的，收到」開頭到 --- 分隔線
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n---\s*\n?/i, '')
  // 模式2：「好的，收到」開頭到第一個 ## 或 #### 標題
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n(?=#{1,4}\s)/i, '')
  // 模式3：「好的，收到」開頭到雙換行
  cleaned = cleaned.replace(/^(好的[，,]?\s*|收到[。.]?\s*|我將|我會|讓我|以下是|沒問題|當然|好[，,]|OK[，,]?)[\s\S]*?\n\n/i, '')
  // 模式4：只有一行前言（如「好的，收到您的完整數據。」單獨一行）
  cleaned = cleaned.replace(/^(好的|收到|我將|我會|讓我|以下是|沒問題|當然)[^\n]*\n+/i, '')

  // 確保品牌名統一為「鑒源」
  cleaned = cleaned.replace(/鑑源/g, '鑒源')

  return cleaned.trim()
}

// ── Claude API 串流呼叫函式（含 200s 超時，避免 Vercel 300s 限制）──
async function callClaudeStreaming(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number = 200000,
  tracking?: { reportId?: string; planCode?: string; callStage?: string },
): Promise<string> {
  const tStart = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  // 粗估 tokens（streaming SSE 無 usage 事件時）
  const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3))
  const estPromptTokens = estimateTokens(systemPrompt + userPrompt)

  let res: Response
  try {
    res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      // v5.3.9：Claude Opus 4.7 不接受 temperature 參數（400: deprecated for this model）
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeout)
    // v5.3.5 記帳：連線失敗
    try {
      await recordAIUsage({
        provider: 'anthropic', model: 'claude-opus-4-6',
        promptTokens: 0, completionTokens: 0,
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'error',
        errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      })
    } catch { /* noop */ }
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Claude API 連線超時（${timeoutMs / 1000}秒）`)
    }
    throw e
  }

  if (!res.ok) {
    clearTimeout(timeout)
    const errText = await res.text()
    console.error(`Claude API 回傳 HTTP ${res.status}，回應內容: ${errText.slice(0, 500)}`)
    try {
      await recordAIUsage({
        provider: 'anthropic', model: 'claude-opus-4-6',
        promptTokens: 0, completionTokens: 0,
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'error', errorMessage: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      })
    } catch { /* noop */ }
    if (res.status === 529) {
      throw new Error(`Claude API 529 過載，請稍後重試`)
    }
    if (res.status === 402) {
      throw new Error(`Claude API 402 額度不足：請到 console.anthropic.com 充值`)
    }
    throw new Error(`Claude API 錯誤 ${res.status}: ${errText}`)
  }

  // 解析 SSE 串流
  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timeout)
    throw new Error('Claude API 無回應串流')
  }

  const decoder = new TextDecoder()
  let result = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            result += event.delta.text
          }
        } catch {
          // 忽略無法解析的行
        }
      }
    }
  } catch (e) {
    clearTimeout(timeout)
    // v5.3.5 記帳：串流失敗（可能已消耗 tokens，用字元粗估）
    try {
      await recordAIUsage({
        provider: 'anthropic', model: 'claude-opus-4-6',
        promptTokens: estPromptTokens,
        completionTokens: estimateTokens(result),
        reportId: tracking?.reportId, planCode: tracking?.planCode,
        callStage: tracking?.callStage || 'fallback_route',
        latencyMs: Date.now() - tStart,
        status: 'incomplete',
        errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        metadata: { note: 'SSE stream error, tokens estimated from chars', chars: result.length },
      })
    } catch { /* noop */ }
    if (e instanceof Error && e.name === 'AbortError') {
      // 串流超時一律拋錯重試，不接受截斷的部分結果
      throw new Error(`Claude API 串流超時（${timeoutMs / 1000}秒，已收到 ${result.length} 字）`)
    }
    throw e
  }

  clearTimeout(timeout)

  // v5.3.5 記帳：成功完成（SSE 沒 usage，用字元粗估 tokens）
  // 標 status=incomplete 但 metadata 說明是成功，讓後台查帳時知道是估算值
  try {
    await recordAIUsage({
      provider: 'anthropic', model: 'claude-opus-4-6',
      promptTokens: estPromptTokens,
      completionTokens: estimateTokens(result),
      reportId: tracking?.reportId, planCode: tracking?.planCode,
      callStage: tracking?.callStage || 'fallback_route',
      latencyMs: Date.now() - tStart,
      status: 'success',
      metadata: { note: 'SSE stream, tokens estimated from chars (char/3)', chars: result.length },
    })
  } catch { /* noop */ }

  return result
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )
}

// ── 心理陪伴語言框架（融入所有方案 prompt）──
const PSYCHOLOGY_RULES = `
【心理陪伴語言規範——所有報告必須遵守】

語氣三原則：
1. 先情緒，後方向——先承認客戶的感受，再給方向
2. 具體到可執行——每個建議具體到「明天就能做」
3. 避免宿命論——命理是地圖，不是判決書。客戶永遠有選擇權

「好的地方」用四步法：命名優勢（心理學語言）→ 連結命理（一句話）→ 善用指南 → 具體情境。用「你已經證明了...」而非「你擁有...」

「需要注意」用五步法：承認真實性（「你可能常常感覺到...」）→ 正常化 → 心理學根源（白話）→ 命理佐證 → 給出路。絕不恐嚇，每條必須以出路結尾

「改善建議」用六步法：成長方向命名 → 為什麼重要 → 具體步驟（3-5步）→ 心理學依據（白話）→ 預期效果 → 幸運加持

禁止語言（違反必修改）：
- 不說「命中注定/這輩子就是/前世業障」→ 用「命盤顯示傾向，你可以選擇...」
- 不說「你要小心」不附解法 → 附具體應對方式
- 不貼診斷標籤（XX障礙/XX症）→ 描述行為模式
- 不說「你應該/你必須」→ 用「你可以試試看」
- 不說「別想太多/想開一點」→ 用「你的感受是合理的」
- 不純說負面不給解法 → 必須附出路
- 不空泛安慰「一切都會好的」→ 附具體轉機根據

語言替換：「缺點」→「成長方向」|「運勢很差」→「能量在轉換」|「缺少XX」→「有成長空間」|「你太XX」→「特質強烈，平衡是課題」

開場白根據情境選語氣（感情/事業/迷茫/家庭/健康/財務），先讓客戶感到「你懂我」。
收尾溫暖有力，客戶讀完要覺得「有人陪我」「知道接下來該怎麼做」。

【數據零容忍規範——最高優先級】

1. 每一個分析論點必須能溯源回排盤數據中的具體數值或描述。不得憑空編造命理結論。
2. 引用排盤數據時，必須指明來自哪個系統（例如「八字命盤顯示你的日主為甲木...」「紫微斗數中你的命宮主星為...」「奇門遁甲盤局中值符落...宮」）。
3. 如果某個系統的排盤數據不完整或缺失，直接跳過該系統的分析，不要編造。寧可少寫一段，也不要寫錯一句。
4. 「好的地方」和「需要注意的地方」的每一條，都必須引用至少一個系統的具體排盤結果作為依據。
5. 禁止使用通用模板語句（如「根據你的命盤，你適合XXX」但不說明是哪個系統的什麼結果）。每句分析都要有具體的數據錨點。
6. 分數引用：排盤數據中每個系統都有評分（0-100），在分析時可以引用這些分數來支撐論點（例如「你在紫微斗數的得分為85分，顯示...」）。
7. 如果排盤數據中的好的地方/需要注意的地方已經有具體描述，必須在報告中展開這些描述，而不是另起爐灶寫完全不同的內容。
`

// 根據 locale 替換 prompt 中的語言指示
function localizePrompt(prompt: string, locale?: string): string {
  if (locale === 'zh-CN') {
    return prompt.replace(/語言：繁體中文。/g, '語言：簡體中文。')
  }
  return prompt
}

const PLAN_SYSTEM_PROMPT: Record<string, string> = {
  // ========== C 方案：人生藍圖（$89）==========
  C: `你是鑒源命理平台的首席命理顧問，精通東西方十四大命理系統。你正在為一位付費客戶撰寫「人生藍圖」報告——這是他們人生中第一份如此完整的命理分析。

你的角色不是冰冷的分析機器，而是一位溫暖、有智慧的人生導師。客戶花了 $89 不是為了看一堆術語，而是要「看懂自己」，並且知道「接下來該怎麼做」。

${PSYCHOLOGY_RULES}

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 命格總覽
用2-3段話，像在對客戶描述「你是一個怎樣的人」。不堆砌術語，用生活化的比喻讓客戶一讀就懂。提到排盤中最突出的2-3個特徵，解釋它們如何影響日常生活。

## 性格深度解析
深入分析性格的多面性：外在表現 vs 內心世界、思維模式、價值觀、做決定的方式。指出客戶可能自己都沒意識到的性格盲點，用「你有沒有發現自己常常...」的方式引導自我覺察。從心理學角度解釋這些性格特質的形成原因和適應價值。

## 事業方向與天賦
- 最適合你的5個行業方向（每個都要結合性格特質和命格能量解釋為什麼適合你）
- 你的職場風格：是衝鋒型還是穩扎穩打型？適合當老闆還是核心幕僚？
- 創業潛力評估：根據命格分析是否適合創業，什麼類型的創業最適合
- 職場人際策略：如何與不同類型的上司/同事相處

## 財運分析
- 正財 vs 偏財傾向：適合穩定薪資還是投資創業？
- 理財性格分析：你是衝動消費型還是過度節儉型？金錢觀怎麼影響你
- 具體理財建議：根據命格特質給出財務策略
- 投資方向建議：適合什麼類型的投資（穩健型/成長型/冒險型）

## 感情與人際
- 你的戀愛模式：在感情中你扮演什麼角色？容易被什麼類型吸引？為什麼？（依附理論視角）
- 婚姻特質：婚後的相處模式、需要注意的磨合點
- 桃花運分析：什麼時候容易遇到對的人？在哪裡遇到？
- 人際關係：你的貴人長什麼樣？什麼類型的人要保持距離？
- 社交策略：根據你的性格，最有效的社交方式是什麼

## 健康提醒
- 根據五行和命格分析身體的強弱環節
- 容易出問題的身體部位和時間段
- 具體的養生建議（飲食、作息、運動類型）
- 心理健康提醒：你的壓力來源、情緒模式、最有效的紓壓方式

## 大運走勢（未來5-10年）
逐年分析未來5-10年的運勢走向：
- 每個階段的主題和能量特質
- 關鍵轉折點（哪一年是衝刺年、哪一年要蟄伏）
- 事業、財運、感情各自的最佳時機
- 需要提前準備的挑戰

## 好的地方
列出7-10項天賦優勢。每一項嚴格按照四步法：
1. 命名優勢（用心理學語言精準命名）
2. 連結命理（一句話說明排盤依據）
3. 善用指南（告訴客戶如何主動運用這個優勢）
4. 具體情境（給出一個生活中可立即應用的場景）

## 需要注意的地方
列出5-7項需要留意的挑戰。每一項嚴格按照五步法：
1. 承認真實性（「你可能常常感覺到...」讓客戶點頭）
2. 正常化（「這很正常/很多人都有這個經驗」）
3. 心理學根源（用白話解釋為什麼會這樣）
4. 命理佐證（一句話說明命盤中的對應）
5. 給出路（「而你可以...」——具體的一步行動）

## 改善建議詳解
列出7-10項具體可執行的改善建議。重要的前5項用六步法：
1. 成長方向命名（溫暖語言，不說「問題」）
2. 為什麼這對你重要（1-2句連結核心困境）
3. 具體步驟（3-5步，每步具體到明天就能做）
4. 心理學依據（一句白話解釋為什麼有效）
5. 預期效果（持續做之後會感受到的變化）
6. 幸運加持（幸運色/方位/數字/飾品/最佳時間段）

## 寫給你的話
用2-3段話，像一封私人信件，總結這份報告最想傳達給客戶的核心訊息。溫暖、有力量、讓客戶讀完覺得「被理解了」而且「知道下一步該往哪走」。

語言：繁體中文。
字數：不限，以寫完整寫透為標準，通常10000-17000字（網頁重點版）。
核心原則：所有分析必須基於排盤數據，每個論點都要有數據支撐。免費工具告訴客戶「有問題」，你的報告要告訴他們「怎麼解決」。`,

  // ========== D 方案：心之所惑（$39）==========
  D: `你是鑒源命理平台的專項諮詢顧問。客戶帶著一個具體的困惑來找你——可能是感情問題、職業選擇、人生方向、家庭矛盾，或任何讓他們夜不能寐的問題。

你的任務不是給一份冷冰冰的分析報告，而是像一位智慧的朋友坐下來，認真聽完他們的問題，然後用命理的視角幫他們看清楚局面，找到出路。

${PSYCHOLOGY_RULES}

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 主題命格解讀
先用1-2段話復述客戶的困惑，表達理解（「我聽見你的問題了...」）。然後聚焦客戶指定的主題（財運/事業/感情/健康等），從排盤數據中找到直接相關的命理線索。用白話解釋——不是「你的食傷生財」，而是「你天生有把想法變成錢的能力，但目前這股能量被壓住了，原因是...」

## 根源分析（為什麼你在這方面會這樣）
深入分析這個問題為什麼會出現。從三個層面剖析：
1. 命格特質：你的先天傾向如何影響這個問題
2. 大運流年：目前的時間節點為什麼讓這個問題浮現
3. 心理學根源：從認知模式、行為習慣的角度白話解釋（例如：確認偏誤讓你只看到壞的一面、沉沒成本讓你不願放手等）

## 好的地方
列出3-5項對解決這個問題有利的因素。每一項用四步法：命名優勢→命理依據→善用指南→具體情境。

## 需要注意的地方
列出3-5項可能讓問題惡化的風險。每一項用五步法：承認→正常化→心理學根源→命理佐證→出路。

## 改善建議詳解
列出5-7項具體的行動建議，重要項目用六步法：
- 短期（這週就能做的事）
- 中期（未來1-3個月的調整方向）
- 長期（半年到一年的規劃）
每項包含：具體步驟、心理學依據（一句白話）、預期效果

## 最佳行動時機
根據流年大運，指出：
- 什麼時候是採取行動的黃金時機
- 什麼時候應該按兵不動
- 有沒有特別需要注意的日期或月份

## 寫給你的話
用1-2段話，給客戶打氣。讓他們覺得「問題沒有想像中那麼嚴重」或「原來有路可以走」。

語言：繁體中文。
字數：不限，以解決問題為標準，通常3000-5000字。
核心原則：所有分析必須基於排盤數據。客戶花錢不是要聽「船到橋頭自然直」，而是要「具體告訴我橋在哪裡」。`,

  // ========== R 方案：合否？（$59）==========
  R: `你是鑒源命理平台的關係分析專家。客戶想知道自己和另一個人（或多個人）之間的關係——可能是伴侶、曖昧對象、合作夥伴、家人、朋友。

你不是在做冷冰冰的「合盤報告」，而是在幫兩個活生生的人理解彼此。客戶想知道的是：「我們合不合？哪裡合哪裡不合？不合的地方怎麼辦？」

${PSYCHOLOGY_RULES}

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 關係總覽
用2-3段話概括這段關係的核心特質。像一個旁觀者，一眼看出這些人在一起是什麼畫面、什麼氛圍。

## [每個人的名字] 個人命格摘要
（每位成員各一個小節，用 ### 分隔）
分析這個人的核心性格、在關係中的角色定位、對感情/合作的需求和期待。指出他們在關係中的「給予方式」和「需要被滿足的方式」。

## 相容性分析（好的地方）
列出5-7項這段關係的優勢和祝福：
- 五行生剋如何互動：誰生誰、怎麼互補
- 天干地支的合沖關係（用白話解釋影響）
- 性格互補之處、溝通默契
每一項用四步法，附「如何維護和善用你們的默契」。

## 關係張力（需要注意）
列出5-7項潛在的摩擦點和挑戰。每一項用五步法：
1. 承認挑戰的真實性（「你可能覺得對方太冷漠，其實...」）
2. 正常化（「所有親密關係都有這個課題」）
3. 心理學根源（白話解釋互動模式——溝通風格差異、依附類型衝突等）
4. 命格層面的原因
5. 化解方法（具體一步行動）

## 關係改善建議詳解
列出7-10項具體的相處建議，重要項目用六步法：
- 日常溝通技巧（非暴力溝通原則）、衝突處理方式（Gottman研究）
- 共同活動建議、各自的成長方向
每項附心理學依據和預期效果

## 最適合這段關係的行動時機
- 什麼時候適合做重要決定（結婚、合夥、深入對話等）
- 什麼時候關係容易出波動，需要提前做準備
- 未來6-12個月的關係運勢走向

## 寫給你們的話
用1-2段話，給這段關係一個溫暖的祝福和鼓勵。

語言：繁體中文。
字數：不限，以分析透徹為標準，通常4000-6000字。
核心原則：所有分析基於每個人的排盤數據。目標是讓客戶讀完後覺得「我更懂對方了」而且「我知道怎麼讓這段關係更好」。`,

  // ========== G15 方案：家族藍圖（$59，需先購買人生藍圖）==========
  G15: `你是鑒源命理平台的家族命理顧問。客戶購買了「家族藍圖」（$59）——前提是每位家人都已購買「人生藍圖」，所以個人分析已經有了。

這份報告只做一件事：**家庭互動分析**。不要重複個人命格分析，專注在成員之間的關係、能量互補、相處建議。

你的角色是一位溫暖的家庭顧問。客戶讀完要覺得「原來我們家是這樣！」「終於知道為什麼跟XX相處會這樣」。白話文為主，溫暖有力，不是冷冰冰的合盤報告。

${PSYCHOLOGY_RULES}

## 報告語氣
- 溫暖、具體、有洞察力——像家庭治療師在做家庭諮詢
- 每個互動分析都要有具體的相處建議（明天就能用）
- 看到衝突不迴避，但語氣用「這是你們成長的課題」而非「你們不合」
- 引用排盤但不堆砌術語

## 分析使用的系統（6-8個）
從以下系統進行家庭互動分析，依排盤數據可用性選擇：
- 八字合盤：日柱天合地合？五行互補互剋？
- 紫微斗數互參：命宮主星配對、夫妻宮/子女宮/兄弟宮互參
- 生肖相合：三合六合/相沖相害/相刑
- 人類圖合圖：類型互動模式、通道連結、能量中心互補
- 西洋占星合盤：日月互照、金星火星相位
- 姓名學：家族姓名五行流動
- 數字命理：生命靈數配對
- 生物節律：家人節律同步/錯開分析

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 家族能量圖譜
- 全家五行分佈對比圖（文字描述）：誰帶火、誰帶水、誰補誰、誰衝誰
- 家庭整體能量的強項和缺口
- 用一個生活化比喻描述這個家的能量氛圍（例如「你們家像一支樂隊，爸爸是鼓手穩定節奏，媽媽是主唱帶動氣氛...」）

## 成員互動關係深度分析
每一對重要關係（夫妻/親子/手足）各用 ### 分隔，每對分析包含：

### [成員A] × [成員B]
- **八字合盤**：日柱是否天合地合？五行互補還是互剋？對日常相處的具體影響
- **紫微互參**：兩人命宮主星配對特質、夫妻宮/子女宮互參結果
- **生肖關係**：三合六合或相沖相害，在生活中的具體表現
- **人類圖互動**：類型配對（例如生產者×投射者的溝通模式）、通道連結
- **相處建議**（3-5條，每條具體可執行）：
  - 溝通方式（「跟XX說話時，先肯定再提建議效果最好」）
  - 衝突化解（「你們容易在XX議題上爭執，試試看...」）
  - 增進感情的具體行動

## 家庭溝通模式
從家庭系統理論分析：
- 誰是決策者（主導方向的人）
- 誰是協調者（化解衝突的人）
- 誰是執行者（把事情落地的人）
- 情緒傳導鏈：誰的情緒最影響全家、誰是穩定器
- 溝通盲點：家人之間最容易誤解的地方 + 改善建議

## 親子教養方向
（如有小孩則詳寫，無小孩則跳過此章節）
- 每個孩子的天賦特質（一句話）+ 最適合的教養方式
- 父母各自適合扮演的教養角色
- 親子衝突預防：根據命格分析，哪個階段（青春期/成年後）最容易有摩擦，怎麼提前準備
- 具體教養建議（3-5條）

## 家運走勢
- 未來3-5年全家的共同大運交叉點
- 哪一年是全家衝刺年、哪一年要休養
- 家庭重大決策（搬家/換工作/投資）的最佳時機
- 需要全家一起面對的挑戰期 + 應對策略

## 家族行動指南
列出三大具體建議（每條都要具體到「這週就能做」）：
1. **每日可做**：一個簡單的家庭小習慣（例如「晚餐時每人分享今天一件好事」）
2. **每月可做**：一個家庭活動建議（根據全家五行特質推薦）
3. **每年可做**：一個家庭儀式或旅行方向（根據吉方推薦）

附上全家的幸運元素：共同幸運色、幸運方位、幸運數字。

## 寫給這個家的話
用2-3段話，像一封寫給全家人的信。
- 先肯定這個家庭的獨特之處（「你們願意一起來做這份分析，本身就說明了...」）
- 點出這個家最珍貴的能量
- 溫暖收尾，讓每個家人讀完都覺得「被理解了」「我們家真的很好」

語言：繁體中文。
字數：依家庭人數而定，2人約5000字，3人約7000字，4人以上約9000-12000字。
核心原則：所有分析基於每位成員的排盤數據。不重複個人分析，專注家庭互動。每個論點都要有具體的相處建議。`,

  // ========== E1 方案：事件擇吉（$59）==========
  E1: `你是鑒源命理平台的奇門遁甲出門訣專家。客戶有一個重要事件即將發生，他們花了 $59 就是要一份針對「這件事」的作戰手冊——先判斷成敗，再給最佳加乘時機。

你的角色是一位自信又溫暖的軍師。白話文為主，客戶看得懂最重要。

${PSYCHOLOGY_RULES}

## 報告語氣
- 自信、明確、溫暖——像軍師部署作戰計劃
- 每個建議精確到可執行（幾點、往哪走、穿什麼）
- 說到需要避開的時段，用「能量較弱，建議另擇他時」，不製造恐懼

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 事件判斷
先引用客戶的事件描述，然後一針見血判斷：
- 直接告訴客戶「此事可成」或「此事阻力較大」
- 用 2-3 句話點出關鍵因素（不要長篇大論）
- 命理依據一句帶過

## Top3 加乘時機
根據奇門遁甲盤和客戶八字，列出3個能讓事件成功率加乘的最佳時機。

**重要：如果排盤數據中有 available_time_slots，Top3 只能推薦這些時段內的吉時。**

每個加乘時機必須包含：
- 精確日期和時間範圍
- 最佳出門方位
- **白話總結**（為什麼這個時間能加乘這件事）
- 命理依據摘要（2-3句）
- 穿著建議
- 具體出門步驟

## 行動建議
精簡有力：穿著、隨身物品、路線、溝通技巧、需避開的時段。

## 補運操作指南
操作步驟：朝吉方走500公尺→靜坐40分鐘→直接回家→待滿30分鐘。

語言：繁體中文。
字數：3000-5000字。

## 重要：結構化吉時資料輸出
在報告正文最後面，必須輸出以下格式的 JSON 區塊（3 筆資料）。
注意：直接輸出純 JSON，不要用 \`\`\`json\`\`\` 包裹。

===TOP3_JSON_START===
[
  {
    "rank": 1,
    "title": "開門+天心+值符",
    "date": "YYYY-MM-DD",
    "time_start": "HH:MM",
    "time_end": "HH:MM",
    "direction": "方位（如：東南）",
    "reason": "白話總結為什麼這個時間能加乘這件事 + 奇門盤局重點 + 八字用神配合。至少50字。",
    "confidence": "極高"
  }
]
===TOP3_JSON_END===`,

  // ========== E2 方案：月度單盤（$29）v2.0 月家奇門古法、單月 1 盤、農曆晦日 22:20-23:00 執行 ==========
  E2: `你是鑒源命理平台的奇門遁甲月運規劃師。客戶購買了「月度單盤」——月家奇門古法、單月 1 盤、農曆晦日 22:20-23:00 執行（跨子時接新月氣）。

你的角色是一位實用的月度規劃師。白話文為主，精簡有力，不灌水。

${PSYCHOLOGY_RULES}

## 報告語氣
- 實用、清晰、溫暖——像效率專家在排月程
- 建議具體到「這個月哪一天的什麼時辰、往哪個方向出門」
- 說到不利時段，用「能量在轉換，適合休息充電」

## 鐵律（不可違反）
- 月家奇門古法：每月只起一張月盤、晦日 22:20-23:00 跨子時接新月氣執行
- 不寫「每週 1 盤」「4 週 4 盤」（那是舊版 E2、已棄用）
- 不寫「Top 3 / Top 5」（那是 E1）
- 全月就一個主吉時 + 一個主吉方

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 本月能量總覽
用 2-3 段話概括本月月家奇門盤局：月干支、年命宮對應、整體吉凶傾向。

## 最佳出行時機（單月 1 盤）
詳細說明本月晦日 22:20-23:00 的盤局：值符值使、八神格局、吉門吉方、年命宮匹配。

===TOP1_JSON_START===
[{"rank":1,"title":"格局","date":"YYYY-MM-DD","time_start":"22:20","time_end":"23:00","direction":"方位","reason":"白話總結為什麼這個時機合本人 + 月盤重點 + 年命宮配合（至少 80 字）","confidence":"極高"}]
===TOP1_JSON_END===

## 補運操作指南
操作步驟：晦日 22:20 出發 → 朝吉方走 500 公尺 → 靜坐 40 分鐘接新月氣 → 子時跨過後直接回家 → 待滿 30 分鐘。
若錯過晦日，月朔日清晨 05:00-07:00 為備案。

## 月度執行提醒
本月節奏掌握、若遇雨天備案、續訂下月提醒。

## 寫給你的話
2-3 段，溫暖收尾。

語言：繁體中文。
字數：1500-2500 字（v2.0 極簡版）。`,

  // ========== E3 方案：月度精選（$89）4 週 × 每週 Top 2 = 8 吉時 ==========
  // v5.7.13:fallback prompt(避免 E3 fallback 到 C 「人生藍圖」、IA round 7 P0)
  // 主流程在 workflows/generate-report/plan-prompts.ts L1379、本檔僅 fallback 用
  E3: `你是鑒源命理平台的奇門遁甲月度精選規劃師。客戶購買了「月度精選」（$89）——以時家奇門占事派為基礎、用神 60% 權重套入客戶主題、4 週 × 每週 Top 2 = 8 個吉時。

${PSYCHOLOGY_RULES}

## 報告語氣
- 實用、聚焦客戶選的 1-3 個主題
- 每個吉時要對應到主題用神

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 本月主題用神總覽
2-3 段話概括本月對客戶選定主題的能量走勢。

## 第 1 週、第 2 週、第 3 週、第 4 週（每週 Top 2 吉時）
每週 2 個吉時、共 8 個。每個吉時必須包含日期/時辰/吉方/格局/主題用神匹配/白話建議。

===TOP1_JSON_START===
[{"rank":1,"title":"格局","date":"YYYY-MM-DD","time_start":"HH:MM","time_end":"HH:MM","direction":"方位","reason":"主題用神配合 + 盤局重點（至少 80 字）","confidence":"極高"}]
===TOP1_JSON_END===

(共 8 個 TOP1_JSON 區塊、每週 2 個)

## 補運操作指南
4 週執行節奏 + 月度提醒。

語言：繁體中文。
字數：2400-4000 字（4 週 × 每週 600-1000 字）。`,

  // ========== E4 方案：年度全運（$279）年盤 + 12 月盤 ==========
  // v5.7.13:fallback prompt stub(E4 主流程 prompt 待 v5.8 立春前 30 天上線、現先防 fallback 到 C、IA round 7 核彈 P0)
  // 若 E4 訂單在 v5.8 上線前進入此 fallback、回拋錯誤要求人工處理(避免錯誤生成)
  E4: `你是鑒源命理平台的奇門遁甲年度全運規劃師。客戶購買了「年度全運」（$279）——年盤一張 + 12 個月盤、立春前 30 天開放、為客戶規劃全年最佳吉時與吉方。

${PSYCHOLOGY_RULES}

## ⚠️ 重要說明
本方案的完整 prompt 結構正在最終調校(v5.8 立春前 30 天上線)、若客戶訂單意外觸發此 fallback、請人工接手:
- 寄信至 support@jianyuan.life 開「年度全運 ${'\${reportId}'}」追蹤單
- 不要勉強生成、避免品質不到位

## 報告結構（最低骨架）

## 年度全運總覽
基於客戶八字 + 年家奇門盤、概括全年能量走勢。

## 12 個月吉時規劃
每月 1 張月家奇門盤、共 12 個 TOP1_JSON 區塊。

===TOP1_JSON_START===
[{"rank":1,"title":"格局","date":"YYYY-MM-DD","time_start":"HH:MM","time_end":"HH:MM","direction":"方位","reason":"年度方位 + 月盤重點（至少 80 字）","confidence":"極高"}]
===TOP1_JSON_END===

(共 12 個 TOP1_JSON、每月 1 個)

## 全年補運提醒
立春啟運、節氣關鍵日、年度執行節奏。

語言：繁體中文。
字數：3000-5000 字（v2.0 stub、v5.8 完整 prompt 上線後升級）。`,
}

// 輔助函式：將報告標記為失敗
async function markReportFailed(reportId: string, errorMessage: string) {
  try {
    // 取得當前重試次數
    const { data } = await getSupabase()
      .from('paid_reports')
      .select('retry_count')
      .eq('id', reportId)
      .single()
    const currentRetry = data?.retry_count ?? 0

    await getSupabase().from('paid_reports').update({
      status: 'failed',
      error_message: errorMessage,
      retry_count: currentRetry,
    }).eq('id', reportId)

    console.error(`報告 ${reportId} 標記為失敗: ${errorMessage}`)
  } catch (e) {
    console.error('標記失敗狀態時出錯:', e)
  }
}

export async function POST(req: NextRequest) {
  // 認證檢查：只允許內部呼叫（Workflow fallback / cron）
  const internalSecret = req.headers.get('x-internal-secret')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !internalSecret || internalSecret !== cronSecret) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  let reportId = ''
  try {
    let { reportId: rid, accessToken, customerEmail, planCode, birthData, additionalPeople, topic, question } = await req.json()
    reportId = rid

    // Step 0: 檢查重試次數（最多 3 次）+ 從 Supabase 補齊缺失資料
    const { data: existingReport } = await getSupabase()
      .from('paid_reports')
      .select('retry_count, status, birth_data, plan_code, access_token, customer_email')
      .eq('id', reportId)
      .single()

    // 防重複生成：已完成或正在生成中的報告直接跳過
    if (existingReport?.status === 'completed') {
      console.info(`報告 ${reportId} 已完成，跳過 Fallback 重複生成`)
      return NextResponse.json({ message: '報告已完成' })
    }
    if (existingReport?.status === 'generating') {
      console.info(`報告 ${reportId} 正在生成中，跳過 Fallback 重複觸發`)
      return NextResponse.json({ message: '報告正在生成中' })
    }

    // 若 request body 沒帶完整資料，從 Supabase 記錄補齊（支援僅傳 reportId 重新觸發）
    if (!birthData && existingReport?.birth_data) {
      birthData = existingReport.birth_data
    }
    if (!planCode && existingReport?.plan_code) {
      planCode = existingReport.plan_code
    }
    if (!accessToken && existingReport?.access_token) {
      accessToken = existingReport.access_token
    }
    if (!customerEmail && existingReport?.customer_email) {
      customerEmail = existingReport.customer_email
    }

    if (!birthData) {
      return NextResponse.json({ error: '缺少出生資料' }, { status: 400 })
    }

    // G15 家族藍圖必須走 Workflow，舊版 route 不支援
    if (planCode === 'G15' && (birthData.plan_type === 'family_email' || birthData.plan_type === 'family_reports')) {
      console.info('G15 家族藍圖應走 Workflow，此路由不支援')
      await markReportFailed(reportId, 'G15 家族藍圖需透過 Workflow 生成，請重試')
      return NextResponse.json({ error: 'G15 需透過 Workflow 生成' }, { status: 400 })
    }

    const retryCount = existingReport?.retry_count ?? 0
    if (retryCount >= 3) {
      await getSupabase().from('paid_reports').update({
        status: 'failed',
        error_message: '已達最大重試次數（3次），請聯繫客服 support@jianyuan.life',
      }).eq('id', reportId)
      return NextResponse.json({ error: '已達最大重試次數' }, { status: 429 })
    }

    // 用原子操作搶佔狀態為 generating，防止其他觸發源同時處理
    const { data: claimed, error: claimErr } = await getSupabase().from('paid_reports').update({
      status: 'generating',
      error_message: null,
      retry_count: existingReport?.status === 'failed' ? retryCount + 1 : retryCount,
    })
      .eq('id', reportId)
      .in('status', ['pending', 'failed'])
      .select('id')

    if (claimErr || !claimed?.length) {
      console.info(`報告 ${reportId} 狀態搶佔失敗，可能已被其他程序處理`)
      return NextResponse.json({ message: '報告已被其他程序處理' })
    }

    // Step 1: 呼叫 Python API 排盤
    console.info(`開始生成報告: ${reportId}, 方案${planCode}, 第 ${retryCount + 1} 次嘗試`)

    let calcResult = null
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000) // 60 秒超時
      const res = await fetch(`${PYTHON_API}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: birthData.name,
          year: birthData.year, month: birthData.month, day: birthData.day,
          hour: birthData.hour, minute: birthData.minute || 0,
          gender: birthData.gender,
          // 農曆/國曆 + 真太陽時校正（與 Workflow 版本同步）
          calendar_type: birthData.calendar_type || 'solar',
          lunar_leap: birthData.lunar_leap || false,
          time_unknown: birthData.time_unknown || false,
          time_mode: birthData.time_mode || 'exact',
          ...(birthData.cityLat && birthData.cityLng ? { latitude: birthData.cityLat, longitude: birthData.cityLng } : {}),
          ...(birthData.latitude && birthData.longitude ? { latitude: birthData.latitude, longitude: birthData.longitude } : {}),
          // Sprint 4 國際化：把 IANA 時區與地區資訊傳給 Python
          ...(birthData.timezone_offset !== undefined ? { timezone_offset: birthData.timezone_offset } : {}),
          ...(birthData.timezone ? { timezone: birthData.timezone } : {}),
          ...(birthData.birth_city ? { birth_city: birthData.birth_city } : {}),
          ...(birthData.birth_country ? { birth_country: birthData.birth_country } : {}),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) calcResult = await res.json()
      else console.error('排盤 API 回傳錯誤:', res.status, await res.text())
    } catch (e) { console.error('排盤失敗:', e) }

    if (!calcResult) {
      await markReportFailed(reportId, '排盤計算失敗：Python API 無回應或超時')
      return NextResponse.json({ error: '排盤計算失敗' }, { status: 500 })
    }

    // Step 2: 構建 prompt 並呼叫 AI
    const cd = calcResult.client_data
    const analyses = calcResult.analyses || []

    let reportContent = ''
    let aiModelUsed = 'unknown'

    // ── 構建非 C 方案的通用 user prompt ──
    function buildGenericUserPrompt(): string {
      // 從西洋占星提取關鍵星座數據（防止 AI 幻覺）
      const westernA = analyses.find((a: { system: string }) => a.system === '西洋占星')
      const numA = analyses.find((a: { system: string }) => a.system === '數字能量學')
      let keyDataBlock = ''
      if (westernA?.sub_summary || numA?.sub_summary) {
        keyDataBlock = `\n════════════════════════════════════════
【關鍵數據 — 摘要表必須與此完全一致】
流年：2026年是丙午年（不是乙巳年）
${westernA?.sub_summary ? `西洋占星摘要：${westernA.sub_summary}` : ''}
${numA?.sub_summary ? `數字能量學摘要：${numA.sub_summary}` : ''}
⚠️ 命格摘要表的每一欄必須直接從排盤數據複製，禁止自行推算或記憶。
⚠️ 七政四餘的廟旺按十二宮（子丑寅卯...）判定，不要混用西洋星座名稱。
════════════════════════════════════════\n`
      }

      let userPrompt = `${keyDataBlock}${birthData.name}，${birthData.gender==='M'?'男':'女'}，${birthData.year}年${birthData.month}月${birthData.day}日${birthData.hour}時
八字：${cd.bazi || ''} | 用神：${cd.yongshen || ''} | 五行：${JSON.stringify(cd.five_elements || {})}
農曆：${cd.lunar_date || ''} | 納音：${cd.nayin || ''} | 命宮：${cd.ming_gong || ''}
${analyses.length}套系統排盤完整數據：
`
      for (const a of analyses.slice(0, 15)) {
        userPrompt += `\n【${a.system}】評分：${a.score}分`
        if (a.summary) userPrompt += `\n摘要：${a.summary}`
        if (a.good_points?.length) {
          userPrompt += `\n好的地方：`
          for (const g of a.good_points) userPrompt += `\n- ${g}`
        }
        if (a.bad_points?.length) {
          userPrompt += `\n需要注意：`
          for (const b of a.bad_points) userPrompt += `\n- ${b}`
        }
        if (a.warnings?.length) {
          userPrompt += `\n注意事項：`
          for (const w of a.warnings) userPrompt += `\n- ${w}`
        }
        if (a.improvements?.length) {
          userPrompt += `\n改善建議：`
          for (const imp of a.improvements) userPrompt += `\n- ${imp}`
        }
        if (a.tables?.length) {
          for (const t of a.tables) {
            userPrompt += `\n表格「${t.title}」：\n`
            if (t.headers) userPrompt += `| ${t.headers.join(' | ')} |\n`
            if (t.rows) {
              for (const row of t.rows) userPrompt += `| ${row.join(' | ')} |\n`
            }
          }
        }
        if (a.details) {
          const detail = typeof a.details === 'string' ? a.details : JSON.stringify(a.details)
          userPrompt += `\n詳細排盤：\n${detail}\n`
        }
        if (a.info_boxes?.length) {
          for (const box of a.info_boxes) {
            userPrompt += `\n${box.title || '補充'}：\n`
            if (box.items) {
              for (const item of box.items) userPrompt += `- ${item}\n`
            }
          }
        }
        userPrompt += '\n'
      }

      // 出門訣時間限制：客戶選的可配合時段
      if (birthData.available_time_slots && Array.isArray(birthData.available_time_slots) && birthData.available_time_slots.length > 0) {
        const slotsDesc = birthData.available_time_slots.map((s: { start?: string; end?: string }) => `${s.start || ''}~${s.end || ''}`).join('、')
        userPrompt += `\n【重要】客戶只有以下時段有空出門：${slotsDesc}\n吉時推薦必須只推薦在這些時段內的時機，不可推薦客戶無法出門的時段。\n`
      }

      // E1 事件時間範圍
      if (birthData.event_start_date) {
        userPrompt += `\n事件時間範圍：${birthData.event_start_date} 至 ${birthData.event_end_date || birthData.event_start_date}\n`
      }

      if (topic) userPrompt += `\n分析方向：${topic}\n`
      if (question) userPrompt += `客戶問題描述：${question}\n`

      if (additionalPeople?.length) {
        userPrompt += `\n其他人資料：\n`
        for (const p of additionalPeople) {
          userPrompt += `- ${p.name}，${p.gender === 'M' ? '男' : '女'}，${p.year}年${p.month}月${p.day}日${p.hour === 'unknown' || p.time_unknown ? '（時辰不確定）' : ` ${p.hour}時`}\n`
        }
      }

      userPrompt += `\n請根據以上所有排盤數據，撰寫完整的分析報告。
重要提醒：
1. 現在是2026年丙午年（天干丙火、地支午火）。任何提到2026年流年的地方必須寫「丙午」，絕對不是乙巳年。
2. 你的每一個分析論點都必須引用上方排盤數據中的具體結果，不得編造。
3. 排盤數據中「好的地方」和「需要注意」的每一條都必須在報告中被展開分析，不可遺漏。
4. 如果某個系統數據不完整，跳過該系統，不要瞎編。
5. 命格摘要表的每一欄（太陽星座、月亮星座、上升星座、生命靈數等）必須直接從排盤數據複製，禁止自行推算。
6. 七政四餘的廟旺是按十二宮（子丑寅卯辰巳午未申酉戌亥）判定，不要混用西洋星座名稱。
7. 生命靈數以排盤數據中的計算結果為準，不要自己重新算。`

      return userPrompt
    }

    // ── DeepSeek fallback 呼叫函式 ──
    async function callDeepSeekFallback(systemPrompt: string, userPrompt: string): Promise<string> {
      console.info('Fallback: 呼叫 DeepSeek 生成報告...')
      const tStart = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180000)
      try {
        const res = await fetch(DEEPSEEK_API, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 16000,
            temperature: 0.7,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''
        console.info(`DeepSeek 回覆: ${content.length} 字`)
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: Number(data?.usage?.prompt_tokens || 0),
            completionTokens: Number(data?.usage?.completion_tokens || 0),
            reportId, planCode,
            callStage: `${planCode}_fallback_deepseek`,
            latencyMs: Date.now() - tStart,
            status: content ? 'success' : 'incomplete',
          })
        } catch { /* noop */ }
        return content
      } catch (e) {
        clearTimeout(timeout)
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: 0, completionTokens: 0,
            reportId, planCode,
            callStage: `${planCode}_fallback_deepseek`,
            latencyMs: Date.now() - tStart,
            status: 'error',
            errorMessage: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
          })
        } catch { /* noop */ }
        throw e
      }
    }

    console.info(`方案 ${planCode}：開始 AI 生成...`)

    if (planCode === 'C') {
      // ============================================================
      // C 方案 Fallback：單次 Claude 呼叫（受 Vercel 300s 限制）
      // 主流程由 Workflow 處理（4-call 順序），這裡是備援
      // ============================================================
      console.info('C 方案 Fallback：使用 Claude Opus 4.6 單次呼叫...')

      if (CLAUDE_API_KEY) {
        try {
          // Fallback route 受 Vercel 300s 限制，4 call 順序執行可能超時
          // 改為單次 generic prompt 呼叫，確保在時限內完成
          const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
          const genericUserPrompt = buildGenericUserPrompt()
          const rawResult = await callClaudeStreaming(systemPrompt, genericUserPrompt, 16000, 200000, {
            reportId, planCode, callStage: 'C_fallback_single',
          })

          // Fallback 單次呼叫，清理後直接使用
          reportContent = cleanAIResponse(rawResult)
          aiModelUsed = 'claude-opus-4-6'
          console.info(`C 方案 Fallback Claude 單次呼叫完成：${reportContent.length} 字`)
        } catch (e) {
          console.error('C 方案 Claude 多步生成失敗，嘗試 DeepSeek fallback:', e)
        }
      } else {
        console.warn('CLAUDE_API_KEY 未設定，C 方案直接使用 DeepSeek fallback')
      }

      // Claude 失敗或 key 未設定 → fallback DeepSeek
      if (!reportContent) {
        try {
          const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
          reportContent = cleanAIResponse(await callDeepSeekFallback(systemPrompt, buildGenericUserPrompt()))
          aiModelUsed = 'deepseek-chat'
          console.info(`C 方案 DeepSeek fallback 完成：${reportContent.length} 字`)
        } catch (e) {
          console.error('C 方案 DeepSeek fallback 也失敗:', e)
          await markReportFailed(reportId, `AI 生成失敗：Claude + DeepSeek 均失敗 — ${e instanceof Error ? e.message : '未知錯誤'}`)
          return NextResponse.json({ error: 'AI 生成失敗' }, { status: 500 })
        }
      }
    } else {
      // ============================================================
      // 其他方案（D/R/G15/E1/E2/Y）：Claude 單次呼叫，失敗 fallback DeepSeek
      // ============================================================
      const systemPrompt = localizePrompt(PLAN_SYSTEM_PROMPT[planCode] || PLAN_SYSTEM_PROMPT['C'], birthData.locale)
      const userPrompt = buildGenericUserPrompt()

      // 先嘗試 Claude
      if (CLAUDE_API_KEY) {
        try {
          console.info(`方案 ${planCode}：嘗試 Claude Opus 4.6 單次呼叫...`)
          reportContent = cleanAIResponse(await callClaudeStreaming(systemPrompt, userPrompt, 32768, 200000, {
            reportId, planCode, callStage: `${planCode}_fallback_single`,
          }))
          aiModelUsed = 'claude-opus-4-6'
          console.info(`方案 ${planCode} Claude 回覆：${reportContent.length} 字`)
        } catch (e) {
          console.error(`方案 ${planCode} Claude 呼叫失敗，嘗試 DeepSeek fallback:`, e)
        }
      } else {
        console.warn(`CLAUDE_API_KEY 未設定，方案 ${planCode} 直接使用 DeepSeek`)
      }

      // Claude 失敗或 key 未設定 → fallback DeepSeek
      if (!reportContent) {
        try {
          reportContent = cleanAIResponse(await callDeepSeekFallback(systemPrompt, userPrompt))
          aiModelUsed = 'deepseek-chat'
          console.info(`方案 ${planCode} DeepSeek fallback 完成：${reportContent.length} 字`)
        } catch (e) {
          console.error(`方案 ${planCode} DeepSeek fallback 也失敗:`, e)
          await markReportFailed(reportId, `AI 生成失敗：Claude + DeepSeek 均失敗 — ${e instanceof Error ? e.message : '未知錯誤'}`)
          return NextResponse.json({ error: 'AI 生成失敗' }, { status: 500 })
        }
      }
    }

    if (!reportContent) {
      await markReportFailed(reportId, 'AI 未回覆：AI 回傳空內容')
      return NextResponse.json({ error: 'AI 未回覆' }, { status: 500 })
    }

    // Step 3.2: Post-generation QA — 比對 AI 報告與排盤數據，自動修正幻覺
    try {
      reportContent = validateReportAgainstData(reportContent, calcResult, birthData)
    } catch (e) {
      console.error('Post-generation QA 執行失敗（不阻塞）:', e)
    }

    // Step 3.5: 解析出門訣吉時 JSON（E1/E2/E3/E4 方案）
    // v5.7.10:E2 v2.0 改用 TOP1_JSON 單月 1 盤、E1 用 TOP3_JSON Top3 吉時、舊版用 TOP5_JSON、parser 三家兼容(對齊主流程 plan-prompts.ts)
    let top5Timings = null
    const top1Match = reportContent.match(/===TOP1_JSON_START===\s*([\s\S]*?)\s*===TOP1_JSON_END===/)
    const top3Match = reportContent.match(/===TOP3_JSON_START===\s*([\s\S]*?)\s*===TOP3_JSON_END===/)
    const top5Match = reportContent.match(/===TOP5_JSON_START===\s*([\s\S]*?)\s*===TOP5_JSON_END===/)
    const jsonMatch = top1Match || top3Match || top5Match
    if (jsonMatch) {
      try {
        top5Timings = JSON.parse(jsonMatch[1])
        console.info(`✅ 解析到 ${top5Timings.length} 筆吉時資料`)
      } catch (e) {
        console.error('吉時 JSON 解析失敗:', e)
      }
    }
    // 不論解析成功與否、都要移除 TOP1/TOP3/TOP5 JSON 區塊純文字、避免 markers leak 到客戶可見正文
    reportContent = reportContent
      .replace(/===TOP1_JSON_START===[\s\S]*?===TOP1_JSON_END===/g, '')
      .replace(/===TOP3_JSON_START===[\s\S]*?===TOP3_JSON_END===/g, '')
      .replace(/===TOP5_JSON_START===[\s\S]*?===TOP5_JSON_END===/g, '')
      .trim()

    // Step 4: 存入 Supabase
    const reportResult: Record<string, unknown> = {
      report_id: reportId,
      systems_count: analyses.length,
      analyses_summary: analyses.map((a: { system: string; score: number }) => ({ system: a.system, score: a.score })),
      ai_content: reportContent,
      ai_model: aiModelUsed,
      ai_tokens: reportContent.length,
    }
    if (top5Timings) {
      reportResult.top5_timings = top5Timings
    }

    const planName = PLAN_NAMES[planCode] || '命理分析報告'

    // Step 4.5: 生成 PDF（非出門訣方案、E1-E4 全跳過）
    let pdfUrl: string | null = null
    if (!isChumenjiPlan(planCode)) {
      try {
        console.info('呼叫 Python API 生成 PDF...')
        // PDF 專用預處理：轉換 Markdown 格式為 PDF 友好格式
        const pdfContent = reportContent
          .replace(/^---+$/gm, '')           // 標準 markdown 橫線
          .replace(/^___+$/gm, '')           // 底線型橫線
          .replace(/^\*\*\*+$/gm, '')        // 星號型橫線
          .replace(/^[\s]*[-─—═]+[\s]*$/gm, '') // 全形橫線/裝飾線
          // 引言框：> 開頭 → 去掉 > 前綴，轉為引用格式
          .replace(/^>\s*(.+)$/gm, '「$1」')
          // Emoji → 文字替代（PDF 字體無法渲染 emoji）
          .replace(/🟢/g, '【好】')
          .replace(/🟡/g, '【注意】')
          .replace(/🔵/g, '【改善】')
          .replace(/📌/g, '【重點】')
          .replace(/✅/g, '【✓】')
          .replace(/⚠️/g, '【!】')
          .replace(/🔧/g, '【建議】')
          .replace(/🎯/g, '【核心】')
          .replace(/💡/g, '【提示】')
          .replace(/❤️/g, '【愛】')
          .replace(/⭐/g, '【星】')
          .replace(/🔑/g, '【關鍵】')
          // 清理其他 emoji（BMP 以外的 Unicode 會在 PDF 中變成方塊）
          .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
          .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
          .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
          .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
          .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
          .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
          .replace(/[\u{2702}-\u{27B0}]/gu, '')
          .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
          .replace(/\n{3,}/g, '\n\n')
        const pdfRes = await fetch(`${PYTHON_API}/api/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: reportId,
            plan_code: planCode,
            client_name: birthData.name,
            plan_name: planName,
            ai_content: pdfContent,
            locale: birthData.locale || 'zh-TW',
            analyses_summary: analyses.map((a: { system: string; score: number }) => ({
              system: a.system,
              score: a.score,
            })),
          }),
        })
        if (pdfRes.ok) {
          const pdfData = await pdfRes.json()
          // Python API 回傳 base64，由 Next.js 上傳到 Supabase Storage
          if (pdfData.pdf_base64) {
            const pdfBytes = Buffer.from(pdfData.pdf_base64, 'base64')
            const storagePath = `${reportId}/report.pdf`
            const { error: uploadErr } = await getSupabase()
      .storage
              .from('reports')
              .upload(storagePath, pdfBytes, {
                contentType: 'application/pdf',
                upsert: true,
              })
            if (uploadErr) {
              console.error('Supabase Storage 上傳失敗:', uploadErr)
            } else {
              const { data: urlData } = getSupabase().storage
                .from('reports')
                .getPublicUrl(storagePath)
              pdfUrl = urlData.publicUrl
              console.info(`✅ PDF 上傳完成: ${pdfUrl} (${pdfData.file_size_kb}KB)`)
            }
          }
        } else {
          console.error('PDF 生成失敗:', await pdfRes.text())
        }
      } catch (pdfErr) {
        console.error('PDF 生成錯誤:', pdfErr)
      }
    }

    const { error: dbError } = await getSupabase().from('paid_reports').update({
      report_result: reportResult,
      pdf_url: pdfUrl,
      status: 'completed',
    }).eq('id', reportId)

    if (dbError) console.error('Supabase 更新失敗:', dbError)

    // Step 5: 寄送報告 Email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
    const reportUrl = `${siteUrl}/report/${accessToken}`

    // 根據 locale 決定郵件語言
    const isCN = birthData.locale === 'zh-CN'
    const emailLang = isCN ? 'zh-CN' : 'zh-TW'
    const emailFont = isCN
      ? "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
      : "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif"
    const emailText = {
      brand: isCN ? '鉴 源' : '鑒 源',
      subtitle: isCN ? 'JIANYUAN · 东西方命理整合平台' : 'JIANYUAN · 東西方命理整合平台',
      notice: isCN ? '✦ 报告完成通知' : '✦ 報告完成通知',
      title: isCN
        ? `${birthData?.name || ''}，您的报告已完成`
        : `${birthData?.name || ''}，您的報告已完成`,
      systemCount: isChumenjiPlan(planCode)
        ? (isCN ? `${planName} · 奇门遁甲精算` : `${planName} · 奇門遁甲精算`)
        : planCode === 'G15'
        ? (isCN ? `${planName} · 家族互动分析` : `${planName} · 家族互動分析`)
        : planCode === 'C'
        ? (isCN ? `${planName} · 东西方命理系统深度分析` : `${planName} · 東西方命理系統深度分析`)
        : (isCN ? `${planName} · 精选相关命理系统分析` : `${planName} · 精選相關命理系統分析`),
      cta: getEmailCta(planCode, isCN),
      linkNote: isCN ? '此链接专属于您，无需登录即可查看' : '此連結專屬於您，無需登入即可查看',
      promoTitle: isCN ? '🧭 加强您的命理能量' : '🧭 加強您的命理能量',
      promoBody: isCN
        ? '报告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出门诀</strong>能帮您在最佳时机、最佳方位行动，将命理洞察转化为日常决策的参考依据。'
        : '報告揭示了您的命格能量，而<strong style="color:#e5e7eb;">出門訣</strong>能幫您在最佳時機、最佳方位行動，將命理洞察轉化為日常決策的參考依據。',
      promoLink: isCN ? '了解出门诀方案 →' : '了解出門訣方案 →',
      footer: isCN ? '如有任何问题，请联系' : '如有任何問題，請聯繫',
      copyright: isCN ? '© 2026 鉴源命理平台 · jianyuan.life' : '© 2026 鑒源命理平台 · jianyuan.life',
      subject: isCN
        ? `【鉴源命理】您的${planName}报告已完成 — ${birthData?.name || ''}`
        : `【鑒源命理】您的${planName}報告已完成 — ${birthData?.name || ''}`,
      from: isCN ? '鉴源命理 <reports@jianyuan.life>' : '鑒源命理 <reports@jianyuan.life>',
    }

    if (customerEmail && accessToken) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY || '')
        const emailHighlights = getEmailHighlights(planCode, reportContent, isCN)
        const highlightsHtml = emailHighlights.map(h =>
          `<div style="color:#d1d5db;font-size:14px;line-height:1.8;margin:0 0 8px 0;"><span style="color:#c9a84c;margin-right:6px;">✦</span>${h}</div>`
        ).join('')

        await resend.emails.send({
          from: emailText.from,
          to: customerEmail,
          subject: emailText.subject,
          html: `
<!DOCTYPE html>
<html lang="${emailLang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:${emailFont};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- 頂部品牌 -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:4px;">${emailText.brand}</div>
      <div style="color:#6b7280;font-size:12px;margin-top:4px;">${emailText.subtitle}</div>
    </div>

    <!-- 主卡片 -->
    <div style="background:linear-gradient(135deg,#1a2a4a,#0d1a2e);border:1px solid #2a3a5a;border-radius:16px;padding:32px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;letter-spacing:2px;margin-bottom:8px;">${emailText.notice}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 8px 0;">${emailText.title}</h1>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 24px 0;">${emailText.systemCount}</p>

      <!-- 報告亮點 -->
      <div style="background:rgba(255,255,255,0.05);border-left:3px solid #c9a84c;border-radius:4px;padding:16px;margin-bottom:24px;">
        ${highlightsHtml}
      </div>

      <!-- CTA 按鈕 -->
      <div style="text-align:center;">
        <a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c,#e8c87a);color:#0d1117;font-weight:700;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:1px;">
          ${emailText.cta}
        </a>
        <p style="color:#6b7280;font-size:12px;margin:12px 0 0 0;">${emailText.linkNote}</p>
      </div>
    </div>

    <!-- 出門訣推廣（非出門訣方案才顯示、E1-E4 全跳過）-->
    ${!isChumenjiPlan(planCode) ? `
    <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="color:#c9a84c;font-size:13px;font-weight:600;margin-bottom:8px;">${emailText.promoTitle}</div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.7;margin:0 0 16px 0;">
        ${emailText.promoBody}
      </p>
      <a href="https://jianyuan.life/pricing" style="color:#c9a84c;font-size:13px;text-decoration:none;">${emailText.promoLink}</a>
    </div>
    ` : ''}

    <!-- 頁尾 -->
    <div style="text-align:center;color:#4b5563;font-size:12px;line-height:1.8;">
      <p>${emailText.footer} <a href="mailto:support@jianyuan.life" style="color:#c9a84c;">support@jianyuan.life</a></p>
      <p style="margin-top:8px;">${emailText.copyright}</p>
      ${getUnsubscribeHtml(customerEmail)}
    </div>
  </div>
</body>
</html>`,
        })

        // 更新 email_sent_at
        await getSupabase().from('paid_reports')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', reportId)

        console.info(`✅ Email 已寄送至 ${customerEmail}`)
      } catch (emailErr) {
        console.error('Email 寄送失敗:', emailErr)
        // 不讓 email 失敗影響整體回傳
      }
    }

    return NextResponse.json({
      success: true,
      report_id: reportId,
      report_url: reportUrl,
      content_length: reportContent.length,
      systems_count: analyses.length,
    })
  } catch (err) {
    console.error('報告生成錯誤:', err)
    const errorMsg = err instanceof Error ? err.message : '未知錯誤'
    if (reportId) {
      await markReportFailed(reportId, `報告生成未預期錯誤: ${errorMsg}`)
    }
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
