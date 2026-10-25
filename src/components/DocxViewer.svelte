<script lang="ts">
  import DOMPurify from 'dompurify'
  import { untrack } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { basename } from '../lib/vault'
  import Icon from './Icon.svelte'

  let { path, onquote, onpagenote }: {
    path: string
    onquote: (text: string, page: number | undefined) => void
    onpagenote: (page: number | undefined) => void
  } = $props()

  let status = $state<'loading' | 'ready' | 'error'>('loading')
  let message = $state('')
  let html = $state('')
  let warnings = $state(0)
  let headings = $state<{ text: string; level: number; index: number }[]>([])
  let toc = $state(false)
  let zoom = $state(1)
  let article: HTMLElement | undefined = $state()
  let scroller: HTMLDivElement | undefined = $state()
  let quoteBtn = $state<{ x: number; y: number; text: string } | null>(null)
  let loaded = ''

  async function load(p: string) {
    status = 'loading'
    loaded = p
    try {
      const vault = app.vault
      if (!vault) throw new Error('No folder is open')
      const [{ default: mammoth }, blob] = await Promise.all([import('mammoth/mammoth.browser.min.js'), vault.readBlob(p)])
      const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
      if (loaded !== p) return
      html = DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] })
      warnings = result.messages.filter(m => m.type === 'warning').length
      status = 'ready'
      requestAnimationFrame(collectHeadings)
    } catch (e) {
      status = 'error'
      message = `Couldn’t open this document: ${(e as Error).message ?? e}`
    }
  }

  function collectHeadings() {
    if (!article) return
    headings = [...article.querySelectorAll('h1, h2, h3, h4')].map((h, index) => ({ text: h.textContent?.trim() ?? '', level: +h.tagName[1], index })).filter(h => h.text)
  }

  function jump(index: number) {
    const el = article?.querySelectorAll('h1, h2, h3, h4')[index] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !article) return void (quoteBtn = null)
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      if (!node || !article.contains(node)) return void (quoteBtn = null)
      const text = sel.toString().replace(/\s*\n\s*/g, ' ').trim()
      if (!text) return void (quoteBtn = null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      quoteBtn = { x: Math.min(rect.right, window.innerWidth - 150), y: rect.bottom + 8, text }
    }, 0)
  }

  function quote() {
    if (!quoteBtn) return
    onquote(quoteBtn.text, undefined)
    window.getSelection()?.removeAllRanges()
    quoteBtn = null
  }

  $effect(() => {
    const p = path
    untrack(() => void load(p))
  })
</script>

<svelte:window onmousedown={e => { if (!(e.target as HTMLElement).closest('.quote-btn')) quoteBtn = null }} />

<div class="docx">
  <div class="bar">
    <button class="icon-btn" class:active={toc} title="Headings" onclick={() => (toc = !toc)}><Icon name="list" size={18} /></button>
    <span class="sep"></span>
    <button class="icon-btn" title="Smaller text" onclick={() => (zoom = Math.max(0.7, zoom - 0.1))}><span class="glyph">−</span></button>
    <span class="muted pct">{Math.round(zoom * 100)}%</span>
    <button class="icon-btn" title="Larger text" onclick={() => (zoom = Math.min(1.8, zoom + 0.1))}><Icon name="plus" size={17} /></button>
    {#if warnings}<span class="pill" title="Some Word formatting couldn’t be shown">{warnings} formatting note{warnings === 1 ? '' : 's'}</span>{/if}
    <span class="grow"></span>
    <button class="btn" title="Add a note about this document" onclick={() => onpagenote(undefined)}><Icon name="pencil" size={15} /> Add a note</button>
  </div>
  <div class="body">
    {#if toc}
      <aside class="side">
        <h3 class="eyebrow">Headings</h3>
        {#each headings as h}<button class="toc" style:padding-left="{8 + (h.level - 1) * 14}px" onclick={() => jump(h.index)}>{h.text}</button>
        {:else}<p class="muted">No headings found.</p>{/each}
      </aside>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="scroller" bind:this={scroller} onmouseup={onMouseUp} role="document" aria-label={basename(path)}>
      {#if status === 'loading'}<div class="state muted">Opening {basename(path)}…</div>
      {:else if status === 'error'}<div class="state err">{message}</div>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised with DOMPurify above -->
        <article class="paper" bind:this={article} style:font-size="{17 * zoom}px">{@html html}</article>
      {/if}
    </div>
  </div>
  {#if quoteBtn}
    <button class="quote-btn btn primary" style:left="{quoteBtn.x}px" style:top="{quoteBtn.y}px" onmousedown={e => e.preventDefault()} onclick={quote}>
      <Icon name="notes" size={15} /> Quote to notes
    </button>
  {/if}
</div>

<style>
  .docx { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-side); }
  .bar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg); flex-wrap: wrap; }
  .sep { width: 1px; height: 20px; background: var(--border-strong); margin: 0 6px; }
  .glyph { font-size: 20px; line-height: 1; }
  .pct { font-size: var(--fs-sm); min-width: 40px; text-align: center; }
  .body { flex: 1; min-height: 0; display: flex; }
  .side { width: 250px; flex: none; overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border); background: var(--bg); display: grid; gap: 2px; align-content: start; }
  .toc { text-align: left; padding: 5px 8px; border-radius: 6px; font-size: var(--fs-sm); }
  .toc:hover { background: var(--bg-hover); }
  .scroller { flex: 1; min-width: 0; overflow: auto; padding: 24px 24px 100px; }
  .state { padding: 60px 20px; text-align: center; font-size: var(--fs-lg); }
  .err { color: var(--bad); }
  .paper { max-width: 46rem; margin: 0 auto; padding: 48px 56px; background: var(--bg-raised); border-radius: 6px; box-shadow: 0 1px 3px rgba(70, 48, 12, 0.18), 0 6px 18px rgba(70, 48, 12, 0.08); line-height: 1.7; overflow-wrap: anywhere; }
  .paper :global(h1), .paper :global(h2), .paper :global(h3), .paper :global(h4) { font-family: var(--font-heading); margin: 1.4em 0 0.4em; line-height: 1.25; }
  .paper :global(h1) { font-size: 2em; } .paper :global(h2) { font-size: 1.55em; } .paper :global(h3) { font-size: 1.25em; } .paper :global(h4) { font-size: 1.08em; }
  .paper :global(p) { margin: 0.7em 0; }
  .paper :global(img) { max-width: 100%; height: auto; }
  .paper :global(table) { border-collapse: collapse; margin: 1em 0; max-width: 100%; display: block; overflow-x: auto; }
  .paper :global(td), .paper :global(th) { border: 1px solid var(--border-strong); padding: 5px 10px; }
  .paper :global(ul), .paper :global(ol) { padding-left: 1.6em; }
  .paper :global(a) { color: var(--link); }
  .quote-btn { position: fixed; z-index: 120; box-shadow: var(--shadow); transform: translateX(-100%); }
  p { margin: 6px 8px; font-size: var(--fs-sm); }
</style>
