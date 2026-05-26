// One-off parser for Spesso's wine list. Italian + French focus, by-section layout:
// page 1 = by-the-glass (5 cols: vintage/name/region/glas/flaska);
// page 2 = champagne (mousserande, 3 cols);
// pages 3–14 = white then red bottle list, with regional subsections that imply country;
// page 15 = big bottles (magnums) of all colours.
//
// Sectional headers sometimes glued to the first wine line by pdf-parse ("CHAMPAGNENV…",
// "BURGUNDY2017…") — we split those before parsing.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const raw = await readFile('data/raw/spesso.txt', 'utf8')

// Pre-process: split lines where an ALL-CAPS header is concatenated with a row that
// starts with NV/YYYY (PDF extraction artefact).
// 3+ chars so we also catch "USA2007" (just 3-letter country).
let lines = raw.split('\n').flatMap((line) => {
  const m = line.match(/^([A-ZÅÄÖ \-\/]{3,}?)(NV|\d{4})(\s.*)$/)
  if (m) return [m[1].trim(), m[2] + m[3]]
  return [line]
})

// Section keyword → ( country, region, [type override] )
const SECTIONS = {
  'BURGUNDY':              { country: 'Frankrike', region: 'Bourgogne' },
  'BURGUNDY CONTINUED':    { country: 'Frankrike', region: 'Bourgogne' },
  'CHABLIS':               { country: 'Frankrike', region: 'Chablis' },
  'OTHER FRANCE':          { country: 'Frankrike', region: null },
  'BORDEAUX':              { country: 'Frankrike', region: 'Bordeaux' },
  'BEAUJOLAIS':            { country: 'Frankrike', region: 'Beaujolais' },
  'LOIRE':                 { country: 'Frankrike', region: 'Loire' },
  'RHÔNE':                 { country: 'Frankrike', region: 'Rhône' },
  'CHAMPAGNE':             { country: 'Frankrike', region: 'Champagne', type: 'mousserande' },
  'OTHER BUBBLES':         { country: null, region: null, type: 'mousserande' },
  'PIEDMONT - BAROLO':     { country: 'Italien', region: 'Barolo' },
  'PIEDMONT -':            { country: 'Italien', region: 'Piemonte' },
  'BARBARESCO':            { country: 'Italien', region: 'Barbaresco' },
  'PIEDMONT - LANGHE /':   { country: 'Italien', region: 'Langhe' },
  'OTHER PIEDMONT':        { country: 'Italien', region: 'Piemonte' },
  'PIEDMONT':              { country: 'Italien', region: 'Piemonte' },
  'TUSCANY':               { country: 'Italien', region: 'Toscana' },
  'SICILY':                { country: 'Italien', region: 'Sicilien' },
  'OTHER ITALY':           { country: 'Italien', region: null },
  'OTHER / ITALY':         { country: 'Italien', region: null },
  'GERMANY':               { country: 'Tyskland', region: null },
  'HUNGARY':               { country: 'Ungern', region: null },
  'AUSTRALIA':             { country: 'Australien', region: null },
  'SOUTH AFRICA':          { country: 'Sydafrika', region: null },
  'USA':                   { country: 'USA', region: null },
  'SWEDEN':                { country: 'Sverige', region: null },
  // Big bottles section — country/region context is mixed; reset and tag by wine name later.
  'BIG BOTTLES / CHAMPAGNE': { country: 'Frankrike', region: 'Champagne', type: 'mousserande' },
  'BIG BOTTLES / WHITE':     { country: null, region: null, type: 'vitt' },
  'BIG BOTTLES / RED':       { country: null, region: null, type: 'rött' },
  'BIG BOTTLES / ROSÉ':      { country: null, region: null, type: 'rosé' },
}

const TYPE_HEADERS = {
  'SPARKLING':             'mousserande',
  'WHITE WINES':           'vitt',
  'RED WINES':             'rött',
  'ROSÉ WINES':            'rosé',
  'WHITE':                 'vitt',     // page-3 header
  'RED':                   'rött',     // page-8 header
  // (BIG BOTTLES headers live in SECTIONS — they also reset country/region.)
}

