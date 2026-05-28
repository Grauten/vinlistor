// Scrape Bokabord's curated wine-bar guide(s) for Stockholm to find more restaurant
// candidates. Bokabord links to its own /restaurang/<slug> pages, not the official
// site, so we drill one level deeper to extract each restaurant's homepage URL.
//
//   node src/seed-from-bokabord.mjs
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const GUIDES = [
  'https://www.bokabord.se/guider/stockholms-basta-vinbarer-just-nu',
  'https://www.bokabord.se/guider/nya-restauranger-i-stockholm',
  'https://www.bokabord.se/guider/restaurangtips-stockholm-10-restauranger-du-inte-far-missa',
  'https://www.bokabord.se/guider/harliga-sommarrestauranger-i-stockholm',
  'https://www.bokabord.se/guider/guide-till-basta-restaurangerna-i-vasastan-stockholm',
  'https://www.bokabord.se/guider/restauranger-som-passar-for-storre-sallskap-i-stockholm',
  'https://www.bokabord.se/guider/guide-till-soliga-pontoner-i-stockholm',
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const SKIP = /facebook|instagram|google|tripadvisor|bokabord|caterbook|booking\.|easytable|tablesource|maps\.|tel:|mailto:|cookiebot|onetrust|usercentrics|cookielaw|trustarc|cdn-cookieyes|trustpilot|youtube\.com|twitter\.com|x\.com|linkedin/i

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ userAgent: UA })

// Step 1 — collect all /restaurang/<slug> URLs from each guide page
console.log('Sweeping Bokabord guides…')
const restURLs = new Map() // bokabordURL → displayName
for (const guide of GUIDES) {
  await page.goto(guide, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(3000)
  // Scroll to load lazy content
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500))
    await page.waitForTimeout(600)
  }
  const links = await page.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll('a[href*="/restaurang/"]')) {
      const href = a.href
      // Find the nearest heading text as the display name
      let name = ''
      const card = a.closest('article, div, section, li, .card, [class*="card"]')
      if (card) {
        const h = card.querySelector('h1, h2, h3, h4')
        if (h) name = h.innerText.trim()
      }
      out.push({ href, name })
    }
    return out
  })
  for (const { href, name } of links) {
    if (!restURLs.has(href) && name) restURLs.set(href, name)
    else if (!restURLs.has(href)) restURLs.set(href, '') // record even if no name yet
  }
  console.log(`  ${guide.replace('https://www.bokabord.se', '')}: cumulative ${restURLs.size} restaurants`)
}

console.log(`\n${restURLs.size} unique Bokabord pages. Drilling for official sites…`)

const out = []
let i = 0
for (const [bokabordURL, hintedName] of restURLs) {
  i++
  try {
    await page.goto(bokabordURL, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(1800)
    const info = await page.evaluate((skipRe) => {
      const skip = new RegExp(skipRe, 'i')
      const name = document.querySelector('h1')?.innerText?.trim() || ''
      const addrMatch = document.body.innerText.match(/Adress[\s\S]*?\n([^\n]+)/i)
      const address = addrMatch ? addrMatch[1].trim() : null
      // The official site link on a Bokabord page is the one whose VISIBLE TEXT looks
      // like a domain ("www.example.se/" / "example.com") — much more reliable than
      // "first non-blacklisted link", which catches cookie / footer / social links.
      const URL_TEXT = /^\s*(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+\/?\s*$/i
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.href,
        text: (a.innerText || '').trim(),
      }))
      let website = links.find((l) => URL_TEXT.test(l.text) && /^https?:/.test(l.href) && !skip.test(l.href))?.href
        || links.find((l) => /^https?:/.test(l.href) && !skip.test(l.href) && !l.href.includes(location.origin))?.href
      return { name, address, website }
    }, SKIP.source)
    const finalName = info.name || hintedName
    if (!finalName || !info.website) continue
    out.push({ name: finalName, area: 'Stockholm', address: info.address, website: info.website, source: 'bokabord' })
    process.stdout.write(`\r  ${i}/${restURLs.size}  +${out.length} sites…`)
  } catch (e) {
    process.stdout.write(`\r  ${i}/${restURLs.size}  err ${bokabordURL.slice(-30)}            `)
  }
}
console.log('')

await browser.close()

const outPath = 'data/bokabord-candidates.json'
await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify(out, null, 2))
console.log(`\nWrote ${out.length} candidates → ${outPath}`)
console.log('\nSample:')
out.slice(0, 10).forEach((r) => console.log(`  ${r.name.padEnd(28)} ${r.website}`))
