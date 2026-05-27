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
  const PAGE = 1000
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('wines').select(COLS).range(from, from + PAGE - 1)
    if (error) return res.status(500).json({ error: error.message })
    all.push(...data)
    if (data.length < PAGE) break
  }

  // Stable canonical wine key — producer + name with vintages stripped, lowercased and
  // de-diacriticked. Same key across restaurants/vintages = the same cuvée.
  const PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Cantine?|Cantina|Tenuta|Casa|Weingut|Maison|Cellier|Cellars?|Azienda Agricola|Az\.|Fattoria|Champagne|Vignobles?|Vignerons?|Quinta|Adega|Mas)\s+/i
  const canon = (s) => (s || '').replace(PREFIX, '').toLocaleLowerCase('sv')
    .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

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
    wine_key: w.producer ? canon(w.producer) + '||' + canon(w.name) : null,
  }))

  // Cache aggressively at the edge — wine lists change on the order of weeks.
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=3600')
  res.status(200).json({ wines, count: wines.length })
}
