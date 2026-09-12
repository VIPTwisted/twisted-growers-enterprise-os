// TasksBoard.jsx — Monday.com-style task board on REAL user_tasks.
// Loads get_tasks; drag a card between status columns to persist via
// update_task_status. Board + Table views. Mirrors the RecruitingBoard pattern.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import WorkBoard from '../components/WorkBoard.jsx'
import ItemDrawer from '../components/ItemDrawer.jsx'

const COLUMNS = [
  { key: 'pending',     label: 'To Do',       color: 'var(--t-text-muted)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--t-accent)' },
  { key: 'completed',   label: 'Done',        color: 'var(--t-success)' },
]
const KEYS = COLUMNS.map(c => c.key)
// Normalize any incoming status onto our three columns. Legacy/alt spellings
// (done/complete, doing/active, todo/open) collapse to the canonical key.
const norm = (s) => {
  const v = (s || '').toLowerCase().trim()
  if (KEYS.includes(v)) return v
  if (['done', 'complete', 'completed', 'closed', 'finished'].includes(v)) return 'completed'
  if (['in_progress', 'in progress', 'doing', 'active', 'started', 'wip'].includes(v)) return 'in_progress'
  return 'pending'
}
const PRIO = {
  high:   { label: 'High',   color: 'var(--t-danger)' },
  medium: { label: 'Medium', color: 'var(--t-warn)' },
  low:    { label: 'Low',    color: 'var(--t-text-muted)' },
}
const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtDT = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const dueInfo = (d) => {
  if (!d) return { text: '—', overdue: false }
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000)
  const text = days < 0 ? `${-days}d overdue` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due ${fmt(d)}`
  return { text, overdue: days < 0 }
}

function Avatar({ name }) {
  return <span title={name || 'Unassigned'} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{name ? initials(name) : '—'}</span>
}

// status action button style (solid = primary action, outline = secondary)
const actBtn = (color, outline = false) => ({
  padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: outline ? `1px solid ${color}` : 'none',
  background: outline ? 'transparent' : color, color: outline ? color : '#04121a',
})

export default function TasksBoard() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [prioFilter, setPrioFilter] = useState('all')
  const [openItem, setOpenItem] = useState(null)

  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_tasks', { p_person_id: session?.person?.id ?? null, p_node_ids: locationIds })
      if (error) throw error
      setItems((Array.isArray(data) ? data : []).map(t => ({ ...t, status: norm(t.status) })))
    } catch (e) { setToast({ t: 'err', m: e.message }) } finally { setLoading(false) }
  }, [locationIds, session])
  useEffect(() => { load() }, [load])

  const showToast = (m, t = 'ok') => { setToast({ t, m }); setTimeout(() => setToast(null), 2600) }

  const onMove = useCallback(async (id, toStatus) => {
    const prev = items
    setItems(list => list.map(it => it.id === id ? { ...it, status: toStatus } : it))   // optimistic
    setOpenItem(o => (o && o.id === id ? { ...o, status: toStatus } : o))                // keep drawer in sync
    try {
      const { data, error } = await sb.rpc('update_task_status', { p_task_id: id, p_status: toStatus, p_actor: session?.person?.id ?? null })
      if (error) throw error
      // Merge the audit record (who + when) returned by the RPC.
      const a = (data && typeof data === 'object') ? data : {}
      const me = session?.person?.full_name || 'You'
      const patch = { updated_at: new Date().toISOString(), updated_by_name: me }
      if (toStatus === 'completed') { patch.completed_at = a.completed_at || new Date().toISOString(); patch.completed_by_name = a.actor_name || me }
      else { patch.completed_at = null; patch.completed_by_name = null }
      setItems(list => list.map(it => it.id === id ? { ...it, ...patch } : it))
      setOpenItem(o => (o && o.id === id ? { ...o, ...patch } : o))
      const who = prev.find(i => i.id === id)?.title || 'Task'
      const stamp = toStatus === 'completed' ? ` by ${patch.completed_by_name}` : ''
      showToast(`${who} → ${COLUMNS.find(c => c.key === toStatus)?.label}${stamp}`)
    } catch (e) { setItems(prev); showToast(`Move failed: ${e.message}`, 'err') }   // revert
  }, [items, session])

  const shown = useMemo(() => prioFilter === 'all' ? items : items.filter(i => (i.priority || '').toLowerCase() === prioFilter), [items, prioFilter])

  const kpis = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status !== 'completed').length,
    overdue: items.filter(i => i.status !== 'completed' && i.due_date && new Date(i.due_date).getTime() < Date.now()).length,
    done: items.filter(i => i.status === 'completed').length,
  }), [items])

  const renderCard = (t) => {
    const p = PRIO[(t.priority || '').toLowerCase()]
    const due = dueInfo(t.due_date)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.2 }}>{t.title}</div>
          <Avatar name={t.assignee_name} />
        </div>
        {t.description && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.description}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {p && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', color: p.color, border: `1px solid ${p.color}`, textTransform: 'uppercase', letterSpacing: '.04em' }}>{p.label}</span>}
          {t.category && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{t.category}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, color: due.overdue && t.status !== 'completed' ? 'var(--t-danger)' : 'var(--t-text-faint)', marginLeft: 'auto' }}>{due.text}</span>
        </div>
        {t.status === 'completed' && (t.completed_by_name || t.completed_at) && (
          <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: 'var(--t-success)', borderTop: '1px solid var(--t-line)', paddingTop: 5 }}>
            ✓ Done by {t.completed_by_name || 'Unknown'} · {fmtDT(t.completed_at)}
          </div>
        )}
      </div>
    )
  }

  const tableColumns = [
    { key: 'title', label: 'Task', render: t => <span style={{ fontWeight: 700 }}>{t.title}</span> },
    { key: 'owner', label: 'Assignee', render: t => t.assignee_name || '—' },
    { key: 'prio', label: 'Priority', render: t => { const p = PRIO[(t.priority || '').toLowerCase()]; return p ? <span style={{ color: p.color, fontWeight: 700 }}>{p.label}</span> : '—' } },
    { key: 'cat', label: 'Category', render: t => t.category || '—' },
    { key: 'due', label: 'Due', render: t => { const due = dueInfo(t.due_date); return <span style={{ color: due.overdue && t.status !== 'completed' ? 'var(--t-danger)' : 'var(--t-text)' }}>{fmt(t.due_date)}</span> } },
  ]

  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Tasks Board</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Drag, or click a task to start / finish & add notes · {loading ? 'loading…' : `${items.length} tasks`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)} style={{ padding: '5px 8px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 12 }}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={load} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Tasks</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Open</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>{kpis.open}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Overdue</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-danger)' }}>{kpis.overdue}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Done</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.done}</div></div>
      </div>

      <WorkBoard columns={COLUMNS} items={shown} getGroup={t => t.status} renderCard={renderCard} onMove={onMove} onOpen={setOpenItem} tableColumns={tableColumns} getSearchText={it => [it.full_name,it.name,it.title,it.employee_name,it.subject,it.job_position,it.type,it.category,it.description].filter(Boolean).join(" ")} filterViewsKey="TasksBoard" />

      <ItemDrawer
        open={!!openItem} onClose={() => setOpenItem(null)}
        entityType="task" entityId={openItem?.id}
        title={openItem?.title} subtitle={openItem?.category ? `${openItem.category}` : 'Task'}
        actorId={session?.person?.id}
        accent={COLUMNS.find(c => c.key === openItem?.status)?.color || 'var(--t-accent)'}
        fields={openItem ? [
          { label: 'Status', value: COLUMNS.find(c => c.key === openItem.status)?.label },
          { label: 'Priority', value: PRIO[(openItem.priority || '').toLowerCase()]?.label || openItem.priority },
          { label: 'Assignee', value: openItem.assignee_name || 'Unassigned' },
          { label: 'Category', value: openItem.category },
          { label: 'Due', value: fmt(openItem.due_date) },
          ...(openItem.status === 'completed' ? [{ label: 'Completed by', value: `${openItem.completed_by_name || 'Unknown'} · ${fmtDT(openItem.completed_at)}` }] : []),
          ...(openItem.updated_at ? [{ label: 'Last change', value: `${openItem.updated_by_name || 'Unknown'} · ${fmtDT(openItem.updated_at)}` }] : []),
          { label: 'Details', value: openItem.description },
        ] : []}
        actions={openItem ? (
          <>
            {openItem.status !== 'in_progress' && openItem.status !== 'completed' && (
              <button onClick={() => onMove(openItem.id, 'in_progress')} style={actBtn('var(--t-accent)')}>▶ Start (In Progress)</button>
            )}
            {openItem.status === 'in_progress' && (
              <button onClick={() => onMove(openItem.id, 'pending')} style={actBtn('var(--t-text-muted)', true)}>⏸ Move to To-Do</button>
            )}
            {openItem.status !== 'completed' ? (
              <button onClick={() => onMove(openItem.id, 'completed')} style={actBtn('var(--t-success)')}>✓ Mark Done</button>
            ) : (
              <button onClick={() => onMove(openItem.id, 'in_progress')} style={actBtn('var(--t-warn)', true)}>↺ Reopen</button>
            )}
          </>
        ) : null}
      />

      {items.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px dashed var(--t-line)', marginTop: 12 }}>
          No tasks in scope yet. Assigned tasks appear here automatically.
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.t === 'err' ? 'var(--t-danger)' : 'var(--t-success)', color: '#fff', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast.m}</div>}
    </div>
  )
}
