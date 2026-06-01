// Glou Glou Vinbar — rich format: each line is a complete wine entry with bullets:
//   "Vibe • Producer • Wine name • Grape • Region, Country • ABV • Year .... Glas krXX Flaska krYY"
// Multi-line wines (wrap) terminate on "krNNN" or "Flaska krNNN" or "Glas krNNN".
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/glou-glou.txt', 'utf8')

const TYPES = {
  BUBBLOR: 'mousserande', MOUSSERANDE: 'mousserande', CHAMPAGNE: 'mousserande',
  VITT: 'vitt', 'VITA VINER': 'vitt', WHITE: 'vitt',
  RÖTT: 'rött', 'RÖDA VINER': 'rött', RED: 'rött',
  'ROSÉ': 'rosé', ROSÈ: 'rosé', ORANGE: 'orange',
  SÖTT: 'dessert', 'SÖTT VIN': 'dessert',
}
const COUNTRY_HEADERS = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  ÖSTERRIKE: 'Österrike', PORTUGAL: 'Portugal', USA: 'USA', SVERIGE: 'Sverige',
  GREKLAND: 'Grekland', UNGERN: 'Ungern', ENGLAND: 'England',
}
const COUNTRY_NAME_MAP = { France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland', Austria: 'Österrike', Portugal: 'Portugal', USA: 'USA', Sweden: 'Sverige' }

let type = null, country = null
const wines = []
let buf = ''
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line) || /^Följ oss/.test(line) || /^January/.test(line) || /^PÅ TAVLAN/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; buf = ''; continue }
  if (COUNTRY_HEADERS[line]) { country = COUNTRY_HEADERS[line]; buf = ''; continue }
  if (!type) continue
  buf = (buf + ' ' + line).replace(/\s+/g, ' ').trim()
  // Wine entry ends with "krNNN" at end
  const m = buf.match(/^(.+?)\s+\.+\s*(?:Glas\s+kr(\d{2,5})\s*)?(?:Flaska\s+kr(\d{2,5}))?\s*$/)
  if (!m || (!m[2] && !m[3])) continue
  const [, body, glassPrice, bottlePrice] = m

  // Parse body — bullets separated by "•"
  const parts = body.split(/\s*•\s*/).map((s) => s.trim()).filter(Boolean)
  // Typical layout: [vibe, producer, name, grape, region+country, abv, year]
  let producer = null, name = body, grape = null, region = null, rowCountry = country, vintage = null
  if (parts.length >= 3) {
    // Drop leading "Vibe." short word if any
    const start = parts[0].endsWith('.') && parts[0].length < 25 ? 1 : 0
    producer = parts[start] || null
    name = parts[start + 1] || ''
    grape = parts[start + 2] || null
    // Look for region/country
    for (let i = start + 3; i < parts.length; i++) {
      const p = parts[i]
      // Country tail like "..., France"
      const ctyM = p.match(/,\s*([A-Z][a-z]+)\s*$/)
      if (ctyM && COUNTRY_NAME_MAP[ctyM[1]]) { rowCountry = COUNTRY_NAME_MAP[ctyM[1]]; region = p.replace(/,\s*[A-Z][a-z]+\s*$/, '').trim() }
      const yM = p.match(/\b(19|20)\d{2}\b/)
      if (yM) vintage = parseInt(yM[0], 10)
    }
  }

  wines.push({
    name: name.replace(/\s+/g, ' ').trim() || body.slice(0, 60),
    producer, vintage, type,
    country: rowCountry, region, grape,
    price_glass: glassPrice ? parseFloat(glassPrice) : null,
    price_bottle: bottlePrice ? parseFloat(bottlePrice) : null,
    currency: 'SEK',
  })
  buf = ''
}

const output = {
  restaurant: { name: 'Glou Glou Vinbar', area: 'Stockholm', address: null,
    website: 'https://vinbarglouglou.se/',
    wine_list_url: 'https://vinbarglouglou.se/pdf/vinlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/glou-glou.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
