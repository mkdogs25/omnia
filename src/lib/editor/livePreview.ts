// Live preview: Markdown is styled as you write, and syntax markers are hidden except where the
// cursor is. Inline and line decorations come from a ViewPlugin; display maths needs block
// decorations, which CodeMirror only accepts from a state field.

import { syntaxTree } from '@codemirror/language'
import { EditorState, Facet, RangeSet, StateField, type Range } from '@codemirror/state'
import { plainFootnote, scanFootnotes, type Footnotes } from './footnotes'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import katex from 'katex'
import { WIKILINK_RE } from '../noteparse'

export interface EditorHost {
  /** Does this [[link]] point at an existing note? */
  linkExists(target: string): boolean
  /** Resolves an image path or embed name to a displayable URL. */
  imageUrl(src: string): Promise<string | null>
}

export const hostFacet = Facet.define<EditorHost, EditorHost>({
  combine: v => v[0] ?? { linkExists: () => true, imageUrl: async () => null }
})

/** When true, everything renders as formatted text, even under the cursor. */
export const readingFacet = Facet.define<boolean, boolean>({ combine: v => v.some(Boolean) })

// ------------------------------------------------------------------ widgets

class BulletWidget extends WidgetType {
  constructor(readonly depth: number, readonly text: string, readonly ordered: boolean) { super() }
  eq(o: BulletWidget) { return o.depth === this.depth && o.text === this.text }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-lead'
    s.style.width = `${leadWidth(this.depth)}em`
    const m = document.createElement('span')
    m.className = this.ordered ? 'cm-lead-num' : 'cm-lead-dot'
    m.textContent = this.ordered ? this.text : '•'
    s.append(m)
    return s
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly depth: number, readonly markerPos: number) { super() }
  eq(o: CheckboxWidget) { return o.checked === this.checked && o.depth === this.depth && o.markerPos === this.markerPos }
  toDOM(view: EditorView) {
    const s = document.createElement('span')
    s.className = 'cm-lead'
    s.style.width = `${leadWidth(this.depth)}em`
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'checkbox cm-task-box'
    box.checked = this.checked
    box.addEventListener('mousedown', e => {
      e.preventDefault()
      const pos = this.markerPos
      const cur = view.state.doc.sliceString(pos, pos + 3)
      view.dispatch({ changes: { from: pos, to: pos + 3, insert: /\[ \]/.test(cur) ? '[x]' : '[ ]' } })
    })
    s.append(box)
    return s
  }
  ignoreEvent() { return true }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    return hr
  }
}

const mathCache = new Map<string, string>()
function renderMath(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex
  let html = mathCache.get(key)
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', trust: false })
    } catch {
      html = ''
    }
    if (mathCache.size > 500) mathCache.clear()
    mathCache.set(key, html)
  }
  return html
}

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) { super() }
  eq(o: MathWidget) { return o.tex === this.tex && o.display === this.display }
  toDOM() {
    const el = document.createElement(this.display ? 'div' : 'span')
    el.className = this.display ? 'cm-math-block' : 'cm-math-inline'
    el.innerHTML = renderMath(this.tex, this.display) || `<code>${this.tex.replace(/</g, '&lt;')}</code>`
    return el
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly host: EditorHost) { super() }
  eq(o: ImageWidget) { return o.src === this.src && o.alt === this.alt }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image'
    const img = document.createElement('img')
    img.alt = this.alt
    wrap.append(img)
    this.host.imageUrl(this.src).then(url => {
      if (url) img.src = url
      else {
        wrap.classList.add('missing')
        wrap.textContent = `Image not found: ${this.src}`
      }
    })
    return wrap
  }
}

// Footnote scans are per document, and the plugin rebuilds on every selection change, so remember the last one.
let lastScan: { doc: EditorState['doc']; notes: Footnotes } | null = null
function footnotesOf(doc: EditorState['doc']): Footnotes {
  if (lastScan?.doc === doc) return lastScan.notes
  const lines: string[] = []
  for (let n = 1; n <= doc.lines; n++) lines.push(doc.line(n).text)
  lastScan = { doc, notes: scanFootnotes(lines) }
  return lastScan.notes
}

