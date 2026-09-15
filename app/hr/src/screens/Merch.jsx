import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'
import { companyName } from '../lib/config.js'

// ── style helpers ─────────────────────────────────────────────────────────────
const S = {
  th: { padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: '#0a0f18', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', fontSize: 12, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' },
  panel: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  sec: { fontSize: 10, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em' },
  inp: { background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, padding: '7px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  btn: (variant = 'default') => ({
    padding: '8px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    background: variant === 'accent' ? 'var(--t-accent)' : variant === 'ghost' ? 'transparent' : 'rgba(255,255,255,0.06)',
    color: variant === 'accent' ? '#070b14' : 'var(--t-text)',
    borderWidth: 1, borderStyle: 'solid',
    borderColor: variant === 'accent' ? 'var(--t-accent)' : 'var(--t-line)',
  }),
}

const fmt$ = (n) => n === 0 ? 'Free' : `$${parseFloat(n || 0).toFixed(2)}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ── status badge ──────────────────────────────────────────────────────────────
const STATUS_META = {
  Pending:    { bg: 'rgba(255,184,0,0.1)',    border: 'rgba(255,184,0,0.35)',    color: '#ffb800' },
  Processing: { bg: 'rgba(41,121,255,0.1)',   border: 'rgba(41,121,255,0.35)',   color: '#2979ff' },
  Shipped:    { bg: 'rgba(124,77,255,0.1)',   border: 'rgba(124,77,255,0.35)',   color: '#7c4dff' },
  Delivered:  { bg: 'rgba(42,214,160,0.1)',   border: 'rgba(42,214,160,0.35)',   color: '#2ad6a0' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { bg: 'rgba(255,255,255,0.05)', border: 'var(--t-line)', color: 'var(--t-text-muted)' }
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 8px', background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {status}
    </span>
  )
}

// ── cat badge ─────────────────────────────────────────────────────────────────
const CAT_COLORS = { Apparel: '#7c4dff', Uniform: '#2ad6a0', Accessories: '#00e5ff', Supplies: '#ffb800' }
function CatBadge({ cat }) {
  const c = CAT_COLORS[cat] || 'var(--t-text-muted)'
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', background: `${c}18`, border: `1px solid ${c}55`, color: c }}>{cat}</span>
  )
}

// ── drill-down columns ────────────────────────────────────────────────────────
const ORDER_COLS = [
  { key: 'employee_name', label: 'Employee', value: o => o.employee_name },
  { key: 'location', label: 'Location', value: o => o.location },
  { key: 'item_name', label: 'Item', value: o => `${o.item_emoji || ''} ${o.item_name}` },
  { key: 'size', label: 'Size', value: o => o.size },
  { key: 'quantity', label: 'Qty', value: o => o.quantity, align: 'right', sortKey: o => o.quantity },
  { key: 'price', label: 'Value', value: o => fmt$((o.price || 0) * (o.quantity || 1)), align: 'right', sortKey: o => (o.price || 0) * (o.quantity || 1) },
  { key: 'status', label: 'Status', value: o => o.status },
  { key: 'ordered_at', label: 'Ordered', value: o => fmtDate(o.ordered_at), sortKey: o => o.ordered_at },
  { key: 'tracking_number', label: 'Tracking', value: o => o.tracking_number || '—' },
]
const MERCH_COLS = [
  { key: 'name', label: 'Item', value: i => `${i.emoji || ''} ${i.name}` },
  { key: 'cat', label: 'Category', value: i => i.cat },
  { key: 'price', label: 'Price', value: i => fmt$(i.price), align: 'right', sortKey: i => i.price },
  { key: 'company', label: 'Provided', value: i => (i.company ? 'Yes' : 'No') },
  { key: 'sizes', label: 'Sizes', value: i => i.sizes.join(', ') },
  { key: 'lowStock', label: 'Stock', value: i => (i.lowStock ? 'Low' : 'OK') },
]

// ── KPI tile ──────────────────────────────────────────────────────────────────
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

// ── item image placeholder ────────────────────────────────────────────────────
function ItemImg({ item, size = 80 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, background: item.company ? 'rgba(42,214,160,0.06)' : 'rgba(0,229,255,0.06)', border: `1px solid ${item.company ? 'rgba(42,214,160,0.2)' : 'var(--t-line)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4 }}>
      {item.emoji || '🏷️'}
    </div>
  )
}

