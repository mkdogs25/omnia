// The knowledge graph: notes as dots, links as lines, laid out with a small force simulation.

export interface GNode { id: string; label: string; folder: string; degree: number; x: number; y: number }
export interface GEdge { a: string; b: string }
export interface Graph { nodes: GNode[]; edges: GEdge[] }

export interface GraphSource {
  paths: string[]
  /** Target paths a note links to (already resolved; unresolved links are left out). */
  linksOf: (path: string) => string[]
}

const folderOf = (p: string) => (p.includes('/') ? p.slice(0, p.indexOf('/')) : '')
const titleOf = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '')

export function buildGraph(src: GraphSource): Graph {
  const known = new Set(src.paths)
  const seen = new Set<string>()
  const edges: GEdge[] = []
  const degree = new Map<string, number>()
  for (const a of src.paths) {
    for (const b of src.linksOf(a)) {
      if (a === b || !known.has(b)) continue
      const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a, b })
      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
    }
  }
  const nodes = src.paths.map(id => ({ id, label: titleOf(id), folder: folderOf(id), degree: degree.get(id) ?? 0, x: 0, y: 0 }))
  return { nodes, edges }
}

/** Notes within `depth` links of `id` (both directions), including itself. */
export function neighbourhood(g: Graph, id: string, depth: number): Graph {
  const adj = new Map<string, string[]>()
  for (const e of g.edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a])
  }
  const keep = new Set<string>([id])
  let frontier = [id]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const n of frontier) for (const m of adj.get(n) ?? []) if (!keep.has(m)) { keep.add(m); next.push(m) }
    frontier = next
  }
  return subgraph(g, keep)
}

export function subgraph(g: Graph, keep: Set<string>): Graph {
  const nodes = g.nodes.filter(n => keep.has(n.id))
  const edges = g.edges.filter(e => keep.has(e.a) && keep.has(e.b))
  const degree = new Map<string, number>()
  for (const e of edges) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1) }
  return { nodes: nodes.map(n => ({ ...n, degree: degree.get(n.id) ?? 0 })), edges }
}

/** Keeps the best-connected notes when there are too many to draw. */
export function limitNodes(g: Graph, max: number): Graph {
  if (g.nodes.length <= max) return g
  const keep = new Set([...g.nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id)).slice(0, max).map(n => n.id))
  return subgraph(g, keep)
}

function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fruchterman-Reingold layout inside a `size` x `size` square centred on the origin. Deterministic for a given graph. */
export function layout(g: Graph, size = 1000, iterations = 220, box?: { w: number; h: number }): Graph {
  const n = g.nodes.length
  if (!n) return g
  const random = rng(n * 7919 + g.edges.length)
  const pos = g.nodes.map(() => ({ x: (random() - 0.5) * size * 0.6, y: (random() - 0.5) * size * 0.6 }))
  const index = new Map(g.nodes.map((node, i) => [node.id, i]))
  const edges = g.edges.map(e => [index.get(e.a)!, index.get(e.b)!] as const)
  const k = Math.sqrt((size * size) / Math.max(1, n)) * 0.55
  let temp = size / 8
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  for (let it = 0; it < iterations; it++) {
    dx.fill(0)
    dy.fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let rx = pos[i].x - pos[j].x
        let ry = pos[i].y - pos[j].y
        let d2 = rx * rx + ry * ry
        if (d2 < 0.01) { rx = random() - 0.5; ry = random() - 0.5; d2 = rx * rx + ry * ry + 0.01 }
        const f = (k * k) / d2
        dx[i] += rx * f; dy[i] += ry * f
        dx[j] -= rx * f; dy[j] -= ry * f
      }
    }
    for (const [a, b] of edges) {
      const rx = pos[a].x - pos[b].x
      const ry = pos[a].y - pos[b].y
      const d = Math.sqrt(rx * rx + ry * ry) || 0.1
      const f = d / k
      dx[a] -= rx * f; dy[a] -= ry * f
      dx[b] += rx * f; dy[b] += ry * f
    }
    for (let i = 0; i < n; i++) {
      // A gentle pull to the middle stops unconnected notes drifting away.
      dx[i] -= pos[i].x * 0.02 * k * 0.05
      dy[i] -= pos[i].y * 0.02 * k * 0.05
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01
      const step = Math.min(d, temp)
      pos[i].x += (dx[i] / d) * step
      pos[i].y += (dy[i] / d) * step
    }
    temp *= 0.975
  }
  // Centre the result and scale it to fill the box, so a handful of notes isn't a speck in the corner.
  const xs = pos.map(p => p.x)
  const ys = pos.map(p => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const ex = Math.max(Math.max(...xs) - Math.min(...xs), 1)
  const ey = Math.max(Math.max(...ys) - Math.min(...ys), 1)
  const fitX = Math.min(((box?.w ?? size) * 0.9) / ex, 3)
  const fitY = Math.min(((box?.h ?? size) * 0.9) / ey, 3)
  // Without a box the scale is the same both ways; with one, the layout stretches to the shape of the window.
  const uniform = box ? null : Math.min(fitX, fitY)
  return { edges: g.edges, nodes: g.nodes.map((node, i) => ({ ...node, x: (pos[i].x - cx) * (uniform ?? fitX), y: (pos[i].y - cy) * (uniform ?? fitY) })) }
}

/** A stable colour index for a folder name. */
export function folderHue(folder: string): number {
  let h = 0
  for (const ch of folder) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
