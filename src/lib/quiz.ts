// Quizzes: explicit questions written in ```quiz fenced blocks inside notes, or generated from flashcards.
//
//   ```quiz
//   What is the SI unit of force?
//   - Joule
//   + Newton
//   - Watt
//   > Force = mass x acceleration, measured in newtons.
//
//   Name the particle that mediates electromagnetism.
//   = photon
//   ```
//
// Lines starting "-" are wrong options, "+" correct options, "=" accepted typed answers (separate
// alternatives with "|"), ">" an explanation. Questions are separated by blank lines.

import { clozeAnswers, clozeHidden, hash, type Card } from './cards'

export interface QuizOption { text: string; correct: boolean }

export interface QuizQuestion {
  id: string
  kind: 'choice' | 'text' | 'recall'
  prompt: string
  options: QuizOption[]
  /** Accepted answers for `text`, or the model answer for `recall`. */
  answers: string[]
  explanation?: string
  /** Set when generated from a card, so results can feed back into spaced repetition. */
  cardId?: string
  /** True for cloze prompts, whose prompt string contains the hidden-marker characters. */
  cloze?: boolean
}

export function extractQuizBlocks(text: string): string[] {
  const out: string[] = []
  const re = /^```quiz[^\n]*\n([\s\S]*?)^```\s*$/gm
  for (const m of text.matchAll(re)) out.push(m[1])
  return out
}

export function parseQuizBlock(block: string): QuizQuestion[] {
  const questions: QuizQuestion[] = []
  for (const chunk of block.split(/\n\s*\n/)) {
    const prompt: string[] = []
    const options: QuizOption[] = []
    const answers: string[] = []
    let explanation: string | undefined
    for (const raw of chunk.split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) continue
      if (/^\s*\+\s/.test(line)) options.push({ text: line.replace(/^\s*\+\s/, '').trim(), correct: true })
      else if (/^\s*-\s/.test(line) && (options.length || prompt.length)) options.push({ text: line.replace(/^\s*-\s/, '').trim(), correct: false })
      else if (/^\s*=\s/.test(line)) answers.push(...line.replace(/^\s*=\s/, '').split('|').map(s => s.trim()).filter(Boolean))
      else if (/^\s*>\s?/.test(line)) explanation = (explanation ? explanation + '\n' : '') + line.replace(/^\s*>\s?/, '').trim()
      else prompt.push(line.trim())
    }
    if (!prompt.length) continue
    const p = prompt.join('\n')
    const id = hash('q|' + p)
    if (options.length >= 2 && options.some(o => o.correct)) {
      questions.push({ id, kind: 'choice', prompt: p, options, answers: [], explanation })
    } else if (answers.length) {
      questions.push({ id, kind: 'text', prompt: p, options: [], answers, explanation })
    }
  }
  return questions
}

export function questionsFromNote(text: string): QuizQuestion[] {
  return extractQuizBlocks(text).flatMap(parseQuizBlock)
}

export function serializeQuestion(q: Pick<QuizQuestion, 'kind' | 'prompt' | 'options' | 'answers' | 'explanation'>): string {
  const lines = [q.prompt.trim()]
  if (q.kind === 'choice') for (const o of q.options) lines.push(`${o.correct ? '+' : '-'} ${o.text}`)
  else lines.push(`= ${q.answers.join(' | ')}`)
  if (q.explanation?.trim()) lines.push(`> ${q.explanation.trim()}`)
  return lines.join('\n')
}

/** Adds a question to the last quiz block in a note, or starts a new block. */
export function addQuestionToNote(note: string, q: Parameters<typeof serializeQuestion>[0]): string {
  const body = serializeQuestion(q)
  const re = /^```quiz[^\n]*\n[\s\S]*?^```\s*$/gm
  let last: RegExpExecArray | null = null
  for (let m = re.exec(note); m; m = re.exec(note)) last = m
  if (!last) return appendQuizBlock(note, q)
  const close = last.index + last[0].lastIndexOf('```')
  const before = note.slice(0, close).replace(/\s+$/, '')
  return `${before}\n\n${body}\n${note.slice(close)}`
}

