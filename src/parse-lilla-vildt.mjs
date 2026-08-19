// Lilla Vildt — clean format: "YYYY Name, Region price:-" with section headers
// (GLASLISTA, MOUSSERANDE, VITT, RÖTT, etc.) and country sub-headers.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/lilla-vildt.txt', 'utf8')

const TYPES = {
  GLASLISTA: null, // contextual
  MOUSSERANDE: 'mousserande', CHAMPAGNE: 'mousserande',
  'ROSÈ & ORANGE': 'rosé', ROSÈ: 'rosé', ROSÉ: 'rosé', ORANGE: 'orange',
  VITT: 'vitt', RÖTT: 'rött',
  DESSERT: 'dessert', SÖTT: 'dessert', SÖTA: 'dessert',
}
const COUNTRIES = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  ÖSTERRIKE: 'Österrike', USA: 'USA', PORTUGAL: 'Portugal',
  'NYA ZEELAND': 'Nya Zeeland', SYDAFRIKA: 'Sydafrika', AUSTRALIEN: 'Australien',
  ARGENTINA: 'Argentina', CHILE: 'Chile', UNGERN: 'Ungern', GREKLAND: 'Grekland',
  'ÖVRIGA': null, 'ÖVRIGA VÄRLDEN': null,
}

let type = null, country = null, glassMode = false
const wines = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line)) continue
  if (line === 'GLASLISTA') { glassMode = true; continue }
  // Bottle list starts at "Vinlista" (or "FLASKLISTA" if ever present)
  if (line === 'Vinlista' || line === 'VINLISTA' || line === 'FLASKLISTA' || /^Flasklista/.test(line)) { glassMode = false; continue }
  if (line === 'gl fl' || line === 'gl/fl') continue // column header artefact
  if (TYPES[line] !== undefined) { if (TYPES[line]) type = TYPES[line]; country = null; continue }
  if (COUNTRIES[line] !== undefined) { country = COUNTRIES[line] || null; continue }
  if (!type) continue

  // Wine row variants:
  //   "WINE 980:-"            → single price (glass if glassMode, else bottle)
  //   "WINE 180:- 980:-"      → glass 180 + bottle 980
  //   "WINE 180/980:-"        → slash-form (legacy)
  let price_glass = null, price_bottle = null, body = null, vintRaw = null

  // Try two-price form first
  const m2 = line.match(/^(\d{4})?\s*(.+?)\s+(\d{2,5})\s*:-\s+(\d{2,5})\s*:-\s*$/)
  if (m2) {
    vintRaw = m2[1]; body = m2[2]
    price_glass = parseFloat(m2[3])
    price_bottle = parseFloat(m2[4])
  } else {
    const m1 = line.match(/^(\d{4})?\s*(.+?)\s+(\d{2,5}(?:\/\d{2,5})?)\s*:?-\s*$/)
    if (!m1) continue
    vintRaw = m1[1]; body = m1[2]
    const priceStr = m1[3]
    if (priceStr.includes('/')) {
      const [g, b] = priceStr.split('/').map(parseFloat); price_glass = g; price_bottle = b
    } else if (glassMode) price_glass = parseFloat(priceStr)
    else price_bottle = parseFloat(priceStr)
  }

  // Pull region (last comma piece) and country (next-to-last if recognized)
  const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
  let region = null, rowCountry = country
  if (parts.length >= 2) region = parts[parts.length - 1]

  wines.push({
    name: body.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: vintRaw ? parseInt(vintRaw, 10) : null,
    type, country: rowCountry, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Lilla Vildt', area: 'Stockholm', address: null,
    website: 'https://www.lillavildt.se/',
    wine_list_url: 'https://www.lillavildt.se/wp-content/uploads/2024/12/vinlista-9.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/lilla-vildt.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
