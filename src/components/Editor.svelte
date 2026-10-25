<script lang="ts">
  import { Annotation, Compartment, EditorState } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import { onDestroy, onMount, untrack } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { baseExtensions } from '../lib/editor/commands'
  import { displayMath, hostFacet, livePreview, readingFacet, type EditorHost } from '../lib/editor/livePreview'
  import { dirname, joinPath } from '../lib/vault'

  let { path }: { path: string | null } = $props()

  let container: HTMLDivElement
  // Only outside edits that happen after this editor appeared may be applied; older ones are already in the index.
  let seenExternal = app.externalChange?.n ?? 0
  let view: EditorView | undefined
  let currentPath: string | null = null
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const states = new Map<string, EditorState>()
  const modeCompartment = new Compartment()
  const external = Annotation.define<boolean>()
  const blobUrls = new Map<string, string>()

  const host: EditorHost = {
    linkExists: target => !!app.index.resolve(target, currentPath ?? ''),
    async imageUrl(src) {
      if (/^(https?:|data:|blob:)/i.test(src)) return src
      const vault = app.vault
      if (!vault) return null
      const name = src.split('/').pop()!
      const candidates = [joinPath(dirname(currentPath ?? ''), src), src, joinPath('Attachments', name), joinPath('attachments', name)]
      for (const c of candidates) {
        if (blobUrls.has(c)) return blobUrls.get(c)!
        if (await vault.exists(c)) return cache(c, await vault.readBlob(c))
      }
      const found = await vault.findByName(name)
      return found ? cache(found, await vault.readBlob(found)) : null
    }
  }

  function cache(key: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    blobUrls.set(key, url)
    return url
  }

  const completions = {
    titles: (q: string) => app.index.findByTitle(q, 25),
    headings: (target: string) => {
      const path = app.index.resolve(target, currentPath ?? '')
      return path ? (app.index.notes.get(path)?.parsed.headings.map(h => h.text) ?? []) : []
    },
    tags: () => app.index.tags().map(([t]) => t)
  }

  async function pasteImage(file: File): Promise<string | null> {
    const vault = app.vault
    if (!vault) return null
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/\+.*/, '')
    const name = `pasted-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}.${ext}`
    await vault.writeBlob(joinPath('Attachments', name), file)
    return name
  }

  function modeExtensions() {
    return [
      readingFacet.of(app.readingMode),
      EditorView.editable.of(!app.readingMode),
      EditorView.contentAttributes.of({ spellcheck: String(app.settings.spellcheck), autocorrect: 'off' })
    ]
  }

  function navigationHandlers() {
    return EditorView.domEventHandlers({
      mousedown(e, v) {
        if (e.button !== 0 && e.button !== 1) return false
        const target = e.target as HTMLElement
        const newTab = e.ctrlKey || e.metaKey || e.button === 1
        const el = target.closest<HTMLElement>('.cm-wikilink, .cm-link, .cm-tag')
        if (!el) return false
        const from = v.posAtDOM(el)
        const to = from + (el.textContent?.length ?? 0)
        const editing = v.state.selection.ranges.some(r => r.from >= from - 3 && r.to <= to + 3)
        if (editing && !newTab && !app.readingMode) return false
        e.preventDefault()
        if (el.classList.contains('cm-wikilink')) {
          void app.openLink(el.dataset.target ?? '', currentPath ?? '', { newTab, heading: el.dataset.heading || undefined })
        } else if (el.classList.contains('cm-tag')) {
          app.sidebarTab = 'search'
          app.leftOpen = true
          app.searchQuery = `tag:#${el.dataset.tag}`
        } else {
          const url = el.dataset.url ?? ''
          if (/^[a-z][a-z0-9+.-]*:/i.test(url)) window.open(url, '_blank', 'noopener')
          else void app.openLink(decodeURI(url), currentPath ?? '', { newTab })
        }
        return true
      }
    })
  }

  function createState(text: string): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [
        baseExtensions({ completions, onPasteImage: pasteImage }),
        livePreview,
        displayMath,
        hostFacet.of(host),
        navigationHandlers(),
        modeCompartment.of(modeExtensions()),
        EditorView.updateListener.of(u => {
          if (u.docChanged && !u.transactions.some(t => t.annotation(external))) scheduleSave()
          if (u.selectionSet || u.docChanged) rememberView()
        })
      ]
    })
  }

  function scheduleSave() {
    if (!currentPath) return
    app.dirty.add(currentPath)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 500)
  }

  async function flush() {
    clearTimeout(saveTimer)
    if (!view || !currentPath || !app.dirty.has(currentPath)) return
    const path = currentPath
    app.dirty.delete(path)
    await app.saveNote(path, view.state.doc.toString())
  }

  function rememberView() {
    if (!view || !currentPath || restoring) return
    app.noteView[currentPath] = { anchor: view.state.selection.main.anchor, scroll: pageScroller()?.scrollTop ?? 0 }
  }

  let restoring = false

  function restoreView(path: string) {
    const saved = app.noteView[path]
    if (!saved || !view) return
    restoring = true
    const anchor = Math.min(saved.anchor, view.state.doc.length)
    view.dispatch({ selection: { anchor } })
    // CodeMirror measures the document lazily, so the page may be too short at first and clamp the scroll target.
    // Keep nudging for a few frames until the position sticks.
    let tries = 0
    const apply = () => {
      const scroller = pageScroller()
      if (!scroller) { restoring = false; return }
      scroller.scrollTo({ top: saved.scroll })
      if (Math.abs(scroller.scrollTop - saved.scroll) > 2 && tries++ < 40) requestAnimationFrame(apply)
      else restoring = false
    }
    requestAnimationFrame(apply)
  }

  function switchTo(path: string | null) {
    if (!view || path === currentPath) return
    void flush()
    rememberView()
    if (currentPath) states.set(currentPath, view.state)
    currentPath = path
    app.editorPath = path
    if (!path) return
    const text = app.index.notes.get(path)?.text ?? ''
    let state = states.get(path)
    if (!state || state.doc.toString() !== text) state = createState(text)
    view.setState(state)
    applyMode()
    const pending = app.pendingHeading
    if (pending && pending.path === path) {
      app.pendingHeading = null
      scrollToHeading(pending.heading)
    } else if (app.pendingLine?.path === path) {
      const { line } = app.pendingLine
      app.pendingLine = null
      scrollToLine(line)
    } else if (app.noteView[path]) restoreView(path)
    else pageScroller()?.scrollTo({ top: 0 })
  }

  const pageScroller = () => container?.closest<HTMLElement>('.page')

  function scrollToHeading(heading: string) {
    if (!view) return
    const want = heading.trim().toLowerCase()
    for (let n = 1; n <= view.state.doc.lines; n++) {
      const m = view.state.doc.line(n).text.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
      if (m && m[1].trim().toLowerCase() === want) return scrollToLine(n - 1)
    }
  }

  function scrollToLine(line: number) {
    if (!view) return
    const pos = view.state.doc.line(Math.min(view.state.doc.lines, line + 1)).from
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) })
  }

  function applyMode() {
    view?.dispatch({ effects: modeCompartment.reconfigure(modeExtensions()) })
    container?.classList.toggle('reading', app.readingMode)
  }

  onMount(() => {
    view = new EditorView({ parent: container, state: createState('') })
    app.editor = {
      getText: () => view!.state.doc.toString(),
      getSelection: () => view!.state.sliceDoc(view!.state.selection.main.from, view!.state.selection.main.to),
      replaceSelection: text => {
        view!.dispatch(view!.state.replaceSelection(text))
        view!.focus()
      },
      appendText: text => {
        const end = view!.state.doc.length
        view!.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, scrollIntoView: true })
      },
      replaceAll: text => {
        const doc = view!.state.doc
        if (doc.toString() === text) return
        view!.dispatch({ changes: { from: 0, to: doc.length, insert: text }, selection: { anchor: Math.min(view!.state.selection.main.head, text.length) } })
      },
      scrollToLine,
      flush,
      focus: () => view!.focus()
    }
    // Track scrolling as it happens: by the time the component is destroyed its scroll container is already detached.
    const scroller = pageScroller()
    scroller?.addEventListener('scroll', rememberView, { passive: true })
    const onHide = () => { void flush() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush() }
    window.addEventListener('blur', onHide)
    window.addEventListener('beforeunload', onHide)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      scroller?.removeEventListener('scroll', rememberView)
      window.removeEventListener('blur', onHide)
      window.removeEventListener('beforeunload', onHide)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })

  onDestroy(() => {
    // Not rememberView() here: the scroll container is already detached, so it would read 0 and clobber the real value.
    void flush()
    app.editor = null
    app.editorPath = null
    view?.destroy()
    for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  })

  $effect(() => {
    const p = path
    untrack(() => switchTo(p))
  })

  $effect(() => {
    app.readingMode
    app.settings.spellcheck
    untrack(applyMode)
  })

  // A rename elsewhere or an edit made outside the app.
  $effect(() => {
    const ch = app.externalChange
    if (!ch || !view || ch.n <= seenExternal) return
    untrack(() => {
      if (ch.path !== currentPath || !view) return
      seenExternal = ch.n
      const doc = view.state.doc
      if (doc.toString() === ch.text) return
      const head = Math.min(view.state.selection.main.head, ch.text.length)
      view.dispatch({ changes: { from: 0, to: doc.length, insert: ch.text }, selection: { anchor: head }, annotations: [external.of(true)] })
      states.delete(ch.path)
    })
  })

  // Pending heading scroll when the note is already open.
  $effect(() => {
    const pending = app.pendingHeading
    if (!pending) return
    untrack(() => {
      if (pending.path === currentPath) {
        app.pendingHeading = null
        scrollToHeading(pending.heading)
      }
    })
  })

  $effect(() => {
    const pending = app.pendingLine
    if (!pending) return
    untrack(() => {
      if (pending.path === currentPath) {
        app.pendingLine = null
        scrollToLine(pending.line)
      }
    })
  })

  // Keep the editor's link styling honest as the index changes (e.g. a missing note was created).
  $effect(() => {
    app.indexVersion
    untrack(() => view?.dispatch({}))
  })

  export function reloadFromDisk(text: string) {
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: [external.of(true)] })
    if (currentPath) app.dirty.delete(currentPath)
  }

</script>

<div class="editor" bind:this={container} style:--editor-size="{app.settings.fontSize}px"
  style:--editor-width={app.settings.readableWidth ? '52rem' : '100%'}></div>

<style>
  .editor { min-height: 0; }
</style>
