// Moving flashcards in and out of Omnia: CSV / tab-separated text (which Anki reads), and JSON.

import type { Card } from './cards'
import { formatInterval, type CardState } from './sr'

export interface ExportRow { front: string; back: string; type: 'basic' | 'cloze'; note: string }

const oneLine = (s: string) => s.replace(/\r?\n/g, '\n')

export function toRows(cards: Card[]): ExportRow[] {
  // A cloze sentence with several deletions is one row, however many cards it makes.
  const seen = new Set<string>()
  const rows: ExportRow[] = []
  for (const c of cards) {
    if (c.kind === 'cloze') {
      const key = `${c.path}:${c.line}:${c.front}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ front: oneLine(c.front), back: '', type: 'cloze', note: c.path })
    } else rows.push({ front: oneLine(c.front), back: oneLine(c.back), type: 'basic', note: c.path })
  }
  return rows
}

const cell = (s: string, sep: string) => (new RegExp(`["\\n\\r${sep === '\t' ? '\\t' : sep}]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export function toCSV(rows: ExportRow[], sep: ',' | '\t' = ','): string {
  const head = ['Front', 'Back', 'Type', 'Note'].join(sep)
  return [head, ...rows.map(r => [r.front, r.back, r.type, r.note].map(v => cell(v, sep)).join(sep))].join('\n') + '\n'
}

/** Plain two-column text that Anki's importer reads: Basic cards only, cloze sentences as a one-column file are skipped. */
export function toAnki(rows: ExportRow[]): string {
  return rows
    .filter(r => r.type === 'basic')
    .map(r => `${r.front.replace(/\t|\n/g, ' ')}\t${r.back.replace(/\t|\n/g, ' ')}`)
    .join('\n') + '\n'
}

export function toJSON(cards: Card[], states: Record<string, CardState>): string {
  return JSON.stringify(
    cards.map(c => {
      const s = states[c.id]
      return {
        front: c.front, back: c.back, type: c.kind, clozeIndex: c.clozeIndex, note: c.path,
        review: s ? { due: new Date(s.due).toISOString(), interval: formatInterval(s.due - Date.now()), stage: s.stage } : undefined
      }
    }),
    null,
    2
  )
}

// ---------------------------------------------------------------------------
// Import

export interface ImportedCard { front: string; back: string; cloze: boolean }

/** Splits delimited text into rows, honouring quoted fields (which may hold the delimiter, quotes and newlines). */
export function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(c => c.trim())) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(c => c.trim())) rows.push(row)
  return rows
}

export function detectSeparator(text: string): ',' | '\t' | ';' {
  const first = text.split(/\r?\n/).find(l => l.trim()) ?? ''
  const count = (c: string) => first.split(c).length - 1
  const t = count('\t')
  const c = count(',')
  const s = count(';')
  if (t >= 1 && t >= c) return '\t'
  if (s > c) return ';'
  return ','
}

const CLOZE = /\{\{c\d+::/

export function parseImport(text: string, filename = ''): ImportedCard[] {
  const body = text.replace(/^﻿/, '')
  if (/\.json$/i.test(filename) || /^\s*[[{]/.test(body)) {
    const data = JSON.parse(body) as unknown
    const list = Array.isArray(data) ? data : (data as { cards?: unknown[] })?.cards
    if (!Array.isArray(list)) throw new Error('This JSON file has no list of cards')
    return list.flatMap((c: Record<string, unknown>) => {
      const front = String(c.front ?? c.question ?? c.q ?? c.Front ?? '').trim()
      const back = String(c.back ?? c.answer ?? c.a ?? c.Back ?? '').trim()
      if (!front) return []
      const cloze = CLOZE.test(front) || c.type === 'cloze'
      return cloze || back ? [{ front, back, cloze }] : []
    })
  }
  const sep = detectSeparator(body)
  let rows = parseDelimited(body, sep)
  if (!rows.length) return []
  const head = rows[0].map(h => h.trim().toLowerCase())
  const hasHeader = head.includes('front') || head.includes('question') || head.includes('term')
  let fi = 0
  let bi = 1
  if (hasHeader) {
    fi = Math.max(0, head.findIndex(h => ['front', 'question', 'term'].includes(h)))
    bi = head.findIndex(h => ['back', 'answer', 'definition'].includes(h))
    if (bi < 0) bi = fi === 0 ? 1 : 0
    rows = rows.slice(1)
  }
  const out: ImportedCard[] = []
  for (const r of rows) {
    const front = (r[fi] ?? '').trim()
    const back = (r[bi] ?? '').trim()
    if (!front) continue
    if (CLOZE.test(front)) out.push({ front, back: '', cloze: true })
    else if (back) out.push({ front, back, cloze: false })
  }
  return out
}

/** Markdown that Omnia reads back as the same cards. */
export function toMarkdown(cards: ImportedCard[], title: string): string {
  const lines = cards.map(c => {
    const front = c.front.replace(/\s*\n\s*/g, ' ')
    if (c.cloze) return front
    if (/\n/.test(c.back)) return `${front}\n?\n${c.back}`
    return `${front} :: ${c.back.replace(/\s*\n\s*/g, ' ')}`
  })
  return `# ${title}\n\n${lines.join('\n\n')}\n`
}
