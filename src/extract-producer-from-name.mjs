// For wines with null producer, try to peel one off the END of the name field
// (typically the last comma chunk). Skip if the candidate looks like a region or
// country — we don't want to invent producers from non-producer text.
//
//   node src/extract-producer-from-name.mjs --dry
//   node src/extract-producer-from-name.mjs
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

console.log('Loading wines + known regions/countries…')
const all = []
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('wines').select('id, name, producer, region, country').range(from, from + 999)
  all.push(...data); if (data.length < 1000) break
}

// Build sets of known regions and countries for the "don't mistake X for producer" check.
const norm = (s) => (s||'').toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const knownRegions = new Set(all.map(w => norm(w.region)).filter(Boolean))
const knownCountries = new Set(all.map(w => norm(w.country)).filter(Boolean))
// Common grape names that sometimes appear in last comma slot
const grapes = new Set(['nebbiolo','barbera','dolcetto','sangiovese','chardonnay','pinot noir','pinot nero','cabernet sauvignon','merlot','syrah','riesling','sauvignon blanc','tempranillo','garnacha','grenache','pinot grigio','pinot gris','gewurztraminer','viognier','semillon','aligote'])
// Wine-style words that look like producers but aren't
const stopWords = new Set(['rosso','bianco','riserva','reserva','crianza','gran reserva','superiore','classico','docg','doc','aop','aoc','igt','igp','dop'])

const tooShort = (s) => s.length < 3
const looksLikeYear = (s) => /^\d{4}/.test(s) || /^(19|20)\d{2}/.test(s)
const looksLikeRegion = (s) => {
  const n = norm(s)
  return knownRegions.has(n) || knownCountries.has(n)
}
const looksLikeGrape = (s) => grapes.has(norm(s))
const looksLikeStop = (s) => {
  const n = norm(s); return stopWords.has(n) || n.split(' ').every(w => stopWords.has(w))
}

// Different restaurants use different conventions: Stadshuskällaren writes
// "Producer, Cuvée, Region" (producer first), DoMa writes "Cuvée, Producer" (last).
// We can't reliably guess from a generic rule, so be conservative: only extract when
// the FIRST piece starts with a known producer-noun prefix → that's the producer.
const PRODUCER_PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Weingut|Tenuta|Maison|Cantina|Cantine|Fattoria|Casa|Champagne|Quinta|Adega|Mas|Caves?|Az\.|Azienda Agricola|Vignobles?|Vignerons?|Cellar|Cellars?|Cellier|Estate|Family)\s+/i

const changes = []
for (const w of all) {
  if (w.producer) continue
  if (!w.name || !w.name.includes(',')) continue
  const pieces = w.name.split(',').map(s => s.trim()).filter(Boolean)
  if (pieces.length < 2) continue

  const first = pieces[0].replace(/\.+$/, '').trim()
  if (!PRODUCER_PREFIX.test(first)) continue
  if (tooShort(first) || first.length > 60) continue
  changes.push({ id: w.id, name: w.name, newProducer: first })
}

console.log(`${all.filter(w => !w.producer).length} wines have null producer.`)
console.log(`${changes.length} of those will get a producer extracted from their name.\n`)
console.log('Sample 20 extractions:')
changes.slice(0, 20).forEach((c) => console.log(`  "${c.name.slice(0, 60)}"  →  producer="${c.newProducer}"`))

if (DRY) { console.log('\n[dry] re-run without --dry to apply.'); process.exit(0) }

console.log('\nApplying…')
let updated = 0
// Batch updates by newProducer value where the name and current producer-null condition match
// — simpler to do per-row. ~2k rows is fine.
for (const c of changes) {
  const { error } = await db.from('wines').update({ producer: c.newProducer }).eq('id', c.id)
  if (error) { console.error(`FAIL id ${c.id}: ${error.message}`); continue }
  updated++
  if (updated % 200 === 0) process.stdout.write(`\r  ${updated}/${changes.length}…`)
}
console.log(`\nDone. ${updated} wine rows updated.`)
