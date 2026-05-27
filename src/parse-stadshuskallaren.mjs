// Stadshuskällaren — page 1 is "VINER PÅ GLAS" (glass prices); pages 2+ are bottle list
// with Swedish/English bilingual headers ("VITA VINER / WHITE WINES") and country
// subheaders ("FRANKRIKE / FRANCE") then region subheaders ("ALSACE", "BOURGOGNE", ...).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/stadshusk-llaren.txt', 'utf8')

// Top-level type sections — match the first word of bilingual headers.
const TYPE_PATTERNS = [
  { rx: /^CHAMPAGNE\b/,                     type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^ROSÉ CHAMPAGNE\b/,                type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^VINTAGE CHAMPAGNE\b/,             type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^MAGNUM CHAMPAGNE\b/,              type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^MOUSSERANDE VINER\b/,             type: 'mousserande', country: null,        region: null },
  { rx: /^VITA VINER\b/,                    type: 'vitt',         country: null,        region: null },
  { rx: /^RÖDA VINER\b/,                    type: 'rött',         country: null,        region: null },
  { rx: /^ROSÉVINER\b/,                     type: 'rosé',         country: null,        region: null },
  { rx: /^SÖTA VINER\b/,                    type: 'dessert',      country: null,        region: null },
  // Glass page subsections — set type and a flag we read later
  { rx: /^CHAMPAGNE & MOUSSERANDE VINER GLAS\b/, type: 'mousserande', country: null, region: null, glass: true },
  { rx: /^VITA VINER RIESLING WEEKS GLAS\b/,     type: 'vitt',         country: null, region: null, glass: true },
  { rx: /^CORAVIN VITA VINER GLAS\b/,            type: 'vitt',         country: null, region: null, glass: true },
  { rx: /^ROSÉVINER GLAS\b/,                     type: 'rosé',         country: null, region: null, glass: true },
  { rx: /^RÖDA VINER GLAS\b/,                    type: 'rött',         country: null, region: null, glass: true },
  { rx: /^CORAVIN RÖDA VINER GLAS\b/,            type: 'rött',         country: null, region: null, glass: true },
  { rx: /^SÖTA VINER GLAS\b/,                    type: 'dessert',      country: null, region: null, glass: true },
]

// Bilingual country headers like "FRANKRIKE / FRANCE"
const COUNTRY_HEADERS = {
  'FRANKRIKE': 'Frankrike', 'ITALIEN': 'Italien', 'SPANIEN': 'Spanien', 'TYSKLAND': 'Tyskland',
  'PORTUGAL': 'Portugal', 'ÖSTERRIKE': 'Österrike', 'USA': 'USA', 'SVERIGE': 'Sverige',
  'AUSTRALIEN': 'Australien', 'SYDAFRIKA': 'Sydafrika', 'CHILE': 'Chile',
  'ARGENTINA': 'Argentina', 'UNGERN': 'Ungern', 'NYA ZEELAND': 'Nya Zeeland',
  'GREKLAND': 'Grekland', 'ÖVRIGA': null, 'ENGLAND': 'England',
}

// Inline country at end of row, after a comma (used on the glass page and the
// MOUSSERANDE bottle section). "Rheingau, Tyskland" → region=Rheingau, country=Tyskland.
const INLINE_COUNTRY = new Set(['Frankrike', 'Italien', 'Spanien', 'Tyskland', 'Portugal',
  'Österrike', 'USA', 'Sverige', 'Australien', 'Sydafrika', 'Chile', 'Argentina', 'Ungern',
  'Nya Zeeland', 'Grekland', 'England', 'Slovakien', 'Skåne'])

let type = null, country = null, region = null, glassMode = false
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('--')) continue
  if (line.startsWith('VINER PÅ GLAS')) { glassMode = true; continue }

  // Type / section headers (longest-first via the array order; first match wins)
  let matched = false
  for (const p of TYPE_PATTERNS) {
    if (p.rx.test(line)) {
      type = p.type; country = p.country; region = p.region
      glassMode = !!p.glass
      matched = true; break
    }
  }
  if (matched) continue

  // Country header (first word of "FRANKRIKE / FRANCE")
  const ch = COUNTRY_HEADERS[line.split(/\s*\/\s*/)[0]]
  if (ch !== undefined) { country = ch; region = null; continue }

  // Region header (Title or ALL-CAPS, short, no digits)
  if (country && /^[A-ZÅÄÖ][A-ZÅÄÖ\- ]{2,40}$/.test(line) && !/\d/.test(line)) {
    region = line.replace(/\s+/g, ' ')
    continue
  }

  // Wine row: vintage + body + price
  const m = line.match(/^(NV|N\.V\.?|MV|\d{4})\s+(.+?)\s+(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, bodyAll, priceStr] = m

  let body = bodyAll.replace(/\s+/g, ' ').trim()
  let rowCountry = country, rowRegion = region
  // Pull trailing "..., Country" inline
  const cm = body.match(/^(.*?),\s*([A-ZÅÄÖ][A-Za-zåäöÅÄÖ ]+)$/)
  if (cm && INLINE_COUNTRY.has(cm[2].trim())) {
    rowCountry = cm[2].trim() === 'Skåne' ? 'Sverige' : cm[2].trim()
    if (cm[2].trim() === 'Skåne') rowRegion = rowRegion || 'Skåne'
    body = cm[1].trim()
  }

  // 375ml or MAGNUM → bottle price even on the glass page.
  const isHalfBottle = /\b375\s*ml\b|MAGNUM/i.test(body)
  const price = parseFloat(priceStr)
  const price_glass  = (glassMode && !isHalfBottle) ? price : null
  const price_bottle = (glassMode && !isHalfBottle) ? null : price

  const vintage = /^\d{4}$/.test(vintageRaw) ? parseInt(vintageRaw, 10) : null
  wines.push({
    name: body,
    producer: null,
    vintage,
    type,
    country: rowCountry,
    region: rowRegion,
    grape: null,
    price_glass,
    price_bottle,
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Stadshuskällaren', area: 'Kungsholmen',
    address: 'Stockholms Stadshus, Hantverkargatan 1, Stockholm',
    website: 'http://www.stadshuskallarensthlm.se/',
    wine_list_url: 'http://stadshuskallarensthlm.se/wp-content/uploads/2026/05/Vinlista-SHK-Maj-1.pdf',
  },
  wines,
}
const out = 'data/extracted/stadshusk-llaren.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
const byType = {}, byCountry = {}
for (const w of wines) {
  byType[w.type ?? 'null'] = (byType[w.type ?? 'null'] || 0) + 1
  byCountry[w.country ?? 'null'] = (byCountry[w.country ?? 'null'] || 0) + 1
}
console.log('by type:', byType)
console.log('by country:', byCountry)
