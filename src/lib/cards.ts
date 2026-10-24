// Flashcards live inside ordinary Markdown notes. Supported syntax:
//
//   Front :: Back            one-way card
//   Front ::: Back           two-way card (front->back and back->front)
//   Front                    multi-line card: a line holding only "?" (or "??" for two-way)
//   ?                        splits the front lines from the back lines
//   Back
//   The {{c1::mitochondria}} is the powerhouse   cloze deletion ({{c1::answer::hint}} also works)

export type CardKind = 'basic' | 'cloze'

export interface Card {
  /** Stable, content-based id so review history survives edits elsewhere in the note and moves between notes. */
  id: string
  kind: CardKind
  /** Basic cards: the prompt. Cloze cards: the full sentence including {{cN::…}} markers. */
  front: string
  back: string
  clozeIndex?: number
  path: string
  line: number
}

const CLOZE_RE = /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g

/** cyrb53, a small, fast, well-distributed string hash. */
export function hash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function stripListMarker(s: string): string {
  return s.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
}

export function extractCards(text: string, path: string): Card[] {
  const lines = text.split(/\r?\n/)
  const cards: Card[] = []
  const seen = new Set<string>()
  const add = (card: Omit<Card, 'id' | 'path'> & { idSource: string }) => {
    const { idSource, ...rest } = card
    const id = hash(idSource)
    if (seen.has(id)) return
    seen.add(id)
    cards.push({ ...rest, id, path })
  }

  let i = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (end > 0) i = end + 1
  }

  // Mark the lines that sit inside fenced code so they are skipped.
  const code = new Array<boolean>(lines.length).fill(false)
  let fence: string | null = null
  for (let k = i; k < lines.length; k++) {
    const m = lines[k].match(/^\s*(```+|~~~+)/)
    if (fence) {
      code[k] = true
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    } else if (m) {
      fence = m[1]
      code[k] = true
    }
  }

  for (; i < lines.length; i++) {
    if (code[i]) continue
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue

    // Multi-line cards
    if (line === '?' || line === '??') {
      const front: string[] = []
      for (let k = i - 1; k >= 0 && lines[k].trim() && !code[k]; k--) front.unshift(lines[k].trim())
      const back: string[] = []
      for (let k = i + 1; k < lines.length && lines[k].trim() && !code[k]; k++) back.push(lines[k].trim())
      if (front.length && back.length) {
        const f = front.join('\n')
        const b = back.join('\n')
        add({ kind: 'basic', front: f, back: b, line: i, idSource: `b|${normalise(f)}` })
        if (line === '??') add({ kind: 'basic', front: b, back: f, line: i, idSource: `b|${normalise(b)}` })
      }
      continue
    }

    // Cloze deletions
    if (/\{\{c\d+::/.test(line)) {
      const body = stripListMarker(line)
      const indices = [...new Set([...body.matchAll(CLOZE_RE)].map(m => parseInt(m[1], 10)))].sort((a, b) => a - b)
      const masked = body.replace(CLOZE_RE, '[…]')
      for (const idx of indices) {
        add({ kind: 'cloze', front: body, back: '', clozeIndex: idx, line: i, idSource: `c${idx}|${normalise(masked)}` })
      }
      continue
    }

    // One-line cards
    const m = stripListMarker(line).match(/^(.+?)\s(:{2,3})\s(.+)$/)
    if (m) {
      const [, f, sep, b] = m
      add({ kind: 'basic', front: f, back: b, line: i, idSource: `b|${normalise(f)}` })
      if (sep === ':::') add({ kind: 'basic', front: b, back: f, line: i, idSource: `b|${normalise(b)}` })
    }
  }
  return cards
}

/** The text shown while the answer is hidden. */
export function clozeHidden(text: string, index: number): string {
  return text.replace(CLOZE_RE, (_all, n, answer, hint) =>
    parseInt(n, 10) === index ? `\u0001${hint ?? '…'}\u0002` : answer)
}

/** The text shown after reveal, with the active answer marked. */
export function clozeRevealed(text: string, index: number): string {
  return text.replace(CLOZE_RE, (_all, n, answer) =>
    parseInt(n, 10) === index ? `\u0003${answer}\u0004` : answer)
}

/** Plain answer(s) for a cloze card. */
export function clozeAnswers(text: string, index: number): string[] {
  return [...text.matchAll(CLOZE_RE)].filter(m => parseInt(m[1], 10) === index).map(m => m[2])
}

/** Text of a cloze sentence with no deletions, for display in lists. */
export function clozePlain(text: string): string {
  return text.replace(CLOZE_RE, (_a, _n, answer) => answer)
}

/** Inserts or wraps the next free cloze number around a selection. */
export function wrapCloze(selected: string, wholeNote: string): string {
  const used = [...wholeNote.matchAll(/\{\{c(\d+)::/g)].map(m => parseInt(m[1], 10))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `{{c${next}::${selected}}}`
}
