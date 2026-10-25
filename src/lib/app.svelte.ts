import { addVersion, HISTORY_DIR, historyFileName, normaliseHistory, shouldSnapshot, type HistoryFile, type Version } from './history'
import { normaliseMistakes, recordHit, recordMiss, type Mistake, type MissInput } from './mistakes'
import { untrack } from 'svelte'
import { addDays, today, type ISODate } from './dates'
import {
  basename, companionPath, dirname, ensurePermission, forgetHandle, fsSupported, isDoc, isNote, joinPath, loadHandle, noteTitle,
  pickFolder, saveHandle, Vault, type FileEntry, type FolderEntry
} from './vault'
import { NoteIndex, renameLinkTarget } from './noteindex'
import { uid, toggle as toggleTaskPure, type CalEvent, type Task } from './tasks'
import {
  dueCards, emptyStudy, inScope, sessionQueue, type QuizResult, type Scope, type StudyData
} from './study'
import { nextRevision, schedule, type Grade, type Rating } from './sr'
import { shuffle, type QuizQuestion } from './quiz'
import { DEFAULT_SETTINGS, normaliseSettings, type Settings } from './settings'
import type { Card } from './cards'

export type View = 'home' | 'notes' | 'tasks' | 'calendar' | 'study' | 'settings'
export type SidebarTab = 'files' | 'search' | 'bookmarks'
export type RightTab = 'info' | 'cards' | 'quiz' | 'revise'
export type Theme = 'light' | 'dark' | 'auto'

export type { Settings } from './settings'

export interface Tab { id: string; path: string }

export type Modal =
  | { type: 'switcher' }
  | { type: 'palette' }
  | { type: 'help' }
  | { type: 'capture' }
  | { type: 'graph' }
  | { type: 'review'; scope: Scope }
  | { type: 'quiz'; scope: Scope; auto?: boolean; preset?: QuizQuestion[]; title?: string }
  | { type: 'autogen'; path: string }
  | { type: 'template' }
  | { type: 'history'; path: string }
  | { type: 'trash' }

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

/** Hooks the editor registers so panels can read and change the open note. */
export interface EditorApi {
  getText(): string
  getSelection(): string
  replaceSelection(text: string): void
  appendText(text: string): void
  /** Writes any unsaved edits to disk now. */
  flush(): Promise<void>
  replaceAll(text: string): void
  scrollToLine(line: number): void
  focus(): void
}

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

class AppState {
  status = $state<'loading' | 'unsupported' | 'welcome' | 'needs-permission' | 'ready'>('loading')
  error = $state('')
  vault = $state.raw<Vault | null>(null)
  tree = $state.raw<FolderEntry | null>(null)
  indexing = $state<{ done: number; total: number } | null>(null)
  /** Bumped whenever the note index changes so derived values can re-run. */
  indexVersion = $state(0)
  readonly index = new NoteIndex()

  // Navigation
  view = $state<View>('notes')
  sidebarTab = $state<SidebarTab>('files')
  leftOpen = $state(true)
  rightOpen = $state(false)
  rightTab = $state<RightTab>('info')
  tabs = $state<Tab[]>([])
  activeTabId = $state<string | null>(null)
  private history: string[] = []
  private historyPos = -1
  historyVersion = $state(0)
  readingMode = $state(false)
  modal = $state<Modal | null>(null)
  pomodoroOpen = $state(false)
  /** Hides every panel so only the note is on screen. */
  focusMode = $state(false)
  /** Pre-fills the settings search box (e.g. when opened from the notification centre). */
  settingsQuery = $state('')
  toasts = $state<Toast[]>([])
  searchQuery = $state('')
  expanded = $state<Record<string, boolean>>({})

  // Persisted data
  settings = $state<Settings>(normaliseSettings(undefined))
  tasks = $state<Task[]>([])
  events = $state<CalEvent[]>([])
  study = $state<StudyData>(emptyStudy())
  mistakes = $state<Mistake[]>([])
  studyTab = $state<'overview' | 'errors' | 'insights'>('overview')
  theme = $state<Theme>('auto')

  // Editor bridge
  editor: EditorApi | null = null
  /** Set when a note changed on disk while the editor had no unsaved edits. */
  externalChange = $state<{ path: string; text: string; n: number } | null>(null)
  conflict = $state<string | null>(null)
  /** A heading to scroll to once the note it belongs to has opened. */
  pendingHeading = $state<{ path: string; heading: string } | null>(null)
  pendingLine = $state<{ path: string; line: number } | null>(null)
  /** A page to jump to once the PDF it belongs to has opened. */
  pendingPage = $state<{ path: string; page: number } | null>(null)
  /** The note the editor currently has open (it may be a document's companion note). */
  editorPath = $state<string | null>(null)
  dirty = new Set<string>()
  /** Cursor and scroll position per note, so leaving the Notes view and coming back lands you in the same place. */
  noteView: Record<string, { anchor: number; scroll: number }> = {}
  /** Notes with a write in flight; the folder rescan must not mistake our own save for an outside edit. */
  private inFlight = new Set<string>()
  private saveChain = new Map<string, Promise<void>>()

  private toastId = 0
  private refreshing = false
  private rebuildSoon = debounce(() => this.bump(), 250)
  private persistSoon = {
    tasks: debounce(() => this.write('tasks.json', this.tasks), 300),
    events: debounce(() => this.write('events.json', this.events), 300),
    study: debounce(() => this.write('study.json', this.study), 500),
    mistakes: debounce(() => this.write('mistakes.json', this.mistakes), 500),
    settings: debounce(() => this.write('settings.json', this.settings), 300)
  }

