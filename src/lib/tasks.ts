import { addDays, type ISODate } from './dates'
import { occurrencesBetween, type Recurrence } from './recurrence'

export interface Task {
  id: string
  title: string
  notes?: string
  /** Due date; for recurring tasks this is the first occurrence. */
  due?: ISODate
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
    if (!task.due) continue
    if (isRecurring(task)) {
      const done = new Set(task.completions ?? [])
      for (const date of occurrencesBetween(task.due, task.recur, from, to)) {
        out.push({ task, date, done: done.has(date), recurring: true })
      }
    } else if (task.due >= from && task.due <= to) {
      out.push({ task, date: task.due, done: task.done, recurring: false })
    }
  }
  return out.sort(compareItems)
}

export function compareItems(a: TaskItem, b: TaskItem): number {
  return (a.date ?? '').localeCompare(b.date ?? '')
    || (a.task.time ?? '99').localeCompare(b.task.time ?? '99')
    || a.task.title.localeCompare(b.task.title)
}

export function overdue(tasks: Task[], now: ISODate): Task[] {
  return tasks.filter(t => !t.recur && !t.done && t.due && t.due < now)
    .sort((a, b) => a.due!.localeCompare(b.due!))
}

export function unplanned(tasks: Task[]): Task[] {
  return tasks.filter(t => !t.due && !t.done)
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
