// Version history for notes. Snapshots are taken while you write (at most one every ten minutes), on request,
// and before anything is restored, and kept in .omnia/history so the notes folder itself stays clean.

import { hash } from './cards'

export interface Version {
  /** Milliseconds since the epoch. */
  t: number
  text: string
  /** Why it was kept: set for manual saves and for the copy taken just before a restore. */
  label?: string
}

export interface HistoryFile { v: 1; path: string; versions: Version[] }

export const SNAPSHOT_EVERY_MS = 10 * 60 * 1000
export const MAX_VERSIONS = 40
export const HISTORY_DIR = '.omnia/history'

export const historyFileName = (path: string) => `${hash(path)}.json`

/** True when enough time has passed since the last snapshot and the text differs from it. */
export function shouldSnapshot(last: Version | undefined, text: string, now: number): boolean {
  if (!text.trim()) return false
  if (!last) return true
  if (last.text === text) return false
  return now - last.t >= SNAPSHOT_EVERY_MS
}

/** Adds a version, dropping the oldest unlabelled ones first when over the limit. */
export function addVersion(versions: Version[], v: Version, max = MAX_VERSIONS): Version[] {
  const next = [...versions, v].sort((a, b) => a.t - b.t)
  while (next.length > max) {
    const i = next.findIndex(x => !x.label)
    next.splice(i >= 0 ? i : 0, 1)
  }
  return next
}

export function normaliseHistory(raw: unknown, path: string): HistoryFile {
  const r = raw as Partial<HistoryFile> | null
  const versions = Array.isArray(r?.versions) ? r!.versions.filter(v => v && typeof v.t === 'number' && typeof v.text === 'string') : []
  return { v: 1, path, versions }
}

export function describeAge(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
