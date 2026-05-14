// v5.10.336 (Sprint 6 IA L2 half-fix #2 修):Bot fingerprint
// 解 IA #2:bot-detect.ts 只看 UA 字串、attacker 改 UA 即繞、防新手不防中級
//
// JA3 fingerprint:TLS handshake hash(client 改 UA 但 TLS stack 難改)
// - Cloudflare Pro tier 自動帶 cf-bot-score(1-99、低分 = 高機率 bot)
// - Vercel Bot ID(beta)會帶 x-vercel-bot-score
// - JA3 需要 Cloudflare Enterprise tier 才能 expose 給 Worker
//
// 本 helper 沒設環境變數時 stub mode:回 unknown / 不阻擋

import type { NextRequest } from 'next/server'

export interface FingerprintResult {
  /** Cloudflare bot score(0=明顯 bot、99=明顯 human、null=無資料) */
  cfBotScore: number | null
  /** Cloudflare verified bot category(googlebot 等) */
  cfVerifiedBot: string | null
  /** Cloudflare threat score(0-100、越高越危險) */
  cfThreatScore: number | null
  /** Vercel Bot ID score(beta) */
  vercelBotScore: number | null
  /** JA3 hash(若 enterprise tier 有開) */
  ja3Hash: string | null
  /** 整體判斷(human/bot/suspicious/unknown) */
  verdict: 'human' | 'bot' | 'suspicious' | 'unknown'
}

/**
 * 解析多個邊緣 platform 的 bot fingerprint header
 *
 * Cloudflare 提供(需 Pro+ tier 開):
 * - cf-bot-score: 1-99(< 30 = 高機率 bot)
 * - cf-verified-bot: googlebot / bingbot 等(空 = 非已驗證 bot)
 * - cf-threat-score: 0-100(> 50 = 高威脅)
 *
 * Vercel Bot ID(beta、需 dashboard 啟用):
 * - x-vercel-bot-score: 0-100
 *
 * Header 名稱可能因 tier 變、安全 fallback 為 null
 */
export function getFingerprint(req: NextRequest | Request): FingerprintResult {
  const headers =
    'headers' in req && typeof (req as NextRequest).headers.get === 'function'
      ? (req as NextRequest).headers
      : (req as Request).headers

  const cfBotScoreRaw = headers.get('cf-bot-score')
  const cfBotScore = cfBotScoreRaw ? parseInt(cfBotScoreRaw, 10) : null

  const cfThreatRaw = headers.get('cf-threat-score')
  const cfThreatScore = cfThreatRaw ? parseInt(cfThreatRaw, 10) : null

  const vercelBotScoreRaw = headers.get('x-vercel-bot-score')
  const vercelBotScore = vercelBotScoreRaw ? parseInt(vercelBotScoreRaw, 10) : null

  const cfVerifiedBot = headers.get('cf-verified-bot') || null
  const ja3Hash = headers.get('cf-ja3') || headers.get('cf-ja3-hash') || null

  // 判斷:多 signal 投票
  let verdict: FingerprintResult['verdict'] = 'unknown'

  // 已驗證的善意 bot(Google/Bing 等)→ 視為 human
  if (cfVerifiedBot) {
    verdict = 'human'
  } else if (
    (cfBotScore !== null && cfBotScore < 30) ||
    (vercelBotScore !== null && vercelBotScore < 30)
  ) {
    verdict = 'bot'
  } else if (
    (cfThreatScore !== null && cfThreatScore > 50) ||
    (cfBotScore !== null && cfBotScore < 50)
  ) {
    verdict = 'suspicious'
  } else if (
    (cfBotScore !== null && cfBotScore >= 50) ||
    (vercelBotScore !== null && vercelBotScore >= 50)
  ) {
    verdict = 'human'
  }

  return {
    cfBotScore,
    cfVerifiedBot,
    cfThreatScore,
    vercelBotScore,
    ja3Hash,
    verdict,
  }
}

/**
 * 依 fingerprint 判斷是否該封鎖
 * - bot verdict + 非 verified-bot → 阻擋(403)
 * - suspicious 不阻擋、但記 log + 可加 challenge(Turnstile)
 */
export function shouldBlockByFingerprint(fp: FingerprintResult): boolean {
  return fp.verdict === 'bot' && !fp.cfVerifiedBot
}
