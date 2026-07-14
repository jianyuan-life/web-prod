export default function DashboardLoading() {
  return (
    <div className="py-20" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在載入私人報告檔案庫</span>
      <div className="max-w-5xl mx-auto px-6" aria-hidden="true">
        {/* 標題骨架 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-7 w-32 rounded-lg animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
            <div className="h-4 w-48 rounded mt-2 animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
          </div>
          <div className="h-10 w-28 rounded-lg animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
        </div>
        {/* 報告卡片骨架 */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-xl p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
                <div className="flex-1">
                  <div className="h-5 w-24 rounded animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
                  <div className="h-3 w-56 rounded mt-2 animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
                </div>
                <div className="h-8 w-20 rounded-lg animate-pulse" style={{ background: 'var(--jy-ui-line)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
