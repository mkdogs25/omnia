<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { activeMistakes } from '../lib/mistakes'
  import ErrorLog from './ErrorLog.svelte'
  import Insights from './Insights.svelte'
  import StudyOverview from './StudyOverview.svelte'

  const open = $derived(activeMistakes(app.mistakes).length)
</script>

<section class="study parchment">
  <div class="inner">
    <div class="top">
      <h1 class="page-title">Study</h1>
      <div class="tabs-pill" role="tablist" aria-label="Study sections">
        <button role="tab" aria-selected={app.studyTab === 'overview'} class:on={app.studyTab === 'overview'} onclick={() => (app.studyTab = 'overview')}>Overview</button>
        <button role="tab" aria-selected={app.studyTab === 'errors'} class:on={app.studyTab === 'errors'} onclick={() => (app.studyTab = 'errors')}>Error log{#if open} <span class="count">{open}</span>{/if}</button>
        <button role="tab" aria-selected={app.studyTab === 'insights'} class:on={app.studyTab === 'insights'} onclick={() => (app.studyTab = 'insights')}>Insights</button>
      </div>
    </div>
    {#if app.studyTab === 'errors'}<ErrorLog />
    {:else if app.studyTab === 'insights'}<Insights />
    {:else}<StudyOverview />{/if}
  </div>
</section>

<style>
  .study { height: 100%; overflow: auto; }
  .parchment { background: var(--parchment); }
  .inner { max-width: 960px; margin: 0 auto; padding: 48px 40px 120px; display: grid; gap: 22px; align-content: start; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .top .page-title { margin: 0; }
  .count { font-size: var(--fs-xs); background: var(--accent); color: var(--on-accent); border-radius: 99px; padding: 0 7px; margin-left: 4px; }
</style>
