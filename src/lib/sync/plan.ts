// Decides what a sync has to do. It only looks at fingerprints (git blob hashes), never at file contents, so it is
// cheap to run and easy to test.

export type Fingerprints = Map<string, string>

export type Action =
  | { kind: 'download'; path: string }
  | { kind: 'upload'; path: string }
  | { kind: 'delete-local'; path: string }
  | { kind: 'delete-remote'; path: string }
  /** Both sides changed it since the last sync, so the contents have to be combined. */
  | { kind: 'merge'; path: string }

export interface Plan {
  actions: Action[]
  /** Paths whose fingerprint is the same everywhere: nothing to do except remember it. */
  settled: Map<string, string>
}

/**
 * `base` is each file's fingerprint at the end of the last sync. A side that matches the base has not changed;
 * a side that differs has. Changes on one side are carried to the other, and a file changed on both sides is a merge.
 * Deleting on one side and not touching it on the other deletes it; editing on one side beats a delete on the other.
 */
export function planSync(base: Fingerprints, local: Fingerprints, remote: Fingerprints): Plan {
  const actions: Action[] = []
  const settled = new Map<string, string>()
  for (const path of new Set([...base.keys(), ...local.keys(), ...remote.keys()])) {
    const b = base.get(path), l = local.get(path), r = remote.get(path)
    if (l === r) { if (l !== undefined) settled.set(path, l); continue }
    if (l === undefined) {
      // gone here
      if (r === b) actions.push({ kind: 'delete-remote', path })
      else actions.push({ kind: 'download', path }) // new there, or changed there after we deleted it
    } else if (r === undefined) {
      // gone there
      if (l === b) actions.push({ kind: 'delete-local', path })
      else actions.push({ kind: 'upload', path })
    } else if (l === b) actions.push({ kind: 'download', path })
    else if (r === b) actions.push({ kind: 'upload', path })
    else actions.push({ kind: 'merge', path })
  }
  return { actions, settled }
}

/** Files that stay on this device: device-specific settings, caches and history. */
export function isSyncable(path: string): boolean {
  if (!path || path.endsWith('/')) return false
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  if (/\.broken-\d+$/.test(name)) return false
  if (parts[0] === '.omnia') {
    // Tasks, events, study data, the error log and PDF highlights follow you; everything else in here is local.
    if (parts.length === 2) return ['tasks.json', 'events.json', 'study.json', 'mistakes.json'].includes(name)
    return parts[1] === 'annotations'
  }
  // Hidden folders (.trash, .git, .obsidian …) are not part of the notes.
  if (parts.slice(0, -1).some(p => p.startsWith('.') || p === 'node_modules')) return false
  if (name.startsWith('.') || name === 'Thumbs.db') return false
  return true
}

export const MAX_SYNC_BYTES = 40 * 1024 * 1024

export const MERGEABLE_JSON = new Set(['.omnia/tasks.json', '.omnia/events.json', '.omnia/study.json', '.omnia/mistakes.json'])
export const isTextFile = (path: string) => /\.(md|markdown|txt)$/i.test(path)
