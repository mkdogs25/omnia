import {
  addDays, daysInMonth, diffDays, fromISO, mondayOfWeek, weekday, WEEKDAYS,
  type ISODate
} from './dates'

export interface Recurrence {
  unit: 'day' | 'week' | 'month' | 'year'
  /** Repeat every N units. */
  every: number
  /** For weekly rules: 0 = Sunday … 6 = Saturday. Defaults to the anchor's weekday. */
  weekdays?: number[]
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

/** Does `date` fall on an occurrence of the rule that starts on `anchor`? */
export function occursOn(anchor: ISODate, rule: Recurrence, date: ISODate): boolean {
  if (date < anchor) return false
  const every = Math.max(1, rule.every || 1)
  const a = fromISO(anchor)
  const d = fromISO(date)
  switch (rule.unit) {
    case 'day':
      return diffDays(anchor, date) % every === 0
    case 'week': {
      const days = rule.weekdays?.length ? rule.weekdays : [a.getDay()]
      if (!days.includes(d.getDay())) return false
      const weeks = Math.round(diffDays(mondayOfWeek(anchor), mondayOfWeek(date)) / 7)
      return weeks % every === 0
    }
    case 'month': {
      if (monthsBetween(a, d) % every !== 0) return false
      return d.getDate() === Math.min(a.getDate(), daysInMonth(d.getFullYear(), d.getMonth()))
    }
    case 'year': {
      if ((d.getFullYear() - a.getFullYear()) % every !== 0) return false
      if (d.getMonth() !== a.getMonth()) return false
      return d.getDate() === Math.min(a.getDate(), daysInMonth(d.getFullYear(), d.getMonth()))
    }
  }
}

/** All occurrences in the inclusive range [from, to]. */
export function occurrencesBetween(anchor: ISODate, rule: Recurrence, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from < anchor ? anchor : from; d <= to; d = addDays(d, 1)) {
    if (occursOn(anchor, rule, d)) out.push(d)
  }
  return out
}

/** First occurrence on or after `from`, looking at most ~10 years ahead. */
export function nextOccurrence(anchor: ISODate, rule: Recurrence, from: ISODate): ISODate | null {
  let d = from < anchor ? anchor : from
  for (let i = 0; i < 3660; i++, d = addDays(d, 1)) {
    if (occursOn(anchor, rule, d)) return d
  }
  return null
}

export function describeRecurrence(rule: Recurrence, anchor?: ISODate): string {
  const every = Math.max(1, rule.every || 1)
  if (rule.unit === 'week') {
    const days = rule.weekdays?.length ? [...rule.weekdays].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)) : anchor ? [weekday(anchor)] : []
    const names = days.map(d => WEEKDAYS[d])
    if (every === 1) return names.length ? `Every ${joinNames(names)}` : 'Every week'
    if (every === 2 && !names.length) return 'Every fortnight'
    return names.length ? `Every ${every} weeks on ${joinNames(names)}` : `Every ${every} weeks`
  }
  const word = rule.unit
  if (every === 1) return word === 'day' ? 'Every day' : `Every ${word}`
  return `Every ${every} ${word}s`
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
