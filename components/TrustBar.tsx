'use client'

// v5.6.10 R3:Trust Bar — 對齊業界 SaaS 信任設計(Co-Star / 16Personalities)
// 用途:pricing/checkout/上方,讓客戶 5 秒看到「品質 / 安全 / 退費 / 規模」4 大保證
// 對應 5 家 audit 共識 P0「無真實社會證明 / 無風險逆轉 / Stripe 信任徽章缺」

import { useEffect, useState } from 'react'

type Variant = 'pricing' | 'checkout' | 'compact'

export default function TrustBar({ variant = 'pricing' }: { variant?: Variant }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => setCount(typeof d.count === 'number' ? d.count : null))
      .catch(() => {})
  }, [])

  const userCountLabel = count && count > 0 ? `${count.toLocaleString('en-US')}+` : '已上線'

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-text-muted py-2">
        <span className="flex items-center gap-1">
          <ShieldIcon /> Stripe 加密付款
        </span>
        <span className="flex items-center gap-1">
          <RefundIcon /> 失敗自動重試
        </span>
        <span className="flex items-center gap-1">
          <LockIcon /> SSL/TLS 1.3
        </span>
        <span className="flex items-center gap-1">
          <StarIcon /> {userCountLabel} 用戶選擇
        </span>
      </div>
    )
  }

  // pricing / checkout 完整版
  return (
    <div className="max-w-4xl mx-auto mb-8">
      <div className="glass rounded-2xl border border-gold/20 px-5 py-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <TrustItem
            icon={<StarIcon />}
            title="14 系統"
            sub="交叉驗證"
            tooltip="十四套東西方命理系統、三層加權架構、不是某位老師說"
          />
          <TrustItem
            icon={<RefundIcon />}
            title="生成保證"
            sub="失敗自動重試 3 次"
            tooltip="若報告生成失敗、系統自動重試最多 3 次;若仍失敗、24 小時內客服協助處理"
          />
          <TrustItem
            icon={<ShieldIcon />}
            title="Stripe 加密"
            sub="PCI-DSS 認證付款"
            tooltip="信用卡資訊不經過鑑源伺服器、由 Stripe 全程加密處理"
          />
          <TrustItem
            icon={<LockIcon />}
            title="隱私保護"
            sub="SSL/TLS 1.3 + AES-256"
            tooltip="出生資料加密儲存於 Supabase AWS 新加坡區、符合 GDPR"
          />
        </div>
        {variant === 'checkout' && (
          <p className="text-center text-[11px] text-text-muted mt-4 leading-[1.8]">
            付款由 <strong className="text-gold/80">Stripe</strong> 處理 ·
            支援 <strong className="text-gold/80">Visa / MasterCard / Apple Pay / Google Pay</strong> ·
            報告為個人化數位商品、付款後即開始精密計算、依電子商品慣例不支援退款;生成失敗系統自動重試最多 3 次、若仍失敗客服協助補開新單
          </p>
        )}
      </div>
    </div>
  )
}

function TrustItem({
  icon,
  title,
  sub,
  tooltip,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  tooltip?: string
}) {
  return (
    <div className="flex flex-col items-center" title={tooltip}>
      <div className="text-gold mb-1.5">{icon}</div>
      <div className="text-base font-bold text-cream leading-tight">{title}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>
    </div>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function RefundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M3 10h18" />
      <path d="M3 14h11" />
      <path d="M19 14l3 3-3 3" />
      <path d="M3 6h18" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
