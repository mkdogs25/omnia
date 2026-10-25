import { describe, expect, it } from 'vitest'
import { buildVars, contrastRatio, hexToRgb, normaliseHex, readableOn } from './appearance'
import { DEFAULT_SETTINGS, normaliseSettings } from './settings'
import { actionFor, comboFromEvent, conflictFor, displayCombo, matches, parseCombo } from './shortcuts'

describe('colour maths', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#d95c3a')).toEqual([217, 92, 58])
    expect(hexToRgb('fff')).toEqual([255, 255, 255])
    expect(hexToRgb('nope')).toBeNull()
    expect(normaliseHex('#ABC')).toBe('#aabbcc')
  })
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })
  it('picks readable text for an accent', () => {
    expect(readableOn('#0a0a0a')).toBe('#fffaf0')
    expect(readableOn('#f5e663')).toBe('#1e1913')
  })
})

describe('buildVars', () => {
  it('leaves the default theme alone apart from layout values', () => {
    const v = buildVars(DEFAULT_SETTINGS, false)
    expect(v['--bg']).toBeUndefined()
    expect(v['--accent']).toBeUndefined()
    expect(v['--font-heading']).toBeUndefined()
    expect(v['--sidebar-w']).toBe('300px')
  })
  it('applies a palette, an accent and fonts', () => {
    const v = buildVars({ ...DEFAULT_SETTINGS, lightPalette: 'sage', accent: '#4f6bd8', headingFont: 'georgia', bodyFont: 'custom', customBodyFont: 'Comic Sans MS' }, false)
    expect(v['--bg']).toBe('#f1f4ea')
    expect(v['--accent']).toBe('#4f6bd8')
    expect(v['--font-heading']).toContain('Georgia')
    expect(v['--font-body']).toMatch(/^'Comic Sans MS'/)
  })
  it('uses the dark palette in dark mode and ignores a light one', () => {
    const v = buildVars({ ...DEFAULT_SETTINGS, lightPalette: 'sage', darkPalette: 'slate' }, true)
    expect(v['--bg']).toBe('#1b1f26')
  })
  it('scales density and high contrast', () => {
    expect(buildVars({ ...DEFAULT_SETTINGS, density: 'compact' }, false)['--row-h']).toBe('28px')
    expect(buildVars({ ...DEFAULT_SETTINGS, highContrast: true }, false)['--text']).toBe('#000000')
  })
  it('refuses to inject characters into a custom font name', () => {
    const v = buildVars({ ...DEFAULT_SETTINGS, bodyFont: 'custom', customBodyFont: "x'; } body { display:none" }, false)
    expect(v['--font-body']).not.toContain("';")
  })
})

describe('normaliseSettings', () => {
  it('fills in defaults and drops unknown tools', () => {
    const s = normaliseSettings({ ribbonTop: ['notes', 'bogus' as never, 'bell' as never, 'tasks'] })
    expect(s.ribbonTop).toEqual(['notes', 'tasks'])
    expect(s.homeWidgets.length).toBeGreaterThan(3)
    expect(s.accent).toBe('')
  })
  it('clamps silly values', () => {
    const s = normaliseSettings({ uiScale: 9, sidebarWidth: 5 })
    expect(s.uiScale).toBe(1.4)
    expect(s.sidebarWidth).toBe(200)
  })
})

describe('shortcuts', () => {
  const press = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }) as KeyboardEvent
  it('parses and matches combos', () => {
    expect(parseCombo('Mod+Shift+F')).toEqual({ mod: true, alt: false, shift: true, key: 'f' })
    expect(matches(press('F', { ctrlKey: true, shiftKey: true }), parseCombo('Mod+Shift+F')!)).toBe(true)
    expect(matches(press('f', { ctrlKey: true }), parseCombo('Mod+Shift+F')!)).toBe(false)
    expect(matches(press('ArrowLeft', { altKey: true }), parseCombo('Alt+ArrowLeft')!)).toBe(true)
  })
  it('finds the action for a key press, honouring overrides', () => {
    expect(actionFor(press('o', { ctrlKey: true }), {})).toBe('switcher')
    expect(actionFor(press('o', { ctrlKey: true }), { switcher: 'Mod+J' })).toBeNull()
    expect(actionFor(press('j', { ctrlKey: true }), { switcher: 'Mod+J' })).toBe('switcher')
  })
  it('records combos from events and detects conflicts', () => {
    expect(comboFromEvent(press('k', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+K')
    expect(comboFromEvent(press('Shift', { shiftKey: true }))).toBeNull()
    expect(conflictFor('palette', 'Mod+O', {})).toBe('Quick open a note')
    expect(conflictFor('switcher', 'Mod+O', {})).toBeNull()
  })
  it('shows combos readably', () => {
    expect(displayCombo('Alt+ArrowLeft')).toEqual(['Alt', '←'])
  })
})
