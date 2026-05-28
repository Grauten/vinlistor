// Bar Nombre — Spanish wine bar.
//   Page 1: by-the-glass section. 4-column rows: Name \t Grape \t Region+description \t price
//   Page 2-3: bottle list. Region header lines then 2-column rows: Name \t price
//   Page 4: spirits — skip.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/bar-nombre.txt', 'utf8')

const TYPE = {
  Cava: 'mousserande',
  'Vino blanco': 'vitt', 'Vino Blanco': 'vitt',
  'Vino Tinto': 'rött', 'Vino tinto': 'rött',
  'Vino Dulce': 'dessert', 'Vino dulce': 'dessert',
  Rosado: 'rosé',
}
const SPIRITS = /^(Avec|Rom|Brandy|Cognac|Calvados|Bourbon|Whisky|Tequila|Mezcal|Orujo|Gin)\b/i

let type = null, region = null
let page = 1   // text starts on page 1
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line) continue
  // Page markers come at the END of their page → bump to the next page when seen.
  if (/^-- (\d+) of/.test(line)) { page++; region = null; continue }
  if (page >= 4) continue       // spirits / non-wine pages

  // Type / spirits headers
  if (TYPE[line]) { type = TYPE[line]; region = null; continue }
  if (SPIRITS.test(line)) { type = null; continue }
  if (line === 'Copas') continue
  if (!type) continue

  // Row parsing
  const cols = line.split(/\t+/).map((s) => s.trim()).filter(Boolean)
  const priceTail = line.match(/(\d{2,5})\s*$/)
  if (!priceTail) {
    // Plain region header (Title-case, no digits, no comma): "Rías Baixas", "Rueda" etc.
    if (page >= 2 && /^[A-ZÅÄÖ][A-Za-zåäöÅÄÖ\- ]{2,30}$/.test(line) && !/\d/.test(line) && cols.length === 1) {
      region = line
    }
    continue
  }
  const price = parseFloat(priceTail[1])

  if (page === 1) {
    // 3-4 col format with grape and region — price is a by-the-glass price
    const name = cols[0]
    const grape = cols.length >= 3 ? cols[1] : null
    const regionDesc = cols.length >= 4 ? cols[2] : (cols.length === 3 ? cols[1] : null)
    const inlineRegion = regionDesc ? regionDesc.split(',')[0].trim() : null
    wines.push({
      name, producer: null, vintage: null, type,
      country: 'Spanien', region: inlineRegion, grape,
      price_glass: price, price_bottle: null, currency: 'SEK',
    })
    continue
  }

  // Pages 2-3: bottle prices. Pull a year out of the body if present.
  const body = line.slice(0, line.length - priceTail[0].length).replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()
  const yM = body.match(/\b(19|20)\d{2}\b/)
  wines.push({
    name: body.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: yM ? parseInt(yM[0], 10) : null,
    type, country: 'Spanien', region, grape: null,
    price_glass: null, price_bottle: price, currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Bar Nombre', area: 'Stockholm', address: null,
    website: 'https://www.barnombre.se/',
    wine_list_url: 'https://www.barnombre.se/wp-content/uploads/2025/11/Bar-Nombre-vinlista-uppdaterad-211125.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/bar-nombre.json', JSON.stringify(output, null, 2))
const t = {}, withG = wines.filter((w) => w.price_glass).length, withB = wines.filter((w) => w.price_bottle).length
for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/bar-nombre.json`)
console.log('by type:', t)
console.log(`har glas-pris: ${withG} | har flaska-pris: ${withB}`)
