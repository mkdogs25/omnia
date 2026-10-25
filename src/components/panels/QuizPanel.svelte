<script lang="ts">
  import { app } from '../../lib/app.svelte'
  import { plainText } from '../../lib/inline'
  import { addQuestionToNote, questionsFromNote, type QuizOption, type QuizQuestion } from '../../lib/quiz'
  import Icon from '../Icon.svelte'

  let { path }: { path: string } = $props()

  type Kind = 'choice' | 'truefalse' | 'text'
  let kind = $state<Kind>('choice')
  let prompt = $state('')
  let options = $state<QuizOption[]>([
    { text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }
  ])
  let tf = $state(true)
  let answers = $state('')
  let explanation = $state('')

  const rec = $derived(app.record(path))
  const written = $derived(rec ? questionsFromNote(rec.text) : [])
  const cardCount = $derived(rec?.parsed.cards.length ?? 0)
  const past = $derived(app.study.quizzes.filter(r => r.path === path).slice(-6))

  const valid = $derived.by(() => {
    if (!prompt.trim()) return false
    if (kind === 'choice') return options.filter(o => o.text.trim()).length >= 2 && options.some(o => o.correct && o.text.trim())
    if (kind === 'text') return answers.trim().length > 0
    return true
  })

  function setCorrect(i: number) {
    options = options.map((o, k) => ({ ...o, correct: k === i }))
  }

  function add() {
    if (!valid || !app.editor) return
    const q: Pick<QuizQuestion, 'kind' | 'prompt' | 'options' | 'answers' | 'explanation'> =
      kind === 'text'
        ? { kind: 'text', prompt: prompt.trim(), options: [], answers: answers.split('|').map(a => a.trim()).filter(Boolean), explanation }
        : kind === 'truefalse'
          ? { kind: 'choice', prompt: prompt.trim(), answers: [], explanation, options: [{ text: 'True', correct: tf }, { text: 'False', correct: !tf }] }
          : { kind: 'choice', prompt: prompt.trim(), answers: [], explanation, options: options.filter(o => o.text.trim()).map(o => ({ text: o.text.trim(), correct: o.correct })) }
    app.editor.replaceAll(addQuestionToNote(app.editor.getText(), q))
    prompt = ''
    answers = ''
    explanation = ''
    options = [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }]
    app.toast('Question added to the note')
  }

  const total = $derived(written.length + cardCount)
</script>

<section class="summary">
  <div class="line"><strong>{written.length}</strong> written question{written.length === 1 ? '' : 's'}</div>
  <div class="line"><strong>{cardCount}</strong> flashcard{cardCount === 1 ? '' : 's'} (can become questions)</div>
  <button class="btn primary" disabled={!total} onclick={() => (app.modal = { type: 'quiz', scope: { type: 'note', path } })}>
    <Icon name="play" size={14} /> Quiz me on this note
  </button>
  <button class="btn" onclick={() => (app.modal = { type: 'autogen', path })}><Icon name="wand" size={14} /> Generate questions from this note</button>
  {#if past.length}
    <div class="past" aria-label="Recent scores">
      {#each past as r}
        <span class="bar" title="{r.date}: {r.correct}/{r.total}" style:height="{Math.max(8, (r.correct / r.total) * 40)}px"></span>
      {/each}
      <span class="muted small">last {past.length} score{past.length === 1 ? '' : 's'}</span>
    </div>
  {/if}
</section>

<section>
  <h3>Quiz maker</h3>
  <div class="tabs-pill small">
    <button class:on={kind === 'choice'} onclick={() => (kind = 'choice')}>Multiple choice</button>
    <button class:on={kind === 'truefalse'} onclick={() => (kind = 'truefalse')}>True / false</button>
    <button class:on={kind === 'text'} onclick={() => (kind = 'text')}>Short answer</button>
  </div>
  <form class="maker" onsubmit={e => { e.preventDefault(); add() }}>
    <textarea class="field" rows="2" placeholder="Question" bind:value={prompt}></textarea>
    {#if kind === 'choice'}
      {#each options as o, i}
        <div class="opt">
          <input type="radio" name="correct" checked={o.correct} onchange={() => setCorrect(i)} title="Mark as correct" />
          <input class="field" placeholder={o.correct ? 'Correct answer' : 'Wrong answer'} bind:value={o.text} />
          {#if options.length > 2}<button type="button" class="icon-btn" title="Remove" onclick={() => (options = options.filter((_, k) => k !== i))}><Icon name="x" size={14} /></button>{/if}
        </div>
      {/each}
      {#if options.length < 6}<button type="button" class="link" onclick={() => (options = [...options, { text: '', correct: false }])}>+ Add option</button>{/if}
    {:else if kind === 'truefalse'}
      <div class="tf">
        <label><input type="radio" name="tf" checked={tf} onchange={() => (tf = true)} /> True</label>
        <label><input type="radio" name="tf" checked={!tf} onchange={() => (tf = false)} /> False</label>
      </div>
    {:else}
      <input class="field" placeholder="Accepted answer(s), separated by |" bind:value={answers} />
    {/if}
    <input class="field" placeholder="Explanation (optional)" bind:value={explanation} />
    <button class="btn primary" type="submit" disabled={!valid}>Add to note</button>
  </form>
  <p class="faint small">Questions are saved inside the note as a <code>quiz</code> block, so they stay plain Markdown.</p>
</section>

{#if written.length}
  <section>
    <h3>Written questions</h3>
    {#each written as q (q.id)}
      <div class="q"><Icon name={q.kind === 'choice' ? 'list' : 'pencil'} size={13} /><span class="truncate">{plainText(q.prompt)}</span></div>
    {/each}
  </section>
{/if}

<style>
  section { margin-bottom: 20px; }
  .summary { background: var(--bg-hover); border-radius: 12px; padding: 12px; display: grid; gap: 8px; }
  .line { font-size: 14px; }
  .line strong { font-family: var(--font-heading); font-size: 18px; margin-right: 4px; }
  .past { display: flex; align-items: flex-end; gap: 5px; height: 52px; }
  .past .bar { width: 14px; background: var(--accent); border-radius: 3px 3px 0 0; opacity: 0.85; }
  .small { font-size: 12px; }
  h3 { font-family: var(--font-body); font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); font-weight: 600; margin: 0 0 8px; }
  .tabs-pill.small { display: flex; flex-wrap: wrap; margin-bottom: 10px; }
  .tabs-pill.small button { padding: 3px 10px; font-size: 12.5px; }
  .maker { display: grid; gap: 8px; }
  .opt { display: flex; align-items: center; gap: 8px; }
  .opt input[type='radio'], .tf input { accent-color: var(--accent); }
  .opt .field { flex: 1; }
  .tf { display: flex; gap: 18px; font-size: 14px; }
  .link { font-size: 12.5px; color: var(--link); justify-self: start; }
  .q { display: flex; gap: 8px; align-items: center; font-size: 13.5px; padding: 3px 4px; color: var(--text-muted); }
  code { background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
  p { line-height: 1.5; }
</style>
