import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── style helpers ─────────────────────────────────────────────────────────────
const S = {
  th: { padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: '#0a0f18', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', fontSize: 12, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' },
  panel: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  sec: { fontSize: 10, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em' },
  inp: { background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
}

const fmt$ = (n) => `$${parseFloat(n || 0).toFixed(2)}`
const fmtPct = (n) => `${parseFloat(n || 0).toFixed(1)}%`

// ── cat color map (design palette — not data) ─────────────────────────────────
const CAT_COLORS = {
  Massage: '#00e5ff', Intimacy: '#7c4dff', Apparel: '#ff4d7d',
  Accessories: '#ff9800', Lubricants: '#2ad6a0', Toys: '#2979ff',
  Wellness: '#4caf50', Novelty: '#ffb800',
}
const CAT_BG = {
  Massage: 'rgba(0,229,255,0.1)', Intimacy: 'rgba(124,77,255,0.1)', Apparel: 'rgba(255,77,125,0.1)',
  Accessories: 'rgba(255,152,0,0.1)', Lubricants: 'rgba(42,214,160,0.1)', Toys: 'rgba(41,121,255,0.1)',
  Wellness: 'rgba(76,175,80,0.1)', Novelty: 'rgba(255,184,0,0.1)',
}

function CatBadge({ cat }) {
  if (!cat) return null
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', padding: '2px 7px',
      background: CAT_BG[cat] || 'rgba(255,255,255,0.06)',
      border: `1px solid ${CAT_COLORS[cat] || 'var(--t-line)'}`,
      color: CAT_COLORS[cat] || 'var(--t-text-muted)',
    }}>{cat}</span>
  )
}

function StatusBadge({ status }) {
  const map = {
    active: { bg: 'rgba(42,214,160,0.1)', border: 'rgba(42,214,160,0.35)', color: '#2ad6a0', label: 'Active' },
    'out-of-stock': { bg: 'rgba(255,77,125,0.1)', border: 'rgba(255,77,125,0.35)', color: '#ff4d7d', label: 'Out of Stock' },
    'special-order': { bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.35)', color: '#ffb800', label: 'Special Order' },
    discontinued: { bg: 'rgba(100,100,100,0.1)', border: 'rgba(100,100,100,0.35)', color: '#888', label: 'Discontinued' },
  }
  const m = map[status] || map.active
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>{m.label}</span>
  )
}

