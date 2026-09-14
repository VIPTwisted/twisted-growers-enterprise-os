// RecruitingBoard.jsx — Monday.com-style hiring pipeline on REAL candidates.
// Loads get_applicants; drag a card between stage columns to persist via
// update_applicant_stage. Board + Table views. Pilot for the WorkBoard pattern.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import WorkBoard from '../components/WorkBoard.jsx'
import ItemDrawer from '../components/ItemDrawer.jsx'

const COLUMNS = [
  { key: 'applied',   label: 'Applied',   color: 'var(--t-text-muted)' },
  { key: 'screening', label: 'Screening', color: 'var(--t-accent)' },
  { key: 'interview', label: 'Interview', color: '#a78bfa' },
  { key: 'offer',     label: 'Offer',     color: 'var(--t-warn)' },
  { key: 'hired',     label: 'Hired',     color: 'var(--t-success)' },
  { key: 'rejected',  label: 'Rejected',  color: 'var(--t-danger)' },
]
const KEYS = COLUMNS.map(c => c.key)
const norm = (s) => { const v = (s || '').toLowerCase(); return KEYS.includes(v) ? v : 'applied' }
const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const daysAgo = (d) => { if (!d) return '—'; const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return n <= 0 ? 'today' : n === 1 ? '1d' : `${n}d` }
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

function Avatar({ name }) {
  return <span title={name || 'Unassigned'} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{name ? initials(name) : '—'}</span>
}

export default function RecruitingBoard() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [srcFilter, setSrcFilter] = useState('all')
  const [openItem, setOpenItem] = useState(null)

  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_applicants', { p_node_ids: locationIds })
      if (error) throw error
      setItems((Array.isArray(data) ? data : []).map(a => ({ ...a, stage: norm(a.stage) })))
    } catch (e) { setToast({ t: 'err', m: e.message }) } finally { setLoading(false) }
  }, [locationIds])
  useEffect(() => { load() }, [load])

  const showToast = (m, t = 'ok') => { setToast({ t, m }); setTimeout(() => setToast(null), 2600) }

  const onMove = useCallback(async (id, toStage) => {
    const prev = items
    setItems(list => list.map(it => it.id === id ? { ...it, stage: toStage } : it))   // optimistic
    try {
      const { error } = await sb.rpc('update_applicant_stage', { p_applicant_id: id, p_stage: toStage, p_notes: null })
      if (error) throw error
      const who = prev.find(i => i.id === id)?.full_name || 'Candidate'
      showToast(`${who} → ${COLUMNS.find(c => c.key === toStage)?.label}`)
    } catch (e) { setItems(prev); showToast(`Move failed: ${e.message}`, 'err') }   // revert
  }, [items])

  const sources = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.source).filter(Boolean)))], [items])
  const shown = useMemo(() => srcFilter === 'all' ? items : items.filter(i => i.source === srcFilter), [items, srcFilter])

  const kpis = useMemo(() => ({
    total: items.length,
    active: items.filter(i => !['hired', 'rejected'].includes(i.stage)).length,
    hired: items.filter(i => i.stage === 'hired').length,
    offers: items.filter(i => i.stage === 'offer').length,
  }), [items])

  const renderCard = (a) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.2 }}>{a.full_name}</div>
        <Avatar name={a.assignee_name} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{a.job_position || '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {a.source && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{a.source}</span>}
        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{daysAgo(a.applied_at)}</span>
      </div>
    </div>
  )

  const tableColumns = [
    { key: 'name', label: 'Candidate', render: a => <span style={{ fontWeight: 700 }}>{a.full_name}</span> },
    { key: 'pos', label: 'Position', render: a => a.job_position || '—' },
    { key: 'src', label: 'Source', render: a => a.source || '—' },
    { key: 'owner', label: 'Owner', render: a => a.assignee_name || '—' },
    { key: 'applied', label: 'Applied', render: a => fmt(a.applied_at) },
  ]

  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Recruiting Pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Drag candidates between stages · {loading ? 'loading…' : `${items.length} candidates`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={srcFilter} onChange={e => setSrcFilter(e.target.value)} style={{ padding: '5px 8px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 12 }}>
            {sources.map(s => <option key={s} value={s}>{s === 'all' ? 'All sources' : s}</option>)}
          </select>
          <button onClick={load} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Candidates</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Active</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>{kpis.active}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Offers Out</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>{kpis.offers}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Hired</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.hired}</div></div>
      </div>

      <WorkBoard columns={COLUMNS} items={shown} getGroup={a => a.stage} renderCard={renderCard} onMove={onMove} onOpen={setOpenItem} tableColumns={tableColumns} getSearchText={it => [it.full_name,it.name,it.title,it.employee_name,it.subject,it.job_position,it.type,it.category,it.description].filter(Boolean).join(" ")} filterViewsKey="RecruitingBoard" />

      <ItemDrawer
        open={!!openItem} onClose={() => setOpenItem(null)}
        entityType="applicant" entityId={openItem?.id}
        title={openItem?.full_name} subtitle={openItem?.job_position}
        actorId={session?.person?.id}
        accent={COLUMNS.find(c => c.key === openItem?.stage)?.color || 'var(--t-accent)'}
        fields={openItem ? [
          { label: 'Stage', value: COLUMNS.find(c => c.key === openItem.stage)?.label },
          { label: 'Position', value: openItem.job_position },
          { label: 'Source', value: openItem.source },
          { label: 'Owner', value: openItem.assignee_name || 'Unassigned' },
          { label: 'Email', value: openItem.email },
          { label: 'Phone', value: openItem.phone },
          { label: 'Applied', value: fmt(openItem.applied_at) },
        ] : []}
      />

      {items.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px dashed var(--t-line)', marginTop: 12 }}>
          No candidates in scope yet. New applicants appear here automatically (via <b>create_applicant</b>).
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.t === 'err' ? 'var(--t-danger)' : 'var(--t-success)', color: '#fff', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast.m}</div>}
    </div>
  )
}
