// Numbers for the Study "Insights" tab: weekly summaries, trends and per-note accuracy.

import { addDays, startOfWeek, type ISODate } from './dates'
import type { Mistake } from './mistakes'
import type { StudyData } from './study'

export interface WeekSummary {
  start: ISODate
  reviews: number
  correct: number
  quizzes: number
  quizTotal: number
  quizCorrect: number
  focus: number
  newCards: number
  newMistakes: number
  resolved: number
  activeDays: number
}

const inWeek = (d: ISODate, start: ISODate) => d >= start && d <= addDays(start, 6)

export function weekSummary(study: StudyData, mistakes: Mistake[], weekStart: ISODate): WeekSummary {
  const out: WeekSummary = { start: weekStart, reviews: 0, correct: 0, quizzes: 0, quizTotal: 0, quizCorrect: 0, focus: 0, newCards: 0, newMistakes: 0, resolved: 0, activeDays: 0 }
  const active = new Set<ISODate>()
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    const l = study.log[d]
    if (l) {
      out.reviews += l.reviews
      out.correct += l.correct
      out.newCards += l.newCards
      if (l.reviews) active.add(d)
    }
    const f = study.focus[d] ?? 0
    out.focus += f
    if (f) active.add(d)
  }
  for (const q of study.quizzes) {
    if (!inWeek(q.date, weekStart)) continue
    out.quizzes++
    out.quizTotal += q.total
    out.quizCorrect += q.correct
    active.add(q.date)
  }
  for (const m of mistakes) {
    out.newMistakes += m.history.filter(d => inWeek(d, weekStart)).length
    if (m.resolved && inWeek(m.resolved, weekStart)) out.resolved++
  }
  out.activeDays = active.size
  return out
}

/** Share of answers (cards and quizzes together) that were right, or null with no answers. */
export function accuracy(s: Pick<WeekSummary, 'reviews' | 'correct' | 'quizTotal' | 'quizCorrect'>): number | null {
  const total = s.reviews + s.quizTotal
  return total ? (s.correct + s.quizCorrect) / total : null
}

export interface TrendPoint { start: ISODate; reviews: number; accuracy: number | null }

/** Recall accuracy for each of the last `weeks` weeks, oldest first. */
export function weeklyTrend(study: StudyData, today: ISODate, weeks: number): TrendPoint[] {
  const thisWeek = startOfWeek(today)
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, (i - weeks + 1) * 7)
    const s = weekSummary(study, [], start)
    return { start, reviews: s.reviews + s.quizTotal, accuracy: accuracy(s) }
  })
}

export interface NoteAccuracy { path: string; answered: number; correct: number; accuracy: number }

/** Accuracy per note from flashcard grades and quiz scores; notes with fewer than `min` answers are left out. */
export function noteAccuracy(study: StudyData, min = 5): NoteAccuracy[] {
  const map = new Map<string, { answered: number; correct: number }>()
  const add = (path: string, answered: number, correct: number) => {
    if (!path || path.startsWith('#')) return
    const row = map.get(path) ?? { answered: 0, correct: 0 }
    row.answered += answered
    row.correct += correct
    map.set(path, row)
  }
  for (const [path, v] of Object.entries(study.notes ?? {})) add(path, v.reviews, v.correct)
  for (const q of study.quizzes) add(q.path, q.total, q.correct)
  return [...map.entries()]
    .filter(([, v]) => v.answered >= min)
    .map(([path, v]) => ({ path, ...v, accuracy: v.correct / v.answered }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
}

/** "+12%" style change between two shares, or null when either is missing. */
export function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null
  return Math.round((now - before) * 100)
}
