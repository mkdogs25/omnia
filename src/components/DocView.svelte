<script lang="ts">
  import { tick } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { basename, companionPath, docKind, noteTitle } from '../lib/vault'
  import DocxViewer from './DocxViewer.svelte'
  import Editor from './Editor.svelte'
  import Icon from './Icon.svelte'
  import PdfViewer from './PdfViewer.svelte'

  let { path }: { path: string } = $props()

  const kind = $derived(docKind(path))
  const companion = $derived(companionPath(path))
  const hasNotes = $derived.by(() => {
    app.indexVersion // subscribe first: the index is a plain Map, so this is what signals changes
    return app.index.notes.has(companion)
  })

  let notesOpen = $state(true)
  let ratio = $state(0.58)
  let wrap: HTMLDivElement | undefined = $state()
  let dragging = $state(false)

  try {
    const r = Number(localStorage.getItem('omnia:docsplit'))
    if (r >= 0.3 && r <= 0.8) ratio = r
    notesOpen = localStorage.getItem('omnia:docnotes') !== '0'
  } catch { /* ignore */ }

  function setNotesOpen(open: boolean) {
    notesOpen = open
    try { localStorage.setItem('omnia:docnotes', open ? '1' : '0') } catch { /* ignore */ }
  }

  async function startNotes() {
    await app.ensureCompanion(path)
    setNotesOpen(true)
  }

  const ref = (page?: number) => (page ? `[[${basename(path)}#page=${page}|p. ${page}]]` : `[[${basename(path)}]]`)

  async function append(text: string) {
    const note = await app.ensureCompanion(path)
    if (!note) return
    setNotesOpen(true)
    await tick()
    await app.appendToNote(note, text)
  }

  function quote(text: string, page?: number) {
    const body = text.split('\n').map(l => `> ${l}`).join('\n')
    return append(`\n${body}\n> — ${ref(page)}\n\n`)
  }

  function pageNote(page?: number) {
    return append(`\n- ${ref(page)} `)
  }

  function onMove(e: PointerEvent) {
    if (!dragging || !wrap) return
    const r = wrap.getBoundingClientRect()
    ratio = Math.min(0.8, Math.max(0.3, (e.clientX - r.left) / r.width))
  }

  function endDrag() {
    if (!dragging) return
    dragging = false
    try { localStorage.setItem('omnia:docsplit', String(ratio)) } catch { /* ignore */ }
  }
</script>

<svelte:window onpointermove={onMove} onpointerup={endDrag} />

<section class="doc">
  <header>
    <span class="badge">{kind?.toUpperCase()}</span>
    <h2 class="name truncate" title={path}>{basename(path)}</h2>
    <span class="grow"></span>
    {#if notesOpen}
      <button class="btn" onclick={() => setNotesOpen(false)}><Icon name="panel-right" size={16} /> Hide notes</button>
    {:else}
      <button class="btn primary" onclick={startNotes}><Icon name="pencil" size={16} /> {hasNotes ? 'Show notes' : 'Take notes'}</button>
    {/if}
  </header>

  <div class="split" bind:this={wrap} class:dragging>
    <div class="viewer" style:flex={notesOpen ? `0 0 ${ratio * 100}%` : '1 1 auto'}>
      {#if kind === 'pdf'}<PdfViewer {path} onquote={quote} onpagenote={pageNote} />
      {:else}<DocxViewer {path} onquote={quote} onpagenote={pageNote} />{/if}
    </div>

    {#if notesOpen}
      <div class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize notes" onpointerdown={e => { dragging = true; e.preventDefault() }}></div>
      <div class="notes">
        {#if hasNotes}
          <div class="notes-head">
            <Icon name="notes" size={15} />
            <span class="truncate grow">{noteTitle(companion)}</span>
            <button class="icon-btn" title="Open as its own tab" onclick={() => app.openNote(companion, { newTab: true })}><Icon name="file" size={16} /></button>
          </div>
          <div class="page notes-scroll">
            <Editor path={companion} />
          </div>
        {:else}
          <div class="start">
            <h3 class="section-title">Notes on this {kind === 'pdf' ? 'PDF' : 'document'}</h3>
            <p class="muted">Select text in the document and choose <em>Quote to notes</em>, or write freely here. Your notes are saved as a normal Markdown file next to the document.</p>
            <button class="btn primary big" onclick={startNotes}><Icon name="pencil" size={16} /> Start taking notes</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .doc { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
  header { display: flex; align-items: center; gap: 10px; padding: 8px 18px 8px; }
  .name { font-family: var(--font-body); font-size: var(--fs-lg); font-weight: 600; margin: 0; min-width: 0; }
  .badge { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 6px; background: var(--accent-soft); color: var(--accent-strong); }
  .split { flex: 1; min-height: 0; display: flex; border-top: 1px solid var(--border); }
  .split.dragging { cursor: col-resize; user-select: none; }
  .viewer { min-width: 0; min-height: 0; }
  .splitter { width: 7px; flex: none; cursor: col-resize; background: var(--border); position: relative; }
  .splitter:hover, .dragging .splitter { background: var(--accent); }
  .notes { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
  .notes-head { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 18px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: var(--fs-md); color: var(--text-muted); }
  .notes-scroll { flex: 1; min-height: 0; overflow: auto; padding-top: 14px; }
  .notes-scroll :global(.cm-content) { padding: 0 22px; max-width: 100%; }
  .start { padding: 48px 32px; display: grid; gap: 14px; justify-items: start; align-content: start; max-width: 30rem; }
  .start p { margin: 0; line-height: 1.6; }
</style>
