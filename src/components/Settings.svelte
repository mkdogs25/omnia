<script lang="ts">
  import { app } from '../lib/app.svelte'
  import Modal from './Modal.svelte'
</script>

<Modal onclose={() => (app.modal = null)} width={520} label="Settings">
  <div class="wrap">
    <h2>Settings</h2>

    <label class="line">
      <span>Theme</span>
      <select class="field" value={app.theme} onchange={e => app.setTheme(e.currentTarget.value as 'auto' | 'light' | 'dark')}>
        <option value="auto">Match system</option>
        <option value="light">Light parchment</option>
        <option value="dark">Dark</option>
      </select>
    </label>

    <label class="line">
      <span>Editor font size <span class="muted">{app.settings.fontSize}px</span></span>
      <input type="range" min="14" max="24" value={app.settings.fontSize} oninput={e => app.updateSettings({ fontSize: +e.currentTarget.value })} />
    </label>

    <label class="line">
      <span>Limit line length for easier reading</span>
      <input type="checkbox" class="checkbox" checked={app.settings.readableWidth} onchange={e => app.updateSettings({ readableWidth: e.currentTarget.checked })} />
    </label>

    <label class="line">
      <span>Spell check in the editor</span>
      <input type="checkbox" class="checkbox" checked={app.settings.spellcheck} onchange={e => app.updateSettings({ spellcheck: e.currentTarget.checked })} />
    </label>

    <label class="line">
      <span>Daily notes folder</span>
      <input class="field narrow" value={app.settings.dailyFolder} onchange={e => app.updateSettings({ dailyFolder: e.currentTarget.value.trim() })} />
    </label>

    <label class="line">
      <span>New flashcards per day</span>
      <input class="field narrow" type="number" min="0" max="500" value={app.settings.newPerDay} onchange={e => app.updateSettings({ newPerDay: Math.max(0, +e.currentTarget.value || 0) })} />
    </label>

    <hr />
    <p class="muted small">
      Folder: <strong>{app.vault?.name}</strong>. Tasks, events and study progress are in <code>.omnia/</code> inside it.
      Deleted notes are moved to <code>.trash/</code>, never erased.
    </p>
    <div class="row">
      <button class="btn" onclick={() => app.chooseFolder()}>Choose another folder…</button>
      <span class="grow"></span>
      <button class="btn primary" onclick={() => (app.modal = null)}>Done</button>
    </div>
  </div>
</Modal>

<style>
  .wrap { padding: 24px 28px; display: grid; gap: 14px; }
  h2 { font-size: 28px; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .line .field { width: 190px; }
  .line .narrow { width: 120px; }
  input[type='range'] { accent-color: var(--accent); width: 190px; }
  hr { border: 0; border-top: 1px solid var(--border); width: 100%; }
  .small { font-size: 13px; line-height: 1.6; margin: 0; }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
</style>
