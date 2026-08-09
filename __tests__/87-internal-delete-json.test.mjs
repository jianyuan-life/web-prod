import assert from 'node:assert/strict'
import test from 'node:test'

import { internalDelete } from '../lib/api.ts'

test('internalDelete sends an authenticated JSON body through its public options interface', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { input, init }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await internalDelete('/api/reports', {
      authToken: 'authenticated-fixture',
      body: { id: 'report-123', email: 'reader@example.test' },
    })

    assert.deepEqual(result, { success: true })
    assert.equal(request.input, '/api/reports')
    assert.equal(request.init.method, 'DELETE')
    assert.equal(request.init.headers.Authorization, 'Bearer authenticated-fixture')
    assert.equal(request.init.headers['Content-Type'], 'application/json')
    assert.equal(request.init.body, JSON.stringify({
      id: 'report-123',
      email: 'reader@example.test',
    }))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('internalDelete keeps the existing options-only call free of an invented body', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { input, init }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await internalDelete('/api/family-members/member-123', {
      authToken: 'authenticated-fixture',
    })

    assert.equal(request.input, '/api/family-members/member-123')
    assert.equal(request.init.method, 'DELETE')
    assert.equal(request.init.headers.Authorization, 'Bearer authenticated-fixture')
    assert.equal(request.init.headers['Content-Type'], undefined)
    assert.equal(request.init.body, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})
