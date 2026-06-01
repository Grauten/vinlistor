// Slussporten — split-column. Per page: type/country headers + wine names, then prices.
// Sections: champagne/sparkling, white, red, rosé, dessert wine. Country sub-headers.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/slussporten.txt', 'utf8')

const TYPES = {
  'wine by the glasS': null, // contextual
  'champagne / sparkling': 'mousserande', 'Champagne/ Sparkling': 'mousserande',
  'white': 'vitt', 'red': 'rött', 'Rosé': 'rosé', 'dessert wine': 'dessert',
}
const COUNTRIES = {
  france: 'Frankrike', italy: 'Italien', spain: 'Spanien', 'germany/austria': null, usa: 'USA',
  'rest of the world': null,
}
const isPrice = (l) => /^\d{2,5}\s*$/.test(l)
const isPageMarker = (l) => /^-- \d+ of \d+ --$/.test(l)

const pages = []
let buf = []
for (const l of text.split('\n')) {
  const line = l.trim()
  if (isPageMarker(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = null
const wines = []
let glassPage = true   // page 1 = by-the-glass (2 prices per wine)

for (let pi = 0; pi < pages.length; pi++) {
  const ls = pages[pi].filter(Boolean)
  if (!ls.length) continue
  const priceStart = ls.findIndex(isPrice)
  const textLines = priceStart < 0 ? ls : ls.slice(0, priceStart)
  const priceLines = priceStart < 0 ? [] : ls.slice(priceStart).filter(isPrice)

  const entries = []
  for (const l of textLines) {
    if (TYPES[l] !== undefined) { if (TYPES[l]) type = TYPES[l]; continue }
    if (COUNTRIES[l] !== undefined) { country = COUNTRIES[l] || null; continue }
    if (!type) continue
    // Wine row — starts with year, NV, or just name
    const m = l.match(/^(NV|MV|\d{4})\s+(.+?)\s*$/) || l.match(/^(.+?)\s*$/)
    if (!m) continue
    let vintage = null, body = ''
    if (/^(NV|MV|\d{4})$/.test(m[1])) { if (/^\d{4}$/.test(m[1])) vintage = parseInt(m[1], 10); body = m[2] || '' }
    else body = m[1]
    if (!body || body.length < 4) continue
    // Last comma piece may be country or region
    const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
    let rowCountry = country, region = null
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      if (['France','Italy','Spain','Germany','Austria','USA','Portugal','Australia','Argentina','Chile','South Africa'].includes(last)) {
        rowCountry = { France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland', Austria: 'Österrike', USA: 'USA', Portugal: 'Portugal', Australia: 'Australien', Argentina: 'Argentina', Chile: 'Chile', 'South Africa': 'Sydafrika' }[last]
        if (parts.length >= 3) region = parts[parts.length - 2]
      } else region = parts[parts.length - 1]
    }
    entries.push({ name: body.trim(), producer: null, vintage, type, country: rowCountry, region, grape: null, currency: 'SEK' })
  }
  // Page 1: glass+bottle (2 prices per wine)
  if (pi === 0 && priceLines.length >= entries.length * 2) {
    for (let i = 0; i < entries.length; i++) {
      entries[i].price_glass = parseFloat(priceLines[i])
      entries[i].price_bottle = parseFloat(priceLines[entries.length + i])
      wines.push(entries[i])
    }
  } else {
    for (let i = 0; i < entries.length; i++) {
      entries[i].price_glass = null
      entries[i].price_bottle = priceLines[i] ? parseFloat(priceLines[i]) : null
      if (entries[i].price_bottle) wines.push(entries[i])
    }
  }
}

const output = {
  restaurant: { name: 'Slussporten', area: 'Stockholm', address: null,
    website: 'https://restaurangslussporten.se/',
    wine_list_url: 'https://restaurangslussporten.se/wp-content/uploads/sites/18/2026/04/Slussporten-vinlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/slussporten.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
