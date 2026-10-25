// Highlights, comments and bookmarks on PDF pages. Positions are stored as fractions of the page, so they stay put at any zoom.

export type HighlightColour = 'yellow' | 'green' | 'pink' | 'blue'
export const COLOURS: Record<HighlightColour, string> = {
  yellow: '#f4c430', green: '#7cc35f', pink: '#ee7fa6', blue: '#6aaae8'
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Annotation {
  id: string
  kind: 'highlight' | 'bookmark'
  page: number
  /** Highlights only: one rectangle per line of selected text. */
  rects: Rect[]
  text: string
  colour: HighlightColour
  comment: string
  created: string
}

export interface AnnotationFile { v: 1; size: number; items: Annotation[] }

export const ANNOTATION_DIR = '.omnia/annotations'

export function normaliseAnnotations(raw: unknown, size: number): Annotation[] {
  const r = raw as Partial<AnnotationFile> | null
  if (!r || r.v !== 1 || r.size !== size || !Array.isArray(r.items)) return []
  return r.items.filter(a => a && typeof a.id === 'string' && typeof a.page === 'number' && Array.isArray(a.rects))
}

/** Turns the rectangles a browser reports for a selection into page fractions, merging boxes that share a line. */
export function rectsFromClient(rects: { left: number; top: number; width: number; height: number }[], page: { left: number; top: number; width: number; height: number }): Rect[] {
  const out: Rect[] = []
  for (const r of rects) {
    if (r.width < 1 || r.height < 1) continue
    const box = { x: (r.left - page.left) / page.width, y: (r.top - page.top) / page.height, w: r.width / page.width, h: r.height / page.height }
    if (box.x > 1 || box.y > 1 || box.x + box.w < 0 || box.y + box.h < 0) continue
    out.push(box)
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x)
  const merged: Rect[] = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    const sameLine = last && Math.abs(last.y - r.y) < Math.max(last.h, r.h) * 0.5 && r.x <= last.x + last.w + 0.02
    if (sameLine) {
      const right = Math.max(last.x + last.w, r.x + r.w)
      const bottom = Math.max(last.y + last.h, r.y + r.h)
      last.y = Math.min(last.y, r.y)
      last.h = bottom - last.y
      last.w = right - last.x
    } else merged.push({ ...r })
  }
  return merged
}

export function hitTest(items: Annotation[], page: number, x: number, y: number): Annotation | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const a = items[i]
    if (a.kind !== 'highlight' || a.page !== page) continue
    if (a.rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return a
  }
  return null
}

export const bookmarkOn = (items: Annotation[], page: number) => items.find(a => a.kind === 'bookmark' && a.page === page)

/** Highlights and bookmarks in reading order. */
export function inOrder(items: Annotation[]): Annotation[] {
  return [...items].sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0))
}

/** Markdown for quoting a highlight into notes. */
export function quoteMarkdown(a: Annotation, ref: string): string {
  const body = a.text.split('\n').map(l => `> ${l}`).join('\n')
  return `\n${body}\n> — ${ref}${a.comment ? `\n\n${a.comment}` : ''}\n\n`
}
