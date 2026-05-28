// Calle P — clean tab-separated. Page 1 = by-the-glass (4 cols: vintage/name/glass/bottle),
// pages 2+ = bottle list (3 cols). Country codes (FR, SP, IT, DE, AU) in parens at end.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/calle-p.txt', 'utf8')

const CTY = { FR: 'Frankrike', IT: 'Italien', SP: 'Spanien', DE: 'Tyskland',
  AT: 'Österrike', AU: 'Australien', US: 'USA', PT: 'Portugal', SE: 'Sverige' }
const TYPES = {
  'SPARKLING/CHAMPAGNE': 'mousserande', 'SPARKLING': 'mousserande', 'CHAMPAGNE': 'mousserande',
  'WHITE WINE': 'vitt', 'WHITE': 'vitt',
  'RED WINE': 'rött', 'RED': 'rött',
  'ROSÉ WINE': 'rosé', 'ROSÉ': 'rosé',
  'SWEET': 'dessert', 'DESSERT': 'dessert', 'WINES': null,
}

let type = null
const wines = []
let glassMode = true  // page 1 is by-the-glass; flips off when we leave it

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line) continue
  if (/^-- (\d+) of/.test(line)) { glassMode = line.startsWith('-- 1 of') ? false : false; continue }
  // Normalise tabs/multi-space → single tab for splitting
  const normalised = line.replace(/\s{2,}/g, '\t')
  // Type/section headers
  const cleanForHeader = normalised.replace(/\t+/g, ' ').toUpperCase()
  if (TYPES[cleanForHeader] !== undefined) { if (TYPES[cleanForHeader]) type = TYPES[cleanForHeader]; continue }
  if (!type) continue

  // Wine row: starts with vintage marker
  const cols = normalised.split(/\t+/).map((s) => s.trim()).filter(Boolean)
  if (cols.length < 2) continue
  const vintM = cols[0].match(/^(NV|N\.V\.|MV|M\.V\.|\d{4})$/)
  let vintage = null
  let body
  if (vintM) {
    vintage = /^\d{4}$/.test(cols[0]) ? parseInt(cols[0], 10) : null
    body = cols[1]
  } else {
    // Sometimes year is glued: "2023 Name"
    const inlineM = cols[0].match(/^(NV|N\.V\.?|MV|M\.V\.?|\d{4})\s+(.+)$/)
    if (!inlineM) continue
    if (/^\d{4}$/.test(inlineM[1])) vintage = parseInt(inlineM[1], 10)
    body = inlineM[2]
  }
  // Glass mode → expect 2 prices, bottle mode → 1
  const priceCols = cols.slice(vintM ? 2 : 1).filter((c) => /^\d+$/.test(c))
  let price_glass = null, price_bottle = null
  if (priceCols.length >= 2) { price_glass = parseFloat(priceCols[0]); price_bottle = parseFloat(priceCols[1]) }
  else if (priceCols.length === 1) { price_bottle = parseFloat(priceCols[0]) }
  else continue

  // Extract country code from "(XX)" at end of body
  let country = null, region = null, name = body
  const m = body.match(/^(.+?)\s*-\s*([^()]+?)\s*\(([A-Z]{2})\)\s*(?:Magnum,?\s*\d+ml)?\s*$/i)
  if (m) {
    name = m[1].trim()
    region = m[2].trim()
    country = CTY[m[3]] || null
  } else {
    const codeM = body.match(/\(([A-Z]{2})\)/)
    if (codeM) country = CTY[codeM[1]] || null
    name = body.replace(/\([A-Z]{2}\)/, '').trim()
  }

  wines.push({
    name, producer: null, vintage, type, country, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Calle P', area: 'Stockholm', address: null,
    website: 'https://callep.nu/',
    wine_list_url: 'https://callep.nu/wp-content/uploads/2026/05/Vinlista-Calle-P-2026-05-21.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/calle-p.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/calle-p.json`)
console.log('by type:', t)
