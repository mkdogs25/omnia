// OCR for scanned PDFs: data shapes and the pure helpers around them. The recogniser itself lives in ocr-engine.ts.

import { hash } from './cards'

/** One recognised word. Positions are pixels on the image that was recognised (origin top-left). */
export interface OcrWord {
  t: string
  x: number
  y: number
  w: number
  h: number
  /** Confidence 0-100. */
  c: number
  /** Index of the line the word sits on. */
  l: number
  /** Where the letters sit on the line (the baseline) at the word's position, as an image y; unlike the box bottom it ignores descenders. */
  b?: number
}

export interface OcrPage {
  /** 1-based page number. */
  n: number
  /** Image size the positions refer to. */
  w: number
  h: number
  words: OcrWord[]
}

export interface OcrData {
  v: 1
  /** Size of the PDF in bytes, to notice when the file has changed. */
  size: number
  lang: string
  /** Render scale of the recognised images (1 = 72 dpi). */
  scale: number
  date: string
  pages: OcrPage[]
}

export const LOW_CONFIDENCE = 70

/** A page with fewer characters than this has no usable text layer. */
const EMPTY_PAGE = 20

export const pageIsEmpty = (chars: number) => chars < EMPTY_PAGE

/** True when most sampled pages carry no text, i.e. the PDF is probably a scan. */
export function looksScanned(counts: number[]): boolean {
  if (!counts.length) return false
  return counts.filter(pageIsEmpty).length / counts.length >= 0.8
}

/** 1-based numbers of the pages that have no text of their own. */
export function pagesNeedingOcr(counts: number[]): number[] {
  const out: number[] = []
  counts.forEach((c, i) => { if (pageIsEmpty(c)) out.push(i + 1) })
  return out
}

/** Pages worth sampling to decide whether a document is scanned: the first few and a spread through the rest. */
export function samplePages(total: number, max = 6): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1)
  const out = new Set<number>()
  for (let i = 0; i < max; i++) out.add(1 + Math.round((i * (total - 1)) / (max - 1)))
  return [...out]
}

export function ocrFileName(pdfPath: string): string {
  const base = pdfPath.split('/').pop()!.replace(/\.pdf$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 40)
  return `${base}-${hash(pdfPath)}.json`
}

export const OCR_DIR = '.omnia/ocr'

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl' }

export function cleanWord(t: string): string {
  return t.replace(/[ﬀ-ﬄ]/g, m => LIGATURES[m]).replace(/[\u0000-\u001f\u007f]/g, '').trim()
}

interface RawBlock { paragraphs?: { lines?: { words?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }

const DESCENDERS = /[gjpqy,;()[\]{}|/\\Q]/

/** Fits a baseline through the bottoms of the words on a line that have no descenders, allowing for a slightly tilted scan. */
export function lineBaselines(words: { t: string; x: number; y: number; w: number; h: number }[]): number[] {
  const bottoms = words.map(w => w.y + w.h)
  const pts = words.map((w, i) => ({ x: w.x + w.w / 2, y: bottoms[i], ok: !DESCENDERS.test(w.t) })).filter(p => p.ok)
  const use = pts.length ? pts : words.map((w, i) => ({ x: w.x + w.w / 2, y: bottoms[i], ok: true }))
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const mx = mean(use.map(p => p.x))
  const my = mean(use.map(p => p.y))
  let num = 0
  let den = 0
  for (const p of use) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
  // Only believe a tilt when there is enough text to measure it, and never more than about three degrees.
  const slope = use.length >= 4 && den > 0 ? Math.max(-0.05, Math.min(0.05, num / den)) : 0
  return words.map(w => my + slope * (w.x + w.w / 2 - mx))
}

/** Flattens Tesseract's block/paragraph/line/word tree into words with a line number each. */
export function wordsFromBlocks(blocks: RawBlock[] | null | undefined): OcrWord[] {
  const out: OcrWord[] = []
  let line = 0
  for (const b of blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        const start = out.length
        let any = false
        for (const w of l.words ?? []) {
          const t = cleanWord(w.text)
          if (!t) continue
          // Specks of noise come back as one-character, near-zero-confidence "words".
          if (w.confidence < 15 && !/[\p{L}\p{N}]/u.test(t)) continue
          const width = w.bbox.x1 - w.bbox.x0
          const height = w.bbox.y1 - w.bbox.y0
          if (width <= 0 || height <= 0) continue
          out.push({ t, x: w.bbox.x0, y: w.bbox.y0, w: width, h: height, c: Math.round(w.confidence), l: line })
          any = true
        }
        if (any) {
          const lineWords = out.slice(start)
          const base = lineBaselines(lineWords)
          lineWords.forEach((w, i) => { w.b = Math.round(base[i] * 10) / 10 })
          line++
        }
      }
    }
  }
  return out
}

/** Reading-order text of a page: words on a line joined by spaces, lines by newlines. */
export function pageText(page: OcrPage): string {
  const lines: string[] = []
  let current = -1
  for (const w of page.words) {
    if (w.l !== current) { lines.push(w.t); current = w.l } else lines[lines.length - 1] += ` ${w.t}`
  }
  return lines.join('\n')
}

export interface LowWord { page: number; index: number; word: OcrWord }

export function lowConfidenceWords(data: OcrData, threshold = LOW_CONFIDENCE): LowWord[] {
  const out: LowWord[] = []
  for (const p of data.pages) p.words.forEach((word, index) => { if (word.c < threshold) out.push({ page: p.n, index, word }) })
  return out
}

/** Average confidence across all words (0-100), or null with no words. */
export function averageConfidence(data: OcrData): number | null {
  let sum = 0
  let n = 0
  for (const p of data.pages) for (const w of p.words) { sum += w.c; n++ }
  return n ? sum / n : null
}

export function replaceWord(data: OcrData, page: number, index: number, text: string): OcrData {
  const t = cleanWord(text)
  return {
    ...data,
    pages: data.pages.map(p => (p.n !== page ? p : { ...p, words: p.words.map((w, i) => (i === index ? { ...w, t: t || w.t, c: t ? 100 : w.c } : w)) }))
  }
}

export function mergePages(data: OcrData | null, next: OcrPage[], meta: { size: number; lang: string; scale: number; date: string }): OcrData {
  const keep = (data?.pages ?? []).filter(p => !next.some(n => n.n === p.n))
  return { v: 1, ...meta, pages: [...keep, ...next].sort((a, b) => a.n - b.n) }
}

/** Placement of a word on a PDF page measured in points (origin bottom-left), for the invisible text layer. */
export function placeWord(word: OcrWord, image: { w: number; h: number }, page: { w: number; h: number }) {
  const kx = page.w / image.w
  const ky = page.h / image.h
  const height = word.h * ky
  // y is the baseline, which is where PDF text is anchored.
  return { x: word.x * kx, y: page.h - (word.b ?? word.y + word.h) * ky, width: word.w * kx, height }
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' }, { code: 'fra', label: 'French' }, { code: 'deu', label: 'German' }, { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' }, { code: 'por', label: 'Portuguese' }, { code: 'nld', label: 'Dutch' }, { code: 'pol', label: 'Polish' },
  { code: 'tur', label: 'Turkish' }, { code: 'hin', label: 'Hindi' }, { code: 'ara', label: 'Arabic' }, { code: 'rus', label: 'Russian' },
  { code: 'chi_sim', label: 'Chinese (simplified)' }, { code: 'jpn', label: 'Japanese' }, { code: 'kor', label: 'Korean' }
]

/** Languages whose recognition data ships with the app; the rest are fetched on first use. */
export const BUNDLED_LANGUAGES = ['eng']
