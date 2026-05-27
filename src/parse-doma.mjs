// DoMa — heavy on French natural wines, neat hierarchy:
// lowercase top-type ("champagne" / "mousserande" / "vita viner" / "röda viner") →
// COUNTRY (ALL CAPS) → Subregion (Mixed Case) → wine rows.
// Champagne also has style subsections (BLEND, BLANC DE BLANC, BLANC DE NOIRS, ROSÉ)
// which we ignore for the type field (a rosé champagne stays "mousserande").
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/doma.txt', 'utf8')

const TOP_TYPES = {
  'champagne':   { type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  'mousserande': { type: 'mousserande', country: null,         region: null },
  'vita viner':  { type: 'vitt',         country: null,         region: null },
  'röda viner':  { type: 'rött',         country: null,         region: null },
  'rosé':        { type: 'rosé',         country: null,         region: null },
  'orange':      { type: 'orange',       country: null,         region: null },
  'dessert':     { type: 'dessert',      country: null,         region: null },
}

const COUNTRY_HEADERS = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  PORTUGAL: 'Portugal', ÖSTERRIKE: 'Österrike', USA: 'USA', SVERIGE: 'Sverige',
  AUSTRALIEN: 'Australien', SYDAFRIKA: 'Sydafrika', GREKLAND: 'Grekland',
  CHILE: 'Chile', ARGENTINA: 'Argentina', UNGERN: 'Ungern', SCHWEIZ: 'Schweiz',
}
// Style subheaders inside champagne — skip (don't reset country/region).
const STYLE_SKIPS = /^(BLEND|BLANC DE BLANC|BLANC DE NOIRS|ROSÉ)$/

let type = null, country = null, region = null
let inChampagneSection = false
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('--')) continue

  const lc = line.toLowerCase()
  if (TOP_TYPES[lc]) {
    const t = TOP_TYPES[lc]
    type = t.type; country = t.country; region = t.region
    inChampagneSection = (lc === 'champagne')
    continue
  }
  if (inChampagneSection && STYLE_SKIPS.test(line)) continue
  if (COUNTRY_HEADERS[line]) { country = COUNTRY_HEADERS[line]; region = null; continue }

  // Subregion: short Title-Case line, no digits
  if (country && /^[A-ZÄÖÅ][A-Za-zäöåÄÖÅ\- ]{2,40}$/.test(line) && !/\d/.test(line)) {
    region = line
    continue
  }

  // Wine row: vintage prefix, body, optional asterisk, price (may be glued)
  // Handle vintage as YYYY, NV, MV, N.V., M.V., or year-range like 18/19/20
  const m = line.match(/^(NV|N\.V\.?|M\.V\.?|MV|\d{4}|\d{2}\/\d{2}\/\d{2})\s+(.+?)\*?\s*(\d{3,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, bodyAll, priceStr] = m

  let body = bodyAll.replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
  // Detect MAGNUM
  if (/\bMAGNUM\b/i.test(body)) body = body.replace(/\bMAGNUM\b/gi, 'Magnum')

  const vintage = /^\d{4}$/.test(vintageRaw) ? parseInt(vintageRaw, 10) : null
  wines.push({
    name: body,
    producer: null,
    vintage,
    type,
    country,
    region,
    grape: null,
    price_glass: null,
    price_bottle: parseFloat(priceStr),
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'DoMa', area: 'Östermalm',
    address: 'Nybrogatan 48, Stockholm', website: 'https://www.doma.se/',
    wine_list_url: 'https://www.doma.se/wp-content/uploads/2026/05/DoMa-Vinlista-hemsida-55.pdf',
  },
  wines,
}
const out = 'data/extracted/doma.json'
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