let type = null, country = null, region = null
const wines = []

const PRICE = /(\d{2,5})/
// Multi-column rows: 4 or 5 tab-ish-separated fields. Use multiple whitespace as delimiter.
const splitCols = (l) => l.split(/\s{2,}|\t+/).map((s) => s.trim()).filter(Boolean)

// Parse a "region - country" or just "country" or just "region" string from BY-THE-GLASS rows.
function parseInlineRegion(s) {
  if (!s) return [null, null]
  const m = s.match(/^(.+?)\s*-\s*(.+)$/)
  if (m) return [normCountry(m[2].trim()), m[1].trim()]
  return [normCountry(s), null]
}
function normCountry(c) {
  const M = { 'Italy': 'Italien', 'France': 'Frankrike', 'Germany': 'Tyskland',
    'Spain': 'Spanien', 'USA': 'USA', 'England': 'England', 'Sweden': 'Sverige',
    'Australia': 'Australien' }
  return M[c] || c
}

for (let line of lines) {
  line = line.trim()
  if (!line) continue
  if (line.startsWith('--')) continue
  if (line.startsWith('Burgundy Continued')) continue

  // Type headers
  const upper = line.toUpperCase()
  if (TYPE_HEADERS[upper]) { type = TYPE_HEADERS[upper]; continue }
  // Section (country/region) headers
  if (SECTIONS[upper]) {
    const s = SECTIONS[upper]
    if (s.country !== undefined) country = s.country
    if (s.region !== undefined) region = s.region
    if (s.type) type = s.type
    continue
  }

  // Wine row: starts with NV or 4-digit year
  if (!/^(NV|\d{4})\b/.test(line)) continue
  const cols = splitCols(line)
  if (cols.length < 2) continue

  const vintageRaw = cols[0]
  const vintage = vintageRaw === 'NV' ? null : parseInt(vintageRaw, 10)
  if (isNaN(vintage) && vintageRaw !== 'NV') continue

  // Take last column as bottle price if numeric; second-to-last as glass if numeric.
  let price_bottle = null, price_glass = null, nameParts = cols.slice(1)
  if (PRICE.test(cols.at(-1))) {
    price_bottle = parseFloat(cols.at(-1).match(PRICE)[1])
    nameParts = nameParts.slice(0, -1)
    if (nameParts.length >= 2 && PRICE.test(nameParts.at(-1)) && nameParts.at(-1).match(/^\d{2,4}$/)) {
      price_glass = parseFloat(nameParts.at(-1))
      nameParts = nameParts.slice(0, -1)
    }
  } else continue

  // Possible region/country column (last remaining field if it looks like a place)
  let rowRegion = region, rowCountry = country
  if (nameParts.length >= 2) {
    const candidate = nameParts.at(-1)
    if (/[A-Za-z]/.test(candidate) && !/\d/.test(candidate) && candidate.length < 40
        && /(Italy|France|Germany|Spain|USA|England|Sweden|Australia|-)/i.test(candidate)) {
      const [c, r] = parseInlineRegion(candidate)
      if (c) rowCountry = c
      if (r) rowRegion = r
      nameParts = nameParts.slice(0, -1)
    }
  }

  const name = nameParts.join(' ').replace(/\s+/g, ' ').trim()
  if (!name) continue

  wines.push({
    name,
    producer: null,
    vintage,
    type,
    country: rowCountry,
    region: rowRegion,
    grape: null,
    price_glass,
    price_bottle,
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Spesso',
    area: 'Norrmalm',
    address: 'Malmskillnadsgatan 38B, Stockholm',
    website: 'https://spesso.se/',
    wine_list_url: 'https://spesso.se/wp-content/uploads/2026/05/Spesso-vinlista-maj.pdf',
  },
  wines,
}
const out = 'data/extracted/spesso.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
const byType = {}, byCountry = {}
for (const w of wines) {
  byType[w.type ?? 'null'] = (byType[w.type ?? 'null'] || 0) + 1
  byCountry[w.country ?? 'null'] = (byCountry[w.country ?? 'null'] || 0) + 1
}
console.log('by type:', byType)
console.log('by country:', byCountry)
