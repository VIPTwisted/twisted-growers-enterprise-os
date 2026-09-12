// TimeOffBoard.jsx — Monday.com-style PTO approvals board on REAL time-off requests.
// Loads get_pending_requests (time_off bucket); drag a Pending card to Approved /
// Denied to persist via review_time_off. Approved/Denied are terminal — items
// reviewed this session stay read-only in their column. Board + Table views.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import WorkBoard from '../components/WorkBoard.jsx'
import ItemDrawer from '../components/ItemDrawer.jsx'
import { useNavigate } from 'react-router-dom'

const COLUMNS = [
  { key: 'pending',  label: 'Pending',  color: 'var(--t-warn)' },
  { key: 'approved', label: 'Approved', color: 'var(--t-success)' },
  { key: 'denied',   label: 'Denied',   color: 'var(--t-danger)' },
]
const KEYS = COLUMNS.map(c => c.key)
const norm = (s) => { const v = (s || '').toLowerCase(); return KEYS.includes(v) ? v : 'pending' }
const ACTION = { approved: 'approve', denied: 'deny' }
const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const typeLabel = (t) => { const v = (t || '').toString(); return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—' }

function Avatar({ name }) {
  return <span title={name || 'Unknown'} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{name ? initials(name) : '—'}</span>
}

export default function TimeOffBoard() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const nav = useNavigate()
  const reviewerId = session?.person?.id
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [openItem, setOpenItem] = useState(null)

  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_pending_requests', { p_node_ids: locationIds })
      if (error) throw error
      const rows = Array.isArray(data?.time_off) ? data.time_off : []
      setItems(rows.map(r => ({ ...r, status: norm(r.status) })))
    } catch (e) { setToast({ t: 'err', m: e.message }) } finally { setLoading(false) }
  }, [locationIds])
  useEffect(() => { load() }, [load])

  const showToast = (m, t = 'ok') => { setToast({ t, m }); setTimeout(() => setToast(null), 2600) }

  const onMove = useCallback(async (id, toStatus) => {
    const src = items.find(i => i.id === id)
    // Terminal columns: only pending items may move, and only into a reviewed column.
    if (!src || src.status !== 'pending' || toStatus === 'pending') return
    const action = ACTION[toStatus]
    if (!action) return
    if (!reviewerId) { showToast('No reviewer session — cannot approve.', 'err'); return }
    const prev = items
    setItems(list => list.map(it => it.id === id ? { ...it, status: toStatus } : it))   // optimistic
    setOpenItem(o => (o && o.id === id ? { ...o, status: toStatus } : o))
    try {
      const { error } = await sb.rpc('review_time_off', { p_request_id: id, p_action: action, p_reviewer_id: reviewerId })
      if (error) throw error
      showToast(`${src.person_name || 'Request'} → ${COLUMNS.find(c => c.key === toStatus)?.label}`)
      import('../lib/audit.js').then(m => m.logAudit(toStatus === 'approved' ? 'PTO Approved' : 'PTO Denied', { target: src.person_name || 'Employee', node: src.node_name, meta: { type: src.type } })).catch(() => {})
    } catch (e) { setItems(prev); showToast(`Move failed: ${e.message}`, 'err') }   // revert
  }, [items, reviewerId])

  // Jump to the Coverage Monitor at the request's start date + location to arrange coverage / swaps.
  const findCoverage = (r) => {
    setOpenItem(null)
    nav('/coverage-monitor', { state: { date: r.start_date, location: r.node_name } })
  }

  const types = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.type).filter(Boolean)))], [items])
  const shown = useMemo(() => typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter), [items, typeFilter])

  const kpis = useMemo(() => ({
    total: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    days: items.filter(i => i.status === 'pending').reduce((s, i) => s + (Number(i.total_days) || 0), 0),
  }), [items])

  const renderCard = (r) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.2 }}>{r.person_name}</div>
        <Avatar name={r.person_name} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{typeLabel(r.type)}</span>
        {r.node_name && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{r.node_name}</span>}
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-accent)', marginLeft: 'auto' }}>{Number(r.total_days) || 0}d</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 7 }}>{fmt(r.start_date)} → {fmt(r.end_date)}</div>
      {r.notes && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 5, lineHeight: 1.35 }}>{r.notes}</div>}
    </div>
  )

  const tableColumns = [
    { key: 'emp', label: 'Employee', render: r => <span style={{ fontWeight: 700 }}>{r.person_name}</span> },
    { key: 'type', label: 'Type', render: r => typeLabel(r.type) },
    { key: 'loc', label: 'Location', render: r => r.node_name || '—' },
    { key: 'dates', label: 'Dates', render: r => `${fmt(r.start_date)} → ${fmt(r.end_date)}` },
    { key: 'days', label: 'Days', render: r => `${Number(r.total_days) || 0}d` },
  ]

  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Time-Off Approvals</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Drag a request to Approve or Deny · {loading ? 'loading…' : `${items.length} requests`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '5px 8px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 12 }}>
            {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : typeLabel(t)}</option>)}
          </select>
          <button onClick={load} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Requests</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Pending</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>{kpis.pending}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Approved</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.approved}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Days Pending</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>{kpis.days}</div></div>
      </div>

      <WorkBoard columns={COLUMNS} items={shown} getGroup={r => r.status} renderCard={renderCard} onMove={onMove} onOpen={setOpenItem} tableColumns={tableColumns} getSearchText={it => [it.full_name,it.name,it.title,it.employee_name,it.subject,it.job_position,it.type,it.category,it.description].filter(Boolean).join(" ")} filterViewsKey="TimeOffBoard" />

      <ItemDrawer
        open={!!openItem} onClose={() => setOpenItem(null)}
        entityType="time_off" entityId={openItem?.id}
        title={openItem?.person_name} subtitle={openItem ? `${typeLabel(openItem.type)}${openItem.node_name ? ' · ' + openItem.node_name : ''}` : ''}
        actorId={reviewerId}
        accent={COLUMNS.find(c => c.key === openItem?.status)?.color || 'var(--t-warn)'}
        fields={openItem ? [
          { label: 'Status', value: COLUMNS.find(c => c.key === openItem.status)?.label },
          { label: 'Type', value: typeLabel(openItem.type) },
          { label: 'Location', value: openItem.node_name },
          { label: 'Dates', value: `${fmt(openItem.start_date)} → ${fmt(openItem.end_date)}` },
          { label: 'Days', value: `${Number(openItem.total_days) || 0}d` },
          { label: 'Reason', value: openItem.notes },
        ] : []}
        actions={openItem ? (
          <>
            <button onClick={() => findCoverage(openItem)} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-accent)', color: '#04121a', border: 'none' }}>📅 Find Coverage / Swap</button>
            {openItem.status === 'pending' && (
              <>
                <button onClick={() => onMove(openItem.id, 'approved')} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-success)', color: '#04121a', border: 'none' }}>✓ Approve</button>
                <button onClick={() => onMove(openItem.id, 'denied')} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: 'var(--t-danger)', border: '1px solid var(--t-danger)' }}>✕ Deny</button>
              </>
            )}
          </>
        ) : null}
      />

      {items.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px dashed var(--t-line)', marginTop: 12 }}>
          No pending time-off requests in scope. New requests appear here automatically for review.
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.t === 'err' ? 'var(--t-danger)' : 'var(--t-success)', color: '#fff', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast.m}</div>}
    </div>
  )
}
