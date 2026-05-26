// Extract text from a PDF using pure-JS pdf-parse (no native deps).
// Output goes to data/raw/<basename>.txt for Claude (in Claude Code) to read.
//
//   node src/pdf-to-text.mjs data/raw/spanjorskan.pdf
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
const { PDFParse } = createRequire(import.meta.url)('pdf-parse') // CJS, v2 class API

const pdfPath = process.argv[2]
if (!pdfPath) { console.error('usage: node src/pdf-to-text.mjs <file.pdf>'); process.exit(1) }

const buf = await readFile(pdfPath)
const parser = new PDFParse({ data: buf })
const result = await parser.getText()
const out = join(dirname(pdfPath), basename(pdfPath, '.pdf') + '.txt')
await writeFile(out, result.text)
console.log(`${pdfPath} (${result.pages?.length || '?'} pages) → ${out} (${result.text.length} chars)`)
