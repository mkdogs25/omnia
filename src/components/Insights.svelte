<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { addDays, formatShort, startOfWeek, today } from '../lib/dates'
  import { accuracy, change, noteAccuracy, weekSummary, weeklyTrend } from '../lib/insights'
  import { byNote } from '../lib/mistakes'
  import { noteTitle } from '../lib/vault'
  import Icon from './Icon.svelte'

  const now = $derived(today())
  const thisWeek = $derived(weekSummary(app.study, app.mistakes, startOfWeek(now)))
  const lastWeek = $derived(weekSummary(app.study, app.mistakes, addDays(startOfWeek(now), -7)))
  const acc = $derived(accuracy(thisWeek))
  const accBefore = $derived(accuracy(lastWeek))
  const delta = $derived(change(acc, accBefore))
  const trend = $derived(weeklyTrend(app.study, now, 8))
  const notes = $derived(noteAccuracy(app.study, 5))
  const openByNote = $derived(new Map(byNote(app.mistakes).map(n => [n.path, n.active])))
  const focusDays = $derived(Array.from({ length: 14 }, (_, i) => ({ d: addDays(now, i - 13), m: app.study.focus[addDays(now, i - 13)] ?? 0 })))
  const maxFocus = $derived(Math.max(30, ...focusDays.map(f => f.m)))
  const hasAnything = $derived(thisWeek.reviews + thisWeek.quizTotal + lastWeek.reviews + lastWeek.quizTotal + thisWeek.focus > 0 || notes.length > 0)

  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)
  const diff = (a: number, b: number) => (a === b ? '' : a > b ? `+${a - b}` : `${a - b}`)

  const sentence = $derived.by(() => {
    if (!hasAnything) return ''
    const parts: string[] = []
    if (thisWeek.reviews || thisWeek.quizTotal) parts.push(`You answered ${thisWeek.reviews + thisWeek.quizTotal} questions on ${thisWeek.activeDays} day${thisWeek.activeDays === 1 ? '' : 's'}`)
    if (delta !== null && Math.abs(delta) >= 2) parts.push(`accuracy is ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points on last week`)
    if (thisWeek.resolved) parts.push(`${thisWeek.resolved} earlier mistake${thisWeek.resolved === 1 ? ' is' : 's are'} now resolved`)
    return parts.length ? parts.join(', ') + '.' : 'Nothing studied yet this week.'
  })

  const weakest = $derived(notes.filter(n => n.accuracy < 0.75).slice(0, 5))
  const barH = (a: number | null) => (a === null ? 0 : Math.max(4, a * 100))
</script>

