<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, formatShort, relativeLabel, startOfWeek, today, WEEKDAYS, fromISO } from '../lib/dates'
  import { dueCards, forecast, matureCount, retention, streak, type Scope } from '../lib/study'
  import { dirname, noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'

  let filter = $state('')
  let tag = $state('')

  const now = $derived(today())
  const cards = $derived(app.allCards())
  const summary = $derived(app.dueSummary({ type: 'all' }))
  const dueTotal = $derived(summary.learning + summary.review + summary.fresh)
  const fc = $derived(forecast(cards, app.study.cards, now, 14))
  const maxFc = $derived(Math.max(1, ...fc))
  const maturity = $derived(matureCount(cards, app.study.cards))
  const ret = $derived(retention(app.study.log, now))
  const run = $derived(streak(app.study.log, now))
  const revisionRows = $derived(
    Object.entries(app.study.revisions).map(([path, r]) => ({ path, ...r })).sort((a, b) => a.due.localeCompare(b.due))
  )
  const dueRevisions = $derived(revisionRows.filter(r => r.due <= now).length)

  const rows = $derived.by(() => {
    app.indexVersion
    const q = filter.trim().toLowerCase()
    const out: { path: string; total: number; due: number; fresh: number }[] = []
    for (const rec of app.index.notes.values()) {
      if (!rec.parsed.cards.length) continue
      if (q && !rec.path.toLowerCase().includes(q)) continue
      if (tag && !rec.parsed.tags.includes(tag)) continue
      const split = dueCards(rec.parsed.cards, app.study.cards, Date.now())
      out.push({ path: rec.path, total: rec.parsed.cards.length, due: split.learning.length + split.review.length, fresh: split.fresh.length })
    }
    return out.sort((a, b) => b.due - a.due || b.fresh - a.fresh || a.path.localeCompare(b.path))
  })
  const tagsWithCards = $derived.by(() => {
    app.indexVersion
    return app.index.tags().filter(([, paths]) => paths.some(p => app.index.notes.get(p)?.parsed.cards.length)).map(([t]) => t)
  })

  // Activity heatmap: last 16 weeks, Monday-first columns.
  const weeksShown = 16
  const gridStart = $derived(addDays(startOfWeek(now), -(weeksShown - 1) * 7))
  const cellsOf = $derived(Array.from({ length: weeksShown * 7 }, (_, i) => addDays(gridStart, i)))
  const maxDay = $derived(Math.max(1, ...Object.values(app.study.log).map(l => l.reviews)))
  const level = (d: string) => {
    const n = app.study.log[d]?.reviews ?? 0
    return n === 0 ? 0 : Math.min(4, Math.ceil((n / maxDay) * 4))
  }

  const mTotal = $derived(Math.max(1, cards.length))
  const scopeOf = (path: string): Scope => ({ type: 'note', path })

  function startReview(scope: Scope) {
    app.modal = { type: 'review', scope }
  }
  function openRevision(path: string) {
    app.openNote(path)
    app.rightOpen = true
    app.rightTab = 'revise'
  }
</script>

<section class="study parchment">
  <div class="inner">
    <h1>Study</h1>

    <div class="hero">
      <div>
        <div class="hero-num">{dueTotal}</div>
        <div class="muted">flashcard{dueTotal === 1 ? '' : 's'} ready now
          <span class="faint">({summary.review + summary.learning} due, {summary.fresh} new)</span></div>
      </div>
      <div class="hero-actions">
        <button class="btn primary big" disabled={!dueTotal} onclick={() => startReview({ type: 'all' })}><Icon name="play" size={16} /> Start review</button>
        <button class="btn big" disabled={!cards.length} onclick={() => (app.modal = { type: 'quiz', scope: { type: 'all' } })}><Icon name="zap" size={16} /> Quiz me</button>
      </div>
    </div>

    <div class="tiles">
      <div class="tile"><span class="v">{dueRevisions}</span><span class="l">notes to revise</span></div>
      <div class="tile"><span class="v">{cards.length}</span><span class="l">cards in total</span></div>
      <div class="tile"><span class="v"><Icon name="flame" size={20} /> {run}</span><span class="l">day streak</span></div>
      <div class="tile"><span class="v">{ret === null ? '–' : Math.round(ret * 100) + '%'}</span><span class="l">recalled, last 30 days</span></div>
    </div>

    <div class="two">
      <div class="panel">
        <h2>Next 14 days</h2>
        <div class="forecast" role="img" aria-label="Flashcards due per day for the next 14 days">
          {#each fc as n, i}
            <div class="col" title="{relativeLabel(addDays(now, i), now)}: {n} due">
              <span class="num">{n || ''}</span>
              <span class="bar" style:height="{(n / maxFc) * 100}%" class:today={i === 0}></span>
              <span class="lab">{i === 0 ? 'Now' : WEEKDAYS[fromISO(addDays(now, i)).getDay()].slice(0, 2)}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="panel">
        <h2>Your cards</h2>
        <div class="stack" role="img" aria-label="Card maturity">
          <span class="seg s0" style:flex={maturity.fresh} title="New"></span>
          <span class="seg s1" style:flex={maturity.learning} title="Learning"></span>
          <span class="seg s2" style:flex={maturity.young} title="Young"></span>
          <span class="seg s3" style:flex={maturity.mature} title="Mature"></span>
          {#if !cards.length}<span class="seg" style:flex="1"></span>{/if}
        </div>
        <ul class="legend">
          <li><span class="sw s0"></span>New <strong>{maturity.fresh}</strong></li>
          <li><span class="sw s1"></span>Learning <strong>{maturity.learning}</strong></li>
          <li><span class="sw s2"></span>Young <strong>{maturity.young}</strong></li>
          <li><span class="sw s3"></span>Mature <strong>{maturity.mature}</strong></li>
        </ul>
        <p class="faint small">Mature means the next review is 21 days or more away. Total {mTotal === 1 && !cards.length ? 0 : mTotal}.</p>
      </div>
    </div>

    <div class="panel">
      <h2>Activity</h2>
      <div class="heat" role="img" aria-label="Reviews per day over the last {weeksShown} weeks">
        {#each cellsOf as d (d)}
          <span class="cellh l{d > now ? 'x' : level(d)}" title="{d}: {app.study.log[d]?.reviews ?? 0} reviews"></span>
        {/each}
      </div>
    </div>

    <div class="panel">
      <div class="head">
        <h2>Revision schedule</h2>
      </div>
      {#each revisionRows as r (r.path)}
        <div class="rowx">
          <Icon name="repeat" size={16} />
          <button class="name grow truncate" onclick={() => openRevision(r.path)}>{noteTitle(r.path)}</button>
          <span class="muted small" class:late={r.due <= now}>{r.due <= now ? 'Due now' : relativeLabel(r.due, now)}</span>
          <span class="pill">step {r.step + 1}/7</span>
        </div>
      {:else}
        <p class="muted">No notes on a revision schedule yet. Open a note, then choose <em>Revise</em> in the study sidebar.</p>
      {/each}
    </div>

    <div class="panel">
      <div class="head">
        <h2>Decks</h2>
        <input class="field search" placeholder="Filter notes…" bind:value={filter} />
      </div>
      {#if tagsWithCards.length}
        <div class="tagrow">
          <button class="pill" class:accent={!tag} onclick={() => (tag = '')}>All</button>
          {#each tagsWithCards as t}<button class="pill" class:accent={tag === t} onclick={() => (tag = tag === t ? '' : t)}>#{t}</button>{/each}
        </div>
      {/if}
      {#each rows as r (r.path)}
        <div class="rowx">
          <Icon name="layers" size={16} />
          <button class="name grow truncate" onclick={() => app.openNote(r.path)}>{noteTitle(r.path)} <span class="faint dir">{dirname(r.path)}</span></button>
          <span class="cnt" class:hot={r.due > 0} title="Due">{r.due} due</span>
          <span class="cnt" title="New">{r.fresh} new</span>
          <span class="cnt muted" title="Total">{r.total}</span>
          <button class="btn" disabled={!r.due && !r.fresh} onclick={() => startReview(scopeOf(r.path))}>Review</button>
          <button class="icon-btn" title="Quiz" onclick={() => (app.modal = { type: 'quiz', scope: scopeOf(r.path) })}><Icon name="zap" size={16} /></button>
        </div>
      {:else}
        <p class="muted">No flashcards found. In any note, write <code>Question :: Answer</code> or use <code>{'{{c1::cloze}}'}</code> deletions.</p>
      {/each}
    </div>

    {#if app.study.quizzes.length}
      <div class="panel">
        <h2>Recent quizzes</h2>
        {#each [...app.study.quizzes].reverse().slice(0, 6) as r}
          <div class="rowx"><Icon name="zap" size={16} /><span class="grow truncate">{r.path ? noteTitle(r.path) : 'All notes'}</span><span class="muted small">{formatShort(r.date)}</span><strong>{r.correct}/{r.total}</strong></div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .study { height: 100%; overflow: auto; }
  .parchment { background: var(--parchment); }
  .inner { max-width: 980px; margin: 0 auto; padding: 44px 40px 120px; display: grid; gap: 22px; }
  h1 { font-size: 46px; font-weight: 400; }
  h2 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  .hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding: 26px 30px; border-radius: 18px; background: var(--bg-raised); border: 1px solid var(--border); box-shadow: 0 2px 14px rgba(90, 60, 20, 0.08); }
  .hero-num { font-family: var(--font-heading); font-size: 64px; line-height: 1; font-weight: 700; color: var(--accent-strong); }
  .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
  .tile { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; display: grid; gap: 2px; }
  .tile .v { font-family: var(--font-heading); font-size: 32px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
  .tile .v :global(svg) { color: var(--accent); }
  .tile .l { font-size: 13px; color: var(--text-muted); }
  .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px; }
  @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
  .panel { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 16px; padding: 20px 22px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .head h2 { margin: 0; }
  .search { width: 220px; }
  .forecast { display: flex; align-items: flex-end; gap: 6px; height: 150px; }
  .col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
  .col .bar { width: 100%; max-width: 28px; min-height: 2px; background: color-mix(in srgb, var(--accent) 65%, var(--bg-raised)); border-radius: 5px 5px 0 0; }
  .col .bar.today { background: var(--accent-strong); }
  .col .num { font-size: 11px; color: var(--text-muted); min-height: 14px; }
  .col .lab { font-size: 11px; color: var(--text-faint); }
  .stack { display: flex; height: 22px; border-radius: 11px; overflow: hidden; background: var(--bg-active); gap: 2px; }
  .seg { min-width: 0; }
  .s0 { background: #3f7ca8; } .s1 { background: var(--warn); } .s2 { background: #86a85f; } .s3 { background: var(--good); }
  .legend { list-style: none; padding: 0; margin: 14px 0 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; font-size: 14px; }
  .legend li { display: flex; align-items: center; gap: 8px; }
  .legend strong { margin-left: auto; }
  .sw { width: 10px; height: 10px; border-radius: 3px; }
  .small { font-size: 12.5px; }
  .heat { display: grid; grid-template-rows: repeat(7, 16px); grid-auto-flow: column; grid-auto-columns: minmax(14px, 1fr); gap: 4px; overflow-x: auto; padding-bottom: 4px; }
  .cellh { border-radius: 3px; background: var(--bg-active); }
  .cellh.l1 { background: color-mix(in srgb, var(--accent) 30%, var(--bg-raised)); }
  .cellh.l2 { background: color-mix(in srgb, var(--accent) 52%, var(--bg-raised)); }
  .cellh.l3 { background: color-mix(in srgb, var(--accent) 76%, var(--bg-raised)); }
  .cellh.l4 { background: var(--accent-strong); }
  .cellh.lx { background: transparent; }
  .tagrow { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .tagrow .pill { cursor: pointer; }
  .rowx { display: flex; align-items: center; gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); min-height: 46px; }
  .rowx:first-of-type { border-top: 0; }
  .rowx > :global(svg) { color: var(--text-muted); flex: none; }
  .name { text-align: left; font-size: 15.5px; }
  .name:hover { color: var(--link); }
  .dir { font-size: 12px; margin-left: 6px; }
  .cnt { font-size: 13px; min-width: 52px; text-align: right; color: var(--text-muted); }
  .cnt.hot { color: var(--accent-strong); font-weight: 700; }
  .late { color: var(--accent-strong); font-weight: 600; }
  p { margin: 6px 0; line-height: 1.6; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
</style>
