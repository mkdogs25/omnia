import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quickadd'

const NOW = '2026-10-24' // a Saturday

describe('parseQuickAdd', () => {
  it('leaves plain text alone', () => {
    expect(parseQuickAdd('Buy milk', NOW)).toEqual({ title: 'Buy milk', due: undefined, recur: undefined })
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
    expect(parseQuickAdd('Weekly Revision', NOW)).toEqual({ title: 'Weekly Revision', due: undefined, recur: undefined })
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
})
