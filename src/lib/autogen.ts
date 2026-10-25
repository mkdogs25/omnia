// Auto-generated flashcards and quiz questions, with no AI: a handful of deterministic rules that
// look for the patterns people really use when they write study notes.
//
//   definition   **Term**: meaning · **Term** is … · Term – meaning · X is called Y · X is defined as Y
//   highlight    a sentence with **bold** or ==highlighted== words becomes a cloze (the words are hidden)
//   number       "The speed of light is 3 × 10^8 m/s" hides the figure
//   list         "Stages of mitosis:" followed by a bullet list becomes a "list all of them" card
//   heading      a short heading followed by a paragraph becomes "Heading -> first sentence"
//
// Everything is returned as editable suggestions; nothing is written until the user accepts it.

import { extractCards, hash } from './cards'
import { serializeQuestion, type QuizQuestion } from './quiz'

export type Rule = 'definition' | 'highlight' | 'number' | 'list' | 'heading'
export type Confidence = 'high' | 'medium'

export interface GenCard {
  /** Stable across runs, so suggestions keep their ticks while the user edits the note. */
  key: string
  rule: Rule
  confidence: Confidence
  /** Zero-based line in the note the suggestion came from. */
  line: number
  /** The Markdown that would be added to the note (one or more lines). */
  text: string
  /** Card ids the text would produce, used to hide suggestions that already exist. */
  ids: string[]
  /** What the reader sees on the front, for the preview. */
  front: string
  back: string
}

export interface GenQuestion {
  key: string
  rule: Rule
  confidence: Confidence
  line: number
  q: QuizQuestion
  /** Serialised quiz-block entry. */
  text: string
}

export interface Generated { cards: GenCard[]; questions: GenQuestion[] }

export interface GenOptions {
  /** Card ids that already exist anywhere in the vault. */
  existingCardIds?: ReadonlySet<string>
  /** Question ids (hash of the prompt) that already exist. */
  existingQuestionIds?: ReadonlySet<string>
  random?: () => number
}

// ---------------------------------------------------------------------------
// Reading the note

interface Unit { line: number; text: string; heading: string; inList: boolean }
interface ListBlock { line: number; intro: string; heading: string; items: string[] }
interface HeadingBlock { line: number; level: number; text: string; paragraph: string }

const GENERIC_HEADINGS = /^(introduction|intro|overview|summary|conclusion|conclusions|notes?|references?|examples?|contents|table of contents|todo|tasks?|questions?|flashcards?|quiz|further reading|links|resources|homework|revision|recap|objectives?|key points?|key terms?|glossary|abstract|background|answers?)$/i

const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|cf|fig|figs|eq|approx|dr|mr|mrs|ms|prof|no|vol|ca|c|al)\./gi

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length
const stripMarks = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1').replace(/__(.+?)__/g, '$1').trim()
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()
const endClean = (s: string) => s.replace(/[\s.;:,]+$/, '').trim()
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function splitSentences(text: string): string[] {
  const protectedText = text.replace(ABBREVIATIONS, m => m.replace(/\./g, '\u0007'))
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(*=\[])/)
    .map(s => tidy(s.replace(/\u0007/g, '.')))
    .filter(Boolean)
}

interface Scan { units: Unit[]; lists: ListBlock[]; headings: HeadingBlock[] }

