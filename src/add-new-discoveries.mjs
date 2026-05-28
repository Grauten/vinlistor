// Merge data/discovered-extra.json into restaurants.json — fuzzy-dedupe against the
// DB and reject URLs whose filename strongly suggests a food menu rather than a wine list.
//   node src/add-new-discoveries.mjs --dry  /  no flag
import { readFile, writeFile } from 'node:fs/promises'
import { db } from './lib/db.mjs'

const DRY = process.argv.includes('--dry')

// Tokenize URL on non-alphanumerics so "Agnes_menu_english" (underscores are JS word
// chars, so \b doesn't help) gets split into ['agnes','menu','english',...].
const FOOD_WORDS = new Set(['menu','meny','matmeny','middag','frukost','lunch','brunch','breakfast','sallskap','varmeny','matsedel','tasting','prov','provning','matmasen','mat','food','sallskaps','huvudratter'])
const WINE_WORDS = new Set(['vinlista','winelist','bottle','flasklista','kallarlista','dryck','matovin','vins','wineroom','vinkort','vinmeny'])
const urlTokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const hasAny = (tokens, set) => tokens.some((t) => set.has(t))

const norm = (s) => (s || '').toLocaleLowerCase('sv').normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '').trim()

const { data: existing } = await db.from('restaurants').select('name, wine_list_url')
const existingKeys = new Set(existing.map((r) => norm(r.name)))
const existingURLs = new Set(existing.map((r) => r.wine_list_url).filter(Boolean))
const existingFuzzy = new Set([...existingKeys])
// Add prefix/suffix variants so e.g. "ullawinbladh" matches "wardshusetullawinbladh"
for (const k of existingKeys) {
  for (let len = 8; len < k.length; len++) {
    existingFuzzy.add(k.slice(0, len))
    existingFuzzy.add(k.slice(-len))
  }
}
function isInDB(name) {
  const k = norm(name)
  if (existingKeys.has(k)) return true
  // Check if k is contained in or contains any existing key
  for (const e of existingKeys) {
    if ((k.length >= 6 && e.includes(k)) || (e.length >= 6 && k.includes(e))) return true
  }
  return false
}

const disc = JSON.parse(await readFile('data/discovered-extra.json', 'utf8'))
const pdfs = disc.filter((r) => r.kind === 'pdf' && r.wine_list_url)

const existingRestaurants = JSON.parse(await readFile('restaurants.json', 'utf8'))
const restaurantKeys = new Set(existingRestaurants.map((r) => norm(r.name)))

const additions = []
const skipped = []
for (const r of pdfs) {
  if (isInDB(r.name) || restaurantKeys.has(norm(r.name))) {
    skipped.push({ name: r.name, reason: 'already in DB / restaurants.json' }); continue
  }
  if (existingURLs.has(r.wine_list_url)) {
    skipped.push({ name: r.name, reason: 'PDF already linked to another restaurant in DB' }); continue
  }
  const toks = urlTokens(r.wine_list_url)
  if (hasAny(toks, FOOD_WORDS) && !hasAny(toks, WINE_WORDS)) {
    skipped.push({ name: r.name, reason: 'food-menu URL', url: r.wine_list_url }); continue
  }
  // Drop obviously broken URLs
  if (/grandhotel\.se\/index%2E/i.test(r.wine_list_url)) {
    skipped.push({ name: r.name, reason: 'broken URL' }); continue
  }
  additions.push({
    name: r.name,
    area: r.area || 'Stockholm',
    address: r.address || null,
    website: r.website,
    wine_list_url: r.wine_list_url,
  })
}

console.log(`${pdfs.length} discovered PDFs → ${additions.length} new + ${skipped.length} skipped`)
console.log('\nSKIPPED:')
skipped.forEach((s) => console.log(`  ${s.name.padEnd(30)} ${s.reason}${s.url ? '  (' + s.url.split('/').pop() + ')' : ''}`))
console.log('\nADDING:')
additions.forEach((a) => console.log(`  ${a.name.padEnd(30)} ${a.wine_list_url.slice(0, 80)}`))

if (DRY) { console.log('\n[dry] re-run without --dry to write restaurants.json'); process.exit(0) }

const merged = [...existingRestaurants, ...additions]
await writeFile('restaurants.json', JSON.stringify(merged, null, 2) + '\n')
console.log(`\nrestaurants.json: ${existingRestaurants.length} → ${merged.length}`)
console.log('Now run:  npm run collect -- --skip-existing')
