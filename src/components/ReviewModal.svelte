<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { clozeAnswers, clozeHidden, clozeRevealed, type Card } from '../lib/cards'
  import type { Mistake } from '../lib/mistakes'
  import { renderInline } from '../lib/inline'
  import { GRADE_LABELS, previewIntervals, type Grade } from '../lib/sr'
  import { shuffle } from '../lib/quiz'
  import type { Scope, StudyData } from '../lib/study'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { scope }: { scope: Scope } = $props()

  let queue = $state<Card[]>([])
  let total = $state(0)
  let revealed = $state(false)
  let cram = $state(false)
  let finished = $state(false)
  let stats = $state([0, 0, 0, 0])
  let undo = $state<{ snapshot: StudyData; mistakes: Mistake[]; card: Card; grade: Grade } | null>(null)

  const card = $derived(queue[0])
  const done = $derived(stats.reduce((a, b) => a + b, 0))
  const label = $derived(
    scope.type === 'note' ? noteTitle(scope.path) : scope.type === 'folder' ? (scope.path || 'whole folder') : scope.type === 'tag' ? `#${scope.tag}` : 'All notes'
  )
  const intervals = $derived(card ? previewIntervals(app.study.cards[card.id], Date.now()) : [])
  const front = $derived(card ? (card.kind === 'cloze' ? clozeHidden(card.front, card.clozeIndex!) : card.front) : '')
  const back = $derived(card ? (card.kind === 'cloze' ? clozeRevealed(card.front, card.clozeIndex!) : card.back) : '')
  const remaining = $derived(app.dueSummary(scope))

  function start() {
    queue = app.buildQueue(scope)
    total = queue.length
    finished = queue.length === 0
    revealed = false
  }

  function startCram() {
    cram = true
    queue = shuffle(app.scopeCards(scope))
    total = queue.length
    stats = [0, 0, 0, 0]
    finished = queue.length === 0
    revealed = false
  }

  onMount(start)

  function grade(g: Grade) {
    if (!card || !revealed) return
    const current = card
    const snapshot = app.study
    const mistakes = app.mistakes
    if (g === 0) {
      app.recordMistake({
        id: current.id, source: 'card', path: current.path,
        q: {
          kind: 'recall', options: [],
          prompt: current.kind === 'cloze' ? clozeHidden(current.front, current.clozeIndex!) : current.front,
          answers: [current.kind === 'cloze' ? clozeAnswers(current.front, current.clozeIndex!).join(' / ') : current.back]
        }
      })
    } else if (g >= 2) app.recordCorrect(current.id)
    if (!cram) {
      const next = app.gradeCard(current.id, g, Date.now(), current.path)
      // A card still in learning comes back later in this session.
      if (next.stage === 'learning' || g === 0) queue = [...queue.slice(1), current]
      else queue = queue.slice(1)
    } else {
      queue = g === 0 ? [...queue.slice(1), current] : queue.slice(1)
    }
    stats = stats.map((n, i) => (i === g ? n + 1 : n))
    undo = cram ? null : { snapshot, mistakes, card: current, grade: g }
    revealed = false
    if (!queue.length) finished = true
  }

  function undoLast() {
    if (!undo) return
    app.restoreStudy(undo.snapshot)
    app.setMistakes(undo.mistakes)
    queue = [undo.card, ...queue.filter(c => c.id !== undo!.card.id)]
    stats = stats.map((n, i) => (i === undo!.grade ? n - 1 : n))
    undo = null
    finished = false
    revealed = false
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (!finished && !revealed) revealed = true
      else if (revealed && e.key === 'Enter') grade(2)
    } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) grade((+e.key - 1) as Grade)
    else if (e.key === 'z' && undo) undoLast()
  }

  function openSource() {
    if (!card) return
    app.modal = null
    app.openNote(card.path)
    app.pendingLine = { path: card.path, line: card.line }
  }

  const accuracy = $derived(done ? Math.round(((stats[2] + stats[3]) / done) * 100) : 0)
</script>

<svelte:window {onkeydown} />

