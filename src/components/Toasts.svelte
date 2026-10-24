<script lang="ts">
  import { app } from '../lib/app.svelte'
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast">
      <span>{t.text}</span>
      {#if t.action}<button class="btn" onclick={t.action.run}>{t.action.label}</button>{/if}
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 400; display: grid; gap: 8px; justify-items: center; pointer-events: none; }
  .toast {
    pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 9px 16px; border-radius: 10px;
    background: var(--text); color: var(--bg); font-size: 13.5px; box-shadow: var(--shadow);
  }
  .toast :global(.btn) { background: rgba(255, 255, 255, 0.18); color: inherit; padding: 3px 10px; }
</style>
