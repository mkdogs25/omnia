<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { applyTemplate, BUILTIN_TEMPLATES, userTemplates, type Template } from '../lib/templates'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let selected = $state('lecture')
  let name = $state('')
  let box: HTMLInputElement | undefined = $state()

  const custom = $derived.by(() => {
    app.indexVersion
    return userTemplates(app.index.notes.values(), app.settings.templatesFolder.trim() || 'Templates')
  })
  const all = $derived<Template[]>([...BUILTIN_TEMPLATES, ...custom])
  const current = $derived(all.find(t => t.id === selected) ?? all[0])
  const title = $derived(name.trim() || 'Untitled')
  const preview = $derived(current ? applyTemplate(current.body, { title }) : '')
  const folder = $derived(app.currentFolder())

  $effect(() => { box?.focus() })

  async function create() {
    if (!current) return
    const path = await app.createNote(folder, title, false, applyTemplate(current.body, { title }))
    app.modal = null
    if (path) app.openNote(path)
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); void create() }
  }
</script>

<Modal onclose={() => (app.modal = null)} width={820} label="New note from template">
  <div class="tpl">
    <header>
      <h2 class="page-title">New from template</h2>
      <input class="field" bind:this={box} bind:value={name} {onkeydown} placeholder="Note title" aria-label="Note title" />
    </header>
    <div class="cols">
      <div class="list" role="listbox" aria-label="Templates">
        {#each all as t (t.id)}
          <button class="item" class:on={t.id === current?.id} role="option" aria-selected={t.id === current?.id} onclick={() => (selected = t.id)}>
            <strong>{t.name}</strong>
            <span class="muted">{t.description}</span>
            {#if !t.builtin}<span class="mine">yours</span>{/if}
          </button>
        {/each}
        {#if !custom.length}
          <p class="hint">Make your own: write a note, then run <em>Save this note as a template</em> from the command palette.</p>
        {/if}
      </div>
      <pre class="preview" aria-label="Preview">{preview}</pre>
    </div>
    <footer>
      <span class="muted">Created in <strong>{folder || 'the top folder'}</strong></span>
      <span class="grow"></span>
      <button class="btn" onclick={() => (app.modal = null)}>Cancel</button>
      <button class="btn primary" onclick={create}><Icon name="new-note" size={15} /> Create note</button>
    </footer>
  </div>
</Modal>

<style>
  .tpl { display: grid; gap: 14px; padding: 22px 24px 18px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  header .page-title { margin: 0; }
  header .field { width: 260px; }
  .cols { display: grid; grid-template-columns: 280px 1fr; gap: 16px; min-height: 340px; max-height: 52vh; }
  .list { overflow: auto; display: grid; gap: 4px; align-content: start; padding-right: 4px; }
  .item { display: grid; gap: 2px; text-align: left; padding: 9px 12px; border-radius: 10px; border: 1px solid transparent; position: relative; }
  .item:hover { background: var(--bg-hover); }
  .item.on { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .item .muted { font-size: var(--fs-sm); }
  .mine { position: absolute; top: 9px; right: 10px; font-size: 11px; color: var(--accent-strong); }
  .hint { font-size: var(--fs-sm); color: var(--text-faint); margin: 8px 4px; line-height: 1.5; }
  .preview { margin: 0; overflow: auto; background: var(--code-bg); border-radius: 12px; padding: 14px 16px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; }
  footer { display: flex; align-items: center; gap: 10px; }
</style>
