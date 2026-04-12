'use client'

import { useEffect, useState, useCallback } from 'react'

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

// SVG icon 元件
function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// Loading 骨架元件
function LoadingSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 space-y-4 animate-pulse">
      <div className="h-4 w-48 bg-white/10 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="h-3 w-24 bg-white/10 rounded" />
          <div className="h-7 w-36 bg-white/10 rounded" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="h-3 w-24 bg-white/10 rounded" />
          <div className="h-7 w-20 bg-white/10 rounded" />
          <div className="h-3 w-32 bg-white/10 rounded" />
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-9 w-28 bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function ReferralCard() {
  const [referral, setReferral] = useState<ReferralData | null>(null)
  const [points, setPoints] = useState<PointsData | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (isRetry = false) => {
    try {
      setError(null)
      const [refRes, ptsRes] = await Promise.all([
        fetch('/api/referral/my-code'),
        fetch('/api/points/balance'),
      ])

      if (refRes.ok) {
        const refData = await refRes.json()
        // 推薦碼不應為空或 "---"，重試一次
        if ((!refData.code || refData.code === '---') && !isRetry) {
          // 等待 1 秒後重試
          await new Promise(r => setTimeout(r, 1000))
          return fetchData(true)
        }
        setReferral(refData)
      } else {
        setError('無法取得推薦碼，請稍後再試')
      }

      if (ptsRes.ok) {
        setPoints(await ptsRes.json())
      }
    } catch {
      setError('網路連線異常，請檢查網路後重新整理頁面')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const shareUrl = referral?.code
    ? `https://jianyuan.life/auth/signup?ref=${referral.code}`
    : 'https://jianyuan.life'

  const shareText = '如果你也正在尋找方向，這個平台用十五套命理系統幫你看清自己。免費體驗30秒出結果'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* 瀏覽器不支援剪貼簿 */ }
  }

  const shareTo = (platform: string) => {
    const text = encodeURIComponent(shareText)
    const url = encodeURIComponent(shareUrl)
    const links: Record<string, string> = {
      line: `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
    }
    if (platform === 'ig') {
      handleCopy()
      alert('連結已複製！打開 Instagram 貼上到限動或訊息中分享')
      return
    }
    window.open(links[platform], '_blank', 'noopener')
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div className="glass rounded-2xl p-5 space-y-3 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold flex items-center gap-2">
          <span>&#9733;</span> 推薦朋友，雙方都獲獎勵
        </h3>
        {(points?.balance || 0) > 0 && (
          <span className="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">{points?.balance} 點可用</span>
        )}
      </div>

      <p className="text-xs text-text-muted/70 text-center">
        朋友透過連結註冊並購買，您獲得 10 點（$10），朋友獲得 5 點（$5）
      </p>

      {/* 一鍵推薦 */}
      <div>
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{
              background: copied ? 'rgba(106,176,76,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${copied ? 'rgba(106,176,76,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: copied ? '#6ab04c' : 'var(--color-cream)',
            }}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? '已複製' : '複製連結'}
          </button>
          <button onClick={() => shareTo('line')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{ background: 'rgba(6,199,85,0.12)', border: '1px solid rgba(6,199,85,0.25)', color: '#06c755' }}>
            <LineIcon />
            LINE
          </button>
          <button onClick={() => shareTo('whatsapp')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366' }}>
            <WhatsAppIcon />
            WhatsApp
          </button>
          <button onClick={() => shareTo('facebook')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{ background: 'rgba(66,103,178,0.12)', border: '1px solid rgba(66,103,178,0.25)', color: '#4267B2' }}>
            <FacebookIcon />
            Facebook
          </button>
          <button onClick={() => shareTo('ig')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, rgba(131,58,180,0.12), rgba(225,48,108,0.12), rgba(253,169,29,0.12))',
              border: '1px solid rgba(225,48,108,0.25)',
              color: '#E1306C',
            }}>
            <InstagramIcon />
            Instagram
          </button>
        </div>
      </div>

      {referral && referral.totalReferrals > 0 && (
        <p className="text-[11px] text-gold/60 text-center">已幫助 {referral.totalReferrals} 位朋友找到方向</p>
      )}
    </div>
  )
}
