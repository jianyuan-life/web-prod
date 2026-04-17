// 前端 admin 專用 fetch wrapper（L7 P0 修復 2026-04-17）
// 目的：統一把 adminKey 以 x-admin-key header 傳給後端，不再塞到 URL query。

type AdminFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  adminKey: string
}

/**
 * 前端呼叫 admin API 時使用此函式。
 * 用法：
 *   const res = await adminFetch('/api/admin?range=7d', { adminKey })
 *   const res = await adminFetch('/api/admin/orders', { adminKey, method: 'PATCH', body: JSON.stringify({ id }) })
 */
export async function adminFetch(input: RequestInfo | URL, init: AdminFetchInit): Promise<Response> {
  const { adminKey, headers = {}, ...rest } = init
  const merged: Record<string, string> = {
    ...headers,
    'x-admin-key': adminKey,
  }
  // 若 body 是 JSON 字串，補 Content-Type
  if (rest.body && typeof rest.body === 'string' && !merged['Content-Type'] && !merged['content-type']) {
    merged['Content-Type'] = 'application/json'
  }
  return fetch(input, { ...rest, headers: merged })
}
