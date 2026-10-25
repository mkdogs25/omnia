import { describe, expect, it } from 'vitest'
import { buildGraph, layout, limitNodes, neighbourhood } from './graph'

const links: Record<string, string[]> = {
  'A.md': ['B.md', 'C.md', 'Missing.md'],
  'B.md': ['A.md', 'D.md'],
  'C.md': [],
  'D.md': ['E.md'],
  'E.md': [],
  'Lone.md': [],
  'Sub/F.md': ['A.md']
}
const g = () => buildGraph({ paths: Object.keys(links), linksOf: p => links[p] ?? [] })

describe('buildGraph', () => {
  it('links once per pair and ignores unresolved targets', () => {
    const graph = g()
    expect(graph.edges).toHaveLength(5)
    expect(graph.nodes.find(n => n.id === 'A.md')?.degree).toBe(3)
    expect(graph.nodes.find(n => n.id === 'Lone.md')?.degree).toBe(0)
    expect(graph.nodes.find(n => n.id === 'Sub/F.md')).toMatchObject({ label: 'F', folder: 'Sub' })
  })
})

describe('neighbourhood', () => {
  it('walks links in both directions up to a depth', () => {
    expect(neighbourhood(g(), 'A.md', 1).nodes.map(n => n.id).sort()).toEqual(['A.md', 'B.md', 'C.md', 'Sub/F.md'])
    expect(neighbourhood(g(), 'A.md', 2).nodes.map(n => n.id)).toContain('D.md')
    expect(neighbourhood(g(), 'A.md', 3).nodes.map(n => n.id)).toContain('E.md')
    expect(neighbourhood(g(), 'Lone.md', 2).nodes).toHaveLength(1)
  })
  it('recomputes degrees inside the subgraph', () => {
    expect(neighbourhood(g(), 'D.md', 1).nodes.find(n => n.id === 'D.md')?.degree).toBe(2)
  })
})

describe('limitNodes', () => {
  it('keeps the best connected', () => {
    const l = limitNodes(g(), 3)
    expect(l.nodes).toHaveLength(3)
    expect(l.nodes.map(n => n.id)).toContain('A.md')
  })
})

describe('layout', () => {
  it('is deterministic and keeps nodes apart and inside the box', () => {
    const a = layout(g(), 800)
    const b = layout(g(), 800)
    expect(a.nodes.map(n => [n.x, n.y])).toEqual(b.nodes.map(n => [n.x, n.y]))
    for (const n of a.nodes) { expect(Math.abs(n.x)).toBeLessThanOrEqual(400); expect(Math.abs(n.y)).toBeLessThanOrEqual(400) }
    let min = Infinity
    for (let i = 0; i < a.nodes.length; i++) for (let j = i + 1; j < a.nodes.length; j++) min = Math.min(min, Math.hypot(a.nodes[i].x - a.nodes[j].x, a.nodes[i].y - a.nodes[j].y))
    expect(min).toBeGreaterThan(5)
  })
  it('pulls linked notes closer than unlinked ones', () => {
    const a = layout(g(), 800)
    const at = (id: string) => a.nodes.find(n => n.id === id)!
    const dist = (p: string, q: string) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y)
    expect(dist('A.md', 'B.md')).toBeLessThan(dist('A.md', 'E.md'))
  })
  it('handles an empty graph', () => {
    expect(layout({ nodes: [], edges: [] }).nodes).toEqual([])
  })
})
