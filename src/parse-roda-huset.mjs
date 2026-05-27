// Röda Huset — mostly natural-wine focused. Headers are letter-spaced ("W H I T E S
// F R O M F R A N C E"); we collapse single-letter runs first. Page 1 is sake (skip),
// pages 2–9 are wines, page 10 is spirits (skip). Country comes from section header
// "WHITES FROM X" / "REDS FROM X"; sometimes inline as "(Country)" for catch-all groups.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const raw = await readFile('data/raw/r-da-huset.txt', 'utf8')

// Collapse runs of "X X X" into "XXX" (single uppercase letters separated by spaces).
function denospace(s) {
  const tokens = s.split(/\s+/)
  const out = []
  let buf = ''
  for (const t of tokens) {
    if (t.length === 1 && /[A-ZÅÄÖ]/.test(t)) { buf += t }
    else { if (buf) { out.push(buf); buf = '' } out.push(t) }
  }
  if (buf) out.push(buf)
  return out.join(' ')
}

// Keys are post-denospace (so "SOUTH AFRICA" → "SOUTHAFRICA").
const COUNTRY_HEADERS = {
  FRANCE: 'Frankrike', ITALY: 'Italien', SPAIN: 'Spanien', PORTUGAL: 'Portugal',
  AUSTRIA: 'Österrike', GERMANY: 'Tyskland', GREECE: 'Grekland',
  NEWWORLD: null, OTHERS: null, USA: 'USA', AUSTRALIA: 'Australien',
  SOUTHAFRICA: 'Sydafrika', CROATIA: 'Kroatien',
}
const INLINE_COUNTRY = {
  Spain: 'Spanien', Italy: 'Italien', Austria: 'Österrike', 'South Africa': 'Sydafrika',
  Sweden: 'Sverige', Portugal: 'Portugal', Germany: 'Tyskland', 'New Zeeland': 'Nya Zeeland',
  France: 'Frankrike', Greece: 'Grekland', Switzerland: 'Schweiz', Hungary: 'Ungern',
}

const STOP_SECTIONS = /^(WHISKY|COGNAC|ARMAGNAC|CALVADOS|GRAPPA|TEQUILA|RUM|EAU-DE-VIE)\b/

let type = null, country = null, region = null
let inWines = false // becomes true at page 2 (after sake)
let stop = false
const wines = []

const lines = raw.split('\n')
let pageNum = 0
for (let raw of lines) {
  const line = denospace(raw.trim())
  if (!line) continue
  const pageM = line.match(/^-- (\d+) of \d+ --$/)
  // Page marker appears AT END of its page → after page-1 marker we're now in page 2.
  if (pageM) { pageNum = parseInt(pageM[1], 10); inWines = pageNum >= 1; continue }
  if (!inWines) continue
  if (stop) continue

  // Stop at spirits sections on page 10
  if (STOP_SECTIONS.test(line)) { stop = true; continue }

  // Type headers (post-denospace these are all concatenated single words)
  if (/^CHAMPAGNE$/.test(line))     { type = 'mousserande'; country = 'Frankrike'; region = 'Champagne'; continue }
  if (/^OTHERBUBBLES$/.test(line))  { type = 'mousserande'; country = null; region = null; continue }
  if (/^ORANGE$/.test(line))        { type = 'orange'; country = null; region = null; continue }
  if (/^ROSÉ$/.test(line))          { type = 'rosé'; country = null; region = null; continue }
  if (/^SWEETANDFORTIFIED$/.test(line)) { type = 'dessert'; country = null; region = null; continue }

  // Country headers: "WHITESFROMFRANCE" / "REDSFROMITALY" etc — \s* allows both spaced and glued
  const ch = line.match(/^(WHITES?|REDS?)\s*FROM\s*(?:THE\s*)?(.+)$/)
  if (ch) {
    type = ch[1].startsWith('W') ? 'vitt' : 'rött'
    const tag = ch[2].trim().toUpperCase()
    country = COUNTRY_HEADERS[tag] ?? null
    region = null
    continue
  }

  // Sub-region header inside a country: a short Title-Case line with no digits, no price.
  if (country && /^[A-ZÅÄÖ][A-Za-zåäöÅÄÖ\- ]{2,30}$/.test(line) && !/\d/.test(line) && line === line.replace(/\s+/g, ' ')) {
    region = line
    continue
  }

  // Wine row: "YYYY/MV/NV ... price"  — sometimes "(Country) price"
  const m = line.match(/^(NV|MV|\d{4}(?:-\d{4})?)\s+(.+?)\s+(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, body, priceStr] = m

  // Inline (Country) at end of body
  let rowCountry = country, rowRegion = region
  let nameBody = body
  const inline = body.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (inline) {
    nameBody = inline[1].trim()
    const c = INLINE_COUNTRY[inline[2].trim()]
    if (c) rowCountry = c
  }

  let vintage = null
  if (/^\d{4}$/.test(vintageRaw)) vintage = parseInt(vintageRaw, 10)
  else if (/^\d{4}-\d{4}$/.test(vintageRaw)) vintage = parseInt(vintageRaw.split('-')[1], 10) // pick later year

  wines.push({
    name: nameBody.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage,
    type,
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
    name: 'Röda Huset', area: 'Norrmalm',
    address: 'Malmskillnadsgatan 9, Stockholm', website: 'https://rodahuset.nu/',
    wine_list_url: 'https://rodahuset.nu/wp-content/uploads/2026/03/VinlistaRH_19mars2026.pdf',
  },
  wines,
}
const out = 'data/extracted/r-da-huset.json'
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
