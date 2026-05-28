// Brasserie Lou Lou — French-classic brasserie. Section type → country/region → wine row.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/brasserie-lou-lou.txt', 'utf8')

const TYPES = { 'CHAMPAGNE': 'mousserande', 'WHITE WINE': 'vitt', 'RED WINE': 'rött', 'WHITE MAGNUM': 'vitt', 'RED MAGNUM': 'rött', 'MAGNUM': null }
const COUNTRIES = {
  bourgogne: 'Frankrike', loire: 'Frankrike', savoie: 'Frankrike', italy: 'Italien',
  spain: 'Spanien', germany: 'Tyskland', austria: 'Österrike', usa: 'USA',
  bordeaux: 'Frankrike', rhône: 'Frankrike', rhone: 'Frankrike', 'languedoc / roussillon': 'Frankrike',
  'languedoc/roussillon': 'Frankrike',
}
const REGION_FROM_HEADER = {
  bourgogne: 'Bourgogne', loire: 'Loire', savoie: 'Savoie', bordeaux: 'Bordeaux',
  rhône: 'Rhône', rhone: 'Rhône', 'languedoc / roussillon': 'Languedoc-Roussillon',
}

let type = null, country = null, region = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (/^CARTE DES VINS|^- ALKOHOLFRIA|^FÖLJ OSS|^@BRASSERIE|^White Magnum|^Red Magnum|^3 liter/i.test(line)) continue

  if (TYPES[line.toUpperCase()] !== undefined) { if (TYPES[line.toUpperCase()]) type = TYPES[line.toUpperCase()]; country = null; region = null; continue }
  const lc = line.toLowerCase()
  if (COUNTRIES[lc]) {
    country = COUNTRIES[lc]; region = REGION_FROM_HEADER[lc] || null
    // First country header AFTER champagne section but BEFORE red — switch type to vitt
    if (type === 'mousserande') type = 'vitt'
    continue
  }

  // Wine row: optional vintage, then producer/name, then price (tab or trailing digits)
  const m = line.match(/^(\d{4})?\s*(.+?)\s+(\d{3,5})\s*$/)
  if (!m) continue
  const [, vint, body, priceStr] = m
  if (!body) continue

  wines.push({
    name: body.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: vint ? parseInt(vint, 10) : null,
    type, country: country || 'Frankrike', // default Frankrike for unmatched (most rows are FR)
    region, grape: null,
    price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Brasserie Lou Lou', area: 'Stockholm', address: null,
    website: 'https://www.brasserieloulou.se/',
    wine_list_url: 'https://www.brasserieloulou.se/wp-content/uploads/2026/04/vinlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/brasserie-lou-lou.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/brasserie-lou-lou.json`)
console.log('by type:', t)
