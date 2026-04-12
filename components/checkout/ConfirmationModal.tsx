'use client'

import { SHICHEN } from './types'

const TIME_BLOCK_NAMES = [
  '子時 (23:00-01:00)', '丑時 (01:00-03:00)', '寅時 (03:00-05:00)', '卯時 (05:00-07:00)',
  '辰時 (07:00-09:00)', '巳時 (09:00-11:00)', '午時 (11:00-13:00)', '未時 (13:00-15:00)',
  '申時 (15:00-17:00)', '酉時 (17:00-19:00)', '戌時 (19:00-21:00)', '亥時 (21:00-23:00)',
]

interface ConfirmationModalProps {
  show: boolean
  onClose: () => void
  onConfirm: () => void
  planCode: string
  form: {
    name: string
    year: string
    month: string
    day: string
    hour: string
    minute: string
    gender: string
    birthCity: string
    calendarType: 'solar' | 'lunar'
  }
  timeMode: 'unknown' | 'shichen' | 'exact'
  loading: boolean
  e1StartDate?: string
  e1EndDate?: string
  eSelectedBlocks?: boolean[]
  customerNote?: string
}

export default function ConfirmationModal({
  show, onClose, onConfirm, planCode, form, timeMode, loading,
  e1StartDate, e1EndDate, eSelectedBlocks, customerNote,
}: ConfirmationModalProps) {
  if (!show) return null

  // 格式化出生時間顯示
  const getTimeDisplay = () => {
    if (timeMode === 'unknown') return '不確定'
    if (timeMode === 'shichen') {
      const shichen = SHICHEN.find(s => s.value === parseInt(form.hour))
      return shichen ? `${shichen.label}（以時辰計）` : `${form.hour}時（以時辰計）`
    }
    return `${form.hour}時${form.minute}分（知道精確時間）`
  }

  const getGenderDisplay = () => form.gender === 'M' ? '男' : '女'
  const getCalendarDisplay = () => form.calendarType === 'solar' ? '國曆' : '農曆'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 彈窗內容 */}
      <div className="relative glass rounded-2xl p-6 max-w-md w-full border border-gold/20 shadow-2xl">
        <h3 className="text-lg font-bold text-gold text-center mb-4">
          請確認您的出生資料
        </h3>

        <div className="space-y-3 mb-5">
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">姓名</span>
            <span className="text-white font-medium">{form.name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">性別</span>
            <span className="text-white font-medium">{getGenderDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">曆法</span>
            <span className="text-white font-medium">{getCalendarDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生日期</span>
            <span className="text-white font-medium">{form.year}年{form.month}月{form.day}日</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生時間</span>
            <span className="text-white font-medium">{getTimeDisplay()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-text-muted text-sm">出生地區</span>
            <span className="text-white font-medium">{form.birthCity}</span>
          </div>

          {/* E1/E2 專屬：事件日期+可配合時辰+事件描述 */}
          {(planCode === 'E1' || planCode === 'E2') && (
            <>
              {planCode === 'E1' && e1StartDate && (
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm">事件日期</span>
                  <span className="text-white font-medium">{e1StartDate}{e1EndDate ? ` ~ ${e1EndDate}` : '（一個月內）'}</span>
                </div>
              )}
              {eSelectedBlocks && eSelectedBlocks.some(b => b) && (
                <div className="py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm block mb-1">可配合出行時間</span>
                  <div className="flex flex-wrap gap-1">
                    {eSelectedBlocks.map((checked, i) => checked && (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-gold/20 text-gold border border-gold/30">
                        {TIME_BLOCK_NAMES[i]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {customerNote && (
                <div className="py-2 border-b border-white/10">
                  <span className="text-text-muted text-sm block mb-1">事件描述</span>
                  <span className="text-white text-sm">{customerNote}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 警告提示 */}
        <div className="bg-gold/10 border border-gold/20 rounded-xl p-3 mb-5">
          <p className="text-xs text-gold/90 leading-relaxed text-center">
            出生資料一旦提交將用於排盤計算，請務必確認正確。
          </p>
        </div>

        {/* 按鈕 */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 border border-gold/30 text-gold rounded-xl font-medium hover:bg-gold/10 transition-colors disabled:opacity-50"
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 bg-gold text-dark font-bold rounded-xl btn-glow disabled:opacity-50"
          >
            {loading ? '跳轉付款中...' : '確認無誤，付款'}
          </button>
        </div>
      </div>
    </div>
  )
}
