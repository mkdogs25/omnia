<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { formatLong, formatTime, today, weekday, WEEKDAYS, type ISODate } from '../lib/dates'
  import { describeRecurrence, type Recurrence } from '../lib/recurrence'
  import type { Task } from '../lib/tasks'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'

  let { task, date, done, showDate = true, label, compact = false }: {
    task: Task
    /** The occurrence date this row stands for. */
    date?: ISODate
    done: boolean
    showDate?: boolean
    /** Overrides the right-hand label. */
    label?: string
    compact?: boolean
  } = $props()

  let open = $state(false)

  const recurring = $derived(!!task.recur && !!task.due)
  const rightLabel = $derived(
    label ?? (recurring ? describeRecurrence(task.recur!, task.due) : task.due ? formatLong(task.due) : '')
  )
  const overdue = $derived(!recurring && !done && !!task.due && task.due < today())

  type RepeatKind = 'none' | 'day' | 'week' | 'fortnight' | 'month' | 'year' | 'custom'
  const repeatKind = $derived.by<RepeatKind>(() => {
    const r = task.recur
    if (!r) return 'none'
    const plain = !r.weekdays || (r.weekdays.length === 1 && task.due && r.weekdays[0] === weekday(task.due))
    if (r.every === 1 && r.unit === 'day') return 'day'
    if (r.every === 1 && r.unit === 'week' && plain) return 'week'
    if (r.every === 2 && r.unit === 'week' && plain) return 'fortnight'
    if (r.every === 1 && r.unit === 'month') return 'month'
    if (r.every === 1 && r.unit === 'year') return 'year'
    return 'custom'
  })

  function setRepeat(kind: RepeatKind) {
    const due = task.due ?? today()
    const map: Record<string, Recurrence | undefined> = {
      none: undefined,
      day: { unit: 'day', every: 1 },
      week: { unit: 'week', every: 1, weekdays: [weekday(due)] },
      fortnight: { unit: 'week', every: 2, weekdays: [weekday(due)] },
      month: { unit: 'month', every: 1 },
      year: { unit: 'year', every: 1 },
      custom: task.recur ?? { unit: 'week', every: 1, weekdays: [weekday(due)] }
    }
    app.updateTask(task.id, { recur: map[kind], due: kind === 'none' ? task.due : due })
  }

  function toggleWeekday(d: number) {
    const r = task.recur
    if (!r) return
    const cur = r.weekdays ?? [weekday(task.due ?? today())]
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]
    if (next.length) app.updateTask(task.id, { recur: { ...r, unit: 'week', weekdays: next.sort() } })
  }

  function openLinkedNote() {
    if (task.note) app.openNote(task.note)
  }

  function remove() {
    const copy = { ...task }
    app.removeTask(task.id)
    app.toast(`Deleted "${copy.title}"`, { label: 'Undo', run: () => { app.tasks = [...app.tasks, copy]; app.updateTask(copy.id, {}) } })
  }
</script>

