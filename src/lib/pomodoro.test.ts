import { describe, expect, it } from 'vitest'
import { DEFAULT_POMO, durationMs, formatClock, nextMode } from './pomodoro'

describe('pomodoro', () => {
  it('formats the clock', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(61_000)).toBe('01:01')
    expect(formatClock(500)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
  it('gives a long break after every fourth focus session', () => {
    expect(nextMode('focus', 1, 4)).toBe('short')
    expect(nextMode('focus', 3, 4)).toBe('short')
    expect(nextMode('focus', 4, 4)).toBe('long')
    expect(nextMode('focus', 8, 4)).toBe('long')
    expect(nextMode('short', 1, 4)).toBe('focus')
    expect(nextMode('long', 4, 4)).toBe('focus')
  })
  it('reads durations from settings and never returns zero', () => {
    expect(durationMs('focus', DEFAULT_POMO)).toBe(25 * 60_000)
    expect(durationMs('short', { ...DEFAULT_POMO, shortMin: 0 })).toBe(60_000)
  })
})
