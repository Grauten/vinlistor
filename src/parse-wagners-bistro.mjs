// Wagners Bistro — simple "Producer header" then "Cuvée Year Price" rows.
// Top-level: WAGNERS VIN, then SPARKLING/FRANCE/CHAMPAGNE/etc. Wine rows like
// "Brut Réserve MV 995" with vintage MV/NV or YYYY embedded.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/wagners-bistro.txt', 'utf8')

const TYPE_HEADERS = {
  SPARKLING: 'mousserande', CHAMPAGNE: 'mousserande',
  'WHITE WINE': 'vitt', WHITE: 'vitt', 'WHITE WINES': 'vitt',
  'RED WINE': 'rött', RED: 'rött', 'RED WINES': 'rött',
  ROSÉ: 'rosé', 'ROSÉ WINE': 'rosé',
  DESSERT: 'dessert', SWEET: 'dessert', 'SWEET WINE': 'dessert',
}
const COUNTRY_HEADERS = {
  FRANCE: 'Frankrike', ITALY: 'Italien', SPAIN: 'Spanien', GERMANY: 'Tyskland',
  AUSTRIA: 'Österrike', PORTUGAL: 'Portugal', USA: 'USA', 'NEW ZEALAND': 'Nya Zeeland',
  AUSTRALIA: 'Australien', 'SOUTH AFRICA': 'Sydafrika', ARGENTINA: 'Argentina',
  CHILE: 'Chile', HUNGARY: 'Ungern',
}
// Regions (mixed case) that we want to track
const REGION_RX = /^(Champagne|Burgundy|Bourgogne|Bordeaux|Loire|Rhône|Rhone|Alsace|Jura|Languedoc|Provence|Beaujolais|Piemonte|Tuscany|Toscana|Sicily|Sicilien|Veneto|Friuli|Lombardy|Lombardia|Alto Adige|Marche|Abruzzo|Rioja|Priorat|Ribera del Duero|Mosel|Rheingau|Pfalz|Rheinhessen|Nahe|Wachau|Kamptal|Burgenland)$/

let type = null, country = null, region = null, producer = null
const wines = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d/.test(line) || /^\d+$/.test(line)) continue
  if (line === 'WAGNERS VIN') continue

  const uc = line.toUpperCase()
  if (TYPE_HEADERS[uc] !== undefined) { type = TYPE_HEADERS[uc]; producer = null; continue }
  if (COUNTRY_HEADERS[uc] !== undefined) { country = COUNTRY_HEADERS[uc]; producer = null; continue }
  if (REGION_RX.test(line)) { region = line; producer = null; continue }
  if (!type) continue

  // Wine row: "Name Vintage Price" — vintage is MV/NV or YYYY, price is 3-5 digits at end
  const m = line.match(/^(.+?)\s+(MV|NV|\d{4})\s+(\d{3,5})\s*$/)
  if (m) {
    const [, body, vintRaw, priceStr] = m
    wines.push({
      name: body.replace(/\s+/g, ' ').trim(),
      producer,
      vintage: /^\d{4}$/.test(vintRaw) ? parseInt(vintRaw, 10) : null,
      type, country, region, grape: null,
      price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
    })
    continue
  }
  // "Name Price" without vintage marker
  const m2 = line.match(/^(.+?)\s+(\d{3,5})\s*$/)
  if (m2) {
    wines.push({
      name: m2[1].replace(/\s+/g, ' ').trim(), producer,
      vintage: null, type, country, region, grape: null,
      price_glass: null, price_bottle: parseFloat(m2[2]), currency: 'SEK',
    })
    continue
  }

  // Otherwise treat as a producer line (no digits, short text)
  if (line.length < 60 && !/\d/.test(line) && /[A-Z]/.test(line)) producer = line
}

const output = {
  restaurant: { name: 'Wagners Bistro', area: 'Stockholm', address: null,
    website: 'https://wagnersbistro.se/',
    wine_list_url: 'https://wagnersbistro.se/wp-content/uploads/2026/04/Vinlista-April-2026.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/wagners-bistro.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
