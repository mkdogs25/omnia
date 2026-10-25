// Copies the OCR engine (worker, WebAssembly core) and English language data from node_modules into public/ocr,
// so the built site can run OCR offline. public/ocr is generated, never committed.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'ocr')

const worker = join(nm, 'tesseract.js', 'dist', 'worker.min.js')
const coreDir = join(nm, 'tesseract.js-core')
const lang = join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz')

if (![worker, coreDir, lang].every(existsSync)) {
  console.warn('OCR assets not found in node_modules; run `npm install` first. Skipping.')
  process.exit(0)
}

mkdirSync(join(out, 'core'), { recursive: true })
mkdirSync(join(out, 'lang'), { recursive: true })
cpSync(worker, join(out, 'worker.min.js'))
// The LSTM builds are the only ones Omnia uses; the browser picks the fastest its CPU supports.
for (const f of readdirSync(coreDir)) {
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(join(coreDir, f), join(out, 'core', f))
}
cpSync(lang, join(out, 'lang', 'eng.traineddata.gz'))
console.log('OCR assets copied to public/ocr')