<div class="insights">
  {#if !hasAnything}
    <div class="panel empty">
      <Icon name="graph" size={26} />
      <p><strong>Nothing to show yet.</strong></p>
      <p class="muted">Review some flashcards or take a quiz and this page will fill in with weekly summaries, trends and your weakest notes.</p>
    </div>
  {:else}
    <div class="panel summary">
      <h2 class="section-title">This week</h2>
      {#if sentence}<p class="lead">{sentence}</p>{/if}
      <div class="grid">
        <div class="stat"><span class="v">{thisWeek.reviews + thisWeek.quizTotal}</span><span class="l">answered</span><span class="d" class:up={thisWeek.reviews + thisWeek.quizTotal > lastWeek.reviews + lastWeek.quizTotal}>{diff(thisWeek.reviews + thisWeek.quizTotal, lastWeek.reviews + lastWeek.quizTotal)} vs last</span></div>
        <div class="stat"><span class="v">{pct(acc)}</span><span class="l">accuracy</span><span class="d" class:up={(delta ?? 0) > 0} class:down={(delta ?? 0) < 0}>{delta === null ? '' : `${delta > 0 ? '+' : ''}${delta} pts`}</span></div>
        <div class="stat"><span class="v">{thisWeek.focus}</span><span class="l">focus minutes</span><span class="d">{diff(thisWeek.focus, lastWeek.focus)} vs last</span></div>
        <div class="stat"><span class="v">{thisWeek.quizzes}</span><span class="l">quizzes</span><span class="d">{thisWeek.quizTotal ? `${Math.round((thisWeek.quizCorrect / thisWeek.quizTotal) * 100)}% avg` : ''}</span></div>
        <div class="stat"><span class="v">{thisWeek.newMistakes}</span><span class="l">new mistakes</span><span class="d">{lastWeek.newMistakes ? `${lastWeek.newMistakes} last week` : ''}</span></div>
        <div class="stat"><span class="v">{thisWeek.newCards}</span><span class="l">new cards learnt</span><span class="d"></span></div>
      </div>
    </div>

    <div class="two">
      <div class="panel">
        <h2 class="section-title">Accuracy by week</h2>
        <div class="trend" role="img" aria-label="Accuracy for each of the last 8 weeks">
          {#each trend as p, i}
            <div class="col" title="Week of {formatShort(p.start)}: {pct(p.accuracy)} of {p.reviews}">
              <span class="num">{p.accuracy === null ? '' : Math.round(p.accuracy * 100)}</span>
              <span class="bar" class:now={i === trend.length - 1} style:height="{barH(p.accuracy)}%"></span>
              <span class="lab">{formatShort(p.start)}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="panel">
        <h2 class="section-title">Focus, last 14 days</h2>
        <div class="trend" role="img" aria-label="Focus minutes per day">
          {#each focusDays as f, i}
            <div class="col" title="{formatShort(f.d)}: {f.m} min">
              <span class="num">{f.m || ''}</span>
              <span class="bar" class:now={i === focusDays.length - 1} style:height="{(f.m / maxFocus) * 100}%"></span>
              <span class="lab">{i % 2 === 1 ? '' : f.d.slice(8)}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="panel">
      <h2 class="section-title">Accuracy by note</h2>
      {#each notes as n (n.path)}
        <div class="rowx">
          <button class="name grow truncate" onclick={() => app.openNote(n.path)}>{noteTitle(n.path)}</button>
          <div class="meter" role="img" aria-label="{Math.round(n.accuracy * 100)}%"><span style:width="{n.accuracy * 100}%" class:low={n.accuracy < 0.6} class:mid={n.accuracy >= 0.6 && n.accuracy < 0.8}></span></div>
          <strong class="pc">{Math.round(n.accuracy * 100)}%</strong>
          <span class="muted small cnt">{n.answered} answered</span>
          {#if openByNote.get(n.path)}<button class="pill link" onclick={() => (app.studyTab = 'errors')} title="Open the error log">{openByNote.get(n.path)} open</button>{:else}<span class="cnt"></span>{/if}
        </div>
      {:else}
        <p class="muted">Needs at least 5 answers per note. Keep reviewing and notes will appear here, weakest first.</p>
      {/each}
      {#if weakest.length}
        <p class="tip"><Icon name="flag" size={14} /> Worth another look: {weakest.map(w => noteTitle(w.path)).join(', ')}.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .insights { display: grid; gap: 22px; }
  .panel { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 16px; padding: 20px 22px; }
  .panel .section-title { margin-bottom: 10px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
  .lead { margin: 0 0 14px; font-size: var(--fs-lg); line-height: 1.5; color: var(--text-muted); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  .stat { display: grid; gap: 1px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  .stat .v { font-family: var(--font-heading); font-size: 28px; font-weight: 700; line-height: 1.1; }
  .stat .l { font-size: var(--fs-sm); color: var(--text-muted); }
  .stat .d { font-size: var(--fs-xs); color: var(--text-faint); min-height: 1.2em; }
  .stat .d.up { color: var(--good); }
  .stat .d.down { color: var(--accent-strong); }
  .trend { display: flex; align-items: flex-end; gap: 6px; height: 150px; }
  .col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; min-width: 0; }
  .col .bar { width: 100%; max-width: 30px; min-height: 2px; background: color-mix(in srgb, var(--accent) 55%, var(--bg-raised)); border-radius: 5px 5px 0 0; }
  .col .bar.now { background: var(--accent-strong); }
  .col .num { font-size: var(--fs-xs); color: var(--text-muted); min-height: 14px; }
  .col .lab { font-size: var(--fs-xs); color: var(--text-faint); white-space: nowrap; min-height: 14px; }
  .rowx { display: flex; align-items: center; gap: 14px; padding: 8px 0; border-top: 1px solid var(--border); min-height: 44px; }
  .rowx:first-of-type { border-top: 0; }
  .name { text-align: left; font-size: var(--fs-md); }
  .name:hover { color: var(--link); }
  .meter { width: 120px; height: 8px; background: var(--bg-active); border-radius: 99px; overflow: hidden; flex: none; }
  .meter span { display: block; height: 100%; background: var(--good); border-radius: 99px; }
  .meter span.mid { background: var(--warn); }
  .meter span.low { background: var(--accent-strong); }
  .pc { min-width: 44px; text-align: right; }
  .cnt { min-width: 84px; text-align: right; }
  .small { font-size: var(--fs-xs); }
  .pill.link { cursor: pointer; color: var(--accent-strong); }
  .tip { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; padding: 10px 12px; background: var(--accent-soft); border-radius: 10px; font-size: var(--fs-sm); }
  .empty { display: grid; justify-items: center; gap: 4px; padding: 44px 20px; text-align: center; color: var(--text-muted); }
  .empty p { margin: 0; max-width: 52ch; line-height: 1.55; }
  p { margin: 6px 0; line-height: 1.6; }
</style>
