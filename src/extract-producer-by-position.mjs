// Extract producer from the wine name for restaurants whose list format puts the
// producer in a known position within the comma-separated string.
//
// Per-restaurant config: name → 'last' | 'first'.
//   'last'  → "Cuvée Tradition, Paul Déthune"      → producer="Paul Déthune", name="Cuvée Tradition"
//   'first' → "Aldo Conterno, Colonnello Barolo"   → producer="Aldo Conterno", name="Colonnello Barolo"
// Single-piece names where the whole string looks like a producer (starts with
// "Domaine"/"Château"/etc.) → producer = the whole name (kept as-is in name too).
//
//   node src/extract-producer-by-position.mjs --dry
//   node src/extract-producer-by-position.mjs
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

// Configure per restaurant — chosen by inspecting the parser output.
const CONFIG = {
  'DoMa': 'last',
  'Café Klotet': 'first',
  'Vinverket': 'first',
}

const PRODUCER_PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Cantine?|Cantina|Tenuta|Casa|Weingut|Maison|Cantina|Fattoria|Quinta|Adega|Mas|Dom\.?|Az\.?|Azienda)\b/i

// Reject candidates that look like region/country/grape/year/decoration.
const knownRegions = new Set()
const knownCountries = new Set()
const norm = (s) => (s || '').toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

console.log('Loading regions/countries to filter false positives…')
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('wines').select('region, country').range(from, from + 999)
  for (const w of data) {
    if (w.region)  knownRegions.add(norm(w.region))
    if (w.country) knownCountries.add(norm(w.country))
  }
  if (data.length < 1000) break
}

const looksLikeRegion = (s) => knownRegions.has(norm(s)) || knownCountries.has(norm(s))
const looksLikeYear = (s) => /^\d{4}/.test(s)
const looksLikeDecor = (s) => /^(Magnum|MGM|MGN|375\s?ml|750\s?ml|Glas|Coravin|MV|NV|SA)$/i.test(s)
const isValid = (s) => s && s.length >= 3 && s.length <= 80
  && !looksLikeYear(s) && !looksLikeRegion(s) && !looksLikeDecor(s)

const { data: restaurants } = await db.from('restaurants').select('id, name')
const rByName = new Map(restaurants.map((r) => [r.name, r.id]))

const updates = []
for (const [restName, position] of Object.entries(CONFIG)) {
  const restId = rByName.get(restName)
  if (!restId) { console.warn(`  restaurant not found: ${restName}`); continue }

  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('wines').select('id, name, producer').eq('restaurant_id', restId).range(from, from + 999)
    rows.push(...data); if (data.length < 1000) break
  }
  const nullRows = rows.filter((w) => !w.producer)
  console.log(`\n${restName} (${position}-position): ${rows.length} wines, ${nullRows.length} without producer`)

  let extracted = 0
  for (const w of nullRows) {
    const pieces = w.name.split(',').map((s) => s.trim()).filter(Boolean)
    let producer = null
    let newName = w.name

    if (pieces.length >= 2) {
      const cand = position === 'last' ? pieces[pieces.length - 1] : pieces[0]
      if (isValid(cand)) {
        producer = cand.replace(/\.+$/, '').trim()
        // Trim that piece from name (keep the rest joined)
        newName = (position === 'last' ? pieces.slice(0, -1) : pieces.slice(1)).join(', ')
      }
    } else if (pieces.length === 1 && PRODUCER_PREFIX.test(pieces[0])) {
      // single-piece "Château Branaire-Ducru" / "Domaine Tertre Roteboeuf"
      producer = pieces[0]
      newName = pieces[0]
    }

    if (producer) {
      updates.push({ id: w.id, producer, name: newName, oldName: w.name })
      extracted++
    }
  }
  console.log(`  ${extracted} producers ready to extract`)
}

console.log(`\nSample 8 changes:`)
updates.slice(0, 8).forEach((u) => console.log(`  "${u.oldName}"   →   producer="${u.producer}"  name="${u.name}"`))

if (DRY) { console.log(`\n[dry] ${updates.length} rows would change. Re-run without --dry to apply.`); process.exit(0) }

console.log(`\nApplying ${updates.length} updates…`)
let done = 0
for (const u of updates) {
  const { error } = await db.from('wines').update({ producer: u.producer, name: u.name }).eq('id', u.id)
  if (error) { console.error(`FAIL id ${u.id}: ${error.message}`); continue }
  done++
  if (done % 100 === 0) process.stdout.write(`\r  ${done}/${updates.length}…`)
}
console.log(`\nDone. ${done} rows updated.`)
