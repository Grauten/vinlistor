// Grand Hôtel Stockholm — 145 pages, 2700 labels. Section structure:
//   TYPE HEADER lowercase ("champagne", "white wines", "red wines", "sweet wines",
//     "fortified wines", "half bottles", "wines by request")
//   sub-section ("champagne France" / "bordeaux France" / "toscana Italy")
//   producer line (lowercase, sometimes with region "agrapart & fils Avize")
//   wine rows "YYYY/N.V. Name PRICE,-"
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/grand-hotel.txt', 'utf8')

const MAJOR_TYPES = {
  'champagne': 'mousserande',
  'sparkling wines': 'mousserande',
  'white wines': 'vitt',
  'red wines': 'rött',
  'rosé wines': 'rosé',
  'sweet wines': 'dessert',
  'fortified wines': 'dessert',
  'half bottles': null, // contextual — could be any type
  'wines by request': null, // contextual — antiques across many types
  'magnums': null,
}
const COUNTRIES = {
  france: 'Frankrike', italy: 'Italien', spain: 'Spanien', germany: 'Tyskland',
  austria: 'Österrike', portugal: 'Portugal', usa: 'USA', australia: 'Australien',
  sweden: 'Sverige', switzerland: 'Schweiz', hungary: 'Ungern', greece: 'Grekland',
  argentina: 'Argentina', chile: 'Chile', 'south africa': 'Sydafrika',
  'new zealand': 'Nya Zeeland', lebanon: 'Libanon',
}
// Common region keywords seen as sub-section first word
const REGIONS = new Set(['alsace','bordeaux','chablis','bourgogne','jura','savoie','loire','rhône','rhone','provence','languedoc','roussillon','sud-ouest','corsica','beaujolais','champagne','piemonte','toscana','tuscany','sicilia','sicily','veneto','friuli','lombardia','marche','abruzzo','sardinien','sardegna','umbria','umbrien','lazio','campania','puglia','calabria','basilicata','alto adige','trentino','rioja','priorat','penedès','ribera del duero','mosel','rheingau','pfalz','nahe','rheinhessen','wachau','kamptal','burgenland','steiermark','napa valley','sonoma','oregon','washington','california','santa barbara','willamette valley','barossa valley','mclaren vale','margaret river','marlborough','stellenbosch','swartland','hemel-en-aarde','mendoza','colchagua','douro','dao','alentejo','bairrada','vinho verde','madeira','tokaj','santorini','peloponnese'])

let type = null, country = null, region = null, producer = null
let inWines = false // skip TOC pages 1-3
let producerCandidates = []
const wines = []

const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
let pageNum = 0
for (const line of lines) {
  const pm = line.match(/^-- (\d+) of \d+ --$/)
  if (pm) { pageNum = parseInt(pm[1], 10); inWines = pageNum >= 4; continue }
  if (!inWines) continue
  if (line === 'the wine list' || line === 'grand hôtel' || line === 'stockholm' || line === 'the wine cellar') continue
  if (/^\d{1,3}\s*$/.test(line)) continue // page number alone

  // Major type header (lowercase) — alone OR combined "white wines Austria" / "red wines France - Burgundy"
  const lcLine = line.toLowerCase()
  if (MAJOR_TYPES[lcLine] !== undefined) {
    if (MAJOR_TYPES[lcLine]) type = MAJOR_TYPES[lcLine]
    producer = null; country = null; region = null; continue
  }
  // Combined: "<type words> <country>" or "<type words> <country> - <region>"
  const combo = lcLine.match(/^(champagne|sparkling wines?|white wines?|red wines?|rosé wines?|sweet wines?|fortified wines?|half bottles)\s+(.+?)(?:\s*-\s*(.+))?$/)
  if (combo) {
    const t = MAJOR_TYPES[combo[1]] || MAJOR_TYPES[combo[1].replace('s', '')] || null
    if (t) type = t
    const cty = combo[2].trim()
    if (COUNTRIES[cty]) { country = COUNTRIES[cty]; region = combo[3] ? combo[3].trim() : null }
    else { region = cty }
    producer = null; continue
  }
  // Sub-section: "<region/region+> <country>" or just "<country>"
  const parts = line.toLowerCase().split(/\s+/)
  const lastWord = parts[parts.length - 1]
  if (COUNTRIES[lastWord]) {
    country = COUNTRIES[lastWord]
    region = parts.slice(0, -1).join(' ') || null
    if (region && !REGIONS.has(region)) region = null
    producer = null
    continue
  }
  // "white" / "red" inline after region
  if (/^(white|red|sweet|sparkling)$/.test(lastWord)) {
    if (lastWord === 'white') type = 'vitt'
    else if (lastWord === 'red') type = 'rött'
    else if (lastWord === 'sweet') type = 'dessert'
    else if (lastWord === 'sparkling') type = 'mousserande'
    region = parts.slice(0, -1).join(' ') || region
    producer = null
    continue
  }

  // Wine row: "YYYY/N.V./M.V. Name PRICE,-" (price may include thousands separator/space)
  const wM = line.match(/^(N\.V\.?|M\.V\.?|NV|MV|\d{4})\s+(.+?)\s+(\d{1,3}(?:[ \xa0]\d{3})*)\s*,-\s*$/)
  if (wM) {
    const [, vintRaw, body, priceStr] = wM
    const price = parseFloat(priceStr.replace(/[ \xa0]/g, ''))
    // Strip trailing volume marker like "½", "50 cl", "Magnum"
    let name = body.replace(/\s+(½|50\s*cl|Magnum|MGM|MGN|1500\s*ml|375\s*ml)\s*$/gi, '').trim()
    wines.push({
      name: name.replace(/,\s*$/, '').replace(/\s+/g, ' '),
      producer,
      vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
      type, country, region, grape: null,
      price_glass: null, price_bottle: price, currency: 'SEK',
    })
    continue
  }

  // Otherwise treat as producer line (lowercase, short, no digits)
  if (line.length < 60 && !/\d/.test(line) && /^[a-zåäö&'\-\. ]+$/i.test(line)) {
    producer = line
  }
}

const output = {
  restaurant: { name: 'Grand Hôtel', area: 'Norrmalm', address: null,
    website: 'https://grandhotel.se/',
    wine_list_url: 'https://grandhotel.se/en/media/1500/download?inline=',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/grand-hotel.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
