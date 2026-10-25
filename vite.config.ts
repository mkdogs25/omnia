/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// A relative base lets the same build work at mkdogs25.github.io/omnia/ and anywhere else.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  // Pre-bundled up front so the dev server doesn't reload the page the first time OCR or PDF export is used.
  optimizeDeps: { include: ['tesseract.js', 'pdf-lib'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
})
