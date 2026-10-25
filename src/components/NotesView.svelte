<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { isDoc, noteTitle } from '../lib/vault'
  import DocView from './DocView.svelte'
  import Editor from './Editor.svelte'
  import Icon from './Icon.svelte'
  import Menu, { type MenuItem } from './Menu.svelte'

  let editor: Editor | undefined = $state()
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)
  let tabsMenu = $state<{ x: number; y: number } | null>(null)
  let titleInput: HTMLInputElement | undefined = $state()

  const path = $derived(app.activePath)
  const rec = $derived(app.record(path))
  const backlinkCount = $derived(path ? app.backlinks(path).length : 0)
  const title = $derived(path ? noteTitle(path) : '')
  const doc = $derived(!!path && isDoc(path))

  async function commitTitle(value: string) {
    if (!path) return
    const v = value.trim()
    if (v && v !== title) await app.renameEntry(path, v)
    else if (titleInput) titleInput.value = title
  }

  function openMore(e: MouseEvent) {
    if (!path || doc) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const revising = !!app.study.revisions[path]
    menu = {
      x: r.right - 220, y: r.bottom + 4,
      items: [
        { label: app.readingMode ? 'Switch to editing' : 'Switch to reading view', icon: app.readingMode ? 'pencil' : 'book-open', run: () => (app.readingMode = !app.readingMode) },
        { label: app.isBookmarked(path) ? 'Remove bookmark' : 'Bookmark', icon: 'bookmark', run: () => app.toggleBookmark(path) },
        { label: revising ? 'Stop revising this note' : 'Add to revision schedule', icon: 'repeat', run: () => (revising ? app.removeRevision(path) : app.addRevision(path)) },
        { divider: true },
        { label: 'Copy [[link]]', icon: 'link', run: () => navigator.clipboard?.writeText(`[[${noteTitle(path)}]]`) },
        { label: 'Rename', icon: 'lines', run: () => titleInput?.focus() },
        { label: 'Open in new tab', icon: 'file', run: () => app.openNote(path, { newTab: true }) },
        { divider: true },
        { label: 'Delete note', icon: 'trash', danger: true, run: () => app.deleteEntry(path) }
      ]
    }
  }

  function keepMine() {
    app.conflict = null
    if (path) {
      app.dirty.add(path)
      void app.saveNote(path, app.editor?.getText() ?? '')
      app.dirty.delete(path)
    }
  }

  function useDisk() {
    const p = app.conflict
    app.conflict = null
    if (!p) return
    app.dirty.delete(p)
    const text = app.index.notes.get(p)?.text ?? ''
    editor?.reloadFromDisk(text)
  }

  function openRight(tab: 'info' | 'cards' | 'quiz' | 'revise') {
    if (app.rightOpen && app.rightTab === tab) app.rightOpen = false
    else {
      app.rightOpen = true
      app.rightTab = tab
    }
  }
</script>

