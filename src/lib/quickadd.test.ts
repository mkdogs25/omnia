import { describe, expect, it } from 'vitest'
import { extractDate, parseEventQuickAdd, parseQuickAdd } from './quickadd'

const NOW = '2026-10-24' // a Saturday

describe('parseQuickAdd', () => {
  it('leaves plain text alone', () => {
    expect(parseQuickAdd('Buy milk', NOW)).toEqual({ title: 'Buy milk', due: undefined, deadline: undefined, recur: undefined })
  })
  it('understands tomorrow and ISO dates', () => {
    expect(parseQuickAdd('Call Sam tomorrow', NOW).due).toBe('2026-10-25')
    expect(parseQuickAdd('Essay 2026-11-02', NOW)).toMatchObject({ title: 'Essay', due: '2026-11-02' })
  })
  it('understands weekdays', () => {
    expect(parseQuickAdd('Lab report friday', NOW)).toMatchObject({ title: 'Lab report', due: '2026-10-30' })
    expect(parseQuickAdd('Lab report next saturday', NOW).due).toBe('2026-10-31')
  })
  it('understands day and month', () => {
    expect(parseQuickAdd('Hand in on 31 oct', NOW).due).toBe('2026-10-31')
    expect(parseQuickAdd('Hand in Jan 5th', NOW).due).toBe('2027-01-05')
  })
  it('parses weekly repeats on a weekday', () => {
    const r = parseQuickAdd('Daily Notes every tuesday', NOW)
    expect(r.title).toBe('Daily Notes')
    expect(r.recur).toEqual({ unit: 'week', every: 1, weekdays: [2] })
    expect(r.due).toBe('2026-10-27')
  })
  it('does not eat title words that merely look like repeat words', () => {
    expect(parseQuickAdd('Weekly Revision', NOW)).toEqual({ title: 'Weekly Revision', due: undefined, deadline: undefined, recur: undefined })
    expect(parseQuickAdd('Fortnightly Revision', NOW).title).toBe('Fortnightly Revision')
  })
  it('puts a weekday after "every N weeks" into the rule', () => {
    const r = parseQuickAdd('Fortnightly Revision every 2 weeks sunday', NOW)
    expect(r.title).toBe('Fortnightly Revision')
    expect(r.recur).toEqual({ unit: 'week', every: 2, weekdays: [0] })
    expect(r.due).toBe('2026-10-25')
  })
  it('parses trailing fortnightly and numeric repeats', () => {
    expect(parseQuickAdd('Revision fortnightly', NOW).recur).toMatchObject({ unit: 'week', every: 2 })
    expect(parseQuickAdd('Water plants every 3 days', NOW).recur).toEqual({ unit: 'day', every: 3 })
    expect(parseQuickAdd('Rent every month on 1 nov', NOW)).toMatchObject({ due: '2026-11-01', recur: { unit: 'month', every: 1 } })
  })
  it('reads deadlines introduced by by / due / deadline / before', () => {
    expect(parseQuickAdd('Finish project by friday', NOW)).toMatchObject({ title: 'Finish project', deadline: '2026-10-30', due: undefined })
    expect(parseQuickAdd('Report due 2026-11-03', NOW)).toMatchObject({ title: 'Report', deadline: '2026-11-03', due: undefined })
    expect(parseQuickAdd('Essay deadline 31 oct', NOW)).toMatchObject({ title: 'Essay', deadline: '2026-10-31' })
    expect(parseQuickAdd('Poster before tomorrow', NOW)).toMatchObject({ title: 'Poster', deadline: '2026-10-25' })
  })
  it('keeps a planned day and a deadline apart', () => {
    const r = parseQuickAdd('Lab report tomorrow by 2 nov', NOW)
    expect(r).toMatchObject({ title: 'Lab report', due: '2026-10-25', deadline: '2026-11-02' })
  })
  it('does not treat "by" in a title as a deadline unless a date follows', () => {
    expect(parseQuickAdd('Walk by the river', NOW)).toMatchObject({ title: 'Walk by the river', deadline: undefined })
  })
  it('gives repeating tasks no deadline', () => {
    expect(parseQuickAdd('Standup every monday by friday', NOW).deadline).toBeUndefined()
  })
  it('extracts a date and returns the rest', () => {
    expect(extractDate('read chapter in 3 days please', NOW)).toEqual({ date: '2026-10-27', rest: 'read chapter please' })
    expect(extractDate('nothing here', NOW)).toEqual({ rest: 'nothing here' })
  })
})

