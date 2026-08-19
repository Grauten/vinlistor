// Capannone / Capannone Bottega — letter-spaced 4-sub-column PDF.
// Page 1: BIANCO×2 + ROSSO×2 (col 0-3). Section "WHITE BY THE GLASS" / "BOTTLES" etc.
// Page 2: GROSSO (col 0 names, col 1 prices) + SPUMANTE (col 2) + CHAMPAGNE (col 3).
// Wine in each col: "[YYYY] Name [PRICE]" then "Producer, Region[, Country]" then maybe more producer lines.
import { rebuildPdfText } from './lib/pdfjs-rebuild.mjs'
import { writeFile, mkdir } from 'node:fs/promises'

const pages = await rebuildPdfText('data/raw/capannone.pdf', { columns: 4, columnSplit: [320, 620, 870] })

const COUNTRY_NAMES = {
  Italy: 'Italien', France: 'Frankrike', Spain: 'Spanien', USA: 'USA',
  Germany: 'Tyskland', Austria: 'Österrike', Portugal: 'Portugal', Sicily: 'Italien',
  Tuscany: 'Italien',
}
const PRICE_PAIR_INLINE = /\b(\d{2,4})\s*\/\s*(\d{2,4})\s*$/
const PRICE_SINGLE_INLINE = /\s(\d{3,4})\s*$/
const PRICE_LINE = /^(\d{2,4})$/

function classifySection(label, col) {
  const l = label.toUpperCase()
  if (/CHAMPAGNE/.test(l)) return { type: 'mousserande', country: 'Frankrike' }
  if (/SPUMANTE|PROSECCO|FRANCIACORTA/.test(l)) return { type: 'mousserande', country: 'Italien' }
  if (/RED|ROSSO/.test(l)) return { type: 'rött', country: 'Italien' }
  if (/WHITE|BIANCO/.test(l)) return { type: 'vitt', country: 'Italien' }
  if (/ROSÉ|ROSE|ROSATO/.test(l)) return { type: 'rosé', country: 'Italien' }
  if (/GROSSO/.test(l)) return { type: 'rött', country: 'Italien' } // GROSSO is all red large formats
  return null
}

const wines = []

function parseColumnEntries(colLines, defaultType, defaultCountry) {
  // Return array of partial wines (need pricing if not inline)
  const entries = []
  let type = defaultType, country = defaultCountry, region = null, pending = null
  for (const raw of colLines) {
    const l = raw.trim()
    if (!l) continue
    if (/^(BIANCO|ROSSO|GROSSO|SPUMANTE|PROSECCO|CHAMPAGNE)$/i.test(l)) continue
    if (/^(WHITE BY THE GLASS|RED BY THE GLASS|ROSÉ BY THE GLASS|BOTTLES|3 LITER|1,5 LITER|SPUMANTE\s*[-–]\s*BOTTLES|CHAMPAGNE\s*[-–]\s*BOTTLES)$/i.test(l)) {
      const sect = classifySection(l, 0)
      if (sect) { type = sect.type; country = sect.country }
      continue
    }
    if (/^Need more wine|for our wine book/i.test(l)) continue

    // Wine line with inline G/B price
    let mm = l.match(/^(\d{4})?\s*(.+?)\s+(\d{2,4})\s*\/\s*(\d{2,4})\s*$/)
    if (mm) {
      if (pending) entries.push(pending)
      const [, vint, name, gl, bo] = mm
      pending = { vintage: vint ? parseInt(vint, 10) : null, name: name.trim(), producer: null, type, country, region,
        price_glass: parseFloat(gl), price_bottle: parseFloat(bo), grape: null, currency: 'SEK' }
      continue
    }
    // Wine line with inline single price (bottle)
    mm = l.match(/^(\d{4})?\s*(.+?)\s+(\d{3,4})\s*$/)
    if (mm && !/^(\d{4})$/.test(l)) {
      if (pending) entries.push(pending)
      const [, vint, name, bo] = mm
      pending = { vintage: vint ? parseInt(vint, 10) : null, name: name.trim(), producer: null, type, country, region,
        price_glass: null, price_bottle: parseFloat(bo), grape: null, currency: 'SEK' }
      continue
    }
    // Wine line WITHOUT price
    mm = l.match(/^(\d{4})\s+(.+)$/)
    if (mm) {
      if (pending) entries.push(pending)
      pending = { vintage: parseInt(mm[1], 10), name: mm[2].trim(), producer: null, type, country, region,
        price_glass: null, price_bottle: null, grape: null, currency: 'SEK' }
      continue
    }
    // Producer line / continuation
    if (pending && !pending.producer) {
      const parts = l.split(',').map((s) => s.trim()).filter(Boolean)
      pending.producer = parts[0]
      for (const p of parts.slice(1)) {
        if (COUNTRY_NAMES[p]) pending.country = COUNTRY_NAMES[p]
        else pending.region = p
      }
      continue
    }
    // Otherwise extend producer or name
    if (pending && pending.producer) pending.producer = (pending.producer + ' ' + l).trim()
    else if (!pending) pending = { vintage: null, name: l, producer: null, type, country, region,
      price_glass: null, price_bottle: null, grape: null, currency: 'SEK' }
  }
  if (pending) entries.push(pending)
  return entries
}

function parsePricesOnlyColumn(colLines) {
  return colLines.filter((l) => PRICE_LINE.test(l.trim())).map((l) => parseFloat(l.trim()))
}

// PAGE 1: cols 0,1 = vitt; cols 2,3 = rött. Each col is independent stream.
for (const c of [0, 1]) wines.push(...parseColumnEntries(pages[0].columns[c], 'vitt', 'Italien'))
for (const c of [2, 3]) wines.push(...parseColumnEntries(pages[0].columns[c], 'rött', 'Italien'))

// PAGE 2: col 0 = GROSSO (names), col 1 = prices for col 0.
const grossoEntries = parseColumnEntries(pages[1].columns[0], 'rött', 'Italien')
const grossoPrices = parsePricesOnlyColumn(pages[1].columns[1])
for (let i = 0; i < grossoEntries.length; i++) {
  if (grossoPrices[i] !== undefined) grossoEntries[i].price_bottle = grossoPrices[i]
}
wines.push(...grossoEntries)

// Col 2 = SPUMANTE, col 3 = CHAMPAGNE — each with inline prices
wines.push(...parseColumnEntries(pages[1].columns[2], 'mousserande', 'Italien'))
wines.push(...parseColumnEntries(pages[1].columns[3], 'mousserande', 'Frankrike'))

// Filter wines without price (artefacts)
const final = wines.filter((w) => w.price_bottle || w.price_glass)

await mkdir('data/extracted', { recursive: true })
for (const r of [
  { name: 'Capannone', slug: 'capannone', area: 'Stockholm', website: 'https://www.capannonesthlm.se/', wine_list_url: null },
  { name: 'Capannone Bottega', slug: 'capannone-bottega', area: 'Stockholm', website: 'https://www.capannonesthlm.se/', wine_list_url: null },
]) {
  await writeFile(`data/extracted/${r.slug}.json`, JSON.stringify({
    restaurant: { name: r.name, area: r.area, address: null, website: r.website, wine_list_url: r.wine_list_url }, wines: final,
  }, null, 2))
}
const t = {}; for (const w of final) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${final.length} wines`, t)
