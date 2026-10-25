// Builds a searchable copy of a scanned PDF: the original pages are kept exactly as they were and the
// recognised words are added on top as invisible text, so the file can be searched and copied from anywhere.

import { placeWord, type OcrData } from './ocr'

export interface ExportResult { bytes: Uint8Array; pages: number; words: number; skipped: number }

export async function buildSearchablePdf(original: Uint8Array, data: OcrData): Promise<ExportResult> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.load(original)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const supported = new Set(font.getCharacterSet())
  const pages = pdf.getPages()
  let wordCount = 0
  let pageCount = 0
  let skipped = 0

  for (const ocr of data.pages) {
    const page = pages[ocr.n - 1]
    if (!page) continue
    // Rotated pages would need every word turned as well; they are left as they are rather than placed wrongly.
    if (page.getRotation().angle % 360 !== 0) { skipped++; continue }
    const size = page.getSize()
    let any = false
    // Each line is written as one run of text, like a typed page would be. Readers then keep lines and word order together
    // when searching or copying; the font size is chosen so the run spans the same width as the printed line.
    const byLine = new Map<number, typeof ocr.words>()
    for (const w of ocr.words) byLine.set(w.l, [...(byLine.get(w.l) ?? []), w])
    for (const words of byLine.values()) {
      const parts = words
        .map(w => ({ w, text: [...w.t].filter(ch => supported.has(ch.codePointAt(0)!)).join('') }))
        .filter(p => p.text)
        .sort((a, b) => a.w.x - b.w.x)
      if (!parts.length) continue
      const text = parts.map(p => p.text).join(' ')
      const first = placeWord(parts[0].w, ocr, { w: size.width, h: size.height })
      const lastWord = parts[parts.length - 1].w
      const width = (lastWord.x + lastWord.w - parts[0].w.x) * (size.width / ocr.w)
      const heights = parts.map(p => p.w.h).sort((a, b) => a - b)
      const height = heights[Math.floor(heights.length / 2)] * (size.height / ocr.h)
      const unit = font.widthOfTextAtSize(text, 1)
      if (!unit) continue
      const fontSize = Math.min(height * 1.1, Math.max(height * 0.6, width / unit))
      const baselines = parts.map(p => placeWord(p.w, ocr, { w: size.width, h: size.height }).y)
      const baseline = baselines.reduce((s, v) => s + v, 0) / baselines.length
      page.drawText(text, { x: first.x, y: baseline, size: fontSize, font, color: rgb(0, 0, 0), opacity: 0 })
      wordCount += parts.length
      any = true
    }
    if (any) pageCount++
  }
  return { bytes: await pdf.save(), pages: pageCount, words: wordCount, skipped }
}
