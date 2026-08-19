// Slipen — 1 page, compact. "TYPE" header then "YYYY Name, Grape G/B" or "NAME, Grape G/B".
// Some prices follow on separate lines (split column at bottom of page).
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/slipen.txt', 'utf8')
const TYPES = { CHAMPAGNE: 'mousserande', MOUSSERANDE: 'mousserande', VITT: 'vitt', RÖTT: 'rött', 'ROSÉ': 'rosé' }

let type = null
const wines = []
const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

// We need to handle inline prices and split-column prices. Walk linearly building pending entries.
const pending = [] // wines awaiting prices
for (const line of lines) {
  if (line === 'ÖVRIG DRYCK' || /^-- \d/.test(line)) break
  if (TYPES[line]) { type = TYPES[line]; continue }
  // Inline wine with price: "...G/B"
  const inline = line.match(/^(?:(\d{4})\s+)?(.+?)\s+(\d{2,4})\/(\d{2,4})\s*$/)
  if (inline) {
    const [, y, body, g, b] = inline
    // body format: "ProducerThing, Grape" → split by comma; last is grape
    const parts = body.split(',').map((s) => s.trim())
    const grape = parts.length > 1 ? parts.pop() : null
    const name = parts.join(', ')
    wines.push({
      name, producer: null, vintage: y ? parseInt(y, 10) : null, type,
      country: null, region: null, grape,
      price_glass: parseFloat(g), price_bottle: parseFloat(b), currency: 'SEK',
    })
    continue
  }
  // Standalone price line: "169/820" → assign to next pending entry
  const priceOnly = line.match(/^(\d{2,4})\/(\d{2,4})$/)
  if (priceOnly && pending.length) {
    const entry = pending.shift()
    entry.price_glass = parseFloat(priceOnly[1])
    entry.price_bottle = parseFloat(priceOnly[2])
    wines.push(entry)
    continue
  }
  // Wine without inline price (split column)
  const noPrice = line.match(/^(\d{4})\s+(.+)$/)
  if (noPrice) {
    const [, y, body] = noPrice
    const parts = body.split(',').map((s) => s.trim())
    const grape = parts.length > 1 ? parts.pop() : null
    const name = parts.join(', ')
    pending.push({
      name, producer: null, vintage: parseInt(y, 10), type,
      country: null, region: null, grape,
      price_glass: null, price_bottle: null, currency: 'SEK',
    })
  }
}

const output = {
  restaurant: { name: 'Slipen', area: 'Stockholm', address: null,
    website: 'https://slipen.se/', wine_list_url: 'https://slipen.se/slipen_meny_dryck.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/slipen.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
