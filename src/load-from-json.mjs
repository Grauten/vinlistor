// Load manually-extracted wines from data/extracted/<slug>.json into Supabase.
// Used when extraction happens here in Claude Code (covered by Max) rather than
// via the API-paying pipeline in src/lib/extract.mjs.
//
// JSON shape:
//   {
//     "restaurant": { "name": "...", "area": "...", "address": "...",
//                     "website": "...", "wine_list_url": "..." },
//     "wines": [ { name, producer, vintage, type, country, region, grape,
//                  price_glass, price_bottle, currency }, ... ]
//   }
//
//   node src/load-from-json.mjs data/extracted/spanjorskan.json [more.json ...]
import './lib/env.mjs'
import { readFile } from 'node:fs/promises'
import { db, upsertRestaurant, replaceWines } from './lib/db.mjs'
import { normalizeAll } from './lib/normalize.mjs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node src/load-from-json.mjs <file.json> [file2.json ...]')
  process.exit(1)
}

for (const file of files) {
  const { restaurant, wines } = JSON.parse(await readFile(file, 'utf8'))
  console.log(`=== ${restaurant.name} (${wines.length} wines) ===`)
  const id = await upsertRestaurant(restaurant)
  const n = await replaceWines(id, wines, restaurant.wine_list_url)
  console.log(`  wrote ${n} wines to Supabase`)
}

console.log('\nNormalising country / region / producer …')
const n = await normalizeAll()
console.log(`Done. ${n} total post-load fixes applied.`)
