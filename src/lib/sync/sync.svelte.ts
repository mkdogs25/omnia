// The sync controller: remembers the connection, runs syncs (now, on a timer, when the app is opened or refocused, and a
// little after you stop making changes) and tells the rest of the app what happened.

import { app } from '../app.svelte'
import { isNativeApp } from '../platform'
import { runSync, emptyState, type LocalIO, type SyncReport, type SyncState } from './engine'
import { GitHubRemote, SyncAuthError, type GitHubConfig } from './github'

export interface SyncConfig extends GitHubConfig {
  /** Name shown on conflict copies, so you can tell which device made them. */
  device: string
  auto: boolean
  intervalMin: number
}

const KEY = 'omnia:sync'
const STATE_FILE = 'sync.json'


const defaultDevice = () => (isNativeApp() ? 'Phone' : /Android|iPhone/i.test(navigator.userAgent) ? 'Phone browser' : 'Computer')

function readConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<SyncConfig>
    if (!c.repo || !c.token) return null
    return { repo: c.repo, token: c.token, branch: c.branch || 'main', subdir: c.subdir ?? '', device: c.device || defaultDevice(), auto: c.auto !== false, intervalMin: c.intervalMin || 10 }
  } catch { return null }
}

const skipDir = (p: string) => {
  const parts = p.split('/')
  if (parts[0].startsWith('.') && parts[0] !== '.omnia') return true
  if (parts.includes('node_modules')) return true
  return p === '.omnia/history' || p === '.omnia/ocr'
}

class SyncController {
  config = $state<SyncConfig | null>(null)
  status = $state<'off' | 'idle' | 'syncing' | 'error' | 'offline'>('off')
  message = $state('')
  error = $state('')
  last = $state<string | null>(null)
  report = $state<SyncReport | null>(null)

  private timer: ReturnType<typeof setInterval> | undefined
  private soon: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private started = false
  private lastAttempt = 0
  /** True while a sync (and the saving it does first) is under way, so its own writes don't schedule another sync. */
  private quiet = false

  get configured() { return !!this.config }

  load() {
    this.config = readConfig()
    this.status = this.config ? 'idle' : 'off'
  }

  save(config: SyncConfig) {
    this.config = config
    try { localStorage.setItem(KEY, JSON.stringify(config)) } catch { /* storage unavailable */ }
    if (this.status === 'off' || this.status === 'error') this.status = 'idle'
    this.error = ''
    this.restartTimers()
  }

  async disconnect() {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    this.config = null
    this.status = 'off'
    this.report = null
    this.last = null
    this.stopTimers()
    // Forget what was agreed, so connecting again starts from a clean comparison.
    try { await app.vault?.remove(`.omnia/${STATE_FILE}`) } catch { /* nothing saved */ }
  }

  /** Checks the token and repository without syncing. */
  async test(config: SyncConfig): Promise<{ ok: boolean; text: string }> {
    try {
      const info = await new GitHubRemote(config).check()
      if (!info.canPush) return { ok: false, text: 'Connected, but this token can only read the repository. It needs write access to “Contents”.' }
      return { ok: true, text: info.private ? 'Connected. The repository is private.' : 'Connected, but this repository is public: anyone could read your notes. Make it private on GitHub first.' }
    } catch (e) {
      return { ok: false, text: (e as Error).message }
    }
  }

  // ------------------------------------------------------------ running

  private io(): LocalIO {
    const v = app.vault!
    return {
      list: () => v.listAll(skipDir),
      read: p => v.readBytes(p),
      write: (p, d) => v.writeBytes(p, d),
      remove: p => v.remove(p)
    }
  }

  /** Syncs now. Calls made while a sync is running join it rather than starting another. */
  run(reason: 'manual' | 'auto' = 'manual'): Promise<void> {
    if (this.running) return this.running
    this.running = this.doRun(reason).finally(() => { this.running = null })
    return this.running
  }

  private async doRun(reason: 'manual' | 'auto') {
    const config = this.config
    const vault = app.vault
    if (!config || !vault) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.status = 'offline'
      this.message = 'Offline. Will sync when you are back online.'
      return
    }
    this.lastAttempt = Date.now()
    this.status = 'syncing'
    this.message = 'Starting'
    this.error = ''
    // Let pending edits reach the disk first, and hold further data writes until the sync is done.
    let release: () => void = () => {}
    this.quiet = true
    try {
      await app.editor?.flush()
      await app.flush()
      app.syncGate = new Promise<void>(r => { release = r })

      let state: SyncState = emptyState()
      try { state = { ...emptyState(), ...(await vault.readJSON<Partial<SyncState>>(STATE_FILE, {})) } } catch { /* first sync */ }
      const remote = new GitHubRemote(config)
      const { state: next, report } = await runSync(this.io(), remote, state, { device: config.device, onProgress: t => (this.message = t) })
      try { await vault.writeJSON(STATE_FILE, next) } catch { /* read-only: the next sync repeats some work */ }

      this.report = report
      this.last = next.last ?? new Date().toISOString()
      this.status = 'idle'
      this.message = ''
      release()
      app.syncGate = null
      if (report.changedLocal) await app.reloadAfterSync([...report.downloaded, ...report.merged, ...report.conflicts.map(c => c.original)])
      if (report.conflicts.length) {
        app.toast(`Sync kept both versions of ${report.conflicts.length} note${report.conflicts.length === 1 ? '' : 's'}`, {
          label: 'Review', run: () => { app.openSettings('conflict') }
        })
      }
    } catch (e) {
      this.status = 'error'
      this.message = ''
      this.error = (e as Error).message ?? String(e)
      if (e instanceof SyncAuthError) this.stopTimers()
      if (reason === 'manual') app.toast(`Sync failed: ${this.error}`)
    } finally {
      release()
      app.syncGate = null
      // Writes queued behind the gate finish just after it opens.
      setTimeout(() => { this.quiet = false }, 1500)
    }
  }

  // ------------------------------------------------------------ scheduling

  /** Starts syncing in the background if it is set up. Call once the vault is open. */
  start() {
    if (this.started) return
    this.started = true
    this.load()
    this.restartTimers()
    if (this.config?.auto) setTimeout(() => void this.run('auto'), 1500)
    window.addEventListener('focus', this.onFocus)
    window.addEventListener('online', this.onFocus)
    document.addEventListener('visibilitychange', this.onFocus)
    app.onLocalChange = () => this.changed()
  }

  stop() {
    this.started = false
    this.stopTimers()
    window.removeEventListener('focus', this.onFocus)
    window.removeEventListener('online', this.onFocus)
    document.removeEventListener('visibilitychange', this.onFocus)
    app.onLocalChange = null
  }

  private onFocus = () => {
    if (document.visibilityState !== 'visible' || !this.config?.auto || this.status === 'syncing') return
    if (Date.now() - this.lastAttempt > 2 * 60_000 && this.status !== 'error') void this.run('auto')
  }

  private restartTimers() {
    this.stopTimers()
    const c = this.config
    if (!c?.auto) return
    this.timer = setInterval(() => { if (document.visibilityState === 'visible' && this.status !== 'error') void this.run('auto') }, Math.max(2, c.intervalMin) * 60_000)
  }

  private stopTimers() {
    clearInterval(this.timer)
    clearTimeout(this.soon)
  }

  /** Something was saved: sync a minute after the last change, so a burst of typing is one sync. */
  private changed() {
    if (this.quiet || !this.config?.auto || this.status === 'syncing' || this.status === 'error') return
    clearTimeout(this.soon)
    this.soon = setTimeout(() => void this.run('auto'), 60_000)
  }
}

export const sync = new SyncController()
