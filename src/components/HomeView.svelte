<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, formatLong, formatShort, formatTime, relativeLabel, today } from '../lib/dates'
  import { activeMistakes, toQuestion } from '../lib/mistakes'
  import { pomodoro } from '../lib/pomodoro.svelte'
  import { parseQuickAdd } from '../lib/quickadd'
  import { dueRevisions, streak } from '../lib/study'
  import { deadlineStatus, eventsInRange, itemsInRange, overdue, withDeadlines } from '../lib/tasks'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import TaskRow from './TaskRow.svelte'

  const now = $derived(today())
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const late = $derived(overdue(app.tasks, now))
  const todayItems = $derived(itemsInRange(app.tasks, now, now).filter(i => !late.some(l => l.id === i.task.id)))
  const deadlines = $derived(withDeadlines(app.tasks).filter(t => t.deadline! <= addDays(now, 30)).slice(0, 6))
  const events = $derived(eventsInRange(app.events, now, addDays(now, 1)).sort((a, b) => a.on.localeCompare(b.on) || (a.start ?? '').localeCompare(b.start ?? '')))
  const summary = $derived(app.dueSummary({ type: 'all' }))
  const dueCards = $derived(summary.learning + summary.review + summary.fresh)
  const revise = $derived(dueRevisions(app.study.revisions, now))
  const mistakes = $derived(activeMistakes(app.mistakes))
  const run = $derived(streak(app.study.log, now))
  const recent = $derived(app.recentNotes(6))
  const widgets = $derived(app.settings.homeWidgets.filter(w => w.on))
  const doneToday = $derived(app.tasks.filter(t => t.done && t.doneAt?.slice(0, 10) === now).length)

  let draft = $state('')
  function capture() {
    const text = draft.trim()
    if (!text) return
    const p = parseQuickAdd(text, now)
    app.addTask({ title: p.title, due: p.due ?? (p.deadline ? undefined : now), deadline: p.deadline, recur: p.recur })
    draft = ''
  }

  const go = (v: 'tasks' | 'calendar' | 'study' | 'notes') => () => { app.view = v }
</script>

