import { describe, expect, it } from 'vitest'
import { diffLines, diffStats, withContext } from './diff'
import { addVersion, describeAge, historyFileName, normaliseHistory, shouldSnapshot, SNAPSHOT_EVERY_MS } from './history'

describe('diffLines', () => {
  it('marks added, removed and unchanged lines', () => {
    const d = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne')
    expect(d.map(l => `${l.type[0]}:${l.text}`)).toEqual(['s:a', 'd:b', 'a:B', 's:c', 's:d', 'a:e'])
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 })
  })
  it('handles identical, empty and completely different text', () => {
    expect(diffLines('x\ny', 'x\ny').every(l => l.type === 'same')).toBe(true)
    expect(diffLines('', '').length).toBe(1)
    expect(diffStats(diffLines('a', 'b'))).toEqual({ added: 1, removed: 1 })
  })
  it('keeps order when a line moves', () => {
    const d = diffLines('1\n2\n3', '2\n3\n1')
    const rebuilt = d.filter(l => l.type !== 'del').map(l => l.text).join('\n')
    expect(rebuilt).toBe('2\n3\n1')
    expect(d.filter(l => l.type !== 'add').map(l => l.text).join('\n')).toBe('1\n2\n3')
  })
  it('collapses long unchanged stretches', () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const after = before.replace('line 15', 'LINE 15')
    const out = withContext(diffLines(before, after), 2)
    expect(out.some(l => l.type === 'gap')).toBe(true)
    expect(out.length).toBeLessThan(12)
  })
})

describe('history', () => {
  it('snapshots only when changed and old enough', () => {
    const v = { t: 1000, text: 'one' }
    expect(shouldSnapshot(undefined, 'one', 0)).toBe(true)
    expect(shouldSnapshot(undefined, '  ', 0)).toBe(false)
    expect(shouldSnapshot(v, 'two', 1000 + SNAPSHOT_EVERY_MS - 1)).toBe(false)
    expect(shouldSnapshot(v, 'two', 1000 + SNAPSHOT_EVERY_MS)).toBe(true)
    expect(shouldSnapshot(v, 'one', 1000 + SNAPSHOT_EVERY_MS * 5)).toBe(false)
  })
  it('caps the list but prefers dropping unlabelled versions', () => {
    let l = addVersion([], { t: 1, text: 'a', label: 'Before restore' }, 3)
    for (let i = 2; i <= 6; i++) l = addVersion(l, { t: i, text: String(i) }, 3)
    expect(l).toHaveLength(3)
    expect(l[0].label).toBe('Before restore')
    expect(l.map(v => v.t)).toEqual([1, 5, 6])
  })
  it('reads damaged files safely and names them by path', () => {
    expect(normaliseHistory({ versions: [{ t: 1, text: 'x' }, { t: 'no' }, null] }, 'A.md').versions).toHaveLength(1)
    expect(normaliseHistory('nope', 'A.md').versions).toEqual([])
    expect(historyFileName('A.md')).not.toBe(historyFileName('B.md'))
  })
  it('describes ages', () => {
    expect(describeAge(0, 30_000)).toBe('just now')
    expect(describeAge(0, 5 * 60_000)).toBe('5 min ago')
    expect(describeAge(0, 3 * 3600_000)).toBe('3 hours ago')
    expect(describeAge(0, 86400_000)).toBe('1 day ago')
  })
})
