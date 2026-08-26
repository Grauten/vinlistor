// Teatergrillen — bilingual (Swedish + English duplicates). Wine rows:
//   "YYYY/NV Producer, Cuvée, Region [, Country] [(volume)] PRICE [(CellarCode)]"
// Lots of countries — capture from last-comma piece or Swedish country header.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/teatergrillen.txt', 'utf8')

// Top-level Swedish type headers (English duplicates skipped via dictionary).
const TYPES = {
  'Champagne & Mousserande Viner': 'mousserande',
  'Vita viner': 'vitt', 'Vita Viner': 'vitt', 'Vita': 'vitt',
  'Röda viner': 'rött', 'Röda Viner': 'rött', 'Röda': 'rött',
  'Roséviner': 'rosé', 'Rosé Viner': 'rosé', 'Rosé': 'rosé',
  'Söta & fortifierade viner': 'dessert', 'Söta viner': 'dessert',
  'Halvflaskor': null, // half bottles — keep last type
  'Magnumbuteljer': null, 'Forts. Magnumbuteljer': null,
}
// English duplicates to skip (any line equal to these)
const ENG_SKIP = /^(Sparkling Wines?|White Wines?|Red Wines?|Rosé Wines?|Sweet & Fortified wines?|Wine by the glass|Non Vintage Champagne|Vintage|Half bottles|Big & Small Bottles|Magnum bottles|Mocktails|Beer|Sparkling|Still|Cocktails|France|Italy|Spain|Germany|Austria|USA|Sweden|Portugal|Hungary|South Africa|United Kingdom|Australia|New Zealand|Argentina|Chile|Greece)$/
// Country headers (Swedish)
const COUNTRIES = {
  Frankrike: 'Frankrike', Italien: 'Italien', Spanien: 'Spanien', Tyskland: 'Tyskland',
  Österrike: 'Österrike', Portugal: 'Portugal', Usa: 'USA', USA: 'USA',
  Sverige: 'Sverige', 'Nya Zeeland': 'Nya Zeeland', Australien: 'Australien',
  Sydafrika: 'Sydafrika', Argentina: 'Argentina', Chile: 'Chile', Ungern: 'Ungern',
  Grekland: 'Grekland', Schweiz: 'Schweiz',
  'Resten av världen': null, Världen: null, Övriga: null,
}
// Skip these non-wine sections entirely
const STOP = /^(Alkoholfria drycker|Non Alcoholic|Mocktails|Öl|Beer|Cider|Spirits|Avec|Cocktails)$/

