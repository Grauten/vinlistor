// Haggans — tiny list, 11 wines. Format: "Name [year] Region (Cty.) \t glass/bottle"
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/haggans.txt', 'utf8')

const TYPES = { 'Rosé': 'rosé', 'Mousserande': 'mousserande', 'Rött': 'rött', 'Vitt': 'vitt' }
const STOP = /^(Öl|Alkoholfritt|Cognac|Whisky|Rom|Grappa|Vin|--)/i
const CTY = { Fr: 'Frankrike', It: 'Italien', Sp: 'Spanien', De: 'Tyskland', US: 'USA', Po: 'Portugal' }

let type = null
const wines = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; continue }
  if (STOP.test(line)) { type = null; continue }
  if (!type) continue
  // Match: "Name (Cty.) <tab> glass/bottle" or "(Cty.) <tab> price"
  const m = line.match(/^(.+?)\s*\(([A-Za-z]{2,3})\.?\)\s+([\d/]+(?:\/fl)?)\s*$/)
  if (!m) continue
  const [, body, ctyCode, priceStr] = m
  // Year extraction
  const yM = body.match(/\b(19|20)\d{2}\b/)
  const name = body.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim()
  // Price parse: "135/495" or "990/fl" or single
  let price_glass = null, price_bottle = null
  if (priceStr.includes('/fl')) price_bottle = parseFloat(priceStr)
  else if (priceStr.includes('/')) {
    const [g, b] = priceStr.split('/').map(parseFloat); price_glass = g; price_bottle = b
  } else price_bottle = parseFloat(priceStr)
  wines.push({
    name, producer: null,
    vintage: yM ? parseInt(yM[0], 10) : null,
    type, country: CTY[ctyCode] || null, region: null, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}
const output = {
  restaurant: { name: 'Haggans', area: 'Stockholm', address: null,
    website: 'https://www.haggans.se/',
    wine_list_url: 'https://www-static.haggans.se/wp-content/uploads/2026/04/Meny-Dryck-Haggans-1.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/haggans.json', JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines`)
