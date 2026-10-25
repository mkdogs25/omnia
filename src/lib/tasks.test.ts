import { describe, expect, it } from 'vitest'
import { deadlineStatus, itemsInRange, overdue, quickDates, reminderMoment, reschedule, subtaskProgress, unplanned, withDeadlines, type Task } from './tasks'

const NOW = '2026-10-25' // Sunday
const t = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: 'x', done: false, created: NOW, ...over })

describe('deadlines', () => {
  it('describes how close a deadline is', () => {
    expect(deadlineStatus('2026-10-24', NOW)).toMatchObject({ tone: 'overdue', label: '1 day overdue' })
    expect(deadlineStatus('2026-10-20', NOW).label).toBe('5 days overdue')
    expect(deadlineStatus('2026-10-25', NOW)).toMatchObject({ tone: 'today', label: 'Due today' })
    expect(deadlineStatus('2026-10-26', NOW)).toMatchObject({ tone: 'soon', label: 'Due tomorrow' })
    expect(deadlineStatus('2026-10-28', NOW)).toMatchObject({ tone: 'soon', label: '3 days left' })
    expect(deadlineStatus('2026-11-10', NOW)).toMatchObject({ tone: 'later', label: '16 days left' })
  })
  it('lists open deadlines soonest first and ignores done and repeating tasks', () => {
    const list = withDeadlines([
      t({ title: 'b', deadline: '2026-11-02' }), t({ title: 'a', deadline: '2026-10-30' }),
      t({ title: 'done', deadline: '2026-10-29', done: true }),
      t({ title: 'rep', deadline: '2026-10-29', due: '2026-10-26', recur: { unit: 'week', every: 1 } })
    ])
    expect(list.map(x => x.title)).toEqual(['a', 'b'])
  })
  it('shows a deadline-only task on its deadline day', () => {
    const items = itemsInRange([t({ title: 'only deadline', deadline: '2026-10-30' })], '2026-10-26', '2026-11-01')
    expect(items).toHaveLength(1)
    expect(items[0].date).toBe('2026-10-30')
  })
  it('prefers the planned day over the deadline for placement', () => {
    const items = itemsInRange([t({ due: '2026-10-27', deadline: '2026-10-30' })], '2026-10-26', '2026-11-01')
    expect(items.map(i => i.date)).toEqual(['2026-10-27'])
  })
  it('treats a task as overdue when its day or deadline has passed', () => {
    const tasks = [t({ title: 'late-day', due: '2026-10-20' }), t({ title: 'late-deadline', deadline: '2026-10-22' }), t({ title: 'fine', due: '2026-10-30' }), t({ title: 'done', due: '2026-10-01', done: true })]
    expect(overdue(tasks, NOW).map(x => x.title)).toEqual(['late-day', 'late-deadline'])
  })
  it('keeps deadline tasks out of Unplanned', () => {
    expect(unplanned([t({ title: 'nothing' }), t({ deadline: '2026-10-30' })]).map(x => x.title)).toEqual(['nothing'])
  })
})

describe('subtasks, rescheduling and reminders', () => {
  it('counts subtask progress', () => {
    expect(subtaskProgress(t({}))).toEqual({ done: 0, total: 0 })
    expect(subtaskProgress(t({ subtasks: [{ id: '1', title: 'a', done: true }, { id: '2', title: 'b', done: false }] }))).toEqual({ done: 1, total: 2 })
  })
  it('reschedules and clears', () => {
    const task = t({ due: '2026-10-20', time: '10:00' })
    expect(reschedule(task, '2026-10-26')).toMatchObject({ due: '2026-10-26', time: '10:00' })
    expect(reschedule(task, null)).toMatchObject({ due: undefined, time: undefined })
  })
  it('offers today, tomorrow and next Monday', () => {
    expect(quickDates(NOW).map(d => d.date)).toEqual(['2026-10-25', '2026-10-26', '2026-11-02'])
  })
  it('works out when a reminder fires', () => {
    expect(reminderMoment('2026-10-30', { daysBefore: 2, time: '08:30' })).toBe('2026-10-28T08:30')
    expect(reminderMoment('2026-10-30', { daysBefore: 0, time: '09:00' })).toBe('2026-10-30T09:00')
  })
})
