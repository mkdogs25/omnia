<script lang="ts">
  import { app } from '../lib/app.svelte'
  import { relativeAge } from '../lib/sync/format'
  import { isNativeApp } from '../lib/platform'
  import { sync, type SyncConfig } from '../lib/sync/sync.svelte'
  import Icon from './Icon.svelte'
  import Setting from './Setting.svelte'

  let repo = $state(sync.config?.repo ?? '')
  let token = $state('')
  let branch = $state(sync.config?.branch ?? 'main')
  let subdir = $state(sync.config?.subdir ?? '')
  let result = $state<{ ok: boolean; text: string } | null>(null)
  let testing = $state(false)
  let showAdvanced = $state(false)

  const connected = $derived(sync.configured)
  const form = $derived<SyncConfig>({
    repo: repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''),
    token: token.trim() || sync.config?.token || '',
    branch: branch.trim() || 'main',
    subdir: subdir.trim(),
    device: sync.config?.device ?? (isNativeApp() ? 'Phone' : 'Computer'),
    auto: sync.config?.auto ?? true,
    intervalMin: sync.config?.intervalMin ?? 10
  })
  const filled = $derived(/^[\w.-]+\/[\w.-]+$/.test(form.repo) && form.token.length > 10)
  const now = $derived.by(() => { sync.last; return Date.now() })

  async function test() {
    testing = true
    result = await sync.test(form)
    testing = false
  }

  async function connect() {
    testing = true
    const r = await sync.test(form)
    result = r
    testing = false
    if (!r.ok) return
    sync.save(form)
    token = ''
    void sync.run('manual')
  }

  const setCfg = (patch: Partial<SyncConfig>) => sync.config && sync.save({ ...sync.config, ...patch })
  const total = $derived(sync.report ? sync.report.downloaded.length + sync.report.uploaded.length + sync.report.merged.length + sync.report.deletedHere.length + sync.report.deletedThere.length : 0)
</script>

