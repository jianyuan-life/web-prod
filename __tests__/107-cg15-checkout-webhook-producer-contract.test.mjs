import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const virtualModules = new Map([
  ['stripe', dataModule(`
    export default class Stripe {
      constructor() {
        this.webhooks = {
          constructEvent() {
            return globalThis.__producerConsumerContractState.event
          },
        }
        this.paymentIntents = {
          async retrieve() {
            throw new Error('synthetic checkout session must not require a Stripe API read')
          },
        }
      }
    }
  `)],
  ['@/lib/supabase', dataModule(`
    export function createServiceClient() {
      return globalThis.__producerConsumerContractState.supabase
    }
  `)],
  ['@/lib/resend-helper', dataModule(`
    export async function sendEmailWithRetry(input) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'sendEmailWithRetry', input })
      return { success: true, attempts: 1 }
    }
  `)],
  ['@/lib/unsubscribe', dataModule('export function getUnsubscribeHtml(){return ""}')],
  ['@/lib/accounting', dataModule(`
    export async function recordRevenue(input) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'recordRevenue', input })
    }
  `)],
  ['@/lib/funnel-tracker', dataModule(`
    export async function trackFunnelServer(input) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'trackFunnelServer', input })
    }
  `)],
  ['@/lib/capacity-monitor', dataModule(`
    export async function checkCapacity() {
      return { allowed: true, mode: 'open', message: '' }
    }
  `)],
  ['@/lib/disposable-email-domains', dataModule('export function isDisposableEmail(){return false}')],
  ['@/lib/consultation/calculator-readiness.server', dataModule(`
    export async function assertConsultationCalculatorReady() {
      const state = globalThis.__producerConsumerContractState
      state.ledger.push({ name: 'calculator.readiness' })
      if (state.readinessMode === 'fail') throw new Error('synthetic private readiness failure')
      return { statusCode: 422, receipt: {} }
    }
  `)],
  ['@/lib/ai/observability/telegram', dataModule(`
    export async function notifyStripeFailed(...args) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'notifyStripeFailed', args })
      return true
    }
    export async function notify(...args) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'notify', args })
      return true
    }
  `)],
  ['@/lib/ai/observability/sentry-prod', dataModule(`
    export async function captureMessage(...args) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'captureMessage', args })
    }
    export async function captureException(...args) {
      globalThis.__producerConsumerContractState.ledger.push({ name: 'captureException', args })
    }
  `)],
])

