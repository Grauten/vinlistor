// Shared post-import normalisation for wines: country, region, producer.
// Each function rewrites the DB in place; returns count of rows updated.
// Run after any load-from-json or collect to keep the dataset canonical.
import { db } from './db.mjs'

// ── Countries ───────────────────────────────────────────────────────────────
export const COUNTRY_MAP = {
  France: 'Frankrike', Italy: 'Italien', Spain: 'Spanien', Germany: 'Tyskland',
  Austria: 'Österrike', 'South Africa': 'Sydafrika', Australia: 'Australien',
  Sweden: 'Sverige', Greece: 'Grekland', Hungary: 'Ungern',
  'New Zealand': 'Nya Zeeland', Switzerland: 'Schweiz', 'United Kingdom': 'England',
  'Czech Republic': 'Tjeckien', Czechia: 'Tjeckien', Slovakia: 'Slovakien',
  Lebanon: 'Libanon', Moldova: 'Moldavien', Georgia: 'Georgien',
  Palestine: 'Palestina', Slovenia: 'Slovenien', Cyprus: 'Cypern',
}
export async function normalizeCountries() {
  let total = 0
  for (const [from, to] of Object.entries(COUNTRY_MAP)) {
    if (from === to) continue
    const { error, count } = await db.from('wines').update({ country: to }, { count: 'exact' }).eq('country', from)
    if (error) throw new Error(`country ${from}: ${error.message}`)
    total += count || 0
  }
  return total
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const PRODUCER_PREFIX = /^(Domaine|Château|Chateau|Bodegas?|Bodega|Cantine?|Cantina|Tenuta|Casa|Casas|Weingut|Maison|Cellier|Cellars?|Cellar|Azienda Agricola|Az\.|Fattoria|Champagne|Vignobles?|Vignerons?|Vigna|Estate|Family|Wines|Caves?|Quinta|Adega|Mas)\s+/i
const REGION_PREFIX = /^(DO|DOCG?|AOC|IGP|IGT|AVA)\s+/i

const canonKey = (s, prefix) => s.replace(prefix, '').toLocaleLowerCase('sv')
  .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const hasFancyChars = (s) => /[ÀÁÂÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜßàáâäåæçèéêëìíîïñòóôõöøùúûüÿ\-]/.test(s)

// Generic canonicaliser used for both producer and region.
async function canonicaliseField(field, prefix) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('wines').select(`id, ${field}`).range(from, from + 999)
    if (error) throw new Error(`load: ${error.message}`)
    all.push(...data); if (data.length < 1000) break
  }

  // canonical key → variant → count
  const groups = new Map()
  for (const w of all) {
    const v = w[field]; if (!v) continue
    const k = canonKey(v, prefix); if (k.length < 3) continue
    if (!groups.has(k)) groups.set(k, new Map())
    const m = groups.get(k); m.set(v, (m.get(v) || 0) + 1)
  }
  // Pick display: most common, prefer fancy chars (more info), longest, alphabetical.
  const rename = new Map()
  for (const variants of groups.values()) {
    if (variants.size === 1) continue
    const sorted = [...variants.entries()].sort((a, b) =>
      b[1] - a[1] ||
      (hasFancyChars(b[0]) ? 1 : 0) - (hasFancyChars(a[0]) ? 1 : 0) ||
      b[0].length - a[0].length ||
      a[0].localeCompare(b[0], 'sv'))
    const winner = sorted[0][0]
    for (const [v] of variants) if (v !== winner) rename.set(v, winner)
  }

  let updated = 0
  for (const [oldName, newName] of rename) {
    const { error, count } = await db.from('wines').update({ [field]: newName }, { count: 'exact' }).eq(field, oldName)
    if (error) throw new Error(`${field} ${oldName}: ${error.message}`)
    updated += count || 0
  }
  return updated
}

export const normalizeProducers = () => canonicaliseField('producer', PRODUCER_PREFIX)
export const normalizeRegions   = () => canonicaliseField('region',   REGION_PREFIX)

// Convenience: run them all.
export async function normalizeAll() {
  const c = await normalizeCountries(); console.log(`  countries: ${c} rows updated`)
  const r = await normalizeRegions();   console.log(`  regions:   ${r} rows updated`)
  const p = await normalizeProducers(); console.log(`  producers: ${p} rows updated`)
  return c + r + p
}