function scan(text: string): Scan {
  const lines = text.split(/\r?\n/)
  const units: Unit[] = []
  const lists: ListBlock[] = []
  const headings: HeadingBlock[] = []
  let i = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (end > 0) i = end + 1
  }
  let fence: string | null = null
  let heading = ''
  let para: { line: number; parts: string[] } | null = null
  let pendingHeading = null as HeadingBlock | null
  let prevParaIntro = null as { text: string; line: number } | null
  let list: ListBlock | null = null

  const endPara = () => {
    if (!para) return
    const joined = tidy(para.parts.join(' '))
    if (pendingHeading && !pendingHeading.paragraph) {
      pendingHeading.paragraph = joined
      pendingHeading = null
    }
    for (const s of splitSentences(joined)) units.push({ line: para.line, text: s, heading, inList: false })
    prevParaIntro = /:$/.test(joined) ? { text: joined, line: para.line } : null
    para = null
  }
  const endList = () => {
    if (list) lists.push(list)
    list = null
  }

  for (; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    const fenceMatch = raw.match(/^\s*(```+|~~~+)/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) { endPara(); endList(); fence = fenceMatch[1]; continue }
    if (!line) { endPara(); endList(); continue }

    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (h) {
      endPara(); endList()
      heading = stripMarks(h[2])
      const block: HeadingBlock = { line: i, level: h[1].length, text: heading, paragraph: '' }
      headings.push(block)
      pendingHeading = block
      prevParaIntro = null
      continue
    }
    // Things that are already cards, tables, quotes, comments, maths blocks and rules are left alone.
    if (/^(\|.*\||>|<!--|\$\$|---+$|\*\*\*+$|___+$|!\[\[|!\[)/.test(line) || /\s::{1,2}\s|\{\{c\d+::|^\?{1,2}$/.test(line)) {
      endPara(); endList()
      pendingHeading = null
      continue
    }

    const li = raw.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/)
    if (li) {
      endPara()
      const body = tidy(li[2])
      const top = li[1].replace(/\t/g, '    ').length < 2
      if (top) {
        if (!list) {
          const intro = pendingHeading && !pendingHeading.paragraph ? '' : prevParaIntro?.text ?? ''
          list = { line: i, intro, heading, items: [] }
        }
        list.items.push(body)
      }
      units.push({ line: i, text: body, heading, inList: true })
      pendingHeading = null
      continue
    }
    endList()
    if (!para) para = { line: i, parts: [] }
    para.parts.push(line)
  }
  endPara(); endList()
  return { units, lists, headings }
}

// ---------------------------------------------------------------------------
// Rules

interface Definition { term: string; meaning: string; confidence: Confidence; line: number; sentence: string }

const clean = (s: string) => endClean(tidy(s))

function matchDefinition(unit: Unit): Definition | null {
  const t = unit.text
  const base = { line: unit.line, sentence: t }
  let m: RegExpMatchArray | null

  // **Term**: meaning  /  **Term** - meaning
  m = t.match(/^(?:\*\*|__)(.{2,60}?)(?:\*\*|__)\s*[:–—-]\s+(.{8,})$/)
  if (m && wordCount(m[1]) <= 8) return { ...base, term: clean(m[1]), meaning: clean(m[2]), confidence: 'high' }

  // **Term** is / are / refers to / means …
  m = t.match(/^(?:\*\*|__)(.{2,60}?)(?:\*\*|__)\s+(?:is|are|refers to|means|describes)\s+(.{8,})$/i)
  if (m && wordCount(m[1]) <= 8) return { ...base, term: clean(m[1]), meaning: clean(m[2]), confidence: 'high' }

  // Term: meaning (a short capitalised label before a colon)
  m = t.match(/^([A-Z][^:.!?]{1,40}?):\s+(.{12,})$/)
  if (m && wordCount(m[1]) <= 5 && wordCount(m[2]) >= 3 && !/\bhttps?$/i.test(m[1])) {
    return { ...base, term: clean(stripMarks(m[1])), meaning: clean(m[2]), confidence: 'medium' }
  }

  // Term – meaning (spaced en or em dash)
  m = t.match(/^([^–—]{2,50}?)\s+[–—]\s+(.{12,})$/)
  if (m && wordCount(m[1]) <= 6 && wordCount(m[2]) >= 3) {
    return { ...base, term: clean(stripMarks(m[1])), meaning: clean(m[2]), confidence: /\*\*|==/.test(m[1]) ? 'high' : 'medium' }
  }

  // X is defined as Y  /  X refers to Y
  m = t.match(/^(.{3,60}?)\s+(?:is|are)\s+defined\s+as\s+(.{8,})$/i) ?? t.match(/^(.{3,60}?)\s+refers\s+to\s+(.{8,})$/i)
  if (m && wordCount(m[1]) <= 8) return { ...base, term: clean(stripMarks(m[1])), meaning: clean(m[2]), confidence: 'high' }

  return null
}

interface Span { text: string; start: number; end: number }

function highlightSpans(sentence: string): Span[] {
  const spans: Span[] = []
  for (const m of sentence.matchAll(/(\*\*|==)(?=\S)(.{1,60}?)(?<=\S)\1/g)) {
    const text = m[2]
    if (wordCount(text) > 5 || /[$`]/.test(text)) continue
    spans.push({ text, start: m.index!, end: m.index! + m[0].length })
  }
  return spans
}

