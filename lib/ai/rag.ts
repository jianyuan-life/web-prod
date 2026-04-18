// ============================================================
// 鑑源 RAG 檢索層 — Voyage AI embedding + Supabase pgvector
// ============================================================
// 用途：AI 寫報告前，先從 rules_library 檢索相關古籍規則，
//       把真實規則注入 prompt，避免「憑訓練記憶寫」。
//
// 流程：
//   chartData → buildQueryFromChart → embedText → retrieveRules
//
// 環境變數：
//   VOYAGE_API_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface RetrievedRule {
  id: string
  system: string
  rule_type: string | null
  title: string
  content: string
  source: string | null
  source_chapter: string | null
  metadata: Record<string, unknown>
  similarity: number
}

export type RuleSystem =
  | 'bazi'
  | 'ziwei'
  | 'qimen'
  | 'name'
  | 'fengshui'
  | 'tarot'
  | 'iching'
  | 'western_astrology'
  | 'vedic_astrology'
  | 'human_design'
  | 'numerology'
  | 'zodiac'
  | 'biorhythm'
  | 'classical'
  | 'integration'

// ------------------------------------------------------------
// Voyage AI embedding
// ------------------------------------------------------------

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-large'  // 1024 維，繁中/英混合最佳
const EMBEDDING_DIM = 1024

/**
 * 將一段文字轉成 1024 維向量（Voyage voyage-3-large）。
 *
 * @param text  待 embed 的文字（query 用 'query'，文件用 'document'）
 * @param inputType  'query' | 'document'（Voyage 有不對稱優化）
 * @throws 若 API 失敗或回傳維度錯誤
 */
export async function embedText(
  text: string,
  inputType: 'query' | 'document' = 'query'
): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error('[rag] VOYAGE_API_KEY 未設定')
  }

  const cleaned = text.trim()
  if (!cleaned) {
    throw new Error('[rag] embedText: 輸入文字為空')
  }

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [cleaned],
      input_type: inputType,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`[rag] Voyage embedding 失敗 (${res.status}): ${errText}`)
  }

  const json = await res.json() as {
    data?: Array<{ embedding: number[] }>
  }

  const vector = json?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `[rag] Voyage 回傳向量維度錯誤：期望 ${EMBEDDING_DIM}，實際 ${vector?.length}`
    )
  }

  return vector
}

// ------------------------------------------------------------
// Supabase client（伺服器端，service_role）
// ------------------------------------------------------------

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('[rag] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定')
  }

  _supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _supabase
}

// ------------------------------------------------------------
// 檢索：查詢最相關的 top-K 條規則
// ------------------------------------------------------------

/**
 * 依自然語言 query 檢索 top-K 最相關的規則。
 *
 * @param query   查詢字串（例：「甲木日主庚金七殺怎麼看事業」）
 * @param system  限定命理系統（null/undefined = 全系統）
 * @param topK    回傳筆數（預設 30）
 */
export async function retrieveRules(
  query: string,
  system?: RuleSystem | null,
  topK: number = 30
): Promise<RetrievedRule[]> {
  if (!query?.trim()) return []

  const embedding = await embedText(query, 'query')
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('match_rules', {
    query_embedding: embedding,
    match_system: system ?? null,
    match_count: topK,
  })

  if (error) {
    throw new Error(`[rag] match_rules RPC 失敗：${error.message}`)
  }

  return (data ?? []) as RetrievedRule[]
}

// ------------------------------------------------------------
// 從排盤 JSON 抽取關鍵特徵組成檢索 query
// ------------------------------------------------------------

/**
 * 把排盤結果壓縮成一句語意 query，供 embedding 檢索。
 *
 * 支援排盤結構：
 *   - 八字：{ dayMaster, pillars, shishen, dayun, liunian, geju, ... }
 *   - 紫微：{ mingGong, shenGong, sihua, majorStars, xiaoxian, ... }
 *   - 奇門：{ ju, paiBu, bamen, jiuxing, bashen, ... }
 *
 * 回傳格式範例：
 *   「甲木日主 庚金七殺 食神生財 身強 2026 流年丙午 庚申大運」
 *
 * @param chartData  排盤 JSON（任意系統）
 */
