import { addDays, fromISO, MONTHS, toISO, weekday, type ISODate } from './dates'
import { nextOccurrence, type Recurrence } from './recurrence'

export interface QuickAdd {
  title: string
  due?: ISODate
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

/**
 * Pulls a due date and a repeat rule out of free text such as
 * "Weekly revision every saturday" or "Hand in essay on 31 oct".
 */
export function parseQuickAdd(input: string, now: ISODate): QuickAdd {
  let text = input.trim()
  let due: ISODate | undefined
  let recur: Recurrence | undefined
  let m: RegExpMatchArray | null

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

  // Due dates
  ;[m, text] = cut(text, /\b(\d{4}-\d{2}-\d{2})\b/)
  if (m) due = m[1]
  if (!due) {
    ;[m, text] = cut(text, /\b(today|tonight|tomorrow)\b/i)
    if (m) due = m[1].toLowerCase() === 'tomorrow' ? addDays(now, 1) : now
  }
  if (!due) {
    ;[m, text] = cut(text, /\bin\s+(\d+)\s+(day|week|month)s?\b/i)
    if (m) {
      const n = parseInt(m[1], 10)
      due = addDays(now, m[2].toLowerCase() === 'day' ? n : m[2].toLowerCase() === 'week' ? n * 7 : n * 30)
    }
  }
  if (!due) {
    ;[m, text] = cut(text, /\bnext\s+week\b/i)
    if (m) due = addDays(now, 7)
  }
  if (!due) {
    ;[m, text] = cut(text, new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})[a-z]*\\b`, 'i'))
    if (!m) [m, text] = cut(text, new RegExp(`\\b(?:on\\s+)?(${MONTH_RE})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'))
    if (m) {
      const [dayStr, monStr] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
      const mon = MONTHS.findIndex(x => x.slice(0, 3).toLowerCase() === monStr.toLowerCase())
      const nowDate = fromISO(now)
      let cand = new Date(nowDate.getFullYear(), mon, parseInt(dayStr, 10), 12)
      if (toISO(cand) < now) cand = new Date(nowDate.getFullYear() + 1, mon, parseInt(dayStr, 10), 12)
      due = toISO(cand)
    }
  }
  if (!due && !recur) {
    ;[m, text] = cut(text, new RegExp(`\\b(?:on\\s+|next\\s+)?(${DAY_RE})\\b`, 'i'))
    if (m) due = nextWeekday(now, DAY_NAMES[m[1].toLowerCase()], /next/i.test(m[0]))
  }

  if (recur && !due) due = nextOccurrence(now, { ...recur }, now) ?? now
  if (recur?.unit === 'week' && !recur.weekdays && due) recur = { ...recur, weekdays: [weekday(due)] }
  if (recur?.unit === 'week' && recur.weekdays && due && !recur.weekdays.includes(weekday(due))) {
    // Anchor on the first matching weekday so the first instance is a real occurrence.
    due = nextOccurrence(due, recur, due) ?? due
  }

  text = text.replace(/\s+(on|at|by|due)$/i, '').trim()
  return { title: text || input.trim(), due, recur }
}

function nextWeekday(from: ISODate, wd: number, forceNext: boolean): ISODate {
  let delta = (wd - weekday(from) + 7) % 7
  if (delta === 0 && forceNext) delta = 7
  return addDays(from, delta)
}
