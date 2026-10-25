<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, today, weekday, weekdayOrder, WEEKDAYS } from '../lib/dates'
  import type { Recurrence } from '../lib/recurrence'
  import { quickDates, uid, type Task } from '../lib/tasks'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'

  let { task, onclose, ondelete }: { task: Task; onclose: () => void; ondelete: () => void } = $props()

  let newSub = $state('')

  const now = $derived(today())
  const recurring = $derived(!!task.recur && !!task.due)
  const notes = $derived(app.noteList().sort((a, b) => a.path.localeCompare(b.path)))
  const patch = (p: Partial<Task>) => app.updateTask(task.id, p)

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
    const due = task.due ?? now
    const map: Record<string, Recurrence | undefined> = {
      none: undefined,
      day: { unit: 'day', every: 1 },
      week: { unit: 'week', every: 1, weekdays: [weekday(due)] },
      fortnight: { unit: 'week', every: 2, weekdays: [weekday(due)] },
      month: { unit: 'month', every: 1 },
      year: { unit: 'year', every: 1 },
      custom: task.recur ?? { unit: 'week', every: 1, weekdays: [weekday(due)] }
    }
    patch({ recur: map[kind], due, deadline: kind === 'none' ? task.deadline : undefined })
  }

  function toggleWeekday(d: number) {
    const r = task.recur
    if (!r) return
    const cur = r.weekdays ?? [weekday(task.due ?? now)]
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]
    if (next.length) patch({ recur: { ...r, unit: 'week', weekdays: next.sort() } })
  }

  function addSub() {
    const title = newSub.trim()
    if (!title) return
    patch({ subtasks: [...(task.subtasks ?? []), { id: uid(), title, done: false }] })
    newSub = ''
  }

  const setSub = (id: string, change: Partial<{ title: string; done: boolean }>) =>
    patch({ subtasks: (task.subtasks ?? []).map(s => (s.id === id ? { ...s, ...change } : s)) })
  const removeSub = (id: string) => patch({ subtasks: (task.subtasks ?? []).filter(s => s.id !== id) })

  function setRemind(daysBefore: string) {
    if (daysBefore === '') return patch({ remind: undefined })
    patch({ remind: { daysBefore: +daysBefore, time: task.remind?.time ?? task.time ?? '09:00' } })
  }

  const deadlineQuick = $derived([
    { label: 'Today', date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'In a week', date: addDays(now, 7) },
    { label: 'In a month', date: addDays(now, 30) }
  ])
</script>

