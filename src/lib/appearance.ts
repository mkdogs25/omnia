// Turns settings into CSS custom properties on <html>. Colour maths lives here so it can be tested.

import { FONTS, MONO_FONTS, PALETTES, type Settings } from './settings'

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const channel = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Whichever of near-black or near-white reads better on the given colour. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, '#fffaf0') >= contrastRatio(hex, '#1e1913') ? '#fffaf0' : '#1e1913'
}

export function normaliseHex(input: string): string | null {
  const rgb = hexToRgb(input)
  if (!rgb) return null
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}

const OWN_VARS = [
  '--font-heading', '--font-body', '--font-mono', '--ui-scale', '--editor-line', '--sidebar-w', '--right-w', '--row-h', '--row-min',
  '--accent', '--accent-strong', '--accent-soft', '--on-accent', '--italic', '--link'
]

const quote = (name: string) => `'${name.replace(/['\\]/g, '')}'`

/** The CSS custom properties implied by the settings, for light or dark mode. */
export function buildVars(s: Settings, isDark: boolean): Record<string, string> {
  const vars: Record<string, string> = {}

  const palette = PALETTES.find(p => p.id === (isDark ? s.darkPalette : s.lightPalette) && p.dark === isDark)
  if (palette) Object.assign(vars, palette.vars)

  const heading = FONTS.find(f => f.id === s.headingFont)
  const body = FONTS.find(f => f.id === s.bodyFont)
  const mono = MONO_FONTS.find(f => f.id === s.monoFont)
  const withFallback = (custom: string, fallback: string) => `${quote(custom)}, ${fallback}`
  if (heading && heading.id !== 'libron') vars['--font-heading'] = heading.id === 'custom' && s.customHeadingFont.trim() ? withFallback(s.customHeadingFont.trim(), FONTS[2].stack) : heading.stack || FONTS[2].stack
  if (body && body.id !== 'inter') vars['--font-body'] = body.id === 'custom' && s.customBodyFont.trim() ? withFallback(s.customBodyFont.trim(), FONTS[4].stack) : body.stack || FONTS[4].stack
  if (mono && mono.id !== 'system-mono') vars['--font-mono'] = mono.stack

  const accent = normaliseHex(s.accent)
  if (accent) {
    vars['--accent'] = accent
    vars['--accent-strong'] = isDark ? `color-mix(in srgb, ${accent} 75%, white)` : `color-mix(in srgb, ${accent} 82%, black)`
    vars['--accent-soft'] = `color-mix(in srgb, ${accent} ${isDark ? 22 : 14}%, transparent)`
    vars['--on-accent'] = readableOn(accent)
    vars['--link'] = vars['--accent-strong']
    vars['--italic'] = vars['--accent-strong']
  }

  vars['--ui-scale'] = String(s.uiScale)
  vars['--editor-line'] = String(s.lineHeight)
  vars['--sidebar-w'] = `${s.sidebarWidth}px`
  vars['--right-w'] = `${s.rightWidth}px`
  vars['--row-h'] = s.density === 'compact' ? '28px' : s.density === 'spacious' ? '40px' : '33px'
  vars['--row-min'] = s.density === 'compact' ? '32px' : s.density === 'spacious' ? '50px' : '40px'

  if (s.highContrast) {
    Object.assign(vars, isDark
      ? { '--text': '#ffffff', '--text-muted': '#d6d2c8', '--text-faint': '#a9a597', '--border': '#5a5143', '--border-strong': '#8a7e6a' }
      : { '--text': '#000000', '--text-muted': '#3d362a', '--text-faint': '#675e4d', '--border': '#9c8f74', '--border-strong': '#5e5441' })
  }
  return vars
}

let applied: string[] = []

/** Writes the settings onto the page. Call whenever settings or the colour scheme change. */
export function applyAppearance(s: Settings, isDark: boolean, root: HTMLElement = document.documentElement) {
  for (const name of applied) root.style.removeProperty(name)
  const vars = buildVars(s, isDark)
  applied = Object.keys(vars)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.density = s.density
  root.dataset.contrast = s.highContrast ? 'high' : 'normal'
  root.dataset.motion = s.reducedMotion === 'system' ? 'system' : s.reducedMotion === 'on' ? 'reduce' : 'full'
  void OWN_VARS
}

export function paletteChoices(dark: boolean) {
  return PALETTES.filter(p => p.dark === dark)
}
