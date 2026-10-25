<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { appendCards, appendQuestions, generate, type GenCard, type GenQuestion, type Rule } from '../lib/autogen'
  import { extractCards } from '../lib/cards'
  import { plainText, renderInline } from '../lib/inline'
  import { parseQuizBlock, questionsFromNote } from '../lib/quiz'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { path }: { path: string } = $props()

  type Tab = 'cards' | 'quiz'
  let tab = $state<Tab>('cards')
  let rev = $state(0)
  let picked = $state<Record<string, boolean>>({})
  let edits = $state<Record<string, string>>({})
  let editing = $state<string | null>(null)
  let touched = $state(false)

  const RULES: Record<Rule, string> = {
    definition: 'Definition', highlight: 'Highlighted', number: 'Figure', list: 'List', heading: 'Heading'
  }

  const noteText = () => (app.editor && app.editorPath === path ? app.editor.getText() : app.record(path)?.text ?? '')

  const result = $derived.by(() => {
    rev
    app.indexVersion
    const text = noteText()
    // The index lags a moment behind the editor, so the open text is read directly as well.
    const existingCardIds = new Set([...app.allCards().map(c => c.id), ...extractCards(text, path).map(c => c.id)])
    const existingQuestionIds = new Set(questionsFromNote(text).map(q => q.id))
    for (const rec of app.index.notes.values()) for (const q of questionsFromNote(rec.text)) existingQuestionIds.add(q.id)
    return generate(text, path, { existingCardIds, existingQuestionIds })
  })

  const items = $derived<(GenCard | GenQuestion)[]>(tab === 'cards' ? result.cards : result.questions)
  const text = (it: GenCard | GenQuestion) => edits[it.key] ?? it.text
  const isOn = (it: GenCard | GenQuestion) => picked[it.key] ?? (!touched && it.confidence === 'high')

  const valid = (it: GenCard | GenQuestion) => {
    const t = text(it).trim()
    if (!t) return false
    return tab === 'cards' ? extractCards(t, path).length > 0 : parseQuizBlock(t).length > 0
  }
  const chosen = $derived(items.filter(isOn))
  const blocked = $derived(chosen.filter(it => !valid(it)).length)

  function setAll(on: boolean, onlyHigh = false) {
    touched = true
    const next: Record<string, boolean> = { ...picked }
    for (const it of [...result.cards, ...result.questions]) next[it.key] = on && (!onlyHigh || it.confidence === 'high')
    picked = next
  }

  function toggle(it: GenCard | GenQuestion) {
    const was = isOn(it)
    if (!touched) {
      // First manual change: freeze the default selection so ticks don't jump around.
      const next: Record<string, boolean> = {}
      for (const x of [...result.cards, ...result.questions]) next[x.key] = x.confidence === 'high'
      picked = next
      touched = true
    }
    picked = { ...picked, [it.key]: !was }
  }

  async function add() {
    if (!chosen.length || blocked) return
    const picks = chosen.map(it => ({ ...it, text: text(it).trim() }))
    if (tab === 'cards') await app.transformNote(path, t => appendCards(t, picks))
    else await app.transformNote(path, t => appendQuestions(t, picks))
    app.toast(`Added ${picks.length} ${tab === 'cards' ? (picks.length === 1 ? 'flashcard' : 'flashcards') : picks.length === 1 ? 'question' : 'questions'} to “${noteTitle(path)}”`)
    rev++
  }

  function showLine(line: number) {
    app.openNote(path)
    app.pendingLine = { path, line }
  }

  const cardFront = (c: GenCard) => renderInline(plainText(c.front).length > 160 ? plainText(c.front).slice(0, 157) + '…' : c.front)
</script>

