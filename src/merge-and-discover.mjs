// Merge Bokabord + SWL guide finds, deduplicate against the DB (fuzzy match), and run
// the existing discovery against each new official site to find a wine-list PDF.
// Output: data/discovered-extra.json — feeds into restaurants.json for collect.
//
//   node src/merge-and-discover.mjs [--limit N]
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { db } from './lib/db.mjs'

const limitIdx = process.argv.indexOf('--limit')
const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity

// --- Load all sources -----------------------------------------------------
const swl = JSON.parse(await readFile('data/swl-candidates.json', 'utf8'))
const bok = JSON.parse(await readFile('data/bokabord-candidates.json', 'utf8'))
console.log(`Loaded ${swl.length} SWL + ${bok.length} Bokabord candidates`)

// --- Fuzzy-dedupe against the DB ------------------------------------------
const { data: existing } = await db.from('restaurants').select('name')
const normName = (s) => (s || '').toLocaleLowerCase('sv').normalize('NFKD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '').trim()

const existingKeys = new Set(existing.map((r) => normName(r.name)))
console.log(`${existingKeys.size} restaurants already in DB`)

// Combine, dedupe across sources (prefer SWL — it already has the wine-list link logic).
const seen = new Set([...existingKeys]) // start with DB names so we skip those
const combined = []
for (const src of [...swl, ...bok]) {
  if (!src.website) continue
  const cookieJunk = /cookiebot|tiktok|onetrust|usercentrics|trustpilot|cookielaw|cdn-cookieyes/i
  if (cookieJunk.test(src.website)) continue
  const k = normName(src.name)
  if (!k || seen.has(k)) continue
  seen.add(k)
  combined.push({
    name: src.name,
    area: src.area || 'Stockholm',
    address: src.address || null,
    website: src.website.replace(/[#?].*$/, '').replace(/\/$/, '/'),
    source: src.source || (src.swl_url ? 'swl' : 'bokabord'),
  })
  if (combined.length >= limit) break
}
console.log(`${combined.length} new candidate restaurants after dedupe\n`)

// --- Discovery on each new site -------------------------------------------
// Same scoring as src/discover.mjs — prefer PDFs whose URL says "vin/wine/uva",
// reject food-/lunch-/breakfast-named PDFs.
const WINE  = /vin(?!yl)|wine|dryck|dricka|uva/i
const LISTY = /lista|list|meny|menu|karta|card/i
const FOOD  = /lunch|frukost|breakfast|brunch|mat|food|tasting/i
const SKIP  = /facebook|instagram|google|bokabord|caterbook|booking|maps\.|tel:|mailto:|\.jpg|\.png|gift-card|presentkort|cookiebot|tiktok/i
const score = (href, text) => {
  const s = (text + ' ' + href).toLowerCase()
  const isPdf = /\.pdf(\?|$)/i.test(href), wine = WINE.test(s), listy = LISTY.test(s), food = FOOD.test(s)
  if (food && !wine) return -50
  let n = 0
  if (isPdf && wine) n += 100; else if (isPdf && listy) n += 40; else if (isPdf) n += 10
  if (wine && listy) n += 40; else if (wine) n += 25; else if (listy) n += 5
  if (food && wine) n -= 20
  return n
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const browser = await chromium.launch({ headless: true })

async function bestOn(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(2200)
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: (a.innerText || '').trim() })))
  return links
    .filter((l) => /^https?:/.test(l.href) && !SKIP.test(l.href))
    .map((l) => ({ ...l, s: score(l.href, l.text) }))
    .filter((l) => l.s > 10)
    .sort((a, b) => b.s - a.s)
}

const results = []
let i = 0
for (const c of combined) {
  i++
  const row = { ...c, wine_list_url: null, kind: null }
  const page = await browser.newPage({ userAgent: UA })
  try {
    let ranked = await bestOn(page, c.website)
    let pick = ranked[0]
    // If best is HTML, follow one level deeper to look for a PDF inside.
    if (pick && !/\.pdf(\?|$)/i.test(pick.href)) {
      try {
        const deeper = await bestOn(page, pick.href)
        const pdf = deeper.find((l) => /\.pdf(\?|$)/i.test(l.href))
        if (pdf) pick = pdf
        else if (deeper[0] && deeper[0].s > pick.s) pick = deeper[0]
      } catch { /* keep current pick */ }
    }
    if (pick) { row.wine_list_url = pick.href; row.kind = /\.pdf(\?|$)/i.test(pick.href) ? 'pdf' : 'html' }
  } catch (e) { row.error = e.message.slice(0, 50) } finally { await page.close() }

  const tag = row.kind === 'pdf' ? '📄 PDF' : row.kind === 'html' ? '🌐 html' : (row.error ? '⚠️ ' + row.error : '— none')
  console.log(`  ${String(i).padStart(3)}/${combined.length}  ${row.name.padEnd(32).slice(0,32)} ${tag}`)
  results.push(row)
}
await browser.close()

await writeFile('data/discovered-extra.json', JSON.stringify(results, null, 2))
const pdfs = results.filter((r) => r.kind === 'pdf')
console.log(`\n${results.length} sites · ${pdfs.length} with a PDF wine list · → data/discovered-extra.json`)
