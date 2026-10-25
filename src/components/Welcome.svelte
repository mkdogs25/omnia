<script lang="ts">
  import { app } from '../lib/app.svelte'
  import Icon from './Icon.svelte'
</script>

<main class="welcome">
  <div class="card">
    <h1>Omnia</h1>
    <p class="lede">Notes, tasks, a calendar and spaced-repetition study tools, all kept in one folder of plain Markdown files.</p>

    {#if app.status === 'unsupported'}
      <div class="notice">
        <strong>This browser can't open folders.</strong>
        <p>Omnia needs the File System Access API, available in Chrome, Edge, Brave, Arc and Opera on desktop. Please open this page in one of those.</p>
      </div>
    {:else if app.status === 'needs-permission'}
      <p>Welcome back. Your browser needs your permission again to reopen <strong>{app.vault?.name}</strong>.</p>
      <div class="actions">
        <button class="btn primary big" onclick={() => app.resumeVault()}><Icon name="folder-open" /> Reopen {app.vault?.name}</button>
        <button class="btn ghost big" onclick={() => app.chooseFolder()}>Choose another folder</button>
      </div>
    {:else}
      <p>Choose the folder where your Markdown notes live, or an empty folder to start fresh. Omnia only reads and writes inside that folder.</p>
      <div class="actions">
        <button class="btn primary big" onclick={() => app.chooseFolder()}><Icon name="folder-open" /> Choose a folder</button>
      </div>
    {/if}

    {#if app.error}<p class="error">{app.error}</p>{/if}

    <ul class="facts">
      <li><Icon name="notes" size={16} /> Notes stay as <code>.md</code> files, so they open in any other editor.</li>
      <li><Icon name="check-square" size={16} /> Tasks, events and review history are stored in a hidden <code>.omnia</code> folder inside it.</li>
      <li><Icon name="study" size={16} /> Nothing leaves your computer: there is no account and no server.</li>
    </ul>
  </div>
</main>

<style>
  .welcome { height: 100%; display: grid; place-items: center; background: var(--parchment); padding: 24px; overflow: auto; }
  .card {
    width: min(560px, 100%); background: var(--bg-raised); border: 1px solid var(--border); border-radius: 16px;
    padding: 40px 44px; box-shadow: var(--shadow);
  }
  h1 { font-size: 54px; margin-bottom: 8px; }
  .lede { font-size: var(--fs-xl); line-height: 1.45; color: var(--text-muted); margin: 0 0 22px; }
  p { line-height: 1.6; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 22px 0; }
  .notice { background: var(--accent-soft); border-radius: 10px; padding: 14px 18px; }
  .notice p { margin: 6px 0 0; }
  .error { color: var(--bad); }
  .facts { list-style: none; padding: 18px 0 0; margin: 10px 0 0; border-top: 1px solid var(--border); display: grid; gap: 10px; color: var(--text-muted); font-size: 14px; }
  .facts li { display: flex; gap: 10px; align-items: flex-start; }
  .facts :global(svg) { flex: none; margin-top: 3px; color: var(--accent); }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
</style>
