<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { dirname, noteTitle } from '../lib/vault'
  import FileTree from './FileTree.svelte'
  import Icon from './Icon.svelte'
  import Menu from './Menu.svelte'

  let sort = $state<'name' | 'name-desc' | 'modified'>('name')
  let sortMenu = $state<{ x: number; y: number } | null>(null)
  let vaultMenu = $state<{ x: number; y: number } | null>(null)

  const hits = $derived.by(() => {
    app.indexVersion
    const q = app.searchQuery.trim()
    return q ? app.index.search(q) : []
  })
  const tags = $derived(app.tagList())

  const escapeHtml = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  function highlight(snippet: string, query: string) {
    const terms = query.split(/\s+/).filter(t => t && !/^(tag|path):/i.test(t))
    let html = escapeHtml(snippet)
    for (const t of terms) html = html.replace(new RegExp(`(${escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>')
    return html
  }

  function openHit(path: string, line?: number) {
    app.openNote(path)
    if (line !== undefined) app.pendingLine = { path, line }
  }

  function collapseAll() {
    app.expanded = {}
  }

  function focusOnMount(node: HTMLInputElement) {
    node.focus()
  }

  const sortLabels = { name: 'Name (A to Z)', 'name-desc': 'Name (Z to A)', modified: 'Recently modified' } as const
</script>

<aside class="sidebar">
  <div class="tabs">
    <button class="icon-btn" class:active={app.sidebarTab === 'files'} title="Files" onclick={() => (app.sidebarTab = 'files')}><Icon name="folder" size={20} /></button>
    <button class="icon-btn" class:active={app.sidebarTab === 'search'} title="Search (Ctrl+Shift+F)" onclick={() => (app.sidebarTab = 'search')}><Icon name="search" size={20} /></button>
    <button class="icon-btn" class:active={app.sidebarTab === 'bookmarks'} title="Bookmarks" onclick={() => (app.sidebarTab = 'bookmarks')}><Icon name="bookmark" size={20} /></button>
  </div>

  {#if app.sidebarTab === 'files'}
    <div class="toolbar">
      <button class="icon-btn" title="New note (Alt+N)" onclick={() => app.createNote(app.currentFolder(), 'Untitled')}><Icon name="new-note" size={20} /></button>
      <button class="icon-btn" title="New folder" onclick={() => app.createFolder(app.currentFolder())}><Icon name="folder-plus" size={20} /></button>
      <button class="icon-btn" title="Sort order" onclick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); sortMenu = { x: r.left, y: r.bottom + 4 } }}><Icon name="sort" size={20} /></button>
      <button class="icon-btn" title="Collapse all" onclick={collapseAll}><Icon name="layers" size={20} /></button>
      <button class="icon-btn" title="Rescan folder" onclick={() => app.refresh()}><Icon name="refresh" size={19} /></button>
    </div>
    <FileTree {sort} />
  {:else if app.sidebarTab === 'search'}
    <div class="searchbox">
      <input class="field" placeholder="Search notes…  (tag:#physics  path:Regular)" bind:value={app.searchQuery} use:focusOnMount />
    </div>
    <div class="results">
      {#if app.searchQuery.trim()}
        <div class="count muted">{hits.length} {hits.length === 1 ? 'result' : 'results'}</div>
        {#each hits as hit (hit.path)}
          <button class="hit" onclick={() => openHit(hit.path, hit.line)}>
            <span class="title">{noteTitle(hit.path)}</span>
            {#if dirname(hit.path)}<span class="where faint">{dirname(hit.path)}</span>{/if}
            {#if hit.snippet}<span class="snippet muted">{@html highlight(hit.snippet, app.searchQuery)}</span>{/if}
          </button>
        {/each}
      {:else}
        <div class="count muted">Tags</div>
        <div class="taglist">
          {#each tags as [tag, paths]}
            <button class="pill" onclick={() => (app.searchQuery = `tag:#${tag}`)}>#{tag} <span class="faint">{paths.length}</span></button>
          {:else}
            <span class="faint small">No tags yet. Write #tag anywhere in a note.</span>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="results">
      {#each app.settings.bookmarks as path (path)}
        <div class="bm">
          <button class="bm-open grow truncate" onclick={() => app.openNote(path)}><Icon name="bookmark" size={14} /> {noteTitle(path)}</button>
          <button class="icon-btn" title="Remove bookmark" onclick={() => app.toggleBookmark(path)}><Icon name="x" size={14} /></button>
        </div>
      {:else}
        <div class="hint">No bookmarks yet. Open a note and choose Bookmark from its ⋮ menu.</div>
      {/each}
    </div>
  {/if}

  <footer>
    <button class="vault" onclick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); vaultMenu = { x: r.left, y: r.top - 80 } }}>
      <Icon name="chevron-down" size={14} />
      <span class="truncate">{app.vault?.name}</span>
    </button>
    <button class="icon-btn" title="Help and shortcuts" onclick={() => (app.modal = { type: 'help' })}><Icon name="help" size={19} /></button>
    <button class="icon-btn" title="Settings" onclick={() => (app.modal = { type: 'settings' })}><Icon name="settings" size={19} /></button>
  </footer>
</aside>

{#if sortMenu}
  <Menu x={sortMenu.x} y={sortMenu.y} onclose={() => (sortMenu = null)}
    items={(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map(k => ({ label: sortLabels[k], icon: sort === k ? 'check-square' : undefined, run: () => (sort = k) }))} />
{/if}
{#if vaultMenu}
  <Menu x={vaultMenu.x} y={vaultMenu.y} onclose={() => (vaultMenu = null)}
    items={[
      { label: 'Choose another folder…', icon: 'folder-open', run: () => app.chooseFolder() },
      { label: 'Close this folder', icon: 'x', run: () => app.closeVault() }
    ]} />
{/if}

<style>
  .sidebar { display: flex; flex-direction: column; background: var(--bg-side); border-right: 1px solid var(--border); min-height: 0; width: var(--sidebar-w); }
  .tabs { display: flex; gap: 6px; padding: 10px 12px 8px; }
  .tabs .icon-btn { width: 44px; height: 38px; border-radius: 9px; }
  .toolbar { display: flex; gap: 2px; padding: 4px 14px 8px; }
  .toolbar .icon-btn { width: 38px; height: 34px; }
  .searchbox { padding: 4px 14px 8px; }
  .results { flex: 1; overflow: auto; padding: 0 10px 20px; min-height: 0; }
  .count { padding: 6px 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .hit { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; }
  .hit:hover { background: var(--bg-hover); }
  .title { font-weight: 600; font-size: 14.5px; }
  .where, .small { font-size: 12px; }
  .snippet { font-size: 12.5px; line-height: 1.45; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .snippet :global(mark) { background: var(--mark); color: inherit; border-radius: 2px; }
  .taglist { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 8px; }
  .taglist .pill { cursor: pointer; }
  .taglist .pill:hover { background: var(--accent-soft); }
  .bm { display: flex; align-items: center; border-radius: 7px; }
  .bm:hover { background: var(--bg-hover); }
  .bm-open { display: flex; align-items: center; gap: 8px; padding: 8px 10px; text-align: left; color: var(--text-muted); }
  .hint { padding: 20px 14px; color: var(--text-faint); font-size: 13.5px; line-height: 1.6; }
  footer { display: flex; align-items: center; gap: 2px; padding: 8px 12px; border-top: 1px solid var(--border); }
  .vault { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding: 6px 8px; border-radius: 7px; font-weight: 600; font-size: 14.5px; }
  .vault:hover { background: var(--bg-hover); }
</style>
