'use client'

import { useState } from 'react'

const PLAN_TAGLINES: Record<string, string> = {
  C: '用十五套系統，重新認識自己',
  D: '一個問題，一份完整的答案',
  G15: '看清家族成員之間的能量互動',
  R: '用命理看清這段關係的本質',
  E1: '在對的時間出發，事半功倍',
  E2: '掌握整個月的最佳出行時機',
}

interface ShareCardProps {
  planCode: string
  clientName: string
  aiContent: string
  top5Timings?: unknown[]
}

export default function ShareCard({ planCode }: ShareCardProps) {
  const [copied, setCopied] = useState(false)

  const siteUrl = 'https://jianyuan.life'
  const shareText = `我最近用了一個命理分析平台，覺得蠻準的，推薦你也試試看！免費體驗 30 秒就有結果 ${siteUrl}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = siteUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShareLINE = () => {
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener')
  }

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener')
  }

  return (
    <div className="no-print section-card" style={{
      background: 'linear-gradient(135deg, rgba(197,150,58,0.06), rgba(15,22,40,0.4))',
      border: '1px solid rgba(197,150,58,0.15)',
      borderRadius: '16px',
      padding: '28px',
    }}>
      <div className="text-center mb-5">
        <h3 className="text-base font-semibold text-gold mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
          如果這份報告幫到了你
        </h3>
        <p className="text-text-muted text-sm leading-relaxed max-w-md mx-auto">
          也許你身邊也有人正在迷茫——不確定下一步該怎麼走、不知道自己適合什麼。<br/>
          把鑒源推薦給他，也許就是他需要的那面鏡子。
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={handleCopyLink}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all hover:scale-105"
          style={{ background: copied ? 'rgba(106,176,76,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(106,176,76,0.3)' : 'rgba(255,255,255,0.1)'}`, color: copied ? '#6ab04c' : 'var(--color-cream)' }}>
          {copied ? '✓ 已複製' : '複製連結'}
        </button>
        <button onClick={handleShareLINE}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all hover:scale-105"
          style={{ background: 'rgba(6,199,85,0.12)', border: '1px solid rgba(6,199,85,0.25)', color: '#06c755' }}>
          LINE
        </button>
        <button onClick={handleShareWhatsApp}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all hover:scale-105"
          style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}>
          WhatsApp
        </button>
      </div>
    </div>
  )
}
