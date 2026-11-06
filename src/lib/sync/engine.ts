// One sync: compare this device with the remote, carry changes both ways, merge what both sides changed, and record
// what was agreed so the next sync knows what has changed since.

import { gitBlobSha, RemoteMovedError, type Change, type Remote } from './github'
import { mergeDataFile, mergeText } from './merge'
import { isSyncable, isTextFile, MAX_SYNC_BYTES, MERGEABLE_JSON, planSync, type Fingerprints } from './plan'

export interface LocalIO {
  list(): Promise<{ path: string; size: number; mtime: number }[]>
  read(path: string): Promise<Uint8Array>
  write(path: string, data: Uint8Array): Promise<void>
  remove(path: string): Promise<void>
}

export interface SyncState {
  v: 1
  /** Fingerprint of every file as of the last sync. */
  base: Record<string, string>
  /** Cache so unchanged files are not read again: size and modification time to fingerprint. */
  stat: Record<string, { size: number; mtime: number; sha: string }>
  /** Contents of the JSON data files as of the last sync, for merging. */
  bases: Record<string, string>
  last?: string
}

export const emptyState = (): SyncState => ({ v: 1, base: {}, stat: {}, bases: {} })

export interface SyncReport {
  downloaded: string[]
  uploaded: string[]
  deletedHere: string[]
  deletedThere: string[]
  merged: string[]
  /** Copies kept because both sides changed a file in ways that could not be combined. */
  conflicts: { original: string; copy: string }[]
  skipped: string[]
  /** True when files on this device were changed, so the app should reload them. */
  changedLocal: boolean
}

export interface SyncOptions {
  device: string
  now?: Date
  onProgress?: (text: string) => void
}

const enc = new TextEncoder()
const dec = new TextDecoder()

const pad = (n: number) => String(n).padStart(2, '0')
function conflictName(path: string, device: string, at: Date): string {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  const hasExt = dot > slash + 1
  const stem = hasExt ? path.slice(0, dot) : path
  const ext = hasExt ? path.slice(dot) : ''
  const when = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}-${pad(at.getMinutes())}`
  return `${stem} (conflict from ${device.replace(/[\\/:*?"<>|]/g, '-')} ${when})${ext}`
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const item = items[i++]
      if (item === undefined) return
      await fn(item)
    }
  }))
}

export async function runSync(io: LocalIO, remote: Remote, state: SyncState, opts: SyncOptions): Promise<{ state: SyncState; report: SyncReport }> {
  try {
    return await attempt(io, remote, state, opts)
  } catch (e) {
    // Someone else committed while we were working: start again from the new state, once.
    if (e instanceof RemoteMovedError) return attempt(io, remote, state, opts)
    throw e
  }
}

