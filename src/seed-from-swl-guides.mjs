// Sweep Star Wine List's curated guide pages for /wine-place/ slugs that aren't yet in
// our SWL candidates. Each guide page links to a curated subset; some restaurants may
// appear here that the alphabetical city index missed.
//
//   node src/seed-from-swl-guides.mjs
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'

const GUIDES = [
  'https://starwinelist.com/wine-guide/the-best-wine-restaurants-in-stockholm',
  'https://starwinelist.com/wine-guide/the-best-wine-bars-in-stockholm',
  'https://starwinelist.com/wine-guide/vasastan-s-wine-bars-and-restaurants',
  'https://starwinelist.com/wine-guide/the-stockholm-michelin-stars-wine-lists',
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const SKIP = /facebook|instagram|google|bokabord|caterbook|booking|maps\.|tel:|mailto:|\.jpg|\.png/i

const existing = JSON.parse(await readFile('data/swl-candidates.json', 'utf8'))
const existingURLs = new Set(existing.map((r) => r.swl_url))
console.log(`${existing.length} SWL candidates already collected.`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ userAgent: UA })

// 1) Collect new /wine-place/ URLs from each guide
const newPlaces = new Set()
for (const url of GUIDES) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(5000)
  const places = [...new Set(await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => h.includes('/wine-place/'))
  ))]
  const fresh = places.filter((p) => !existingURLs.has(p))
  fresh.forEach((p) => newPlaces.add(p))
  console.log(`  ${url.replace('https://starwinelist.com', '')}: ${places.length} places, ${fresh.length} new`)
}
console.log(`\n${newPlaces.size} brand-new SWL wine-place URLs across all guides`)

// 2) Enrich each new place (visit and grab name/address/website)
const enriched = []
let i = 0
for (const url of newPlaces) {
  i++
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(2500)
    const r = await page.evaluate((skipRe) => {
      const skip = new RegExp(skipRe, 'i')
      const txt = document.body.innerText
      const grab = (label) => { const m = txt.match(new RegExp(label + '\\s*\\n([^\\n]+)', 'i')); return m ? m[1].trim() : null }
      const name = (document.title || '').split(/[-|]/)[0].trim()
      const links = [...document.querySelectorAll('a')].map((a) => a.href)
      const website = links.find((h) => /^https?:/.test(h) && !skip.test(h))
      return { name, address: grab('Address'), website }
    }, SKIP.source)
    if (!r.name || !r.website) continue
    const area = r.address ? r.address.split(',').slice(-1)[0].trim() : 'Stockholm'
    enriched.push({ name: r.name, area, address: r.address, website: r.website, swl_url: url, source: 'swl-guide' })
    process.stdout.write(`\r  ${i}/${newPlaces.size}  +${enriched.length}…`)
  } catch (e) {
    process.stdout.write(`\r  ${i}/${newPlaces.size}  err ${url.slice(-30)}            `)
  }
}
console.log('')

await browser.close()

// 3) Merge into the existing SWL candidates file
const merged = [...existing, ...enriched]
await writeFile('data/swl-candidates.json', JSON.stringify(merged, null, 2))
console.log(`\nMerged ${enriched.length} new SWL guide finds → swl-candidates.json now has ${merged.length}`)
console.log('\nSample of new:')
enriched.slice(0, 10).forEach((r) => console.log(`  ${r.name.padEnd(28)} ${r.website}`))
