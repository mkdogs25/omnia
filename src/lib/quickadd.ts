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
  ;[m, text] = cut(text, new RegExp(`\\bevery\\s+((?:${DAY_RE})(?:\\s*(?:,|and|&)\\s*(?:${DAY_RE}))*)\\b`, 'i'))
  if (m) {
    const days = [...new Set(m[1].toLowerCase().split(/\s*(?:,|and|&)\s*/).map(d => DAY_NAMES[d.trim()]))]
    recur = { unit: 'week', every: 1, weekdays: days }
  } else {
    ;[m, text] = cut(text, /\bevery\s+(?:(\d+)\s+)?(day|week|fortnight|month|year)s?\b/i)
    if (m) {
      const n = m[1] ? parseInt(m[1], 10) : 1
      const unit = m[2].toLowerCase()
      recur = unit === 'fortnight' ? { unit: 'week', every: 2 * n } : { unit: unit as Recurrence['unit'], every: n }
      if (recur.unit === 'week') {
        // "every 2 weeks on sunday": the weekday belongs to the repeat rule.
        let w: RegExpMatchArray | null
        ;[w, text] = cut(text, new RegExp(`\\b(?:on\\s+)?(${DAY_RE})\\b`, 'i'))
        if (w) recur = { ...recur, weekdays: [DAY_NAMES[w[1].toLowerCase()]] }
      }
    } else {
      // A bare "weekly" only counts at the very end, so a title like "Weekly Revision" is left alone.
      ;[m, text] = cut(text, /(?<=\S\s+)\b(daily|weekly|fortnightly|monthly|yearly|annually)\s*$/i)
      if (m) {
        const k = m[1].toLowerCase()
        recur = k === 'daily' ? { unit: 'day', every: 1 }
          : k === 'weekly' ? { unit: 'week', every: 1 }
          : k === 'fortnightly' ? { unit: 'week', every: 2 }
          : k === 'monthly' ? { unit: 'month', every: 1 }
          : { unit: 'year', every: 1 }
      }
    }
  }

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
