// Tosto — Italian-leaning. Clean tab-separated. Page 1 = by-the-glass (4 cols), pages 2+
// = bottle list (3 cols). Country/region inline as last comma piece in body.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/tosto.txt', 'utf8')

const TYPES = { Sparkling: 'mousserande', Rosé: 'rosé', Rose: 'rosé', White: 'vitt', Red: 'rött', Sweet: 'dessert', Dessert: 'dessert' }
const COUNTRY_MAP = {
  France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
  Austria: 'Österrike', Portugal: 'Portugal', Sweden: 'Sverige', USA: 'USA',
  Australia: 'Australien', 'South Africa': 'Sydafrika', Argentina: 'Argentina',
  Chile: 'Chile', Morocco: 'Marocko', 'United Kingdom': 'England', England: 'England',
  Hungary: 'Ungern', Greece: 'Grekland', Slovenia: 'Slovenien',
  Lebanon: 'Libanon', Switzerland: 'Schweiz', Croatia: 'Kroatien',
}

let type = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; continue }
  // Sub-section headers like "Champagne", "France - Burgundy", "Italy - Piedmont", "Rest of the World"
  if (!/\t/.test(line) && line.length < 60 && !/^\d{4}/.test(line)) continue
  if (!type) continue

  // Row: "[YYYY|NV|MV] \t Name, Region, Country \t [glass/]bottle"
  const cols = line.split(/\t+/).map((s) => s.trim()).filter(Boolean)
  if (cols.length < 2) continue
  let vintRaw = null, body = null, priceStr = null
  if (cols.length >= 3 && /^(NV|N\.V\.?|MV|\d{4})$/.test(cols[0])) {
    vintRaw = cols[0]; body = cols[1]; priceStr = cols[cols.length - 1]
  } else if (cols.length >= 2) {
    // Vintage glued to body: "2023 Name, ..."
    const m = cols[0].match(/^(NV|MV|\d{4})\s+(.+)$/)
    if (m) { vintRaw = m[1]; body = m[2] + (cols.length > 2 ? ' ' + cols.slice(1, -1).join(' ') : '') }
    else body = cols.slice(0, -1).join(' ')
    priceStr = cols[cols.length - 1]
  }
  if (!body || !priceStr) continue

  let price_glass = null, price_bottle = null
  const dual = priceStr.match(/^(\d{2,5})\s*\/\s*(\d{2,5})$/)
  if (dual) { price_glass = parseFloat(dual[1]); price_bottle = parseFloat(dual[2]) }
  else if (/^\d{2,5}$/.test(priceStr)) price_bottle = parseFloat(priceStr)
  else continue

  // Parse "Name, Region, Country" — last comma piece = country
  const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
  let country = null, region = null, name = body
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (COUNTRY_MAP[last]) { country = COUNTRY_MAP[last]; if (parts.length >= 3) region = parts[parts.length - 2]; name = parts.slice(0, COUNTRY_MAP[last] ? -1 : 0).join(', ') }
  }
  if (parts.length >= 3 && !region) region = parts[parts.length - 2]
  if (parts.length >= 2 && !country) name = parts.slice(0, -1).join(', ')

  wines.push({
    name: name.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
    type, country, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Tosto', area: 'Stockholm', address: null,
    website: 'https://tosto.nu/',
    wine_list_url: 'https://tosto.nu/wp-content/uploads/2026/05/Tosto-Winelist-2026-05-12.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/tosto.json', JSON.stringify(output, null, 2))
const t = {}, c = {}; for (const w of wines) { t[w.type] = (t[w.type]||0)+1; c[w.country??'null'] = (c[w.country??'null']||0)+1 }
console.log(`Parsed ${wines.length} wines → data/extracted/tosto.json`)
console.log('by type:', t); console.log('by country:', c)
