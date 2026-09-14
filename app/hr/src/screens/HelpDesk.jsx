// HelpDesk.jsx — our Odoo Helpdesk analog. Employees open support tickets
// (HR / IT / Facilities / Payroll); managers triage, assign, and resolve on a
// Monday.com-style board with SLA aging. Tickets persist to the HR brain via
// SECURITY DEFINER RPCs (helpdesk_tickets table) — real, node-scoped, live data.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import WorkBoard from '../components/WorkBoard.jsx'
import ItemDrawer from '../components/ItemDrawer.jsx'
import DrillDown from '../components/DrillDown.jsx'

const COLUMNS = [
  { key: 'new',         label: 'New',          color: 'var(--t-accent)' },
  { key: 'in_progress', label: 'In Progress',  color: 'var(--t-warn)' },
  { key: 'waiting',     label: 'Waiting',      color: '#a78bfa' },
  { key: 'resolved',    label: 'Resolved',     color: 'var(--t-success)' },
]
const KEYS = COLUMNS.map(c => c.key)
const CATEGORIES = ['HR', 'IT', 'Facilities', 'Payroll', 'Scheduling', 'Other']
const PRIOS = { urgent: { label: 'Urgent', color: 'var(--t-danger)' }, high: { label: 'High', color: 'var(--t-warn)' }, normal: { label: 'Normal', color: 'var(--t-accent)' }, low: { label: 'Low', color: 'var(--t-text-muted)' } }
const fmtDT = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const ageHrs = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 3600000) : 0
const nodeIdsOf = (s) => (s?.nodes || []).map(n => (n && typeof n === 'object' ? n.id : n)).filter(Boolean)
const firstLocationNode = (s) => { const n = (s?.nodes || []).find(x => x && x.node_type === 'location') || (s?.nodes || [])[0]; return n && typeof n === 'object' ? n.id : (n || null) }

