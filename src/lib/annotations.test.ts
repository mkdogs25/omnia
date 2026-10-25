import { describe, expect, it } from 'vitest'
import { bookmarkOn, hitTest, inOrder, normaliseAnnotations, quoteMarkdown, rectsFromClient, type Annotation } from './annotations'

const page = { left: 100, top: 50, width: 500, height: 700 }
const ann = (o: Partial<Annotation>): Annotation => ({ id: 'a', kind: 'highlight', page: 1, rects: [], text: 't', colour: 'yellow', comment: '', created: '2026-10-25', ...o })

describe('rectsFromClient', () => {
  it('converts to page fractions', () => {
    const r = rectsFromClient([{ left: 150, top: 120, width: 100, height: 20 }], page)
    expect(r).toEqual([{ x: 0.1, y: 70 / 700, w: 0.2, h: 20 / 700 }])
  })
  it('merges boxes on the same line and keeps separate lines apart', () => {
    const r = rectsFromClient([
      { left: 150, top: 120, width: 100, height: 20 }, { left: 252, top: 121, width: 80, height: 20 }, { left: 150, top: 150, width: 90, height: 20 }
    ], page)
    expect(r).toHaveLength(2)
    expect(r[0].w).toBeCloseTo((332 - 150) / 500)
  })
  it('drops empty and off-page boxes', () => {
    expect(rectsFromClient([{ left: 0, top: 0, width: 0, height: 5 }, { left: 900, top: 900, width: 10, height: 10 }], page)).toEqual([])
  })
})

describe('annotations', () => {
  it('finds the highlight under a point, newest first', () => {
    const items = [ann({ id: 'old', rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }] }), ann({ id: 'new', rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }] })]
    expect(hitTest(items, 1, 0.2, 0.12)?.id).toBe('new')
    expect(hitTest(items, 2, 0.2, 0.12)).toBeNull()
    expect(hitTest(items, 1, 0.9, 0.9)).toBeNull()
  })
  it('knows which pages are bookmarked', () => {
    expect(bookmarkOn([ann({ kind: 'bookmark', page: 3 })], 3)).toBeTruthy()
    expect(bookmarkOn([ann({ kind: 'bookmark', page: 3 })], 4)).toBeUndefined()
  })
  it('orders by page then position', () => {
    const o = inOrder([ann({ id: 'b', page: 2 }), ann({ id: 'c', page: 1, rects: [{ x: 0, y: 0.5, w: 1, h: 0.1 }] }), ann({ id: 'a', page: 1, rects: [{ x: 0, y: 0.1, w: 1, h: 0.1 }] })])
    expect(o.map(a => a.id)).toEqual(['a', 'c', 'b'])
  })
  it('ignores saved data for a different file', () => {
    const file = { v: 1, size: 10, items: [ann({})] }
    expect(normaliseAnnotations(file, 10)).toHaveLength(1)
    expect(normaliseAnnotations(file, 11)).toEqual([])
    expect(normaliseAnnotations('x', 10)).toEqual([])
  })
  it('quotes with the comment underneath', () => {
    expect(quoteMarkdown(ann({ text: 'line one\nline two', comment: 'check this' }), '[[a.pdf#page=2|p. 2]]')).toBe('\n> line one\n> line two\n> — [[a.pdf#page=2|p. 2]]\n\ncheck this\n\n')
  })
})