/** Moves the cursor to a position and scrolls it into the middle of the view. */
function jumpTo(view: EditorView, pos: number) {
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  view.focus()
}

class FootnoteRefWidget extends WidgetType {
  constructor(readonly id: string, readonly num: number, readonly tip: string | null) { super() }
  eq(o: FootnoteRefWidget) { return o.id === this.id && o.num === this.num && o.tip === this.tip }
  toDOM(view: EditorView) {
    const el = document.createElement('sup')
    el.className = this.tip === null ? 'cm-fnref cm-fnref-missing' : 'cm-fnref'
    el.textContent = String(this.num)
    el.title = this.tip === null ? 'No footnote text yet. Click to add it.' : this.tip
    el.addEventListener('mousedown', e => {
      e.preventDefault()
      const fn = footnotesOf(view.state.doc)
      const def = fn.defs.get(this.id)
      if (def) return jumpTo(view, view.state.doc.line(def.line + 1).from + def.col + def.labelLength + 1)
      // No text yet: start the footnote at the end of the note.
      const end = view.state.doc.length
      const insert = `${view.state.doc.sliceString(Math.max(0, end - 2), end) === '\n\n' ? '' : end && !view.state.doc.sliceString(end - 1, end).includes('\n') ? '\n\n' : '\n'}[^${this.id}]: `
      view.dispatch({ changes: { from: end, insert }, selection: { anchor: end + insert.length }, effects: EditorView.scrollIntoView(end + insert.length, { y: 'center' }) })
      view.focus()
    })
    return el
  }
  ignoreEvent() { return true }
}

class FootnoteLabelWidget extends WidgetType {
  constructor(readonly id: string, readonly num: number, readonly cited: boolean) { super() }
  eq(o: FootnoteLabelWidget) { return o.id === this.id && o.num === this.num && o.cited === this.cited }
  toDOM(view: EditorView) {
    const el = document.createElement('span')
    el.className = 'cm-fn-label'
    el.textContent = `${this.num}.`
    el.title = this.cited ? 'Back to where this footnote is cited' : 'This footnote is never cited in the note'
    if (this.cited) {
      el.classList.add('back')
      el.addEventListener('mousedown', e => {
        e.preventDefault()
        const ref = footnotesOf(view.state.doc).refs.find(r => r.id === this.id)
        if (ref) jumpTo(view, view.state.doc.line(ref.line + 1).from + ref.col + ref.length)
      })
    } else el.classList.add('uncited')
    return el
  }
  ignoreEvent() { return true }
}

/** Width in em of the bullet/number column for a list nesting depth. */
const leadWidth = (depth: number) => 1.7 + depth * 1.6

// ------------------------------------------------------------------ helpers

