// Strip year mentions from wines.name when they match the existing vintage field.
// E.g. "Wiston Estate Rosé 2014" with vintage=2014 → "Wiston Estate Rosé".
//   node src/clean-name-years.mjs --dry  /  no flag
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

const all = []
for (let from = 0; ; from += 1000) {
  const { data } = await db.from('wines').select('id, name, vintage').range(from, from + 999)
  all.push(...data); if (data.length < 1000) break
}

const changes = []
for (const w of all) {
  if (!w.vintage || !w.name) continue
  const y = String(w.vintage)
  if (!w.name.includes(y)) continue
  // Strip the year + any leading/trailing whitespace or commas. Avoid stripping inside
  // a longer string like "AOC ... 07/2025" — only strip if the year is preceded by
  // whitespace or start and followed by whitespace, comma or end.
  const cleaned = w.name.replace(new RegExp(`(^|[\\s,])${y}(?=[\\s,]|$)`, 'g'), '$1').replace(/\s{2,}/g, ' ').replace(/\s*,\s*$/, '').trim()
  if (cleaned !== w.name && cleaned.length > 2) changes.push({ id: w.id, from: w.name, to: cleaned })
}

console.log(`${changes.length} names contain a year matching their vintage; sample 10:`)
changes.slice(0, 10).forEach(c => console.log(`  "${c.from}"  →  "${c.to}"`))
if (DRY) { console.log('\n[dry]'); process.exit(0) }
let updated = 0
for (const c of changes) {
  const { error } = await db.from('wines').update({ name: c.to }).eq('id', c.id)
  if (error) { console.error(`FAIL id ${c.id}: ${error.message}`); continue }
  updated++
}
console.log(`\nDone. ${updated} rows updated.`)
