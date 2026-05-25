// Orchestrator: for each restaurant in restaurants.json, fetch its wine list,
// extract priced wines with Claude, and write them to Supabase.
//
//   npm run collect                 # all restaurants
//   npm run collect -- --only "Name substring"   # just matching ones
//   npm run collect -- --dry        # fetch + extract, print, DON'T write to DB
import './lib/env.mjs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fetchMenu, renderWithPlaywright } from './lib/fetch-menu.mjs'
import { extractWines } from './lib/extract.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyIdx = args.indexOf('--only')
// --only accepts one substring or a comma-separated list (matches if any substring is in the name).
const onlySubs = onlyIdx !== -1 ? args[onlyIdx + 1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []

const restaurants = JSON.parse(await readFile(join(here, '..', 'restaurants.json'), 'utf8'))
  .filter((r) => !onlySubs.length || onlySubs.some((s) => r.name.toLowerCase().includes(s)))

if (!restaurants.length) {
  console.error('No restaurants matched. Add entries to restaurants.json.')
  process.exit(1)
}

// Import DB lazily so --dry runs without Supabase credentials.
let db = null
if (!dry) db = await import('./lib/db.mjs')

for (const r of restaurants) {
  console.log(`\n=== ${r.name} ===`)
  if (!r.wine_list_url) { console.warn('  skip: no wine_list_url'); continue }
  try {
    let menu = await fetchMenu(r.wine_list_url)
    if (menu.kind === 'text' && menu.thin) {
      console.log('  thin HTML — rendering with Playwright…')
      menu = await renderWithPlaywright(r.wine_list_url)
    }

    let { wines, notes } = await extractWines(menu, r.name)

    // Many menu pages load the list via JS. If a static HTML fetch yielded no
    // wines, render the page in a real browser and try once more.
    if (!wines.length && menu.kind === 'text') {
      console.log('  0 wines from static HTML — rendering with Playwright…')
      const rendered = await renderWithPlaywright(r.wine_list_url)
      ;({ wines, notes } = await extractWines(rendered, r.name))
    }
    console.log(`  extracted ${wines.length} wines${notes ? ` — ${notes}` : ''}`)

    if (dry) {
      console.table(wines.slice(0, 10).map((w) => ({
        name: w.name, vintage: w.vintage, type: w.type,
        glas: w.price_glass, flaska: w.price_bottle,
      })))
      continue
    }

    const id = await db.upsertRestaurant({
      name: r.name, area: r.area, address: r.address,
      website: r.website, wine_list_url: r.wine_list_url,
    })
    const n = await db.replaceWines(id, wines, r.wine_list_url)
    console.log(`  wrote ${n} wines to Supabase`)
  } catch (err) {
    console.error(`  ERROR: ${err.message}`)
  }
}

console.log('\nDone.')