function resolveLocalModule(fullPath) {
  for (const candidate of [
    `${fullPath}.ts`,
    `${fullPath}.tsx`,
    `${fullPath}.mjs`,
    path.join(fullPath, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const virtual = virtualModules.get(specifier)
    if (virtual) return { url: virtual, shortCircuit: true }
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier.startsWith('@/')) {
      const localUrl = resolveLocalModule(path.join(root, specifier.slice(2)))
      if (localUrl) return { url: localUrl, shortCircuit: true }
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL
      && !context.parentURL.startsWith('data:')
    ) {
      const fullPath = fileURLToPath(new URL(specifier, context.parentURL))
      if (!path.extname(fullPath)) {
        const localUrl = resolveLocalModule(fullPath)
        if (localUrl) return { url: localUrl, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

function jsonClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function matchesFilters(row, filters) {
  return filters.every(({ op, column, value }) => {
    if (op === 'eq') return row?.[column] === value
    if (op === 'in') return value.includes(row?.[column])
    if (op === 'gte') return row?.[column] >= value
    if (op === 'lte') return row?.[column] <= value
    return true
  })
}

function projectRow(row, selection) {
  if (!row || !selection || selection === '*') return jsonClone(row)
  const columns = selection.split(',').map((column) => column.trim()).filter(Boolean)
  return Object.fromEntries(columns.map((column) => [column, jsonClone(row[column])]))
}

class MemoryQuery {
  constructor(state, table) {
    this.state = state
    this.table = table
    this.action = 'select'
    this.payload = null
    this.selection = '*'
    this.selectOptions = {}
    this.filters = []
    this.maximumRows = null
  }

  select(selection = '*', options = {}) {
    this.selection = selection
    this.selectOptions = options
    return this
  }

  insert(payload) {
    this.action = 'insert'
    this.payload = jsonClone(payload)
    return this
  }

  update(payload) {
    this.action = 'update'
    this.payload = jsonClone(payload)
    return this
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  in(column, value) {
    this.filters.push({ op: 'in', column, value })
    return this
  }

  gte(column, value) {
    this.filters.push({ op: 'gte', column, value })
    return this
  }

  lte(column, value) {
    this.filters.push({ op: 'lte', column, value })
    return this
  }

  order() { return this }

  limit(value) {
    this.maximumRows = value
    return this
  }

  rows() {
    let rows
    if (this.table === 'checkout_drafts') rows = [...this.state.drafts.values()]
    else if (this.table === 'paid_reports') rows = [...this.state.reports.values()]
    else if (this.table === 'user_points') rows = [...this.state.userPoints.values()]
    else if (this.table === 'coupons') rows = [...this.state.coupons.values()]
    else if (this.table === 'g15_consent_selections') rows = [...this.state.g15ConsentSelections.values()]
    else if (this.table === 'g15_consent_receipts') rows = [...this.state.g15ConsentReceipts.values()]
    else rows = []
    rows = rows.filter((row) => matchesFilters(row, this.filters))
    if (this.maximumRows !== null) rows = rows.slice(0, this.maximumRows)
    return rows
  }

  execute(terminal = 'many') {
    if (this.action === 'insert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = payloads.map((payload) => {
        if (this.table === 'checkout_drafts') {
          const row = {
            ...payload,
            id: `dddddddd-dddd-4ddd-8ddd-${String(++this.state.draftSequence).padStart(12, '0')}`,
            used_at: null,
          }
          this.state.drafts.set(row.id, row)
          this.state.ledger.push({ name: 'checkout_drafts.insert', payload: jsonClone(payload), id: row.id })
          return row
        }
        if (this.table === 'paid_reports') {
          const generatedId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(++this.state.reportSequence).padStart(12, '0')}`
          const row = {
            ...payload,
            id: payload.id || generatedId,
            access_token: `access-token-${this.state.reportSequence}`,
          }
          this.state.reports.set(row.id, row)
          this.state.ledger.push({ name: 'paid_reports.insert', payload: jsonClone(payload), id: row.id })
          return row
        }
        this.state.ledger.push({ name: `${this.table}.insert`, payload: jsonClone(payload) })
        return payload
      })
      const data = inserted.map((row) => projectRow(row, this.selection))
      return Promise.resolve({ data: terminal === 'single' ? data[0] ?? null : data, error: null })
    }

    if (this.action === 'update') {
      const rows = this.rows()
      for (const row of rows) Object.assign(row, jsonClone(this.payload))
      this.state.ledger.push({
        name: `${this.table}.update`,
        payload: jsonClone(this.payload),
        filters: jsonClone(this.filters),
      })
      const data = rows.map((row) => projectRow(row, this.selection))
      return Promise.resolve({
        data: terminal === 'single' || terminal === 'maybeSingle' ? data[0] ?? null : data,
        error: null,
      })
    }

    const rows = this.rows()
    const projected = rows.map((row) => projectRow(row, this.selection))
    if (this.selectOptions?.head) {
      return Promise.resolve({ data: null, error: null, count: projected.length })
    }
    if (terminal === 'single') {
      return Promise.resolve(projected.length === 1
        ? { data: projected[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: `expected one ${this.table} row` } })
    }
    if (terminal === 'maybeSingle') {
      return Promise.resolve(projected.length <= 1
        ? { data: projected[0] ?? null, error: null }
        : { data: null, error: { code: 'PGRST116', message: `expected at most one ${this.table} row` } })
    }
    return Promise.resolve({ data: projected, error: null, count: projected.length })
  }

  single() { return this.execute('single') }
  maybeSingle() { return this.execute('maybeSingle') }
  then(resolve, reject) { return this.execute('many').then(resolve, reject) }
}

function createState() {
  const state = {
    authUser: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'checkout-owner@example.invalid',
    },
    drafts: new Map(),
    reports: new Map(),
    userPoints: new Map(),
    coupons: new Map(),
    couponUses: [],
    g15ConsentSelections: new Map(),
    g15ConsentReceipts: new Map(),
    g15Reservations: new Map(),
    paidReservations: new Map(),
    draftSequence: 0,
    reportSequence: 0,
    event: null,
    ledger: [],
    stripeRequests: [],
    expiredStripeSessions: [],
    workflowCalls: [],
    checkoutPointReferences: new Set(),
    checkoutPointsRpcCalls: 0,
    checkoutCouponRpcCalls: 0,
    readinessMode: 'ready',
    paidBindMode: 'ready',
    paidReleaseMode: 'ready',
    g15ReserveMode: 'ready',
    authMode: 'user',
    supabase: null,
  }

  state.userPoints.set(state.authUser.id, {
    user_id: state.authUser.id,
    balance: 50,
    total_used: 0,
  })
  state.coupons.set('SAVE20', {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    code: 'SAVE20',
    discount_type: 'percentage',
    discount_value: 20,
    max_uses: 5,
    used_count: 0,
    applicable_products: ['C'],
    is_active: true,
    valid_until: '2099-01-01T00:00:00.000Z',
  })

  state.supabase = {
    auth: {
      async getUser() {
        if (state.authMode === 'guest') return { data: { user: null }, error: null }
        return { data: { user: jsonClone(state.authUser) }, error: null }
      },
    },
    from(table) {
      return new MemoryQuery(state, table)
    },
    async rpc(name, args) {
      state.ledger.push({ name: `rpc:${name}`, args: jsonClone(args) })
      if (name === 'reserve_paid_checkout_value') {
        const existing = state.paidReservations.get(args.p_request_key)
        if (existing) {
          if (existing.payload_hash !== args.p_payload_hash) {
            return { data: null, error: { code: '22023', message: 'payload conflict' } }
          }
          return {
            data: {
              outcome: existing.status === 'bound' ? 'already_bound' : 'already_reserved',
              request_key: existing.request_key,
              resource_kind: existing.resource_kind,
              checkout_user_id: existing.checkout_user_id,
              coupon_code: existing.coupon_code,
              coupon_discount_type: existing.coupon_discount_type,
              coupon_discount_value: existing.coupon_discount_value,
              points_user_id: existing.points_user_id,
              points_amount: existing.points_amount,
              checkout_draft_id: existing.checkout_draft_id,
              reservation_expires_at: existing.expires_at,
            },
            error: null,
          }
        }
        let draftId = null
        if (args.p_create_checkout_draft) {
          draftId = `dddddddd-dddd-4ddd-8ddd-${String(++state.draftSequence).padStart(12, '0')}`
          state.drafts.set(draftId, {
            id: draftId,
            plan_code: args.p_plan_code,
            birth_data: jsonClone(args.p_birth_data),
            locale: args.p_locale,
            used_at: null,
          })
          state.ledger.push({ name: 'checkout_drafts.insert', id: draftId })
        }
        const resourceKind = args.p_coupon_code
          ? 'coupon'
          : args.p_points_amount > 0 ? 'points' : 'none'
        const reservation = {
          request_key: args.p_request_key,
          payload_hash: args.p_payload_hash,
          plan_code: args.p_plan_code,
          resource_kind: resourceKind,
          checkout_user_id: args.p_checkout_user_id,
          coupon_code: args.p_coupon_code || null,
          coupon_discount_type: args.p_coupon_code ? 'percentage' : null,
          coupon_discount_value: args.p_coupon_code ? 10 : null,
          points_user_id: resourceKind === 'points' ? args.p_points_user_id : null,
          points_amount: resourceKind === 'points' ? args.p_points_amount : null,
          checkout_draft_id: draftId,
          base_amount_cents: args.p_base_amount_cents,
          final_amount_cents: args.p_final_amount_cents,
          stripe_request_body: null,
          stripe_session_id: null,
          status: 'reserved',
          expires_at: args.p_expires_at,
        }
        state.paidReservations.set(reservation.request_key, reservation)
        return {
          data: {
            outcome: 'reserved',
            request_key: reservation.request_key,
            resource_kind: reservation.resource_kind,
            checkout_user_id: reservation.checkout_user_id,
            coupon_code: reservation.coupon_code,
            coupon_discount_type: reservation.coupon_discount_type,
            coupon_discount_value: reservation.coupon_discount_value,
            points_user_id: reservation.points_user_id,
            points_amount: reservation.points_amount,
            checkout_draft_id: reservation.checkout_draft_id,
            reservation_expires_at: reservation.expires_at,
          },
          error: null,
        }
      }
      if (name === 'freeze_paid_checkout_session') {
        const reservation = state.paidReservations.get(args.p_request_key)
        if (!reservation || reservation.payload_hash !== args.p_payload_hash) {
          return { data: null, error: { code: '55000', message: 'reservation unavailable' } }
        }
        const already = Boolean(reservation.stripe_request_body)
        if (already && reservation.stripe_request_body !== args.p_stripe_request_body) {
          return { data: null, error: { code: '55000', message: 'body conflict' } }
        }
        reservation.checkout_draft_id ||= args.p_checkout_draft_id
        reservation.stripe_request_body ||= args.p_stripe_request_body
        return {
          data: {
            outcome: already ? 'already_prepared' : 'prepared',
            request_key: reservation.request_key,
            checkout_draft_id: reservation.checkout_draft_id,
            stripe_request_body: reservation.stripe_request_body,
            reservation_expires_at: reservation.expires_at,
          },
          error: null,
        }
      }
      if (name === 'bind_paid_checkout_session') {
        if (state.paidBindMode === 'fail') {
          return { data: null, error: { code: 'XX000', message: 'synthetic bind failure' } }
        }
        const reservation = state.paidReservations.get(args.p_request_key)
        if (!reservation || reservation.payload_hash !== args.p_payload_hash) {
          return { data: null, error: { code: '55000', message: 'reservation unavailable' } }
        }
        const already = reservation.status === 'bound'
        if (already && reservation.stripe_session_id !== args.p_stripe_session_id) {
          return { data: null, error: { code: '55000', message: 'session conflict' } }
        }
        reservation.status = 'bound'
        reservation.stripe_session_id ||= args.p_stripe_session_id
        return {
          data: {
            outcome: already ? 'already_bound' : 'bound',
            request_key: reservation.request_key,
            checkout_draft_id: reservation.checkout_draft_id,
            stripe_session_id: reservation.stripe_session_id,
          },
          error: null,
        }
      }
      if (name === 'consume_paid_checkout_for_order') {
        const reservation = state.paidReservations.get(args.p_request_key)
        if (
          !reservation
          || reservation.stripe_session_id !== args.p_stripe_session_id
          || reservation.checkout_draft_id !== args.p_checkout_draft_id
          || reservation.plan_code !== args.p_plan_code
          || args.p_amount_total !== reservation.final_amount_cents
          || String(args.p_currency || '').toLowerCase() !== 'usd'
        ) return { data: null, error: { code: '55000', message: 'identity conflict' } }
        const already = reservation.status === 'consumed'
        if (!already && reservation.status !== 'bound') {
          return { data: null, error: { code: '55000', message: 'not bound' } }
        }
        if (!already && reservation.resource_kind === 'points') {
          const points = state.userPoints.get(reservation.points_user_id)
          points.balance -= reservation.points_amount
          points.total_used += reservation.points_amount
          state.checkoutPointsRpcCalls += 1
        }
        if (!already && reservation.resource_kind === 'coupon') {
          const coupon = state.coupons.get(reservation.coupon_code)
          coupon.used_count += 1
          state.couponUses.push({
            coupon_code: reservation.coupon_code,
            order_id: args.p_stripe_session_id,
          })
          state.checkoutCouponRpcCalls += 1
        }
        reservation.status = 'consumed'
        return {
          data: {
            outcome: already ? 'already_consumed' : 'consumed',
            request_key: reservation.request_key,
            resource_kind: reservation.resource_kind,
            checkout_user_id: reservation.checkout_user_id,
            coupon_code: reservation.coupon_code,
            points_user_id: reservation.points_user_id,
            points_amount: reservation.points_amount,
            checkout_draft_id: reservation.checkout_draft_id,
          },
          error: null,
        }
      }
      if (name === 'get_paid_checkout_order_authority') {
        if (state.paidAuthorityMode === 'missing-function') {
          return {
            data: null,
            error: {
              code: 'PGRST202',
              message: 'Could not find the function public.get_paid_checkout_order_authority(p_stripe_session_id) in the schema cache',
            },
          }
        }
        const rows = [...state.paidReservations.values()]
          .filter((row) => row.stripe_session_id && row.stripe_session_id === args.p_stripe_session_id)
          .map((row) => ({
            request_key: row.request_key,
            plan_code: row.plan_code,
            checkout_user_id: row.checkout_user_id,
            checkout_draft_id: row.checkout_draft_id,
            final_amount_cents: row.final_amount_cents,
            currency: 'usd',
            status: row.status,
          }))
        return { data: rows, error: null }
      }
      if (name === 'release_paid_checkout_reservation') {
        if (state.paidReleaseMode === 'throw') throw new Error('synthetic release transport failure')
        const reservation = state.paidReservations.get(args.p_request_key)
        if (!reservation || reservation.stripe_session_id !== args.p_stripe_session_id) {
          return { data: null, error: { code: '55000', message: 'identity conflict' } }
        }
        const already = reservation.status === 'released'
        reservation.status = 'released'
        return {
          data: {
            outcome: already ? 'already_released' : 'released',
            request_key: reservation.request_key,
            resource_kind: reservation.resource_kind,
            stripe_session_id: reservation.stripe_session_id,
          },
          error: null,
        }
      }
      if (name === 'abandon_paid_checkout_before_provider') {
        const reservation = state.paidReservations.get(args.p_request_key)
        if (!reservation || reservation.payload_hash !== args.p_payload_hash) {
          return { data: null, error: { code: '55000', message: 'identity conflict' } }
        }
        if (reservation.status === 'released') {
          return {
            data: {
              outcome: 'already_released',
              request_key: reservation.request_key,
              resource_kind: reservation.resource_kind,
            },
            error: null,
          }
        }
        if (reservation.status !== 'reserved' || reservation.stripe_session_id) {
          return { data: null, error: { code: '55000', message: 'not safe to abandon' } }
        }
        reservation.status = 'released'
        return {
          data: {
            outcome: 'abandoned',
            request_key: reservation.request_key,
            resource_kind: reservation.resource_kind,
          },
          error: null,
        }
      }
      if (name === 'reserve_g15_consent_for_checkout') {
        if (state.g15ReserveMode === 'fail') {
          return { data: null, error: { code: '55000', message: 'synthetic G15 reservation conflict' } }
        }
        const existing = state.g15Reservations.get(args.p_reservation_id)
        if (existing) {
          return {
            data: {
              outcome: existing.status === 'bound' ? 'already_bound' : 'already_reserved',
              reservation_id: existing.id,
              checkout_draft_id: existing.checkout_draft_id,
              report_id: existing.report_id,
              reservation_expires_at: existing.expires_at,
            },
            error: null,
          }
        }
        const selection = state.g15ConsentSelections.get(args.p_selection_id)
        if (!selection || selection.consumed_at || selection.superseded_at) {
          return { data: null, error: { code: '55000', message: 'consent unavailable' } }
        }
        const draftId = `dddddddd-dddd-4ddd-8ddd-${String(++state.draftSequence).padStart(12, '0')}`
        const reportId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        state.drafts.set(draftId, {
          id: draftId,
          plan_code: 'G15',
          birth_data: jsonClone(args.p_birth_data),
          locale: args.p_locale,
          used_at: null,
        })
        state.ledger.push({ name: 'checkout_drafts.insert', id: draftId })
        const reservation = {
          id: args.p_reservation_id,
          selection_id: args.p_selection_id,
          purchaser_user_id: args.p_purchaser_user_id,
          checkout_draft_id: draftId,
          report_id: reportId,
          status: 'reserved',
          stripe_session_id: null,
          expires_at: args.p_expires_at,
        }
        state.g15Reservations.set(reservation.id, reservation)
        return {
          data: {
            outcome: 'reserved',
            reservation_id: reservation.id,
            checkout_draft_id: draftId,
            report_id: reportId,
            reservation_expires_at: reservation.expires_at,
          },
          error: null,
        }
      }
      if (name === 'bind_g15_checkout_consent_session') {
        const reservation = state.g15Reservations.get(args.p_reservation_id)
        if (!reservation || reservation.purchaser_user_id !== args.p_purchaser_user_id) {
          return { data: null, error: { code: 'P0002', message: 'reservation unavailable' } }
        }
        const outcome = reservation.status === 'bound' ? 'already_bound' : 'bound'
        reservation.status = 'bound'
        reservation.stripe_session_id = args.p_stripe_session_id
        return {
          data: {
            outcome,
            reservation_id: reservation.id,
            checkout_draft_id: reservation.checkout_draft_id,
            report_id: reservation.report_id,
          },
          error: null,
        }
      }
      if (name === 'consume_g15_checkout_consent_for_order') {
        const reservation = state.g15Reservations.get(args.p_reservation_id)
        const selection = reservation
          ? state.g15ConsentSelections.get(reservation.selection_id)
          : null
        if (
          !reservation
          || !selection
          || reservation.purchaser_user_id !== args.p_purchaser_user_id
          || reservation.stripe_session_id !== args.p_stripe_session_id
          || selection.superseded_at !== null
        ) return { data: null, error: { code: 'P0001', message: 'consent unavailable' } }
        if (selection.consumed_at && selection.consumed_stripe_session_id !== args.p_stripe_session_id) {
          return { data: null, error: { code: 'P0001', message: 'consent already consumed' } }
        }
        const receipts = selection.selected_report_ids.map((reportId) => state.g15ConsentReceipts.get(reportId))
        if (receipts.some((receipt) => !receipt || receipt.status !== 'accepted' || !receipt.accepted_at)) {
          return { data: null, error: { code: 'P0001', message: 'consent incomplete' } }
        }
        const reportId = selection.consumed_report_id || reservation.report_id
        const consumedAt = selection.consumed_at || new Date().toISOString()
        const outcome = selection.consumed_at ? 'already_consumed' : 'consumed'
        Object.assign(selection, {
          consumed_at: consumedAt,
          consumed_stripe_session_id: args.p_stripe_session_id,
          consumed_report_id: reportId,
        })
        reservation.status = 'consumed'
        return {
          data: {
            outcome,
            reservation_id: reservation.id,
            selection_id: selection.id,
            checkout_draft_id: reservation.checkout_draft_id,
            selected_report_ids: [...selection.selected_report_ids],
            selected_report_ids_hash: selection.selected_report_ids_hash,
            policy_version: selection.policy_version,
            purpose: selection.purpose,
            sharing_scope: selection.sharing_scope,
            selection_expires_at: selection.expires_at,
            accepted_at_by_report: Object.fromEntries(receipts.map((receipt) => [receipt.subject_report_id, receipt.accepted_at])),
            subject_user_ids_by_report: Object.fromEntries(receipts.map((receipt) => [receipt.subject_report_id, receipt.subject_user_id])),
            consumed_at: consumedAt,
            stripe_session_id: args.p_stripe_session_id,
            report_id: reportId,
          },
          error: null,
        }
      }
      if (name !== 'deduct_checkout_points_once') {
        return { data: null, error: null }
      }
      state.checkoutPointsRpcCalls += 1
      const already = state.checkoutPointReferences.has(args.p_reference_id)
      state.checkoutPointReferences.add(args.p_reference_id)
      return {
        data: {
          status: already ? 'already' : 'applied',
          balance_after: 40,
        },
        error: null,
      }
    },
  }

  return state
}

const state = createState()
globalThis.__producerConsumerContractState = state

process.env.STRIPE_SECRET_KEY = 'synthetic-stripe-key'
process.env.STRIPE_WEBHOOK_SECRET = 'synthetic-webhook-secret'
process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.invalid'
process.env.CRON_SECRET = 'synthetic-cron-secret'
delete process.env.NEXT_PUBLIC_VISIBLE_PLAN_CODES

const originalConsultationReleaseFlags = {
  C: process.env.USE_CONSULTATION_REPORT_V1_C,
  G15: process.env.USE_CONSULTATION_REPORT_V1_G15,
}
process.env.USE_CONSULTATION_REPORT_V1_C = 'true'
process.env.USE_CONSULTATION_REPORT_V1_G15 = 'true'

after(() => {
  for (const [planCode, originalValue] of Object.entries(originalConsultationReleaseFlags)) {
    const envName = `USE_CONSULTATION_REPORT_V1_${planCode}`
    if (originalValue === undefined) delete process.env[envName]
    else process.env[envName] = originalValue
    assert.equal(process.env[envName], originalValue)
  }
})

globalThis.fetch = async (url, init = {}) => {
  const target = String(url)
  if (target === 'https://api.stripe.com/v1/checkout/sessions') {
    const params = new URLSearchParams(String(init.body || ''))
    const planCode = params.get('metadata[plan_code]') || 'unknown'
    const sessionId = `cs_test_producer_${planCode.toLowerCase()}`
    state.stripeRequests.push({
      url: target,
      method: init.method,
      authorization: new Headers(init.headers).get('authorization'),
      idempotencyKey: new Headers(init.headers).get('idempotency-key'),
      params,
      sessionId,
    })
    state.ledger.push({ name: 'stripe.checkout.sessions' })
    return new Response(JSON.stringify({
      id: sessionId,
      url: `https://checkout.stripe.test/session/${planCode.toLowerCase()}`,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const expireMatch = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(cs_(?:test|live)_[A-Za-z0-9_]+)\/expire$/u.exec(target)
  if (expireMatch) {
    state.expiredStripeSessions.push(expireMatch[1])
    state.ledger.push({ name: 'stripe.checkout.sessions.expire', sessionId: expireMatch[1] })
    return new Response(JSON.stringify({ id: expireMatch[1], status: 'expired' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (target === 'https://site.example.invalid/api/workflows/generate-report') {
    const body = JSON.parse(String(init.body || '{}'))
    state.workflowCalls.push({
      url: target,
      headers: Object.fromEntries(new Headers(init.headers)),
      body,
    })
    const report = state.reports.get(body.reportId)
    if (report) report.status = 'generating'
    return new Response('{}', {
      status: 202,
      headers: { 'content-type': 'application/json' },
    })
  }

  throw new Error(`offline producer-consumer test blocked unexpected fetch: ${target}`)
}

const { POST: checkoutPost } = await import('../app/api/checkout/route.ts')
const { POST: webhookPost } = await import('../app/api/webhook/stripe/route.ts')
const {
  G15_CONSENT_PURPOSE,
  G15_CONSENT_SHARING_SCOPE,
  G15_INDEPENDENT_CONSENT_POLICY_VERSION,
  hashG15ConsentReportIds,
} = await import('../lib/checkout/g15-independent-consent.ts')

function checkoutRequest(body) {
  const requestBody = {
    ...body,
    checkoutRequestKey: body.checkoutRequestKey || (body.planCode === 'G15'
      ? 'jyco_77777777-7777-4777-8777-777777777777'
      : 'jyco_66666666-6666-4666-8666-666666666666'),
  }
  return new Request('https://local.invalid/api/checkout', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-auth-token-long-enough-for-checkout-contract',
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })
}

function webhookRequest() {
  return new Request('https://local.invalid/api/webhook/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'synthetic-signature' },
    body: '{}',
  })
}

function metadataFromParams(params) {
  const metadata = {}
  for (const [key, value] of params.entries()) {
    const match = /^metadata\[([^\]]+)\]$/u.exec(key)
    if (match) metadata[match[1]] = value
  }
  return metadata
}

const validCBirthData = {
  name: '離線契約測試客戶',
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  gender: 'F',
  marital_status: 'single',
  time_unknown: false,
  time_mode: 'exact',
  calendar_type: 'solar',
  lunar_leap: false,
  latitude: 25.033,
  longitude: 121.5654,
  timezone: 'Asia/Taipei',
  timezone_offset: 8,
  birth_country: 'TW',
  birth_city: '台北（台灣）',
  birth_location_precision: 'city',
  bazi_school: 'china_mainland',
  ayanamsa_type: 'lahiri',
}

function resetState(seedReports = []) {
  state.paidAuthorityMode = null
  state.drafts.clear()
  state.reports.clear()
  state.userPoints.clear()
  state.coupons.clear()
  state.couponUses.length = 0
  state.g15ConsentSelections.clear()
  state.g15ConsentReceipts.clear()
  state.g15Reservations.clear()
  state.paidReservations.clear()
  state.userPoints.set(state.authUser.id, {
    user_id: state.authUser.id,
    balance: 50,
    total_used: 0,
  })
  state.coupons.set('SAVE20', {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    code: 'SAVE20',
    discount_type: 'percentage',
    discount_value: 20,
    max_uses: 5,
    used_count: 0,
    applicable_products: ['C'],
    is_active: true,
    valid_until: '2099-01-01T00:00:00.000Z',
  })
  for (const report of seedReports) state.reports.set(report.id, jsonClone(report))
  state.draftSequence = 0
  state.reportSequence = 0
  state.event = null
  state.ledger.length = 0
  state.stripeRequests.length = 0
  state.expiredStripeSessions.length = 0
  state.workflowCalls.length = 0
  state.checkoutPointReferences.clear()
  state.checkoutPointsRpcCalls = 0
  state.checkoutCouponRpcCalls = 0
  state.readinessMode = 'ready'
  state.paidBindMode = 'ready'
  state.paidReleaseMode = 'ready'
  state.g15ReserveMode = 'ready'
  state.authMode = 'user'
}

function checkoutEventFromRequest(stripeRequest, metadata, amounts) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: stripeRequest.sessionId,
        amount_total: amounts.total,
        amount_subtotal: amounts.subtotal,
        currency: 'usd',
        payment_status: 'paid',
        customer_email: stripeRequest.params.get('customer_email'),
        customer_details: null,
        payment_intent: null,
        metadata,
      },
    },
  }
}

async function assertWebhookConsumption({
  stripeRequest,
  draft,
  expectedPlanCode,
  expectedPointsRpcCalls = 1,
}) {
  const firstWebhookResponse = await webhookPost(webhookRequest())
  assert.equal(firstWebhookResponse.status, 200)

  const insertedReports = [...state.reports.values()].filter(
    (report) => report.stripe_session_id === stripeRequest.sessionId,
  )
  assert.equal(insertedReports.length, 1)
  const report = insertedReports[0]
  assert.equal(report.plan_code, expectedPlanCode)
  assert.deepEqual(report.birth_data, {
    ...draft.birth_data,
    locale: draft.locale,
  })
  assert.ok(draft.used_at, 'webhook must mark the consumed draft as used')
  assert.equal(state.checkoutPointsRpcCalls, expectedPointsRpcCalls)
  assert.equal(state.workflowCalls.length, 1)
  assert.deepEqual(state.workflowCalls[0].body, { reportId: report.id })
  assert.equal(state.workflowCalls[0].headers['x-internal-secret'], 'synthetic-cron-secret')
  assert.equal(report.status, 'generating')

  const reportInsertCount = state.ledger.filter(({ name }) => name === 'paid_reports.insert').length
  const replayResponse = await webhookPost(webhookRequest())
  assert.equal(replayResponse.status, 200)
  assert.deepEqual(await replayResponse.json(), { received: true, duplicate: true })
  assert.equal(
    state.checkoutPointsRpcCalls,
    expectedPointsRpcCalls,
    'Stripe replay must not deduct checkout points twice',
  )
  assert.equal(
    state.ledger.filter(({ name }) => name === 'paid_reports.insert').length,
    reportInsertCount,
    'Stripe replay must not insert a second paid report',
  )
  assert.equal(state.workflowCalls.length, 1, 'generating duplicate must not enqueue another workflow')
}

test('unpaid completed Checkout never fulfills; async success later fulfills once', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: {
      ...validCBirthData,
      consultation_release_contract: {
        schema: 'client-forged/v9',
        plan_code: 'G15',
      },
    },
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(checkoutResponse.status, 200)

  const stripeRequest = state.stripeRequests[0]
  const producerMetadata = metadataFromParams(stripeRequest.params)
  const draft = state.drafts.get(producerMetadata.draft_id)
  assert.ok(draft)

  state.event = checkoutEventFromRequest(stripeRequest, producerMetadata, {
    total: 7900,
    subtotal: 8900,
  })
  state.event.data.object.payment_status = 'unpaid'

  const unpaidResponse = await webhookPost(webhookRequest())
  assert.equal(unpaidResponse.status, 200)
  assert.deepEqual(await unpaidResponse.json(), {
    received: true,
    awaiting_payment: true,
  })
  assert.equal(state.reports.size, 0)
  assert.equal(state.checkoutPointsRpcCalls, 0)
  assert.equal(state.workflowCalls.length, 0)
  assert.equal(draft.used_at, null)

  state.event = checkoutEventFromRequest(stripeRequest, producerMetadata, {
    total: 7900,
    subtotal: 8900,
  })
  state.event.type = 'checkout.session.async_payment_succeeded'
  await assertWebhookConsumption({ stripeRequest, draft, expectedPlanCode: 'C' })
})

test('no_payment_required Checkout never fulfills a paid report', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(checkoutResponse.status, 200)

  const stripeRequest = state.stripeRequests[0]
  const producerMetadata = metadataFromParams(stripeRequest.params)
  const draft = state.drafts.get(producerMetadata.draft_id)
  assert.ok(draft)

  state.event = checkoutEventFromRequest(stripeRequest, producerMetadata, {
    total: 7900,
    subtotal: 8900,
  })
  state.event.data.object.payment_status = 'no_payment_required'

  const response = await webhookPost(webhookRequest())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    awaiting_payment: true,
  })
  assert.equal(state.reports.size, 0)
  assert.equal(state.checkoutPointsRpcCalls, 0)
  assert.equal(state.workflowCalls.length, 0)
  assert.equal(draft.used_at, null)
  assert.equal(
    state.ledger.some(({ name }) => name === 'sendEmailWithRetry'),
    false,
  )
})

test('paid reservation bind failure expires the unusable Stripe Session and never returns its URL', async () => {
  resetState()
  state.paidBindMode = 'fail'
  const response = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(response.status, 503)
  const payload = await response.json()
  assert.equal(payload.code, 'PAID_CHECKOUT_BINDING_CONFLICT')
  assert.equal('url' in payload, false)
  assert.deepEqual(state.expiredStripeSessions, ['cs_test_producer_c'])
  assert.equal(state.reports.size, 0)
  assert.equal(state.checkoutPointsRpcCalls, 0)
})

test('terminal paid Checkout releases only the exact bound points hold and replay stays idempotent', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(checkoutResponse.status, 200)

  const stripeRequest = state.stripeRequests[0]
  const metadata = metadataFromParams(stripeRequest.params)
  const reservation = state.paidReservations.get(metadata.paid_checkout_request_key)
  assert.equal(reservation.status, 'bound')

  state.event = {
    type: 'checkout.session.expired',
    data: {
      object: {
        id: 'cs_test_wrong_terminal_session_1234567890',
        amount_total: 7900,
        metadata,
      },
    },
  }
  const wrongSessionResponse = await webhookPost(webhookRequest())
  assert.equal(wrongSessionResponse.status, 500)
  assert.equal(reservation.status, 'bound')

  state.event.data.object.id = stripeRequest.sessionId
  state.paidReleaseMode = 'throw'
  const unavailableReleaseResponse = await webhookPost(webhookRequest())
  assert.equal(unavailableReleaseResponse.status, 500)
  assert.equal(reservation.status, 'bound')

  state.paidReleaseMode = 'ready'
  const releaseResponse = await webhookPost(webhookRequest())
  assert.equal(releaseResponse.status, 200)
  assert.deepEqual(await releaseResponse.json(), { received: true })
  assert.equal(reservation.status, 'released')
  assert.equal(state.userPoints.get(state.authUser.id).balance, 50)
  assert.equal(state.checkoutPointsRpcCalls, 0)
  assert.equal(state.reports.size, 0)

  const replayResponse = await webhookPost(webhookRequest())
  assert.equal(replayResponse.status, 200)
  assert.deepEqual(await replayResponse.json(), { received: true })
  assert.equal(reservation.status, 'released')
  assert.equal(state.userPoints.get(state.authUser.id).balance, 50)
})

test('paid coupon producer and webhook consume the database reservation exactly once without PII metadata', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    couponCode: 'save20',
    couponDiscount: 99,
    pointsToUse: 0,
    checkoutRequestKey: 'jyco_abababab-abab-4bab-8bab-abababababab',
  }))
  assert.equal(checkoutResponse.status, 200, JSON.stringify(await checkoutResponse.clone().json()))

  const stripeRequest = state.stripeRequests[0]
  assert.equal(stripeRequest.params.get('line_items[0][price_data][unit_amount]'), '7120')
  const metadata = metadataFromParams(stripeRequest.params)
  assert.equal(metadata.coupon_code, 'SAVE20')
  assert.equal(metadata.paid_checkout_contract, 'v1')
  assert.equal(metadata.paid_checkout_request_key, 'jyco_abababab-abab-4bab-8bab-abababababab')
  assert.equal(metadata.login_email, undefined)
  assert.equal(metadata.login_user_id, undefined)
  assert.equal(metadata.points_used, undefined)
  assert.equal(metadata.points_user_id, undefined)

  const reservation = state.paidReservations.get(metadata.paid_checkout_request_key)
  assert.equal(reservation.resource_kind, 'coupon')
  const draft = state.drafts.get(metadata.draft_id)
  state.event = checkoutEventFromRequest(stripeRequest, metadata, {
    total: 7120,
    subtotal: 8900,
  })
  await assertWebhookConsumption({
    stripeRequest,
    draft,
    expectedPlanCode: 'C',
    expectedPointsRpcCalls: 0,
  })
  assert.equal(state.checkoutCouponRpcCalls, 1)
  assert.equal(state.coupons.get('SAVE20').used_count, 1)
  assert.deepEqual(state.couponUses, [{
    coupon_code: 'SAVE20',
    order_id: stripeRequest.sessionId,
  }])
  assert.equal(
    state.ledger.some(({ name }) => name === 'coupons.update' || name === 'coupon_uses.insert'),
    false,
    'new paid coupon sessions must not use the legacy read-modify-write webhook path',
  )
})

