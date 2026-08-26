// Wärdshuset Ulla Winbladh — Djurgården classic. Page 1 = TOC, page 2 = champagne,
// pages 3-4 = cocktails/aperitifs (skip), pages 5-6 = wines-by-the-glass (price format
// "glas/flaska kr"), pages 7+ = bottle list per country/region with rows like
// "YYYY Name, Producer 1295 kr".
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/w-rdshuset-ulla-winbladh.txt', 'utf8')

const TYPE_RX = [
  // Country-specific headers (Vita viner Frankrike / Röda viner Italien etc)
  { rx: /^Vita viner\s+(Frankrike|Italien|Spanien|Tyskland|Portugal|Österrike|USA|Sverige|Australien|Sydafrika|Chile|Argentina|Ungern|Nya Zeeland|Grekland|England)\s*$/i, type: 'vitt' },
  { rx: /^Röda viner\s+(Frankrike|Italien|Spanien|Tyskland|Portugal|Österrike|USA|Sverige|Australien|Sydafrika|Chile|Argentina|Ungern|Nya Zeeland|Grekland|England)\s*$/i, type: 'rött' },
  // Generic type headers without country
  { rx: /^Champagne Rosé$/i,        type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Champagne(?:\s+&\s+Mousserande)?$/i, type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Mousserande$/i,            type: 'mousserande', country: null, region: null },
  { rx: /^Vita viner$/i,              type: 'vitt', country: null, region: null },
  { rx: /^Röda viner$/i,              type: 'rött', country: null, region: null },
  { rx: /^(Rosé|Rosévin|Rosé viner)$/i, type: 'rosé', country: null, region: null },
  { rx: /^Övriga viner$/i,            type: 'other', country: null, region: null },
]

const SKIP_SECTIONS = /^(Aperitifer|Bitter|Sprit|Digestiver|Likör|Öl|Cider|Alkoholfritt|Classic Cocktails|Gin|Non-Alcoholic|Vinkällarlista|Aperitifer & Drinkar)/i

let type = null, country = null, region = null
let inGlassSection = false
let skip = false
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line) continue
  if (/^-- \d+ of \d+ --$/.test(line)) continue
  if (/^\d+$/.test(line) && line.length <= 3) continue // page number

  // "Viner på glas" — next several lines are sub-headers
  if (/^Viner på glas$/i.test(line)) { inGlassSection = true; skip = false; continue }

  // Section markers that turn off wine parsing entirely
  // The spirits half of the menu heads each section with its pour size — "Vodka 1 cl",
  // "Rom 1 cl", "Fatöl 40 cl". Only a few were named in SKIP_SECTIONS, so the rest inherited
  // the previous wine type and 16 bottles of vodka and whisky were stored as red wine.
  // Wine rows always carry a "kr" amount, section headers never do.
  if (SKIP_SECTIONS.test(line) || (/\s\d+\s?cl$/i.test(line) && !/\bkr\b/i.test(line))) { skip = true; continue }

  // Check type headers
  let matched = false
  for (const r of TYPE_RX) {
    const m = line.match(r.rx)
    if (m) {
      type = r.type
      // Country comes either from the capture group or from the rule definition
      country = r.country !== undefined ? r.country : (m[1] || null)
      region = r.region !== undefined ? r.region : null
      skip = false
      matched = true
      break
    }
  }
  if (matched) continue
  if (skip) continue

  // Region subheader inside a country section
  if (country && /^[A-ZÄÖÅ][A-Za-zäöåÄÖÅ\- ]{2,30}$/.test(line) && !/\d/.test(line) && !/\bkr\b/.test(line)) {
    region = line
    continue
  }

  // Wine row: optional vintage, body, price(s) ending with "kr"
  // Formats: "YYYY Body 1295 kr"  |  "Body 195/1025 kr" (glass / bottle)  |  "NV Body 1295 kr"
  const m = line.match(/^(NV|N\.V\.?|MV|\d{4})?\s*(.+?)\s+(\d{2,5})(?:\s*\/\s*(\d{2,5}))?\s*kr\s*$/i)
  if (!m) continue
  const [, vintageRaw, bodyRaw, p1, p2] = m
  let body = bodyRaw.replace(/\s+/g, ' ').trim()
  // Strip "½ fl" / "MGN" / "MAGNUM" suffix into the name
  body = body.replace(/\s+(?:½\s*fl|MGN|MAGNUM|½flaska)\b/gi, ' Magnum').trim()

  const vintage = vintageRaw && /^\d{4}$/.test(vintageRaw) ? parseInt(vintageRaw, 10) : null
  const glass  = p2 ? parseFloat(p1) : null
  const bottle = p2 ? parseFloat(p2) : parseFloat(p1)

  // For glass section, infer country/region from inline if present
  let rowCountry = country, rowRegion = region
  if (inGlassSection && !rowCountry) {
    // Try inline country word at end (before price), e.g. ", Frankrike"
    const cm = body.match(/^(.*?),\s*(Frankrike|Italien|Spanien|Tyskland|Portugal|Österrike|USA|Kalifornien|Sverige|Australien|Sydafrika|Chile|Argentina)\s*$/i)
    if (cm) { rowCountry = cm[2] === 'Kalifornien' ? 'USA' : cm[2]; body = cm[1].trim() }
  }

  // The dessert list marks its by-the-glass rows with a trailing "glas" before the amount:
  // "2019 Kracher, Beerenauslese Zweigelt glas 120 kr". That amount was going into
  // price_bottle, leaving eleven 85-195:- "bottles", and "glas" stayed in the wine's name.
  let rowGlass = glass, rowBottle = bottle
  const glasM = body.match(/^(.*\S)\s+glas$/i)
  if (glasM && rowBottle != null && rowGlass == null) {
    body = glasM[1].trim()
    rowGlass = rowBottle
    rowBottle = null
  }

  wines.push({
    name: body,
    producer: null,
    vintage,
    type,
    country: rowCountry,
    region: rowRegion,
    grape: null,
    price_glass: rowGlass,
    price_bottle: rowBottle,
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Wärdshuset Ulla Winbladh', area: 'Djurgården',
    address: 'Rosendalsvägen 8, Djurgården, Stockholm',
    website: 'http://ullawinbladh.se/',
    wine_list_url: 'https://ullawinbladh.se/wp-content/uploads/2026/05/Vinlista_enda_gallande.pdf',
  },
  wines,
}
const out = 'data/extracted/w-rdshuset-ulla-winbladh.json'
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