export function appendQuizBlock(note: string, q: Parameters<typeof serializeQuestion>[0]): string {
  const body = serializeQuestion(q)
  const trimmed = note.replace(/\s+$/, '')
  return `${trimmed}${trimmed ? '\n\n' : ''}\`\`\`quiz\n${body}\n\`\`\`\n`
}

// ---------------------------------------------------------------------------
// Grading

const stripPunct = (s: string) =>
  s.toLowerCase().replace(/[`*_~.,;:!?'"“”‘’()\[\]{}]/g, '').replace(/^(the|a|an)\s+/, '').replace(/\s+/g, ' ').trim()

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

/** Forgiving comparison: ignores case, punctuation and leading articles, and tolerates one typo in longer answers. */
export function isCorrectText(input: string, answers: string[]): boolean {
  const got = stripPunct(input)
  if (!got) return false
  return answers.some(a => {
    const want = stripPunct(a)
    if (got === want) return true
    return want.length >= 6 && editDistance(got, want) <= 1
  })
}

// ---------------------------------------------------------------------------
// Generation from flashcards

export interface GenerateOptions {
  mode: 'choice' | 'type' | 'mixed'
  count: number
  /** Extra cards to draw distractors from (e.g. the rest of the vault). */
  pool?: Card[]
  /** Injectable for tests. */
  random?: () => number
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateQuestions(cards: Card[], opts: GenerateOptions): QuizQuestion[] {
  const random = opts.random ?? Math.random
  const pool = [...cards, ...(opts.pool ?? [])]
  const basicBacks = [...new Set(pool.filter(c => c.kind === 'basic').map(c => oneLine(c.back)))]
  const clozeBacks = [...new Set(pool.filter(c => c.kind === 'cloze').flatMap(c => clozeAnswers(c.front, c.clozeIndex!)))]
  const questions: QuizQuestion[] = []

  shuffle(cards, random).slice(0, opts.count).forEach((card, i) => {
    const wantChoice = opts.mode === 'choice' || (opts.mode === 'mixed' && i % 2 === 0)
    if (card.kind === 'basic') {
      const correct = oneLine(card.back)
      const distractors = shuffle(basicBacks.filter(b => b !== correct), random).slice(0, 3)
      if (wantChoice && distractors.length >= 2 && correct.length <= 140) {
        questions.push({
          id: card.id, cardId: card.id, kind: 'choice', prompt: card.front, answers: [],
          options: shuffle([{ text: correct, correct: true }, ...distractors.map(text => ({ text, correct: false }))], random)
        })
      } else if (correct.split(/\s+/).length <= 3 && opts.mode !== 'choice') {
        questions.push({ id: card.id, cardId: card.id, kind: 'text', prompt: card.front, options: [], answers: [correct] })
      } else {
        questions.push({ id: card.id, cardId: card.id, kind: 'recall', prompt: card.front, options: [], answers: [card.back] })
      }
    } else {
      const answers = clozeAnswers(card.front, card.clozeIndex!)
      const prompt = clozeHidden(card.front, card.clozeIndex!)
      const distractors = shuffle(clozeBacks.filter(b => !answers.includes(b)), random).slice(0, 3)
      if (wantChoice && distractors.length >= 2) {
        questions.push({
          id: card.id, cardId: card.id, kind: 'choice', prompt, cloze: true, answers: [],
          options: shuffle([{ text: answers[0], correct: true }, ...distractors.map(text => ({ text, correct: false }))], random)
        })
      } else {
        questions.push({ id: card.id, cardId: card.id, kind: 'text', prompt, cloze: true, options: [], answers })
      }
    }
  })
  return questions
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()
