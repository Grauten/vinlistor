// Fetch a restaurant menu URL into a form Claude can read.
// - PDF  → returns { kind: 'pdf', url }. We do NOT download the bytes; the Claude
//   API fetches the URL itself (document url source). This keeps our request body
//   tiny — uploading a large base64 PDF was unreliable over the local network.
// - HTML → returns plain-ish text (scripts/styles/tags stripped).
// JS-rendered sites that return little text are flagged so the caller can fall
// back to Playwright (see renderWithPlaywright).

export async function fetchMenu(url) {
  // Cheap HEAD first to learn the content type without downloading a PDF.
  let ctype = ''
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA } })
    ctype = (head.headers.get('content-type') || '').toLowerCase()
  } catch { /* some servers reject HEAD — fall through to GET */ }

  if (ctype.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    return { kind: 'pdf', url }
  }

  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`)
  if ((res.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) {
    return { kind: 'pdf', url }
  }

  const html = await res.text()
  const text = htmlToText(html)
  return { kind: 'text', text, url, thin: text.replace(/\s+/g, ' ').trim().length < 200 }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

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
  if (r.kind === 'pdf') console.log(`PDF (Claude fetches via url): ${r.url}`)
  else console.log(`TEXT (${r.text.length} chars${r.thin ? ', THIN — may need Playwright' : ''}):\n\n${r.text.slice(0, 2000)}`)
}
