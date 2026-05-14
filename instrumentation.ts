// v5.10.326 (P0 #1 監控對齊 — Next.js 16 instrumentation hook)
// 自動註冊 OpenTelemetry / Sentry / 自訂 monitoring,
// register() 只在 server 啟動時跑一次(cold start)
//
// 目前 stub mode:
//   - 偵測 SENTRY_DSN env、若有則 dynamic import @sentry/nextjs(尚未安裝、未啟用)
//   - 偵測 OTEL_EXPORTER_OTLP_ENDPOINT、若有則 dynamic import @vercel/otel
//   - 都沒有則純 console.info 標記啟動、不做任何事(零依賴)
//
// 啟用 Sentry 步驟(老闆 / 自註冊 sentry.io 帳號後):
//   1. npm install @sentry/nextjs
//   2. 設環境變數 SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
//   3. npx @sentry/wizard@latest -i nextjs(自動產生 sentry.client/server/edge.config.ts)
//   4. 重新 deploy

export async function register() {
  const startTime = Date.now()
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown'

  console.info(
    `[instrumentation] register() — env=${env} runtime=${process.env.NEXT_RUNTIME || 'nodejs'} ts=${new Date().toISOString()}`,
  )

  // Sentry(只在 SENTRY_DSN 設定時啟用、未安裝時靜默)
  if (process.env.SENTRY_DSN) {
    try {
      // Dynamic import 防 build 時 require 失敗(尚未安裝 @sentry/nextjs)
      // 確認 package 存在後改 static import
      // const Sentry = await import('@sentry/nextjs')
      // Sentry.init({
      //   dsn: process.env.SENTRY_DSN,
      //   tracesSampleRate: 0.1,
      //   environment: env,
      //   release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      // })
      console.info('[instrumentation] Sentry DSN detected but @sentry/nextjs not installed (stub mode)')
    } catch (err) {
      console.warn('[instrumentation] Sentry init failed', err)
    }
  }

  // OpenTelemetry(只在 OTEL_EXPORTER_OTLP_ENDPOINT 設定時啟用)
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    try {
      // const { registerOTel } = await import('@vercel/otel')
      // registerOTel({
      //   serviceName: 'jianyuan-web',
      //   instrumentations: ['fetch', 'http'],
      // })
      console.info('[instrumentation] OTLP endpoint detected but @vercel/otel not installed (stub mode)')
    } catch (err) {
      console.warn('[instrumentation] OTLP init failed', err)
    }
  }

  console.info(`[instrumentation] register() done in ${Date.now() - startTime}ms`)
}

// onRequestError(Next.js 16+ 標準錯誤 hook、registered 自動跑)
export async function onRequestError(
  error: { digest?: string } & Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: 'Pages Router' | 'App Router'; routePath: string; routeType: 'render' | 'route' | 'action' | 'middleware'; renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering' | 'server-action' },
) {
  console.error('[onRequestError]', JSON.stringify({
    ts: new Date().toISOString(),
    digest: error.digest,
    message: error.message?.slice(0, 500),
    stack: error.stack?.split('\n').slice(0, 5).join(' | '),
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  }))

  // 已 wired Sentry 時的轉送(stub):
  // if (process.env.SENTRY_DSN) {
  //   const Sentry = await import('@sentry/nextjs')
  //   Sentry.captureRequestError(error, request, context)
  // }
}
