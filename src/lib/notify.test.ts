import { describe, expect, it } from 'vitest'
import { buildDigest, dueReminders, inQuietHours } from './notify'
import type { CalEvent, Task } from './tasks'

const NOW = '2026-10-25'
const t = (over: Partial<Task>): Task => ({ id: over.title ?? 'x', title: 'x', done: false, created: NOW, ...over })

describe('quiet hours', () => {
  it('handles ranges that cross midnight', () => {
    expect(inQuietHours('23:30', '22:00', '07:00')).toBe(true)
    expect(inQuietHours('03:00', '22:00', '07:00')).toBe(true)
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false)
    expect(inQuietHours('12:00', '22:00', '07:00')).toBe(false)
  })
  it('handles same-day ranges and an empty range', () => {
    expect(inQuietHours('13:30', '13:00', '14:00')).toBe(true)
    expect(inQuietHours('15:00', '13:00', '14:00')).toBe(false)
    expect(inQuietHours('10:00', '08:00', '08:00')).toBe(false)
  })
})

describe('daily digest', () => {
  const base = { events: [] as CalEvent[], now: NOW, leadDays: 3, cardsDue: 0, revisionsDue: 0 }
  it('says so when there is nothing', () => {
    const d = buildDigest({ ...base, tasks: [] })
    expect(d.total).toBe(0)
    expect(d.title).toBe('Nothing due today')
  })
  it('lists overdue tasks, today, and near deadlines', () => {
    const d = buildDigest({
      ...base,
      tasks: [
        t({ title: 'Late one', due: '2026-10-20' }),
        t({ title: 'Today one', due: NOW }),
        t({ title: 'Project', deadline: '2026-10-27' }),
        t({ title: 'Far away', deadline: '2026-12-01' })
      ],
      cardsDue: 12, revisionsDue: 2
    })
    expect(d.title).toBe('Things need your attention today')
    expect(d.body).toContain('1 overdue task: Late one')
    expect(d.body).toContain('1 task for today: Today one')
    expect(d.body).toContain('Project (2 days left)')
    expect(d.body).not.toContain('Far away')
    expect(d.body).toContain('12 flashcards to review')
    expect(d.body).toContain('2 notes to revise')
  })
  it('does not list a task twice when it is overdue and also due', () => {
    const d = buildDigest({ ...base, tasks: [t({ title: 'Once', due: '2026-10-20' })] })
    expect(d.body.match(/Once/g)).toHaveLength(1)
  })
})

describe('reminders', () => {
  const task = t({ title: 'Essay', deadline: '2026-10-28', remind: { daysBefore: 1, time: '09:00' } })
  it('fires at the right moment, once', () => {
    expect(dueReminders([task], [], '2026-10-27T08:59', new Set())).toHaveLength(0)
    const due = dueReminders([task], [], '2026-10-27T09:05', new Set())
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ title: 'Essay', body: 'Deadline tomorrow' })
    expect(dueReminders([task], [], '2026-10-27T09:05', new Set([due[0].key]))).toHaveLength(0)
  })
  it('skips reminders that are long past', () => {
    expect(dueReminders([task], [], '2026-10-29T09:00', new Set())).toHaveLength(0)
  })
  it('ignores finished tasks', () => {
    expect(dueReminders([{ ...task, done: true }], [], '2026-10-27T09:05', new Set())).toHaveLength(0)
  })
  it('reminds before an event starts', () => {
    const ev: CalEvent = { id: 'e1', title: 'Physics exam', date: '2026-10-26', start: '10:00', remindMin: 30 }
    expect(dueReminders([], [ev], '2026-10-26T09:20', new Set())).toHaveLength(0)
    const due = dueReminders([], [ev], '2026-10-26T09:31', new Set())
    expect(due[0]).toMatchObject({ title: 'Physics exam', eventId: 'e1' })
  })
  it('handles repeating tasks one occurrence at a time', () => {
    const rep = t({ title: 'Daily Notes', due: '2026-10-20', recur: { unit: 'day', every: 1 }, remind: { daysBefore: 0, time: '08:00' } })
    const first = dueReminders([rep], [], '2026-10-25T08:10', new Set())
    expect(first).toHaveLength(1)
    expect(dueReminders([{ ...rep, completions: ['2026-10-25'] }], [], '2026-10-25T08:10', new Set())).toHaveLength(0)
  })
})
