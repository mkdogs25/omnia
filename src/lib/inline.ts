import katex from 'katex'

// Renders a short piece of Markdown (a flashcard side, a quiz prompt) to safe HTML.
// Everything is escaped first; only the constructs handled here produce tags.
// Cloze markers from cards.ts (\u0001 hidden, \u0003 revealed) become styled spans.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function math(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false })
  } catch {
    return `<code>${esc(tex)}</code>`
  }
}

export function renderInline(src: string): string {
  const stash: string[] = []
  const keep = (html: string) => `${stash.push(html) - 1}`
  let s = src

  s = s.replace(/`([^`\n]+)`/g, (_m, c) => keep(`<code>${esc(c)}</code>`))
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, t) => keep(math(t.trim(), true)))
  s = s.replace(/(?<![\\$\w])\$(?!\s|\$)([^$\n]*?[^\s$\\])\$(?![\d$])/g, (_m, t) => keep(math(t, false)))
  // Cloze spans may wrap maths, so protect their content boundaries before escaping.
  s = esc(s)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, '<em>$1</em>')
  s = s.replace(/(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g, '<em>$1</em>')
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>')
  s = s.replace(/==(.+?)==/g, '<mark>$1</mark>')
  s = s.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, t, alias) => `<span class="wl">${alias ?? t}</span>`)
  s = s.replace(/\n/g, '<br>')
  s = s.replace(/\u0001([\s\S]*?)\u0002/g, '<span class="blank">$1</span>')
  s = s.replace(/\u0003([\s\S]*?)\u0004/g, '<span class="answer">$1</span>')
  return s.replace(/(\d+)/g, (_m, i) => stash[+i])
}

export function plainText(src: string): string {
  return src.replace(/[\u0001\u0002\u0003\u0004]/g, '').replace(/\{\{c\d+::(.+?)(?:::.+?)?\}\}/g, '$1').replace(/[*_`~=]/g, '').replace(/\s+/g, ' ').trim()
}
