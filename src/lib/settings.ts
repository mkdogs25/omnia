// Every user-adjustable setting, with its default, plus the catalogues (fonts, palettes, tools, shortcuts) the settings page offers.

export type ToolId =
  | 'home' | 'notes' | 'tasks' | 'calendar' | 'study' | 'graph' | 'capture'
  | 'notifications' | 'timer' | 'theme' | 'commands'

export interface ToolInfo { label: string; icon: string; group: 'top' | 'bottom'; hint: string }

export const TOOLS: Record<ToolId, ToolInfo> = {
  home: { label: 'Home', icon: 'home', group: 'top', hint: 'A dashboard of what needs attention' },
  notes: { label: 'Notes', icon: 'notes', group: 'top', hint: 'Files, notes, PDFs and documents' },
  tasks: { label: 'Tasks', icon: 'check-square', group: 'top', hint: 'To-dos, deadlines and recurring tasks' },
  calendar: { label: 'Calendar', icon: 'calendar', group: 'top', hint: 'Month and week views' },
  study: { label: 'Study', icon: 'study', group: 'top', hint: 'Flashcards, quizzes, error log and insights' },
  graph: { label: 'Graph', icon: 'graph', group: 'top', hint: 'How your notes link together' },
  capture: { label: 'Quick capture', icon: 'inbox2', group: 'top', hint: 'Jot a note or task from anywhere' },
  notifications: { label: 'Notifications', icon: 'bell', group: 'bottom', hint: 'Reminders and the daily summary' },
  timer: { label: 'Pomodoro timer', icon: 'timer', group: 'bottom', hint: 'Focus and break timer' },
  theme: { label: 'Theme switch', icon: 'sun', group: 'bottom', hint: 'Cycle light, dark and automatic' },
  commands: { label: 'Command palette', icon: 'search', group: 'bottom', hint: 'Find any command' }
}

export const DEFAULT_RIBBON_TOP: ToolId[] = ['home', 'notes', 'tasks', 'calendar', 'study']
export const DEFAULT_RIBBON_BOTTOM: ToolId[] = ['notifications', 'timer', 'theme', 'commands']

export interface HomeWidget { id: string; on: boolean }
export const DEFAULT_HOME_WIDGETS: HomeWidget[] = [
  { id: 'today', on: true }, { id: 'deadlines', on: true }, { id: 'study', on: true },
  { id: 'events', on: true }, { id: 'recent', on: true }, { id: 'focus', on: true }, { id: 'revise', on: true }
]

export type Density = 'compact' | 'comfortable' | 'spacious'

/** Your own background and text colours, used instead of a built-in palette when enabled. */
export interface CustomColours {
  enabled: boolean
  /** Whether these colours are a dark scheme (so the rest of the interface switches to its dark tones). */
  dark: boolean
  bg: string
  /** Side panels; blank to derive it from the background. */
  side: string
  text: string
}

/** Everything that makes up how Omnia looks. A saved theme is one of these with a name. */
export interface Look {
  scheme: 'auto' | 'light' | 'dark'
  lightPalette: string
  darkPalette: string
  customColours: CustomColours
  accent: string
  headingFont: string
  bodyFont: string
  monoFont: string
  customHeadingFont: string
  customBodyFont: string
  /** Colours for **bold**, *italic*, ***both*** and headings in notes; blank keeps the default. */
  boldColour: string
  italicColour: string
  boldItalicColour: string
  headingColour: string
}

export interface UserTheme { id: string; name: string; look: Look }

export const LOOK_KEYS: (keyof Look)[] = [
  'scheme', 'lightPalette', 'darkPalette', 'customColours', 'accent', 'headingFont', 'bodyFont', 'monoFont',
  'customHeadingFont', 'customBodyFont', 'boldColour', 'italicColour', 'boldItalicColour', 'headingColour'
]

export const DEFAULT_CUSTOM_COLOURS: CustomColours = { enabled: false, dark: false, bg: '#fcf5e1', side: '', text: '#2a2218' }

