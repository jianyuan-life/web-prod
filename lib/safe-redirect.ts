// Open Redirect 防護共用模組（L7 P0 修復 2026-04-17）
// 目的：擋掉 //evil.com、/\evil.com、/evil.com 等常見繞過手法
//
// 只接受：
// 1. 空字串、以 / 開頭且不是 // 或 /\ 開頭的相對路徑
// 2. 第一段不含 . （避免 /evil.com 形式）

const DEFAULT_SAFE_PATH = '/dashboard'

/**
 * 驗證 redirect 參數並回傳安全路徑
 * - 空白 → fallback
 * - 不是 / 開頭 → fallback（防止 http://、javascript:、data: 等 scheme）
 * - 以 // 或 /\ 開頭 → fallback（防止 protocol-relative URL 和 backslash trick）
 * - /xxx.xxx 第一段含點（視為 domain）→ fallback
 * - 含換行、Tab、控制字元 → fallback
 */
export function getSafeRedirect(raw: string | null | undefined, fallback: string = DEFAULT_SAFE_PATH): string {
  const target = (raw || '').trim()
  if (!target) return fallback

  // 控制字元（含 \n、\r、\t 等）
  if (/[\x00-\x1F\x7F]/.test(target)) return fallback

  // 必須以 / 開頭
  if (!target.startsWith('/')) return fallback

  // 擋 protocol-relative URL：//evil.com
  if (target.startsWith('//')) return fallback

  // 擋 backslash trick：/\evil.com（瀏覽器會當成 \\ 協議）
  if (target.startsWith('/\\') || target.startsWith('/%5C') || target.startsWith('/%5c')) {
    return fallback
  }

  // 擋 /evil.com 這種第一段是 domain 的形式
  // （先取出第一段路徑，看是否含有 .）
  const firstSegment = target.slice(1).split(/[/?#]/)[0]
  if (firstSegment.includes('.')) return fallback

  // 擋 URL encoded 的雙斜線 /%2f...
  if (/^\/%2[fF]/.test(target)) return fallback

  return target
}
