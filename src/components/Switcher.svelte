<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { getCommands } from '../lib/commands'
  import { dirname, noteTitle } from '../lib/vault'
  import Modal from './Modal.svelte'

  /** `notes` = quick switcher; `commands` = command palette. */
  let { mode }: { mode: 'notes' | 'commands' } = $props()

  let query = $state('')
  let selected = $state(0)
  let list: HTMLDivElement | undefined = $state()

  const commands = getCommands()

  const items = $derived.by(() => {
    if (mode === 'commands') {
      const q = query.toLowerCase().trim()
      return commands.filter(c => c.label.toLowerCase().includes(q)).map(c => ({ key: c.id, label: c.label, detail: c.hint ?? '', run: c.run }))
    }
    const paths = app.index.findByTitle(query, 40)
    const out = paths.map(p => ({ key: p, label: noteTitle(p), detail: dirname(p), run: () => app.openNote(p) }))
    const q = query.trim()
    if (q && !paths.some(p => noteTitle(p).toLowerCase() === q.toLowerCase())) {
      out.push({ key: '__create', label: `Create "${q}"`, detail: 'new note', run: () => void app.createNote(app.currentFolder(), q, false).then(p => p && app.openNote(p)) })
    }
    return out
  })

  $effect(() => {
    query
    selected = 0
  })

  $effect(() => {
    list?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  })

  function choose(i: number, newTab = false) {
    const item = items[i]
    if (!item) return
    app.modal = null
    if (mode === 'notes' && newTab && item.key !== '__create') app.openNote(item.key, { newTab: true })
    else item.run()
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(items.length - 1, selected + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(selected, e.ctrlKey || e.metaKey) }
  }

  function focus(node: HTMLInputElement) { node.focus() }
</script>

<Modal onclose={() => (app.modal = null)} top width={600} label={mode === 'notes' ? 'Quick switcher' : 'Command palette'}>
  <div class="box">
    <input class="field" placeholder={mode === 'notes' ? 'Find or create a note…' : 'Type a command…'} bind:value={query} {onkeydown} use:focus />
    <div class="list" bind:this={list} role="listbox">
      {#each items as item, i (item.key)}
        <button class="item" class:sel={i === selected} role="option" aria-selected={i === selected} onmousemove={() => (selected = i)} onclick={() => choose(i)}>
          <span class="truncate">{item.label}</span>
          {#if item.detail}<span class="detail faint truncate">{item.detail}</span>{/if}
        </button>
      {:else}
        <div class="none faint">No matches</div>
      {/each}
    </div>
    <div class="foot faint"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>Enter</kbd> to choose{#if mode === 'notes'} <kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab{/if} <kbd>Esc</kbd> to close</div>
  </div>
</Modal>

<style>
  .box { padding: 12px; display: grid; gap: 8px; }
  .field { font-size: 16px; padding: 10px 12px; }
  .list { max-height: 50vh; overflow: auto; display: grid; gap: 1px; }
  .item { display: flex; justify-content: space-between; gap: 14px; padding: 8px 12px; border-radius: 7px; text-align: left; }
  .item.sel { background: var(--accent); color: var(--on-accent); }
  .item.sel .detail { color: inherit; opacity: 0.8; }
  .detail { font-size: 12.5px; }
  .none { padding: 20px; text-align: center; }
  .foot { font-size: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 2px 4px; }
</style>
