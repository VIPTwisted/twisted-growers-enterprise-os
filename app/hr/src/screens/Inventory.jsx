import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── helpers ────────────────────────────────────────────────────────────────────
function getStatus(qty, reorder) {
  if (qty === 0)        return { label:'OUT',      cls:'red',   color:'var(--t-danger)' }
  if (qty <= reorder)   return { label:'LOW',      cls:'amber', color:'var(--t-warn)'   }
  return                       { label:'IN STOCK', cls:'green', color:'var(--t-success)'}
}

function fmt$(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'2-digit' }) }
  catch { return d }
}

// Map the real get_inventory() row shape onto the field names this screen uses.
// get_inventory returns: id, node_id, name, sku, category, quantity_on_hand,
// quantity_min, unit_cost, last_counted_at, is_low_stock.
// There is no retail price in the backend, so retail_price stays null (honest).
function mapInventory(row, nodeName) {
  return {
    id:            row.id,
    node_id:       row.node_id,
    sku:           row.sku,
    product_name:  row.name,
    category:      row.category || '—',
    location:      nodeName(row.node_id),
    in_stock:      Number(row.quantity_on_hand) || 0,
    reorder_point: Number(row.quantity_min) || 0,
    unit_cost:     Number(row.unit_cost) || 0,
    retail_price:  null,
    last_counted_at: row.last_counted_at,
  }
}

// ── drill-down column sets ─────────────────────────────────────────────────────
const STOCK_COLS = [
  { key: 'sku', label: 'SKU', value: r => r.sku },
  { key: 'product_name', label: 'Product', value: r => r.product_name },
  { key: 'category', label: 'Category', value: r => r.category },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'in_stock', label: 'In Stock', value: r => r.in_stock, align: 'right', sortKey: r => r.in_stock },
  { key: 'reorder_point', label: 'Reorder Pt', value: r => r.reorder_point, align: 'right', sortKey: r => r.reorder_point },
  { key: 'unit_cost', label: 'Unit Cost', value: r => fmt$(r.unit_cost), align: 'right', sortKey: r => r.unit_cost },
  { key: 'value', label: 'Stock Value', value: r => fmt$(r.in_stock * r.unit_cost), align: 'right', sortKey: r => r.in_stock * r.unit_cost },
]
const RECEIPT_COLS = [
  { key: 'date', label: 'Date', value: r => fmtDate(r.date), sortKey: r => r.date },
  { key: 'sku', label: 'SKU', value: r => r.sku },
  { key: 'product', label: 'Product', value: r => r.product },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'qty', label: 'Qty', value: r => r.qty, align: 'right', sortKey: r => r.qty },
  { key: 'unit_cost', label: 'Unit Cost', value: r => fmt$(r.unit_cost), align: 'right', sortKey: r => r.unit_cost },
  { key: 'cost', label: 'Cost', value: r => fmt$(r.cost), align: 'right', sortKey: r => r.cost },
]
const TRANSFER_COLS = [
  { key: 'date', label: 'Date', value: r => fmtDate(r.date), sortKey: r => r.date },
  { key: 'sku', label: 'SKU', value: r => r.sku },
  { key: 'product', label: 'Product', value: r => r.product },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'direction', label: 'Direction', value: r => r.direction === 'out' ? 'Sent' : 'Received' },
  { key: 'qty', label: 'Qty', value: r => r.qty, align: 'right', sortKey: r => r.qty },
]

// aggregate raw location-level rows → per-SKU pivot (dynamic across locations)
function pivotSkus(rows) {
  const map = {}
  rows.forEach(r => {
    if (!map[r.sku]) {
      map[r.sku] = {
        sku: r.sku, product_name: r.product_name, category: r.category,
        reorder_point: 0, unit_cost: r.unit_cost, retail_price: r.retail_price,
        byLoc: {}, total: 0,
      }
    }
    const m = map[r.sku]
    m.byLoc[r.location] = (m.byLoc[r.location] || 0) + r.in_stock
    m.total += r.in_stock
    m.reorder_point += r.reorder_point
  })
  return Object.values(map)
}

// ── shared styles ──────────────────────────────────────────────────────────────
const INPUT = {
  background:'var(--t-bg)', border:'1px solid var(--t-line)', color:'var(--t-text)',
  padding:'8px 10px', fontSize:13, width:'100%', outline:'none',
  fontFamily:'inherit',
}
const SELECT_S = { ...INPUT, cursor:'pointer' }
const LABEL_S  = {
  fontSize:11, color:'var(--t-text-muted)', marginBottom:4, display:'block',
  textTransform:'uppercase', letterSpacing:'0.05em',
}
const BTN = (v='default') => ({
  background: v==='accent' ? 'var(--t-accent)'
            : v==='danger' ? 'var(--t-danger)'
            : v==='ghost'  ? 'transparent'
            : v==='warn'   ? 'var(--t-warn)'
            : 'var(--t-surface-2)',
  color: v==='accent' ? '#070b14'
       : v==='danger' ? '#fff'
       : v==='warn'   ? '#070b14'
       : 'var(--t-text)',
  border: v==='ghost' ? '1px solid var(--t-line)' : 'none',
  padding:'7px 14px', fontSize:12, cursor:'pointer', fontWeight:600,
  letterSpacing:'0.03em', fontFamily:'inherit',
})

const Field = ({ label, children, style }) => (
  <div style={{ marginBottom:14, ...style }}>
    <label style={LABEL_S}>{label}</label>
    {children}
  </div>
)

