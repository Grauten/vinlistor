// Levi bistro — split-column. Section type then country-region headers ("France - Bourgogne"),
// wine names, then a price block per page. Wine row: "YYYY Producer Name, Grape".
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/levi-bistro.txt', 'utf8')

const TYPES = { WHITE: 'vitt', RED: 'rött', SPARKLING: 'mousserande', ROSÉ: 'rosé', ROSE: 'rosé' }
const COUNTRY_MAP = {
  France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
  Austria: 'Österrike', Portugal: 'Portugal', USA: 'USA',
}
const isPrice = (l) => /^\d{1,2}\s?\d{3}\s*$/.test(l) || /^\d{2,4}\s*$/.test(l)
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

for (const pageLines of pages) {
  const ls = pageLines.filter(Boolean)
  if (!ls.length) continue
  const priceStart = ls.findIndex(isPrice)
  const textLines = priceStart < 0 ? ls : ls.slice(0, priceStart)
  const priceLines = priceStart < 0 ? [] : ls.slice(priceStart).filter(isPrice)

  let country = null, region = null
  const entries = []
  for (const l of textLines) {
    if (TYPES[l]) { type = TYPES[l]; continue }
    // Country-region header: "France - Bourgogne"
    const m = l.match(/^([A-Z][a-z]+)\s*-\s*(.+)$/)
    if (m && COUNTRY_MAP[m[1]]) { country = COUNTRY_MAP[m[1]]; region = m[2].trim(); continue }
    // Skip footers / repeated logo
    if (/^levi\b/i.test(l)) continue

    // Wine row: optional vintage, body
    const wM = l.match(/^(\d{4})?\s*(.+)$/)
    if (!wM) continue
    const vintage = wM[1] ? parseInt(wM[1], 10) : null
    const body = wM[2]
    // Pull trailing grape (last comma piece)
    const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
    const grape = parts.length >= 2 ? parts[parts.length - 1] : null
    const name = parts.length >= 2 ? parts.slice(0, -1).join(', ') : body
    entries.push({ name, producer: null, vintage, type, country, region, grape, currency: 'SEK' })
  }
  for (let i = 0; i < entries.length; i++) {
    const p = priceLines[i]
    if (!p) break
    entries[i].price_glass = null
    entries[i].price_bottle = parseFloat(p.replace(/\s+/g, ''))
    wines.push(entries[i])
  }
}

const output = {
  restaurant: { name: 'Levi bistro', area: 'Stockholm', address: null,
    website: 'https://www.levibistro.se/',
    wine_list_url: 'https://www.levibistro.se/_files/ugd/860071_1d0ac797bd0a4344a9707b08ccd9bd08.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/levi-bistro.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines → data/extracted/levi-bistro.json`)
console.log('by type:', t)