test('paid webhook rejects amount or currency drift before consuming money-equivalent authority', async () => {
  for (const mutation of [
    (session) => { session.amount_total = 50 },
    (session) => { session.currency = 'hkd' },
  ]) {
    resetState()
    const checkoutResponse = await checkoutPost(checkoutRequest({
      planCode: 'C',
      birthData: validCBirthData,
      totalPrice: 89,
      locale: 'zh-TW',
      userEmail: state.authUser.email,
      couponCode: 'save20',
      couponDiscount: 99,
      pointsToUse: 0,
      checkoutRequestKey: 'jyco_acacacac-acac-4cac-8cac-acacacacacac',
    }))
    assert.equal(checkoutResponse.status, 200)
    const stripeRequest = state.stripeRequests[0]
    const metadata = metadataFromParams(stripeRequest.params)
    const reservation = state.paidReservations.get(metadata.paid_checkout_request_key)
    state.event = checkoutEventFromRequest(stripeRequest, metadata, {
      total: 7120,
      subtotal: 8900,
    })
    mutation(state.event.data.object)

    const response = await webhookPost(webhookRequest())
    assert.equal(response.status, 500)
    assert.equal(reservation.status, 'bound')
    assert.equal(state.coupons.get('SAVE20').used_count, 0)
    assert.equal(state.checkoutCouponRpcCalls, 0)
    assert.equal(state.reports.size, 0)
  }
})

