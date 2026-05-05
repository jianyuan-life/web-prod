/**
 * v5.10.10 R+8 #1 Mobile 14 套錨點連結(取代「完全收合」)
 * Gemini Round 2 反對:不要「14 套全收合 mobile 完全藏」、保留可發現性
 *
 * Mobile 首屏顯示「14 套能力評分總覽」錨點清單
 * 每張卡:系統名 + 分數 + 簡短業界對標、點擊跳轉到該系統詳述章節
 *
 * Desktop 側(>= 768px)由 SystemsRadar 主導、本元件隱藏
 */

interface Analysis {
  system: string
  score: number
}

interface Props {
  analyses: Analysis[]
}

function getBenchmark(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Top 10%', color: '#6ab04c' }
  if (score >= 75) return { label: 'Top 30%', color: '#c9a84c' }
  if (score >= 65) return { label: '中段 50%', color: '#7a9fcf' }
  return { label: '需加強 25%', color: '#e0963a' }
}

function getInsight(system: string, score: number): string {
  // 一句核心洞察(R+8 #3 修正:評分卡保留核心對標、不極簡化)
  if (score >= 85) return `${system}強勢、本能型優勢`
  if (score >= 75) return `${system}穩固、可深耕`
  if (score >= 65) return `${system}中等、需主動運用`
  return `${system}潛能未發、建議學習`
}

function slugify(s: string): string {
  return s.replace(/[\s/]+/g, '-').toLowerCase()
}

export default function SystemsAnchorList({ analyses = [] }: Props) {
  const filtered = analyses.filter(a => !['南洋術數', '南洋数术', '南洋'].includes(a.system))
  if (filtered.length < 3) return null

  return (
    <div
      className="md:hidden rounded-2xl px-4 py-4 mb-4 report-fade-in"
      style={{
        background: 'linear-gradient(135deg, rgba(122,159,207,0.06), rgba(15,22,40,0.40))',
        border: '1px solid rgba(122,159,207,0.25)',
      }}
      role="navigation"
      aria-label="14 套系統能力評分快速跳轉"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] tracking-[3px] font-semibold" style={{ color: 'rgba(122,159,207,0.85)' }}>
          📊 14 套能力評分 · 點擊跳詳解
        </div>
        <span className="text-text-muted/45 text-[9px]">{filtered.length} 套</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.slice(0, 14).map((a) => {
          const bm = getBenchmark(a.score)
          const insight = getInsight(a.system, a.score)
          return (
            <a
              key={a.system}
              href={`#sys-${slugify(a.system)}`}
              className="systems-anchor-link px-3 py-2.5 rounded-lg block"
              style={{
                background: 'rgba(0,0,0,0.20)',
                border: `1px solid ${bm.color}30`,
                textDecoration: 'none',
              }}
              aria-label={`${a.system} 評分 ${a.score} 分、${bm.label}、點擊查看詳解`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-cream font-semibold text-[13px] truncate flex-1 mr-2">{a.system}</span>
                <span className="font-extrabold text-base" style={{ color: bm.color, fontFamily: 'var(--font-mono, monospace)' }}>
                  {a.score}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-text-muted/65 truncate flex-1 mr-1">{insight}</span>
                <span className="font-semibold flex-shrink-0" style={{ color: bm.color }}>
                  {bm.label}
                </span>
              </div>
            </a>
          )
        })}
      </div>
      <div className="text-center mt-3 pt-2 border-t border-white/5">
        <span className="text-text-muted/50 text-[10px] tracking-wider">
          業界平均 65 分 · 滿分 100
        </span>
      </div>
    </div>
  )
}
