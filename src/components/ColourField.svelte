<script lang="ts">
  import { normaliseHex } from '../lib/appearance'

  let { label, value, fallback, onchange, clearable = true }: {
    label: string
    /** Current hex colour, or '' when unset. */
    value: string
    /** What the colour is when unset, shown in the picker and as the hex placeholder. */
    fallback: string
    onchange: (hex: string) => void
    clearable?: boolean
  } = $props()

  const shown = $derived(normaliseHex(value) ?? normaliseHex(fallback) ?? '#888888')

  function commit(text: string) {
    const v = text.trim()
    if (!v && clearable) return onchange('')
    const hex = normaliseHex(v)
    if (hex) onchange(hex)
  }
</script>

<div class="cf">
  <span class="lab">{label}</span>
  <input type="color" aria-label="{label} colour" value={shown} oninput={e => onchange(e.currentTarget.value)} />
  <input class="field hex" aria-label="{label} as hex" placeholder={fallback} value={value}
    onchange={e => { commit(e.currentTarget.value); if (!normaliseHex(e.currentTarget.value) && e.currentTarget.value.trim()) e.currentTarget.value = value }} />
  {#if clearable && value}<button class="btn small" onclick={() => onchange('')}>Reset</button>{/if}
</div>

<style>
  .cf { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .lab { width: 92px; font-size: var(--fs-sm); color: var(--text-muted); }
  input[type='color'] { width: 34px; height: 30px; border: 1px solid var(--border-strong); border-radius: 8px; padding: 0; background: none; cursor: pointer; }
  .hex { width: 104px; }
  .small { padding: 3px 10px; font-size: var(--fs-sm); }
</style>
