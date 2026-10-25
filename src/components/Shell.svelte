<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { app, type View } from '../lib/app.svelte'
  import { setWeekStart, today } from '../lib/dates'
  import { actionFor } from '../lib/shortcuts'
  import { TOOLS, type ToolId } from '../lib/settings'
  import { itemsInRange, overdue } from '../lib/tasks'
  import { notifier } from '../lib/notify.svelte'
  import { pomodoro } from '../lib/pomodoro.svelte'
  import AutoGenModal from './AutoGenModal.svelte'
  import CalendarView from './CalendarView.svelte'
  import CaptureModal from './CaptureModal.svelte'
  import GraphModal from './GraphModal.svelte'
  import Help from './Help.svelte'
  import HistoryModal from './HistoryModal.svelte'
  import HomeView from './HomeView.svelte'
  import Icon from './Icon.svelte'
  import NotesView from './NotesView.svelte'
  import NotificationCentre from './NotificationCentre.svelte'
  import PomodoroPanel from './PomodoroPanel.svelte'
  import QuizModal from './QuizModal.svelte'
  import ReviewModal from './ReviewModal.svelte'
  import RightPanel from './RightPanel.svelte'
  import SettingsView from './SettingsView.svelte'
  import Sidebar from './Sidebar.svelte'
  import StudyView from './StudyView.svelte'
  import Switcher from './Switcher.svelte'
  import TasksView from './TasksView.svelte'
  import TemplateModal from './TemplateModal.svelte'
  import TrashModal from './TrashModal.svelte'
  import Toasts from './Toasts.svelte'

  const dueCards = $derived.by(() => {
    const s = app.dueSummary({ type: 'all' })
    return s.learning + s.review + s.fresh
  })
  const dueTasks = $derived.by(() => {
    const now = today()
    return overdue(app.tasks, now).length + itemsInRange(app.tasks, now, now).filter(i => !i.done).length
  })
  const badge = (id: ToolId) => (id === 'study' ? dueCards : id === 'tasks' ? dueTasks : 0)

  // Changing the session lengths in Settings updates an idle timer straight away.
  $effect(() => {
    app.settings.focusMin; app.settings.shortMin; app.settings.longMin; app.settings.longEvery
    untrack(() => pomodoro.settingsChanged())
  })

  // The week start must be known before any view renders.
  $effect.pre(() => setWeekStart(app.settings.weekStart === 'sun' ? 0 : 1))

  const isView = (id: ToolId): id is View & ToolId => ['home', 'notes', 'tasks', 'calendar', 'study'].includes(id)

  function cycleTheme() {
    app.setTheme(app.theme === 'auto' ? 'light' : app.theme === 'light' ? 'dark' : 'auto')
  }

  function runTool(id: ToolId) {
    if (isView(id)) app.view = id
    else if (id === 'graph') app.modal = { type: 'graph' }
    else if (id === 'capture') app.modal = { type: 'capture' }
    else if (id === 'notifications') notifier.open = !notifier.open
    else if (id === 'timer') app.pomodoroOpen = !app.pomodoroOpen
    else if (id === 'theme') cycleTheme()
    else if (id === 'commands') app.modal = { type: 'palette' }
  }

  const go = (v: View) => () => { app.view = v }
  const actions: Record<string, () => void> = {
    switcher: () => { app.modal = { type: 'switcher' } },
    palette: () => { app.modal = { type: 'palette' } },
    search: () => { app.view = 'notes'; app.leftOpen = true; app.sidebarTab = 'search' },
    back: () => app.goBack(),
    forward: () => app.goForward(),
    goHome: go('home'), goNotes: go('notes'), goTasks: go('tasks'), goCalendar: go('calendar'), goStudy: go('study'),
    settings: () => app.openSettings(),
    newNote: () => void app.createNote(app.currentFolder(), 'Untitled'),
    daily: () => void app.openDaily(),
    capture: () => { app.modal = { type: 'capture' } },
    pomodoro: () => { app.pomodoroOpen = !app.pomodoroOpen },
    focusMode: () => { app.view = 'notes'; app.focusMode = !app.focusMode }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && app.focusMode && !app.modal) {
      app.focusMode = false
      return
    }
    const id = actionFor(e, app.settings.shortcuts)
    if (id && actions[id]) {
      e.preventDefault()
      actions[id]()
      return
    }
    // Ctrl/Cmd+K opens the palette too, except inside the editor where it wraps a selection as a link.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !(e.target as HTMLElement).closest?.('.cm-editor')) {
      e.preventDefault()
      app.modal = { type: 'palette' }
    }
  }

  onMount(() => {
    pomodoro.restore()
    notifier.start()
    const tick = () => { if (document.visibilityState === 'visible') void app.refresh() }
    const timer = setInterval(tick, 6000)
    const flush = () => { void app.flush() }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('focus', tick)
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      notifier.stop()
      clearInterval(timer)
      window.removeEventListener('focus', tick)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  })

  const themeIcon = $derived(app.theme === 'dark' ? 'moon' : 'sun')
  const showRight = $derived(!app.focusMode && app.view === 'notes' && app.rightOpen)