<div class="status" class:err={sync.status === 'error'} class:busy={sync.status === 'syncing'}>
  <Icon name="refresh" size={18} />
  <div class="grow">
    {#if !connected}<strong>Not set up</strong><span class="muted">Your notes stay on this device only.</span>
    {:else if sync.status === 'syncing'}<strong>Syncing…</strong><span class="muted">{sync.message}</span>
    {:else if sync.status === 'error'}<strong>Sync problem</strong><span class="muted">{sync.error}</span>
    {:else if sync.status === 'offline'}<strong>Offline</strong><span class="muted">{sync.message}</span>
    {:else}<strong>Connected to {sync.config?.repo}</strong><span class="muted">{sync.last ? `Last synced ${relativeAge(sync.last, now)}${total ? ` · ${total} change${total === 1 ? '' : 's'}` : ' · everything up to date'}` : 'Not synced yet'}</span>{/if}
  </div>
  {#if connected}<button class="btn primary" disabled={sync.status === 'syncing'} onclick={() => sync.run('manual')}>Sync now</button>{/if}
</div>

{#if !connected}
  <Setting label="Sync with GitHub" hint="Keeps this device in step with Omnia on your other devices through a private repository of yours. There is no Omnia account or server." keywords="sync github phone android backup repository token" stack>
    <ol class="steps">
      <li>Create an empty <strong>private</strong> repository on GitHub (<a href="https://github.com/new" target="_blank" rel="noreferrer">github.com/new</a>).</li>
      <li>Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">fine-grained token</a>: pick <em>Only select repositories</em> → that repository, and under Repository permissions set <em>Contents</em> to <em>Read and write</em>.</li>
      <li>Paste the repository and the token here. Use the same repository on every device.</li>
    </ol>
    <div class="form">
      <label>Repository<input class="field" placeholder="yourname/omnia-notes" bind:value={repo} autocomplete="off" spellcheck="false" aria-label="Repository" /></label>
      <label>Token<input class="field" type="password" placeholder="github_pat_…" bind:value={token} autocomplete="off" aria-label="Token" /></label>
      <button class="link" onclick={() => (showAdvanced = !showAdvanced)}>{showAdvanced ? 'Hide' : 'Show'} options</button>
      {#if showAdvanced}
        <label>Branch<input class="field" bind:value={branch} aria-label="Branch" /></label>
        <label>Folder inside the repository <span class="muted">(optional)</span><input class="field" placeholder="leave empty to use the top level" bind:value={subdir} aria-label="Folder inside the repository" /></label>
      {/if}
      <div class="row">
        <button class="btn" disabled={!filled || testing} onclick={test}>Test connection</button>
        <button class="btn primary" disabled={!filled || testing} onclick={connect}>Connect and sync</button>
      </div>
      {#if result}<p class="note" class:warn={!result.ok} role="status">{result.text}</p>{/if}
    </div>
    <p class="note">The token is kept only on this device, in this browser or app, and is sent only to GitHub. It is never written to your notes or the repository.</p>
  </Setting>
{:else}
  <Setting label="Sync automatically" hint="When Omnia opens, when you come back to it, a minute after you stop editing, and on a timer." keywords="auto interval background">
    <input type="checkbox" class="checkbox" checked={sync.config?.auto} onchange={e => setCfg({ auto: e.currentTarget.checked })} aria-label="Sync automatically" />
    <select class="field narrow" disabled={!sync.config?.auto} value={String(sync.config?.intervalMin)} onchange={e => setCfg({ intervalMin: +e.currentTarget.value })} aria-label="Sync interval">
      {#each [5, 10, 15, 30, 60] as m}<option value={String(m)}>every {m} min</option>{/each}
    </select>
  </Setting>
  <Setting label="This device’s name" hint="Shown on the copy Omnia keeps when two devices change the same text." keywords="device name conflict">
    <input class="field" value={sync.config?.device} onchange={e => setCfg({ device: e.currentTarget.value.trim() || 'Device' })} aria-label="Device name" />
  </Setting>
  <Setting label="Repository" hint={`${sync.config?.repo} · branch ${sync.config?.branch}${sync.config?.subdir ? ` · folder ${sync.config.subdir}` : ''}`} keywords="disconnect forget token">
    <button class="btn" onclick={() => { if (confirm('Stop syncing on this device? Your notes here and in the repository are left as they are.')) void sync.disconnect() }}>Disconnect</button>
  </Setting>
{/if}

{#if sync.report?.conflicts.length}
  <Setting label="Kept both versions" hint="These were changed on two devices at once in ways Omnia couldn’t combine. The other device’s version has the original name; yours is the copy. Delete whichever you don’t need." keywords="conflict copies" stack>
    <ul class="conflicts">
      {#each sync.report.conflicts as c (c.copy)}
        <li><button class="link" onclick={() => app.openNote(c.original)}>{c.original}</button> <span class="muted">and</span> <button class="link" onclick={() => app.openNote(c.copy)}>{c.copy.split('/').pop()}</button></li>
      {/each}
    </ul>
  </Setting>
{/if}

<p class="note">Synced: notes, PDFs, Word files and images, tasks, events, study progress, the error log and PDF highlights. Kept on each device: settings, themes, the trash, version history and OCR text. Edits to different parts of a note, and tasks changed on different devices, are combined automatically.</p>

<style>
  .status { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: var(--bg-hover); margin-bottom: 8px; }
  .status .grow { display: grid; gap: 1px; min-width: 0; }
  .status .muted { font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .status.err { background: var(--accent-soft); }
  .status.busy :global(svg) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  :global([data-motion='reduce']) .status.busy :global(svg) { animation: none; }
  .steps { margin: 0 0 12px; padding-left: 20px; display: grid; gap: 6px; font-size: var(--fs-md); line-height: 1.5; }
  .steps a, .link { color: var(--link); }
  .form { display: grid; gap: 10px; max-width: 520px; }
  .form label { display: grid; gap: 3px; font-size: var(--fs-sm); color: var(--text-muted); }
  .link { justify-self: start; font-size: var(--fs-sm); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .note { font-size: var(--fs-sm); color: var(--text-muted); line-height: 1.5; margin: 8px 0 0; }
  .note.warn { color: var(--bad); }
  .narrow { width: 140px; }
  .conflicts { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: var(--fs-md); }
</style>
