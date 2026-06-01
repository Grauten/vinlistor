// Villa Valentina — Spanish/Mediterranean. Each wine = 3 lines: header (year name price),
// producer/region, tasting note (skip). Section types "VIN PÅ GLAS" etc. dictate glass vs bottle.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/villa-valentina.txt', 'utf8')

const TYPE_BY_HEADER = {
  'MOUSSERANDE PÅ GLAS': { type: 'mousserande', glass: true },
  'VITT PÅ GLAS': { type: 'vitt', glass: true },
  'ROSÉ PÅ GLAS': { type: 'rosé', glass: true },
  'RÖTT PÅ GLAS': { type: 'rött', glass: true },
  'VILLA VALENTINA': null, // section divider — ignore
  'SÄSONGENS URVAL': { type: null, glass: true }, // 4 wines, type embedded in each
  'MOUSSERANDE VINER PÅ FLASKA': { type: 'mousserande', glass: false },
  'VITA VINER PÅ FLASKA': { type: 'vitt', glass: false },
  'ROSÉ PÅ FLASKA': { type: 'rosé', glass: false },
  'ORANGE PÅ FLASKA': { type: 'orange', glass: false },
  'RÖDA VINER PÅ FLASKA': { type: 'rött', glass: false },
}
const SUB_REGIONS = new Set(['CAVA', 'FRANCIACORTA', 'CHAMPAGNE', 'PROSECCO', 'ANDRA MOUSSERANDE'])

let type = null, glassMode = true, region = null
const wines = []

const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (/^-- \d+ of/.test(line)) continue
  if (line === 'WINE LIST' || line === 'VINKÄLLAREN' || line === 'CONTENTS' || /^Vår vinlista|^Vinerna är|Vi hjälper/.test(line)) continue
  if (TYPE_BY_HEADER[line] !== undefined) {
    const h = TYPE_BY_HEADER[line]
    if (h) { type = h.type; glassMode = h.glass; region = null }
    continue
  }
  if (SUB_REGIONS.has(line)) { region = line; continue }

  // Wine row 1: "YYYY/NV NAME PRICE"
  const m = line.match(/^(NV|MV|\d{4})\s+(.+?)\s+(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintRaw, body, priceStr] = m
  // Next line: producer/region info (skip but use as context)
  const next = lines[i + 1] || ''
  // Look for inline type hint in body name on SÄSONGENS URVAL page: "Mousserande." in tasting note line
  let rowType = type
  if (!rowType && i + 2 < lines.length) {
    const noteLine = lines[i + 2] || ''
    if (/^(Mousserande|Mousserande\.|Sparkling)/i.test(noteLine)) rowType = 'mousserande'
    else if (/^(Vitt|White|Vit)/i.test(noteLine)) rowType = 'vitt'
    else if (/^(Rött|Red)/i.test(noteLine)) rowType = 'rött'
    else if (/^(Rosé)/i.test(noteLine)) rowType = 'rosé'
  }
  const price = parseFloat(priceStr)
  wines.push({
    name: body.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
    type: rowType, country: null, region, grape: null,
    price_glass: glassMode ? price : null,
    price_bottle: glassMode ? null : price,
    currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Villa Valentina', area: 'Stockholm', address: null,
    website: 'https://villavalentina.se/',
    wine_list_url: 'https://cdn.prod.website-files.com/69de817fa43b7efc02084f7f/6a01fdc324ea944754d7ec4d_villa-valentina-wine-list.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/villa-valentina.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type ?? 'null'] = (t[w.type ?? 'null']||0)+1
console.log(`Parsed ${wines.length} wines`, t)
