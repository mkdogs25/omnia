import { addDays, diffDays, type ISODate } from './dates'
import { occurrencesBetween, type Recurrence } from './recurrence'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

/** "Remind me N days before, at this time." Counts from the deadline if there is one, otherwise the planned day. */
export interface Reminder {
  daysBefore: number
  /** "HH:MM" 24-hour. */
  time: string
}

export interface Task {
  id: string
  title: string
  notes?: string
  /** The day to do it; for recurring tasks this is the first occurrence. */
  due?: ISODate
  /** The hard deadline, separate from the day you plan to work on it. */
  deadline?: ISODate
  subtasks?: Subtask[]
  remind?: Reminder
  time?: string
  recur?: Recurrence
  done: boolean
  doneAt?: string
  /** Recurring tasks: dates whose occurrence has been ticked off. */
  completions?: ISODate[]
  /** Path of a linked note. */
  note?: string
  /** Completed Pomodoro focus sessions spent on this task. */
  pomodoros?: number
  created: ISODate
}

export interface CalEvent {
  id: string
  title: string
  date: ISODate
  /** Minutes before the start to send a reminder. */
  remindMin?: number
  /** "HH:MM" 24-hour. */
  start?: string
  end?: string
  notes?: string
  recur?: Recurrence
  color?: string
}

/** A task as it appears on a given day (recurring tasks yield one item per occurrence). */
export interface TaskItem {
  task: Task
  date?: ISODate
  done: boolean
  /** True for occurrences generated from a repeat rule. */
  recurring: boolean
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function isRecurring(t: Task): t is Task & { due: ISODate; recur: Recurrence } {
  return !!t.recur && !!t.due
}

export function itemsInRange(tasks: Task[], from: ISODate, to: ISODate): TaskItem[] {
  const out: TaskItem[] = []
  for (const task of tasks) {
    if (isRecurring(task)) {
      const done = new Set(task.completions ?? [])
      for (const date of occurrencesBetween(task.due, task.recur, from, to)) {
        out.push({ task, date, done: done.has(date), recurring: true })
      }
      continue
    }
    // A task with only a deadline shows up on that day.
    const date = displayDate(task)
    if (date && date >= from && date <= to) out.push({ task, date, done: task.done, recurring: false })
  }
  return out.sort(compareItems)
}

export function compareItems(a: TaskItem, b: TaskItem): number {
  return (a.date ?? '').localeCompare(b.date ?? '')
    || (a.task.time ?? '99').localeCompare(b.task.time ?? '99')
    || a.task.title.localeCompare(b.task.title)
}

/** The day a one-off task is shown on: the planned day, or failing that the deadline. */
export function displayDate(t: Task): ISODate | undefined {
  return t.due ?? t.deadline
}

export function overdue(tasks: Task[], now: ISODate): Task[] {
  return tasks.filter(t => !t.recur && !t.done && (displayDate(t) ?? '9999') < now)
    .sort((a, b) => (displayDate(a) ?? '').localeCompare(displayDate(b) ?? ''))
}

/** Tasks with no planned day and no deadline. */
export function unplanned(tasks: Task[]): Task[] {
  return tasks.filter(t => !t.due && !t.deadline && !t.done)
}

/** Open one-off tasks with a deadline, soonest first. */
export function withDeadlines(tasks: Task[]): Task[] {
  return tasks.filter(t => !t.recur && !t.done && t.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
}

export type DeadlineTone = 'overdue' | 'today' | 'soon' | 'later'

export interface DeadlineStatus {
  days: number
  tone: DeadlineTone
  /** "3 days left", "Due today", "2 days overdue" */
  label: string
}

export function deadlineStatus(deadline: ISODate, now: ISODate, soonDays = 3): DeadlineStatus {
  const days = diffDays(now, deadline)
  if (days < 0) return { days, tone: 'overdue', label: `${-days} day${days === -1 ? '' : 's'} overdue` }
  if (days === 0) return { days, tone: 'today', label: 'Due today' }
  return { days, tone: days <= soonDays ? 'soon' : 'later', label: days === 1 ? 'Due tomorrow' : `${days} days left` }
}

export function subtaskProgress(t: Task): { done: number; total: number } {
  const list = t.subtasks ?? []
  return { done: list.filter(x => x.done).length, total: list.length }
}

/** Moves a one-off task to another planned day (or clears it with null). Returns a new task. */
export function reschedule(task: Task, to: ISODate | null): Task {
  return { ...task, due: to ?? undefined, time: to ? task.time : undefined }
}

/** The handful of dates offered by the "reschedule" buttons. */
export function quickDates(now: ISODate): { label: string; date: ISODate }[] {
  // The first Monday after tomorrow, so "Next week" never coincides with "Tomorrow" (e.g. on a Sunday).
  let nextMonday = addDays(now, 2)
  while ((new Date(`${nextMonday}T12:00:00`).getDay() + 6) % 7 !== 0) nextMonday = addDays(nextMonday, 1)
  return [
    { label: 'Today', date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'Next week', date: nextMonday }
  ]
}

/** When a reminder for this occurrence should fire, as a local "YYYY-MM-DDTHH:MM" string. */
export function reminderMoment(target: ISODate, r: Reminder): string {
  return `${addDays(target, -Math.max(0, r.daysBefore))}T${r.time}`
}

export function recurring(tasks: Task[]): Task[] {
  return tasks.filter(isRecurring)
}

export function completed(tasks: Task[]): Task[] {
  return tasks.filter(t => !t.recur && t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
}

/** Number of tasks that still need doing (unticked one-offs plus recurring tasks). */
export function openCount(tasks: Task[]): number {
  return tasks.filter(t => (t.recur ? true : !t.done)).length
}

/** Ticks or unticks a task (or one occurrence of a recurring task). Returns a new task. */
export function toggle(task: Task, date: ISODate | undefined, now: ISODate): Task {
  if (isRecurring(task) && date) {
    const set = new Set(task.completions ?? [])
    if (set.has(date)) set.delete(date)
    else set.add(date)
    return { ...task, completions: [...set].sort() }
  }
  return task.done ? { ...task, done: false, doneAt: undefined } : { ...task, done: true, doneAt: now }
}

/** Groups items into Monday-first weeks, then days, for the Upcoming list. */
export interface WeekGroup { start: ISODate; days: { date: ISODate; items: TaskItem[] }[] }

export function groupByWeek(items: TaskItem[], startOfWeek: (d: ISODate) => ISODate): WeekGroup[] {
  const weeks = new Map<ISODate, Map<ISODate, TaskItem[]>>()
  for (const it of items) {
    if (!it.date) continue
    const w = startOfWeek(it.date)
    const days = weeks.get(w) ?? new Map<ISODate, TaskItem[]>()
    days.set(it.date, [...(days.get(it.date) ?? []), it])
    weeks.set(w, days)
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([start, days]) => ({
    start,
    days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, list]) => ({ date, items: list }))
  }))
}

export function eventsInRange(events: CalEvent[], from: ISODate, to: ISODate): (CalEvent & { on: ISODate })[] {
  const out: (CalEvent & { on: ISODate })[] = []
  for (const e of events) {
    if (e.recur) for (const on of occurrencesBetween(e.date, e.recur, from, to)) out.push({ ...e, on })
    else if (e.date >= from && e.date <= to) out.push({ ...e, on: e.date })
  }
  return out.sort((a, b) => a.on.localeCompare(b.on) || (a.start ?? '').localeCompare(b.start ?? ''))
}

export { addDays }
