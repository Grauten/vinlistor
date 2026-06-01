// Maxim Framfickan — single page. Format: "NAME – glass/bottle kr" or "NAME – price kr",
// with section headers BUBBEL / VITT VIN / RÖTT / ROSÉ. Wine names may wrap across lines.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/maxim-framfickan.txt', 'utf8')

const TYPES = { BUBBEL: 'mousserande', 'VITT VIN': 'vitt', 'RÖTT': 'rött', 'ROSÉ': 'rosé' }
const STOP = /^(FATÖL|FLASKA|CIDER|ALKOHOLFRITT|DRINKAR|YUZU|UMESHU|BIG TROUBLE|OLD ASIAN)/i

let type = null
const wines = []
let buf = ''
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; buf = ''; continue }
  if (STOP.test(line)) { type = null; buf = ''; continue }
  if (!type) continue
  buf = (buf + ' ' + line).trim()
  // Wine ends with "price kr" or "glass/bottle kr"
  const m = buf.match(/^(.+?)\s*[–-]\s*(\d{2,4}(?:\/\d{2,4})?)kr\s*$/)
  if (m) {
    const [, body, priceStr] = m
    let price_glass = null, price_bottle = null
    if (priceStr.includes('/')) { const [g, b] = priceStr.split('/').map(parseFloat); price_glass = g; price_bottle = b }
    else price_bottle = parseFloat(priceStr)
    wines.push({
      name: body.replace(/\s+/g, ' ').trim(),
      producer: null, vintage: null,
      type, country: null, region: null, grape: null,
      price_glass, price_bottle, currency: 'SEK',
    })
    buf = ''
  }
}
const output = {
  restaurant: { name: 'Maxim Framfickan', area: 'Stockholm', address: null,
    website: 'https://www.maximstockholm.se/',
    wine_list_url: 'https://www.maximstockholm.se/wp-content/uploads/2025/10/framfickan-dryck-a4-2025-25-09.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/maxim-framfickan.json', JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines`)
