// Dersch — bistro on Södermalm. Sections THE SPARKLING / THE WHITE / THE RED /
// THE SWEET. Each wine = one line "[YYYY] Name, Region  TAB  glass:- / bottle:-",
// optionally followed by a description line we skip.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/dersch.txt', 'utf8')

const TYPES = { 'THE SPARKLING': 'mousserande', 'THE WHITE': 'vitt', 'THE RED': 'rött', 'THE SWEET': 'dessert' }

let type = null
const wines = []

// Wine price line: ends with "P:-" or "P:- / P:-" or "X cl P:-"
const ROW = /^(?:(NV|\d{4})\s+)?(.+?)\s+(?:(\d{1,3})\s?cl\s+)?(\d{1,4})\s*:\s*[-–]\s*(?:\/\s*(\d{1,4})\s*:\s*[-–]\s*)?$/

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; continue }
  if (!type) continue

  const m = line.match(ROW)
  if (!m) continue
  const [, vint, body, glassVolStr, p1, p2] = m
  // If 6cl/8cl/4cl is mentioned (small pour), treat that as glass price; otherwise pairing
  let price_glass = null, price_bottle = null
  if (p2) { price_glass = parseFloat(p1); price_bottle = parseFloat(p2) }
  else if (glassVolStr) { price_glass = parseFloat(p1) } // X cl Y:- — by-the-glass small pour
  else price_bottle = parseFloat(p1)

  // Pull region (last comma-separated piece)
  const pieces = body.split(',').map((s) => s.trim()).filter(Boolean)
  let region = null
  let name = body.trim()
  if (pieces.length >= 2) { region = pieces[pieces.length - 1]; name = pieces.slice(0, -1).join(', ') }

  wines.push({
    name, producer: null,
    vintage: vint && /^\d{4}$/.test(vint) ? parseInt(vint, 10) : null,
    type, country: null, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Dersch', area: 'Stockholm',
    address: null,
    website: 'https://dersch.se/',
    wine_list_url: 'https://dersch.se/wp-content/uploads/2025/06/DERSCH-Meny-Dryck-pdf.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/dersch.json', JSON.stringify(output, null, 2))
const t = {}
for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/dersch.json`)
console.log('by type:', t)
