import { NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '@/lib/auth-helper'
import { G15_SELECTION_COLUMNS } from '@/lib/checkout/prepare-checkout-birth-data'
import {
  G15_CONSENT_IDENTITY_LIMITATION,
  buildG15ConsentInvitationBatch,
} from '@/lib/checkout/g15-consent-invitations'
import {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
} from '@/lib/checkout/g15-independent-consent'
import { validateG15Selection } from '@/lib/checkout/validate-g15-selection'
import { sendEmailWithRetry } from '@/lib/resend-helper'
import { createServiceClient } from '@/lib/supabase'
import { validateAccessToken } from '@/lib/security/token-validator'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store, private')
  return NextResponse.json(body, { ...init, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

type ExactReportLocator = { column: 'id' | 'access_token'; value: string }

function exactReportLocator(value: unknown, siteUrl: string): ExactReportLocator | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (UUID_PATTERN.test(raw)) return { column: 'id', value: raw.toLowerCase() }
  let token = raw
  if (/^https?:\/\//iu.test(raw)) {
    try {
      const candidate = new URL(raw)
      const expected = new URL(siteUrl)
      if (candidate.origin !== expected.origin || candidate.search || candidate.hash) return null
      const match = /^\/report\/([^/]+)\/?$/u.exec(candidate.pathname)
      token = match ? decodeURIComponent(match[1]) : ''
    } catch {
      return null
    }
  }
  return token === token.trim() && validateAccessToken(token).valid
    ? { column: 'access_token', value: token }
    : null
}

function invitationHtml(name: string, actionUrl: string, expiresAt: string): string {
  const safeName = escapeHtml(name)
  const safeUrl = escapeHtml(actionUrl)
  const safeExpiry = escapeHtml(new Date(expiresAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }))
  return `<!doctype html><html lang="zh-Hant"><body style="font-family:system-ui,sans-serif;line-height:1.7;color:#1d2433">
    <h1 style="font-size:22px">家族藍圖資料使用邀請</h1>
    <p>${safeName}，有人希望把您既有的人生藍圖納入一份家族藍圖。</p>
    <p>用途只限產生這次家族藍圖；共同閱讀範圍是整理後的家庭互動摘要，不公開您的原始出生資料或個人報告全文。</p>
    <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#8b641f;color:#fff;text-decoration:none;border-radius:8px">查看、同意或撤回</a></p>
    <p>連結將於 ${safeExpiry}（香港時間）到期。您可以拒絕；即使同意，也能在付款前用同一封信中的連結撤回。</p>
    <p>${escapeHtml(G15_CONSENT_IDENTITY_LIMITATION)}</p>
    <p>若您不認識邀請者，請不要操作並直接刪除本信。</p>
  </body></html>`
}

function invitationText(name: string, actionUrl: string, expiresAt: string): string {
  return [
    `${name}，有人希望把您既有的人生藍圖納入一份家族藍圖。`,
    '用途只限產生這次家族藍圖；共同閱讀範圍是整理後的家庭互動摘要，不公開您的原始出生資料或個人報告全文。',
    `查看、同意或撤回：${actionUrl}`,
    `連結到期：${new Date(expiresAt).toISOString()}`,
    G15_CONSENT_IDENTITY_LIMITATION,
    '若您不認識邀請者，請不要操作並直接刪除本信。',
  ].join('\n\n')
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth.userId || !auth.email) {
    return noStoreJson({ error: '請先登入再邀請家庭成員' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return noStoreJson({ error: '邀請資料格式不正確' }, { status: 400 })
  }
  if (!isRecord(body) || !Array.isArray(body.members) || typeof body.requestKey !== 'string') {
    return noStoreJson({ error: '邀請資料格式不正確' }, { status: 400 })
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jianyuan.life'
  const members = body.members.filter(isRecord).map((member) => ({
    locator: exactReportLocator(member.reportLocator ?? member.reportAccessToken, siteUrl),
  }))
  if (
    members.length !== body.members.length
    || members.length < 2
    || members.length > 8
    || members.some((member) => !member.locator)
    || new Set(members.map((member) => `${member.locator?.column}:${member.locator?.value}`)).size !== members.length
  ) {
    return noStoreJson({ error: '請提供 2 至 8 份不重複的人生藍圖私人存取連結或存取碼' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const resolvedReports: Array<Record<string, unknown>> = []
  for (const member of members) {
    if (!member.locator) {
      return noStoreJson({ error: '成員報告定位資料無效' }, { status: 400 })
    }
    const result = await supabase
      .from('paid_reports')
      .select(G15_SELECTION_COLUMNS)
      .eq(member.locator.column, member.locator.value)
      .maybeSingle()
    if (result.error) {
      return noStoreJson({ error: '目前無法驗證成員報告，未建立任何邀請' }, { status: 503 })
    }
    if (!isRecord(result.data)) {
      return noStoreJson({ error: '其中一份私人報告連結無效或不符合家族藍圖條件' }, { status: 400 })
    }
    resolvedReports.push(result.data)
  }
  const resolvedReportIds = resolvedReports.map((report) => String(report.id || '').toLowerCase())
  const validation = await validateG15Selection({
    selectedReportIds: resolvedReportIds,
    auth,
    ownershipMode: 'independent-subjects',
    queryReports: async () => ({
      data: resolvedReports as never,
      error: null,
    }),
  })
  if (!validation.ok) {
    const status = validation.code === 'AUTH_REQUIRED' ? 401
      : validation.code === 'FORBIDDEN' ? 403
        : validation.code === 'QUERY_FAILED' ? 503
          : 400
    return noStoreJson({ error: validation.message }, { status })
  }

  const trustedMembers: Array<{
    reportId: string
    subjectUserId: string
    name: string
    canonicalEmail: string
  }> = []
  for (let index = 0; index < validation.reportIds.length; index += 1) {
    const subjectUserId = validation.subjectUserIds[index]
    const accountResult = await supabase.auth.admin.getUserById(subjectUserId)
    const account = accountResult.data?.user
    if (accountResult.error) {
      return noStoreJson({ error: '目前無法驗證報告擁有者帳號，未建立任何邀請' }, { status: 503 })
    }
    if (
      !account
      || account.id.toLowerCase() !== subjectUserId
      || typeof account.email !== 'string'
      || !account.email
      || !account.email_confirmed_at
    ) {
      return noStoreJson({ error: '成員報告必須綁定已確認 Email 的擁有者帳號' }, { status: 400 })
    }
    trustedMembers.push({
      reportId: validation.reportIds[index],
      subjectUserId,
      name: validation.memberNames[index],
      canonicalEmail: account.email,
    })
  }
  const hmacSecret = process.env.G15_CONSENT_EMAIL_HMAC_SECRET || ''
  if (Buffer.byteLength(hmacSecret, 'utf8') < 32) {
    return noStoreJson(
      { error: '逐位成員同意服務尚未安全設定，暫時不能建立家族藍圖邀請' },
      { status: 503 },
    )
  }

  let batch: ReturnType<typeof buildG15ConsentInvitationBatch>
  try {
    batch = buildG15ConsentInvitationBatch({
      members: trustedMembers,
      purchaserUserId: auth.userId,
      requestKey: body.requestKey,
      siteUrl,
      emailHmacSecret: hmacSecret,
    })
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : '邀請資料格式不正確' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc(
    'create_or_replace_g15_consent_selection',
    batch.rpcArgs,
  )
  const rows = Array.isArray(data) ? data : data ? [data] : []
  const allowedOutcomes = new Set(['created', 'rotated', 'already'])
  const returnedIds = new Set(rows.map((row) => isRecord(row) ? String(row.subject_report_id || '').toLowerCase() : ''))
  const selectionIds = new Set(rows.map((row) => isRecord(row) ? String(row.selection_id || '').toLowerCase() : ''))
  const persistedExpiries = new Set(rows.map((row) => isRecord(row) ? String(row.selection_expires_at || '') : ''))
  if (
    error
    || rows.length !== validation.reportIds.length
    || returnedIds.size !== validation.reportIds.length
    || validation.reportIds.some((id) => !returnedIds.has(id))
    || selectionIds.size !== 1
    || [...selectionIds].some((id) => !UUID_PATTERN.test(id))
    || persistedExpiries.size !== 1
    || [...persistedExpiries].some((expiresAt) => !Number.isFinite(Date.parse(expiresAt)))
    || rows.some((row) => !isRecord(row) || !allowedOutcomes.has(String(row.outcome)))
  ) {
    return noStoreJson(
      { error: '逐位成員同意服務暫時無法建立邀請，未寄出任何信件' },
      { status: 503 },
    )
  }

  const persistedExpiresAt = [...persistedExpiries][0]
  const rowByReport = new Map(rows.map((row) => [String(row.subject_report_id).toLowerCase(), row]))
  const deliveryResults: Array<{ reportId: string; status: 'sent' | 'failed' | 'unchanged' }> = []
  for (const delivery of batch.deliveries) {
    const row = rowByReport.get(delivery.reportId)
    const outcome = isRecord(row) ? String(row.outcome) : ''
    if (!['created', 'rotated'].includes(outcome)) {
      deliveryResults.push({ reportId: delivery.reportId, status: 'unchanged' })
      continue
    }
    const sendResult = await sendEmailWithRetry({
      from: '鑒源命理 <noreply@jianyuan.life>',
      to: delivery.toEmail,
      subject: '家族藍圖資料使用邀請',
      html: invitationHtml(delivery.name, delivery.actionUrl, persistedExpiresAt),
      text: invitationText(delivery.name, delivery.actionUrl, persistedExpiresAt),
      emailType: 'other',
      metadata: {
        workflow: 'g15_independent_member_consent',
        policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
      },
    })
    deliveryResults.push({
      reportId: delivery.reportId,
      status: sendResult.success ? 'sent' : 'failed',
    })
  }

  const selectionId = [...selectionIds][0]
  const allAccepted = rows.every((row) => isRecord(row) && row.receipt_status === 'accepted')
  return noStoreJson({
    selectionId,
    expiresAt: persistedExpiresAt,
    policyVersion: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    purpose: G15_CONSENT_PURPOSE,
    sharingScope: G15_CONSENT_SHARING_SCOPE,
    identityLimitation: G15_CONSENT_IDENTITY_LIMITATION,
    members: validation.reportIds.map((reportId, index) => ({
      slot: index + 1,
      status: String((rowByReport.get(reportId) as Record<string, unknown>).receipt_status),
      delivery: deliveryResults.find((item) => item.reportId === reportId)?.status ?? 'failed',
      ...(allAccepted ? { reportId, name: validation.memberNames[index] } : {}),
    })),
  })
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth.userId) return noStoreJson({ error: '請先登入' }, { status: 401 })

  const selectionId = new URL(req.url).searchParams.get('selectionId')?.trim().toLowerCase() || ''
  if (!UUID_PATTERN.test(selectionId)) {
    return noStoreJson({ error: '同意紀錄識別碼無效' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const selectionResult = await supabase
    .from('g15_consent_selections')
    .select('id,purchaser_user_id,selected_report_ids,policy_version,purpose,sharing_scope,expires_at,superseded_at')
    .eq('id', selectionId)
    .eq('purchaser_user_id', auth.userId)
    .maybeSingle()
  if (selectionResult.error) {
    return noStoreJson({ error: '目前無法讀取逐位同意狀態' }, { status: 503 })
  }
  if (!selectionResult.data) return noStoreJson({ error: '找不到逐位同意紀錄' }, { status: 404 })

  const receiptsResult = await supabase
    .from('g15_consent_receipts')
    .select('subject_report_id,status,accepted_at,revoked_at,expires_at')
    .eq('selection_id', selectionId)
  if (receiptsResult.error || !Array.isArray(receiptsResult.data)) {
    return noStoreJson({ error: '目前無法讀取逐位同意狀態' }, { status: 503 })
  }
  const reportIds = Array.isArray(selectionResult.data.selected_report_ids)
    ? selectionResult.data.selected_report_ids.map((id: unknown) => String(id).toLowerCase())
    : []
  const receiptByReport = new Map(receiptsResult.data.map((row) => [String(row.subject_report_id).toLowerCase(), row]))
  const selectionExpired = Boolean(selectionResult.data.superseded_at)
    || Date.parse(String(selectionResult.data.expires_at)) <= Date.now()
  const allAccepted = !selectionExpired && reportIds.length >= 2 && reportIds.every((reportId) => {
    const receipt = receiptByReport.get(reportId)
    return receipt?.status === 'accepted' && Date.parse(String(receipt.expires_at)) > Date.now()
  })
  let names = new Map<string, string>()
  if (allAccepted) {
    const namesResult = await supabase
      .from('paid_reports')
      .select('id,client_name')
      .in('id', reportIds)
    if (namesResult.error || !Array.isArray(namesResult.data)) {
      return noStoreJson({ error: '目前無法讀取逐位同意狀態' }, { status: 503 })
    }
    names = new Map(namesResult.data.map((row) => [String(row.id).toLowerCase(), String(row.client_name || '')]))
  }
  return noStoreJson({
    selectionId,
    expiresAt: selectionResult.data.expires_at,
    policyVersion: selectionResult.data.policy_version,
    purpose: selectionResult.data.purpose,
    sharingScope: selectionResult.data.sharing_scope,
    identityLimitation: G15_CONSENT_IDENTITY_LIMITATION,
    members: reportIds.map((reportId, index) => {
      const receipt = receiptByReport.get(reportId)
      const expired = selectionExpired || !receipt || Date.parse(String(receipt.expires_at)) <= Date.now()
      return {
        slot: index + 1,
        ...(allAccepted ? { reportId, name: names.get(reportId) || '' } : {}),
        status: expired ? 'expired' : String(receipt.status),
        acceptedAt: receipt?.accepted_at || null,
        revokedAt: receipt?.revoked_at || null,
      }
    }),
  })
}
