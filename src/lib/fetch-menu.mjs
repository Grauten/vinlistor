// Fetch a restaurant menu URL into a form Claude can read.
// - PDF  → returns a base64 document block.
// - HTML → returns plain-ish text (scripts/styles/tags stripped).
// JS-rendered sites that return little text are flagged so the caller can fall
// back to Playwright (see renderWithPlaywright).

export async function fetchMenu(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (vinlistor menu collector)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`)

  const ctype = (res.headers.get('content-type') || '').toLowerCase()

  if (ctype.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const buf = Buffer.from(await res.arrayBuffer())
    return { kind: 'pdf', mediaType: 'application/pdf', base64: buf.toString('base64'), url }
  }

  const html = await res.text()
  const text = htmlToText(html)
  return { kind: 'text', text, url, thin: text.replace(/\s+/g, ' ').trim().length < 200 }
}

// Crude but dependency-free HTML → text. Good enough to feed an LLM.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&([a-z]+|#\d+);/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Optional: render a JS-heavy page with Playwright and return its text.
// Requires `npm i playwright` + `npx playwright install chromium`.
export async function renderWithPlaywright(url) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    const text = await page.evaluate(() => document.body.innerText)
    return { kind: 'text', text, url }
  } finally {
    await browser.close()
  }
}

// CLI: node src/lib/fetch-menu.mjs <url>  → prints what we'd send to Claude.
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2]
  if (!url) { console.error('usage: node src/lib/fetch-menu.mjs <url>'); process.exit(1) }
  const r = await fetchMenu(url)
  if (r.kind === 'pdf') console.log(`PDF, ${Math.round(r.base64.length / 1365)} KB base64`)
  else console.log(`TEXT (${r.text.length} chars${r.thin ? ', THIN — may need Playwright' : ''}):\n\n${r.text.slice(0, 2000)}`)
}