// ── toast hook ─────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type='success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400)
  }, [])
  return { toasts, show }
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background:'var(--t-surface)',
      border:`1px solid ${alert==='red' ? 'var(--t-danger)' : alert==='amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding:'14px 16px', position:'relative', overflow:'hidden', flex:'1 1 140px', minWidth:130,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert==='red'   && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }}/>}
      {alert==='amber' && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)'   }}/>}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color:color||'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--t-line)', flexShrink:0 }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          style={{
            background:'none', border:'none', cursor:'pointer', padding:'10px 18px',
            fontSize:12, fontWeight:600, letterSpacing:'0.04em', fontFamily:'inherit',
            color: active===t ? 'var(--t-accent)' : 'var(--t-text-muted)',
            borderBottom: active===t ? '2px solid var(--t-accent)' : '2px solid transparent',
            marginBottom:-1,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ── modal shell ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer, maxWidth=520 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1000, padding:16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'var(--t-surface)', border:'1px solid var(--t-line)',
          width:'100%', maxWidth, maxHeight:'90vh',
          display:'flex', flexDirection:'column', overflow:'hidden',
        }}
      >
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 18px', borderBottom:'1px solid var(--t-line)', flexShrink:0,
        }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--t-text)', letterSpacing:'0.04em', textTransform:'uppercase' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t-text-muted)', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px', fontFamily:'inherit' }}>×</button>
        </div>
        <div style={{ padding:'16px 18px', overflowY:'auto', flex:1 }}>{children}</div>
        {footer && (
          <div style={{ padding:'12px 18px', borderTop:'1px solid var(--t-line)', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── item detail panel ──────────────────────────────────────────────────────────
function ItemDetailPanel({ item, rows, onClose, onReorder }) {
  const locRows = rows.filter(r => r.sku === item.sku)
  return (
    <div style={{
      position:'fixed', top:0, right:0, bottom:0, width:360,
      background:'var(--t-surface)', borderLeft:'1px solid var(--t-line)',
      zIndex:900, display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--t-line)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--t-text)' }}>{item.product_name}</div>
          <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--t-text-muted)', marginTop:2 }}>{item.sku}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t-text-muted)', fontSize:18, cursor:'pointer', fontFamily:'inherit' }}>×</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>
        {/* pricing */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
          <div style={{ background:'var(--t-bg)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Unit Cost</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--t-text)' }}>{fmt$(item.unit_cost)}</div>
          </div>
          <div style={{ background:'var(--t-bg)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Category</div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--t-accent)' }}>{item.category}</div>
          </div>
          <div style={{ background:'var(--t-bg)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>On Hand</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--t-text)' }}>{locRows.reduce((a, r) => a + r.in_stock, 0)}</div>
          </div>
          <div style={{ background:'var(--t-bg)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Reorder Pt</div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--t-warn)' }}>{locRows.reduce((a, r) => a + r.reorder_point, 0)}</div>
          </div>
        </div>
        {/* per-location breakdown */}
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>Stock by Location</div>
        {locRows.length === 0 ? (
          <div style={{ padding:12, color:'var(--t-text-faint)', fontSize:12 }}>No stock records.</div>
        ) : locRows.map(r => {
          const st = getStatus(r.in_stock, r.reorder_point)
          return (
            <div key={r.location} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'var(--t-bg)', border:'1px solid var(--t-line)', marginBottom:4 }}>
              <span style={{ fontSize:12, color:'var(--t-text)' }}>{r.location}</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, fontWeight:800, color:st.color, fontFamily:'monospace' }}>{r.in_stock}</span>
                <span className={`badge ${st.cls}`} style={{ fontSize:9 }}>{st.label}</span>
              </div>
            </div>
          )
        })}
        {/* total value */}
        <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(0,229,255,0.05)', border:'1px solid rgba(0,229,255,0.15)' }}>
          <div style={{ fontSize:10, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Total Inventory Value (Cost)</div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--t-accent)' }}>
            {fmt$(locRows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0))}
          </div>
        </div>
        {/* reorder button */}
        {locRows.some(r => r.in_stock <= r.reorder_point) && (
          <button
            onClick={() => onReorder(locRows.find(r => r.in_stock <= r.reorder_point))}
            style={{ ...BTN('danger'), width:'100%', marginTop:16, textAlign:'center', padding:'10px' }}
          >
            Request Restock
          </button>
        )}
      </div>
    </div>
  )
}

// ── restock modal (real: log_supply_request) ─────────────────────────────────────
function RestockModal({ row, requesterId, onClose, onDone, showToast }) {
  const suggestedQty = Math.max((row.reorder_point || 10) * 2 - (row.in_stock || 0), 1)
  const [qty, setQty]     = useState(suggestedQty)
  const [urgency, setUrg] = useState(row.in_stock === 0 ? 'high' : 'normal')
  const [busy, setBusy]   = useState(false)

  const submit = async () => {
    if (!qty || qty < 1) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('log_supply_request', {
        p_item:         row.product_name || row.sku,
        p_node_id:      row.node_id || null,
        p_qty:          Number(qty),
        p_requester_id: requesterId || null,
        p_unit:         'each',
        p_urgency:      urgency,
      })
      if (error) throw error
      showToast(`Restock requested — ${row.product_name} × ${qty}`)
      onDone()
    } catch (e) {
      showToast(`Could not submit restock — ${e.message || 'request failed'}`, 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Request Restock"
      onClose={onClose}
      footer={<><button style={BTN('ghost')} onClick={onClose}>Cancel</button><button style={BTN('accent')} onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit Request'}</button></>}
    >
      <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:16 }}>
        <span style={{ color:'var(--t-text)', fontWeight:700 }}>{row.product_name}</span>
        {' · '}<span style={{ fontFamily:'monospace', fontSize:11 }}>{row.sku}</span>
        {' · '}<span style={{ color:'var(--t-danger)' }}>{row.in_stock} in stock @ {row.location}</span>
      </div>
      <Field label="Qty to Restock">
        <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} style={INPUT}/>
      </Field>
      <Field label="Urgency">
        <select value={urgency} onChange={e => setUrg(e.target.value)} style={SELECT_S}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </Field>
      <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>Reorder point: {row.reorder_point} · Current: {row.in_stock} · Suggested: {suggestedQty}</div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Stock Overview
// ─────────────────────────────────────────────────────────────────────────────
function TabStockOverview({ rows, loading, locations, categories, onDetail, onReorder }) {
  const [search, setSearch]           = useState('')
  const [locFilter, setLocFilter]     = useState('All')
  const [catFilter, setCatFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortCol, setSortCol]         = useState('total')
  const [sortDir, setSortDir]         = useState(-1)

  const pivoted = useMemo(() => pivotSkus(rows), [rows])

  const getVal = (r, col) => (col in r ? r[col] : (r.byLoc?.[col] ?? 0))

  const filtered = useMemo(() => {
    let data = pivoted
    const q = search.trim().toLowerCase()
    if (q) data = data.filter(r => (r.product_name || '').toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q))
    if (catFilter !== 'All') data = data.filter(r => r.category === catFilter)
    if (statusFilter !== 'All') {
      data = data.filter(r => {
        return statusFilter === 'OUT'      ? r.total === 0
             : statusFilter === 'LOW'      ? (r.total > 0 && r.total <= r.reorder_point)
             : statusFilter === 'IN STOCK' ? r.total > r.reorder_point
             : true
      })
    }
    if (locFilter !== 'All') {
      data = data.filter(r => (r.byLoc?.[locFilter] || 0) > 0)
    }
    return [...data].sort((a, b) => {
      const av = getVal(a, sortCol) ?? 0
      const bv = getVal(b, sortCol) ?? 0
      return typeof av === 'string' ? av.localeCompare(bv) * sortDir : (av - bv) * sortDir
    })
  }, [pivoted, search, locFilter, catFilter, statusFilter, sortCol, sortDir])

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const TH = ({ col, label, align='left', minW }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding:'9px 10px', textAlign:align, fontWeight:700, fontSize:10,
        color: sortCol===col ? 'var(--t-accent)' : 'var(--t-text-muted)',
        textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap',
        cursor:'pointer', userSelect:'none', minWidth:minW,
        borderRight:'1px solid var(--t-line)',
      }}
    >
      {label} {sortCol===col ? (sortDir===-1 ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or name…" style={{ ...INPUT, flex:'1 1 180px', maxWidth:260 }}/>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ ...SELECT_S, minWidth:140 }}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...SELECT_S, minWidth:130 }}>
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...SELECT_S, minWidth:130 }}>
          <option value="All">All Statuses</option>
          <option value="IN STOCK">In Stock</option>
          <option value="LOW">Low Stock</option>
          <option value="OUT">Out of Stock</option>
        </select>
        <div style={{ marginLeft:'auto', fontSize:11, color:'var(--t-text-faint)', whiteSpace:'nowrap' }}>
          {loading ? '…' : `${filtered.length} SKUs`}
        </div>
      </div>

      {/* table */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflowX:'auto' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>Loading inventory…</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-bg)' }}>
                <TH col="sku"          label="SKU"        minW={90}  />
                <TH col="product_name" label="Product"    minW={180} />
                <TH col="category"     label="Category"   minW={100} />
                {locations.map(loc => (
                  <TH key={loc} col={loc} label={loc} align="right" minW={80} />
                ))}
                <TH col="total"        label="Total"      align="right" minW={60} />
                <TH col="reorder_point"label="Reorder Pt" align="right" minW={75} />
                <th style={{ padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', minWidth:90 }}>Status</th>
                <th style={{ padding:'9px 10px', fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', minWidth:90 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={locations.length + 6} style={{ padding:48, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>{rows.length === 0 ? 'No inventory records for the selected locations.' : 'No SKUs match the current filters.'}</td></tr>
              ) : filtered.map((r, i) => {
                const st = r.total === 0 ? { label:'OUT', cls:'red', color:'var(--t-danger)' }
                         : r.total <= r.reorder_point ? { label:'LOW', cls:'amber', color:'var(--t-warn)' }
                         : { label:'IN STOCK', cls:'green', color:'var(--t-success)' }
                const needsAction = st.label === 'OUT' || st.label === 'LOW'
                return (
                  <tr
                    key={r.sku}
                    onClick={() => onDetail(r)}
                    style={{
                      borderBottom:'1px solid var(--t-line)',
                      background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      cursor:'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(0,229,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background=i%2===0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
                  >
                    <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:'var(--t-text-muted)', borderRight:'1px solid var(--t-line)', whiteSpace:'nowrap' }}>{r.sku}</td>
                    <td style={{ padding:'8px 10px', fontWeight:600, color:'var(--t-text)', borderRight:'1px solid var(--t-line)', maxWidth:220 }}>{r.product_name}</td>
                    <td style={{ padding:'8px 10px', borderRight:'1px solid var(--t-line)' }}><span className="badge blue" style={{ fontSize:10 }}>{r.category}</span></td>
                    {locations.map(loc => {
                      const qty = r.byLoc?.[loc] || 0
                      const raw = rows.find(rr => rr.sku === r.sku && rr.location === loc)
                      const locSt = getStatus(qty, raw?.reorder_point ?? 0)
                      return (
                        <td key={loc} style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, fontFamily:'monospace', fontSize:13, color:locSt.color, borderRight:'1px solid var(--t-line)' }}>
                          {qty}
                        </td>
                      )
                    })}
                    <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:800, fontFamily:'monospace', fontSize:14, color:st.color, borderRight:'1px solid var(--t-line)' }}>{r.total}</td>
                    <td style={{ padding:'8px 10px', textAlign:'right', color:'var(--t-text-faint)', fontFamily:'monospace', borderRight:'1px solid var(--t-line)' }}>{r.reorder_point}</td>
                    <td style={{ padding:'8px 10px', borderRight:'1px solid var(--t-line)' }}>
                      <span className={`badge ${st.cls}`} style={{ fontSize:10, fontWeight:700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding:'8px 10px' }} onClick={e => e.stopPropagation()}>
                      {needsAction && (
                        <button
                          onClick={() => { const r2 = rows.find(rr => rr.sku === r.sku && rr.in_stock <= rr.reorder_point); if (r2) onReorder(r2) }}
                          style={{ background:'rgba(255,77,125,0.12)', border:'1px solid rgba(255,77,125,0.4)', color:'var(--t-danger)', padding:'3px 8px', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}
                        >
                          Reorder
                        </button>
                      )}
                    </td>
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

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Low Stock Alerts
// ─────────────────────────────────────────────────────────────────────────────
function TabLowStock({ rows, loading, onReorder }) {
  const alerts = useMemo(() => {
    const filtered = rows.filter(r => r.in_stock <= r.reorder_point)
    return [...filtered].sort((a, b) => a.in_stock - b.in_stock)
  }, [rows])

  const outOf = alerts.filter(r => r.in_stock === 0)
  const lowOf  = alerts.filter(r => r.in_stock > 0)

  const Section = ({ title, items, color }) => (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:11, fontWeight:700, color, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
        {title}
        <span style={{ background:color, color:'#070b14', padding:'1px 7px', fontSize:10, fontWeight:800 }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding:16, color:'var(--t-text-faint)', fontSize:12, background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>None</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {items.map(r => {
            const deficit = r.reorder_point - r.in_stock
            return (
              <div
                key={`${r.sku}-${r.location}`}
                style={{
                  display:'grid', gridTemplateColumns:'90px 1fr 110px 80px 80px 80px auto',
                  gap:0, alignItems:'center',
                  background:'var(--t-surface)', border:`1px solid ${r.in_stock===0 ? 'rgba(255,77,125,0.25)' : 'rgba(255,184,0,0.2)'}`,
                  padding:'10px 12px',
                }}
              >
                <div style={{ fontFamily:'monospace', fontSize:11, color:'var(--t-text-muted)' }}>{r.sku}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{r.product_name}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-muted)', marginTop:1 }}>{r.category}</div>
                </div>
                <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{r.location}</div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:18, fontWeight:800, color, fontFamily:'monospace' }}>{r.in_stock}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-faint)' }}>in stock</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--t-text-muted)', fontFamily:'monospace' }}>{r.reorder_point}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-faint)' }}>reorder pt</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--t-warn)', fontFamily:'monospace' }}>-{deficit}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-faint)' }}>deficit</div>
                </div>
                <button
                  onClick={() => onReorder(r)}
                  style={{ background:r.in_stock===0 ? 'rgba(255,77,125,0.15)' : 'rgba(255,184,0,0.1)', border:`1px solid ${r.in_stock===0 ? 'rgba(255,77,125,0.4)' : 'rgba(255,184,0,0.3)'}`, color, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', marginLeft:8 }}
                >
                  Request Restock
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div>
      {loading ? (
        <div style={{ padding:48, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>Loading…</div>
      ) : alerts.length === 0 ? (
        <div style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
          <div style={{ color:'var(--t-success)', fontSize:14, fontWeight:700 }}>{rows.length === 0 ? 'No inventory records for the selected locations.' : 'All stock levels are healthy'}</div>
        </div>
      ) : (
        <>
          <Section title="Out of Stock — Urgent" items={outOf} color="var(--t-danger)" />
          <Section title="Low Stock — Action Needed" items={lowOf} color="var(--t-warn)" />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Receive Inventory  (real: receive_inventory + get_inventory_receipts)
// ─────────────────────────────────────────────────────────────────────────────
function TabReceive({ rows, locations, categories, receipts, receiptsLoading, onChange, showToast }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    sku:'', location: locations[0] || '', qty:'', supplier:'',
    po:'', received_date:today, notes:'',
  })
  const [busy, setBusy] = useState(false)

  // Real product catalog derived from live inventory rows (unique SKU).
  const products = useMemo(() => {
    const map = {}
    rows.forEach(r => { if (!map[r.sku]) map[r.sku] = { sku:r.sku, name:r.product_name, cat:r.category, cost:r.unit_cost } })
    return Object.values(map).sort((a, b) => (a.cat + a.name).localeCompare(b.cat + b.name))
  }, [rows])

  const F = (key, val) => setForm(f => ({ ...f, [key]:val }))
  const selectedSku = products.find(s => s.sku === form.sku)

  const submit = async () => {
    if (!form.sku || !form.qty || !form.location) {
      showToast('Fill in SKU, location, and quantity', 'warn')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('receive_inventory', {
        p_sku:       form.sku,
        p_location:  form.location,
        p_qty:       Number(form.qty),
        p_supplier:  form.supplier || null,
        p_po:        form.po || null,
        p_date:      form.received_date,
        p_notes:     form.notes || null,
      })
      if (error) throw error
      if (data && data.ok === false) {
        showToast(`Not received — ${data.reason || 'rejected by server'}`, 'error')
        setBusy(false)
        return
      }
      showToast(`Received ${form.qty} units of ${selectedSku?.name || form.sku} @ ${form.location}`)
      setForm(f => ({ ...f, sku:'', qty:'', po:'', notes:'' }))
      await onChange()
    } catch (e) {
      showToast(`Could not record receipt — ${e.message || 'request failed'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:16, alignItems:'start' }}>
      {/* form */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:14 }}>Receive Shipment</div>
        <Field label="SKU / Product">
          <select value={form.sku} onChange={e => F('sku', e.target.value)} style={SELECT_S}>
            <option value="">— Select product —</option>
            {categories.map(cat => (
              <optgroup key={cat} label={cat}>
                {products.filter(s => s.cat === cat).map(s => (
                  <option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {selectedSku && (
          <div style={{ marginBottom:14, padding:'8px 10px', background:'rgba(0,229,255,0.05)', border:'1px solid rgba(0,229,255,0.15)', fontSize:12 }}>
            <div style={{ color:'var(--t-text-faint)' }}>Unit Cost: <span style={{ color:'var(--t-text)', fontWeight:700 }}>{fmt$(selectedSku.cost)}</span> · Category: <span style={{ color:'var(--t-accent)', fontWeight:700 }}>{selectedSku.cat}</span></div>
          </div>
        )}
        <Field label="Location">
          <select value={form.location} onChange={e => F('location', e.target.value)} style={SELECT_S}>
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Qty Received">
            <input type="number" min={1} value={form.qty} onChange={e => F('qty', e.target.value)} style={INPUT} placeholder="e.g. 24"/>
          </Field>
          <Field label="Received Date">
            <input type="date" value={form.received_date} onChange={e => F('received_date', e.target.value)} style={INPUT}/>
          </Field>
        </div>
        <Field label="Supplier">
          <input value={form.supplier} onChange={e => F('supplier', e.target.value)} style={INPUT} placeholder="Supplier name (optional)"/>
        </Field>
        <Field label="PO Number">
          <input value={form.po} onChange={e => F('po', e.target.value)} style={INPUT} placeholder="PO-XXXX (optional)"/>
        </Field>
        <Field label="Notes">
          <textarea value={form.notes} onChange={e => F('notes', e.target.value)} rows={2} style={{ ...INPUT, resize:'vertical', minHeight:52 }} placeholder="Condition notes, partial shipment, etc…"/>
        </Field>
        {form.sku && form.qty && (
          <div style={{ marginBottom:12, padding:'8px 10px', background:'var(--t-bg)', border:'1px solid var(--t-line)', fontSize:12, color:'var(--t-text-faint)' }}>
            Total cost: <span style={{ color:'var(--t-text)', fontWeight:700 }}>{fmt$((selectedSku?.cost || 0) * Number(form.qty || 0))}</span>
          </div>
        )}
        <button onClick={submit} disabled={busy} style={{ ...BTN('accent'), width:'100%', padding:10, textAlign:'center' }}>
          {busy ? 'Processing…' : 'Record Receipt'}
        </button>
      </div>

      {/* receipt log */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:10 }}>
          Recent Receipts
        </div>
        {receiptsLoading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--t-text-faint)', fontSize:13, background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>Loading…</div>
        ) : receipts.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--t-text-faint)', fontSize:13, background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>No receipts recorded yet. Record a shipment to see it here.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {receipts.map(r => (
              <div key={r.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr 110px 80px 80px', gap:0, alignItems:'center', background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{fmtDate(r.date)}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{r.product}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-muted)', marginTop:1 }}>{r.sku}{r.reason ? ` · ${r.reason}` : ''}</div>
                </div>
                <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{r.location || '—'}</div>
                <div style={{ textAlign:'right', fontSize:14, fontWeight:800, color:'var(--t-success)', fontFamily:'monospace' }}>+{r.qty}</div>
                <div style={{ textAlign:'right', fontSize:12, color:'var(--t-text-faint)', fontFamily:'monospace' }}>{fmt$(r.cost)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — Transfers  (real: transfer_inventory + get_inventory_transfers)
// ─────────────────────────────────────────────────────────────────────────────
function TabTransfers({ rows, locations, categories, transfers, transfersLoading, onChange, showToast }) {
  const [form, setForm] = useState({ sku:'', from: locations[0] || '', to: locations[1] || locations[0] || '', qty:'' })
  const [busy, setBusy]  = useState(false)
  const [filter, setFilter] = useState('all')

  const products = useMemo(() => {
    const map = {}
    rows.forEach(r => { if (!map[r.sku]) map[r.sku] = { sku:r.sku, name:r.product_name, cat:r.category } })
    return Object.values(map).sort((a, b) => (a.cat + a.name).localeCompare(b.cat + b.name))
  }, [rows])

  const F = (key, val) => setForm(f => ({ ...f, [key]:val }))
  const selectedSku = products.find(s => s.sku === form.sku)
  const fromQty = rows.filter(r => r.sku === form.sku && r.location === form.from).reduce((a, r) => a + r.in_stock, 0)

  const submit = async () => {
    if (!form.sku || !form.qty || form.from === form.to) {
      showToast('Select item, quantity, and different from/to locations', 'warn')
      return
    }
    if (Number(form.qty) > fromQty) {
      showToast(`Only ${fromQty} units available at ${form.from}`, 'warn')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('transfer_inventory', {
        p_sku:   form.sku,
        p_from:  form.from,
        p_to:    form.to,
        p_qty:   Number(form.qty),
      })
      if (error) throw error
      if (data && data.ok === false) {
        showToast(`Transfer failed — ${data.reason || 'rejected by server'}`, 'error')
        setBusy(false)
        return
      }
      showToast(`Transferred ${selectedSku?.name || form.sku} × ${form.qty}: ${form.from} → ${form.to}`)
      setForm(f => ({ ...f, sku:'', qty:'' }))
      await onChange()
    } catch (e) {
      showToast(`Could not submit transfer — ${e.message || 'request failed'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const visible = filter === 'all' ? transfers : transfers.filter(t => t.direction === filter)

  return (
    <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', gap:16, alignItems:'start' }}>
      {/* form */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:14 }}>New Transfer</div>
        <Field label="SKU / Product">
          <select value={form.sku} onChange={e => F('sku', e.target.value)} style={SELECT_S}>
            <option value="">— Select product —</option>
            {categories.map(cat => (
              <optgroup key={cat} label={cat}>
                {products.filter(s => s.cat === cat).map(s => (
                  <option key={s.sku} value={s.sku}>{s.sku} — {s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="From Location">
            <select value={form.from} onChange={e => F('from', e.target.value)} style={SELECT_S}>
              {locations.map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="To Location">
            <select value={form.to} onChange={e => F('to', e.target.value)} style={SELECT_S}>
              {locations.filter(l => l !== form.from).map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
        </div>
        {form.sku && (
          <div style={{ marginBottom:12, padding:'8px 10px', background:'var(--t-bg)', border:'1px solid var(--t-line)', fontSize:12 }}>
            <div style={{ color:'var(--t-text-faint)' }}>Available @ {form.from}: <span style={{ color: fromQty === 0 ? 'var(--t-danger)' : 'var(--t-success)', fontWeight:700, fontFamily:'monospace' }}>{fromQty} units</span></div>
          </div>
        )}
        <Field label="Qty to Transfer">
          <input type="number" min={1} max={fromQty||999} value={form.qty} onChange={e => F('qty', e.target.value)} style={INPUT} placeholder="Units"/>
        </Field>
        <button onClick={submit} disabled={busy} style={{ ...BTN('accent'), width:'100%', padding:10, textAlign:'center' }}>
          {busy ? 'Submitting…' : 'Submit Transfer'}
        </button>
      </div>

      {/* transfer list */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase' }}>Transfer Log</div>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...SELECT_S, width:'auto', minWidth:120 }}>
            <option value="all">All</option>
            <option value="out">Sent</option>
            <option value="in">Received</option>
          </select>
        </div>
        {transfersLoading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--t-text-faint)', fontSize:13, background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--t-text-faint)', fontSize:13, background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>{transfers.length === 0 ? 'No transfers recorded yet.' : 'No transfers for this filter.'}</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {visible.map(t => (
              <div key={t.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 90px', gap:0, alignItems:'center', background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{fmtDate(t.date)}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{t.product}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-muted)', marginTop:1 }}>{t.sku}</div>
                </div>
                <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{t.location || '—'}</div>
                <div style={{ textAlign:'right', fontSize:14, fontWeight:800, color: t.direction === 'out' ? 'var(--t-warn)' : 'var(--t-success)', fontFamily:'monospace' }}>{t.direction === 'out' ? '-' : '+'}{t.qty}</div>
                <div style={{ textAlign:'right' }}><span className={`badge ${t.direction === 'out' ? 'amber' : 'green'}`} style={{ fontSize:10 }}>{t.direction === 'out' ? 'Sent' : 'Received'}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — Reports
// ─────────────────────────────────────────────────────────────────────────────
function TabReports({ rows, receipts, transfers, locations, categories }) {
  const [drill, setDrill] = useState(null)
  const pivoted = useMemo(() => pivotSkus(rows), [rows])

  // value by location (cost basis — real)
  const locValue = useMemo(() => locations.map(loc => {
    const locRows = rows.filter(r => r.location === loc)
    const val = locRows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0)
    const units = locRows.reduce((a, r) => a + r.in_stock, 0)
    const low  = locRows.filter(r => r.in_stock > 0 && r.in_stock <= r.reorder_point).length
    const out  = locRows.filter(r => r.in_stock === 0).length
    return { loc, val, units, low, out }
  }), [rows, locations])

  // value by category (cost basis — real)
  const catValue = useMemo(() => categories.map(cat => {
    const catRows = rows.filter(r => r.category === cat)
    const val   = catRows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0)
    const units = catRows.reduce((a, r) => a + r.in_stock, 0)
    return { cat, val, units }
  }).filter(c => c.units > 0).sort((a, b) => b.val - a.val), [rows, categories])

  const topMovers = useMemo(() => [...pivoted].sort((a, b) => b.total - a.total).slice(0, 10), [pivoted])
  const slowMovers = useMemo(() => [...pivoted].filter(r => r.total > 0).sort((a, b) => a.total - b.total).slice(0, 10), [pivoted])

  const totalVal      = rows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0)
  const totalUnits    = rows.reduce((a, r) => a + r.in_stock, 0)
  const receiptUnits  = receipts.reduce((a, r) => a + (Number(r.qty) || 0), 0)

  const maxLocVal = Math.max(...locValue.map(l => l.val), 1)

  const BarRow = ({ label, val, max, color }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
      <div style={{ width:80, fontSize:11, color:'var(--t-text-muted)', textAlign:'right', flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, background:'var(--t-bg)', border:'1px solid var(--t-line)', height:18, position:'relative' }}>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${Math.round(val/max*100)}%`, background:color||'var(--t-accent)', opacity:0.8 }}/>
      </div>
      <div style={{ width:80, fontSize:12, fontWeight:700, color:'var(--t-text)', fontFamily:'monospace', flexShrink:0, textAlign:'right' }}>{fmt$(val)}</div>
    </div>
  )

  const MoverRow = ({ r, rank, label }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 10px', background: rank<=3 ? 'rgba(0,229,255,0.04)' : 'transparent', borderBottom:'1px solid var(--t-line)' }}>
      <div style={{ width:20, fontSize:11, color:'var(--t-text-faint)', fontWeight:700, textAlign:'center' }}>#{rank}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--t-text)' }}>{r.product_name}</div>
        <div style={{ fontSize:10, color:'var(--t-text-faint)', marginTop:1 }}>{r.sku} · {r.category}</div>
      </div>
      <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, color:'var(--t-text-muted)' }}>{r.total} {label}</div>
    </div>
  )

  const inStockRows = rows.filter(r => r.in_stock > 0)
  const palette = ['var(--t-accent)','var(--t-success)','var(--t-warn)','#c67cff','var(--t-danger)']
  const openDrill = (title, columns, drillRows, accent) => setDrill({ title, subtitle: `${drillRows.length} record${drillRows.length === 1 ? '' : 's'}`, columns, rows: drillRows, accent })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* summary KPIs (all real) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8 }}>
        <KTile label="Total Inv Value (Cost)" value={fmt$(totalVal)}      color="var(--t-accent)"
          onClick={() => openDrill('Total Inventory Value (Cost)', STOCK_COLS, inStockRows, 'var(--t-accent)')} />
        <KTile label="Total Units"            value={totalUnits.toLocaleString()} sub="all locations"
          onClick={() => openDrill('Stock Records — All Units', STOCK_COLS, inStockRows, 'var(--t-accent)')} />
        <KTile label="Distinct SKUs"          value={new Set(rows.map(r => r.sku)).size} sub="unique products"
          onClick={() => openDrill('All SKUs', STOCK_COLS, inStockRows, 'var(--t-accent)')} />
        <KTile label="Receipts Logged"        value={receipts.length}     sub={`${receiptUnits} units received`}
          onClick={() => openDrill('Receipts', RECEIPT_COLS, receipts, 'var(--t-accent)')} />
        <KTile label="Transfers Logged"       value={transfers.length}    sub="cross-location legs"
          onClick={() => openDrill('Transfers', TRANSFER_COLS, transfers, 'var(--t-accent)')} />
        <KTile label="Out of Stock"           value={rows.filter(r => r.in_stock === 0).length} color="var(--t-warn)"
          onClick={() => openDrill('Out-of-Stock Records', STOCK_COLS, rows.filter(r => r.in_stock === 0), 'var(--t-warn)')} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
        {/* Inventory value by location */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:14 }}>Inventory Value by Location (Cost Basis)</div>
          {locValue.length === 0 ? <div style={{ color:'var(--t-text-faint)', fontSize:12 }}>No data.</div> : locValue.map((l, i) => (
            <BarRow key={l.loc} label={l.loc} val={l.val} max={maxLocVal} color={palette[i % palette.length]}/>
          ))}
          {locValue.length > 0 && (
            <div style={{ marginTop:12, borderTop:'1px solid var(--t-line)', paddingTop:10 }}>
              {locValue.map(l => (
                <div key={l.loc} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:4, marginBottom:4 }}>
                  <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{l.loc}</div>
                  <div style={{ fontSize:11, textAlign:'right', fontFamily:'monospace', color:'var(--t-text)' }}>{l.units} units</div>
                  <div style={{ textAlign:'right' }}><span className="badge amber" style={{ fontSize:9 }}>{l.low} low</span></div>
                  <div style={{ textAlign:'right' }}><span className="badge red" style={{ fontSize:9 }}>{l.out} out</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Value by category */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:10 }}>Inventory by Category (Cost Basis)</div>
          {catValue.length === 0 ? <div style={{ color:'var(--t-text-faint)', fontSize:12 }}>No data.</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', color:'var(--t-text-faint)', fontWeight:700, letterSpacing:'.05em' }}>Category</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', color:'var(--t-text-faint)', fontWeight:700 }}>Units</th>
                  <th style={{ padding:'6px 8px', textAlign:'right', color:'var(--t-text-faint)', fontWeight:700 }}>Cost Value</th>
                </tr>
              </thead>
              <tbody>
                {catValue.map(c => (
                  <tr key={c.cat} style={{ borderBottom:'1px solid var(--t-line)' }}>
                    <td style={{ padding:'6px 8px', color:'var(--t-text)' }}>{c.cat}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'var(--t-text-muted)' }}>{c.units}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'var(--t-text)' }}>{fmt$(c.val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* top / slow movers */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--t-line)', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em', textTransform:'uppercase' }}>Top 10 SKUs — Highest Stock</div>
          {topMovers.length === 0 ? <div style={{ padding:16, color:'var(--t-text-faint)', fontSize:12 }}>No data.</div> : topMovers.map((r, i) => <MoverRow key={r.sku} r={r} rank={i+1} label="units"/>)}
        </div>
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--t-line)', fontSize:11, fontWeight:700, color:'var(--t-warn)', letterSpacing:'.06em', textTransform:'uppercase' }}>Lowest Stock (In Stock Only)</div>
          {slowMovers.length === 0 ? <div style={{ padding:16, color:'var(--t-text-faint)', fontSize:12 }}>No data.</div> : slowMovers.map((r, i) => <MoverRow key={r.sku} r={r} rank={i+1} label="units"/>)}
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FORENSIC KPI PANEL (always visible at top)
// ─────────────────────────────────────────────────────────────────────────────
function ForensicKPIPanel({ rows, receipts, transfers, locations, loading }) {
  const [drill, setDrill] = useState(null)
  const uniqueSkuRows = useMemo(() => {
    const seen = new Set(); const out = []
    rows.forEach(r => { if (!seen.has(r.sku)) { seen.add(r.sku); out.push(r) } })
    return out
  }, [rows])

  const totalSkus     = new Set(rows.map(r => r.sku)).size
  const totalUnits    = rows.reduce((a, r) => a + r.in_stock, 0)
  const totalVal      = rows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0)
  const lowItems      = rows.filter(r => r.in_stock > 0 && r.in_stock <= r.reorder_point).length
  const outItems      = rows.filter(r => r.in_stock === 0).length
  const reorderPending = rows.filter(r => r.in_stock <= r.reorder_point).length

  const receiptUnits  = receipts.reduce((a, r) => a + (Number(r.qty) || 0), 0)
  const categoryCount = new Set(rows.map(r => r.category)).size

  if (loading) return (
    <div style={{ padding:'12px 0', display:'flex', gap:8 }}>
      {[1,2,3,4].map(i => <div key={i} style={{ flex:'1 1 140px', height:72, background:'var(--t-surface)', border:'1px solid var(--t-line)', opacity:0.5 }}/>)}
    </div>
  )

  const openDrill = (title, columns, drillRows, accent) => setDrill({ title, subtitle: `${drillRows.length} record${drillRows.length === 1 ? '' : 's'}`, columns, rows: drillRows, accent })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {/* Row 1 — stock (real) */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <KTile label="Total SKUs"       value={totalSkus}         sub="unique products"                                 color="var(--t-accent)"
          onClick={() => openDrill('All SKUs', STOCK_COLS, uniqueSkuRows, 'var(--t-accent)')} />
        <KTile label="Total Units"      value={totalUnits.toLocaleString()} sub="all locations combined"              color="var(--t-text)"
          onClick={() => openDrill('Stock Records — All Units', STOCK_COLS, rows.filter(r => r.in_stock > 0), 'var(--t-accent)')} />
        <KTile label="Inventory Value"  value={fmt$(totalVal)}    sub="cost basis"                                      color="var(--t-accent)"
          onClick={() => openDrill('Inventory Value by Stock Record', STOCK_COLS, rows.filter(r => r.in_stock > 0), 'var(--t-accent)')} />
        <KTile label="Low Stock Items"  value={lowItems}          sub="at or below reorder pt"    alert={lowItems>3 ? 'amber' : undefined}  color="var(--t-warn)"
          onClick={() => openDrill('Low Stock Items', STOCK_COLS, rows.filter(r => r.in_stock > 0 && r.in_stock <= r.reorder_point), 'var(--t-warn)')} />
        <KTile label="Out of Stock"     value={outItems}          sub="zero units on hand"         alert={outItems>0 ? 'red'   : undefined}  color={outItems>0 ? 'var(--t-danger)' : 'var(--t-success)'}
          onClick={() => openDrill('Out of Stock', STOCK_COLS, rows.filter(r => r.in_stock === 0), 'var(--t-danger)')} />
        <KTile label="Reorder Pending"  value={reorderPending}    sub="items needing attention"    alert={reorderPending>5 ? 'amber' : undefined}
          onClick={() => openDrill('Reorder Pending', STOCK_COLS, rows.filter(r => r.in_stock <= r.reorder_point), 'var(--t-warn)')} />
      </div>

      {/* Row 2 — movement (real) */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <KTile label="Categories"           value={categoryCount}   sub="distinct product lines"           color="var(--t-text)"
          onClick={() => openDrill('Stock Records — All Units', STOCK_COLS, rows.filter(r => r.in_stock > 0), 'var(--t-accent)')} />
        <KTile label="Locations"            value={locations.length} sub="stocking sites"                  color="var(--t-text)"
          onClick={() => openDrill('Stock Records — All Units', STOCK_COLS, rows.filter(r => r.in_stock > 0), 'var(--t-accent)')} />
        <KTile label="Receipts Logged"      value={receipts.length} sub={`${receiptUnits} units received`} color="var(--t-success)"
          onClick={() => openDrill('Receipts', RECEIPT_COLS, receipts, 'var(--t-success)')} />
        <KTile label="Transfers Logged"     value={transfers.length} sub="cross-location legs"             color="var(--t-accent)"
          onClick={() => openDrill('Transfers', TRANSFER_COLS, transfers, 'var(--t-accent)')} />
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Row 3 — by-location compact grid (real) */}
      {locations.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(locations.length, 5)},1fr)`, gap:4 }}>
          {locations.map(loc => {
            const lRows  = rows.filter(r => r.location === loc)
            const lSkus  = new Set(lRows.map(r => r.sku)).size
            const lUnits = lRows.reduce((a, r) => a + r.in_stock, 0)
            const lVal   = lRows.reduce((a, r) => a + r.in_stock * r.unit_cost, 0)
            const lLow   = lRows.filter(r => r.in_stock > 0 && r.in_stock <= r.reorder_point).length
            return (
              <div key={loc} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--t-accent)', letterSpacing:'.07em', textTransform:'uppercase', marginBottom:6 }}>{loc}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                  <div>
                    <div style={{ fontSize:9, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.05em' }}>SKUs</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'var(--t-text)', fontFamily:'monospace' }}>{lSkus}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.05em' }}>Units</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'var(--t-text)', fontFamily:'monospace' }}>{lUnits}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.05em' }}>Value</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--t-accent)', fontFamily:'monospace' }}>{fmt$(lVal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'var(--t-text-faint)', textTransform:'uppercase', letterSpacing:'.05em' }}>Low</div>
                    <div style={{ fontSize:13, fontWeight:700, color: lLow>0 ? 'var(--t-warn)' : 'var(--t-success)', fontFamily:'monospace' }}>{lLow}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ['Stock Overview', 'Low Stock Alerts', 'Receive Inventory', 'Transfers', 'Reports']

export default function Inventory() {
  const { session }     = useAuth()
  const { locationIds, locations: scopeLocations, nodes } = useScope()

  const requesterId = session?.person?.id || null

  const [rows,    setRows]    = useState([])
  const [receipts, setReceipts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [subLoading, setSubLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('Stock Overview')
  const [detail,  setDetail]  = useState(null)
  const [restock, setRestock] = useState(null)
  const { toasts, show:showToast } = useToast()

  // node_id → readable name (from the session's node tree)
  const nodeName = useCallback((id) => {
    const n = (nodes || []).find(x => x.id === id)
    return n ? n.name : (id || '—')
  }, [nodes])

  // The set of locations this scope can stock into (real location nodes).
  const locations = useMemo(
    () => (scopeLocations || []).map(l => l.name),
    [scopeLocations]
  )

  const idsKey = (locationIds || []).join(',')

  // ── load current stock ────────────────────────────────────────────────────────
  const loadStock = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ids = locationIds?.length ? locationIds : []
      const { data, error } = await sb.rpc('get_inventory', { p_node_ids: ids })
      if (error) throw error
      setRows((data || []).map(r => mapInventory(r, nodeName)))
    } catch (e) {
      setRows([])
      setError(e.message || 'Could not load inventory.')
    } finally {
      setLoading(false)
    }
  }, [idsKey, nodeName])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── load movement history (receipts + transfers) ──────────────────────────────
  const loadHistory = useCallback(async () => {
    setSubLoading(true)
    try {
      const ids = locationIds?.length ? locationIds : []
      const [rcpt, xfer] = await Promise.all([
        sb.rpc('get_inventory_receipts', { p_node_ids: ids }),
        sb.rpc('get_inventory_transfers', { p_node_ids: ids }),
      ])
      setReceipts(rcpt.error ? [] : (rcpt.data || []))
      setTransfers(xfer.error ? [] : (xfer.data || []))
    } catch {
      setReceipts([]); setTransfers([])
    } finally {
      setSubLoading(false)
    }
  }, [idsKey])  // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    await Promise.all([loadStock(), loadHistory()])
  }, [loadStock, loadHistory])

  useEffect(() => { reload() }, [reload])

  // categories derived from live data
  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category).filter(Boolean))
    return [...set].sort()
  }, [rows])

  const handleDetail  = r  => setDetail(r)
  const handleReorder = r  => { setDetail(null); setRestock(r) }
  const closeDetail   = () => setDetail(null)
  const closeRestock  = () => setRestock(null)
  const doneRestock   = () => { setRestock(null); reload() }

  const outCount = rows.filter(r => r.in_stock === 0).length
  const lowCount = rows.filter(r => r.in_stock > 0 && r.in_stock <= r.reorder_point).length

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0, height:'100%', position:'relative' }}>

      {/* ── page header ────────────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 20px', borderBottom:'1px solid var(--t-line)', flexShrink:0,
        background:'var(--t-surface)',
      }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)', letterSpacing:'-0.01em' }}>Inventory Manager</div>
          <div style={{ fontSize:11, color:'var(--t-text-faint)', marginTop:2 }}>
            Stock levels · reorder tracking · transfers · receipts · reports
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {(outCount > 0 || lowCount > 0) && (
            <div style={{ fontSize:11, padding:'4px 10px', background:'rgba(255,77,125,0.1)', border:'1px solid rgba(255,77,125,0.3)', color:'var(--t-danger)', fontWeight:700 }}>
              {outCount > 0 ? `${outCount} OUT` : ''}{outCount > 0 && lowCount > 0 ? ' · ' : ''}{lowCount > 0 ? `${lowCount} LOW` : ''}
            </div>
          )}
          <button onClick={reload} disabled={loading} style={{ ...BTN('ghost'), fontSize:11, padding:'5px 12px' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* scrollable body */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>

        {error && (
          <div style={{ margin:'12px 20px 0', padding:'10px 14px', background:'rgba(255,77,125,0.1)', border:'1px solid rgba(255,77,125,0.3)', color:'var(--t-danger)', fontSize:12, fontWeight:600 }}>
            {error}
          </div>
        )}

        {/* ── forensic KPI panel ──────────────────────────────────────────────── */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--t-line)', background:'var(--t-bg)' }}>
          <ForensicKPIPanel rows={rows} receipts={receipts} transfers={transfers} locations={locations} loading={loading}/>
        </div>

        {/* ── tab bar ─────────────────────────────────────────────────────────── */}
        <div style={{ background:'var(--t-surface)', flexShrink:0 }}>
          <TabBar tabs={TABS} active={tab} onSelect={setTab}/>
        </div>

        {/* ── tab content ─────────────────────────────────────────────────────── */}
        <div style={{ padding:'16px 20px', flex:1 }}>
          {tab === 'Stock Overview' && (
            <TabStockOverview
              rows={rows}
              loading={loading}
              locations={locations}
              categories={categories}
              onDetail={handleDetail}
              onReorder={handleReorder}
            />
          )}
          {tab === 'Low Stock Alerts' && (
            <TabLowStock
              rows={rows}
              loading={loading}
              onReorder={handleReorder}
            />
          )}
          {tab === 'Receive Inventory' && (
            <TabReceive
              rows={rows}
              locations={locations}
              categories={categories}
              receipts={receipts}
              receiptsLoading={subLoading}
              onChange={reload}
              showToast={showToast}
            />
          )}
          {tab === 'Transfers' && (
            <TabTransfers
              rows={rows}
              locations={locations}
              categories={categories}
              transfers={transfers}
              transfersLoading={subLoading}
              onChange={reload}
              showToast={showToast}
            />
          )}
          {tab === 'Reports' && (
            <TabReports
              rows={rows}
              receipts={receipts}
              transfers={transfers}
              locations={locations}
              categories={categories}
            />
          )}
        </div>

      </div>

      {/* ── item detail side panel ──────────────────────────────────────────────── */}
      {detail && (
        <ItemDetailPanel
          item={detail}
          rows={rows}
          onClose={closeDetail}
          onReorder={handleReorder}
        />
      )}

      {/* ── restock modal ───────────────────────────────────────────────────────── */}
      {restock && (
        <RestockModal
          row={restock}
          requesterId={requesterId}
          onClose={closeRestock}
          onDone={doneRestock}
          showToast={showToast}
        />
      )}

      {/* ── toasts ─────────────────────────────────────────────────────────────── */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:2000, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              background: t.type==='warn' ? 'var(--t-warn)' : t.type==='error' ? 'var(--t-danger)' : 'var(--t-success)',
              color:'#070b14', padding:'10px 16px', fontSize:13, fontWeight:700,
              maxWidth:360, boxShadow:'0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>

    </div>
  )
}
