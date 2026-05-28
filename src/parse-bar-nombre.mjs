// Bar Nombre — Spanish wine bar. Page 1 = by-the-glass (Cava/Vino blanco/tinto/dulce
// with a glass price), pages 2-3 = bottle list grouped by region under "Vino Blanco"/
// "Vino Tinto"/"Cava"/"Rosado", page 4 = spirits (skip).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/bar-nombre.txt', 'utf8')

const TYPE = {
  Cava: 'mousserande', 'Vino blanco': 'vitt', 'Vino Blanco': 'vitt',
  'Vino Tinto': 'rött', 'Vino tinto': 'rött',
  'Vino Dulce': 'dessert', 'Vino dulce': 'dessert',
  Rosado: 'rosé', Avec: 'SKIP',
}
const SKIPPED_SECTIONS = /^(Rom|Brandy|Cognac|Calvados|Bourbon|Whisky|Tequila|Orujo)\b/i

let type = null, region = null, glassMode = false
const wines = []
let pageNum = 0

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) {
    if (/^-- \d+ of/.test(line)) { pageNum++; glassMode = (pageNum === 1); region = null }
    continue
  }
  if (line === 'Copas') { glassMode = true; continue }
  // Type headers
  if (TYPE[line]) {
    if (TYPE[line] === 'SKIP') { type = null; continue }
    type = TYPE[line]; region = null; continue
  }
  if (SKIPPED_SECTIONS.test(line)) { type = null; continue }
  if (!type) continue

  // After page 1 we're in bottle territory; sub-section headers are region names.
  // Heuristic: a line with no tab and no trailing price is a region header.
  const tabIdx = line.indexOf('\t')
  const priceTail = line.match(/(\d{2,5})\s*$/)
  if (!priceTail) {
    // Treat as region only if it's short Title-Case text
    if (/^[A-ZÅÄÖ][A-Za-zåäöÅÄÖ\- ]{2,30}$/.test(line) && !/\d/.test(line)) region = line
    continue
  }

  // Glass page rows: "Name\tGrape\tRegion+desc\tprice"
  if (glassMode) {
    const cols = line.split(/\t+/).map((s) => s.trim()).filter(Boolean)
    if (cols.length < 2) continue
    const price = parseFloat(cols[cols.length - 1])
    const name = cols[0]
    const grape = cols.length >= 3 ? cols[1] : null
    const regionDesc = cols.length >= 4 ? cols[2] : (cols.length === 3 ? cols[1] : null)
    // Pull the leading region word from "X, freshness/notes" style description
    const inlineRegion = regionDesc ? regionDesc.split(',')[0].trim() : null
    wines.push({
      name, producer: null, vintage: null, type,
      country: 'Spanien', region: inlineRegion, grape,
      price_glass: price, price_bottle: null, currency: 'SEK',
    })
    continue
  }

  // Bottle rows: usually "Name\tprice", sometimes year embedded
  const price = parseFloat(priceTail[1])
  const body = line.slice(0, line.length - priceTail[0].length).replace(/\t+/g, ' ').trim()
  const yMatch = body.match(/\b(19|20)\d{2}\b/)
  wines.push({
    name: body.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: yMatch ? parseInt(yMatch[0], 10) : null,
    type,
    country: 'Spanien', region,
    grape: null,
    price_glass: null, price_bottle: price, currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Bar Nombre', area: 'Stockholm',
    address: null,
    website: 'https://www.barnombre.se/',
    wine_list_url: 'https://www.barnombre.se/wp-content/uploads/2025/11/Bar-Nombre-vinlista-uppdaterad-211125.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/bar-nombre.json', JSON.stringify(output, null, 2))
const t = {}, c = {}
for (const w of wines) { t[w.type] = (t[w.type] || 0) + 1; c[w.country] = (c[w.country] || 0) + 1 }
console.log(`Parsed ${wines.length} wines → data/extracted/bar-nombre.json`)
console.log('by type:', t)
