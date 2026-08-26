// Ulfsunda Slott — split-column PDF. Each page is a block of wine names followed by a block
// of prices, paired by position. Three things made the old version emit only 25 of ~193
// wines, all from the short by-the-glass list at the front:
//
//  1. isPrice only matched bare digits, but the whole VINKÄLLAREN cellar list prices in
//     "1 100 kr" — space-separated and suffixed. None of those lines were recognised.
//  2. The cellar's section headers are letter-spaced ("V I T T  V I N") and the spacing is
//     not consistent enough to split on, so they never matched the type map. Since the beer
//     and cider sections set a skip flag that only a recognised type header clears, every
//     wine after HANTVERKSÖL was dropped.
//  3. "VINKÄLLAREN" sits *after* a page's price block, so scanning backwards for a
//     contiguous run of prices stopped immediately.
//
// Headers are now matched with all whitespace removed, prices and names are separated by
// line shape rather than position, and a page is only emitted when its name count matches
// its price count — a mis-paired price is worse than a missing one.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/ulfsunda-slott.txt', 'utf8')

const squash = (l) => l.replace(/\s+/g, '')

const TYPES = {
  CHAMPAGNE: 'mousserande', MOUSSERANDE: 'mousserande',
  VITAVINER: 'vitt', RÖDAVINER: 'rött', VITTVIN: 'vitt', RÖTTVIN: 'rött',
  'ROSE/ORANGEVIN': 'rosé', ROSE: 'rosé', ROSÉ: 'rosé', ORANGEVIN: 'orange',
  SÖTTVIN: 'dessert', DESSERT: 'dessert',
}
const STOP = /^(HANTVERKSÖL|ÖVRIGÖL|CIDER|ALKOHOLFRITT|LÄSK|SPRIT|AVEC|COCKTAILS|VARMDRYCK|KAFFE|TE|MARC)/i
const COUNTRIES = {
  FRANKRIKE: 'Frankrike', ITALIEN: 'Italien', SPANIEN: 'Spanien', TYSKLAND: 'Tyskland',
  PORTUGAL: 'Portugal', SYDAFRIKA: 'Sydafrika', USA: 'USA', AUSTRALIEN: 'Australien',
  CHILE: 'Chile', ARGENTINA: 'Argentina', NYAZEELAND: 'Nya Zeeland', LIBANON: 'Libanon',
  ÖSTERRIKE: 'Österrike', UNGERN: 'Ungern', GREKLAND: 'Grekland',
}

// "1 100 kr", "925", "12 00 kr" (the PDF drops the space in odd places), "125 / 925 kr".
const priceOf = (l) => {
  const m = l.match(/^([\d  ]+?)(?:\s*\/\s*([\d  ]+?))?\s*(?:kr)?\s*$/i)
  if (!m) return null
  const digits = (s) => (s == null ? null : s.replace(/[\s ]/g, ''))
  const a = digits(m[1]), b = digits(m[2])
  if (!a || a.length < 2 || a.length > 6) return null
  if (b) return { price_glass: +a, price_bottle: +b }
  return { price_glass: null, price_bottle: +a }
}

// A header has no lowercase and no digits once squashed: "FRANKRIKE - VÄSTRA BORDEAUX".
const isHeader = (sq) => sq.length > 1 && !/[a-zåäöéèüáà0-9]/.test(sq)

const pages = []
let buf = []
for (const l of text.split('\n')) {
  const line = l.trim()
  if (/^-- \d+ of \d+ --$/.test(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = null, skip = false
const wines = []
const dropped = []

pages.forEach((pageLines, pageNo) => {
  const ls = pageLines.filter(Boolean)
  const entries = [], block = []

  for (const raw of ls) {
    const price = priceOf(raw)
    if (price) { block.push(price); continue }

    const sq = squash(raw)
    if (TYPES[sq] !== undefined) { type = TYPES[sq]; skip = false; continue }
    if (STOP.test(sq)) { skip = true; continue }
    if (isHeader(sq)) {
      const head = sq.split(/[-–]/)[0]
      if (COUNTRIES[head]) country = COUNTRIES[head]
      continue
    }
    if (skip || !type || raw.length < 4) continue

    const m = raw.match(/^(?:(\d{4}|NV|MV)\s+)?(.+?)\s*$/)
    const vintage = m && /^\d{4}$/.test(m[1] ?? '') ? parseInt(m[1], 10) : null
    const body = (m ? m[2] : raw).trim()
    const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
    entries.push({
      name: body, producer: null, vintage, type, country,
      region: parts.length >= 2 ? parts[parts.length - 1] : null,
      grape: null, currency: 'SEK',
    })
  }

  if (!entries.length) return
  if (entries.length !== block.length) {
    dropped.push(`page ${pageNo + 1} (${entries.length} names vs ${block.length} prices)`)
    return
  }
  entries.forEach((e, i) => wines.push({ ...e, ...block[i] }))
})

const output = {
  restaurant: {
    name: 'Ulfsunda Slott', area: 'Bromma', address: null,
    website: 'https://www.ulfsundaslott.se/',
    wine_list_url: 'https://www.ulfsundaslott.se/wp-content/uploads/sites/2/2026/04/Dryckesmeny-2026-20-1.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/ulfsunda-slott.json', JSON.stringify(output, null, 2))
const t = {}
for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
if (dropped.length) console.log('SKIPPED unaligned pages:', dropped.join('; '))
