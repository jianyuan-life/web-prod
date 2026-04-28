// 通用行事曆邀約工具（E1/E2/E3/E4 共用）
//
// 功能：
// 1. buildGoogleCalendarUrl — 生成 Google Calendar 一鍵新增連結
// 2. buildIcsFileContent — 生成 iCal .ics 檔案內容（Apple Calendar / Outlook 用）
// 3. downloadIcs — 觸發 .ics 檔案下載
//
// 通用時段格式：CalendarTiming

export interface CalendarTiming {
  title: string           // 事件標題（例：「鑒源吉時｜簽約 第 1 名」）
  date: string            // YYYY-MM-DD
  timeStart: string       // HH:MM
  timeEnd: string         // HH:MM
  location?: string       // 方位描述（例：「南方（午方）180°」）
  description?: string    // 詳細說明（最多 1000 字）
  planCode?: string       // E1/E2/E3/E4 或 C/D/G15/R
}

// ============================================================
// 日期時間工具
// ============================================================

function padZero(n: number): string {
  return String(n).padStart(2, '0')
}

/** 跨日判斷：若 time_end ≤ time_start，end date + 1 天 */
function computeEndDate(startDate: string, timeStart: string, timeEnd: string): string {
  const [sh, sm] = timeStart.split(':').map(n => parseInt(n, 10) || 0)
  const [eh, em] = timeEnd.split(':').map(n => parseInt(n, 10) || 0)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em

  if (endMin > startMin) return startDate

  const [y, mo, d] = startDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1, d))
  date.setUTCDate(date.getUTCDate() + 1)
  return `${date.getUTCFullYear()}-${padZero(date.getUTCMonth() + 1)}-${padZero(date.getUTCDate())}`
}

/** 生成 ISO 格式 local datetime（YYYYMMDDTHHMMSS）給 Google Calendar 用 */
function toGCalDateTime(date: string, time: string): string {
  const dateStr = date.replace(/-/g, '')
  const timeStr = time.replace(':', '') + '00'
  return `${dateStr}T${timeStr}`
}

/** 生成 UTC 格式（給 iCal 用）YYYYMMDDTHHMMSSZ */
function toIcsDateTime(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  // 假設為 Asia/Taipei（UTC+8），轉 UTC
  const dt = new Date(Date.UTC(y, mo - 1, d, h - 8, m, 0))
  return (
    `${dt.getUTCFullYear()}${padZero(dt.getUTCMonth() + 1)}${padZero(dt.getUTCDate())}` +
    `T${padZero(dt.getUTCHours())}${padZero(dt.getUTCMinutes())}${padZero(dt.getUTCSeconds())}Z`
  )
}

// ============================================================
// Google Calendar URL
// ============================================================

/**
 * 生成 Google Calendar 一鍵新增 URL（純前端、無需 API key）
 *
 * 使用方式：
 *   <a href={buildGoogleCalendarUrl({title:'...', date:'2026-04-20', ...})}>一鍵加入 Google Calendar</a>
 */
export function buildGoogleCalendarUrl(timing: CalendarTiming): string {
  const endDate = computeEndDate(timing.date, timing.timeStart, timing.timeEnd)
  const startStr = toGCalDateTime(timing.date, timing.timeStart)
  const endStr = toGCalDateTime(endDate, timing.timeEnd)

  const title = encodeURIComponent(timing.title)
  const details = encodeURIComponent(timing.description || '')
  const location = encodeURIComponent(timing.location || '')

  return (
    `https://calendar.google.com/calendar/render` +
    `?action=TEMPLATE` +
    `&text=${title}` +
    `&dates=${startStr}/${endStr}` +
    `&details=${details}` +
    `&location=${location}` +
    `&ctz=Asia/Taipei`
  )
}

// ============================================================
// iCal (.ics) 檔案
// ============================================================

/** 生成單一事件的 VEVENT 區塊 */
function buildVEvent(timing: CalendarTiming, uidSuffix: string): string {
  const endDate = computeEndDate(timing.date, timing.timeStart, timing.timeEnd)
  const dtStart = toIcsDateTime(timing.date, timing.timeStart)
  const dtEnd = toIcsDateTime(endDate, timing.timeEnd)
  const uid = `${Date.now()}-${uidSuffix}@jianyuan.life`
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  // iCal 格式：逗號和分號需要 escape，換行用 \n
  const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const summary = escapeIcs(timing.title)
  const description = escapeIcs(timing.description || '')
  const location = escapeIcs(timing.location || '')

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:鑒源吉時提醒',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n')
}

/**
 * 生成 .ics 檔案內容（一個或多個事件）
 *
 * E1：3 個事件（Top3）
 * E2：4 個事件（4 週 Top1）
 * E3：8 個事件（4 週 ×Top2）
 * E4：12 個月盤主吉方事件
 */
export function buildIcsFileContent(timings: CalendarTiming[]): string {
  const events = timings.map((t, i) => buildVEvent(t, `${i}-${Math.random().toString(36).slice(2, 8)}`))
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jianyuan.life//Qimen Chumenji//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:鑒源古法奇門吉時',
    'X-WR-TIMEZONE:Asia/Taipei',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

/**
 * 客戶端觸發 .ics 下載
 *
 * 使用方式：
 *   <button onClick={() => downloadIcs(timings, 'e3-subscribe.ics')}>下載行事曆</button>
 */
export function downloadIcs(timings: CalendarTiming[], filename = 'qimen-chumenji.ics'): void {
  if (typeof window === 'undefined') return
  const content = buildIcsFileContent(timings)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================
// 方案專屬預設標題
// ============================================================

export const PLAN_CALENDAR_LABELS: Record<string, string> = {
  E1: '鑒源吉時｜事件擇吉',
  E2: '鑒源吉時｜月度單盤',
  E3: '鑒源吉時｜月度精選',
  E4: '鑒源吉時｜年度全運',
}

export function buildDefaultTitle(planCode: string, customTitle?: string): string {
  const prefix = PLAN_CALENDAR_LABELS[planCode] || '鑒源吉時'
  return customTitle ? `${prefix}｜${customTitle}` : prefix
}
