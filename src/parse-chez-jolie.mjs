// Chez Jolie — 50-page Bordeaux/Bourgogne-heavy list. Page 1 = TOC, pages 2-3 = broken
// by-the-glass (columns extracted as separate lines), pages 4+ = bottle list which is
// clean: "Section heading" then "Region subsection" then "Producer" then wine rows
// "<YYYY|SA> Name <bin-codes> <tab> price".
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/chez-jolie.txt', 'utf8')

// Section headers that set type + country + region.
const SECTION = [
  { rx: /^Les Magnums Champagne$/i, type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Champagne$/i,             type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Vins Mousseaux/i,         type: 'mousserande', country: null,         region: null },
  { rx: /^Les Magnums Blancs/i,     type: 'vitt',         country: 'Frankrike', region: null },
  { rx: /^Les Magnums Rouges/i,     type: 'rött',         country: 'Frankrike', region: null },
  { rx: /^Vins blancs d['’]Alsace.*Bordeaux/i,   type: 'vitt', country: 'Frankrike', region: null },
  { rx: /^Vins?\s+blancs?\s+(?:de\s+)?Chablis/i, type: 'vitt', country: 'Frankrike', region: 'Chablis' },
  { rx: /^Vins?\s+blancs?\s+(?:de\s+)?Bourgogne/i, type: 'vitt', country: 'Frankrike', region: 'Bourgogne' },
  { rx: /^Vins?\s+blancs?\s+(?:de\s+)?(?:la\s+)?Loire/i, type: 'vitt', country: 'Frankrike', region: 'Loire' },
  { rx: /^Vins?\s+blancs?\s+(?:du\s+)?Jura/i,    type: 'vitt', country: 'Frankrike', region: 'Jura' },
  { rx: /^Vin\s+blancs?.*reste\s+de\s+la\s+France/i, type: 'vitt', country: 'Frankrike', region: null },
  { rx: /^Vins?\s+rosés/i,                       type: 'rosé', country: 'Frankrike', region: null },
  { rx: /^Vins?\s+rouges?\s+(?:de\s+)?Bordeaux/i, type: 'rött', country: 'Frankrike', region: 'Bordeaux' },
  { rx: /^Vins?\s+rouges?\s+(?:de\s+)?Bourgogne/i, type: 'rött', country: 'Frankrike', region: 'Bourgogne' },
  { rx: /^Vins?\s+rouges?\s+(?:de\s+)?Beaujolais/i, type: 'rött', country: 'Frankrike', region: 'Beaujolais' },
  { rx: /^Vins?\s+rouges?\s+(?:du\s+)?Rhône/i,   type: 'rött', country: 'Frankrike', region: 'Rhône' },
  { rx: /^Vins?\s+rouges?\s+reste\s+de\s+la\s+France/i, type: 'rött', country: 'Frankrike', region: null },
  { rx: /^Sélection\s+de\s+vins\s+blancs\s+étrangers/i, type: 'vitt', country: null, region: null },
  { rx: /^Sélection\s+de\s+vins\s+rouges\s+étrangers/i, type: 'rött', country: null, region: null },
  { rx: /^Vins?\s+doux/i,                        type: 'dessert', country: null, region: null },
  { rx: /^Sans alcool/i,                         type: 'SKIP',    country: null, region: null },
]

// Inline foreign country mapping for the "étrangers" sections.
const FOREIGN = {
  Italie: 'Italien', Italia: 'Italien', Italy: 'Italien',
  Espagne: 'Spanien', Spain: 'Spanien',
  Allemagne: 'Tyskland', Germany: 'Tyskland',
  Autriche: 'Österrike',
  Portugal: 'Portugal',
  Hongrie: 'Ungern', Hungary: 'Ungern',
  Grèce: 'Grekland', Greece: 'Grekland',
  Suisse: 'Schweiz',
  Suède: 'Sverige', Sweden: 'Sverige',
  'États-Unis': 'USA', USA: 'USA',
  Australie: 'Australien',
  'Afrique du Sud': 'Sydafrika',
  Argentine: 'Argentina',
  Chili: 'Chile',
}

let type = null, country = null, region = null
let producer = null
let pageNum = 0
let inBottleList = false
let skip = false
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line) continue
  const pm = line.match(/^-- (\d+) of \d+ --$/)
  // Page markers come at END of page → next content is page (n+1). Bottle list starts page 4.
  if (pm) { pageNum = parseInt(pm[1], 10); inBottleList = pageNum >= 3; continue }
  if (!inBottleList) continue
  if (line === 'Carte des Vins') continue
  if (/^\d+$/.test(line)) continue // standalone page numbers

  // Section header?
  let setSection = false
  for (const s of SECTION) {
    if (s.rx.test(line)) {
      if (s.type === 'SKIP') { skip = true } else {
        type = s.type; country = s.country; region = s.region; skip = false
      }
      producer = null
      setSection = true; break
    }
  }
  if (setSection) continue
  if (skip) continue

  // Wine row: "YYYY|SA Body [BIN codes] <tab/spaces> price"
  // BIN codes look like: KA1-KE9, UA1-UE9, CHSE, GLAS, MAGNUM, JÉROBOAM, JÈROBAUM, 3L
  const rowM = line.match(/^(SA|S\.A\.|MV|NV|N\.V\.|\d{4})\s+(.+?)\s+(\d{2,6})\s*$/)
  if (rowM) {
    let body = rowM[2]
    // Strip trailing bin/cellar codes and bottle-format tags.
    body = body.replace(/\s+(?:[KU][A-E]\d|CHSE|GLAS|MAGNUM|JÉROBOAM|JEROBOAM|JÉROBAUM|JÈROBAUM|3L|375CL|375ML|\+\s+[KU][A-E]\d|\+\s+CHSE|Deg\s+\d{4})\b/gi, ' ')
    body = body.replace(/\s+/g, ' ').trim().replace(/,\s*$/, '')

    const vintageRaw = rowM[1]
    const vintage = /^\d{4}$/.test(vintageRaw) ? parseInt(vintageRaw, 10) : null

    // In foreign sections, the producer line often holds the country name in French.
    let rowCountry = country
    if (!rowCountry && producer && FOREIGN[producer]) rowCountry = FOREIGN[producer]

    wines.push({
      name: body,
      producer,
      vintage,
      type,
      country: rowCountry,
      region,
      grape: null,
      price_glass: null,
      price_bottle: parseFloat(rowM[3]),
      currency: 'SEK',
    })
    continue
  }

  // Not a wine row → producer line (no year, no price, just a name).
  if (/^[A-ZÉÊÀÂÄÅÇÔÖÛÜ&'\- ]+(?:[A-Za-zéêàâäåçôöûü&'\- ]+)?$/.test(line) && line.length < 70 && !/\d/.test(line)) {
    producer = line
    continue
  }
}

const output = {
  restaurant: {
    name: 'Chez Jolie', area: 'Norrmalm',
    address: 'Ingmar Bergmans gata 2, Stockholm', website: 'https://chezjolie.se/',
    wine_list_url: 'https://chezjolie.se/wp-content/uploads/2026/05/WINELIST_260505.pdf',
  },
  wines,
}
const out = 'data/extracted/chez-jolie.json'
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
