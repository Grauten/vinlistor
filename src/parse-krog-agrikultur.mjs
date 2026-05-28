// Krog Agrikultur — natural-wine focused. Section headers letter-spaced ("c h a m p
// a g n e", "V I T a", "r ö d a") with multi-word country/region subheaders
// ("f r a n k r I k e b o u r g o g n e"). Wine rows are clean tab-separated:
//   "YYYY \t Name \t PRICE" with a space as thousand separator.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/krog-agrikultur.txt', 'utf8')

// Token-based denospace (same as Tegelbacken parser).
const isShort = (t) => t.length > 0 && t.length <= 3 && /^[A-ZÅÄÖa-zåäö0-9]+$/.test(t)
function denospace(line) {
  return line.split(/\t+| {2,}/).map((seg) => {
    const tokens = seg.split(/ +/).filter(Boolean)
    const out = []; let run = []
    const flush = () => { if (run.length >= 2) out.push(run.join('')); else if (run.length) out.push(...run); run = [] }
    for (const t of tokens) { if (isShort(t)) run.push(t); else { flush(); out.push(t) } }
    flush()
    return out.join(' ')
  }).filter(Boolean).join(' ')
}

const TYPES = { CHAMPAGNE: 'mousserande', VITA: 'vitt', VITa: 'vitt', RÖDA: 'rött', 'RÖda': 'rött', ROSÉ: 'rosé', ROsé: 'rosé' }
const COUNTRIES_KEYS = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  ÖSTERRIKE: 'Österrike', PORTUGAL: 'Portugal', USA: 'USA', SVERIGE: 'Sverige',
}
// Common French/Italian/etc region keywords (post-denospace lowercased)
const REGION_KEYS = ['Bourgogne','Loire','Rhône','Alsace','Bordeaux','Champagne','Beaujolais','Jura','Piemonte','Toscana','Sicilien','Rioja','Priorat','Mosel','Wachau','Nahe','Pfalz','Mallorca','Sardinien','Provence','Languedoc','Burgenland','Steiermark']

let type = null, country = null, region = null
const wines = []

for (const raw of text.split('\n')) {
  const dn = denospace(raw)
  if (!dn) continue
  if (/^-- \d+ of/.test(dn) || /^VINLISTA$/i.test(dn)) continue

  // Detect type header (e.g. "CHAMPAGNE", "VITa", "RÖda", "ROSÉ")
  const upper = dn.toUpperCase()
  for (const k of Object.keys(TYPES)) {
    if (upper === k.toUpperCase()) { type = TYPES[k]; country = null; region = null; break }
  }
  // Detect concatenated COUNTRY+REGION header (post-denospace)
  let setCtxByHeader = false
  for (const [ck, cv] of Object.entries(COUNTRIES_KEYS)) {
    if (upper.includes(ck)) {
      country = cv
      // Find which region keyword is present
      region = REGION_KEYS.find((r) => upper.toLowerCase().includes(r.toLowerCase())) || null
      setCtxByHeader = true; break
    }
  }
  if (setCtxByHeader && !/\d/.test(dn) && dn.length < 60) continue
  // Generic "övriga världen", "övriga frankrike"
  if (/ÖVRIGA?\s+VÄRLDEN/i.test(upper)) { country = null; region = null; continue }
  if (/ÖVRIGA?\s+FRANKRIKE/i.test(upper)) { country = 'Frankrike'; region = null; continue }
  if (/ÖVRIGA?\s+ITALIEN/i.test(upper)) { country = 'Italien'; region = null; continue }
  if (/ÖVRIGA?\s+SPANIEN/i.test(upper)) { country = 'Spanien'; region = null; continue }

  // Wine row: "YYYY/MV \t Name \t 1 350" — denospace may have collapsed "1 350" to "1350"
  // Match: vintage prefix, body, then trailing 3-5 digit number (with optional embedded space).
  const m = dn.match(/^(NV|MV|\d{4})\s+(.+?)\s+(\d{1,2}(?:\s\d{3})|\d{3,5})\s*$/)
  if (!m) continue
  const [, vintRaw, body, priceRaw] = m
  const price = parseFloat(priceRaw.replace(/\s+/g, ''))
  let vintage = /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null

  // Inline "(Country)" at end of name (e.g. "Mosel (Tyskland)")
  let rowCountry = country, rowRegion = region
  const cm = body.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  let cleanName = body
  if (cm) {
    cleanName = cm[1].trim()
    const inlineCountry = { Frankrike: 'Frankrike', Tyskland: 'Tyskland', Spanien: 'Spanien', Italien: 'Italien', Portugal: 'Portugal', Österrike: 'Österrike', USA: 'USA', Sverige: 'Sverige' }
    if (inlineCountry[cm[2].trim()]) rowCountry = inlineCountry[cm[2].trim()]
  }

  wines.push({
    name: cleanName,
    producer: null, vintage,
    type, country: rowCountry, region: rowRegion, grape: null,
    price_glass: null, price_bottle: price,
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Krog Agrikultur', area: 'Stockholm',
    address: null,
    website: 'https://agrikultur.se/',
    wine_list_url: 'https://agrikultur.se/wp-content/uploads/2026/05/Agrikultur_Vinlista-A4_27-maj.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/krog-agrikultur.json', JSON.stringify(output, null, 2))
const t = {}, c = {}
for (const w of wines) { t[w.type] = (t[w.type] || 0) + 1; c[w.country ?? 'null'] = (c[w.country ?? 'null'] || 0) + 1 }
console.log(`Parsed ${wines.length} wines → data/extracted/krog-agrikultur.json`)
console.log('by type:', t, '\nby country:', c)