export interface Settings {
  // Notes
  dailyFolder: string
  /** Where quick capture drops notes, without the .md. */
  inboxNote: string
  /** Notes in this folder show up as templates when creating a note. */
  templatesFolder: string
  bookmarks: string[]
  /** Most recently opened notes and documents, newest first. */
  recent: string[]
  fontSize: number
  readableWidth: boolean
  spellcheck: boolean
  showBreadcrumbs: boolean
  showStatusBar: boolean
  // Study
  newPerDay: number
  // Pomodoro
  focusMin: number
  shortMin: number
  longMin: number
  longEvery: number
  pomoAutoStart: boolean
  pomoSound: boolean
  // Notifications
  notifEnabled: boolean
  /** When the daily summary is sent ("HH:MM"). */
  digestTime: string
  /** Send the summary even when nothing is due. */
  digestEmpty: boolean
  quietEnabled: boolean
  quietStart: string
  quietEnd: string
  /** Deadlines this many days away are included in the daily summary. */
  deadlineLeadDays: number
  // Appearance
  lightPalette: string
  darkPalette: string
  /** Hex colour, or empty for the built-in terracotta. */
  accent: string
  customColours: CustomColours
  boldColour: string
  italicColour: string
  boldItalicColour: string
  headingColour: string
  themes: UserTheme[]
  headingFont: string
  bodyFont: string
  monoFont: string
  customHeadingFont: string
  customBodyFont: string
  /** Multiplies every interface text size. */
  uiScale: number
  lineHeight: number
  density: Density
  reducedMotion: 'system' | 'on' | 'off'
  highContrast: boolean
  // Layout
  sidebarWidth: number
  rightWidth: number
  rightSide: 'left' | 'right'
  startView: 'home' | 'notes' | 'tasks' | 'calendar' | 'study'
  ribbonTop: ToolId[]
  ribbonBottom: ToolId[]
  homeWidgets: HomeWidget[]
  // Tasks and calendar
  weekStart: 'mon' | 'sun'
  upcomingDays: number
  // Documents
  ocrLang: string
  ocrScale: number
  // Keyboard
  shortcuts: Record<string, string>
}

export const DEFAULT_SETTINGS: Settings = {
  dailyFolder: 'Daily', inboxNote: 'Inbox', templatesFolder: 'Templates', bookmarks: [], recent: [], fontSize: 18, readableWidth: true, spellcheck: true, showBreadcrumbs: true, showStatusBar: true,
  newPerDay: 20,
  focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, pomoAutoStart: false, pomoSound: true,
  notifEnabled: true, digestTime: '09:00', digestEmpty: false, quietEnabled: true, quietStart: '22:00', quietEnd: '07:00', deadlineLeadDays: 3,
  lightPalette: 'parchment', darkPalette: 'mocha', accent: '', customColours: { ...DEFAULT_CUSTOM_COLOURS }, boldColour: '', italicColour: '', boldItalicColour: '', headingColour: '', themes: [], headingFont: 'libron', bodyFont: 'inter', monoFont: 'system-mono',
  customHeadingFont: '', customBodyFont: '', uiScale: 1, lineHeight: 1.7, density: 'comfortable', reducedMotion: 'system', highContrast: false,
  sidebarWidth: 300, rightWidth: 340, rightSide: 'right', startView: 'notes',
  ribbonTop: [...DEFAULT_RIBBON_TOP], ribbonBottom: [...DEFAULT_RIBBON_BOTTOM], homeWidgets: DEFAULT_HOME_WIDGETS.map(w => ({ ...w })),
  weekStart: 'mon', upcomingDays: 14,
  ocrLang: 'eng', ocrScale: 2,
  shortcuts: {}
}

