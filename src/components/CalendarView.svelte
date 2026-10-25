<script lang="ts">
  import { app } from '../lib/app.svelte'
  import {
    addDays, addMonths, diffDays, formatLong, formatTime, fromISO, monthGrid, monthTitle, startOfMonth,
    startOfWeek, today, toISO, weekdayOrder, WEEKDAYS, MONTHS, type ISODate
  } from '../lib/dates'
  import { describeRecurrence, type Recurrence } from '../lib/recurrence'
  import { parseQuickAdd } from '../lib/quickadd'
  import { forecast, dueRevisions } from '../lib/study'
  import { eventsInRange, itemsInRange, overdue, withDeadlines, type CalEvent } from '../lib/tasks'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import TaskRow from './TaskRow.svelte'

  const COLORS = ['#d95c3a', '#5f8a3c', '#3f7ca8', '#8a5fa8', '#c98a12']
  const MAX_CHIPS = 3

  let mode = $state<'month' | 'week'>('month')
  let selected = $state<ISODate>(today())
  let cursor = $state<ISODate>(today())
  let editing = $state<CalEvent | null>(null)
  let quick = $state('')
  let dragOver = $state<ISODate | null>(null)

  const now = $derived(today())
  const days = $derived(
    mode === 'month' ? monthGrid(cursor) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))
  )
  const from = $derived(days[0])
  const to = $derived(days[days.length - 1])

  const taskItems = $derived(itemsInRange(app.tasks, from, to))
  const deadlineTasks = $derived(withDeadlines(app.tasks).filter(t => t.deadline! >= from && t.deadline! <= to))
  const evs = $derived(eventsInRange(app.events, from, to))
  const cards = $derived(app.allCards())
  const cardForecast = $derived(forecast(cards, app.study.cards, now, 120))
  const revs = $derived(dueRevisions(app.study.revisions, to))

  function chipsFor(day: ISODate) {
    const tasks = taskItems.filter(i => i.date === day).map(i => ({ kind: 'task' as const, key: 't' + i.task.id + day, item: i }))
    const events = evs.filter(e => e.on === day).map(e => ({ kind: 'event' as const, key: 'e' + e.id + day, ev: e }))
    // A deadline gets its own flag unless the task is already planned for that same day.
    const flags = deadlineTasks.filter(t => t.deadline === day && t.due !== day).map(t => ({ kind: 'deadline' as const, key: 'd' + t.id + day, task: t }))
    return [...flags, ...events, ...tasks]
  }

  const cardsOn = (day: ISODate) => {
    const off = diffDays(now, day)
    if (off < 0 || off >= cardForecast.length) return 0
    return cardForecast[off]
  }
  const revsOn = (day: ISODate) => revs.filter(p => {
    const d = app.study.revisions[p].due
    return (d < now ? now : d) === day
  })

  const title = $derived(
    mode === 'month' ? monthTitle(cursor) : `${MONTHS[fromISO(from).getMonth()].slice(0, 3)} ${fromISO(from).getDate()} – ${MONTHS[fromISO(to).getMonth()].slice(0, 3)} ${fromISO(to).getDate()}, ${fromISO(to).getFullYear()}`
  )

  function step(dir: 1 | -1) {
    cursor = mode === 'month' ? addMonths(startOfMonth(cursor), dir) : addDays(cursor, dir * 7)
  }
  function goToday() {
    cursor = now
    selected = now
  }
  function pick(day: ISODate) {
    selected = day
    editing = null
    if (mode === 'month' && day.slice(0, 7) !== cursor.slice(0, 7)) cursor = day
  }

  const selectedTasks = $derived(itemsInRange(app.tasks, selected, selected))
  const selectedDeadlines = $derived(withDeadlines(app.tasks).filter(t => t.deadline === selected && t.due !== selected))
  const selectedEvents = $derived(eventsInRange(app.events, selected, selected))
  const lateTasks = $derived(selected === now ? overdue(app.tasks, now) : [])
  const selectedRevs = $derived(app.study ? revsOn(selected) : [])
  const selectedCards = $derived(cardsOn(selected))
  const dailyExists = $derived(app.hasDaily(selected))

  function addQuickTask() {
    const text = quick.trim()
    if (!text) return
    const p = parseQuickAdd(text, selected)
    app.addTask({ title: p.title, due: p.due ?? selected, recur: p.recur })
    quick = ''
  }

  function newEvent() {
    const ev = app.addEvent({ title: 'New event', date: selected, color: COLORS[0] })
    editing = ev
  }

  function editEvent(id: string) {
    editing = app.events.find(e => e.id === id) ?? null
  }

  function patchEvent(patch: Partial<CalEvent>) {
    if (!editing) return
    app.updateEvent(editing.id, patch)
    editing = app.events.find(e => e.id === editing!.id) ?? null
  }

  type RepeatKind = 'none' | 'day' | 'week' | 'month' | 'year'
  const repeatOf = (r?: Recurrence): RepeatKind => (!r ? 'none' : r.every === 1 ? r.unit : 'none')
  function setRepeat(kind: RepeatKind) {
    patchEvent({ recur: kind === 'none' ? undefined : { unit: kind, every: 1 } })
  }

  function removeEvent() {
    if (!editing) return
    const copy = { ...editing }
    app.removeEvent(copy.id)
    editing = null
    app.toast(`Deleted "${copy.title}"`, { label: 'Undo', run: () => { app.events = [...app.events, copy]; app.updateEvent(copy.id, {}) } })
  }

  function onDrop(e: DragEvent, day: ISODate) {
    e.preventDefault()
    dragOver = null
    const id = e.dataTransfer?.getData('text/omnia-task')
    if (id) app.updateTask(id, { due: day })
    const ev = e.dataTransfer?.getData('text/omnia-event')
    if (ev) app.updateEvent(ev, { date: day })
  }

  const dayNum = (d: ISODate) => fromISO(d).getDate()
  const weekdayHeads = $derived(weekdayOrder().map(d => WEEKDAYS[d].slice(0, 3)))
