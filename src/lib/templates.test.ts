import { describe, expect, it } from 'vitest'
import { getProperty, hasFrontmatter, readProperties, removeProperty, setProperty } from './frontmatter'
import { applyTemplate, BUILTIN_TEMPLATES, userTemplates } from './templates'

describe('templates', () => {
  it('fills in the placeholders', () => {
    const t = applyTemplate('# {{title}}\n{{date}} {{weekday}} {{time}} {{unknown}}', { title: 'Waves', date: '2026-10-25', time: '09:30' })
    expect(t).toBe('# Waves\n2026-10-25 Sunday 09:30 {{unknown}}')
  })
  it('every built-in has a title heading or properties and unique ids', () => {
    expect(new Set(BUILTIN_TEMPLATES.map(t => t.id)).size).toBe(BUILTIN_TEMPLATES.length)
    for (const t of BUILTIN_TEMPLATES) expect(applyTemplate(t.body, { title: 'X' })).not.toMatch(/\{\{/)
  })
  it('finds templates in the Templates folder', () => {
    const list = userTemplates([{ path: 'Templates/Essay plan.md', text: '# Essay\n\nPlan the essay.' }, { path: 'Other/x.md', text: 'x' }], 'Templates')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Essay plan', description: 'Plan the essay.', builtin: false })
  })
})

describe('frontmatter properties', () => {
  const note = '---\nsubject: Physics\nstatus: draft\ntags: [a, b]\n---\n# Title\n'
  it('reads simple entries', () => {
    expect(readProperties(note)).toEqual([{ key: 'subject', value: 'Physics' }, { key: 'status', value: 'draft' }, { key: 'tags', value: '[a, b]' }])
    expect(getProperty(note, 'STATUS')).toBe('draft')
    expect(hasFrontmatter('# no block')).toBe(false)
  })
  it('edits one line and leaves the rest alone', () => {
    expect(setProperty(note, 'status', 'review')).toBe('---\nsubject: Physics\nstatus: review\ntags: [a, b]\n---\n# Title\n')
  })
  it('adds a property, or the whole block', () => {
    expect(setProperty(note, 'difficulty', 'hard')).toContain('tags: [a, b]\ndifficulty: hard\n---')
    expect(setProperty('# Title\n', 'subject', 'Maths')).toBe('---\nsubject: Maths\n---\n# Title\n')
  })
  it('removes a property, and the block when it empties', () => {
    expect(removeProperty('---\nsubject: Maths\n---\n# T\n', 'subject')).toBe('# T\n')
    expect(setProperty(note, 'status', '')).not.toContain('status')
  })
  it('does nothing when clearing a property that is not there', () => {
    expect(setProperty('# T\n', 'subject', '')).toBe('# T\n')
  })
  it('quotes values YAML would misread', () => {
    expect(setProperty('# T\n', 'topic', 'Waves: an intro')).toContain('topic: "Waves: an intro"')
  })
  it('keeps Windows line endings', () => {
    expect(setProperty('---\r\nsubject: A\r\n---\r\nBody', 'subject', 'B')).toBe('---\r\nsubject: B\r\n---\r\nBody')
  })
})
