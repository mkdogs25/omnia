import { autocompletion, closeBrackets, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { Prec, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, type KeyBinding } from '@codemirror/view'
import { GFM } from '@lezer/markdown'
import { wrapCloze } from '../cards'
import { noteTitle, dirname } from '../vault'

/** Toggles a symmetric Markdown marker (e.g. ** or *) around each selection. */
export function toggleWrap(marker: string) {
  return (view: EditorView): boolean => {
    const { state } = view
    const len = marker.length
    view.dispatch(state.changeByRange(range => {
      const before = state.sliceDoc(range.from - len, range.from)
      const after = state.sliceDoc(range.to, range.to + len)
      if (before === marker && after === marker) {
        return {
          changes: [{ from: range.from - len, to: range.from }, { from: range.to, to: range.to + len }],
          range: range.extend(range.from - len, range.to - len)
        }
      }
      const text = state.sliceDoc(range.from, range.to)
      if (text.length >= len * 2 && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: { from: range.from, to: range.to, insert: text.slice(len, -len) },
          range: range.extend(range.from, range.to - len * 2)
        }
      }
      return {
        changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
        range: range.empty ? range.extend(range.from + len) : range.extend(range.from + len, range.to + len)
      }
    }))
    return true
  }
}

function insertLink(view: EditorView): boolean {
  view.dispatch(view.state.changeByRange(range => {
    const text = view.state.sliceDoc(range.from, range.to)
    return { changes: { from: range.from, to: range.to, insert: `[[${text}]]` }, range: range.extend(range.from + 2, range.from + 2 + text.length) }
  }))
  return true
}

function toggleTaskOnLine(view: EditorView): boolean {
  const { state } = view
  const changes = []
  const seen = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos)
      pos = line.to + 1
      if (seen.has(line.number)) continue
      seen.add(line.number)
      const m = line.text.match(/^(\s*)([-*+]\s+)?(\[[ xX]\]\s+)?/)!
      const indent = m[1]
      if (m[3]) {
        const checked = /x/i.test(m[3])
        changes.push({ from: line.from + indent.length + (m[2]?.length ?? 0), to: line.from + indent.length + (m[2]?.length ?? 0) + 3, insert: checked ? '[ ]' : '[x]' })
      } else {
        const from = line.from + indent.length
        changes.push({ from, to: from + (m[2]?.length ?? 0), insert: '- [ ] ' })
      }
    }
  }
  view.dispatch({ changes })
  return true
}

function makeCloze(view: EditorView): boolean {
  const range = view.state.selection.main
  if (range.empty) return false
  const text = view.state.sliceDoc(range.from, range.to)
  view.dispatch({ changes: { from: range.from, to: range.to, insert: wrapCloze(text, view.state.doc.toString()) } })
  return true
}

export const formatKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: toggleWrap('**') },
  { key: 'Mod-i', run: toggleWrap('*') },
  { key: 'Mod-e', run: toggleWrap('`') },
  { key: 'Mod-Shift-h', run: toggleWrap('==') },
  { key: 'Mod-Shift-x', run: toggleWrap('~~') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Enter', run: toggleTaskOnLine },
  { key: 'Mod-Shift-c', run: makeCloze }
]

export interface CompletionSource {
  titles(query: string): string[]
  headings(target: string): string[]
  tags(): string[]
}

function wikiCompletion(src: CompletionSource) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const heading = ctx.matchBefore(/\[\[[^\]\n|#]+#[^\]\n|]*/)
    if (heading) {
      const m = heading.text.match(/^\[\[([^#]+)#(.*)$/)!
      const options: Completion[] = src.headings(m[1]).map(h => ({ label: h, apply: `${h}]]`, type: 'text' }))
      return { from: heading.from + 2 + m[1].length + 1, options, filter: true }
    }
    const word = ctx.matchBefore(/\[\[[^\]\n|#]*/)
    if (!word) return null
    const query = word.text.slice(2)
    const options: Completion[] = src.titles(query).map(path => ({
      label: noteTitle(path),
      detail: dirname(path),
      apply: `${noteTitle(path)}]]`,
      type: 'text'
    }))
    if (query.trim() && !options.some(o => o.label.toLowerCase() === query.trim().toLowerCase())) {
      options.push({ label: query.trim(), detail: 'create new note', apply: `${query.trim()}]]`, type: 'text', boost: -50 })
    }
    return { from: word.from + 2, options, filter: false }
  }
}

function tagCompletion(src: CompletionSource) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/(?:^|[\s(])#[\w/-]*/)
    if (!word) return null
    const hash = word.text.lastIndexOf('#')
    if (word.text.length - hash <= 1 && !ctx.explicit) return null
    return { from: word.from + hash + 1, options: src.tags().map(t => ({ label: t, type: 'keyword' })), validFor: /^[\w/-]*$/ }
  }
}

export interface EditorExtensionOptions {
  completions: CompletionSource
  onPasteImage?: (file: File) => Promise<string | null>
}

export function baseExtensions(opts: EditorExtensionOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: true }),
    closeBrackets(),
    autocompletion({
      override: [wikiCompletion(opts.completions), tagCompletion(opts.completions)],
      icons: false,
      activateOnTyping: true
    }),
    Prec.high(keymap.of(formatKeymap)),
    keymap.of([...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    EditorView.domEventHandlers({
      paste(event, view) {
        const file = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'))
        if (!file || !opts.onPasteImage) return false
        event.preventDefault()
        void opts.onPasteImage(file).then(name => {
          if (name) view.dispatch(view.state.replaceSelection(`![[${name}]]`))
        })
        return true
      }
    })
  ]
}
