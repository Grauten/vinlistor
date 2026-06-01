// Vinfolket — Italian-focused. Type section → country/region → wine row "Name \t price kr".
// Names wrap across 2 lines sometimes.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/vinfolket.txt', 'utf8')

const TYPES = {
  'Mousserande': 'mousserande', 'Övriga Mousserande': 'mousserande', 'Champagne': 'mousserande',
  'Franciacorta': 'mousserande',
  'Röda viner Italien': 'rött', 'Röda viner': 'rött',
  'Vita viner Italien': 'vitt', 'Vita viner': 'vitt',
  'Rosé': 'rosé', 'Dessert': 'dessert', 'Söta viner': 'dessert',
  'Sicilien': null, // sub-region marker
}
const ITALIAN_REGIONS = new Set(['Veneto','Lombardiet','Toscana','Puglien','Marche','Umbrien','Sicilien','Sardinien','Piemonte','Friuli','Alto Adige','Emilia-Romagna','Abruzzo','Marche','Calabria','Lazio','Basilicata'])

let type = null, region = null
const wines = []
let buf = ''
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line)) continue
  if (TYPES[line] !== undefined) { if (TYPES[line]) type = TYPES[line]; buf = ''; continue }
  if (ITALIAN_REGIONS.has(line)) { region = line; buf = ''; continue }
  if (!type) continue
  buf = (buf + ' ' + line).replace(/\s+/g, ' ').trim()
  // End of wine row: ends with "<num> kr" or "<num>kr"
  const m = buf.match(/^(.+?)\s+(\d{2,5})\s*kr?\s*$/i)
  if (m) {
    const [, body, priceStr] = m
    // Pull year from body
    const yM = body.match(/\b(19|20)\d{2}\b/)
    const name = body.replace(/\b(19|20)\d{2}\b/g, '').replace(/Kommer\s+snart!?/g, '').replace(/\s+/g, ' ').trim()
    if (name.length < 3) { buf = ''; continue }
    wines.push({
      name, producer: null,
      vintage: yM ? parseInt(yM[0], 10) : null,
      type, country: 'Italien', region, grape: null,
      price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
    })
    buf = ''
  }
}

const output = {
  restaurant: { name: 'Vinfolket', area: 'Stockholm', address: null,
    website: 'https://vinfolket.se/',
    wine_list_url: 'https://vinfolket.se/userfiles/files/Vinmeny-4(1).pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/vinfolket.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