const hide = Decoration.replace({})
const mark = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs })
const lineDeco = (cls: string, style?: string) => Decoration.line({ attributes: style ? { class: cls, style } : { class: cls } })

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const INLINE_MATH = /(?<![\\$\w])\$(?!\s|\$)([^$\n]*?[^\s$\\])\$(?![\d$])/g
const TAG_RE = /(^|[\s(])(#[A-Za-z][\w/-]*)/g
const HIGHLIGHT_RE = /==(?!\s)([^=\n]+?)(?<!\s)==/g

function frontmatterEnd(doc: EditorState['doc']): number {
  if (doc.lines < 3 || doc.line(1).text.trim() !== '---') return 0
  for (let n = 2; n <= doc.lines; n++) if (doc.line(n).text.trim() === '---') return n
  return 0
}

// ------------------------------------------------------------------ inline + line decorations

function build(view: EditorView): DecorationSet {
  const { state } = view
  const reading = state.facet(readingFacet)
  const host = state.facet(hostFacet)
  const doc = state.doc
  const ranges: Range<Decoration>[] = []
  const sel = reading ? [] : state.selection.ranges
  const touches = (from: number, to: number) => sel.some(r => r.from <= to && r.to >= from)
  const lineActive = (pos: number) => {
    const line = doc.lineAt(pos)
    return sel.some(r => r.from <= line.to && r.to >= line.from)
  }
  const fmEnd = frontmatterEnd(doc)
  const fn = footnotesOf(doc)
  const codeSpans: [number, number][] = []
  const fencedLines = new Set<number>()
  const fmEndPos = fmEnd ? doc.line(fmEnd).to : -1

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: node => {
        const name = node.name
        const nf = node.from
        const nt = node.to
        // The frontmatter block would otherwise parse as a rule plus a setext heading.
        if (nt <= fmEndPos && name !== 'Document') return false

        if (/^ATXHeading[1-6]$/.test(name)) {
          ranges.push(lineDeco(`cm-h cm-h${name.slice(-1)}`).range(doc.lineAt(nf).from))
        } else if (name === 'SetextHeading1' || name === 'SetextHeading2') {
          const lvl = name.slice(-1)
          for (let l = doc.lineAt(nf).number; l <= doc.lineAt(nt).number; l++) ranges.push(lineDeco(`cm-h cm-h${lvl}`).range(doc.line(l).from))
        } else if (name === 'HeaderMark') {
          const parent = node.node.parent
          if (parent && /^ATX/.test(parent.name)) {
            if (lineActive(nf)) ranges.push(mark('cm-formatting cm-header-mark').range(nf, nt))
            else ranges.push(hide.range(nf, Math.min(nt + 1, doc.lineAt(nf).to)))
          }
        } else if (name === 'Blockquote') {
          for (let l = doc.lineAt(nf).number; l <= doc.lineAt(nt).number; l++) ranges.push(lineDeco('cm-quote').range(doc.line(l).from))
        } else if (name === 'QuoteMark') {
          if (lineActive(nf)) ranges.push(mark('cm-formatting').range(nf, nt))
          else ranges.push(hide.range(nf, Math.min(nt + 1, doc.lineAt(nf).to)))
        } else if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
          const base = name === 'Emphasis' ? 'cm-em' : name === 'StrongEmphasis' ? 'cm-strong' : 'cm-strike'
          // ***both*** nests one inside the other; give both spans a shared class so the pair can be coloured on its own.
          const other = name === 'Emphasis' ? 'StrongEmphasis' : 'Emphasis'
          const both = name !== 'Strikethrough' && (node.node.parent?.name === other || !!node.node.getChild(other))
          ranges.push(mark(both ? `${base} cm-bolditalic` : base).range(nf, nt))
        } else if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
          const p = node.node.parent!
          if (touches(p.from, p.to)) ranges.push(mark('cm-formatting').range(nf, nt))
          else ranges.push(hide.range(nf, nt))
        } else if (name === 'InlineCode') {
          ranges.push(mark('cm-inline-code').range(nf, nt))
          codeSpans.push([nf, nt])
        } else if (name === 'CodeMark' && node.node.parent?.name === 'InlineCode') {
          if (touches(node.node.parent.from, node.node.parent.to)) ranges.push(mark('cm-formatting').range(nf, nt))
          else ranges.push(hide.range(nf, nt))
        } else if (name === 'FencedCode') {
          codeSpans.push([nf, nt])
          const first = doc.lineAt(nf).number
          const last = doc.lineAt(nt).number
          const info = doc.line(first).text.replace(/^\s*(```+|~~~+)\s*/, '').trim().toLowerCase()
          const kind = info === 'quiz' ? ' cm-quizblock' : ''
          for (let l = first; l <= last; l++) {
            fencedLines.add(l)
            const edge = l === first ? ' cm-code-first' : l === last ? ' cm-code-last' : ''
            const fence = (l === first || (l === last && /^\s*(```|~~~)/.test(doc.line(l).text))) ? ' cm-fence' : ''
            ranges.push(lineDeco(`cm-codeblock${edge}${fence}${kind}`).range(doc.line(l).from))
          }
        } else if (name === 'HorizontalRule') {
          if (lineActive(nf)) ranges.push(mark('cm-formatting').range(nf, nt))
          else ranges.push(Decoration.replace({ widget: new RuleWidget() }).range(nf, nt))
        } else if (name === 'ListItem') {
          // Handled when we reach the ListMark so we know the nesting depth.
        } else if (name === 'ListMark') {
          const li = node.node.parent
          if (!li || li.name !== 'ListItem') return
          let depth = -1
          for (let p = li.parent; p; p = p.parent) if (p.name === 'BulletList' || p.name === 'OrderedList') depth++
          const ordered = li.parent?.name === 'OrderedList'
          const line = doc.lineAt(nf)
          const markerEnd = Math.min(nt + 1, line.to)
          const task = li.getChild('Task')?.getChild('TaskMarker')
          const wide = leadWidth(depth)
          ranges.push(lineDeco('cm-li', `padding-left:${wide}em;text-indent:-${wide}em`).range(line.from))
          const replaceEnd = task ? Math.min(task.to + 1, line.to) : markerEnd
          const raw = sel.some(r => r.from < replaceEnd && r.to >= line.from)
          if (raw) {
            ranges.push(mark('cm-formatting').range(nf, nt))
            if (task) ranges.push(mark('cm-formatting').range(task.from, task.to))
          } else if (task) {
            const checked = /\[[xX]\]/.test(doc.sliceString(task.from, task.to))
            ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked, depth, task.from) }).range(line.from, replaceEnd))
            if (checked) ranges.push(lineDeco('cm-task-done').range(line.from))
          } else {
            ranges.push(Decoration.replace({ widget: new BulletWidget(depth, doc.sliceString(nf, nt), ordered) }).range(line.from, markerEnd))
          }
        } else if (name === 'Link') {
          const marks = node.node.getChildren('LinkMark')
          const url = node.node.getChild('URL')
          if (marks.length >= 2 && url) {
            const textFrom = marks[0].to
            const textTo = marks[1].from
            const href = doc.sliceString(url.from, url.to)
            ranges.push(mark('cm-link', { 'data-url': href }).range(textFrom, textTo))
            if (touches(nf, nt)) {
              for (const m of marks) ranges.push(mark('cm-formatting').range(m.from, m.to))
              ranges.push(mark('cm-formatting cm-url').range(url.from, url.to))
            } else {
              ranges.push(hide.range(nf, textFrom))
              ranges.push(hide.range(textTo, nt))
            }
          }
        } else if (name === 'Image') {
          const url = node.node.getChild('URL')
          const marks = node.node.getChildren('LinkMark')
          if (url && marks.length) {
            const src = doc.sliceString(url.from, url.to)
            const alt = doc.sliceString(marks[0].to, marks[1]?.from ?? nt)
            if (touches(nf, nt)) ranges.push(mark('cm-formatting').range(nf, nt))
            else ranges.push(Decoration.replace({ widget: new ImageWidget(decodeURI(src), alt, host) }).range(nf, nt))
          }
          return false
        } else if (name === 'URL' && node.node.parent?.name === 'Autolink') {
          ranges.push(mark('cm-link', { 'data-url': doc.sliceString(nf, nt) }).range(nf, nt))
        } else if (name === 'Table') {
          for (let l = doc.lineAt(nf).number; l <= doc.lineAt(nt).number; l++) ranges.push(lineDeco('cm-table-line').range(doc.line(l).from))
        } else if (name === 'TableDelimiter') {
          ranges.push(mark('cm-table-delim').range(nf, nt))
        } else if (name === 'TableHeader') {
          ranges.push(mark('cm-table-head').range(nf, nt))
        }
      }
    })

    // Regex-driven syntax that Lezer doesn't know about, one line at a time.
    const firstLine = doc.lineAt(from).number
    const lastLine = doc.lineAt(to).number
    for (let n = firstLine; n <= lastLine; n++) {
      const line = doc.line(n)
      if (n <= fmEnd) {
        ranges.push(lineDeco('cm-frontmatter').range(line.from))
        continue
      }
      if (!line.text) continue
      if (fencedLines.has(n)) continue
      const inCode = (pos: number) => codeSpans.some(([a, b]) => pos >= a && pos < b)

      if (line.text.includes('[[')) {
        for (const m of line.text.matchAll(WIKILINK_RE)) {
          const start = line.from + m.index!
          const end = start + m[0].length
          if (inCode(start)) continue
          const [, bang, target, heading, alias] = m
          const label = alias ?? (heading ? `${target}#${heading}` : target)
          const embed = bang === '!'
          if (embed && IMAGE_EXT.test(target.trim())) {
            if (touches(start, end)) ranges.push(mark('cm-formatting').range(start, end))
            else ranges.push(Decoration.replace({ widget: new ImageWidget(target.trim(), alias ?? '', host) }).range(start, end))
            continue
          }
          const exists = host.linkExists(target)
          const cls = `cm-wikilink${exists ? '' : ' cm-wikilink-missing'}${embed ? ' cm-embed' : ''}`
          const attrs = { 'data-target': target.trim(), 'data-heading': heading ?? '' }
          if (touches(start, end)) {
            ranges.push(mark('cm-formatting').range(start, start + 2 + (bang ? 1 : 0)))
            ranges.push(mark(cls, attrs).range(start + 2 + (bang ? 1 : 0), end - 2))
            ranges.push(mark('cm-formatting').range(end - 2, end))
          } else {
            const textFrom = start + m[0].indexOf(label)
            if (alias) {
              ranges.push(hide.range(start, start + m[0].length - alias.length - 2))
              ranges.push(mark(cls, attrs).range(end - 2 - alias.length, end - 2))
              ranges.push(hide.range(end - 2, end))
            } else {
              ranges.push(hide.range(start, start + 2 + (bang ? 1 : 0)))
              ranges.push(mark(cls, attrs).range(textFrom, textFrom + label.length))
              ranges.push(hide.range(start + m[0].length - 2, end))
            }
          }
        }
      }

      if (line.text.includes('[^') || (fn.defs.size && n - 1 >= fn.firstDefLine)) {
        const here = n - 1
        // Footnote definitions: `[^id]: text`, plus the indented lines that continue it.
        for (const def of fn.defs.values()) {
          if (here > def.line && here <= def.endLine) ranges.push(lineDeco('cm-fn-def cm-fn-cont').range(line.from))
          else if (here === def.line) {
            ranges.push(lineDeco('cm-fn-def').range(line.from))
            const from = line.from + def.col
            const to = from + def.labelLength
            const spaces = line.text.slice(def.col + def.labelLength).match(/^[ \t]*/)![0].length
            if (touches(line.from, line.to)) ranges.push(mark('cm-formatting').range(from, to))
            else ranges.push(Decoration.replace({ widget: new FootnoteLabelWidget(def.id, fn.numbers.get(def.id) ?? 0, fn.refs.some(r => r.id === def.id)) }).range(from, to + spaces))
          }
        }
        // Footnote references: `[^id]` becomes a small raised number that jumps to the text.
        for (const r of fn.refs) {
          if (r.line !== here) continue
          const start = line.from + r.col
          const end = start + r.length
          if (inCode(start)) continue
          if (touches(start, end)) ranges.push(mark('cm-fnref-src').range(start, end))
          else {
            const def = fn.defs.get(r.id)
            ranges.push(Decoration.replace({ widget: new FootnoteRefWidget(r.id, fn.numbers.get(r.id) ?? 0, def ? plainFootnote(def.text) : null) }).range(start, end))
          }
        }
      }

      if (line.text.includes('$')) {
        for (const m of line.text.matchAll(INLINE_MATH)) {
          const start = line.from + m.index!
          const end = start + m[0].length
          if (inCode(start)) continue
          if (touches(start, end)) ranges.push(mark('cm-math-src').range(start, end))
          else ranges.push(Decoration.replace({ widget: new MathWidget(m[1], false) }).range(start, end))
        }
      }

      if (line.text.includes('{{c')) {
        for (const m of line.text.matchAll(/\{\{c\d+::(.+?)(?:::(.+?))?\}\}/g)) {
          const start = line.from + m.index!
          const end = start + m[0].length
          if (inCode(start)) continue
          const open = m[0].indexOf('::') + 2
          ranges.push(mark('cm-cloze').range(start, end))
          ranges.push(mark('cm-cloze-mark').range(start, start + open))
          ranges.push(mark('cm-cloze-mark').range(end - 2, end))
        }
      } else {
        const sep = line.text.match(/^(?:\s*(?:[-*+]|\d+[.)])\s+)?.+?\s(:{2,3})\s/)
        if (sep && !line.text.startsWith('#')) {
          const at = line.text.indexOf(` ${sep[1]} `, sep[0].length - sep[1].length - 2)
          if (at >= 0) ranges.push(mark('cm-card-sep').range(line.from + at + 1, line.from + at + 1 + sep[1].length))
        }
      }

      if (line.text.includes('==')) {
        for (const m of line.text.matchAll(HIGHLIGHT_RE)) {
          const start = line.from + m.index!
          const end = start + m[0].length
          if (inCode(start)) continue
          ranges.push(mark('cm-highlight').range(start + 2, end - 2))
          if (touches(start, end)) {
            ranges.push(mark('cm-formatting').range(start, start + 2))
            ranges.push(mark('cm-formatting').range(end - 2, end))
          } else {
            ranges.push(hide.range(start, start + 2))
            ranges.push(hide.range(end - 2, end))
          }
        }
      }

      if (line.text.includes('#') && !/^#{1,6}\s/.test(line.text)) {
        for (const m of line.text.matchAll(TAG_RE)) {
          const start = line.from + m.index! + m[1].length
          if (inCode(start)) continue
          ranges.push(mark('cm-tag', { 'data-tag': m[2].slice(1) }).range(start, start + m[2].length))
        }
      }
    }
  }
  return Decoration.set(ranges, true)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some(t => t.reconfigured)) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: v => v.decorations }
)

