// Supabase client + helpers for the vinlistor pipeline.
// Uses the SERVICE ROLE key (server-side only) so it can write freely.
import './env.mjs' // ensure .env is loaded (top-level await) before reading process.env
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
}

export const db = createClient(url, key, { auth: { persistSession: false } })

// Upsert a restaurant by unique name; returns its id.
export async function upsertRestaurant({ name, area, address, website, wine_list_url }) {
  const { data, error } = await db
    .from('restaurants')
    .upsert({ name, area, address, website, wine_list_url }, { onConflict: 'name' })
    .select('id')
    .single()
  if (error) throw new Error(`upsertRestaurant(${name}): ${error.message}`)
  return data.id
}

// Replace a restaurant's wines wholesale so prices/availability stay current.
export async function replaceWines(restaurantId, wines, sourceUrl) {
  const del = await db.from('wines').delete().eq('restaurant_id', restaurantId)
  if (del.error) throw new Error(`delete wines: ${del.error.message}`)

  if (!wines.length) return 0
  const rows = wines.map((w) => ({
    restaurant_id: restaurantId,
    name: w.name,
    producer: w.producer ?? null,
    vintage: Number.isInteger(w.vintage) ? w.vintage : null,
    type: w.type ?? null,
    country: w.country ?? null,
    region: w.region ?? null,
    grape: w.grape ?? null,
    price_glass: w.price_glass ?? null,
    price_bottle: w.price_bottle ?? null,
    currency: w.currency || 'SEK',
    source_url: sourceUrl ?? null,
  }))
  const ins = await db.from('wines').insert(rows)
  if (ins.error) throw new Error(`insert wines: ${ins.error.message}`)
  return rows.length
}