test('bound paid Session remains ledger-authoritative when Stripe metadata is absent', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
    checkoutRequestKey: 'jyco_adadadad-adad-4dad-8dad-adadadadadad',
  }))
  assert.equal(checkoutResponse.status, 200)
  const stripeRequest = state.stripeRequests[0]
  const producedMetadata = metadataFromParams(stripeRequest.params)
  const reservation = state.paidReservations.get(producedMetadata.paid_checkout_request_key)
  const draft = state.drafts.get(producedMetadata.draft_id)
  state.event = checkoutEventFromRequest(stripeRequest, {}, {
    total: 7900,
    subtotal: 8900,
  })

  await assertWebhookConsumption({ stripeRequest, draft, expectedPlanCode: 'C' })
  assert.equal(reservation.status, 'consumed')
})

test('missing ledger RPC degrades to legacy handling with no authority 500 and no consumption', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
    checkoutRequestKey: 'jyco_aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae',
  }))
  assert.equal(checkoutResponse.status, 200)
  const stripeRequest = state.stripeRequests[0]
  const producedMetadata = metadataFromParams(stripeRequest.params)
  const reservation = state.paidReservations.get(producedMetadata.paid_checkout_request_key)
  state.paidAuthorityMode = 'missing-function'
  state.event = checkoutEventFromRequest(stripeRequest, {}, { total: 7900, subtotal: 8900 })

  const response = await webhookPost(webhookRequest())
  // migration 未套用 ⇒ reservation 訂單不可能存在；「函式不存在」必須走 legacy
  // 而不是 authority 500(否則所有 E3/legacy 出貨在部署窗口內無聲中斷)。
  // 這個 metadata 全剝的 C session 在 legacy 路徑因缺結構化資料而 fail closed,
  // 但錯誤必須來自資料閘、且分文未消費。
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), {
    error: 'Structured checkout data unavailable; Stripe retry required',
  })
  assert.equal(reservation.status, 'bound')
  assert.equal(state.checkoutPointsRpcCalls, 0)
  assert.equal(
    state.ledger.some(({ name }) => name === 'rpc:consume_paid_checkout_for_order'),
    false,
  )
})

