// Scrape thatsup.co.uk Stockholm guides. Restaurant detail pages live at
// /stockholm/restaurant/<slug>/ but the official website is already exposed inside
// each card on the guide page (a "Website" link), so we don't need to drill deeper.
//
//   node src/seed-from-thatsup.mjs
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'

const GUIDES = [
  'https://thatsup.co.uk/stockholm/guide/the-complete-guide-to-the-best-restaurants-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/stockholms-hottest-restaurants-right-now/',
  'https://thatsup.co.uk/stockholm/guide/new-restaurants-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-wine-bars-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/guide-to-wow-factor-restaurants-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-italian-restaurants-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-restaurants-in-sodermalm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-restaurants-in-ostermalm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-restaurants-in-the-old-town/',
  'https://thatsup.co.uk/stockholm/guide/the-best-restaurants-on-djurgarden/',
  'https://thatsup.co.uk/stockholm/guide/the-best-restaurants-for-meat-in-stockholm/',
  'https://thatsup.co.uk/stockholm/guide/the-best-tapas-restaurants-in-stockholm/',
]

const SKIP = /facebook|instagram|google|tripadvisor|bokabord|caterbook|booking|maps\.|tel:|mailto:|cookiebot|onetrust|usercentrics|cookielaw|tiktok|youtube|twitter|x\.com|linkedin|thatsup\.co|static\.thatsup/i

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0' })

const candidates = new Map() // key = normalised name, value = { name, website }
const norm = (s) => s.toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '')

for (const guide of GUIDES) {
  await page.goto(guide, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(3000)
  for (let i = 0; i < 20; i++) { await page.evaluate(() => window.scrollBy(0, 2500)); await page.waitForTimeout(300) }
  // For each restaurant heading, walk up to the card and grab the "Website" link.
  const cards = await page.evaluate((skipRe) => {
    const skip = new RegExp(skipRe, 'i')
    const out = []
    for (const h of document.querySelectorAll('h2, h3')) {
      const name = h.innerText.trim()
      if (!name || name.length > 60 || /the best|the complete|hottest|stockholm|guide|restaurants/i.test(name)) continue
      // Walk up to a reasonable card container (3 levels usually)
      let card = h.parentElement; let levels = 6
      while (card && levels-- > 0) {
        const websiteLink = [...card.querySelectorAll('a')].find((a) => /^Website$/i.test((a.innerText || '').trim()) && /^https?:/.test(a.href) && !skip.test(a.href))
        if (websiteLink) { out.push({ name, website: websiteLink.href }); break }
        card = card.parentElement
      }
    }
    return out
  }, SKIP.source)
  for (const { name, website } of cards) {
    const k = norm(name); if (!k || candidates.has(k)) continue
    candidates.set(k, { name, area: 'Stockholm', address: null, website, source: 'thatsup' })
  }
  console.log(`  ${guide.replace('https://thatsup.co.uk', '')}: cumulative ${candidates.size}`)
}
await browser.close()

await mkdir('data', { recursive: true })
await writeFile('data/thatsup-candidates.json', JSON.stringify([...candidates.values()], null, 2))
console.log(`\nWrote ${candidates.size} candidates → data/thatsup-candidates.json`)
console.log('\nSample:')
;[...candidates.values()].slice(0, 12).forEach((r) => console.log(`  ${r.name.padEnd(34)} ${r.website}`))
