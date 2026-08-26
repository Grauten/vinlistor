// The Winery Hotel — unique format: each wine block has a header (cuvée name), a
// prose description, then multiple vintages: "YYYY <tab> Grape <tab> Price" with
// optional "Magnum" before price.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/winery-hotel.txt', 'utf8')

const TYPE_RX = [
  { rx: /Champagne|Sparkling/i, type: 'mousserande' },
  { rx: /\bRoséviner|Rosé wines|Black Bottle Rosé/i, type: 'rosé' },
  { rx: /Bianco|White wines/i, type: 'vitt' },
  { rx: /Rosso|Red wines|Winery Red|Terreno Chianti|Momento Massimo|Supertuscan/i, type: 'rött' },
  { rx: /Dessert|Sweet|Vin Santo|Passito/i, type: 'dessert' },
]
const COUNTRY_HEADERS = {
  FRANCE: 'Frankrike', FRANKRIKE: 'Frankrike', ITALY: 'Italien', ITALIEN: 'Italien',
  SPAIN: 'Spanien', SPANIEN: 'Spanien', GERMANY: 'Tyskland', TYSKLAND: 'Tyskland',
  AUSTRIA: 'Österrike', ÖSTERRIKE: 'Österrike', PORTUGAL: 'Portugal', USA: 'USA',
  AUSTRALIA: 'Australien', 'SOUTH AFRICA': 'Sydafrika',
}

let type = null, country = null, cuvée = null
const wines = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line)) continue

  if (COUNTRY_HEADERS[line]) { country = COUNTRY_HEADERS[line]; continue }

  // Colour sections are ALL CAPS and singular ("WHITE WINE", "BORDEAUX RED WINE"). TYPE_RX
  // only knew the plural "White wines", so nothing after CHAMPAGNE ever changed the type and
  // 162 of 191 wines — Bordeaux and Rioja included — were stored as mousserande. Several of
  // these headers name the origin too, so take the country from them while we are here.
  const sectionM = line.match(/^([A-ZÅÄÖ ]+?)?\s*(RED|WHITE|ROSÉ|ROSE|SPARKLING|DESSERT|SWEET)\s+WINES?$/)
  if (sectionM) {
    type = { RED: 'rött', WHITE: 'vitt', 'ROSÉ': 'rosé', ROSE: 'rosé', SPARKLING: 'mousserande', DESSERT: 'dessert', SWEET: 'dessert' }[sectionM[2]]
    const origin = (sectionM[1] || '').replace(/\bMAGNUM\b/, '').trim()
    if (COUNTRY_HEADERS[origin]) country = COUNTRY_HEADERS[origin]
    else if (origin === 'BORDEAUX') country = 'Frankrike'
    cuvée = null
    continue
  }
  if (/^CHAMPAGNE$/.test(line)) { type = 'mousserande'; country = 'Frankrike'; cuvée = null; continue }
  // Wine row: "YYYY <tab> Grape(s) <tab> [Magnum] Price"
  // The price uses a space as the thousands separator ("3 000", "7 800"). With a bare
  // \d{2,5} the preceding \s+ ate that space and only the last group survived: every
  // "X 000" bottle became 0 and Mouton Rothschild's 7 800 became 800.
  const wineM = line.match(/^(\d{4})\s+(.+?)\s+(?:Magnum\s+)?(\d{1,3}(?:[  ]\d{3})+|\d{2,5})\s*$/)
  if (wineM) {
    const [, yr, grape, priceRaw] = wineM
    const priceStr = priceRaw.replace(/[  ]/g, '')
    const isMagnum = /Magnum/i.test(line)
    wines.push({
      name: (cuvée || '') + (isMagnum ? ' Magnum' : ''),
      producer: null,
      vintage: parseInt(yr, 10),
      type, country: country || 'Italien', // default Italien (Terreno is mostly Italian)
      region: null, grape: grape.replace(/Best Organic.*$/, '').trim() || null,
      price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
    })
    continue
  }
  // Non-data lines that don't end with a 3-5 digit number: candidate cuvée header
  // Headers are short Title Case lines without periods
  if (line.length < 80 && !/\d/.test(line) && /^[A-Z]/.test(line) && !/^(WELCOME|The|This|Our|Each|Today|Aged|Terreno also|A guarantee|The vineyards|Archaeological|In our wine|Enjoy|Beyond|Here|When)/.test(line)) {
    cuvée = line
    // Detect type from cuvée name
    for (const r of TYPE_RX) if (r.rx.test(line)) { type = r.type; break }
  }
}

const output = {
  restaurant: { name: 'The Winery Hotel', area: 'Solna', address: null,
    website: 'https://www.thewineryhotel.se/',
    wine_list_url: 'https://www.thewineryhotel.se/assets/local/pdf/Vinkallarlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/winery-hotel.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