let type = null, country = null, skip = false
let glassList = false
const wines = []
for (const raw of text.split('\n')) {
  // One row trails a stray digit after its cellar code — "… Sous la Chapelle 2100 (Z6) 20" —
  // and the row regex takes the last number it sees, pricing a Volnay 1er Cru at 20:-.
  const line = raw.trim().replace(/(\([A-Za-zÅÄÖåäö]\d{1,2}\))\s+\d{1,3}$/, '$1')
  if (!line || /^-- \d/.test(line) || /^\d+$/.test(line)) continue
  if (STOP.test(line)) { skip = true; continue }
  if (TYPES[line] !== undefined) { if (TYPES[line]) type = TYPES[line]; skip = false; country = null; continue }
  // Combined headers like "Vita viner France, Alsace, Bordeaux" or "Red wine Burgundy"
  if (/^Vita viner\b/i.test(line) || /^Vita Viner\b/i.test(line) || /^White wine\b/i.test(line)) { type = 'vitt'; skip = false; country = null; continue }
  if (/^Röda viner\b/i.test(line) || /^Röda Viner\b/i.test(line) || /^Red wine\b/i.test(line) || /^Red Wine\b/i.test(line)) { type = 'rött'; skip = false; country = null; continue }
  if (/^Roséviner\b/i.test(line) || /^Rosé Viner\b/i.test(line) || /^Rosé wine\b/i.test(line)) { type = 'rosé'; skip = false; country = null; continue }
  if (/^Söta? \w+ viner|^Söta? viner|^Sweet & Fortified/i.test(line)) { type = 'dessert'; skip = false; country = null; continue }
  if (COUNTRIES[line] !== undefined) { country = COUNTRIES[line] || null; continue }
  // Page 2 is "Viner som serveras per glas / Wines by the glass" and its amounts are glass
  // prices. They were going into price_bottle, so the same wine appeared twice — once at its
  // glass price (Le Petit Xavier Blanc 145:-) and once at its real bottle price (570:-).
  if (/^(Viner som serveras per glas|Wines? by the glass)$/i.test(line)) { glassList = true; continue }
  if (/^(House Cocktails|Cocktails|Öl|Beer)$/i.test(line)) { glassList = false }
  if (ENG_SKIP.test(line)) continue
  if (skip) continue
  if (!type) continue

  // Wine row: "YYYY/NV Name PRICE [(CellarCode)]" — also "NN cl" style and volume in parens
  const m = line.match(/^(NV|N\.V\.?|MV|\d{4}(?:\s*\d)?)\s+(.+?)\s+(\d{2,5})\s*(?:\([A-Za-zåäöÅÄÖ]\d{1,2}\))?\s*$/)
  if (!m) continue
  const [, vintRaw, body, priceStr] = m

  // Strip volume notation like "(75cl)" / "(37,5cl)" / "1cl 15" from body
  let name = body.replace(/\((?:\d+(?:,\d+)?\s*cl|3\s*-?\s*Liter|3\s*-\s*Liter|3\s*Liter|5\s*Liter|Jeroboam|Magnum)\)/gi, ' ')
    .replace(/\s*1\s*cl\s+\d+\s*/g, ' ')  // "1cl 15" (by-the-cl price hints — strip)
    .replace(/\s*Magnum\s*$/i, ' Magnum').replace(/\s+/g, ' ').trim().replace(/,\s*$/, '')

  // Pull country from inline 2-letter abbrev or country name at end
  let rowCountry = country, region = null
  const cmAbbr = name.match(/,\s*(Ty|It|Fr|Sw|Po|Sp|Ös|Au|Us|Po|Ar|Ch|Br)\s*$/i)
  if (cmAbbr) {
    const abbrMap = { Ty: 'Tyskland', It: 'Italien', Fr: 'Frankrike', Sw: 'Sverige',
      Po: 'Portugal', Sp: 'Spanien', Ös: 'Österrike', Au: 'Australien', Us: 'USA', Ar: 'Argentina', Ch: 'Chile', Br: 'Brasilien' }
    if (abbrMap[cmAbbr[1]]) rowCountry = abbrMap[cmAbbr[1]]
    name = name.replace(/,\s*[A-Za-zÅÄÖ]+\s*$/, '').trim()
  }
  // Region = penultimate comma piece
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) region = parts[parts.length - 1]

  // Coravin rows carry both: "… Fr 15cl 430 (the bottle) 1920". The row regex keeps only the
  // trailing amount, so pull the pour price out of the body before it is discarded.
  let priceGlass = null
  let priceBottle = parseFloat(priceStr)
  // "Château d´Yquem, 1er Cru Supérieur, Sauternes 1cl 160" prices a single centilitre, so
  // 160 is a pour, not a bottle.
  const perCl = body.match(/^(.*\S)\s+(\d{1,2})\s?cl$/i)
  if (perCl) {
    wines.push({
      name: perCl[1].replace(/\s+/g, ' ').trim(),
      producer: null,
      vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
      type, country: rowCountry, region, grape: null,
      price_glass: parseFloat(priceStr), price_bottle: null, currency: 'SEK',
    })
    continue
  }

  const coravin = body.match(/\b\d{1,2}\s?cl\s+(\d{2,5})\b/i)
  if (coravin) {
    priceGlass = parseFloat(coravin[1])
    name = name.replace(/\b\d{1,2}\s?cl\s+\d{2,5}\b/i, ' ')
      .replace(/\(\s*(?:the|last)\s+bottle\s*\)/gi, ' ')
      .replace(/\(\s*thebottle\s*\)/gi, ' ')
      .replace(/\s+/g, ' ').trim().replace(/,\s*$/, '')
    if (priceBottle === priceGlass) priceBottle = null
  } else if (glassList) {
    priceGlass = priceBottle
    priceBottle = null
  }

  wines.push({
    name: name.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
    type, country: rowCountry, region, grape: null,
    price_glass: priceGlass, price_bottle: priceBottle, currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Teatergrillen', area: 'Norrmalm', address: null,
    website: 'https://teatergrillen.se/',
    wine_list_url: 'https://teatergrillen.se/wp-content/uploads/2026/04/Vinlista-26-04-30-Teatergrillen.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/teatergrillen.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
