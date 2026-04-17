export default function ReportNotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="glass rounded-2xl p-8 sm:p-10 max-w-md text-center">
        <div className="text-5xl mb-4" aria-hidden="true">&#128270;</div>
        <h2 className="text-xl font-bold text-cream mb-3">找不到報告</h2>
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          此報告連結無效或已過期。請確認您的連結是否正確，或前往儀表板查看您的報告。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
          <a
            href="/dashboard"
            className="px-5 py-3 bg-gold text-dark font-semibold rounded-lg btn-glow text-sm whitespace-nowrap transition-transform hover:-translate-y-0.5"
          >
            前往儀表板
          </a>
          <a
            href="/"
            className="px-5 py-3 glass rounded-lg text-sm text-text-muted hover:text-gold transition-colors whitespace-nowrap"
          >
            回首頁
          </a>
        </div>
      </div>
    </div>
  )
}
