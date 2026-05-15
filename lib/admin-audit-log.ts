// 後台稽核日誌共用模組（L7 P0 修復 2026-04-17）
// 目的：所有 /api/admin/* 的敏感寫入動作（退款、發積分、刪除）都要留痕
//
// 對應 migration：supabase/migrations/create_admin_audit_log.sql
// Table: admin_audit_log
// 欄位：id / action / target_type / target_id / metadata (jsonb) / ip / user_agent / created_at

import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

export type AdminAction =
  | 'login'
  | 'refund'                  // Stripe 退款
  | 'grant_points'            // 手動發放積分
  | 'deduct_points'           // 扣除積分
  | 'delete_coupon'
  | 'update_coupon'
  | 'create_coupon'
  | 'delete_promotion'
  | 'update_promotion'
  | 'create_promotion'
  | 'retry_report'            // 強制重跑報告
  | 'resend_email'
  | 'block_user'
  | 'unblock_user'
  | 'delete_user'
  | 'update_order_status'
  | 'create'                  // 通用：建立（會計 expense 等）
  | 'update'                  // 通用：更新（v5.3.5）
  | 'delete'                  // 通用：刪除
  | 'deactivate'              // 軟刪（停用訂閱等，v5.3.5）
  | 'backfill'                // 歷史回填（v5.3.5）

export type AdminTargetType =
  | 'user'
  | 'order'
  | 'report'
  | 'coupon'
  | 'promotion'
  | 'referral'
  | 'points'
  | 'refund'
  | 'expense'                 // 會計系統：支出記錄
  | 'revenue'                 // 會計系統：收入記錄
  | 'fixed_subscription'      // 固定訂閱（v5.3.5）
  | 'fixed_subscriptions'     // 固定訂閱批次（v5.3.5）
  | 'anthropic_historical'    // Anthropic 歷史回填（v5.3.5）
  | 'system'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function getSupabase() {
  return createServiceClient()
}

/**
 * 寫入一筆稽核紀錄。失敗不拋錯（避免阻擋業務流程），但會 console.error。
 *
 * @param req NextRequest（用來拿 IP 和 User-Agent）
 * @param action 動作類型
 * @param targetType 目標類型（可選）
 * @param targetId 目標 ID（可選）
 * @param metadata 額外資料（可選，寫入 jsonb）
 */
export async function writeAuditLog(
  req: NextRequest,
  action: AdminAction,
  targetType?: AdminTargetType | null,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('admin_audit_log').insert({
      action,
      target_type: targetType || null,
      target_id: targetId ? String(targetId) : null,
      metadata: metadata || {},
      ip: getClientIp(req),
      user_agent: req.headers.get('user-agent') || null,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit-log] 寫入失敗:', err)
  }
}
