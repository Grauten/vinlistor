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
  // The back half of the menu is spirits and beer. Without these the sticky `type` carried
  // the last wine section forward and 76 pours of gin, cognac and bottled beer were stored
  // as wines priced 37-198:- a bottle.
  'SNAPS':         'SKIP',
  'VODKA':         'SKIP',
  'GIN':           'SKIP',
  'COGNAC':        'SKIP',
  'CALVADOS':      'SKIP',
  'ARMAGNAC':      'SKIP',
  'GRAPPA':        'SKIP',
  'LIKÖR':         'SKIP',
  'ROM':           'SKIP',
  'BOURBON/RYE':   'SKIP',
  'WHISKY/-EY':    'SKIP',
  'FLASKÖL':       'SKIP',
  // …but dessert wines resume after the beer. denospace() glues "8 CL" into "8CL".
  // These are 8cl pours, so the amount is a glass price, not a bottle price.
  'SÖTT/FORTIFIERAT - 8CL': { type: 'dessert', country: null, region: null, byGlass: true },
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
let byGlass = false
// Page 1 (everything before DRYCKESLISTA) is the by-the-glass menu, and most of those wines
// appear again further down with a real bottle price. Its amounts are glass prices; storing
// them as bottle prices is what made five wines look like 165-195:- bottles.
let glassPage = true
// In the dessert section a long name wraps: "1998 SAUTERNES," / "Château de Fargues,
// Frankrike . 395:-". Without stitching, the wine is named after its producer alone.
let pending = null
const wines = []

for (const raw of text.split('\n')) {
  // Detach the dotted leader from surrounding text — PDF often glues it: "A..........230:-"
  const cleaned = raw.replace(/\.{3,}/g, ' . ')
  const line = denospace(cleaned.trim())
  if (!line || line.startsWith('--')) continue

  // Type / section headers
  if (line === 'DRYCKESLISTA') { glassPage = false; skip = false; pending = null; continue }

  if (TYPE_HEADERS[line] !== undefined) {
    const h = TYPE_HEADERS[line]
    pending = null
    if (h === 'SKIP') { skip = true; continue }
    if (h) { type = h.type; country = h.country; region = h.region; skip = false; byGlass = !!h.byGlass }
    // null = ignored marker (NON VINTAGE etc.), keep current state
    continue
  }
  // "SISTA FLASKAN / LAST BOTTLE" — keep state, just a label
  if (/^SISTA FLASKAN/i.test(line)) continue

  if (skip) continue

  // Wine row: optional vintage, body, then our normalised dotted-leader placeholder " . "
  // \s* not \s+ after the vintage: denospace glues a letter-spaced year to a following
  // short uppercase word, so "2 0 1 5 POL ROGER" arrives as "2015POL ROGER".
  const rowM = line.match(/^(?:(\d{4})\s*)?(.+?)\s+\.\s+(\d{2,5}):-\s*(?:P\/P\.?)?$/)
  if (!rowM) {
    // The first half of a wrapped wine name: a priceless line that either ends in a comma
    // ("1998 SAUTERNES,") or opens with a vintage ("2017 GRÜNER VELTLINER, Auslese").
    // \s* after the vintage because denospace glues a letter-spaced year to a short word
    // that follows it: "2 0 0 3 DON PX" collapses to "2003DON PX".
    const head = line.match(/^(?:(\d{4}|NV)\s*)?(.+?),?\s*$/)
    const hasVintage = head && head[1]
    pending = head && (hasVintage || /,\s*$/.test(line)) ? { vintage: head[1], name: head[2].trim() } : null
    continue
  }
  let [, vintageStr, bodyRaw, priceStr] = rowM

  let body = bodyRaw.replace(/\s+/g, ' ').trim()
  if (pending) {
    body = `${pending.name}, ${body}`
    vintageStr = vintageStr || (pending.vintage !== 'NV' ? pending.vintage : null)
    pending = null
  }

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
    price_glass: byGlass || glassPage ? parseFloat(priceStr) : null,
    price_bottle: byGlass || glassPage ? null : parseFloat(priceStr),
    currency: 'SEK',
  })
}

// Fold each by-the-glass wine into its bottle-list twin so one wine is one row with both
// prices. The two listings word the name differently ("…, Penedès, S PA" vs "…, Penedes"),
// so match on the leading segment plus vintage, and only when exactly one bottle row fits —
// otherwise keep the glass row on its own rather than guess.
const keyOf = (w) => `${w.name.split(',')[0].toLocaleLowerCase('sv').normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '')}|${w.vintage ?? ''}`
const glassRows = wines.filter((w) => w.price_glass != null && w.price_bottle == null)
const bottleRows = wines.filter((w) => w.price_bottle != null)
const merged = new Set()
for (const g of glassRows) {
  const hits = bottleRows.filter((b) => keyOf(b) === keyOf(g))
  if (hits.length === 1 && hits[0].price_glass == null) {
    hits[0].price_glass = g.price_glass
    merged.add(g)
  }
}
const finalWines = wines.filter((w) => !merged.has(w))
console.log(`Merged ${merged.size} by-the-glass rows into their bottle listing`)

const output = {
  restaurant: {
    name: 'Tegelbacken', area: 'Norrmalm',
    address: 'Tegelbacken 2, Stockholm', website: 'https://tegelbacken.com/',
    wine_list_url: 'https://tegelbacken.com/wp-content/uploads/2026/05/Vinlista-260522.pdf',
  },
  wines: finalWines,
}
const out = 'data/extracted/tegelbacken.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
const byType = {}, byCountry = {}
for (const w of finalWines) {
  byType[w.type ?? 'null'] = (byType[w.type ?? 'null'] || 0) + 1
  byCountry[w.country ?? 'null'] = (byCountry[w.country ?? 'null'] || 0) + 1
}
console.log('by type:', byType)
console.log('by country:', byCountry)
