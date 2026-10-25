import { app } from './app.svelte'
import { noteTitle } from './vault'
import { pomodoro } from './pomodoro.svelte'

export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function getCommands(): Command[] {
  const path = app.activePath
  const cmds: Command[] = [
    { id: 'new-note', label: 'New note', hint: 'Alt+N', run: () => void app.createNote(app.currentFolder(), 'Untitled') },
    { id: 'new-template', label: 'New note from template…', run: () => (app.modal = { type: 'template' }) },
    { id: 'new-folder', label: 'New folder', run: () => void app.createFolder(app.currentFolder()) },
    { id: 'daily', label: "Open today's daily note", hint: 'Alt+D', run: () => void app.openDaily() },
    { id: 'switcher', label: 'Quick open note…', hint: 'Ctrl+O', run: () => (app.modal = { type: 'switcher' }) },
    { id: 'search', label: 'Search all notes', hint: 'Ctrl+Shift+F', run: () => { app.view = 'notes'; app.leftOpen = true; app.sidebarTab = 'search' } },
    { id: 'go-notes', label: 'Go to Notes', run: () => (app.view = 'notes') },
    { id: 'go-tasks', label: 'Go to Tasks', run: () => (app.view = 'tasks') },
    { id: 'go-calendar', label: 'Go to Calendar', run: () => (app.view = 'calendar') },
    { id: 'go-study', label: 'Go to Study dashboard', run: () => (app.view = 'study') },
    { id: 'toggle-left', label: 'Toggle file sidebar', run: () => (app.leftOpen = !app.leftOpen) },
    { id: 'toggle-right', label: 'Toggle study sidebar', run: () => (app.rightOpen = !app.rightOpen) },
    { id: 'pomo-toggle', label: pomodoro.running ? 'Pomodoro: pause timer' : 'Pomodoro: start timer', hint: 'Alt+P to open', run: () => { app.pomodoroOpen = true; pomodoro.toggle() } },
    { id: 'pomo-skip', label: 'Pomodoro: skip to next session', run: () => pomodoro.skip() },
    { id: 'review-all', label: 'Review all due flashcards', run: () => (app.modal = { type: 'review', scope: { type: 'all' } }) },
    { id: 'theme', label: 'Cycle theme (auto, light, dark)', run: () => app.setTheme(app.theme === 'auto' ? 'light' : app.theme === 'light' ? 'dark' : 'auto') },
    { id: 'settings', label: 'Open settings', run: () => app.openSettings() },
    { id: 'help', label: 'Help and keyboard shortcuts', run: () => (app.modal = { type: 'help' }) },
    { id: 'trash', label: 'Open trash (restore deleted notes)', run: () => (app.modal = { type: 'trash' }) },
    { id: 'refresh', label: 'Rescan folder for changes', run: () => void app.refresh() },
    { id: 'change-folder', label: 'Choose a different folder…', run: () => void app.chooseFolder() }
  ]
  if (app.view === 'notes' || path) {
    cmds.push(
      { id: 'back', label: 'Go back', hint: 'Alt+Left', run: () => app.goBack() },
      { id: 'forward', label: 'Go forward', hint: 'Alt+Right', run: () => app.goForward() }
    )
  }
  if (path) {
    cmds.push(
      { id: 'reading', label: app.readingMode ? 'Switch to editing' : 'Switch to reading view', run: () => (app.readingMode = !app.readingMode) },
      { id: 'bookmark', label: app.isBookmarked(path) ? `Remove bookmark: ${noteTitle(path)}` : `Bookmark: ${noteTitle(path)}`, run: () => app.toggleBookmark(path) },
      { id: 'history', label: 'Version history of this note', run: () => (app.modal = { type: 'history', path }) },
      { id: 'save-version', label: 'Save a version of this note now', run: () => void app.saveVersion(path) },
      { id: 'save-template', label: 'Save this note as a template', run: () => void app.saveAsTemplate(path) },
      { id: 'close-tab', label: 'Close current tab', run: () => app.activeTabId && app.closeTab(app.activeTabId) },
      { id: 'review-note', label: 'Review flashcards in this note', run: () => (app.modal = { type: 'review', scope: { type: 'note', path } }) },
      { id: 'quiz-note', label: 'Quiz me on this note', run: () => (app.modal = { type: 'quiz', scope: { type: 'note', path } }) },
      { id: 'autogen', label: 'Generate flashcards and quiz questions from this note', run: () => (app.modal = { type: 'autogen', path }) },
      { id: 'cards-panel', label: 'Show flashcards panel', run: () => { app.view = 'notes'; app.rightOpen = true; app.rightTab = 'cards' } },
      { id: 'revise-panel', label: 'Show spaced-repetition panel', run: () => { app.view = 'notes'; app.rightOpen = true; app.rightTab = 'revise' } },
      { id: 'info-panel', label: 'Show backlinks and outline', run: () => { app.view = 'notes'; app.rightOpen = true; app.rightTab = 'info' } }
    )
  }
  return cmds
}
