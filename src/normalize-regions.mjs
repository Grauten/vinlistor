// Canonicalise wines.region — fold "Bourgogne"/"BOURGOGNE", "Penedès"/"Penedes",
// "Saint-Émilion"/"Saint Emilion"/"SAINT-EMILION" into a single display variant.
//
//   node src/normalize-regions.mjs --dry
//   node src/normalize-regions.mjs
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

// Drop appellation prefixes if used; lower, strip diacritics, strip punctuation, collapse.
const PREFIX = /^(DO|DOCG?|AOC|IGP|IGT|AVA)\s+/i
const canon = (s) =>
  s.replace(PREFIX, '').toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '')
   .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const wines = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('wines').select('id, region').range(from, from + 999)
  if (error) throw new Error(error.message)
  wines.push(...data)
  if (data.length < 1000) break
}

// Group: canonical key → variant → count
const groups = new Map()
for (const w of wines) {
  if (!w.region) continue
  const k = canon(w.region); if (k.length < 3) continue
  if (!groups.has(k)) groups.set(k, new Map())
  const m = groups.get(k); m.set(w.region, (m.get(w.region) || 0) + 1)
}

// Pick display: most common; tiebreaker prefer variant with diacritics/hyphens
// (more information), tiebreaker length, tiebreaker alphabetical.
const hasFancyChars = (s) => /[ÀÁÂÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜßàáâäåæçèéêëìíîïñòóôõöøùúûüÿ\-]/.test(s)
const display = new Map()
for (const [k, variants] of groups) {
  const sorted = [...variants.entries()].sort((a, b) =>
    b[1] - a[1] ||
    (hasFancyChars(b[0]) ? 1 : 0) - (hasFancyChars(a[0]) ? 1 : 0) ||
    b[0].length - a[0].length ||
    a[0].localeCompare(b[0], 'sv')
  )
  display.set(k, sorted[0][0])
}

// Plan rewrites
const rename = new Map()
const changes = []
for (const [k, variants] of groups) {
  const winner = display.get(k)
  if (variants.size === 1 && variants.has(winner)) continue
  changes.push({ winner, variants: [...variants.entries()] })
  for (const [v] of variants) if (v !== winner) rename.set(v, winner)
}

console.log(`${changes.length} region groups have variants. ${rename.size} names will be rewritten.\n`)
console.log('Top 20 merges:')
changes
  .sort((a, b) => b.variants.reduce((s, [, c]) => s + c, 0) - a.variants.reduce((s, [, c]) => s + c, 0))
  .slice(0, 20)
  .forEach((g) => {
    const others = g.variants.filter(([v]) => v !== g.winner).map(([v, c]) => `"${v}"×${c}`).join(', ')
    console.log(`  → "${g.winner}"   from: ${others}`)
  })

if (DRY) { console.log('\n[dry] re-run without --dry to apply.'); process.exit(0) }

let updated = 0
for (const [oldName, newName] of rename) {
  const { error, count } = await db.from('wines').update({ region: newName }, { count: 'exact' }).eq('region', oldName)
  if (error) { console.error(`FAIL "${oldName}": ${error.message}`); continue }
  updated += count || 0
}
console.log(`\nDone. ${updated} wine rows updated.`)