/** Merges saved settings over the defaults, dropping unknown tools and padding missing widgets. */
export function normaliseSettings(saved: Partial<Settings> | undefined): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  const valid = (ids: unknown, group: 'top' | 'bottom'): ToolId[] =>
    Array.isArray(ids) ? ids.filter((id): id is ToolId => typeof id === 'string' && id in TOOLS && TOOLS[id as ToolId].group === group) : []
  s.ribbonTop = valid(s.ribbonTop, 'top')
  s.ribbonBottom = valid(s.ribbonBottom, 'bottom')
  const known = new Set(DEFAULT_HOME_WIDGETS.map(w => w.id))
  const have = (Array.isArray(s.homeWidgets) ? s.homeWidgets : []).filter(w => known.has(w.id))
  for (const w of DEFAULT_HOME_WIDGETS) if (!have.some(h => h.id === w.id)) have.push({ ...w })
  s.homeWidgets = have
  s.uiScale = Math.min(1.4, Math.max(0.8, Number(s.uiScale) || 1))
  s.sidebarWidth = Math.min(480, Math.max(200, Number(s.sidebarWidth) || 300))
  s.rightWidth = Math.min(640, Math.max(260, Number(s.rightWidth) || 340))
  if (!s.shortcuts || typeof s.shortcuts !== 'object') s.shortcuts = {}
  s.customColours = { ...DEFAULT_CUSTOM_COLOURS, ...(s.customColours && typeof s.customColours === 'object' ? s.customColours : {}) }
  s.themes = Array.isArray(s.themes) ? s.themes.filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && t.look && typeof t.look === 'object') : []
  return s
}

// ---------------------------------------------------------------- fonts

export interface FontChoice { id: string; label: string; stack: string; note?: string }

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