test('all paid-checkout RPCs stay in one atomic migration so the missing-RPC legacy degradation stays safe', () => {
  // webhook 的「函式不存在 → legacy」降級,安全性完全依賴
  // 「authority 缺席 ⇒ reserve 必也缺席 ⇒ 不可能有 reservation 訂單」。
  // 這只在七個 RPC 與 ledger 表同屬一個 BEGIN/COMMIT 原子 migration 時成立;
  // 拆檔或單獨 hotfix DROP/CREATE 都會讓降級把真實 ledger 訂單誤當 legacy。
  const migrationSource = readFileSync(
    path.join(root, 'supabase', 'migrations', '20260813051200_paid_checkout_coupon_reservation.sql'),
    'utf8',
  )
  assert.match(migrationSource, /^BEGIN;/u)
  assert.match(migrationSource, /COMMIT;\s*$/u)
  for (const functionName of [
    'reserve_paid_checkout_value',
    'freeze_paid_checkout_session',
    'bind_paid_checkout_session',
    'get_paid_checkout_order_authority',
    'consume_paid_checkout_for_order',
    'release_paid_checkout_reservation',
    'abandon_paid_checkout_before_provider',
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`CREATE FUNCTION public\\.${functionName}\\(`, 'u'),
      `${functionName} 必須與其餘 paid-checkout RPC 同居一個原子 migration`,
    )
  }
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.paid_checkout_reservations/u)
})

