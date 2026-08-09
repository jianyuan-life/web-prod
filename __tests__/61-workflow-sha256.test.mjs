import { createHash } from 'node:crypto'
import { test, done } from './harness.mjs'
import { sha256HexSync } from '../lib/consultation/sha256.ts'

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

await done()
