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
  console.log('Loading Stockholm index…')
  await page.goto('https://starwinelist.com/wine-lists/stockholm', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(7000) // clear Cloudflare + render

  const places = [...new Set(await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => h.includes('/wine-place/'))
  ))]
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
