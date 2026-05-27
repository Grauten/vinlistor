// Vinverket — glass list (1 page, ~22 wines). One-line format:
//   "YYYY Producer, Region, Grape (Country) glas_price bottle_price"
// Section headers: Bubblor / Vitt Vin / Rosévin / Orangevin / Rött vin.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/vinverket.txt', 'utf8')

const COUNTRY = { Fra: 'Frankrike', Ita: 'Italien', Spa: 'Spanien', Por: 'Portugal',
  Tys: 'Tyskland', Aus: 'Österrike', Aut: 'Österrike', Eng: 'England', Usa: 'USA' }

const TYPES = {
  Bubblor: 'mousserande',
  'Vitt Vin': 'vitt',
  'Rosévin': 'rosé',
  Orangevin: 'orange',
  'Rött vin': 'rött',
}

let type = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('--')) continue

  for (const k in TYPES) if (line.startsWith(k)) { type = TYPES[k]; break }
  if (TYPES[line.split(/\s/)[0]] && line === Object.keys(TYPES).find((h) => line.startsWith(h))) continue

  // "YYYY ... (XXX) glas flaska"
  const m = line.match(/^(NV|\d{4})\s+(.+?)\s*\(([A-Za-z]{3})\)\s+(\d{2,4})\s+(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, body, ctyAbbr, glas, flaska] = m
  wines.push({
    name: body.trim(),
    producer: null,
    vintage: vintageRaw === 'NV' ? null : parseInt(vintageRaw, 10),
    type,
    country: COUNTRY[ctyAbbr.charAt(0).toUpperCase() + ctyAbbr.slice(1).toLowerCase()] || null,
    region: null,
    grape: null,
    price_glass: parseFloat(glas),
    price_bottle: parseFloat(flaska),
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Vinverket', area: 'Vasastan',
    address: 'Norrtullsgatan 24, Stockholm', website: 'http://vinverket.se/',
    wine_list_url: 'https://vinverket.se/wp-content/uploads/2026/05/Glaslistan-Maj2026.pdf',
  },
  wines,
}
const out = 'data/extracted/vinverket.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
