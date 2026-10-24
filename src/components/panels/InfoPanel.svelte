<script lang="ts">
  import { app } from '../../lib/app.svelte'
  import { dirname, noteTitle } from '../../lib/vault'
  import Icon from '../Icon.svelte'

  let { path }: { path: string } = $props()

  const rec = $derived(app.record(path))
  const backlinks = $derived(app.backlinks(path))
  const outgoing = $derived.by(() => {
    app.indexVersion
    const seen = new Set<string>()
    const out: { target: string; path: string | null }[] = []
    for (const l of rec?.parsed.links ?? []) {
      if (l.embed && /\.(png|jpe?g|gif|webp|svg)$/i.test(l.target)) continue
      if (seen.has(l.target.toLowerCase())) continue
      seen.add(l.target.toLowerCase())
      out.push({ target: l.target, path: app.index.resolve(l.target, path) })
    }
    return out
  })
  const mentions = $derived.by(() => {
    app.indexVersion
    return app.index.unlinkedMentions(path, 8)
  })

  function goto(line: number) {
    app.editor?.scrollToLine(line)
    app.editor?.focus()
  }
</script>

<section>
  <h3>Outline</h3>
  {#each rec?.parsed.headings ?? [] as h}
    <button class="item" style:padding-left="{(h.level - 1) * 12 + 8}px" onclick={() => goto(h.line)}>{h.text}</button>
  {:else}<p class="faint">No headings.</p>{/each}
</section>

<section>
  <h3>Backlinks <span class="n">{backlinks.length}</span></h3>
  {#each backlinks as b}
    <button class="card" onclick={() => { app.openNote(b.from); app.pendingLine = { path: b.from, line: b.line } }}>
      <span class="t">{noteTitle(b.from)}</span>
      <span class="ctx muted">{b.context}</span>
    </button>
  {:else}<p class="faint">Nothing links here yet.</p>{/each}
</section>

<section>
  <h3>Links in this note <span class="n">{outgoing.length}</span></h3>
  {#each outgoing as o}
    {#if o.path}
      <button class="item" onclick={() => app.openNote(o.path!)}><Icon name="link" size={13} /> {noteTitle(o.path)}<span class="faint dir">{dirname(o.path)}</span></button>
    {:else}
      <button class="item missing" title="Click to create" onclick={() => app.openLink(o.target, path)}><Icon name="plus" size={13} /> {o.target}<span class="faint dir">not created</span></button>
    {/if}
  {:else}<p class="faint">No outgoing links.</p>{/each}
</section>

{#if rec?.parsed.tags.length}
  <section>
    <h3>Tags</h3>
    <div class="tags">
      {#each rec.parsed.tags as t}
        <button class="pill accent" onclick={() => { app.sidebarTab = 'search'; app.leftOpen = true; app.searchQuery = `tag:#${t}` }}>#{t}</button>
      {/each}
    </div>
  </section>
{/if}

{#if mentions.length}
  <section>
    <h3>Unlinked mentions <span class="n">{mentions.length}</span></h3>
    {#each mentions as m}<button class="item" onclick={() => app.openNote(m)}>{noteTitle(m)}</button>{/each}
  </section>
{/if}

<style>
  section { margin-bottom: 20px; }
  h3 { font-family: var(--font-body); font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); font-weight: 600; margin: 0 0 6px; display: flex; gap: 6px; align-items: center; }
  .n { background: var(--bg-active); border-radius: 99px; padding: 0 7px; font-size: 11px; letter-spacing: 0; }
  .item { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; padding: 4px 8px; border-radius: 6px; font-size: 14px; }
  .item:hover { background: var(--bg-hover); }
  .item.missing { color: var(--text-muted); }
  .dir { margin-left: auto; font-size: 11.5px; }
  .card { display: grid; gap: 2px; width: 100%; text-align: left; padding: 8px 10px; border-radius: 9px; margin-bottom: 4px; background: var(--bg-hover); }
  .card:hover { background: var(--bg-active); }
  .t { font-weight: 600; font-size: 14px; }
  .ctx { font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tags .pill { cursor: pointer; }
  p { margin: 4px 8px; font-size: 13px; }
</style>
