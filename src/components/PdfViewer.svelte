<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import type { PDFDocumentProxy } from 'pdfjs-dist'
  import { app } from '../lib/app.svelte'
  import { ANNOTATION_DIR, bookmarkOn, COLOURS, hitTest, inOrder, normaliseAnnotations, rectsFromClient, type Annotation, type HighlightColour, type Rect } from '../lib/annotations'
  import { downloadFile } from '../lib/download'
  import { LOW_CONFIDENCE, looksScanned, OCR_LANGUAGES, OCR_DIR, ocrFileName, pageIsEmpty, pageText as ocrPageText, pagesNeedingOcr, replaceWord, samplePages, type OcrData, type OcrPage } from '../lib/ocr'
  import type { OcrProgress } from '../lib/ocr-engine'
  import { basename, dirname, joinPath } from '../lib/vault'
  import Icon from './Icon.svelte'
  import OcrPanel from './OcrPanel.svelte'

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
  let quoteBtn = $state<{ x: number; y: number; text: string; page: number; rects: { left: number; top: number; width: number; height: number }[]; pageRect: DOMRect } | null>(null)
  // Highlights, comments and bookmarks
  let marks = $state<Annotation[]>([])
  let popover = $state<{ id: string; x: number; y: number } | null>(null)
  let lastColour = $state<HighlightColour>('yellow')
  let panel = $state<'none' | 'search' | 'toc' | 'ocr' | 'marks'>('none')
  let outline = $state<Outline[] | null>(null)
  let query = $state('')
  let searching = $state(false)
  let results = $state<{ page: number; snippet: string }[]>([])

  // OCR
  let ocr = $state<OcrData | null>(null)
  let scanned = $state(false)
  let ocrDismissed = $state(false)
  let ocrProgress = $state<OcrProgress | null>(null)
  let ocrMessage = $state('')
  let ocrLang = $state(app.settings.ocrLang || 'eng')
  let ocrSel = $state<{ page: number; index: number } | null>(null)
  let ocrAbort: AbortController | undefined
  let pdfSize = 0
  let measure: CanvasRenderingContext2D | null = null

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
      pdfSize = blob.size
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
      void detectScan(p, opened)
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
    marks = []
    popover = null
    clearTimeout(marksTimer)
    ocrAbort?.abort()
    ocrProgress = null
    ocr = null
    scanned = false
    ocrDismissed = false
    ocrMessage = ''
    ocrSel = null
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
      el.replaceChildren(canvas, buildMarks(n), layer)
      const tl = new pdfjs.TextLayer({ textContentSource: pg.streamTextContent(), container: layer, viewport })
      textLayer = tl
      await tl.render()
      if (cancelled) return
      const end = document.createElement('div')
      end.className = 'endOfContent'
      layer.append(end)
      const recognised = ocr?.pages.find(o => o.n === n)
      if (recognised) el.append(buildOcrLayer(recognised, viewport.scale, natural.width))
    } catch (e) {
      if ((e as Error).name !== 'RenderingCancelledException') rendered.delete(n)
    }
  }

  // ---- OCR

  /** Invisible, selectable words laid over a scanned page. */
  function buildOcrLayer(o: OcrPage, scaleNow: number, naturalWidth: number): HTMLElement {
    const layer = document.createElement('div')
    layer.className = 'ocr-layer'
    // Image pixels -> CSS pixels at the current zoom.
    const k = (naturalWidth * scaleNow) / o.w
    measure ??= document.createElement('canvas').getContext('2d')
    o.words.forEach((w, i) => {
      const span = document.createElement('span')
      // The trailing space or newline is what keeps words apart when the selection is copied or quoted.
      span.textContent = w.t + (o.words[i + 1] && o.words[i + 1].l === w.l ? ' ' : '\n')
      span.dataset.i = String(i)
      const size = Math.max(4, w.h * k * 0.82)
      span.style.left = `${w.x * k}px`
      span.style.top = `${w.y * k}px`
      span.style.fontSize = `${size}px`
      if (measure) {
        measure.font = `${size}px Helvetica, Arial, sans-serif`
        const natural = measure.measureText(w.t).width
        if (natural > 0) span.style.transform = `scaleX(${(w.w * k) / natural})`
      }
      if (w.c < LOW_CONFIDENCE) span.classList.add('low')
      if (ocrSel && ocrSel.page === o.n && ocrSel.index === i) span.classList.add('sel')
      layer.append(span)
    })
    return layer
  }

  function refreshOcrPage(n: number) {
    if (!rendered.has(n)) return
    unrenderPage(n)
    void renderPage(n)
  }

  async function nativeCounts(): Promise<number[]> {
    const counts: number[] = []
    for (let n = 1; doc && n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent()
      counts.push(tc.items.reduce((sum, i) => sum + ('str' in i ? i.str.replace(/\s/g, '').length : 0), 0))
    }
    return counts
  }

  async function detectScan(p: string, d: PDFDocumentProxy) {
    const vault = app.vault
    if (!vault) return
    try {
      const saved = JSON.parse(await vault.readText(joinPath(OCR_DIR, ocrFileName(p)))) as OcrData
      if (loadedPath === p && saved?.v === 1 && saved.size === pdfSize) {
        ocr = saved
        ocrLang = saved.lang
        pageText = undefined
        for (const n of [...rendered.keys()]) if (saved.pages.some(o => o.n === n)) refreshOcrPage(n)
      }
    } catch { /* nothing saved yet */ }
    try {
      const raw = JSON.parse(await vault.readText(joinPath(ANNOTATION_DIR, ocrFileName(p))))
      if (loadedPath === p) {
        marks = normaliseAnnotations(raw, pdfSize)
        for (const n of [...rendered.keys()]) refreshMarks(n)
      }
    } catch { /* no highlights saved yet */ }
    try {
      const sample = samplePages(d.numPages)
      const counts: number[] = []
      for (const n of sample) {
        const tc = await (await d.getPage(n)).getTextContent()
        counts.push(tc.items.reduce((sum, i) => sum + ('str' in i ? i.str.replace(/\s/g, '').length : 0), 0))
      }
      if (loadedPath === p) scanned = looksScanned(counts)
    } catch { /* leave as not scanned */ }
  }

  async function persistOcr() {
    const vault = app.vault
    if (!vault || !ocr) return
    try {
      await vault.mkdir(OCR_DIR)
      await vault.writeText(joinPath(OCR_DIR, ocrFileName(path)), JSON.stringify(ocr))
    } catch (e) {
      app.toast(`Couldn’t save the recognised text: ${(e as Error).message}`)
    }
  }

  async function startOcr(again = false) {
    if (!doc || ocrProgress) return
    ocrMessage = ''
    const d = doc
    const p = path
    try {
      const counts = await nativeCounts()
      const needed = pagesNeedingOcr(counts).filter(n => again || !ocr?.pages.some(o => o.n === n))
      if (!needed.length) {
        ocrMessage = counts.some(c => !pageIsEmpty(c)) ? 'Every page already has text, so there is nothing to read.' : 'Every page has already been read.'
        return
      }
      ocrAbort = new AbortController()
      ocrProgress = { page: needed[0], done: 0, total: needed.length, fraction: 0, status: 'Starting' }
      const { runOcr } = await import('../lib/ocr-engine')
      const result = await runOcr({
        doc: d, pages: needed, lang: ocrLang, scale: app.settings.ocrScale || 2, size: pdfSize, existing: again ? null : ocr,
        signal: ocrAbort.signal,
        onProgress: pr => { if (loadedPath === p) ocrProgress = pr },
        onPage: (page, data) => {
          if (loadedPath !== p) return
          ocr = data
          pageText = undefined
          refreshOcrPage(page.n)
        }
      })
      if (loadedPath !== p) return
      if (result) ocr = result
      await persistOcr()
      const words = ocr?.pages.reduce((n, o) => n + o.words.length, 0) ?? 0
      ocrMessage = ocrAbort.signal.aborted ? 'Stopped. The pages read so far were kept.' : `Done: ${words.toLocaleString('en-GB')} words recognised.`
      if (!ocrAbort.signal.aborted) panel = 'ocr'
    } catch (e) {
      ocrMessage = `OCR failed: ${(e as Error).message ?? e}${ocrLang !== 'eng' ? ' (non-English languages need an internet connection the first time)' : ''}`
    } finally {
      ocrProgress = null
    }
  }

  function editOcrWord(n: number, index: number, text: string) {
    if (!ocr) return
    ocr = replaceWord(ocr, n, index, text)
    pageText = undefined
    refreshOcrPage(n)
    void persistOcrSoon()
  }

  let persistTimer: ReturnType<typeof setTimeout> | undefined
  function persistOcrSoon() {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => void persistOcr(), 600)
  }

  function selectOcrWord(n: number, index: number) {
    const before = ocrSel
    ocrSel = { page: n, index }
    for (const m of [before?.page, n]) if (m) refreshOcrPage(m)
    goTo(n, true)
  }

  async function exportOcr(mode: 'download' | 'save') {
    const vault = app.vault
    if (!vault || !ocr) return
    try {
      const { buildSearchablePdf } = await import('../lib/ocr-export')
      const original = new Uint8Array(await (await vault.readBlob(path)).arrayBuffer())
      const res = await buildSearchablePdf(original, ocr)
      const name = basename(path).replace(/\.pdf$/i, '') + ' (OCR).pdf'
      const blob = new Blob([res.bytes as BlobPart], { type: 'application/pdf' })
      if (mode === 'download') downloadFile(name, blob, 'application/pdf')
      else {
        await vault.writeBlob(joinPath(dirname(path), name), blob)
        await app.refresh()
      }
      app.toast(`${mode === 'download' ? 'Downloaded' : 'Saved'} “${name}” with text on ${res.pages} page${res.pages === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} rotated page${res.skipped === 1 ? '' : 's'} left as they were)` : ''}`)
    } catch (e) {
      app.toast(`Couldn’t build the searchable PDF: ${(e as Error).message}`)
    }
  }

  async function removeOcr() {
    const vault = app.vault
    const had = ocr?.pages.map(o => o.n) ?? []
    ocr = null
    ocrSel = null
    pageText = undefined
    try { await vault?.remove(joinPath(OCR_DIR, ocrFileName(path))) } catch { /* already gone */ }
    for (const n of had) refreshOcrPage(n)
    app.toast('OCR data removed')
  }

  function stopOcr() {
    ocrAbort?.abort()
  }

  $effect(() => {
    // Highlight the chosen word's page when the panel closes, and keep language changes in settings.
    const l = ocrLang
    untrack(() => { if (l !== app.settings.ocrLang) app.updateSettings({ ocrLang: l }) })
  })

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

  function onMouseUp(e: MouseEvent) {
    scroller?.querySelectorAll('.textLayer.selecting').forEach(l => l.classList.remove('selecting'))
    const x = e.clientX
    const y = e.clientY
    const target = e.target as HTMLElement
    setTimeout(() => {
      const sel = window.getSelection()
      if (sel?.isCollapsed && scroller) {
        // A plain click on a highlight opens its comment box.
        const pg = target.closest<HTMLElement>('.pdf-page')
        if (pg) {
          const r = pg.getBoundingClientRect()
          const hit = hitTest(marks, Number(pg.dataset.page), (x - r.left) / r.width, (y - r.top) / r.height)
          popover = hit ? { id: hit.id, x: Math.min(x, window.innerWidth - 300), y: y + 12 } : null
        }
      }
      if (!sel || sel.isCollapsed || !scroller) return void (quoteBtn = null)
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      const pageNode = anchor?.closest<HTMLElement>('.pdf-page')
      if (!pageNode || !scroller.contains(pageNode)) return void (quoteBtn = null)
      const text = cleanQuote(sel.toString())
      if (!text) return void (quoteBtn = null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      quoteBtn = {
        x: Math.min(rect.right, window.innerWidth - 230), y: rect.bottom + 8, text, page: Number(pageNode.dataset.page),
        rects: [...sel.getRangeAt(0).getClientRects()].map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height })),
        pageRect: pageNode.getBoundingClientRect()
      }
    }, 0)
  }

  // ---- highlights

  const makeId = () => Math.random().toString(36).slice(2, 10)

  function highlight(colour: HighlightColour) {
    const q = quoteBtn
    if (!q) return
    const rects = rectsFromClient(q.rects, q.pageRect)
    if (!rects.length) return
    lastColour = colour
    const a: Annotation = { id: makeId(), kind: 'highlight', page: q.page, rects, text: q.text, colour, comment: '', created: new Date().toISOString().slice(0, 10) }
    marks = [...marks, a]
    window.getSelection()?.removeAllRanges()
    quoteBtn = null
    refreshMarks(q.page)
    persistMarks()
    popover = { id: a.id, x: Math.min(q.x, window.innerWidth - 300), y: q.y }
  }

  function toggleBookmark() {
    const existing = bookmarkOn(marks, page)
    marks = existing ? marks.filter(m => m.id !== existing.id) : [...marks, { id: makeId(), kind: 'bookmark', page, rects: [], text: '', colour: 'yellow', comment: '', created: new Date().toISOString().slice(0, 10) }]
    persistMarks()
  }

  function updateMark(id: string, patch: Partial<Annotation>) {
    const old = marks.find(m => m.id === id)
    marks = marks.map(m => (m.id === id ? { ...m, ...patch } : m))
    if (old) refreshMarks(old.page)
    persistMarks()
  }

  function deleteMark(id: string) {
    const old = marks.find(m => m.id === id)
    marks = marks.filter(m => m.id !== id)
    popover = null
    if (old) refreshMarks(old.page)
    persistMarks()
  }

  function buildMarks(n: number): HTMLElement {
    const layer = document.createElement('div')
    layer.className = 'hl-layer'
    for (const a of marks) {
      if (a.kind !== 'highlight' || a.page !== n) continue
      a.rects.forEach((r: Rect, i) => {
        const d = document.createElement('div')
        d.className = 'hl'
        d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%;background:${COLOURS[a.colour]}`
        if (i === 0 && a.comment) d.classList.add('has-comment')
        layer.append(d)
      })
    }
    return layer
  }

  function refreshMarks(n: number) {
    pageEl(n)?.querySelector('.hl-layer')?.replaceWith(buildMarks(n))
  }

  let marksTimer: ReturnType<typeof setTimeout> | undefined
  function persistMarks() {
    clearTimeout(marksTimer)
    marksTimer = setTimeout(async () => {
      const vault = app.vault
      if (!vault) return
      try {
        await vault.mkdir(ANNOTATION_DIR)
        await vault.writeText(joinPath(ANNOTATION_DIR, ocrFileName(path)), JSON.stringify({ v: 1, size: pdfSize, items: marks }))
      } catch (e) {
        app.toast(`Couldn’t save highlights: ${(e as Error).message}`)
      }
    }, 400)
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
        const native = tc.items.map(i => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ')
        const recognised = ocr?.pages.find(o => o.n === n)
        texts.push(pageIsEmpty(native.replace(/\s/g, '').length) && recognised ? ocrPageText(recognised).replace(/\s+/g, ' ') : native)
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

<svelte:window onmousedown={e => { const t = e.target as HTMLElement; if (!t.closest('.quote-btn')) quoteBtn = null; if (!t.closest('.hl-pop') && !t.closest('.pdf-page')) popover = null }} />

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
    <button class="icon-btn" class:active={!!bookmarkOn(marks, page)} title={bookmarkOn(marks, page) ? 'Remove bookmark from this page' : 'Bookmark this page'} aria-label="Bookmark this page" onclick={toggleBookmark}><Icon name="bookmark" size={18} /></button>
    <button class="icon-btn" class:active={panel === 'marks'} title="Highlights and bookmarks ({marks.length})" aria-label="Highlights and bookmarks" onclick={() => (panel = panel === 'marks' ? 'none' : 'marks')}><Icon name="highlighter" size={18} /></button>
    <button class="icon-btn ocr-btn" class:active={panel === 'ocr'} class:hint={scanned && !ocr} title="Text recognition (OCR)" aria-label="Text recognition" onclick={() => (panel = panel === 'ocr' ? 'none' : 'ocr')}><Icon name="scan" size={18} /></button>
    <button class="icon-btn" class:active={dark} title="Dark pages" onclick={toggleDark}><Icon name="moon" size={18} /></button>
    <span class="grow"></span>
    <button class="btn" title="Add a note linked to this page" onclick={() => onpagenote(page)}><Icon name="pencil" size={15} /> Note on p. {page}</button>
  </div>

  {#if ocrProgress}
    <div class="banner running" role="status">
      <div class="grow">
        <strong>Reading page {ocrProgress.page}</strong> <span class="muted">({ocrProgress.done} of {ocrProgress.total} done · {ocrProgress.status.toLowerCase()})</span>
        <div class="progress"><span style:width="{Math.round(ocrProgress.fraction * 100)}%"></span></div>
      </div>
      <button class="btn" onclick={stopOcr}>Stop</button>
    </div>
  {:else if scanned && !ocr && !ocrDismissed && status === 'ready'}
    <div class="banner" role="status">
      <Icon name="scan" size={18} />
      <span class="grow"><strong>This PDF has no selectable text.</strong> It looks like a scan. Run OCR to make it searchable, quotable and downloadable as a searchable PDF.</span>
      <select class="field lang" bind:value={ocrLang} aria-label="OCR language">{#each OCR_LANGUAGES as l}<option value={l.code}>{l.label}</option>{/each}</select>
      <button class="btn primary" onclick={() => startOcr()}>Run OCR</button>
      <button class="btn" onclick={() => (ocrDismissed = true)}>Not now</button>
    </div>
  {:else if ocrMessage}
    <div class="banner done" role="status">
      <span class="grow">{ocrMessage}</span>
      {#if ocr}<button class="btn" onclick={() => (panel = 'ocr')}>Review</button><button class="btn primary" onclick={() => exportOcr('download')}><Icon name="download" size={14} /> Searchable PDF</button>{/if}
      <button class="icon-btn" aria-label="Dismiss" onclick={() => (ocrMessage = '')}><Icon name="x" size={14} /></button>
    </div>
  {/if}

  <div class="body">
    {#if panel !== 'none'}
      <aside class="side">
        {#if panel === 'toc'}
          <h3 class="eyebrow">Contents</h3>
          {#if outline === null}<p class="muted">Loading…</p>
          {:else if !outline.length}<p class="muted">This PDF has no table of contents.</p>
          {:else}{#each outline as o}<button class="toc" style:padding-left="{8 + o.depth * 14}px" onclick={() => gotoDest(o)}>{o.title}</button>{/each}{/if}
        {:else if panel === 'marks'}
          <h3 class="eyebrow">Highlights and bookmarks</h3>
          {#each inOrder(marks) as m (m.id)}
            {#if m.kind === 'bookmark'}
              <button class="hit" onclick={() => goTo(m.page)}><strong><Icon name="bookmark" size={12} /> Page {m.page}</strong><span class="muted">Bookmark</span></button>
            {:else}
              <button class="hit mark" onclick={() => { goTo(m.page); popover = null }}>
                <strong><i class="dot" style:background={COLOURS[m.colour]}></i> Page {m.page}</strong>
                <span>{m.text.length > 140 ? m.text.slice(0, 137) + '…' : m.text}</span>
                {#if m.comment}<span class="comment">{m.comment}</span>{/if}
              </button>
            {/if}
          {:else}<p class="muted">Select text in the document and pick a colour to highlight it. Click a highlight to add a comment.</p>{/each}
        {:else if panel === 'ocr'}
          <OcrPanel data={ocr} busy={!!ocrProgress} lang={ocrLang} onlang={c => (ocrLang = c)} onedit={editOcrWord} onselect={selectOcrWord}
            onexport={exportOcr} onrerun={() => startOcr(true)} onremove={removeOcr} onclose={() => (panel = 'none')} selected={ocrSel} />
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
        <div class="pages" class:ocr-review={panel === 'ocr'} style:--scale-factor={scale}>
          {#each pageList as n (n)}
            <div class="pdf-page" data-page={n} style:width="{sizeOf(n).w}px" style:height="{sizeOf(n).h}px"></div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if quoteBtn}
    <div class="quote-btn sel-bar" style:left="{quoteBtn.x}px" style:top="{quoteBtn.y}px" role="toolbar" aria-label="Selection">
      {#each Object.keys(COLOURS) as c}
        <button class="swatch" class:last={c === lastColour} style:background={COLOURS[c as HighlightColour]} title="Highlight {c}" aria-label="Highlight {c}" onmousedown={e => e.preventDefault()} onclick={() => highlight(c as HighlightColour)}></button>
      {/each}
      <button class="btn primary" onmousedown={e => e.preventDefault()} onclick={quote}><Icon name="notes" size={15} /> Quote to notes</button>
    </div>
  {/if}
</div>

{#if popover}
  {@const m = marks.find(x => x.id === popover!.id)}
  {#if m}
    <div class="hl-pop" style:left="{popover.x}px" style:top="{popover.y}px" role="dialog" aria-label="Highlight">
      <div class="colours">
        {#each Object.keys(COLOURS) as c}
          <button class="swatch" class:last={c === m.colour} style:background={COLOURS[c as HighlightColour]} aria-label="Colour {c}" onclick={() => updateMark(m.id, { colour: c as HighlightColour })}></button>
        {/each}
      </div>
      <textarea class="field" rows="3" placeholder="Add a comment…" value={m.comment} onchange={e => updateMark(m.id, { comment: e.currentTarget.value.trim() })}></textarea>
      <div class="acts">
        <button class="btn" onclick={() => { onquote(m.text, m.page); popover = null }}><Icon name="notes" size={14} /> Quote</button>
        <button class="btn" onclick={() => deleteMark(m.id)}><Icon name="trash" size={14} /> Remove</button>
      </div>
    </div>
  {/if}
{/if}

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
  .banner { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--accent-soft); border-bottom: 1px solid var(--border); font-size: var(--fs-md); flex-wrap: wrap; }
  .banner.done { background: var(--bg-hover); }
  .banner .lang { width: auto; padding: 4px 8px; }
  .progress { height: 6px; background: var(--bg-active); border-radius: 99px; overflow: hidden; margin-top: 6px; }
  .progress span { display: block; height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s; }
  .ocr-btn.hint { color: var(--accent-strong); }
  .scroller { flex: 1; min-width: 0; overflow: auto; padding: 18px 24px 80px; position: relative; }
  .pages { position: relative; }
  .state { padding: 60px 20px; text-align: center; font-size: var(--fs-lg); }
  .err { color: var(--bad); }
  .quote-btn { position: fixed; z-index: 120; box-shadow: var(--shadow); transform: translateX(-100%); }
  .sel-bar { display: flex; align-items: center; gap: 6px; padding: 5px 6px; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 12px; }
  .swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; flex: none; }
  .swatch:hover, .swatch.last { border-color: var(--text); }
  .hl-pop { position: fixed; z-index: 130; width: 270px; display: grid; gap: 8px; padding: 10px; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 12px; box-shadow: var(--shadow); }
  .hl-pop .colours { display: flex; gap: 8px; }
  .hl-pop .acts { display: flex; gap: 6px; }
  .mark .comment { font-style: italic; color: var(--text); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }
  p { margin: 6px 8px; font-size: var(--fs-sm); }
</style>
