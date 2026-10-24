<script lang="ts">
  import { onMount } from 'svelte'
  import { app, type View } from '../lib/app.svelte'
  import { today } from '../lib/dates'
  import { itemsInRange, overdue } from '../lib/tasks'
  import CalendarView from './CalendarView.svelte'
  import Help from './Help.svelte'
  import Icon from './Icon.svelte'
  import NotesView from './NotesView.svelte'
  import QuizModal from './QuizModal.svelte'
  import ReviewModal from './ReviewModal.svelte'
  import RightPanel from './RightPanel.svelte'
  import Settings from './Settings.svelte'
  import Sidebar from './Sidebar.svelte'
  import StudyView from './StudyView.svelte'
  import Switcher from './Switcher.svelte'
  import TasksView from './TasksView.svelte'
  import Toasts from './Toasts.svelte'

  const views: { id: View; icon: string; label: string }[] = [
    { id: 'notes', icon: 'notes', label: 'Notes' },
    { id: 'tasks', icon: 'check-square', label: 'Tasks' },
    { id: 'calendar', icon: 'calendar', label: 'Calendar' },
    { id: 'study', icon: 'study', label: 'Study' }
  ]

  const dueCards = $derived.by(() => {
    const s = app.dueSummary({ type: 'all' })
    return s.learning + s.review + s.fresh
  })
  const dueTasks = $derived.by(() => {
    const now = today()
    return overdue(app.tasks, now).length + itemsInRange(app.tasks, now, now).filter(i => !i.done).length
  })
  const badge = (id: View) => (id === 'study' ? dueCards : id === 'tasks' ? dueTasks : 0)

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && !e.shiftKey && !e.altKey && key === 'o') { e.preventDefault(); app.modal = { type: 'switcher' } }
    else if (mod && !e.shiftKey && !e.altKey && key === 'p') { e.preventDefault(); app.modal = { type: 'palette' } }
    else if (mod && e.shiftKey && key === 'f') { e.preventDefault(); app.view = 'notes'; app.leftOpen = true; app.sidebarTab = 'search' }
    else if (e.altKey && !mod && key === 'n') { e.preventDefault(); void app.createNote(app.currentFolder(), 'Untitled') }
    else if (e.altKey && !mod && key === 'd') { e.preventDefault(); void app.openDaily() }
    else if (e.altKey && !mod && e.key === 'ArrowLeft') { e.preventDefault(); app.goBack() }
    else if (e.altKey && !mod && e.key === 'ArrowRight') { e.preventDefault(); app.goForward() }
  }

  onMount(() => {
    const tick = () => { if (document.visibilityState === 'visible') void app.refresh() }
    const timer = setInterval(tick, 6000)
    const flush = () => { void app.flush() }
    window.addEventListener('focus', tick)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tick)
      window.removeEventListener('beforeunload', flush)
    }
  })

  const themeIcon = $derived(app.theme === 'dark' ? 'moon' : 'sun')
</script>

<svelte:window {onkeydown} />

<div class="shell">
  <nav class="ribbon" aria-label="Main">
    <div class="top">
      {#each views as v}
        <button class="icon-btn big" class:active={app.view === v.id} title={v.label} aria-label={v.label} onclick={() => (app.view = v.id)}>
          <Icon name={v.icon} size={21} />
          {#if badge(v.id)}<span class="badge">{badge(v.id) > 99 ? '99+' : badge(v.id)}</span>{/if}
        </button>
      {/each}
    </div>
    <div class="bottom">
      <button class="icon-btn" title="Theme: {app.theme}" onclick={() => app.setTheme(app.theme === 'auto' ? 'light' : app.theme === 'light' ? 'dark' : 'auto')}><Icon name={themeIcon} size={19} /></button>
      <button class="icon-btn" title="Command palette (Ctrl+P)" onclick={() => (app.modal = { type: 'palette' })}><Icon name="search" size={19} /></button>
      <button class="icon-btn" title="Settings" onclick={() => (app.modal = { type: 'settings' })}><Icon name="settings" size={19} /></button>
    </div>
  </nav>

  {#if app.view === 'notes' && app.leftOpen}<Sidebar />{/if}

  <main class="main">
    {#if app.indexing}
      <div class="indexing">Reading notes… {app.indexing.done} / {app.indexing.total}</div>
    {/if}
    {#if app.view === 'notes'}<NotesView />
    {:else if app.view === 'tasks'}<TasksView />
    {:else if app.view === 'calendar'}<CalendarView />
    {:else}<StudyView />{/if}
  </main>

  {#if app.view === 'notes' && app.rightOpen}<RightPanel />{/if}
</div>

{#if app.modal?.type === 'switcher'}<Switcher mode="notes" />{/if}
{#if app.modal?.type === 'palette'}<Switcher mode="commands" />{/if}
{#if app.modal?.type === 'settings'}<Settings />{/if}
{#if app.modal?.type === 'help'}<Help />{/if}
{#if app.modal?.type === 'review'}<ReviewModal scope={app.modal.scope} />{/if}
{#if app.modal?.type === 'quiz'}<QuizModal scope={app.modal.scope} />{/if}
<Toasts />

<style>
  .shell { display: flex; height: 100%; }
  .ribbon { width: var(--ribbon-w); flex: none; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 10px 0; background: var(--bg-side); border-right: 1px solid var(--border); }
  .top, .bottom { display: flex; flex-direction: column; gap: 4px; align-items: center; }
  .icon-btn.big { width: 40px; height: 40px; border-radius: 10px; position: relative; }
  .icon-btn.big.active { background: var(--accent); color: var(--on-accent); }
  .badge {
    position: absolute; top: -2px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px;
    background: var(--accent-strong); color: var(--on-accent); font-size: 10.5px; font-weight: 600; display: grid; place-items: center; border: 2px solid var(--bg-side);
    box-sizing: content-box;
  }
  .icon-btn.big.active .badge { background: var(--bg-raised); color: var(--accent-strong); border-color: var(--accent); }
  .main { flex: 1; min-width: 0; position: relative; }
  .indexing { position: absolute; z-index: 20; top: 10px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 5px 14px; border-radius: 99px; font-size: 12.5px; }
</style>