test('bound G15 Session with stripped metadata fails closed before any money-equivalent consumption', async () => {
  resetState([
    completedCReport(G15_REPORT_A, '家庭成員甲', 1, 'F'),
    completedCReport(G15_REPORT_B, '家庭成員乙', 2, 'M'),
  ])
  const selectedReportIds = [G15_REPORT_B, G15_REPORT_A]
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'G15',
    birthData: validG15CheckoutBirthData(selectedReportIds),
    totalPrice: 59,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 5,
  }))
  assert.equal(checkoutResponse.status, 200)
  const stripeRequest = state.stripeRequests[0]
  const producedMetadata = metadataFromParams(stripeRequest.params)
  const reservation = state.paidReservations.get(producedMetadata.paid_checkout_request_key)
  const reportsBefore = state.reports.size
  state.event = checkoutEventFromRequest(stripeRequest, {}, { total: 5400, subtotal: 5900 })

  const response = await webhookPost(webhookRequest())
  // G15 的同意授權只在 metadata;被剝離時必須在金錢消費之前 fail closed,
  // 否則會「錢已扣、同意消費永遠 500、無隔離」(反例審查 P1-3)。
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Paid checkout identity unavailable' })
  assert.equal(reservation.status, 'bound')
  assert.equal(state.checkoutPointsRpcCalls, 0)
  assert.equal(state.reports.size, reportsBefore)
  assert.equal(
    state.ledger.some(({ name }) => name === 'rpc:consume_paid_checkout_for_order'),
    false,
  )
})

test('guest paid replay freezes the first normalized email intent and rejects the same key with another payer', async () => {
  resetState()
  state.authMode = 'guest'
  const requestKey = 'jyco_cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
  const makeRequest = (userEmail) => checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail,
    pointsToUse: 0,
    checkoutRequestKey: requestKey,
  })

  const firstResponse = await checkoutPost(makeRequest(' Guest.One@Example.Invalid '))
  assert.equal(firstResponse.status, 200)
  const firstStripeBody = state.stripeRequests[0].params.toString()
  assert.equal(state.stripeRequests[0].params.get('customer_email'), 'guest.one@example.invalid')
  assert.equal(state.stripeRequests[0].params.has('metadata[login_email]'), false)
  assert.equal(state.stripeRequests[0].params.has('metadata[login_user_id]'), false)

  const replayResponse = await checkoutPost(makeRequest('guest.one@example.invalid'))
  assert.equal(replayResponse.status, 200)
  assert.equal(state.stripeRequests.length, 2)
  assert.equal(state.stripeRequests[1].params.toString(), firstStripeBody)
  assert.equal(
    state.stripeRequests[1].idempotencyKey,
    'jianyuan-paid-cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
  )

  const conflictResponse = await checkoutPost(makeRequest('guest.two@example.invalid'))
  assert.equal(conflictResponse.status, 503)
  assert.equal((await conflictResponse.json()).code, 'PAID_CHECKOUT_RESERVATION_CONFLICT')
  assert.equal(state.stripeRequests.length, 2, 'conflicting payer intent must stop before Stripe replay')
})

