import { useEffect, useMemo, useState } from 'react'

const SORTS = {
  origin:     { label: 'land → region → producent', keys: ['country', 'region', 'producer', 'name'] },
  price_asc:  { label: 'pris stigande',             keys: ['price_bottle', 'price_glass', 'name'], dir: 1 },
  price_desc: { label: 'pris fallande',             keys: ['price_bottle', 'price_glass', 'name'], dir: -1 },
  name:       { label: 'vinets namn',               keys: ['name', 'producer'] },
  restaurant: { label: 'restaurang',                keys: ['restaurant', 'country', 'region', 'producer'] },
}

const NORM = (s) => (s ?? '').toString().toLocaleLowerCase('sv').normalize('NFKD').replace(/\p{Diacritic}/gu, '')

function cmp(a, b, dir = 1) {
  // null/undefined sort to the end regardless of direction
  const an = a == null || a === ''
  const bn = b == null || b === ''
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return NORM(a).localeCompare(NORM(b), 'sv') * dir
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
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [area, setArea] = useState('')
  const [restaurant, setRestaurant] = useState('')
  const [sortKey, setSortKey] = useState('origin')

  useEffect(() => {
    fetch('/api/wines')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((j) => setData(j.wines))
      .catch((e) => setError(e.message))
  }, [])

  const facets = useMemo(() => {
    if (!data) return { types: [], areas: [], restaurants: [] }
    const types = [...new Set(data.map((w) => w.type).filter(Boolean))].sort()
    const areas = [...new Set(data.map((w) => w.area).filter(Boolean))].sort()
    const restaurants = [...new Set(data.map((w) => w.restaurant).filter(Boolean))].sort()
    return { types, areas, restaurants }
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const nq = NORM(q.trim())
    return data.filter((w) => {
      if (type && w.type !== type) return false
      if (area && w.area !== area) return false
      if (restaurant && w.restaurant !== restaurant) return false
      if (!nq) return true
      const hay = NORM([w.name, w.producer, w.region, w.country, w.grape].filter(Boolean).join(' '))
      return hay.includes(nq)
    })
  }, [data, q, type, area, restaurant])

  const rows = useMemo(() => sortRows(filtered, sortKey), [filtered, sortKey])

  if (error) return <div className="state">Kunde inte ladda viner: {error}</div>
  if (!data) return <div className="state">Laddar vinlistor…</div>

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
            {rows.map((w, i) => (
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
