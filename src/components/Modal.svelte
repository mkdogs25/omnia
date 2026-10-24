<script lang="ts">
  import type { Snippet } from 'svelte'

  let { onclose, children, width = 560, top = false, label = 'Dialog' }: {
    onclose: () => void
    children: Snippet
    width?: number
    /** Anchor near the top, like a command palette. */
    top?: boolean
    label?: string
  } = $props()

  let dialog: HTMLDivElement | undefined = $state()

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog?.focus()
    return () => previous?.focus?.()
  })

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onclose()
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" class:top role="presentation" onmousedown={e => e.target === e.currentTarget && onclose()}>
  <div class="dialog" bind:this={dialog} tabindex="-1" role="dialog" aria-modal="true" aria-label={label} style:width="min({width}px, 100%)">
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px;
    background: rgba(40, 28, 10, 0.38); backdrop-filter: blur(2px);
  }
  .backdrop.top { place-items: start center; padding-top: 12vh; }
  .dialog {
    max-height: calc(100vh - 40px); overflow: auto; background: var(--bg-raised); border: 1px solid var(--border-strong);
    border-radius: 14px; box-shadow: var(--shadow); outline: none;
  }
</style>
