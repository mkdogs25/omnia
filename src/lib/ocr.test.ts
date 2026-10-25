import { describe, expect, it } from 'vitest'
import { averageConfidence, cleanWord, lineBaselines, looksScanned, lowConfidenceWords, mergePages, ocrFileName, pageText, pagesNeedingOcr, placeWord, replaceWord, samplePages, wordsFromBlocks, type OcrData } from './ocr'

const word = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1, y1 } })

describe('scan detection', () => {
  it('calls a PDF scanned when nearly every sampled page is empty', () => {
    expect(looksScanned([0, 3, 0, 5, 0])).toBe(true)
    expect(looksScanned([0, 400, 380, 0])).toBe(false)
    expect(looksScanned([])).toBe(false)
  })
  it('lists the pages that need OCR', () => {
    expect(pagesNeedingOcr([500, 0, 12, 300])).toEqual([2, 3])
  })
  it('samples a spread of pages', () => {
    expect(samplePages(3)).toEqual([1, 2, 3])
    const s = samplePages(100)
    expect(s[0]).toBe(1)
    expect(s.at(-1)).toBe(100)
    expect(s.length).toBeLessThanOrEqual(6)
  })
})

describe('wordsFromBlocks', () => {
  const blocks = [{ paragraphs: [{ lines: [
    { words: [word('Hello', 10, 10, 60, 30), word('worﬁd', 70, 10, 130, 30, 55)] },
    { words: [word('  ', 10, 40, 20, 60), word('|', 10, 40, 14, 60, 4), word('Again', 10, 40, 80, 60)] }
  ] }] }]

  it('flattens, numbers lines, and drops noise', () => {
    const w = wordsFromBlocks(blocks)
    expect(w.map(x => x.t)).toEqual(['Hello', 'worfid', 'Again'])
    expect(w.map(x => x.l)).toEqual([0, 0, 1])
    expect(w[1]).toMatchObject({ c: 55, x: 70, w: 60, h: 20 })
  })
  it('handles missing data', () => {
    expect(wordsFromBlocks(null)).toEqual([])
    expect(wordsFromBlocks([{}])).toEqual([])
  })
  it('rebuilds reading-order text', () => {
    expect(pageText({ n: 1, w: 100, h: 100, words: wordsFromBlocks(blocks) })).toBe('Hello worfid\nAgain')
  })
})

describe('review helpers', () => {
  const data: OcrData = { v: 1, size: 10, lang: 'eng', scale: 2, date: '2026-10-25', pages: [
    { n: 1, w: 100, h: 100, words: [{ t: 'ok', x: 0, y: 0, w: 5, h: 5, c: 95, l: 0 }, { t: 'rnaybe', x: 6, y: 0, w: 5, h: 5, c: 40, l: 0 }] },
    { n: 2, w: 100, h: 100, words: [{ t: 'fine', x: 0, y: 0, w: 5, h: 5, c: 80, l: 0 }] }
  ] }

  it('lists low-confidence words and averages', () => {
    expect(lowConfidenceWords(data).map(l => [l.page, l.index, l.word.t])).toEqual([[1, 1, 'rnaybe']])
    expect(averageConfidence(data)).toBeCloseTo((95 + 40 + 80) / 3)
  })
  it('replaces a word and marks it certain', () => {
    const next = replaceWord(data, 1, 1, ' maybe ')
    expect(next.pages[0].words[1]).toMatchObject({ t: 'maybe', c: 100 })
    expect(lowConfidenceWords(next)).toHaveLength(0)
    expect(data.pages[0].words[1].t).toBe('rnaybe')
  })
  it('merges new pages over old ones', () => {
    const merged = mergePages(data, [{ n: 2, w: 1, h: 1, words: [] }, { n: 3, w: 1, h: 1, words: [] }], { size: 10, lang: 'eng', scale: 2, date: 'x' })
    expect(merged.pages.map(p => [p.n, p.words.length])).toEqual([[1, 2], [2, 0], [3, 0]])
  })
})

describe('baselines', () => {
  const w = (t: string, x: number, bottom: number, h = 20) => ({ t, x, y: bottom - h, w: 40, h })
  it('ignores descenders when finding where the letters sit', () => {
    const b = lineBaselines([w('the', 0, 100), w('quick', 50, 108), w('fox', 100, 100), w('jumps', 150, 107), w('over', 200, 100)])
    expect(b.every(v => Math.abs(v - 100) < 0.5)).toBe(true)
  })
  it('follows a slightly tilted line', () => {
    const b = lineBaselines([w('one', 0, 100), w('two', 100, 102), w('six', 200, 104), w('ten', 300, 106), w('and', 400, 108)])
    expect(b[4] - b[0]).toBeGreaterThan(6)
    expect(b[0]).toBeLessThan(b[4])
  })
  it('is flat with too few words', () => {
    const b = lineBaselines([w('one', 0, 100), w('two', 100, 110)])
    expect(b[0]).toBe(b[1])
  })
  it('is attached to recognised words', () => {
    const words = wordsFromBlocks([{ paragraphs: [{ lines: [{ words: [word('Hi', 0, 0, 30, 20), word('go', 40, 0, 70, 26)] }] }] }])
    expect(words.every(x => typeof x.b === 'number')).toBe(true)
  })
})

describe('placement and names', () => {
  it('maps image pixels to PDF points with a flipped y axis', () => {
    const p = placeWord({ t: 'a', x: 100, y: 200, w: 50, h: 20, c: 90, l: 0 }, { w: 1000, h: 2000 }, { w: 500, h: 1000 })
    expect(p.x).toBe(50)
    expect(p.width).toBe(25)
    expect(p.height).toBe(10)
    expect(p.y).toBeCloseTo(1000 - 110)
    expect(placeWord({ t: 'a', x: 100, y: 200, w: 50, h: 20, c: 90, l: 0, b: 214 }, { w: 1000, h: 2000 }, { w: 500, h: 1000 }).y).toBeCloseTo(1000 - 107)
  })
  it('names the data file after the PDF', () => {
    expect(ocrFileName('Scans/Lecture 1 (week 2).pdf')).toMatch(/^Lecture_1_week_2_-[a-z0-9]+\.json$/)
    expect(ocrFileName('a.pdf')).not.toBe(ocrFileName('b/a.pdf'))
  })
  it('cleans ligatures and control characters', () => {
    expect(cleanWord('oﬃce\u0000')).toBe('office')
  })
})