// ------------------------------------------------------------------ display maths ($$ … $$)

interface MathBlock { from: number; to: number; tex: string }

function findMathBlocks(doc: EditorState['doc']): MathBlock[] {
  const text = doc.toString()
  const out: MathBlock[] = []
  if (!text.includes('$$')) return out
  // Ignore anything inside fenced code.
  const fences: [number, number][] = []
  for (const m of text.matchAll(/^(```+|~~~+)[^\n]*\n[\s\S]*?^\1\s*$/gm)) fences.push([m.index!, m.index! + m[0].length])
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    const from = m.index!
    if (fences.some(([a, b]) => from >= a && from < b)) continue
    out.push({ from, to: from + m[0].length, tex: m[1].trim() })
  }
  return out
}

const mathBlocks = StateField.define<{ blocks: MathBlock[]; decos: DecorationSet; reading: boolean }>({
  create(state) {
    return computeMath(state, findMathBlocks(state.doc))
  },
  update(value, tr) {
    const reading = tr.state.facet(readingFacet)
    if (!tr.docChanged && !tr.selection && reading === value.reading) return value
    const blocks = tr.docChanged ? findMathBlocks(tr.state.doc) : value.blocks
    return computeMath(tr.state, blocks)
  },
  provide: f => EditorView.decorations.from(f, v => v.decos)
})

function computeMath(state: EditorState, blocks: MathBlock[]) {
  const reading = state.facet(readingFacet)
  const ranges: Range<Decoration>[] = []
  for (const b of blocks) {
    const active = !reading && state.selection.ranges.some(r => r.from <= b.to && r.to >= b.from)
    if (active) {
      for (let l = state.doc.lineAt(b.from).number; l <= state.doc.lineAt(b.to).number; l++) {
        ranges.push(Decoration.line({ attributes: { class: 'cm-math-src-line' } }).range(state.doc.line(l).from))
      }
    } else {
      ranges.push(Decoration.replace({ widget: new MathWidget(b.tex, true), block: true }).range(b.from, b.to))
    }
  }
  return { blocks, decos: ranges.length ? RangeSet.of(ranges, true) : Decoration.none, reading }
}

export const displayMath = mathBlocks
