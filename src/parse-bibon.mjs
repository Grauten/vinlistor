// Bibon — clean tab-separated. Sections: CHAMPAGNE / SPARKLING / ROSÉ / WHITE / RED etc.
// Row: "YYYY Name \t price" or "Country Name \t price" (sometimes year missing).
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/bibon.txt', 'utf8')

const TYPES = {
  'CHAMPAGNE': 'mousserande', 'CHAMPAGNE, BLANC DE BLANCS': 'mousserande',
  'CHAMPAGNE, ROSÈ': 'mousserande', 'CHAMPAGNE, MAGNUM': 'mousserande',
  'SPARKLING WINES': 'mousserande', 'SPARKLING': 'mousserande',
  'WHITE WINE': 'vitt', 'WHITE': 'vitt',
  'RED WINE': 'rött', 'RED': 'rött',
  'ROSÉ': 'rosé', 'ROSE': 'rosé',
  'DESSERT': 'dessert', 'SWEET': 'dessert',
}
const COUNTRY_PREFIXES = {
  France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
  Austria: 'Österrike', USA: 'USA', Portugal: 'Portugal', Sweden: 'Sverige',
  Australia: 'Australien', 'South Africa': 'Sydafrika', Argentina: 'Argentina',
  Chile: 'Chile', Greece: 'Grekland', Hungary: 'Ungern', England: 'England',
}

let type = null, country = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (/^WINE LIST|^BIBON|^FOLLOW US/i.test(line)) continue

  if (TYPES[line.toUpperCase()] !== undefined) {
    type = TYPES[line.toUpperCase()]
    if (line.includes('ROSÈ') || line.includes('ROSÉ')) {
      // CHAMPAGNE, ROSÉ → keep mousserande type but mark as rosé
    }
    continue
  }
  if (!type) continue

  // Row: "<optional vintage|country> Name \t price"
  const cols = line.split(/\t+/).map((s) => s.trim()).filter(Boolean)
  if (cols.length < 2) continue
  const priceStr = cols[cols.length - 1]
  if (!/^\d{2,5}$/.test(priceStr)) continue
  const price = parseFloat(priceStr)
  let body = cols.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim()

  // Pull vintage from start
  let vintage = null, rowCountry = country
  const vM = body.match(/^(NV|MV|\d{4})\s+(.+)$/i)
  if (vM) {
    if (/^\d{4}$/.test(vM[1])) vintage = parseInt(vM[1], 10)
    body = vM[2]
  }
  // Check for country prefix
  for (const [k, v] of Object.entries(COUNTRY_PREFIXES)) {
    if (body.startsWith(k + ' ')) { rowCountry = v; body = body.slice(k.length + 1) }
  }

  wines.push({
    name: body.replace(/\s+/g, ' ').trim(),
    producer: null, vintage,
    type, country: rowCountry, region: null, grape: null,
    price_glass: null, price_bottle: price, currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Bibon', area: 'Stockholm', address: null,
    website: 'https://www.bibon.se/',
    wine_list_url: 'https://cdn.sanity.io/files/8mcognpo/production/dd9c43703870044adc0a2baf858c1d70.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/bibon.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines → data/extracted/bibon.json`)
console.log('by type:', t)
