// OnboardingBoard.jsx — Monday.com-style VIEW-ONLY board of new hires by onboarding
// stage. Loads onboarding_pipeline; stage is derived from the pipeline row fields
// (docs_signed / training_done / training_total). No mutation RPC exists, so dragging
// a card just toasts "Stage auto-advances as tasks complete" and never persists.
// Board + Table views via the shared WorkBoard component.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import WorkBoard from '../components/WorkBoard.jsx'

const COLUMNS = [
  { key: 'new_hire', label: 'New Hire', color: 'var(--t-text-muted)' },
  { key: 'docs',     label: 'Docs',     color: 'var(--t-accent)' },
  { key: 'training', label: 'Training', color: '#a78bfa' },
  { key: 'complete', label: 'Complete', color: 'var(--t-success)' },
]
const KEYS = COLUMNS.map(c => c.key)

// Derive onboarding stage from pipeline row fields (RecruitingBoard-style normalizer).
const norm = (r) => {
  const docs = Number(r.docs_signed) || 0
  const done = Number(r.training_done) || 0
  const total = Number(r.training_total) || 0
  if (total > 0 && done >= total && docs > 0) return 'complete'
  if (done > 0 || total > 0) return 'training'
  if (docs > 0) return 'docs'
  return 'new_hire'
}

const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const daysLabel = (d) => { const n = Number(d); if (!Number.isFinite(n)) return '—'; return n <= 0 ? 'today' : n === 1 ? '1d in' : `${n}d in` }
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const pct = (r) => { const total = Number(r.training_total) || 0; if (!total) return 0; return Math.round((Math.min(Number(r.training_done) || 0, total) / total) * 100) }

function Avatar({ name }) {
  return <span title={name || 'New hire'} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{name ? initials(name) : '—'}</span>
}

function Progress({ value }) {
  return (
    <div style={{ height: 5, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', flex: 1, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, background: value >= 100 ? 'var(--t-success)' : 'var(--t-accent)' }} />
    </div>
  )
}

export default function OnboardingBoard() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [locFilter, setLocFilter] = useState('all')

  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) { setItems([]); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('onboarding_pipeline', { p_node_ids: locationIds })
      if (error) throw error
      setItems((Array.isArray(data) ? data : []).map(r => ({ ...r, id: r.person_id, stage: norm(r) })))
    } catch (e) { setToast({ t: 'err', m: e.message }) } finally { setLoading(false) }
  }, [locationIds])
  useEffect(() => { load() }, [load])

  const showToast = (m, t = 'ok') => { setToast({ t, m }); setTimeout(() => setToast(null), 2600) }

  // View-only: no update RPC exists. Do not persist — just inform the user.
  const onMove = useCallback(() => {
    showToast('Stage auto-advances as tasks complete', 'ok')
  }, [])

  const locations = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.node_name).filter(Boolean)))], [items])
  const shown = useMemo(() => locFilter === 'all' ? items : items.filter(i => i.node_name === locFilter), [items, locFilter])

  const kpis = useMemo(() => ({
    total: items.length,
    inProgress: items.filter(i => i.stage !== 'complete').length,
    training: items.filter(i => i.stage === 'training').length,
    complete: items.filter(i => i.stage === 'complete').length,
  }), [items])

  const renderCard = (r) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.2 }}>{r.full_name}</div>
        <Avatar name={r.full_name} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{r.role || '—'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>{r.node_name}</span>
        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{daysLabel(r.days_in)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Progress value={pct(r)} />
        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', minWidth: 30, textAlign: 'right' }}>{pct(r)}%</span>
      </div>
    </div>
  )

  const tableColumns = [
    { key: 'name', label: 'New Hire', render: r => <span style={{ fontWeight: 700 }}>{r.full_name}</span> },
    { key: 'role', label: 'Role', render: r => r.role || '—' },
    { key: 'loc', label: 'Location', render: r => r.node_name || '—' },
    { key: 'hired', label: 'Hired', render: r => fmt(r.hired_at) },
    { key: 'days', label: 'Days In', render: r => daysLabel(r.days_in) },
    { key: 'prog', label: 'Training', render: r => `${Number(r.training_done) || 0}/${Number(r.training_total) || 0}` },
  ]

  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px', textAlign: 'center' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Onboarding Pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Stage auto-advances as tasks complete · {loading ? 'loading…' : `${items.length} new hires`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ padding: '5px 8px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 12 }}>
            {locations.map(l => <option key={l} value={l}>{l === 'all' ? 'All locations' : l}</option>)}
          </select>
          <button onClick={load} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>New Hires</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>In Progress</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>{kpis.inProgress}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>In Training</div><div style={{ fontSize: 22, fontWeight: 800, color: '#a78bfa' }}>{kpis.training}</div></div>
        <div style={cardS}><div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Complete</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.complete}</div></div>
      </div>

      <WorkBoard columns={COLUMNS} items={shown} getGroup={r => r.stage} renderCard={renderCard} onMove={onMove} tableColumns={tableColumns} getSearchText={it => [it.full_name,it.name,it.title,it.employee_name,it.subject,it.job_position,it.type,it.category,it.description].filter(Boolean).join(" ")} filterViewsKey="OnboardingBoard" />

      {items.length === 0 && !loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px dashed var(--t-line)', marginTop: 12 }}>
          No new hires in scope yet. Recently hired employees appear here automatically as they onboard.
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.t === 'err' ? 'var(--t-danger)' : 'var(--t-success)', color: '#fff', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast.m}</div>}
    </div>
  )
}