describe('repeats on several days', () => {
  it('every week on several days', () => {
    const r = parseQuickAdd('Finish homework every week on monday thursday friday', NOW)
    expect(r.title).toBe('Finish homework')
    expect(r.recur).toEqual({ unit: 'week', every: 1, weekdays: [1, 4, 5] })
    expect(r.due).toBe('2026-10-26') // the first matching day after Saturday 24th
  })
  it('every 2 weeks on abbreviated days', () => {
    const r = parseQuickAdd('Math class every 2 weeks on mon fri sun', NOW)
    expect(r.title).toBe('Math class')
    expect(r.recur).toEqual({ unit: 'week', every: 2, weekdays: [0, 1, 5] })
    expect(r.due).toBe('2026-10-25')
  })
  it('accepts commas, "and" and a missing "on"', () => {
    expect(parseQuickAdd('Gym every monday, wednesday and friday', NOW).recur).toEqual({ unit: 'week', every: 1, weekdays: [1, 3, 5] })
    expect(parseQuickAdd('Gym every week tue thu', NOW).recur).toEqual({ unit: 'week', every: 1, weekdays: [2, 4] })
    expect(parseQuickAdd('Gym every 3 weeks on wed', NOW).recur).toEqual({ unit: 'week', every: 3, weekdays: [3] })
  })
  it('every other week, every other day, every fortnight', () => {
    expect(parseQuickAdd('Bins every other week', NOW).recur).toMatchObject({ unit: 'week', every: 2 })
    expect(parseQuickAdd('Floss every other day', NOW).recur).toEqual({ unit: 'day', every: 2 })
    expect(parseQuickAdd('Review every fortnight on thu', NOW).recur).toEqual({ unit: 'week', every: 2, weekdays: [4] })
  })
  it('keeps months and years free of weekdays and leaves the title alone', () => {
    expect(parseQuickAdd('Rent every 2 months', NOW).recur).toEqual({ unit: 'month', every: 2 })
    expect(parseQuickAdd('Pay rent every month', NOW).title).toBe('Pay rent')
    expect(parseQuickAdd('Month end report', NOW).recur).toBeUndefined()
  })
  it('a deadline still works alongside a repeat', () => {
    const r = parseQuickAdd('Essay draft every week on fri', NOW)
    expect(r.recur?.weekdays).toEqual([5])
  })
})

describe('parseEventQuickAdd', () => {
  it('title, day and a time range', () => {
    expect(parseEventQuickAdd('Team meeting tomorrow 2-3pm', NOW)).toMatchObject({ title: 'Team meeting', date: '2026-10-25', start: '14:00', end: '15:00' })
    expect(parseEventQuickAdd('Seminar friday from 9 to 10:30am', NOW)).toMatchObject({ title: 'Seminar', date: '2026-10-30', start: '09:00', end: '10:30' })
    expect(parseEventQuickAdd('Shift 14:00-15:30 today', NOW)).toMatchObject({ title: 'Shift', date: NOW, start: '14:00', end: '15:30' })
  })
  it('single times and durations', () => {
    expect(parseEventQuickAdd('Dentist tomorrow at 3pm for 1 hour', NOW)).toMatchObject({ title: 'Dentist', date: '2026-10-25', start: '15:00', end: '16:00' })
    expect(parseEventQuickAdd('Call 9:30am for 45 min', NOW)).toMatchObject({ start: '09:30', end: '10:15' })
    expect(parseEventQuickAdd('Lunch noon', NOW)).toMatchObject({ title: 'Lunch', start: '12:00' })
    expect(parseEventQuickAdd('Gym at 6', NOW).start).toBe('18:00')
    expect(parseEventQuickAdd('Run at 7:15', NOW).start).toBe('07:15')
  })
  it('leaves numbers that are not times alone', () => {
    expect(parseEventQuickAdd('Chapter 3 review', NOW)).toMatchObject({ title: 'Chapter 3 review', start: undefined })
    expect(parseEventQuickAdd('Read pages 2-5', NOW)).toMatchObject({ title: 'Read pages 2-5', start: undefined })
  })
  it('repeats on several days with a time', () => {
    const r = parseEventQuickAdd('Math class every 2 weeks on mon fri sun 9-10:30am', NOW)
    expect(r).toMatchObject({ title: 'Math class', start: '09:00', end: '10:30', recur: { unit: 'week', every: 2, weekdays: [0, 1, 5] }, date: '2026-10-25' })
  })
  it('reminders', () => {
    expect(parseEventQuickAdd('Exam friday 10am remind me 1 hour before', NOW)).toMatchObject({ title: 'Exam', start: '10:00', remindMin: 60 })
    expect(parseEventQuickAdd('Call tomorrow 5pm remind me 2 days before', NOW).remindMin).toBe(2880)
    expect(parseEventQuickAdd('Call tomorrow 5pm remind me', NOW).remindMin).toBe(0)
    expect(parseEventQuickAdd('Birthday tomorrow remind me 1 day before', NOW).remindMin).toBeUndefined() // no start time: nothing to count back from
  })
  it('plain titles pass through', () => {
    expect(parseEventQuickAdd('Sam’s birthday', NOW)).toEqual({ title: 'Sam’s birthday', date: undefined, start: undefined, end: undefined, recur: undefined, remindMin: undefined })
  })
  it('monthly and daily repeats', () => {
    expect(parseEventQuickAdd('Rent due every month 31 oct', NOW)).toMatchObject({ date: '2026-10-31', recur: { unit: 'month', every: 1 } })
    expect(parseEventQuickAdd('Standup every day 9:15', NOW)).toMatchObject({ start: '09:15', recur: { unit: 'day', every: 1 } })
  })
})
