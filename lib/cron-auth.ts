// v5.10.279 P0 修(Codex L3 backend audit P0#3):cron 認證 fail-closed helper
//
// Pre-fix state(本 helper 加之前):
//   10 個 /api/cron/* 全用 `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)`
//   若 CRON_SECRET 未設或空字串:
//     - template literal "Bearer undefined" 或 "Bearer " 仍可比對
//     - attacker 送 `Authorization: Bearer undefined` 或 `Bearer ` bypass
//   雖 production env 已設、但 dev/preview/staging 可能未設、屬 fail-open
//
// 本 helper:fail-closed pattern、CRON_SECRET 缺即拒、不可 bypass
//
// 用法:
//   const authFail = checkCronAuth(req)
//   if (authFail) return authFail
//   ... 主邏輯 ...

import { NextRequest, NextResponse } from 'next/server'

export function checkCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  // 必先檢查 CRON_SECRET 存在 + 非空(fail-closed)
  if (!cronSecret || cronSecret.trim().length < 16) {
    console.error('[cron-auth] CRON_SECRET 未設定或太短(< 16 char)、拒絕 cron 觸發')
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  const authHeader = req.headers.get('authorization')
  // Constant-time compare(防 timing attack、小規模 OK 不嚴格 constant-time)
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 通過、繼續
  return null
}
