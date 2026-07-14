'use client'

interface CustomerNoteProps {
  customerNote: string
  setCustomerNote: (v: string) => void
}

export default function CustomerNote({ customerNote, setCustomerNote }: CustomerNoteProps) {
  return (
    <div className="border-t border-gold/10 pt-4 space-y-2">
      <label htmlFor="checkout-customer-note" className="block text-xs text-text-muted">備注 / 想問的問題（選填）</label>
      <textarea
        id="checkout-customer-note"
        aria-describedby="checkout-customer-note-count"
        maxLength={300}
        rows={3}
        placeholder="有什麼想特別告訴命理師的事、或想請系統重點分析的問題，請在這裡填寫..."
        value={customerNote}
        onChange={(e) => setCustomerNote(e.target.value)}
        className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-white text-sm focus:border-gold focus:outline-none resize-none placeholder:text-text-muted/40"
      />
      <p id="checkout-customer-note-count" className="text-[10px] text-text-muted/50 text-right">{customerNote.length}/300</p>
    </div>
  )
}
