// Pontus Frithiof at Bro Hof — small tab-separated list. The header reads
//   "C H A M P A G N E <tab> Glass / Bottle" / "Prices" / "Platinum Member" / "Price" /
//   "Recommended" / "Price"
// so a priced row is:
//   Name COUNTRY VINTAGE <tab> <member glass> / <member bottle> :- <tab> <regular bottle> :-
//
// There was no parser for this restaurant; the JSON was written by hand and took the
// Platinum Member column as the price. That is a members-only rate, so on a public
// price-comparison site it understates what a guest actually pays — Billecart-Salmon reads
// 875:- when the regular bottle is 1 200:-. price_bottle is the regular column now, with the
// member rates kept alongside it.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/pontus-frithiof-at-bro-hof.txt', 'utf8')

// Headers are letter-spaced: "W H I T E", "C H A M P A G N E".
const squash = (l) => l.replace(/\s+/g, '').toUpperCase()
const TYPES = { WHITE: 'vitt', RED: 'rött', ROSÉ: 'rosé', ROSE: 'rosé', CHAMPAGNE: 'mousserande', SPARKLING: 'mousserande' }
const COUNTRIES = {
  FRA: 'Frankrike', ITA: 'Italien', GER: 'Tyskland', POR: 'Portugal', RSA: 'Sydafrika',
  USA: 'USA', SPA: 'Spanien', AUT: 'Österrike', AUS: 'Australien', ARG: 'Argentina', CHI: 'Chile',
}

const AMOUNT = String.raw`\d{1,3}(?:[  ]\d{3})+|\d{2,5}`
const amount = (s) => (s == null ? null : parseFloat(s.replace(/[  ]/g, '')))
// "135 / 875 :-", "295/ 1 320:-", "3 190 :-"
const CELL = new RegExp(String.raw`^\s*(${AMOUNT})\s*(?:\/\s*(${AMOUNT}))?\s*:?-?\s*$`)

let type = null, skip = false
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.replace(/\s+$/, '')
  if (!line.trim()) continue

  // Every line starts with a tab, and the CHAMPAGNE header carries the column caption in a
  // second cell, so headers have to be read from the first cell rather than the whole line.
  const cols = line.split('\t').map((c) => c.trim()).filter(Boolean)
  if (!cols.length) continue

  const sq = squash(cols[0])
  if (TYPES[sq]) { type = TYPES[sq]; skip = false; continue }
  // "O T H E R" is the cocktail list — Aperol Spritz and Gin & Tonic are not wines.
  if (sq === 'OTHER') { skip = true; continue }
  // Section labels and the stacked column captions ("Prices", "Platinum Member", …).
  if (sq === 'WINEINCLUDED' || sq === 'EXTRASBEVERAGES') continue
  if (/^(PRICES|PLATINUMMEMBER|PRICE|RECOMMENDED)$/.test(sq)) continue
  if (skip || !type) continue

  const member = cols[1]?.match(CELL)
  const regular = cols[2]?.match(CELL)

  let body = cols[0].trim()
  let vintage = null, country = null
  const vm = body.match(/\b(\d{4})\b\s*$/)
  if (vm) { vintage = parseInt(vm[1], 10); body = body.slice(0, vm.index).trim() }
  const cm = body.match(/\b([A-Z]{3})\b\s*$/)
  if (cm && COUNTRIES[cm[1]]) { country = COUNTRIES[cm[1]]; body = body.slice(0, cm.index).trim() }
  // Some rows put the country before the vintage: "… FRA 2022".
  if (!vintage) {
    const vm2 = body.match(/\b(\d{4})\b\s*$/)
    if (vm2) { vintage = parseInt(vm2[1], 10); body = body.slice(0, vm2.index).trim() }
  }

  const memberGlass = member && member[2] ? amount(member[1]) : null
  const memberBottle = member ? (member[2] ? amount(member[2]) : amount(member[1])) : null
  const regularBottle = regular ? amount(regular[2] ?? regular[1]) : null

  wines.push({
    name: body, producer: null, vintage, type, country, region: null, grape: null,
    price_glass: memberGlass,
    price_bottle: regularBottle ?? memberBottle,
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Pontus Frithiof at Bro Hof', area: 'Bro', address: null,
    website: 'https://www.brohof.com/',
    wine_list_url: null,
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/pontus-frithiof-at-bro-hof.json', JSON.stringify(output, null, 2))
const t = {}
for (const w of wines) t[w.type ?? 'null'] = (t[w.type ?? 'null'] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