const SCI = String.raw`(?:\s?[×x]\s?10\^?[-−]?\d+)`
const NUM = String.raw`[£€]?\d[\d,]*(?:\.\d+)?${SCI}?`
const UNIT_ONE = String.raw`(?:%|°\s?[CF]|(?:[kKMGmµ]?(?:g|m|s|Hz|N|J|W|V|A|Pa|mol|L|eV|B))(?:\/[a-z]+)?|percent|per cent|years?|days?|hours?|minutes?|seconds?|metres?|meters?|kilometres?|kilograms?|degrees|billion|million|thousand)`
const UNIT = String.raw`(?:\s?${UNIT_ONE}(?:\s${UNIT_ONE}(?![a-z]))?)?`
const NUMBER_RE = new RegExp(String.raw`(?<![\w.^/$])(${NUM}${UNIT})(?![\w^])`, 'g')
const NUMBER_BLOCKERS = /\b(figure|fig|step|table|chapter|section|page|pages|eq|equation|question|q|part|week|lecture|slide|lines?|version|v)\s*\.?\s*$/i
const NUMBER_TRIGGERS = /\b(is|are|was|were|equals|=|in|of|by|at|about|around|approximately|roughly|nearly|over|under|to|from|reached|measures|measured|costs?|has|had|have|totals?|contains?|weighs?|lasts?|takes?|boils?|freezes|melts)\s+(?:about |around |approximately |roughly |nearly |over |under |exactly |only |just |up to |almost )?$/i

interface NumberHit { span: string; start: number; end: number; strong: boolean }

