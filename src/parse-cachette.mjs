// Cachette / Tête — letter-spaced, denospaced via pdfjs-rebuild.
// Producer+wine-name are joined into ONE all-caps token (word boundaries lost in PDF).
// Format:
//   GLAS → glass section header
//   TÊTESRÖDA 145/560 → red glass section, default G/B prices for all below
//   TÊTESVITA 145/600 → white glass section header
//   RÖTT / VITT / MOUSSERANDE → bottle sections
//   LIBANON / FRANKRIKE / ITALIEN / ÖVRIGA VÄRLDEN → country headers
//   Wine row: PRODUCERWINENAMETOKEN [grape names...] [3-char country code] PRICE
import { rebuildPdfText } from './lib/pdfjs-rebuild.mjs'
import { writeFile, mkdir } from 'node:fs/promises'

const pages = await rebuildPdfText('data/raw/cachette.pdf', { columns: 1 })
const allLines = pages.flatMap((p) => p.lines)

const COUNTRY_HEADERS = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  PORTUGAL: 'Portugal', LIBANON: 'Libanon', USA: 'USA', ARGENTINA: 'Argentina',
  CHILE: 'Chile', SVERIGE: 'Sverige', 'ÖVRIGA VÄRLDEN': null, AUSTRALIEN: 'Australien',
  GREKLAND: 'Grekland', UNGERN: 'Ungern', ÖSTERRIKE: 'Österrike',
}
const COUNTRY_CODE = {
  FRA: 'Frankrike', ITA: 'Italien', ESP: 'Spanien', GER: 'Tyskland', POR: 'Portugal',
  LEB: 'Libanon', LIB: 'Libanon', USA: 'USA', ARG: 'Argentina', CHI: 'Chile',
  AUS: 'Australien', SA: 'Sydafrika', GRE: 'Grekland', HUN: 'Ungern', AUT: 'Österrike',
  SWE: 'Sverige',
}
const TYPE_HEADERS = { 'RÖTT': 'rött', VITT: 'vitt', MOUSSERANDE: 'mousserande', 'ROSÉ': 'rosé', DESSERT: 'dessert', CHAMPAGNE: 'mousserande' }

const wines = []
let type = null, country = null
let glassDefaults = null // {g, b} from "TÊTES RÖDA 145/560"

for (const raw of allLines) {
  const l = raw.trim()
  if (!l || l === 'GLAS') continue
  // Section header for glass: TÊTESRÖDA 145/560 (denospaced ATTÊTES with no space)
  const teteM = l.match(/^TÊTES\s*(RÖDA|VITA|MOUSSERANDE|ROSÉ)\s+(\d{2,4})\/(\d{2,4})$/i)
  if (teteM) {
    const sec = teteM[1].toUpperCase()
    type = sec === 'RÖDA' ? 'rött' : sec === 'VITA' ? 'vitt' : sec === 'MOUSSERANDE' ? 'mousserande' : 'rosé'
    glassDefaults = { g: parseFloat(teteM[2]), b: parseFloat(teteM[3]) }
    country = null
    continue
  }
  if (TYPE_HEADERS[l] !== undefined) { type = TYPE_HEADERS[l]; glassDefaults = null; country = null; continue }
  if (COUNTRY_HEADERS[l] !== undefined) { country = COUNTRY_HEADERS[l]; continue }

  // Wine line: PRODUCERWINENAME [grapes] [code] PRICE
  // PRICE could be "G/B" or single "NNN" or single thousand "NNNN"
  let priceG = null, priceB = null
  let body = l
  const gb = body.match(/^(.*?)\s+(\d{2,4})\s*\/\s*(\d{2,4})\s*$/)
  if (gb) { body = gb[1]; priceG = parseFloat(gb[2]); priceB = parseFloat(gb[3]) }
  else {
    const sp = body.match(/^(.*?)\s+(\d{3,5})\s*$/)
    if (sp) { body = sp[1]; priceB = parseFloat(sp[2]) }
    else continue // no price = skip
  }
  // Extract trailing country code
  const tokens = body.split(/\s+/)
  let countryFromCode = null
  if (tokens.length && COUNTRY_CODE[tokens[tokens.length - 1].toUpperCase()]) {
    countryFromCode = COUNTRY_CODE[tokens.pop().toUpperCase()]
  }
  // First token is producer+name joined; rest are grape(s)
  if (!tokens.length) continue
  const producerName = tokens.shift()
  const grape = tokens.length ? tokens.join(' ') : null

  // If glass section, use defaults
  if (glassDefaults && priceG === null && priceB !== null) { priceG = glassDefaults.g; /* keep priceB */ }
  // No glass at all → bottle wine
  wines.push({
    name: producerName, producer: null, vintage: null, type,
    country: countryFromCode || country, region: null, grape,
    price_glass: priceG, price_bottle: priceB, currency: 'SEK',
  })
}

await mkdir('data/extracted', { recursive: true })
for (const r of [
  { name: 'Cachette', slug: 'cachette', area: 'Stockholm', website: 'https://cachette.se/', wine_list_url: null },
  { name: 'Tête', slug: 't-te', area: 'Stockholm', website: 'https://www.tete.se/', wine_list_url: null },
]) {
  await writeFile(`data/extracted/${r.slug}.json`, JSON.stringify({
    restaurant: { name: r.name, area: r.area, address: null, website: r.website, wine_list_url: r.wine_list_url }, wines,
  }, null, 2))
}
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
