'use client'

/**
 * v5.10.420 UI 重構 Phase 2 — 問診式尊榮 Onboarding(flag: NEXT_PUBLIC_FF_CONSULT_ONBOARDING)
 *
 * 定位(ui_revamp_spec Phase 2、競品 Sanctuary/測測 問診式、$279 級信任感):
 * - checkout 表單前置 2 步「命理顧問對話」:① 來意面向 ② 最想釐清的困惑(選填)
 * - 純呈現層:困惑文字直接寫進既有 useCheckoutForm.customerNote(底層資料流零改動、
 *   與表單內 CustomerNote 欄位同一 state、先寫後改都行)
 * - skill 規範:escape-routes(每步可跳過直接填表)/ progressive-disclosure / 唯一主 CTA
 * - flag off = 完全不渲染、現行流程 100% 不變
 */
import { useState } from 'react'

const FOCUS_CHIPS: Record<string, string[]> = {
  C: ['事業方向', '感情婚姻', '財富軌跡', '全面看清自己'],
  D: ['感情困惑', '職涯抉擇', '家庭課題', '其他疑問'],
  G15: ['親子相處', '家人溝通', '家庭和諧', '全家走向'],
  R: ['我們合不合', '相處雷區', '長期承諾', '合作契合'],
  DEFAULT: ['事業', '感情', '財運', '健康平安'],
}

export default function ConsultIntro({
  planCode,
  planName,
  customerNote,
  setCustomerNote,
  onDone,
}: {
  planCode: string
  planName: string
  customerNote: string
  setCustomerNote: (v: string) => void
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const [focus, setFocus] = useState('')
  const chips = FOCUS_CHIPS[planCode] || FOCUS_CHIPS.DEFAULT

  const pickFocus = (c: string) => {
    setFocus(c)
    // 來意寫進 customerNote 開頭(AI 生成會讀 customer_note、個人化加分;客戶可在表單再改)
    if (!customerNote) setCustomerNote(`【最想了解】${c}`)
    setStep(1)
  }
  const submitWorry = (text: string) => {
    const head = focus ? `【最想了解】${focus}` : ''
    const body = text.trim() ? `${head ? '\n' : ''}${text.trim()}` : ''
    setCustomerNote(`${head}${body}`)
    onDone()
  }

  return (
    <div className="glass rounded-2xl p-6 md:p-8 mb-8" style={{ border: '1px solid rgba(201,168,76,0.25)' }}>
      {/* 顧問頭像列 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold font-bold" aria-hidden>鑒</div>
        <div>
          <div className="text-cream text-sm font-semibold">鑒源命理顧問</div>
          <div className="text-text-muted text-[11px]">為您的「{planName}」起盤前、先聊兩句</div>
        </div>
      </div>

      {step === 0 && (
        <div>
          <p className="text-cream/90 text-sm leading-7 mb-4">
            歡迎。每份報告由 14 套系統交叉運算、但<span className="text-gold">最有溫度的部分、來自我們知道你此刻最在意什麼</span>。這次想先看清楚哪個面向?
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => pickFocus(c)}
                className="px-4 py-2.5 rounded-full text-sm border border-gold/30 text-cream hover:bg-gold/10 hover:border-gold/60 transition-colors cursor-pointer">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="text-cream/90 text-sm leading-7 mb-3">
            好的、{focus ? `「${focus}」` : ''}我記下了。若有<span className="text-gold">一個最想釐清的具體困惑</span>、寫在這裡 — 報告會直接回應它(選填):
          </p>
          <textarea
            defaultValue=""
            maxLength={200}
            rows={3}
            placeholder="例:猶豫要不要在年底轉職、想知道時機對不對…"
            className="w-full rounded-lg bg-white/5 border border-gold/20 focus:border-gold/60 outline-none text-cream text-sm p-3 mb-4"
            id="consult-worry"
            aria-label="最想釐清的困惑(選填)"
          />
          <button type="button"
            onClick={() => submitWorry((document.getElementById('consult-worry') as HTMLTextAreaElement)?.value || '')}
            className="px-6 py-3 rounded-lg bg-gold text-dark font-bold btn-glow text-sm cursor-pointer">
            完成、開始填寫出生資料
          </button>
        </div>
      )}

      {/* escape route(skill §1):每步可直接跳過 */}
      <button type="button" onClick={onDone}
        className="mt-4 text-text-muted/70 hover:text-text-muted text-xs underline cursor-pointer">
        跳過、直接填表 →
      </button>
    </div>
  )
}
