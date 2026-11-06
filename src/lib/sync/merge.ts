// Three-way merging for synced files. "Base" is what both devices last agreed on, "local" is this device and
// "remote" is the other one. A change made on only one side always wins; the rules below decide what happens
// when both sides changed the same thing.

import { diffLines } from '../diff'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export interface JsonMergeOptions {
  /** Numbers at these key paths are counters: both sides' changes are added to the base ("log.2026-11-06.reviews"). */
  sumNumbers?: (path: string[]) => boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const hasIds = (a: unknown[]) => a.length > 0 && a.every(x => isObj(x) && typeof x.id === 'string')

/**
 * Merges two edited copies of a JSON value.
 *  - Objects merge key by key.
 *  - Arrays of objects with an `id` merge item by item (an item deleted on one side and untouched on the other is deleted).
 *  - Other arrays are treated as sets of entries and combined.
 *  - When both sides changed the same plain value, this device's (local) value wins; counters add up.
 */
export function mergeJson(base: unknown, local: unknown, remote: unknown, opts: JsonMergeOptions = {}, path: string[] = []): unknown {
  if (same(local, remote)) return local
  if (same(base, local)) return remote
  if (same(base, remote)) return local

  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : []
    if ((hasIds(local) || !local.length) && (hasIds(remote) || !remote.length) && (hasIds(b) || !b.length)) return mergeById(b as Rec[], local as Rec[], remote as Rec[], opts, path)
    // Entries without ids (such as quiz results): keep everything either side has, once.
    const seen = new Set<string>()
    const out: unknown[] = []
    for (const item of [...local, ...remote]) {
      const k = JSON.stringify(item)
      if (!seen.has(k)) { seen.add(k); out.push(item) }
    }
    // An entry both sides had and one removed stays removed.
    const removedByRemote = b.filter(x => !remote.some(r => same(r, x))).map(x => JSON.stringify(x))
    const removedByLocal = b.filter(x => !local.some(l => same(l, x))).map(x => JSON.stringify(x))
    return out.filter(x => { const k = JSON.stringify(x); return !removedByRemote.includes(k) && !removedByLocal.includes(k) })
  }

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {}
    const out: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(b)])) {
      const inL = key in local, inR = key in remote, inB = key in b
      if (inL && inR) out[key] = mergeJson(b[key], local[key], remote[key], opts, [...path, key])
      else if (inL) { if (!inB || !same(b[key], local[key])) out[key] = local[key] } // added or changed here; if untouched here and gone there, it was deleted there
      else if (inR) { if (!inB || !same(b[key], remote[key])) out[key] = remote[key] }
    }
    return out
  }

  if (typeof local === 'number' && typeof remote === 'number' && typeof base === 'number' && opts.sumNumbers?.(path)) return base + (local - base) + (remote - base)
  return local
}

type Rec = Record<string, unknown> & { id: string }

function mergeById(base: Rec[], local: Rec[], remote: Rec[], opts: JsonMergeOptions, path: string[]): Rec[] {
  const bMap = new Map(base.map(x => [x.id, x]))
  const lMap = new Map(local.map(x => [x.id, x]))
  const rMap = new Map(remote.map(x => [x.id, x]))
  const out: Rec[] = []
  const done = new Set<string>()
  // Keep this device's order, then add what only the other device has.
  for (const id of [...local.map(x => x.id), ...remote.map(x => x.id)]) {
    if (done.has(id)) continue
    done.add(id)
    const b = bMap.get(id), l = lMap.get(id), r = rMap.get(id)
    if (l && r) out.push(mergeJson(b, l, r, opts, [...path, id]) as Rec)
    else if (l) { if (!b || !same(b, l)) out.push(l) }       // deleted remotely and untouched here -> stays deleted
    else if (r) { if (!b || !same(b, r)) out.push(r) }
  }
  return out
}

/** The rules for the files Omnia keeps in `.omnia`. */
export function mergeDataFile(name: string, base: unknown, local: unknown, remote: unknown): unknown {
  if (name === 'study.json') {
    return mergeJson(base, local, remote, {
      sumNumbers: p => (p[0] === 'log' || p[0] === 'focus' || p[0] === 'notes') && p.length >= 2
    })
  }
  return mergeJson(base, local, remote)
}

// ---------------------------------------------------------------------------
// Text

interface Hunk { start: number; end: number; lines: string[] }

/** The edits that turn `base` into `edited`, as replacements of line ranges in `base`. */
function hunks(base: string[], edited: string[]): Hunk[] {
  const d = diffLines(base.join('\n'), edited.join('\n'))
  const out: Hunk[] = []
  let at = 0
  let cur: Hunk | null = null
  for (const line of d) {
    if (line.type === 'same') { if (cur) { out.push(cur); cur = null } at++; continue }
    if (!cur) cur = { start: at, end: at, lines: [] }
    if (line.type === 'del') { cur.end++; at++ } else cur.lines.push(line.text)
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Merges two edits of the same text. Returns null when they touch the same lines (or lines right next to each other),
 * leaving it to the caller to keep both versions.
 */
export function mergeText(base: string, local: string, remote: string): string | null {
  if (local === remote) return local
  if (local === base) return remote
  if (remote === base) return local
  const b = base.split('\n')
  const lh = hunks(b, local.split('\n'))
  const rh = hunks(b, remote.split('\n'))
  for (const x of lh) for (const y of rh) {
    // Touching counts as overlapping, and two inserts at the same spot are ambiguous.
    if (x.start <= y.end && y.start <= x.end) return null
  }
  const all = [...lh, ...rh].sort((p, q) => p.start - q.start)
  const out: string[] = []
  let pos = 0
  for (const h of all) {
    out.push(...b.slice(pos, h.start), ...h.lines)
    pos = h.end
  }
  out.push(...b.slice(pos))
  return out.join('\n')
}
