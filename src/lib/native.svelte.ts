// What only the Android app can do: notifications scheduled with the phone's alarm system (so they arrive with Omnia
// closed), the back button, and sharing files out of the app.

import { app } from './app.svelte'
import { today } from './dates'
import { notifier } from './notify.svelte'
import { isNativeApp } from './platform'
import { notificationId, planNotifications } from './schedule'
import { dueRevisions } from './study'

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

const DAYS_AHEAD = 14

class Native {
  permission = $state<Permission>('unsupported')
  private timer: ReturnType<typeof setTimeout> | undefined

  async init() {
    if (!isNativeApp()) return
    const { App } = await import('@capacitor/app')
    await App.addListener('backButton', ({ canGoBack: _ }) => void this.back(App))
    await this.refreshPermission()
    this.rescheduleSoon(500)
  }

  /** Closes whatever is on top; at the bottom of the stack the app goes to the background, as phone apps do. */
  private async back(App: typeof import('@capacitor/app').App) {
    if (app.modal) { app.modal = null; return }
    if (notifier.open) { notifier.open = false; return }
    if (app.pomodoroOpen) { app.pomodoroOpen = false; return }
    if (app.rightOpen) { app.rightOpen = false; return }
    if (app.leftOpen) { app.leftOpen = false; return }
    if (app.focusMode) { app.focusMode = false; return }
    if (app.view === 'notes' && app.canGoBack) { app.goBack(); return }
    if (app.view !== app.settings.startView) { app.view = app.settings.startView; return }
    await App.minimizeApp()
  }

  // ------------------------------------------------------------ notifications

  async refreshPermission() {
    if (!isNativeApp()) return
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const r = await LocalNotifications.checkPermissions()
      this.permission = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'
    } catch { this.permission = 'unsupported' }
  }

  async requestPermission() {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const r = await LocalNotifications.requestPermissions()
      this.permission = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'
      if (this.permission === 'granted') {
        app.updateSettings({ notifEnabled: true })
        this.rescheduleSoon(200)
      }
    } catch { this.permission = 'unsupported' }
  }

  rescheduleSoon(ms = 4000) {
    if (!isNativeApp()) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.reschedule(), ms)
  }

  /** Replaces everything Omnia asked the phone to show with the next two weeks of reminders and summaries. */
  async reschedule() {
    if (!isNativeApp() || !app.vault) return
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const pending = await LocalNotifications.getPending()
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) })
      const s = app.settings
      if (!s.notifEnabled || this.permission !== 'granted') return
      const day = today()
      const summary = app.dueSummary({ type: 'all' })
      const plan = planNotifications({
        tasks: app.tasks, events: app.events, now: new Date(), days: DAYS_AHEAD,
        digestTime: s.digestTime, digestEmpty: s.digestEmpty, quietEnabled: s.quietEnabled, quietStart: s.quietStart, quietEnd: s.quietEnd,
        deadlineLeadDays: s.deadlineLeadDays, cardsDue: summary.learning + summary.review + summary.fresh, revisionsDue: dueRevisions(app.study.revisions, day).length
      })
      if (!plan.length) return
      await LocalNotifications.schedule({
        notifications: plan.map(p => ({
          id: notificationId(p.key), title: p.title, body: p.body, smallIcon: 'ic_stat_omnia',
          schedule: { at: p.at, allowWhileIdle: true }
        }))
      })
    } catch { /* the in-app notifications still work */ }
  }

  async notifyNow(title: string, body: string) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.schedule({ notifications: [{ id: notificationId(`test:${Date.now()}`), title, body, smallIcon: 'ic_stat_omnia', schedule: { at: new Date(Date.now() + 1500) } }] })
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ files

  /** Hands a file to the phone's share sheet (save to Files, send, open in another app). */
  async shareFile(name: string, data: string | Blob, type: string) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const blob = typeof data === 'string' ? new Blob([data], { type }) : data
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
    const safe = name.replace(/[\\/:*?"<>|]/g, '-')
    await Filesystem.writeFile({ path: safe, data: base64, directory: Directory.Cache })
    const { uri } = await Filesystem.getUri({ path: safe, directory: Directory.Cache })
    await Share.share({ title: safe, url: uri })
  }
}

export const native = new Native()
