<script lang="ts" module>
  export interface MenuItem {
    label?: string
    icon?: string
    danger?: boolean
    divider?: boolean
    hint?: string
    run?: () => void
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte'

  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props()
  let el: HTMLDivElement | undefined = $state()
  let pos = $state({ left: 0, top: 0 })

  $effect(() => {
    if (!el) return
    const r = el.getBoundingClientRect()
    pos = { left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, innerHeight - r.height - 8)) }
  })

  function pick(item: MenuItem) {
    onclose()
    item.run?.()
  }
</script>

<svelte:window onmousedown={e => { if (el && !el.contains(e.target as Node)) onclose() }} onkeydown={e => { if (e.key === 'Escape') onclose() }} onblur={onclose} />

<div class="menu" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" role="menu">
  {#each items as item}
    {#if item.divider}
      <hr />
    {:else}
      <button role="menuitem" class:danger={item.danger} onclick={() => pick(item)}>
        <span class="ic">{#if item.icon}<Icon name={item.icon} size={15} />{/if}</span>
        <span class="grow">{item.label}</span>
        {#if item.hint}<kbd>{item.hint}</kbd>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed; z-index: 300; min-width: 200px; padding: 5px; background: var(--bg-raised);
    border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: var(--shadow);
  }
  button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border-radius: 6px; text-align: left; font-size: 13.5px; }
  button:hover { background: var(--accent-soft); }
  button.danger { color: var(--bad); }
  .ic { width: 16px; display: grid; place-items: center; color: var(--text-muted); }
  hr { border: 0; border-top: 1px solid var(--border); margin: 4px 2px; }
</style>
