'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-TW">
      <body style={{ background: '#0a0e1a', color: '#e8dcc8', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
          <h1 style={{ color: '#c9a84c', fontSize: '1.5rem', marginBottom: '1rem' }}>系統發生錯誤</h1>
          <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            很抱歉，系統遇到了問題。請重新整理頁面，或聯繫客服。
          </p>
          <button
            onClick={() => reset()}
            style={{ background: '#c9a84c', color: '#0a0e1a', border: 'none', padding: '0.75rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            重新整理
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666' }}>
            客服信箱：support@jianyuan.life
          </p>
        </div>
      </body>
    </html>
  )
}