  constructor() {
    try {
      const t = localStorage.getItem('omnia:theme')
      if (t === 'light' || t === 'dark' || t === 'auto') this.theme = t
    } catch { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- vault lifecycle

  async boot() {
    if (!fsSupported()) {
      this.status = 'unsupported'
      return
    }
    const handle = await loadHandle()
    if (!handle) {
      this.status = 'welcome'
      return
    }
    if (await ensurePermission(handle, false)) await this.openVault(handle)
    else {
      this.vault = new Vault(handle)
      this.status = 'needs-permission'
    }
  }

  async chooseFolder() {
    try {
      const handle = await pickFolder()
      await saveHandle(handle)
      await this.openVault(handle)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') this.error = String((e as Error).message ?? e)
    }
  }

  async resumeVault() {
    const handle = this.vault?.root
    if (handle && (await ensurePermission(handle, true))) await this.openVault(handle)
  }

  async closeVault() {
    await forgetHandle()
    this.vault = null
    this.tree = null
    this.tabs = []
    this.activeTabId = null
    this.index.notes.clear()
    this.index.rebuild()
    this.bump()
    this.status = 'welcome'
  }

  async openVault(handle: FileSystemDirectoryHandle) {
    this.error = ''
    const vault = new Vault(handle)
    this.vault = vault
    this.status = 'ready'
    try {
      await vault.mkdir('.omnia')
    } catch { /* read-only folder: data won't persist */ }
    const [settings, tasks, events, study, mistakes] = await Promise.all([
      vault.readJSON<Partial<Settings>>('settings.json', {}, () => this.toast('settings.json was unreadable; a copy was kept in .omnia')),
      vault.readJSON<Task[]>('tasks.json', [], () => this.toast('tasks.json was unreadable; a copy was kept in .omnia')),
      vault.readJSON<CalEvent[]>('events.json', [], () => this.toast('events.json was unreadable; a copy was kept in .omnia')),
      vault.readJSON<StudyData>('study.json', emptyStudy(), () => this.toast('study.json was unreadable; a copy was kept in .omnia')),
      vault.readJSON<unknown>('mistakes.json', [], () => this.toast('mistakes.json was unreadable; a copy was kept in .omnia'))
    ])
    this.settings = normaliseSettings(settings)
    this.tasks = tasks
    this.events = events
    this.study = { ...emptyStudy(), ...study }
    this.mistakes = normaliseMistakes(mistakes)
    await this.refresh(true)
    if (!this.index.notes.size) await this.createWelcomeNote()
    this.restoreSession()
    this.view = this.settings.startView
    if (!this.tabs.length) {
      const latest = [...this.index.notes.values()].sort((a, b) => b.mtime - a.mtime)[0]
      if (latest) this.openNote(latest.path)
    }
  }

  private async createWelcomeNote() {
    const text = `Omnia keeps everything in this folder as plain Markdown, so your notes stay yours.

## Writing

- Link notes with [[double square brackets]]; a link to a note that doesn't exist yet creates it when you click it.
- Use #tags, **bold**, *italic*, ==highlights==, and maths like $E = mc^2$.
- Tick things off: press Ctrl+Enter on a line to turn it into a checkbox.
- [ ] Try the checkbox above

## Study

Flashcards live in your notes. Open the study sidebar (the panel icon, top right) to review, quiz yourself, and schedule revision.

Unit of force :: newton
Unit of power ::: watt

The {{c1::mitochondria}} is the powerhouse of the cell.

What is the capital of France?
?
Paris

\`\`\`quiz
Which of these is a vector quantity?
- Speed
+ Velocity
- Mass
> Velocity has a direction as well as a size.
\`\`\`

## Elsewhere

Tasks, the calendar and the study dashboard are in the left-hand ribbon. Press Ctrl+P for every command.
`
    await this.createNote('', 'Welcome to Omnia', false, text)
  }

  /** Rescans the folder and re-reads anything that changed. */
  async refresh(initial = false) {
    const vault = this.vault
    if (!vault || this.refreshing) return
    this.refreshing = true
    try {
      const { tree, notes, docs } = await vault.scan()
      this.tree = tree
      const docPaths = new Set(docs.map(d => d.path))
      const docsChanged = docPaths.size !== this.index.docs.size || [...docPaths].some(p => !this.index.docs.has(p))
      this.index.docs = docPaths
      const seen = new Set([...notes.map(n => n.path), ...docPaths])
      for (const p of [...this.index.notes.keys()]) if (!seen.has(p)) this.index.delete(p)
      const stale = notes.filter(n => !this.inFlight.has(n.path) && this.index.notes.get(n.path)?.mtime !== n.mtime)
      if (initial && stale.length) this.indexing = { done: 0, total: stale.length }
      let next = 0
      const worker = async () => {
        while (next < stale.length) {
          const entry = stale[next++]
          const text = await vault.readText(entry.path)
          if (this.inFlight.has(entry.path)) continue // a save started while we were reading; its result wins
          const previous = this.index.notes.get(entry.path)
          this.index.set(entry.path, entry.mtime, text)
          if (this.indexing) this.indexing = { done: this.indexing.done + 1, total: this.indexing.total }
          const open = this.activeTab?.path === entry.path || this.editorPath === entry.path
          // Only a real difference in content counts as an outside edit (a changed timestamp alone does not).
          if (!initial && open && previous && previous.text !== text) this.noteChangedOnDisk(entry.path, text)
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      this.indexing = null
      if (stale.length || initial || docsChanged) this.index.rebuild()
      if (stale.length || initial || docsChanged) this.bump()
      // Drop tabs whose files vanished.
      const missing = this.tabs.filter(t => !seen.has(t.path))
      for (const t of missing) this.closeTab(t.id, true)
    } catch (e) {
      this.error = `Could not read the folder: ${(e as Error).message}`
    } finally {
      this.refreshing = false
    }
  }

  private noteChangedOnDisk(path: string, text: string) {
    // The editor already shows exactly this text: nothing to reconcile.
    if (this.editor && this.editorPath === path && this.editor.getText() === text) return
    if (this.dirty.has(path)) this.conflict = path
    else this.externalChange = { path, text, n: (this.externalChange?.n ?? 0) + 1 }
  }

  bump() {
    this.indexVersion++
  }

  // ---------------------------------------------------------------- reading the index reactively

  get activeTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId)
  }

  get activePath(): string | null {
    return this.activeTab?.path ?? null
  }

  /**
   * The note the study panels work on: the open note, or for a PDF/DOCX tab the companion note
   * where its notes are kept (if it exists yet).
   */
  get contextNote(): string | null {
    this.indexVersion
    const p = this.activePath
    if (!p) return null
    if (!isDoc(p)) return p
    const c = companionPath(p)
    return this.index.notes.has(c) ? c : null
  }

  /** Creates the notes file that goes with a document, if it isn't there yet, and returns its path. */
  async ensureCompanion(docPath: string): Promise<string | null> {
    const path = companionPath(docPath)
    if (this.index.notes.has(path)) return path
    const title = basename(docPath).replace(/\.(pdf|docx)$/i, '')
    const created = await this.createNote(dirname(docPath), basename(path).replace(/\.md$/, ''), false, `# Notes on ${title}\n\nSource: [[${basename(docPath)}]]\n\n`)
    return created
  }

  /** Appends text to a note, through the editor if that note is open there, otherwise on disk. */
  async appendToNote(path: string, text: string) {
    if (this.editor && this.editorPath === path) {
      this.editor.appendText(text)
      return
    }
    const current = this.index.notes.get(path)?.text ?? ''
    const next = current + (current && !current.endsWith('\n') ? '\n' : '') + text
    await this.saveNote(path, next)
    this.index.rebuild()
    this.bump()
  }

  /** Rewrites a note: through the editor if it is open there (so undo works), otherwise on disk. */
  async transformNote(path: string, fn: (text: string) => string) {
    if (this.editor && this.editorPath === path) {
      const before = this.editor.getText()
      const after = fn(before)
      if (after !== before) this.editor.replaceAll(after)
      return
    }
    const current = this.index.notes.get(path)?.text ?? ''
    const next = fn(current)
    if (next === current) return
    await this.saveNote(path, next)
    this.index.rebuild()
    this.bump()
  }

  /** Copies dropped files (notes, PDFs, Word documents, images) into a folder of the vault. */
  async importFiles(files: File[], folder: string) {
    const vault = this.vault
    if (!vault) return
    let added = 0
    for (const f of files) {
      if (!/\.(md|pdf|docx|png|jpe?g|gif|webp|svg)$/i.test(f.name)) continue
      const stem = f.name.replace(/\.[^.]+$/, '')
      const ext = f.name.slice(stem.length)
      let path = joinPath(folder, f.name)
      for (let n = 1; await vault.exists(path); n++) path = joinPath(folder, `${stem} ${n}${ext}`)
      await vault.writeBlob(path, f)
      added++
    }
    if (added) {
      await this.refresh()
      this.toast(`Added ${added} file${added === 1 ? '' : 's'}`)
    } else this.toast('Only notes, PDFs, Word documents and images can be added')
  }

  noteList(): FileEntry[] {
    this.indexVersion
    return [...this.index.notes.values()].map(r => ({ kind: 'file', name: basename(r.path), path: r.path, mtime: r.mtime, size: r.text.length }))
  }

  backlinks(path: string) {
    this.indexVersion
    return this.index.backlinks(path)
  }

  record(path: string | null) {
    this.indexVersion
    return path ? this.index.notes.get(path) : undefined
  }

  allCards(): Card[] {
    this.indexVersion
    return this.index.cards()
  }

  tagList() {
    this.indexVersion
    return this.index.tags()
  }

  // ---------------------------------------------------------------- tabs and navigation

  openNote(path: string, opts: { newTab?: boolean; push?: boolean } = {}) {
    this.view = 'notes'
    const existing = this.tabs.find(t => t.path === path)
    if (existing) this.activeTabId = existing.id
    else if (opts.newTab || !this.activeTab) {
      const tab = { id: uid(), path }
      this.tabs = [...this.tabs, tab]
      this.activeTabId = tab.id
    } else {
      this.tabs = this.tabs.map(t => (t.id === this.activeTabId ? { ...t, path } : t))
    }
    this.touchRecent(path)
    if (opts.push !== false) {
      this.history = [...this.history.slice(0, this.historyPos + 1), path]
      this.historyPos = this.history.length - 1
      this.historyVersion++
    }
    this.saveSession()
  }

  private touchRecent(path: string) {
    if (this.settings.recent[0] === path) return
    this.settings = { ...this.settings, recent: [path, ...this.settings.recent.filter(p => p !== path)].slice(0, 12) }
    this.persistSoon.settings()
  }

  /** Recently opened notes that still exist. */
  recentNotes(limit = 8): string[] {
    this.indexVersion
    return this.settings.recent.filter(p => this.index.notes.has(p) || this.index.docs.has(p)).slice(0, limit)
  }

  newTab() {
    void this.createNote(this.currentFolder(), undefined, true)
  }

  closeTab(id: string, silent = false) {
    const i = this.tabs.findIndex(t => t.id === id)
    if (i < 0) return
    const wasActive = id === this.activeTabId
    this.tabs = this.tabs.filter(t => t.id !== id)
    if (wasActive) this.activeTabId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? null
    if (!silent) this.saveSession()
  }

  get canGoBack() {
    this.historyVersion
    return this.historyPos > 0
  }

  get canGoForward() {
    this.historyVersion
    return this.historyPos < this.history.length - 1
  }

  goBack() {
    if (this.historyPos <= 0) return
    this.historyPos--
    this.historyVersion++
    this.openNote(this.history[this.historyPos], { push: false })
  }

  goForward() {
    if (this.historyPos >= this.history.length - 1) return
    this.historyPos++
    this.historyVersion++
    this.openNote(this.history[this.historyPos], { push: false })
  }

  /** Follows a [[link]], creating the note if it doesn't exist yet. */
  async openLink(target: string, fromPath: string, opts: { newTab?: boolean; heading?: string } = {}) {
    const found = this.index.resolve(target, fromPath)
    if (found && isDoc(found)) {
      const page = opts.heading?.match(/^page=(\d+)$/i)
      if (page) this.pendingPage = { path: found, page: +page[1] }
      return this.openNote(found, opts)
    }
    if (found) {
      if (opts.heading) this.pendingHeading = { path: found, heading: opts.heading }
      return this.openNote(found, opts)
    }
    if (isDoc(target)) return this.toast(`Couldn't find "${target}" in this folder`)
    const path = await this.createNote(dirname(fromPath), target.replace(/\.md$/i, ''), false, '')
    if (path) this.openNote(path, opts)
  }

  currentFolder(): string {
    const p = this.activePath
    return p ? dirname(p) : ''
  }

  private sessionKey() {
    return `omnia:session:${this.vault?.name}`
  }

  private saveSession() {
    try {
      localStorage.setItem(this.sessionKey(), JSON.stringify({ tabs: this.tabs.map(t => t.path), active: this.activePath }))
    } catch { /* ignore */ }
  }

  private restoreSession() {
    try {
      const raw = localStorage.getItem(this.sessionKey())
      if (!raw) return
      const s = JSON.parse(raw) as { tabs: string[]; active: string | null }
      const paths = s.tabs.filter(p => this.index.notes.has(p) || this.index.docs.has(p))
      this.tabs = paths.map(p => ({ id: uid(), path: p }))
      const active = this.tabs.find(t => t.path === s.active) ?? this.tabs[0]
      this.activeTabId = active?.id ?? null
      if (active) {
        this.history = [active.path]
        this.historyPos = 0
      }
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- note and folder operations

  uniquePath(folder: string, base: string, ext = '.md'): string {
    let name = base
    let n = 1
    while (this.index.notes.has(joinPath(folder, name + ext)) || this.index.docs.has(joinPath(folder, name + ext)) || this.hasFolder(joinPath(folder, name))) name = `${base} ${n++}`
    return joinPath(folder, name + ext)
  }

  private hasFolder(path: string): boolean {
    const walk = (f: FolderEntry): boolean => f.children.some(c => c.kind === 'folder' && (c.path === path || walk(c)))
    return this.tree ? walk(this.tree) : false
  }

  async createNote(folder: string, name = 'Untitled', newTab = false, content = ''): Promise<string | null> {
    if (!this.vault) return null
    const path = this.uniquePath(folder, name.replace(/[\\/:*?"<>|]/g, '-'))
    try {
      const mtime = await this.vault.writeText(path, content)
      this.index.set(path, mtime, content)
      this.index.rebuild()
      this.bump()
      await this.refresh()
      if (name === 'Untitled' || newTab) this.openNote(path, { newTab })
      return path
    } catch (e) {
      this.toast(`Could not create note: ${(e as Error).message}`)
      return null
    }
  }

  async createFolder(parent: string, name = 'New folder') {
    if (!this.vault) return
    let n = name
    let i = 1
    while (this.hasFolder(joinPath(parent, n))) n = `${name} ${i++}`
    await this.vault.mkdir(joinPath(parent, n))
    this.expanded = { ...this.expanded, [parent]: true }
    await this.refresh()
  }

  /** Saves are chained per note so they always land in the order they were made. */
  async saveNote(path: string, text: string) {
    const vault = this.vault
    if (!vault) return
    this.inFlight.add(path)
    const run = (this.saveChain.get(path) ?? Promise.resolve()).then(async () => {
      try {
        const mtime = await vault.writeText(path, text)
        this.index.set(path, mtime, text)
        this.rebuildSoon()
        if (isNote(path)) void this.snapshotMaybe(path, text)
      } catch (e) {
        this.toast(`Could not save "${noteTitle(path)}": ${(e as Error).message}`)
      }
    })
    this.saveChain.set(path, run)
    await run
    if (this.saveChain.get(path) === run) {
      this.saveChain.delete(path)
      this.inFlight.delete(path)
    }
  }

  // ---------------------------------------------------------------- version history

  private lastSnap = new Map<string, Version | null>()
  private snapping = new Set<string>()

  private async readHistory(path: string): Promise<HistoryFile> {
    try {
      return normaliseHistory(JSON.parse(await this.vault!.readText(joinPath(HISTORY_DIR, historyFileName(path)))), path)
    } catch {
      return normaliseHistory(null, path)
    }
  }

  private async writeHistory(h: HistoryFile) {
    const vault = this.vault
    if (!vault) return
    try {
      await vault.mkdir(HISTORY_DIR)
      await vault.writeText(joinPath(HISTORY_DIR, historyFileName(h.path)), JSON.stringify(h))
      this.lastSnap.set(h.path, h.versions.at(-1) ?? null)
    } catch { /* read-only folder: history simply isn't kept */ }
  }

  /** Keeps a copy of the note if it has been a while since the last one. */
  private async snapshotMaybe(path: string, text: string) {
    if (this.snapping.has(path)) return
    this.snapping.add(path)
    try {
      let last = this.lastSnap.get(path)
      if (last === undefined) {
        last = (await this.readHistory(path)).versions.at(-1) ?? null
        this.lastSnap.set(path, last)
      }
      if (!shouldSnapshot(last ?? undefined, text, Date.now())) return
      const h = await this.readHistory(path)
      h.versions = addVersion(h.versions, { t: Date.now(), text })
      await this.writeHistory(h)
    } finally {
      this.snapping.delete(path)
    }
  }

  async versionsOf(path: string): Promise<Version[]> {
    return (await this.readHistory(path)).versions
  }

  /** Saves the note as it is now as a named version. */
  async saveVersion(path: string, label?: string) {
    const text = this.editor && this.editorPath === path ? this.editor.getText() : this.index.notes.get(path)?.text
    if (text === undefined) return
    const h = await this.readHistory(path)
    if (h.versions.at(-1)?.text === text && !label) return this.toast('That is already the latest version')
    h.versions = addVersion(h.versions, { t: Date.now(), text, label: label ?? 'Saved by you' })
    await this.writeHistory(h)
    this.toast('Version saved')
  }

  /** Puts an earlier version back, keeping the current text as a version first so nothing is lost. */
  async restoreVersion(path: string, version: Version) {
    const current = this.editor && this.editorPath === path ? this.editor.getText() : this.index.notes.get(path)?.text ?? ''
    if (current !== version.text) {
      const h = await this.readHistory(path)
      h.versions = addVersion(h.versions, { t: Date.now(), text: current, label: 'Before restore' })
      await this.writeHistory(h)
    }
    await this.transformNote(path, () => version.text)
    this.toast('Restored the earlier version', { label: 'Undo', run: () => void this.transformNote(path, () => current) })
  }

  private async moveHistory(from: string, to: string) {
    const vault = this.vault
    if (!vault || from === to) return
    const h = await this.readHistory(from)
    if (!h.versions.length) return
    await this.writeHistory({ ...h, path: to })
    this.lastSnap.delete(from)
    try { await vault.remove(joinPath(HISTORY_DIR, historyFileName(from))) } catch { /* already gone */ }
  }

  /** Unsaved edits must reach the old path before a note is renamed, moved or deleted, or the old file would reappear. */
  private async settleEditor() {
    await this.editor?.flush()
    await Promise.all([...this.saveChain.values()])
  }

  async renameEntry(path: string, newName: string) {
    const vault = this.vault
    if (!vault) return
    await this.settleEditor()
    const isNoteFile = isNote(path)
    const clean = newName.trim().replace(/[\\/:*?"<>|]/g, '-')
    if (!clean) return
    const to = joinPath(dirname(path), isNoteFile ? clean.replace(/\.md$/i, '') + '.md' : clean)
    if (to === path) return
    try {
      await vault.move(path, to)
      await this.rewriteLinks(isNoteFile ? noteTitle(path) : basename(path), isNoteFile ? noteTitle(to) : basename(to), to)
      this.remapPaths(path, to)
      await this.refresh()
      this.index.rebuild()
      this.bump()
    } catch (e) {
      this.toast(`Could not rename: ${(e as Error).message}`)
    }
  }

  async moveEntry(path: string, folder: string) {
    if (dirname(path) === folder || folder === path || folder.startsWith(path + '/')) return
    await this.settleEditor()
    const to = joinPath(folder, basename(path))
    try {
      await this.vault?.move(path, to)
      this.remapPaths(path, to)
      await this.refresh()
      this.index.rebuild()
      this.bump()
    } catch (e) {
      this.toast(`Could not move: ${(e as Error).message}`)
    }
  }

  /** Deleted items go to <vault>/.trash so nothing is lost for good. */
  async deleteEntry(path: string) {
    const vault = this.vault
    if (!vault) return
    await this.settleEditor()
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const trashName = `${stamp}-${basename(path)}`
      await vault.move(path, joinPath('.trash', trashName))
      void this.recordTrash(trashName, path)
      for (const t of this.tabs.filter(t => t.path === path || t.path.startsWith(path + '/'))) this.closeTab(t.id, true)
      await this.refresh()
      this.index.rebuild()
      this.bump()
      this.toast(`Moved "${basename(path)}" to .trash`)
    } catch (e) {
      this.toast(`Could not delete: ${(e as Error).message}`)
    }
  }

  // ---------------------------------------------------------------- trash

  private async recordTrash(name: string, original: string) {
    try {
      const map = await this.vault!.readJSON<Record<string, string>>('trash.json', {})
      map[name] = original
      await this.vault!.writeJSON('trash.json', map)
    } catch { /* restoring will fall back to the top folder */ }
  }

  async trashItems(): Promise<{ name: string; original: string; title: string; deleted: number; kind: 'file' | 'directory'; size: number }[]> {
    const vault = this.vault
    if (!vault) return []
    let entries: Awaited<ReturnType<typeof vault.list>> = []
    try { entries = await vault.list('.trash') } catch { return [] }
    const map = await vault.readJSON<Record<string, string>>('trash.json', {})
    return entries.map(e => {
      const m = e.name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z-(.*)$/)
      const title = m ? m[5] : e.name
      const deleted = m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : e.mtime
      return { name: e.name, original: map[e.name] ?? title, title, deleted, kind: e.kind, size: e.size }
    }).sort((a, b) => b.deleted - a.deleted)
  }

  async restoreTrash(name: string, original: string): Promise<string | null> {
    const vault = this.vault
    if (!vault) return null
    try {
      const isFolder = !/\.[A-Za-z0-9]+$/.test(original)
      let target = original
      if (await vault.exists(target)) {
        const stem = isFolder ? original : original.replace(/\.[^./]+$/, '')
        const ext = isFolder ? '' : original.slice(stem.length)
        for (let n = 1; await vault.exists(target); n++) target = `${stem} (restored${n > 1 ? ` ${n}` : ''})${ext}`
      }
      const parent = dirname(target)
      if (parent) await vault.mkdir(parent)
      await vault.move(joinPath('.trash', name), target)
      await this.refresh()
      this.index.rebuild()
      this.bump()
      this.toast(`Restored “${basename(target)}”`, isNote(target) || isDoc(target) ? { label: 'Open', run: () => this.openNote(target) } : undefined)
      return target
    } catch (e) {
      this.toast(`Could not restore: ${(e as Error).message}`)
      return null
    }
  }

  async purgeTrash(name?: string) {
    const vault = this.vault
    if (!vault) return
    const items = name ? [name] : (await this.trashItems()).map(i => i.name)
    for (const n of items) {
      try { await vault.remove(joinPath('.trash', n)) } catch { /* already gone */ }
    }
    try {
      const map = await vault.readJSON<Record<string, string>>('trash.json', {})
      for (const n of items) delete map[n]
      await vault.writeJSON('trash.json', map)
    } catch { /* ignore */ }
  }

  private async rewriteLinks(oldTitle: string, newTitle: string, renamedTo: string) {
    if (!this.vault || oldTitle === newTitle) return
    for (const rec of this.index.notes.values()) {
      if (rec.path === renamedTo) continue
      const updated = renameLinkTarget(rec.text, oldTitle, newTitle)
      if (updated !== rec.text) {
        const mtime = await this.vault.writeText(rec.path, updated)
        this.index.set(rec.path, mtime, updated)
        if (this.activePath === rec.path) this.externalChange = { path: rec.path, text: updated, n: (this.externalChange?.n ?? 0) + 1 }
      }
    }
  }

  private remapPaths(from: string, to: string) {
    const moved = [...this.index.notes.keys()].filter(k => k === from || k.startsWith(from + '/'))
    for (const old of moved) void this.moveHistory(old, to + old.slice(from.length))
    const map = (p: string) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p)
    this.tabs = this.tabs.map(t => ({ ...t, path: map(t.path) }))
    this.history = this.history.map(map)
    this.settings.bookmarks = this.settings.bookmarks.map(map)
    this.settings.recent = this.settings.recent.map(map)
    this.mistakes = this.mistakes.map(m => ({ ...m, path: map(m.path) }))
    const noteStats: StudyData['notes'] = {}
    for (const [p, v] of Object.entries(this.study.notes ?? {})) noteStats[map(p)] = v
    this.study.notes = noteStats
    this.persistSoon.mistakes()
    const revs: StudyData['revisions'] = {}
    for (const [p, r] of Object.entries(this.study.revisions)) revs[map(p)] = r
    this.study.revisions = revs
    this.index.notes.delete(from)
    this.persistSoon.settings()
    this.persistSoon.study()
    this.saveSession()
  }

  // ---------------------------------------------------------------- templates

  /** Copies a note into the templates folder. */
  async saveAsTemplate(path: string) {
    const text = this.editor && this.editorPath === path ? this.editor.getText() : this.index.notes.get(path)?.text
    if (text === undefined) return
    const folder = this.settings.templatesFolder.trim() || 'Templates'
    const title = noteTitle(path)
    const made = await this.createNote(folder, title, false, text.replace(new RegExp(`^(# )${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), '$1{{title}}'))
    if (made) this.toast(`Saved as a template in ${folder}`)
  }

  // ---------------------------------------------------------------- quick capture

  /** The note quick capture adds to, created on first use. */
  async inboxPath(): Promise<string | null> {
    const stem = (this.settings.inboxNote.trim() || 'Inbox').replace(/\.md$/i, '')
    const path = `${stem}.md`
    if (this.index.notes.has(path)) return path
    return this.createNote(dirname(stem), basename(stem), false, `# ${basename(stem)}\n\n`)
  }

  /** Adds a thought (or a flashcard line) to the inbox note. */
  async captureToInbox(text: string, kind: 'note' | 'card' = 'note') {
    const path = await this.inboxPath()
    if (!path) return null
    const body = text.trim()
    if (!body) return null
    const lines = body.split('\n')
    const current = this.editor && this.editorPath === path ? this.editor.getText() : this.index.notes.get(path)?.text ?? ''
    const last = current.trimEnd().split('\n').pop() ?? ''
    const isBullet = /^\s*[-*+]\s/.test(last)
    const block = kind === 'card' ? `${body}\n` : `- ${lines[0]}${lines.slice(1).map(l => `\n  ${l}`).join('')}\n`
    // Blank lines keep cards and bullets from running into each other.
    const gap = !current.trim() ? '' : kind === 'card' ? (current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n') : isBullet ? (current.endsWith('\n') ? '' : '\n') : (current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n')
    await this.appendToNote(path, gap + block)
    return path
  }

  // ---------------------------------------------------------------- daily notes and bookmarks

  dailyPath(date: ISODate): string {
    return joinPath(this.settings.dailyFolder.trim(), `${date}.md`)
  }

  hasDaily(date: ISODate): boolean {
    this.indexVersion
    return this.index.notes.has(this.dailyPath(date))
  }

  async openDaily(date: ISODate = today()) {
    const path = this.dailyPath(date)
    if (!this.index.notes.has(path)) {
      const d = new Date(`${date}T12:00:00`)
      const title = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      await this.createNote(this.settings.dailyFolder.trim(), date, false, `# ${title}\n\n## Plan\n\n## Notes\n\n`)
    }
    this.openNote(path)
  }

  isBookmarked(path: string) {
    return this.settings.bookmarks.includes(path)
  }

  toggleBookmark(path: string) {
    this.settings.bookmarks = this.isBookmarked(path)
      ? this.settings.bookmarks.filter(p => p !== path)
      : [...this.settings.bookmarks, path]
    this.persistSoon.settings()
  }

  // ---------------------------------------------------------------- tasks and events

  addTask(partial: Partial<Task> & { title: string }): Task {
    const task: Task = { id: uid(), done: false, created: today(), ...partial }
    this.tasks = [...this.tasks, task]
    this.persistSoon.tasks()
    return task
  }

  updateTask(id: string, patch: Partial<Task>) {
    this.tasks = this.tasks.map(t => (t.id === id ? { ...t, ...patch } : t))
    this.persistSoon.tasks()
  }

  toggleTask(id: string, date?: ISODate) {
    this.tasks = this.tasks.map(t => (t.id === id ? toggleTaskPure(t, date, today()) : t))
    this.persistSoon.tasks()
  }

  removeTask(id: string) {
    this.tasks = this.tasks.filter(t => t.id !== id)
    this.persistSoon.tasks()
  }

  /** Puts back a task that was deleted (used by "Undo"). */
  restoreTask(task: Task) {
    if (this.tasks.some(t => t.id === task.id)) return
    this.tasks = [...this.tasks, task]
    this.persistSoon.tasks()
  }

  replaceTask(task: Task) {
    this.tasks = this.tasks.map(t => (t.id === task.id ? task : t))
    this.persistSoon.tasks()
  }

  duplicateTask(id: string) {
    const t = this.tasks.find(x => x.id === id)
    if (!t) return
    const copy: Task = { ...structuredClone($state.snapshot(t)) as Task, id: uid(), title: `${t.title} (copy)`, done: false, doneAt: undefined, completions: undefined, created: today() }
    this.tasks = [...this.tasks, copy]
    this.persistSoon.tasks()
  }

  /** Removes all finished one-off tasks and returns them so the caller can offer "Undo". */
  clearCompleted(): Task[] {
    const removed = this.tasks.filter(t => !t.recur && t.done)
    this.tasks = this.tasks.filter(t => t.recur || !t.done)
    this.persistSoon.tasks()
    return removed
  }

  /** Moves every overdue one-off task to a new planned day. */
  rescheduleOverdue(to: ISODate) {
    const now = today()
    this.tasks = this.tasks.map(t => (!t.recur && !t.done && (t.due ?? t.deadline ?? '9999') < now ? { ...t, due: to } : t))
    this.persistSoon.tasks()
  }

  addEvent(partial: Partial<CalEvent> & { title: string; date: ISODate }): CalEvent {
    const ev: CalEvent = { id: uid(), ...partial }
    this.events = [...this.events, ev]
    this.persistSoon.events()
    return ev
  }

  updateEvent(id: string, patch: Partial<CalEvent>) {
    this.events = this.events.map(e => (e.id === id ? { ...e, ...patch } : e))
    this.persistSoon.events()
  }

  removeEvent(id: string) {
    this.events = this.events.filter(e => e.id !== id)
    this.persistSoon.events()
  }

  // ---------------------------------------------------------------- study

  scopeCards(scope: Scope): Card[] {
    const cards = this.allCards()
    const resolved: Scope = scope.type === 'tag'
      ? { ...scope, paths: this.index.tags().find(([t]) => t === scope.tag)?.[1] ?? [] }
      : scope
    return cards.filter(c => inScope(c, resolved))
  }

  /** Cards to study right now for a scope, honouring the daily new-card limit. */
  buildQueue(scope: Scope, now = Date.now()): Card[] {
    const cards = this.scopeCards(scope)
    const split = dueCards(cards, this.study.cards, now)
    const introduced = this.study.log[today()]?.newCards ?? 0
    return sessionQueue(split, this.settings.newPerDay - introduced, shuffle)
  }

  dueSummary(scope: Scope, now = Date.now()) {
    const split = dueCards(this.scopeCards(scope), this.study.cards, now)
    const introduced = this.study.log[today()]?.newCards ?? 0
    return {
      learning: split.learning.length,
      review: split.review.length,
      fresh: Math.min(split.fresh.length, Math.max(0, this.settings.newPerDay - introduced)),
      freshTotal: split.fresh.length
    }
  }

  gradeCard(cardId: string, grade: Grade, now = Date.now(), path?: string) {
    const prev = this.study.cards[cardId]
    const next = schedule(prev, grade, now)
    const date = today()
    const log = this.study.log[date] ?? { reviews: 0, correct: 0, newCards: 0 }
    this.study = {
      ...this.study,
      cards: { ...this.study.cards, [cardId]: next },
      log: {
        ...this.study.log,
        [date]: { reviews: log.reviews + 1, correct: log.correct + (grade >= 2 ? 1 : 0), newCards: log.newCards + (prev ? 0 : 1) }
      },
      notes: path
        ? { ...this.study.notes, [path]: { reviews: (this.study.notes[path]?.reviews ?? 0) + 1, correct: (this.study.notes[path]?.correct ?? 0) + (grade >= 2 ? 1 : 0) } }
        : this.study.notes
    }
    this.persistSoon.study()
    return next
  }

  /** Marks a card as needing relearning (used when a quiz answer is wrong). */
  lapseCard(cardId: string, now = Date.now()) {
    const prev = this.study.cards[cardId]
    if (!prev) return
    this.study = { ...this.study, cards: { ...this.study.cards, [cardId]: schedule(prev, 0, now) } }
    this.persistSoon.study()
  }

  // ---------------------------------------------------------------- error log

  recordMistake(input: MissInput) {
    this.mistakes = recordMiss(this.mistakes, input, today())
    this.persistSoon.mistakes()
  }

  /** A right answer: moves an open mistake towards resolved. */
  recordCorrect(id: string) {
    const next = recordHit(this.mistakes, id, today())
    if (next === this.mistakes) return
    this.mistakes = next
    this.persistSoon.mistakes()
  }

  setMistakes(next: Mistake[]) {
    this.mistakes = next
    this.persistSoon.mistakes()
  }

  /** Restores a previous snapshot of study data (used by "undo" in review). */
  restoreStudy(snapshot: StudyData) {
    this.study = snapshot
    this.persistSoon.study()
  }

  /** Adds completed focus minutes to today's total and, optionally, a task's tomato count. */
  logFocus(minutes: number, taskId: string | null) {
    const date = today()
    this.study = { ...this.study, focus: { ...this.study.focus, [date]: (this.study.focus[date] ?? 0) + minutes } }
    this.persistSoon.study()
    const task = taskId ? this.tasks.find(t => t.id === taskId) : undefined
    if (task) this.updateTask(task.id, { pomodoros: (task.pomodoros ?? 0) + 1 })
  }

  recordQuiz(result: QuizResult) {
    this.study = { ...this.study, quizzes: [...this.study.quizzes, result].slice(-200) }
    this.persistSoon.study()
  }

  addRevision(path: string) {
    if (this.study.revisions[path]) return
    this.study = { ...this.study, revisions: { ...this.study.revisions, [path]: { step: 0, due: today(), history: [] } } }
    this.persistSoon.study()
  }

  removeRevision(path: string) {
    const { [path]: _gone, ...rest } = this.study.revisions
    this.study = { ...this.study, revisions: rest }
    this.persistSoon.study()
  }

  rateRevision(path: string, rating: Rating) {
    const next = nextRevision(this.study.revisions[path], rating, today(), addDays)
    this.study = { ...this.study, revisions: { ...this.study.revisions, [path]: next } }
    this.persistSoon.study()
  }

  // ---------------------------------------------------------------- settings, theme, toasts

  openSettings(query = '') {
    this.settingsQuery = query
    this.view = 'settings'
  }

  /** Puts every setting back to its default (the folder's notes and data are untouched). */
  resetSettings(keep: Array<keyof Settings> = ['bookmarks', 'dailyFolder', 'recent']) {
    const fresh = normaliseSettings(undefined)
    const kept: Partial<Settings> = {}
    for (const k of keep) (kept as Record<string, unknown>)[k] = this.settings[k]
    this.settings = { ...fresh, ...kept }
    this.persistSoon.settings()
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    this.persistSoon.settings()
  }

  setTheme(theme: Theme) {
    this.theme = theme
    try { localStorage.setItem('omnia:theme', theme) } catch { /* ignore */ }
  }

  toast(text: string, action?: Toast['action']) {
    const t = { id: ++this.toastId, text, action }
    this.toasts = [...this.toasts, t]
    setTimeout(() => (this.toasts = this.toasts.filter(x => x.id !== t.id)), action ? 8000 : 4000)
  }

  private async write(name: string, data: unknown) {
    try {
      await this.vault?.writeJSON(name, data)
    } catch (e) {
      this.toast(`Could not save ${name}: ${(e as Error).message}`)
    }
  }

  /** Writes everything immediately, e.g. before the page closes. */
  async flush() {
    await Promise.all([
      this.write('tasks.json', untrack(() => this.tasks)),
      this.write('events.json', untrack(() => this.events)),
      this.write('study.json', untrack(() => this.study)),
      this.write('mistakes.json', untrack(() => this.mistakes)),
      this.write('settings.json', untrack(() => this.settings))
    ])
  }
}

export const app = new AppState()
