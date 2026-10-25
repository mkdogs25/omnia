// "Search everything": note and document names, headings, flashcards, quiz questions, tasks, events and tags
// in one ranked list, for the quick switcher.

import { noteTitle } from './vault'
import { plainText } from './inline'
import { questionsFromNote } from './quiz'
import type { CalEvent, Task } from './tasks'
import type { ParsedNote } from './noteparse'

export type HitKind = 'note' | 'doc' | 'heading' | 'card' | 'quiz' | 'task' | 'event' | 'tag'

export interface Hit {
  kind: HitKind
  key: string
  label: string
  detail: string
  score: number
  path?: string
  line?: number
  heading?: string
  id?: string
  date?: string
  tag?: string
}

export interface SearchData {
  notes: Iterable<{ path: string; text: string; parsed: ParsedNote }>
  docs: Iterable<string>
  tasks: Task[]
  events: CalEvent[]
}

export const KIND_LABEL: Record<HitKind, string> = {
  note: 'Note', doc: 'Document', heading: 'Heading', card: 'Card', quiz: 'Quiz', task: 'Task', event: 'Event', tag: 'Tag'
}

function subsequence(q: string, s: string): boolean {
  let i = 0
  for (const ch of s) if (ch === q[i]) i++
  return i === q.length
}

/** Match quality of `q` inside `s`: 0 for no match, up to 100 for an exact one. */
export function matchScore(q: string, s: string): number {
  const t = s.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  const at = t.indexOf(q)
  if (at >= 0) return at === 0 || /\W/.test(t[at - 1]) ? 65 : 55
  return 0
}

const quizCache = new Map<string, { text: string; qs: ReturnType<typeof questionsFromNote> }>()
function quizOf(path: string, text: string) {
  const hit = quizCache.get(path)
  if (hit && hit.text === text) return hit.qs
  const qs = questionsFromNote(text)
  quizCache.set(path, { text, qs })
  return qs
}

const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function search(query: string, data: SearchData, limit = 40): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: Hit[] = []
  const tag = q.startsWith('#') ? q.slice(1) : null

  for (const note of data.notes) {
    const title = noteTitle(note.path)
    let s = matchScore(q, title) || (matchScore(q, note.path) ? 40 : 0) || (q.length > 1 && subsequence(q, title.toLowerCase()) ? 20 : 0)
    if (tag === null && s) hits.push({ kind: 'note', key: `n:${note.path}`, label: title, detail: note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '', score: s + 30, path: note.path })
    if (q.length < 2) continue
    for (const h of note.parsed.headings) {
      s = matchScore(q, h.text)
      if (s && tag === null) hits.push({ kind: 'heading', key: `h:${note.path}:${h.line}`, label: h.text, detail: title, score: s + 10, path: note.path, heading: h.text, line: h.line })
    }
    const cardLines = new Set<number>()
    for (const c of note.parsed.cards) {
      // Two-way and multi-cloze lines make several cards; one result per line is enough.
      if (cardLines.has(c.line)) continue
      cardLines.add(c.line)
      const front = plainText(c.front)
      const back = plainText(c.back)
      s = Math.max(matchScore(q, front), matchScore(q, back) - 10)
      if (s > 0 && tag === null) hits.push({ kind: 'card', key: `c:${c.id}`, label: clip(front), detail: back ? clip(back, 50) : title, score: s, path: note.path, line: c.line, id: c.id })
    }
    if (note.parsed.quizQuestions) {
      for (const qq of quizOf(note.path, note.text)) {
        s = matchScore(q, qq.prompt)
        if (s > 0 && tag === null) hits.push({ kind: 'quiz', key: `q:${qq.id}`, label: clip(plainText(qq.prompt)), detail: title, score: s - 5, path: note.path, id: qq.id })
      }
    }
  }
  for (const d of data.docs) {
    const title = noteTitle(d)
    const s = matchScore(q, title) || (matchScore(q, d) ? 40 : 0)
    if (s && tag === null) hits.push({ kind: 'doc', key: `d:${d}`, label: title, detail: d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '', score: s + 30, path: d })
  }
  for (const t of data.tasks) {
    const s = matchScore(q, t.title)
    if (s && tag === null) hits.push({ kind: 'task', key: `t:${t.id}`, label: t.title, detail: t.done ? 'Done' : t.deadline ? `Deadline ${t.deadline}` : t.due ?? '', score: s + (t.done ? -20 : 5), id: t.id })
  }
  for (const e of data.events) {
    const s = matchScore(q, e.title)
    if (s && tag === null) hits.push({ kind: 'event', key: `e:${e.id}`, label: e.title, detail: e.date, score: s, id: e.id, date: e.date })
  }
  if (tag !== null) {
    const seen = new Set<string>()
    for (const note of data.notes) for (const t of note.parsed.tags) {
      if (seen.has(t) || !t.toLowerCase().includes(tag)) continue
      seen.add(t)
      hits.push({ kind: 'tag', key: `#${t}`, label: `#${t}`, detail: '', score: matchScore(tag, t) || 30, tag: t })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit)
}