export default function HelpDesk() {
  const { session } = useAuth()
  const person = session?.person
  const role = (person?.role_name || '').toLowerCase()
  const isAgent = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner', 'coordinator'].some(x => role.includes(x))

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [openItem, setOpenItem] = useState(null)
  const [drill, setDrill] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ subject: '', category: 'HR', priority: 'normal', description: '' })

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  const loadTickets = useCallback(async () => {
    setLoadError('')
    const s = getSession()
    const nodeIds = nodeIdsOf(s)
    const requesterId = person?.id ?? s.id ?? null
    if (!nodeIds.length && !requesterId) { setItems([]); setLoading(false); return }
    const { data, error } = await sb.rpc('get_helpdesk_tickets', { p_node_ids: nodeIds.length ? nodeIds : null, p_requester_id: requesterId })
    if (error) { setLoadError(error.message || 'Unable to load tickets.'); setItems([]); setLoading(false); return }
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [person])

  useEffect(() => { loadTickets() }, [loadTickets])

  // keep the open drawer in sync with freshly loaded rows
  useEffect(() => { setOpenItem(o => (o ? items.find(i => i.id === o.id) || null : o)) }, [items])

  const createTicket = async () => {
    if (!form.subject.trim() || busy) return
    setBusy(true)
    const s = getSession()
    const { data, error } = await sb.rpc('create_helpdesk_ticket', {
      p_subject: form.subject.trim(),
      p_category: form.category,
      p_priority: form.priority,
      p_description: form.description.trim(),
      p_requester_id: person?.id ?? s.id ?? null,
      p_requester_name: person?.full_name ?? null,
      p_node_id: firstLocationNode(s),
    })
    setBusy(false)
    if (error || !data?.ok) { showToast(error?.message || 'Could not submit ticket'); return }
    setForm({ subject: '', category: 'HR', priority: 'normal', description: '' })
    setShowNew(false)
    showToast('Ticket submitted')
    await loadTickets()
  }

  const changeStatus = useCallback(async (id, toStatus, assignee = null) => {
    const { data, error } = await sb.rpc('set_helpdesk_ticket_status', {
      p_ticket_id: id,
      p_status: toStatus,
      p_actor_id: person?.id ?? null,
      p_actor_name: person?.full_name ?? null,
      p_assignee_id: assignee ? (person?.id ?? null) : null,
      p_assignee_name: assignee || null,
    })
    if (error || !data?.ok) { showToast(error?.message || 'Update failed'); return false }
    await loadTickets()
    return true
  }, [person, loadTickets])

  const onMove = useCallback(async (id, toStatus) => {
    const w = items.find(i => i.id === id)
    const ok = await changeStatus(id, toStatus)
    if (ok) showToast(`${w?.subject?.slice(0, 30) || 'Ticket'} → ${COLUMNS.find(c => c.key === toStatus)?.label}`)
  }, [items, changeStatus])

  const assignToMe = async (id) => { if (await changeStatus(id, 'in_progress', person?.full_name || 'Me')) showToast('Assigned to you') }

  const kpis = useMemo(() => ({
    open: items.filter(t => t.status !== 'resolved').length,
    urgent: items.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length,
    breaching: items.filter(t => t.status !== 'resolved' && ageHrs(t.created_at) > 24).length,
    resolved: items.filter(t => t.status === 'resolved').length,
  }), [items])

  const COLS = [
    { key: 'subject', label: 'Ticket', value: t => t.subject },
    { key: 'category', label: 'Category', value: t => t.category },
    { key: 'priority', label: 'Priority', value: t => PRIOS[t.priority]?.label || t.priority },
    { key: 'requester', label: 'Requester', value: t => t.requester_name || 'Unknown' },
    { key: 'assignee', label: 'Assignee', value: t => t.assignee_name || 'Unassigned' },
    { key: 'status', label: 'Status', value: t => COLUMNS.find(c => c.key === t.status)?.label },
    { key: 'age', label: 'Age', value: t => `${ageHrs(t.created_at)}h`, sortKey: t => -ageHrs(t.created_at) },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} ticket${rows.length === 1 ? '' : 's'}`, columns: COLS, rows, accent })

  const renderCard = (t) => {
    const p = PRIOS[t.priority]; const age = ageHrs(t.created_at); const sla = t.status !== 'resolved' && age > 24
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{t.subject}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', color: p?.color, border: `1px solid ${p?.color}` }}>{p?.label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{t.category}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: sla ? 'var(--t-danger)' : 'var(--t-text-faint)', marginLeft: 'auto' }}>{sla ? `⚠ ${age}h` : `${age}h`}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>{t.requester_name || 'Unknown'}{t.assignee_name ? ` → ${t.assignee_name}` : ' · unassigned'}</div>
      </div>
    )
  }
  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center', cursor: 'pointer' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Help Desk</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Employee support tickets — HR · IT · Facilities · Payroll · {items.length} total</div>
        </div>
        <button onClick={() => setShowNew(s => !s)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-accent)', color: '#04121a', border: 'none' }}>+ New Ticket</button>
      </div>

      {showNew && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderLeft: '3px solid var(--t-accent)', padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="What do you need help with?" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>{Object.entries(PRIOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          </div>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the issue…" rows={3} style={{ ...inp, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createTicket} disabled={!form.subject.trim() || busy} style={{ padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: (form.subject.trim() && !busy) ? 'pointer' : 'not-allowed', background: (form.subject.trim() && !busy) ? 'var(--t-accent)' : 'var(--t-surface-2)', color: (form.subject.trim() && !busy) ? '#04121a' : 'var(--t-text-faint)', border: 'none' }}>{busy ? 'Submitting…' : 'Submit Ticket'}</button>
            <button onClick={() => setShowNew(false)} style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS} onClick={() => openDrill('Open Tickets', items.filter(t => t.status !== 'resolved'), 'var(--t-accent)')}><div style={lbl}>Open</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>{kpis.open}</div></div>
        <div style={cardS} onClick={() => openDrill('Urgent Open', items.filter(t => t.priority === 'urgent' && t.status !== 'resolved'), 'var(--t-danger)')}><div style={lbl}>Urgent</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-danger)' }}>{kpis.urgent}</div></div>
        <div style={cardS} onClick={() => openDrill('SLA Breaching (>24h)', items.filter(t => t.status !== 'resolved' && ageHrs(t.created_at) > 24), 'var(--t-warn)')}><div style={lbl}>SLA Breach</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>{kpis.breaching}</div></div>
        <div style={cardS} onClick={() => openDrill('Resolved', items.filter(t => t.status === 'resolved'), 'var(--t-success)')}><div style={lbl}>Resolved</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.resolved}</div></div>
      </div>

      {loadError ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', padding: '16px 18px', color: 'var(--t-danger)', fontSize: 13 }}>
          {loadError} <button onClick={() => { setLoading(true); loadTickets() }} style={{ marginLeft: 10, padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--t-text)', border: '1px solid var(--t-line)' }}>Retry</button>
        </div>
      ) : loading ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '28px 18px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading tickets…</div>
      ) : items.length === 0 ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 18px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>No tickets yet</div>
          <div style={{ marginTop: 6 }}>Open a ticket with the “+ New Ticket” button and it will appear here.</div>
        </div>
      ) : (
        <WorkBoard columns={COLUMNS} items={items} getGroup={t => (KEYS.includes(t.status) ? t.status : 'new')} renderCard={renderCard} onMove={onMove} onOpen={setOpenItem} tableColumns={COLS.map(c => ({ key: c.key, label: c.label, render: c.value }))} getSearchText={t => `${t.subject} ${t.requester_name || ''} ${t.category} ${t.assignee_name || ''}`} filterViewsKey="HelpDesk" />
      )}

      <ItemDrawer
        open={!!openItem} onClose={() => setOpenItem(null)}
        entityType="ticket" entityId={openItem?.id}
        title={openItem?.subject} subtitle={openItem ? `${openItem.category} · ${PRIOS[openItem.priority]?.label}` : ''}
        actorId={person?.id}
        accent={COLUMNS.find(c => c.key === openItem?.status)?.color || 'var(--t-accent)'}
        fields={openItem ? [
          { label: 'Status', value: COLUMNS.find(c => c.key === openItem.status)?.label },
          { label: 'Priority', value: PRIOS[openItem.priority]?.label },
          { label: 'Category', value: openItem.category },
          { label: 'Requester', value: openItem.requester_name || 'Unknown' },
          { label: 'Assignee', value: openItem.assignee_name || 'Unassigned' },
          { label: 'Opened', value: fmtDT(openItem.created_at) },
          ...(openItem.resolved_at ? [{ label: 'Resolved', value: `${openItem.resolved_by_name || ''} · ${fmtDT(openItem.resolved_at)}` }] : []),
          { label: 'Details', value: openItem.description || '—' },
        ] : []}
        actions={openItem && isAgent ? (
          <>
            {openItem.status !== 'in_progress' && openItem.status !== 'resolved' && <button onClick={() => assignToMe(openItem.id)} style={actBtn('var(--t-accent)')}>▶ Assign to me</button>}
            {openItem.status !== 'waiting' && openItem.status !== 'resolved' && <button onClick={() => changeStatus(openItem.id, 'waiting')} style={actBtn('#a78bfa', true)}>⏸ Waiting</button>}
            {openItem.status !== 'resolved' ? <button onClick={() => changeStatus(openItem.id, 'resolved')} style={actBtn('var(--t-success)')}>✓ Resolve</button>
              : <button onClick={() => changeStatus(openItem.id, 'new')} style={actBtn('var(--t-warn)', true)}>↺ Reopen</button>}
          </>
        ) : null}
      />

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#04121a', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast}</div>}
    </div>
  )
}

const inp = { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }
const actBtn = (color, outline = false) => ({ padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: outline ? `1px solid ${color}` : 'none', background: outline ? 'transparent' : color, color: outline ? color : '#04121a' })
