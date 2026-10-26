import { describe, expect, it } from 'vitest'
import { nextFootnoteId, plainFootnote, scanFootnotes } from './footnotes'

const scan = (s: string) => scanFootnotes(s.split('\n'))

describe('scanFootnotes', () => {
  const doc = 'A claim.[^src] And another[^note] one.\n\n[^src]: Author, Title, 2024.\n[^note]: First line\n    second line\n\n[^unused]: Never cited.'

  it('finds references and definitions', () => {
    const f = scan(doc)
    expect(f.refs.map(r => [r.id, r.line, r.col])).toEqual([['src', 0, 8], ['note', 0, 26]])
    expect(f.defs.get('src')).toMatchObject({ line: 2, col: 0, labelLength: 7, text: 'Author, Title, 2024.' })
    expect(f.defs.get('note')).toMatchObject({ line: 3, endLine: 4, text: 'First line second line' })
  })

  it('numbers by first reference, then unreferenced definitions', () => {
    expect([...scan(doc).numbers]).toEqual([['src', 1], ['note', 2], ['unused', 3]])
    expect(scan('b[^b] a[^a] b again[^b]\n\n[^a]: A\n[^b]: B').numbers.get('b')).toBe(1)
  })

  it('does not treat the definition label as a reference', () => {
    expect(scan('[^x]: only a definition').refs).toEqual([])
  })

  it('reports references with no definition', () => {
    const f = scan('Text[^missing].')
    expect(f.refs).toHaveLength(1)
    expect(f.defs.size).toBe(0)
  })

  it('ignores code, fences and frontmatter', () => {
    const f = scan('---\nnote: [^fm]\n---\n`[^inline]` and real[^real]\n\n```\n[^fenced]\n[^fenced]: no\n```')
    expect(f.refs.map(r => r.id)).toEqual(['real'])
    expect(f.defs.size).toBe(0)
  })

  it('keeps the first definition when an id is repeated', () => {
    expect(scan('x[^a]\n\n[^a]: one\n[^a]: two').defs.get('a')?.text).toBe('one')
  })

  it('allows a blank line inside an indented footnote', () => {
    expect(scan('[^a]: first\n\n    more').defs.get('a')?.endLine).toBe(2)
  })
})

describe('helpers', () => {
  it('strips markup for tooltips', () => {
    expect(plainFootnote('See **[[Waves|the note]]** and `code`')).toBe('See the note and code')
  })
  it('picks the next free numeric id', () => {
    expect(nextFootnoteId(['a[^1] b[^2]', '', '[^1]: x'])).toBe('3')
    expect(nextFootnoteId(['a[^x]'])).toBe('1')
  })
})
