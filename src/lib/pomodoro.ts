// Pure helpers for the Pomodoro timer; the reactive timer itself is in pomodoro.svelte.ts.

export type PomoMode = 'focus' | 'short' | 'long'

export interface PomoSettings {
  focusMin: number
  shortMin: number
  longMin: number
  /** A long break follows every Nth focus session. */
  longEvery: number
}

export const DEFAULT_POMO: PomoSettings = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 }

export const MODE_LABEL: Record<PomoMode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

export function durationMs(mode: PomoMode, s: PomoSettings): number {
  const min = mode === 'focus' ? s.focusMin : mode === 'short' ? s.shortMin : s.longMin
  return Math.max(1, min) * 60_000
}

/**
 * What comes after `mode` finishes. `focusDone` counts completed focus sessions including
 * the one that just ended (when mode is focus).
 */
export function nextMode(mode: PomoMode, focusDone: number, longEvery: number): PomoMode {
  if (mode !== 'focus') return 'focus'
  return focusDone > 0 && focusDone % Math.max(1, longEvery) === 0 ? 'long' : 'short'
}

/** "24:05" (or "1:02:03" past an hour). Rounds up so the display hits 0:00 only when done. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
