// Trattoria Montanari — Italian focus, split-column. Section blocks: type + sub-region
// headers + wine names + prices. Each "section block" ends when a new TYPE or non-Italian
// content appears. Wine names are ALL CAPS, optionally with year.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/trattoria-montanari.txt', 'utf8')

const TYPES = { 'VINO ROSSO': 'rött', 'VINO BIANCO': 'vitt', 'SPUMANTE E PROSECCO': 'mousserande', 'CHAMPAGNE': 'mousserande' }
const STOP = /^(BIRRA E BIBITE|CI N CI N|THERESEIANER|ACQUA|L ÄSK|SAN PELLEGRINO|ALKOHOLFRI)/i

const isPrice = (l) => /^\d{1,3}\s?\d{3}\s*$/.test(l) || /^\d{2,4}\s*$/.test(l) || /^\d{2,4}\/\d{1,3}\s?\d{3}\s*$/.test(l) || /^\d{2,4}\/\d{2,4}\s*$/.test(l)
const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^-- \d+ of/.test(l))

let type = null, region = null
const wines = []
let pendingNames = [] // names waiting for prices

function flushPair() {
  // We accumulate names until a price block; once a non-name line (or end) hits, pair them.
}

for (const line of lines) {
  if (TYPES[line]) {
    // Section change — clear pending
    type = TYPES[line]
    pendingNames = []
    region = null
    continue
  }
  if (STOP.test(line)) { type = null; pendingNames = []; continue }
  if (!type) continue
  // Sub-region header ends with ":"
  if (/:\s*$/.test(line)) {
    // First flush any pending pair (in case of misalignment)
    region = line.replace(/:\s*$/, '').trim()
    continue
  }
  if (isPrice(line)) {
    // Pair with first pendingName
    if (pendingNames.length) {
      const nameRow = pendingNames.shift()
      const yM = nameRow.match(/\b(19|20)\d{2}\b/)
      const cleanName = nameRow.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim()
      // Price might be "glass/bottle"
      let price_glass = null, price_bottle = null
      const dual = line.match(/^(\d{1,3}(?:\s?\d{3})?)\s*\/\s*(\d{1,3}(?:\s?\d{3})?)\s*$/)
      if (dual) { price_glass = parseFloat(dual[1].replace(/\s+/g, '')); price_bottle = parseFloat(dual[2].replace(/\s+/g, '')) }
      else price_bottle = parseFloat(line.replace(/\s+/g, ''))
      wines.push({
        name: cleanName, producer: null,
        vintage: yM ? parseInt(yM[0], 10) : null,
        type, country: 'Italien', region, grape: null,
        price_glass, price_bottle, currency: 'SEK',
      })
    }
    continue
  }
  // Treat as a wine name (ALL CAPS-ish)
  if (/^[A-ZÅÄÖa-zåäö'\- ,0-9]+$/.test(line) && line.length < 80) {
    pendingNames.push(line)
  }
}

const output = {
  restaurant: { name: 'Trattoria Montanari', area: 'Stockholm', address: null,
    website: 'https://www.montanari.se/',
    wine_list_url: 'https://www.montanari.se/uploaded/vinlista.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/trattoria-montanari.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
