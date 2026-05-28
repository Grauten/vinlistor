// Noema — clean one-line-per-wine: "YYYY Name, Region, [Subregion,] CTY (price)"
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/noema.txt', 'utf8')

const TYPES = { 'Rött Vin': 'rött', 'Vitt Vin': 'vitt', 'Mousserande': 'mousserande', 'Champagne': 'mousserande', 'Rosévin': 'rosé', 'Rosé Vin': 'rosé', 'Orange': 'orange', 'Dessert': 'dessert', 'Söt': 'dessert', 'Söta Viner': 'dessert' }
const CTY = {
  FRA: 'Frankrike', FR: 'Frankrike', ITA: 'Italien', IT: 'Italien', ESP: 'Spanien',
  GER: 'Tyskland', DE: 'Tyskland', AUT: 'Österrike', AT: 'Österrike',
  POR: 'Portugal', PT: 'Portugal', USA: 'USA', US: 'USA',
  ARG: 'Argentina', CL: 'Chile', CHI: 'Chile',
  AUS: 'Australien', AU: 'Australien', NZ: 'Nya Zeeland',
  'S.A.': 'Sydafrika', RSA: 'Sydafrika', SA: 'Sydafrika',
  GR: 'Grekland', GRC: 'Grekland',
  ENG: 'England', UK: 'England',
  LEB: 'Libanon', SVN: 'Slovenien', HUN: 'Ungern', SWE: 'Sverige',
}

let type = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; continue }
  if (!type) continue

  // Wine row: "YYYY Name, ..., CTY (price)"
  const m = line.match(/^(NV|MV|\d{4}(?:\/\d{4})*)\s+(.+?)\s*\(([^)]+)\)\s*$/)
  if (!m) continue
  const [, vintRaw, body, priceStr] = m
  // Price might be "(PLEASE ASK OUR SOMMELIER)" — skip
  if (!/^\d+$/.test(priceStr)) continue

  // Parse body: last comma piece should be a 2-4 letter country code
  const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
  let country = null, region = null, name = body
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (CTY[last]) {
      country = CTY[last]
      // Region = second-to-last; if multiple, take the last non-country
      region = parts.length >= 3 ? parts[parts.length - 2] : null
      name = parts.slice(0, -1).join(', ')
    }
  }
  if (parts.length >= 2 && !region) region = parts[parts.length - 1]

  // Vintage (take first year if range like "2014/2015/2016")
  const yM = vintRaw.match(/^(\d{4})/)
  wines.push({
    name: name.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: yM ? parseInt(yM[1], 10) : null,
    type, country, region, grape: null,
    price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Noema', area: 'Stockholm', address: null,
    website: 'https://noemastockholm.se/',
    wine_list_url: 'https://noemastockholm.se/wp-content/uploads/2026/05/vinlista-hemsida2026maj-1.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/noema.json', JSON.stringify(output, null, 2))
const t = {}, c = {}; for (const w of wines) { t[w.type] = (t[w.type]||0)+1; c[w.country??'null'] = (c[w.country??'null']||0)+1 }
console.log(`Parsed ${wines.length} wines → data/extracted/noema.json`)
console.log('by type:', t); console.log('by country:', c)
