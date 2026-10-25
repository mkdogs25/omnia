<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { dirname, docKind, isDoc, noteTitle, type Entry } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Menu, { type MenuItem } from './Menu.svelte'

  let { sort = 'name' }: { sort?: 'name' | 'name-desc' | 'modified' } = $props()

  let renaming = $state<string | null>(null)
  let renameValue = $state('')
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)
  let dropTarget = $state<string | null>(null)

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  function sorted(entries: Entry[]): Entry[] {
    return [...entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      if (sort === 'modified' && a.kind === 'file' && b.kind === 'file') return b.mtime - a.mtime
      const c = collator.compare(a.name, b.name)
      return sort === 'name-desc' ? -c : c
    })
  }

  // Keep the open note visible by expanding its parent folders.
  $effect(() => {
    const p = app.activePath
    if (!p) return
    const next = { ...app.expanded }
    let changed = false
    for (let d = dirname(p); d; d = dirname(d)) if (!next[d]) { next[d] = true; changed = true }
    if (changed) app.expanded = next
  })

  function toggle(path: string) {
    app.expanded = { ...app.expanded, [path]: !app.expanded[path] }
  }

  function startRename(entry: Entry) {
    renaming = entry.path
    renameValue = entry.kind === 'file' ? noteTitle(entry.path) : entry.name
  }

  async function commitRename() {
    const path = renaming
    renaming = null
    if (path && renameValue.trim()) await app.renameEntry(path, renameValue)
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  function contextMenu(e: MouseEvent, entry: Entry | null) {
    e.preventDefault()
    const folder = entry ? (entry.kind === 'folder' ? entry.path : dirname(entry.path)) : ''
    const items: MenuItem[] = [
      { label: 'New note', icon: 'new-note', run: () => app.createNote(folder, 'Untitled', false) },
      { label: 'New folder', icon: 'folder-plus', run: () => app.createFolder(folder) }
    ]
    if (entry) {
      items.push({ divider: true })
      if (entry.kind === 'file') {
        if (isDoc(entry.path)) items.push({ label: 'Open and take notes', icon: 'pencil', run: () => { app.openNote(entry.path); void app.ensureCompanion(entry.path) } })
        items.push({ label: 'Open in new tab', icon: 'file', run: () => app.openNote(entry.path, { newTab: true }) })
        items.push({ label: app.isBookmarked(entry.path) ? 'Remove bookmark' : 'Bookmark', icon: 'bookmark', run: () => app.toggleBookmark(entry.path) })
      }
      items.push({ label: 'Rename', icon: 'pencil', run: () => startRename(entry) })
      items.push({ label: 'Delete', icon: 'trash', danger: true, run: () => app.deleteEntry(entry.path) })
    }
    menu = { x: e.clientX, y: e.clientY, items }
  }

  function onDragStart(e: DragEvent, entry: Entry) {
    e.dataTransfer?.setData('text/omnia-path', entry.path)
    e.dataTransfer!.effectAllowed = 'move'
  }

  function onDrop(e: DragEvent, folder: string) {
    e.preventDefault()
    e.stopPropagation()
    dropTarget = null
    const path = e.dataTransfer?.getData('text/omnia-path')
    if (path) void app.moveEntry(path, folder)
    else if (e.dataTransfer?.files.length) void app.importFiles([...e.dataTransfer.files], folder)
  }

  const root = $derived(app.tree)
</script>

{#snippet node(entry: Entry, depth: number)}
  {#if entry.kind === 'folder'}
    {@const open = !!app.expanded[entry.path]}
    <div
      class="row-item folder"
      class:drop={dropTarget === entry.path}
      style:padding-left="{10 + depth * 14}px"
      role="treeitem"
      aria-expanded={open}
      aria-selected="false"
      tabindex="0"
      draggable="true"
      ondragstart={e => onDragStart(e, entry)}
      ondragover={e => { e.preventDefault(); e.stopPropagation(); dropTarget = entry.path }}
      ondragleave={() => dropTarget === entry.path && (dropTarget = null)}
      ondrop={e => onDrop(e, entry.path)}
      onclick={() => toggle(entry.path)}
      onkeydown={e => (e.key === 'Enter' || e.key === ' ') && toggle(entry.path)}
      oncontextmenu={e => contextMenu(e, entry)}
    >
      <span class="chev" class:open><Icon name="chevron-right" size={14} /></span>
      {#if renaming === entry.path}
        <input class="rename" bind:value={renameValue} use:focusSelect onclick={e => e.stopPropagation()}
          onblur={commitRename} onkeydown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renaming = null }} />
      {:else}
        <span class="name truncate">{entry.name}</span>
      {/if}
    </div>
    {#if open}
      {#each sorted(entry.children) as child (child.path)}
        {@render node(child, depth + 1)}
      {/each}
    {/if}
  {:else}
    <div
      class="row-item file"
      class:active={app.activePath === entry.path}
      style:padding-left="{10 + depth * 14 + 18}px"
      role="treeitem"
      aria-selected={app.activePath === entry.path}
      tabindex="0"
      draggable="true"
      ondragstart={e => onDragStart(e, entry)}
      onclick={e => app.openNote(entry.path, { newTab: e.ctrlKey || e.metaKey })}
      onauxclick={e => e.button === 1 && app.openNote(entry.path, { newTab: true })}
      onkeydown={e => e.key === 'Enter' && app.openNote(entry.path)}
      oncontextmenu={e => contextMenu(e, entry)}
    >
      {#if renaming === entry.path}
        <input class="rename" bind:value={renameValue} use:focusSelect onclick={e => e.stopPropagation()}
          onblur={commitRename} onkeydown={e => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renaming = null }} />
      {:else}
        <span class="name truncate">{noteTitle(entry.path)}</span>
        {#if docKind(entry.path)}<span class="ext">{docKind(entry.path)}</span>{/if}
      {/if}
    </div>
  {/if}
{/snippet}

<div
  class="tree"
  role="tree"
  tabindex="-1"
  class:drop={dropTarget === ''}
  oncontextmenu={e => contextMenu(e, null)}
  ondragover={e => { e.preventDefault(); dropTarget = '' }}
  ondragleave={() => dropTarget === '' && (dropTarget = null)}
  ondrop={e => onDrop(e, '')}
>
  {#if root}
    {#each sorted(root.children) as entry (entry.path)}
      {@render node(entry, 0)}
    {:else}
      <div class="hint">This folder has no notes yet.<br />Drop in a PDF or Word file to read it, or press <kbd>Alt</kbd> <kbd>N</kbd> or use the new note button above.</div>
    {/each}
  {/if}
</div>

{#if menu}
  <Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
  .tree { flex: 1; overflow: auto; padding: 4px 10px 20px; min-height: 0; }
  .tree.drop { background: var(--accent-soft); }
  .row-item {
    display: flex; align-items: center; gap: 4px; height: var(--row-h, 33px); padding-right: 8px; border-radius: 7px;
    cursor: pointer; font-size: 15px; color: var(--text-muted); user-select: none; margin: 1px 0;
  }
  .row-item:hover { background: var(--bg-hover); color: var(--text); }
  .row-item.folder.drop { background: var(--accent-soft); }
  .row-item.active { background: var(--accent); color: var(--on-accent); }
  .row-item.active:hover { background: var(--accent-strong); }
  .chev { display: inline-grid; transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .name { flex: 1; }
  .ext { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; border-radius: 5px; background: var(--bg-active); color: var(--text-muted); }
  .row-item.active .ext { background: rgba(255, 255, 255, 0.25); color: inherit; }
  .rename { flex: 1; min-width: 0; padding: 2px 6px; border-radius: 5px; border: 1px solid var(--accent); background: var(--bg-raised); color: var(--text); outline: none; }
  .hint { padding: 24px 14px; color: var(--text-faint); font-size: 13.5px; line-height: 1.7; }
</style>
