import type { Card } from './cards'
import { parseNote, WIKILINK_RE, type ParsedNote } from './noteparse'
import { basename, dirname, noteTitle } from './vault'

export interface NoteRecord {
  path: string
  mtime: number
  text: string
  parsed: ParsedNote
}

export interface Backlink {
  from: string
  line: number
  context: string
}

export interface SearchHit {
  path: string
  score: number
  snippet: string
  /** Line of the first body match, if any. */
  line?: number
}

export class NoteIndex {
  notes = new Map<string, NoteRecord>()
  private byName = new Map<string, string[]>()
  private backlinkMap = new Map<string, Backlink[]>()
  private tagMap = new Map<string, string[]>()

  set(path: string, mtime: number, text: string): NoteRecord {
    const rec = { path, mtime, text, parsed: parseNote(text, path) }
    this.notes.set(path, rec)
    return rec
  }

  delete(path: string) {
    this.notes.delete(path)
  }

  /** Recomputes name lookup, backlinks and tags. Call after a batch of changes. */
  rebuild() {
    this.byName.clear()
    this.backlinkMap.clear()
    this.tagMap.clear()
    for (const path of this.notes.keys()) {
      const key = noteTitle(path).toLowerCase()
      const list = this.byName.get(key) ?? []
      list.push(path)
      this.byName.set(key, list)
    }
    for (const rec of this.notes.values()) {
      const lines = rec.text.split(/\r?\n/)
      for (const link of rec.parsed.links) {
        const target = this.resolve(link.target, rec.path)
        if (!target || target === rec.path) continue
        const list = this.backlinkMap.get(target) ?? []
        list.push({ from: rec.path, line: link.line, context: (lines[link.line] ?? '').trim() })
        this.backlinkMap.set(target, list)
      }
      for (const tag of rec.parsed.tags) {
        const list = this.tagMap.get(tag) ?? []
        list.push(rec.path)
        this.tagMap.set(tag, list)
      }
    }
  }

  /** Finds the note a [[link]] points at. Prefers the closest folder when names clash. */
  resolve(target: string, fromPath = ''): string | null {
    let t = target.trim().replace(/\.md$/i, '')
    if (!t) return null
    if (t.includes('/')) {
      const wanted = (t.replace(/^\//, '') + '.md').toLowerCase()
      for (const p of this.notes.keys()) if (p.toLowerCase() === wanted || p.toLowerCase().endsWith('/' + wanted)) return p
      return null
    }
    const matches = this.byName.get(t.toLowerCase())
    if (!matches?.length) return null
    if (matches.length === 1) return matches[0]
    const here = dirname(fromPath)
    return [...matches].sort((a, b) => {
      const sa = dirname(a) === here ? 0 : 1
      const sb = dirname(b) === here ? 0 : 1
      return sa - sb || a.split('/').length - b.split('/').length
    })[0]
  }

  backlinks(path: string): Backlink[] {
    return this.backlinkMap.get(path) ?? []
  }

  tags(): [string, string[]][] {
    return [...this.tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }

  cards(): Card[] {
    const seen = new Set<string>()
    const out: Card[] = []
    for (const rec of this.notes.values()) {
      for (const c of rec.parsed.cards) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        out.push(c)
      }
    }
    return out
  }

  /** Names of links that don't resolve to a note, for the "unresolved" list. */
  unresolved(path: string): string[] {
    const rec = this.notes.get(path)
    if (!rec) return []
    return [...new Set(rec.parsed.links.filter(l => !l.embed && !this.resolve(l.target, path)).map(l => l.target))]
  }

  /** Notes (other than `path`) that mention the title of `path` without linking to it. */
  unlinkedMentions(path: string, limit = 20): string[] {
    const title = noteTitle(path)
    if (title.length < 3) return []
    const re = new RegExp(`\\b${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const linked = new Set(this.backlinks(path).map(b => b.from))
    const out: string[] = []
    for (const rec of this.notes.values()) {
      if (rec.path === path || linked.has(rec.path)) continue
      if (re.test(rec.text.replace(WIKILINK_RE, ''))) out.push(rec.path)
      if (out.length >= limit) break
    }
    return out
  }

  search(query: string, limit = 60): SearchHit[] {
    const tagFilters: string[] = []
    const pathFilters: string[] = []
    const terms: string[] = []
    for (const tok of query.trim().split(/\s+/).filter(Boolean)) {
      if (/^tag:#?/i.test(tok)) tagFilters.push(tok.replace(/^tag:#?/i, '').toLowerCase())
      else if (/^path:/i.test(tok)) pathFilters.push(tok.slice(5).toLowerCase())
      else terms.push(tok.toLowerCase())
    }
    const hits: SearchHit[] = []
    for (const rec of this.notes.values()) {
      const lowerPath = rec.path.toLowerCase()
      if (pathFilters.some(p => !lowerPath.includes(p))) continue
      if (tagFilters.some(t => !rec.parsed.tags.some(x => x.toLowerCase() === t || x.toLowerCase().startsWith(t + '/')))) continue
      const title = noteTitle(rec.path).toLowerCase()
      const body = rec.text.toLowerCase()
      let score = 0
      let ok = true
      for (const t of terms) {
        const inTitle = title.includes(t)
        const count = body.split(t).length - 1
        if (!inTitle && count === 0) { ok = false; break }
        score += (inTitle ? 50 : 0) + (title === t ? 50 : 0) + Math.min(count, 20)
      }
      if (!ok) continue
      if (!terms.length) score = 1
      let snippet = rec.parsed.excerpt
      let line: number | undefined
      if (terms.length) {
        const idx = body.indexOf(terms[0])
        if (idx >= 0) {
          line = rec.text.slice(0, idx).split('\n').length - 1
          const start = Math.max(0, idx - 40)
          snippet = (start > 0 ? '…' : '') + rec.text.slice(start, idx + 120).replace(/\s+/g, ' ')
        }
      }
      hits.push({ path: rec.path, score, snippet, line })
    }
    return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit)
  }

  /** Fuzzy title match for the quick switcher and [[ autocomplete. */
  findByTitle(query: string, limit = 30): string[] {
    const q = query.toLowerCase().trim()
    const scored: [number, string][] = []
    for (const path of this.notes.keys()) {
      const t = noteTitle(path).toLowerCase()
      const p = path.toLowerCase()
      let s = -1
      if (!q) s = 0
      else if (t === q) s = 100
      else if (t.startsWith(q)) s = 80
      else if (t.includes(q)) s = 60
      else if (p.includes(q)) s = 40
      else if (subsequence(q, t)) s = 20
      if (s >= 0) scored.push([s - t.length / 1000, path])
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1])
  }
}

function subsequence(q: string, s: string): boolean {
  let i = 0
  for (const ch of s) if (ch === q[i]) i++
  return i === q.length
}

/** Rewrites [[Old]] links (and [[Old#h|alias]] variants) when a note is renamed. */
export function renameLinkTarget(text: string, oldTitle: string, newTitle: string): string {
  const lower = oldTitle.toLowerCase()
  return text.replace(WIKILINK_RE, (all, bang, target, heading, alias) => {
    const t = String(target).trim()
    const tail = t.includes('/') ? basename(t) : t
    if (tail.replace(/\.md$/i, '').toLowerCase() !== lower) return all
    const prefix = t.includes('/') ? t.slice(0, t.lastIndexOf('/') + 1) : ''
    return `${bang}[[${prefix}${newTitle}${heading ? '#' + heading : ''}${alias ? '|' + alias : ''}]]`
  })
}
