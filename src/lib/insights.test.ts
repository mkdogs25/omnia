import { describe, expect, it } from 'vitest'
import { accuracy, change, noteAccuracy, weekSummary, weeklyTrend } from './insights'
import { emptyStudy } from './study'
import { recordMiss, recordHit } from './mistakes'

const study = () => ({
  ...emptyStudy(),
  log: { '2026-10-19': { reviews: 10, correct: 8, newCards: 3 }, '2026-10-21': { reviews: 5, correct: 5, newCards: 0 }, '2026-10-12': { reviews: 20, correct: 10, newCards: 1 } },
  focus: { '2026-10-20': 50 },
  quizzes: [{ date: '2026-10-22', path: 'A.md', total: 10, correct: 7 }, { date: '2026-10-13', path: 'B.md', total: 4, correct: 1 }],
  notes: { 'A.md': { reviews: 12, correct: 11 }, 'B.md': { reviews: 2, correct: 0 } }
})

describe('weekSummary', () => {
  it('adds up a Monday-based week', () => {
    let m = recordMiss([], { id: '1', source: 'quiz', path: 'A.md', q: { kind: 'text', prompt: 'x', options: [], answers: ['y'] } }, '2026-10-22')
    m = recordHit(m, '1', '2026-10-23'); m = recordHit(m, '1', '2026-10-24')
    const s = weekSummary(study(), m, '2026-10-19')
    expect(s).toMatchObject({ reviews: 15, correct: 13, newCards: 3, quizzes: 1, quizTotal: 10, quizCorrect: 7, focus: 50, newMistakes: 1, resolved: 1, activeDays: 4 })
    expect(accuracy(s)).toBeCloseTo(20 / 25)
  })
  it('has no accuracy when nothing was answered', () => {
    expect(accuracy(weekSummary(emptyStudy(), [], '2026-10-19'))).toBeNull()
  })
})

describe('weeklyTrend', () => {
  it('lists weeks oldest first', () => {
    const t = weeklyTrend(study(), '2026-10-25', 3)
    expect(t.map(p => p.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
    expect(t[1].accuracy).toBeCloseTo(11 / 24)
    expect(t[0].accuracy).toBeNull()
  })
})

describe('noteAccuracy', () => {
  it('combines cards and quizzes, hides thin data, weakest first', () => {
    const rows = noteAccuracy(study(), 5)
    expect(rows.map(r => r.path)).toEqual(['B.md', 'A.md'])
    expect(rows[0]).toMatchObject({ path: 'B.md', answered: 6, correct: 1 })
    expect(rows[1]).toMatchObject({ path: 'A.md', answered: 22, correct: 18 })
    expect(noteAccuracy(study(), 10).map(r => r.path)).toEqual(['A.md'])
  })
  it('measures change in points', () => {
    expect(change(0.8, 0.65)).toBe(15)
    expect(change(null, 0.5)).toBeNull()
  })
})
