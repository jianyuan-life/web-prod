import { validateAccessToken } from '../security/token-validator.ts'
import { isValidConsultationSessionHandle } from './routes.ts'

export const CONSULTATION_SESSION_COOKIE_PREFIX = '__Host-jy_consultation_'
// Long-form C/G15 reports can take well over 30 minutes to read. Two hours is
// still an absolute short-lived session while avoiding a mid-read PDF failure.
export const CONSULTATION_SESSION_TTL_SECONDS = 2 * 60 * 60

const SESSION_VERSION = 1
const SESSION_PREFIX = 'v1.'
const SESSION_AUDIENCE = 'jianyuan:consultation-report'
const SESSION_AAD = new TextEncoder().encode('jianyuan:consultation-session:v1').buffer
const SELECTOR_DOMAIN = 'jianyuan:consultation-selector:v1\u0000'
const IV_BYTES = 12
const HANDLE_OUTPUT_BYTES = 16

type ConsultationSessionDependencies = {
  secret?: string
  nowMs?: number
  randomBytes?: (length: number) => Uint8Array
}

type ConsultationSessionPayload = {
  v: number
  aud: string
  sid: string
  token: string
  iat: number
  exp: number
}

export type ConsultationSessionOpenResult =
  | { ok: true; token: string; expiresAt: number }
  | {
      ok: false
      code: 'configuration_error' | 'invalid_session' | 'expired_session'
    }

function currentTimeSeconds(nowMs: number | undefined): number {
  const resolved = nowMs ?? Date.now()
  if (!Number.isFinite(resolved)) throw new TypeError('Invalid session clock')
  return Math.floor(resolved / 1_000)
}

export function isValidConsultationSessionSecret(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false
  if (new TextEncoder().encode(value).byteLength < 32) return false
  const normalized = value.toLowerCase()
  if (
    normalized.startsWith('replace-with-') ||
    normalized.includes('change-me') ||
    normalized.includes('changeme')
  ) {
    return false
  }
  return true
}

function resolveSecret(secret: string | undefined): string | null {
  const resolved = secret ?? process.env.CONSULTATION_SESSION_SECRET
  return isValidConsultationSessionSecret(resolved) ? resolved : null
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('Invalid session encoding')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/') + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function importEncryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function secureRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export async function createConsultationSessionHandle(
  token: string,
  dependencies: Pick<ConsultationSessionDependencies, 'secret'> = {},
): Promise<string> {
  if (
    typeof token !== 'string' ||
    token !== token.trim() ||
    /[\s\p{Cc}]/u.test(token) ||
    !validateAccessToken(token).valid
  ) {
    throw new TypeError('Invalid consultation access token')
  }
  const secret = resolveSecret(dependencies.secret)
  if (!secret) throw new Error('Consultation session is not configured')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret).buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${SELECTOR_DOMAIN}${token}`).buffer,
  ))
  return encodeBase64Url(signature.slice(0, HANDLE_OUTPUT_BYTES))
}

export function consultationSessionCookieName(handle: string): string {
  if (!isValidConsultationSessionHandle(handle)) {
    throw new TypeError('Invalid consultation session selector')
  }
  return `${CONSULTATION_SESSION_COOKIE_PREFIX}${handle}`
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function sealConsultationSession(
  token: string,
  handle: string,
  dependencies: ConsultationSessionDependencies = {},
): Promise<string> {
  if (
    typeof token !== 'string' ||
    token !== token.trim() ||
    /[\s\p{Cc}]/u.test(token) ||
    !validateAccessToken(token).valid
  ) {
    throw new TypeError('Invalid consultation access token')
  }
  if (!isValidConsultationSessionHandle(handle)) {
    throw new TypeError('Invalid consultation session selector')
  }
  const secret = resolveSecret(dependencies.secret)
  if (!secret) throw new Error('Consultation session is not configured')

  const issuedAt = currentTimeSeconds(dependencies.nowMs)
  const payload: ConsultationSessionPayload = {
    v: SESSION_VERSION,
    aud: SESSION_AUDIENCE,
    sid: handle,
    token,
    iat: issuedAt,
    exp: issuedAt + CONSULTATION_SESSION_TTL_SECONDS,
  }
  const iv = (dependencies.randomBytes ?? secureRandomBytes)(IV_BYTES)
  if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) {
    throw new TypeError('Invalid session IV')
  }
  const key = await importEncryptionKey(secret)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: copyToArrayBuffer(iv),
      additionalData: SESSION_AAD,
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(JSON.stringify(payload)).buffer,
  ))
  const envelope = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  envelope.set(iv, 0)
  envelope.set(ciphertext, iv.byteLength)
  return `${SESSION_PREFIX}${encodeBase64Url(envelope)}`
}

export async function openConsultationSession(
  sealed: unknown,
  expectedHandle: unknown,
  dependencies: Omit<ConsultationSessionDependencies, 'randomBytes'> = {},
): Promise<ConsultationSessionOpenResult> {
  if (!isValidConsultationSessionHandle(expectedHandle)) {
    return { ok: false, code: 'invalid_session' }
  }
  const secret = resolveSecret(dependencies.secret)
  if (!secret) return { ok: false, code: 'configuration_error' }
  if (typeof sealed !== 'string' || !sealed.startsWith(SESSION_PREFIX)) {
    return { ok: false, code: 'invalid_session' }
  }

  try {
    const envelope = decodeBase64Url(sealed.slice(SESSION_PREFIX.length))
    if (envelope.byteLength <= IV_BYTES + 16) return { ok: false, code: 'invalid_session' }
    const iv = envelope.slice(0, IV_BYTES)
    const ciphertext = envelope.slice(IV_BYTES)
    const key = await importEncryptionKey(secret)
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copyToArrayBuffer(iv),
        additionalData: SESSION_AAD,
        tagLength: 128,
      },
      key,
      copyToArrayBuffer(ciphertext),
    )
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<ConsultationSessionPayload>
    const now = currentTimeSeconds(dependencies.nowMs)
    if (
      payload.v !== SESSION_VERSION ||
      payload.aud !== SESSION_AUDIENCE ||
      payload.sid !== expectedHandle ||
      typeof payload.token !== 'string' ||
      !validateAccessToken(payload.token).valid ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      (payload.exp as number) - (payload.iat as number) !== CONSULTATION_SESSION_TTL_SECONDS ||
      (payload.iat as number) > now + 60
    ) {
      return { ok: false, code: 'invalid_session' }
    }
    if ((payload.exp as number) <= now) return { ok: false, code: 'expired_session' }
    return {
      ok: true,
      token: payload.token,
      expiresAt: payload.exp as number,
    }
  } catch {
    return { ok: false, code: 'invalid_session' }
  }
}

export const CONSULTATION_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: CONSULTATION_SESSION_TTL_SECONDS,
}
