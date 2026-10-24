import { describe, expect, it } from 'vitest'
import { clozeHidden, clozeRevealed, extractCards, wrapCloze } from './cards'
import { addQuestionToNote, appendQuizBlock, generateQuestions, isCorrectText, parseQuizBlock, questionsFromNote, serializeQuestion } from './quiz'
import { isDue, nextRevision, previewIntervals, schedule, startOfDay } from './sr'
import { parseNote } from './noteparse'
import { addDays } from './dates'

describe('extractCards', () => {
  it('reads one-line, reversed, multi-line and cloze cards', () => {
    const note = [
      '# Physics',
      'Unit of force :: newton',
      '- Unit of power ::: watt',
      '',
      'What is the speed of light?',
      '?',
      '3 x 10^8 m/s',
      '',
      'The {{c1::photon}} carries the {{c2::electromagnetic}} force',
    ].join('\n')
    const cards = extractCards(note, 'Physics.md')
    expect(cards.map(c => [c.kind, c.front.slice(0, 12), c.clozeIndex])).toEqual([
      ['basic', 'Unit of forc', undefined],
      ['basic', 'Unit of powe', undefined],
      ['basic', 'watt', undefined],
      ['basic', 'What is the ', undefined],
      ['cloze', 'The {{c1::ph', 1],
      ['cloze', 'The {{c1::ph', 2],
    ])
  })
  it('ignores code blocks and frontmatter', () => {
    const note = '---\ntitle: a :: b\n---\n```\nx :: y\n```\nreal :: card'
    expect(extractCards(note, 'n.md').map(c => c.front)).toEqual(['real'])
  })
  it('gives edits to the back of a card the same id', () => {
    const a = extractCards('Term :: one', 'a.md')[0]
    const b = extractCards('Term :: two', 'b.md')[0]
    expect(a.id).toBe(b.id)
  })
  it('hides and reveals the right cloze', () => {
    const t = 'The {{c1::photon::particle}} carries {{c2::light}}'
    expect(clozeHidden(t, 1)).toBe('The \u0001particle\u0002 carries light')
    expect(clozeRevealed(t, 2)).toBe('The photon carries \u0003light\u0004')
  })
  it('numbers new clozes after existing ones', () => {
    expect(wrapCloze('x', 'a {{c1::b}} {{c3::c}}')).toBe('{{c4::x}}')
  })
})

describe('quiz', () => {
  const block = 'What is the SI unit of force?\n- Joule\n+ Newton\n- Watt\n> F = ma\n\nName the carrier of light.\n= photon | a photon'
  it('parses choice and text questions', () => {
    const qs = parseQuizBlock(block)
    expect(qs).toHaveLength(2)
    expect(qs[0]).toMatchObject({ kind: 'choice', explanation: 'F = ma' })
    expect(qs[0].options.filter(o => o.correct).map(o => o.text)).toEqual(['Newton'])
    expect(qs[1]).toMatchObject({ kind: 'text', answers: ['photon', 'a photon'] })
  })
  it('finds blocks in a note and round-trips serialisation', () => {
    const note = `intro\n\n\`\`\`quiz\n${block}\n\`\`\`\n`
    const qs = questionsFromNote(note)
    expect(qs).toHaveLength(2)
    expect(parseQuizBlock(serializeQuestion(qs[0]))[0]).toMatchObject({ prompt: qs[0].prompt, kind: 'choice' })
  })
  it('appends a block', () => {
    const out = appendQuizBlock('# Note', { kind: 'text', prompt: 'Q?', options: [], answers: ['a'] })
    expect(questionsFromNote(out)).toHaveLength(1)
  })
  it('adds a question to an existing block', () => {
    const note = '# N\n\n```quiz\nA?\n= a\n```\n\nafter'
    const out = addQuestionToNote(note, { kind: 'text', prompt: 'B?', options: [], answers: ['b'] })
    expect(questionsFromNote(out).map(q => q.prompt)).toEqual(['A?', 'B?'])
    expect(out.endsWith('after')).toBe(true)
  })
  it('grades typed answers forgivingly', () => {
    expect(isCorrectText('The Photon.', ['photon'])).toBe(true)
    expect(isCorrectText('protons', ['photon'])).toBe(false)
    expect(isCorrectText('electromagnatic', ['electromagnetic'])).toBe(true)
    expect(isCorrectText('', ['x'])).toBe(false)
  })
  it('generates multiple choice with distractors', () => {
    const cards = extractCards('A :: one\nB :: two\nC :: three\nD :: four', 'n.md')
    const qs = generateQuestions(cards, { mode: 'choice', count: 4, random: () => 0.3 })
    expect(qs).toHaveLength(4)
    for (const q of qs) {
      expect(q.kind).toBe('choice')
      expect(q.options.filter(o => o.correct)).toHaveLength(1)
      expect(q.options).toHaveLength(4)
    }
  })
})

describe('spaced repetition', () => {
  const t0 = new Date(2026, 9, 24, 10, 0).getTime()
  it('walks a new card through learning to review', () => {
    let s = schedule(undefined, 2, t0)
    expect(s.stage).toBe('learning')
    expect(s.due - t0).toBe(10 * 60_000)
    s = schedule(s, 2, s.due)
    expect(s.stage).toBe('review')
    expect(s.interval).toBe(1)
  })
  it('grows intervals for Good and shrinks them on lapse', () => {
    let s = schedule(schedule(schedule(undefined, 2, t0), 2, t0), 2, t0)
    expect(s.interval).toBeGreaterThan(1)
    const before = s.interval
    s = schedule(s, 2, t0)
    expect(s.interval).toBeGreaterThan(before)
    const lapsed = schedule(s, 0, t0)
    expect(lapsed.stage).toBe('learning')
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.ease).toBeLessThan(s.ease)
    expect(lapsed.interval).toBeLessThan(s.interval)
  })
  it('orders the four button previews', () => {
    expect(previewIntervals(undefined, t0)).toHaveLength(4)
  })
  it('knows when review cards are due', () => {
    const s = schedule(schedule(schedule(undefined, 3, t0), 3, t0), 2, t0)
    expect(isDue(s, t0)).toBe(false)
    expect(isDue(s, s.due + 1000)).toBe(true)
    expect(startOfDay(s.due)).toBe(s.due)
  })
  it('schedules note revision on expanding steps', () => {
    let r = nextRevision(undefined, 'strong', '2026-10-24', addDays)
    expect(r.due).toBe('2026-10-27')
    r = nextRevision(r, 'strong', '2026-10-27', addDays)
    expect(r.due).toBe('2026-11-03')
    r = nextRevision(r, 'weak', '2026-11-03', addDays)
    expect(r.due).toBe('2026-11-04')
  })
})

describe('parseNote', () => {
  it('collects links, tags, headings and counts', () => {
    const text = '---\ntags: [physics, exam]\n---\n# Title\nSee [[Quantum#Spin|spin]] and ![[img.png]] #wave\n`#notatag [[nope]]`\n'
    const p = parseNote(text, 'Title.md')
    expect(p.links.map(l => [l.target, l.heading, l.alias, l.embed])).toEqual([
      ['Quantum', 'Spin', 'spin', false], ['img.png', undefined, undefined, true]
    ])
    expect(p.tags.sort()).toEqual(['exam', 'physics', 'wave'])
    expect(p.headings).toEqual([{ level: 1, text: 'Title', line: 3 }])
    expect(p.words).toBeGreaterThan(3)
  })
})