// ── drill-down columns for product records (all fields real) ──────────────────
const PRODUCT_COLS = [
  { key: 'sku', label: 'SKU', value: p => p.sku },
  { key: 'name', label: 'Product', value: p => p.name },
  { key: 'cat', label: 'Category', value: p => p.cat || '—' },
  { key: 'status', label: 'Status', value: p => p.status },
  { key: 'retail', label: 'Price', value: p => fmt$(p.retail), align: 'right', sortKey: p => p.retail },
  { key: 'cost', label: 'Cost', value: p => fmt$(p.cost), align: 'right', sortKey: p => p.cost },
  { key: 'margin', label: 'Margin %', value: p => fmtPct(p.margin), align: 'right', sortKey: p => p.margin },
  { key: 'totalStock', label: 'On Hand', value: p => p.totalStock, align: 'right', sortKey: p => p.totalStock },
]

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Product image placeholder ─────────────────────────────────────────────────
function ImgBox({ cat, size = 72 }) {
  const icons = { Massage: '💆', Intimacy: '🎲', Apparel: '👗', Accessories: '🔗', Lubricants: '💧', Toys: '⚡', Wellness: '🌿', Novelty: '🎀' }
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      background: CAT_BG[cat] || 'rgba(255,255,255,0.04)',
      border: `1px solid var(--t-line)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38,
    }}>{icons[cat] || '🏷️'}</div>
  )
}

// ── PRODUCT DETAIL PANEL (all values real; no fabricated velocity) ────────────
function DetailPanel({ product, allProducts, catSales, onClose }) {
  const upsells = (product.upsellPairs || []).map(sku => allProducts.find(p => p.sku === sku)).filter(Boolean)
  const marginDollar = (product.retail - product.cost).toFixed(2)
  const locEntries = Object.entries(product.locStock || {})
  const catStat = catSales[product.cat] || null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ background: '#0a0f18', borderLeft: '1px solid var(--t-line)', width: '100%', maxWidth: 480, height: '100%', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: '#0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Product Detail</div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: '18px 18px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Identity */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <ImgBox cat={product.cat} size={80} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1.25, marginBottom: 6 }}>{product.name}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <CatBadge cat={product.cat} />
                <StatusBadge status={product.status} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>SKU: {product.sku}</div>
            </div>
          </div>

          {/* Price breakdown */}
          <div style={S.panel}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>Price Breakdown</div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Cost', value: fmt$(product.cost), color: 'var(--t-text-muted)' },
                { label: 'MSRP', value: product.msrp ? fmt$(product.msrp) : '—', color: 'var(--t-text-muted)' },
                { label: 'Our Price', value: fmt$(product.retail), color: 'var(--t-accent)' },
                { label: 'Margin $', value: `$${marginDollar}`, color: '#2ad6a0' },
                { label: 'Margin %', value: fmtPct(product.margin), color: product.margin >= 50 ? '#2ad6a0' : product.margin >= 40 ? '#ffb800' : '#ff4d7d' },
                { label: 'Competitor Price', value: product.comp ? fmt$(product.comp) : '—', color: 'var(--t-text-muted)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-location stock (real) */}
          <div style={S.panel}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>Stock by Location</div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {locEntries.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No stock records for the locations in scope.</div>
              )}
              {locEntries.map(([loc, qty]) => (
                <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text)', minWidth: 130 }}>{loc}</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, qty * 3.3)}%`, background: qty === 0 ? 'var(--t-danger)' : qty < 5 ? 'var(--t-warn)' : 'var(--t-accent)' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: qty === 0 ? 'var(--t-danger)' : qty < 5 ? 'var(--t-warn)' : 'var(--t-text)', minWidth: 28, textAlign: 'right' }}>{qty}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Catalog info (real) */}
          <div style={S.panel}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>Catalog Info</div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Total On Hand', value: `${product.totalStock} units` },
                { label: 'Status', value: product.status === 'out-of-stock' ? 'Reorder now' : product.totalStock < 8 ? 'Low — monitor' : 'Sufficient', color: product.status === 'out-of-stock' ? 'var(--t-danger)' : 'var(--t-text)' },
                { label: 'Added to Catalog', value: product.addedDate || '—' },
                { label: 'Category 30d Units', value: catStat ? `${catStat.units} (all ${product.cat})` : '—' },
                { label: 'Category Velocity', value: catStat ? `${catStat.velocity}/wk (all ${product.cat})` : '—' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.color || 'var(--t-text)' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upsell pairs (real, only if configured) */}
          {upsells.length > 0 && (
            <div style={S.panel}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>Upsell Pairs</div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>
                  Pair this product with the following for higher basket value:
                </div>
                {upsells.map(u => (
                  <div key={u.sku} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(0,229,255,0.04)', border: '1px solid var(--t-line)' }}>
                    <ImgBox cat={u.cat} size={32} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{fmt$(u.retail)} · {u.sku}</div>
                    </div>
                    <CatBadge cat={u.cat} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CATALOG TAB ───────────────────────────────────────────────────────────────
function CatalogTab({ products, cats, catSales }) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priceRange, setPriceRange] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState(null)

  const priceRanges = { All: null, 'Under $15': [0, 15], '$15–$30': [15, 30], '$30–$50': [30, 50], 'Over $50': [50, 1e9] }

  const filtered = useMemo(() => {
    let list = [...products]
    if (catFilter !== 'All') list = list.filter(p => p.cat === catFilter)
    if (statusFilter !== 'All') list = list.filter(p => p.status === statusFilter)
    const pr = priceRanges[priceRange]
    if (pr) list = list.filter(p => p.retail >= pr[0] && p.retail < pr[1])
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      let av = sortBy === 'name' ? a.name : sortBy === 'price' ? a.retail : sortBy === 'margin' ? a.margin : a.totalStock
      let bv = sortBy === 'name' ? b.name : sortBy === 'price' ? b.retail : sortBy === 'margin' ? b.margin : b.totalStock
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [products, catFilter, statusFilter, priceRange, search, sortBy, sortDir])

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }
  const sortIcon = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ·'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-faint)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, category…" style={{ ...S.inp, paddingLeft: 28, width: '100%' }} />
        </div>
        {[{ label: 'Category', val: catFilter, set: setCatFilter, opts: ['All', ...cats] },
          { label: 'Status', val: statusFilter, set: setStatusFilter, opts: ['All', 'active', 'out-of-stock', 'special-order', 'discontinued'] },
          { label: 'Price', val: priceRange, set: setPriceRange, opts: Object.keys(priceRanges) },
        ].map(f => (
          <select key={f.label} value={f.val} onChange={e => f.set(e.target.value)} style={{ ...S.inp }}>
            {f.opts.map(o => <option key={o} value={o}>{f.label === 'Status' && o !== 'All' ? ({ active: 'Active', 'out-of-stock': 'Out of Stock', 'special-order': 'Special Order', discontinued: 'Discontinued' }[o] || o) : o}</option>)}
          </select>
        ))}
      </div>

      {/* Sort row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sort:</span>
        {[['name', 'Name'], ['price', 'Price'], ['margin', 'Margin'], ['totalStock', 'Stock']].map(([key, label]) => (
          <button key={key} onClick={() => toggleSort(key)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: sortBy === key ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${sortBy === key ? 'var(--t-accent)' : 'var(--t-line)'}`, color: sortBy === key ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em' }}>
            {label}{sortIcon(key)}
          </button>
        ))}
        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 8 }}>{filtered.length} of {products.length} products</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ ...S.panel, padding: '40px 16px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No products match these filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map(p => (
            <div key={p.sku} onClick={() => setSelected(p)}
              style={{ background: 'var(--t-surface)', border: `1px solid ${p.status === 'out-of-stock' ? 'rgba(255,77,125,0.3)' : 'var(--t-line)'}`, cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,229,255,0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = p.status === 'out-of-stock' ? 'rgba(255,77,125,0.3)' : 'var(--t-line)'}
            >
              <div style={{ height: 2, background: CAT_COLORS[p.cat] || 'var(--t-accent)', opacity: 0.6 }} />
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <ImgBox cat={p.cat} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.3, marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
                    <CatBadge cat={p.cat} />
                    <StatusBadge status={p.status} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>{p.sku}</div>
                </div>
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Price</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-accent)' }}>{fmt$(p.retail)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Margin</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: p.margin >= 50 ? '#2ad6a0' : p.margin >= 40 ? '#ffb800' : '#ff4d7d' }}>{fmtPct(p.margin)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Stock</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: p.totalStock === 0 ? 'var(--t-danger)' : p.totalStock < 5 ? 'var(--t-warn)' : 'var(--t-text)' }}>{p.totalStock}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <DetailPanel product={selected} allProducts={products} catSales={catSales} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── PRODUCT KNOWLEDGE TAB ─────────────────────────────────────────────────────
// Static sales-coaching reference copy (guidance, not business data), keyed by
// the leading 3 letters of a real category. Renders only for categories that
// exist in the live catalog.
const KNOWLEDGE = {
  MSG: { whoFor: 'Couples, spa gift buyers, relaxation seekers', objections: ['Price — "The set pays for itself after one use."', 'Already have oil — "This blends, try the scent."'], tips: ['Demonstrate scent on wrist', 'Bundle with candle for gifting', "Valentine's Day top seller"] },
  INT: { whoFor: 'Couples seeking novelty, date night shoppers', objections: ["Shy about games — \"It's more playful than explicit.\"", 'Has enough games — "This one is totally different — trust me."'], tips: ['Great low-barrier upsell', 'Works for any relationship stage', 'Counter display placement drives impulse buys'] },
  APP: { whoFor: 'Gift buyers, anniversary shoppers, self-treat customers', objections: ["Not sure of size — \"We carry S through 3X, here's the size chart.\"", 'Price concern — "Under $35 and feels luxurious."'], tips: ['Lead with size range', 'Gift framing increases conversion', 'Satin = perceived high value'] },
  ACC: { whoFor: 'Adventurous couples, BDSM-curious customers, experienced shoppers', objections: ["Intimidated — \"Start with the soft set — it's beginner friendly.\"", 'Price — "This is real leather, it lasts."'], tips: ["Don't judge — let them browse", 'Beginner vs advanced sets exist', 'Privacy assurance closes nervous buyers'] },
  LUB: { whoFor: 'Any toy buyer, all couples, customers with dryness concerns', objections: ['Already use something — "This is body-safe and pH balanced — different category."', 'Gross factor — "Totally odorless and easy cleanup."'], tips: ['Pair with every toy sold', '"Only $12 add-on — yes every time."', 'Stock near checkout'] },
  TOY: { whoFor: 'Solo shoppers, couples, gift buyers, first-timers', objections: ["Embarrassed — \"Super common purchase — it's no different than a massage device.\"", 'Expensive — "USB rechargeable, so no batteries ever."'], tips: ['Medical-grade silicone is the key differentiator', 'Always mention waterproof + USB', 'Gift wrap drives confidence for givers'] },
  WEL: { whoFor: 'Health-conscious shoppers, women in menopause, stamina-focused customers', objections: ['Skeptical about supplements — "Third-party tested, doctor formulated."', "Price — \"It's a 30-day supply — works out to $1.17/day.\""], tips: ['Educate on CBD intimacy benefits', 'Kegel sets are high-margin hidden gems', 'Menopause products = underserved high-loyalty segment'] },
  NOV: { whoFor: 'Bachelorette parties, gift buyers, impulse shoppers', objections: ["Seems cheap — \"It's the perfect grab-and-go gift.\"", 'Not sure what to get — "This is the easiest gift we carry."'], tips: ['Counter placement = impulse conversion', 'Gift cards are easy upsells at checkout', 'Bachelorette kits = group purchase, ring them all up together'] },
}

function KnowledgeTab({ products, cats }) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [expanded, setExpanded] = useState(null)

  const filtered = useMemo(() => {
    let list = [...products]
    if (catFilter !== 'All') list = list.filter(p => p.cat === catFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    }
    return list
  }, [products, catFilter, search])

  const byCat = useMemo(() => {
    const groups = {}
    filtered.forEach(p => {
      const key = p.cat || 'Uncategorized'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }, [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)', padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)', marginBottom: 4 }}>Staff Reference Guide</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>Product knowledge = confidence = sales. Know the features, understand the customer, pair the upsell. This is your edge on the floor.</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-faint)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" style={{ ...S.inp, paddingLeft: 28, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['All', ...cats].map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, background: catFilter === c ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${catFilter === c ? 'var(--t-accent)' : 'var(--t-line)'}`, color: catFilter === c ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em' }}>{c}</button>
          ))}
        </div>
      </div>

      {Object.keys(byCat).length === 0 && (
        <div style={{ ...S.panel, padding: '40px 16px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No products to reference yet.
        </div>
      )}

      {Object.entries(byCat).map(([cat, prods]) => {
        const prefix = (cat || '').slice(0, 3).toUpperCase()
        const kn = KNOWLEDGE[prefix] || {}
        return (
          <div key={cat} style={S.panel}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CatBadge cat={cat} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{cat}</span>
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{prods.length} products</span>
            </div>

            {kn.whoFor && (
              <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--t-line)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Who It's For</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{kn.whoFor}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Objection Handlers</div>
                  {(kn.objections || []).map((o, i) => <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 3 }}>▸ {o}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Floor Tips</div>
                  {(kn.tips || []).map((t, i) => <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 3 }}>▸ {t}</div>)}
                </div>
              </div>
            )}

            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prods.map(p => (
                <div key={p.sku}>
                  <button onClick={() => setExpanded(expanded === p.sku ? null : p.sku)} style={{ width: '100%', textAlign: 'left', background: expanded === p.sku ? 'rgba(0,229,255,0.05)' : 'transparent', border: `1px solid ${expanded === p.sku ? 'rgba(0,229,255,0.3)' : 'var(--t-line)'}`, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ImgBox cat={p.cat} size={32} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>{p.sku}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)' }}>{fmt$(p.retail)}</span>
                    <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{expanded === p.sku ? '▲' : '▼'}</span>
                  </button>
                  {expanded === p.sku && (
                    <div style={{ border: '1px solid var(--t-line)', borderTop: 'none', padding: '14px 14px 14px 58px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Key Facts</div>
                          {[`Price point: ${fmt$(p.retail)}`, `Margin: ${fmtPct(p.margin)}`, `On hand: ${p.totalStock} units`, `Status: ${p.status}`].map((f, i) => (
                            <div key={i} style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 2 }}>▸ {f}</div>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#ffb800', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Upsell Recommendation</div>
                          {(p.upsellPairs || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-faint)', lineHeight: 1.5 }}>None configured.</div>}
                          {(p.upsellPairs || []).map(sku => {
                            const up = products.find(r => r.sku === sku)
                            return up ? <div key={sku} style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 2 }}>▸ {up.name} ({fmt$(up.retail)})</div> : null
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PRICING TAB ───────────────────────────────────────────────────────────────
function PricingTab({ products, cats, isHR, onReload }) {
  const [catFilter, setCatFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [pctChange, setPctChange] = useState('')
  const [applying, setApplying] = useState(false)
  const [msg, setMsg] = useState(null)   // { text, ok }

  const filtered = useMemo(() => {
    let list = [...products]
    if (catFilter !== 'All') list = list.filter(p => p.cat === catFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    }
    return list
  }, [products, catFilter, search])

  const toggleSelect = (sku) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(sku) ? next.delete(sku) : next.add(sku)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(filtered.map(p => p.sku)))
  const clearAll = () => setSelected(new Set())

  const applyPctChange = async () => {
    const pct = parseFloat(pctChange)
    if (isNaN(pct) || selected.size === 0) return
    setApplying(true)
    setMsg(null)
    const skus = [...selected]
    try {
      const { data, error } = await sb.rpc('bulk_update_prices', { p_skus: skus, p_pct_change: pct })
      if (error) throw error
      const updated = data?.updated ?? skus.length
      setMsg({ text: `Applied ${pct > 0 ? '+' : ''}${pct}% to ${updated} product(s).`, ok: true })
      setPctChange('')
      setSelected(new Set())
      await onReload()   // refresh from the server so the table shows the real new prices
    } catch (e) {
      setMsg({ text: `Not saved — ${e.message || 'price update failed'}.`, ok: false })
    } finally {
      setApplying(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  const compBadge = (p) => {
    if (!p.comp) return <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>—</span>
    const diff = p.retail - p.comp
    if (diff < -0.5) return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(42,214,160,0.1)', border: '1px solid rgba(42,214,160,0.3)', color: '#2ad6a0' }}>Below Comp</span>
    if (diff > 0.5) return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,77,125,0.1)', border: '1px solid rgba(255,77,125,0.3)', color: '#ff4d7d' }}>Above Comp</span>
    return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)', color: '#ffb800' }}>At Comp</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-faint)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" style={{ ...S.inp, paddingLeft: 28, width: '100%' }} />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={S.inp}>
          {['All', ...cats].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {isHR && (
        <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bulk Price Update</span>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{selected.size > 0 ? `${selected.size} selected` : 'Select rows below'}</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
            <button onClick={selectAll} style={{ ...S.inp, cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: '4px 10px', width: 'auto' }}>Select All</button>
            <button onClick={clearAll} style={{ ...S.inp, cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: '4px 10px', width: 'auto' }}>Clear</button>
            <input type="number" step="0.1" value={pctChange} onChange={e => setPctChange(e.target.value)} placeholder="% change (e.g. +5)" style={{ ...S.inp, width: 140 }} />
            <button onClick={applyPctChange} disabled={applying || selected.size === 0 || !pctChange} style={{ padding: '7px 16px', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: (applying || selected.size === 0 || !pctChange) ? 0.4 : 1 }}>
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>
          {msg && <span style={{ fontSize: 11, color: msg.ok ? '#2ad6a0' : 'var(--t-danger)', fontWeight: 700, width: '100%' }}>{msg.text}</span>}
        </div>
      )}

      <div style={{ ...S.panel, overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No products to price.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                {isHR && <th style={{ ...S.th, width: 36 }}></th>}
                <th style={S.th}>Product</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Cost</th>
                <th style={{ ...S.th, textAlign: 'right' }}>MSRP</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Our Price</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margin $</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margin %</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Comp Price</th>
                <th style={S.th}>vs Comp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const marginD = (p.retail - p.cost).toFixed(2)
                const isSelected = selected.has(p.sku)
                return (
                  <tr key={p.sku} style={{ background: isSelected ? 'rgba(0,229,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    {isHR && (
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.sku)} style={{ cursor: 'pointer', accentColor: 'var(--t-accent)' }} />
                      </td>
                    )}
                    <td style={S.td}>
                      <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 2 }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 5 }}><CatBadge cat={p.cat} /><span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>{p.sku}</span></div>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text-muted)' }}>{fmt$(p.cost)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text-muted)' }}>{p.msrp ? fmt$(p.msrp) : '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: 'var(--t-accent)' }}>{fmt$(p.retail)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#2ad6a0', fontWeight: 600 }}>${marginD}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: p.margin >= 50 ? '#2ad6a0' : p.margin >= 40 ? '#ffb800' : '#ff4d7d' }}>{fmtPct(p.margin)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text-muted)' }}>{p.comp ? fmt$(p.comp) : '—'}</td>
                    <td style={S.td}>{compBadge(p)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── PERFORMANCE TAB (real fields only) ────────────────────────────────────────
function PerformanceTab({ products, catSalesList }) {
  const marginLeaders = [...products].sort((a, b) => b.margin - a.margin).slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const newProducts = products.filter(p => p.addedDate && p.addedDate >= thirtyDaysAgo)
  const outOfStock = products.filter(p => p.totalStock === 0)
  const lowStock = products.filter(p => p.totalStock > 0 && p.totalStock < 8).sort((a, b) => a.totalStock - b.totalStock)

  const PerfTable = ({ rows, cols, title, badge, empty }) => (
    <div style={S.panel}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={S.sec}>{title}</span>
        {badge && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: 'var(--t-accent)' }}>{badge}</span>}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 12 }}>{empty || 'No records.'}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 28 }}>#</th>
                <th style={S.th}>{cols.__first || 'Product'}</th>
                {cols.map(c => <th key={c.key} style={{ ...S.th, textAlign: 'right' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.sku || p.cat || i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...S.td, color: 'var(--t-text-faint)', fontWeight: 700, textAlign: 'center' }}>{i + 1}</td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 2 }}>{p.name || p.cat}</div>
                    {p.cat !== undefined && p.name && <div style={{ display: 'flex', gap: 5 }}><CatBadge cat={p.cat} /></div>}
                  </td>
                  {cols.map(c => (
                    <td key={c.key} style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: c.color || 'var(--t-text)' }}>
                      {c.fmt ? c.fmt(p[c.key], p) : (p[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const catCols = [
    { key: 'units', label: 'Units (30d)', color: 'var(--t-accent)' },
    { key: 'amount', label: 'Revenue (30d)', fmt: fmt$ },
    { key: 'velocity', label: 'Units/Wk', fmt: (v) => `${v}/wk` },
  ]
  const catCols2 = Object.assign(catCols, { __first: 'Category' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PerfTable title="Category Sell-Through (Last 30 Days)" badge="from real sales" rows={catSalesList} cols={catCols2}
        empty="No sales recorded in the last 30 days for the locations in scope." />

      <PerfTable title="Margin Leaders" badge="Top 10 by margin" rows={marginLeaders} cols={[
        { key: 'margin', label: 'Margin %', color: '#2ad6a0', fmt: fmtPct },
        { key: 'retail', label: 'Price', fmt: fmt$ },
        { key: 'cost', label: 'Cost', fmt: fmt$ },
      ]} empty="No products in the catalog yet." />

      <PerfTable title="New Products (Last 30 Days)" badge={`${newProducts.length} added`} rows={newProducts} cols={[
        { key: 'addedDate', label: 'Added', color: 'var(--t-accent)' },
        { key: 'retail', label: 'Price', fmt: fmt$ },
        { key: 'margin', label: 'Margin %', fmt: fmtPct },
      ]} empty="No products added in the last 30 days." />

      <PerfTable title="Out of Stock" badge={`${outOfStock.length} items`} rows={outOfStock} cols={[
        { key: 'totalStock', label: 'On Hand', color: 'var(--t-danger)' },
        { key: 'retail', label: 'Price', fmt: fmt$ },
        { key: 'margin', label: 'Margin %', fmt: fmtPct },
      ]} empty="Nothing is out of stock." />

      <PerfTable title="Low Stock (Under 8 On Hand)" badge={`${lowStock.length} items`} rows={lowStock} cols={[
        { key: 'totalStock', label: 'On Hand', color: 'var(--t-warn)' },
        { key: 'retail', label: 'Price', fmt: fmt$ },
        { key: 'margin', label: 'Margin %', fmt: fmtPct },
      ]} empty="No products are running low." />
    </div>
  )
}

// ── FORENSIC KPI PANEL (real fields only) ─────────────────────────────────────
function ForensicKPIs({ products, cats, catSales }) {
  const [drill, setDrill] = useState(null)
  const active = products.filter(p => p.status === 'active')
  const oos = products.filter(p => p.status === 'out-of-stock' || p.totalStock === 0)
  const thisMonth = new Date(); thisMonth.setDate(1); const monthStr = thisMonth.toISOString().slice(0, 10)
  const newThisMonth = products.filter(p => p.addedDate && p.addedDate >= monthStr)
  const discontinued = products.filter(p => p.status === 'discontinued')
  const priced = products.filter(p => p.cost > 0)
  const avgMargin = priced.length > 0 ? (priced.reduce((s, p) => s + p.margin, 0) / priced.length) : 0
  const highestMarginItem = [...products].sort((a, b) => b.margin - a.margin)[0]
  const lowestMarginItem = [...priced].sort((a, b) => a.margin - b.margin)[0]
  const avgPrice = products.length > 0 ? products.reduce((s, p) => s + p.retail, 0) / products.length : 0
  const totalCatalogValue = products.reduce((s, p) => s + p.retail * p.totalStock, 0)
  const totalOnHand = products.reduce((s, p) => s + p.totalStock, 0)

  const catStats = cats.map(cat => {
    const catProds = products.filter(p => p.cat === cat)
    const cp = catProds.filter(p => p.cost > 0)
    const avgM = cp.length > 0 ? cp.reduce((s, p) => s + p.margin, 0) / cp.length : 0
    const avgP = catProds.length > 0 ? catProds.reduce((s, p) => s + p.retail, 0) / catProds.length : 0
    const topMargin = [...catProds].sort((a, b) => b.margin - a.margin)[0]
    const sales = catSales[cat]
    return { cat, count: catProds.length, avgMargin: avgM, avgPrice: avgP, units30: sales?.units ?? 0, rev30: sales?.amount ?? 0, topMargin: topMargin?.name || '—' }
  })

  const marginDesc = [...products].sort((a, b) => b.margin - a.margin)
  const marginAsc = [...priced].sort((a, b) => a.margin - b.margin)
  const priceDesc = [...products].sort((a, b) => b.retail - a.retail)
  const stockDesc = [...products].sort((a, b) => b.totalStock * b.retail - a.totalStock * a.retail)
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} product${rows.length === 1 ? '' : 's'}`, columns: PRODUCT_COLS, rows, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KTile label="Total SKUs" value={products.length} sub="in catalog" onClick={() => openDrill('All Products', products, 'var(--t-accent)')} />
        <KTile label="Active Products" value={active.length} color="#2ad6a0" sub={`${products.length - active.length} inactive`} onClick={() => openDrill('Active Products', active, '#2ad6a0')} />
        <KTile label="New This Month" value={newThisMonth.length} color="var(--t-accent)" sub="added this month" onClick={() => openDrill('New This Month', newThisMonth, 'var(--t-accent)')} />
        <KTile label="Discontinued" value={discontinued.length} sub="removed from sale" onClick={() => openDrill('Discontinued Products', discontinued, 'var(--t-text-muted)')} />
        <KTile label="Avg Margin %" value={fmtPct(avgMargin)} color={avgMargin >= 50 ? '#2ad6a0' : '#ffb800'} sub="priced items" onClick={() => openDrill('Products by Margin', marginDesc, '#2ad6a0')} />
        <KTile label="Categories" value={cats.length} sub="in catalog" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KTile label="Highest Margin" value={highestMarginItem?.name?.split(' ').slice(0, 2).join(' ') || '—'} sub={highestMarginItem ? fmtPct(highestMarginItem.margin) : '—'} color="#2ad6a0" onClick={() => openDrill('Highest Margin — Ranked', marginDesc, '#2ad6a0')} />
        <KTile label="Lowest Margin" value={lowestMarginItem?.name?.split(' ').slice(0, 2).join(' ') || '—'} sub={lowestMarginItem ? fmtPct(lowestMarginItem.margin) : '—'} color="var(--t-warn)" onClick={() => openDrill('Lowest Margin — Ranked', marginAsc, 'var(--t-warn)')} />
        <KTile label="Out of Stock SKUs" value={oos.length} alert={oos.length > 0 ? 'red' : undefined} color={oos.length > 0 ? 'var(--t-danger)' : '#2ad6a0'} sub={oos.length > 0 ? 'needs reorder' : 'fully stocked'} onClick={() => openDrill('Out of Stock SKUs', oos, 'var(--t-danger)')} />
        <KTile label="Avg Price" value={fmt$(avgPrice)} sub="retail price" onClick={() => openDrill('Products by Price', priceDesc, 'var(--t-accent)')} />
        <KTile label="Catalog Value" value={`$${Math.round(totalCatalogValue / 1000)}K`} sub="retail × on-hand" color="var(--t-accent)" onClick={() => openDrill('Catalog Value — Retail × On-Hand', stockDesc, 'var(--t-accent)')} />
        <KTile label="Total On Hand" value={totalOnHand.toLocaleString()} sub="units across scope" onClick={() => openDrill('Products by On-Hand', [...products].sort((a, b) => b.totalStock - a.totalStock), 'var(--t-accent)')} />
      </div>

      <div style={{ ...S.panel, overflowX: 'auto' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>Category Breakdown</div>
        {catStats.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 12 }}>No categories yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={S.th}>Category</th>
                <th style={{ ...S.th, textAlign: 'right' }}>SKUs</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Avg Margin</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Avg Price</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Units (30d)</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Revenue (30d)</th>
                <th style={S.th}>Top Margin SKU</th>
              </tr>
            </thead>
            <tbody>
              {catStats.map((c, i) => (
                <tr key={c.cat} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={S.td}><CatBadge cat={c.cat} /></td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: 'var(--t-text)' }}>{c.count}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: c.avgMargin >= 50 ? '#2ad6a0' : '#ffb800' }}>{fmtPct(c.avgMargin)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-accent)' }}>{fmt$(c.avgPrice)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text)' }}>{c.units30}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text-muted)' }}>{fmt$(c.rev30)}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)', fontSize: 11 }}>{c.topMargin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function Products() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => roleName.includes(x))

  const [products, setProducts] = useState([])
  const [catSalesList, setCatSalesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Catalog')

  const TABS = ['Catalog', 'Knowledge', 'Pricing', 'Performance']

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pc, cs] = await Promise.all([
        sb.rpc('get_products_catalog', { p_node_ids: locationIds }),
        sb.rpc('get_product_category_sales', { p_node_ids: locationIds, p_days: 30 }),
      ])
      if (pc.error) throw pc.error
      const rows = (pc.data || []).map(p => {
        const cost = Number(p.cost) || 0
        const retail = Number(p.retail) || 0
        return {
          ...p,
          cost, retail,
          msrp: p.msrp == null ? null : Number(p.msrp),
          comp: p.comp == null ? null : Number(p.comp),
          margin: cost > 0 && retail > 0 ? (retail - cost) / retail * 100 : (retail > 0 ? 100 : 0),
          totalStock: Number(p.totalStock) || 0,
          locStock: p.locStock || {},
          upsellPairs: p.upsellPairs || [],
        }
      })
      setProducts(rows)
      setCatSalesList(cs.error ? [] : (cs.data || []).map(c => ({ ...c, amount: Number(c.amount) || 0, units: Number(c.units) || 0, velocity: Number(c.velocity) || 0 })))
    } catch (e) {
      setError(e.message || 'Failed to load the product catalog.')
      setProducts([])
      setCatSalesList([])
    } finally {
      setLoading(false)
    }
  }, [locationIds.join(',')])

  useEffect(() => { load() }, [load])

  const cats = useMemo(() => [...new Set(products.map(p => p.cat).filter(Boolean))].sort(), [products])
  const catSalesMap = useMemo(() => Object.fromEntries(catSalesList.map(c => [c.cat, c])), [catSalesList])

  const tabStyle = (active) => ({
    padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
    background: active ? 'rgba(0,229,255,0.1)' : 'transparent',
    border: 'none', borderBottom: `2px solid ${active ? 'var(--t-accent)' : 'transparent'}`,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer',
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: 'var(--t-text-muted)', fontSize: 13 }}>
        Loading product catalog…
      </div>
    )
  }

  return (
    <div style={{ padding: 0 }}>
      {/* Page header */}
      <div style={{ padding: '16px 18px 0', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>Products</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>Catalog · Knowledge · Pricing · Performance · {products.length} SKUs across {cats.length} categories</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, background: 'rgba(42,214,160,0.1)', border: '1px solid rgba(42,214,160,0.3)', color: '#2ad6a0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {products.filter(p => p.status === 'active').length} Active
            </span>
            <span style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, background: products.some(p => p.status === 'out-of-stock' || p.totalStock === 0) ? 'rgba(255,77,125,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${products.some(p => p.status === 'out-of-stock' || p.totalStock === 0) ? 'rgba(255,77,125,0.3)' : 'var(--t-line)'}`, color: products.some(p => p.status === 'out-of-stock' || p.totalStock === 0) ? '#ff4d7d' : 'var(--t-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {products.filter(p => p.status === 'out-of-stock' || p.totalStock === 0).length} OOS
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>{t}</button>)}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {error && (
          <div style={{ background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.35)', color: '#ff4d7d', padding: '12px 16px', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>Couldn’t load the product catalog — {error}</span>
            <button onClick={load} style={{ ...S.inp, cursor: 'pointer', fontWeight: 700, width: 'auto' }}>Retry</button>
          </div>
        )}

        {!error && products.length === 0 ? (
          <div style={{ ...S.panel, padding: '56px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No products in the catalog yet</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
              Once products are added to the catalog they’ll appear here with live pricing, margins and per-location stock. Nothing is shown until there is real data.
            </div>
          </div>
        ) : (!error && (
          <>
            <ForensicKPIs products={products} cats={cats} catSales={catSalesMap} />
            {tab === 'Catalog' && <CatalogTab products={products} cats={cats} catSales={catSalesMap} />}
            {tab === 'Knowledge' && <KnowledgeTab products={products} cats={cats} />}
            {tab === 'Pricing' && <PricingTab products={products} cats={cats} isHR={isHR} onReload={load} />}
            {tab === 'Performance' && <PerformanceTab products={products} catSalesList={catSalesList} />}
          </>
        ))}
      </div>
    </div>
  )
}
