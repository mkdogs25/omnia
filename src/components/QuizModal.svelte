<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { today } from '../lib/dates'
  import { renderInline } from '../lib/inline'
  import { generateQuestions, isCorrectText, questionsFromNote, shuffle, type QuizQuestion } from '../lib/quiz'
  import { inScope, type Scope } from '../lib/study'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { scope }: { scope: Scope } = $props()

  type Phase = 'setup' | 'run' | 'results'
  let phase = $state<Phase>('setup')
  let source = $state<'both' | 'written' | 'cards'>('both')
  let mode = $state<'mixed' | 'choice' | 'type'>('mixed')
  let count = $state(10)

  let questions = $state<QuizQuestion[]>([])
  let index = $state(0)
  let picked = $state<number[]>([])
  let typed = $state('')
  let checked = $state(false)
  let selfKnew = $state<boolean | null>(null)
  let results = $state<{ q: QuizQuestion; ok: boolean; given: string }[]>([])

  const label = $derived(scope.type === 'note' ? noteTitle(scope.path) : scope.type === 'folder' ? scope.path || 'whole folder' : scope.type === 'tag' ? `#${scope.tag}` : 'all notes')

  const written = $derived.by(() => {
    app.indexVersion
    const out: QuizQuestion[] = []
    for (const rec of app.index.notes.values()) {
      if (scope.type === 'note' && rec.path !== scope.path) continue
      if (scope.type === 'folder' && scope.path && !rec.path.startsWith(scope.path + '/')) continue
      if (scope.type === 'tag' && !rec.parsed.tags.includes(scope.tag)) continue
      out.push(...questionsFromNote(rec.text))
    }
    return out
  })
  const cards = $derived(app.scopeCards(scope))
  const available = $derived((source !== 'cards' ? written.length : 0) + (source !== 'written' ? cards.length : 0))

  $effect(() => {
    if (phase === 'setup') {
      if (!written.length) source = 'cards'
      else if (!cards.length) source = 'written'
    }
  })

  function begin(list: QuizQuestion[]) {
    questions = list
    index = 0
    results = []
    reset()
    phase = list.length ? 'run' : 'setup'
  }

  function start() {
    const pool: QuizQuestion[] = []
    if (source !== 'cards') pool.push(...written)
    if (source !== 'written') {
      const cardQs = generateQuestions(cards, { mode, count: Math.min(count, cards.length), pool: app.allCards() })
      pool.push(...cardQs)
    }
    begin(shuffle(pool).slice(0, count))
  }

  function reset() {
    picked = []
    typed = ''
    checked = false
    selfKnew = null
  }

  const q = $derived(questions[index])
  const correctIdx = $derived(q?.kind === 'choice' ? q.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0) : [])
  const multi = $derived(correctIdx.length > 1)

  const isOk = $derived.by(() => {
    if (!q || !checked) return false
    if (q.kind === 'choice') return picked.length === correctIdx.length && correctIdx.every(i => picked.includes(i))
    if (q.kind === 'text') return isCorrectText(typed, q.answers)
    return selfKnew === true
  })

  function choose(i: number) {
    if (checked) return
    if (multi) picked = picked.includes(i) ? picked.filter(x => x !== i) : [...picked, i]
    else {
      picked = [i]
      check()
    }
  }

  function check() {
    if (checked) return
    checked = true
  }

  function next() {
    const given = q.kind === 'choice' ? picked.map(i => q.options[i].text).join(', ') : q.kind === 'text' ? typed : selfKnew ? 'I knew it' : 'Not yet'
    results = [...results, { q, ok: isOk, given }]
    if (index + 1 >= questions.length) finish()
    else {
      index++
      reset()
    }
  }

  function finish() {
    const correct = results.filter(r => r.ok).length
    const path = scope.type === 'note' ? scope.path : scope.type === 'folder' ? scope.path : scope.type === 'tag' ? `#${scope.tag}` : ''
    app.recordQuiz({ date: today(), path, total: results.length, correct })
    for (const r of results) if (!r.ok && r.q.cardId) app.lapseCard(r.q.cardId)
    phase = 'results'
  }

  function onkeydown(e: KeyboardEvent) {
    if (phase !== 'run' || (e.target as HTMLElement).tagName === 'INPUT' || e.ctrlKey || e.metaKey) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!checked) { if (q.kind !== 'recall' && (q.kind === 'text' ? typed.trim() : picked.length)) check() }
      else if (q.kind !== 'recall' || selfKnew !== null) next()
    } else if (q.kind === 'choice' && /^[1-9]$/.test(e.key) && +e.key <= q.options.length) choose(+e.key - 1)
  }

  const score = $derived(results.filter(r => r.ok).length)
  const missed = $derived(results.filter(r => !r.ok).map(r => r.q))
  const pct = $derived(results.length ? Math.round((score / results.length) * 100) : 0)
