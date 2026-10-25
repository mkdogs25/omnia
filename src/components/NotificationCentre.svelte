<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { notifier, type NotifItem } from '../lib/notify.svelte'
  import Icon from './Icon.svelte'

  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m} min ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h} h ago`
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const icon = (k: NotifItem['kind']) => (k === 'digest' ? 'sunrise' : k === 'event' ? 'calendar' : k === 'timer' ? 'timer' : k === 'task' ? 'flag' : 'bell')

  function openItem(n: NotifItem) {
    if (n.taskId) app.view = 'tasks'
    else if (n.eventId) app.view = 'calendar'
    else if (n.kind === 'digest') app.view = 'tasks'
    notifier.open = false
  }

  $effect(() => {
    notifier.refreshPermission()
    // Opening the centre counts as having seen what is in it.
    const t = setTimeout(() => notifier.markAllRead(), 1200)
    return () => clearTimeout(t)
  })
</script>

<svelte:window onmousedown={e => {
  const t = e.target as HTMLElement
  if (!t.closest('.centre') && !t.closest('[data-notif-toggle]')) notifier.open = false
}} onkeydown={e => e.key === 'Escape' && (notifier.open = false)} />

<div class="centre" role="dialog" aria-label="Notifications">
  <header>
    <h3>Notifications</h3>
    <span class="grow"></span>
    {#if notifier.items.length}<button class="link" onclick={() => notifier.clear()}>Clear all</button>{/if}
    <button class="icon-btn" title="Notification settings" onclick={() => { notifier.open = false; app.view = 'settings'; app.settingsQuery = 'notif' }}><Icon name="settings" size={16} /></button>
  </header>

  {#if notifier.permission === 'default'}
    <div class="banner">
      <span>Turn on desktop notifications so your daily summary and reminders reach you outside this tab.</span>
      <button class="btn primary" onclick={() => notifier.enable()}>Enable</button>
    </div>
  {:else if notifier.permission === 'denied'}
    <div class="banner warn">Notifications are blocked for this site. Allow them in the browser’s site settings (the icon at the left of the address bar). Reminders still appear here.</div>
  {:else if notifier.permission === 'unsupported'}
    <div class="banner warn">This browser can’t show desktop notifications. Reminders still appear here.</div>
  {/if}

  <div class="list">
    {#each notifier.items as n (n.id)}
      <article class:unread={!n.read}>
        <span class="ic"><Icon name={icon(n.kind)} size={16} /></span>
        <div class="grow">
          <div class="head"><strong>{n.title}</strong><span class="faint when">{ago(n.at)}</span></div>
          {#if n.body}<p>{n.body}</p>{/if}
          <div class="acts">
            {#if n.kind !== 'system'}<button class="link" onclick={() => openItem(n)}>Open</button>{/if}
            <button class="link" onclick={() => notifier.snooze(n.id, 10)}>Snooze 10 min</button>
            <button class="link" onclick={() => notifier.snooze(n.id, 60)}>1 hour</button>
            <button class="link" onclick={() => notifier.snooze(n.id, 'tomorrow')}>Tomorrow</button>
            <button class="link muted" onclick={() => notifier.dismiss(n.id)}>Dismiss</button>
          </div>
        </div>
      </article>
    {:else}
      <div class="none"><Icon name="bell" size={26} /><span>You’re all caught up.</span><span class="faint">The daily summary arrives at {app.settings.digestTime}.</span></div>
    {/each}
  </div>
  <footer class="faint">Notifications are sent while Omnia is open in a browser tab or window.</footer>
</div>

<style>
  .centre {
    position: fixed; z-index: 160; left: calc(var(--ribbon-w) + 10px); bottom: 14px; width: 380px; max-height: min(620px, calc(100vh - 28px));
    display: flex; flex-direction: column; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 16px; box-shadow: var(--shadow);
  }
  header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px 18px; }
  h3 { font-family: var(--font-heading); font-size: var(--fs-lg); }
  .link { color: var(--link); font-size: var(--fs-sm); }
  .link.muted { color: var(--text-muted); }
  .banner { margin: 0 14px 6px; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); font-size: var(--fs-sm); display: flex; gap: 10px; align-items: center; line-height: 1.45; }
  .banner.warn { background: color-mix(in srgb, var(--warn) 18%, transparent); display: block; }
  .list { overflow: auto; padding: 4px 8px 6px; display: grid; gap: 2px; min-height: 0; }
  article { display: flex; gap: 10px; padding: 10px 10px; border-radius: 10px; }
  article.unread { background: var(--accent-soft); }
  .ic { color: var(--accent-strong); padding-top: 2px; }
  .head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .when { font-size: var(--fs-xs); white-space: nowrap; }
  p { margin: 3px 0 4px; font-size: var(--fs-sm); color: var(--text-muted); white-space: pre-line; line-height: 1.5; }
  .acts { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .none { display: grid; justify-items: center; gap: 4px; padding: 34px 10px; color: var(--text-muted); font-size: var(--fs-md); }
  footer { padding: 8px 18px 12px; font-size: var(--fs-xs); border-top: 1px solid var(--border); }
</style>
