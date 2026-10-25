import type { Card } from './cards'
import { addDays, diffDays, type ISODate } from './dates'
import { endOfDay, isDue, type CardState, type RevisionState } from './sr'

export interface DayLog {
  reviews: number
  correct: number
  newCards: number
}

export interface QuizResult {
  date: ISODate
  path: string
  total: number
  correct: number
}

export interface StudyData {
  cards: Record<string, CardState>
  log: Record<ISODate, DayLog>
  revisions: Record<string, RevisionState>
  quizzes: QuizResult[]
  /** Minutes of completed Pomodoro focus sessions per day. */
  focus: Record<ISODate, number>
  /** Flashcard reviews and correct answers per note, for the accuracy breakdown. */
  notes: Record<string, { reviews: number; correct: number }>
}

export const emptyStudy = (): StudyData => ({ cards: {}, log: {}, revisions: {}, quizzes: [], focus: {}, notes: {} })

export type Scope =
  | { type: 'all' }
  | { type: 'note'; path: string }
  | { type: 'folder'; path: string }
  | { type: 'tag'; tag: string; paths: string[] }

export function inScope(card: Card, scope: Scope): boolean {
  switch (scope.type) {
    case 'all': return true
    case 'note': return card.path === scope.path
    case 'folder': return scope.path === '' || card.path.startsWith(scope.path + '/')
    case 'tag': return scope.paths.includes(card.path)
  }
}

export interface DueSplit {
  learning: Card[]
  review: Card[]
  fresh: Card[]
}

/** Splits cards into those being learned, due reviews, and never-seen cards. */
export function dueCards(cards: Card[], states: Record<string, CardState>, now: number): DueSplit {
  const split: DueSplit = { learning: [], review: [], fresh: [] }
  for (const c of cards) {
    const s = states[c.id]
    if (!s) split.fresh.push(c)
    else if (isDue(s, now)) (s.stage === 'learning' ? split.learning : split.review).push(c)
  }
  split.review.sort((a, b) => states[a.id].due - states[b.id].due)
  return split
}

/** Builds the session queue: learning first, then reviews, then a capped number of new cards. */
export function sessionQueue(split: DueSplit, newAllowance: number, shuffle: (c: Card[]) => Card[]): Card[] {
  return [...split.learning, ...shuffle(split.review), ...split.fresh.slice(0, Math.max(0, newAllowance))]
}

/** Reviews due on each of the next `days` days, with overdue ones counted against today. */
export function forecast(cards: Card[], states: Record<string, CardState>, today: ISODate, days: number): number[] {
  const out = new Array<number>(days).fill(0)
  const base = new Date(`${today}T12:00:00`).getTime()
  for (const c of cards) {
    const s = states[c.id]
    if (!s) continue
    const offset = Math.max(0, Math.floor((endOfDay(s.due) - endOfDay(base)) / 86_400_000))
    if (offset < days) out[offset]++
  }
  return out
}

export function streak(log: Record<ISODate, DayLog>, today: ISODate): number {
  let n = 0
  let d = log[today]?.reviews ? today : addDays(today, -1)
  while (log[d]?.reviews) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function retention(log: Record<ISODate, DayLog>, today: ISODate, days = 30): number | null {
  let reviews = 0, correct = 0
  for (const [date, l] of Object.entries(log)) {
    if (diffDays(date, today) <= days && diffDays(date, today) >= 0) {
      reviews += l.reviews
      correct += l.correct
    }
  }
  return reviews ? correct / reviews : null
}

export function matureCount(cards: Card[], states: Record<string, CardState>): { fresh: number; learning: number; young: number; mature: number } {
  const r = { fresh: 0, learning: 0, young: 0, mature: 0 }
  for (const c of cards) {
    const s = states[c.id]
    if (!s) r.fresh++
    else if (s.stage === 'learning') r.learning++
    else if (s.interval >= 21) r.mature++
    else r.young++
  }
  return r
}

export function dueRevisions(revisions: Record<string, RevisionState>, today: ISODate): string[] {
  return Object.entries(revisions).filter(([, r]) => r.due <= today).map(([p]) => p).sort()
}