// ── CART SIDEBAR ──────────────────────────────────────────────────────────────
function CartSidebar({ cart, items, onUpdateQty, onRemove, onCheckout, onClose }) {
  const total = cart.reduce((s, c) => {
    const item = items.find(i => i.id === c.itemId)
    return s + (item?.price || 0) * c.qty
  }, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ background: '#0a0f18', borderLeft: '1px solid var(--t-line)', width: '100%', maxWidth: 380, height: '100%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>Cart ({cart.length})</div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>Your cart is empty</div>
          ) : cart.map((entry, i) => {
            const item = items.find(it => it.id === entry.itemId)
            if (!item) return null
            return (
              <div key={i} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 12px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <ItemImg item={item} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 6 }}>Size: {entry.size} · {item.price === 0 ? 'Free' : fmt$(item.price)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => onUpdateQty(i, Math.max(1, entry.qty - 1))} style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer', fontSize: 14 }}>−</button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', minWidth: 20, textAlign: 'center' }}>{entry.qty}</span>
                      <button onClick={() => onUpdateQty(i, Math.min(10, entry.qty + 1))} style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer', fontSize: 14 }}>+</button>
                      <button onClick={() => onRemove(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 6px' }}>Remove</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-accent)', flexShrink: 0 }}>
                    {item.price === 0 ? 'Free' : fmt$(item.price * entry.qty)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>Order Total</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--t-accent)' }}>{total === 0 ? 'Free' : fmt$(total)}</span>
          </div>
          <button onClick={onCheckout} disabled={cart.length === 0} style={{ ...S.btn('accent'), width: '100%', opacity: cart.length === 0 ? 0.4 : 1, padding: '11px 0' }}>
            Place Order
          </button>
          <button onClick={onClose} style={{ ...S.btn('ghost'), width: '100%', padding: '8px 0', borderColor: 'transparent', color: 'var(--t-text-muted)', fontSize: 11 }}>
            Continue Shopping
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ADD TO CART MODAL ─────────────────────────────────────────────────────────
function AddToCartModal({ item, onAdd, onClose }) {
  const sizes = (item.sizes && item.sizes.length) ? item.sizes : ['One Size']
  const [size, setSize] = useState(sizes[0])
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#0a0f18', border: '1px solid var(--t-line)', width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,229,255,0.04)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-accent)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Add to Cart</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{item.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: '18px 18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Description */}
          {item.desc && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>{item.desc}</div>}
          <div style={{ fontSize: 14, fontWeight: 800, color: item.price === 0 ? '#2ad6a0' : 'var(--t-accent)' }}>{fmt$(item.price)}</div>

          {/* Size */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Size</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sizes.map(s => (
                <button key={s} onClick={() => setSize(s)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: size === s ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${size === s ? 'var(--t-accent)' : 'var(--t-line)'}`, color: size === s ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em' }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Qty */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Quantity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer', fontSize: 18 }}>−</button>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', minWidth: 32, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(Math.min(10, qty + 1))} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer', fontSize: 18 }}>+</button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Delivery Notes (optional)</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Leave at front desk, attention HR, etc." rows={2} style={{ ...S.inp, width: '100%', resize: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => { onAdd({ itemId: item.id, size, qty, notes }); onClose() }} style={{ flex: 2, padding: '10px 0', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Add to Cart</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SHOP TAB ──────────────────────────────────────────────────────────────────
function ShopTab({ personId, items, cart, onAddToCart, onOpenCart, onCheckout }) {
  const [catFilter, setCatFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [addingItem, setAddingItem] = useState(null)

  const cats = useMemo(() => ['All', ...Array.from(new Set(items.map(i => i.cat).filter(Boolean)))], [items])

  const filtered = useMemo(() => {
    let list = [...items]
    if (catFilter !== 'All') list = list.filter(i => i.cat === catFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i => (i.name || '').toLowerCase().includes(q) || (i.cat || '').toLowerCase().includes(q))
    }
    return list
  }, [items, catFilter, search])

  const cartTotal = cart.reduce((s, c) => {
    const item = items.find(i => i.id === c.itemId)
    return s + (item?.price || 0) * c.qty
  }, 0)
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters + cart button row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-faint)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search merchandise…" style={{ ...S.inp, paddingLeft: 28, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '5px 11px', fontSize: 10, fontWeight: 700, background: catFilter === c ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${catFilter === c ? 'var(--t-accent)' : 'var(--t-line)'}`, color: catFilter === c ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em' }}>{c}</button>
          ))}
        </div>
        <button onClick={onOpenCart} style={{ padding: '7px 14px', background: cartCount > 0 ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${cartCount > 0 ? 'var(--t-accent)' : 'var(--t-line)'}`, color: cartCount > 0 ? 'var(--t-accent)' : 'var(--t-text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}>
          🛒 Cart {cartCount > 0 ? `(${cartCount}) · ${cartTotal === 0 ? 'Free' : `$${cartTotal.toFixed(2)}`}` : '(0)'}
        </button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No Merchandise Available</div>
          <div style={{ fontSize: 12 }}>{search || catFilter !== 'All' ? 'No items match your filters.' : 'The company store catalog is empty. Items added by HR will appear here.'}</div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {filtered.map(item => {
          const inCart = cart.filter(c => c.itemId === item.id).reduce((s, c) => s + c.qty, 0)
          return (
            <div key={item.id} style={{ background: 'var(--t-surface)', border: `1px solid ${item.lowStock ? 'rgba(255,184,0,0.3)' : 'var(--t-line)'}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Top stripe */}
              <div style={{ height: 2, background: CAT_COLORS[item.cat] || 'var(--t-accent)', opacity: 0.7 }} />

              {/* Image area */}
              <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--t-line)', position: 'relative' }}>
                <ItemImg item={item} size={70} />
                {item.company && (
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(42,214,160,0.15)', border: '1px solid rgba(42,214,160,0.4)', color: '#2ad6a0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Provided</span>
                )}
                {item.lowStock && (
                  <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.4)', color: '#ffb800', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Low Stock</span>
                )}
                {inCart > 0 && (
                  <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--t-accent)' }}>{inCart} in cart</span>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                  <CatBadge cat={item.cat} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.3 }}>{item.name}</div>
                {item.desc && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', lineHeight: 1.5, flexGrow: 1 }}>{item.desc.slice(0, 80)}{item.desc.length > 80 ? '…' : ''}</div>}

                {/* Sizes preview */}
                {(item.sizes?.length || 0) > 1 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {item.sizes.slice(0, 5).map(s => (
                      <span key={s} style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', fontWeight: 600 }}>{s}</span>
                    ))}
                    {item.sizes.length > 5 && <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>+{item.sizes.length - 5}</span>}
                  </div>
                )}

                {/* Price + CTA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: item.price === 0 ? '#2ad6a0' : 'var(--t-accent)' }}>{fmt$(item.price)}</span>
                  <button onClick={() => setAddingItem(item)} style={{ padding: '7px 14px', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {inCart > 0 ? 'Add More' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {addingItem && (
        <AddToCartModal item={addingItem} onAdd={onAddToCart} onClose={() => setAddingItem(null)} />
      )}
    </div>
  )
}

// ── MY ORDERS TAB ─────────────────────────────────────────────────────────────
function MyOrdersTab({ personId, orders, items }) {
  const myOrders = useMemo(() => {
    return orders.filter(o => o.person_id === personId)
  }, [orders, personId])

  const [reorderItem, setReorderItem] = useState(null)

  if (myOrders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No Orders Yet</div>
        <div style={{ fontSize: 12 }}>Head to the Shop tab to place your first order.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {myOrders.map(order => {
        const item = items.find(i => i.id === order.item_id)
        return (
          <div key={order.id} style={{ background: 'var(--t-surface)', border: `1px solid ${order.status === 'Delivered' ? 'rgba(42,214,160,0.25)' : 'var(--t-line)'}`, padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{order.item_emoji || '🏷️'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 3 }}>{order.item_name}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={order.status} />
                      <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Size: {order.size}</span>
                      <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Qty: {order.quantity}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: order.price === 0 ? '#2ad6a0' : 'var(--t-accent)' }}>{order.price === 0 ? 'Free' : `$${(order.price * order.quantity).toFixed(2)}`}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 2 }}>Ordered</div>
                    <div style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 600 }}>{fmtDate(order.ordered_at)}</div>
                  </div>
                </div>

                {/* Tracking */}
                {order.tracking_number && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(124,77,255,0.06)', border: '1px solid rgba(124,77,255,0.2)', marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: '#7c4dff', fontWeight: 700 }}>TRACKING</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--t-text)', letterSpacing: '0.05em' }}>{order.tracking_number}</span>
                  </div>
                )}

                {/* Notes */}
                {order.notes && (
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 6, fontStyle: 'italic' }}>Note: {order.notes}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {order.status === 'Shipped' && (
                    <button style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.35)', color: '#7c4dff', cursor: 'pointer', letterSpacing: '0.04em' }}>
                      Request Status Update
                    </button>
                  )}
                  <button onClick={() => setReorderItem(item)} style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: 'var(--t-accent)', cursor: 'pointer', letterSpacing: '0.04em' }}>
                    Reorder
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {reorderItem && (
        <AddToCartModal item={reorderItem} onAdd={() => {}} onClose={() => setReorderItem(null)} />
      )}
    </div>
  )
}

