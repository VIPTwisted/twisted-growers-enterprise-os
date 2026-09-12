// FilterBar.jsx — reusable enterprise filter/toolbar used across every list,
// board, and dashboard so filtering is consistent platform-wide.
//
// Props:
//   filters:  [{ key, label, type, options?, placeholder?, width? }]
//             type: 'select' | 'multiselect' | 'search' | 'daterange'
//             options: [{ value, label }]  (select/multiselect)
//   value:    { [key]: string | string[] | {from,to} }
//   onChange: (key, val) => void
//   onClear:  () => void
//   right?:   ReactNode  (action buttons — Print/Export/etc.)
//   resultCount?, resultLabel?
//   savedViewsKey?: string  (localStorage key enabling save/apply presets)
import { useState, useEffect, useRef } from 'react'

const box = { padding: '6px 9px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', outline: 'none' }
const chip = { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 2, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', cursor: 'pointer' }

function MultiSelect({ f, val, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const sel = Array.isArray(val) ? val : []
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (v) => onChange(f.key, sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v])
  const label = sel.length === 0 ? `All ${f.label}` : sel.length === 1 ? (f.options.find(o => o.value === sel[0])?.label || sel[0]) : `${f.label}: ${sel.length}`
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...box, cursor: 'pointer', minWidth: f.width || 140, textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, color: sel.length ? 'var(--t-text)' : 'var(--t-text-muted)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span style={{ opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: 4, minWidth: 180, maxHeight: 260, overflowY: 'auto', background: 'var(--t-surface)', border: '1px solid var(--t-line)', boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
          {f.options.map(o => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }}>
              <input type="checkbox" checked={sel.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilterBar({ filters = [], value = {}, onChange, onClear, right = null, resultCount, resultLabel = 'results', savedViewsKey }) {
  const [views, setViews] = useState({})
  useEffect(() => {
    if (!savedViewsKey) return
    try { setViews(JSON.parse(localStorage.getItem('vip_views_' + savedViewsKey) || '{}')) } catch { setViews({}) }
  }, [savedViewsKey])

  const persist = (next) => { setViews(next); try { localStorage.setItem('vip_views_' + savedViewsKey, JSON.stringify(next)) } catch {} }
  const saveView = () => { const name = window.prompt('Save this filter view as:'); if (!name) return; persist({ ...views, [name]: value }) }
  const applyView = (name) => { const v = views[name]; if (!v) return; filters.forEach(f => onChange(f.key, v[f.key] ?? (f.type === 'multiselect' ? [] : f.type === 'daterange' ? { from: '', to: '' } : ''))) }
  const delView = (name) => { const n = { ...views }; delete n[name]; persist(n) }

  const activeCount = filters.reduce((n, f) => {
    const v = value[f.key]
    if (f.type === 'multiselect') return n + ((v && v.length) ? 1 : 0)
    if (f.type === 'daterange') return n + ((v && (v.from || v.to)) ? 1 : 0)
    return n + (v ? 1 : 0)
  }, 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 14 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Filters</span>

      {filters.map(f => {
        const v = value[f.key]
        if (f.type === 'search') return (
          <input key={f.key} value={v || ''} placeholder={f.placeholder || `Search ${f.label}…`} onChange={e => onChange(f.key, e.target.value)} style={{ ...box, minWidth: f.width || 180 }} />
        )
        if (f.type === 'select') return (
          <select key={f.key} value={v || ''} onChange={e => onChange(f.key, e.target.value)} style={{ ...box, cursor: 'pointer', minWidth: f.width || 130, color: v ? 'var(--t-text)' : 'var(--t-text-muted)' }}>
            <option value="">All {f.label}</option>
            {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
        if (f.type === 'multiselect') return <MultiSelect key={f.key} f={f} val={v} onChange={onChange} />
        if (f.type === 'daterange') { const dr = v || { from: '', to: '' }; return (
          <span key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="date" value={dr.from} onChange={e => onChange(f.key, { ...dr, from: e.target.value })} style={{ ...box, colorScheme: 'dark' }} title={`${f.label} from`} />
            <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>→</span>
            <input type="date" value={dr.to} onChange={e => onChange(f.key, { ...dr, to: e.target.value })} style={{ ...box, colorScheme: 'dark' }} title={`${f.label} to`} />
          </span>
        )}
        return null
      })}

      {activeCount > 0 && <button onClick={onClear} style={{ ...chip, color: 'var(--t-danger)', borderColor: 'var(--t-danger)' }}>✕ Clear ({activeCount})</button>}

      {savedViewsKey && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {Object.keys(views).length > 0 && (
            <select onChange={e => { if (e.target.value === '__del') return; if (e.target.value) applyView(e.target.value); e.target.selectedIndex = 0 }} style={{ ...box, cursor: 'pointer', maxWidth: 150, color: 'var(--t-text-muted)' }}>
              <option value="">Saved views…</option>
              {Object.keys(views).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button onClick={saveView} style={chip} title="Save current filters as a view">★ Save view</button>
          {Object.keys(views).length > 0 && <button onClick={() => { const n = window.prompt('Delete which saved view?'); if (n && views[n]) delView(n) }} style={chip} title="Delete a saved view">🗑</button>}
        </span>
      )}

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {typeof resultCount === 'number' && <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}><b style={{ color: 'var(--t-text)' }}>{resultCount}</b> {resultLabel}</span>}
        {right}
      </span>
    </div>
  )
}
