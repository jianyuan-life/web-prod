import { createHash, createHmac } from 'node:crypto'
import { test, done } from './harness.mjs'
import { hmacSha256HexSync, sha256HexSync } from '../lib/consultation/sha256.ts'

const vectors = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
]

for (const [input, expected] of vectors) {
  test(`SHA-256 standard vector: ${JSON.stringify(input)}`, () => {
    if (sha256HexSync(input) !== expected) throw new Error('standard vector mismatch')
  })
}

for (const input of ['鑑源人生藍圖與家族藍圖', 'a'.repeat(1_000_000)]) {
  test(`SHA-256 matches node:crypto (${input.length} bytes/chars)`, () => {
    const expected = createHash('sha256').update(input, 'utf8').digest('hex')
    if (sha256HexSync(input) !== expected) throw new Error('node:crypto parity mismatch')
  })
}

for (const [key, message] of [
  ['key', 'The quick brown fox jumps over the lazy dog'],
  ['專用遙測金鑰-'.repeat(8), '客戶資料不應原樣離開系統'],
  ['long-key-'.repeat(20), 'message'],
]) {
  test(`HMAC-SHA256 matches node:crypto (${Buffer.byteLength(key)}-byte key)`, () => {
    const expected = createHmac('sha256', key).update(message).digest('hex')
    if (hmacSha256HexSync(key, message) !== expected) throw new Error('node:crypto HMAC parity mismatch')
  })
}

await done()