test('real C checkout draft is the only source of webhook birth_data and replay is idempotent', async () => {
  resetState()
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: validCBirthData,
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(checkoutResponse.status, 200)
  assert.deepEqual(await checkoutResponse.json(), {
    url: 'https://checkout.stripe.test/session/c',
  })

  const cReadinessIndex = state.ledger.findIndex(({ name }) => name === 'calculator.readiness')
  const cDraftInsertIndex = state.ledger.findIndex(({ name }) => name === 'checkout_drafts.insert')
  const cStripeIndex = state.ledger.findIndex(({ name }) => name === 'stripe.checkout.sessions')
  assert.ok(cReadinessIndex >= 0, 'C checkout must prove strict calculator readiness')
  assert.ok(cReadinessIndex < cDraftInsertIndex, 'C readiness must precede checkout_drafts.insert')
  assert.ok(cReadinessIndex < cStripeIndex, 'C readiness must precede Stripe session creation')

  assert.equal(state.stripeRequests.length, 1)
  const stripeRequest = state.stripeRequests[0]
  assert.equal(stripeRequest.method, 'POST')
  assert.equal(stripeRequest.authorization, 'Bearer synthetic-stripe-key')
  assert.equal(stripeRequest.idempotencyKey, 'jianyuan-paid-66666666-6666-4666-8666-666666666666')
  assert.equal(stripeRequest.params.get('line_items[0][price_data][unit_amount]'), '7900')
  assert.equal(stripeRequest.params.has('metadata[birth_data]'), false)

  const producerMetadata = metadataFromParams(stripeRequest.params)
  assert.equal(producerMetadata.plan_code, 'C')
  assert.match(producerMetadata.draft_id, /^[0-9a-f-]{36}$/u)
  assert.equal(producerMetadata.paid_checkout_contract, 'v1')
  assert.equal(producerMetadata.paid_checkout_request_key, 'jyco_66666666-6666-4666-8666-666666666666')
  assert.equal(producerMetadata.login_email, undefined)
  assert.equal(producerMetadata.login_user_id, undefined)
  assert.equal(producerMetadata.points_used, undefined)
  assert.equal(producerMetadata.points_user_id, undefined)

  const draft = state.drafts.get(producerMetadata.draft_id)
  assert.ok(draft, 'checkout route must persist the draft referenced by Stripe metadata')
  assert.equal(draft.plan_code, 'C')
  assert.equal(draft.birth_data.as_of.length, 10)
  assert.equal(draft.birth_data.target_year, Number(draft.birth_data.as_of.slice(0, 4)))
  assert.deepEqual(draft.birth_data.consultation_release_contract, {
    schema: 'consultation-report/v1',
    plan_code: 'C',
  }, 'checkout must overwrite a client-forged release marker before persistence')

  let webhookMetadata = jsonClone(producerMetadata)
  if (process.env.JIANYUAN_PRODUCER_CONTRACT_MUTANT === 'handwritten-metadata') {
    webhookMetadata = {
      plan_code: 'C',
      birth_data: JSON.stringify(draft.birth_data),
      login_email: state.authUser.email,
      login_user_id: state.authUser.id,
      points_used: '10',
      points_user_id: state.authUser.id,
      locale: 'zh-TW',
    }
  }
  assert.deepEqual(
    webhookMetadata,
    producerMetadata,
    'webhook fixture must be the unmodified output of the real checkout producer; handwritten metadata.birth_data is a fake green',
  )

  state.event = checkoutEventFromRequest(stripeRequest, webhookMetadata, {
    total: 7900,
    subtotal: 8900,
  })
  await assertWebhookConsumption({ stripeRequest, draft, expectedPlanCode: 'C' })
})

test('C order email escapes customer HTML and strips subject control characters', async () => {
  resetState()
  const injectedName = '</p><a href="https://example.invalid">重新登入</a><p>\r\nBcc: victim@example.invalid'
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'C',
    birthData: { ...validCBirthData, name: injectedName },
    totalPrice: 89,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 10,
  }))
  assert.equal(checkoutResponse.status, 200)

  const stripeRequest = state.stripeRequests[0]
  const metadata = metadataFromParams(stripeRequest.params)
  const draft = state.drafts.get(metadata.draft_id)
  state.event = checkoutEventFromRequest(stripeRequest, metadata, {
    total: 7900,
    subtotal: 8900,
  })
  await assertWebhookConsumption({ stripeRequest, draft, expectedPlanCode: 'C' })

  const email = state.ledger.find(({ name }) => name === 'sendEmailWithRetry')?.input
  assert.ok(email)
  assert.doesNotMatch(email.html, /<a href="https:\/\/example\.invalid">/u)
  assert.match(email.html, /&lt;\/p&gt;&lt;a href=&quot;https:\/\/example\.invalid&quot;&gt;/u)
  assert.doesNotMatch(email.subject, /[\r\n\u0000-\u001f\u007f]/u)
})

const G15_REPORT_A = '22222222-2222-4222-8222-222222222222'
const G15_REPORT_B = '33333333-3333-4333-8333-333333333333'
const G15_SELECTION_ID = '44444444-4444-4444-8444-444444444444'
const G15_SUBJECT_A = '55555555-5555-4555-8555-555555555555'
const G15_SUBJECT_B = '66666666-6666-4666-8666-666666666666'

function completedCReport(id, name, day, gender, userId = id === G15_REPORT_A ? G15_SUBJECT_A : G15_SUBJECT_B) {
  return {
    id,
    client_name: name,
    plan_code: 'C',
    status: 'completed',
    deleted_at: null,
    user_id: userId,
    customer_email: `${userId.slice(0, 8)}@example.invalid`,
    birth_data: {
      ...validCBirthData,
      name,
      day,
      gender,
    },
  }
}

function seedAcceptedG15Consent(reportIds) {
  const acceptedAt = new Date(Date.now() - 1_000).toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  state.g15ConsentSelections.set(G15_SELECTION_ID, {
    id: G15_SELECTION_ID,
    purchaser_user_id: state.authUser.id,
    selected_report_ids: [...reportIds],
    selected_report_ids_hash: hashG15ConsentReportIds(reportIds),
    policy_version: G15_INDEPENDENT_CONSENT_POLICY_VERSION,
    purpose: G15_CONSENT_PURPOSE,
    sharing_scope: G15_CONSENT_SHARING_SCOPE,
    expires_at: expiresAt,
    superseded_at: null,
    consumed_at: null,
    consumed_stripe_session_id: null,
    consumed_report_id: null,
  })
  reportIds.forEach((reportId, index) => {
    const sourceReport = state.reports.get(reportId)
    state.g15ConsentReceipts.set(reportId, {
      selection_id: G15_SELECTION_ID,
      subject_report_id: reportId,
      subject_user_id: sourceReport?.user_id,
      subject_email_hmac: `hmac-sha256:${String(index + 1).repeat(64)}`,
      status: 'accepted',
      accepted_at: acceptedAt,
      revoked_at: null,
      expires_at: expiresAt,
      accept_token_hash: null,
      revoke_token_hash: `sha256:${String(index + 3).repeat(64)}`,
    })
  })
}

function validG15CheckoutBirthData(selectedReportIds) {
  seedAcceptedG15Consent(selectedReportIds)
  return {
    plan_type: 'family_reports',
    report_ids: selectedReportIds,
    member_names: ['前端偽造成員乙', '前端偽造成員甲'],
    stated_relationships: ['兩位家庭成員是共同照顧孩子的伴侶關係。'],
    consultation_goals: ['希望理解家庭溝通節奏並建立可持續的協作方式。'],
    consent_selection_id: G15_SELECTION_ID,
    injected_private_field: 'must not survive checkout validation',
  }
}

