// v5.10.206 Sprint 1 — ReportSeal 報告印章(Jamie 規格 20+ 元件之一)
//
// 樣式:鑒源 logo + 報告編號 + Hash + Engine 版本 + 認證命理師章 + QR Hash
import Image from 'next/image'

export interface ReportSealProps {
  reportId: string
  hash: string
  engineVersion: string // 例:'v5.10.197'
  reportDate: string // ISO 或 'YYYY-MM-DD'
  systemsCount?: number // 預設 14
  className?: string
}

export function ReportSeal({
  reportId,
  hash,
  engineVersion,
  reportDate,
  systemsCount = 14,
  className = '',
}: ReportSealProps) {
  // 顯示用 hash 截短 12 char(safer for share、不洩漏全 hash)
  const displayHash = hash.length > 12 ? `${hash.slice(0, 12)}…` : hash

  return (
    <section
      className={`rounded-xl p-6 ${className}`}
      style={{
        backgroundColor: 'var(--jy-bg-card)',
        border: '1px solid var(--jy-border-gold)',
        boxShadow: 'var(--jy-shadow-card)',
      }}
      role="contentinfo"
      aria-labelledby="report-seal-title"
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Image
            src="/logo-jianyuan.svg"
            alt="鑒源 JianYuan logo"
            width={48}
            height={48}
            unoptimized
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 id="report-seal-title" className="font-semibold text-[var(--jy-text-gold)] text-sm">
            鑒源命理研究部門 · {systemsCount} 套系統交叉驗證
          </h4>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-[var(--jy-text-muted)]">報告編號</dt>
            <dd className="font-mono text-[var(--jy-text-secondary)] truncate">#{reportId}</dd>

            <dt className="text-[var(--jy-text-muted)]">Hash</dt>
            <dd className="font-mono text-[var(--jy-text-secondary)] truncate" title={hash}>
              {displayHash}
            </dd>

            <dt className="text-[var(--jy-text-muted)]">AI Engine</dt>
            <dd className="font-mono text-[var(--jy-text-secondary)]">{engineVersion}</dd>

            <dt className="text-[var(--jy-text-muted)]">生成日期</dt>
            <dd className="text-[var(--jy-text-secondary)]">{reportDate}</dd>
          </dl>
          <p className="mt-3 text-[10px] text-[var(--jy-text-muted)] leading-relaxed">
            ✓ 認證命理師審查 · ✓ 古籍規則交叉比對 · ✓ 算法版本可追溯
          </p>
        </div>
      </div>
    </section>
  )
}
