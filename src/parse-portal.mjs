// Portal — Norrmalm's Källarlista, 47 pages, beautifully structured:
//   TYPE section ("MOUSSERANDE VINER / SPARKLING WINES")
//     COUNTRY ("Frankrike / France")
//       Region ("Champagne", "Bourgogne", ...)
//         Producer ("Bérêche et Fils", "Bollinger", ...)
//           Wine rows "YYYY|N/V|M/V Name [tab format-note] PRICE"
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/portal.txt', 'utf8')

const TYPE_BY_HEADER = [
  { rx: /^MOUSSERANDE VINER/i, type: 'mousserande' },
  { rx: /^VITA VINER/i, type: 'vitt' },
  { rx: /^ROSÉVINER/i, type: 'rosé' },
  { rx: /^ORANGE VINER/i, type: 'orange' },
  { rx: /^RÖDA VINER/i, type: 'rött' },
  { rx: /^SÖTA & STARKVINER/i, type: 'dessert' },
  { rx: /^MAGNUM OCH HALVBUTELJER/i, type: null }, // magnums of various — keep last type
]

const COUNTRIES = {
  'Frankrike': 'Frankrike', 'France': 'Frankrike',
  'Italien': 'Italien', 'Italy': 'Italien',
  'Tyskland': 'Tyskland', 'Germany': 'Tyskland',
  'Österrike': 'Österrike', 'Austria': 'Österrike',
  'Sverige': 'Sverige', 'Sweden': 'Sverige',
  'Spanien': 'Spanien', 'Spain': 'Spanien',
  'USA': 'USA',
  'Portugal': 'Portugal',
  'Australien': 'Australien', 'Australia': 'Australien',
  'Sydafrika': 'Sydafrika', 'South Africa': 'Sydafrika',
  'Argentina': 'Argentina', 'Chile': 'Chile',
}

const REGIONS = new Set(['Champagne', 'Bourgogne', 'Alsace', 'Loire', 'Rhône', 'Bordeaux', 'Languedoc', 'Provence', 'Jura', 'Beaujolais', 'Savoie', 'Sud-Ouest', 'Piemonte', 'Toscana', 'Sicilien', 'Veneto', 'Lombardia', 'Friuli', 'Alto Adige', 'Marche', 'Abruzzo', 'Sardinien', 'Mosel', 'Rheingau', 'Rheinhessen', 'Nahe', 'Pfalz', 'Baden', 'Württemberg', 'Franken', 'Saar', 'Ruwer', 'Wachau', 'Kamptal', 'Kremstal', 'Burgenland', 'Steiermark', 'Rioja', 'Ribera del Duero', 'Priorat', 'Penedès', 'Rías Baixas', 'Galicien', 'Mallorca', 'Canarias', 'Napa Valley', 'Sonoma', 'Oregon', 'Washington', 'Santa Barbara', 'Central Coast', 'Mendoza', 'Stellenbosch', 'Swartland', 'Vinho Verde', 'Douro', 'Dao', 'Alentejo', 'Setubal', 'Toscana - Coast', 'Skåne'])

const VINTAGE_PREFIX = /^(N\/V|M\/V|NV|MV|S\.A\.|\d{4})\s+/
const PRICE_TAIL = /(?:\s+(magnum|3l|jeroboam|salmanazar|½|375ml|750ml|1500ml|sext|sextex|tröga))?\s+(\d{3,6})\s*$/i

let type = null, country = null, region = null, producer = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!line) continue
  if (/^-- \d+ of/.test(line)) continue
  if (/^sid\s+\d+$/i.test(line)) continue
  if (/^KÄLLARLISTA/i.test(line) || /^CELLAR LIST/i.test(line)) continue
  // The TOC pages have lines like "Frankrike / France 22" — skip if line ends with a single small number after a TYPE/COUNTRY
  if (/^[A-ZÅÄÖa-zåäö &\-\/]+\s+\d{1,3}$/.test(line) && /\d{1,3}$/.test(line)) {
    const trailing = parseInt(line.match(/\d{1,3}$/)[0], 10)
    if (trailing < 100) continue
  }

  // Top-level type header
  let setType = null
  for (const r of TYPE_BY_HEADER) if (r.rx.test(line)) { setType = r.type; break }
  if (setType !== null) { type = setType; producer = null; region = null; continue }
  if (TYPE_BY_HEADER.some((r) => r.rx.test(line))) continue

  // Country header: "Frankrike" or "Frankrike / France"
  const first = line.split(/\s*\/\s*/)[0]
  if (COUNTRIES[first]) { country = COUNTRIES[first]; producer = null; region = null; continue }

  // Region header
  if (REGIONS.has(line)) { region = line; producer = null; continue }

  // Wine row: starts with vintage, ends with price
  const priceM = line.match(/(?:^|\s)(\d{3,6})\s*$/)
  if (priceM && VINTAGE_PREFIX.test(line)) {
    const price = parseFloat(priceM[1])
    let body = line.slice(0, line.length - priceM[0].length).trim()
    const vM = body.match(VINTAGE_PREFIX)
    const vintRaw = vM[1]
    body = body.replace(VINTAGE_PREFIX, '').trim()
    // Strip trailing format marker (magnum/3l/½/etc.)
    const fmtM = body.match(/\s+(magnum|3l|jeroboam|salmanazar|½|375\s?ml|1500\s?ml)\s*$/i)
    if (fmtM) body = body.slice(0, body.length - fmtM[0].length).trim()
    wines.push({
      name: body.replace(/^\s*['"]?|['"]?\s*$/g, ''),
      producer,
      vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
      type, country, region, grape: null,
      price_glass: null, price_bottle: price, currency: 'SEK',
    })
    continue
  }

  // Otherwise treat as a producer name (if it has some letter content and not obviously something else)
  if (/^[A-ZÅÄÖÉa-zåäöé&'\-,. ]+$/.test(line) && line.length >= 3 && line.length <= 80 && !/\d{3,}/.test(line)) {
    producer = line
  }
}

const output = {
  restaurant: {
    name: 'Portal', area: 'Norrmalm',
    address: null,
    website: 'https://www.portalrestaurant.se/',
    wine_list_url: 'https://www.portalrestaurant.se/wp-content/uploads/2026/05/kallarlista-15-maj-26.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/portal.json', JSON.stringify(output, null, 2))
const t = {}, c = {}
for (const w of wines) { t[w.type] = (t[w.type] || 0) + 1; c[w.country ?? 'null'] = (c[w.country ?? 'null'] || 0) + 1 }
console.log(`Parsed ${wines.length} wines → data/extracted/portal.json`)
console.log('by type:', t, '\nby country:', c)
