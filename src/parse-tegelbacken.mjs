// Tegelbacken — heavy letter-spacing throughout ("V I T T   V I N", "F R A", "2 0 1 5",
// even country codes glued like "I TA"). Format: "[YYYY] NAME, region, CTRY .... PRICE:-"
// Sections also distinguish "SISTA FLASKAN" (last bottles) variants but type stays the same.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/tegelbacken.txt', 'utf8')

// Tab or 2+ spaces = word boundary preserved by the PDF. Within a boundary-segment,
// consecutive "short uppercase" tokens (≤3 chars, A-Z/0-9/ÅÄÖ) get joined: so
// "V I T T \t V I N" → "VITT VIN", "F R A" → "FRA", "I TA" → "ITA", "2 0 1 5" → "2015".
const isShort = (t) => t.length > 0 && t.length <= 3 && /^[A-ZÅÄÖ0-9]+$/.test(t)
function denospace(line) {
  return line.split(/\t+| {2,}/).map((seg) => {
    const tokens = seg.split(/ +/).filter(Boolean)
    const out = []
    let run = []
    const flush = () => { if (run.length >= 2) out.push(run.join('')); else if (run.length) out.push(...run); run = [] }
    for (const t of tokens) {
      if (isShort(t)) run.push(t)
      else { flush(); out.push(t) }
    }
    flush()
    return out.join(' ')
  }).filter(Boolean).join(' ')
}

