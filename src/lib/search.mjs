// Reusable wine search over the Supabase database.
// Returns rows joined with their restaurant. A future web UI can import this too.
import { db } from './db.mjs'

const COLS = 'name, producer, vintage, type, country, region, grape, price_glass, price_bottle, currency, restaurants!inner(name, area)'

/**
 * Search wines.
 * @param {object} o
 * @param {string} [o.q]          free text — matches name / producer / region / grape / country
 * @param {string} [o.type]       wine type (rött, vitt, mousserande, …)
 * @param {string} [o.area]       restaurant area (stadsdel), partial match
 * @param {string} [o.restaurant] restaurant name, partial match
 * @param {number} [o.min]        min price (on the chosen price field)
 * @param {number} [o.max]        max price
 * @param {'glass'|'bottle'} [o.by='bottle']  which price to filter/sort on
 * @param {'asc'|'desc'} [o.sort='asc']       sort direction
 * @param {number} [o.limit=25]
 */
export async function searchWines(o = {}) {
  const by = o.by === 'glass' ? 'price_glass' : 'price_bottle'
  let query = db.from('wines').select(COLS)

  if (o.q) {
    const esc = o.q.replace(/[%,]/g, ' ')
    query = query.or(['name', 'producer', 'region', 'grape', 'country'].map((c) => `${c}.ilike.%${esc}%`).join(','))
  }
  if (o.type) query = query.ilike('type', o.type)
  if (o.area) query = query.ilike('restaurants.area', `%${o.area}%`)
  if (o.restaurant) query = query.ilike('restaurants.name', `%${o.restaurant}%`)
  if (o.min != null) query = query.gte(by, o.min)
  if (o.max != null) query = query.lte(by, o.max)
  // Only rows that actually have the price we're filtering/sorting on.
  if (o.min != null || o.max != null || o.sort) query = query.not(by, 'is', null)

  query = query.order(by, { ascending: (o.sort ?? 'asc') === 'asc', nullsFirst: false })
              .limit(o.limit ?? 25)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data.map((w) => ({
    name: w.name, producer: w.producer, vintage: w.vintage, type: w.type,
    region: w.region, country: w.country, grape: w.grape,
    price_glass: w.price_glass, price_bottle: w.price_bottle, currency: w.currency,
    restaurant: w.restaurants?.name, area: w.restaurants?.area,
  }))
}
