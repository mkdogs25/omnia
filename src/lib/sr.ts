// Spaced repetition: an SM-2 style scheduler with short learning steps, plus a gentler
// schedule for revising whole notes.

export type Grade = 0 | 1 | 2 | 3 // Again, Hard, Good, Easy
export const GRADE_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const

export interface CardState {
  stage: 'learning' | 'review'
  /** Index into LEARNING_STEPS while learning. */
  step: number
  /** Days. For a lapsed card this is the interval it returns to after relearning. */
  interval: number
  ease: number
  /** Epoch ms. Review cards use local midnight of the due day. */
  due: number
  reps: number
  lapses: number
  last: number
}

export const LEARNING_STEPS_MIN = [1, 10]
export const MIN_EASE = 1.3
export const START_EASE = 2.5
const MIN = 60_000
const DAY = 86_400_000

export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function addCalendarDays(ms: number, days: number): number {
  const d = new Date(startOfDay(ms))
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function newState(now: number): CardState {
  return { stage: 'learning', step: 0, interval: 0, ease: START_EASE, due: now, reps: 0, lapses: 0, last: 0 }
}

export function isDue(state: CardState | undefined, now: number): boolean {
  if (!state) return true
  return state.stage === 'review' ? state.due <= endOfDay(now) : state.due <= now
}

const clampEase = (e: number) => Math.min(3.0, Math.max(MIN_EASE, e))

function reviewIntervals(prev: number, ease: number) {
  const hard = Math.max(prev + 1, Math.round(prev * 1.2))
  const good = Math.max(hard + 1, Math.round(prev * ease))
  const easy = Math.max(good + 1, Math.round(prev * ease * 1.3))
  return { hard, good, easy }
}

/** Returns the new state after answering. Never mutates the input. */
export function schedule(prev: CardState | undefined, grade: Grade, now: number): CardState {
  const s: CardState = prev ? { ...prev } : newState(now)
  s.reps += 1
  s.last = now

  if (s.stage === 'learning') {
    const graduate = (days: number) => {
      s.stage = 'review'
      s.step = 0
      s.interval = days
      s.due = addCalendarDays(now, days)
    }
    const returning = s.interval > 0 // a lapsed card keeps its reduced interval
    if (grade === 0) {
      s.step = 0
      s.due = now + LEARNING_STEPS_MIN[0] * MIN
    } else if (grade === 1) {
      s.due = now + LEARNING_STEPS_MIN[s.step] * MIN
    } else if (grade === 2) {
      if (s.step + 1 < LEARNING_STEPS_MIN.length) {
        s.step += 1
        s.due = now + LEARNING_STEPS_MIN[s.step] * MIN
      } else graduate(returning ? s.interval : 1)
    } else {
      graduate(returning ? Math.max(s.interval + 1, Math.round(s.interval * 1.3)) : 4)
    }
    return s
  }

  // Review stage
  const { hard, good, easy } = reviewIntervals(s.interval, s.ease)
  if (grade === 0) {
    s.lapses += 1
    s.ease = clampEase(s.ease - 0.2)
    s.interval = Math.max(1, Math.round(s.interval * 0.25))
    s.stage = 'learning'
    s.step = 0
    s.due = now + LEARNING_STEPS_MIN[0] * MIN
  } else if (grade === 1) {
    s.ease = clampEase(s.ease - 0.15)
    s.interval = hard
    s.due = addCalendarDays(now, hard)
  } else if (grade === 2) {
    s.interval = good
    s.due = addCalendarDays(now, good)
  } else {
    s.ease = clampEase(s.ease + 0.15)
    s.interval = easy
    s.due = addCalendarDays(now, easy)
  }
  return s
}

export function formatInterval(ms: number): string {
  const mins = Math.round(ms / MIN)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const days = Math.round(ms / DAY)
  if (days < 1) return `${Math.round(mins / 60)}h`
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round((days / 30.4) * 10) / 10}mo`.replace('.0', '')
  return `${Math.round((days / 365) * 10) / 10}y`.replace('.0', '')
}

/** Labels for the four answer buttons. */
export function previewIntervals(state: CardState | undefined, now: number): string[] {
  return ([0, 1, 2, 3] as Grade[]).map(g => {
    const next = schedule(state, g, now)
    const wait = next.stage === 'review' ? startOfDay(next.due) - startOfDay(now) : next.due - now
    return formatInterval(wait)
  })
}

// ---------------------------------------------------------------------------
// Note revision: a lighter schedule for re-reading whole notes.

export const REVISION_STEPS_DAYS = [1, 3, 7, 14, 30, 60, 120]
export type Rating = 'weak' | 'ok' | 'strong'

export interface RevisionState {
  step: number
  due: string // ISO date
  last?: string
  history: { date: string; rating: Rating }[]
}

export function nextRevision(prev: RevisionState | undefined, rating: Rating, todayISO: string, addDays: (d: string, n: number) => string): RevisionState {
  const step = prev?.step ?? 0
  const nextStep = rating === 'weak' ? 0 : rating === 'ok' ? step : Math.min(step + 1, REVISION_STEPS_DAYS.length - 1)
  const days = REVISION_STEPS_DAYS[nextStep]
  return {
    step: nextStep,
    due: addDays(todayISO, days),
    last: todayISO,
    history: [...(prev?.history ?? []), { date: todayISO, rating }].slice(-50)
  }
}
