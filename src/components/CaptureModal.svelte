<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { formatLong, today } from '../lib/dates'
  import { describeRecurrence } from '../lib/recurrence'
  import { parseQuickAdd } from '../lib/quickadd'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  type Kind = 'task' | 'note' | 'card'
  let kind = $state<Kind>('task')
  let text = $state('')
  let back = $state('')
  let box: HTMLTextAreaElement | HTMLInputElement | undefined = $state()

  const now = today()
  const parsed = $derived(kind === 'task' && text.trim() ? parseQuickAdd(text, now) : null)
  const ready = $derived(kind === 'card' ? !!text.trim() && !!back.trim() : !!text.trim())

  $effect(() => {
    kind
    box?.focus()
  })

  async function submit(keepOpen = false) {
    if (!ready) return
    if (kind === 'task') {
      const p = parseQuickAdd(text, now)
      app.addTask({ title: p.title, due: p.due, deadline: p.deadline, recur: p.recur })
      app.toast(p.due || p.deadline ? `Task added for ${formatLong((p.due ?? p.deadline)!)}` : 'Task added to Unplanned')
    } else if (kind === 'note') {
      const path = await app.captureToInbox(text, 'note')
      if (path) app.toast(`Added to ${app.settings.inboxNote || 'Inbox'}`, { label: 'Open', run: () => app.openNote(path) })
    } else {
      const front = text.trim().replace(/\s*\n\s*/g, ' ')
      const path = await app.captureToInbox(`${front} :: ${back.trim().replace(/\s*\n\s*/g, ' ')}\n`, 'card')
      if (path) app.toast('Flashcard added', { label: 'Open', run: () => app.openNote(path) })
    }
    text = ''
    back = ''
    if (keepOpen) box?.focus()
    else app.modal = null
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (kind === 'task' || e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault()
      void submit(e.shiftKey)
    }
  }
</script>

<Modal onclose={() => (app.modal = null)} top width={560} label="Quick capture">
  <div class="cap">
    <div class="tabs-pill" role="tablist" aria-label="What to capture">
      <button role="tab" aria-selected={kind === 'task'} class:on={kind === 'task'} onclick={() => (kind = 'task')}>Task</button>
      <button role="tab" aria-selected={kind === 'note'} class:on={kind === 'note'} onclick={() => (kind = 'note')}>Note</button>
      <button role="tab" aria-selected={kind === 'card'} class:on={kind === 'card'} onclick={() => (kind = 'card')}>Flashcard</button>
    </div>

    {#if kind === 'task'}
      <input class="field big" bind:this={box} bind:value={text} {onkeydown} placeholder="Essay by friday · Weekly revision every saturday" aria-label="Task" />
      {#if parsed}
        <div class="chips">
          <span class="chip">{parsed.title || '…'}</span>
          {#if parsed.due}<span class="chip"><Icon name="calendar" size={12} /> {formatLong(parsed.due)}</span>{/if}
          {#if parsed.deadline}<span class="chip warn"><Icon name="flag" size={12} /> Deadline {formatLong(parsed.deadline)}</span>{/if}
          {#if parsed.recur}<span class="chip"><Icon name="repeat" size={12} /> {describeRecurrence(parsed.recur, parsed.due)}</span>{/if}
        </div>
      {:else}<p class="hint">Dates are understood: “tomorrow”, “by 31 oct”, “every tuesday”.</p>{/if}
    {:else if kind === 'note'}
      <textarea class="field" bind:this={box} bind:value={text} {onkeydown} rows="4" placeholder="A thought, a link, something to look up later…" aria-label="Note"></textarea>
      <p class="hint">Goes to <strong>{app.settings.inboxNote || 'Inbox'}</strong>. Sort it into a proper note whenever you like.</p>
    {:else}
      <input class="field" bind:this={box} bind:value={text} {onkeydown} placeholder="Question" aria-label="Question" />
      <textarea class="field" bind:value={back} {onkeydown} rows="3" placeholder="Answer" aria-label="Answer"></textarea>
      <p class="hint">Saved as <code>Question :: Answer</code> in <strong>{app.settings.inboxNote || 'Inbox'}</strong>.</p>
    {/if}

    <div class="foot">
      <span class="hint">{kind === 'task' ? 'Enter' : 'Ctrl+Enter'} to add · Shift to add another · Esc to close</span>
      <span class="grow"></span>
      <button class="btn primary" disabled={!ready} onclick={() => submit()}>Add</button>
    </div>
  </div>
</Modal>

<style>
  .cap { padding: 16px; display: grid; gap: 12px; }
  .field.big { font-size: 16px; padding: 10px 12px; }
  textarea.field { font-size: 15px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 99px; background: var(--bg-active); font-size: var(--fs-sm); }
  .chip.warn { background: var(--accent-soft); color: var(--accent-strong); }
  .hint { margin: 0; font-size: var(--fs-sm); color: var(--text-faint); }
  .foot { display: flex; align-items: center; gap: 10px; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
</style>
