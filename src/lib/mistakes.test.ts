import { describe, expect, it } from 'vitest'
import { activeMistakes, byNote, clearResolved, missesPerDay, normaliseMistakes, recordHit, recordMiss, toCSV, toQuestion, type MissInput } from './mistakes'

const input = (id: string, path = 'A.md'): MissInput => ({
  id, source: 'quiz', path, given: 'wrong',
  q: { kind: 'choice', prompt: `Question ${id}?`, options: [{ text: 'Right', correct: true }, { text: 'Wrong', correct: false }], answers: [] }
})

describe('error log', () => {
  it('records a first miss, then counts repeats and resets the streak', () => {
    let l = recordMiss([], input('1'), '2026-10-01')
    expect(l[0]).toMatchObject({ count: 1, streak: 0, first: '2026-10-01' })
    l = recordHit(l, '1', '2026-10-02')
    expect(l[0].streak).toBe(1)
    l = recordMiss(l, input('1'), '2026-10-03')
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ count: 2, streak: 0, last: '2026-10-03', first: '2026-10-01' })
    expect(l[0].history).toEqual(['2026-10-01', '2026-10-03'])
  })

  it('resolves after two right answers in a row and reopens on a new miss', () => {
    let l = recordMiss([], input('1'), '2026-10-01')
    l = recordHit(l, '1', '2026-10-02')
    expect(l[0].resolved).toBeUndefined()
    l = recordHit(l, '1', '2026-10-03')
    expect(l[0].resolved).toBe('2026-10-03')
    expect(activeMistakes(l)).toHaveLength(0)
    l = recordMiss(l, input('1'), '2026-10-09')
    expect(l[0].resolved).toBeUndefined()
    expect(activeMistakes(l)).toHaveLength(1)
  })

  it('ignores hits on questions that were never missed', () => {
    const l = recordMiss([], input('1'), '2026-10-01')
    expect(recordHit(l, 'nope', '2026-10-02')).toBe(l)
  })

  it('keeps the learner’s own note when a mistake repeats', () => {
    let l = recordMiss([], input('1'), '2026-10-01')
    l = l.map(m => ({ ...m, why: 'mixed up mass and weight' }))
    l = recordMiss(l, input('1'), '2026-10-02')
    expect(l[0].why).toBe('mixed up mass and weight')
  })

  it('orders by times missed and groups by note', () => {
    let l = recordMiss([], input('1', 'A.md'), '2026-10-01')
    l = recordMiss(l, input('2', 'B.md'), '2026-10-01')
    l = recordMiss(l, input('2', 'B.md'), '2026-10-02')
    expect(activeMistakes(l).map(m => m.id)).toEqual(['2', '1'])
    expect(byNote(l)[0]).toMatchObject({ path: 'B.md', active: 1, misses: 2 })
    expect(clearResolved(l)).toHaveLength(2)
  })

  it('counts misses per day', () => {
    let l = recordMiss([], input('1'), '2026-10-05')
    l = recordMiss(l, input('2'), '2026-10-05')
    l = recordMiss(l, input('1'), '2026-10-03')
    expect(missesPerDay(l, '2026-10-05', 4)).toEqual([0, 1, 0, 2])
  })

  it('rebuilds a question and exports CSV with quoting', () => {
    const l = recordMiss([], { ...input('1'), q: { ...input('1').q, prompt: 'Say "hi", then stop' } }, '2026-10-01')
    expect(toQuestion(l[0]).options).toHaveLength(2)
    const csv = toCSV(l)
    expect(csv.split('\n')[0]).toContain('Question,Correct answer')
    expect(csv).toContain('"Say ""hi"", then stop",Right,wrong,Quiz,A.md,1,0,2026-10-01,2026-10-01,,')
  })

  it('survives a damaged file', () => {
    expect(normaliseMistakes('nope')).toEqual([])
    expect(normaliseMistakes([{ id: 1 }, null, { ...recordMiss([], input('1'), '2026-10-01')[0] }])).toHaveLength(1)
  })
})
