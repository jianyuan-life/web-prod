// 後台管理認證共用模組（L7 P0 修復 2026-04-17）
// 目的：
// 1. ADMIN_KEY 改用 x-admin-key header（不再暴露在 URL query）
// 2. 比對改用 timingSafeEqual 防止時序攻擊
// 3. 搭配 admin-rate-limit 做暴破防護
// 4. 與 admin-audit-log 串接留痕

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

// 延遲讀取 env var，避免建置時 env 未設定誤觸發
function getAdminKey(): string {
  return process.env.ADMIN_KEY || ''
}

/**
 * 時序安全的字串比對（防止 timing attack）
 * - 長度不同直接回 false（但仍走一次假比對保持時間一致）
 * - Buffer 長度必須相同才能餵給 timingSafeEqual
 */
export function safeCompare(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // 做一次等長假比對避免短路揭露長度差
    const dummy = Buffer.alloc(b.length)
    try { timingSafeEqual(dummy, b) } catch { /* noop */ }
    return false
  }
  return timingSafeEqual(a, b)
}

/**
 * 從 request 取出 admin key（優先 header，其次 body 裡的 key 欄位）
 * 不再接受 URL query 中的 key（避免被 Vercel/Cloudflare/Supabase 記錄）
 *
 * @param req NextRequest
 * @param bodyKey 從 POST/PATCH/DELETE 的 body 裡取出的 key 值（部分 API 走 body）
 */
export function extractAdminKey(req: NextRequest, bodyKey?: string | null): string {
  // 1. 優先讀 header（推薦路徑）
  const headerKey = req.headers.get('x-admin-key')
  if (headerKey) return headerKey
  // 2. fallback：body 裡的 key（給 POST/PATCH/DELETE 用，不從 URL 讀）
  if (bodyKey) return bodyKey
  return ''
}

/**
 * 統一的後台認證檢查函式
 * - 取出 key → timingSafeEqual 比對 → 通過回 null，失敗回 403 NextResponse
 * - 呼叫方式：const authFail = checkAdminAuth(req); if (authFail) return authFail;
 *
 * @param req NextRequest
 * @param bodyKey 可選的 body 裡的 key（向後相容舊 API）
 */
export function checkAdminAuth(
  req: NextRequest,
  bodyKey?: string | null,
): NextResponse | null {
  const adminKey = getAdminKey()
  if (!adminKey) {
    // env 未設定一律拒絕（不能因為 env 空就放行）
    return NextResponse.json({ error: 'ADMIN_KEY 未設定' }, { status: 500 })
  }
  const provided = extractAdminKey(req, bodyKey)
  if (!safeCompare(provided, adminKey)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }
  return null
}

/**
 * 只驗證不產生 response（供內部需要條件判斷的情境用）
 */
export function isAdminAuthed(req: NextRequest, bodyKey?: string | null): boolean {
  const adminKey = getAdminKey()
  if (!adminKey) return false
  const provided = extractAdminKey(req, bodyKey)
  return safeCompare(provided, adminKey)
}
