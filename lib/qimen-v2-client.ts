// ============================================================
// 奇門遁甲 Phase 0 API Client (V2)
// 鑑源 web 呼叫 Fly.io /api/v2/* 端點的型別安全包裝
// ============================================================
//
// API Base: process.env.NEXT_PUBLIC_API_URL（預設 fortune-reports-api.fly.dev）
// 所有端點都在 /api/v2/* prefix 下
//
// 使用方式：
//   import { qimenV2 } from '@/lib/qimen-v2-client'
//   const result = await qimenV2.lifePalace({ birth_year: 1990, gender: 'male' })
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://fortune-reports-api.fly.dev'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female'
export type PlanCode = 'E1' | 'E2' | 'E3' | 'E4'

export type TopicCode =
  | 'career'
  | 'wealth'
  | 'love'
  | 'health'
  | 'study'
  | 'noble'
  | 'villain'
  | 'family'

export type EventTypeCode =
  | 'interview'
  | 'contract'
  | 'relocation'
  | 'travel'
  | 'exam'
  | 'romance'
  | 'startup'
  | 'investment'
  | 'medical'
  | 'lawsuit'
  | 'social'
  | 'negotiation'
  | 'visit'
  | 'other'

// 年命宮
export interface LifePalaceResult {
  palace_num: number
  palace_name: string
  element: string
  direction_8: string
  direction_24: string
  degree: number | null
  original_num: number
  is_center_borrowed: boolean
  yuan: string
  year_offset: number
}

// 方位資訊
export interface DirectionInfoResult {
  palace_num: number
  palace_name: string
  direction_8: string
  direction_24: string
  degree: number
  degree_range: [number, number]
  client_format: string
  is_center?: boolean
  note?: string
}

// 用神
export interface YongshenItem {
  type: 'star' | 'gate' | 'shen'
  name: string
  element?: string
  meaning: string
}

export interface TopicYongshenResult {
  topic_name_zh: string
  ancient_category: string
  primary_yongshen: YongshenItem[]
  secondary_yongshen: YongshenItem[]
  positive_keywords: string[]
  negative_keywords: string[]
  ancient_sources: string[]
}

export interface EventYongshenResult {
  event_type: string
  event_name_zh: string
  ancient_category: string
  ancient_category_name: string
  primary_yongshen: YongshenItem[]
  secondary_yongshen: YongshenItem[]
  keywords: string[]
  description: string
  specific_notes: string
  ancient_source: string
}

// 事件匹配
export interface EventMatchResult {
  matched_event_type: string | null
  event_name_zh?: string
  ancient_category?: string
  confidence?: string
  note?: string
}

// 農曆
export interface LunarDayInfo {
  solar_date: string
  lunar_year: number
  lunar_year_gz: string
  lunar_month: number
  lunar_month_is_leap: boolean
  lunar_day: number
  is_hui_day: boolean
  is_shuo_day: boolean
  is_chuxi: boolean
  is_zheng_yue_chu_yi: boolean
  jieqi_info: { name?: string; is_jieqi_day: boolean }
}

// E2 購買窗口
export interface E2PurchaseWindowResult {
  target_hui_day: string | null
  target_lunar_month?: number
  target_lunar_year?: number
  target_lunar_year_gz?: string
  is_before_21_00_on_hui_day: boolean
  purchase_datetime?: string
  error?: string
}

// E4 販售窗口
export interface E4SalesWindowResult {
  in_sales_window: boolean
  days_to_lichun: number | null
  next_lichun: string | null
  sales_window_start?: string
  sales_window_end?: string
  error?: string
}

// 個人化打分
export interface PersonalizedScoreResult {
  total_score: number
  base_score: number
  life_palace_score: number
  yongshen_score: number
  weights_used: {
    base: number
    life_palace: number
    yongshen: number
  }
  breakdown: {
    life_palace_explain: string
    yongshen_detail: {
      matched: YongshenItem[]
      missed: Array<YongshenItem & { actual: string }>
      secondary_matched: YongshenItem[]
      primary_hit_rate?: string
    }
    plan_weights_used: string
  }
  plan_code: PlanCode
}

