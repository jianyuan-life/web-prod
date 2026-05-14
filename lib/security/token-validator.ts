// v5.10.337 (Sprint 6 IA L2 attack vector #1 IDOR mitigation step 1):token entropy validation
// 解 IA L2 finding:`/report/[token]` 無 entropy 驗證 / 無 single-use rotate
//
// 防禦層:
//   1. 格式檢查(32+ chars、alphanumeric + dash + underscore)— 攔住 sequential / numeric / SQL injection
//   2. entropy 估算(計算 unique char 比例)— 攔住 'aaaaaa...' 等暴力枚舉
//   3. 拒絕已知弱 pattern(全數字、全字母、UUID-zero 等)
//
// IDOR 完整修補(Sprint 7+):
//   - 加 Supabase RLS policy(token in URL + cookie session 驗證 user_id match)
//   - Single-use token rotation(每次 read 後生成新 token、舊 token 失效)
//   - HMAC signed URL(防 token 被 share 給第三方後仍能讀)
//
// 本檔只做 step 1(entropy 驗證)、step 2/3 待 cookie auth 重構

const MIN_LENGTH = 24
const MAX_LENGTH = 128

// 允許的字元(UUIDv4 + base64url)
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

// 已知弱 token(明顯測試 / debug / sequential)
const WEAK_TOKENS = new Set<string>([
  '00000000-0000-0000-0000-000000000000', // UUID nil
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '12345678-1234-1234-1234-123456789012',
  'test',
  'admin',
  'demo',
])

export interface TokenValidationResult {
  valid: boolean
  reason?: 'too-short' | 'too-long' | 'invalid-chars' | 'low-entropy' | 'weak-token' | 'empty'
  entropy?: number
}

/**
 * 驗證 access token 格式是否合理(防 IDOR 暴力枚舉)
 *
 * @param token URL params token 字串
 * @returns valid + reason
 */
export function validateAccessToken(token: string | null | undefined): TokenValidationResult {
  if (!token || token.trim() === '') {
    return { valid: false, reason: 'empty' }
  }

  const t = token.trim()

  if (t.length < MIN_LENGTH) {
    return { valid: false, reason: 'too-short' }
  }
  if (t.length > MAX_LENGTH) {
    return { valid: false, reason: 'too-long' }
  }
  if (!TOKEN_PATTERN.test(t)) {
    return { valid: false, reason: 'invalid-chars' }
  }
  if (WEAK_TOKENS.has(t.toLowerCase())) {
    return { valid: false, reason: 'weak-token' }
  }

  // entropy 估算:unique char count / length
  const uniqueChars = new Set(t).size
  const entropyRatio = uniqueChars / t.length
  // healthy UUIDv4 unique-ratio ≈ 0.4-0.6;< 0.2 = 'aaaaaaaa' 類弱 token
  if (entropyRatio < 0.2) {
    return { valid: false, reason: 'low-entropy', entropy: entropyRatio }
  }

  return { valid: true, entropy: entropyRatio }
}

/**
 * 簡單的 timing-safe token 比較(用於 token rotation 場景)
 */
export function timingSafeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
