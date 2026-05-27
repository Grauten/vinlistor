// Canonicalise wines.country to Swedish names so the same country isn't split
// between "France"/"Frankrike", "Italy"/"Italien", etc.
//
//   node src/normalize-countries.mjs --dry
//   node src/normalize-countries.mjs
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

// English / variant → Swedish canonical
const MAP = {
  'France': 'Frankrike',
  'Italy': 'Italien',
  'Spain': 'Spanien',
  'Germany': 'Tyskland',
  'Austria': 'Österrike',
  'South Africa': 'Sydafrika',
  'Australia': 'Australien',
  'Sweden': 'Sverige',
  'Greece': 'Grekland',
  'Hungary': 'Ungern',
  'New Zealand': 'Nya Zeeland',
  'Switzerland': 'Schweiz',
  'United Kingdom': 'England',
  'Czech Republic': 'Tjeckien',
  'Czechia': 'Tjeckien',
  'Slovakia': 'Slovakien',
  'Lebanon': 'Libanon',
  'Moldova': 'Moldavien',
  'Georgia': 'Georgien',
  'Palestine': 'Palestina',
  'Argentina': 'Argentina',
  'Chile': 'Chile',
  'Slovenia': 'Slovenien',
  'Cyprus': 'Cypern',
  'Japan': 'Japan',
  'Portugal': 'Portugal',
}

console.log(`Planned rewrites: ${Object.keys(MAP).length} variants → Swedish names`)
for (const [from, to] of Object.entries(MAP)) console.log(`  ${from.padEnd(18)} → ${to}`)

if (DRY) { console.log('\n[dry] re-run without --dry to apply.'); process.exit(0) }

let total = 0
for (const [oldName, newName] of Object.entries(MAP)) {
  if (oldName === newName) continue
  const { error, count } = await db.from('wines').update({ country: newName }, { count: 'exact' }).eq('country', oldName)
  if (error) { console.error(`FAIL ${oldName}: ${error.message}`); continue }
  if (count) { console.log(`  ${oldName} → ${newName}: ${count} rows`); total += count }
}
console.log(`\nDone. ${total} wine rows updated.`)
