// Pure helpers for notifications: what goes in the daily digest, which reminders are due, quiet hours.

import { addDays, diffDays, formatShort, type ISODate } from './dates'
import { eventsInRange, itemsInRange, overdue, deadlineStatus, reminderMoment, withDeadlines, type CalEvent, type Task } from './tasks'
import { occurrencesBetween } from './recurrence'

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Is this time of day inside the quiet hours? Handles ranges that cross midnight (22:00 to 07:00). */
export function inQuietHours(hhmm: string, start: string, end: string): boolean {
  const t = toMinutes(hhmm)
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (a === b) return false
  return a < b ? t >= a && t < b : t >= a || t < b
}

export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const pad2 = (n: number) => String(n).padStart(2, '0')
/** A local date-time as "YYYY-MM-DDTHH:MM". */
export const localMoment = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${hhmm(d)}`

export interface DigestInput {
  tasks: Task[]
  events: CalEvent[]
  now: ISODate
  /** Deadlines within this many days are listed. */
  leadDays: number
  cardsDue: number
  revisionsDue: number
}

export interface Digest {
  title: string
  body: string
  /** Number of things worth mentioning; 0 means there is nothing to say. */
  total: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const names = (list: string[], max = 3) => (list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} and ${list.length - max} more`)

export function buildDigest(i: DigestInput): Digest {
  const late = overdue(i.tasks, i.now)
  const today = itemsInRange(i.tasks, i.now, i.now).filter(x => !x.done && !late.some(l => l.id === x.task.id))
  const deadlines = withDeadlines(i.tasks).filter(t => {
    const d = diffDays(i.now, t.deadline!)
    return d >= 0 && d <= i.leadDays
  })
  const events = eventsInRange(i.events, i.now, i.now)
  const lines: string[] = []

  if (late.length) lines.push(`${plural(late.length, 'overdue task')}: ${names(late.map(t => t.title))}`)
  if (today.length) lines.push(`${plural(today.length, 'task')} for today: ${names(today.map(x => x.task.title))}`)
  if (deadlines.length) {
    lines.push(`Deadlines: ${names(deadlines.map(t => `${t.title} (${deadlineStatus(t.deadline!, i.now).label.toLowerCase()})`), 4)}`)
  }
  if (events.length) lines.push(`Today: ${names(events.map(e => (e.start ? `${e.start} ${e.title}` : e.title)))}`)
  if (i.cardsDue) lines.push(`${plural(i.cardsDue, 'flashcard')} to review`)
  if (i.revisionsDue) lines.push(`${plural(i.revisionsDue, 'note')} to revise`)

  const total = late.length + today.length + deadlines.length + events.length + (i.cardsDue ? 1 : 0) + (i.revisionsDue ? 1 : 0)
  const headline = late.length || deadlines.some(t => t.deadline === i.now)
    ? 'Things need your attention today'
    : today.length || events.length ? 'Your day at a glance' : i.cardsDue || i.revisionsDue ? 'Time to study' : 'Nothing due today'
  return { title: headline, body: lines.join('\n') || 'You have nothing scheduled. Enjoy the space.', total }
}

export interface DueReminder {
  /** Unique per occurrence, so it fires once. */
  key: string
  title: string
  body: string
  taskId?: string
  eventId?: string
}

/**
 * Reminders whose time has come. `nowMoment` is a local "YYYY-MM-DDTHH:MM"; a reminder fires when its moment
 * is at or before now, but not if it is more than `windowHours` old (so reopening the app after days away
 * doesn't flood you), and never twice (`fired`).
 */
export function dueReminders(tasks: Task[], events: CalEvent[], nowMoment: string, fired: Set<string>, windowHours = 12): DueReminder[] {
  const out: DueReminder[] = []
  const nowDate = nowMoment.slice(0, 10)
  const nowMs = new Date(`${nowMoment}:00`).getTime()
  const fresh = (moment: string) => {
    const ms = new Date(`${moment}:00`).getTime()
    return ms <= nowMs && nowMs - ms <= windowHours * 3_600_000
  }

  for (const t of tasks) {
    if (!t.remind || t.done && !t.recur) continue
    // For repeating tasks look at each occurrence in the next few weeks; otherwise at the single target date.
    const targets: ISODate[] = t.recur && t.due
      ? occurrencesBetween(t.due, t.recur, addDays(nowDate, -1), addDays(nowDate, 40))
      : [t.deadline ?? t.due].filter((d): d is ISODate => !!d)
    for (const target of targets) {
      if (t.recur && (t.completions ?? []).includes(target)) continue
      const moment = reminderMoment(target, t.remind)
      const key = `task:${t.id}:${target}:${moment}`
      if (fired.has(key) || !fresh(moment)) continue
      const days = diffDays(nowDate, target)
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${formatShort(target)}`
      out.push({ key, taskId: t.id, title: t.title, body: `${t.deadline ? 'Deadline' : 'Due'} ${when}` })
    }
  }

  for (const e of events) {
    if (e.remindMin === undefined || !e.start) continue
    const dates = e.recur ? occurrencesBetween(e.date, e.recur, nowDate, addDays(nowDate, 1)) : [e.date]
    for (const date of dates) {
      const start = new Date(`${date}T${e.start}:00`).getTime()
      const at = new Date(start - e.remindMin * 60_000)
      const moment = localMoment(at)
      const key = `event:${e.id}:${date}:${moment}`
      if (fired.has(key) || !fresh(moment)) continue
      out.push({ key, eventId: e.id, title: e.title, body: e.remindMin ? `Starts at ${e.start} (in ${e.remindMin} min)` : `Starts at ${e.start}` })
    }
  }
  return out
}
