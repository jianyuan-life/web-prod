// 個資遮蔽工具(v5.4.10、P3 Gemini 個資保護建議)
//
// 用途:後台 admin UI 顯示客戶 email/手機/姓名時、預設遮蔽
//   - admin 確實需要看完整 email 時、可加 hover title 顯示原始(audit log 留痕)
//   - 客戶體驗:即使後台被截圖、也不會洩漏完整客戶資料
//
// 設計原則:
//   - 純 utility function、無副作用
//   - 保留首尾字、中間以星號取代
//   - 邊界情況都有 fallback
//   - 不破壞既有 audit log(audit log 仍存原始 email、必要時可查)

/**
 * 遮蔽 email、保留首字 + 域名首字 + TLD(Gemini P1 修:域名也遮、避免企業域名識別)
 * 例: 'jamie.smith@example.com' → 'j****@e****.com'
 *     'a@b.com'                  → '*@*.com'(過短強制遮、Gemini P1 修)
 *     ''                         → ''
 *     null                       → ''
 *
 * v5.4.10 P0 修(Gemini):不再透過 hover title 暴露原始 email 到 DOM
 * 後續完整 unmask 需點 button 走後端 API、留 audit log
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const trimmed = email.trim()
  const atIdx = trimmed.indexOf('@')
  if (atIdx <= 0) return '*@*.***'  // 無 @ 或畸形:強制遮

  const localPart = trimmed.slice(0, atIdx)
  const domainPart = trimmed.slice(atIdx + 1)  // 不含 @

  // 域名拆 root + TLD(example.com → root='example' tld='com')
  const dotIdx = domainPart.lastIndexOf('.')
  const domainRoot = dotIdx > 0 ? domainPart.slice(0, dotIdx) : domainPart
  const tld = dotIdx > 0 ? domainPart.slice(dotIdx) : ''  // 含 .

  // local part 遮蔽
  let maskedLocal: string
  if (localPart.length <= 1) {
    maskedLocal = '*'  // 過短(1 字)強制遮
  } else if (localPart.length <= 3) {
    maskedLocal = localPart[0] + '*'.repeat(Math.max(localPart.length - 1, 1))
  } else {
    maskedLocal = localPart[0] + '****'
  }

  // 域名 root 遮蔽(保首字 + 4 星)
  let maskedDomain: string
  if (domainRoot.length <= 1) {
    maskedDomain = '*'
  } else {
    maskedDomain = domainRoot[0] + '****'
  }

  return `${maskedLocal}@${maskedDomain}${tld}`
}

/**
 * 遮蔽手機(若有)、保留國碼 + 末 4 碼
 * 例: '+886912345678' → '+886****5678'
 *     '0912345678'    → '0***45678'
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const trimmed = phone.trim()
  if (trimmed.length <= 4) return trimmed

  const tail = trimmed.slice(-4)
  const head = trimmed.slice(0, Math.min(4, trimmed.length - 4))
  const middleStars = '*'.repeat(Math.max(trimmed.length - head.length - 4, 1))
  return head + middleStars + tail
}

/**
 * 遮蔽姓名、保留姓 + 「○」取代名字
 * 例: '王小明'    → '王○○'
 *     '張三'      → '張○'
 *     'John Smith' → 'J*** Smith'(英文姓在後、保 first initial)
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (trimmed.length === 0) return ''
  if (trimmed.length === 1) return trimmed

  // 英文(含空格 / 字母)→ 保首字母 + ***
  if (/^[a-zA-Z\s]+$/.test(trimmed)) {
    const parts = trimmed.split(/\s+/)
    return parts[0][0] + '***' + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '')
  }

  // 中文 → 保姓 + ○ 取代名字
  return trimmed[0] + '○'.repeat(trimmed.length - 1)
}
