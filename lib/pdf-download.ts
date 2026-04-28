// v5.3.24：PDF 下載 URL + 檔名 helper（server/client 兩邊都能用）
// 之前放在 ReportClientButtons.tsx（'use client'），page.tsx（server）import 會出錯：
//   "Attempted to call buildPdfDownloadUrl() from the server but is on the client"
// 搬到這裡（無 'use client'）就兩邊通用

const PLAN_NAME_MAP: Record<string, string> = {
  C: '人生藍圖',
  D: '心之所惑',
  G15: '家族藍圖',
  R: '合否',
  E1: '事件擇吉',
  E2: '月度單盤',
}

export function buildPdfDownloadUrl(pdfUrl: string, planCode?: string, clientName?: string): string {
  if (!pdfUrl) return pdfUrl
  const planName = (planCode && PLAN_NAME_MAP[planCode]) || '命理報告'
  const cleanName = (clientName || '客戶').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 30) || '客戶'
  const filename = `${planName}_${cleanName}.pdf`
  const sep = pdfUrl.includes('?') ? '&' : '?'
  return `${pdfUrl}${sep}download=${encodeURIComponent(filename)}`
}

export function buildPdfDownloadFilename(planCode?: string, clientName?: string): string {
  const planName = (planCode && PLAN_NAME_MAP[planCode]) || '命理報告'
  const cleanName = (clientName || '客戶').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 30) || '客戶'
  return `${planName}_${cleanName}.pdf`
}
