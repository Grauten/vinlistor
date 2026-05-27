// Café Klotet — Swedish-language headers, cellar refs like "(A1)" in each row.
// Sections: CHAMPAGNE / ÖVRIGT MOUSSERANDE / VITT / ROSÉ / RÖTT, with country/region
// subheaders inside. Inline "Orange"/"Rosé" overrides the type for that row.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/caf-klotet.txt', 'utf8')

const TYPES = {
  'CHAMPAGNE': 'mousserande',
  'ÖVRIGT MOUSSERANDE': 'mousserande',
  'VITT': 'vitt',
  'ROSÉ': 'rosé',
  'RÖTT': 'rött',
}

const COUNTRY_REGION = {
  'TYSKLAND & ÖSTERRIKE':         { country: null, region: null },          // mixed
  'FRANKRIKE – CHABLIS':          { country: 'Frankrike', region: 'Chablis' },
  'FRANKRIKE – LOIRE':            { country: 'Frankrike', region: 'Loire' },
  'FRANKRIKE – BOURGOGNE':        { country: 'Frankrike', region: 'Bourgogne' },
  'FRANKRIKE – JURA':             { country: 'Frankrike', region: 'Jura' },
  'FRANKRIKE – BEAUJOLAIS':       { country: 'Frankrike', region: 'Beaujolais' },
  'FRANKRIKE – BORDEAUX':         { country: 'Frankrike', region: 'Bordeaux' },
  'FRANKRIKE – RHÔNE':            { country: 'Frankrike', region: 'Rhône' },
  'ÖVRIGA FRANKRIKE':             { country: 'Frankrike', region: null },
  'ITALIEN':                      { country: 'Italien', region: null },
  'ITALIEN - PIEMONTE':           { country: 'Italien', region: 'Piemonte' },
  'ÖVRIGA ITALIEN':               { country: 'Italien', region: null },
  'SPANIEN':                      { country: 'Spanien', region: null },
  'NORDAMERIKA':                  { country: 'USA', region: null },
  'KUL FRÅN KONTINENTEN':         { country: null, region: null },
  'ÖVRIGA VÄRLDEN':               { country: null, region: null },
  'BLANDLÅDAN':                   { country: null, region: null },
}

// Country code → Swedish (used in inline "..., XX" tail).
const INLINE = {
  GER: 'Tyskland', DE: 'Tyskland', AU: 'Österrike', AUT: 'Österrike', FR: 'Frankrike',
  IT: 'Italien', ES: 'Spanien', PT: 'Portugal', AUS: 'Australien', GR: 'Grekland',
  SK: 'Slovakien', GEO: 'Georgien',
}

let type = null, country = null, region = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('--')) continue
  if (line.startsWith('SAKNAR DU') || line.startsWith('VI DJUPDYKER')) continue
  if (line === 'VINLISTAN') continue

  // ROSÉ ---- and RÖTT ---- separators
  const dashSplit = line.match(/^(RÖTT|ROSÉ|VITT)\s*-{3,}/)
  if (dashSplit) { type = TYPES[dashSplit[1]]; country = null; region = null; continue }

  if (TYPES[line]) {
    type = TYPES[line]
    if (line === 'CHAMPAGNE') { country = 'Frankrike'; region = 'Champagne' }
    else if (line === 'ÖVRIGT MOUSSERANDE') { country = null; region = null }
    else { country = null; region = null }
    continue
  }
  if (COUNTRY_REGION[line]) {
    ({ country, region } = COUNTRY_REGION[line])
    continue
  }

  // Wine row: "YYYY/N.V./M.V./NV/MV Body (Cell) [Variant] Price"
  const m = line.match(/^(NV|N\.V\.?|M\.V\.?|MV|\d{4})\s+(.+?)\s+(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, bodyAll, priceStr] = m

  let body = bodyAll
  let typeOverride = null
  // Trailing decorators: "(A1) Magnum", "(B6) Orange Magnum", "(D1)375cl", etc.
  body = body.replace(/\s*\([A-Z]\d\)\s*/g, ' ')              // cell refs
  body = body.replace(/\s*\d{3,4}cl\s*/gi, ' ')               // volume notes
  if (/\bMagnum\b/i.test(body)) body = body.replace(/\bMagnum\b/gi, '').trim() + ' Magnum'
  if (/\bOrange\b/.test(body))  { typeOverride = 'orange'; body = body.replace(/\bOrange\b/g, '') }
  if (/\bRosé\b/.test(body))    { typeOverride = 'rosé';  body = body.replace(/\bRosé\b/g, '') }
  body = body.replace(/\s+/g, ' ').replace(/\s*,\s*$/, '').trim()

  // Optional inline country code "..., XX" at end of body
  let rowCountry = country, rowRegion = region
  const cM = body.match(/^(.*?),\s*([A-Z]{2,4})$/)
  if (cM && INLINE[cM[2]]) {
    rowCountry = INLINE[cM[2]]
    body = cM[1].trim()
  }

  const vintage = /^\d{4}$/.test(vintageRaw) ? parseInt(vintageRaw, 10) : null
  wines.push({
    name: body,
    producer: null,
    vintage,
    type: typeOverride || type,
    country: rowCountry,
    region: rowRegion,
    grape: null,
    price_glass: null,
    price_bottle: parseFloat(priceStr),
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Café Klotet', area: 'Södermalm',
    address: 'Stadsgården 6, Stockholm', website: 'https://cafeklotet.se/',
    wine_list_url: 'https://cafeklotet.se/en/wp-content/uploads/sites/2/2026/03/Vinlista-Klotet-26-02-24.pdf',
  },
  wines,
}
const out = 'data/extracted/caf-klotet.json'
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
