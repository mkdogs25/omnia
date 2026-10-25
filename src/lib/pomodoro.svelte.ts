import { app } from './app.svelte'
import { durationMs, formatClock, MODE_LABEL, nextMode, type PomoMode, type PomoSettings } from './pomodoro'
import { today } from './dates'

const KEY = 'omnia:pomodoro'

interface Saved {
  mode: PomoMode
  running: boolean
  endsAt: number
  remaining: number
  focusDone: number
  taskId: string | null
}

class Pomodoro {
  mode = $state<PomoMode>('focus')
  running = $state(false)
  /** Milliseconds left. While running this is refreshed every tick from `endsAt`. */
  remaining = $state(25 * 60_000)
  /** Focus sessions finished in the current cycle (resets after a long break). */
  focusDone = $state(0)
  taskId = $state<string | null>(null)

  private endsAt = 0
  private lastTotal = 25 * 60_000
  private timer: ReturnType<typeof setInterval> | undefined
  private audio: AudioContext | undefined
  private restored = false

  get settings(): PomoSettings {
    const s = app.settings
    return { focusMin: s.focusMin, shortMin: s.shortMin, longMin: s.longMin, longEvery: s.longEvery }
  }

  get total(): number {
    return durationMs(this.mode, this.settings)
  }

  /** 0 at the start of a session, 1 when it is finished. */
  get progress(): number {
    return Math.min(1, Math.max(0, 1 - this.remaining / this.total))
  }

  get label(): string {
    return formatClock(this.remaining)
  }

  get active(): boolean {
    return this.running || this.remaining < this.total
  }

  /** Call once the vault (and so the durations) are loaded. */
  restore() {
    if (this.restored) return
    this.restored = true
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return this.reset()
      const s = JSON.parse(raw) as Saved
      this.mode = s.mode
      this.focusDone = s.focusDone
      this.taskId = s.taskId
      if (s.running) {
        this.endsAt = s.endsAt
        this.remaining = s.endsAt - Date.now()
        this.running = true
        this.tick()
        if (this.running) this.startTimer()
      } else {
        this.remaining = Math.min(s.remaining, this.total)
        this.lastTotal = this.total
      }
    } catch {
      this.reset()
    }
  }

  start() {
    if (this.running) return
    this.prepareAudio()
    if (this.remaining <= 0) this.remaining = this.total
    this.endsAt = Date.now() + this.remaining
    this.running = true
    this.startTimer()
    this.persist()
    this.updateTitle()
    if (this.mode === 'focus' && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  }

  pause() {
    if (!this.running) return
    this.remaining = Math.max(0, this.endsAt - Date.now())
    this.running = false
    this.stopTimer()
    this.persist()
    this.updateTitle()
  }

  toggle() {
    if (this.running) this.pause()
    else this.start()
  }

  reset() {
    this.stopTimer()
    this.running = false
    this.remaining = this.lastTotal = this.total
    this.persist()
    this.updateTitle()
  }

  setMode(mode: PomoMode) {
    this.stopTimer()
    this.running = false
    this.mode = mode
    this.remaining = this.lastTotal = this.total
    this.persist()
    this.updateTitle()
  }

  /** Move straight on to the next session without counting this one. */
  skip() {
    const next = nextMode(this.mode, this.focusDone + (this.mode === 'focus' ? 1 : 0), this.settings.longEvery)
    if (this.mode === 'long') this.focusDone = 0
    this.setMode(next)
  }

  /** Re-applies durations after the user changes them in Settings (only when idle). */
  settingsChanged() {
    if (!this.running && this.remaining === this.lastTotal) this.remaining = this.total
    this.lastTotal = this.total
  }

  private startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), 250)
  }

  private stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private tick() {
    if (!this.running) return
    this.remaining = this.endsAt - Date.now()
    if (this.remaining <= 0) this.complete()
    else this.updateTitle()
  }

  private complete() {
    const finished = this.mode
    this.stopTimer()
    this.running = false
    if (finished === 'focus') {
      this.focusDone += 1
      app.logFocus(Math.round(this.settings.focusMin), this.taskId)
    }
    const next = nextMode(finished, this.focusDone, this.settings.longEvery)
    if (finished === 'long') this.focusDone = 0
    this.mode = next
    this.remaining = this.lastTotal = this.total
    this.chime()
    this.notify(finished, next)
    this.persist()
    this.updateTitle()
    if (app.settings.pomoAutoStart) this.start()
  }

  private notify(finished: PomoMode, next: PomoMode) {
    const done = finished === 'focus' ? 'Focus session complete' : `${MODE_LABEL[finished]} over`
    app.toast(`${done}. Up next: ${MODE_LABEL[next].toLowerCase()}.`)
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      new Notification(done, { body: `Up next: ${MODE_LABEL[next].toLowerCase()}`, tag: 'omnia-pomodoro' })
    }
  }

  private prepareAudio() {
    if (!app.settings.pomoSound) return
    try {
      this.audio ??= new AudioContext()
      void this.audio.resume()
    } catch { /* audio unavailable */ }
  }

  private chime() {
    if (!app.settings.pomoSound || !this.audio) return
    const ctx = this.audio
    const t0 = ctx.currentTime
    ;[880, 1108.7, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + i * 0.18)
      osc.stop(t0 + i * 0.18 + 0.55)
    })
  }

  private updateTitle() {
    document.title = this.running ? `${this.label} · ${MODE_LABEL[this.mode]} – Omnia` : 'Omnia'
  }

  private persist() {
    try {
      const s: Saved = { mode: this.mode, running: this.running, endsAt: this.endsAt, remaining: this.remaining, focusDone: this.focusDone, taskId: this.taskId }
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch { /* ignore */ }
  }

  setTask(id: string | null) {
    this.taskId = id
    this.persist()
  }

  /** Focus minutes logged today, for display. */
  get minutesToday(): number {
    return app.study.focus[today()] ?? 0
  }
}

export const pomodoro = new Pomodoro()
