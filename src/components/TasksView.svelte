<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, formatLong, formatWeekRange, startOfWeek, today, WEEKDAYS, fromISO, relativeLabel } from '../lib/dates'
  import { describeRecurrence } from '../lib/recurrence'
  import { parseQuickAdd } from '../lib/quickadd'
  import { completed, groupByWeek, itemsInRange, openCount, overdue, recurring, unplanned } from '../lib/tasks'
  import { dueRevisions } from '../lib/study'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import TaskRow from './TaskRow.svelte'

  type Tab = 'today' | 'upcoming' | 'unplanned' | 'recurrences' | 'done'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'unplanned', label: 'Unplanned' },
    { id: 'recurrences', label: 'Recurrences' },
    { id: 'done', label: 'Done' }
  ]

  let tab = $state<Tab>('upcoming')
  let weeksAhead = $state(8)
  let draft = $state('')
  let addInput: HTMLInputElement | undefined = $state()

  const now = $derived(today())
  const parsed = $derived(draft.trim() ? parseQuickAdd(draft, now) : null)
  const late = $derived(overdue(app.tasks, now))
  const unplannedTasks = $derived(unplanned(app.tasks))
  const recurringTasks = $derived(recurring(app.tasks).sort((a, b) => a.title.localeCompare(b.title)))
  const doneTasks = $derived(completed(app.tasks))
  const todayItems = $derived(itemsInRange(app.tasks, now, now))
  const weeks = $derived(groupByWeek(itemsInRange(app.tasks, now, addDays(now, weeksAhead * 7)), startOfWeek))
  const revisions = $derived(dueRevisions(app.study.revisions, addDays(now, weeksAhead * 7)))
  const revisionsByDate = $derived.by(() => {
    const m = new Map<string, string[]>()
    for (const p of revisions) {
      const d = app.study.revisions[p].due
      const key = d < now ? now : d
      m.set(key, [...(m.get(key) ?? []), p])
    }
    return m
  })

  function add() {
    const text = draft.trim()
    if (!text) return
    const p = parseQuickAdd(text, now)
    const due = p.due ?? (tab === 'today' ? now : undefined)
    app.addTask({ title: p.title, due, recur: p.recur })
    draft = ''
    if (!due && tab !== 'unplanned') app.toast('Added to Unplanned (no date set)')
  }

  function openRevision(path: string) {
    app.openNote(path)
    app.rightOpen = true
    app.rightTab = 'revise'
  }

  const dayNumber = (d: string) => fromISO(d).getDate()

  export function focusAdd() {
    addInput?.focus()
  }
</script>

