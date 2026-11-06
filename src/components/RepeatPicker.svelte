<script lang="ts">
  import { weekday, weekdayOrder, WEEKDAYS, type ISODate } from '../lib/dates'
  import { describeRecurrence, nextOccurrence, type Recurrence } from '../lib/recurrence'

  let { recur, anchor, disabled = false, onchange }: {
    recur: Recurrence | undefined
    /** The date the first instance falls on; it moves forward if it isn't one of the chosen days. */
    anchor: ISODate
    disabled?: boolean
    /** The new rule (undefined for "never") and the date the series should start on. */
    onchange: (recur: Recurrence | undefined, date: ISODate) => void
  } = $props()

  type Kind = 'none' | 'day' | 'week' | 'fortnight' | 'month' | 'year' | 'custom'
  let forceCustom = $state(false)

  const anchorDay = $derived(weekday(anchor))
  const kind = $derived.by<Kind>(() => {
    const r = recur
    if (!r) return 'none'
    if (forceCustom) return 'custom'
    const plain = !r.weekdays || (r.weekdays.length === 1 && r.weekdays[0] === anchorDay)
    if (r.every === 1 && r.unit === 'day') return 'day'
    if (r.every === 1 && r.unit === 'week' && plain) return 'week'
    if (r.every === 2 && r.unit === 'week' && plain) return 'fortnight'
    if (r.every === 1 && r.unit === 'month') return 'month'
    if (r.every === 1 && r.unit === 'year') return 'year'
    return 'custom'
  })

  const days = $derived(recur?.unit === 'week' ? (recur.weekdays?.length ? recur.weekdays : [anchorDay]) : [])

  /** Emits a rule, moving the start date to the first chosen day on or after the anchor. */
  function emit(next: Recurrence | undefined) {
    if (!next) return onchange(undefined, anchor)
    const date = next.weekdays?.length && !next.weekdays.includes(anchorDay) ? (nextOccurrence(anchor, next, anchor) ?? anchor) : anchor
    onchange(next, date)
  }

  function choose(k: Kind) {
    forceCustom = k === 'custom'
    const week = [anchorDay]
    emit(
      k === 'none' ? undefined
      : k === 'day' ? { unit: 'day', every: 1 }
      : k === 'week' ? { unit: 'week', every: 1, weekdays: week }
      : k === 'fortnight' ? { unit: 'week', every: 2, weekdays: week }
      : k === 'month' ? { unit: 'month', every: 1 }
      : k === 'year' ? { unit: 'year', every: 1 }
      : (recur ?? { unit: 'week', every: 1, weekdays: week })
    )
  }

  function setUnit(unit: Recurrence['unit']) {
    if (!recur) return
    const { weekdays: _drop, ...rest } = recur
    emit(unit === 'week' ? { ...rest, unit, weekdays: days.length ? days : [anchorDay] } : { ...rest, unit })
  }

  function toggleDay(d: number) {
    if (!recur) return
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d]
    // At least one day always stays on.
    if (next.length) emit({ ...recur, unit: 'week', weekdays: next.sort((a, b) => a - b) })
  }

  const letter = (d: number) => WEEKDAYS[d][0]
</script>

<div class="rp">
  <select class="field" value={kind} {disabled} aria-label="Repeat" onchange={e => choose(e.currentTarget.value as Kind)}>
    <option value="none">Never</option><option value="day">Every day</option><option value="week">Every week</option>
    <option value="fortnight">Every fortnight</option><option value="month">Every month</option><option value="year">Every year</option>
    <option value="custom">Custom…</option>
  </select>

  {#if kind === 'custom' && recur}
    <div class="custom">
      <div class="every">
        <span>Repeat every</span>
        <input class="field num" type="number" min="1" max="99" value={recur.every} aria-label="Repeat every" onchange={e => emit({ ...recur!, every: Math.min(99, Math.max(1, Math.round(+e.currentTarget.value) || 1)) })} />
        <select class="field unit" value={recur.unit} aria-label="Unit" onchange={e => setUnit(e.currentTarget.value as Recurrence['unit'])}>
          <option value="day">{recur.every === 1 ? 'day' : 'days'}</option><option value="week">{recur.every === 1 ? 'week' : 'weeks'}</option>
          <option value="month">{recur.every === 1 ? 'month' : 'months'}</option><option value="year">{recur.every === 1 ? 'year' : 'years'}</option>
        </select>
      </div>
      {#if recur.unit === 'week'}
        <div class="circles" role="group" aria-label="Repeat on">
          {#each weekdayOrder() as d}
            <button type="button" class="circle" class:on={days.includes(d)} aria-pressed={days.includes(d)} aria-label={WEEKDAYS[d]} title={WEEKDAYS[d]} onclick={() => toggleDay(d)}>{letter(d)}</button>
          {/each}
        </div>
      {/if}
      <p class="summary">{describeRecurrence(recur, anchor)}</p>
    </div>
  {/if}
</div>

<style>
  .rp { display: grid; gap: 8px; }
  .custom { display: grid; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--bg-hover); }
  .every { display: flex; align-items: center; gap: 8px; font-size: var(--fs-md); flex-wrap: wrap; }
  .num { width: 64px; padding: 4px 8px; }
  .unit { width: auto; padding: 4px 8px; }
  .circles { display: flex; gap: 6px; flex-wrap: wrap; }
  .circle {
    width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: var(--fs-sm); font-weight: 600;
    border: 1.5px solid var(--border-strong); color: var(--text-muted); background: var(--bg-raised); transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .circle:hover { border-color: var(--accent); }
  .circle.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .circle:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px; }
  .summary { margin: 0; font-size: var(--fs-sm); color: var(--text-muted); }
</style>
