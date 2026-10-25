import { app } from './app.svelte'
import { today } from './dates'
import { buildDigest, dueReminders, hhmm, inQuietHours, localMoment } from './notify'
import { dueRevisions } from './study'
import { uid } from './tasks'

export type NotifKind = 'digest' | 'task' | 'event' | 'timer' | 'system'

export interface NotifItem {
  id: string
  title: string
  body: string
  at: number
  kind: NotifKind
  read: boolean
  taskId?: string
  eventId?: string
}

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

interface Snoozed { item: Omit<NotifItem, 'id' | 'at' | 'read'>; until: number }

class Notifier {
  items = $state<NotifItem[]>([])
  permission = $state<Permission>('Notification' in window ? (Notification.permission as Permission) : 'unsupported')
  /** The notification centre popover. */
  open = $state(false)

  private fired = new Set<string>()
  private snoozed: Snoozed[] = []
  private lastDigest = ''
  private timer: ReturnType<typeof setInterval> | undefined
  private scope = ''

  get unread(): number {
    return this.items.filter(i => !i.read).length
  }

  private key(name: string) {
    return `omnia:notif:${this.scope}:${name}`
  }

  private load<T>(name: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.key(name))
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  }

  private save(name: string, value: unknown) {
    try { localStorage.setItem(this.key(name), JSON.stringify(value)) } catch { /* storage unavailable */ }
  }

  /** Begin watching the clock. Safe to call again; call `stop` when the folder closes. */
  start() {
    this.stop()
    this.scope = app.vault?.name ?? 'vault'
    this.items = this.load<NotifItem[]>('items', [])
    this.fired = new Set(this.load<string[]>('fired', []))
    this.snoozed = this.load<Snoozed[]>('snoozed', [])
    this.lastDigest = this.load<string>('digest', '')
    this.refreshPermission()
    this.tick()
    this.timer = setInterval(() => this.tick(), 20_000)
    document.addEventListener('visibilitychange', this.onVisible)
    window.addEventListener('focus', this.onVisible)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    document.removeEventListener('visibilitychange', this.onVisible)
    window.removeEventListener('focus', this.onVisible)
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') {
      this.refreshPermission()
      this.tick()
    }
  }

  refreshPermission() {
    this.permission = 'Notification' in window ? (Notification.permission as Permission) : 'unsupported'
  }

  async enable(): Promise<void> {
    if (!('Notification' in window)) return
    this.permission = (await Notification.requestPermission()) as Permission
    if (this.permission === 'granted') app.updateSettings({ notifEnabled: true })
  }

  send(n: Omit<NotifItem, 'id' | 'at' | 'read'>) {
    const item: NotifItem = { id: uid(), at: Date.now(), read: false, ...n }
    this.items = [item, ...this.items].slice(0, 60)
    this.save('items', this.items)
    const first = n.body.split('\n')[0]
    if (document.hasFocus()) app.toast(`${n.title}${first ? `: ${first}` : ''}`, { label: 'View', run: () => (this.open = true) })
    if (this.permission === 'granted') {
      try {
        const note = new Notification(n.title, { body: n.body, tag: item.id })
        note.onclick = () => { window.focus(); this.open = true; note.close() }
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }

  sendTest() {
    this.send({ kind: 'system', title: 'Notifications are working', body: 'You will get your daily summary and reminders here.' })
  }

  markAllRead() {
    this.items = this.items.map(i => ({ ...i, read: true }))
    this.save('items', this.items)
  }

  dismiss(id: string) {
    this.items = this.items.filter(i => i.id !== id)
    this.save('items', this.items)
  }

  clear() {
    this.items = []
    this.save('items', this.items)
  }

  /** Hide a notification and bring it back later. `minutes: 'tomorrow'` means 09:00 the next day. */
  snooze(id: string, minutes: number | 'tomorrow') {
    const item = this.items.find(i => i.id === id)
    if (!item) return
    let until = Date.now() + (minutes === 'tomorrow' ? 0 : minutes * 60_000)
    if (minutes === 'tomorrow') {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      until = d.getTime()
    }
    const { id: _id, at: _at, read: _read, ...rest } = item
    this.snoozed = [...this.snoozed, { item: rest, until }]
    this.save('snoozed', this.snoozed)
    this.dismiss(id)
    app.toast(minutes === 'tomorrow' ? 'Snoozed until tomorrow morning' : `Snoozed for ${minutes} minutes`)
  }

  private tick() {
    const s = app.settings
    if (!s.notifEnabled || !app.vault) return
    // Another tab of the app may have sent things already; storage is the shared record, so check it every time.
    this.lastDigest = this.load<string>('digest', '')
    this.fired = new Set(this.load<string[]>('fired', []))
    this.snoozed = this.load<Snoozed[]>('snoozed', [])
    const now = new Date()
    const nowHM = hhmm(now)
    const quiet = s.quietEnabled && inQuietHours(nowHM, s.quietStart, s.quietEnd)
    if (quiet) return

    // Snoozed items that are due again
    const due = this.snoozed.filter(x => x.until <= now.getTime())
    if (due.length) {
      this.snoozed = this.snoozed.filter(x => x.until > now.getTime())
      this.save('snoozed', this.snoozed)
      for (const d of due) this.send({ ...d.item, title: `Reminder: ${d.item.title}` })
    }

    // The daily summary
    const day = today()
    if (this.lastDigest !== day && nowHM >= s.digestTime) {
      const summary = app.dueSummary({ type: 'all' })
      const digest = buildDigest({
        tasks: app.tasks, events: app.events, now: day, leadDays: s.deadlineLeadDays,
        cardsDue: summary.learning + summary.review + summary.fresh,
        revisionsDue: dueRevisions(app.study.revisions, day).length
      })
      this.lastDigest = day
      this.save('digest', day) // record before sending so a second tab won't repeat it
      if (digest.total > 0 || s.digestEmpty) this.send({ kind: 'digest', title: digest.title, body: digest.body })
    }

    // Individual reminders
    const reminders = dueReminders(app.tasks, app.events, localMoment(now), this.fired)
    if (reminders.length) {
      for (const r of reminders) {
        this.fired.add(r.key)
        this.save('fired', [...this.fired].slice(-400)) // record before sending so a second tab won't repeat it
        this.send({ kind: r.eventId ? 'event' : 'task', title: r.title, body: r.body, taskId: r.taskId, eventId: r.eventId })
      }
      // Keep the record from growing forever.
      this.save('fired', [...this.fired].slice(-400))
    }
  }
}

export const notifier = new Notifier()
