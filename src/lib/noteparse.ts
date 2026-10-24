import { extractCards, type Card } from './cards'
import { questionsFromNote } from './quiz'

export interface WikiLink {
  /** Target as written, without heading or alias. */
  target: string
  heading?: string
  alias?: string
  embed: boolean
  line: number
}

export interface Heading { level: number; text: string; line: number }

export interface ParsedNote {
  headings: Heading[]
  links: WikiLink[]
  tags: string[]
  words: number
  chars: number
  cards: Card[]
  quizQuestions: number
  /** First non-empty line of body text, for search results and previews. */
  excerpt: string
}

export const WIKILINK_RE = /(!?)\[\[([^\]\n|#]+?)(?:#([^\]\n|]+?))?(?:\|([^\]\n]+?))?\]\]/g

/** Returns the text with frontmatter and code (fenced and inline) blanked out, preserving line numbers. */
export function stripNonProse(text: string): string {
  const lines = text.split(/\r?\n/)
  let i = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (end > 0) for (; i <= end; i++) lines[i] = ''
  }
  let fence: string | null = null
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      lines[i] = ''
    } else if (m) {
      fence = m[1]
      lines[i] = ''
    } else {
      lines[i] = lines[i].replace(/`[^`\n]*`/g, '')
    }
  }
  return lines.join('\n')
}

export function frontmatterTags(text: string): string[] {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return []
  const fm = m[1]
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m)
  if (inline) return inline[1].split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
  const single = fm.match(/^tags:\s*([^\[\n-][^\n]*)$/m)
  if (single) return single[1].split(/[,\s]+/).map(t => t.replace(/^#/, '')).filter(Boolean)
  const list = fm.match(/^tags:\s*\n((?:\s*-\s+.*\n?)+)/m)
  if (list) return list[1].split('\n').map(l => l.replace(/^\s*-\s+/, '').trim().replace(/^#/, '')).filter(Boolean)
  return []
}

export function parseNote(text: string, path: string): ParsedNote {
  const prose = stripNonProse(text)
  const lines = prose.split('\n')
  const headings: Heading[] = []
  const links: WikiLink[] = []
  const tags = new Set<string>(frontmatterTags(text))

  lines.forEach((line, idx) => {
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (h) headings.push({ level: h[1].length, text: h[2], line: idx })
    for (const m of line.matchAll(WIKILINK_RE)) {
      links.push({ embed: m[1] === '!', target: m[2].trim(), heading: m[3]?.trim(), alias: m[4]?.trim(), line: idx })
    }
    for (const m of line.matchAll(/(?:^|[\s(])#([A-Za-z][\w/-]*)/g)) tags.add(m[1])
  })

  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const excerpt = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !l.startsWith('```')) ?? ''

  return {
    headings, links, tags: [...tags], words, chars: body.length,
    cards: extractCards(text, path),
    quizQuestions: questionsFromNote(text).length,
    excerpt: excerpt.slice(0, 200)
  }
}
