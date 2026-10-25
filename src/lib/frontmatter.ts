// A small reader and editor for the "properties" block at the top of a note:
//
//   ---
//   subject: Physics
//   status: review
//   tags: [exam, waves]
//   ---
//
// Only single-line `key: value` entries are edited. Anything else in the block (lists spread over several lines,
// nested values, comments) is left exactly as it was.

export interface Property { key: string; value: string }

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function hasFrontmatter(text: string): boolean {
  return BLOCK.test(text)
}

export function readProperties(text: string): Property[] {
  const m = text.match(BLOCK)
  if (!m) return []
  const out: Property[] = []
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w -]*?)\s*:\s*(.*)$/)
    if (kv) out.push({ key: kv[1].trim(), value: unquote(kv[2].trim()) })
  }
  return out
}

export function getProperty(text: string, key: string): string {
  return readProperties(text).find(p => p.key.toLowerCase() === key.toLowerCase())?.value ?? ''
}

function unquote(v: string): string {
  const m = v.match(/^(["'])(.*)\1$/)
  return m ? m[2] : v
}

function quoteIfNeeded(v: string): string {
  // Values that YAML would read as something else (or that start with a character it treats specially) are quoted.
  return /^[\s>|&*!%@`#'"\[{-]|:\s|\s#|\s$/.test(v) ? JSON.stringify(v) : v
}

/** Sets a property (adding the block or the line if needed); an empty value removes it unless `keepEmpty`. */
export function setProperty(text: string, key: string, value: string, keepEmpty = false): string {
  const v = value.trim()
  const m = text.match(BLOCK)
  const line = v || keepEmpty ? `${key}: ${quoteIfNeeded(v)}` : null
  if (!m) {
    if (line === null) return text
    return `---\n${line}\n---\n${text}`
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = m[1].split(/\r?\n/)
  const at = lines.findIndex(l => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i').test(l))
  if (at >= 0) {
    if (line === null) lines.splice(at, 1)
    else lines[at] = line
  } else if (line !== null) lines.push(line)
  const block = lines.length ? `---${eol}${lines.join(eol)}${eol}---${eol}` : ''
  return block + text.slice(m[0].length)
}

export function removeProperty(text: string, key: string): string {
  return setProperty(text, key, '')
}

export const STATUS_OPTIONS = ['draft', 'in progress', 'review', 'done', 'reading']
export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard']
export const COMMON_KEYS = ['subject', 'topic', 'status', 'difficulty']