</script>

<svelte:window {onkeydown} />

<Modal onclose={() => (app.modal = null)} width={680} label="Quiz">
  <div class="quiz">
    <header>
      <div class="grow">
        <div class="where muted">Quiz · {label}</div>
        {#if phase === 'run'}<div class="bar" aria-hidden="true"><span style:width="{(index / questions.length) * 100}%"></span></div>{/if}
      </div>
      {#if phase === 'run'}<span class="muted count">{index + 1} / {questions.length}</span>{/if}
      <button class="icon-btn" title="Close (Esc)" onclick={() => (app.modal = null)}><Icon name="x" size={18} /></button>
    </header>

    {#if phase === 'setup'}
      <h2>Build a quiz</h2>
      <div class="opts">
        <div class="opt">
          <span class="lbl">Questions from</span>
          <div class="tabs-pill">
            <button class:on={source === 'both'} disabled={!written.length || !cards.length} onclick={() => (source = 'both')}>Both</button>
            <button class:on={source === 'written'} disabled={!written.length} onclick={() => (source = 'written')}>Written ({written.length})</button>
            <button class:on={source === 'cards'} disabled={!cards.length} onclick={() => (source = 'cards')}>Flashcards ({cards.length})</button>
          </div>
        </div>
        {#if source !== 'written'}
          <div class="opt">
            <span class="lbl">Flashcard questions</span>
            <div class="tabs-pill">
              <button class:on={mode === 'mixed'} onclick={() => (mode = 'mixed')}>Mixed</button>
              <button class:on={mode === 'choice'} onclick={() => (mode = 'choice')}>Multiple choice</button>
              <button class:on={mode === 'type'} onclick={() => (mode = 'type')}>Type the answer</button>
            </div>
          </div>
        {/if}
        <div class="opt">
          <span class="lbl">Number of questions <strong>{Math.min(count, Math.max(available, 1))}</strong></span>
          <input type="range" min="3" max="50" bind:value={count} />
        </div>
      </div>
      {#if !available}
        <p class="muted">There is nothing to quiz on yet. Add flashcards (<code>Front :: Back</code>) or a <code>quiz</code> block to your notes.</p>
      {/if}
      <div class="row"><span class="grow"></span><button class="btn primary big" disabled={!available} onclick={start}><Icon name="play" size={15} /> Start quiz</button></div>

    {:else if phase === 'run' && q}
      <div class="q">
        <div class="prompt">{@html renderInline(q.prompt)}</div>
        {#if multi && !checked}<p class="muted small">Select all that apply.</p>{/if}

        {#if q.kind === 'choice'}
          <div class="choices">
            {#each q.options as o, i}
              <button class="choice" class:picked={picked.includes(i)} class:right={checked && o.correct} class:wrong={checked && picked.includes(i) && !o.correct}
                disabled={checked} onclick={() => choose(i)}>
                <span class="key">{i + 1}</span><span>{@html renderInline(o.text)}</span>
              </button>
            {/each}
          </div>
          {#if multi && !checked}<button class="btn primary" disabled={!picked.length} onclick={check}>Check</button>{/if}
        {:else if q.kind === 'text'}
          <form class="typed" onsubmit={e => { e.preventDefault(); if (!checked && typed.trim()) check(); else if (checked) next() }}>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field" autofocus placeholder="Type your answer" bind:value={typed} disabled={checked} class:good={checked && isOk} class:bad={checked && !isOk} />
            {#if !checked}<button class="btn primary" type="submit" disabled={!typed.trim()}>Check</button>{/if}
          </form>
        {:else}
          {#if !checked}<button class="btn primary" onclick={check}>Show answer</button>{/if}
        {/if}

        {#if checked}
          <div class="feedback" class:ok={q.kind === 'recall' ? selfKnew === true : isOk} class:no={q.kind === 'recall' ? selfKnew === false : !isOk}>
            {#if q.kind === 'recall'}
              <div class="ans">{@html renderInline(q.answers[0])}</div>
              {#if selfKnew === null}
                <div class="row"><button class="btn" onclick={() => (selfKnew = true)}>I knew it</button><button class="btn" onclick={() => (selfKnew = false)}>Not yet</button></div>
              {/if}
            {:else}
              <strong>{isOk ? 'Correct' : 'Not quite'}</strong>
              {#if !isOk && q.kind === 'text'}<div>Answer: <span class="ans">{@html renderInline(q.answers[0])}</span></div>{/if}
            {/if}
            {#if q.explanation}<div class="muted expl">{@html renderInline(q.explanation)}</div>{/if}
          </div>
          {#if q.kind !== 'recall' || selfKnew !== null}
            <div class="row"><span class="grow"></span><button class="btn primary" onclick={next}>{index + 1 >= questions.length ? 'Finish' : 'Next'} <kbd>Enter</kbd></button></div>
          {/if}
        {/if}
      </div>

    {:else if phase === 'results'}
      <div class="results">
        <h2>{pct >= 80 ? 'Well done' : pct >= 50 ? 'Getting there' : 'Keep practising'}</h2>
        <p class="score">{score} / {results.length} <span class="muted">({pct}%)</span></p>
        {#if results.some(r => !r.ok && r.q.cardId)}<p class="muted small">Flashcards you missed have been sent back to your review queue.</p>{/if}
        {#if missed.length}
          <h3>To revisit</h3>
          <ul>
            {#each results.filter(r => !r.ok) as r}
              <li><div>{@html renderInline(r.q.prompt)}</div>
                <div class="muted small">Your answer: {r.given || '(blank)'} · Correct: {@html renderInline(r.q.kind === 'choice' ? r.q.options.filter(o => o.correct).map(o => o.text).join(', ') : r.q.answers[0])}</div></li>
            {/each}
          </ul>
        {/if}
        <div class="row">
          {#if missed.length}<button class="btn" onclick={() => begin(shuffle(missed))}>Retry missed ({missed.length})</button>{/if}
          <button class="btn" onclick={() => (phase = 'setup')}>New quiz</button>
          <span class="grow"></span>
          <button class="btn primary" onclick={() => (app.modal = null)}>Close</button>
        </div>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .quiz { padding: 22px 28px 24px; display: grid; gap: 16px; min-height: 380px; align-content: start; }
  header { display: flex; align-items: center; gap: 14px; }
  .where { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .bar { height: 5px; border-radius: 5px; background: var(--bg-active); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
  .count { font-variant-numeric: tabular-nums; font-size: 13px; }
  h2 { font-size: 32px; }
  h3 { font-size: 20px; margin-top: 6px; }
  .opts { display: grid; gap: 18px; }
  .opt { display: grid; gap: 8px; }
  .lbl { font-size: 13px; color: var(--text-muted); }
  .tabs-pill { flex-wrap: wrap; }
  .tabs-pill button[disabled] { opacity: 0.4; pointer-events: none; }
  input[type='range'] { accent-color: var(--accent); width: 100%; }
  .q { display: grid; gap: 16px; }
  .prompt { font-family: var(--font-heading); font-size: 24px; line-height: 1.4; }
  .prompt :global(.blank) { color: var(--accent-strong); background: var(--accent-soft); border-radius: 6px; padding: 0 10px; font-weight: 700; }
  .small { font-size: 13px; margin: 0; }
  .choices { display: grid; gap: 8px; }
  .choice { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 11px; border: 1px solid var(--border-strong); background: var(--bg); text-align: left; font-size: 15.5px; }
  .choice:hover:not([disabled]) { background: var(--bg-hover); }
  .choice.picked { border-color: var(--accent); background: var(--accent-soft); }
  .choice.right { border-color: var(--good); background: color-mix(in srgb, var(--good) 18%, transparent); }
  .choice.wrong { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 16%, transparent); }
  .key { width: 22px; height: 22px; border-radius: 6px; background: var(--bg-active); display: grid; place-items: center; font-size: 12px; flex: none; }
  .typed { display: flex; gap: 8px; }
  .field.good { border-color: var(--good); }
  .field.bad { border-color: var(--bad); }
  .feedback { padding: 12px 16px; border-radius: 11px; background: var(--bg-hover); display: grid; gap: 6px; }
  .feedback.ok { background: color-mix(in srgb, var(--good) 16%, transparent); }
  .feedback.no { background: color-mix(in srgb, var(--bad) 14%, transparent); }
  .ans { font-weight: 600; }
  .expl { font-size: 14px; }
  .score { font-family: var(--font-heading); font-size: 40px; margin: 0; }
  .results ul { padding-left: 18px; display: grid; gap: 10px; margin: 0 0 14px; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
  kbd { margin-left: 6px; background: rgba(255, 255, 255, 0.2); color: inherit; border-color: transparent; }
</style>
