<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { describeAge } from '../lib/history'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  type Item = Awaited<ReturnType<typeof app.trashItems>>[number]
  let items = $state<Item[] | null>(null)
  let busy = $state(false)

  async function load() { items = await app.trashItems() }
  onMount(load)

  async function restore(i: Item) {
    busy = true
    await app.restoreTrash(i.name, i.original)
    await load()
    busy = false
  }
  async function purge(i: Item) {
    if (!confirm(`Delete “${i.title}” for good? This can’t be undone.`)) return
    busy = true
    await app.purgeTrash(i.name)
    await load()
    busy = false
  }
  async function empty() {
    if (!items?.length || !confirm(`Delete all ${items.length} items in the trash for good? This can’t be undone.`)) return
    busy = true
    await app.purgeTrash()
    await load()
    busy = false
  }
  const kb = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`)
</script>

<Modal onclose={() => (app.modal = null)} width={620} label="Trash">
  <div class="trash">
    <header>
      <h2 class="page-title">Trash</h2>
      <p class="muted">Deleted notes wait here, in the <code>.trash</code> folder, until you remove them for good.</p>
    </header>
    <div class="list">
      {#if items === null}<p class="muted pad">Looking…</p>
      {:else}
        {#each items as i (i.name)}
          <div class="row">
            <Icon name={i.kind === 'directory' ? 'folder' : 'file'} size={16} />
            <div class="grow">
              <div class="title truncate">{i.title}</div>
              <div class="meta muted truncate">{i.original.includes('/') ? `from ${i.original.slice(0, i.original.lastIndexOf('/'))} · ` : ''}{describeAge(i.deleted, Date.now())}{i.kind === 'file' ? ` · ${kb(i.size)}` : ''}</div>
            </div>
            <button class="btn" disabled={busy} onclick={() => restore(i)}>Restore</button>
            <button class="icon-btn" title="Delete for good" aria-label="Delete {i.title} for good" disabled={busy} onclick={() => purge(i)}><Icon name="trash" size={15} /></button>
          </div>
        {:else}
          <div class="empty"><Icon name="trash" size={24} /><p>The trash is empty.</p></div>
        {/each}
      {/if}
    </div>
    <footer>
      <button class="btn" disabled={busy || !items?.length} onclick={empty}>Empty trash</button>
      <span class="grow"></span>
      <button class="btn primary" onclick={() => (app.modal = null)}>Done</button>
    </footer>
  </div>
</Modal>

<style>
  .trash { padding: 22px 24px 18px; display: grid; gap: 14px; }
  header .page-title { margin: 0 0 4px; }
  header p { margin: 0; }
  .list { border: 1px solid var(--border); border-radius: 12px; max-height: 50vh; overflow: auto; background: var(--bg); }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .row:last-child { border-bottom: 0; }
  .title { font-size: var(--fs-md); }
  .meta { font-size: var(--fs-sm); }
  .empty { display: grid; justify-items: center; gap: 4px; padding: 36px; color: var(--text-faint); }
  .empty p { margin: 0; }
  .pad { padding: 20px; margin: 0; }
  footer { display: flex; gap: 10px; align-items: center; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
</style>