</script>

<svelte:window {onkeydown} />

<div class="shell" class:focus={app.focusMode}>
  {#if !app.focusMode}
    <nav class="ribbon" aria-label="Main">
      <div class="top">
        {#each app.settings.ribbonTop as id (id)}
          <button class="icon-btn big" class:active={isView(id) && app.view === id} title={TOOLS[id].label} aria-label={TOOLS[id].label} onclick={() => runTool(id)}>
            <Icon name={TOOLS[id].icon} size={21} />
            {#if badge(id)}<span class="badge">{badge(id) > 99 ? '99+' : badge(id)}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="bottom">
        {#each app.settings.ribbonBottom as id (id)}
          {#if id === 'notifications'}
            <button class="icon-btn bell-btn" class:active={notifier.open} data-notif-toggle title="Notifications" aria-label="Notifications" onclick={() => runTool(id)}>
              <Icon name="bell" size={19} />
              {#if notifier.unread}<span class="badge small">{notifier.unread > 9 ? '9+' : notifier.unread}</span>{/if}
            </button>
          {:else if id === 'timer'}
            <button class="icon-btn pomo-btn" class:active={app.pomodoroOpen || pomodoro.running} data-pomo-toggle title="Pomodoro timer" aria-label="Pomodoro timer" onclick={() => runTool(id)}>
              <Icon name="timer" size={19} />
              {#if pomodoro.active}<span class="pomo-time" class:live={pomodoro.running}>{pomodoro.label}</span>{/if}
            </button>
          {:else if id === 'theme'}
            <button class="icon-btn" title="Theme: {app.theme}" aria-label="Switch theme" onclick={() => runTool(id)}><Icon name={themeIcon} size={19} /></button>
          {:else}
            <button class="icon-btn" title={TOOLS[id].label} aria-label={TOOLS[id].label} onclick={() => runTool(id)}><Icon name={TOOLS[id].icon} size={19} /></button>
          {/if}
        {/each}
        <button class="icon-btn" class:active={app.view === 'settings'} title="Settings" aria-label="Settings" onclick={() => app.openSettings()}><Icon name="settings" size={19} /></button>
      </div>
    </nav>
  {/if}

  {#if !app.focusMode && app.view === 'notes' && app.leftOpen}<Sidebar />{/if}

  <main class="main">
    {#if app.indexing}
      <div class="indexing">Reading notes… {app.indexing.done} / {app.indexing.total}</div>
    {/if}
    {#key app.settings.weekStart}
      {#if app.view === 'notes'}<NotesView />
      {:else if app.view === 'tasks'}<TasksView />
      {:else if app.view === 'calendar'}<CalendarView />
      {:else if app.view === 'home'}<HomeView />
      {:else if app.view === 'settings'}<SettingsView />
      {:else}<StudyView />{/if}
    {/key}
    {#if app.focusMode}
      <button class="exit-focus" onclick={() => (app.focusMode = false)}><Icon name="maximize" size={14} /> Exit focus mode <kbd>Esc</kbd></button>
    {/if}
  </main>

  {#if showRight}
    <div class="rp" class:left={app.settings.rightSide === 'left'} style:order={app.settings.rightSide === 'left' ? 2 : 4}><RightPanel /></div>
  {/if}
</div>

{#if app.pomodoroOpen}<PomodoroPanel />{/if}
{#if notifier.open}<NotificationCentre />{/if}
{#if app.modal?.type === 'switcher'}<Switcher mode="notes" />{/if}
{#if app.modal?.type === 'palette'}<Switcher mode="commands" />{/if}
{#if app.modal?.type === 'help'}<Help />{/if}
{#if app.modal?.type === 'review'}<ReviewModal scope={app.modal.scope} />{/if}
{#if app.modal?.type === 'quiz'}<QuizModal scope={app.modal.scope} auto={app.modal.auto} preset={app.modal.preset} title={app.modal.title} />{/if}
{#if app.modal?.type === 'history'}<HistoryModal path={app.modal.path} />{/if}
{#if app.modal?.type === 'trash'}<TrashModal />{/if}
{#if app.modal?.type === 'template'}<TemplateModal />{/if}
{#if app.modal?.type === 'autogen'}<AutoGenModal path={app.modal.path} />{/if}
{#if app.modal?.type === 'capture'}<CaptureModal />{/if}
{#if app.modal?.type === 'graph'}<GraphModal />{/if}
<Toasts />

<style>
  .shell { display: flex; height: 100%; }
  .shell > :global(.sidebar) { order: 1; }
  .main { order: 3; }
  .ribbon { order: 0; width: var(--ribbon-w); flex: none; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 10px 0; background: var(--bg-side); border-right: 1px solid var(--border); }
  .top, .bottom { display: flex; flex-direction: column; gap: 4px; align-items: center; }
  .icon-btn.big { width: 40px; height: 40px; border-radius: 10px; position: relative; }
  .icon-btn.big.active { background: var(--accent); color: var(--on-accent); }
  .badge {
    position: absolute; top: -2px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px;
    background: var(--accent-strong); color: var(--on-accent); font-size: 10.5px; font-weight: 600; display: grid; place-items: center; border: 2px solid var(--bg-side);
    box-sizing: content-box;
  }
  .icon-btn.big.active .badge { background: var(--bg-raised); color: var(--accent-strong); border-color: var(--accent); }
  .bell-btn { position: relative; }
  .badge.small { top: 0; right: 0; min-width: 14px; height: 14px; font-size: 9.5px; border-width: 1.5px; }
  .pomo-btn { position: relative; height: 44px; flex-direction: column; gap: 0; }
  .pomo-time { font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1; color: var(--text-muted); margin-top: -1px; }
  .pomo-time.live { color: var(--accent-strong); font-weight: 600; }
  .main { flex: 1; min-width: 0; position: relative; }
  .rp { display: flex; }
  .rp.left :global(.right) { border-left: 0; border-right: 1px solid var(--border); }
  .indexing { position: absolute; z-index: 20; top: 10px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 5px 14px; border-radius: 99px; font-size: var(--fs-sm); }
  .exit-focus {
    position: absolute; z-index: 30; top: 12px; right: 16px; display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 99px;
    background: var(--bg-raised); border: 1px solid var(--border-strong); font-size: var(--fs-sm); color: var(--text-muted); opacity: 0.35; transition: opacity 0.15s;
  }
  .exit-focus:hover, .exit-focus:focus-visible { opacity: 1; }
</style>
