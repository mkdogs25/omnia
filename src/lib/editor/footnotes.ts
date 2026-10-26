// Footnotes written the usual Markdown way:
//
//   A claim that needs a source.[^src]
//
//   [^src]: Author, Title, 2024. Continuation lines
//       are indented.
//
// This module only reads the text; the editor draws it.

export interface FootnoteDef {
  id: string
  /** Zero-based line of the `[^id]:` label and the last line that belongs to it. */
  line: number
  endLine: number
  /** Offset of the label on its line, and its length including the colon. */
  col: number
  labelLength: number
  text: string
}

export interface FootnoteRef { id: string; line: number; col: number; length: number }

export interface Footnotes {
  defs: Map<string, FootnoteDef>
  refs: FootnoteRef[]
  /** id -> display number: in order of first reference, then definitions that are never referenced. */
  numbers: Map<string, number>
  /** Line of the first definition (Infinity when there are none), so the editor can skip the work above it. */
  firstDefLine: number
}

const DEF = /^( {0,3})\[\^([^\]\s]+)\]:[ \t]*(.*)$/
const REF = /\[\^([^\]\s]+)\]/g
const FENCE = /^\s*(```+|~~~+)/

export function scanFootnotes(lines: string[]): Footnotes {
  const defs = new Map<string, FootnoteDef>()
  const refs: FootnoteRef[] = []
  const defLines = new Set<number>()
  let fence: string | null = null
  let frontmatter = lines[0]?.trim() === '---' ? lines.findIndex((l, i) => i > 0 && l.trim() === '---') : -1

  for (let n = 0; n < lines.length; n++) {
    const text = lines[n]
    if (n <= frontmatter) continue
    const f = text.match(FENCE)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) { fence = f[1]; continue }

    const d = text.match(DEF)
    if (d) {
      const id = d[2]
      if (!defs.has(id)) {
        // Indented lines (allowing one blank line between) carry on the footnote.
        let end = n
        const parts = [d[3]]
        for (let k = n + 1; k < lines.length; k++) {
          if (/^(?: {2,}|\t)\S/.test(lines[k])) { end = k; parts.push(lines[k].trim()) }
          else if (!lines[k].trim() && /^(?: {2,}|\t)\S/.test(lines[k + 1] ?? '')) continue
          else break
        }
        for (let k = n + 1; k <= end; k++) defLines.add(k)
        defs.set(id, { id, line: n, endLine: end, col: d[1].length, labelLength: `[^${id}]:`.length, text: parts.join(' ').trim() })
      }
      defLines.add(n)
    }
  }

  fence = null
  for (let n = 0; n < lines.length; n++) {
    const text = lines[n]
    if (n <= frontmatter) continue
    const f = text.match(FENCE)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) { fence = f[1]; continue }
    if (!text.includes('[^')) continue
    // Blank out inline code so `[^x]` inside it stays literal.
    const visible = text.replace(/`[^`]*`/g, m => ' '.repeat(m.length))
    const label = defs.get(text.match(DEF)?.[2] ?? '')?.line === n ? text.match(DEF)! : null
    for (const m of visible.matchAll(REF)) {
      if (label && m.index === label[1].length) continue
      refs.push({ id: m[1], line: n, col: m.index!, length: m[0].length })
    }
  }

  const numbers = new Map<string, number>()
  for (const r of refs) if (!numbers.has(r.id)) numbers.set(r.id, numbers.size + 1)
  for (const id of defs.keys()) if (!numbers.has(id)) numbers.set(id, numbers.size + 1)
  return { defs, refs, numbers, firstDefLine: Math.min(Infinity, ...[...defs.values()].map(d => d.line)) }
}

/** Plain-text version of a footnote for a tooltip. */
export function plainFootnote(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a ?? t).replace(/[*_`~=]/g, '').replace(/\s+/g, ' ').trim()
}

/** Next unused numeric footnote id, for the "insert footnote" command. */
export function nextFootnoteId(lines: string[]): string {
  const { defs, refs } = scanFootnotes(lines)
  const used = new Set([...defs.keys(), ...refs.map(r => r.id)])
  let n = 1
  while (used.has(String(n))) n++
  return String(n)
}
