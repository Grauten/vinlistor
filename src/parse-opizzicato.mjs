// O'Pizzicato — Italian wine list, 14 pages.
//   Page 3 ("VINI AL CALICE"): split-column, "YYYY <tab> PRODUCER <tab> NAME" + price block
//   Pages 4+: section ("BIANCHI | WHITES"), region ("LOMBARDIA"), producer ("NINO NEGRI"),
//     wine "YYYY Name (grape) PRICE" — sometimes inline, sometimes split-column at page end.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/o-pizzicato.txt', 'utf8')

const TYPE_HEAD = [
  { rx: /^(SPUMANTI|CHAMPAGNE|FRANCIACORTA|BOLLICINE)\b/, t: 'mousserande' },
  { rx: /^BIANCHI\b/, t: 'vitt' },
  { rx: /^ROSATI\b/, t: 'rosé' },
  { rx: /^ROSSI\b/, t: 'rött' },
  { rx: /^(DOLCI|VINI DOLCI|PASSITI)\b/, t: 'dessert' },
]
const REGIONS = new Set(['LOMBARDIA','PIEMONTE','TRENTINO ALTO ADIGE','VENETO','FRIULI VENEZIA-GULIA','FRIULI VENEZIA-GIULIA','EMILIA ROMAGNA','TOSC ANA','TOSCANA','MARCHE','UMBRIA','LAZIO','ABRUZZO','MOLISE','CAMPANIA','PUGLIA','BASILICATA','CALABRIA','SICILIA','SARDEGNA','LIGURIA','VALLE D\'AOSTA'])
const COUNTRY_HEAD = { 'FR ANCIA': 'Frankrike', FRANCIA: 'Frankrike', ITALIA: 'Italien', 'CALIFORNIA': 'USA' }

const isPriceLine = (l) => /^\d{1,2}\s?\d{3}\s*$/.test(l) || /^\d{2,4}\s*$/.test(l)
const PAGE_RX = /^-- (\d+) of \d+ --$/

const pages = []
let buf = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (PAGE_RX.test(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = 'Italien', region = null, producer = null
// Page 3 is "VINI AL CALICE / BY THE GLASS". Its amounts are pours, but they were going into
// price_bottle, so 18 wines looked like 130-210:- bottles.
let glassMode = false
const wines = []

for (const pageLines of pages) {
  const ls = pageLines.filter((l) => l && l !== "O'PIZZICATO" && l !== 'O’PIZZICATO' && l !== 'WINE LIST' && l !== 'CARTA DEI VINI')
  if (!ls.length) continue

  const pendingForPrices = [] // FIFO of wines awaiting prices
  glassMode = false // the by-the-glass list lives on one page

  for (const l of ls) {
    if (/VINI AL CALICE|BY THE GLASS/i.test(l)) { glassMode = true; continue }
    if (/^(VINI IN BOTTIGLIA|BOTTLE|IN BOTTIGLIA)/i.test(l)) { glassMode = false }

    // Price-only line: assign to next pending wine
    if (isPriceLine(l) && pendingForPrices.length) {
      const e = pendingForPrices.shift()
      const amount = parseFloat(l.replace(/\s+/g, ''))
      if (glassMode) e.price_glass = amount
      else e.price_bottle = amount
      wines.push(e)
      continue
    }
    if (isPriceLine(l)) continue // stray price, no pending
    // Header line — may combine type, region, country via "|"
    if (l.includes('|') || TYPE_HEAD.some((h) => h.rx.test(l))) {
      const parts = l.split('|').map((s) => s.trim())
      let didType = false
      for (const p of parts) {
        for (const h of TYPE_HEAD) if (h.rx.test(p)) { type = h.t; didType = true; break }
        if (REGIONS.has(p)) region = p
        else if (COUNTRY_HEAD[p]) country = COUNTRY_HEAD[p]
      }
      if (didType || parts.length > 1) { producer = null; continue }
    }
    if (REGIONS.has(l)) { region = l; producer = null; continue }
    if (COUNTRY_HEAD[l]) { country = COUNTRY_HEAD[l]; producer = null; continue }

    // Inline wine: "YYYY/NV Name (grape) PRICE" or "YYYY Producer Name PRICE"
    const inlineWine = l.match(/^(NV|MV|\d{4})\s+(.+?)\s+(\d{1,2}[ ]?\d{3}|\d{2,4})\s*$/)
    if (inlineWine) {
      const [, vintRaw, body, priceStr] = inlineWine
      // Body may include producer (tab-separated for glass section)
      const tabParts = body.split('\t').map((s) => s.trim()).filter(Boolean)
      let prod = producer, name = body
      if (tabParts.length >= 2) { prod = tabParts[0]; name = tabParts.slice(1).join(' ') }
      const grapeM = name.match(/\(([^)]+)\)\s*$/)
      const grape = grapeM ? grapeM[1] : null
      name = name.replace(/\s*\([^)]+\)\s*$/, '').trim()
      wines.push({
        name, producer: prod, vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
        type, country, region, grape,
        price_glass: glassMode ? parseFloat(priceStr.replace(/\s+/g, '')) : null,
        price_bottle: glassMode ? null : parseFloat(priceStr.replace(/\s+/g, '')),
        currency: 'SEK',
      })
      continue
    }
    // Wine without inline price (split column)
    const wineNoPrice = l.match(/^(NV|MV|\d{4})\s+(.+)$/)
    if (wineNoPrice) {
      const [, vintRaw, body] = wineNoPrice
      const tabParts = body.split('\t').map((s) => s.trim()).filter(Boolean)
      let prod = producer, name = body
      if (tabParts.length >= 2) { prod = tabParts[0]; name = tabParts.slice(1).join(' ') }
      const grapeM = name.match(/\(([^)]+)\)\s*$/)
      const grape = grapeM ? grapeM[1] : null
      name = name.replace(/\s*\([^)]+\)\s*$/, '').trim()
      pendingForPrices.push({
        name, producer: prod, vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
        type, country, region, grape,
        price_glass: null, price_bottle: null, currency: 'SEK',
      })
      continue
    }
    // Producer line — short ALL CAPS or Title with no digits
    if (l.length < 60 && !/\d/.test(l) && /^[A-ZÅÄÖa-zåäö'`’\- &\.]+$/.test(l) && l.toUpperCase() === l) {
      producer = l
      continue
    }
  }
}

const output = {
  restaurant: { name: "O'Pizzicato", area: 'Stockholm', address: null,
    website: 'https://opizzicato.se/', wine_list_url: 'https://opizzicato.se/wp-content/uploads/2024/05/Vinlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/o-pizzicato.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
