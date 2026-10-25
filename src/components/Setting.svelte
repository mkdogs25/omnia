<script lang="ts">
  import { getContext, type Snippet } from 'svelte'

  let { label, hint = '', keywords = '', stack = false, children }: {
    label: string
    hint?: string
    /** Extra words the settings search should match. */
    keywords?: string
    /** Put the control under the label instead of beside it (for wide controls). */
    stack?: boolean
    children: Snippet
  } = $props()

  const query = getContext<() => string>('settings-query')
  const hidden = $derived.by(() => {
    const q = query().trim().toLowerCase()
    if (!q) return false
    return !`${label} ${hint} ${keywords}`.toLowerCase().includes(q)
  })
</script>

<div class="setting" class:hidden class:stack>
  <div class="text">
    <strong>{label}</strong>
    {#if hint}<span>{hint}</span>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 13px 0; border-top: 1px solid var(--border); }
  .setting:first-of-type { border-top: 0; }
  .setting.hidden { display: none; }
  .setting.stack { flex-direction: column; align-items: stretch; gap: 10px; }
  .text { display: grid; gap: 2px; min-width: 0; max-width: 28rem; }
  strong { font-weight: 600; font-size: var(--fs-md); }
  .text span { font-size: var(--fs-sm); color: var(--text-muted); line-height: 1.45; }
  .control { display: flex; align-items: center; gap: 8px; flex: none; flex-wrap: wrap; justify-content: flex-end; }
  .stack .control { justify-content: flex-start; }
</style>
