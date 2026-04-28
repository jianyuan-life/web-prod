// v5.3.24：PDF 下載 URL + 檔名 helper（server/client 兩邊都能用）
// 之前放在 ReportClientButtons.tsx（'use client'），page.tsx（server）import 會出錯：
//   "Attempted to call buildPdfDownloadUrl() from the server but is on the client"
// 搬到這裡（無 'use client'）就兩邊通用

// v5.7.13:改 import lib/plan-names 集中管理(IA round 7 P0)
import { PLAN_NAMES } from '@/lib/plan-names'

// PDF 檔名用、PLAN_NAMES 直接用、R 方案 PDF 檔名特殊化(去問號)
const PLAN_NAME_MAP: Record<string, string> = {
  ...PLAN_NAMES,
  R: '合否',  // PDF 檔名不帶問號(避免某些 OS filename invalid)
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
