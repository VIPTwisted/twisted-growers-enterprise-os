// WorkBoard.jsx — reusable Monday.com-style board (Kanban + Table views).
// Generic: give it columns (stages), items, a getGroup(item)->columnKey, a
// renderCard(item), and onMove(itemId, toColumnKey). Drag a card between columns
// to change its status. Pure inline styles + theme tokens; no external deps.
import { useState, useMemo } from 'react'
import FilterBar from './FilterBar.jsx'

export default function WorkBoard({
  columns,                 // [{ key, label, color }]
  items,                   // [{ id, ... }]
  getGroup,                // (item) => columnKey
  renderCard,              // (item) => JSX (card body)
  onMove,                  // (itemId, toColumnKey) => void
  onAddClick,              // (columnKey) => void   (optional)
  onOpen,                  // (item) => void        (optional)
  tableColumns,            // [{ key, label, render:(item)=>JSX }] for Table view (optional)
  initialView = 'board',
  getSearchText,           // (item) => string   → enables a search filter (optional)
  extraFilters,            // [FilterBar config]  → extra dropdowns (optional)
  matchExtra,              // (item, filterValue) => bool  (required if extraFilters)
  filterViewsKey,          // localStorage key for saved views (optional)
}) {
  const [view, setView] = useState(initialView)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [fv, setFv] = useState({})

  // Built-in Status (from columns) + optional Search, plus any board-specific extras.
  const filters = useMemo(() => [
    ...(getSearchText ? [{ key: '__q', label: 'items', type: 'search', width: 180 }] : []),
    { key: '__status', label: 'Status', type: 'multiselect', options: columns.map(c => ({ value: c.key, label: c.label })) },
    ...(extraFilters || []),
  ], [columns, getSearchText, extraFilters])

  const shown = useMemo(() => (items || []).filter(it => {
    if (fv.__q && getSearchText && !String(getSearchText(it) || '').toLowerCase().includes(fv.__q.toLowerCase())) return false
    if (fv.__status && fv.__status.length && !fv.__status.includes(getGroup(it))) return false
    if (extraFilters && matchExtra && !matchExtra(it, fv)) return false
    return true
  }), [items, fv, getSearchText, getGroup, extraFilters, matchExtra])

  const byCol = useMemo(() => {
    const m = {}; columns.forEach(c => (m[c.key] = []))
    shown.forEach(it => { const g = getGroup(it); if (m[g]) m[g].push(it); else if (m[columns[0]?.key]) m[columns[0].key].push(it) })
    return m
  }, [shown, columns, getGroup])

  const itemById = useMemo(() => Object.fromEntries((items || []).map(i => [String(i.id), i])), [items])

  function handleDrop(colKey) {
    const id = dragId
    setDragId(null); setOverCol(null)
    if (!id) return
    const it = itemById[String(id)]
    if (it && getGroup(it) !== colKey) onMove?.(id, colKey)
  }

  const viewBtn = (v, label) => (
    <button onClick={() => setView(v)} style={{
      padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0,
      background: view === v ? 'var(--t-accent)' : 'var(--t-surface)',
      color: view === v ? 'var(--t-on-grad,#04212a)' : 'var(--t-text-muted)',
      border: `1px solid ${view === v ? 'var(--t-accent)' : 'var(--t-line)'}`,
    }}>{label}</button>
  )

  return (
    <div>
      <FilterBar
        filters={filters}
        value={fv}
        onChange={(k, v) => setFv(s => ({ ...s, [k]: v }))}
        onClear={() => setFv({})}
        resultCount={shown.length}
        resultLabel="items"
        savedViewsKey={filterViewsKey}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {viewBtn('board', '▦ Board')}
        {tableColumns && viewBtn('table', '≡ Table')}
      </div>

      {view === 'board' ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {columns.map(col => {
            const list = byCol[col.key] || []
            const isOver = overCol === col.key
            return (
              <div key={col.key}
                onDragOver={e => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key) }}
                onDragLeave={() => setOverCol(o => (o === col.key ? null : o))}
                onDrop={() => handleDrop(col.key)}
                style={{
                  minWidth: 268, width: 268, flexShrink: 0, background: 'var(--t-bg)',
                  border: `1px solid ${isOver ? col.color : 'var(--t-line)'}`,
                  borderRadius: 0, maxHeight: '72vh', display: 'flex', flexDirection: 'column',
                  boxShadow: isOver ? `inset 0 0 0 1px ${col.color}` : 'none',
                }}>
                {/* column header */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: 'var(--t-surface)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', color: 'var(--t-text)', textTransform: 'uppercase' }}>{col.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', background: 'var(--t-surface-2)', borderRadius: 10, padding: '1px 7px' }}>{list.length}</span>
                  {onAddClick && <button onClick={() => onAddClick(col.key)} title="Add" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--t-text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>+</button>}
                </div>
                {/* cards */}
                <div style={{ padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 60 }}>
                  {list.length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', textAlign: 'center', padding: '16px 0' }}>Drop here</div>}
                  {list.map(it => (
                    <div key={it.id}
                      draggable
                      onDragStart={e => { setDragId(it.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      onClick={() => onOpen?.(it)}
                      style={{
                        background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                        borderLeft: `3px solid ${col.color}`, borderRadius: 0, padding: '10px 12px',
                        cursor: onOpen ? 'pointer' : 'grab', opacity: dragId === it.id ? 0.4 : 1,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      }}>
                      {renderCard(it)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)' }}>Status</th>
                {(tableColumns || []).map(tc => (
                  <th key={tc.key} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{tc.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.flatMap(col => (byCol[col.key] || []).map(it => (
                <tr key={it.id} onClick={() => onOpen?.(it)} style={{ borderBottom: '1px solid var(--t-line)', cursor: onOpen ? 'pointer' : 'default' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', color: col.color, border: `1px solid ${col.color}`, whiteSpace: 'nowrap' }}>{col.label}</span>
                  </td>
                  {(tableColumns || []).map(tc => (
                    <td key={tc.key} style={{ padding: '8px 12px', color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{tc.render(it)}</td>
                  ))}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
