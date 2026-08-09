import { createServer } from 'node:http'

function writeJson(response, status, value, extraHeaders = {}) {
  const body = value == null ? '' : JSON.stringify(value)
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, range, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  })
  response.end(body)
}

export async function createE3FixtureServer({ fixture, port = 0, host = '127.0.0.1' }) {
  if (!fixture || fixture.schema !== 'e3-fixtures/v1') {
    throw new Error('E3 fixture schema 必須是 e3-fixtures/v1')
  }

  const requests = []
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || host}`)
    requests.push({ method: request.method || 'GET', pathname: requestUrl.pathname })

    if (request.method === 'OPTIONS') {
      writeJson(response, 204, null)
      return
    }

    if (requestUrl.pathname === '/auth/v1/user') {
      const authorization = request.headers.authorization || ''
      if (!authorization.startsWith('Bearer e3-freeze-')) {
        writeJson(response, 401, { code: 'bad_jwt', message: 'Synthetic fixture token required' })
        return
      }
      writeJson(response, 200, fixture.auth.user)
      return
    }

    if (requestUrl.pathname === '/auth/v1/token') {
      writeJson(response, 200, {
        ...fixture.auth.session,
        user: fixture.auth.user,
      })
      return
    }

    if (requestUrl.pathname === '/auth/v1/settings') {
      writeJson(response, 200, { external: {}, disable_signup: true })
      return
    }

    if (requestUrl.pathname === '/rest/v1/paid_reports' && request.method === 'GET') {
      const accessTokenFilter = requestUrl.searchParams.get('access_token') || ''
      const matchesFixture = accessTokenFilter === `eq.${fixture.report.access_token}`
      const wantsObject = String(request.headers.accept || '').includes('application/vnd.pgrst.object+json')

      if (!matchesFixture) {
        writeJson(response, wantsObject ? 406 : 200, wantsObject
          ? { code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }
          : [])
        return
      }

      writeJson(response, 200, wantsObject ? fixture.report : [fixture.report], {
        'Content-Range': '0-0/1',
      })
      return
    }

    if (requestUrl.pathname.startsWith('/rest/v1/')) {
      if (request.method === 'POST') {
        writeJson(response, 201, null)
        return
      }
      if (request.method === 'PATCH' || request.method === 'DELETE') {
        writeJson(response, 204, null)
        return
      }
      writeJson(response, 200, [])
      return
    }

    writeJson(response, 404, { error: 'Synthetic E3 fixture route not found' })
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, host, resolveListen)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('無法取得 E3 fixture server port')
  }

  return {
    origin: `http://${host}:${address.port}`,
    requests,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose())
    }),
  }
}
