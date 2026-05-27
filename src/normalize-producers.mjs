// One-off: canonicalise wines.producer across the DB so e.g. "Domaine Etienne Sauzet"
// and "Etienne Sauzet" collapse to a single producer. For each canonical group, we
// pick the most-common variant as the display form (longest wins ties) and rewrite
// every wine in the group to that name.
//
//   node src/normalize-producers.mjs --dry   # show what would change, no writes
//   node src/normalize-producers.mjs         # apply
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

// Generic "producer noun" prefixes to strip when building the matching key.
const PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Cantine?|Cantina|Tenuta|Casa|Casas|Weingut|Maison|Cellier|Cellars?|Cellar|Azienda Agricola|Az\.|Fattoria|Champagne|Vignobles?|Vignerons?|Vigna|Estate|Family|Wines|Caves?|Quinta|Adega|Mas)\s+/i

// Drop diacritics, lower-case (Swedish locale), strip all punctuation, collapse spaces.
function canon(s) {
  return s
    .replace(PREFIX, '')
    .toLocaleLowerCase('sv')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

console.log('Loading wines…')
const wines = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('wines').select('id, producer').range(from, from + 999)
  if (error) throw new Error(error.message)
  wines.push(...data)
  if (data.length < 1000) break
}
console.log(`Loaded ${wines.length} wines (${wines.filter(w => w.producer).length} with producer)`)

// Build canonical key → Map(variant → count)
const groups = new Map()
for (const w of wines) {
  if (!w.producer) continue
  const k = canon(w.producer)
  if (k.length < 3) continue // skip ultra-short keys to avoid collisions ("OM", "X", …)
  if (!groups.has(k)) groups.set(k, new Map())
  const variants = groups.get(k)
  variants.set(w.producer, (variants.get(w.producer) || 0) + 1)
}

// For each group, pick display: most-common, tiebreaker longest, then alphabetical.
const display = new Map() // canonical key → chosen display name
for (const [k, variants] of groups) {
  const sorted = [...variants.entries()].sort((a, b) =>
    b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], 'sv')
  )
  display.set(k, sorted[0][0])
}

// Plan: oldName → newName, only where they differ
const rename = new Map()
const groupsWithChange = []
for (const [k, variants] of groups) {
  const winner = display.get(k)
  if (variants.size === 1 && variants.has(winner)) continue
  groupsWithChange.push({ key: k, winner, variants: [...variants.entries()] })
  for (const [v] of variants) if (v !== winner) rename.set(v, winner)
}

console.log(`\n${groupsWithChange.length} canonical producers have variants to fold in.`)
console.log(`${rename.size} distinct producer names will be rewritten.\n`)
console.log('Top 15 merges:')
groupsWithChange
  .sort((a, b) => b.variants.reduce((s, [, c]) => s + c, 0) - a.variants.reduce((s, [, c]) => s + c, 0))
  .slice(0, 15)
  .forEach((g) => {
    const total = g.variants.reduce((s, [, c]) => s + c, 0)
    const others = g.variants.filter(([v]) => v !== g.winner).map(([v, c]) => `"${v}"×${c}`).join(', ')
    console.log(`  → "${g.winner}"  (${total} wines)   from: ${others}`)
  })

// Count wines that would actually change
const willChange = wines.filter(w => w.producer && rename.has(w.producer)).length
console.log(`\n${willChange} wine rows will be updated.`)

if (DRY) { console.log('\n[dry] no writes performed. Re-run without --dry to apply.'); process.exit(0) }

// Apply: one UPDATE per old producer value (much cheaper than per-row).
console.log('\nApplying updates…')
let updated = 0
for (const [oldName, newName] of rename) {
  const { error, count } = await db.from('wines').update({ producer: newName }, { count: 'exact' }).eq('producer', oldName)
  if (error) { console.error(`  FAIL "${oldName}" → "${newName}": ${error.message}`); continue }
  updated += count || 0
}
console.log(`Done. ${updated} wine rows updated.`)
