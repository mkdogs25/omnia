import { addDays, fromISO, MONTHS, toISO, weekday, type ISODate } from './dates'
import { nextOccurrence, type Recurrence } from './recurrence'

export interface QuickAdd {
  title: string
  /** When to do it. */
  due?: ISODate
  /** The hard deadline ("by friday", "due 31 oct"). */
  deadline?: ISODate
  recur?: Recurrence
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6
}
const DAY_RE = Object.keys(DAY_NAMES).sort((a, b) => b.length - a.length).join('|')
const MONTH_RE = MONTHS.map(m => m.slice(0, 3).toLowerCase()).join('|')

function cut(text: string, re: RegExp): [RegExpMatchArray | null, string] {
  const m = text.match(re)
  if (!m) return [null, text]
  return [m, (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim()]
}

function nextWeekday(from: ISODate, wd: number, forceNext: boolean): ISODate {
  let delta = (wd - weekday(from) + 7) % 7
  if (delta === 0 && forceNext) delta = 7
  return addDays(from, delta)
}

/**
 * Finds one date expression in `text` and returns it with the text left over. Understands ISO dates, today,
 * tomorrow, "in 3 days", "next week", weekdays ("friday", "next friday") and "31 oct" / "oct 31".
 * When `anchored` the expression must start the text (used right after "by", "due", …).
 */
export function extractDate(text: string, now: ISODate, anchored = false, allowBareWeekday = true): { date?: ISODate; rest: string } {
  const a = anchored ? '^\\s*' : '\\b'
  const attempt = (re: RegExp, make: (m: RegExpMatchArray) => ISODate | undefined): { date: ISODate; rest: string } | null => {
    const [m, rest] = cut(text, re)
    if (!m) return null
    const date = make(m)
    return date ? { date, rest } : null
  }
  const monthDay = (dayStr: string, monStr: string): ISODate => {
    const mon = MONTHS.findIndex(x => x.slice(0, 3).toLowerCase() === monStr.slice(0, 3).toLowerCase())
    const nowDate = fromISO(now)
    let cand = new Date(nowDate.getFullYear(), mon, parseInt(dayStr, 10), 12)
    if (toISO(cand) < now) cand = new Date(nowDate.getFullYear() + 1, mon, parseInt(dayStr, 10), 12)
    return toISO(cand)
  }

  const found =
    attempt(new RegExp(`${a}(\\d{4}-\\d{2}-\\d{2})\\b`), m => m[1]) ??
    attempt(new RegExp(`${a}(today|tonight|tomorrow)\\b`, 'i'), m => (m[1].toLowerCase() === 'tomorrow' ? addDays(now, 1) : now)) ??
    attempt(new RegExp(`${a}in\\s+(\\d+)\\s+(day|week|month)s?\\b`, 'i'), m => {
      const n = parseInt(m[1], 10)
      const u = m[2].toLowerCase()
      return addDays(now, u === 'day' ? n : u === 'week' ? n * 7 : n * 30)
    }) ??
    attempt(new RegExp(`${a}next\\s+week\\b`, 'i'), () => addDays(now, 7)) ??
    attempt(new RegExp(`${a}(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})[a-z]*\\b`, 'i'), m => monthDay(m[1], m[2])) ??
    attempt(new RegExp(`${a}(?:on\\s+)?(${MONTH_RE})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), m => monthDay(m[2], m[1])) ??
    (allowBareWeekday
      ? attempt(new RegExp(`${a}(?:on\\s+|next\\s+)?(${DAY_RE})\\b`, 'i'), m => nextWeekday(now, DAY_NAMES[m[1].toLowerCase()], /next/i.test(m[0])))
      : null)
  return found ? { date: found.date, rest: found.rest } : { rest: text }
}

const ONE_DAY = `\\b(?:${DAY_RE})\\b`
/** One or more weekday names, separated by spaces, commas, "and" or "&": "mon thu fri", "monday, friday and sunday". */
const DAY_LIST = `${ONE_DAY}(?:(?:\\s*(?:,|&|and)\\s*|\\s+)${ONE_DAY})*`

const daysIn = (list: string): number[] =>
  [...new Set((list.toLowerCase().match(new RegExp(DAY_RE, 'g')) ?? []).map(d => DAY_NAMES[d]))].sort((x, y) => x - y)

/**
 * Finds a repeat rule in free text and returns it with the text left over. Understands
 * "every week on monday thursday friday", "every 2 weeks on mon fri sun", "every other week",
 * "every 3 days", "every month", "every monday and friday", "daily", "fortnightly", …
 */
export function extractRepeat(text: string): { recur?: Recurrence; rest: string } {
  let m: RegExpMatchArray | null
  let rest = text

  // Weeks, optionally with the days they fall on.
  ;[m, rest] = cut(rest, new RegExp(`\\bevery\\s+(?:(\\d+|other)\\s+)?(week|fortnight)s?\\b(?:\\s+on)?(?:\\s+(${DAY_LIST}))?`, 'i'))
  if (m) {
    const n = !m[1] ? 1 : m[1].toLowerCase() === 'other' ? 2 : Math.max(1, parseInt(m[1], 10))
    const every = m[2].toLowerCase() === 'fortnight' ? 2 * n : n
    const days = m[3] ? daysIn(m[3]) : []
    return { recur: { unit: 'week', every, ...(days.length ? { weekdays: days } : {}) }, rest }
  }

  ;[m, rest] = cut(text, /\bevery\s+(?:(\d+|other)\s+)?(day|month|year)s?\b/i)
  if (m) {
    const n = !m[1] ? 1 : m[1].toLowerCase() === 'other' ? 2 : Math.max(1, parseInt(m[1], 10))
    return { recur: { unit: m[2].toLowerCase() as Recurrence['unit'], every: n }, rest }
  }

  // "every monday", "every mon and fri"
  ;[m, rest] = cut(text, new RegExp(`\\bevery\\s+(${DAY_LIST})`, 'i'))
  if (m) return { recur: { unit: 'week', every: 1, weekdays: daysIn(m[1]) }, rest }

  // A bare "weekly" only counts at the very end, so a title like "Weekly Revision" is left alone.
  ;[m, rest] = cut(text, /(?<=\S\s+)\b(daily|weekly|fortnightly|monthly|yearly|annually)\s*$/i)
  if (m) {
    const k = m[1].toLowerCase()
    const recur: Recurrence = k === 'daily' ? { unit: 'day', every: 1 }
      : k === 'weekly' ? { unit: 'week', every: 1 }
      : k === 'fortnightly' ? { unit: 'week', every: 2 }
      : k === 'monthly' ? { unit: 'month', every: 1 }
      : { unit: 'year', every: 1 }
    return { recur, rest }
  }
  return { rest: text }
}

/**
 * Pulls a due date, a deadline and a repeat rule out of free text such as
 * "Weekly revision every saturday", "Hand in essay on 31 oct" or "Lab report friday by 2 nov".
 * A deadline is introduced by by / due / deadline / before; a bare date is the day to do the task.
 */
export function parseQuickAdd(input: string, now: ISODate): QuickAdd {
  let text = input.trim()
  let due: ISODate | undefined
  let deadline: ISODate | undefined
  let recur: Recurrence | undefined
  let m: RegExpMatchArray | null

  // Deadline: a keyword followed by a date, e.g. "by friday", "due 2026-11-03", "deadline 31 oct".
  const kw = text.match(/\b(?:by|due(?:\s+on)?|deadline(?:\s+is)?|before)\s+/i)
  if (kw && kw.index !== undefined) {
    const before = text.slice(0, kw.index)
    const after = text.slice(kw.index + kw[0].length)
    const got = extractDate(after, now, true)
    if (got.date) {
      deadline = got.date
      text = `${before} ${got.rest}`.replace(/\s+/g, ' ').trim()
    }
  }

  // Repeat rules
  const rep = extractRepeat(text)
  recur = rep.recur
  text = rep.rest

  // Due date. A weekday on its own doesn't count when a repeat rule already names one.
  const got = extractDate(text, now, false, !recur)
  if (got.date) {
    due = got.date
    text = got.rest
  }

  if (recur && !due) due = nextOccurrence(now, { ...recur }, now) ?? now
  if (recur?.unit === 'week' && !recur.weekdays && due) recur = { ...recur, weekdays: [weekday(due)] }
  if (recur?.unit === 'week' && recur.weekdays && due && !recur.weekdays.includes(weekday(due))) {
    // Anchor on the first matching weekday so the first instance is a real occurrence.
    due = nextOccurrence(due, recur, due) ?? due
  }
  if (recur) deadline = undefined // a repeating task has no single deadline

  text = text.replace(/\s+(on|at|by|due)$/i, '').trim()
  return { title: text || input.trim(), due, deadline, recur }
}

// ---------------------------------------------------------------------------
// Calendar events

export interface QuickEvent {
  title: string
  date?: ISODate
  /** "HH:MM", 24-hour. */
  start?: string
  end?: string
  recur?: Recurrence
  /** Minutes before the start. */
  remindMin?: number
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toHHMM = (mins: number) => `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`

/** "3", "3:30", "3pm", "15:00" -> minutes after midnight. Without am/pm a bare small hour is read as the afternoon. */
function clock(h: string, min: string | undefined, ap: string | undefined, guess: boolean): number | null {
  let hour = parseInt(h, 10)
  const minute = min ? parseInt(min, 10) : 0
  if (minute > 59 || hour > 24) return null
  const suffix = ap?.toLowerCase()
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (suffix === 'pm' ? 12 : 0)
  } else if (guess && hour >= 1 && hour <= 7) hour += 12
  return hour * 60 + minute
}

const T = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`
const norm = (ap?: string) => (ap ? ap.replace(/\./g, '').toLowerCase() : undefined)

/**
 * Pulls a time (or range) out of text: "3pm", "at 3:30", "15:00", "2-3pm", "from 9 to 10:30am", "noon",
 * with an optional "for 90 minutes" / "for 2 hours".
 */
export function extractTimes(text: string): { start?: string; end?: string; rest: string } {
  let m: RegExpMatchArray | null
  let rest = text
  let start: number | undefined
  let end: number | undefined

  // Range: both ends need a colon or am/pm, or the end has am/pm and the start borrows it ("2-3pm").
  const range = new RegExp(`(?:\\bfrom\\s+|\\b)${T}\\s*(?:-|–|—|to|until|till)\\s*${T}(?![\\d:])`, 'i')
  ;[m, rest] = cut(rest, range)
  if (m) {
    const [, h1, m1, a1raw, h2, m2, a2raw] = m
    const a1 = norm(a1raw)
    const a2 = norm(a2raw)
    const solid = (min?: string, ap?: string) => !!min || !!ap
    if ((solid(m1, a1) || a2) && (solid(m2, a2) || a1)) {
      const s = clock(h1, m1, a1 ?? a2, true)
      const e = clock(h2, m2, a2 ?? a1, true)
      if (s !== null && e !== null) { start = s; end = e <= s ? e + 12 * 60 : e }
    }
    if (start === undefined) rest = text // not really a time range: put it back
  }

  if (start === undefined) {
    ;[m, rest] = cut(rest, /\bat\s+noon\b|\bnoon\b/i)
    if (m) start = 12 * 60
  }
  if (start === undefined) {
    ;[m, rest] = cut(rest, new RegExp(`\\b(?:at\\s+)?(\\d{1,2}):(\\d{2})\\s*(am|pm)?(?![\\d:])`, 'i'))
    if (m) start = clock(m[1], m[2], norm(m[3]), false) ?? undefined
    if (start === undefined) rest = text
  }
  if (start === undefined) {
    ;[m, rest] = cut(rest, new RegExp(`\\b(?:at\\s+)?(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![\\w])`, 'i'))
    if (m) start = clock(m[1], undefined, norm(m[2]), false) ?? undefined
    if (start === undefined) rest = text
  }
  if (start === undefined) {
    // "at 3": the word "at" is what says it is a time
    ;[m, rest] = cut(rest, /\bat\s+(\d{1,2})(?![\d:])/i)
    if (m) start = clock(m[1], undefined, undefined, true) ?? undefined
    if (start === undefined) rest = text
  }

  if (start !== undefined && end === undefined) {
    const dur = rest.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i)
    if (dur) {
      const n = parseFloat(dur[1])
      end = start + Math.round(/^h/i.test(dur[2]) ? n * 60 : n)
      rest = (rest.slice(0, dur.index) + ' ' + rest.slice(dur.index! + dur[0].length)).replace(/\s+/g, ' ').trim()
    }
  }
  return { start: start === undefined ? undefined : toHHMM(start), end: end === undefined ? undefined : toHHMM(end), rest: rest.replace(/\s+/g, ' ').trim() }
}

/**
 * One line to an event: "Math class every 2 weeks on mon fri sun 9-10:30am", "Dentist tomorrow at 3pm for 1 hour",
 * "Lunch with Sam friday 12:30 remind me 30 minutes before".
 */
export function parseEventQuickAdd(input: string, now: ISODate): QuickEvent {
  let text = input.trim()
  let remindMin: number | undefined

  const rem = text.match(/\bremind(?:\s+me)?(?:\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|days?|d)\s+before|\s+at\s+the\s+start|\s+at\s+start)?\b/i)
  if (rem) {
    remindMin = rem[1] ? Math.round(parseFloat(rem[1]) * (/^h/i.test(rem[2]) ? 60 : /^d/i.test(rem[2]) ? 1440 : 1)) : 0
    text = (text.slice(0, rem.index) + ' ' + text.slice(rem.index! + rem[0].length)).replace(/\s+/g, ' ').trim()
  }

  const rep = extractRepeat(text)
  text = rep.rest
  const times = extractTimes(text)
  text = times.rest
  // A weekday on its own doesn't count when the repeat rule already names days.
  const got = extractDate(text, now, false, !(rep.recur?.weekdays?.length))
  text = got.rest

  let date = got.date
  let recur = rep.recur
  if (recur?.unit === 'week' && !recur.weekdays && date) recur = { ...recur, weekdays: [weekday(date)] }
  if (recur?.weekdays?.length) {
    const from = date ?? now
    if (!recur.weekdays.includes(weekday(from))) date = nextOccurrence(from, recur, from) ?? from
    else date = date ?? from
  }
  text = text.replace(/\s+(on|at|from|by|for)$/i, '').replace(/^(on|at)\s+/i, '').trim()
  return { title: text || input.trim(), date, start: times.start, end: times.end, recur, remindMin: times.start ? remindMin : undefined }
}
