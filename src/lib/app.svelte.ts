import { untrack } from 'svelte'
import { addDays, today, type ISODate } from './dates'
import {
  basename, dirname, ensurePermission, forgetHandle, fsSupported, isNote, joinPath, loadHandle, noteTitle,
  pickFolder, saveHandle, Vault, type FileEntry, type FolderEntry
} from './vault'
import { NoteIndex, renameLinkTarget } from './noteindex'
import { uid, toggle as toggleTaskPure, type CalEvent, type Task } from './tasks'
import {
  dueCards, emptyStudy, inScope, sessionQueue, type QuizResult, type Scope, type StudyData
} from './study'
import { nextRevision, schedule, type Grade, type Rating } from './sr'
import { shuffle } from './quiz'
import type { Card } from './cards'

export type View = 'notes' | 'tasks' | 'calendar' | 'study'
export type SidebarTab = 'files' | 'search' | 'bookmarks'
export type RightTab = 'info' | 'cards' | 'quiz' | 'revise'
export type Theme = 'light' | 'dark' | 'auto'

export interface Settings {
  dailyFolder: string
  bookmarks: string[]
  newPerDay: number
  fontSize: number
  readableWidth: boolean
  spellcheck: boolean
}

const DEFAULT_SETTINGS: Settings = {
  dailyFolder: 'Daily', bookmarks: [], newPerDay: 20, fontSize: 18, readableWidth: true, spellcheck: true
}

export interface Tab { id: string; path: string }

export type Modal =
  | { type: 'switcher' }
  | { type: 'palette' }
  | { type: 'settings' }
  | { type: 'help' }
  | { type: 'review'; scope: Scope }
  | { type: 'quiz'; scope: Scope }

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

/** Hooks the editor registers so panels can read and change the open note. */
export interface EditorApi {
  getText(): string
  getSelection(): string
  replaceSelection(text: string): void
  appendText(text: string): void
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
  toasts = $state<Toast[]>([])
  searchQuery = $state('')
  expanded = $state<Record<string, boolean>>({})

  // Persisted data
  settings = $state<Settings>({ ...DEFAULT_SETTINGS })
  tasks = $state<Task[]>([])
  events = $state<CalEvent[]>([])
  study = $state<StudyData>(emptyStudy())
  theme = $state<Theme>('auto')

  // Editor bridge
  editor: EditorApi | null = null
  /** Set when a note changed on disk while the editor had no unsaved edits. */
  externalChange = $state<{ path: string; text: string; n: number } | null>(null)
  conflict = $state<string | null>(null)
  /** A heading to scroll to once the note it belongs to has opened. */
  pendingHeading = $state<{ path: string; heading: string } | null>(null)
  pendingLine = $state<{ path: string; line: number } | null>(null)
  dirty = new Set<string>()

  private toastId = 0
  private refreshing = false
  private rebuildSoon = debounce(() => this.bump(), 250)
  private persistSoon = {
    tasks: debounce(() => this.write('tasks.json', this.tasks), 300),
    events: debounce(() => this.write('events.json', this.events), 300),
    study: debounce(() => this.write('study.json', this.study), 500),
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
    const [settings, tasks, events, study] = await Promise.all([
      vault.readJSON<Partial<Settings>>('settings.json', {}),
      vault.readJSON<Task[]>('tasks.json', []),
      vault.readJSON<CalEvent[]>('events.json', []),
      vault.readJSON<StudyData>('study.json', emptyStudy())
    ])
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    this.tasks = tasks
    this.events = events
    this.study = { ...emptyStudy(), ...study }
    await this.refresh(true)
    if (!this.index.notes.size) await this.createWelcomeNote()
    this.restoreSession()
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
      const { tree, notes } = await vault.scan()
      this.tree = tree
      const seen = new Set(notes.map(n => n.path))
      for (const p of [...this.index.notes.keys()]) if (!seen.has(p)) this.index.delete(p)
      const stale = notes.filter(n => this.index.notes.get(n.path)?.mtime !== n.mtime)
      if (initial && stale.length) this.indexing = { done: 0, total: stale.length }
      let next = 0
      const worker = async () => {
        while (next < stale.length) {
          const entry = stale[next++]
          const text = await vault.readText(entry.path)
          this.index.set(entry.path, entry.mtime, text)
          if (this.indexing) this.indexing = { done: this.indexing.done + 1, total: this.indexing.total }
          const open = this.activeTab?.path === entry.path
          if (!initial && open) this.noteChangedOnDisk(entry.path, text)
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      this.indexing = null
      if (stale.length || initial) this.index.rebuild()
      if (stale.length || initial) this.bump()
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
    if (opts.push !== false) {
      this.history = [...this.history.slice(0, this.historyPos + 1), path]
      this.historyPos = this.history.length - 1
      this.historyVersion++
    }
    this.saveSession()
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
    if (found) {
      if (opts.heading) this.pendingHeading = { path: found, heading: opts.heading }
      return this.openNote(found, opts)
    }
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
      const paths = s.tabs.filter(p => this.index.notes.has(p))
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
    while (this.index.notes.has(joinPath(folder, name + ext)) || this.hasFolder(joinPath(folder, name))) name = `${base} ${n++}`
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

  async saveNote(path: string, text: string) {
    if (!this.vault) return
    try {
      const mtime = await this.vault.writeText(path, text)
      this.index.set(path, mtime, text)
      this.rebuildSoon()
    } catch (e) {
      this.toast(`Could not save "${noteTitle(path)}": ${(e as Error).message}`)
    }
  }

  async renameEntry(path: string, newName: string) {
    const vault = this.vault
    if (!vault) return
    const isNoteFile = isNote(path)
    const clean = newName.trim().replace(/[\\/:*?"<>|]/g, '-')
    if (!clean) return
    const to = joinPath(dirname(path), isNoteFile ? clean.replace(/\.md$/i, '') + '.md' : clean)
    if (to === path) return
    try {
      await vault.move(path, to)
      if (isNoteFile) await this.rewriteLinks(noteTitle(path), noteTitle(to), to)
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
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await vault.move(path, joinPath('.trash', `${stamp}-${basename(path)}`))
      for (const t of this.tabs.filter(t => t.path === path || t.path.startsWith(path + '/'))) this.closeTab(t.id, true)
      await this.refresh()
      this.index.rebuild()
      this.bump()
      this.toast(`Moved "${basename(path)}" to .trash`)
    } catch (e) {
      this.toast(`Could not delete: ${(e as Error).message}`)
    }
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
    const map = (p: string) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p)
    this.tabs = this.tabs.map(t => ({ ...t, path: map(t.path) }))
    this.history = this.history.map(map)
    this.settings.bookmarks = this.settings.bookmarks.map(map)
    const revs: StudyData['revisions'] = {}
    for (const [p, r] of Object.entries(this.study.revisions)) revs[map(p)] = r
    this.study.revisions = revs
    this.index.notes.delete(from)
    this.persistSoon.settings()
    this.persistSoon.study()
    this.saveSession()
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

  gradeCard(cardId: string, grade: Grade, now = Date.now()) {
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
      }
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

  /** Restores a previous snapshot of study data (used by "undo" in review). */
  restoreStudy(snapshot: StudyData) {
    this.study = snapshot
    this.persistSoon.study()
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
      this.write('settings.json', untrack(() => this.settings))
    ])
  }
}

export const app = new AppState()
