<script lang="ts">
  import { app } from '../../lib/app.svelte'
  import { addDays, diffDays, formatLong, relativeLabel, today } from '../../lib/dates'
  import { dueCards } from '../../lib/study'
  import { nextRevision, REVISION_STEPS_DAYS, type Rating } from '../../lib/sr'
  import Icon from '../Icon.svelte'

  let { path }: { path: string } = $props()

  const state = $derived(app.study.revisions[path])
  const now = $derived(today())
  const dueNow = $derived(!!state && state.due <= now)
  const cards = $derived(app.record(path)?.parsed.cards ?? [])
  const split = $derived(dueCards(cards, app.study.cards, Date.now()))
  const cardsDue = $derived(split.learning.length + split.review.length + split.fresh.length)
  const overall = $derived(app.dueSummary({ type: 'all' }))

  const options: { rating: Rating; label: string; hint: string }[] = [
    { rating: 'weak', label: 'Needs work', hint: 'Back to 1 day' },
    { rating: 'ok', label: 'Okay', hint: 'Same gap again' },
    { rating: 'strong', label: 'Confident', hint: 'Longer gap' }
  ]

  const preview = (r: Rating) => nextRevision(state, r, now, addDays).due

  function rate(r: Rating) {
    app.rateRevision(path, r)
    const label = relativeLabel(preview(r), now)
    app.toast(`Next revision: ${/\d/.test(label) ? label : label.toLowerCase()}`)
  }
</script>

<section class="card">
  <h3>Revise this note</h3>
  {#if !state}
    <p class="muted">Add this note to your revision schedule. Omnia will bring it back after 1, 3, 7, 14, 30, 60 and 120 days, longer or shorter depending on how well you remember it, and put it in your Tasks and Calendar.</p>
    <button class="btn primary" onclick={() => app.addRevision(path)}><Icon name="repeat" size={15} /> Start revising</button>
  {:else}
    <div class="status" class:due={dueNow}>
      <Icon name="clock" size={16} />
      {#if dueNow}<strong>Due for revision {state.due < now ? `(since ${formatLong(state.due)})` : 'today'}</strong>
      {:else}<span>Next revision <strong>{relativeLabel(state.due, now)}</strong>{#if diffDays(now, state.due) < 7} · {formatLong(state.due)}{/if}</span>{/if}
    </div>
    <div class="steps" aria-label="Interval step {state.step + 1} of {REVISION_STEPS_DAYS.length}">
      {#each REVISION_STEPS_DAYS as d, i}
        <span class="step" class:on={i <= state.step} title="{d} days"><span>{d}d</span></span>
      {/each}
    </div>
    <p class="muted small">After you re-read the note, rate how well you remembered it:</p>
    <div class="rate">
      {#each options as o}
        <button class="r {o.rating}" onclick={() => rate(o.rating)}>
          <strong>{o.label}</strong>
          <span>{o.hint}</span>
          <span class="when">{relativeLabel(preview(o.rating), now)}</span>
        </button>
      {/each}
    </div>
    <button class="link" onclick={() => app.removeRevision(path)}>Stop revising this note</button>
  {/if}
</section>

<section class="card">
  <h3>Flashcards</h3>
  <p class="line"><strong>{cardsDue}</strong> due in this note · <strong>{overall.learning + overall.review + overall.fresh}</strong> across all notes</p>
  <div class="row">
    <button class="btn primary grow" disabled={!cardsDue} onclick={() => (app.modal = { type: 'review', scope: { type: 'note', path } })}>Review this note</button>
    <button class="btn grow" disabled={!(overall.learning + overall.review + overall.fresh)} onclick={() => (app.modal = { type: 'review', scope: { type: 'all' } })}>Review all</button>
  </div>
  <button class="link" onclick={() => (app.view = 'study')}>Open the study dashboard</button>
</section>

{#if state?.history.length}
  <section>
    <h3>History</h3>
    <ul>
      {#each [...state.history].reverse().slice(0, 8) as h}
        <li><span class="dot {h.rating}"></span>{formatLong(h.date)}<span class="muted"> · {h.rating === 'weak' ? 'Needs work' : h.rating === 'ok' ? 'Okay' : 'Confident'}</span></li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  section { margin-bottom: 18px; }
  .card { background: var(--bg-hover); border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; }
  h3 { font-family: var(--font-body); font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); font-weight: 600; margin: 0; }
  p { margin: 0; line-height: 1.55; font-size: 13.5px; }
  .small { font-size: 12.5px; }
  .status { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .status.due { color: var(--accent-strong); }
  .steps { display: flex; gap: 4px; }
  .step { flex: 1; height: 24px; border-radius: 6px; background: var(--bg-active); display: grid; place-items: center; font-size: 10.5px; color: var(--text-muted); }
  .step.on { background: var(--accent); color: var(--on-accent); }
  .rate { display: grid; gap: 6px; }
  .r { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; text-align: left; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-strong); background: var(--bg); }
  .r:hover { background: var(--bg-raised); }
  .r span { font-size: 12px; color: var(--text-muted); }
  .r .when { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-weight: 600; color: var(--text); font-size: 12.5px; }
  .r.weak { border-left: 4px solid var(--bad); }
  .r.ok { border-left: 4px solid var(--warn); }
  .r.strong { border-left: 4px solid var(--good); }
  .link { font-size: 12.5px; color: var(--link); justify-self: start; }
  ul { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 4px; font-size: 13px; }
  li { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.weak { background: var(--bad); } .dot.ok { background: var(--warn); } .dot.strong { background: var(--good); }
</style>