async function attempt(io: LocalIO, remote: Remote, prior: SyncState, opts: SyncOptions): Promise<{ state: SyncState; report: SyncReport }> {
  const now = opts.now ?? new Date()
  const say = opts.onProgress ?? (() => {})
  const state: SyncState = structuredClone(prior)
  const report: SyncReport = { downloaded: [], uploaded: [], deletedHere: [], deletedThere: [], merged: [], conflicts: [], skipped: [], changedLocal: false }

  say('Reading the repository')
  const remoteFiles = await remote.list()
  const remoteFp: Fingerprints = new Map()
  for (const [path, f] of remoteFiles) {
    if (!isSyncable(path)) continue
    if (f.size > MAX_SYNC_BYTES) { report.skipped.push(path); continue }
    remoteFp.set(path, f.sha)
  }

  say('Checking your files')
  const localList = (await io.list()).filter(f => isSyncable(f.path))
  const localFp: Fingerprints = new Map()
  const newStat: SyncState['stat'] = {}
  await pool(localList, 8, async f => {
    if (f.size > MAX_SYNC_BYTES) { report.skipped.push(f.path); return }
    const cached = state.stat[f.path]
    let sha: string
    if (cached && cached.size === f.size && cached.mtime === f.mtime) sha = cached.sha
    else sha = await gitBlobSha(await io.read(f.path))
    localFp.set(f.path, sha)
    newStat[f.path] = { size: f.size, mtime: f.mtime, sha }
  })

  const plan = planSync(new Map(Object.entries(state.base)), localFp, remoteFp)
  const agreed = new Map(plan.settled)
  const changes: Change[] = []
  const jsonBases: Record<string, string> = {}
  const touched = new Map<string, string>() // path -> fingerprint now on this device, for the stat cache

  // Unchanged JSON data files still need their text remembered as the next merge base.
  const rememberJson = (path: string, data: Uint8Array) => { if (MERGEABLE_JSON.has(path)) jsonBases[path] = dec.decode(data) }

  say(`Syncing ${plan.actions.length} change${plan.actions.length === 1 ? '' : 's'}`)
  await pool(plan.actions, 4, async action => {
    const { path } = action
    switch (action.kind) {
      case 'download': {
        const sha = remoteFp.get(path)!
        const data = await remote.blob(sha)
        await io.write(path, data)
        agreed.set(path, sha); touched.set(path, sha)
        rememberJson(path, data)
        report.downloaded.push(path); report.changedLocal = true
        break
      }
      case 'upload': {
        const data = await io.read(path)
        changes.push({ path, data })
        agreed.set(path, localFp.get(path)!)
        rememberJson(path, data)
        report.uploaded.push(path)
        break
      }
      case 'delete-local':
        await io.remove(path)
        report.deletedHere.push(path); report.changedLocal = true
        break
      case 'delete-remote':
        changes.push({ path, data: null })
        report.deletedThere.push(path)
        break
      case 'merge': {
        const localData = await io.read(path)
        const remoteData = await remote.blob(remoteFp.get(path)!)
        let merged: Uint8Array | null = null

        if (MERGEABLE_JSON.has(path)) {
          try {
            const baseText = state.bases[path]
            const out = mergeDataFile(path.split('/').pop()!, baseText ? JSON.parse(baseText) : undefined, JSON.parse(dec.decode(localData)), JSON.parse(dec.decode(remoteData)))
            merged = enc.encode(JSON.stringify(out, null, 2))
          } catch { merged = null }
        } else if (isTextFile(path)) {
          const baseSha = state.base[path]
          if (baseSha) {
            try {
              const out = mergeText(dec.decode(await remote.blob(baseSha)), dec.decode(localData), dec.decode(remoteData))
              if (out !== null) merged = enc.encode(out)
            } catch { merged = null }
          }
        }

        if (merged) {
          await io.write(path, merged)
          changes.push({ path, data: merged })
          const sha = await gitBlobSha(merged)
          agreed.set(path, sha); touched.set(path, sha)
          rememberJson(path, merged)
          report.merged.push(path); report.changedLocal = true
        } else {
          // Keep both: the other device's version takes the name, ours is kept beside it.
          const copy = conflictName(path, opts.device, now)
          await io.write(copy, localData)
          await io.write(path, remoteData)
          changes.push({ path: copy, data: localData })
          const copySha = await gitBlobSha(localData)
          agreed.set(path, remoteFp.get(path)!); agreed.set(copy, copySha)
          touched.set(path, remoteFp.get(path)!); touched.set(copy, copySha)
          rememberJson(path, remoteData)
          report.conflicts.push({ original: path, copy }); report.changedLocal = true
        }
        break
      }
    }
  })

  // Settled JSON files: remember their text, too.
  for (const path of MERGEABLE_JSON) {
    if (jsonBases[path] === undefined && agreed.has(path) && localFp.has(path)) {
      try { jsonBases[path] = dec.decode(await io.read(path)) } catch { /* ignore */ }
    }
  }

  if (changes.length) {
    say('Uploading')
    const n = changes.length
    await remote.commit(changes, `Sync from ${opts.device}: ${n} file${n === 1 ? '' : 's'}`)
  }

  // Refresh the fingerprint cache for everything that changed on this device.
  const after = report.changedLocal ? await io.list() : []
  const stat: SyncState['stat'] = { ...newStat }
  for (const f of after) if (touched.has(f.path)) stat[f.path] = { size: f.size, mtime: f.mtime, sha: touched.get(f.path)! }
  for (const path of Object.keys(stat)) if (!agreed.has(path) && !localFp.has(path)) delete stat[path]
  for (const path of report.deletedHere) delete stat[path]

  return {
    state: { v: 1, base: Object.fromEntries(agreed), stat, bases: { ...state.bases, ...jsonBases }, last: now.toISOString() },
    report
  }
}
