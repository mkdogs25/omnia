import { ACTIONS } from './settings'

export interface Combo { mod: boolean; alt: boolean; shift: boolean; key: string }

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** "Mod+Shift+F" -> { mod, shift, key: 'f' }. */
export function parseCombo(text: string): Combo | null {
  if (!text) return null
  const parts = text.split('+').map(p => p.trim()).filter(Boolean)
  // A literal "+" key ends up as an empty last part; treat "Mod++" as Mod and "+".
  if (text.endsWith('++')) parts.push('+')
  const key = parts.pop()
  if (!key) return null
  const c: Combo = { mod: false, alt: false, shift: false, key: key.length === 1 ? key.toLowerCase() : key }
  for (const p of parts) {
    const m = p.toLowerCase()
    if (m === 'mod' || m === 'ctrl' || m === 'cmd' || m === 'meta') c.mod = true
    else if (m === 'alt' || m === 'option') c.alt = true
    else if (m === 'shift') c.shift = true
    else return null
  }
  return c
}

export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join('+')
}

export function matches(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, combo: Combo): boolean {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  // Shift changes the character produced ("," vs "<"), so only compare it for letters, digits and named keys.
  return mod === combo.mod && e.altKey === combo.alt && key === combo.key && (e.shiftKey === combo.shift || (!/^[a-z0-9]$/i.test(key) && key.length === 1))
}

export function comboFor(id: string, overrides: Record<string, string>): string {
  return overrides[id] ?? ACTIONS.find(a => a.id === id)?.combo ?? ''
}

/** Which action (if any) the key press triggers. */
export function actionFor(e: KeyboardEvent, overrides: Record<string, string>): string | null {
  for (const a of ACTIONS) {
    const c = parseCombo(comboFor(a.id, overrides))
    if (c && matches(e, c)) return a.id
  }
  return null
}

/** Another action that already uses this combo, if any. */
export function conflictFor(id: string, combo: string, overrides: Record<string, string>): string | null {
  const norm = combo.toLowerCase()
  for (const a of ACTIONS) if (a.id !== id && comboFor(a.id, overrides).toLowerCase() === norm) return a.label
  return null
}

/** "Mod+Shift+F" shown as "Ctrl Shift F" (or the Mac symbols). */
export function displayCombo(combo: string): string[] {
  const mac = isMac()
  return combo.split('+').map(p => {
    const m = p.toLowerCase()
    if (m === 'mod') return mac ? '⌘' : 'Ctrl'
    if (m === 'alt') return mac ? '⌥' : 'Alt'
    if (m === 'shift') return mac ? '⇧' : 'Shift'
    if (p === 'ArrowLeft') return '←'
    if (p === 'ArrowRight') return '→'
    if (p === 'ArrowUp') return '↑'
    if (p === 'ArrowDown') return '↓'
    return p.length === 1 ? p.toUpperCase() : p
  })
}