<div class="task" class:open class:compact class:done>
  <div class="line">
    <input type="checkbox" class="checkbox" checked={done} aria-label="Complete {task.title}" onchange={() => app.toggleTask(task.id, date)} />
    <button class="title" onclick={() => (open = !open)}>
      <span class="text" class:struck={done}>{task.title}</span>
      {#if task.notes}<span class="ico" title="Has notes"><Icon name="lines" size={15} /></span>{/if}
      {#if task.note}<span class="ico" title="Linked note"><Icon name="link" size={14} /></span>{/if}
      {#if recurring}<span class="ico" title="Repeats"><Icon name="repeat" size={14} /></span>{/if}
      {#if task.pomodoros}<span class="ico" title="{task.pomodoros} focus session{task.pomodoros === 1 ? '' : 's'}"><Icon name="timer" size={14} />{task.pomodoros}</span>{/if}
    </button>
    {#if task.time}<span class="when">{formatTime(task.time)}</span>{/if}
    {#if showDate && rightLabel}<span class="date" class:overdue>{rightLabel}</span>{/if}
  </div>

  {#if open}
    <div class="editor">
      <input class="field" value={task.title} aria-label="Title" onchange={e => e.currentTarget.value.trim() && app.updateTask(task.id, { title: e.currentTarget.value.trim() })} />
      <textarea class="field" placeholder="Notes" rows="3" value={task.notes ?? ''} onchange={e => app.updateTask(task.id, { notes: e.currentTarget.value || undefined })}></textarea>
      <div class="grid">
        <label><span>Date</span>
          <input class="field" type="date" value={task.due ?? ''} onchange={e => app.updateTask(task.id, { due: e.currentTarget.value || undefined, recur: e.currentTarget.value ? task.recur : undefined })} /></label>
        <label><span>Time</span>
          <input class="field" type="time" value={task.time ?? ''} onchange={e => app.updateTask(task.id, { time: e.currentTarget.value || undefined })} /></label>
        <label><span>Repeat</span>
          <select class="field" value={repeatKind} disabled={!task.due} onchange={e => setRepeat(e.currentTarget.value as RepeatKind)}>
            <option value="none">Never</option>
            <option value="day">Every day</option>
            <option value="week">Every week</option>
            <option value="fortnight">Every fortnight</option>
            <option value="month">Every month</option>
            <option value="year">Every year</option>
            <option value="custom">Custom…</option>
          </select></label>
        <label><span>Linked note</span>
          <select class="field" value={task.note ?? ''} onchange={e => app.updateTask(task.id, { note: e.currentTarget.value || undefined })}>
            <option value="">None</option>
            {#each app.noteList().sort((a, b) => a.path.localeCompare(b.path)) as n (n.path)}<option value={n.path}>{noteTitle(n.path)}</option>{/each}
          </select></label>
      </div>
      {#if repeatKind === 'custom' && task.recur}
        <div class="custom">
          <span>Every</span>
          <input class="field num" type="number" min="1" value={task.recur.every} onchange={e => app.updateTask(task.id, { recur: { ...task.recur!, every: Math.max(1, +e.currentTarget.value || 1) } })} />
          <select class="field unit" value={task.recur.unit} onchange={e => app.updateTask(task.id, { recur: { ...task.recur!, unit: e.currentTarget.value as Recurrence['unit'] } })}>
            <option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option>
          </select>
          {#if task.recur.unit === 'week'}
            <div class="days">
              {#each [1, 2, 3, 4, 5, 6, 0] as d}
                <button class="chip" class:on={(task.recur.weekdays ?? [weekday(task.due ?? today())]).includes(d)} onclick={() => toggleWeekday(d)}>{WEEKDAYS[d].slice(0, 3)}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <div class="row actions">
        {#if task.note}<button class="btn" onclick={openLinkedNote}><Icon name="file" size={15} /> Open note</button>{/if}
        <span class="grow"></span>
        <button class="btn danger" onclick={remove}><Icon name="trash" size={15} /> Delete</button>
        <button class="btn primary" onclick={() => (open = false)}>Done</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .task { border-radius: 10px; }
  .line { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 4px 6px; border-radius: 8px; }
  .line:hover { background: var(--bg-hover); }
  .title { display: flex; align-items: center; gap: 10px; text-align: left; font-size: var(--fs-lg); min-width: 0; }
  .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text.struck { text-decoration: line-through; color: var(--text-faint); }
  .ico { color: var(--text-muted); display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs); }
  .when { color: var(--text-muted); font-size: var(--fs-md); }
  .date { color: var(--text-muted); font-size: var(--fs-md); white-space: nowrap; }
  .date.overdue { color: var(--bad); }
  .compact .line { min-height: 34px; gap: 10px; }
  .compact .title { font-size: var(--fs-md); }
  .compact .date { font-size: var(--fs-xs); }
  .editor { margin: 4px 0 12px 32px; padding: 14px; display: grid; gap: 10px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  label { display: grid; gap: 3px; font-size: var(--fs-xs); color: var(--text-muted); }
  .custom { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-md); }
  .num { width: 70px; }
  .unit { width: 110px; }
  .days { display: flex; gap: 4px; flex-wrap: wrap; }
  .chip { padding: 3px 9px; border-radius: 99px; border: 1px solid var(--border-strong); font-size: var(--fs-xs); }
  .chip.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .actions { margin-top: 2px; }
</style>