// ── MANAGE TAB (HR only) ──────────────────────────────────────────────────────
function ManageTab({ orders, items }) {
  const [statusFilter, setStatusFilter] = useState('All')
  const [locFilter, setLocFilter] = useState('All')
  const locOptions = useMemo(() => Array.from(new Set(orders.map(o => o.location).filter(Boolean))).sort(), [orders])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('Processing')
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [msg, setMsg] = useState('')
  const [restockItem, setRestockItem] = useState(null)
  const [restockQty, setRestockQty] = useState('')

  const filtered = useMemo(() => {
    let list = [...orders]
    if (statusFilter !== 'All') list = list.filter(o => o.status === statusFilter)
    if (locFilter !== 'All') list = list.filter(o => o.location === locFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o => o.employee_name?.toLowerCase().includes(q) || o.item_name?.toLowerCase().includes(q))
    }
    return list
  }, [orders, statusFilter, locFilter, search])

  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const selectAll = () => setSelected(new Set(filtered.map(o => o.id)))
  const clearSel = () => setSelected(new Set())

  const applyBulk = async () => {
    if (selected.size === 0) return
    setApplyingBulk(true)
    try {
      await sb.rpc('bulk_update_order_status', { p_order_ids: [...selected], p_status: bulkStatus })
    } catch (_) {}
    setMsg(`Updated ${selected.size} order(s) to ${bulkStatus}`)
    setApplyingBulk(false)
    setSelected(new Set())
    setTimeout(() => setMsg(''), 3000)
  }

  // Inventory summary per item — on-hand is the real catalog stock_qty
  const inventorySummary = useMemo(() => {
    return items.map((item) => {
      const itemOrders = orders.filter(o => o.item_id === item.id)
      const ordered = itemOrders.reduce((s, o) => s + (o.quantity || 1), 0)
      const delivered = itemOrders.filter(o => o.status === 'Delivered').reduce((s, o) => s + (o.quantity || 1), 0)
      const onHand = item.stockQty == null ? null : item.stockQty
      const fulfillRate = ordered > 0 ? Math.round((delivered / ordered) * 100) : 100
      return { ...item, onHand, ordered, delivered, fulfillRate }
    })
  }, [orders, items])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* All Orders section */}
      <div style={S.panel}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', ...S.sec }}>All Employee Orders</div>

        {/* Filters + bulk */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-faint)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, item…" style={{ ...S.inp, paddingLeft: 28, width: '100%' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.inp}>
            {['All', 'Pending', 'Processing', 'Shipped', 'Delivered'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={S.inp}>
            {['All', ...locOptions].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Bulk update */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,0.03)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bulk Update:</span>
          <button onClick={selectAll} style={{ ...S.inp, cursor: 'pointer', fontSize: 10, padding: '4px 10px', fontWeight: 700, width: 'auto' }}>Select All</button>
          <button onClick={clearSel} style={{ ...S.inp, cursor: 'pointer', fontSize: 10, padding: '4px 10px', fontWeight: 700, width: 'auto' }}>Clear</button>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{selected.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ ...S.inp, marginLeft: 'auto' }}>
            {['Processing', 'Shipped', 'Delivered'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={applyBulk} disabled={applyingBulk || selected.size === 0} style={{ padding: '7px 14px', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 11, fontWeight: 800, cursor: 'pointer', opacity: selected.size === 0 ? 0.4 : 1 }}>
            {applyingBulk ? 'Updating…' : 'Apply'}
          </button>
          {msg && <span style={{ fontSize: 11, color: '#2ad6a0', fontWeight: 700 }}>{msg}</span>}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 36 }}></th>
                <th style={S.th}>Employee</th>
                <th style={S.th}>Item</th>
                <th style={S.th}>Size / Qty</th>
                <th style={S.th}>Ordered</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', padding: '32px 0', color: 'var(--t-text-muted)' }}>No orders match filter</td></tr>
              ) : filtered.map((o, i) => (
                <tr key={o.id} style={{ background: selected.has(o.id) ? 'rgba(0,229,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} style={{ cursor: 'pointer', accentColor: 'var(--t-accent)' }} />
                  </td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 2 }}>{o.employee_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{o.location}</div>
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{o.item_emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 2 }}>{o.item_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{o.price === 0 ? 'Free' : `$${(o.price * o.quantity).toFixed(2)}`}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{o.size} × {o.quantity}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{fmtDate(o.ordered_at)}</td>
                  <td style={S.td}><StatusBadge status={o.status} /></td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-faint)' }}>{o.tracking_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory levels */}
      <div style={S.panel}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={S.sec}>Merch Inventory</span>
          {inventorySummary.filter(i => i.lowStock || (i.onHand != null && i.onHand < 4)).length > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'rgba(255,77,125,0.1)', border: '1px solid rgba(255,77,125,0.35)', color: '#ff4d7d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {inventorySummary.filter(i => i.lowStock || (i.onHand != null && i.onHand < 4)).length} low stock
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Item</th>
                <th style={{ ...S.th, textAlign: 'right' }}>On Hand</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total Ordered</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Delivered</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Fulfillment</th>
                <th style={S.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {inventorySummary.length === 0 && (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: '32px 0', color: 'var(--t-text-muted)' }}>No merchandise in the catalog yet</td></tr>
              )}
              {inventorySummary.map((item, i) => {
                const isLow = item.lowStock || (item.onHand != null && item.onHand < 4)
                return (
                  <tr key={item.id} style={{ background: isLow ? 'rgba(255,184,0,0.03)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{item.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 2 }}>{item.name}</div>
                          <div style={{ display: 'flex', gap: 5 }}><CatBadge cat={item.cat} /></div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: item.onHand == null ? 'var(--t-text-faint)' : isLow ? '#ff4d7d' : item.onHand < 8 ? '#ffb800' : '#2ad6a0' }}>{item.onHand == null ? '—' : item.onHand}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: 'var(--t-text-muted)' }}>{item.ordered}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#2ad6a0', fontWeight: 600 }}>{item.delivered}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: item.fulfillRate >= 90 ? '#2ad6a0' : item.fulfillRate >= 70 ? '#ffb800' : '#ff4d7d' }}>{item.fulfillRate}%</td>
                    <td style={S.td}>
                      <button onClick={() => setRestockItem(item)} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: isLow ? 'rgba(255,77,125,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isLow ? 'rgba(255,77,125,0.35)' : 'var(--t-line)'}`, color: isLow ? '#ff4d7d' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em' }}>
                        {isLow ? 'Restock Now' : 'Restock'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restock modal */}
      {restockItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setRestockItem(null)}>
          <div style={{ background: '#0a0f18', border: '1px solid var(--t-line)', width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>Restock Request</div>
              <button onClick={() => setRestockItem(null)} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: '18px 18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 28 }}>{restockItem.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{restockItem.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>On hand: {restockItem.onHand == null ? '—' : restockItem.onHand} units</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Restock Quantity</div>
                <input type="number" min={1} max={200} value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="e.g. 50" style={{ ...S.inp, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRestockItem(null)} style={{ flex: 1, padding: '9px 0', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={async () => {
                  try { await sb.rpc('request_merch_restock', { p_item_id: restockItem.id, p_quantity: parseInt(restockQty) || 0 }) } catch (_) {}
                  setRestockItem(null); setRestockQty('')
                }} disabled={!restockQty} style={{ flex: 2, padding: '9px 0', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: !restockQty ? 0.4 : 1 }}>
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FORENSIC KPI PANEL ────────────────────────────────────────────────────────
function ForensicKPIs({ orders, items, isHR }) {
  const [drill, setDrill] = useState(null)
  const openOrders = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} order${rows.length === 1 ? '' : 's'}`, columns: ORDER_COLS, rows, accent })
  const openMerch = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} item${rows.length === 1 ? '' : 's'}`, columns: MERCH_COLS, rows, accent })
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString()

  const thisMonthOrders = orders.filter(o => o.ordered_at >= monthStart)
  const totalValueOrdered = orders.reduce((s, o) => s + (o.price || 0) * (o.quantity || 1), 0)
  const shipped = orders.filter(o => o.status === 'Shipped').length
  const pending = orders.filter(o => o.status === 'Pending' || o.status === 'Processing').length
  const delivered = orders.filter(o => o.status === 'Delivered').length
  const fulfillRate = orders.length > 0 ? Math.round((delivered / orders.length) * 100) : 100

  // Most popular item
  const itemCounts = {}
  orders.forEach(o => { if (o.item_name) itemCounts[o.item_name] = (itemCounts[o.item_name] || 0) + (o.quantity || 1) })
  const mostPopular = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]

  const lowStockItems = items.filter(i => i.lowStock).length
  const newItems = items.filter(i => i.created_at && i.created_at >= quarterStart).length
  const employeesOrdering = new Set(orders.map(o => o.person_id).filter(Boolean)).size
  const totalUnits = orders.reduce((s, o) => s + (o.quantity || 1), 0)
  const avgOrderValue = orders.length > 0 ? totalValueOrdered / orders.length : 0

  const mostPopularOrders = mostPopular ? orders.filter(o => o.item_name === mostPopular[0]) : []
  const ordersByValue = [...orders].sort((a, b) => ((b.price || 0) * (b.quantity || 1)) - ((a.price || 0) * (a.quantity || 1)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KTile label="Items in Catalog" value={items.length} sub="merchandise items" onClick={() => openMerch('Merchandise Catalog', items, 'var(--t-accent)')} />
        <KTile label="Orders This Month" value={thisMonthOrders.length} color="var(--t-accent)" sub="new orders" onClick={() => openOrders('Orders This Month', thisMonthOrders, 'var(--t-accent)')} />
        <KTile label="Total Value Ordered" value={`$${totalValueOrdered.toFixed(0)}`} color="#2ad6a0" sub="all time" onClick={() => openOrders('All Orders by Value', ordersByValue, '#2ad6a0')} />
        <KTile label="Items Shipped" value={shipped} color="#7c4dff" sub="in transit" onClick={() => openOrders('Shipped Orders', orders.filter(o => o.status === 'Shipped'), '#7c4dff')} />
        <KTile label="Items Pending" value={pending} alert={pending > 5 ? 'amber' : undefined} sub="awaiting processing" color={pending > 5 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openOrders('Pending / Processing Orders', orders.filter(o => o.status === 'Pending' || o.status === 'Processing'), 'var(--t-warn)')} />
        <KTile label="Fulfillment Rate" value={`${fulfillRate}%`} color={fulfillRate >= 90 ? '#2ad6a0' : '#ffb800'} sub="delivered / ordered" onClick={() => openOrders('Delivered Orders', orders.filter(o => o.status === 'Delivered'), '#2ad6a0')} />
      </div>
      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <KTile label="Most Popular" value={mostPopular ? mostPopular[0].split(' ').slice(0, 2).join(' ') : '—'} sub={mostPopular ? `${mostPopular[1]} ordered` : ''} color="var(--t-accent)" onClick={() => openOrders(mostPopular ? `Orders — ${mostPopular[0]}` : 'Most Popular', mostPopularOrders, 'var(--t-accent)')} />
        <KTile label="Low Stock Items" value={lowStockItems} alert={lowStockItems > 0 ? 'amber' : undefined} color={lowStockItems > 0 ? 'var(--t-warn)' : '#2ad6a0'} sub={lowStockItems > 0 ? 'needs restock' : 'all stocked'} onClick={() => openMerch('Low Stock Items', items.filter(i => i.lowStock), 'var(--t-warn)')} />
        <KTile label="New Items Added" value={newItems} sub="this quarter" onClick={() => openMerch('Merchandise Catalog', items, 'var(--t-accent)')} />
        <KTile label="Employees Ordering" value={employeesOrdering} color={employeesOrdering > 0 ? '#2ad6a0' : 'var(--t-text)'} sub="placed an order" onClick={() => openOrders('All Orders', orders, '#2ad6a0')} />
        <KTile label="Total Units Ordered" value={totalUnits} sub="all time" onClick={() => openOrders('All Orders by Value', ordersByValue, 'var(--t-accent)')} />
        <KTile label="Avg Order Value" value={`$${avgOrderValue.toFixed(2)}`} sub="per order" onClick={() => openOrders('All Orders by Value', ordersByValue, 'var(--t-accent)')} />
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── CHECKOUT SUCCESS MODAL ─────────────────────────────────────────────────────
function CheckoutSuccessModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#0a0f18', border: '1px solid rgba(42,214,160,0.4)', width: '100%', maxWidth: 380, padding: '32px 28px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#2ad6a0', marginBottom: 8 }}>Order Placed!</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>Your merchandise order has been submitted. HR will process it and you'll receive a tracking number when it ships.</div>
        <button onClick={onClose} style={{ padding: '10px 24px', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Done</button>
      </div>
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function Merch() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const personId = session?.person?.id ?? null
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => roleName.includes(x))

  const TABS = ['Shop', 'My Orders', ...(isHR ? ['Manage'] : [])]
  const [tab, setTab] = useState('Shop')
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load catalog + orders from the real backend — honest empty on any failure
  const loadData = useCallback(async () => {
    setLoading(true)
    const [cat, ord] = await Promise.all([
      sb.rpc('hr_merch_catalog', { p_node_ids: locationIds }),
      sb.rpc('hr_merch_orders', { p_node_ids: locationIds }),
    ])
    if (cat.error) console.error('[merch] catalog load failed:', cat.error.message)
    if (ord.error) console.error('[merch] orders load failed:', ord.error.message)
    setItems(Array.isArray(cat.data) ? cat.data : [])
    setOrders(Array.isArray(ord.data) ? ord.data : [])
    setLoading(false)
  }, [locationIds.join(','), refreshKey])

  useEffect(() => { loadData() }, [loadData])

  const handleAddToCart = useCallback((entry) => {
    setCart(prev => [...prev, entry])
  }, [])

  const handleUpdateCartQty = useCallback((idx, qty) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty } : c))
  }, [])

  const handleRemoveFromCart = useCallback((idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !personId) return
    let anyOk = false
    for (const entry of cart) {
      const { data, error } = await sb.rpc('hr_place_merch_order', {
        p_person_id: personId,
        p_item_id: entry.itemId,
        p_quantity: entry.qty,
        p_size: entry.size || null,
        p_notes: entry.notes || null,
      })
      if (error) { console.error('[merch] place order failed:', error.message); continue }
      if (data && data.ok === false) { console.error('[merch] place order rejected:', data.error); continue }
      anyOk = true
    }
    setCart([])
    setCartOpen(false)
    if (anyOk) { setCheckoutSuccess(true); setRefreshKey(k => k + 1) }
  }, [cart, personId])

  const tabStyle = (active) => ({
    padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
    background: active ? 'rgba(0,229,255,0.1)' : 'transparent',
    border: 'none', borderBottom: `2px solid ${active ? 'var(--t-accent)' : 'transparent'}`,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer',
  })

  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  return (
    <div style={{ padding: 0 }}>
      {/* Page header */}
      <div style={{ padding: '16px 18px 0', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>Company Store</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{companyName()} branded merchandise · {items.length} item{items.length === 1 ? '' : 's'} available</div>
          </div>
          {cartCount > 0 && (
            <button onClick={() => setCartOpen(true)} style={{ padding: '8px 16px', background: 'var(--t-accent)', border: 'none', color: '#070b14', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
              🛒 Cart ({cartCount})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>{t}</button>)}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {/* Forensic KPIs — always visible */}
        <ForensicKPIs orders={orders} items={items} isHR={isHR} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading company store…</div>
        ) : (
          <>
            {tab === 'Shop' && (
              <ShopTab
                personId={personId}
                items={items}
                cart={cart}
                onAddToCart={handleAddToCart}
                onOpenCart={() => setCartOpen(true)}
                onCheckout={handleCheckout}
              />
            )}
            {tab === 'My Orders' && (
              <MyOrdersTab personId={personId} orders={orders} items={items} />
            )}
            {tab === 'Manage' && isHR && (
              <ManageTab orders={orders} items={items} />
            )}
          </>
        )}
      </div>

      {/* Cart sidebar */}
      {cartOpen && (
        <CartSidebar
          cart={cart}
          items={items}
          onUpdateQty={handleUpdateCartQty}
          onRemove={handleRemoveFromCart}
          onCheckout={handleCheckout}
          onClose={() => setCartOpen(false)}
        />
      )}

      {/* Checkout success */}
      {checkoutSuccess && <CheckoutSuccessModal onClose={() => setCheckoutSuccess(false)} />}
    </div>
  )
}
