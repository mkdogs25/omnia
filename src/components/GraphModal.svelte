<script lang="ts">
  import { untrack } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { buildGraph, folderHue, layout, limitNodes, neighbourhood, subgraph, type GNode } from '../lib/graph'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'
  import Modal from './Modal.svelte'

  const SIZE = 1000
  let sw = $state(960)
  let sh = $state(560)
  const focusPath = app.activePath && app.index.notes.has(app.activePath) ? app.activePath : null

  let scope = $state<'all' | 'local'>(focusPath ? 'local' : 'all')
  let depth = $state(2)
  let hideLone = $state(true)
  let query = $state('')
  let hover = $state<string | null>(null)
  let view = $state({ x: 0, y: 0, k: 1 })
  let drag: { x: number; y: number; vx: number; vy: number } | null = null
  let svg: SVGSVGElement | undefined = $state()
  let moved = false

  const full = $derived.by(() => {
    app.indexVersion
    const paths = [...app.index.notes.keys()]
    return buildGraph({
      paths,
      linksOf: p => {
        const rec = app.index.notes.get(p)
        if (!rec) return []
        const out: string[] = []
        for (const l of rec.parsed.links) {
          if (l.embed) continue
          const t = app.index.resolve(l.target, p)
          if (t) out.push(t)
        }
        return out
      }
    })
  })

  const shown = $derived.by(() => {
    let g = full
    if (scope === 'local' && focusPath) g = neighbourhood(g, focusPath, depth)
    else if (hideLone) g = subgraph(g, new Set(g.nodes.filter(n => n.degree > 0).map(n => n.id)))
    return layout(limitNodes(g, 350), SIZE, 220, { w: sw - 60, h: sh - 60 })
  })
  const byId = $derived(new Map(shown.nodes.map(n => [n.id, n])))
  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase()
    return q ? new Set(shown.nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id)) : null
  })
  const linked = $derived.by(() => {
    if (!hover) return null
    const s = new Set<string>([hover])
    for (const e of shown.edges) { if (e.a === hover) s.add(e.b); if (e.b === hover) s.add(e.a) }
    return s
  })
  const radius = (n: GNode) => 5 + Math.min(9, Math.sqrt(n.degree) * 2.6)
  const dark = $derived(document.documentElement.dataset.theme === 'dark')
  const fill = (n: GNode) => (n.id === focusPath ? 'var(--accent-strong)' : n.folder ? `hsl(${folderHue(n.folder)} ${dark ? 45 : 42}% ${dark ? 62 : 48}%)` : 'var(--text-muted)')
  const showLabel = (n: GNode) => n.id === focusPath || n.id === hover || !!linked?.has(n.id) && !!hover || (!!matches && matches.has(n.id)) || n.degree >= 3 || shown.nodes.length <= 40

  const folders = $derived([...new Set(shown.nodes.map(n => n.folder))].filter(Boolean).slice(0, 8))

  function toWorld(e: { clientX: number; clientY: number }) {
    const r = svg!.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2, scale: 1 }
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault()
    const w = toWorld(e)
    const k = Math.min(6, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    // Keep the point under the cursor fixed while zooming.
    view = { k, x: w.x / k - w.x / view.k + view.x, y: w.y / k - w.y / view.k + view.y }
  }
  function ondown(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    moved = false
  }
  function onmove(e: PointerEvent) {
    if (!drag) return
    const { scale } = toWorld(e)
    if (!moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) {
      moved = true
      // Capture only once it really is a drag, so a plain click still reaches the note under the pointer.
      svg?.setPointerCapture(e.pointerId)
    }
    if (!moved) return
    view = { ...view, x: drag.vx + (e.clientX - drag.x) / (scale * view.k), y: drag.vy + (e.clientY - drag.y) / (scale * view.k) }
  }
  const onup = () => { drag = null }

  function open(n: GNode) {
    if (moved) return
    app.modal = null
    app.openNote(n.id)
  }

  function reset() { view = { x: 0, y: 0, k: 1 } }

  $effect(() => {
    shown
    untrack(reset)
  })
</script>

