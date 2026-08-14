'use client'

import { CONSENT_SETTINGS_EVENT } from '@/lib/privacy/consent'

type ConsentSettingsButtonProps = {
  className?: string
}

export default function ConsentSettingsButton({ className = '' }: ConsentSettingsButtonProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new Event(CONSENT_SETTINGS_EVENT))}
      className={className}
    >
      隱私設定
    </button>
  )
}
