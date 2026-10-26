import { describe, expect, it } from 'vitest'
import { buildVars, contrastRatio, customPaletteVars, hexToRgb, lookOf, normaliseHex, readableOn, settingsFromLook, wantsDark } from './appearance'
import { DEFAULT_SETTINGS, normaliseSettings, THEME_PRESETS } from './settings'
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

describe('custom colours and themes', () => {
  const custom = (over: Partial<typeof DEFAULT_SETTINGS.customColours> = {}) =>
    ({ ...DEFAULT_SETTINGS, customColours: { ...DEFAULT_SETTINGS.customColours, enabled: true, bg: '#2e3440', text: '#d8dee9', dark: true, ...over } })

  it('derives the interface colours from a background and text colour', () => {
    const v = buildVars(custom(), true)
    expect(v['--bg']).toBe('#2e3440')
    expect(v['--text']).toBe('#d8dee9')
    expect(v['--bg-side']).toContain('color-mix')
    expect(v['--parchment']).toContain('#2e3440')
    expect(buildVars(custom({ side: '#272c36' }), true)['--bg-side']).toBe('#272c36')
  })

  it('ignores custom colours that are off or invalid', () => {
    expect(buildVars({ ...DEFAULT_SETTINGS }, false)['--bg']).toBeUndefined()
    expect(customPaletteVars({ ...DEFAULT_SETTINGS.customColours, enabled: true, bg: 'nope' })).toBeNull()
  })

  it('custom colours decide light or dark', () => {
    expect(wantsDark(custom(), 'light', false)).toBe(true)
    expect(wantsDark(custom({ dark: false }), 'dark', true)).toBe(false)
    expect(wantsDark(DEFAULT_SETTINGS, 'auto', true)).toBe(true)
    expect(wantsDark(DEFAULT_SETTINGS, 'light', true)).toBe(false)
  })

  it('exposes the note colours as variables', () => {
    const v = buildVars({ ...DEFAULT_SETTINGS, boldColour: '#ff0000', italicColour: '#00ff00', boldItalicColour: '#0000ff', headingColour: '#abc' }, false)
    expect(v).toMatchObject({ '--md-bold': '#ff0000', '--italic': '#00ff00', '--md-bolditalic': '#0000ff', '--md-heading': '#aabbcc' })
    expect(buildVars({ ...DEFAULT_SETTINGS, boldColour: 'banana' }, false)['--md-bold']).toBeUndefined()
  })

  it('saves and restores a look', () => {
    const s = { ...DEFAULT_SETTINGS, accent: '#112233', boldColour: '#ff0000', headingFont: 'georgia', customColours: { ...DEFAULT_SETTINGS.customColours, enabled: true, bg: '#101010' } }
    const look = lookOf(s, 'dark')
    expect(look.scheme).toBe('dark')
    const back = settingsFromLook(look)
    expect(back).toMatchObject({ accent: '#112233', boldColour: '#ff0000', headingFont: 'georgia' })
    expect(back.customColours?.bg).toBe('#101010')
    expect((back as Record<string, unknown>).fontSize).toBeUndefined()
  })

  it('fills in what an older theme lacks and rejects bad colours', () => {
    const back = settingsFromLook({ accent: 'not a colour', boldColour: '#fff' } as never)
    expect(back).toMatchObject({ accent: '', boldColour: '#ffffff', headingFont: 'libron', lightPalette: 'parchment' })
  })

  it('every preset applies cleanly', () => {
    for (const p of THEME_PRESETS) {
      const merged = { ...DEFAULT_SETTINGS, ...settingsFromLook(p.look) }
      const v = buildVars(merged, p.look.customColours.dark)
      expect(v['--bg'], p.name).toMatch(/^#/)
      expect(contrastRatio(p.look.customColours.bg, p.look.customColours.text), p.name).toBeGreaterThan(4.5)
    }
  })

  it('themes survive being stored with the settings', () => {
    const s = normaliseSettings({ themes: [{ id: 'a', name: 'A', look: lookOf(DEFAULT_SETTINGS, 'auto') }, { id: 3, name: 'bad' } as never] })
    expect(s.themes).toHaveLength(1)
    expect(normaliseSettings({ customColours: { enabled: true } as never }).customColours.bg).toBe('#fcf5e1')
  })
})