function findNumber(sentence: string): NumberHit | null {
  if (/[$`]/.test(sentence)) return null
  for (const m of sentence.matchAll(NUMBER_RE)) {
    const span = m[1].trim()
    const start = m.index!
    const before = sentence.slice(0, start)
    if (NUMBER_BLOCKERS.test(before)) continue
    const digits = span.replace(/\D/g, '')
    const hasUnit = /[^\d\s,.£€×x^\-−]/.test(span.replace(/10\^?[-−]?\d+/, ''))
    const sci = new RegExp(SCI).test(span)
    const yearLike = /^\d{4}$/.test(span) && +span >= 1000 && +span <= 2199
    const decimal = /\d\.\d/.test(span)
    const bigNumber = digits.length >= 3
    if (!(hasUnit || sci || yearLike || decimal || bigNumber)) continue
    return { span, start, end: start + m[1].length, strong: NUMBER_TRIGGERS.test(before) }
  }
  return null
}

const GENERIC_BEFORE_NUMBER_WORDS = 3

export function generate(text: string, path: string, opts: GenOptions = {}): Generated {
  const { units, lists, headings } = scan(text)
  const existingCards = opts.existingCardIds ?? new Set<string>()
  const existingQs = opts.existingQuestionIds ?? new Set<string>()
  const random = opts.random ?? seeded(hash(text))

  const cards: GenCard[] = []
  const questions: GenQuestion[] = []
  const usedSentences = new Set<string>()
  const seenIds = new Set<string>()

  const pushCard = (c: Omit<GenCard, 'ids' | 'key'>) => {
    const ids = extractCards(c.text, path).map(x => x.id)
    if (!ids.length || ids.every(id => existingCards.has(id) || seenIds.has(id))) return false
    ids.forEach(id => seenIds.add(id))
    cards.push({ ...c, ids, key: hash(`${c.rule}|${c.text}`) })
    return true
  }
  const pushQuestion = (rule: Rule, confidence: Confidence, line: number, q: Omit<QuizQuestion, 'id'>) => {
    const id = hash('q|' + q.prompt)
    if (existingQs.has(id) || questions.some(x => x.q.id === id)) return
    const full: QuizQuestion = { ...q, id }
    questions.push({ key: id, rule, confidence, line, q: full, text: serializeQuestion(full) })
  }

  // -- definitions ----------------------------------------------------------
  const definitions: Definition[] = []
  const handledUnits = new Set<Unit>()
  for (const u of units) {
    if (wordCount(u.text) < 4 || wordCount(u.text) > 70) continue
    const d = matchDefinition(u)
    if (!d) continue
    if (wordCount(d.meaning) < 3) continue
    definitions.push(d)
    handledUnits.add(u)
    usedSentences.add(u.text)
  }
  for (const d of definitions) {
    const front = stripMarks(d.term)
    const back = d.meaning
    if (/\n|::/.test(front + back)) continue
    pushCard({ rule: 'definition', confidence: d.confidence, line: d.line, text: `${front} :: ${back}`, front, back })
  }

  // -- "X is called Y" ------------------------------------------------------
  for (const u of units) {
    if (handledUnits.has(u)) continue
    const m = u.text.match(/^(.{6,}?)\s+(?:is|are)\s+(?:called|known as|termed|named)\s+(?:the\s+|a\s+|an\s+)?(.{2,50}?)([.,;]?)(?:\s*\(.*\))?$/i)
    if (!m) continue
    const answer = clean(stripMarks(m[2]))
    if (!answer || wordCount(answer) > 4) continue
    const idx = u.text.indexOf(m[2])
    if (idx < 0) continue
    const sentence = `${u.text.slice(0, idx)}{{c1::${answer}}}${u.text.slice(idx + m[2].length)}`
    if (pushCard({ rule: 'definition', confidence: 'high', line: u.line, text: sentence, front: sentence, back: answer })) {
      handledUnits.add(u)
      usedSentences.add(u.text)
    }
  }

  // -- highlights -> cloze ---------------------------------------------------
  const allSpans: { text: string; words: number }[] = []
  for (const u of units) {
    if (handledUnits.has(u)) continue
    for (const s of highlightSpans(u.text)) allSpans.push({ text: s.text, words: wordCount(s.text) })
  }
  const highlightBase: { u: Unit; spans: Span[] }[] = []
  for (const u of units) {
    if (handledUnits.has(u)) continue
    if (wordCount(u.text) < 6) continue
    const spans = highlightSpans(u.text).slice(0, 3)
    if (!spans.length) continue
    const covered = spans.reduce((n, s) => n + (s.end - s.start), 0)
    if (covered > u.text.length * 0.6) continue
    // A line that is nothing but a bold label (e.g. "**Note**: …") is not a sentence.
    highlightBase.push({ u, spans })
  }
  for (const { u, spans } of highlightBase) {
    let out = ''
    let cursor = 0
    spans.forEach((s, i) => {
      out += u.text.slice(cursor, s.start) + `{{c${i + 1}::${s.text}}}`
      cursor = s.end
    })
    out += u.text.slice(cursor)
    const plainFront = out.replace(/\{\{c\d+::(.+?)\}\}/g, '…')
    if (pushCard({ rule: 'highlight', confidence: 'high', line: u.line, text: out, front: plainFront, back: spans.map(s => s.text).join(' · ') })) {
      handledUnits.add(u)
      usedSentences.add(u.text)
    }
    // A question needs one blank only, so use the first span.
    const first = spans[0]
    const prompt = `${u.text.slice(0, first.start)}_____${u.text.slice(first.end)}`.replace(/(\*\*|==)(.+?)\1/g, '$2')
    const similar = shuffle(allSpans.filter(s => s.text.toLowerCase() !== first.text.toLowerCase() && Math.abs(s.words - wordCount(first.text)) <= 1), random)
    const distractors = uniqueText(similar.map(s => s.text)).slice(0, 3)
    if (distractors.length >= 3) {
      pushQuestion('highlight', 'high', u.line, {
        kind: 'choice', prompt, answers: [], explanation: stripMarks(u.text),
        options: shuffle([{ text: first.text, correct: true }, ...distractors.map(text => ({ text, correct: false }))], random)
      })
    } else if (wordCount(first.text) <= 3) {
      pushQuestion('highlight', 'high', u.line, { kind: 'text', prompt, options: [], answers: [first.text], explanation: stripMarks(u.text) })
    }
  }

  // -- numbers ----------------------------------------------------------------
  for (const u of units) {
    if (handledUnits.has(u)) continue
    if (wordCount(u.text) < 6 || wordCount(u.text) > 60) continue
    const hit = findNumber(u.text)
    if (!hit) continue
    if (wordCount(u.text.slice(0, hit.start)) < GENERIC_BEFORE_NUMBER_WORDS - 1 && !hit.strong) continue
    const sentence = `${u.text.slice(0, hit.start)}{{c1::${hit.span}}}${u.text.slice(hit.end)}`
    const confidence: Confidence = hit.strong ? 'high' : 'medium'
    if (pushCard({ rule: 'number', confidence, line: u.line, text: sentence, front: sentence.replace(/\{\{c1::.+?\}\}/, '…'), back: hit.span })) {
      handledUnits.add(u)
      usedSentences.add(u.text)
    }
    const options = numericDistractors(hit.span, random)
    if (options.length >= 3) {
      const prompt = `${u.text.slice(0, hit.start)}_____${u.text.slice(hit.end)}`.replace(/(\*\*|==)(.+?)\1/g, '$2')
      pushQuestion('number', confidence, u.line, {
        kind: 'choice', prompt, answers: [], explanation: stripMarks(u.text),
        options: shuffle([{ text: hit.span, correct: true }, ...options.slice(0, 3).map(text => ({ text, correct: false }))], random)
      })
    }
  }

  // -- lists -------------------------------------------------------------------
  const isPlainList = (l: ListBlock) =>
    l.items.length >= 3 && l.items.length <= 9 &&
    !l.items.some(i => wordCount(i) > 14 || /::/.test(i) || /\$/.test(i)) &&
    l.items.filter(i => matchDefinition({ line: 0, text: i, heading: '', inList: true })).length * 2 < l.items.length
  for (const l of lists) {
    if (!isPlainList(l)) continue
    l.items = l.items.map(i => endClean(stripMarks(i)))
    let topic = ''
    if (l.intro) topic = clean(stripMarks(l.intro))
    else if (l.heading && !GENERIC_HEADINGS.test(l.heading)) topic = l.heading
    if (!topic || wordCount(topic) < 2 && !l.intro) continue
    const front = l.intro ? `${topic} (list all ${l.items.length})` : `${topic}: list all ${l.items.length}`
    const items = l.items.map(i => `- ${i}`)
    pushCard({ rule: 'list', confidence: 'medium', line: l.line, text: `${front}\n?\n${items.join('\n')}`, front, back: l.items.join(' · ') })
  }
  // Which of these belongs to the list? Needs a second list to take wrong answers from.
  const eligible = lists.filter(l => isPlainList(l) && (l.intro || (l.heading && !GENERIC_HEADINGS.test(l.heading))))
  for (const l of eligible) {
    const others = uniqueText(eligible.filter(o => o !== l).flatMap(o => o.items).filter(i => !l.items.includes(i)))
    if (others.length < 3) continue
    const topic = l.intro ? clean(stripMarks(l.intro)) : l.heading
    const correct = l.items[Math.floor(random() * l.items.length)]
    pushQuestion('list', 'medium', l.line, {
      kind: 'choice', prompt: l.intro ? `Which of these fits “${topic}”?` : `Which of these belongs under “${topic}”?`, answers: [],
      explanation: `${topic}: ${l.items.join('; ')}`,
      options: shuffle([{ text: correct, correct: true }, ...shuffle(others, random).slice(0, 3).map(text => ({ text, correct: false }))], random)
    })
  }

  // -- definition questions ----------------------------------------------------
  const terms = uniqueText(definitions.map(d => stripMarks(d.term)))
  for (const d of definitions) {
    const term = stripMarks(d.term)
    const meaning = d.meaning.length > 220 ? `${d.meaning.slice(0, 217).trimEnd()}…` : d.meaning
    const prompt = `Which term matches this description? ${capital(stripMarks(meaning))}`
    const wrong = shuffle(terms.filter(t => t.toLowerCase() !== term.toLowerCase()), random).slice(0, 3)
    if (wrong.length >= 3) {
      pushQuestion('definition', d.confidence, d.line, {
        kind: 'choice', prompt, answers: [], explanation: `${term}: ${stripMarks(d.meaning)}`,
        options: shuffle([{ text: term, correct: true }, ...wrong.map(text => ({ text, correct: false }))], random)
      })
    } else if (wordCount(term) <= 3) {
      pushQuestion('definition', d.confidence, d.line, { kind: 'text', prompt, options: [], answers: [term], explanation: `${term}: ${stripMarks(d.meaning)}` })
    }
  }

  // -- headings ---------------------------------------------------------------
  for (const h of headings) {
    if (h.level < 2 || h.level > 4 || !h.paragraph) continue
    if (GENERIC_HEADINGS.test(h.text) || wordCount(h.text) > 7) continue
    const sentences = splitSentences(h.paragraph)
    const first = sentences[0]
    if (!first || !/[.!?]$/.test(first) || /\$/.test(first) || usedSentences.has(first) || wordCount(first) < 5 || wordCount(first) > 45 || /::|\{\{c/.test(first)) continue
    const isQuestion = /\?$/.test(h.text)
    const front = h.text
    const answer = isQuestion ? sentences.slice(0, 2).join(' ') : first
    if (answer.length > 360) continue
    if (pushCard({ rule: 'heading', confidence: isQuestion ? 'high' : 'medium', line: h.line, text: `${front} :: ${answer}`, front, back: answer })) {
      usedSentences.add(first)
    }
  }

  const order = <T extends { line: number }>(a: T, b: T) => a.line - b.line
  return { cards: cards.sort(order), questions: questions.sort(order) }
}

// ---------------------------------------------------------------------------
// Helpers

const uniqueText = (items: string[]) => {
  const seen = new Set<string>()
  return items.filter(t => {
    const k = t.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function seeded(seedText: string): () => number {
  let a = parseInt(seedText.slice(0, 7), 36) >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Plausible wrong answers for a figure, written in the same format as the right one. */
export function numericDistractors(span: string, random: () => number = Math.random): string[] {
  const m = span.match(/^([£€]?)(\d[\d,]*(?:\.\d+)?)(?:(\s?[×x]\s?10\^?)([-−]?)(\d+))?(.*)$/)
  if (!m) return []
  const [, prefix, numText, sciMark, sign, exp, rest] = m
  const commas = numText.includes(',')
  const decimals = numText.includes('.') ? numText.split('.')[1].length : 0
  const value = parseFloat(numText.replace(/,/g, ''))
  if (!Number.isFinite(value)) return []

  const fmt = (n: number) => {
    const fixed = decimals ? n.toFixed(decimals) : String(Math.round(n))
    if (!commas) return fixed
    const [i, d] = fixed.split('.')
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? `.${d}` : '')
  }
  const build = (n: string, e?: number) => `${prefix}${n}${sciMark ? `${sciMark}${e! < 0 ? sign || '-' : ''}${Math.abs(e!)}` : ''}${rest}`
  const out = new Set<string>()
  const original = span

  if (sciMark) {
    const e0 = (sign ? -1 : 1) * parseInt(exp, 10)
    for (const de of [-1, 1, -2, 2]) out.add(build(numText, e0 + de))
    for (const f of [2, 0.5, 3]) out.add(build(fmt(value * f), e0))
  } else if (/^\d{4}$/.test(numText) && value >= 1000 && value <= 2199) {
    for (const d of shuffle([-30, -20, -10, -5, -3, 3, 5, 10, 20, 30], random).slice(0, 5)) out.add(build(String(value + d)))
  } else {
    const factors = shuffle([0.5, 2, 10, 0.1, 1.5, 0.75, 0.25, 4], random)
    for (const f of factors) {
      const v = value * f
      const text = fmt(v)
      if (!decimals && v < 1) continue
      out.add(build(text))
    }
    if (!decimals && value >= 2 && value < 100) for (const d of [-2, -1, 1, 2, 5]) out.add(build(fmt(value + d)))
  }
  out.delete(original)
  return shuffle([...out].filter(x => x.trim() && !/^[£€]?-/.test(x)), random)
}

// ---------------------------------------------------------------------------
// Writing suggestions back into a note

/** Inserts a block at the end of the "## <heading>" section, creating the section at the end of the note if needed. */
export function insertUnderHeading(note: string, heading: string, block: string): string {
  const trimmedBlock = block.replace(/\s+$/, '')
  const lines = note.split('\n')
  const at = lines.findIndex(l => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l))
  if (at < 0) {
    const body = note.replace(/\s+$/, '')
    return `${body}${body ? '\n\n' : ''}## ${heading}\n\n${trimmedBlock}\n`
  }
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) { end = i; break }
  }
  // Keep fenced quiz blocks intact: never insert cards inside one.
  const before = lines.slice(0, end).join('\n').replace(/\s+$/, '')
  const after = lines.slice(end).join('\n')
  return `${before}\n\n${trimmedBlock}\n${after ? `\n${after}` : ''}`
}

export function appendCards(note: string, cards: Pick<GenCard, 'text'>[]): string {
  if (!cards.length) return note
  return insertUnderHeading(note, 'Flashcards', cards.map(c => c.text).join('\n\n'))
}

/** Adds the chosen questions to one quiz block under a "## Quiz" section (or the last quiz block if there is one). */
export function appendQuestions(note: string, questions: Pick<GenQuestion, 'text'>[]): string {
  if (!questions.length) return note
  const body = questions.map(q => q.text).join('\n\n')
  const re = /^```quiz[^\n]*\n[\s\S]*?^```\s*$/gm
  let last: RegExpExecArray | null = null
  for (let m = re.exec(note); m; m = re.exec(note)) last = m
  if (last) {
    const close = last.index + last[0].lastIndexOf('```')
    const before = note.slice(0, close).replace(/\s+$/, '')
    return `${before}\n\n${body}\n${note.slice(close)}`
  }
  return insertUnderHeading(note, 'Quiz', `\`\`\`quiz\n${body}\n\`\`\``)
}
