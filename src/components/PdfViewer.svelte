<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import type { PDFDocumentProxy } from 'pdfjs-dist'
  import { app } from '../lib/app.svelte'
  import { basename } from '../lib/vault'
  import Icon from './Icon.svelte'

  let { path, onquote, onpagenote }: {
    path: string
    /** Called with the selected text and the page it came from. */
    onquote: (text: string, page: number) => void
    onpagenote: (page: number) => void
  } = $props()

  type Pdfjs = typeof import('pdfjs-dist')
  interface Outline { title: string; depth: number; dest: string | unknown[] | null }

  let status = $state<'loading' | 'ready' | 'error'>('loading')
  let message = $state('')
  let numPages = $state(0)
  let page = $state(1)
  let scale = $state(1)
  let fit = $state(true)
  let dark = $state(false)
  let base = $state({ w: 612, h: 792 })
  let dims = $state<Record<number, { w: number; h: number }>>({})
  let scroller: HTMLDivElement | undefined = $state()
  let quoteBtn = $state<{ x: number; y: number; text: string; page: number } | null>(null)
  let panel = $state<'none' | 'search' | 'toc'>('none')
  let outline = $state<Outline[] | null>(null)
  let query = $state('')
  let searching = $state(false)
  let results = $state<{ page: number; snippet: string }[]>([])

  let pdfjs: Pdfjs | undefined
  let doc: PDFDocumentProxy | undefined
  let task: { destroy(): Promise<void> } | undefined
  let observer: IntersectionObserver | undefined
  let pageText = $state<string[] | undefined>(undefined)
  const rendered = new Map<number, { cancel: () => void }>()
  let loadedPath = ''
  let raf = 0

  try { dark = localStorage.getItem('omnia:pdfdark') === '1' } catch { /* ignore */ }

  const pageList = $derived(Array.from({ length: numPages }, (_, i) => i + 1))
  const sizeOf = (n: number) => {
    const d = dims[n] ?? base
    return { w: Math.round(d.w * scale), h: Math.round(d.h * scale) }
  }

  async function load(p: string) {
    status = 'loading'
    message = ''
    teardown()
    loadedPath = p
    try {
      const vault = app.vault
      if (!vault) throw new Error('No folder is open')
      const [lib, worker, blob] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        vault.readBlob(p)
      ])
      pdfjs = lib
      lib.GlobalWorkerOptions.workerSrc = worker.default
      const data = new Uint8Array(await blob.arrayBuffer())
      const loading = lib.getDocument({ data })
      const opened = await loading.promise
      if (loadedPath !== p) return void loading.destroy()
      task = loading
      doc = opened
      const first = await opened.getPage(1)
      const vp = first.getViewport({ scale: 1 })
      base = { w: vp.width, h: vp.height }
      dims = {}
      numPages = opened.numPages
      outline = null
      pageText = undefined
      results = []
      status = 'ready'
      await tickLayout()
      const saved = Number(localStorage.getItem(`omnia:pdfpage:${p}`)) || 1
      fit = true
      applyFit()
      await tickLayout()
      setupObserver()
      const pending = app.pendingPage?.path === p ? app.pendingPage.page : saved
      if (app.pendingPage?.path === p) app.pendingPage = null
      goTo(pending, false)
    } catch (e) {
      status = 'error'
      const err = e as { name?: string; message?: string }
      message = err.name === 'PasswordException' ? 'This PDF is password-protected, which Omnia can’t open yet.' : `Couldn’t open this PDF: ${err.message ?? e}`
    }
  }

  const tickLayout = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

  function teardown() {
    observer?.disconnect()
    for (const r of rendered.values()) r.cancel()
    rendered.clear()
    void task?.destroy()
    task = undefined
    doc = undefined
    numPages = 0
    quoteBtn = null
  }

  function setupObserver() {
    observer?.disconnect()
    if (!scroller) return
    observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page)
        if (e.isIntersecting) void renderPage(n)
        else unrenderPage(n)
      }
    }, { root: scroller, rootMargin: '900px 0px' })
    scroller.querySelectorAll('.pdf-page').forEach(el => observer!.observe(el))
  }

  function pageEl(n: number) {
    return scroller?.querySelector<HTMLElement>(`.pdf-page[data-page="${n}"]`) ?? null
  }

  async function renderPage(n: number) {
    if (!doc || !pdfjs || rendered.has(n)) return
    const el = pageEl(n)
    if (!el) return
    let cancelled = false
    let task: { cancel(): void } | undefined
    let textLayer: { cancel(): void } | undefined
    rendered.set(n, { cancel: () => { cancelled = true; task?.cancel(); textLayer?.cancel() } })
    try {
      const pg = await doc.getPage(n)
      if (cancelled) return
      const viewport = pg.getViewport({ scale })
      const natural = pg.getViewport({ scale: 1 })
      if (!dims[n] || Math.abs(dims[n].w - natural.width) > 1 || Math.abs(dims[n].h - natural.height) > 1) dims[n] = { w: natural.width, h: natural.height }

      const dpr = window.devicePixelRatio || 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const ctx = canvas.getContext('2d')!
      const renderTask = pg.render({ canvas, canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
      task = renderTask
      await renderTask.promise
      if (cancelled) return

      const layer = document.createElement('div')
      layer.className = 'textLayer'
      layer.addEventListener('mousedown', () => layer.classList.add('selecting'))
      el.replaceChildren(canvas, layer)
      const tl = new pdfjs.TextLayer({ textContentSource: pg.streamTextContent(), container: layer, viewport })
      textLayer = tl
      await tl.render()
      if (cancelled) return
      const end = document.createElement('div')
      end.className = 'endOfContent'
      layer.append(end)
    } catch (e) {
      if ((e as Error).name !== 'RenderingCancelledException') rendered.delete(n)
    }
  }

  function unrenderPage(n: number) {
    rendered.get(n)?.cancel()
    rendered.delete(n)
    pageEl(n)?.replaceChildren()
  }

  function resetPages() {
    for (const n of [...rendered.keys()]) unrenderPage(n)
    setupObserver()
  }

  function applyFit() {
    if (!scroller) return
    const avail = scroller.clientWidth - 48
    scale = Math.min(3, Math.max(0.4, avail / base.w))
  }

  async function zoom(factor: number | 'fit') {
    if (!scroller) return
    const keep = page
    if (factor === 'fit') { fit = true; applyFit() }
    else { fit = false; scale = Math.min(4, Math.max(0.3, scale * factor)) }
    await tickLayout()
    resetPages()
    goTo(keep, false)
  }

  function goTo(n: number, smooth = true) {
    if (!scroller || !numPages) return
    const target = Math.min(numPages, Math.max(1, Math.round(n)))
    const el = pageEl(target)
    if (!el) return
    scroller.scrollTo({ top: scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12, behavior: smooth ? 'smooth' : 'auto' })
    page = target
  }

  function onScroll() {
    quoteBtn = null
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      if (!scroller || !numPages) return
      const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 3
      let current = 1
      for (const el of scroller.querySelectorAll<HTMLElement>('.pdf-page')) {
        if (el.getBoundingClientRect().top <= mid) current = Number(el.dataset.page)
        else break
      }
      if (current !== page) {
        page = current
        try { localStorage.setItem(`omnia:pdfpage:${path}`, String(current)) } catch { /* ignore */ }
      }
    })
  }

  function cleanQuote(text: string) {
    return text.replace(/-\n(?=[a-z])/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
  }

  function onMouseUp() {
    scroller?.querySelectorAll('.textLayer.selecting').forEach(l => l.classList.remove('selecting'))
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !scroller) return void (quoteBtn = null)
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      const pageNode = anchor?.closest<HTMLElement>('.pdf-page')
      if (!pageNode || !scroller.contains(pageNode)) return void (quoteBtn = null)
      const text = cleanQuote(sel.toString())
      if (!text) return void (quoteBtn = null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      quoteBtn = { x: Math.min(rect.right, window.innerWidth - 150), y: rect.bottom + 8, text, page: Number(pageNode.dataset.page) }
    }, 0)
  }

  function quote() {
    if (!quoteBtn) return
    onquote(quoteBtn.text, quoteBtn.page)
    window.getSelection()?.removeAllRanges()
    quoteBtn = null
  }

  async function loadOutline() {
    if (!doc || outline) return
    const flat: Outline[] = []
    const walk = (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>, depth: number) => {
      for (const it of items ?? []) {
        flat.push({ title: it.title, depth, dest: it.dest })
        if (it.items?.length) walk(it.items, depth + 1)
      }
    }
    walk((await doc.getOutline()) ?? [], 0)
    outline = flat
  }

  async function openToc() {
    panel = panel === 'toc' ? 'none' : 'toc'
    if (panel === 'toc') await loadOutline()
  }

  async function gotoDest(o: Outline) {
    if (!doc || !o.dest) return
    try {
      const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest
      if (!dest) return
      const ref = dest[0]
      const idx = typeof ref === 'number' ? ref : await doc.getPageIndex(ref as never)
      goTo(idx + 1)
    } catch { /* unresolvable destination */ }
  }

  async function runSearch() {
    const q = query.trim().toLowerCase()
    if (!doc || !q) { results = []; return }
    searching = true
    if (!pageText) {
      const texts: string[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const tc = await (await doc.getPage(n)).getTextContent()
        texts.push(tc.items.map(i => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' '))
      }
      pageText = texts
    }
    const out: { page: number; snippet: string }[] = []
    pageText.forEach((t, i) => {
      const at = t.toLowerCase().indexOf(q)
      if (at >= 0 && out.length < 200) out.push({ page: i + 1, snippet: (at > 40 ? '…' : '') + t.slice(Math.max(0, at - 40), at + q.length + 80) })
    })
    results = out
    searching = false
  }

  function toggleDark() {
    dark = !dark
    try { localStorage.setItem('omnia:pdfdark', dark ? '1' : '0') } catch { /* ignore */ }
  }

  $effect(() => {
    const p = path
    untrack(() => void load(p))
  })

  $effect(() => {
    const pending = app.pendingPage
    if (pending && pending.path === path && status === 'ready') {
      untrack(() => { app.pendingPage = null; goTo(pending.page) })
    }
  })

  $effect(() => {
    if (!scroller) return
    const ro = new ResizeObserver(() => {
      if (fit && status === 'ready') untrack(() => { const before = scale; applyFit(); if (Math.abs(before - scale) > 0.01) void tickLayout().then(resetPages) })
    })
    ro.observe(scroller)
    return () => ro.disconnect()
  })

  onDestroy(() => {
    cancelAnimationFrame(raf)
    teardown()
  })
