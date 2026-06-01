// Restaurang Eld — Viking-themed. The first 90+ lines are mead/beer/cider/soda; wine
// list starts with "MOUSSERANDE" header. Wine rows: "Name, Country/Region alc% \t glass/bottle:-".
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/restaurang-eld.txt', 'utf8')

const TYPES = {
  MOUSSERANDE: 'mousserande', CHAMPAGNE: 'mousserande',
  'VITT VIN': 'vitt', VITT: 'vitt', 'VITA VINER': 'vitt',
  'RÖTT VIN': 'rött', RÖTT: 'rött', 'RÖDA VINER': 'rött',
  ROSÉ: 'rosé', 'ROSÉVIN': 'rosé',
  SÖTT: 'dessert', 'SÖTT VIN': 'dessert',
}
const STOP = /^(AVEC|SNAPS|COCKTAIL|DRINKAR|VARM DRYCK|KAFFE|TE|VATTEN)/i
const COUNTRY_MAP = {
  France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
  Austria: 'Österrike', Portugal: 'Portugal', USA: 'USA', Sweden: 'Sverige',
  Australia: 'Australien', 'South Africa': 'Sydafrika', Argentina: 'Argentina',
  Chile: 'Chile', Belgium: 'Belgien', Hungary: 'Ungern',
  Frankrike: 'Frankrike', Italien: 'Italien', Spanien: 'Spanien', Tyskland: 'Tyskland',
}

let type = null
const wines = []
const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
let buf = ''
for (const line of lines) {
  if (/^-- \d+ of/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; buf = ''; continue }
  if (STOP.test(line)) { type = null; buf = ''; continue }
  if (!type) continue
  buf = (buf + ' ' + line).trim()
  // End of row: "...glass/bottle:-"
  const m = buf.match(/^(.+?)\s+(\d{2,5}(?:\/\d{2,5})?)\s*:?-\s*$/)
  if (!m) continue
  const [, body, priceStr] = m
  // Skip non-alcoholic rows (most have "0,0%" or "0,5%")
  if (/\b(0[,.][05])%/.test(body) && !/(MOUSSERANDE)/i.test(type)) { buf = ''; continue }

  let price_glass = null, price_bottle = null
  if (priceStr.includes('/')) { const [g, b] = priceStr.split('/').map(parseFloat); price_glass = g; price_bottle = b }
  else price_bottle = parseFloat(priceStr)

  // Pull country and grape from body — last segment is alc%, before that country/region
  // Try splitting on commas/slashes; last token before alc% is country
  const noAlc = body.replace(/\s*\d{1,2}(?:[,.]\d)?%.*$/, '').trim()
  const parts = noAlc.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
  let country = null, region = null, name = noAlc
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (COUNTRY_MAP[last]) { country = COUNTRY_MAP[last]; if (parts.length >= 2) name = parts.slice(0, -1).join(', '); }
    else { region = last }
  }

  wines.push({
    name: name.replace(/\s+/g, ' ').trim(),
    producer: null, vintage: null,
    type, country, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
  buf = ''
}

const output = {
  restaurant: { name: 'Restaurang Eld', area: 'Stockholm', address: null,
    website: 'https://thevikingmuseum.com/',
    wine_list_url: 'https://thevikingmuseum.com/wp-content/uploads/2026/05/DRYCK_SE-1.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/restaurang-eld.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
