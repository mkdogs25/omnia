<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { formatShort, formatTime, today, type ISODate } from '../lib/dates'
  import { describeRecurrence } from '../lib/recurrence'
  import { deadlineStatus, isRecurring, quickDates, reschedule, subtaskProgress, type Task } from '../lib/tasks'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Menu, { type MenuItem } from './Menu.svelte'
  import TaskEditor from './TaskEditor.svelte'

  let { task, date, done, showDate = true, label, compact = false }: {
    task: Task
    /** The occurrence date this row stands for. */
    date?: ISODate
    done: boolean
    /** Show the planned day on the right (leave off under a day heading, where it would repeat). */
    showDate?: boolean
    /** Replaces the planned-day text. */
    label?: string
    compact?: boolean
  } = $props()

  let open = $state(false)
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)

  const now = $derived(today())
  const recurring = $derived(isRecurring(task))
  const progress = $derived(subtaskProgress(task))
  const deadline = $derived(task.deadline && !recurring && !done ? deadlineStatus(task.deadline, now, app.settings.deadlineLeadDays) : null)
  const late = $derived(!recurring && !done && !!(task.due ?? task.deadline) && (task.due ?? task.deadline)! < now)
  const dateText = $derived(label ?? (recurring ? describeRecurrence(task.recur!, task.due) : task.due ? formatShort(task.due) : ''))

  function remove() {
    const copy = structuredClone($state.snapshot(task)) as Task
    app.removeTask(task.id)
    app.toast(`Deleted “${copy.title}”`, { label: 'Undo', run: () => app.restoreTask(copy) })
  }

  function moveMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const items: MenuItem[] = quickDates(now).map(q => ({ label: q.label, icon: 'calendar', run: () => app.replaceTask(reschedule(task, q.date)) }))
    items.push({ divider: true }, { label: 'Pick a date…', icon: 'pencil', run: () => (open = true) })
    if (task.due) items.push({ label: 'Remove the date', icon: 'x', run: () => app.replaceTask(reschedule(task, null)) })
    menu = { x: r.left, y: r.bottom + 4, items }
  }

  function moreMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menu = {
      x: r.right - 200, y: r.bottom + 4,
      items: [
        { label: 'Edit', icon: 'pencil', run: () => (open = true) },
        { label: 'Duplicate', icon: 'copy', run: () => app.duplicateTask(task.id) },
        ...(task.note ? [{ label: 'Open linked note', icon: 'file', run: () => app.openNote(task.note!) }] : []),
        { divider: true },
        { label: 'Delete', icon: 'trash', danger: true, run: remove }
      ]
    }
  }
</script>

<div class="task" class:open class:compact class:done>
  <div class="line" role="group">
    <input type="checkbox" class="checkbox" checked={done} aria-label="Complete {task.title}" onchange={() => app.toggleTask(task.id, date)} />
    <button class="title" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="text" class:struck={done}>{task.title}</span>
    </button>

    <span class="meta">
      {#if progress.total}
        <span class="chip sub" title="{progress.done} of {progress.total} subtasks done">
          <span class="bar"><span style:width="{(progress.done / progress.total) * 100}%"></span></span>{progress.done}/{progress.total}
        </span>
      {/if}
      {#if task.notes}<span class="ico" title="Has notes"><Icon name="lines" size={14} /></span>{/if}
      {#if task.note}<span class="ico" title="Linked to {noteTitle(task.note)}"><Icon name="link" size={14} /></span>{/if}
      {#if task.remind}<span class="ico" title="Reminder set"><Icon name="bell" size={14} /></span>{/if}
      {#if task.pomodoros}<span class="ico" title="{task.pomodoros} focus session{task.pomodoros === 1 ? '' : 's'}"><Icon name="timer" size={14} />{task.pomodoros}</span>{/if}
      {#if recurring}<span class="ico" title="Repeats"><Icon name="repeat" size={14} /></span>{/if}
      {#if deadline}
        <span class="chip deadline {deadline.tone}" title="Deadline {formatShort(task.deadline!)}"><Icon name="flag" size={12} />{deadline.label}</span>
      {/if}
      {#if task.time}<span class="when">{formatTime(task.time)}</span>{/if}
      {#if showDate && dateText}<span class="date" class:late>{dateText}</span>{/if}
    </span>

    {#if !compact}
      <span class="actions">
        {#if !recurring && !done}<button class="icon-btn" title="Reschedule" onclick={moveMenu}><Icon name="calendar" size={16} /></button>{/if}
        <button class="icon-btn" title="More" onclick={moreMenu}><Icon name="more" size={16} /></button>
      </span>
    {/if}
  </div>

  {#if open}<TaskEditor {task} onclose={() => (open = false)} ondelete={remove} />{/if}
</div>

{#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}

<style>
  .task { border-radius: 10px; }
  .line { display: flex; align-items: center; gap: 14px; min-height: var(--row-min, 40px); padding: 3px 8px 3px 6px; border-radius: 9px; }
  .line:hover { background: var(--bg-hover); }
  .title { flex: 1 1 auto; min-width: 0; text-align: left; font-size: var(--fs-lg); padding: 4px 0; }
  .text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text.struck { text-decoration: line-through; color: var(--text-faint); }
  .meta { display: flex; align-items: center; gap: 10px; flex: none; color: var(--text-muted); font-size: var(--fs-sm); }
  .ico { display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs); }
  .when, .date { white-space: nowrap; }
  .date.late { color: var(--bad); }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 9px; border-radius: 99px; font-size: var(--fs-xs); background: var(--bg-active); white-space: nowrap; }
  .chip.sub .bar { width: 26px; height: 4px; border-radius: 4px; background: var(--border-strong); overflow: hidden; }
  .chip.sub .bar span { display: block; height: 100%; background: var(--accent); }
  .deadline { font-weight: 600; }
  .deadline.later { background: var(--bg-active); color: var(--text-muted); font-weight: 500; }
  .deadline.soon { background: color-mix(in srgb, var(--warn) 22%, transparent); color: color-mix(in srgb, var(--warn) 70%, var(--text)); }
  .deadline.today, .deadline.overdue { background: color-mix(in srgb, var(--bad) 18%, transparent); color: var(--bad); }
  .actions { display: flex; flex: none; opacity: 0; transition: opacity 0.12s; }
  .line:hover .actions, .line:focus-within .actions, .open .actions { opacity: 1; }
  .compact .line { min-height: 34px; gap: 10px; }
  .compact .title { font-size: var(--fs-md); }
</style>
