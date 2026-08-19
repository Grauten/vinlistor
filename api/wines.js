// Vercel serverless: returns all wines + restaurant info.
// The frontend caches the full set and does filtering/sorting/search client-side
// (≈1k rows = trivial in the browser; saves a round-trip per keystroke).
// Service-role key stays here on the server.
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 15 }

const COLS = 'name, producer, vintage, type, country, region, grape, price_glass, price_bottle, currency, restaurants!inner(name, area)'

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Server missing Supabase credentials.' })

  const db = createClient(url, key, { auth: { persistSession: false } })
  // Pull in batches because PostgREST caps a single request at 1000 rows by default.
  // Ask for the row count first so the batches can go out together — fetching them in
  // sequence meant 25 round-trips to Supabase and put the response near maxDuration.
  const PAGE = 1000
  const head = await db.from('wines').select('*', { count: 'exact', head: true })
  if (head.error) return res.status(500).json({ error: head.error.message })

  const pages = await Promise.all(
    Array.from({ length: Math.ceil(head.count / PAGE) }, (_, i) =>
      db.from('wines').select(COLS).range(i * PAGE, i * PAGE + PAGE - 1)),
  )
  const failed = pages.find((p) => p.error)
  if (failed) return res.status(500).json({ error: failed.error.message })
  const all = pages.flatMap((p) => p.data)

  // Token-set wine key. Same key = same cuvée regardless of vintage, word order, or
  // small text variations across restaurants. Strategy:
  //   1. Strip producer-noun prefix from producer, vintages from name
  //   2. Split into tokens (lower, no diacritics, no punctuation; separate digits from letters)
  //   3. Drop generic "filler" tokens (cuvée, édition, magnum, reims, NV, …) and tiny ones
  //   4. Bag = sorted unique remaining tokens from producer ∪ name
  const PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Cantine?|Cantina|Tenuta|Casa|Weingut|Maison|Cellier|Cellars?|Azienda Agricola|Az\.|Fattoria|Champagne|Vignobles?|Vignerons?|Quinta|Adega|Mas)\s+/i
  const FILLER = new Set([
    'cuvee','grand','grande','edition','editions','eme','iere','ier','er',
    'magnum','mag','jeroboam','mgn','mgm','ml','cl','fl',
    'nv','mv','sa','brut','extra','dry',                  // generic champagne descriptors
    'reims','epernay','ay','cramant','vertus','avize',     // champagne towns
    'de','la','le','les','du','et','di','del','della','das','do','von','y',
  ])
  const tokenise = (s) => (s || '')
    .replace(PREFIX, '')
    .toLocaleLowerCase('sv')
    .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/(\d)([a-z])|([a-z])(\d)/g, '$1$3 $2$4') // separate "173ème" → "173 eme"
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !FILLER.has(t))

  const wineKey = (producer, name) => {
    const all = new Set([...tokenise(producer), ...tokenise(name)])
    return all.size ? [...all].sort().join(' ') : null
  }

  // Flatten the joined restaurant for the client.
  const wines = all.map((w) => ({
    name: w.name,
    producer: w.producer,
    vintage: w.vintage,
    type: w.type,
    country: w.country,
    region: w.region,
    grape: w.grape,
    price_glass: w.price_glass,
    price_bottle: w.price_bottle,
    currency: w.currency || 'SEK',
    restaurant: w.restaurants?.name,
    area: w.restaurants?.area,
    wine_key: wineKey(w.producer, w.name),
  }))

  // Cache aggressively at the edge — wine lists change on the order of weeks.
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=3600')
  res.status(200).json({ wines, count: wines.length })
}
