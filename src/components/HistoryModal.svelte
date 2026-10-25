<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { diffLines, diffStats, withContext } from '../lib/diff'
  import { describeAge, type Version } from '../lib/history'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  let { path }: { path: string } = $props()

  let versions = $state<Version[] | null>(null)
  let picked = $state<number | null>(null)
  const now = Date.now()

  const current = () => (app.editor && app.editorPath === path ? app.editor.getText() : app.record(path)?.text ?? '')
  const newest = $derived([...(versions ?? [])].reverse())
  const chosen = $derived(versions?.find(v => v.t === picked) ?? null)
  const lines = $derived(chosen ? withContext(diffLines(chosen.text, current()), 3) : [])
  const stats = $derived(chosen ? diffStats(diffLines(chosen.text, current())) : null)

  async function load() {
    versions = await app.versionsOf(path)
    if (picked === null && versions.length) picked = versions.at(-1)!.t
  }
  onMount(load)

  async function restore() {
    if (!chosen) return
    await app.restoreVersion(path, chosen)
    app.modal = null
  }
  async function saveNow() {
    await app.saveVersion(path)
    await load()
  }
  const words = (t: string) => (t.match(/\S+/g) ?? []).length
</script>

<Modal onclose={() => (app.modal = null)} width={900} label="Version history">
  <div class="hist">
    <header>
      <h2 class="page-title">History of “{noteTitle(path)}”</h2>
      <button class="btn" onclick={saveNow}><Icon name="history" size={15} /> Save a version now</button>
    </header>
    <p class="muted">Omnia keeps a copy about every ten minutes while you write, and one before anything is restored.</p>

    {#if versions === null}<p class="muted">Looking…</p>
    {:else if !versions.length}
      <div class="empty"><Icon name="history" size={24} /><p>No versions yet. One will be kept as you keep writing, or save one now.</p></div>
    {:else}
      <div class="cols">
        <div class="list" role="listbox" aria-label="Versions">
          {#each newest as v (v.t)}
            <button class="item" class:on={v.t === picked} role="option" aria-selected={v.t === picked} onclick={() => (picked = v.t)}>
              <strong>{describeAge(v.t, now)}</strong>
              <span class="muted">{new Date(v.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {words(v.text).toLocaleString('en-GB')} words</span>
              {#if v.label}<span class="tag">{v.label}</span>{/if}
            </button>
          {/each}
        </div>
        <div class="diff" aria-label="Changes since that version">
          {#if stats}
            <div class="stats muted">Compared with now: <span class="plus">+{stats.added}</span> <span class="minus">−{stats.removed}</span> lines. Red lines are in that version only; green lines are in your note now.</div>
          {/if}
          {#if stats && !stats.added && !stats.removed}<p class="muted pad">This version is identical to the note as it is now.</p>{/if}
          <pre>{#each lines as l}{#if l.type === 'gap'}<span class="gap">⋯ {l.count} unchanged line{l.count === 1 ? '' : 's'} ⋯</span>{:else}<span class="ln {l.type}">{l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}{l.text}</span>{/if}{/each}</pre>
        </div>
      </div>
    {/if}

    <footer>
      <span class="grow"></span>
      <button class="btn" onclick={() => (app.modal = null)}>Close</button>
      <button class="btn primary" disabled={!chosen} onclick={restore}>Restore this version</button>
    </footer>
  </div>
</Modal>

<style>
  .hist { padding: 22px 24px 18px; display: grid; gap: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  header .page-title { margin: 0; }
  .hist > p { margin: 0; }
  .cols { display: grid; grid-template-columns: 250px 1fr; gap: 14px; height: min(52vh, 440px); }
  .list { overflow: auto; display: grid; gap: 4px; align-content: start; }
  .item { display: grid; gap: 1px; text-align: left; padding: 8px 12px; border-radius: 10px; border: 1px solid transparent; }
  .item:hover { background: var(--bg-hover); }
  .item.on { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .item .muted { font-size: var(--fs-sm); }
  .tag { justify-self: start; font-size: 11px; padding: 0 8px; border-radius: 99px; background: var(--bg-active); color: var(--text-muted); }
  .diff { overflow: auto; background: var(--code-bg); border-radius: 12px; padding: 10px 0; }
  .stats { padding: 0 14px 8px; font-size: var(--fs-sm); }
  .plus { color: var(--good); font-weight: 600; }
  .minus { color: var(--accent-strong); font-weight: 600; }
  pre { margin: 0; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; }
  .ln, .gap { display: block; padding: 0 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .ln.add { background: color-mix(in srgb, var(--good) 20%, transparent); }
  .ln.del { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .gap { color: var(--text-faint); text-align: center; padding: 4px; font-size: 11.5px; }
  .pad { padding: 8px 14px; margin: 0; }
  .empty { display: grid; justify-items: center; gap: 4px; padding: 40px; color: var(--text-faint); text-align: center; }
  .empty p { margin: 0; max-width: 44ch; }
  footer { display: flex; gap: 10px; align-items: center; }
</style>
