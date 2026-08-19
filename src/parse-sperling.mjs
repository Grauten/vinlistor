// Sperling & Co — 60 pages. Each page's textual content:
//   <pageNumber from prev>
//   <page header label> — e.g. "Champagne", "White Wine France, Burgundy", "Sparkling wine"
//   <letter-spaced echo, e.g. "C H A M P A G N E"> ← skip
//   Producer line: "Producer, Village" (no leading digit)
//   Wine lines: "YYYY|NV Name [MAGNUM] [Q|R trailing marker]"
//   ...
//   <trailing block of bare price lines>
//   <small page number>
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/sperling-co.txt', 'utf8')

const TYPE_FROM_LABEL = (label) => {
  const l = label.toLowerCase()
  if (/champagne|sparkling/.test(l)) return 'mousserande'
  if (/sweet|fortified|dessert|port|sherry/.test(l)) return 'dessert'
  if (/white/.test(l)) return 'vitt'
  if (/red/.test(l)) return 'rött'
  if (/rosé|rose/.test(l)) return 'rosé'
  return null
}
const COUNTRY_FROM = (label) => {
  // label may be "France, Burgundy" / "Italy & Spain" / "United States of America"
  const map = {
    France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
    Austria: 'Österrike', Portugal: 'Portugal', 'United States of America': 'USA',
    USA: 'USA', 'South Africa': 'Sydafrika', Australia: 'Australien',
    'New Zealand': 'Nya Zeeland', Argentina: 'Argentina', Chile: 'Chile',
    Champagne: 'Frankrike',
  }
  for (const [k, v] of Object.entries(map)) if (label.includes(k)) return v
  return null
}
const REGION_FROM = (label) => {
  // After country there might be ", Region"
  const m = label.match(/(?:France|Italy|Spain|Germany|Austria|Portugal|USA|Australia)\s*,\s*([A-Za-zÀ-ÿ' -]+?)(?:\s+\d+\s*$|$)/)
  return m ? m[1].trim() : null
}
const isLetterSpaced = (s) => {
  const toks = s.split(/\s+/).filter(Boolean)
  return toks.length >= 3 && toks.every((t) => t.length <= 2)
}
const isPriceLine = (l) => /^\d{1,2}\s?\d{3,4}\s*$/.test(l) || /^\d{2,5}\s*$/.test(l)
const isTinyPageNumber = (l) => /^\d{1,2}\s*$/.test(l)

const PAGE_RX = /^-- (\d+) of \d+ --$/
const pages = []
let buf = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (PAGE_RX.test(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = null, region = null
const wines = []
const SKIP_PAGES = new Set([1, 2, 3, 4]) // cover + TOC + cocktails + glass

pages.forEach((rawLines, idx) => {
  // pageNumber in PDF is idx+1 (since pages.shift would be before first marker). Adjust.
  // pages[0] = before first marker = pre-content. pages[1] = page 1 content. etc.
  const pageNum = idx
  if (SKIP_PAGES.has(pageNum)) return
  const lines = rawLines.filter(Boolean).filter((l) => !isTinyPageNumber(l) || rawLines.indexOf(l) < rawLines.length - 1)

  // Find header label: first non-letter-spaced, non-price, non-tiny line that looks like a header
  let headerIdx = 0
  while (headerIdx < lines.length) {
    const l = lines[headerIdx]
    if (l && !isLetterSpaced(l) && !isPriceLine(l)) break
    headerIdx++
  }
  if (headerIdx < lines.length) {
    const header = lines[headerIdx]
    const t = TYPE_FROM_LABEL(header)
    const c = COUNTRY_FROM(header)
    const r = REGION_FROM(header)
    if (t) type = t
    if (c) country = c
    else if (header.toLowerCase().includes('champagne')) country = 'Frankrike'
    if (r) region = r
    else if (header.toLowerCase().includes('champagne')) region = 'Champagne'
  }

  // Collect entries and prices
  let producer = null
  const pageEntries = []
  const pagePrices = []
  // Split tail price block
  let priceStart = lines.length
  while (priceStart > 0 && (isPriceLine(lines[priceStart - 1]) || isTinyPageNumber(lines[priceStart - 1]))) priceStart--
  const body = lines.slice(headerIdx + 1, priceStart)
  for (const l of body) {
    if (isLetterSpaced(l)) continue
    if (isPriceLine(l) || isTinyPageNumber(l)) continue
    // Wine row: starts with vintage or NV/MV
    const wm = l.match(/^(NV|MV|N\.V\.|\d{4})\s+(.+?)(?:\s+[A-Z])?\s*$/)
    if (wm) {
      const [, vintRaw, name] = wm
      pageEntries.push({
        name: name.replace(/\s+(MAGNUM|MGM|MGN)\s*$/i, ' Magnum').trim(),
        producer,
        vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
        type, country, region, grape: null,
        price_glass: null, price_bottle: null, currency: 'SEK',
      })
      continue
    }
    // Producer line — has a comma + Title Case + no leading digit
    if (l.includes(',') && /^[A-ZÀ-ÿ]/.test(l) && l.length < 80) { producer = l.split(',')[0].trim(); continue }
    // Otherwise treat single-token Title Case as producer
    if (/^[A-ZÀ-ÿ]/.test(l) && !/\d/.test(l) && l.length < 60) { producer = l; continue }
  }
  for (const p of lines.slice(priceStart)) {
    if (isTinyPageNumber(p)) continue
    if (isPriceLine(p)) pagePrices.push(parseFloat(p.replace(/\s+/g, '')))
  }
  const n = Math.min(pageEntries.length, pagePrices.length)
  for (let i = 0; i < n; i++) { pageEntries[i].price_bottle = pagePrices[i]; wines.push(pageEntries[i]) }
})

const output = {
  restaurant: { name: 'Sperling & Co', area: 'Norrmalm', address: null,
    website: 'https://sperling.se/', wine_list_url: 'https://sperling.se/wine-list',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/sperling-co.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
const cs = {}; for (const w of wines) cs[w.country] = (cs[w.country] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
console.log('Countries:', cs)
