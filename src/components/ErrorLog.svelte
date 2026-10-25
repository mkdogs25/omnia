<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { formatShort, today } from '../lib/dates'
  import { downloadFile } from '../lib/download'
  import { renderInline } from '../lib/inline'
  import { activeMistakes, answerText, byNote, clearResolved, RESOLVE_AFTER, toCSV, toQuestion, type Mistake } from '../lib/mistakes'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'

  let source = $state<'all' | 'quiz' | 'card'>('all')
  let note = $state('')
  let query = $state('')
  let showResolved = $state(false)
  let editing = $state<string | null>(null)

  const open = $derived(activeMistakes(app.mistakes))
  const resolved = $derived(app.mistakes.filter(m => m.resolved))
  const notes = $derived(byNote(app.mistakes))
  const weekAgo = $derived(new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv'))
  const thisWeek = $derived(app.mistakes.reduce((n, m) => n + m.history.filter(d => d >= weekAgo).length, 0))

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase()
    const base = showResolved ? [...open, ...resolved.sort((a, b) => b.resolved!.localeCompare(a.resolved!))] : open
    return base.filter(m =>
      (source === 'all' || m.source === source) &&
      (!note || m.path === note) &&
      (!q || m.q.prompt.toLowerCase().includes(q) || answerText(m.q).toLowerCase().includes(q))
    )
  })
  const practisable = $derived(visible.filter(m => !m.resolved))

  function practise(list: Mistake[], title = 'Mistakes') {
    if (!list.length) return
    app.modal = { type: 'quiz', scope: { type: 'all' }, preset: list.map(toQuestion), title }
  }

  const remove = (id: string) => app.setMistakes(app.mistakes.filter(m => m.id !== id))
  const setWhy = (id: string, why: string) => app.setMistakes(app.mistakes.map(m => (m.id === id ? { ...m, why: why.trim() || undefined } : m)))

  function exportCsv() {
    downloadFile(`omnia-error-log-${today()}.csv`, '﻿' + toCSV(app.mistakes), 'text/csv;charset=utf-8')
  }
  function clean() {
    const n = resolved.length
    if (!n) return
    app.setMistakes(clearResolved(app.mistakes))
    app.toast(`Cleared ${n} resolved ${n === 1 ? 'mistake' : 'mistakes'}`)
  }
  const correctText = (m: Mistake) => answerText(m.q)
</script>

