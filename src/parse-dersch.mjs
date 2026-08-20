// Dersch — bistro on Södermalm. Sections THE SPARKLING / THE WHITE / THE RED /
// THE SWEET. Each wine = one line "[YYYY] Name, Region  TAB  glass:- / bottle:-",
// optionally followed by a description line we skip.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const text = await readFile('data/raw/dersch.txt', 'utf8')

const TYPES = { 'THE SPARKLING': 'mousserande', 'THE WHITE': 'vitt', 'THE RED': 'rött', 'THE SWEET': 'dessert' }

let type = null
const wines = []

// Wine price line: ends with "P:-" or "P:- / P:-" or "X cl P:-"
// Prices use a space as the thousands separator ("4 900:-"). The separator has to be part
// of the price token — with a bare \d{1,4} the \s+ in front of it swallows the space and
// only the last group is captured, so 4 900 became 900 and 6 000 became 0.
// Ordered alternation: try the grouped form first, fall back to plain digits.
const AMOUNT = String.raw`\d{1,3}(?:[   ]\d{3})+|\d{1,5}`
// A few rows stop at the colon or omit it entirely, so the ":-" tail is optional.
const TAIL = String.raw`\s*(?::\s*[-–]?)?`
const ROW = new RegExp(
  String.raw`^(?:(NV|N\.V\.|\d{4})\s+)?(.+?)\s+(?:(\d{1,3})\s?cl\s+)?(${AMOUNT})${TAIL}\s*(?:\/\s*(${AMOUNT})${TAIL}\s*)?$`,
)

const amount = (s) => (s == null ? null : parseFloat(s.replace(/[   ]/g, '')))

// A long wine name wraps in the PDF, leaving the price on a line that starts with the
// bottle format: "2021 Dom Drouhin-Lroze Gevrey- Chambertin En Combe" / "Magnum, Bourgogne
// 3 690:-". Without stitching those back together the wine ends up named just "Magnum".
const CONTINUATION = /^(Magnum|\d+\s*L)\b/i
let prev = null

for (const raw of text.split('\n')) {
  const line = raw.trim()
  if (!line || /^-- \d+ of/.test(line)) continue
  if (TYPES[line]) { type = TYPES[line]; prev = null; continue }
  if (!type) continue

  const m = line.match(ROW)
  if (!m) { prev = line; continue }
  let [, vint, body, glassVolStr, p1, p2] = m

  if (CONTINUATION.test(body) && prev) {
    const head = prev.match(/^(?:(NV|N\.V\.|\d{4})\s+)?(.+)$/)
    if (head) {
      vint = vint || head[1]
      body = `${head[2].trim()} – ${body}`
    }
  }
  prev = line
  // If 6cl/8cl/4cl is mentioned (small pour), treat that as glass price; otherwise pairing
  let price_glass = null, price_bottle = null
  if (p2) { price_glass = amount(p1); price_bottle = amount(p2) }
  else if (glassVolStr) { price_glass = amount(p1) } // X cl Y:- — by-the-glass small pour
  else price_bottle = amount(p1)

  // Allowing the ":-" tail to be optional lets non-price lines through: the page footer
  // "DERSCH | Tulegatan 22, Stockholm 113 53 | 08 888 935" parses as a 8 888 935:- wine.
  // Anything outside a plausible drinks-menu range is not a price, so drop the row.
  const sane = (n) => n == null || (n >= 20 && n <= 20000)
  if (!sane(price_glass) || !sane(price_bottle)) continue

  // Pull region (last comma-separated piece)
  const pieces = body.split(',').map((s) => s.trim()).filter(Boolean)
  let region = null
  let name = body.trim()
  if (pieces.length >= 2) { region = pieces[pieces.length - 1]; name = pieces.slice(0, -1).join(', ') }

  wines.push({
    name, producer: null,
    vintage: vint && /^\d{4}$/.test(vint) ? parseInt(vint, 10) : null,
    type, country: null, region, grape: null,
    price_glass, price_bottle, currency: 'SEK',
  })
}

const output = {
  restaurant: {
    name: 'Dersch', area: 'Stockholm',
    address: null,
    website: 'https://dersch.se/',
    wine_list_url: 'https://dersch.se/wp-content/uploads/2025/06/DERSCH-Meny-Dryck-pdf.pdf',
  },
  wines,
}
await mkdir('data/extracted', { recursive: true })
await writeFile('data/extracted/dersch.json', JSON.stringify(output, null, 2))
const t = {}
for (const w of wines) t[w.type] = (t[w.type] || 0) + 1
console.log(`Parsed ${wines.length} wines → data/extracted/dersch.json`)
console.log('by type:', t)
