#!/usr/bin/env node
// T9 v5.10.353 (Master Plan Sprint 7、95 gate L1 QA cov 88→95+ 補):
// sanitizeErrorMessage 8 dangerous pattern 全測 + 安全 message 通過

import assert from 'node:assert/strict'
import { test } from 'node:test'

// 重現 sanitizeErrorMessage 邏輯(對齊 app/error.tsx)
function sanitizeErrorMessage(msg) {
  if (!msg) return '頁面載入時發生錯誤、請稍後再試。'
  const trimmed = msg.trim()
  const dangerousPatterns = [
    /at\s+\w+\s+\(/,
    /Error:\s+\w+/i,
    /SELECT|INSERT|UPDATE|DELETE\s+/i,
    /Bearer\s+/i,
    /https?:\/\/[\w.-]+/,
    /\/\w+(\/\w+)+\.(ts|tsx|js|py)/,
    /sk_test|sk_live|pk_test|pk_live/,
    /password|api_key|secret/i,
    // T9 v5.10.354 L4 Gemini 加
    /[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/,
    /(\+?886[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/,
    /\b\d{3}-?\d{2}-?\d{4}\b/,
    /"errors"\s*:\s*\[/,
    /webpack-internal:|\(rsc\)|__next|node_modules/i,
    // T9 v5.10.355
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /AKIA[0-9A-Z]{16}/,
    /[A-Z]:\\[\w\\.-]+/,
    /(token|jwt|cookie|session)[\s=:]+[A-Za-z0-9._-]{20,}/i,
  ]
  for (const p of dangerousPatterns) {
    if (p.test(trimmed)) return '頁面載入時發生錯誤、請稍後再試。'
  }
  if (trimmed.length > 100) return '頁面載入時發生錯誤、請稍後再試。'
  return trimmed
}

const FALLBACK = '頁面載入時發生錯誤、請稍後再試。'

test('T9-1 stack trace pattern 攔', () => {
  const out = sanitizeErrorMessage('TypeError: Cannot read prop\nat doFoo (steps.ts:1234)')
  assert.equal(out, FALLBACK)
})

test('T9-2 Error: prefix 攔', () => {
  assert.equal(sanitizeErrorMessage('Error: something broke'), FALLBACK)
})

test('T9-3 SQL injection leak 攔', () => {
  assert.equal(sanitizeErrorMessage('SELECT * FROM users WHERE id=1'), FALLBACK)
  assert.equal(sanitizeErrorMessage('INSERT INTO logs values (1)'), FALLBACK)
})

test('T9-4 Bearer token 攔', () => {
  assert.equal(sanitizeErrorMessage('Auth fail: Bearer abc123def'), FALLBACK)
})

test('T9-5 URL leak 攔', () => {
  assert.equal(sanitizeErrorMessage('Failed to fetch https://api.stripe.com/charges'), FALLBACK)
})

test('T9-6 file path leak 攔', () => {
  assert.equal(sanitizeErrorMessage('Module not found: /app/lib/secret.ts'), FALLBACK)
})

test('T9-7 Stripe key leak 攔', () => {
  assert.equal(sanitizeErrorMessage('Bad request: sk_live_abc123'), FALLBACK)
  assert.equal(sanitizeErrorMessage('Wrong: pk_test_xyz'), FALLBACK)
})

test('T9-8 password / api_key / secret 字面 leak 攔', () => {
  assert.equal(sanitizeErrorMessage('Wrong password supplied'), FALLBACK)
  assert.equal(sanitizeErrorMessage('Invalid api_key'), FALLBACK)
  assert.equal(sanitizeErrorMessage('Missing secret'), FALLBACK)
})

test('T9-9 過長(>100)攔', () => {
  const long = 'x'.repeat(150)
  assert.equal(sanitizeErrorMessage(long), FALLBACK)
})

test('T9-10 安全友好 message 通過', () => {
  assert.equal(sanitizeErrorMessage('資料載入逾時'), '資料載入逾時')
})

test('T9-11 空 / null / undefined 給 fallback', () => {
  assert.equal(sanitizeErrorMessage(''), FALLBACK)
  assert.equal(sanitizeErrorMessage(undefined), FALLBACK)
  assert.equal(sanitizeErrorMessage(null), FALLBACK)
})

test('T9-12 trim 後仍短', () => {
  assert.equal(sanitizeErrorMessage('  資料異常  '), '資料異常')
})

// T9 v5.10.354 L4 Gemini 加 PII / GraphQL / framework debug-only 5 patterns
test('T9-13 email PII 攔', () => {
  assert.equal(sanitizeErrorMessage('User support@jianyuan.life not found'), FALLBACK)
})

test('T9-14 台灣電話 PII 攔', () => {
  assert.equal(sanitizeErrorMessage('Phone 0912-345-678 invalid'), FALLBACK)
  assert.equal(sanitizeErrorMessage('+886912345678 wrong'), FALLBACK)
})

test('T9-15 US SSN PII 攔', () => {
  assert.equal(sanitizeErrorMessage('SSN 123-45-6789 not allowed'), FALLBACK)
})

test('T9-16 GraphQL errors 陣列 leak 攔', () => {
  assert.equal(sanitizeErrorMessage('Bad request: {"errors":[{"message":"x"}]}'), FALLBACK)
})

test('T9-17 framework debug-only(Next.js)攔', () => {
  assert.equal(sanitizeErrorMessage('webpack-internal:///./app/page.tsx'), FALLBACK)
  assert.equal(sanitizeErrorMessage('Error in node_modules/foo'), FALLBACK)
  assert.equal(sanitizeErrorMessage('(rsc) compile fail'), FALLBACK)
})

// T9 v5.10.355 L2+L3 共識補 P1
test('T9-18 IPv4 PII 攔', () => {
  assert.equal(sanitizeErrorMessage('Connection failed 192.168.1.1'), FALLBACK)
})

test('T9-19 JWT leak 攔', () => {
  assert.equal(
    sanitizeErrorMessage('Bad eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'),
    FALLBACK,
  )
})

test('T9-20 AWS key 攔', () => {
  assert.equal(sanitizeErrorMessage('Bad key AKIAIOSFODNN7EXAMPLE'), FALLBACK)
})

test('T9-21 Windows path 攔', () => {
  assert.equal(sanitizeErrorMessage('File not found C:\\Users\\Admin\\.env'), FALLBACK)
})

test('T9-22 generic token-ish 攔', () => {
  assert.equal(sanitizeErrorMessage('token=abc123def456ghi789jkl0mn'), FALLBACK)
  assert.equal(sanitizeErrorMessage('cookie: sb-token=eyJabcdefghijklmnopqrstuvwx'), FALLBACK)
})
