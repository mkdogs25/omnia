// Dates are passed around as local "YYYY-MM-DD" strings so that nothing depends on time zones.

export type ISODate = string

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses an ISO date as local noon, which stays on the right day across DST changes. */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function today(): ISODate {
  return toISO(new Date())
}

export function isISO(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
  return toISO(d)
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)
}

export function weekday(s: ISODate): number {
  return fromISO(s).getDay()
}

let weekStartsOn = 1 // 0 = Sunday, 1 = Monday (the default, as in the reference screenshots)

export function setWeekStart(day: 0 | 1) {
  weekStartsOn = day
}

export function getWeekStart(): 0 | 1 {
  return weekStartsOn as 0 | 1
}

/** Days of the week in display order, e.g. [1,2,3,4,5,6,0] when weeks start on Monday. */
export function weekdayOrder(): number[] {
  return weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
}

export function startOfWeek(s: ISODate): ISODate {
  const wd = (weekday(s) - weekStartsOn + 7) % 7
  return addDays(s, -wd)
}

/** Always Monday-based; repeat rules use this so their fortnightly rhythm doesn't change with the display setting. */
export function mondayOfWeek(s: ISODate): ISODate {
  return addDays(s, -((weekday(s) + 6) % 7))
}

export function endOfWeek(s: ISODate): ISODate {
  return addDays(startOfWeek(s), 6)
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + '01'
}

export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** "October 31st, 2026" */
export function formatLong(s: ISODate): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`
}

/** "Oct 26" */
export function formatShort(s: ISODate): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

export function formatWeekRange(start: ISODate): string {
  return `${formatShort(start)} - ${formatShort(addDays(start, 6))}`
}

export function monthTitle(s: ISODate): string {
  const d = fromISO(s)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Friendly label: Today, Tomorrow, Yesterday, weekday within a week, otherwise the long date. */
export function relativeLabel(s: ISODate, now: ISODate = today()): string {
  const n = diffDays(now, s)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && n < 7) return WEEKDAYS[weekday(s)]
  return formatLong(s)
}

/** The six-week (or five-week) grid of dates shown by a month view, Monday first. */
export function monthGrid(anyDayInMonth: ISODate): ISODate[] {
  const first = startOfMonth(anyDayInMonth)
  const start = startOfWeek(first)
  const [y, m] = first.split('-').map(Number)
  const last = `${y}-${pad(m)}-${pad(daysInMonth(y, m - 1))}`
  const end = endOfWeek(last)
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m ? `${hh}:${pad(m)}${suffix}` : `${hh}${suffix}`
}
