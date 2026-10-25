<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { app } from '../lib/app.svelte'
  import { contrastRatio, normaliseHex, paletteChoices } from '../lib/appearance'
  import { notifier } from '../lib/notify.svelte'
  import { OCR_LANGUAGES } from '../lib/ocr'
  import { pomodoro } from '../lib/pomodoro.svelte'
  import {
    ACCENT_PRESETS, ACTIONS, DEFAULT_SETTINGS, FONTS, MONO_FONTS, normaliseSettings, PALETTES, TOOLS,
    type Density, type Settings, type ToolId
  } from '../lib/settings'
  import { comboFor, comboFromEvent, conflictFor, displayCombo } from '../lib/shortcuts'
  import Icon from './Icon.svelte'
  import Setting from './Setting.svelte'

  let query = $state('')
  setContext('settings-query', () => query)

  let root: HTMLDivElement | undefined = $state()
  let capturing = $state<string | null>(null)
  let captureNote = $state('')
  let importInput: HTMLInputElement | undefined = $state()

  onMount(() => {
    if (app.settingsQuery) {
      query = app.settingsQuery
      app.settingsQuery = ''
    }
  })

  const s = $derived(app.settings)
  const set = (patch: Partial<Settings>) => app.updateSettings(patch)
  const isDark = $derived(document.documentElement.dataset.theme === 'dark')

  const sections = [
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'layout', label: 'Layout and panels', icon: 'panel-left' },
    { id: 'tools', label: 'Tools and home', icon: 'sliders' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
    { id: 'tasks', label: 'Tasks and calendar', icon: 'check-square' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'study', label: 'Study', icon: 'study' },
    { id: 'pomodoro', label: 'Pomodoro', icon: 'timer' },
    { id: 'documents', label: 'Documents and OCR', icon: 'file' },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'zap' },
    { id: 'data', label: 'Data and backup', icon: 'download' }
  ]

  function jump(id: string) {
    query = ''
    requestAnimationFrame(() => root?.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ---- appearance helpers
  const bg = $derived(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fcf5e1')
  const accentNow = $derived(normaliseHex(s.accent) ?? '#d95c3a')
  const contrast = $derived(contrastRatio(accentNow, normaliseHex(bg) ?? '#fcf5e1'))
  const fontStack = (id: string, custom: string) => {
    const f = FONTS.find(x => x.id === id)
    return id === 'custom' && custom.trim() ? `'${custom.trim().replace(/['\\]/g, '')}'` : (f?.stack ?? 'inherit')
  }
  const monoStack = $derived(MONO_FONTS.find(f => f.id === s.monoFont)?.stack ?? 'monospace')

  // ---- tools helpers
  const allTools = (group: 'top' | 'bottom') => (Object.keys(TOOLS) as ToolId[]).filter(id => TOOLS[id].group === group)
  const listFor = (group: 'top' | 'bottom') => {
    const on = group === 'top' ? s.ribbonTop : s.ribbonBottom
    return [...on, ...allTools(group).filter(id => !on.includes(id))]
  }
  function toggleTool(group: 'top' | 'bottom', id: ToolId) {
    const on = group === 'top' ? s.ribbonTop : s.ribbonBottom
    const next = on.includes(id) ? on.filter(x => x !== id) : [...on, id]
    set(group === 'top' ? { ribbonTop: next } : { ribbonBottom: next })
  }
  function moveTool(group: 'top' | 'bottom', id: ToolId, dir: -1 | 1) {
    const order = listFor(group)
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    const on = new Set(group === 'top' ? s.ribbonTop : s.ribbonBottom)
    const next = order.filter(x => on.has(x))
    set(group === 'top' ? { ribbonTop: next } : { ribbonBottom: next })
  }
  const widgetLabels: Record<string, string> = { today: 'Tasks for today', deadlines: 'Upcoming deadlines', study: 'Study queue', events: "Today's events", recent: 'Recent notes', focus: 'Focus time', revise: 'Notes to revise' }
  function moveWidget(i: number, dir: -1 | 1) {
    const list = s.homeWidgets.map(w => ({ ...w }))
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set({ homeWidgets: list })
  }
  const toggleWidget = (i: number) => set({ homeWidgets: s.homeWidgets.map((w, k) => (k === i ? { ...w, on: !w.on } : { ...w })) })

  // ---- shortcut capture
  function startCapture(id: string) {
    capturing = id
    captureNote = 'Press the new key combination, or Esc to cancel.'
  }
  function onkeydown(e: KeyboardEvent) {
    if (!capturing) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { capturing = null; return }
    const combo = comboFromEvent(e)
    if (!combo) return
    if (!/[+]/.test(combo) && combo.length === 1) { captureNote = 'Add Ctrl, Alt or ⌘ so it doesn’t clash with typing.'; return }
    const clash = conflictFor(capturing, combo, s.shortcuts)
    if (clash) { captureNote = `${combo.replace('Mod', 'Ctrl')} is already used for “${clash}”.`; return }
    set({ shortcuts: { ...s.shortcuts, [capturing]: combo } })
    capturing = null
  }
  function resetShortcut(id: string) {
    const { [id]: _gone, ...rest } = s.shortcuts
    set({ shortcuts: rest })
  }

  // ---- data
  function exportSettings() {
    const blob = new Blob([JSON.stringify({ omniaSettings: 1, theme: app.theme, settings: s }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'omnia-settings.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  async function importSettings(file: File) {
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object' || !data.settings) throw new Error('not a settings file')
      const keep = { bookmarks: s.bookmarks }
      app.settings = { ...normaliseSettings(data.settings), ...keep }
      if (['auto', 'light', 'dark'].includes(data.theme)) app.setTheme(data.theme)
      app.updateSettings({})
      app.toast('Settings imported')
    } catch (e) {
      app.toast(`Couldn’t import that file: ${(e as Error).message}`)
    }
  }
  function resetAppearance() {
    const d = DEFAULT_SETTINGS
    set({
      lightPalette: d.lightPalette, darkPalette: d.darkPalette, accent: d.accent, headingFont: d.headingFont, bodyFont: d.bodyFont, monoFont: d.monoFont,
      customHeadingFont: '', customBodyFont: '', uiScale: d.uiScale, lineHeight: d.lineHeight, density: d.density, reducedMotion: d.reducedMotion,
      highContrast: d.highContrast, fontSize: d.fontSize
    })
  }
  function setPomo(key: 'focusMin' | 'shortMin' | 'longMin' | 'longEvery', value: string, max: number) {
    set({ [key]: Math.min(max, Math.max(1, Math.round(+value) || 1)) } as Partial<Settings>)
    pomodoro.settingsChanged()
  }

  const permissionText = $derived(
    notifier.permission === 'granted' ? 'Allowed' : notifier.permission === 'denied' ? 'Blocked in the browser' : notifier.permission === 'unsupported' ? 'Not supported here' : 'Not asked yet'
  )
  const densities: Density[] = ['compact', 'comfortable', 'spacious']
  const templateHint = 'Any note in here is offered as a template. Use {{title}}, {{date}}, {{time}} and {{weekday}} inside.'
  const langs = OCR_LANGUAGES.map(l => [l.code, l.label])
</script>

<svelte:window {onkeydown} />

<div class="settings parchment" bind:this={root}>
  <div class="head">
    <h1 class="page-title">Settings</h1>
    <div class="search">
      <Icon name="search" size={16} />
      <input placeholder="Search settings…  (try “font”, “reminder”, “width”)" aria-label="Search settings" bind:value={query} />
      {#if query}<button class="icon-btn" title="Clear" onclick={() => (query = '')}><Icon name="x" size={15} /></button>{/if}
    </div>
  </div>

  <div class="body">
    <nav class="toc" aria-label="Settings sections">
      {#each sections as sec}
        <button onclick={() => jump(sec.id)}><Icon name={sec.icon} size={16} /> {sec.label}</button>
      {/each}
    </nav>

    <div class="content">
      <!-- ============================================================ APPEARANCE -->
      <section id="sec-appearance">
        <h2 class="section-title">Appearance</h2>

        <Setting label="Colour mode" hint="Follow the computer, or always light or dark." keywords="theme dark light auto system night">
          <div class="seg">
            {#each ['auto', 'light', 'dark'] as m}<button class:on={app.theme === m} onclick={() => app.setTheme(m as 'auto' | 'light' | 'dark')}>{m === 'auto' ? 'Match system' : m[0].toUpperCase() + m.slice(1)}</button>{/each}
          </div>
        </Setting>

        <Setting label="Light palette" hint="Background and text colours used in light mode." keywords="colour color background theme parchment paper sepia sage rose mist" stack>
          <div class="palettes">
            {#each paletteChoices(false) as p}
              <button class="pal" class:on={s.lightPalette === p.id} onclick={() => set({ lightPalette: p.id })} aria-label="{p.label} palette" aria-pressed={s.lightPalette === p.id}>
                <span class="sw" style:background={p.swatch[0]} style:border-color={p.swatch[1]}><i style:background={p.swatch[1]}></i><b style:background={p.swatch[2]}></b></span>
                {p.label}
              </button>
            {/each}
          </div>
        </Setting>

        <Setting label="Dark palette" hint="Used in dark mode." keywords="colour color background theme mocha slate midnight forest black" stack>
          <div class="palettes">
            {#each paletteChoices(true) as p}
              <button class="pal" class:on={s.darkPalette === p.id} onclick={() => set({ darkPalette: p.id })} aria-label="{p.label} palette" aria-pressed={s.darkPalette === p.id}>
                <span class="sw" style:background={p.swatch[0]} style:border-color={p.swatch[1]}><i style:background={p.swatch[1]}></i><b style:background={p.swatch[2]}></b></span>
                {p.label}
              </button>
            {/each}
          </div>
        </Setting>

        <Setting label="Accent colour" hint="Buttons, checkboxes, links and highlights." keywords="colour color orange terracotta highlight button" stack>
          <div class="accents">
            {#each ACCENT_PRESETS as a}
              <button class="dot" class:on={accentNow === a.hex && (s.accent !== '' || a.hex === '#d95c3a')} style:background={a.hex} title={a.label} aria-label={a.label} onclick={() => set({ accent: a.hex === '#d95c3a' ? '' : a.hex })}></button>
            {/each}
            <input type="color" aria-label="Custom accent colour" value={accentNow} oninput={e => set({ accent: e.currentTarget.value })} />
            <input class="field hex" aria-label="Accent as hex" placeholder="#d95c3a" value={s.accent} onchange={e => { const v = e.currentTarget.value.trim(); if (!v) set({ accent: '' }); else { const n = normaliseHex(v); if (n) set({ accent: n }); else e.currentTarget.value = s.accent } }} />
            {#if s.accent}<button class="btn" onclick={() => set({ accent: '' })}>Reset</button>{/if}
          </div>
          <p class="note" class:warn={contrast < 3}>Contrast with the page: <strong>{contrast.toFixed(1)}:1</strong>
            {contrast >= 4.5 ? '(excellent for text and controls)' : contrast >= 3 ? '(fine for buttons and large text)' : '(low: buttons may be hard to see; try a darker or lighter shade)'}</p>
        </Setting>

        <Setting label="Heading font" hint="Titles and headings in notes and on every page." keywords="typeface typography libron serif title" stack>
          <div class="fontrow">
            <select class="field" value={s.headingFont} onchange={e => set({ headingFont: e.currentTarget.value })}>
              {#each FONTS as f}<option value={f.id}>{f.label}{f.note && f.id !== 'custom' ? ` (${f.note.toLowerCase()})` : ''}</option>{/each}
            </select>
            {#if s.headingFont === 'custom'}<input class="field" placeholder="Font name, e.g. Garamond" value={s.customHeadingFont} onchange={e => set({ customHeadingFont: e.currentTarget.value })} />{/if}
          </div>
          <div class="preview heading" style:font-family={fontStack(s.headingFont, s.customHeadingFont)}>The quick brown fox jumps over the lazy dog</div>
        </Setting>

        <Setting label="Body font" hint="Everything else: lists, paragraphs, buttons." keywords="typeface typography inter sans text" stack>
          <div class="fontrow">
            <select class="field" value={s.bodyFont} onchange={e => set({ bodyFont: e.currentTarget.value })}>
              {#each FONTS as f}<option value={f.id}>{f.label}{f.note && f.id !== 'custom' ? ` (${f.note.toLowerCase()})` : ''}</option>{/each}
            </select>
            {#if s.bodyFont === 'custom'}<input class="field" placeholder="Font name, e.g. Calibri" value={s.customBodyFont} onchange={e => set({ customBodyFont: e.currentTarget.value })} />{/if}
          </div>
          <div class="preview" style:font-family={fontStack(s.bodyFont, s.customBodyFont)}>Pack my box with five dozen liquor jugs. 0123456789</div>
        </Setting>

        <Setting label="Code font" hint="Code blocks and inline code in notes." keywords="monospace typeface typography" stack>
          <select class="field" value={s.monoFont} onchange={e => set({ monoFont: e.currentTarget.value })}>
            {#each MONO_FONTS as f}<option value={f.id}>{f.label}</option>{/each}
          </select>
          <div class="preview mono" style:font-family={monoStack}>const answer = 42 // monospaced</div>
        </Setting>

        <Setting label="Interface text size" hint="Scales labels, buttons and page headings." keywords="zoom scale larger smaller font size accessibility">
          <input type="range" min="0.85" max="1.3" step="0.05" value={s.uiScale} aria-label="Interface text size" oninput={e => set({ uiScale: +e.currentTarget.value })} />
          <span class="val">{Math.round(s.uiScale * 100)}%</span>
        </Setting>

        <Setting label="Note text size" hint="Text inside the editor." keywords="font size editor writing">
          <input type="range" min="14" max="26" step="1" value={s.fontSize} aria-label="Note text size" oninput={e => set({ fontSize: +e.currentTarget.value })} />
          <span class="val">{s.fontSize}px</span>
        </Setting>

        <Setting label="Line spacing in notes" keywords="leading line height readability">
          <input type="range" min="1.3" max="2.2" step="0.05" value={s.lineHeight} aria-label="Line spacing" oninput={e => set({ lineHeight: +e.currentTarget.value })} />
          <span class="val">{s.lineHeight.toFixed(2)}</span>
        </Setting>

        <Setting label="Interface density" hint="How much room lists and rows take." keywords="compact comfortable spacious spacing padding">
          <div class="seg">
            {#each densities as d}<button class:on={s.density === d} onclick={() => set({ density: d })}>{d[0].toUpperCase() + d.slice(1)}</button>{/each}
          </div>
        </Setting>

        <Setting label="Reduce motion" hint="Turns off transitions and animations." keywords="animation accessibility vestibular">
          <select class="field" value={s.reducedMotion} onchange={e => set({ reducedMotion: e.currentTarget.value as Settings['reducedMotion'] })}>
            <option value="system">Match system</option><option value="on">Always reduce</option><option value="off">Never reduce</option>
          </select>
        </Setting>

        <Setting label="High contrast" hint="Stronger text, borders and focus outlines." keywords="accessibility contrast visibility focus outline">
          <input type="checkbox" class="checkbox" checked={s.highContrast} onchange={e => set({ highContrast: e.currentTarget.checked })} aria-label="High contrast" />
        </Setting>

        <div class="row-actions"><button class="btn ghost" onclick={resetAppearance}><Icon name="undo" size={15} /> Reset appearance to defaults</button></div>
      </section>

      <!-- ============================================================ LAYOUT -->
      <section id="sec-layout">
        <h2 class="section-title">Layout and panels</h2>

        <Setting label="Open on" hint="The page Omnia shows when you open a folder." keywords="start startup home page default view">
          <select class="field" value={s.startView} onchange={e => set({ startView: e.currentTarget.value as Settings['startView'] })}>
            <option value="home">Home</option><option value="notes">Notes</option><option value="tasks">Tasks</option><option value="calendar">Calendar</option><option value="study">Study</option>
          </select>
        </Setting>

        <Setting label="File sidebar width" keywords="panel left width resize">
          <input type="range" min="220" max="440" step="10" value={s.sidebarWidth} aria-label="Sidebar width" oninput={e => set({ sidebarWidth: +e.currentTarget.value })} />
          <span class="val">{s.sidebarWidth}px</span>
        </Setting>

        <Setting label="Study panel position" hint="The panel with links, cards, quizzes and revision." keywords="right panel left side placement">
          <div class="seg">
            <button class:on={s.rightSide === 'left'} onclick={() => set({ rightSide: 'left' })}>Left</button>
            <button class:on={s.rightSide === 'right'} onclick={() => set({ rightSide: 'right' })}>Right</button>
          </div>
        </Setting>

        <Setting label="Study panel width" keywords="panel right width resize">
          <input type="range" min="280" max="560" step="10" value={s.rightWidth} aria-label="Study panel width" oninput={e => set({ rightWidth: +e.currentTarget.value })} />
          <span class="val">{s.rightWidth}px</span>
        </Setting>

        <Setting label="Show the status bar" hint="Backlinks, word and character counts under a note." keywords="footer words characters count">
          <input type="checkbox" class="checkbox" checked={s.showStatusBar} onchange={e => set({ showStatusBar: e.currentTarget.checked })} aria-label="Show status bar" />
        </Setting>
        <Setting label="Show breadcrumbs" hint="The folder path above a note’s title." keywords="path navigation folder">
          <input type="checkbox" class="checkbox" checked={s.showBreadcrumbs} onchange={e => set({ showBreadcrumbs: e.currentTarget.checked })} aria-label="Show breadcrumbs" />
        </Setting>
      </section>

      <!-- ============================================================ TOOLS -->
      <section id="sec-tools">
        <h2 class="section-title">Tools and home</h2>
        <p class="lead">Choose which tools appear in the left-hand bar and in what order. Settings is always there.</p>

        <Setting label="Main tools" hint="The top of the bar." keywords="ribbon toolbar icons sidebar left bar show hide order" stack>
          <ul class="tools">
            {#each listFor('top') as id, i (id)}
              <li>
                <input type="checkbox" class="checkbox" checked={s.ribbonTop.includes(id)} onchange={() => toggleTool('top', id)} aria-label="Show {TOOLS[id].label}" />
                <Icon name={TOOLS[id].icon} size={17} /><span class="grow"><strong>{TOOLS[id].label}</strong> <span class="muted">{TOOLS[id].hint}</span></span>
                <button class="icon-btn" title="Move up" disabled={i === 0} onclick={() => moveTool('top', id, -1)}><Icon name="chevron-down" size={15} /></button>
              </li>
            {/each}
          </ul>
        </Setting>

        <Setting label="Utilities" hint="The bottom of the bar." keywords="ribbon toolbar icons notifications timer theme palette show hide order" stack>
          <ul class="tools">
            {#each listFor('bottom') as id, i (id)}
              <li>
                <input type="checkbox" class="checkbox" checked={s.ribbonBottom.includes(id)} onchange={() => toggleTool('bottom', id)} aria-label="Show {TOOLS[id].label}" />
                <Icon name={TOOLS[id].icon} size={17} /><span class="grow"><strong>{TOOLS[id].label}</strong> <span class="muted">{TOOLS[id].hint}</span></span>
                <button class="icon-btn" title="Move up" disabled={i === 0} onclick={() => moveTool('bottom', id, -1)}><Icon name="chevron-down" size={15} /></button>
              </li>
            {/each}
          </ul>
        </Setting>

        <Setting label="Home dashboard" hint="Choose and order the cards on the Home page." keywords="widgets cards dashboard home show hide" stack>
          <ul class="tools">
            {#each s.homeWidgets as w, i (w.id)}
              <li>
                <input type="checkbox" class="checkbox" checked={w.on} onchange={() => toggleWidget(i)} aria-label="Show {widgetLabels[w.id]}" />
                <span class="grow"><strong>{widgetLabels[w.id]}</strong></span>
                <button class="icon-btn" title="Move up" disabled={i === 0} onclick={() => moveWidget(i, -1)}><Icon name="chevron-down" size={15} /></button>
              </li>
            {/each}
          </ul>
        </Setting>
      </section>

      <!-- ============================================================ NOTES -->
      <section id="sec-notes">
        <h2 class="section-title">Notes</h2>
        <Setting label="Limit line length" hint="Keeps lines at a comfortable reading width." keywords="readable width column wide">
          <input type="checkbox" class="checkbox" checked={s.readableWidth} onchange={e => set({ readableWidth: e.currentTarget.checked })} aria-label="Limit line length" />
        </Setting>
        <Setting label="Spell check" keywords="spelling typo underline">
          <input type="checkbox" class="checkbox" checked={s.spellcheck} onchange={e => set({ spellcheck: e.currentTarget.checked })} aria-label="Spell check" />
        </Setting>
        <Setting label="Inbox note" hint="Quick capture adds thoughts and cards here." keywords="capture inbox jot">
          <input class="field narrow wide" value={s.inboxNote} onchange={e => set({ inboxNote: e.currentTarget.value.trim() || 'Inbox' })} aria-label="Inbox note" />
        </Setting>
        <Setting label="Templates folder" hint={templateHint} keywords="template snippet boilerplate">
          <input class="field narrow wide" value={s.templatesFolder} onchange={e => set({ templatesFolder: e.currentTarget.value.trim() || 'Templates' })} aria-label="Templates folder" />
        </Setting>
        <Setting label="Daily notes folder" hint="Where today’s note is created." keywords="journal diary folder">
          <input class="field narrow" value={s.dailyFolder} onchange={e => set({ dailyFolder: e.currentTarget.value.trim() })} aria-label="Daily notes folder" />
        </Setting>
      </section>

      <!-- ============================================================ TASKS -->
      <section id="sec-tasks">
        <h2 class="section-title">Tasks and calendar</h2>
        <Setting label="Week starts on" keywords="monday sunday calendar first day">
          <div class="seg"><button class:on={s.weekStart === 'mon'} onclick={() => set({ weekStart: 'mon' })}>Monday</button><button class:on={s.weekStart === 'sun'} onclick={() => set({ weekStart: 'sun' })}>Sunday</button></div>
        </Setting>
        <Setting label="Upcoming shows" hint="How far ahead the Upcoming list looks to begin with." keywords="horizon days weeks list">
          <select class="field" value={s.upcomingDays} onchange={e => set({ upcomingDays: +e.currentTarget.value })}>
            {#each [7, 14, 21, 30] as d}<option value={d}>{d} days</option>{/each}
          </select>
        </Setting>
        <Setting label="Deadlines count as “soon” within" hint="Used for colours and the daily summary." keywords="deadline warning days orange">
          <input class="field narrow" type="number" min="1" max="30" value={s.deadlineLeadDays} onchange={e => set({ deadlineLeadDays: Math.min(30, Math.max(1, Math.round(+e.currentTarget.value) || 3)) })} aria-label="Deadline warning days" /><span class="muted">days</span>
        </Setting>
      </section>

      <!-- ============================================================ NOTIFICATIONS -->
      <section id="sec-notifications">
        <h2 class="section-title">Notifications</h2>
        <Setting label="Notifications" hint="A daily summary plus reminders for tasks, deadlines and events." keywords="reminder alert digest daily summary notify">
          <input type="checkbox" class="checkbox" checked={s.notifEnabled} onchange={e => set({ notifEnabled: e.currentTarget.checked })} aria-label="Enable notifications" />
        </Setting>
        <Setting label="Desktop notifications" hint="Permission from your browser. Without it, reminders only appear inside Omnia." keywords="permission allow browser popup status">
          <span class="pill" class:accent={notifier.permission === 'granted'}>{permissionText}</span>
          {#if notifier.permission === 'default'}<button class="btn primary" onclick={() => notifier.enable()}>Allow</button>{/if}
          <button class="btn" onclick={() => notifier.sendTest()}>Send a test</button>
        </Setting>
        <Setting label="Daily summary time" hint="One notification a day listing what is overdue, due today and due soon." keywords="digest morning time every day">
          <input class="field time" type="time" value={s.digestTime} onchange={e => set({ digestTime: e.currentTarget.value || '09:00' })} aria-label="Daily summary time" />
        </Setting>
        <Setting label="Send even when nothing is due" keywords="empty digest always">
          <input type="checkbox" class="checkbox" checked={s.digestEmpty} onchange={e => set({ digestEmpty: e.currentTarget.checked })} aria-label="Send even when nothing is due" />
        </Setting>
        <Setting label="Quiet hours" hint="Nothing is sent in this window; reminders that fall inside it arrive when it ends." keywords="do not disturb night mute silence">
          <input type="checkbox" class="checkbox" checked={s.quietEnabled} onchange={e => set({ quietEnabled: e.currentTarget.checked })} aria-label="Quiet hours" />
          <input class="field time" type="time" disabled={!s.quietEnabled} value={s.quietStart} onchange={e => set({ quietStart: e.currentTarget.value || '22:00' })} aria-label="Quiet hours start" />
          <span class="muted">to</span>
          <input class="field time" type="time" disabled={!s.quietEnabled} value={s.quietEnd} onchange={e => set({ quietEnd: e.currentTarget.value || '07:00' })} aria-label="Quiet hours end" />
        </Setting>
        <p class="note">Browsers can only show notifications while Omnia is open in a tab or window (a pinned or minimised tab is fine). Reminders that came due while it was closed appear when you next open it, up to 12 hours late.</p>
      </section>

      <!-- ============================================================ STUDY -->
      <section id="sec-study">
        <h2 class="section-title">Study</h2>
        <Setting label="New flashcards per day" hint="How many never-seen cards are added to each day’s review." keywords="limit cards daily new">
          <input class="field narrow" type="number" min="0" max="500" value={s.newPerDay} onchange={e => set({ newPerDay: Math.max(0, Math.round(+e.currentTarget.value) || 0) })} aria-label="New flashcards per day" />
        </Setting>
      </section>

      <!-- ============================================================ POMODORO -->
      <section id="sec-pomodoro">
        <h2 class="section-title">Pomodoro</h2>
        <Setting label="Focus session" keywords="work minutes timer length">
          <input class="field narrow" type="number" min="1" max="180" value={s.focusMin} onchange={e => setPomo('focusMin', e.currentTarget.value, 180)} aria-label="Focus minutes" /><span class="muted">min</span>
        </Setting>
        <Setting label="Short break" keywords="rest minutes">
          <input class="field narrow" type="number" min="1" max="60" value={s.shortMin} onchange={e => setPomo('shortMin', e.currentTarget.value, 60)} aria-label="Short break minutes" /><span class="muted">min</span>
        </Setting>
        <Setting label="Long break" keywords="rest minutes">
          <input class="field narrow" type="number" min="1" max="120" value={s.longMin} onchange={e => setPomo('longMin', e.currentTarget.value, 120)} aria-label="Long break minutes" /><span class="muted">min</span>
        </Setting>
        <Setting label="Long break after every" keywords="sessions cycle">
          <input class="field narrow" type="number" min="1" max="12" value={s.longEvery} onchange={e => setPomo('longEvery', e.currentTarget.value, 12)} aria-label="Sessions before a long break" /><span class="muted">sessions</span>
        </Setting>
        <Setting label="Start the next session automatically" keywords="auto continue">
          <input type="checkbox" class="checkbox" checked={s.pomoAutoStart} onchange={e => set({ pomoAutoStart: e.currentTarget.checked })} aria-label="Auto start" />
        </Setting>
        <Setting label="Chime when a session ends" keywords="sound audio beep">
          <input type="checkbox" class="checkbox" checked={s.pomoSound} onchange={e => set({ pomoSound: e.currentTarget.checked })} aria-label="Chime" />
        </Setting>
      </section>

      <!-- ============================================================ DOCUMENTS -->
      <section id="sec-documents">
        <h2 class="section-title">Documents and OCR</h2>
        <Setting label="OCR language" hint="For scanned PDFs without selectable text. English is built in; other languages download once (needs internet)." keywords="ocr scan text recognition language english french">
          <select class="field" value={s.ocrLang} onchange={e => set({ ocrLang: e.currentTarget.value })}>
            {#each langs as [id, name]}<option value={id}>{name}</option>{/each}
          </select>
        </Setting>
        <Setting label="OCR quality" hint="Higher is more accurate on small print but slower." keywords="ocr resolution dpi speed accuracy scan">
          <select class="field" value={String(s.ocrScale)} onchange={e => set({ ocrScale: +e.currentTarget.value })}>
            <option value="1.5">Fast</option><option value="2">Balanced</option><option value="3">Best</option>
          </select>
        </Setting>
      </section>

      <!-- ============================================================ SHORTCUTS -->
      <section id="sec-shortcuts">
        <h2 class="section-title">Keyboard shortcuts</h2>
        {#if capturing}<p class="note capture" role="status">{captureNote}</p>{/if}
        {#each ACTIONS as a (a.id)}
          <Setting label={a.label} keywords="shortcut key binding hotkey {a.group}">
            {#each displayCombo(comboFor(a.id, s.shortcuts)) as k}<kbd>{k}</kbd>{/each}
            <button class="btn" class:primary={capturing === a.id} onclick={() => (capturing === a.id ? (capturing = null) : startCapture(a.id))}>{capturing === a.id ? 'Listening…' : 'Change'}</button>
            {#if s.shortcuts[a.id]}<button class="icon-btn" title="Reset to {a.combo}" onclick={() => resetShortcut(a.id)}><Icon name="undo" size={15} /></button>{/if}
          </Setting>
        {/each}
        <p class="note">Ctrl+K also opens the command palette when you are not typing in a note.</p>
      </section>

      <!-- ============================================================ DATA -->
      <section id="sec-data">
        <h2 class="section-title">Data and backup</h2>
        <Setting label="Folder" hint="Your notes, tasks and progress live here as plain files." keywords="vault directory location">
          <strong>{app.vault?.name}</strong><button class="btn" onclick={() => app.chooseFolder()}>Change…</button>
        </Setting>
        <Setting label="Export settings" hint="Save your appearance, layout, shortcuts and preferences to a file." keywords="backup download json">
          <button class="btn" onclick={exportSettings}><Icon name="download" size={15} /> Export</button>
        </Setting>
        <Setting label="Import settings" hint="Load a file you exported earlier (on this or another computer)." keywords="restore upload json">
          <button class="btn" onclick={() => importInput?.click()}><Icon name="upload" size={15} /> Import…</button>
          <input type="file" accept="application/json,.json" hidden bind:this={importInput} onchange={e => { const f = e.currentTarget.files?.[0]; if (f) void importSettings(f); e.currentTarget.value = '' }} />
        </Setting>
        <Setting label="Reset every setting" hint="Back to the defaults. Your notes, tasks and bookmarks are not touched." keywords="default restore factory">
          <button class="btn danger" onclick={() => { if (confirm('Reset all settings to their defaults?')) app.resetSettings() }}>Reset all</button>
        </Setting>
      </section>

      {#if query.trim()}
        <p class="empty-search muted">Nothing else matches “{query}”.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings { height: 100%; overflow: auto; }
  .parchment { background: var(--parchment); }
  .head { position: sticky; top: 0; z-index: 5; padding: 40px 40px 14px; max-width: 1080px; margin: 0 auto; display: flex; align-items: flex-end; gap: 24px; flex-wrap: wrap; background: linear-gradient(var(--bg), transparent); }
  .head .page-title { margin: 0; }
  .search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 260px; max-width: 440px; padding: 4px 12px; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 10px; margin-bottom: 6px; }
  .search input { flex: 1; background: transparent; border: 0; outline: none; padding: 7px 0; font-size: var(--fs-md); min-width: 0; }
  .body { max-width: 1080px; margin: 0 auto; padding: 8px 40px 120px; display: grid; grid-template-columns: 200px 1fr; gap: 36px; align-items: start; }
  .toc { position: sticky; top: 110px; display: grid; gap: 2px; }
  .toc button { display: flex; align-items: center; gap: 10px; text-align: left; padding: 7px 10px; border-radius: 8px; color: var(--text-muted); font-size: var(--fs-md); }
  .toc button:hover { background: var(--bg-hover); color: var(--text); }
  .content { min-width: 0; }
  section { background: color-mix(in srgb, var(--bg-raised) 72%, transparent); border: 1px solid var(--border); border-radius: 16px; padding: 22px 26px 14px; margin-bottom: 20px; scroll-margin-top: 96px; }
  section :global(.section-title) { margin-bottom: 6px; }
  section:not(:has(:global(.setting:not(.hidden)))) { display: none; }
  .lead { color: var(--text-muted); margin: 0 0 6px; font-size: var(--fs-md); }
  .note { font-size: var(--fs-sm); color: var(--text-muted); margin: 6px 0 10px; line-height: 1.5; }
  .note.warn { color: var(--bad); }
  .note.capture { background: var(--accent-soft); padding: 8px 12px; border-radius: 8px; color: var(--text); }
  .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--bg-hover); }
  .seg button { padding: 5px 13px; border-radius: 8px; font-size: var(--fs-sm); color: var(--text-muted); }
  .seg button.on { background: var(--bg-raised); color: var(--text); box-shadow: 0 1px 3px rgba(70, 48, 12, 0.2); }
  .palettes { display: flex; flex-wrap: wrap; gap: 10px; }
  .pal { display: grid; gap: 6px; justify-items: center; font-size: var(--fs-sm); color: var(--text-muted); padding: 8px; border-radius: 12px; border: 2px solid transparent; }
  .pal:hover { background: var(--bg-hover); }
  .pal.on { border-color: var(--accent); color: var(--text); }
  .sw { position: relative; display: block; width: 72px; height: 48px; border-radius: 8px; border: 1px solid; overflow: hidden; }
  .sw i { position: absolute; inset: 0 auto 0 0; width: 22px; }
  .sw b { position: absolute; left: 30px; top: 12px; width: 32px; height: 5px; border-radius: 3px; box-shadow: 0 10px 0 -1px currentColor; }
  .accents { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; }
  .dot.on { box-shadow: 0 0 0 2px var(--bg-raised), 0 0 0 4px var(--text); }
  input[type='color'] { width: 34px; height: 30px; border: 1px solid var(--border-strong); border-radius: 8px; padding: 0; background: none; cursor: pointer; }
  .hex { width: 110px; }
  .fontrow { display: flex; gap: 10px; flex-wrap: wrap; }
  .fontrow .field { width: 230px; }
  .preview { padding: 12px 16px; border-radius: 10px; background: var(--bg-hover); font-size: var(--fs-lg); line-height: 1.4; }
  .preview.heading { font-size: var(--fs-section); font-weight: 700; }
  .preview.mono { font-size: var(--fs-md); }
  input[type='range'] { accent-color: var(--accent); width: 200px; }
  .val { font-variant-numeric: tabular-nums; color: var(--text-muted); min-width: 48px; font-size: var(--fs-sm); }
  .narrow { width: 90px; } .narrow.wide { width: 180px; } .time { width: 150px; }
  .tools { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; width: 100%; }
  .tools li { display: flex; align-items: center; gap: 12px; padding: 5px 8px; border-radius: 8px; font-size: var(--fs-md); }
  .tools li:hover { background: var(--bg-hover); }
  .tools li :global(.icon-btn) { transform: rotate(180deg); }
  .row-actions { padding: 12px 0 6px; }
  .empty-search { padding: 20px 4px; }
  @media (max-width: 820px) { .body { grid-template-columns: 1fr; } .toc { display: none; } }
</style>
