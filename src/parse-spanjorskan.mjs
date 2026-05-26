// One-off text parser for Spanjorskan's wine list (Spanish restaurant, only Spanish wines).
// Reads data/raw/spanjorskan.txt and writes data/extracted/spanjorskan.json.
// Format observed: section headers "RÖDA VINER" / "VITA VINER" / "MOUSSERANDE VIN" / "ROSÉVIN"
// set wine type; ALL-CAPS region names (MALLORCA, TORO, …) set region; wine rows look like
// "YYYY Name, Producer  <tab>  price" or "NV Name, Producer  <tab>  price".
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/spanjorskan.txt', 'utf8')

const TYPE_HEADERS = {
  'RÖDA VINER': 'rött',
  'VITA VINER': 'vitt',
  'VITA VIN': 'vitt',
  'MOUSSERANDE VIN': 'mousserande',
  'ROSÉVIN': 'rosé',
}
// Subsections inside MOUSSERANDE that flip to rosé.
const ROSE_RE = /^ROSÉ\b/

let type = null
let region = null
const wines = []

// First pass: merge wrapped lines. A wine row sometimes wraps after the year, leaving
// the body on the next line. Heuristic: a line that is JUST "YYYY" gets joined with next.
const raw = text.split('\n').map((l) => l.replace(/ /g, ' ').trimEnd())
const lines = []
for (let i = 0; i < raw.length; i++) {
  const l = raw[i]
  if (/^\d{4}\s*$/.test(l) && raw[i + 1]) {
    lines.push(l.trim() + ' ' + raw[++i].trim())
  } else {
    lines.push(l)
  }
}

const looksLikeRegion = (l) =>
  l.length > 0 && l === l.toLocaleUpperCase('sv') && !/\d/.test(l) && !/[a-zäöå]/.test(l)
  && !/^[-–]/.test(l)

for (const raw of lines) {
  const line = raw.trim()
  if (!line) continue
  if (line.startsWith('--')) continue // page footers

  // Section header (wine type)
  let setType = null
  for (const k in TYPE_HEADERS) if (line.toUpperCase().startsWith(k)) setType = TYPE_HEADERS[k]
  if (setType) { type = setType; continue }
  if (ROSE_RE.test(line.toUpperCase())) { type = 'rosé'; continue }

  // Wine row: optional NV/YYYY, then body, then tab+price
  const m = line.match(/^(NV|\d{4})\s+(.+?)\s+(\d{2,5})\s*$/)
  if (m) {
    const vintageRaw = m[1]
    const body = m[2].replace(/\s+/g, ' ').trim()
    const price = parseFloat(m[3])
    const lastComma = body.lastIndexOf(',')
    const name = (lastComma >= 0 ? body.slice(0, lastComma) : body).trim()
    const producer = (lastComma >= 0 ? body.slice(lastComma + 1) : '').trim() || null
    wines.push({
      name,
      producer,
      vintage: vintageRaw === 'NV' ? null : parseInt(vintageRaw, 10),
      type,
      country: 'Spanien',
      region,
      grape: null,
      price_glass: null,
      price_bottle: price,
      currency: 'SEK',
    })
    continue
  }

  // Region header (ALL CAPS, no digits, no lowercase). Skip the gigantic map list on p.2
  // by also requiring we're inside a known type context.
  if (type && looksLikeRegion(line) && line.length < 30) {
    region = normalizeRegion(line)
    continue
  }
}

// pdf-parse sprinkles stray spaces inside words ("RIBER A DEL DUERO"). Collapse them and
// title-case. Also fix a couple of specific Spanish names with diacritics.
function normalizeRegion(s) {
  let r = s.replace(/(\b\w)\s+(\w\b)/g, '$1$2') // join 1-letter splits
  r = r.replace(/\s{2,}/g, ' ').trim()
  // Title-case Swedish style (every word capitalised first letter)
  r = r.toLocaleLowerCase('sv').replace(/(^|\s)(\w)/g, (_, p, c) => p + c.toLocaleUpperCase('sv'))
  // Manual fixes for split-letter pairs the above couldn't resolve.
  const fix = { 'Riber A Del Duero': 'Ribera del Duero', 'Prior At': 'Priorat',
    'Rias Baix As': 'Rías Baixas', 'Riber A Sacr A': 'Ribeira Sacra',
    'Ribeir A Sacr A': 'Ribeira Sacra', 'L A Mancha': 'La Mancha',
    'Aragon': 'Aragón', 'T X Akolina': 'Txakolina', 'Castill A Y León': 'Castilla y León',
    'Conca De Barber A': 'Conca de Barberà', 'Tierr A Barbanza E Iria': 'Tierra de Barbanza',
    'Valdeorr As': 'Valdeorras', 'Aragón': 'Aragón', 'Ar Agón': 'Aragón',
    'Utiel-requena': 'Utiel-Requena' }
  return fix[r] || r
}

const output = {
  restaurant: {
    name: 'Spanjorskan',
    area: 'Östermalm',
    address: 'Nybrogatan 42, Stockholm',
    website: 'https://spanjorskan.se/',
    wine_list_url: 'https://static.thatsup.website/310/59717/Vinlista--6e-maj-2025.pdf?v=1747914140',
  },
  wines,
}

const out = 'data/extracted/spanjorskan.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
// Quick breakdown
const byType = {}, byRegion = {}
for (const w of wines) {
  byType[w.type ?? 'null'] = (byType[w.type ?? 'null'] || 0) + 1
  byRegion[w.region ?? 'null'] = (byRegion[w.region ?? 'null'] || 0) + 1
}
console.log('by type:', byType)
console.log('top regions:', Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).slice(0,8))
