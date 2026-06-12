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
  // v5.10.128 P0 修(L4 Gemini Vision F1 C 何紀萳 mobile ch00「西洋占星 0 分 / 需加強 25%」visual broken):
  //   score=0 通常是 missing data(缺生時 / raw_data 欄位空)、不該 render 成「需加強 25%」尷尬 label
  //   修:filter 掉 score=0 / score<30 的系統(視為 missing、不顯示)
  const filtered = analyses.filter(a =>
    !['南洋術數', '南洋数术', '南洋'].includes(a.system) &&
    a.score > 30  // 排除 0 / 低於 30 的 missing-data 系統
  )
  if (filtered.length < 3) return null

  return (
    <div
      className="md:hidden rounded-2xl px-4 py-4 mb-4 report-fade-in"
      style={{
        background: 'linear-gradient(135deg, rgba(122,159,207,0.06), rgba(15,22,40,0.40))',
        border: '1px solid rgba(122,159,207,0.25)',
      }}
      role="navigation"
      aria-label="14 套系統快速跳轉"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] tracking-[3px] font-semibold" style={{ color: 'rgba(122,159,207,0.85)' }}>
          14 套系統 · 點擊跳詳解
        </div>
        <span className="text-text-muted/45 text-[9px]">{filtered.length} 套</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.slice(0, 14).map((a) => {
          const bm = getBenchmark(a.score)
          const insight = getInsight(a.system, a.score)
          return (
            // v5.10.49 P0 修(老闆抓 14 dead anchor、v5.10.46 sys-XXX id 修補沒生效真因):
            //   C 方案章節 title 是「二、你是什麼樣的人」整合多系統、沒「八字四柱」獨立章節
            //   原 href={`#sys-${slugify(系統名)}`} 在 production 0 對應 target = 14 連結全 dead
            //   修補:nav 全部跳 #systems-radar-title(SystemsRadar 14 系統評分區、已存在 id)
            //   客戶點任一系統 nav → 跳評分 radar 看完整 14 系統表
            <a
              key={a.system}
              href="#systems-radar-title"
              className="systems-anchor-link px-3 py-2.5 rounded-lg block"
              style={{
                background: 'rgba(0,0,0,0.20)',
                border: `1px solid ${bm.color}30`,
                textDecoration: 'none',
              }}
              aria-label={`${a.system}、${insight}、點擊查看詳解`}
            >
              {/* v5.10.433 砍數字評分(老闆指令)、留系統名 + 一句定性 + 跳轉箭頭、色點作 qualitative tier 標示 */}
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: bm.color }} aria-hidden />
                <span
                  className="text-cream font-semibold text-[13px] flex-1 leading-snug"
                  style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                >
                  {a.system}
                </span>
                <span className="text-text-muted/40 text-[12px] flex-shrink-0" aria-hidden>→</span>
              </div>
              <span
                className="text-text-muted/65 text-[10px] leading-snug block"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'keep-all',
                  overflowWrap: 'break-word',
                }}
              >
                {insight}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