export const FONTS: FontChoice[] = [
  { id: 'libron', label: 'Libron', stack: "'Libron', 'Newsreader', Georgia, serif", note: 'Bundled' },
  { id: 'inter', label: 'Inter', stack: `'Inter Variable', 'Inter', ${SANS}`, note: 'Bundled' },
  { id: 'system-serif', label: 'System serif', stack: SERIF },
  { id: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'system-sans', label: 'System sans-serif', stack: SANS },
  { id: 'humanist', label: 'Humanist sans', stack: "Seravek, 'Gill Sans Nova', 'Gill Sans', Calibri, 'Trebuchet MS', sans-serif" },
  { id: 'rounded', label: 'Rounded', stack: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, Nunito, system-ui, sans-serif" },
  { id: 'slab', label: 'Slab serif', stack: "Rockwell, 'Roboto Slab', 'Courier New', serif" },
  { id: 'custom', label: 'My own font…', stack: '', note: 'Any font installed on this computer' }
]

export const MONO_FONTS: FontChoice[] = [
  { id: 'system-mono', label: 'System monospace', stack: "ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace" },
  { id: 'courier', label: 'Courier', stack: "'Courier New', Courier, monospace" },
  { id: 'consolas', label: 'Consolas', stack: "Consolas, 'Lucida Console', monospace" },
  { id: 'menlo', label: 'Menlo', stack: "Menlo, Monaco, 'DejaVu Sans Mono', monospace" }
]

// ---------------------------------------------------------------- palettes

export interface Palette { id: string; label: string; dark: boolean; vars: Record<string, string>; swatch: [string, string, string] }

const light = (id: string, label: string, bg: string, side: string, raised: string, border: string, strong: string, text: string, muted: string, faint: string, g1: string, g2: string): Palette => ({
  id, label, dark: false, swatch: [bg, side, text],
  vars: {
    '--bg': bg, '--bg-side': side, '--bg-raised': raised, '--border': border, '--border-strong': strong,
    '--text': text, '--text-muted': muted, '--text-faint': faint,
    '--bg-hover': 'rgba(60, 50, 30, 0.08)', '--bg-active': 'rgba(60, 50, 30, 0.13)',
    '--parchment': `linear-gradient(160deg, ${g1}, ${g2})`
  }
})

const dark = (id: string, label: string, bg: string, side: string, raised: string, border: string, strong: string, text: string, muted: string, faint: string, g1: string, g2: string): Palette => ({
  id, label, dark: true, swatch: [bg, side, text],
  vars: {
    '--bg': bg, '--bg-side': side, '--bg-raised': raised, '--border': border, '--border-strong': strong,
    '--text': text, '--text-muted': muted, '--text-faint': faint,
    '--bg-hover': 'rgba(255, 255, 255, 0.06)', '--bg-active': 'rgba(255, 255, 255, 0.11)',
    '--parchment': `linear-gradient(160deg, ${g1}, ${g2})`
  }
})

export const PALETTES: Palette[] = [
  { id: 'parchment', label: 'Parchment', dark: false, vars: {}, swatch: ['#fcf5e1', '#f6ecd3', '#2a2218'] },
  light('paper', 'Paper', '#fbfaf7', '#f2f0ea', '#ffffff', '#e6e3da', '#d4d0c4', '#23211c', '#7a766a', '#b1ad9f', '#fdfcf9', '#f1efe8'),
  light('sepia', 'Sepia', '#f4ecd8', '#eadfc4', '#faf4e4', '#dccfae', '#c9b98f', '#3b2f1e', '#85745a', '#b5a47e', '#f6eed9', '#eadcbc'),
  light('sage', 'Sage', '#f1f4ea', '#e5eadb', '#f9fbf4', '#d5dcc6', '#bfc9a9', '#232a1c', '#6a7559', '#9fa98d', '#f3f6ec', '#e3e9d6'),
  light('rose', 'Rose', '#fbf1ee', '#f4e3de', '#fff8f6', '#ecd5cf', '#dcbbb2', '#33211f', '#8a6863', '#b99b96', '#fcf3f0', '#f3dfd9'),
  light('mist', 'Mist', '#f2f5f8', '#e6ecf2', '#fafcfe', '#d6dfe8', '#bcc9d6', '#1c2430', '#617187', '#97a5b6', '#f4f7fa', '#e2e9f1'),
  { id: 'mocha', label: 'Mocha', dark: true, vars: {}, swatch: ['#1e1913', '#17130e', '#ece1cb'] },
  dark('slate', 'Slate', '#1b1f26', '#14171d', '#242a34', '#2f3641', '#3e4756', '#e3e7ee', '#98a2b3', '#657084', '#1e232b', '#171b21'),
  dark('midnight', 'Midnight', '#0e1320', '#0a0e19', '#171d2e', '#232b40', '#323c56', '#e6eaf5', '#94a0bf', '#5f6b8a', '#111729', '#0b1020'),
  dark('forest', 'Forest', '#17201a', '#101712', '#1f2a22', '#2b382e', '#3a4a3d', '#e2ebe3', '#94a898', '#627566', '#1b261e', '#131b15'),
  dark('black', 'Black', '#000000', '#0a0a0a', '#141414', '#222222', '#333333', '#eeeeee', '#999999', '#666666', '#050505', '#000000')
]

export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Terracotta', hex: '#d95c3a' }, { label: 'Indigo', hex: '#4f6bd8' }, { label: 'Teal', hex: '#1f8a8a' },
  { label: 'Forest', hex: '#4c8a3c' }, { label: 'Plum', hex: '#8a4fa8' }, { label: 'Rose', hex: '#c9456a' },
  { label: 'Amber', hex: '#c98a12' }, { label: 'Slate', hex: '#5b6b7f' }
]

// ---------------------------------------------------------------- keyboard shortcuts

export interface ActionInfo { id: string; label: string; combo: string; group: string }