<section class="notes">
  <div class="tabbar">
    <div class="tabs">
      {#each app.tabs as tab (tab.id)}
        <div class="tab" class:active={tab.id === app.activeTabId} role="tab" tabindex="0" aria-selected={tab.id === app.activeTabId}
          onclick={() => (app.activeTabId = tab.id)} onkeydown={e => e.key === 'Enter' && (app.activeTabId = tab.id)}
          onauxclick={e => e.button === 1 && app.closeTab(tab.id)}>
          <span class="tab-title truncate">{noteTitle(tab.path)}</span>
          <button class="close" title="Close tab" onclick={e => { e.stopPropagation(); app.closeTab(tab.id) }}><Icon name="x" size={14} /></button>
        </div>
      {/each}
      <button class="icon-btn new" title="New tab" onclick={() => app.newTab()}><Icon name="plus" size={18} /></button>
    </div>
    <div class="tab-actions">
      <button class="icon-btn" title="Open tabs" onclick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); tabsMenu = { x: r.right - 220, y: r.bottom + 4 } }}><Icon name="chevron-down" size={18} /></button>
      <button class="icon-btn" class:active={app.leftOpen} title="Toggle sidebar" onclick={() => (app.leftOpen = !app.leftOpen)}><Icon name="panel-left" size={19} /></button>
      <button class="icon-btn" class:active={app.rightOpen} title="Toggle study sidebar" onclick={() => (app.rightOpen = !app.rightOpen)}><Icon name="panel-right" size={19} /></button>
    </div>
  </div>

  <div class="navbar">
    <button class="icon-btn" title="Back (Alt+Left)" disabled={!app.canGoBack} onclick={() => app.goBack()}><Icon name="arrow-left" size={19} /></button>
    <button class="icon-btn" title="Forward (Alt+Right)" disabled={!app.canGoForward} onclick={() => app.goForward()}><Icon name="arrow-right" size={19} /></button>
    <span class="grow"></span>
    {#if path && !doc}
      <button class="icon-btn" class:active={app.rightOpen && app.rightTab === 'cards'} title="Flashcards" onclick={() => openRight('cards')}><Icon name="layers" size={19} /></button>
      <button class="icon-btn" class:active={app.rightOpen && app.rightTab === 'quiz'} title="Quiz" onclick={() => openRight('quiz')}><Icon name="zap" size={19} /></button>
      <button class="icon-btn" class:active={app.rightOpen && app.rightTab === 'revise'} title="Spaced repetition" onclick={() => openRight('revise')}><Icon name="repeat" size={19} /></button>
      <button class="icon-btn" class:active={app.readingMode} title={app.readingMode ? 'Switch to editing' : 'Reading view'} onclick={() => (app.readingMode = !app.readingMode)}><Icon name="book-open" size={19} /></button>
      <button class="icon-btn" title="More options" onclick={openMore}><Icon name="more" size={19} /></button>
    {/if}
  </div>

  {#if app.conflict && app.conflict === path}
    <div class="banner">
      <span>This note was changed outside Omnia while you had unsaved edits.</span>
      <button class="btn" onclick={useDisk}>Load the version on disk</button>
      <button class="btn primary" onclick={keepMine}>Keep mine</button>
    </div>
  {/if}

  {#if path && doc}
    <DocView {path} />
  {:else if path}
    <div class="page" style:--editor-width={app.settings.readableWidth ? '52rem' : '100%'}>
      <input class="title" bind:this={titleInput} value={title} spellcheck="false"
        onblur={e => commitTitle(e.currentTarget.value)}
        onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); app.editor?.focus() } if (e.key === 'Escape') { e.currentTarget.value = title; e.currentTarget.blur() } }} />
      <div class="body"><Editor bind:this={editor} {path} /></div>
    </div>
    <footer class="status">
      <span class="muted">{backlinkCount} {backlinkCount === 1 ? 'backlink' : 'backlinks'}</span>
      <button class="icon-btn small" title={app.readingMode ? 'Switch to editing' : 'Switch to reading'} onclick={() => (app.readingMode = !app.readingMode)}><Icon name={app.readingMode ? 'pencil' : 'eye'} size={16} /></button>
      <span class="muted">{(rec?.parsed.words ?? 0).toLocaleString('en-GB')} words</span>
      <span class="muted">{(rec?.parsed.chars ?? 0).toLocaleString('en-GB')} characters</span>
    </footer>
  {:else}
    <div class="blank">
      <h2>No note open</h2>
      <div class="actions">
        <button class="btn primary" onclick={() => app.createNote(app.currentFolder(), 'Untitled')}><Icon name="new-note" size={16} /> New note <kbd>Alt N</kbd></button>
        <button class="btn" onclick={() => app.openDaily()}><Icon name="sunrise" size={16} /> Today's note <kbd>Alt D</kbd></button>
        <button class="btn" onclick={() => (app.modal = { type: 'switcher' })}><Icon name="search" size={16} /> Open note <kbd>Ctrl O</kbd></button>
      </div>
    </div>
  {/if}
</section>

{#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />{/if}
{#if tabsMenu}
  <Menu x={tabsMenu.x} y={tabsMenu.y} onclose={() => (tabsMenu = null)}
    items={app.tabs.length ? app.tabs.map(t => ({ label: noteTitle(t.path), icon: 'file', run: () => (app.activeTabId = t.id) })) : [{ label: 'No open tabs' }]} />
{/if}

<style>
  .notes { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--bg); position: relative; }
  .tabbar { display: flex; align-items: center; gap: 6px; padding: 8px 12px 0; min-height: 50px; }
  .tabs { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .tab {
    display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 16px; border-radius: 9px; max-width: 240px;
    cursor: pointer; color: var(--text-muted); font-size: 15px; flex: none;
  }
  .tab:hover { background: var(--bg-hover); }
  .tab.active { background: var(--bg-side); color: var(--text); }
  .tab-title { min-width: 0; }
  .close { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; color: var(--text-muted); }
  .close:hover { background: var(--bg-active); color: var(--text); }
  .tab-actions { display: flex; align-items: center; gap: 2px; }
  .navbar { display: flex; align-items: center; gap: 2px; padding: 6px 18px 0; min-height: 40px; }
  .navbar .icon-btn { color: var(--text-faint); }
  .navbar .icon-btn:hover:not([disabled]) { color: var(--text); }
  .banner { display: flex; align-items: center; gap: 10px; margin: 6px 18px; padding: 8px 14px; background: var(--accent-soft); border-radius: 9px; font-size: 13.5px; }
  .banner span { flex: 1; }
  .page { flex: 1; min-height: 0; overflow: auto; }
  .title {
    width: 100%; max-width: var(--editor-width, 52rem); margin: 28px auto 0; padding: 0 32px; display: block; background: transparent; border: 0; outline: none;
    font-family: var(--font-heading); font-weight: 700; font-size: 2.5em; line-height: 1.15; color: var(--text); text-overflow: ellipsis;
  }
  .body { margin-top: 12px; }
  .status { display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 4px 20px 8px; font-size: 12.5px; position: absolute; right: 0; bottom: 0; background: color-mix(in srgb, var(--bg) 85%, transparent); border-radius: 8px 0 0 0; pointer-events: auto; }
  .icon-btn.small { width: 24px; height: 24px; }
  .blank { flex: 1; display: grid; place-content: center; gap: 18px; text-align: center; }
  .blank h2 { color: var(--text-faint); font-size: 28px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .actions kbd { margin-left: 6px; }
</style>