const TYPE_HEADERS = {
  'CHAMPAGNE':     { type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  'MOUSSERANDE':   { type: 'mousserande', country: null,         region: null },
  'VITT VIN':      { type: 'vitt',         country: null,         region: null },
  'RÖTT VIN':      { type: 'rött',         country: null,         region: null },
  'ROSÉVIN':       { type: 'rosé',         country: null,         region: null },
  'ROSÈVIN':       { type: 'rosé',         country: null,         region: null }, // typo variant
  'DRYCKESLISTA':  null,    // skip subsequent section markers
  'ALKOHOLFRITT':  'SKIP',  // non-alcoholic — drop wines until next type
  'NON VINTAGE':   null,
  'VINTAGE':       null,
  'VINTAGE ROSÉ':  null,
  'MAGNUM':        null,
}

const CODE_TO_COUNTRY = {
  FRA: 'Frankrike', ITA: 'Italien', SPA: 'Spanien', TYS: 'Tyskland', AUT: 'Österrike',
  USA: 'USA', RSA: 'Sydafrika', SVE: 'Sverige', POR: 'Portugal', AUS: 'Australien',
  ARG: 'Argentina', CHI: 'Chile', NZL: 'Nya Zeeland', UNG: 'Ungern', GRE: 'Grekland',
  ENG: 'England',
}
const NAMED = {
  Frankrike: 'Frankrike', Italien: 'Italien', Spanien: 'Spanien', Tyskland: 'Tyskland',
  Portugal: 'Portugal', Sverige: 'Sverige', Sydafrika: 'Sydafrika',
}

let type = null, country = null, region = null
let skip = false
const wines = []

for (const raw of text.split('\n')) {
  // Detach the dotted leader from surrounding text — PDF often glues it: "A..........230:-"
  const cleaned = raw.replace(/\.{3,}/g, ' . ')
  const line = denospace(cleaned.trim())
  if (!line || line.startsWith('--')) continue

  // Type / section headers
  if (TYPE_HEADERS[line] !== undefined) {
    const h = TYPE_HEADERS[line]
    if (h === 'SKIP') { skip = true; continue }
    if (h) { type = h.type; country = h.country; region = h.region; skip = false }
    // null = ignored marker (NON VINTAGE etc.), keep current state
    continue
  }
  // "SISTA FLASKAN / LAST BOTTLE" — keep state, just a label
  if (/^SISTA FLASKAN/i.test(line)) continue

  if (skip) continue

  // Wine row: optional vintage, body, then our normalised dotted-leader placeholder " . "
  const rowM = line.match(/^(?:(\d{4})\s+)?(.+?)\s+\.\s+(\d{2,5}):-\s*(?:P\/P\.?)?$/)
  if (!rowM) continue
  const [, vintageStr, bodyRaw, priceStr] = rowM

  let body = bodyRaw.replace(/\s+/g, ' ').trim()

  // Try to extract a country tag at end of body.
  let rowCountry = country, rowRegion = region
  // 1) Last comma followed by a 2-4-letter uppercase token (e.g., ", FRA")
  let mt = body.match(/^(.*?),\s*([A-ZÅÄÖ]{2,4})\s*$/)
  if (mt && CODE_TO_COUNTRY[mt[2]]) {
    rowCountry = CODE_TO_COUNTRY[mt[2]]
    body = mt[1].trim()
  } else {
    // 2) Last comma followed by Swedish country name
    mt = body.match(/^(.*?),\s*([A-ZÅÄÖ][a-zåäö]+)\s*$/)
    if (mt && NAMED[mt[2]]) { rowCountry = NAMED[mt[2]]; body = mt[1].trim() }
  }

  // The penultimate comma-segment is often a region/area
  const pieces = body.split(/\s*,\s*/)
  if (pieces.length >= 2 && !rowRegion) rowRegion = pieces[pieces.length - 1].trim()

  // No explicit country code → try to infer from keywords in the wine name (Tegelbacken
  // often omits the country for clearly-French or clearly-Italian appellations).
  if (!rowCountry) {
    const u = body.toUpperCase()
    if (/\b(CHÂTEAU|CHABLIS|BOURGOGNE|BORDEAUX|MEURSAULT|CHASSAGNE|PULIGNY|MONTRACHET|RHÔNE|RHONE|BEAUJOLAIS|CHAMPAGNE|ALSACE|SANCERRE|POUILLY|CHATEAUNEUF|GIGONDAS|CONDRIEU|HERMITAGE|VOLNAY|POMMARD|MORGON|FLEURIE|VOSNE|ROMANÉE|CRU|LANGUEDOC|PROVENCE|SAINT[- ]JOSEPH|SAINT[- ]ESTÈPHE|SAINT[- ]ÉMILION|PESSAC|MARGAUX|PAUILLAC|GRAVES|MÉDOC|FRONSAC)\b/.test(u)) rowCountry = 'Frankrike'
    else if (/\b(BAROLO|BARBARESCO|BRUNELLO|MONTALCINO|CHIANTI|PIEMONTE|TOSCANA|TUSCANY|AMARONE|VALPOLICELLA|SOAVE|PROSECCO|FRANCIACORTA|NEBBIOLO|BARBERA|DOLCETTO|SANGIOVESE|ETNA|SICILY|SICILIEN)\b/.test(u)) rowCountry = 'Italien'
    else if (/\b(RIOJA|PRIORAT|RIBERA DEL DUERO|PENEDÈS|PENEDES|GALICIEN|RIAX BAIXAS|RUEDA|JUMILLA|TORO)\b/.test(u)) rowCountry = 'Spanien'
    else if (/\b(MOSEL|RHEINGAU|PFALZ|RHEINHESSEN|NAHE|BADEN)\b/.test(u)) rowCountry = 'Tyskland'
    else if (/\b(WACHAU|KAMPTAL|BURGENLAND|STEIERMARK)\b/.test(u)) rowCountry = 'Österrike'
    else if (/\b(NAPA|SONOMA|OREGON|WASHINGTON|KALIFORNIEN|CALIFORNIA)\b/.test(u)) rowCountry = 'USA'
    else if (/\b(DOURO|ALENTEJO|VINHO VERDE)\b/.test(u)) rowCountry = 'Portugal'
    else if (/\b(STELLENBOSCH|SWARTLAND|PAARL|HEMEL[- ]EN[- ]AARDE)\b/.test(u)) rowCountry = 'Sydafrika'
  }

  wines.push({
    name: body,
    producer: null,
    vintage: vintageStr ? parseInt(vintageStr, 10) : null,
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
    name: 'Tegelbacken', area: 'Norrmalm',
    address: 'Tegelbacken 2, Stockholm', website: 'https://tegelbacken.com/',
    wine_list_url: 'https://tegelbacken.com/wp-content/uploads/2026/05/Vinlista-260522.pdf',
  },
  wines,
}
const out = 'data/extracted/tegelbacken.json'
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
