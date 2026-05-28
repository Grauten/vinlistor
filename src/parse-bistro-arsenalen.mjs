// Bistro Arsenalen — 5-page PDF where pdf-parse extracted each page as a tall list
// of wine names followed by a tall list of prices (split-column layout). Strategy:
// per page, split into text-block + price-block, group consecutive text lines into
// wine entries ending whenever a line ends with a vintage mark ('NV / 'MV / 'YY /
// 'YYYY / Magnum / "1/2 fl"), then pair entry i with price i.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const raw = await readFile('data/raw/bistro-arsenalen.txt', 'utf8')

// Country headers (slash-separated bilingual). Region headers — short title-case lines.
const COUNTRY_HEADERS = {
  'Frankrike / France': 'Frankrike',  'Frankrike': 'Frankrike',
  'Italien / Italy': 'Italien',        'Italien': 'Italien',
  'Spanien / Spain': 'Spanien',        'Spanien': 'Spanien',
  'Österrike-Tyskland / Austria-Germany': null,
  'Usa / Usa': 'USA', 'USA / USA': 'USA',
  'Övriga Världen / Other Countries': null,
  'Rest of France': 'Frankrike', 'Rest of Spain': 'Spanien',
}
const REGION_HEADERS = new Set(['Reims','Aÿ','Avize','Ambonnay','Le Mesnil sur Oger','Épernay',
  'Bourgogne','Alsace','Rhône','Bordeaux','Champagne','Piemonte','Toscana','Siciliy','Sicily',
  'Rioja','Ribera del Duero','Fort. Ribera del Duero','Napa Valley','Sonoma','Central Coast','North Coast'])

// Section headers we skip (these introduce sub-blocks but no wine).
const SUBSECTION = /^(Vitt på Glas|Rött på Glas|White by the Glass|Red by the Glass|Champagne)$/i

// A "complete-wine-marker" suffix at end of a text line: ’14, ’NV, ´17 etc. + maybe Magnum/½/etc.
const VINTAGE_END = /(?:[’'´`](?:NV|MV|\d{2,4})(?:[' ]?(?:Magnum|1\/2 fl|1\/2|½))?)\s*$/i

const isPriceLine = (l) => /^\d{2,5}\s*(?:\/\s*\d{2,5})?\s*$/.test(l)
const isPageMarker = (l) => /^-- \d+ of \d+ --$/.test(l)

// Split raw text into pages by the page markers.
const pages = []
let buf = []
for (const l of raw.split('\n')) {
  const line = l.trim()
  if (isPageMarker(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

const wines = []
let country = null, region = null

for (const pageLines of pages) {
  if (!pageLines.length) continue
  // Find where prices start: first run of price lines that doesn't break.
  const priceStart = pageLines.findIndex((l, i) => isPriceLine(l) && (i + 1 >= pageLines.length || isPriceLine(pageLines[i + 1].trim()) || pageLines[i + 1].trim() === ''))
  if (priceStart < 0) continue
  const textBlock = pageLines.slice(0, priceStart).filter(Boolean)
  const priceBlock = pageLines.slice(priceStart).filter(isPriceLine)

  // Build wine entries from textBlock
  const entries = []
  let accum = []
  let inSubSection = false   // by-the-glass subsection — wines may not have vintage marker
  let glassMode = false
  for (const l of textBlock) {
    if (!l) continue
    if (SUBSECTION.test(l)) { glassMode = /Glas|Glass/i.test(l); if (accum.length) { entries.push({ text: accum.join(' '), region, country, glass: glassMode }); accum = [] } continue }
    if (COUNTRY_HEADERS.hasOwnProperty(l)) { country = COUNTRY_HEADERS[l]; region = null; continue }
    if (REGION_HEADERS.has(l)) { region = l; continue }
    accum.push(l)
    // For glass wines (typically one per line, no vintage) close after each line.
    if (glassMode && accum.length === 1) {
      entries.push({ text: accum.join(' '), region, country, glass: true })
      accum = []
      continue
    }
    if (VINTAGE_END.test(l)) {
      entries.push({ text: accum.join(' '), region, country, glass: false })
      accum = []
    }
  }
  if (accum.length) entries.push({ text: accum.join(' '), region, country, glass: glassMode })

  // Pair with prices
  for (let i = 0; i < entries.length; i++) {
    const p = priceBlock[i]
    if (!p) break
    const e = entries[i]
    let price_glass = null, price_bottle = null
    const dual = p.match(/^(\d{2,5})\s*\/\s*(\d{2,5})$/)
    if (dual) { price_glass = parseFloat(dual[1]); price_bottle = parseFloat(dual[2]) }
    else price_bottle = parseFloat(p)

    // Pull vintage from the name if present
    const vM = e.text.match(/[’'´`](NV|MV|(\d{2,4}))\b/)
    let vintage = null
    if (vM) {
      const v = vM[1]
      if (/^\d{4}$/.test(v)) vintage = parseInt(v, 10)
      else if (/^\d{2}$/.test(v)) vintage = parseInt(v, 10) + (parseInt(v, 10) > 50 ? 1900 : 2000)
    }
    // Clean name: strip the vintage marker, "Magnum" stays
    const name = e.text.replace(/[’'´`](NV|MV|\d{2,4})/, '').replace(/\s+/g, ' ').trim().replace(/,$/, '')
    wines.push({
      name, producer: null, vintage,
      type: null, // assigned below based on section
      country: e.country, region: e.region, grape: null,
      price_glass, price_bottle, currency: 'SEK',
      _glass: e.glass,
    })
  }
}

// Pass 2: assign type based on a section state machine over the wines list.
// Champagne page → mousserande; white pages → vitt; red pages → rött.
const champRegions = new Set(['Reims','Aÿ','Avize','Ambonnay','Le Mesnil sur Oger','Épernay','Champagne'])
let currentType = 'mousserande'
let firstWhiteSeen = false, firstRedSeen = false
for (const w of wines) {
  // Heuristic: "Bourgogne" + glass mode + first appearance → switch to vitt
  if (champRegions.has(w.region)) w.type = 'mousserande'
  else {
    // Walk through pages: Champagne first (mousserande), then white pages, then red
    w.type = currentType
  }
}
// Better: split based on order — first ~28 entries (page 1) = mousserande, next ~55 = vitt, rest = rött
// Use a simple count-based approach since we know page sizes roughly.
let count = 0
for (const w of wines) {
  count++
  if (count <= 28) w.type = 'mousserande'
  else if (count <= 28 + 55) w.type = 'vitt'
  else w.type = 'rött'
}

// Drop the temporary _glass field
for (const w of wines) delete w._glass

const output = {
  restaurant: {
    name: 'Bistro Arsenalen', area: 'Stockholm',
    address: null,
    website: 'https://www.bistroarsenalen.se/',
    wine_list_url: 'https://www.bistroarsenalen.se/s/Webb-Lista-April-2026.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/bistro-arsenalen.json', JSON.stringify(output, null, 2))
const t = {}
for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/bistro-arsenalen.json`)
console.log('by type:', t)
