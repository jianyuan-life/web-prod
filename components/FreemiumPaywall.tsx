'use client'

// v5.4.17 P0 freemium conversion 強化
// 依據:Gemini + Codex 共識 — 免費頁太像終點、應做「準但不完整」缺口感
// 參考業界:Spotify free vs premium / Notion content blur / Calendly downsell
//
// 用途:嵌進 4 個免費速算頁(/tools/bazi/ziwei/qimen/name)CTA 區上方
// 顯示 3 個鎖定模組 + 進度條 + FOMO 文案

import Link from 'next/link'

type LockedModule = {
  icon: string
  title: string
  teaser: string  // 1 句 specific teaser、不要泛泛
}

interface Props {
  // 系統名(八字 / 紫微 / 奇門 / 姓名)、用於 personalize teaser
  systemName: string
  // 客戶名(若有、用於 personalize)
  clientName?: string
  // 結帳 URL params(已填的生辰、cross-sell 用)
  checkoutQuery?: string
}

// 通用 3 模組(所有命理系統共用、客戶看完免費都會想知道這 3 件)
const LOCKED_MODULES: LockedModule[] = [
  {
    icon: '📅',
    title: '未來 12 個月關鍵月份',
    teaser: '你在農曆 X 月有一次明顯轉折、原因需完整盤交叉判讀',
  },
  {
    icon: '⚠️',
    title: '財運 / 感情 / 事業風險提醒',
    teaser: '你命格中有 3 個容易踩的坑、需具體提醒避開',
  },
  {
    icon: '🎯',
    title: '專屬行動建議清單',
    teaser: '針對你的命格、付費版給你 8 條具體可執行的刻意練習',
  },
]

export default function FreemiumPaywall({ systemName, clientName, checkoutQuery = '' }: Props) {
  const greeting = clientName ? `${clientName}、` : ''
  const checkoutUrl = '/checkout?plan=C' + (checkoutQuery ? '&' + checkoutQuery : '')

  return (
    <div className="relative my-8">
      {/* 上方:免費版完成度進度條(FOMO) */}
      <div className="text-center mb-6">
        <p className="text-sm text-cream/80 mb-2">
          {greeting}你的免費{systemName}解讀完成了 <span className="text-gold font-bold">18%</span>
        </p>
        <div className="max-w-md mx-auto h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gold to-amber-400 rounded-full" style={{ width: '18%' }} />
        </div>
        <p className="text-[11px] text-text-muted/60 mt-2">
          剩 82% 命格深度分析、待你解鎖
        </p>
      </div>

      {/* 中間:3 個鎖定模組 預覽(blur + 🔒)*/}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {LOCKED_MODULES.map((m, i) => (
          <div
            key={i}
            className="relative glass rounded-xl p-4 overflow-hidden border border-gold/10"
          >
            {/* 內容(模糊 + 鎖定 overlay)*/}
            <div className="filter blur-[3px] select-none pointer-events-none">
              <div className="text-2xl mb-1">{m.icon}</div>
              <h4 className="text-sm font-bold text-white mb-1">{m.title}</h4>
              <p className="text-[11px] text-text-muted leading-relaxed">{m.teaser}</p>
            </div>
            {/* 鎖定 overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
              <div className="text-center">
                <div className="text-3xl mb-1">🔒</div>
                <p className="text-[10px] text-gold font-semibold">付費版解鎖</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 主 CTA(FOMO + benefit-driven)*/}
      <div className="text-center">
        <Link
          href={checkoutUrl}
          className="inline-block px-8 py-4 text-base bg-gradient-to-r from-gold to-amber-500 text-dark font-bold rounded-xl btn-glow hover:scale-105 transition-transform shadow-lg"
        >
          解鎖完整命格深度分析 $89
        </Link>
        <p className="text-[10px] text-text-muted/60 mt-3">
          一次性、無訂閱 · 約 8,000 字 · 14 套東西方系統交叉驗證 · PDF 永久保存
        </p>
      </div>

      {/* 對比表(Free vs Paid)*/}
      <div className="mt-6 max-w-lg mx-auto">
        <div className="text-center text-xs text-text-muted mb-3">免費 vs 付費版差異</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 text-text-muted font-normal w-1/2">項目</th>
              <th className="text-center py-2 text-text-muted font-normal">免費</th>
              <th className="text-center py-2 text-gold font-semibold">$89 完整版</th>
            </tr>
          </thead>
          <tbody className="text-[11px]">
            <tr className="border-b border-white/5">
              <td className="py-1.5 text-gray-400">{systemName}排盤</td>
              <td className="text-center text-green-400">✓</td>
              <td className="text-center text-gold">✓ 深度</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-1.5 text-gray-400">14 套系統交叉驗證</td>
              <td className="text-center text-gray-600">—</td>
              <td className="text-center text-gold">✓</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-1.5 text-gray-400">未來 12 月流年運勢</td>
              <td className="text-center text-gray-600">—</td>
              <td className="text-center text-gold">✓</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-1.5 text-gray-400">具體行動清單(刻意練習)</td>
              <td className="text-center text-gray-600">—</td>
              <td className="text-center text-gold">✓</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-1.5 text-gray-400">PDF 永久保存</td>
              <td className="text-center text-gray-600">—</td>
              <td className="text-center text-gold">✓</td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-400">心理學 + 命理深度整合</td>
              <td className="text-center text-gray-600">—</td>
              <td className="text-center text-gold">✓</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
