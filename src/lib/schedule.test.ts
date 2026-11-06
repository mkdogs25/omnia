import { describe, expect, it } from 'vitest'
import { notificationId, planNotifications, type PlanInput } from './schedule'
import type { CalEvent, Task } from './tasks'

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  tasks: [], events: [], now: new Date(2026, 10, 6, 8, 0), days: 7, digestTime: '09:00', digestEmpty: false,
  quietEnabled: true, quietStart: '22:00', quietEnd: '07:00', deadlineLeadDays: 3, cardsDue: 0, revisionsDue: 0, ...over
})
const task = (o: Partial<Task>): Task => ({ id: 't', title: 'Task', done: false, created: '2026-11-01', ...o } as Task)
const when = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

describe('planNotifications', () => {
  it('plans a daily summary only on days that have something in them', () => {
    const plan = planNotifications(base({ tasks: [task({ due: '2026-11-08' })], cardsDue: 3 }))
    const days = plan.filter(p => p.key.startsWith('digest:')).map(p => p.key.slice(7))
    // Today (flashcards due), the day it is due, then every day it stays overdue; nothing on the quiet day between.
    expect(days).toEqual(['2026-11-06', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'])
    expect(when(plan[0].at)).toBe('2026-11-06 09:00')
  })
  it('sends the empty summary every day when asked', () => {
    expect(planNotifications(base({ digestEmpty: true })).length).toBe(7)
  })
  it('skips a summary time that has already passed today', () => {
    const plan = planNotifications(base({ now: new Date(2026, 10, 6, 10, 0), digestEmpty: true }))
    expect(when(plan[0].at)).toBe('2026-11-07 09:00')
  })
  it('plans task reminders, including each repeat', () => {
    const t = task({ id: 'g', title: 'Gym', due: '2026-11-06', time: '18:00', recur: { unit: 'week', every: 1, weekdays: [1, 4] }, remind: { daysBefore: 0, time: '17:00' } } as never)
    const plan = planNotifications(base({ tasks: [t] })).filter(p => p.key.startsWith('task:'))
    expect(plan.length).toBeGreaterThanOrEqual(2)
    expect(plan.every(p => p.title === 'Gym')).toBe(true)
  })
  it('plans event reminders before the start, for every repeat', () => {
    const e: CalEvent = { id: 'e', title: 'Lecture', date: '2026-11-06', start: '09:00', remindMin: 30, recur: { unit: 'week', every: 1, weekdays: [5] } }
    const plan = planNotifications(base({ events: [e], digestEmpty: false })).filter(p => p.key.startsWith('event:'))
    expect(plan.map(p => when(p.at))).toEqual(['2026-11-06 08:30', '2026-11-13 08:30'].filter(d => d > '2026-11-06 08:00'))
    expect(plan[0].body).toBe('Starts at 09:00 (in 30 min)')
  })
  it('moves things out of quiet hours', () => {
    const e: CalEvent = { id: 'e', title: 'Early', date: '2026-11-07', start: '06:30', remindMin: 30 }
    const plan = planNotifications(base({ events: [e] })).filter(p => p.key.startsWith('event:'))
    expect(when(plan[0].at)).toBe('2026-11-07 07:00')
    const late = planNotifications(base({ digestTime: '23:00', digestEmpty: true }))
    expect(when(late[0].at)).toBe('2026-11-07 07:00')
  })
  it('ignores finished tasks, past reminders and things beyond the window', () => {
    const done = task({ due: '2026-11-06', done: true, remind: { daysBefore: 0, time: '17:00' } } as never)
    const far: CalEvent = { id: 'f', title: 'Far', date: '2027-01-01', start: '09:00', remindMin: 10 }
    expect(planNotifications(base({ tasks: [done], events: [far] })).filter(p => !p.key.startsWith('digest:'))).toEqual([])
  })
  it('gives stable ids', () => {
    expect(notificationId('a')).toBe(notificationId('a'))
    expect(notificationId('a')).not.toBe(notificationId('b'))
    expect(notificationId('digest:2026-11-06')).toBeGreaterThan(0)
  })
})
