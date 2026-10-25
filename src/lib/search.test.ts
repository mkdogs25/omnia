import { describe, expect, it } from 'vitest'
import { parseNote } from './noteparse'
import { matchScore, search, type SearchData } from './search'

const note = (path: string, text: string) => ({ path, text, parsed: parseNote(text, path) })

const data = (): SearchData => ({
  notes: [
    note('Physics/Waves.md', '# Waves\n\n## Frequency\n\nPeriod :: time for one wave\n\n```quiz\nWhat is frequency measured in?\n+ Hertz\n- Joule\n```\n#physics'),
    note('Study Plan.md', '# Study Plan\n\nRevise waves.')
  ],
  docs: ['Papers/Frequency analysis.pdf'],
  tasks: [{ id: 't1', title: 'Revise waves', done: false, deadline: '2026-11-01' } as never, { id: 't2', title: 'Old waves task', done: true } as never],
  events: [{ id: 'e1', title: 'Waves lab', date: '2026-11-03' }]
})

describe('matchScore', () => {
  it('prefers exact, then prefix, then word-start matches', () => {
    expect(matchScore('waves', 'Waves')).toBe(100)
    expect(matchScore('wav', 'Waves')).toBe(80)
    expect(matchScore('lab', 'Waves lab')).toBe(65)
    expect(matchScore('zzz', 'Waves')).toBe(0)
  })
})

describe('search', () => {
  it('finds each kind of thing', () => {
    const kinds = new Set(search('freq', data()).map(h => h.kind))
    expect(kinds).toEqual(new Set(['heading', 'quiz', 'doc']))
    expect(new Set(search('waves', data()).map(h => h.kind))).toEqual(new Set(['note', 'heading', 'task', 'event']))
  })
  it('ranks note titles above headings, and open tasks above done ones', () => {
    const hits = search('waves', data())
    expect(hits[0]).toMatchObject({ kind: 'note', path: 'Physics/Waves.md' })
    expect(hits.findIndex(h => h.id === 't1')).toBeLessThan(hits.findIndex(h => h.id === 't2'))
  })
  it('finds cards by either side', () => {
    expect(search('time for one', data()).some(h => h.kind === 'card')).toBe(true)
    expect(search('period', data()).some(h => h.kind === 'card')).toBe(true)
  })
  it('lists tags for #queries', () => {
    expect(search('#phy', data()).map(h => h.label)).toEqual(['#physics'])
  })
  it('returns nothing for an empty query', () => {
    expect(search('  ', data())).toEqual([])
  })
})