<Modal onclose={() => (app.modal = null)} width={780} label="Generate flashcards and quiz questions">
  <div class="gen">
    <header>
      <h2 class="page-title">Generate from “{noteTitle(path)}”</h2>
      <p class="muted">Made from definitions, highlighted words, figures and lists in your note — no AI. Nothing is added until you say so; edit anything first.</p>
    </header>

    <div class="bar">
      <div class="tabs-pill" role="tablist">
        <button role="tab" aria-selected={tab === 'cards'} class:on={tab === 'cards'} onclick={() => (tab = 'cards')}>Flashcards <span class="count">{result.cards.length}</span></button>
        <button role="tab" aria-selected={tab === 'quiz'} class:on={tab === 'quiz'} onclick={() => (tab = 'quiz')}>Quiz questions <span class="count">{result.questions.length}</span></button>
      </div>
      <span class="grow"></span>
      <button class="link" onclick={() => setAll(true)}>Select all</button>
      <button class="link" onclick={() => setAll(true, true)}>Best only</button>
      <button class="link" onclick={() => setAll(false)}>None</button>
    </div>

    <div class="list">
      {#each items as it (it.key)}
        <div class="row" class:off={!isOn(it)}>
          <input type="checkbox" class="checkbox" checked={isOn(it)} onchange={() => toggle(it)} aria-label="Include" />
          <div class="main">
            <div class="meta">
              <span class="badge {it.rule}">{RULES[it.rule]}</span>
              {#if it.confidence === 'medium'}<span class="maybe" title="Less certain: worth a look before adding">check</span>{/if}
              <button class="link line" onclick={() => showLine(it.line)}>line {it.line + 1}</button>
            </div>
            {#if editing === it.key}
              <textarea class="field" rows={Math.min(8, text(it).split('\n').length + 1)} value={text(it)} oninput={e => (edits = { ...edits, [it.key]: e.currentTarget.value })}></textarea>
              {#if !valid(it)}<p class="warn">This no longer reads as {tab === 'cards' ? 'a card' : 'a question'}. Check the syntax.</p>{/if}
            {:else if tab === 'cards'}
              {@const c = it as GenCard}
              <div class="front">{@html cardFront(c)}</div>
              {#if !c.text.includes('{{c') && c.back}<div class="back">{@html renderInline(c.back.length > 200 ? c.back.slice(0, 197) + '…' : c.back)}</div>{/if}
            {:else}
              {@const g = it as GenQuestion}
              <div class="front">{@html renderInline(g.q.prompt)}</div>
              {#if g.q.kind === 'choice'}
                <ul class="opts">{#each g.q.options as o}<li class:right={o.correct}>{@html renderInline(o.text)}</li>{/each}</ul>
              {:else}<div class="back">Answer: {g.q.answers.join(' / ')}</div>{/if}
            {/if}
          </div>
          <button class="icon-btn" title={editing === it.key ? 'Done' : 'Edit'} onclick={() => (editing = editing === it.key ? null : it.key)}><Icon name={editing === it.key ? 'check' : 'pencil'} size={15} /></button>
        </div>
      {:else}
        <div class="empty">
          <Icon name="wand" size={22} />
          <p>Nothing new to suggest{(tab === 'cards' ? result.questions.length : result.cards.length) ? ` here, but the ${tab === 'cards' ? 'quiz' : 'flashcards'} tab has some` : ''}.</p>
          <p class="muted small">Try writing definitions as <code>**Term**: meaning</code>, highlighting key words with <code>**bold**</code> or <code>==marks==</code>, or putting a list under a heading.</p>
        </div>
      {/each}
    </div>

    <footer>
      {#if tab === 'quiz' && result.questions.length}
        <button class="btn" onclick={() => (app.modal = { type: 'quiz', scope: { type: 'note', path }, auto: true })}><Icon name="play" size={14} /> Try them now (not saved)</button>
      {/if}
      <span class="grow"></span>
      <button class="btn" onclick={() => (app.modal = null)}>Close</button>
      <button class="btn primary" disabled={!chosen.length || blocked > 0} onclick={add}>
        Add {chosen.length} to note
      </button>
    </footer>
  </div>
</Modal>

<style>
  .gen { display: flex; flex-direction: column; max-height: min(82vh, 760px); padding: 22px 24px 16px; gap: 12px; }
  header p { margin: 4px 0 0; line-height: 1.5; }
  .bar { display: flex; align-items: center; gap: 12px; }
  .count { font-size: var(--fs-sm); color: var(--text-faint); margin-left: 4px; }
  .link { color: var(--link); font-size: var(--fs-sm); }
  .list { overflow: auto; flex: 1; min-height: 180px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }
  .row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-bottom: 1px solid var(--border); }
  .row:last-child { border-bottom: 0; }
  .row.off .main { opacity: 0.55; }
  .row > .checkbox { margin-top: 4px; }
  .main { flex: 1; min-width: 0; display: grid; gap: 6px; }
  .meta { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); }
  .badge { padding: 1px 9px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); font-size: 12px; font-weight: 600; }
  .badge.definition { background: color-mix(in srgb, #3f7ca8 18%, transparent); color: #3f7ca8; }
  .badge.highlight { background: color-mix(in srgb, #c99a1a 22%, transparent); color: #8a6a0f; }
  .badge.number { background: color-mix(in srgb, #4b8a4f 20%, transparent); color: #3f7443; }
  .badge.list { background: color-mix(in srgb, #8a55b0 18%, transparent); color: #7a4aa0; }
  .badge.heading { background: var(--accent-soft); color: var(--accent-strong); }
  .maybe { color: var(--text-faint); font-size: 12px; border: 1px dashed var(--border-strong); border-radius: 99px; padding: 0 7px; }
  .line { margin-left: auto; color: var(--text-faint); }
  .front { line-height: 1.5; overflow-wrap: anywhere; }
  .back { color: var(--text-muted); font-size: var(--fs-sm); line-height: 1.5; overflow-wrap: anywhere; }
  .back::before { content: '→ '; color: var(--text-faint); }
  .opts { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: var(--fs-sm); color: var(--text-muted); }
  .opts li { padding-left: 18px; position: relative; overflow-wrap: anywhere; }
  .opts li::before { content: '○'; position: absolute; left: 0; color: var(--text-faint); }
  .opts li.right { color: var(--text); font-weight: 600; }
  .opts li.right::before { content: '●'; color: var(--accent-strong); }
  textarea.field { font-family: var(--font-mono); font-size: 13px; }
  .warn { margin: 0; color: var(--danger, #b3402a); font-size: var(--fs-sm); }
  .empty { display: grid; place-items: center; gap: 4px; padding: 40px 24px; text-align: center; color: var(--text-muted); }
  .empty p { margin: 0; max-width: 46ch; line-height: 1.5; }
  .small { font-size: var(--fs-sm); }
  footer { display: flex; align-items: center; gap: 10px; }
</style>
