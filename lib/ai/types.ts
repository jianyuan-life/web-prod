// ============================================================
// 鑑源 AI 團隊 — 統一型別定義
// ============================================================
// 所有 LLM provider 都實作 LLMProvider 介面
// 所有角色（主筆、命理官、結構官…）都回傳 RoleResult

export type ProviderName =
  | 'anthropic'  // Claude
  | 'openai'     // GPT
  | 'google'     // Gemini
  | 'alibaba'    // Qwen
  | 'moonshot'   // Kimi
  | 'deepseek'   // DeepSeek

export type RoleName =
  | 'author'               // 主筆（Claude）
  | 'astrology-validator'  // 命理官（Qwen）
  | 'structure-architect'  // 結構官（Gemini）
  | 'ux-advocate'          // UX 官（GPT）
  | 'logic-checker'        // 推理官（DeepSeek）
  | 'summarizer'           // 壓縮 UI 版（Kimi / Claude Haiku）

export interface LLMRequest {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  seed?: number
  jsonMode?: boolean
}

export interface LLMResponse {
  content: string
  model: string
  provider: ProviderName
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
  costUsd: number
  // 失敗時的錯誤訊息（和 content 互斥）
  error?: string
}

export interface LLMProvider {
  name: ProviderName
  defaultModel: string
  supportedModels: string[]
  /**
   * 實際呼叫模型。失敗時在 response 內填 error 而非 throw，方便降級邏輯統一處理。
   */
  generate(req: LLMRequest & { model?: string }): Promise<LLMResponse>
  /**
   * 健康檢查（發一個短 ping，< 2 秒）
   */
  healthCheck(): Promise<boolean>
  /**
   * 計算成本（USD）
   */
  estimateCost(promptTokens: number, completionTokens: number, model?: string): number
}

// ============================================================
// Peer Review 的通用評分格式
// ============================================================
export interface ReviewResult {
  score: number          // 0-100
  issues: string[]       // 問題清單（空陣列代表完美）
  strengths: string[]    // 優點
  suggestions: string[]  // 修改建議
  reviewer: RoleName
  reviewerModel: string
  latencyMs: number
  costUsd: number
}

// ============================================================
// Pipeline 中間狀態
// ============================================================
export interface PipelineContext {
  reportId: string
  planCode: 'C' | 'D' | 'G15' | 'R' | 'E1' | 'E2'
  birthData: Record<string, unknown>
  chartData: Record<string, unknown>        // Python 排盤 JSON（唯一真相）
  retrievedRules: RetrievedRule[]           // RAG 檢索結果
  draft: string                              // 主筆輸出
  reviews: ReviewResult[]                    // 三方審查結果
  retryCount: number
  finalReport?: string
  uiSummary?: string
  pdfUrl?: string
  status: 'drafting' | 'reviewing' | 'revising' | 'finalized' | 'failed'
  errorMessage?: string
}

export interface RetrievedRule {
  id: string
  text: string
  source: string    // 古籍出處，例：《滴天髓》卷三
  similarity: number
}

// ============================================================
// 熔斷器狀態
// ============================================================
export interface CircuitBreakerState {
  provider: ProviderName
  failures: number
  lastFailAt: number | null
  openedAt: number | null  // 熔斷開啟時間
  status: 'closed' | 'open' | 'half-open'
}
