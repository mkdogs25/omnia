import { describe, expect, it } from 'vitest'
import { addDays, addMonths, formatLong, monthGrid, startOfWeek, formatWeekRange, diffDays } from './dates'
import { describeRecurrence, nextOccurrence, occurrencesBetween, type Recurrence } from './recurrence'

describe('dates', () => {
  it('formats long dates with ordinals', () => {
    expect(formatLong('2026-10-31')).toBe('October 31st, 2026')
    expect(formatLong('2026-11-01')).toBe('November 1st, 2026')
    expect(formatLong('2026-11-12')).toBe('November 12th, 2026')
  })
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-10-31')).toBe('2026-10-26')
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26')
    expect(formatWeekRange('2026-10-26')).toBe('Oct 26 - Nov 1')
  })
  it('adds days and months across boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
  })
  it('builds whole-week month grids', () => {
    const g = monthGrid('2026-10-15')
    expect(g.length % 7).toBe(0)
    expect(g[0]).toBe('2026-09-28')
    expect(g[g.length - 1]).toBe('2026-11-01')
  })
})

describe('recurrence', () => {
  it('weekly rules default to the anchor weekday', () => {
    const rule: Recurrence = { unit: 'week', every: 1 }
    expect(occurrencesBetween('2026-10-27', rule, '2026-10-26', '2026-11-10')).toEqual(['2026-10-27', '2026-11-03', '2026-11-10'])
  })
  it('fortnightly rules skip alternate weeks', () => {
    const rule: Recurrence = { unit: 'week', every: 2, weekdays: [0] }
    expect(occurrencesBetween('2026-11-01', rule, '2026-11-01', '2026-12-01')).toEqual(['2026-11-01', '2026-11-15', '2026-11-29'])
  })
  it('monthly rules clamp to the month end', () => {
    const rule: Recurrence = { unit: 'month', every: 1 }
    expect(occurrencesBetween('2026-01-31', rule, '2026-01-01', '2026-03-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
  it('finds the next occurrence', () => {
    expect(nextOccurrence('2026-10-27', { unit: 'day', every: 3 }, '2026-10-28')).toBe('2026-10-30')
  })
  it('describes rules', () => {
    expect(describeRecurrence({ unit: 'week', every: 1, weekdays: [2] })).toBe('Every Tuesday')
    expect(describeRecurrence({ unit: 'week', every: 2 })).toBe('Every fortnight')
    expect(describeRecurrence({ unit: 'day', every: 3 })).toBe('Every 3 days')
  })
})