/** "Mod" means Ctrl on Windows and Linux, Cmd on a Mac. */
export const ACTIONS: ActionInfo[] = [
  { id: 'switcher', label: 'Quick open a note', combo: 'Mod+O', group: 'Navigate' },
  { id: 'palette', label: 'Command palette', combo: 'Mod+P', group: 'Navigate' },
  { id: 'search', label: 'Search everything', combo: 'Mod+Shift+F', group: 'Navigate' },
  { id: 'back', label: 'Go back', combo: 'Alt+ArrowLeft', group: 'Navigate' },
  { id: 'forward', label: 'Go forward', combo: 'Alt+ArrowRight', group: 'Navigate' },
  { id: 'goHome', label: 'Go to Home', combo: 'Alt+1', group: 'Go to' },
  { id: 'goNotes', label: 'Go to Notes', combo: 'Alt+2', group: 'Go to' },
  { id: 'goTasks', label: 'Go to Tasks', combo: 'Alt+3', group: 'Go to' },
  { id: 'goCalendar', label: 'Go to Calendar', combo: 'Alt+4', group: 'Go to' },
  { id: 'goStudy', label: 'Go to Study', combo: 'Alt+5', group: 'Go to' },
  { id: 'settings', label: 'Open settings', combo: 'Mod+,', group: 'Go to' },
  { id: 'newNote', label: 'New note', combo: 'Alt+N', group: 'Create' },
  { id: 'daily', label: "Today's daily note", combo: 'Alt+D', group: 'Create' },
  { id: 'capture', label: 'Quick capture', combo: 'Alt+Q', group: 'Create' },
  { id: 'pomodoro', label: 'Pomodoro timer', combo: 'Alt+P', group: 'Tools' },
  { id: 'focusMode', label: 'Focus mode (hide everything but the note)', combo: 'Alt+F', group: 'Tools' }
]

// ---------------------------------------------------------------- ready-made themes

type Preset = { id: string; name: string; look: Partial<Look> & { customColours: CustomColours } }
const colours = (dark: boolean, bg: string, side: string, text: string): CustomColours => ({ enabled: true, dark, bg, side, text })

/** Starting points. They can be used as they are, or copied and changed. */
export const THEME_PRESETS: Preset[] = [
  { id: 'preset:solarized-light', name: 'Solarized Light', look: { scheme: 'light', customColours: colours(false, '#fdf6e3', '#eee8d5', '#586e75'), accent: '#268bd2', boldColour: '#cb4b16', italicColour: '#6c71c4', boldItalicColour: '#d33682', headingColour: '#268bd2' } },
  { id: 'preset:solarized-dark', name: 'Solarized Dark', look: { scheme: 'dark', customColours: colours(true, '#002b36', '#073642', '#93a1a1'), accent: '#2aa198', boldColour: '#cb4b16', italicColour: '#b58900', boldItalicColour: '#d33682', headingColour: '#268bd2' } },
  { id: 'preset:nord', name: 'Nord', look: { scheme: 'dark', customColours: colours(true, '#2e3440', '#272c36', '#d8dee9'), accent: '#88c0d0', boldColour: '#ebcb8b', italicColour: '#a3be8c', boldItalicColour: '#b48ead', headingColour: '#81a1c1' } },
  { id: 'preset:dracula', name: 'Dracula', look: { scheme: 'dark', customColours: colours(true, '#282a36', '#21222c', '#f8f8f2'), accent: '#bd93f9', boldColour: '#ffb86c', italicColour: '#8be9fd', boldItalicColour: '#ff79c6', headingColour: '#50fa7b' } },
  { id: 'preset:gruvbox', name: 'Gruvbox', look: { scheme: 'dark', customColours: colours(true, '#282828', '#1d2021', '#ebdbb2'), accent: '#fe8019', boldColour: '#fabd2f', italicColour: '#b8bb26', boldItalicColour: '#d3869b', headingColour: '#83a598' } },
  { id: 'preset:newsprint', name: 'Newsprint', look: { scheme: 'light', customColours: colours(false, '#f5f5f0', '#e9e9e2', '#1d1d1b'), accent: '#8b1a1a', boldColour: '#000000', italicColour: '#5a3e2b', boldItalicColour: '#8b1a1a', headingColour: '#8b1a1a', headingFont: 'georgia', bodyFont: 'georgia' } }
]
