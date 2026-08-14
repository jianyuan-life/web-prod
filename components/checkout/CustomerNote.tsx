'use client'

interface CustomerNoteProps {
  customerNote: string
  setCustomerNote: (v: string) => void
  consultation?: boolean
}

export default function CustomerNote({ customerNote, setCustomerNote, consultation = false }: CustomerNoteProps) {
  const maxLength = consultation ? 800 : 300
  return (
    <div className="border-t border-gold/10 pt-4 space-y-2">
      <label htmlFor="checkout-customer-note" className="block text-xs text-text-muted">
        {consultation ? '這次最想理解或改善的事（選填）' : '備注 / 想問的問題（選填）'}
      </label>
      <textarea
        id="checkout-customer-note"
        aria-describedby="checkout-customer-note-count"
        maxLength={maxLength}
        rows={consultation ? 5 : 3}
        placeholder={consultation
          ? '例如：最近在工作選擇與家庭責任之間反覆拉扯，希望先看清自己的壓力反應與可行的下一步。'
          : '有什麼想特別告訴命理師的事、或想請系統重點分析的問題，請在這裡填寫...'}
        value={customerNote}
        onChange={(e) => setCustomerNote(e.target.value)}
        className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none placeholder:text-text-muted/40"
      />
      <p id="checkout-customer-note-count" className="text-[10px] text-text-muted/50 text-right">{customerNote.length}/{maxLength}</p>
    </div>
  )
}
