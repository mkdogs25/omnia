<script lang="ts">
  import { averageConfidence, LOW_CONFIDENCE, lowConfidenceWords, OCR_LANGUAGES, type OcrData } from '../lib/ocr'
  import Icon from './Icon.svelte'

  let { data, busy, lang, onlang, onedit, onselect, onexport, onrerun, onremove, onclose, selected }: {
    data: OcrData | null
    busy: boolean
    lang: string
    onlang: (code: string) => void
    onedit: (page: number, index: number, text: string) => void
    onselect: (page: number, index: number) => void
    onexport: (mode: 'download' | 'save') => void
    onrerun: () => void
    onremove: () => void
    onclose: () => void
    selected: { page: number; index: number } | null
  } = $props()

  let threshold = $state(LOW_CONFIDENCE)
  const low = $derived(data ? lowConfidenceWords(data, threshold) : [])
  const avg = $derived(data ? averageConfidence(data) : null)
  const words = $derived(data ? data.pages.reduce((n, p) => n + p.words.length, 0) : 0)
  const shown = $derived(low.slice(0, 80))

  function commit(e: Event, page: number, index: number, original: string) {
    const input = e.currentTarget as HTMLInputElement
    const text = input.value.trim()
    if (text && text !== original) onedit(page, index, text)
    else input.value = original
  }
</script>

<div class="ocr">
  <div class="head">
    <h3 class="eyebrow">Text recognition</h3>
    <button class="icon-btn" title="Close" onclick={onclose}><Icon name="x" size={14} /></button>
  </div>

  {#if !data}
    <p class="muted">No recognised text yet. OCR reads the page images and adds a text layer you can select, search and quote from.</p>
  {:else}
    <p class="stats"><strong>{data.pages.length}</strong> page{data.pages.length === 1 ? '' : 's'} · <strong>{words.toLocaleString('en-GB')}</strong> words{#if avg !== null} · {Math.round(avg)}% sure{/if}</p>
    <div class="actions">
      <button class="btn primary" disabled={busy} onclick={() => onexport('download')}><Icon name="download" size={14} /> Download searchable PDF</button>
      <button class="btn" disabled={busy} onclick={() => onexport('save')}>Save a copy in the folder</button>
    </div>
    <p class="faint small">The original pages stay untouched; the recognised words are added as invisible text. Latin-alphabet languages only.</p>

    <h3 class="eyebrow gap">Check uncertain words ({low.length})</h3>
    <label class="slider"><span>Below <strong>{threshold}%</strong> sure</span>
      <input type="range" min="40" max="95" step="5" bind:value={threshold} />
    </label>
    {#each shown as l (l.page + ':' + l.index)}
      <div class="word" class:sel={selected?.page === l.page && selected?.index === l.index}>
        <button class="pg" title="Show on the page" onclick={() => onselect(l.page, l.index)}>p. {l.page}</button>
        <input class="field" value={l.word.t} aria-label="Correct the word on page {l.page}" onfocus={() => onselect(l.page, l.index)}
          onchange={e => commit(e, l.page, l.index, l.word.t)} onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
        <span class="conf">{l.word.c}%</span>
      </div>
    {:else}
      <p class="muted">Nothing below {threshold}%. Nice and clean.</p>
    {/each}
    {#if low.length > shown.length}<p class="faint small">…and {low.length - shown.length} more. Raise the slider’s floor to focus on the worst ones.</p>{/if}
  {/if}

  <h3 class="eyebrow gap">Settings</h3>
  <label class="row">Language
    <select class="field" value={lang} onchange={e => onlang(e.currentTarget.value)} disabled={busy}>
      {#each OCR_LANGUAGES as l}<option value={l.code}>{l.label}</option>{/each}
    </select>
  </label>
  <p class="faint small">English is built in. Other languages download once, so they need an internet connection.</p>
  <div class="actions">
    <button class="btn" disabled={busy} onclick={onrerun}>{data ? 'Read the pages again' : 'Run OCR'}</button>
    {#if data}<button class="btn" disabled={busy} onclick={onremove}>Remove OCR data</button>{/if}
  </div>
</div>

<style>
  .ocr { display: grid; gap: 8px; align-content: start; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .head .eyebrow { margin: 0; }
  .gap { margin-top: 12px; }
  .stats { margin: 0; font-size: var(--fs-sm); }
  .actions { display: grid; gap: 6px; }
  .small { font-size: var(--fs-xs); margin: 0; line-height: 1.5; }
  .slider { display: grid; gap: 4px; font-size: var(--fs-sm); color: var(--text-muted); }
  .slider input { accent-color: var(--accent); }
  .word { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: center; padding: 3px; border-radius: 8px; }
  .word.sel { background: var(--accent-soft); }
  .pg { font-size: var(--fs-xs); color: var(--link); min-width: 34px; text-align: left; }
  .word .field { padding: 3px 6px; font-size: var(--fs-sm); }
  .conf { font-size: var(--fs-xs); color: var(--text-faint); min-width: 30px; text-align: right; }
  .row { display: grid; gap: 4px; font-size: var(--fs-sm); color: var(--text-muted); }
  p { margin: 4px 0; }
</style>
