'use client'

import { useEffect, useState } from 'react'

interface ReferralData {
  code: string
  totalReferrals: number
  isActive: boolean
}

interface PointsData {
  balance: number
  totalEarned: number
  totalUsed: number
  expiringIn30Days: number
}

export default function ReferralCard() {
  const [referral, setReferral] = useState<ReferralData | null>(null)
  const [points, setPoints] = useState<PointsData | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [refRes, ptsRes] = await Promise.all([
          fetch('/api/referral/my-code'),
          fetch('/api/points/balance'),
        ])
        if (refRes.ok) setReferral(await refRes.json())
        if (ptsRes.ok) setPoints(await ptsRes.json())
      } catch { /* 靜默 */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const shareUrl = referral?.code
    ? `https://jianyuan.life/auth/signup?ref=${referral.code}`
    : 'https://jianyuan.life'

  const shareText = '我在鑒源做了一份命理分析，覺得很準！免費體驗 30 秒出結果，推薦你也試試 👉'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const shareTo = (platform: string) => {
    const text = encodeURIComponent(shareText)
    const url = encodeURIComponent(shareUrl)
    const links: Record<string, string> = {
      line: `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
      // IG 不支援直接分享連結，引導複製
    }
    if (platform === 'ig') {
      handleCopy()
      alert('連結已複製！打開 Instagram 貼上到限動或訊息中分享')
      return
    }
    window.open(links[platform], '_blank', 'noopener')
  }

  if (loading) return null

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gold flex items-center gap-2">
        <span>&#9733;</span> 推薦朋友，雙方都獲獎勵
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 推薦碼 */}
        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <p className="text-xs text-text-muted">您的專屬推薦碼</p>
          <span className="text-lg font-bold text-gold tracking-wider">
            {referral?.code || '載入中...'}
          </span>
          <p className="text-[11px] text-text-muted/60">
            已推薦 {referral?.totalReferrals || 0} 人
            {referral && referral.totalReferrals > 0 && <span className="text-gold ml-1">+{referral.totalReferrals * 10} 點</span>}
          </p>
        </div>

        {/* 點數 */}
        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <p className="text-xs text-text-muted">我的獎勵點數</p>
          <p className="text-lg font-bold text-gold">{points?.balance || 0} <span className="text-sm font-normal text-text-muted">點</span></p>
          <p className="text-[11px] text-text-muted/60">
            1 點 = $1，結帳時可折抵
            {points && points.expiringIn30Days > 0 && (
              <span className="text-red-400 ml-1">{points.expiringIn30Days} 點即將到期</span>
            )}
          </p>
        </div>
      </div>

      {/* 一鍵推薦按鈕 */}
      <div>
        <p className="text-xs text-text-muted mb-2 text-center">一鍵推薦給朋友</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={handleCopy}
            className="px-4 py-2 rounded-lg text-xs transition-all hover:scale-105"
            style={{ background: copied ? 'rgba(106,176,76,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(106,176,76,0.3)' : 'rgba(255,255,255,0.1)'}`, color: copied ? '#6ab04c' : 'var(--color-cream)' }}>
            {copied ? '✓ 已複製' : '複製連結'}
          </button>
          <button onClick={() => shareTo('line')}
            className="px-4 py-2 rounded-lg text-xs transition-all hover:scale-105"
            style={{ background: 'rgba(6,199,85,0.12)', border: '1px solid rgba(6,199,85,0.25)', color: '#06c755' }}>
            LINE
          </button>
          <button onClick={() => shareTo('whatsapp')}
            className="px-4 py-2 rounded-lg text-xs transition-all hover:scale-105"
            style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}>
            WhatsApp
          </button>
          <button onClick={() => shareTo('facebook')}
            className="px-4 py-2 rounded-lg text-xs transition-all hover:scale-105"
            style={{ background: 'rgba(66,103,178,0.12)', border: '1px solid rgba(66,103,178,0.25)', color: '#4267B2' }}>
            Facebook
          </button>
          <button onClick={() => shareTo('ig')}
            className="px-4 py-2 rounded-lg text-xs transition-all hover:scale-105"
            style={{ background: 'rgba(225,48,108,0.12)', border: '1px solid rgba(225,48,108,0.25)', color: '#E1306C' }}>
            Instagram
          </button>
        </div>
      </div>

      <p className="text-[11px] text-text-muted/50 text-center">
        朋友透過您的連結註冊並首次購買，您獲得 10 點，朋友獲得 5 點
      </p>
    </div>
  )
}