</script>

<section class="cal parchment">
  <div class="main">
    <header>
      <h1 class="page-title">{title}</h1>
      <div class="controls">
        <div class="tabs-pill">
          <button class:on={mode === 'month'} onclick={() => (mode = 'month')}>Month</button>
          <button class:on={mode === 'week'} onclick={() => (mode = 'week')}>Week</button>
        </div>
        <button class="icon-btn" title="Previous" onclick={() => step(-1)}><Icon name="chevron-left" size={20} /></button>
        <button class="btn" onclick={goToday}>Today</button>
        <button class="icon-btn" title="Next" onclick={() => step(1)}><Icon name="chevron-right" size={20} /></button>
      </div>
    </header>

    <div class="heads">{#each weekdayHeads as h}<span>{h}</span>{/each}</div>
    <div class="grid" class:week={mode === 'week'} style:grid-template-rows="repeat({days.length / 7}, minmax(0, 1fr))">
      {#each days as day (day)}
        {@const chips = chipsFor(day)}
        {@const limit = mode === 'week' ? 12 : MAX_CHIPS}
        {@const due = cardsOn(day)}
        <div
          class="cell"
          class:other={mode === 'month' && day.slice(0, 7) !== cursor.slice(0, 7)}
          class:today={day === now}
          class:sel={day === selected}
          class:drop={dragOver === day}
          role="button"
          tabindex="0"
          onclick={() => pick(day)}
          onkeydown={e => (e.key === 'Enter' || e.key === ' ') && pick(day)}
          ondblclick={() => { pick(day); newEvent() }}
          ondragover={e => { e.preventDefault(); dragOver = day }}
          ondragleave={() => dragOver === day && (dragOver = null)}
          ondrop={e => onDrop(e, day)}
        >
          <div class="num"><span class:badge={day === now}>{dayNum(day)}</span>
            {#if app.hasDaily(day)}<span class="dot" title="Daily note"></span>{/if}
          </div>
          <div class="chips">
            {#each chips.slice(0, limit) as chip (chip.key)}
              {#if chip.kind === 'event'}
                <button class="chip ev" style:--c={chip.ev.color ?? COLORS[0]} draggable="true"
                  ondragstart={e => e.dataTransfer?.setData('text/omnia-event', chip.ev.id)}
                  onclick={e => { e.stopPropagation(); pick(day); editEvent(chip.ev.id) }}>
                  {#if chip.ev.start}<span class="t">{formatTime(chip.ev.start)}</span>{/if}<span class="truncate">{chip.ev.title}</span>
                </button>
              {:else if chip.kind === 'deadline'}
                <button class="chip flag" title="Deadline" onclick={e => { e.stopPropagation(); pick(day) }}>
                  <Icon name="flag" size={12} /><span class="truncate">{chip.task.title}</span>
                </button>
              {:else}
                <button class="chip task" class:done={chip.item.done} draggable={!chip.item.recurring}
                  ondragstart={e => e.dataTransfer?.setData('text/omnia-task', chip.item.task.id)}
                  onclick={e => { e.stopPropagation(); pick(day) }}>
                  <Icon name={chip.item.done ? 'circle-check' : 'check-square'} size={12} /><span class="truncate">{chip.item.task.title}</span>
                </button>
              {/if}
            {/each}
            {#if chips.length > limit}<span class="more">+{chips.length - limit} more</span>{/if}
          </div>
          {#if due || revsOn(day).length}
            <div class="study" title="{due} flashcards due">
              {#if due}<span><Icon name="layers" size={11} /> {due}</span>{/if}
              {#if revsOn(day).length}<span><Icon name="repeat" size={11} /> {revsOn(day).length}</span>{/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <aside class="panel">
    <div class="pad">
      <div class="when">
        <h2 class="section-title">{WEEKDAYS[fromISO(selected).getDay()]}</h2>
        <div class="muted">{formatLong(selected)} {#if selected === now}<span class="pill accent">Today</span>{/if}</div>
      </div>

      <button class="btn daily" onclick={() => app.openDaily(selected)}>
        <Icon name={dailyExists ? 'notes' : 'sunrise'} size={16} /> {dailyExists ? 'Open daily note' : 'Create daily note'}
      </button>

      {#if editing}
        <div class="evform">
          <input class="field" value={editing.title} aria-label="Event title" onchange={e => patchEvent({ title: e.currentTarget.value.trim() || 'Untitled event' })} />
          <div class="two">
            <label>Date<input class="field" type="date" value={editing.date} onchange={e => e.currentTarget.value && patchEvent({ date: e.currentTarget.value })} /></label>
            <label>Repeat
              <select class="field" value={repeatOf(editing.recur)} onchange={e => setRepeat(e.currentTarget.value as RepeatKind)}>
                <option value="none">Never</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option>
              </select></label>
          </div>
          <div class="two">
            <label>Starts<input class="field" type="time" value={editing.start ?? ''} onchange={e => patchEvent({ start: e.currentTarget.value || undefined })} /></label>
            <label>Ends<input class="field" type="time" value={editing.end ?? ''} onchange={e => patchEvent({ end: e.currentTarget.value || undefined })} /></label>
          </div>
          <textarea class="field" rows="2" placeholder="Notes" value={editing.notes ?? ''} onchange={e => patchEvent({ notes: e.currentTarget.value || undefined })}></textarea>
          <label>Remind me
            <select class="field" value={editing.remindMin === undefined ? '' : String(editing.remindMin)} disabled={!editing.start} onchange={e => patchEvent({ remindMin: e.currentTarget.value === '' ? undefined : +e.currentTarget.value })}>
              <option value="">No reminder</option><option value="0">At the start</option><option value="10">10 minutes before</option>
              <option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option>
            </select>
          </label>
          <div class="swatches">
            {#each COLORS as c}<button class="sw" class:on={(editing.color ?? COLORS[0]) === c} style:background={c} aria-label="Colour {c}" onclick={() => patchEvent({ color: c })}></button>{/each}
          </div>
          <div class="row">
            <button class="btn danger" onclick={removeEvent}><Icon name="trash" size={15} /> Delete</button>
            <span class="grow"></span>
            <button class="btn primary" onclick={() => (editing = null)}>Done</button>
          </div>
        </div>
      {:else}
        <section>
          <div class="sec-head"><h3 class="eyebrow">Events</h3><button class="icon-btn" title="New event" onclick={newEvent}><Icon name="plus" size={17} /></button></div>
          {#each selectedEvents as e (e.id)}
            <button class="ev-row" style:--c={e.color ?? COLORS[0]} onclick={() => editEvent(e.id)}>
              <span class="bar"></span>
              <span class="grow">
                <span class="ev-title">{e.title}</span>
                <span class="muted ev-when">{e.start ? `${formatTime(e.start)}${e.end ? ' – ' + formatTime(e.end) : ''}` : 'All day'}{#if e.recur} · {describeRecurrence(e.recur, e.date)}{/if}</span>
              </span>
            </button>
          {:else}<p class="faint none">No events.</p>{/each}
        </section>

        <section>
          <div class="sec-head"><h3 class="eyebrow">Tasks</h3></div>
          {#each lateTasks as t (t.id)}<TaskRow task={t} date={t.due} done={false} compact label="Overdue" />{/each}
          {#each selectedTasks as it (it.task.id + it.date)}<TaskRow task={it.task} date={it.date} done={it.done} compact showDate={false} />{/each}
          {#each selectedDeadlines as t (t.id)}<TaskRow task={t} done={false} compact showDate={false} />{/each}
          {#if !lateTasks.length && !selectedTasks.length && !selectedDeadlines.length}<p class="faint none">No tasks.</p>{/if}
          <form class="addtask" onsubmit={e => { e.preventDefault(); addQuickTask() }}>
            <Icon name="plus" size={15} /><input bind:value={quick} placeholder="Add task for this day" aria-label="Add task for this day" />
          </form>
        </section>

        {#if selectedCards || selectedRevs.length}
          <section>
            <div class="sec-head"><h3 class="eyebrow">Study</h3></div>
            {#if selectedCards}
              <div class="study-row"><Icon name="layers" size={16} /> {selectedCards} flashcard{selectedCards === 1 ? '' : 's'} due
                {#if selected === now}<button class="btn primary" onclick={() => (app.modal = { type: 'review', scope: { type: 'all' } })}>Review</button>{/if}</div>
            {/if}
            {#each selectedRevs as path (path)}
              <div class="study-row"><Icon name="repeat" size={16} /> <button class="link" onclick={() => { app.openNote(path); app.rightOpen = true; app.rightTab = 'revise' }}>Revise {noteTitle(path)}</button></div>
            {/each}
          </section>
        {/if}
      {/if}
    </div>
  </aside>
</section>

<style>
  .cal { height: 100%; display: flex; overflow: hidden; }
  .parchment { background: var(--parchment); }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 48px 28px 24px 40px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
  header .page-title { margin: 0; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .controls .tabs-pill { margin-right: 10px; }
  .heads { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0; padding: 0 2px 6px; color: var(--text-muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; }
  .heads span { padding-left: 10px; }
  .grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid var(--border-strong); border-left: 1px solid var(--border-strong); }
  .cell {
    border-right: 1px solid var(--border-strong); border-bottom: 1px solid var(--border-strong); padding: 6px 6px 4px; min-height: 0; overflow: hidden;
    display: flex; flex-direction: column; gap: 3px; cursor: pointer; text-align: left; position: relative;
  }
  .cell:hover { background: rgba(255, 255, 255, 0.28); }
  .cell.other { color: var(--text-faint); background: rgba(120, 88, 36, 0.04); }
  .cell.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
  .cell.drop { background: var(--accent-soft); }
  .num { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); min-height: 24px; }
  .badge { background: var(--accent); color: var(--on-accent); border-radius: 99px; min-width: 24px; height: 24px; display: inline-grid; place-items: center; padding: 0 5px; font-weight: 600; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .chips { display: grid; gap: 2px; min-height: 0; overflow: hidden; }
  .chip { display: flex; align-items: center; gap: 5px; padding: 1px 6px; border-radius: 5px; font-size: var(--fs-xs); text-align: left; min-width: 0; line-height: 1.5; }
  .chip.ev { background: color-mix(in srgb, var(--c) 18%, transparent); border-left: 3px solid var(--c); }
  .chip.ev .t { color: var(--text-muted); flex: none; }
  .chip.task { color: var(--text); }
  .chip.flag { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); font-weight: 600; }
  .chip.flag :global(svg) { flex: none; }
  .chip.task.done { color: var(--text-faint); text-decoration: line-through; }
  .chip.task :global(svg) { color: var(--accent); flex: none; }
  .more { font-size: var(--fs-xs); color: var(--text-muted); padding-left: 6px; }
  .study { margin-top: auto; display: flex; gap: 8px; justify-content: flex-end; font-size: var(--fs-xs); color: var(--text-muted); }
  .study span { display: inline-flex; align-items: center; gap: 3px; }

  .panel { width: 340px; flex: none; border-left: 1px solid var(--border-strong); background: color-mix(in srgb, var(--bg-raised) 55%, transparent); overflow: auto; }
  .pad { padding: 48px 24px 60px; display: grid; gap: 18px; }
  .when .section-title { margin-bottom: 4px; }
  .daily { justify-self: start; }
  .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .none { margin: 4px 0; font-size: var(--fs-sm); }
  .ev-row { display: flex; align-items: stretch; gap: 10px; width: 100%; text-align: left; padding: 6px 8px; border-radius: 8px; }
  .ev-row:hover { background: var(--bg-hover); }
  .bar { width: 4px; border-radius: 4px; background: var(--c); flex: none; }
  .ev-title { display: block; font-size: var(--fs-md); }
  .ev-when { display: block; font-size: var(--fs-xs); }
  .addtask { display: flex; align-items: center; gap: 8px; padding: 4px 6px; color: var(--text-muted); }
  .addtask input { flex: 1; background: transparent; border: 0; outline: none; font-size: var(--fs-md); }
  .study-row { display: flex; align-items: center; gap: 8px; font-size: var(--fs-md); padding: 4px 0; flex-wrap: wrap; }
  .study-row .btn { padding: 2px 12px; margin-left: auto; }
  .link { color: var(--link); text-align: left; }
  .evform { display: grid; gap: 10px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  label { display: grid; gap: 3px; font-size: var(--fs-xs); color: var(--text-muted); }
  .swatches { display: flex; gap: 8px; }
  .sw { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; }
  .sw.on { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px currentColor; color: var(--text); }
  @media (max-width: 1100px) { .panel { display: none; } }
</style>
