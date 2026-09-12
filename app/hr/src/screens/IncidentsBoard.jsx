// IncidentsBoard.jsx — Monday.com-style incident tracker on REAL incidents.
// Loads get_incidents; groups by status. There is NO per-status update RPC, so
// the board is VIEW-ONLY except dragging a card into "Closed", which persists via
// close_incident(id, null). Any other move just toasts. Board + Table views.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import WorkBoard from '../components/WorkBoard.jsx'

const COLUMNS = [
  { key: 'open',          label: 'Open',          color: 'var(--t-warn)' },
  { key: 'investigating', label: 'Investigating', color: '#a78bfa' },
  { key: 'escalated',     label: 'Escalated',     color: 'var(--t-danger)' },
  { key: 'closed',        label: 'Closed',        color: 'var(--t-success)' },
]
const KEYS = COLUMNS.map(c => c.key)
const norm = (s) => { const v = (s || '').toLowerCase(); return KEYS.includes(v) ? v : 'open' }

const SEV = {
  minor:    { label: 'Minor',    color: 'var(--t-text-muted)' },
  moderate: { label: 'Moderate', color: 'var(--t-warn)' },
  major:    { label: 'Major',    color: 'var(--t-danger)' },
  critical: { label: 'Critical', color: 'var(--t-danger)' },
}
const sev = (s) => SEV[(s || '').toLowerCase()] || { label: s || '—', color: 'var(--t-text-muted)' }
const titleize = (s) => !s ? '—' : s.charAt(0).toUpperCase() + s.slice(1)
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const initials = (n) => !n ? '—' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()

function Avatar({ name }) {
  return <span title={name || 'Unassigned'} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{initials(name)}</span>
}

// Executives (CEO/owner/COO/CFO/admin/president/chief) must see EVERY incident,
// company-wide, regardless of the location-scope selector.
const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief/i

export default function IncidentsBoard() {
  const { session } = useAuth()
  const { locationIds, nodes } = useScope()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')

  const seesAll = EXEC_RX.test(session?.person?.role_name || '')
  // For execs: every reachable node (ignores the scope dropdown). Otherwise: scoped locations.
  const incidentNodeIds = useMemo(
    () => seesAll ? Array.from(new Set((nodes || []).map(n => n.id))) : locationIds,
    [seesAll, nodes, locationIds]
  )

  const load = useCallback(async () => {
    if (!incidentNodeIds || !incidentNodeIds.length) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_incidents', { p_node_ids: incidentNodeIds })
      if (error) throw error
      // De-dupe by id (passing parent + child nodes can return an incident twice).
      const seen = new Set()
      const rows = (Array.isArray(data) ? data : []).filter(i => (i.id == null || !seen.has(i.id)) && (i.id == null || seen.add(i.id)))
      setItems(rows.map(i => ({ ...i, status: norm(i.status) })))
    } catch (e) { setToast({ t: 'err', m: e.message }) } finally { setLoading(false) }
  }, [incidentNodeIds])
  useEffect(() => { load() }, [load])

  const showToast = (m, t = 'ok') => { setToast({ t, m }); setTimeout(() => setToast(null), 2600) }

  // No generic per-status update RPC exists. Only close_incident(id, follow_up).
  // So: moving to "closed" persists; any other move is view-only + toast.
  const onMove = useCallback(async (id, toStatus) => {
    if (toStatus !== 'closed') { showToast('Not saved — only moves to Closed can be recorded; other status changes are not yet available', 'err'); return }
    const prev = items
    const cur = prev.find(i => i.id === id)
    if (cur && cur.status === 'closed') return
    setItems(list => list.map(it => it.id === id ? { ...it, status: 'closed' } : it))   // optimistic
    try {
      const { error } = await sb.rpc('close_incident', { p_incident_id: id, p_follow_up: null })
      if (error) throw error
      showToast(`Incident closed (${titleize(cur?.inc_type)})`)
    } catch (e) { setItems(prev); showToast(`Close failed: ${e.message}`, 'err') }   // revert
  }, [items])

  const types = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.inc_type).filter(Boolean)))], [items])
  const shown = useMemo(() => typeFilter === 'all' ? items : items.filter(i => i.inc_type === typeFilter), [items, typeFilter])

  const kpis = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status !== 'closed').length,
    closed: items.filter(i => i.status === 'closed').length,
    serious: items.filter(i => ['major', 'critical', 'moderate'].includes((i.severity || '').toLowerCase()) && i.status !== 'closed').length,
  }), [items])

  const renderCard = (i) => {
    const s = sev(i.severity)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.2, textTransform: 'capitalize' }}>{i.inc_type || 'Incident'}</div>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', color: s.color, border: `1px solid ${s.color}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
        </div>
        {i.description && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 5, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Avatar name={i.person_name || i.reporter_name} />
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{i.person_name || i.reporter_name || 'Unassigned'}</span>
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{fmt(i.inc_date)}</span>
        </div>
      </div>
    )
  }

  const tableColumns = [
    { key: 'type', label: 'Type', render: i => <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{i.inc_type || '—'}</span> },
    { key: 'person', label: 'Employee', render: i => i.person_name || '—' },
    { key: 'sev', label: 'Severity', render: i => { const s = sev(i.severity); return <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', color: s.color, border: `1px solid ${s.color}`, whiteSpace: 'nowrap' }}>{s.label}</span> } },
    { key: 'reporter', label: 'Reported By', render: i => i.reporter_name || '—' },
    { key: 'date', label: 'Date', render: i => fmt(i.inc_date) },
  ]

  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Incident Board {seesAll && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-accent)', border: '1px solid var(--t-accent)', padding: '2px 7px', marginLeft: 6, verticalAlign: 'middle' }}>ALL LOCATIONS · EXEC VIEW</span>}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Drag to <b>Closed</b> to resolve · {loading ? 'loading…' : `${items.length} incident${items.length === 1 ? '' : 's'}${seesAll ? ' company-wide' : ''}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '5px 8px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 12, textTransform: 'capitalize' }}>
            {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
          </select>
          <button onClick={load} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Incidents</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Open</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>{kpis.open}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Serious Open</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-danger)' }}>{kpis.serious}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Closed</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.closed}</div></div>
      </div>

      <WorkBoard columns={COLUMNS} items={shown} getGroup={i => i.status} renderCard={renderCard} onMove={onMove} tableColumns={tableColumns} getSearchText={it => [it.full_name,it.name,it.title,it.employee_name,it.subject,it.job_position,it.type,it.category,it.description].filter(Boolean).join(" ")} filterViewsKey="IncidentsBoard" />

      {items.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px dashed var(--t-line)', marginTop: 12 }}>
          No incidents in scope. Reported incidents appear here automatically.
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.t === 'err' ? 'var(--t-danger)' : 'var(--t-success)', color: '#fff', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast.m}</div>}
    </div>
  )
}
