// Frippe — Spanish-focused. Each wine = 1-3 lines: NAME ALL CAPS YEAR - PRODUCER \t PRICEkr,
// then sub-region/grape (skip), then tasting note (skip).
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/frippe.txt', 'utf8')

const TYPES = {
  'CAVA & CORPINAT': 'mousserande', 'CHAMPAGNE': 'mousserande', 'CAVA': 'mousserande',
  'VITT': 'vitt', 'VITT, ÖVRIGA VÄRLDEN': 'vitt',
  'RÖTT': 'rött', 'RÖTT, ÖVRIGA VÄRLDEN': 'rött',
  'ROSÉ': 'rosé', 'SÖTT': 'dessert',
}
const COUNTRY_HINTS = {
  Bourgogne: 'Frankrike', Champagne: 'Frankrike', Bordeaux: 'Frankrike', Rhone: 'Frankrike', Loire: 'Frankrike',
  Piemonte: 'Italien', Toscana: 'Italien', Marche: 'Italien',
  'Hemel-en-Aarde': 'Sydafrika',
  FRA: 'Frankrike', ITA: 'Italien', ESP: 'Spanien', GER: 'Tyskland', POR: 'Portugal',
}

let type = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  // Filter the "key" lines (regions list 1. RIAS BAIXAS etc, or simple numbers, or marketing line)
  if (/^\d+(\.\s|$)/.test(line) || /^VÅRT VINSPANIEN/i.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; continue }
  if (!type) continue

  // Wine row: "NAME YEAR - PRODUCER \tprice kr"
  const m = line.match(/^(.+?)\s+(\d{3,5})\s*kr\s*$/i)
  if (!m) continue
  const [, body, priceStr] = m
  const price = parseFloat(priceStr)

  // Pull year out
  const yM = body.match(/\b(19|20)\d{2}\b/)
  let name = body.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+-\s+/g, ', ').replace(/\s+/g, ' ').trim()

  wines.push({
    name,
    producer: null,
    vintage: yM ? parseInt(yM[0], 10) : null,
    type,
    country: type === 'mousserande' ? 'Frankrike' /* mostly champagne section */ : 'Spanien' /* Frippe is Spanish */,
    region: null, grape: null,
    price_glass: null, price_bottle: price, currency: 'SEK',
  })
}

// Fix: for "ÖVRIGA VÄRLDEN" sections, country should be other than default — try to detect from name
// Pull country hints from name keywords
for (const w of wines) {
  for (const [hint, cty] of Object.entries(COUNTRY_HINTS)) {
    if (new RegExp(`\\b${hint}\\b`, 'i').test(w.name)) { w.country = cty; break }
  }
}

const output = {
  restaurant: { name: 'Frippe', area: 'Stockholm', address: null,
    website: 'https://www.frippe.se/',
    wine_list_url: 'https://www.frippe.se/wp-content/uploads/2025/01/frippe-vinlista-ny-250118.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/frippe.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines → data/extracted/frippe.json`)
console.log('by type:', t)
