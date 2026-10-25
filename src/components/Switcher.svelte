<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { getCommands } from '../lib/commands'
  import { KIND_LABEL, search, type Hit, type HitKind } from '../lib/search'
  import { dirname, noteTitle } from '../lib/vault'
  import Modal from './Modal.svelte'

  /** `notes` = quick switcher; `commands` = command palette. */
  let { mode }: { mode: 'notes' | 'commands' } = $props()

  let query = $state('')
  let selected = $state(0)
  let list: HTMLDivElement | undefined = $state()

  const commands = getCommands()

  interface Item { key: string; label: string; detail: string; run: () => void; kind?: HitKind }

  function openHit(h: Hit) {
    switch (h.kind) {
      case 'note': case 'doc': app.openNote(h.path!); break
      case 'heading': app.openNote(h.path!); app.pendingHeading = { path: h.path!, heading: h.heading! }; break
      case 'card': case 'quiz':
        app.openNote(h.path!)
        if (h.line !== undefined) app.pendingLine = { path: h.path!, line: h.line }
        else app.rightOpen = true, app.rightTab = 'quiz'
        break
      case 'task': app.view = 'tasks'; break
      case 'event': app.view = 'calendar'; break
      case 'tag': app.view = 'notes'; app.leftOpen = true; app.sidebarTab = 'search'; app.searchQuery = `#${h.tag}`; break
    }
  }

  const items = $derived.by((): Item[] => {
    if (mode === 'commands') {
      const q = query.toLowerCase().trim()
      return commands.filter(c => c.label.toLowerCase().includes(q)).map(c => ({ key: c.id, label: c.label, detail: c.hint ?? '', run: c.run }))
    }
    const q = query.trim()
    if (!q) {
      const recent = app.recentNotes(8)
      const rest = app.index.findByTitle('', 30).filter(p => !recent.includes(p))
      return [...recent.map(p => ({ key: p, label: noteTitle(p), detail: 'recent', run: () => app.openNote(p) })), ...rest.map(p => ({ key: p, label: noteTitle(p), detail: dirname(p), run: () => app.openNote(p) }))]
    }
    app.indexVersion
    const hits = search(q, { notes: app.index.notes.values(), docs: app.index.docs, tasks: app.tasks, events: app.events }, 40)
    const out: Item[] = hits.map(h => ({ key: h.key, label: h.label, detail: h.detail, kind: h.kind, run: () => openHit(h) }))
    if (!q.startsWith('#') && !hits.some(h => (h.kind === 'note') && h.label.toLowerCase() === q.toLowerCase())) {
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
    if (mode === 'notes' && newTab && (item.kind === 'note' || item.kind === 'doc')) app.openNote(item.key.slice(2), { newTab: true })
    else if (mode === 'notes' && newTab && !item.kind && item.key !== '__create') app.openNote(item.key, { newTab: true })
    else item.run()
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(items.length - 1, selected + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(selected, e.ctrlKey || e.metaKey) }
  }

  function focus(node: HTMLInputElement) { node.focus() }
</script>

<Modal onclose={() => (app.modal = null)} top width={600} label={mode === 'notes' ? 'Search everything' : 'Command palette'}>
  <div class="box">
    <input class="field" placeholder={mode === 'notes' ? 'Search notes, cards, tasks and more…  (# for tags)' : 'Type a command…'} bind:value={query} {onkeydown} use:focus />
    <div class="list" bind:this={list} role="listbox">
      {#each items as item, i (item.key)}
        <button class="item" class:sel={i === selected} role="option" aria-selected={i === selected} onmousemove={() => (selected = i)} onclick={() => choose(i)}>
          <span class="truncate grow">{item.label}</span>
          {#if item.detail}<span class="detail faint truncate">{item.detail}</span>{/if}
          {#if item.kind}<span class="kind">{KIND_LABEL[item.kind]}</span>{/if}
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
  .detail { font-size: 12.5px; max-width: 40%; }
  .kind { flex: none; font-size: 11px; padding: 1px 8px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); align-self: center; }
  .item.sel .kind { background: rgba(255, 255, 255, 0.22); color: inherit; }
  .none { padding: 20px; text-align: center; }
  .foot { font-size: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 2px 4px; }
</style>