<Modal onclose={() => (app.modal = null)} width={1040} label="Knowledge graph">
  <div class="graph">
    <header>
      <h2 class="page-title">Graph</h2>
      <div class="tabs-pill" role="tablist">
        <button role="tab" aria-selected={scope === 'local'} class:on={scope === 'local'} disabled={!focusPath} title={focusPath ? '' : 'Open a note first'} onclick={() => (scope = 'local')}>This note{focusPath ? `: ${noteTitle(focusPath)}` : ''}</button>
        <button role="tab" aria-selected={scope === 'all'} class:on={scope === 'all'} onclick={() => (scope = 'all')}>Everything</button>
      </div>
      {#if scope === 'local'}
        <label class="ctl">Depth <input type="range" min="1" max="4" bind:value={depth} aria-label="Link depth" /> <strong>{depth}</strong></label>
      {:else}
        <label class="ctl"><input type="checkbox" class="checkbox" bind:checked={hideLone} /> Hide unlinked notes</label>
      {/if}
      <span class="grow"></span>
      <input class="field find" placeholder="Find a note…" bind:value={query} aria-label="Find a note in the graph" />
      <button class="icon-btn" title="Reset view" aria-label="Reset view" onclick={reset}><Icon name="maximize" size={16} /></button>
    </header>

    <div class="stage" bind:clientWidth={sw} bind:clientHeight={sh}>
      {#if !shown.nodes.length}
        <div class="empty"><Icon name="graph" size={26} /><p>No linked notes yet. Link notes with <code>[[double brackets]]</code> and they will appear here.</p></div>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <svg bind:this={svg} role="img" aria-label="Graph of {shown.nodes.length} notes and {shown.edges.length} links" viewBox="{-sw / 2} {-sh / 2} {sw} {sh}"
          {onwheel} onpointerdown={ondown} onpointermove={onmove} onpointerup={onup} onpointercancel={onup}>
          <g transform="translate({view.x * view.k} {view.y * view.k}) scale({view.k})" style="--k: {view.k}">
            {#each shown.edges as e}
              {@const a = byId.get(e.a)!}
              {@const b = byId.get(e.b)!}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="edge" class:dim={linked && !(linked.has(e.a) && linked.has(e.b) && (e.a === hover || e.b === hover))} class:hot={hover && (e.a === hover || e.b === hover)} />
            {/each}
            {#each shown.nodes as n (n.id)}
              <g class="node" class:dim={(linked && !linked.has(n.id)) || (matches && !matches.has(n.id))} transform="translate({n.x} {n.y})"
                role="link" tabindex="0" aria-label={n.label}
                onpointerenter={() => (hover = n.id)} onpointerleave={() => (hover = null)} onfocus={() => (hover = n.id)} onblur={() => (hover = null)}
                onclick={() => open(n)} onkeydown={e => e.key === 'Enter' && open(n)}>
                <circle r={radius(n) / Math.sqrt(view.k)} fill={fill(n)} class:ring={matches?.has(n.id)} />
                {#if showLabel(n)}<text y={-(radius(n) + 5) / Math.sqrt(view.k)} text-anchor="middle" style="font-size: {12.5 / view.k}px">{n.label}</text>{/if}
              </g>
            {/each}
          </g>
        </svg>
      {/if}
    </div>

    <footer>
      <span class="muted">{shown.nodes.length} notes · {shown.edges.length} links{full.nodes.length > shown.nodes.length && scope === 'all' ? ` (of ${full.nodes.length} notes)` : ''} · scroll to zoom, drag to move, click a note to open it</span>
      <span class="grow"></span>
      {#each folders as f}<span class="key"><i style:background="hsl({folderHue(f)} {dark ? 45 : 42}% {dark ? 62 : 48}%)"></i>{f}</span>{/each}
    </footer>
  </div>
</Modal>

<style>
  .graph { display: grid; gap: 12px; padding: 20px 22px 14px; }
  header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  header .page-title { margin: 0; }
  .ctl { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--text-muted); }
  .ctl input[type='range'] { width: 90px; accent-color: var(--accent); }
  .find { width: 180px; padding: 5px 10px; }
  .stage { height: min(62vh, 580px); border: 1px solid var(--border); border-radius: 14px; background: var(--bg); overflow: hidden; touch-action: none; }
  svg { width: 100%; height: 100%; cursor: grab; display: block; }
  svg:active { cursor: grabbing; }
  .edge { stroke: var(--border-strong); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
  .edge.hot { stroke: var(--accent); stroke-width: 2; }
  .edge.dim { opacity: 0.15; }
  .node { cursor: pointer; outline: none; }
  .node.dim { opacity: 0.18; }
  .node circle { stroke: var(--bg); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .node circle.ring { stroke: var(--accent-strong); stroke-width: 3; }
  .node:focus-visible circle { stroke: var(--accent-strong); stroke-width: 3; }
  .node text { fill: var(--text); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; font-family: var(--font-body); }
  .empty { height: 100%; display: grid; place-content: center; justify-items: center; gap: 6px; color: var(--text-faint); text-align: center; padding: 20px; }
  .empty p { margin: 0; max-width: 44ch; line-height: 1.5; }
  footer { display: flex; align-items: center; gap: 12px; font-size: var(--fs-sm); flex-wrap: wrap; }
  .key { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); }
  .key i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
</style>
