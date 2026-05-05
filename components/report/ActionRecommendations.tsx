/**
 * v5.10.10 R+8 #9 個人化行動摘要 2-3 條
 * Gemini Round 2 缺項補:從既有 personalityCard.talents/challenges + ai_content 抽取
 * 不動 prompt(R1 護欄已穩、避免 chapter split bug)
 *
 * 規則:
 *  - 從 talents Top 1 + challenges Top 1 推可執行下一步(規則式、非 AI 生成)
 *  - 配合季度時序(2026 上半 / 下半)、給 2-3 條
 *  - 顯示在報告頂部 Hero 上方、行動建議區
 */

interface ActionItem {
  icon: string
  badge: string
  badgeColor: string
  bgColor: string
  borderColor: string
  text: string
  timing: string
}

interface Props {
  talents?: string[]      // personalityCard.talents
  challenges?: string[]   // personalityCard.challenges
  yearTheme?: string      // personalityCard.yearTheme
}

// 從天賦 / 課題抽 keyword、推「可執行行動」
function extractKeywords(text: string): string[] {
  if (!text) return []
  // 抽 2-4 字中文片段(去 emoji / 標點 / 數字)
  const cleaned = text.replace(/[^一-鿿\s]/g, ' ').trim()
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 2 && t.length <= 6)
  return tokens.slice(0, 3)
}

// 規則式行動推導(保守、無外部依賴)
function deriveActions(talents: string[], challenges: string[], yearTheme: string): ActionItem[] {
  const actions: ActionItem[] = []

  const talentKw = talents.length > 0 ? extractKeywords(talents[0])[0] || '' : ''
  const challengeKw = challenges.length > 0 ? extractKeywords(challenges[0])[0] || '' : ''

  // 行動 #1:善用最強天賦
  if (talentKw) {
    actions.push({
      icon: '✨',
      badge: '2026 上半年 · 啟動',
      badgeColor: '#6ab04c',
      bgColor: 'rgba(106,176,76,0.10)',
      borderColor: 'rgba(106,176,76,0.30)',
      text: `善用「${talentKw}」此核心天賦、把它放在最重要的決策核心、不要讓它沉睡`,
      timing: 'Q1-Q2',
    })
  }

  // 行動 #2:化解主要課題
  if (challengeKw) {
    actions.push({
      icon: '⚠',
      badge: '持續 · 留意覺察',
      badgeColor: '#e0963a',
      bgColor: 'rgba(224,150,58,0.10)',
      borderColor: 'rgba(224,150,58,0.30)',
      text: `當「${challengeKw}」浮現時、5 秒覺察、不要當下反應 — 命格自動模式 ≠ 你真心想要的選擇`,
      timing: '全年',
    })
  }

  // 行動 #3:整合年度主題(若有)
  if (yearTheme && yearTheme.length > 5) {
    const cleaned = yearTheme.replace(/^[*\-•◆▪]\s*/, '').slice(0, 50)
    actions.push({
      icon: '🎯',
      badge: '2026 全年 · 北極星',
      badgeColor: '#bb8fce',
      bgColor: 'rgba(155,89,182,0.10)',
      borderColor: 'rgba(155,89,182,0.30)',
      text: cleaned,
      timing: '年度',
    })
  } else if (talentKw && challengeKw) {
    // 若無 yearTheme、合成「天賦 × 課題」整合行動
    actions.push({
      icon: '🎯',
      badge: '2026 下半年 · 整合',
      badgeColor: '#bb8fce',
      bgColor: 'rgba(155,89,182,0.10)',
      borderColor: 'rgba(155,89,182,0.30)',
      text: `把「${talentKw}」當主軸、「${challengeKw}」當校準器、上半年衝刺、下半年沈澱`,
      timing: 'Q3-Q4',
    })
  }

  return actions
}

export default function ActionRecommendations({ talents = [], challenges = [], yearTheme = '' }: Props) {
  const actions = deriveActions(talents, challenges, yearTheme)
  if (actions.length < 2) return null

  return (
    <div
      className="rounded-2xl px-6 py-5 mb-4 report-fade-in"
      style={{
        background: 'linear-gradient(135deg, rgba(106,176,76,0.05), rgba(155,89,182,0.04), rgba(224,150,58,0.05))',
        border: '1px solid rgba(245,215,110,0.30)',
      }}
      role="region"
      aria-label="2026 年度行動建議"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-gold/75 text-[11px] tracking-[3px] font-semibold flex items-center gap-2">
          <span>🎯</span>
          <span>2026 行動建議 · {actions.length} 條具體下一步</span>
        </div>
        <span className="text-text-muted/45 text-[9px]">基於最強天賦 + 主要課題綜合推算</span>
      </div>
      <div className="space-y-3">
        {actions.map((a, i) => (
          <div
            key={i}
            className="px-4 py-3 rounded-xl flex items-start gap-3"
            style={{ background: a.bgColor, border: `1px solid ${a.borderColor}` }}
          >
            <div className="text-2xl flex-shrink-0 mt-0.5" aria-hidden>{a.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
                  style={{
                    background: `${a.borderColor.replace('0.30', '0.18')}`,
                    color: a.badgeColor,
                    border: `1px solid ${a.borderColor}`,
                  }}
                >
                  {a.badge}
                </span>
                <span className="text-text-muted/55 text-[10px]">時段:{a.timing}</span>
              </div>
              <p className="text-cream text-[13px] sm:text-sm leading-relaxed">{a.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-4 pt-3 border-t border-gold/10">
        <span className="text-text-muted/50 text-[10px] tracking-wider">
          ✓ 完整年度規劃詳見下方「年度運勢」章節
        </span>
      </div>
    </div>
  )
}
