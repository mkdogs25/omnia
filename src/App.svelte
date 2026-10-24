<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from './lib/app.svelte'
  import Shell from './components/Shell.svelte'
  import Welcome from './components/Welcome.svelte'

  onMount(() => {
    void app.boot()
  })

  $effect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = app.theme === 'dark' || (app.theme === 'auto' && mq.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1e1913' : '#fcf5e1')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  })
</script>

{#if app.status === 'ready'}
  <Shell />
{:else if app.status === 'loading'}
  <div class="splash"><span class="logo">Omnia</span></div>
{:else}
  <Welcome />
{/if}

<style>
  .splash { height: 100%; display: grid; place-items: center; background: var(--parchment); }
  .logo { font-family: var(--font-heading); font-size: 42px; font-weight: 700; color: var(--text-faint); }
</style>
