<script lang="ts">
  import { app } from '../../lib/app.svelte'
  import { clozePlain, wrapCloze } from '../../lib/cards'
  import { plainText } from '../../lib/inline'
  import { dueCards } from '../../lib/study'
  import { isDue } from '../../lib/sr'
  import { formatInterval } from '../../lib/sr'
  import Icon from '../Icon.svelte'

  let { path }: { path: string } = $props()

  let front = $state('')
  let back = $state('')
  let twoWay = $state(false)
  let showSyntax = $state(false)

  const cards = $derived(app.record(path)?.parsed.cards ?? [])
  const split = $derived(dueCards(cards, app.study.cards, Date.now()))
  const dueNow = $derived(split.learning.length + split.review.length)

  function status(id: string): { label: string; cls: string } {
    const s = app.study.cards[id]
    if (!s) return { label: 'New', cls: 'new' }
    if (isDue(s, Date.now())) return { label: 'Due', cls: 'due' }
    return { label: formatInterval(s.due - Date.now()), cls: 'later' }
  }

  function cloze() {
    const sel = app.editor?.getSelection() ?? ''
    if (!sel) {
      app.toast('Select some text in the note first, then press this (or Ctrl+Shift+C).')
      return
    }
    app.editor?.replaceSelection(wrapCloze(sel, app.editor.getText()))
  }

  function addCard() {
    const f = front.trim().replace(/\n+/g, ' ')
    const b = back.trim()
    if (!f || !b || !app.editor) return
    const text = app.editor.getText()
    const sep = twoWay ? ':::' : '::'
    const line = b.includes('\n') ? `${f}\n${twoWay ? '??' : '?'}\n${b}` : `${f} ${sep} ${b}`
    app.editor.appendText(`${text.endsWith('\n') ? '' : '\n'}${text.trim() ? '\n' : ''}${line}\n`)
    front = ''
    back = ''
  }

  function show(line: number) {
    app.editor?.scrollToLine(line)
  }

  const preview = (c: (typeof cards)[number]) => plainText(c.kind === 'cloze' ? clozePlain(c.front) : c.front)
</script>

<section class="summary">
  <div class="stats">
    <div><strong>{cards.length}</strong><span>cards</span></div>
    <div><strong class:due={dueNow > 0}>{dueNow}</strong><span>due</span></div>
    <div><strong>{split.fresh.length}</strong><span>new</span></div>
  </div>
  <div class="row">
    <button class="btn primary grow" disabled={!cards.length} onclick={() => (app.modal = { type: 'review', scope: { type: 'note', path } })}>
      <Icon name="play" size={14} /> Review this note
    </button>
    <button class="btn" disabled={!cards.length} title="Quiz on this note" onclick={() => (app.modal = { type: 'quiz', scope: { type: 'note', path } })}><Icon name="zap" size={15} /></button>
  </div>
</section>

<section>
  <h3>Make a card</h3>
  <div class="row tools">
    <button class="btn" onclick={cloze}>Cloze from selection</button>
    <button class="btn" title="Suggest cards from definitions, highlights, figures and lists" onclick={() => (app.modal = { type: 'autogen', path })}><Icon name="wand" size={14} /> Auto-generate</button>
  </div>
  <form class="quick" onsubmit={e => { e.preventDefault(); addCard() }}>
    <input class="field" placeholder="Front (question)" bind:value={front} />
    <textarea class="field" rows="2" placeholder="Back (answer)" bind:value={back}></textarea>
    <label class="check"><input type="checkbox" class="checkbox" bind:checked={twoWay} /> Two-way card</label>
    <button class="btn primary" type="submit" disabled={!front.trim() || !back.trim()}>Add to note</button>
  </form>
  <button class="link" onclick={() => (showSyntax = !showSyntax)}>{showSyntax ? 'Hide' : 'Show'} card syntax</button>
  {#if showSyntax}
    <pre>Front :: Back
Front ::: Back   (two-way)

Question
?
Answer

The {'{{c1::answer}}'} is hidden</pre>
  {/if}
</section>

<section>
  <h3>Cards in this note</h3>
  {#each cards as c (c.id)}
    <button class="card" onclick={() => show(c.line)}>
      <span class="txt truncate">{preview(c)}</span>
      <span class="tag {status(c.id).cls}">{status(c.id).label}</span>
    </button>
  {:else}<p class="faint">No cards yet. Write <code>Front :: Back</code> on a line, or use the form above.</p>{/each}
</section>

<style>
  section { margin-bottom: 20px; }
  .summary { background: var(--bg-hover); border-radius: 12px; padding: 12px; display: grid; gap: 12px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; }
  .stats strong { display: block; font-family: var(--font-heading); font-size: 26px; line-height: 1.1; }
  .stats strong.due { color: var(--accent-strong); }
  .stats span { font-size: 12px; color: var(--text-muted); }
  h3 { font-family: var(--font-body); font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); font-weight: 600; margin: 0 0 8px; }
  .tools { margin-bottom: 10px; }
  .quick { display: grid; gap: 8px; margin-bottom: 8px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-muted); }
  .link { font-size: 12.5px; color: var(--link); }
  pre { background: var(--code-bg); padding: 10px; border-radius: 8px; font-size: 12px; line-height: 1.55; overflow: auto; }
  .card { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 8px; border-radius: 7px; font-size: 13.5px; }
  .card:hover { background: var(--bg-hover); }
  .txt { flex: 1; }
  .tag { font-size: 11px; padding: 1px 8px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); flex: none; }
  .tag.new { background: color-mix(in srgb, #3f7ca8 20%, transparent); color: #3f7ca8; }
  .tag.due { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  p { font-size: 13px; margin: 4px 0; line-height: 1.5; }
  code { background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
</style>
