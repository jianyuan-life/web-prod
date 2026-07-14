export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
        <p className="text-sm text-text-muted">載入中...</p>
      </div>
    </div>
  )
}