</script>

<svelte:window onmousedown={e => { if (!(e.target as HTMLElement).closest('.quote-btn')) quoteBtn = null }} />

<div class="pdf" class:pdf-dark={dark}>
  <div class="bar">
    <button class="icon-btn" title="Previous page" disabled={page <= 1} onclick={() => goTo(page - 1)}><Icon name="chevron-left" size={18} /></button>
    <input class="pg" type="number" min="1" max={numPages} value={page} aria-label="Page"
      onchange={e => goTo(+e.currentTarget.value)} onkeydown={e => e.key === 'Enter' && goTo(+e.currentTarget.value)} />
    <span class="muted of">/ {numPages || '–'}</span>
    <button class="icon-btn" title="Next page" disabled={page >= numPages} onclick={() => goTo(page + 1)}><Icon name="chevron-right" size={18} /></button>
    <span class="sep"></span>
    <button class="icon-btn" title="Zoom out" onclick={() => zoom(1 / 1.2)}><span class="glyph">−</span></button>
    <button class="btn zoom" title="Fit to width" onclick={() => zoom('fit')}>{Math.round(scale * 100)}%</button>
    <button class="icon-btn" title="Zoom in" onclick={() => zoom(1.2)}><Icon name="plus" size={17} /></button>
    <span class="sep"></span>
    <button class="icon-btn" class:active={panel === 'toc'} title="Contents" onclick={openToc}><Icon name="list" size={18} /></button>
    <button class="icon-btn" class:active={panel === 'search'} title="Search in document" onclick={() => (panel = panel === 'search' ? 'none' : 'search')}><Icon name="search" size={18} /></button>
    <button class="icon-btn" class:active={dark} title="Dark pages" onclick={toggleDark}><Icon name="moon" size={18} /></button>
    <span class="grow"></span>
    <button class="btn" title="Add a note linked to this page" onclick={() => onpagenote(page)}><Icon name="pencil" size={15} /> Note on p. {page}</button>
  </div>

  <div class="body">
    {#if panel !== 'none'}
      <aside class="side">
        {#if panel === 'toc'}
          <h3 class="eyebrow">Contents</h3>
          {#if outline === null}<p class="muted">Loading…</p>
          {:else if !outline.length}<p class="muted">This PDF has no table of contents.</p>
          {:else}{#each outline as o}<button class="toc" style:padding-left="{8 + o.depth * 14}px" onclick={() => gotoDest(o)}>{o.title}</button>{/each}{/if}
        {:else}
          <h3 class="eyebrow">Search</h3>
          <form onsubmit={e => { e.preventDefault(); void runSearch() }}>
            <input class="field" placeholder="Find in this PDF" bind:value={query} />
          </form>
          {#if searching}<p class="muted">Reading the document…</p>{/if}
          {#each results as r}
            <button class="hit" onclick={() => goTo(r.page)}><strong>p. {r.page}</strong><span class="muted">{r.snippet}</span></button>
          {:else}{#if query.trim() && !searching && pageText}<p class="muted">No matches.</p>{/if}{/each}
        {/if}
      </aside>
    {/if}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="scroller" bind:this={scroller} onscroll={onScroll} onmouseup={onMouseUp} role="document" aria-label={basename(path)}>
      {#if status === 'loading'}<div class="state muted">Opening {basename(path)}…</div>
      {:else if status === 'error'}<div class="state err">{message}</div>
      {:else}
        <div class="pages" style:--scale-factor={scale}>
          {#each pageList as n (n)}
            <div class="pdf-page" data-page={n} style:width="{sizeOf(n).w}px" style:height="{sizeOf(n).h}px"></div>
          {/each}
        </div>
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
  .pdf { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-side); }
  .bar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg); flex-wrap: wrap; }
  .pg { width: 52px; padding: 3px 6px; text-align: center; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--bg-raised); }
  .of { font-size: var(--fs-sm); margin-right: 2px; }
  .sep { width: 1px; height: 20px; background: var(--border-strong); margin: 0 6px; }
  .glyph { font-size: 20px; line-height: 1; }
  .zoom { padding: 3px 10px; min-width: 58px; justify-content: center; }
  .body { flex: 1; min-height: 0; display: flex; }
  .side { width: 250px; flex: none; overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border); background: var(--bg); display: grid; gap: 4px; align-content: start; }
  .toc, .hit { text-align: left; padding: 5px 8px; border-radius: 6px; font-size: var(--fs-sm); }
  .toc:hover, .hit:hover { background: var(--bg-hover); }
  .hit { display: grid; gap: 1px; }
  .hit span { font-size: var(--fs-xs); overflow-wrap: anywhere; }
  .scroller { flex: 1; min-width: 0; overflow: auto; padding: 18px 24px 80px; position: relative; }
  .pages { position: relative; }
  .state { padding: 60px 20px; text-align: center; font-size: var(--fs-lg); }
  .err { color: var(--bad); }
  .quote-btn { position: fixed; z-index: 120; box-shadow: var(--shadow); transform: translateX(-100%); }
  p { margin: 6px 8px; font-size: var(--fs-sm); }
</style>
