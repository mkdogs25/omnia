<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, diffDays, endOfWeek, formatLong, formatWeekRange, fromISO, relativeLabel, startOfWeek, today, WEEKDAYS } from '../lib/dates'
  import { describeRecurrence } from '../lib/recurrence'
  import { parseQuickAdd } from '../lib/quickadd'
  import { completed, groupByWeek, itemsInRange, openCount, overdue, recurring, unplanned, withDeadlines, type Task } from '../lib/tasks'
  import { dueRevisions } from '../lib/study'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import TaskRow from './TaskRow.svelte'

  type Tab = 'today' | 'upcoming' | 'deadlines' | 'unplanned' | 'recurring' | 'done'

  let tab = $state<Tab>('upcoming')
  let days = $state(app.settings.upcomingDays || 14)
  let draft = $state('')
  let focused = $state(false)
  let addInput: HTMLInputElement | undefined = $state()

  try {
    const saved = localStorage.getItem('omnia:tasks-tab') as Tab | null
    if (saved && ['today', 'upcoming', 'deadlines', 'unplanned', 'recurring', 'done'].includes(saved)) tab = saved
  } catch { /* ignore */ }

  function setTab(t: Tab) {
    tab = t
    try { localStorage.setItem('omnia:tasks-tab', t) } catch { /* ignore */ }
  }

  const now = $derived(today())
  const parsed = $derived(draft.trim() ? parseQuickAdd(draft, now) : null)

  const late = $derived(overdue(app.tasks, now))
  const todayItems = $derived(itemsInRange(app.tasks, now, now).filter(i => !late.some(l => l.id === i.task.id)))
  const upcoming = $derived(itemsInRange(app.tasks, now, addDays(now, days)))
  const weeks = $derived(groupByWeek(upcoming, startOfWeek))
  const deadlineTasks = $derived(withDeadlines(app.tasks))
  const unplannedTasks = $derived(unplanned(app.tasks))
  const recurringTasks = $derived(recurring(app.tasks).sort((a, b) => a.title.localeCompare(b.title)))
  const doneTasks = $derived(completed(app.tasks))

  const revisionRows = $derived.by(() => {
    const m = new Map<string, string[]>()
    for (const p of dueRevisions(app.study.revisions, addDays(now, days))) {
      const d = app.study.revisions[p].due
      const key = d < now ? now : d
      m.set(key, [...(m.get(key) ?? []), p])
    }
    return m
  })

  const counts = $derived({
    today: late.length + todayItems.filter(i => !i.done).length,
    deadlines: deadlineTasks.length,
    unplanned: unplannedTasks.length,
    recurring: recurringTasks.length
  })

  const tabs = $derived<{ id: Tab; label: string; n?: number }[]>([
    { id: 'today', label: 'Today', n: counts.today },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'deadlines', label: 'Deadlines', n: counts.deadlines },
    { id: 'unplanned', label: 'Unplanned', n: counts.unplanned },
    { id: 'recurring', label: 'Recurring', n: counts.recurring },
    { id: 'done', label: 'Done' }
  ])

  /** Deadlines grouped the way people think about them. */
  const deadlineGroups = $derived.by(() => {
    const thisWeekEnd = endOfWeek(now)
    const nextWeekEnd = addDays(thisWeekEnd, 7)
    const groups: { title: string; tone?: string; tasks: Task[] }[] = [
      { title: 'Overdue', tone: 'late', tasks: [] }, { title: 'This week', tasks: [] },
      { title: 'Next week', tasks: [] }, { title: 'Later', tasks: [] }
    ]
    for (const t of deadlineTasks) {
      const d = t.deadline!
      groups[d < now ? 0 : d <= thisWeekEnd ? 1 : d <= nextWeekEnd ? 2 : 3].tasks.push(t)
    }
    return groups.filter(g => g.tasks.length)
  })

  const doneGroups = $derived.by(() => {
    const groups: { title: string; tasks: Task[] }[] = [{ title: 'Today', tasks: [] }, { title: 'Yesterday', tasks: [] }, { title: 'Earlier', tasks: [] }]
    for (const t of doneTasks) {
      const n = t.doneAt ? diffDays(t.doneAt, now) : 99
      groups[n <= 0 ? 0 : n === 1 ? 1 : 2].tasks.push(t)
    }
    return groups.filter(g => g.tasks.length)
  })

  function add() {
    const text = draft.trim()
    if (!text) return
    const p = parseQuickAdd(text, now)
    const due = p.due ?? (tab === 'today' && !p.deadline ? now : undefined)
    app.addTask({ title: p.title, due, deadline: p.deadline, recur: p.recur })
    draft = ''
    if (!due && !p.deadline && tab !== 'unplanned') app.toast('Added to Unplanned', { label: 'Show', run: () => setTab('unplanned') })
  }

  function openRevision(path: string) {
    app.openNote(path)
    app.rightOpen = true
    app.rightTab = 'revise'
  }

  function clearDone() {
    const removed = app.clearCompleted()
    if (removed.length) app.toast(`Cleared ${removed.length} completed task${removed.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => removed.forEach(t => app.restoreTask(t)) })
  }

  const dayNumber = (d: string) => fromISO(d).getDate()
  const dayName = (d: string) => WEEKDAYS[fromISO(d).getDay()]

  export function focusAdd() {
    addInput?.focus()
  }
</script>

{#snippet empty(icon: string, title: string, hint: string)}
  <div class="empty-state">
    <Icon name={icon} size={30} />
    <strong>{title}</strong>
    <span class="muted">{hint}</span>
  </div>
{/snippet}

<section class="tasks parchment">
  <div class="inner">
    <h1 class="page-title">Tasks <span class="count">{openCount(app.tasks)}</span></h1>

    <div class="tabs-pill" role="tablist">
      {#each tabs as t}
        <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => setTab(t.id)}>
          {t.label}{#if t.n}<span class="n">{t.n}</span>{/if}
        </button>
      {/each}
    </div>

    <form class="add" class:focused onsubmit={e => { e.preventDefault(); add() }}>
      <span class="plus" aria-hidden="true"><Icon name="plus" size={18} /></span>
      <input bind:this={addInput} bind:value={draft} placeholder="Add a task…" aria-label="Add task"
        onfocus={() => (focused = true)} onblur={() => (focused = false)} />
      {#if parsed && (parsed.due || parsed.deadline || parsed.recur)}
        <span class="preview">
          {#if parsed.due}<span class="pill accent"><Icon name="calendar" size={13} /> {relativeLabel(parsed.due, now)}</span>{/if}
          {#if parsed.deadline}<span class="pill accent"><Icon name="flag" size={13} /> {relativeLabel(parsed.deadline, now)}</span>{/if}
          {#if parsed.recur}<span class="pill accent"><Icon name="repeat" size={13} /> {describeRecurrence(parsed.recur, parsed.due)}</span>{/if}
        </span>
      {/if}
    </form>
    {#if focused && !draft}
      <p class="tip">Try “Essay <b>by friday</b>”, “Weekly revision <b>every saturday</b>” or “Lab report <b>tomorrow</b>, deadline <b>31 oct</b>”.</p>
    {/if}

    {#if tab === 'today' || tab === 'upcoming'}
      {#if late.length}
        <div class="block">
          <div class="block-head">
            <h2 class="section-title late">Overdue <span class="n2">{late.length}</span></h2>
            <button class="btn" onclick={() => app.rescheduleOverdue(now)}><Icon name="calendar" size={15} /> Move all to today</button>
          </div>
          <div class="items flat">
            {#each late as t (t.id)}<TaskRow task={t} date={t.due ?? t.deadline} done={false} label={relativeLabel((t.due ?? t.deadline)!, now)} />{/each}
          </div>
        </div>
      {/if}
    {/if}

    {#if tab === 'today'}
      <div class="block">
        {#if todayItems.length || revisionRows.get(now)?.length}
          <h2 class="section-title">Today</h2>
          <div class="items flat">
            {#each todayItems as it (it.task.id + it.date)}
              <TaskRow task={it.task} date={it.date} done={it.done} showDate={false} />
            {/each}
            {#each revisionRows.get(now) ?? [] as path (path)}
              <div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>
            {/each}
          </div>
        {:else if !late.length}
          {@render empty('circle-check', 'Nothing due today', 'Enjoy the space, or plan something for later.')}
        {/if}
      </div>

    {:else if tab === 'upcoming'}
      {#each weeks as week (week.start)}
        <div class="block">
          <h2 class="section-title">{formatWeekRange(week.start)}</h2>
          {#each week.days as day (day.date)}
            <div class="day">
              <div class="day-head">
                <span class="num">{dayNumber(day.date)}</span><span class="name">{dayName(day.date)}</span>
                {#if day.date === now}<span class="pill accent">Today</span>{:else if day.date === addDays(now, 1)}<span class="pill">Tomorrow</span>{/if}
              </div>
              <div class="items">
                {#each day.items as it (it.task.id + it.date)}
                  <TaskRow task={it.task} date={it.date} done={it.done} showDate={it.recurring} label={it.recurring ? describeRecurrence(it.task.recur!, it.task.due) : undefined} />
                {/each}
                {#each revisionRows.get(day.date) ?? [] as path (path)}
                  <div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/each}
      {#each [...revisionRows.entries()].filter(([d]) => d >= now && !weeks.some(w => w.days.some(x => x.date === d))).sort() as [date, paths] (date)}
        <div class="block">
          <h2 class="section-title">{formatWeekRange(startOfWeek(date))}</h2>
          <div class="day">
            <div class="day-head"><span class="num">{dayNumber(date)}</span><span class="name">{dayName(date)}</span></div>
            <div class="items">{#each paths as path (path)}<div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>{/each}</div>
          </div>
        </div>
      {/each}
      {#if !weeks.length && !late.length && !revisionRows.size}
        {@render empty('calendar', 'Nothing planned', 'Add a task with a date or a deadline and it will appear here.')}
      {:else}
        <button class="btn ghost more" onclick={() => (days += app.settings.upcomingDays || 14)}>Show more</button>
      {/if}

    {:else if tab === 'deadlines'}
      {#each deadlineGroups as g (g.title)}
        <div class="block">
          <h2 class="section-title" class:late={g.tone === 'late'}>{g.title}</h2>
          <div class="items flat">{#each g.tasks as t (t.id)}<TaskRow task={t} done={false} showDate={!!t.due} label={t.due ? `Do ${relativeLabel(t.due, now).toLowerCase()}` : undefined} />{/each}</div>
        </div>
      {:else}
        {@render empty('flag', 'No deadlines', 'Add one by typing “by friday” after a task, or set it when editing.')}
      {/each}

    {:else if tab === 'unplanned'}
      <div class="items flat">
        {#each unplannedTasks as t (t.id)}<TaskRow task={t} done={t.done} showDate={false} />
        {:else}{@render empty('inbox', 'Nothing unplanned', 'Tasks without a day or a deadline land here.')}{/each}
      </div>

    {:else if tab === 'recurring'}
      <div class="items flat">
        {#each recurringTasks as t (t.id)}<TaskRow task={t} done={false} label="{describeRecurrence(t.recur!, t.due)} · since {formatLong(t.due!)}" />
        {:else}{@render empty('repeat', 'No repeating tasks', 'Type “every tuesday” or “fortnightly” after a task to repeat it.')}{/each}
      </div>

    {:else}
      {#if doneTasks.length}<div class="done-bar"><button class="btn ghost" onclick={clearDone}><Icon name="trash" size={15} /> Clear completed</button></div>{/if}
      {#each doneGroups as g (g.title)}
        <div class="block">
          <h2 class="section-title">{g.title}</h2>
          <div class="items flat">{#each g.tasks as t (t.id)}<TaskRow task={t} done={true} showDate={false} />{/each}</div>
        </div>
      {:else}
        {@render empty('check-square', 'Nothing completed yet', 'Finished tasks are kept here until you clear them.')}
      {/each}
    {/if}
  </div>
</section>

<style>
  .tasks { height: 100%; overflow: auto; }
  .parchment { background: var(--parchment); }
  .inner { max-width: 960px; margin: 0 auto; padding: 48px 40px 120px; }
  .page-title { margin-bottom: 18px; }
  .count { color: var(--text-faint); margin-left: 6px; }
  .tabs-pill { margin-bottom: 18px; flex-wrap: wrap; }
  .tabs-pill .n { margin-left: 7px; font-size: var(--fs-xs); padding: 0 7px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); }
  .tabs-pill .on .n { background: rgba(255, 255, 255, 0.25); color: inherit; }

  .add { display: flex; align-items: center; gap: 10px; padding: 4px 14px; background: color-mix(in srgb, var(--bg-raised) 70%, transparent); border: 1px solid var(--border); border-radius: 12px; transition: border-color 0.12s, box-shadow 0.12s; }
  .add.focused { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--bg-raised); }
  .plus { color: var(--accent); display: inline-grid; }
  .add input { flex: 1; min-width: 0; font-size: var(--fs-lg); background: transparent; border: 0; outline: none; padding: 9px 0; }
  .add input::placeholder { color: var(--text-muted); }
  .preview { display: inline-flex; gap: 6px; }
  .tip { margin: 8px 0 0 6px; font-size: var(--fs-sm); color: var(--text-muted); }
  .tip b { font-weight: 600; color: var(--text); }

  .block { margin-top: 30px; }
  .block-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .block-head .section-title { margin: 0; }
  .section-title.late { color: var(--bad); }
  .n2 { font-family: var(--font-body); font-size: var(--fs-sm); font-weight: 500; color: var(--text-muted); margin-left: 6px; }
  .day { margin: 14px 0 0; }
  .day-head { display: flex; align-items: baseline; gap: 12px; font-size: var(--fs-xl); margin-bottom: 2px; }
  .day-head .num { width: 30px; color: var(--text-muted); text-align: right; }
  .day-head .pill { align-self: center; }
  .items { margin-left: 42px; padding-left: 14px; border-left: 1px solid var(--border-strong); display: grid; gap: 1px; }
  .items.flat { margin-left: 0; padding-left: 0; border-left: 0; }
  .rev { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 3px 8px 3px 6px; color: var(--text-muted); font-size: var(--fs-lg); }
  .rev button { color: var(--link); text-align: left; }
  .rev button:hover { text-decoration: underline; }
  .more { margin-top: 26px; }
  .done-bar { display: flex; justify-content: flex-end; margin-top: 12px; }
  .empty-state { display: grid; justify-items: start; gap: 4px; padding: 44px 6px; color: var(--text-faint); font-size: var(--fs-md); }
  .empty-state strong { font-size: var(--fs-lg); color: var(--text-muted); margin-top: 6px; }
</style>
