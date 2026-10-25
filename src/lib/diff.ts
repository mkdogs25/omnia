// A line-by-line diff for the version history: common lines are trimmed from both ends, then a longest-common-subsequence
// table finds the rest. Fine for notes; very large changes fall back to "everything replaced".

export interface DiffLine { type: 'same' | 'add' | 'del'; text: string }

const MAX_CELLS = 4_000_000

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const head: DiffLine[] = a.slice(0, start).map(text => ({ type: 'same', text }))
  const tail: DiffLine[] = a.slice(endA).map(text => ({ type: 'same', text }))
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (!midA.length && !midB.length) return [...head, ...tail]

  if (midA.length * midB.length > MAX_CELLS) {
    return [...head, ...midA.map(text => ({ type: 'del' as const, text })), ...midB.map(text => ({ type: 'add' as const, text })), ...tail]
  }

  const n = midA.length
  const m = midB.length
  // lcs[i][j] = length of the LCS of midA[i..] and midB[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const mid: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { mid.push({ type: 'same', text: midA[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ type: 'del', text: midA[i++] })
    else mid.push({ type: 'add', text: midB[j++] })
  }
  while (i < n) mid.push({ type: 'del', text: midA[i++] })
  while (j < m) mid.push({ type: 'add', text: midB[j++] })
  return [...head, ...mid, ...tail]
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
  }
  return { added, removed }
}

/** Collapses long runs of unchanged lines, keeping `context` lines around every change. */
export function withContext(lines: DiffLine[], context = 2): (DiffLine | { type: 'gap'; count: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out: (DiffLine | { type: 'gap'; count: number })[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) { out.push({ type: 'gap', count: skipped }); skipped = 0 }
      out.push(l)
    } else skipped++
  })
  if (skipped) out.push({ type: 'gap', count: skipped })
  return out
}
