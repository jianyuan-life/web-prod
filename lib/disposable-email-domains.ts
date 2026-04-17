// 拋棄式/臨時信箱域名黑名單（反作弊用）
// 來源：常見 disposable-email-domains 清單（mailinator, tempmail, 10minutemail 等）
// 2026-04-17 建立；手動維護（需要時可擴充）
//
// 使用方式：
//   import { isDisposableEmail } from '@/lib/disposable-email-domains'
//   if (isDisposableEmail(email)) return 400 '不接受臨時信箱'

const DISPOSABLE_DOMAINS = new Set<string>([
  // 10 minute mail
  '10minutemail.com', '10minutemail.net', '10minemail.com', '10minute.email',
  '20minutemail.com', '30minutemail.com',

  // mailinator
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
  'mailinator.plus', 'binkmail.com', 'bobmail.info', 'chammy.info',
  'devnullmail.com', 'letthemeatspam.com', 'mailin8r.com', 'mailinator.us',
  'notmailinator.com', 'reallymymail.com', 'safetymail.info', 'sogetthis.com',
  'spamherelots.com', 'spamhereplease.com', 'suremail.info', 'thisisnotmyrealemail.com',
  'tradermail.info', 'veryrealemail.com', 'zippymail.info',

  // tempmail 系列
  'tempmail.com', 'tempmail.net', 'tempmail.org', 'tempmail.io',
  'temp-mail.org', 'temp-mail.io', 'temp-mail.com', 'tempmailaddress.com',
  'tempmailo.com', 'tempmails.net', 'tempinbox.com', 'tempmailer.com',
  'tempail.com', 'tmpmail.org', 'tmpeml.com', 'throwawaymail.com',
  'getnada.com', 'nada.email', 'nadaemail.com',

  // guerrillamail 系列
  'guerrillamail.com', 'guerrillamail.biz', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.de', 'guerrillamailblock.com', 'grr.la', 'sharklasers.com',
  'spam4.me', 'pokemail.net',

  // yopmail
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',

  // dispostable / throwaway
  'dispostable.com', 'discard.email', 'discardmail.com', 'discardmail.de',
  'throwawayemail.com', 'trashmail.com', 'trashmail.net', 'trashmail.org',
  'trashmail.de', 'trashmail.io', 'trash-mail.com', 'trash-mail.de',
  'trash2009.com', 'trashspam.com',

  // fakeinbox / emailondeck
  'fakeinbox.com', 'fakemailgenerator.com', 'fakemail.net', 'emailondeck.com',
  'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'spambox.us',

  // mohmal / email-temp
  'mohmal.com', 'emailtemp.org', 'emailfake.com', 'fake-mail.net', 'fake-email.com',

  // 亞洲常見（中國簡體）
  'qwertymail.net', 'mailcatch.com', 'vmani.com', '66mail.top',

  // protonmail 的 disposable 變體（protonmail 本身合法不擋，但某些 subdomain 是 disposable）
  'proton-mail.com',

  // 其他雜項
  'mytemp.email', 'dropmail.me', 'minuteinbox.com', 'anonbox.net',
  'anonymbox.com', 'mailtemp.net', 'inboxkitten.com', 'burnermail.io',
  'deadaddress.com', 'emailisvalid.com', 'eyepaste.com', 'fakemailgenerator.net',
  'gmx.email', 'harakirimail.com', 'imgof.com', 'mail-temporaire.fr',
  'mailtothis.com', 'mvrht.com', 'mytrashmail.com', 'neverbox.com',
  'nomail.xl.cx', 'objectmail.com', 'pjjkp.com', 'plexolan.de',
  'rcpt.at', 'rmqkr.net', 'snkmail.com', 'spamcero.com',
  'tempemail.biz', 'tempemail.co.za', 'tempemail.com', 'tempemail.net',
  'tempmail.eu', 'tempmail.info', 'tempomail.fr', 'thankyou2010.com',
  'trbvm.com', 'uggsrock.com', 'wegwerfmail.de', 'wegwerfmail.info',
  'wegwerfmail.net', 'wegwerfmail.org', 'wh4f.org', 'whyspam.me',
  'willselfdestruct.com', 'yogamaven.com',
])

/**
 * 判斷 email 是否為拋棄式/臨時信箱。
 * 規則：取 @ 之後的小寫 domain 比對 DISPOSABLE_DOMAINS。
 */
export function isDisposableEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}

/**
 * 回傳拋棄式域名數量（供測試/管理）。
 */
export function getDisposableDomainCount(): number {
  return DISPOSABLE_DOMAINS.size
}