test('real G15 checkout rebuilds trusted family data before the same webhook and replay boundary', async () => {
  resetState([
    completedCReport(G15_REPORT_A, '家庭成員甲', 1, 'F'),
    completedCReport(G15_REPORT_B, '家庭成員乙', 2, 'M'),
  ])
  const selectedReportIds = [G15_REPORT_B, G15_REPORT_A]
  const g15BirthData = validG15CheckoutBirthData(selectedReportIds)
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'G15',
    birthData: g15BirthData,
    totalPrice: 59,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 5,
  }))
  assert.equal(checkoutResponse.status, 200, JSON.stringify(await checkoutResponse.clone().json()))
  assert.deepEqual(await checkoutResponse.json(), {
    url: 'https://checkout.stripe.test/session/g15',
  })

  const g15ReadinessIndex = state.ledger.findIndex(({ name }) => name === 'calculator.readiness')
  const g15DraftInsertIndex = state.ledger.findIndex(({ name }) => name === 'checkout_drafts.insert')
  const g15StripeIndex = state.ledger.findIndex(({ name }) => name === 'stripe.checkout.sessions')
  assert.ok(g15ReadinessIndex >= 0, 'G15 checkout must prove strict calculator readiness')
  assert.ok(g15ReadinessIndex < g15DraftInsertIndex, 'G15 readiness must precede checkout_drafts.insert')
  assert.ok(g15ReadinessIndex < g15StripeIndex, 'G15 readiness must precede Stripe session creation')

  assert.equal(state.stripeRequests.length, 1)
  const stripeRequest = state.stripeRequests[0]
  assert.equal(stripeRequest.params.get('line_items[0][price_data][unit_amount]'), '5400')
  assert.equal(stripeRequest.params.has('metadata[birth_data]'), false)
  const producerMetadata = metadataFromParams(stripeRequest.params)
  assert.equal(producerMetadata.plan_code, 'G15')
  assert.equal(producerMetadata.points_used, undefined)
  assert.equal(producerMetadata.points_user_id, undefined)
  assert.equal(producerMetadata.login_email, undefined)
  assert.equal(producerMetadata.login_user_id, undefined)
  assert.equal(producerMetadata.paid_checkout_contract, 'v1')
  assert.equal(producerMetadata.paid_checkout_request_key, 'jyco_77777777-7777-4777-8777-777777777777')
  assert.equal(
    stripeRequest.idempotencyKey,
    'jianyuan-g15-77777777-7777-4777-8777-777777777777',
  )

  const draft = state.drafts.get(producerMetadata.draft_id)
  assert.ok(draft)
  assert.deepEqual(draft.birth_data.report_ids, selectedReportIds)
  assert.deepEqual(draft.birth_data.member_names, ['家庭成員乙', '家庭成員甲'])
  assert.equal('injected_private_field' in draft.birth_data, false)
  assert.equal(JSON.stringify(draft.birth_data).includes('前端偽造'), false)
  assert.equal(draft.birth_data.consent_selection_id, G15_SELECTION_ID)
  assert.equal(draft.birth_data.consent_authority.policy_version, G15_INDEPENDENT_CONSENT_POLICY_VERSION)
  assert.equal('consent_attestation' in draft.birth_data, false)

  state.event = checkoutEventFromRequest(stripeRequest, producerMetadata, {
    total: 5400,
    subtotal: 5900,
  })
  await assertWebhookConsumption({ stripeRequest, draft, expectedPlanCode: 'G15' })
})

test('G15 consent reservation failure abandons its earlier paid points hold before Stripe', async () => {
  resetState([
    completedCReport(G15_REPORT_A, '家庭成員甲', 1, 'F'),
    completedCReport(G15_REPORT_B, '家庭成員乙', 2, 'M'),
  ])
  const selectedReportIds = [G15_REPORT_B, G15_REPORT_A]
  state.g15ReserveMode = 'fail'
  const response = await checkoutPost(checkoutRequest({
    planCode: 'G15',
    birthData: validG15CheckoutBirthData(selectedReportIds),
    totalPrice: 59,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 5,
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'G15_CHECKOUT_RESERVATION_CONFLICT')
  const paidReservation = state.paidReservations.get(
    'jyco_77777777-7777-4777-8777-777777777777',
  )
  assert.equal(paidReservation.status, 'released')
  assert.equal(state.stripeRequests.length, 0)
  assert.equal(state.userPoints.get(state.authUser.id).balance, 50)
})

test('failed G15 replay with consent drift is held before points replay or workflow recovery', async () => {
  resetState([
    completedCReport(G15_REPORT_A, 'Family Member A', 1, 'F'),
    completedCReport(G15_REPORT_B, 'Family Member B', 2, 'M'),
  ])
  const selectedReportIds = [G15_REPORT_B, G15_REPORT_A]
  const checkoutResponse = await checkoutPost(checkoutRequest({
    planCode: 'G15',
    birthData: validG15CheckoutBirthData(selectedReportIds),
    totalPrice: 59,
    locale: 'zh-TW',
    userEmail: state.authUser.email,
    pointsToUse: 5,
  }))
  assert.equal(checkoutResponse.status, 200, JSON.stringify(await checkoutResponse.clone().json()))
  const stripeRequest = state.stripeRequests.at(-1)
  const metadata = metadataFromParams(stripeRequest.params)
  state.event = checkoutEventFromRequest(stripeRequest, metadata, {
    total: 5400,
    subtotal: 5900,
  })

  const firstResponse = await webhookPost(webhookRequest())
  assert.equal(firstResponse.status, 200)
  const report = [...state.reports.values()].find(
    (candidate) => candidate.stripe_session_id === stripeRequest.sessionId,
  )
  assert.ok(report)
  report.status = 'failed'
  const revokedReceipt = state.g15ConsentReceipts.get(G15_REPORT_A)
  revokedReceipt.status = 'revoked'
  revokedReceipt.revoked_at = new Date().toISOString()
  revokedReceipt.revoke_token_hash = null

  const rpcCallsBeforeReplay = state.checkoutPointsRpcCalls
  const workflowCallsBeforeReplay = state.workflowCalls.length
  const replayResponse = await webhookPost(webhookRequest())
  assert.equal(replayResponse.status, 200)
  assert.deepEqual(await replayResponse.json(), {
    received: true,
    duplicate: true,
    manual_review: true,
  })
  assert.equal(report.status, 'needs_human_review')
  assert.equal(
    report.error_message,
    'Structured checkout data unavailable; Stripe retry required',
  )
  assert.equal(state.checkoutPointsRpcCalls, rpcCallsBeforeReplay)
  assert.equal(state.workflowCalls.length, workflowCallsBeforeReplay)
})

test('C／G15 readiness failure returns one fixed 503 before writes, points RPC or Stripe', async () => {
  const cases = [
    {
      planCode: 'C',
      birthData: validCBirthData,
      totalPrice: 89,
      pointsToUse: 10,
      seedReports: [],
    },
    {
      planCode: 'G15',
      birthData: validG15CheckoutBirthData([G15_REPORT_B, G15_REPORT_A]),
      totalPrice: 59,
      pointsToUse: 5,
      seedReports: [
        completedCReport(G15_REPORT_A, '家庭成員甲', 1, 'F'),
        completedCReport(G15_REPORT_B, '家庭成員乙', 2, 'M'),
      ],
    },
  ]

  for (const candidate of cases) {
    resetState(candidate.seedReports)
    if (candidate.planCode === 'G15') seedAcceptedG15Consent(candidate.birthData.report_ids)
    state.readinessMode = 'fail'
    const reportsBefore = state.reports.size
    const response = await checkoutPost(checkoutRequest({
      planCode: candidate.planCode,
      birthData: candidate.birthData,
      totalPrice: candidate.totalPrice,
      locale: 'zh-TW',
      userEmail: state.authUser.email,
      pointsToUse: candidate.pointsToUse,
    }))
    const body = await response.json()

    assert.equal(response.status, 503)
    assert.deepEqual(body, {
      error: '排盤服務暫時未就緒，請稍後再試',
      code: 'CONSULTATION_CALCULATOR_NOT_READY',
    })
    assert.equal(JSON.stringify(body).includes('synthetic private readiness failure'), false)
    assert.deepEqual(state.ledger, [{ name: 'calculator.readiness' }])
    assert.equal(state.drafts.size, 0)
    assert.equal(state.reports.size, reportsBefore)
    assert.equal(state.checkoutPointsRpcCalls, 0)
    assert.equal(state.stripeRequests.length, 0)
  }
})