<section class="tasks parchment">
  <div class="inner">
    <h1 class="page-title">Tasks <span class="count">{openCount(app.tasks)}</span></h1>

    <div class="tabs-pill" role="tablist">
      {#each tabs as t}
        <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>

    <form class="add" onsubmit={e => { e.preventDefault(); add() }}>
      <span class="checkbox ghost" aria-hidden="true"></span>
      <input bind:this={addInput} bind:value={draft} placeholder="Add task" aria-label="Add task" />
      {#if parsed && (parsed.due || parsed.recur)}
        <span class="preview">
          {#if parsed.due}<span class="pill accent"><Icon name="calendar" size={13} /> {relativeLabel(parsed.due, now)}</span>{/if}
          {#if parsed.recur}<span class="pill accent"><Icon name="repeat" size={13} /> {describeRecurrence(parsed.recur, parsed.due)}</span>{/if}
        </span>
      {/if}
    </form>
    <p class="tip">Try “Weekly revision every saturday” or “Hand in essay 31 oct”. Press Enter to add.</p>

    {#if tab === 'upcoming'}
      {#if late.length}
        <div class="week">
          <h2 class="section-title late">Overdue</h2>
          <div class="day"><div class="items">
            {#each late as t (t.id)}<TaskRow task={t} date={t.due} done={false} label={relativeLabel(t.due!, now)} />{/each}
          </div></div>
        </div>
      {/if}
      {#each weeks as week (week.start)}
        <div class="week">
          <h2 class="section-title">{formatWeekRange(week.start)}</h2>
          {#each week.days as day (day.date)}
            <div class="day">
              <div class="day-head"><span class="num">{dayNumber(day.date)}</span><span class="name">{WEEKDAYS[fromISO(day.date).getDay()]}</span></div>
              <div class="items">
                {#each day.items as it (it.task.id + it.date)}
                  <TaskRow task={it.task} date={it.date} done={it.done} />
                {/each}
                {#each revisionsByDate.get(day.date) ?? [] as path (path)}
                  <div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>
                {/each}
              </div>
            </div>
          {/each}
          <hr />
        </div>
      {/each}
      {#each [...revisionsByDate.entries()].filter(([d]) => !weeks.some(w => w.days.some(x => x.date === d))).sort() as [date, paths] (date)}
        <div class="week">
          <h2 class="section-title">{formatWeekRange(startOfWeek(date))}</h2>
          <div class="day">
            <div class="day-head"><span class="num">{dayNumber(date)}</span><span class="name">{WEEKDAYS[fromISO(date).getDay()]}</span></div>
            <div class="items">
              {#each paths as path (path)}<div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>{/each}
            </div>
          </div>
        </div>
      {/each}
      {#if !weeks.length && !late.length && !revisionsByDate.size}
        <div class="empty">Nothing planned. Add a task with a date and it will appear here.</div>
      {:else}
        <button class="btn ghost more" onclick={() => (weeksAhead += 8)}>Show more weeks</button>
      {/if}
    {:else if tab === 'today'}
      <div class="plain">
        {#each late as t (t.id)}<TaskRow task={t} date={t.due} done={false} label={relativeLabel(t.due!, now)} />{/each}
        {#each todayItems as it (it.task.id + it.date)}<TaskRow task={it.task} date={it.date} done={it.done} showDate={!it.recurring} label={it.recurring ? describeRecurrence(it.task.recur!, it.task.due) : 'Today'} />{/each}
        {#each revisionsByDate.get(now) ?? [] as path (path)}
          <div class="rev"><Icon name="repeat" size={16} /><button onclick={() => openRevision(path)}>Revise {noteTitle(path)}</button></div>
        {/each}
        {#if !late.length && !todayItems.length && !(revisionsByDate.get(now)?.length)}<div class="empty">Nothing due today.</div>{/if}
      </div>
    {:else if tab === 'unplanned'}
      <div class="plain">
        {#each unplannedTasks as t (t.id)}<TaskRow task={t} done={t.done} showDate={false} />{:else}<div class="empty">No unplanned tasks.</div>{/each}
      </div>
    {:else if tab === 'recurrences'}
      <div class="plain">
        {#each recurringTasks as t (t.id)}
          <TaskRow task={t} done={false} label="{describeRecurrence(t.recur!, t.due)} · from {formatLong(t.due!)}" />
        {:else}<div class="empty">No repeating tasks. Add one with “every tuesday” or “fortnightly”.</div>{/each}
      </div>
    {:else}
      <div class="plain">
        {#each doneTasks as t (t.id)}<TaskRow task={t} done={true} label={t.doneAt ? `Done ${relativeLabel(t.doneAt, now)}` : ''} />{:else}<div class="empty">Nothing completed yet.</div>{/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .tasks { height: 100%; overflow: auto; }
  .parchment { background: var(--parchment); }
  .inner { max-width: 960px; margin: 0 auto; padding: 48px 40px 120px; }
  .count { color: var(--text-faint); margin-left: 6px; }
  .tabs-pill { margin-bottom: 22px; }
  .add { display: flex; align-items: center; gap: 14px; padding: 4px 6px; }
  .add input { flex: 1; min-width: 0; font-size: var(--fs-lg); background: transparent; border: 0; outline: none; padding: 6px 0; }
  .add input::placeholder { color: var(--text-muted); }
  .checkbox.ghost { display: inline-block; }
  .preview { display: inline-flex; gap: 6px; }
  .tip { margin: 2px 0 18px 38px; font-size: var(--fs-xs); color: var(--text-faint); }
  .week { margin-top: 26px; }
  h2.late { color: var(--bad); }
  .day { margin: 18px 0; }
  .day-head { display: flex; align-items: baseline; gap: 14px; font-size: var(--fs-xl); margin-bottom: 4px; }
  .day-head .num { width: 34px; color: var(--text-muted); text-align: right; }
  .items { margin-left: 46px; padding-left: 18px; border-left: 1px solid var(--border-strong); display: grid; gap: 2px; }
  .week > .day:only-child .items, h2.late + .day .items { margin-left: 0; }
  hr { border: 0; border-top: 1px solid var(--border-strong); margin: 28px 0 0; opacity: 0.6; }
  .plain { display: grid; gap: 2px; }
  .rev { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 4px 6px; color: var(--text-muted); font-size: var(--fs-lg); }
  .rev button { color: var(--link); text-align: left; }
  .rev button:hover { text-decoration: underline; }
  .more { margin-top: 20px; }
  .empty { font-size: var(--fs-lg); padding: 40px 0; color: var(--text-muted); text-align: left; place-items: start; }
</style>