// 統一 API 回應格式
interface ApiResponse<T> {
  success: boolean
  data: T
  ai_prompt_format?: string
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function fetchV2<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })

  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.detail) errMsg = body.detail
    } catch {}
    throw new Error(`[qimen-v2] ${path} failed: ${errMsg}`)
  }

  const result: ApiResponse<T> = await res.json()
  if (!result.success) {
    throw new Error(`[qimen-v2] ${path} 回傳 success=false`)
  }

  return result.data
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return fetchV2<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function get<T>(path: string): Promise<T> {
  return fetchV2<T>(path, { method: 'GET' })
}

// ────────────────────────────────────────────────────────────
// API Client
// ────────────────────────────────────────────────────────────

export const qimenV2 = {
  /** Phase 0 API 健康檢查 */
  async health(): Promise<{ status: string; version: string }> {
    return get('/api/v2/health')
  },

  /**
   * 計算客戶年命宮（王鳳麟古法奇門遁甲派）
   */
  async lifePalace(params: {
    birth_year: number
    gender: Gender
  }): Promise<LifePalaceResult> {
    return post('/api/v2/life-palace', params)
  },

  /**
   * 九宮 → 完整方位資訊（8 方位 + 24 方位 + 度數 + 客戶面格式化）
   */
  async directionInfo(palace_num: number): Promise<DirectionInfoResult> {
    return post('/api/v2/direction-info', { palace_num })
  },

  /**
   * 查詢 E3 主題用神
   */
  async topicYongshen(topic: TopicCode): Promise<TopicYongshenResult> {
    return get(`/api/v2/topic-yongshen/${topic}`)
  },

  /**
   * 列出所有 8 類主題
   */
  async topicList(): Promise<{ topics: string[]; count: number; detail: Record<string, string> }> {
    return get('/api/v2/topic-yongshen')
  },

  /**
   * 查詢 E1 事件用神
   */
  async eventYongshen(event_type: EventTypeCode): Promise<EventYongshenResult> {
    return get(`/api/v2/event-yongshen/${event_type}`)
  },

  /**
   * 列出所有 14 類事件
   */
  async eventList(): Promise<{ events: string[]; count: number; detail: Record<string, string> }> {
    return get('/api/v2/event-yongshen')
  },

  /**
   * 關鍵字匹配事件類型（AI 分類第一層）
   */
  async eventMatch(text: string): Promise<EventMatchResult> {
    return post('/api/v2/event-match', { text })
  },

  /**
   * 查詢某公曆日的完整農曆資訊
   */
  async lunarInfo(dateISO: string): Promise<LunarDayInfo> {
    return post('/api/v2/lunar-info', { date_iso: dateISO })
  },

  /**
   * E2 購買時窗判定
   */
  async e2PurchaseWindow(
    datetimeISO: string,
  ): Promise<E2PurchaseWindowResult> {
    return post('/api/v2/lunar/e2-purchase-window', { datetime_iso: datetimeISO })
  },

  /**
   * E4 販售時窗判定
   */
  async e4SalesWindow(
    dateISO: string,
    window_days = 30,
  ): Promise<E4SalesWindowResult> {
    return post('/api/v2/lunar/e4-sales-window', { date_iso: dateISO, window_days })
  },

  /**
   * 個人化打分（E1/E2/E3/E4 共用）
   */
  async scorePersonalized(params: {
    plan_code: PlanCode
    base_score: number
    life_palace_num: number
    target_palace_num: number
    gong_data?: { door?: string; star?: string; shen?: string }
    topic?: TopicCode
    event_type?: EventTypeCode
  }): Promise<PersonalizedScoreResult> {
    return post('/api/v2/score-personalized', params)
  },

  /**
   * 列出方案權重配置
   */
  async planWeights(): Promise<{
    weights: Record<PlanCode, { base: number; life_palace: number; yongshen: number }>
    explanation: Record<PlanCode, string>
  }> {
    return get('/api/v2/plan-weights')
  },
}

/**
 * 便捷匯出（向後相容）
 */
export default qimenV2
