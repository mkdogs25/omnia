import { describe, expect, it } from 'vitest'
import { renderInline } from './inline'

describe('renderInline', () => {
  it('escapes HTML', () => {
    expect(renderInline('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('renders emphasis, code and highlights', () => {
    expect(renderInline('**b** *i* `c` ==h==')).toBe('<strong>b</strong> <em>i</em> <code>c</code> <mark>h</mark>')
  })
  it('keeps code content literal', () => {
    expect(renderInline('`*not italic*`')).toBe('<code>*not italic*</code>')
  })
  it('renders cloze markers', () => {
    expect(renderInline('a \u0001…\u0002 b')).toContain('<span class="blank">…</span>')
    expect(renderInline('a \u0003x\u0004')).toContain('<span class="answer">x</span>')
  })
  it('renders maths with KaTeX', () => {
    expect(renderInline('$x^2$')).toContain('katex')
  })
})
