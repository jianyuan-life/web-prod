// ============================================================
// Provider Registry 入口
// ============================================================
// 匯出所有 provider，並在 import 時自動註冊到 registry
// 使用方式：
//   import './providers'  // 只為了 side-effect 註冊
//   或
//   import { claudeProvider, openaiProvider, ... } from './providers'

import { registerProvider } from '../provider-registry'
import { claudeProvider } from './claude'
import { openaiProvider } from './openai'
import { geminiProvider } from './gemini'
import { qwenProvider } from './qwen'
import { deepseekProvider } from './deepseek'

// 自動註冊（模組載入時執行一次）
registerProvider(claudeProvider)
registerProvider(openaiProvider)
registerProvider(geminiProvider)
registerProvider(qwenProvider)
registerProvider(deepseekProvider)

export {
  claudeProvider,
  openaiProvider,
  geminiProvider,
  qwenProvider,
  deepseekProvider,
}

export const allProviders = [
  claudeProvider,
  openaiProvider,
  geminiProvider,
  qwenProvider,
  deepseekProvider,
]