export async function buildQueryFromChart(
  chartData: Record<string, unknown>
): Promise<string> {
  const parts: string[] = []

  const pick = (obj: unknown, keys: string[]): string[] => {
    if (!obj || typeof obj !== 'object') return []
    const out: string[] = []
    for (const key of keys) {
      const val = (obj as Record<string, unknown>)[key]
      if (val == null) continue
      if (typeof val === 'string' || typeof val === 'number') {
        out.push(String(val))
      } else if (Array.isArray(val)) {
        out.push(val.filter(v => typeof v === 'string' || typeof v === 'number').map(String).join(' '))
      } else if (typeof val === 'object') {
        out.push(Object.values(val as Record<string, unknown>)
          .filter(v => typeof v === 'string' || typeof v === 'number')
          .map(String).join(' '))
      }
    }
    return out.filter(Boolean)
  }

  // 八字特徵
  parts.push(...pick(chartData, [
    'dayMaster', 'rigan', 'rizhu',      // 日主
    'pillars', 'sizhu', 'bazi',         // 四柱
    'shishen', 'tenGods',               // 十神
    'dayun', 'majorLuck',               // 大運
    'liunian', 'annualLuck', 'yearLuck',// 流年
    'geju', 'pattern',                  // 格局
    'strength', 'shenqiang',            // 身強弱
    'yongshen', 'favorable',            // 用神喜忌
  ]))

  // 紫微特徵
  parts.push(...pick(chartData, [
    'mingGong', 'mingZhu',              // 命宮、命主
    'shenGong', 'shenZhu',              // 身宮、身主
    'wuju', 'fiveElementLocal',         // 五行局
    'sihua', 'fourTransformations',     // 四化
    'majorStars', 'mainStars',          // 主星
    'mingPan',                          // 命盤
  ]))

  // 奇門特徵
  parts.push(...pick(chartData, [
    'ju', 'juType', 'juNumber',         // 局數（陽一局、陰九局）
    'paiBu',                            // 排佈
    'bamen', 'eightDoors', 'doors',     // 八門
    'jiuxing', 'nineStars', 'stars',    // 九星
    'bashen', 'eightGods', 'gods',      // 八神
    'timeGan', 'dayGan',                // 時干日干
  ]))

  // 通用時間特徵
  parts.push(...pick(chartData, [
    'year', 'yearGanZhi', 'liunianGanZhi',
    'month', 'monthGanZhi',
    'day', 'dayGanZhi',
    'hour', 'hourGanZhi',
  ]))

  // 去重 + 去空白
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of parts) {
    for (const tok of raw.split(/\s+/).filter(Boolean)) {
      if (!seen.has(tok)) {
        seen.add(tok)
        tokens.push(tok)
      }
    }
  }

  // Fallback：若完全抽不到特徵，把整個物件的 string 值串起來
  if (tokens.length === 0) {
    const flat: string[] = []
    const visit = (v: unknown, depth = 0) => {
      if (depth > 3 || !v) return
      if (typeof v === 'string' && v.length <= 40) flat.push(v)
      else if (typeof v === 'number') flat.push(String(v))
      else if (Array.isArray(v)) v.slice(0, 20).forEach(x => visit(x, depth + 1))
      else if (typeof v === 'object') Object.values(v as object).slice(0, 20).forEach(x => visit(x, depth + 1))
    }
    visit(chartData)
    return flat.slice(0, 40).join(' ').trim()
  }

  // 限制長度（Voyage 單次輸入上限 32k token，我們給一個合理上限）
  return tokens.slice(0, 60).join(' ').trim()
}

// ------------------------------------------------------------
// 便利組合：從排盤直接 retrieve
// ------------------------------------------------------------

/**
 * 一站式：排盤 JSON → query → embed → top-K 規則。
 */
export async function retrieveRulesFromChart(
  chartData: Record<string, unknown>,
  system?: RuleSystem | null,
  topK: number = 30
): Promise<{ query: string; rules: RetrievedRule[] }> {
  const query = await buildQueryFromChart(chartData)
  const rules = await retrieveRules(query, system, topK)
  return { query, rules }
}
