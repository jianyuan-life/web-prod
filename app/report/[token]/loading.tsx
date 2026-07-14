// Route-level fallback：保留在報告內容解析期間，讓使用者與輔助科技
// 都能明確知道頁面仍在安全讀取，而不是看到空白畫面。
export default function Loading() {
  return (
    <div
      data-report-shell
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1628 48%, #0a0e1a 100%)' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div className="glass relative w-full max-w-md overflow-hidden rounded-2xl px-8 py-12 text-center sm:px-12">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.75), transparent)' }}
          aria-hidden="true"
        />
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 text-xl font-semibold text-gold"
          aria-hidden="true"
        >
          鑒
        </div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.32em] text-gold/70">鑒 源 命 理</p>
        <h1 className="text-xl font-semibold text-cream sm:text-2xl" style={{ fontFamily: 'var(--font-sans)' }}>
          正在開啟您的私人報告
        </h1>
        <p className="mt-3 text-sm leading-7 text-text-muted">正在安全讀取報告內容，請稍候。</p>
        <div className="mx-auto mt-7 h-px w-24 overflow-hidden bg-gold/15" aria-hidden="true">
          <div className="h-full w-1/2 bg-gold/70 motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  )
}
