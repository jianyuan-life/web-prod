// v5.10.327 (P0 #3 Bot Defense — CAPTCHA stub)
// Cloudflare Turnstile server-side verification helper(免費、無 user-friction、可取代 reCAPTCHA)
//
// 啟用步驟(待老闆 / 自註冊 cloudflare.com 後):
//   1. https://dash.cloudflare.com/?to=/:account/turnstile 建 site key
//   2. 設環境變數 TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY
//   3. 前端表單嵌 <Turnstile siteKey={...} onVerify={...} /> component(待 Sprint 5 寫)
//   4. API route 收到 form 時呼叫 verifyTurnstileToken()
//
// 沒設 env 時:verifyTurnstileToken() 直接 return { success: true }(stub mode、開發友好)
// 有設 env 時:呼叫 Cloudflare /siteverify、過了才放行

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
  // stub mode 標記(沒設 secret 時 = true)
  stub?: boolean
}

/**
 * 驗證 client 提交的 Turnstile token
 * @param token 前端 turnstile widget 收到的 cf-turnstile-response
 * @param remoteip(可選)client IP、CF 用來防 token replay
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteip?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  // Stub mode:沒設 secret 直接放行(開發環境 / Sprint 5 前)
  if (!secret) {
    return { success: true, stub: true }
  }

  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  try {
    const formData = new FormData()
    formData.append('secret', secret)
    formData.append('response', token)
    if (remoteip) formData.append('remoteip', remoteip)

    const res = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      return { success: false, errorCodes: [`http-${res.status}`] }
    }

    const data = await res.json()

    return {
      success: Boolean(data.success),
      errorCodes: data['error-codes'],
      challenge_ts: data.challenge_ts,
      hostname: data.hostname,
      action: data.action,
      cdata: data.cdata,
    }
  } catch (err) {
    console.warn('[turnstile] verify failed', err)
    return { success: false, errorCodes: ['internal-error'] }
  }
}

/**
 * 取得 client side 用的 Turnstile site key(public、可暴露)
 */
export function getTurnstilePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
}

/**
 * 是否已啟用 Turnstile(看 env)
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}