<div class="log">
  <div class="tiles">
    <div class="tile"><span class="v">{open.length}</span><span class="l">to practise</span></div>
    <div class="tile"><span class="v">{resolved.length}</span><span class="l">resolved</span></div>
    <div class="tile"><span class="v">{thisWeek}</span><span class="l">slips this week</span></div>
    <div class="tile"><span class="v name">{notes[0]?.active ? noteTitle(notes[0].path) : '–'}</span><span class="l">most mistakes</span></div>
  </div>

  <div class="panel">
    <div class="bar">
      <input class="field search" placeholder="Search the log…" bind:value={query} aria-label="Search the error log" />
      <select class="field" bind:value={source} aria-label="Source">
        <option value="all">Quizzes and flashcards</option>
        <option value="quiz">Quizzes only</option>
        <option value="card">Flashcards only</option>
      </select>
      <select class="field" bind:value={note} aria-label="Note">
        <option value="">All notes</option>
        {#each notes as n}<option value={n.path}>{n.path ? noteTitle(n.path) : 'Other'} ({n.active})</option>{/each}
      </select>
      <label class="check"><input type="checkbox" class="checkbox" bind:checked={showResolved} /> Show resolved</label>
      <span class="grow"></span>
      <button class="btn" onclick={exportCsv} disabled={!app.mistakes.length}><Icon name="download" size={14} /> CSV</button>
      {#if resolved.length}<button class="btn" onclick={clean}>Clear resolved</button>{/if}
      <button class="btn primary" disabled={!practisable.length} onclick={() => practise(practisable)}><Icon name="play" size={14} /> Practise {practisable.length || ''}</button>
    </div>

    {#each visible as m (m.id)}
      <article class="item" class:done={!!m.resolved}>
        <div class="prompt">{@html renderInline(m.q.prompt)}</div>
        <div class="answers">
          <div><span class="k">Answer</span> <span class="right">{@html renderInline(correctText(m))}</span></div>
          {#if m.given}<div><span class="k">You said</span> <span class="wrong">{m.given}</span></div>{/if}
        </div>
        {#if m.q.explanation}<div class="expl muted">{@html renderInline(m.q.explanation)}</div>{/if}
        <div class="meta">
          <span class="pill">{m.source === 'quiz' ? 'Quiz' : 'Flashcard'}</span>
          {#if m.path}<button class="link" onclick={() => app.openNote(m.path)}>{noteTitle(m.path)}</button>{/if}
          <span class="muted">missed {m.count}× · last {formatShort(m.last)}</span>
          {#if m.resolved}<span class="ok"><Icon name="check" size={13} /> resolved {formatShort(m.resolved)}</span>
          {:else if m.streak}<span class="muted">{m.streak}/{RESOLVE_AFTER} right in a row</span>{/if}
          <span class="grow"></span>
          <button class="icon-btn" title="Why did I get this wrong?" aria-label="Add a note about this mistake" onclick={() => (editing = editing === m.id ? null : m.id)}><Icon name="pencil" size={14} /></button>
          {#if !m.resolved}<button class="icon-btn" title="Practise just this one" aria-label="Practise this one" onclick={() => practise([m], 'One mistake')}><Icon name="play" size={14} /></button>{/if}
          <button class="icon-btn" title="Remove from the log" aria-label="Remove from the log" onclick={() => remove(m.id)}><Icon name="trash" size={14} /></button>
        </div>
        {#if editing === m.id || m.why}
          <input class="field why" placeholder="Why did this go wrong? (a note to your future self)" value={m.why ?? ''}
            onchange={e => setWhy(m.id, e.currentTarget.value)} onkeydown={e => e.key === 'Enter' && (e.currentTarget.blur(), (editing = null))} />
        {/if}
      </article>
    {:else}
      <div class="empty">
        <Icon name="check" size={26} />
        {#if app.mistakes.length}
          <p>Nothing matches that filter.</p>
        {:else}
          <p><strong>No mistakes yet.</strong></p>
          <p class="muted">A quiz question you get wrong, or a flashcard you press <em>Again</em> on, is kept here. It leaves the list after {RESOLVE_AFTER} right answers in a row.</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .log { display: grid; gap: 22px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .tile { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; display: grid; gap: 2px; min-width: 0; }
  .tile .v { font-family: var(--font-heading); font-size: 32px; font-weight: 700; }
  .tile .v.name { font-size: 20px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile .l { font-size: var(--fs-sm); color: var(--text-muted); }
  .panel { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 16px; padding: 18px 22px; }
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .bar .field { width: auto; }
  .search { width: 200px; }
  .check { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--text-muted); }
  .item { padding: 16px 0; border-top: 1px solid var(--border); display: grid; gap: 8px; }
  .item.done { opacity: 0.6; }
  .prompt { font-size: var(--fs-lg); line-height: 1.5; overflow-wrap: anywhere; }
  .answers { display: grid; gap: 3px; font-size: var(--fs-md); }
  .k { display: inline-block; min-width: 62px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600; }
  .right { color: var(--good); font-weight: 600; }
  .wrong { color: var(--accent-strong); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--accent-strong) 50%, transparent); }
  .expl { font-size: var(--fs-sm); line-height: 1.5; }
  .meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: var(--fs-sm); }
  .link { color: var(--link); }
  .ok { color: var(--good); display: inline-flex; align-items: center; gap: 4px; }
  .why { font-size: var(--fs-sm); }
  .empty { display: grid; justify-items: center; gap: 4px; padding: 44px 20px; text-align: center; color: var(--text-muted); }
  .empty p { margin: 0; max-width: 52ch; line-height: 1.55; }
</style>
