// v5.10.206 Sprint 1 — ReportSeal 報告印章(Jamie 規格 20+ 元件之一)
// v5.10.294 editorial redesign:
//   - 砍 emoji ✓ ✓ ✓(降 AI 感、改 SVG checkmark)
//   - 砍 box border / shadow(從 SaaS Card 改 editorial signature line)
//   - 改 typography:serif chapter heading + 等寬 metadata
//   - 加 references 古籍依據摘要(權威感)
//   - 留 hash + engine 但設成 small footnote
import Image from 'next/image'

export interface ReportSealProps {
  reportId: string
  hash: string
  engineVersion: string // 例:'v5.10.197'
  reportDate: string // ISO 或 'YYYY-MM-DD'
  systemsCount?: number // 預設 14
  className?: string
  /** v5.10.294 加:本報告依據古籍清單(若無則用通用 default)*/
  references?: string[]
}

// v5.10.298 Gemini L4 P0 修:預設 references 改 generic、避免跟客戶實際系統不符
// 各方案應從 props 傳入專屬古籍清單(C 用八字+紫微+占星;E 出門訣用奇門系列;R 用合婚系列)
const DEFAULT_REFERENCES = [
  '東西方十四套命理系統交叉考據',
  '正統古籍源流 · 不同系統獨立佐證',
  '專業命理師審查 · 算法版本可追溯',
]

export function ReportSeal({
  reportId,
  hash,
  engineVersion,
  reportDate,
  systemsCount = 14,
  className = '',
  references,
}: ReportSealProps) {
  const displayHash = hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
  const refs = references && references.length > 0 ? references : DEFAULT_REFERENCES

  return (
    <section
      className={`relative ${className}`}
      role="contentinfo"
      aria-labelledby="report-seal-title"
      style={{ paddingTop: '48px', paddingBottom: '32px' }}
    >
      {/* 上方 hairline 分隔線 — editorial signature 慣例 */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.5), transparent)' }}
        aria-hidden
      />

      {/* logo + 標題:垂直 stack、center align、editorial */}
      <div className="text-center mb-8">
        <Image
          src="/logo-jianyuan.svg"
          alt="鑒源 JianYuan"
          width={36}
          height={36}
          unoptimized
          className="mx-auto opacity-80"
        />
        <h4
          id="report-seal-title"
          className="mt-3 text-[13px] font-medium tracking-[0.18em] text-[var(--jy-text-gold)]"
        >
          鑒源命理研究部門
        </h4>
        <p className="mt-1 text-[11px] tracking-[0.1em] text-[var(--jy-text-muted)]">
          {systemsCount} 套系統 · 交叉考據 · 獨立認證
        </p>
      </div>

      {/* 古籍依據 — 權威感的核心、editorial「依據出處」block */}
      <div className="max-w-2xl mx-auto mb-10">
        <p className="text-center text-[10px] tracking-[0.2em] text-[var(--jy-text-muted)] mb-4">
          本 報 告 依 據 古 籍
        </p>
        <ul className="text-[11px] text-[var(--jy-text-tertiary)] space-y-1.5 text-center leading-relaxed">
          {refs.slice(0, 5).map((r, i) => (
            <li key={i} className="italic" style={{ fontFamily: 'var(--jy-font-serif, Georgia), serif' }}>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* metadata footnote — 等寬 small caps、像 medical / legal report 認證 footer */}
      <div className="max-w-xl mx-auto pt-6 border-t border-[var(--jy-border-hairline)]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
          <dt className="text-[var(--jy-text-muted)]">REPORT ID</dt>
          <dd className="font-mono text-[var(--jy-text-tertiary)] truncate text-right">#{reportId.slice(0, 8)}</dd>
          <dt className="text-[var(--jy-text-muted)]">HASH</dt>
          <dd className="font-mono text-[var(--jy-text-tertiary)] truncate text-right" title={hash}>
            {displayHash}
          </dd>
          <dt className="text-[var(--jy-text-muted)]">ENGINE</dt>
          <dd className="font-mono text-[var(--jy-text-tertiary)] text-right">{engineVersion}</dd>
          <dt className="text-[var(--jy-text-muted)]">ISSUED</dt>
          <dd className="text-[var(--jy-text-tertiary)] text-right">{reportDate}</dd>
        </dl>
        <p className="mt-4 text-center text-[10px] text-[var(--jy-text-muted)] leading-relaxed tracking-wide">
          認 證 命 理 師 審 查 ・ 古 籍 規 則 交 叉 比 對 ・ 算 法 版 本 可 追 溯
        </p>
      </div>
    </section>
  )
}
