'use client'

// v5.4.18 freemium 重構(Gemini 全網 grounding + Codex 共識)
// 業界對標:Spotify / Notion / Headspace / Calendly 2024-2025 SOTA
// 改進:
//   - Bento-box 6 模組(原 3、強化好奇心缺口)
//   - 首屏極簡(對比表收進可摺疊區、降認知負荷)
//   - 漸進式揭露(每模組獨立 bottom sheet on click)
//   - 動態進度條(隨 modal 開啟 +)
//   - Social proof 24h X 人解鎖
//   - 風險透明化(無訂閱陷阱)
// 業界 benchmark:標準 3-5%、優秀 PLG 6-8%、Notion 10-13%

import Link from 'next/link'
import { useState } from 'react'

type LockedModule = {
  icon: string
  title: string
  hint: string
  detail: string  // 點擊後 modal 顯示的詳細 teaser
}

interface Props {
  systemName: string
  clientName?: string
  checkoutQuery?: string
}

// v5.4.18 Bento-box 6 模組(Gemini 對標 Headspace 2025)
const LOCKED_MODULES: LockedModule[] = [
  {
    icon: '📅',
    title: '未來 12 月流年',
    hint: '逐月運勢曲線',
    detail: '每月的吉凶高低、最關鍵的轉折月份(精確到農曆月)、你該主動出擊還是按兵不動。',
  },
  {
    icon: '💼',
    title: '事業轉折點',
    hint: '黃金期 vs 蟄伏期',
    detail: '你下一個事業大運在何時、適合創業還是任職、哪一年是不可錯過的爆發點。',
  },
  {
    icon: '💰',
    title: '財富軌跡',
    hint: '正財偏財佈局',
    detail: '你的命格是穩健存錢型還是投機獲利型、合適的投資方位、避免破財的具體年月。',
  },
  {
    icon: '❤️',
    title: '正緣時機',
    hint: '感情運勢預測',
    detail: '你的桃花年份(已婚 = 婚姻穩定度檢視)、伴侶命格匹配方向、避開的對象類型。',
  },
  {
    icon: '⚠️',
    title: '危機預警',
    hint: '3 個容易踩的坑',
    detail: '你命格中最容易爆發的 3 個風險點(健康/人際/決策)、預警年份 + 具體預防方案。',
  },
  {
    icon: '🎯',
    title: '刻意練習清單',
    hint: '8 條可執行行動',
    detail: '針對你獨特命格、付費版給 8 條具體刻意練習(每條附難度分級 + 環境觸發點 + 持續週期)。',
  },
]

export default function FreemiumPaywall({ systemName, clientName, checkoutQuery = '' }: Props) {
  const [openModal, setOpenModal] = useState<number | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [progress, setProgress] = useState(18)  // 預設 18%、開過 modal 後動態 +

  const greeting = clientName ? `${clientName}、` : ''
  const checkoutUrl = '/checkout?plan=C' + (checkoutQuery ? '&' + checkoutQuery : '')

  const handleModalOpen = (i: number) => {
    setOpenModal(i)
    // Zeigarnik 效應:打開 modal 推進度條到 30%、製造「快接近解鎖」感
    if (progress < 30) setProgress(30)
  }

  return (
    <div className="my-8">
      {/* 1. 動態進度條(FOMO + Zeigarnik 效應)*/}
      <div className="text-center mb-6">
        <p className="text-sm text-cream/80 mb-2">
          {greeting}你的免費{systemName}解讀完成 <span className="text-gold font-bold">{progress}%</span>
        </p>
        <div className="max-w-md mx-auto h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] text-text-muted/60 mt-2">
          剩 {100 - progress}% 命格深度分析、待你解鎖
        </p>
      </div>

      {/* 2. Bento-box 6 模組(點擊揭露 detail)*/}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-6 max-w-3xl mx-auto">
        {LOCKED_MODULES.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleModalOpen(i)}
            className="relative glass rounded-xl p-3 overflow-hidden border border-gold/15 hover:border-gold/40 transition-all text-left group"
          >
            <div className="flex items-start gap-2 mb-1">
              <span className="text-xl">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white truncate">{m.title}</h4>
                <p className="text-[10px] text-text-muted/70 truncate">{m.hint}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-gold/80">點擊預覽</span>
              <span className="text-sm">🔒</span>
            </div>
          </button>
        ))}
      </div>

      {/* 3. 主 CTA(極簡、單一 job)*/}
      <div className="text-center mb-3">
        <Link
          href={checkoutUrl}
          className="inline-block px-10 py-4 text-base bg-gradient-to-r from-gold to-amber-500 text-dark font-bold rounded-xl btn-glow hover:scale-105 transition-transform shadow-xl"
        >
          解鎖完整 14 系統深度分析 $89
        </Link>
        <p className="text-[11px] text-text-muted/70 mt-3">
          ✓ 一次性付款、無訂閱陷阱 　 ✓ 約 8,000 字 PDF 永久保存 　 ✓ 14 套東西方系統交叉驗證
        </p>
      </div>

      {/* 4. Social proof(24h 動態、業界對標 Booking.com)*/}
      <p className="text-center text-[11px] text-cream/60 mb-3">
        🌟 過去 24 小時、已有多位客戶解鎖完整命格報告
      </p>

      {/* 5. 收摺對比表(降認知負荷、Notion 極簡 Paywall)*/}
      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowCompare(v => !v)}
          className="text-xs text-gold/70 hover:text-gold underline-offset-2 hover:underline"
        >
          {showCompare ? '收起' : '查看免費 vs 付費版完整差異'}
        </button>
      </div>

      {showCompare && (
        <div className="mt-4 max-w-lg mx-auto">
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
                <td className="py-1.5 text-gray-400">未來 12 月流年</td>
                <td className="text-center text-gray-600">—</td>
                <td className="text-center text-gold">✓</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-1.5 text-gray-400">事業 / 財富 / 感情詳解</td>
                <td className="text-center text-gray-600">—</td>
                <td className="text-center text-gold">✓</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-1.5 text-gray-400">8 條刻意練習行動</td>
                <td className="text-center text-gray-600">—</td>
                <td className="text-center text-gold">✓</td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-400">PDF 永久保存</td>
                <td className="text-center text-gray-600">—</td>
                <td className="text-center text-gold">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Modal(漸進式揭露、Spotify Bottom Sheet 對標)*/}
      {openModal !== null && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setOpenModal(null)}
        >
          <div
            className="bg-[#1a1a1a] border border-gold/30 rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl">{LOCKED_MODULES[openModal].icon}</span>
              <div>
                <h3 className="text-lg font-bold text-white">{LOCKED_MODULES[openModal].title}</h3>
                <p className="text-xs text-gold/80">{LOCKED_MODULES[openModal].hint}</p>
              </div>
            </div>
            <p className="text-sm text-text leading-relaxed mb-5">
              {LOCKED_MODULES[openModal].detail}
            </p>
            <Link
              href={checkoutUrl}
              className="block text-center px-6 py-3 bg-gradient-to-r from-gold to-amber-500 text-dark font-bold rounded-xl btn-glow"
            >
              解鎖此模組 + 全部分析 $89
            </Link>
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="block w-full mt-3 text-center text-xs text-text-muted hover:text-cream"
            >
              關閉(繼續看免費版)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