<div class="editor">
  <input class="field title" value={task.title} aria-label="Title" onchange={e => e.currentTarget.value.trim() && patch({ title: e.currentTarget.value.trim() })} />
  <textarea class="field" placeholder="Notes" rows="2" value={task.notes ?? ''} onchange={e => patch({ notes: e.currentTarget.value || undefined })}></textarea>

  <section>
    <h4 class="eyebrow">Do on</h4>
    <div class="chips">
      {#each quickDates(now) as q}
        <button class="chip" class:on={task.due === q.date} onclick={() => patch({ due: q.date })}>{q.label}</button>
      {/each}
      <button class="chip" class:on={!task.due} onclick={() => patch({ due: undefined, time: undefined, recur: undefined })}>No date</button>
    </div>
    <div class="row2">
      <label>Date<input class="field" type="date" value={task.due ?? ''} onchange={e => patch({ due: e.currentTarget.value || undefined, recur: e.currentTarget.value ? task.recur : undefined })} /></label>
      <label>Time<input class="field" type="time" value={task.time ?? ''} onchange={e => patch({ time: e.currentTarget.value || undefined })} /></label>
      <label>Repeat
        <select class="field" value={repeatKind} disabled={!task.due} onchange={e => setRepeat(e.currentTarget.value as RepeatKind)}>
          <option value="none">Never</option><option value="day">Every day</option><option value="week">Every week</option>
          <option value="fortnight">Every fortnight</option><option value="month">Every month</option><option value="year">Every year</option><option value="custom">Custom…</option>
        </select>
      </label>
    </div>
    {#if repeatKind === 'custom' && task.recur}
      <div class="custom">
        <span>Every</span>
        <input class="field num" type="number" min="1" value={task.recur.every} onchange={e => patch({ recur: { ...task.recur!, every: Math.max(1, +e.currentTarget.value || 1) } })} />
        <select class="field unit" value={task.recur.unit} onchange={e => patch({ recur: { ...task.recur!, unit: e.currentTarget.value as Recurrence['unit'] } })}>
          <option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option>
        </select>
        {#if task.recur.unit === 'week'}
          <div class="days">
            {#each weekdayOrder() as d}
              <button class="chip" class:on={(task.recur.weekdays ?? [weekday(task.due ?? now)]).includes(d)} onclick={() => toggleWeekday(d)}>{WEEKDAYS[d].slice(0, 3)}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  {#if !recurring}
    <section>
      <h4 class="eyebrow"><Icon name="flag" size={12} /> Deadline</h4>
      <div class="chips">
        {#each deadlineQuick as q}<button class="chip" class:on={task.deadline === q.date} onclick={() => patch({ deadline: q.date })}>{q.label}</button>{/each}
        <input class="field datefield" type="date" aria-label="Deadline date" value={task.deadline ?? ''} onchange={e => patch({ deadline: e.currentTarget.value || undefined })} />
        {#if task.deadline}<button class="chip" onclick={() => patch({ deadline: undefined })}>Clear</button>{/if}
      </div>
    </section>
  {/if}

  <section>
    <h4 class="eyebrow">Subtasks {#if task.subtasks?.length}<span class="faint">{task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</span>{/if}</h4>
    {#each task.subtasks ?? [] as s (s.id)}
      <div class="sub">
        <input type="checkbox" class="checkbox" checked={s.done} aria-label="Complete {s.title}" onchange={() => setSub(s.id, { done: !s.done })} />
        <input class="plain" class:struck={s.done} value={s.title} aria-label="Subtask" onchange={e => e.currentTarget.value.trim() ? setSub(s.id, { title: e.currentTarget.value.trim() }) : removeSub(s.id)} />
        <button class="icon-btn" title="Remove subtask" onclick={() => removeSub(s.id)}><Icon name="x" size={14} /></button>
      </div>
    {/each}
    <form class="sub add" onsubmit={e => { e.preventDefault(); addSub() }}>
      <Icon name="plus" size={15} />
      <input class="plain" placeholder="Add a subtask" aria-label="Add a subtask" bind:value={newSub} />
    </form>
  </section>

  <section class="row2">
    <label>Remind me
      <select class="field" value={task.remind ? String(task.remind.daysBefore) : ''} disabled={!task.due && !task.deadline} onchange={e => setRemind(e.currentTarget.value)}>
        <option value="">No reminder</option>
        <option value="0">On the day</option>
        <option value="1">1 day before</option>
        <option value="2">2 days before</option>
        <option value="3">3 days before</option>
        <option value="7">1 week before</option>
      </select>
    </label>
    <label>At
      <input class="field" type="time" disabled={!task.remind} value={task.remind?.time ?? '09:00'} onchange={e => task.remind && patch({ remind: { ...task.remind, time: e.currentTarget.value || '09:00' } })} />
    </label>
    <label>Linked note
      <select class="field" value={task.note ?? ''} onchange={e => patch({ note: e.currentTarget.value || undefined })}>
        <option value="">None</option>
        {#each notes as n (n.path)}<option value={n.path}>{noteTitle(n.path)}</option>{/each}
      </select>
    </label>
  </section>

  <div class="foot">
    {#if task.note}<button class="btn" onclick={() => app.openNote(task.note!)}><Icon name="file" size={15} /> Open note</button>{/if}
    <span class="grow"></span>
    <button class="btn danger" onclick={ondelete}><Icon name="trash" size={15} /> Delete</button>
    <button class="btn primary" onclick={onclose}>Done</button>
  </div>
</div>

<style>
  .editor { margin: 6px 0 14px 32px; padding: 16px 18px; display: grid; gap: 14px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 2px 10px rgba(90, 60, 20, 0.06); }
  .title { font-weight: 600; font-size: var(--fs-lg); }
  section { display: grid; gap: 8px; }
  h4 { display: flex; align-items: center; gap: 5px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { padding: 3px 11px; border-radius: 99px; border: 1px solid var(--border-strong); font-size: var(--fs-sm); color: var(--text-muted); }
  .chip:hover { color: var(--text); background: var(--bg-hover); }
  .chip.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  label { display: grid; gap: 3px; font-size: var(--fs-xs); color: var(--text-muted); }
  .datefield { width: 150px; padding: 3px 8px; }
  .custom { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-md); }
  .num { width: 70px; } .unit { width: 110px; }
  .days { display: flex; gap: 4px; flex-wrap: wrap; }
  .sub { display: flex; align-items: center; gap: 10px; min-height: 30px; }
  .sub .plain { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; padding: 3px 0; font-size: var(--fs-md); }
  .sub .plain.struck { text-decoration: line-through; color: var(--text-faint); }
  .sub.add { color: var(--text-muted); padding-left: 2px; }
  .foot { display: flex; align-items: center; gap: 8px; padding-top: 2px; }
</style>
