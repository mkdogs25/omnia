<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { MODE_LABEL, type PomoMode } from '../lib/pomodoro'
  import { pomodoro } from '../lib/pomodoro.svelte'
  import Icon from './Icon.svelte'

  const modes: PomoMode[] = ['focus', 'short', 'long']
  const R = 86
  const C = 2 * Math.PI * R

  const openTasks = $derived(app.tasks.filter(t => (t.recur ? true : !t.done)))
  const dots = $derived(Array.from({ length: app.settings.longEvery }, (_, i) => i < pomodoro.focusDone % app.settings.longEvery || (pomodoro.focusDone > 0 && pomodoro.focusDone % app.settings.longEvery === 0 && pomodoro.mode === 'long')))

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') app.pomodoroOpen = false
  }
</script>

<svelte:window {onkeydown} onmousedown={e => {
  const t = e.target as HTMLElement
  if (!t.closest('.pomo') && !t.closest('[data-pomo-toggle]')) app.pomodoroOpen = false
}} />

<div class="pomo" role="dialog" aria-label="Pomodoro timer">
  <div class="modes" role="tablist">
    {#each modes as m}
      <button role="tab" aria-selected={pomodoro.mode === m} class:on={pomodoro.mode === m} onclick={() => pomodoro.setMode(m)}>{MODE_LABEL[m]}</button>
    {/each}
  </div>

  <div class="dial" class:running={pomodoro.running} class:brk={pomodoro.mode !== 'focus'}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="track" cx="100" cy="100" r={R} />
      <circle class="arc" cx="100" cy="100" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - pomodoro.progress)} />
    </svg>
    <div class="readout">
      <div class="time numeral" aria-live="off">{pomodoro.label}</div>
      <div class="state muted">{pomodoro.running ? MODE_LABEL[pomodoro.mode] : pomodoro.remaining < pomodoro.total ? 'Paused' : 'Ready'}</div>
    </div>
  </div>

  <div class="controls">
    <button class="icon-btn" title="Reset" onclick={() => pomodoro.reset()}><Icon name="undo" size={19} /></button>
    <button class="btn primary big go" onclick={() => pomodoro.toggle()}>
      {#if pomodoro.running}Pause{:else}<Icon name="play" size={15} /> {pomodoro.remaining < pomodoro.total ? 'Resume' : 'Start'}{/if}
    </button>
    <button class="icon-btn" title="Skip to the next session" onclick={() => pomodoro.skip()}><Icon name="arrow-right" size={19} /></button>
  </div>

  <div class="dots" aria-label="Focus sessions in this cycle">
    {#each dots as filled}<span class:filled></span>{/each}
  </div>

  <label class="task">
    <span class="eyebrow">Working on</span>
    <select class="field" value={pomodoro.taskId ?? ''} onchange={e => pomodoro.setTask(e.currentTarget.value || null)}>
      <option value="">Nothing in particular</option>
      {#each openTasks as t (t.id)}<option value={t.id}>{t.title}{t.pomodoros ? ` (${t.pomodoros})` : ''}</option>{/each}
    </select>
  </label>

  <div class="foot muted">
    <span>{pomodoro.minutesToday} min focused today</span>
    <button class="link" onclick={() => app.openSettings('pomodoro')}>Durations</button>
  </div>
</div>

<style>
  .pomo {
    position: fixed; z-index: 150; left: calc(var(--ribbon-w) + 10px); bottom: 14px; width: 320px; padding: 16px 18px 14px;
    background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 18px; box-shadow: var(--shadow);
    display: grid; gap: 14px; justify-items: center;
  }
  .modes { display: flex; gap: 2px; background: var(--bg-hover); padding: 3px; border-radius: 10px; }
  .modes button { padding: 5px 11px; border-radius: 8px; font-size: var(--fs-sm); color: var(--text-muted); }
  .modes button.on { background: var(--bg-raised); color: var(--text); box-shadow: 0 1px 3px rgba(70, 48, 12, 0.18); }
  .dial { position: relative; width: 210px; height: 210px; }
  .dial svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  circle { fill: none; stroke-width: 9; }
  .track { stroke: var(--bg-active); }
  .arc { stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset 0.3s linear; }
  .dial.brk .arc { stroke: var(--good); }
  .readout { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .time { font-size: 52px; line-height: 1; font-variant-numeric: tabular-nums; }
  .state { font-size: var(--fs-sm); margin-top: 6px; }
  .controls { display: flex; align-items: center; gap: 14px; }
  .go { min-width: 120px; justify-content: center; }
  .dots { display: flex; gap: 8px; }
  .dots span { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--accent); }
  .dots span.filled { background: var(--accent); }
  .task { display: grid; gap: 4px; width: 100%; }
  .foot { display: flex; justify-content: space-between; width: 100%; font-size: var(--fs-sm); }
  .link { color: var(--link); }
</style>
