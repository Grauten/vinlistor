// The Hills — Söder. Format: "YYYY Name, CTY [glass/]bottle"
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const text = await readFile('data/raw/the-hills.txt', 'utf8')
const COUNTRY = { FRA: 'Frankrike', ITA: 'Italien', ESP: 'Spanien', POR: 'Portugal',
  GER: 'Tyskland', AUT: 'Österrike', USA: 'USA', RSA: 'Sydafrika', ENG: 'England' }
const TYPES = { SPARKLING: 'mousserande', WHITE: 'vitt', RED: 'rött', ROSÉ: 'rosé' }
let type = null
const wines = []

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('--') || line.startsWith('Alkoholfritt')) continue
  for (const k in TYPES) if (line.startsWith(k)) { type = TYPES[k]; break }

  // "YYYY <body>, CTY [glass/]bottle"
  const m = line.match(/^(NV|\d{4})\s+(.+?),?\s+([A-Z]{3})\s+(?:(\d{2,4})\/)?(\d{2,5})\s*$/)
  if (!m) continue
  const [, vintageRaw, body, cty, glas, flaska] = m
  wines.push({
    name: body.trim().replace(/,\s*$/, ''),
    producer: null,
    vintage: vintageRaw === 'NV' ? null : parseInt(vintageRaw, 10),
    type,
    country: COUNTRY[cty] || null,
    region: null,
    grape: null,
    price_glass: glas ? parseFloat(glas) : null,
    price_bottle: parseFloat(flaska),
    currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'The Hills', area: 'Södermalm',
    address: 'Götgatan 29, Stockholm', website: 'http://www.thehillsstockholm.se/',
    wine_list_url: 'https://www.thehillsstockholm.se/wp-content/uploads/2026/04/Vinlista-web.pdf',
  },
  wines,
}
const out = 'data/extracted/the-hills.json'
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(output, null, 2))
console.log(`Parsed ${wines.length} wines → ${out}`)
