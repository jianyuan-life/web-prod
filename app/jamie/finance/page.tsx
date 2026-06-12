// v5.10.446:補 /jamie/finance 父路由(原只有 /jamie/finance/kpi、父層 404、UI 稽核 P1-1)
// 導向實際存在的 KPI 頁、避免管理員手打 /jamie/finance 撞 404
import { redirect } from 'next/navigation'

export default function FinanceIndexPage() {
  redirect('/jamie/finance/kpi')
}
