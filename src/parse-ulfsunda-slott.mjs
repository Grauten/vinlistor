// Ulfsunda Slott — split-column. Per page: text block of wine names then prices block.
// Sections: CHAMPAGNE / MOUSSERANDE / VITA VINER / RÖDA VINER / ROSE / ORANGEVIN.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/ulfsunda-slott.txt', 'utf8')

const TYPES = {
  CHAMPAGNE: 'mousserande', MOUSSERANDE: 'mousserande',
  'VITA VINER': 'vitt', 'RÖDA VINER': 'rött',
  'ROSE / ORANGEVIN': 'rosé', ROSE: 'rosé', ORANGEVIN: 'orange',
  ROSÉ: 'rosé', DESSERT: 'dessert',
}
const STOP = /^(HANTVERKSÖL|ÖVRIG ÖL|CIDER|ALKOHOLFRITT|LÄSK|SPRIT|AVEC|COCKTAILS|VARM DRYCK|KAFFE|TE)/i

const isPrice = (l) => /^\d{2,5}(?:\s*\/\s*\d{2,5})?\s*$/.test(l)
const isPageMarker = (l) => /^-- \d+ of \d+ --$/.test(l)

const pages = []
let buf = []
for (const l of text.split('\n')) {
  const line = l.trim()
  if (isPageMarker(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null
const wines = []
let skip = false
for (const pageLines of pages) {
  const ls = pageLines.filter(Boolean)
  if (!ls.length) continue
  const priceStart = ls.findIndex(isPrice)
  const textLines = priceStart < 0 ? ls : ls.slice(0, priceStart)
  const priceLines = priceStart < 0 ? [] : ls.slice(priceStart).filter(isPrice)

  const entries = []
  for (const l of textLines) {
    if (TYPES[l] !== undefined) { type = TYPES[l]; skip = false; continue }
    if (STOP.test(l)) { skip = true; continue }
    if (skip || !type) continue
    if (l === 'DRYCKESMENY' || /^\d{4}$/.test(l)) continue
    // Wine row: starts with vintage YYYY
    const m = l.match(/^(\d{4})\s+(.+?)\s*$/) || l.match(/^(.+?)\s*$/)
    if (!m) continue
    let vintage = null, body
    if (/^\d{4}$/.test(m[1])) { vintage = parseInt(m[1], 10); body = m[2] || '' }
    else body = m[1]
    if (!body || body.length < 4) continue
    // Pull country/region from comma parts
    const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
    let country = null, region = null
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const map = { Frankrike: 'Frankrike', Italien: 'Italien', Spanien: 'Spanien', Tyskland: 'Tyskland', Portugal: 'Portugal', 'Sydafrika': 'Sydafrika', Sverige: 'Sverige', USA: 'USA' }
      if (map[last]) { country = map[last]; if (parts.length >= 3) region = parts[parts.length - 2] }
      else region = last
    }
    entries.push({ name: body, producer: null, vintage, type, country, region, grape: null, currency: 'SEK' })
  }
  // Pair with prices
  for (let i = 0; i < entries.length; i++) {
    const p = priceLines[i]
    if (!p) break
    const dual = p.match(/^(\d{1,4})\s*\/\s*(\d{1,5})$/)
    let price_glass = null, price_bottle = null
    if (dual) { price_glass = parseFloat(dual[1]); price_bottle = parseFloat(dual[2]) }
    else price_bottle = parseFloat(p)
    wines.push({ ...entries[i], price_glass, price_bottle })
  }
}

const output = {
  restaurant: { name: 'Ulfsunda Slott', area: 'Bromma', address: null,
    website: 'https://www.ulfsundaslott.se/',
    wine_list_url: 'https://www.ulfsundaslott.se/wp-content/uploads/sites/2/2026/04/Dryckesmeny-2026-20-1.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/ulfsunda-slott.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
