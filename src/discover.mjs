// Discover the best wine-list URL for each candidate restaurant.
// Reads data/swl-candidates.json, visits each official site, and scores links to
// find a price-bearing wine list — PDFs win (HTML menu pages often omit prices).
// Follows one promising menu/vin page deeper to find a PDF inside it.
//
//   node src/discover.mjs            # all candidates
//   node src/discover.mjs --limit 8
//
// Output: data/discovered.json  +  a printed table.
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const candPath = join(here, '..', 'data', 'swl-candidates.json')
const outPath = join(here, '..', 'data', 'discovered.json')

const args = process.argv.slice(2)
const li = args.indexOf('--limit')
const limit = li !== -1 ? parseInt(args[li + 1], 10) : Infinity

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const WINE = /vin(?!yl)|wine|dryck|dricka/i        // wine-ish
const LISTY = /lista|list|meny|menu|karta|card/i    // list-ish
const SKIP = /facebook|instagram|google|bokabord|caterbook|booking|maps\.|tel:|mailto:|\.jpg|\.png/i

// Score a link: higher = more likely a real, priced wine list.
function score(href, text) {
  const s = (text + ' ' + href).toLowerCase()
  let n = 0
  const isPdf = /\.pdf(\?|$)/i.test(href)
  if (isPdf && WINE.test(s)) n += 100
  else if (isPdf && LISTY.test(s)) n += 60
  else if (isPdf) n += 25
  if (WINE.test(s) && LISTY.test(s)) n += 40
  else if (WINE.test(s)) n += 25
  else if (LISTY.test(s)) n += 8
  return n
}

const links = (page) => page.evaluate(() =>
  [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: (a.innerText || '').trim() }))
)

async function bestOn(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(2500)
  const all = (await links(page)).filter((l) => /^https?:/.test(l.href) && !SKIP.test(l.href))
  return all.map((l) => ({ ...l, s: score(l.href, l.text) })).filter((l) => l.s > 0).sort((a, b) => b.s - a.s)
}

const candidates = JSON.parse(await readFile(candPath, 'utf8')).slice(0, limit)
const browser = await chromium.launch({ headless: true })
const results = []

for (const c of candidates) {
  const row = { name: c.name, area: c.area, address: c.address, website: c.website, wine_list_url: null, kind: null }
  if (c.website) {
    const page = await browser.newPage({ userAgent: UA })
    try {
      const base = c.website.replace(/\?.*$/, '')
      let ranked = await bestOn(page, base)
      let pick = ranked[0]

      // If the top hit is an HTML wine/menu page (not a PDF), look inside it for a PDF.
      if (pick && !/\.pdf(\?|$)/i.test(pick.href)) {
        try {
          const deeper = await bestOn(page, pick.href)
          const pdf = deeper.find((l) => /\.pdf(\?|$)/i.test(l.href))
          if (pdf) pick = pdf
          else if (deeper[0] && deeper[0].s > pick.s) pick = deeper[0]
        } catch { /* keep the page-level pick */ }
      }
      if (pick) {
        row.wine_list_url = pick.href
        row.kind = /\.pdf(\?|$)/i.test(pick.href) ? 'pdf' : 'html'
      }
    } catch (e) {
      row.error = e.message.slice(0, 60)
    } finally {
      await page.close()
    }
  }
  const tag = row.kind === 'pdf' ? '📄 PDF' : row.kind === 'html' ? '🌐 html' : (row.error ? '⚠️  ' + row.error : '— none')
  console.log(`${row.name.padEnd(22)} ${tag.padEnd(10)} ${row.wine_list_url || ''}`)
  results.push(row)
}

await browser.close()
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify(results, null, 2))
const pdfs = results.filter((r) => r.kind === 'pdf').length
console.log(`\n${results.length} sites · ${pdfs} with a PDF wine list · → ${outPath}`)
