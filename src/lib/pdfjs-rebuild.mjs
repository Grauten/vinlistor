// Rebuild text from a letter-spaced PDF using pdfjs item positions.
// Strategy: group items by Y-row (tolerance ~3px), sort by X within row,
// denospace each item (collapse internal single-space char tokens), concatenate.
// For 2-column layouts, optionally split into columns by a midpoint X.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const Y_TOLERANCE = 3

// Returns pages: [{ pageNum, lines, columns: [[lines], [lines]] }]
export async function rebuildPdfText(path, { columns = 1, columnSplit = null } = {}) {
  const fs = await import('node:fs/promises')
  const buf = await fs.readFile(path)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise

  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent({ disableNormalization: true })
    const items = tc.items.filter((i) => i.str && i.str.trim())
    // Group by Y row
    const rows = new Map() // y → items[]
    for (const i of items) {
      const y = Math.round(i.transform[5])
      let key = null
      for (const ky of rows.keys()) if (Math.abs(ky - y) <= Y_TOLERANCE) { key = ky; break }
      if (key === null) key = y
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push({ ...i, x: i.transform[4] })
    }
    // Sort rows by Y descending (top → bottom)
    const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0])
    const pageLines = []
    const colStreams = Array.from({ length: columns }, () => [])
    for (const [y, rowItems] of sortedRows) {
      rowItems.sort((a, b) => a.x - b.x)
      if (columns === 1) {
        const words = rowItems.map((i) => denospaceOne(i.str)).filter(Boolean)
        if (words.length) pageLines.push(words.join(' '))
      } else {
        const cols = Array.from({ length: columns }, () => [])
        for (const i of rowItems) {
          let c = 0
          for (let k = 0; k < columnSplit.length; k++) if (i.x >= columnSplit[k]) c = k + 1
          cols[c].push(i)
        }
        for (let c = 0; c < cols.length; c++) {
          const words = cols[c].map((i) => denospaceOne(i.str)).filter(Boolean)
          if (words.length) {
            const line = words.join(' ')
            pageLines.push(`§COL${c}§ ${line}`)
            colStreams[c].push(line)
          }
        }
      }
    }
    pages.push({ pageNum: p, lines: pageLines, columns: colStreams })
  }
  return pages
}

// Denospace a single item string. If the string has 2+ chars separated by single
// spaces (letter-spaced), collapse to one word. Otherwise return as-is.
export function denospaceOne(s) {
  s = s.trim()
  if (!s) return ''
  // If has tab, split first
  if (s.includes('\t')) return s.split('\t').map((x) => denospaceOne(x)).filter(Boolean).join(' ')
  const tokens = s.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) return tokens[0]
  // If all tokens are 1-2 chars (letter-spaced word), collapse
  if (tokens.every((t) => t.length <= 2)) return tokens.join('')
  // Mixed — return as-is
  return s
}
