// Runs Tesseract in the browser. Everything heavy is loaded on demand, and English data is served from the app itself.

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { BUNDLED_LANGUAGES, mergePages, wordsFromBlocks, type OcrData, type OcrPage } from './ocr'

export interface OcrProgress {
  /** Page being read, and how many will be read. */
  page: number
  done: number
  total: number
  /** 0-1 across the whole run. */
  fraction: number
  status: string
}

export interface OcrRun {
  doc: PDFDocumentProxy
  pages: number[]
  lang: string
  scale: number
  size: number
  existing: OcrData | null
  signal: AbortSignal
  onProgress: (p: OcrProgress) => void
  /** Called after each page, so the text layer can appear while the rest is still being read. */
  onPage: (page: OcrPage, data: OcrData) => void
}

const CDN = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data'
const MAX_SIDE = 4200

const asset = (rel: string) => new URL(`${import.meta.env.BASE_URL}ocr/${rel}`, document.baseURI).href

export async function runOcr(run: OcrRun): Promise<OcrData | null> {
  // tesseract.js is a CommonJS package: depending on the bundler its API is either named or on the default export.
  const mod = (await import('tesseract.js')) as unknown as { createWorker?: typeof import('tesseract.js').createWorker; default?: { createWorker: typeof import('tesseract.js').createWorker } }
  const createWorker = mod.createWorker ?? mod.default!.createWorker
  const langs = run.lang.split('+').filter(Boolean)
  const local = langs.every(l => BUNDLED_LANGUAGES.includes(l))
  let current = { page: 0, done: 0, status: 'Starting' }
  const report = (fraction: number, status: string) =>
    run.onProgress({ page: current.page, done: current.done, total: run.pages.length, fraction: Math.min(1, (current.done + fraction) / Math.max(1, run.pages.length)), status })

  report(0, 'Loading the recogniser')
  const worker = await createWorker(langs, 1, {
    workerPath: asset('worker.min.js'),
    corePath: asset('core/'),
    langPath: local ? asset('lang') : `${CDN}/${langs[0]}/4.0.0_best_int`,
    gzip: true,
    logger: m => {
      if (m.status === 'recognizing text') report(m.progress, 'Reading')
      else if (/loading|initializ/.test(m.status)) report(0, m.status.charAt(0).toUpperCase() + m.status.slice(1))
    }
  })

  let data = run.existing
  const meta = () => ({ size: run.size, lang: run.lang, scale: run.scale, date: new Date().toISOString().slice(0, 10) })
  try {
    for (const n of run.pages) {
      if (run.signal.aborted) break
      current = { page: n, done: current.done, status: 'Rendering' }
      report(0, 'Rendering')
      const pg = await run.doc.getPage(n)
      const natural = pg.getViewport({ scale: 1 })
      const scale = Math.min(run.scale, MAX_SIDE / Math.max(natural.width, natural.height))
      const vp = pg.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: false })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      if (run.signal.aborted) break
      const result = await worker.recognize(canvas, {}, { blocks: true })
      const page: OcrPage = { n, w: canvas.width, h: canvas.height, words: wordsFromBlocks(result.data.blocks) }
      canvas.width = canvas.height = 0
      data = mergePages(data, [page], { ...meta(), scale })
      current = { page: n, done: current.done + 1, status: 'Done' }
      report(0, 'Done')
      run.onPage(page, data)
    }
  } finally {
    await worker.terminate()
  }
  return data
}
