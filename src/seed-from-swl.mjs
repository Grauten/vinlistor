// Seed restaurant candidates from Star Wine List (starwinelist.com).
// SWL is behind Cloudflare and shows NO prices for free — but it's a great
// directory: per restaurant we get name, address, and the official website.
// Prices still come from each restaurant's own site (see collect.mjs).
//
//   node src/seed-from-swl.mjs            # full Stockholm directory
//   node src/seed-from-swl.mjs --limit 15 # only enrich first 15
//
// Output: data/swl-candidates.json (curate from this into restaurants.json).
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'data', 'swl-candidates.json')

const args = process.argv.slice(2)
const li = args.indexOf('--limit')
const limit = li !== -1 ? parseInt(args[li + 1], 10) : Infinity

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ userAgent: UA })

try {
  // SWL paginates the city index (was 8 pages × ~23 = ~184 restaurants at scrape time).
  // Walk each page until we hit one with no results.
  const placesSet = new Set()
  for (let pageNum = 1; pageNum <= 30; pageNum++) {
    const url = pageNum === 1
      ? 'https://starwinelist.com/wine-lists/stockholm'
      : `https://starwinelist.com/wine-lists/stockholm?page=${pageNum}`
    process.stdout.write(`\r  loading page ${pageNum}…`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(pageNum === 1 ? 7000 : 3500) // page 1 clears Cloudflare
    const links = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a')].map((a) => a.href).filter((h) => h.includes('/wine-place/')))]
    )
    if (!links.length) break
    const before = placesSet.size
    for (const l of links) placesSet.add(l)
    if (placesSet.size === before) break // duplicate page → done
  }
  console.log('')
  const places = [...placesSet]
  console.log(`Found ${places.length} restaurants. Enriching ${Math.min(places.length, limit)}…`)

  const SKIP = /starwinelist\.com|google\.|instagram\.|facebook\.|bokabord\.|caterbook|booking|maps\.|\.pdf$/i
  const results = []

  for (const url of places.slice(0, limit)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(4000)
      const r = await page.evaluate(() => {
        const txt = document.body.innerText
        const grab = (label) => {
          const re = new RegExp(label + '\\s*\\n([^\\n]+)', 'i')
          const m = txt.match(re)
          return m ? m[1].trim() : null
        }
        const name = (document.title || '').split(/[-|]/)[0].trim() || grab('Sweden ›')
        const official = [...document.querySelectorAll('a')]
          .map((a) => a.href)
          .find((h) => /^https?:/.test(h)) // first link; filtered below
        return { name, address: grab('Address'), phone: grab('Phone'), allLinks: [...document.querySelectorAll('a')].map((a) => a.href) }
      })
      const website = r.allLinks.find((h) => /^https?:/.test(h) && !SKIP.test(h)) || null
      const area = r.address ? (r.address.split(',').slice(-1)[0].trim() || null) : null
      results.push({ name: r.name, area, address: r.address, website, wine_list_url: null, swl_url: url })
      console.log(`  ✓ ${r.name}${website ? '  → ' + website : '  (no site found)'}`)
    } catch (e) {
      console.log(`  ✗ ${url}: ${e.message}`)
    }
    await sleep(500)
  }

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(results, null, 2))
  console.log(`\nWrote ${results.length} candidates → ${out}`)
} finally {
  await browser.close()
}
