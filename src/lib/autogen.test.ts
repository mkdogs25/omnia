import { describe, expect, it } from 'vitest'
import { appendCards, appendQuestions, generate, insertUnderHeading, numericDistractors, splitSentences } from './autogen'
import { extractCards } from './cards'
import { questionsFromNote } from './quiz'

const seq = () => { let n = 0; return () => ((n = (n * 7 + 3) % 11) / 11) }

const NOTE = `# Cells

## Organelles

**Mitochondria**: the organelles that release energy from glucose by respiration.
**Ribosome** is the site of protein synthesis in all living cells.
**Nucleus** – contains the genetic material and controls the activities of the cell.
**Chloroplast**: the organelle where photosynthesis takes place in plant cells.

The cell membrane is **selectively permeable**, so it controls what enters and leaves the cell.

The speed of light is 3 × 10^8 m/s in a vacuum and nothing travels faster than that.
The war ended in 1945 after years of fighting across many countries.

The stages of mitosis are:

- Prophase
- Metaphase
- Anaphase
- Telophase

## Osmosis

Osmosis is the net movement of water across a partially permeable membrane from high to low water potential.

Already a card :: this one is ignored
`

describe('splitSentences', () => {
  it('does not split on abbreviations', () => {
    expect(splitSentences('Use e.g. salt. Then stir.')).toEqual(['Use e.g. salt.', 'Then stir.'])
  })
})

describe('generate', () => {
  const g = generate(NOTE, 'Cells.md', { random: seq() })
  const texts = g.cards.map(c => c.text)

  it('finds bold-colon, bold-is and dash definitions', () => {
    expect(texts).toContain('Mitochondria :: the organelles that release energy from glucose by respiration')
    expect(texts.some(t => t.startsWith('Ribosome :: the site of protein synthesis'))).toBe(true)
    expect(texts.some(t => t.startsWith('Nucleus :: contains the genetic material'))).toBe(true)
  })

  it('makes clozes from highlighted words', () => {
    expect(texts.some(t => t.includes('{{c1::selectively permeable}}'))).toBe(true)
  })

  it('hides figures with their units', () => {
    expect(texts.some(t => t.includes('{{c1::3 × 10^8 m/s}}'))).toBe(true)
    expect(texts.some(t => t.includes('{{c1::1945}}'))).toBe(true)
  })

  it('turns an introduced list into a list card', () => {
    const list = g.cards.find(c => c.rule === 'list')
    expect(list?.text).toBe('The stages of mitosis are (list all 4)\n?\n- Prophase\n- Metaphase\n- Anaphase\n- Telophase')
  })

  it('makes a heading card from the first sentence', () => {
    expect(texts.some(t => t.startsWith('Osmosis :: Osmosis is the net movement of water'))).toBe(true)
  })

  it('ignores lines that are already cards', () => {
    expect(texts.some(t => t.includes('Already a card'))).toBe(false)
  })

  it('every suggestion parses back into real cards', () => {
    for (const c of g.cards) expect(extractCards(c.text, 'x.md').length, c.text).toBeGreaterThan(0)
  })

  it('hides suggestions that already exist, and is stable between runs', () => {
    const ids = new Set(g.cards.flatMap(c => c.ids))
    expect(generate(NOTE, 'Cells.md', { existingCardIds: ids }).cards).toHaveLength(0)
    expect(generate(NOTE, 'Cells.md').cards.map(c => c.key)).toEqual(generate(NOTE, 'Cells.md').cards.map(c => c.key))
  })

  it('builds multiple choice questions with the right answer inside', () => {
    expect(g.questions.length).toBeGreaterThan(2)
    for (const { q } of g.questions) {
      if (q.kind === 'choice') {
        expect(q.options.filter(o => o.correct)).toHaveLength(1)
        expect(new Set(q.options.map(o => o.text)).size).toBe(q.options.length)
      }
    }
    const def = g.questions.find(x => x.rule === 'definition')
    expect(def?.q.prompt).toMatch(/^Which term matches/)
  })

  it('serialises questions that parse back', () => {
    const back = questionsFromNote('```quiz\n' + g.questions.map(q => q.text).join('\n\n') + '\n```')
    expect(back).toHaveLength(g.questions.length)
    expect(back.map(b => b.id).sort()).toEqual(g.questions.map(q => q.q.id).sort())
  })

  it('skips questions that already exist', () => {
    const ids = new Set(g.questions.map(q => q.q.id))
    expect(generate(NOTE, 'Cells.md', { existingQuestionIds: ids, random: seq() }).questions).toHaveLength(0)
  })

  it('leaves code, tables and maths alone', () => {
    const out = generate('```\n**x**: this is code and not a definition at all\n```\n\n| **a** | b |\n\nThe value is $x = 1000$ metres in the model above.\n', 'a.md')
    expect(out.cards).toHaveLength(0)
  })
})

describe('numericDistractors', () => {
  it('keeps format and never repeats the answer', () => {
    const d = numericDistractors('1,200 kg', seq())
    expect(d.length).toBeGreaterThanOrEqual(3)
    expect(d).not.toContain('1,200 kg')
    expect(d.every(x => x.endsWith(' kg'))).toBe(true)
  })
  it('handles years and powers of ten', () => {
    expect(numericDistractors('1945', seq()).every(x => /^\d{4}$/.test(x))).toBe(true)
    expect(numericDistractors('3 × 10^8 m/s', seq()).every(x => x.endsWith(' m/s') && x.includes('×'))).toBe(true)
  })
})

describe('writing back', () => {
  it('creates a Flashcards section and then reuses it', () => {
    const once = appendCards('# A\n\nText\n', [{ text: 'Q :: A' }])
    expect(once).toBe('# A\n\nText\n\n## Flashcards\n\nQ :: A\n')
    const twice = appendCards(once, [{ text: 'X :: Y' }])
    expect(twice).toBe('# A\n\nText\n\n## Flashcards\n\nQ :: A\n\nX :: Y\n')
  })
  it('keeps content that follows the section', () => {
    expect(insertUnderHeading('## Flashcards\n\nQ :: A\n\n## More\n\ntext\n', 'Flashcards', 'X :: Y')).toBe('## Flashcards\n\nQ :: A\n\nX :: Y\n\n## More\n\ntext\n')
  })
  it('appends to an existing quiz block', () => {
    const out = appendQuestions('```quiz\nOne?\n= a\n```\n', [{ text: 'Two?\n= b' }])
    expect(questionsFromNote(out).map(q => q.prompt)).toEqual(['One?', 'Two?'])
  })
})