<section class="home parchment">
  <div class="inner">
    <header>
      <p class="eyebrow">{formatLong(now)}</p>
      <h1 class="page-title">{greeting}</h1>
    </header>

    <form class="cap" onsubmit={e => { e.preventDefault(); capture() }}>
      <Icon name="plus" size={18} />
      <input class="bare" bind:value={draft} placeholder="Add a task for today… “Essay by friday”" aria-label="Quick add a task" />
      <button class="btn primary" type="submit" disabled={!draft.trim()}>Add</button>
      <button class="btn" type="button" title="Capture a note or flashcard" onclick={() => (app.modal = { type: 'capture' })}><Icon name="inbox2" size={15} /> More</button>
    </form>

    <div class="grid">
      {#each widgets as w (w.id)}
        {#if w.id === 'today'}
          <div class="card wide">
            <div class="head"><h2 class="section-title">Today</h2><button class="link" onclick={go('tasks')}>All tasks</button></div>
            {#each late as t (t.id)}<TaskRow task={t} date={t.due ?? t.deadline} done={false} label={relativeLabel((t.due ?? t.deadline)!, now)} compact />{/each}
            {#each todayItems as it (it.task.id + (it.date ?? ''))}<TaskRow task={it.task} date={it.date} done={it.done} showDate={false} compact />{/each}
            {#if !late.length && !todayItems.length}
              <p class="empty">{doneToday ? `All clear — ${doneToday} done today.` : 'Nothing planned for today.'}</p>
            {/if}
          </div>
        {:else if w.id === 'deadlines'}
          <div class="card">
            <div class="head"><h2 class="section-title">Deadlines</h2><button class="link" onclick={go('tasks')}>See all</button></div>
            {#each deadlines as t (t.id)}
              {@const s = deadlineStatus(t.deadline!, now, app.settings.deadlineLeadDays)}
              <div class="line"><span class="grow truncate">{t.title}</span><span class="chip {s.tone}">{s.label}</span></div>
            {:else}<p class="empty">No deadlines in the next 30 days.</p>{/each}
          </div>
        {:else if w.id === 'study'}
          <div class="card">
            <div class="head"><h2 class="section-title">Study</h2><button class="link" onclick={go('study')}>Open</button></div>
            <div class="big"><strong>{dueCards}</strong> <span class="muted">card{dueCards === 1 ? '' : 's'} ready</span></div>
            <div class="row">
              <button class="btn primary" disabled={!dueCards} onclick={() => (app.modal = { type: 'review', scope: { type: 'all' } })}><Icon name="play" size={14} /> Review</button>
              <button class="btn" disabled={!mistakes.length} onclick={() => (app.modal = { type: 'quiz', scope: { type: 'all' }, preset: mistakes.map(toQuestion), title: 'Mistakes' })}>Mistakes <span class="n">{mistakes.length}</span></button>
            </div>
            <p class="meta"><Icon name="flame" size={13} /> {run} day streak</p>
          </div>
        {:else if w.id === 'revise'}
          <div class="card">
            <div class="head"><h2 class="section-title">To revise</h2></div>
            {#each revise.slice(0, 5) as p (p)}
              <button class="line link-row" onclick={() => { app.openNote(p); app.rightOpen = true; app.rightTab = 'revise' }}><Icon name="repeat" size={14} /><span class="grow truncate">{noteTitle(p)}</span></button>
            {:else}<p class="empty">No notes due for revision.</p>{/each}
          </div>
        {:else if w.id === 'events'}
          <div class="card">
            <div class="head"><h2 class="section-title">Coming up</h2><button class="link" onclick={go('calendar')}>Calendar</button></div>
            {#each events as e (e.id + e.on)}
              <div class="line"><span class="when">{e.on === now ? 'Today' : 'Tomorrow'}{e.start ? ` ${formatTime(e.start)}` : ''}</span><span class="grow truncate">{e.title}</span></div>
            {:else}<p class="empty">No events today or tomorrow.</p>{/each}
          </div>
        {:else if w.id === 'recent'}
          <div class="card">
            <div class="head"><h2 class="section-title">Recent notes</h2><button class="link" onclick={() => (app.modal = { type: 'switcher' })}>Search</button></div>
            {#each recent as p (p)}
              <button class="line link-row" onclick={() => app.openNote(p)}><Icon name="file" size={14} /><span class="grow truncate">{noteTitle(p)}</span></button>
            {:else}<p class="empty">Notes you open will show up here.</p>{/each}
            <div class="row"><button class="btn" onclick={() => void app.openDaily()}><Icon name="sunrise" size={14} /> Today's note</button><button class="btn" onclick={() => void app.createNote(app.currentFolder(), 'Untitled')}><Icon name="new-note" size={14} /> New</button></div>
          </div>
        {:else if w.id === 'focus'}
          <div class="card">
            <div class="head"><h2 class="section-title">Focus</h2></div>
            <div class="big"><strong>{app.study.focus[now] ?? 0}</strong> <span class="muted">minutes today</span></div>
            <div class="row"><button class="btn" onclick={() => { app.pomodoroOpen = true; if (!pomodoro.running) pomodoro.toggle() }}><Icon name="timer" size={14} /> {pomodoro.running ? 'Timer running' : 'Start a session'}</button></div>
          </div>
        {/if}
      {/each}
    </div>
    {#if !widgets.length}<p class="empty">Every card is switched off. Choose some under Settings → Tools and home.</p>{/if}
  </div>
</section>

<style>
  .home { height: 100%; overflow: auto; background: var(--parchment); }
  .inner { max-width: 1000px; margin: 0 auto; padding: 48px 40px 120px; display: grid; gap: 22px; align-content: start; }
  header .page-title { margin: 0; }
  .cap { display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 16px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 14px; }
  .cap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .bare { flex: 1; border: 0; outline: 0; background: transparent; font-size: var(--fs-lg); min-width: 0; padding: 6px 0; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; display: grid; gap: 6px; align-content: start; min-width: 0; }
  .card.wide { grid-column: 1 / -1; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .head .section-title { margin: 0; }
  .link { color: var(--link); font-size: var(--fs-sm); }
  .line { display: flex; align-items: center; gap: 10px; padding: 5px 4px; border-radius: 8px; font-size: var(--fs-md); min-width: 0; }
  .link-row { text-align: left; width: 100%; }
  .link-row:hover { background: var(--bg-hover); }
  .link-row :global(svg) { color: var(--text-muted); flex: none; }
  .when { font-size: var(--fs-sm); color: var(--text-muted); min-width: 92px; }
  .chip { font-size: var(--fs-xs); padding: 1px 9px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); white-space: nowrap; }
  .chip.overdue, .chip.today { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .chip.soon { background: color-mix(in srgb, var(--warn) 22%, transparent); }
  .big strong { font-family: var(--font-heading); font-size: 40px; line-height: 1.1; color: var(--accent-strong); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
  .meta { margin: 6px 0 0; display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--text-muted); }
  .n { margin-left: 4px; font-size: var(--fs-xs); background: var(--accent); color: var(--on-accent); border-radius: 99px; padding: 0 7px; }
  .empty { margin: 4px 0; color: var(--text-faint); font-size: var(--fs-md); }
</style>
