// v5.10.463 E2(GeminiPro r3:「✓ 標準字元缺設計感、應與品牌視覺呼應」):
// 四芒星辰勾號 — 對齊星盤/星空品牌元素、取代 &#10003;。純 SVG、server/client 通用。
export default function GoldMark({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={`inline-block shrink-0 ${className}`} aria-hidden>
      <path
        d="M8 1.5c.5 2.8 1.7 4 4.5 4.5-2.8.5-4 1.7-4.5 4.5-.5-2.8-1.7-4-4.5-4.5 2.8-.5 4-1.7 4.5-4.5z"
        fill="var(--color-gold)"
        opacity="0.9"
      />
      <circle cx="12.6" cy="12.4" r="1.1" fill="var(--color-gold)" opacity="0.45" />
    </svg>
  )
}
