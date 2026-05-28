// Bastardo — Italian-focused wine bar. Split-column PDF: per page, text block then
// price block. Sections: Mousserande / Rosa / Skalkontakt / Vitt / Rött / Sött.
// Wine rows: "YY-/MV- Name, Producer, Region".
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const raw = await readFile('data/raw/bastardo.txt', 'utf8')

const TYPES = { 'Mousserande': 'mousserande', 'Rosa': 'rosé', 'Skalkontakt': 'orange', 'Vitt': 'vitt', 'Rött': 'rött', 'Sött': 'dessert' }
const COUNTRIES = {
  'Italien': 'Italien', 'Frankrike': 'Frankrike', 'Tyskland': 'Tyskland', 'Spanien': 'Spanien',
  'Portugal': 'Portugal', 'Österrike': 'Österrike', 'USA': 'USA', 'Sverige': 'Sverige',
  'Övriga Italien': 'Italien',
}
const isPrice = (l) => /^\d{1,4}(?:\s*\/\s*\d{1,4})?\s*$/.test(l)
const isPageMarker = (l) => /^-- \d+ of \d+ --$/.test(l)

// Page-split
const pages = []
let buf = []
for (const l of raw.split('\n')) {
  const line = l.trim()
  if (isPageMarker(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = null, region = null
const wines = []

for (const pageLines of pages) {
  const ls = pageLines.filter(Boolean)
  if (!ls.length) continue
  const priceStart = ls.findIndex(isPrice)
  const textLines = priceStart < 0 ? ls : ls.slice(0, priceStart)
  const priceLines = priceStart < 0 ? [] : ls.slice(priceStart).filter(isPrice)

  const entries = []
  for (const l of textLines) {
    if (TYPES[l]) { type = TYPES[l]; country = null; region = null; continue }
    if (COUNTRIES[l]) { country = COUNTRIES[l]; region = null; continue }
    // Wine row starts with "YY-" or "MV-/NV-"
    const m = l.match(/^(\d{2}|NV|MV|S\.A\.|N\.V\.)\s*-\s*(.+?)\s*$/)
    if (!m) {
      // Sub-region header (Alto-Adige, Piemonte, Sicilien etc.) — title case short
      if (l.length < 40 && /^[A-ZÅÄÖa-zåäö\- ]+$/.test(l) && !/\d/.test(l)) region = l
      continue
    }
    const yy = m[1]
    let body = m[2]
    // Format suffix like "MGN" or "(KEG)" — keep in name but separate from region pieces
    // Pull trailing region from name (last comma piece) for additional context
    const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
    let inlineRegion = null, country2 = null
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      if (COUNTRIES[last]) { country2 = COUNTRIES[last]; parts.pop() }
      if (parts.length >= 2) inlineRegion = parts[parts.length - 1]
    }
    entries.push({
      name: parts.join(', '),
      vintage: /^\d{2}$/.test(yy) ? parseInt(yy, 10) + (parseInt(yy, 10) > 50 ? 1900 : 2000) : null,
      type, country: country2 || country, region: inlineRegion || region,
    })
  }
  // Pair with prices
  for (let i = 0; i < entries.length; i++) {
    const p = priceLines[i]; if (!p) break
    const dual = p.match(/^(\d{1,4})\s*\/\s*(\d{1,4})$/)
    const e = entries[i]
    let price_glass = null, price_bottle = null
    if (dual) { price_glass = parseFloat(dual[1]); price_bottle = parseFloat(dual[2]) }
    else price_bottle = parseFloat(p)
    wines.push({ ...e, producer: null, grape: null, price_glass, price_bottle, currency: 'SEK' })
  }
}

const output = {
  restaurant: { name: 'Bastardo', area: 'Stockholm', address: null,
    website: 'https://www.bastardosthlm.com/',
    wine_list_url: 'https://www.bastardosthlm.com/s/Vinmeny47.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/bastardo.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/bastardo.json`)
console.log('by type:', t)
