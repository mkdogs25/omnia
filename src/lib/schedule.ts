// Works out which notifications to hand to the phone's alarm system ahead of time, so reminders and the daily summary
// arrive even when Omnia is closed. (A web page can only notify while it is open; the Android app can do better.)

import { addDays, fromISO, toISO, type ISODate } from './dates'
import { buildDigest, hhmm, inQuietHours } from './notify'
import { occurrencesBetween } from './recurrence'
import { reminderMoment, type CalEvent, type Task } from './tasks'

export interface PlanInput {
  tasks: Task[]
  events: CalEvent[]
  now: Date
  /** How many days ahead to plan. */
  days: number
  digestTime: string
  digestEmpty: boolean
  quietEnabled: boolean
  quietStart: string
  quietEnd: string
  deadlineLeadDays: number
  /** Only known for today, so the summary for later days leaves them out. */
  cardsDue: number
  revisionsDue: number
}

export interface Planned { key: string; at: Date; title: string; body: string }

const at = (date: ISODate, time: string) => new Date(`${date}T${time}:00`)
const dayOf = (d: Date) => toISO(d)

/** Moves a time out of quiet hours: to the end of them, on the date that comes next. */
function outOfQuiet(when: Date, i: Pick<PlanInput, 'quietEnabled' | 'quietStart' | 'quietEnd'>): Date {
  if (!i.quietEnabled || !inQuietHours(hhmm(when), i.quietStart, i.quietEnd)) return when
  const date = dayOf(when)
  const sameDay = at(date, i.quietEnd)
  // Past midnight (before the end time) it ends later today; in the evening it ends tomorrow morning.
  return sameDay.getTime() > when.getTime() ? sameDay : at(addDays(date, 1), i.quietEnd)
}

const MAX = 400

export function planNotifications(i: PlanInput): Planned[] {
  const out: Planned[] = []
  const today = dayOf(i.now)
  const last = addDays(today, i.days)
  const future = (d: Date) => d.getTime() > i.now.getTime() + 5_000

  // Daily summaries
  for (let n = 0; n < i.days; n++) {
    const day = addDays(today, n)
    const when = outOfQuiet(at(day, i.digestTime), i)
    if (!future(when)) continue
    const digest = buildDigest({
      tasks: i.tasks, events: i.events, now: day, leadDays: i.deadlineLeadDays,
      cardsDue: n === 0 ? i.cardsDue : 0, revisionsDue: n === 0 ? i.revisionsDue : 0
    })
    if (digest.total === 0 && !i.digestEmpty) continue
    out.push({ key: `digest:${day}`, at: when, title: digest.title, body: digest.body })
  }

  // Reminders on tasks
  for (const t of i.tasks) {
    if (!t.remind || (t.done && !t.recur)) continue
    const targets: ISODate[] = t.recur && t.due
      ? occurrencesBetween(t.due, t.recur, today, last)
      : [t.deadline ?? t.due].filter((d): d is ISODate => !!d)
    for (const target of targets) {
      if (t.recur && (t.completions ?? []).includes(target)) continue
      const moment = reminderMoment(target, t.remind)
      const when = outOfQuiet(new Date(`${moment}:00`), i)
      if (!future(when) || dayOf(when) > last) continue
      const days = Math.round((fromISO(target).getTime() - fromISO(dayOf(when)).getTime()) / 86_400_000)
      const label = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${target}`
      out.push({ key: `task:${t.id}:${target}:${moment}`, at: when, title: t.title, body: `${t.deadline ? 'Deadline' : 'Due'} ${label}` })
    }
  }

  // Reminders on events
  for (const e of i.events) {
    if (e.remindMin === undefined || !e.start) continue
    const dates = e.recur ? occurrencesBetween(e.date, e.recur, today, last) : e.date >= today && e.date <= last ? [e.date] : []
    for (const date of dates) {
      const start = at(date, e.start)
      const when = outOfQuiet(new Date(start.getTime() - e.remindMin * 60_000), i)
      if (!future(when)) continue
      out.push({ key: `event:${e.id}:${date}`, at: when, title: e.title, body: e.remindMin ? `Starts at ${e.start} (in ${e.remindMin} min)` : `Starts at ${e.start}` })
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX)
}

/** A stable positive 31-bit number for a key (Android notification ids are ints). */
export function notificationId(key: string): number {
  let h = 2166136261
  for (let k = 0; k < key.length; k++) { h ^= key.charCodeAt(k); h = Math.imul(h, 16777619) }
  return (h >>> 0) & 0x7fffffff
}
