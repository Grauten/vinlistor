// CLI for searching the wine database.
//
//   npm run search -- --q barolo
//   npm run search -- --type rött --max 400 --sort asc
//   npm run search -- --area Östermalm --by glass --sort desc --limit 10
//   npm run search -- --restaurant astrids --q nebbiolo
//
// Flags: --q --type --area --restaurant --min --max --by glass|bottle
//        --sort asc|desc --limit
import { searchWines } from './lib/search.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const key = a.slice(2)
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    opt[key] = val
  }
}

const o = {
  q: opt.q, type: opt.type, area: opt.area, restaurant: opt.restaurant,
  by: opt.by === 'glass' ? 'glass' : 'bottle',
  sort: opt.sort === 'desc' ? 'desc' : 'asc',
  min: opt.min != null ? Number(opt.min) : undefined,
  max: opt.max != null ? Number(opt.max) : undefined,
  limit: opt.limit != null ? Number(opt.limit) : 25,
}

const rows = await searchWines(o)
const priceCol = o.by === 'glass' ? 'price_glass' : 'price_bottle'

if (!rows.length) {
  console.log('Inga träffar.')
} else {
  console.log(`${rows.length} träff(ar) — pris = ${o.by === 'glass' ? 'glas' : 'flaska'}, sorterat ${o.sort}:\n`)
  console.table(rows.map((w) => ({
    pris: w[priceCol] != null ? `${w[priceCol]} ${w.currency}` : '—',
    vin: w.name,
    årg: w.vintage ?? '',
    typ: w.type ?? '',
    region: w.region ?? w.country ?? '',
    restaurang: `${w.restaurant} (${w.area})`,
  })))
}
