import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Normalising a string is expensive (toLocaleLowerCase + NFKD + regex), so every value we
// search or sort on is normalised ONCE in prepare() when the data arrives. The hot paths
// below only ever read the precomputed `_`-prefixed fields.
const NORM = (s) => (s ?? '').toString().toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '')

// One shared collator. Calling String.prototype.localeCompare inside the comparator
// dominated sort time once the table passed a few thousand rows.
const COLLATOR = new Intl.Collator('sv', { numeric: true })

function prepare(wines) {
  for (const w of wines) {
    w._hay = NORM([w.name, w.producer, w.region, w.country, w.grape].filter(Boolean).join(' '))
    w._country = NORM(w.country)
    w._region = NORM(w.region)
    w._producer = NORM(w.producer)
    w._wine_key = NORM(w.wine_key)
    w._restaurant = NORM(w.restaurant)
    w._name = NORM(w.name)
  }
  return wines
}

// wine_key + vintage as tail keys keeps "same wine, different vintages" together.
const SORTS = {
  origin:     { label: 'land → region → producent', keys: ['_country', '_region', '_producer', '_wine_key', 'vintage'] },
  price_asc:  { label: 'flaskpris stigande',        keys: ['price_bottle', 'price_glass', '_wine_key'], dir: 1 },
  price_desc: { label: 'flaskpris fallande',        keys: ['price_bottle', 'price_glass', '_wine_key'], dir: -1 },
  glass_asc:  { label: 'glaspris stigande',         keys: ['price_glass', 'price_bottle', '_wine_key'], dir: 1 },
  glass_desc: { label: 'glaspris fallande',         keys: ['price_glass', 'price_bottle', '_wine_key'], dir: -1 },
  name:       { label: 'vinets namn',               keys: ['_wine_key', 'vintage', '_name'] },
  restaurant: { label: 'restaurang',                keys: ['_restaurant', '_country', '_region', '_producer', '_wine_key', 'vintage'] },
}

// How many rows go into the DOM at once. The whole result set stays in memory and is
// counted; putting all 25k <tr> on the page froze it for seconds on every keystroke.
const CHUNK = 200

function cmp(a, b, dir = 1) {
  // null/undefined sort to the end regardless of direction
  const an = a == null || a === ''
  const bn = b == null || b === ''
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return COLLATOR.compare(a, b) * dir
}

function sortRows(rows, key) {
  const cfg = SORTS[key]
  const dir = cfg.dir ?? 1
  return [...rows].sort((x, y) => {
    for (const k of cfg.keys) {
      const c = cmp(x[k], y[k], dir)
      if (c) return c
    }
    return 0
  })
}

const formatPrice = (n) => (n == null ? '—' : `${n.toLocaleString('sv-SE')}`)

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')      // what the input shows — updates on every keystroke
  const [dq, setDq] = useState('')    // what we filter on — trails `q` so typing stays smooth
  const [type, setType] = useState('')
  const [area, setArea] = useState('')
  const [restaurant, setRestaurant] = useState('')
  const [sortKey, setSortKey] = useState('origin')
  const [glassOnly, setGlassOnly] = useState(false)
  const [visible, setVisible] = useState(CHUNK)

  useEffect(() => {
    fetch('/api/wines')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((j) => setData(prepare(j.wines)))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 150)
    return () => clearTimeout(t)
  }, [q])

  const facets = useMemo(() => {
    if (!data) return { types: [], areas: [], restaurants: [] }
    const types = [...new Set(data.map((w) => w.type).filter(Boolean))].sort()
    const areas = [...new Set(data.map((w) => w.area).filter(Boolean))].sort()
    const restaurants = [...new Set(data.map((w) => w.restaurant).filter(Boolean))].sort()
    return { types, areas, restaurants }
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const nq = NORM(dq.trim())
    return data.filter((w) => {
      if (type && w.type !== type) return false
      if (area && w.area !== area) return false
      if (restaurant && w.restaurant !== restaurant) return false
      if (glassOnly && w.price_glass == null) return false
      return !nq || w._hay.includes(nq)
    })
  }, [data, dq, type, area, restaurant, glassOnly])

  const rows = useMemo(() => sortRows(filtered, sortKey), [filtered, sortKey])

  // Any change to the result set starts the window over at the top.
  useEffect(() => { setVisible(CHUNK) }, [rows])

  // Grow the window when the sentinel below the table scrolls into view.
  const observer = useRef(null)
  const sentinelRef = useCallback((node) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible((v) => v + CHUNK) },
      { rootMargin: '600px' },
    )
    observer.current.observe(node)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])

  if (error) return <div className="state">Kunde inte ladda viner: {error}</div>
  if (!data) return <div className="state">Laddar vinlistor…</div>

  const shown = rows.slice(0, visible)

  return (
    <div className="app">
      <header>
        <h1>🍷 Stockholms vinlistor</h1>
        <input
          type="search"
          className="search"
          placeholder="Sök vin, producent, region…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </header>

      <div className="controls">
        <Select label="Typ" value={type} onChange={setType} options={facets.types} />
        <Select label="Stadsdel" value={area} onChange={setArea} options={facets.areas} />
        <Select label="Krog" value={restaurant} onChange={setRestaurant} options={facets.restaurants} />
        <label className="glass-only">
          <input type="checkbox" checked={glassOnly} onChange={(e) => setGlassOnly(e.target.checked)} />
          &nbsp;endast på glas
        </label>
        <label className="sort">
          Sortera:&nbsp;
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <span className="count">{rows.length.toLocaleString('sv-SE')} av {data.length.toLocaleString('sv-SE')}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Land</th>
              <th>Region</th>
              <th>Producent</th>
              <th>Vin</th>
              <th>Årg.</th>
              <th>Typ</th>
              <th className="num">Glas</th>
              <th className="num">Flaska</th>
              <th>Krog</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((w, i) => (
              <tr key={i}>
                <td>{w.country || '—'}</td>
                <td>{w.region || '—'}</td>
                <td>{w.producer || '—'}</td>
                <td className="wine">{w.name}{w.grape ? <span className="grape"> · {w.grape}</span> : null}</td>
                <td className="num small">{w.vintage ?? ''}</td>
                <td className="small">{w.type ?? ''}</td>
                <td className="num">{formatPrice(w.price_glass)}</td>
                <td className="num">{formatPrice(w.price_bottle)}</td>
                <td className="restaurant">{w.restaurant}<span className="area"> · {w.area}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="state">Inga träffar.</div>}
        {visible < rows.length && (
          // The observer extends the list on scroll; the button is the explicit path for
          // anyone it doesn't reach (keyboard, reduced-motion, observer unsupported).
          <button className="more" ref={sentinelRef} onClick={() => setVisible((v) => v + CHUNK)}>
            visar {shown.length.toLocaleString('sv-SE')} av {rows.length.toLocaleString('sv-SE')} — visa fler
          </button>
        )}
      </div>

      <footer>
        Pilot · {facets.restaurants.length} restauranger · priser i SEK · senast inhämtad data visas
      </footer>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label>
      {label}:&nbsp;
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">alla</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