<Modal onclose={() => (app.modal = null)} width={720} label="Flashcard review">
  <div class="review">
    <header>
      <div class="grow">
        <div class="where muted">{cram ? 'Practice (schedule unchanged)' : 'Review'} · {label}</div>
        <div class="bar" aria-hidden="true"><span style:width="{total ? (Math.min(done, total) / total) * 100 : 0}%"></span></div>
      </div>
      <span class="count muted">{Math.min(done, total)} / {total}</span>
      <button class="icon-btn" title="Close (Esc)" onclick={() => (app.modal = null)}><Icon name="x" size={18} /></button>
    </header>

    {#if finished}
      <div class="done">
        {#if done}
          <h2>Session complete</h2>
          <p class="big">{accuracy}% recalled</p>
          <div class="breakdown">
            {#each GRADE_LABELS as l, i}<div><strong>{stats[i]}</strong><span class="muted">{l}</span></div>{/each}
          </div>
        {:else}
          <h2>All caught up</h2>
          <p class="muted">There are no flashcards due {scope.type === 'all' ? '' : 'here '}right now.
            {#if remaining.freshTotal > remaining.fresh}You have reached today's new-card limit ({app.settings.newPerDay}); change it in Settings.{/if}</p>
        {/if}
        <div class="row actions">
          {#if undo}<button class="btn" onclick={undoLast}><Icon name="undo" size={15} /> Undo last</button>{/if}
          {#if !cram && app.scopeCards(scope).length}<button class="btn" onclick={startCram}>Practise everything anyway</button>{/if}
          <span class="grow"></span>
          <button class="btn primary" onclick={() => (app.modal = null)}>Close</button>
        </div>
      </div>
    {:else if card}
      <div class="card" class:revealed>
        <div class="face front">{@html renderInline(front)}</div>
        {#if revealed && card.kind === 'basic'}
          <hr />
          <div class="face back">{@html renderInline(back)}</div>
        {:else if revealed}
          <hr />
          <div class="face back">{@html renderInline(back)}</div>
        {/if}
      </div>
      <button class="source muted" onclick={openSource}><Icon name="file" size={13} /> {noteTitle(card.path)}</button>

      {#if !revealed}
        <button class="btn primary big show" onclick={() => (revealed = true)}>Show answer <kbd>Space</kbd></button>
      {:else}
        <div class="grades">
          {#each GRADE_LABELS as l, i}
            <button class="grade g{i}" onclick={() => grade(i as Grade)}>
              <span class="when">{cram ? '' : intervals[i]}</span>
              <span class="what">{l}</span>
              <kbd>{i + 1}</kbd>
            </button>
          {/each}
        </div>
      {/if}
      <div class="foot muted">
        {#if undo}<button class="link" onclick={undoLast}>Undo (z)</button>{/if}
        <span class="grow"></span>
        {#if !cram}{remaining.review + remaining.learning} due · {remaining.fresh} new{/if}
      </div>
    {/if}
  </div>
</Modal>

<style>
  .review { padding: 22px 28px 20px; display: grid; gap: 16px; min-height: 420px; align-content: start; }
  header { display: flex; align-items: center; gap: 14px; }
  .where { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .bar { height: 5px; border-radius: 5px; background: var(--bg-active); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
  .count { font-variant-numeric: tabular-nums; font-size: 13px; }
  .card { min-height: 220px; padding: 34px 36px; border-radius: 16px; background: var(--bg); border: 1px solid var(--border); display: grid; align-content: center; gap: 18px; text-align: center; }
  .face { font-family: var(--font-heading); font-weight: 700; font-size: 26px; line-height: 1.4; overflow-wrap: anywhere; }
  .face.back { font-family: var(--font-body); font-weight: 400; font-size: 20px; line-height: 1.55; color: var(--text); }
  .card hr { width: 60%; border: 0; border-top: 1px solid var(--border-strong); margin: 0 auto; }
  .face :global(.blank) { color: var(--accent-strong); background: var(--accent-soft); border-radius: 6px; padding: 0 10px; font-weight: 700; }
  .face :global(.answer) { color: var(--accent-strong); font-weight: 700; border-bottom: 2px solid var(--accent); }
  .face :global(code) { font-family: var(--font-mono); font-size: 0.8em; background: var(--code-bg); padding: 1px 6px; border-radius: 5px; }
  .face :global(em) { color: var(--italic); }
  .face :global(.katex-display) { margin: 0.3em 0; }
  .source { justify-self: center; display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; }
  .source:hover { color: var(--link); }
  .show { justify-self: center; }
  .show kbd { margin-left: 8px; background: rgba(255, 255, 255, 0.2); color: inherit; border-color: transparent; }
  .grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .grade { display: grid; gap: 1px; justify-items: center; padding: 10px 6px 8px; border-radius: 12px; border: 1px solid var(--border-strong); background: var(--bg); position: relative; transition: transform 0.08s, background 0.12s; }
  .grade:hover { transform: translateY(-1px); background: var(--bg-hover); }
  .grade .when { font-size: 12.5px; color: var(--text-muted); min-height: 18px; }
  .grade .what { font-weight: 600; font-size: 15px; }
  .grade kbd { position: absolute; top: 5px; right: 6px; font-size: 10px; padding: 0 4px; }
  .g0 { border-bottom: 3px solid var(--bad); }
  .g1 { border-bottom: 3px solid var(--warn); }
  .g2 { border-bottom: 3px solid var(--good); }
  .g3 { border-bottom: 3px solid #3f7ca8; }
  .foot { display: flex; font-size: 12.5px; }
  .link { color: var(--link); }
  .done { display: grid; gap: 14px; text-align: center; padding: 40px 0 10px; }
  .done h2 { font-size: 34px; }
  .done .big { font-family: var(--font-heading); font-weight: 700; font-size: 22px; margin: 0; color: var(--accent-strong); }
  .breakdown { display: flex; justify-content: center; gap: 28px; margin: 6px 0; }
  .breakdown div { display: grid; }
  .breakdown strong { font-size: 24px; font-family: var(--font-heading); }
  .actions { margin-top: 12px; text-align: left; }
</style>
