<script lang="ts">
  import { app, type RightTab } from '../lib/app.svelte'
  import { noteTitle } from '../lib/vault'
  import CardsPanel from './panels/CardsPanel.svelte'
  import InfoPanel from './panels/InfoPanel.svelte'
  import QuizPanel from './panels/QuizPanel.svelte'
  import RevisePanel from './panels/RevisePanel.svelte'
  import Icon from './Icon.svelte'

  const tabs: { id: RightTab; icon: string; label: string }[] = [
    { id: 'info', icon: 'link', label: 'Links' },
    { id: 'cards', icon: 'layers', label: 'Cards' },
    { id: 'quiz', icon: 'zap', label: 'Quiz' },
    { id: 'revise', icon: 'repeat', label: 'Revise' }
  ]
</script>

<aside class="right">
  <header>
    <div class="tabs" role="tablist">
      {#each tabs as t}
        <button role="tab" aria-selected={app.rightTab === t.id} class:on={app.rightTab === t.id} onclick={() => (app.rightTab = t.id)}>
          <Icon name={t.icon} size={16} /><span>{t.label}</span>
        </button>
      {/each}
    </div>
    <button class="icon-btn" title="Close panel" onclick={() => (app.rightOpen = false)}><Icon name="x" size={17} /></button>
  </header>

  {#if app.activePath}
    <div class="note-name truncate" title={app.activePath}>{noteTitle(app.activePath)}</div>
    <div class="body">
      {#if app.rightTab === 'info'}<InfoPanel path={app.activePath} />
      {:else if app.rightTab === 'cards'}<CardsPanel path={app.activePath} />
      {:else if app.rightTab === 'quiz'}<QuizPanel path={app.activePath} />
      {:else}<RevisePanel path={app.activePath} />{/if}
    </div>
  {:else}
    <div class="empty">Open a note to see its links, cards and quizzes.</div>
  {/if}
</aside>

<style>
  .right { width: 340px; flex: none; display: flex; flex-direction: column; background: var(--bg-side); border-left: 1px solid var(--border); min-height: 0; }
  header { display: flex; align-items: center; gap: 4px; padding: 10px 10px 6px 12px; }
  .tabs { display: flex; gap: 2px; flex: 1; }
  .tabs button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border-radius: 8px; color: var(--text-muted); font-size: 13px; }
  .tabs button:hover { color: var(--text); background: var(--bg-hover); }
  .tabs button.on { background: var(--accent); color: var(--on-accent); }
  .note-name { padding: 6px 16px 10px; font-family: var(--font-heading); font-size: 19px; font-weight: 700; }
  .body { flex: 1; overflow: auto; min-height: 0; padding: 0 14px 30px; }
</style>
