// Trattoria Giorgio's — per page: three column-blocks (wine names → producers → prices).
//   Page 2-3: glass section
//   Pages 4+: bottle section
// Wine name lines: "YYYY/NV Name"; producer lines: "Producer, Region (Country DOC)";
// price lines: "NNN kr". Index-pair within page.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/trattoria-giorgio-s.txt', 'utf8')
const SECTIONS = {
  BOLLICINE: 'mousserande', Mousserande: 'mousserande',
  BIANCHI: 'vitt', 'Vitt vin': 'vitt',
  ROSATO: 'rosé', 'Rosévin': 'rosé',
  ROSSI: 'rött', 'Rött vin': 'rött',
  DOLCI: 'dessert', 'Sött vin': 'dessert',
}
const COUNTRY_MAP = {
  Veneto: 'Italien', Toscana: 'Italien', Piemonte: 'Italien', Lombardia: 'Italien',
  Sardegna: 'Italien', Sicilia: 'Italien', Friuli: 'Italien', 'Alto Adige': 'Italien',
  Campania: 'Italien', Puglia: 'Italien', Marche: 'Italien', Abruzzo: 'Italien',
  Champagne: 'Frankrike',
}
const PAGE_RX = /^-- (\d+) of \d+ --$/

const pages = []
let buf = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (PAGE_RX.test(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

const wines = []
let isGlass = false
for (const pageLines of pages) {
  const ls = pageLines.filter(Boolean).filter((l) => !/^(VIN PÅ GL?\s?AS|VINI AL C ALICE|VIN PÅ FL ASKA|VINI IN BOTTIGLIA|SELEZIONE DI VINI)$/.test(l))
  if (!ls.length) continue
  // Glass detection: pages 2-3 say "VIN PÅ GL AS"
  if (pageLines.some((l) => /VIN PÅ GL/.test(l))) isGlass = true
  if (pageLines.some((l) => /VIN PÅ FL/.test(l))) isGlass = false

  let curType = null
  const names = [], producers = [], prices = []
  for (const l of ls) {
    if (SECTIONS[l] !== undefined) { curType = SECTIONS[l]; continue }
    if (/^\d{2,4}\s*kr\s*$/.test(l)) { prices.push(parseFloat(l)); continue }
    const wm = l.match(/^(NV|MV|N\.V\.|\d{4})\s+(.+)$/)
    if (wm) {
      const vintRaw = wm[1], name = wm[2].trim()
      names.push({ vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null, name, type: curType })
      continue
    }
    // Producer line: "Producer, Region [DOC/DOCG/IGT]"
    if (l.includes(',') && !/\d{4}/.test(l)) {
      producers.push(l)
      continue
    }
  }
  // Pair by index — minimum length governs (some pages 1 lost)
  const n = Math.min(names.length, prices.length, producers.length || names.length)
  for (let i = 0; i < n; i++) {
    const w = names[i]
    const p = producers[i] || ''
    const priceVal = prices[i]
    // Parse producer "Producer, Region DOC"
    const pParts = p.split(',').map((s) => s.trim()).filter(Boolean)
    let producer = null, region = null, country = null
    if (pParts.length >= 1) producer = pParts[0]
    if (pParts.length >= 2) {
      const rest = pParts[1].replace(/\s+(DOC|DOCG|IGT|DOP|IGP)\s*$/, '').trim()
      region = rest
      if (COUNTRY_MAP[rest]) country = COUNTRY_MAP[rest]
    }
    wines.push({
      name: w.name, producer, vintage: w.vintage, type: w.type || 'vitt',
      country: country || 'Italien', region, grape: null,
      price_glass: isGlass ? priceVal : null,
      price_bottle: isGlass ? null : priceVal,
      currency: 'SEK',
    })
  }
}

const output = {
  restaurant: { name: "Trattoria Giorgio's", area: 'Stockholm', address: null,
    website: 'https://www.giorgios.se/',
    wine_list_url: 'https://www.giorgios.se/_files/ugd/8d6d10_a08d0d23df824a78b5ce0f2bb8b6a4ba.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/trattoria-giorgio-s.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines`, t)
