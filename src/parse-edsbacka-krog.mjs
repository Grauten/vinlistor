// Edsbacka krog — 36-page split-column PDF. Each page: text block of wine names (each
// wine ONE line starting with a vintage marker — "2024", "NV", "S.A.", "M.V.") then a
// block of bottle prices. Country/region headers persist across pages.
// Page 1 is a smaller by-the-glass section with 2-line wines (name + region) that we
// handle with a separate routine.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const raw = await readFile('data/raw/edsbacka-krog.txt', 'utf8')

const TYPE_HEADERS = { 'Mousserande': 'mousserande', 'Champagne': 'mousserande', 'Vita viner': 'vitt', 'Röda viner': 'rött', 'Vita Viner': 'vitt', 'Röda Viner': 'rött', 'Roséviner': 'rosé', 'Rosé viner': 'rosé', 'Dessertviner': 'dessert', 'Magnum': null }
const COUNTRY_HEADERS = { 'Frankrike': 'Frankrike', 'Italien': 'Italien', 'Spanien': 'Spanien', 'Tyskland': 'Tyskland', 'Österrike': 'Österrike', 'Portugal': 'Portugal', 'USA': 'USA', 'Sverige': 'Sverige', 'Sydafrika': 'Sydafrika', 'Australien': 'Australien', 'Argentina': 'Argentina', 'Chile': 'Chile' }
const VINTAGE_START = /^(S\.A\.?|M\.V\.?|NV|N\.V\.|MV|\d{4})\s+/
const isPriceLine = (l) => /^\d{2,5}(?:\s*\/\s*\d{2,5})?\s*$/.test(l)
const isPageMarker = (l) => /^-- \d+ of \d+ --$/.test(l)

// Split into pages
const pages = []
let buf = []
for (const l of raw.split('\n')) {
  const line = l.trim()
  if (isPageMarker(line)) { pages.push(buf); buf = []; continue }
  buf.push(line)
}
if (buf.length) pages.push(buf)

let type = null, country = null, region = null
const wines = []

// Page 1 (glass) — 2-line wines (name + "Region, Country") + price block with "X / Y" pairs
if (pages.length > 0) {
  const page1 = pages[0].filter(Boolean)
  // Find runs: white (Vita viner), red (Röda viner), sparkling (Mousserande)
  // Process each block: collect 2-line wine entries, then prices.
  let glassType = null
  // After the glass page, persist last seen type to pages 2+ (champagne section follows)
  const setOuterType = () => { if (glassType) type = glassType }
  const entries = []
  for (const l of page1) {
    if (TYPE_HEADERS[l] !== undefined) {
      glassType = TYPE_HEADERS[l]
      continue
    }
    if (l === 'Vin på glas' || l === 'Glas / Flaska') continue
    if (isPriceLine(l)) {
      // Take next-in-queue wine entry and assign price
      const w = entries.shift()
      if (!w) continue
      const dual = l.match(/^(\d{2,5})\s*\/\s*(\d{2,5})$/)
      const glass = dual ? parseFloat(dual[1]) : null
      const bottle = dual ? parseFloat(dual[2]) : parseFloat(l)
      wines.push({ ...w, price_glass: glass, price_bottle: bottle, type: w.type ?? glassType })
      continue
    }
    // Wine name (starts with vintage) → start a new entry, expect region on next line
    if (VINTAGE_START.test(l)) {
      const vM = l.match(/^(\d{4}|NV|S\.A\.?|M\.V\.?|MV)\s+/)
      const vintRaw = vM ? vM[1] : null
      const name = l.replace(VINTAGE_START, '').trim()
      entries.push({ name, producer: null, vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null, type: glassType, country: null, region: null, grape: null, currency: 'SEK' })
    } else if (entries.length && !entries[entries.length - 1].region) {
      // Region line for last entry
      const last = entries[entries.length - 1]
      const parts = l.split(',').map((s) => s.trim()).filter(Boolean)
      if (parts.length >= 2) { last.region = parts[0]; last.country = parts[1] }
      else last.region = l
    }
  }
  setOuterType()
}

// Pages 2+ — clean 1-line-per-wine layout
for (let pi = 1; pi < pages.length; pi++) {
  const pageLines = pages[pi].filter(Boolean)
  if (!pageLines.length) continue
  const priceStart = pageLines.findIndex(isPriceLine)
  // Some pages contain ONLY a section header (e.g. "Vita viner" alone). Still walk
  // them to update the type/country/region state for following pages.
  const textLines = priceStart < 0 ? pageLines : pageLines.slice(0, priceStart)
  const priceLines = priceStart < 0 ? [] : pageLines.slice(priceStart).filter(isPriceLine)

  const entries = []
  for (const l of textLines) {
    if (TYPE_HEADERS[l] !== undefined) { if (TYPE_HEADERS[l]) type = TYPE_HEADERS[l]; continue }
    if (COUNTRY_HEADERS[l]) { country = COUNTRY_HEADERS[l]; region = null; continue }
    // Sub-region header like "Bourgogne - Chablis" / "Champagne" — no vintage prefix
    if (!VINTAGE_START.test(l)) {
      // Heuristic: if short title-case-ish line, it's a region header
      if (l.length < 60 && !/\d{3,5}/.test(l) && /^[A-ZÅÄÖÉ]/.test(l)) region = l
      continue
    }
    // Wine row
    const vM = l.match(/^(NV|N\.V\.?|MV|M\.V\.?|S\.A\.?|\d{4})\s+(.+?)\s*$/)
    if (!vM) continue
    const vintRaw = vM[1]
    const name = vM[2].trim()
    entries.push({
      name, producer: null,
      vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
      type, country, region, grape: null,
      price_glass: null, price_bottle: null, currency: 'SEK',
    })
  }
  // Pair with prices
  for (let i = 0; i < entries.length; i++) {
    const p = priceLines[i]
    if (!p) break
    const dual = p.match(/^(\d{2,5})\s*\/\s*(\d{2,5})$/)
    if (dual) { entries[i].price_glass = parseFloat(dual[1]); entries[i].price_bottle = parseFloat(dual[2]) }
    else entries[i].price_bottle = parseFloat(p)
    wines.push(entries[i])
  }
}

const output = {
  restaurant: {
    name: 'Edsbacka krog', area: 'Sollentuna',
    address: null,
    website: 'https://edsbacka.nu/',
    wine_list_url: 'https://edsbacka.nu/wp-content/uploads/2025/10/Vinlista-1.1-251205.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/edsbacka-krog.json', JSON.stringify(output, null, 2))
const t = {}, c = {}
for (const w of wines) { t[w.type] = (t[w.type] || 0) + 1; c[w.country ?? 'null'] = (c[w.country ?? 'null'] || 0) + 1 }
console.log(`Parsed ${wines.length} wines → data/extracted/edsbacka-krog.json`)
console.log('by type:', t, '\nby country:', c)
