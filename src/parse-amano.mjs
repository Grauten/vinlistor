// Restaurang Amano — Italian focus, multi-line wines. Wine = "[YYYY] Name \t price:-",
// followed by producer/region context line. Sections: Champagne, Spumante, Bianco, Rosso,
// Dolce. Sub-region headers like Sicilia, Piemonte.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/amano.txt', 'utf8')

const TYPE_RX = [
  { rx: /^Champagne$/i, type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Vintage Champagne$/i, type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Rosé Champagne$/i, type: 'mousserande', country: 'Frankrike', region: 'Champagne' },
  { rx: /^Spumante$/i, type: 'mousserande', country: 'Italien' },
  { rx: /^Prosecco$/i, type: 'mousserande', country: 'Italien' },
  { rx: /^Cidre$/i, type: null }, // skip
  { rx: /^Rosato\s*\/\s*Rosé$/i, type: 'rosé' },
  { rx: /\bBianco\b.*\bVitt\b|\(Bianco \/ White \/ Vitt\)/i, type: 'vitt' },
  { rx: /\bRosso\b.*\bRött\b|\(Rosso \/ Red \/ Rött\)/i, type: 'rött' },
  { rx: /\bDolce\b.*\bSött\b/i, type: 'dessert' },
  { rx: /^Avec|^Cocktail|^Spirits|^Grappa|^Whisky/i, type: 'SKIP' },
]
const ITALIAN_REGIONS = new Set(['Sicilia','Piemonte','Toscana','Veneto','Lombardia','Lombardiet','Friuli','Alto Adige','Marche','Umbria','Umbrien','Puglia','Puglien','Sardegna','Sardinien','Lazio','Campania','Abruzzo','Basilicata','Calabria','Trentino','Emilia-Romagna','Liguria','Valpolicella'])

let type = null, country = null, region = null, producer = null
let skip = false, page = 0
const wines = []
for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line) continue
  const pm = line.match(/^-- (\d+) of \d+ --$/)
  if (pm) {
    page = parseInt(pm[1], 10)
    if (page >= 9) type = 'rött' // TOC: pages 9+ are reds (Toscana, Piemonte, etc.)
    continue
  }
  if (/^\d+$/.test(line) || /^Varmt välkomna/.test(line)) continue
  // Type / section headers
  let matched = false
  for (const r of TYPE_RX) {
    if (r.rx.test(line)) {
      if (r.type === 'SKIP') skip = true
      else if (r.type) { type = r.type; if (r.country) country = r.country; if (r.region) region = r.region; skip = false }
      else { skip = true }
      matched = true; break
    }
  }
  if (matched) continue
  if (skip) continue
  if (ITALIAN_REGIONS.has(line)) { region = line; country = 'Italien'; continue }
  if (!type) continue

  // Wine row: "[YYYY] Name \t price:-" or "Name price:-"
  // Strip parenthetical glass-prices like "(Glas 85:-)" at end
  const cleaned = line.replace(/\(?Glas\s+\(?\d+:?-\)?\)?/gi, '').replace(/\(?\d{2,4}\s*cl\)?/gi, '').trim()
  const m = cleaned.match(/^(\d{4})?\s*(.+?)\s+\(?(\d{2,5})\s*:-\)?(?:\(Mgm\))?\s*$/)
  if (!m) continue
  const [, vintRaw, body, priceStr] = m
  // Skip super-short bodies (probably noise)
  if (body.length < 4) continue
  wines.push({
    name: body.replace(/\s+/g, ' ').trim(),
    producer: null,
    vintage: vintRaw ? parseInt(vintRaw, 10) : null,
    type, country, region, grape: null,
    price_glass: null, price_bottle: parseFloat(priceStr), currency: 'SEK',
  })
}

const output = {
  restaurant: { name: 'Restaurang Amano', area: 'Stockholm', address: null,
    website: 'https://restaurangamano.se/',
    wine_list_url: 'https://gastrogate.com/files/attachments/20992/amano-dryckesmeny.pdf',
  }, wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/amano.json', JSON.stringify(output, null, 2))
const t = {}; for (const w of wines) t[w.type] = (t[w.type]||0)+1
console.log(`Parsed ${wines.length} wines`, t)
