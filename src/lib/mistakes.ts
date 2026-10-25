// The error log: every quiz question answered wrongly and every flashcard graded "Again" is kept
// with enough of a snapshot to practise it later, even if the note has since changed.
// A mistake counts as resolved once it has been answered correctly twice in a row.

import { addDays, type ISODate } from './dates'
import type { QuizQuestion } from './quiz'

export const RESOLVE_AFTER = 2
const HISTORY_CAP = 24

export interface MistakeQuestion {
  kind: QuizQuestion['kind']
  prompt: string
  options: QuizQuestion['options']
  answers: string[]
  explanation?: string
}

export interface Mistake {
  /** Question id, or card id for flashcards. */
  id: string
  source: 'quiz' | 'card'
  path: string
  q: MistakeQuestion
  /** What the learner answered last time (quiz only). */
  given?: string
  count: number
  /** Correct answers in a row since the last miss. */
  streak: number
  first: ISODate
  last: ISODate
  /** Dates of recent misses, newest last. */
  history: ISODate[]
  resolved?: ISODate
  /** The learner's own note on why they got it wrong. */
  why?: string
}

export type MissInput = Pick<Mistake, 'id' | 'source' | 'path' | 'q'> & { given?: string }

export function snapshot(q: QuizQuestion): MistakeQuestion {
  return { kind: q.kind, prompt: q.prompt, options: q.options.map(o => ({ ...o })), answers: [...q.answers], explanation: q.explanation }
}

export function recordMiss(list: Mistake[], input: MissInput, date: ISODate): Mistake[] {
  const i = list.findIndex(m => m.id === input.id)
  if (i < 0) {
    const fresh: Mistake = { ...input, count: 1, streak: 0, first: date, last: date, history: [date] }
    return [...list, fresh]
  }
  const prev = list[i]
  const next: Mistake = {
    ...prev, ...input, why: prev.why, count: prev.count + 1, streak: 0, last: date, resolved: undefined,
    history: [...prev.history, date].slice(-HISTORY_CAP), first: prev.first
  }
  return list.map((m, k) => (k === i ? next : m))
}

export function recordHit(list: Mistake[], id: string, date: ISODate): Mistake[] {
  const i = list.findIndex(m => m.id === id && !m.resolved)
  if (i < 0) return list
  const prev = list[i]
  const streak = prev.streak + 1
  return list.map((m, k) => (k === i ? { ...prev, streak, resolved: streak >= RESOLVE_AFTER ? date : undefined } : m))
}

export const isActive = (m: Mistake) => !m.resolved

/** Most-missed first, then most recent. */
export function activeMistakes(list: Mistake[]): Mistake[] {
  return list.filter(isActive).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
}

export interface NoteMistakes { path: string; active: number; total: number; misses: number }

export function byNote(list: Mistake[]): NoteMistakes[] {
  const map = new Map<string, NoteMistakes>()
  for (const m of list) {
    const row = map.get(m.path) ?? { path: m.path, active: 0, total: 0, misses: 0 }
    row.total++
    row.misses += m.count
    if (!m.resolved) row.active++
    map.set(m.path, row)
  }
  return [...map.values()].sort((a, b) => b.active - a.active || b.misses - a.misses)
}

/** Number of misses on each of the `days` days ending today (oldest first). */
export function missesPerDay(list: Mistake[], today: ISODate, days: number): number[] {
  const counts = new Map<ISODate, number>()
  for (const m of list) for (const d of m.history) counts.set(d, (counts.get(d) ?? 0) + 1)
  return Array.from({ length: days }, (_, i) => counts.get(addDays(today, i - days + 1)) ?? 0)
}

export function remove(list: Mistake[], id: string): Mistake[] {
  return list.filter(m => m.id !== id)
}

export function clearResolved(list: Mistake[]): Mistake[] {
  return list.filter(isActive)
}

/** Rebuilds a question to practise from a stored snapshot. Card mistakes come back as self-graded recall. */
export function toQuestion(m: Mistake): QuizQuestion {
  return {
    id: m.id, kind: m.q.kind, prompt: m.q.prompt, options: m.q.options.map(o => ({ ...o })),
    answers: [...m.q.answers], explanation: m.q.explanation, cardId: m.source === 'card' ? m.id : undefined
  }
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

const answerText = (q: MistakeQuestion) => (q.kind === 'choice' ? q.options.filter(o => o.correct).map(o => o.text).join(' | ') : q.answers.join(' | '))

export function toCSV(list: Mistake[]): string {
  const rows = [['Question', 'Correct answer', 'Your last answer', 'Source', 'Note', 'Times missed', 'In a row correct', 'First missed', 'Last missed', 'Resolved', 'Why']]
  for (const m of list) {
    rows.push([m.q.prompt.replace(/\u0001|\u0002/g, ''), answerText(m.q), m.given ?? '', m.source === 'quiz' ? 'Quiz' : 'Flashcard', m.path, String(m.count), String(m.streak), m.first, m.last, m.resolved ?? '', m.why ?? ''])
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'
}

export { answerText }

/** Tolerant loader: drops anything that doesn't look like a mistake. */
export function normaliseMistakes(raw: unknown): Mistake[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((m): m is Mistake => !!m && typeof m.id === 'string' && typeof m.q?.prompt === 'string' && Array.isArray(m.q.options) && typeof m.count === 'number')
    .map(m => ({ ...m, history: Array.isArray(m.history) ? m.history : [m.last], streak: m.streak ?? 0 }))
}
