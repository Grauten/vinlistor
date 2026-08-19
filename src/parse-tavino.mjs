// Tavino — italian list. Two phases:
//   "VINER PÅ GLAS" (page 3): TYPE → "YYYY/NV Wine, Producer G/B" → "Region, Country"
//   "MOUSSERANDE - FLASKA" / "CHAMPAGNE - FLASKA" / "ROSÉ - FLASKA" / "VITA VINER FLASKA - X" / "RÖDA":
//     producer line "Producer, Region" → "YYYY/NV Wine Name PRICE" → next.
// Outputs same JSON twice (Tavino + Tavino Nytorget — both share PDF).
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/tavino.txt', 'utf8')

const GLASS_TYPES = { MOUSSERANDE: 'mousserande', 'ROSÉ': 'rosé', VITA: 'vitt', 'RÖDA': 'rött' }
const FLASKA_TYPES = {
  'MOUSSERANDE - FLASKA': 'mousserande',
  'CHAMPAGNE - FLASKA': 'mousserande',
  'ROSÉ - FLASKA': 'rosé',
  'RÖDA - FLASKA': 'rött',
  'DESSERTVIN - FLASKA': 'dessert',
}
const REGION_FLASKA_RX = /^(VITA VINER FLASKA|RÖDVINER FLASKA|RÖDA VINER FLASKA|RÖDA FLASKA|RÖTT FLASKA|RÖDA)\s*[-–]?\s*(.+)?$/
const COUNTRY_NAMES = {
  Italien: 'Italien', Frankrike: 'Frankrike', Spanien: 'Spanien', Tyskland: 'Tyskland',
  Österrike: 'Österrike', Portugal: 'Portugal', USA: 'USA', Argentina: 'Argentina',
  Chile: 'Chile', Sverige: 'Sverige', Australien: 'Australien',
}

let mode = 'preamble' // 'glass' | 'flaska'
let type = null, country = null, region = null, producer = null
const wines = []

const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
for (const line of lines) {
  if (line === 'VINER PÅ GLAS') { mode = 'glass'; type = null; producer = null; country = null; continue }
  // Headers introducing flaska sections
  if (FLASKA_TYPES[line] !== undefined) { mode = 'flaska'; type = FLASKA_TYPES[line]; country = null; producer = null; region = null; continue }
  if (line === 'CHAMPAGNE - FLASKA') { mode = 'flaska'; type = 'mousserande'; continue }
  const rmatch = line.match(REGION_FLASKA_RX)
  if (rmatch) {
    mode = 'flaska'
    type = /VITA/i.test(rmatch[1]) ? 'vitt' : 'rött'
    country = rmatch[2] ? COUNTRY_NAMES[rmatch[2].trim()] || null : null
    producer = null; region = null
    continue
  }
  if (/^-- \d/.test(line)) continue

  // GLASS mode rows
  if (mode === 'glass') {
    if (GLASS_TYPES[line]) { type = GLASS_TYPES[line]; continue }
    const g = line.match(/^(\d{4}|NV|MV|N\.V\.)\s+(.+?),\s*([^,]+?)\s+(\d{2,4})\/(\d{2,4})\s*$/)
    if (g) {
      const [, vintRaw, name, prod, gl, bo] = g
      // Region/country next line — captured below
      wines.push({
        name: name.trim(), producer: prod.trim(),
        vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
        type, country: null, region: null, grape: null,
        price_glass: parseFloat(gl), price_bottle: parseFloat(bo), currency: 'SEK',
        _pending_loc: true,
      })
      continue
    }
    // Region/country line for previous wine — "Veneto, Italien" or "Vino d'Italia, Italien"
    const last = wines[wines.length - 1]
    if (last && last._pending_loc) {
      const parts = line.split(',').map((s) => s.trim())
      if (parts.length >= 2 && COUNTRY_NAMES[parts[parts.length - 1]]) {
        last.country = COUNTRY_NAMES[parts[parts.length - 1]]
        last.region = parts.slice(0, -1).join(', ')
      } else if (COUNTRY_NAMES[parts[0]]) {
        last.country = COUNTRY_NAMES[parts[0]]
      } else { last.region = line }
      delete last._pending_loc
      continue
    }
  }

  // FLASKA mode
  if (mode === 'flaska') {
    // Wine row: "YYYY/NV Wine Name <tab/spaces> PRICE"
    const wm = line.match(/^(\d{4}|NV|MV|N\.V\.|M\.V\.)\s+(.+?)\s+(\d{1,2}[ \xa0]?\d{3}|\d{2,4})\s*$/)
    if (wm) {
      const [, vintRaw, name, priceStr] = wm
      wines.push({
        name: name.replace(/\s*\(Magnum\)\s*$/i, ' Magnum').trim(),
        producer,
        vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
        type, country, region, grape: null,
        price_glass: null, price_bottle: parseFloat(priceStr.replace(/[ \xa0]/g, '')),
        currency: 'SEK',
      })
      continue
    }
    // Producer line: "Producer, Region" — no digits, has comma
    if (line.includes(',') && !/\d/.test(line) && line.length < 80) {
      const parts = line.split(',').map((s) => s.trim())
      producer = parts[0]
      region = parts.slice(1).join(', ') || region
      continue
    }
    // Standalone Region/Country header (e.g. "MARCHE", "PIEMONTE", "Sicilien")
    if (/^[A-ZÄÖÅa-zäöå\s'\-–]+$/.test(line) && line.length < 35 && line.toUpperCase() === line) {
      region = line
      producer = null
      continue
    }
  }
}

for (const w of wines) delete w._pending_loc

await mkdir('data/extracted', { recursive: true })
for (const r of [
  { name: 'Tavino', slug: 'tavino', area: 'Vasastan', website: 'https://tavino.se/', wine_list_url: 'https://tavino.se/vinlista.pdf' },
  { name: 'Tavino Nytorget', slug: 'tavino-nytorget', area: 'Södermalm', website: 'https://tavino.se/', wine_list_url: 'https://tavino.se/vinlista.pdf' },
]) {
  await writeFile(`data/extracted/${r.slug}.json`, JSON.stringify({
    restaurant: { name: r.name, area: r.area, address: null, website: r.website, wine_list_url: r.wine_list_url }, wines,
  }, null, 2))
}
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines (Tavino + Tavino Nytorget)`, t)
