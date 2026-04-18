'use client'
import { useMemo } from 'react'
import * as OpenCC from 'opencc-js'

// 類別 icon 對應（根據標題關鍵字）
const CATEGORY_ICONS: Record<string, string> = {
  個性: '🧭', 性格: '🧭', 特質: '🧭',
  事業: '💼', 財運: '💰', 工作: '💼',
  人際: '🤝', 關係: '🤝', 朋友: '👥',
  健康: '💊', 身體: '💊', 脾胃: '💊',
  感情: '💕', 婚姻: '💕', 愛情: '💕',
  流年: '📅', 運勢: '📅', 年度: '📅',
  生活: '🌱', 態度: '🌱', 能量: '🌱',
  建議: '✨', 提醒: '⚠️', 總結: '📌',
}

function pickIcon(title: string): string {
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (title.includes(key)) return icon
  }
  return '✦'
}

type Block = {
  title: string
  icon: string
  bullets: Array<{ label: string; content: string }>
  prefix?: string
}

// 把 AI 輸出的 markdown-like 文字切成 blocks
function parseToBlocks(text: string): Block[] {
  const blocks: Block[] = []
  // 匹配 "1. **標題**：" 或 "1. **標題** ："
  const sections = text.split(/(?=^\d+\.\s+\*?\*?[^\n]+\*?\*?[：:])/gm)

  for (const section of sections) {
    const titleMatch = section.match(/^(\d+)\.\s+\*?\*?([^*\n：:]+)\*?\*?[：:]/)
    if (!titleMatch) continue
    const title = titleMatch[2].trim()

    // 抽 bullets: "- **label**：content" 或 "- label：content"
    const bulletRegex = /^-\s+\*?\*?([^*\n：:]+)\*?\*?[：:]\s*(.+)$/gm
    const bullets: Array<{ label: string; content: string }> = []
    let m
    while ((m = bulletRegex.exec(section)) !== null) {
      bullets.push({
        label: m[1].trim(),
        content: m[2].trim(),
      })
    }

    blocks.push({
      title,
      icon: pickIcon(title),
      bullets,
    })
  }
  return blocks
}

// 清除殘留的 markdown ** 和其他符號
function stripMd(text: string): string {
  return text
    .replace(/\*\*\*/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^#+\s*/gm, '')
    .trim()
}

export default function AIAnalysisCard({
  text,
  title = 'AI 深度解讀',
  accentColor = 'purple',
}: {
  text: string
  title?: string
  accentColor?: 'purple' | 'amber' | 'emerald' | 'blue' | 'rose'
}) {
  // 1. 繁簡轉換
  const traditional = useMemo(() => {
    try {
      const converter = OpenCC.Converter({ from: 'cn', to: 'tw' })
      return converter(text)
    } catch {
      return text
    }
  }, [text])

  // 2. 解析成 blocks
  const blocks = useMemo(() => parseToBlocks(traditional), [traditional])

  // 如果解析失敗，fallback 顯示原文（但仍清掉 **）
  const fallbackText = useMemo(() => stripMd(traditional), [traditional])

  const accentMap = {
    purple: { bar: 'bg-purple-500', dot: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/5' },
    amber: { bar: 'bg-amber-500', dot: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
    emerald: { bar: 'bg-emerald-500', dot: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
    blue: { bar: 'bg-blue-500', dot: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
    rose: { bar: 'bg-rose-500', dot: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
  }
  const accent = accentMap[accentColor]

  return (
    <div className="glass rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <div className={`w-1 h-6 ${accent.bar} rounded-full`} />
        <h2 className="text-lg font-bold text-cream">{title}</h2>
      </div>

      {blocks.length >= 2 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blocks.map((block, i) => (
            <div
              key={i}
              className={`rounded-xl border ${accent.border} ${accent.bg} p-5 hover:bg-opacity-10 transition`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl" aria-hidden>{block.icon}</span>
                <h3 className={`text-base font-bold ${accent.dot}`}>{block.title}</h3>
              </div>
              {block.bullets.length > 0 ? (
                <ul className="space-y-3">
                  {block.bullets.map((b, j) => (
                    <li key={j} className="text-sm leading-relaxed text-text">
                      <strong className="text-white/95">{stripMd(b.label)}</strong>
                      <span className="text-white/50 mx-1">·</span>
                      <span className="text-white/80">{stripMd(b.content)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-relaxed text-text whitespace-pre-line">
                  {fallbackText}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Fallback: 無法解析成卡片，用清理過的文字輸出
        <div className="prose prose-invert max-w-none text-text leading-[1.9] whitespace-pre-line">
          {fallbackText}
        </div>
      )}
    </div>
  )
}
