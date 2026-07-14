export default function CheckoutSecurityNote() {
  return (
    <aside className="checkout-security-note" aria-labelledby="checkout-security-heading">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3 5.5 5.7v5.8c0 4.3 2.7 7.7 6.5 9.5 3.8-1.8 6.5-5.2 6.5-9.5V5.7L12 3Z" />
        <path d="m9.2 12 1.8 1.8 3.9-4" />
      </svg>
      <div>
        <h3 id="checkout-security-heading">付款與資料處理</h3>
        <ul>
          <li>卡片資料由 Stripe 直接處理，不會經過鑒源伺服器。</li>
          <li>若訂單需要付款，完成付款後系統才會開始生成報告。</li>
        </ul>
      </div>
    </aside>
  )
}
