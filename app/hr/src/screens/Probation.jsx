import { useState, useEffect, useRef, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'

/* ── helpers ─────────────────────────────────────────────────────────── */
function fmtDate(ds) {
  if (!ds) return '—'
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function probEndDate(hireDate, days) {
  const d = new Date(hireDate + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysRemaining(hireDate, days) {
  const end = new Date(hireDate + 'T12:00:00')
  end.setDate(end.getDate() + days)
  const now = new Date()
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
}

function isDecisionTime(hireDate, days) {
  return daysRemaining(hireDate, days) <= 7
}

function locColor(loc) {
  if (loc === 'Orange')     return 'var(--t-warn)'
  if (loc === 'Hartford')   return 'var(--t-accent)'
  if (loc === 'Manchester') return 'var(--t-success)'
  return 'var(--t-text-muted)'
}

const AVATAR_COLORS = ['#7c4dff', '#2979ff', '#2ad6a0', '#ffb800', '#ff4d7d', '#00e5ff', '#ff6d00', '#aa00ff']

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name[0].toUpperCase()
}

/* ── constants ───────────────────────────────────────────────────────── */
const MILESTONES = [
  { id: 'm30',      label: '30-day check-in completed' },
  { id: 'training', label: 'All required training complete' },
  { id: 'solo',     label: 'Solo shift performance satisfactory' },
  { id: 'm60',      label: '60-day check-in completed' },
  { id: 'goals',    label: 'Goals set for 90-day review' },
  { id: 'm90',      label: '90-day performance review scheduled' },
]

const ROLE_OPTIONS = ['Associate', 'Key Holder', 'Manager']

/* ── FeatureDisabled ─────────────────────────────────────────────────── */
function FeatureDisabled({ name }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', background: '#070b14', minHeight: '100vh', color: 'var(--t-text)' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{name} — Disabled</div>
      <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
        Enable <strong>probation_tracker</strong> in Feature Toggles to access this module.
      </div>
    </div>
  )
}

/* ── style object ────────────────────────────────────────────────────── */
const S = {
  page: { background: '#070b14', minHeight: '100vh', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  header: { background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  subtitle: { fontSize: 11, color: 'var(--t-text-muted)', margin: 0 },
  body: { padding: 20 },
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 },
  card: (borderColor = 'var(--t-line)', leftColor = null) => ({
    background: 'var(--t-surface)',
    border: `1px solid ${borderColor}`,
    borderLeft: leftColor ? `4px solid ${leftColor}` : `1px solid ${borderColor}`,
    padding: 16,
  }),
  btn: (bg = '#00e5ff', color = '#070b14') => ({ background: bg, color, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.15)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.4)', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  btnWarn: { background: 'rgba(255,184,0,0.12)', color: '#ffb800', border: '1px solid rgba(255,184,0,0.4)', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  btnSm: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  formRow: { marginBottom: 12 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 60 },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
}

/* ── KTile ───────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 100, flex: 1 }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── main component ──────────────────────────────────────────────────── */
export default function Probation() {
  const flagEnabled = useFeatureFlag('probation_tracker')
  if (!flagEnabled) return <FeatureDisabled name="Probation Period Tracker" />

  const { session } = useAuth()
  const role = session?.person?.role_name || ''
  const managerName = session?.person?.full_name || session?.person?.name || ''
  const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
  const isManager = HR_ROLES.some(r => role.toLowerCase().includes(r))

  if (!isManager) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...S.card(), padding: 32, textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🔐</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Manager Access Required</div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            Probation Period Tracker is restricted to managers and HR staff.
          </div>
        </div>
      </div>
    )
  }

  const config = useConfig()
  const probationDays = config?.probation_days ?? 90

  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [activeProbs, setActiveProbs] = useState([])
  const [completed, setCompleted]     = useState([])
  const [kpis, setKpis]               = useState({ onProbation: 0, endingThisWeek: 0, endingThisMonth: 0, extended: 0 })
  const [nodeOptions, setNodeOptions] = useState([])

  const [showCompleted, setShowCompleted] = useState(false)
  const [extendPanel, setExtendPanel]     = useState(null)
  const [extendForm, setExtendForm]       = useState({ duration: 30, reason: '' })
  const [showAdd, setShowAdd]             = useState(false)
  const [addForm, setAddForm]             = useState({ name: '', role: 'Associate', location: '', hireDate: new Date().toISOString().slice(0, 10) })
  const [busy, setBusy]                   = useState(false)
  const [toast, setToast]                 = useState(null)
  const toastRef = useRef(null)

  const sess = getSession()
  const nodeIds = Array.isArray(sess?.nodes) && sess.nodes.length ? sess.nodes : null
  const actorId = sess?.id || null

  /* toast helper */
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3500)
  }, [])

  /* load probation data from the server */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await sb.rpc('probation_list', { p_node_ids: nodeIds })
    if (error) {
      setLoadError(error.message || 'Failed to load probation records.')
      setActiveProbs([])
      setCompleted([])
      setKpis({ onProbation: 0, endingThisWeek: 0, endingThisMonth: 0, extended: 0 })
    } else {
      const d = data || {}
      setActiveProbs(Array.isArray(d.active) ? d.active : [])
      setCompleted(Array.isArray(d.completed) ? d.completed : [])
      setKpis(d.kpis || { onProbation: 0, endingThisWeek: 0, endingThisMonth: 0, extended: 0 })
    }
    setLoading(false)
  }, [nodeIds])

  /* load location options (real org_nodes) for the add form */
  const loadNodes = useCallback(async () => {
    const { data, error } = await sb.from('org_nodes').select('id,name').order('name')
    if (!error && Array.isArray(data)) setNodeOptions(data)
  }, [])

  useEffect(() => { load(); loadNodes() }, [load, loadNodes])
  useEffect(() => () => { if (toastRef.current) clearTimeout(toastRef.current) }, [])

  /* toggle milestone (optimistic, then persist) */
  async function toggleMilestone(empId, milestoneId) {
    const emp = activeProbs.find(e => e.id === empId)
    if (!emp) return
    const next = !emp.milestones?.[milestoneId]
    setActiveProbs(prev => prev.map(e =>
      e.id === empId ? { ...e, milestones: { ...e.milestones, [milestoneId]: next } } : e
    ))
    const { data, error } = await sb.rpc('probation_set_milestone', { p_id: empId, p_key: milestoneId, p_value: next })
    if (error || (data && data.ok === false)) {
      // revert on failure
      setActiveProbs(prev => prev.map(e =>
        e.id === empId ? { ...e, milestones: { ...e.milestones, [milestoneId]: !next } } : e
      ))
      showToast('Could not save milestone.', 'error')
    }
  }

  /* save notes on blur */
  async function saveNotes(empId, notes) {
    const emp = activeProbs.find(e => e.id === empId)
    if (!emp || (emp.notes || '') === (notes || '')) return
    const { data, error } = await sb.rpc('probation_save_notes', { p_id: empId, p_notes: notes })
    if (error || (data && data.ok === false)) { showToast('Could not save notes.', 'error'); return }
    setActiveProbs(prev => prev.map(e => e.id === empId ? { ...e, notes } : e))
  }

  /* add employee to probation */
  async function handleAdd() {
    if (!addForm.name.trim()) { showToast('Enter the employee name.', 'error'); return }
    if (!addForm.hireDate)    { showToast('Enter a hire date.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('probation_add', {
      p_data: {
        name: addForm.name.trim(),
        role: addForm.role,
        location: addForm.location,
        hireDate: addForm.hireDate,
        probationDays: probationDays,
        actorId: actorId,
      },
    })
    setBusy(false)
    if (error || !data || data.ok === false) { showToast('Could not add to probation.', 'error'); return }
    showToast(`${addForm.name.trim()} added to probation`)
    setShowAdd(false)
    setAddForm({ name: '', role: 'Associate', location: '', hireDate: new Date().toISOString().slice(0, 10) })
    load()
  }

  /* pass probation */
  async function handlePass(emp) {
    if (!window.confirm(`Mark ${emp.name} as passed probation?`)) return
    setBusy(true)
    const { data, error } = await sb.rpc('probation_pass', { p_id: emp.id, p_manager: managerName })
    setBusy(false)
    if (error || !data || data.ok === false) { showToast('Could not update probation.', 'error'); return }
    showToast(`Probation passed — ${emp.name} marked active`)
    load()
  }

  /* extend probation */
  async function handleExtendConfirm(emp) {
    if (!extendForm.reason.trim()) { showToast('Please enter a reason for the extension.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('probation_extend', { p_id: emp.id, p_days: extendForm.duration, p_reason: extendForm.reason.trim() })
    setBusy(false)
    if (error || !data || data.ok === false) { showToast('Could not extend probation.', 'error'); return }
    showToast(`Probation extended by ${extendForm.duration} days for ${emp.name}`)
    setExtendPanel(null)
    setExtendForm({ duration: 30, reason: '' })
    load()
  }

  /* terminate */
  async function handleTerminate(emp) {
    if (!window.confirm(`Terminate ${emp.name}? This action should be followed by a DA in the Disciplinary module.`)) return
    setBusy(true)
    const { data, error } = await sb.rpc('probation_terminate', { p_id: emp.id, p_manager: managerName })
    setBusy(false)
    if (error || !data || data.ok === false) { showToast('Could not update probation.', 'error'); return }
    showToast(`Termination process initiated — complete DA in Disciplinary module`)
    load()
  }

  /* outcome badge color */
  function outcomeColor(outcome) {
    if (outcome === 'Passed')     return 'var(--t-success)'
    if (outcome === 'Extended')   return 'var(--t-warn)'
    if (outcome === 'Terminated') return 'var(--t-danger)'
    return 'var(--t-text-muted)'
  }

  /* progress bar color */
  function progressColor(rem, total) {
    const pct = rem / total
    if (pct > 0.5)  return 'var(--t-success)'
    if (pct > 0.2)  return 'var(--t-warn)'
    return 'var(--t-danger)'
  }

  /* status badge */
  function statusLabel(status) {
    if (status === 'on_track') return { label: 'ON TRACK',  color: 'var(--t-success)' }
    if (status === 'extended') return { label: 'EXTENDED',  color: 'var(--t-warn)' }
    return                            { label: 'BEHIND',    color: 'var(--t-warn)' }
  }

  /* role badge color */
  function roleBadgeColor(r) {
    if (r === 'Manager')    return '#7c4dff'
    if (r === 'Key Holder') return '#00e5ff'
    return 'var(--t-text-muted)'
  }

  return (
    <div style={S.page}>
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h1 style={S.title}>Probation Period Tracker</h1>
          <p style={S.subtitle}>
            Probation period: {probationDays} days (configurable in Settings → White Label)
          </p>
        </div>
        <button style={S.btn()} onClick={() => setShowAdd(v => !v)}>
          {showAdd ? 'Close' : '+ Start Probation'}
        </button>
      </div>

      {/* ADD FORM */}
      {showAdd && (
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ ...S.card('#00e5ff'), maxWidth: 620 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Start a Probation Period</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={S.formRow}>
                <label style={S.label}>Employee Name</label>
                <input style={S.input} value={addForm.name} placeholder="Full name"
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={S.formRow}>
                <label style={S.label}>Role</label>
                <select style={S.select} value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={S.formRow}>
                <label style={S.label}>Location</label>
                {nodeOptions.length > 0 ? (
                  <select style={S.select} value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}>
                    <option value="">— Select —</option>
                    {nodeOptions.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                  </select>
                ) : (
                  <input style={S.input} value={addForm.location} placeholder="Location"
                    onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))} />
                )}
              </div>
              <div style={S.formRow}>
                <label style={S.label}>Hire Date</label>
                <input type="date" style={S.input} value={addForm.hireDate}
                  onChange={e => setAddForm(f => ({ ...f, hireDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button style={S.btn()} disabled={busy} onClick={handleAdd}>
                {busy ? 'Saving…' : 'Add to Probation'}
              </button>
              <button style={S.btnOutline()} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* KPI ROW */}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KTile label="Currently on Probation" value={kpis.onProbation} sub="Active probation periods" color="#00e5ff" />
        <KTile label="Ending This Week" value={kpis.endingThisWeek}
          alert={kpis.endingThisWeek > 0 ? 'red' : null}
          color={kpis.endingThisWeek > 0 ? 'var(--t-danger)' : '#2ad6a0'} />
        <KTile label="Ending This Month" value={kpis.endingThisMonth} color="#ffb800" />
        <KTile label="Extended Probations" value={kpis.extended} color="var(--t-text-muted)" />
      </div>

      {/* BODY */}
      <div style={S.body}>

        {/* ACTIVE PROBATIONS */}
        <div style={S.sectionLabel}>Active Probation Periods</div>

        {loading ? (
          <div style={{ ...S.card(), padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13, marginBottom: 32 }}>
            Loading probation records…
          </div>
        ) : loadError ? (
          <div style={{ ...S.card('var(--t-danger)'), padding: 24, marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-danger)', marginBottom: 6 }}>Could not load probation records</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 12 }}>{loadError}</div>
            <button style={S.btnOutline()} onClick={load}>Retry</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16, marginBottom: 32 }}>
            {activeProbs.map(emp => {
              const empDays  = emp.probationDays || probationDays
              const rem      = daysRemaining(emp.hireDate, empDays)
              const elapsed  = empDays - rem
              const pct      = Math.min(100, Math.round((elapsed / empDays) * 100))
              const endDate  = probEndDate(emp.hireDate, empDays)
              const decide   = isDecisionTime(emp.hireDate, empDays)
              const badge    = statusLabel(emp.status)
              const mCount   = MILESTONES.filter(m => emp.milestones?.[m.id]).length
              const aColor   = avatarColor(emp.name)
              const isExtend = extendPanel === emp.id
              const barColor = progressColor(rem, empDays)

              return (
                <div key={emp.id} style={S.card(decide ? 'var(--t-danger)' : 'var(--t-line)', decide ? 'var(--t-danger)' : null)}>

                  {/* card header: avatar + name + role + location */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 36, height: 36, background: aColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#070b14', flexShrink: 0 }}>
                      {initials(emp.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</span>
                        {emp.role && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: roleBadgeColor(emp.role), background: 'rgba(0,0,0,0.3)', padding: '2px 6px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {emp.role}
                          </span>
                        )}
                        {emp.location && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: locColor(emp.location), background: 'rgba(0,0,0,0.3)', padding: '2px 6px' }}>
                            {emp.location}
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: 'rgba(0,0,0,0.3)', padding: '2px 6px', letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 'auto' }}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* dates */}
                  <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Hire Date</div>
                      <div style={{ fontSize: 12, color: 'var(--t-text)' }}>{fmtDate(emp.hireDate)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Probation Ends</div>
                      <div style={{ fontSize: 12, color: decide ? 'var(--t-danger)' : 'var(--t-text)' }}>{fmtDate(endDate)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Days Remaining</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: barColor, lineHeight: 1 }}>{rem}</div>
                    </div>
                  </div>

                  {/* progress bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ height: 6, background: 'var(--t-line)', width: '100%', borderRadius: 0, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 0.4s ease', borderRadius: 0 }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4 }}>
                      {rem} days remaining of {empDays}
                    </div>
                  </div>

                  {/* milestone checklist */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Milestones</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: mCount === MILESTONES.length ? 'var(--t-success)' : 'var(--t-text-muted)' }}>
                        {mCount}/{MILESTONES.length} completed
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {MILESTONES.map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: emp.milestones?.[m.id] ? 'var(--t-success)' : 'var(--t-text-muted)', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!emp.milestones?.[m.id]}
                            onChange={() => toggleMilestone(emp.id, m.id)}
                            style={{ accentColor: 'var(--t-success)', width: 13, height: 13, cursor: 'pointer' }}
                          />
                          <span style={{ textDecoration: emp.milestones?.[m.id] ? 'line-through' : 'none', opacity: emp.milestones?.[m.id] ? 0.6 : 1 }}>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* manager notes */}
                  <div style={{ marginBottom: decide ? 14 : 0 }}>
                    <label style={S.label}>Manager Notes</label>
                    <textarea
                      rows={2}
                      defaultValue={emp.notes}
                      placeholder="Add notes..."
                      style={S.textarea}
                      onBlur={e => saveNotes(emp.id, e.target.value)}
                    />
                  </div>

                  {/* decision panel — shown when ≤7 days or past */}
                  {decide && (
                    <div style={{ borderTop: '1px solid var(--t-line)', paddingTop: 14, marginTop: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-danger)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                        ⚠ Decision Required — {rem === 0 ? 'Probation Expired' : `${rem} day${rem === 1 ? '' : 's'} remaining`}
                      </div>

                      {!isExtend ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button style={S.btn('#2ad6a0', '#070b14')} disabled={busy} onClick={() => handlePass(emp)}>
                            Pass Probation
                          </button>
                          <button style={S.btnWarn} onClick={() => { setExtendPanel(emp.id); setExtendForm({ duration: 30, reason: '' }) }}>
                            Extend Probation
                          </button>
                          <button style={S.btnDanger} disabled={busy} onClick={() => handleTerminate(emp)}>
                            Terminate
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={S.formRow}>
                            <label style={S.label}>Extension Duration</label>
                            <select
                              style={S.select}
                              value={extendForm.duration}
                              onChange={e => setExtendForm(f => ({ ...f, duration: Number(e.target.value) }))}
                            >
                              <option value={14}>14 days</option>
                              <option value={30}>30 days</option>
                              <option value={60}>60 days</option>
                            </select>
                          </div>
                          <div style={S.formRow}>
                            <label style={S.label}>Reason for Extension</label>
                            <textarea
                              rows={2}
                              placeholder="Describe reason for extension..."
                              style={S.textarea}
                              value={extendForm.reason}
                              onChange={e => setExtendForm(f => ({ ...f, reason: e.target.value }))}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={S.btn('#ffb800', '#070b14')} disabled={busy} onClick={() => handleExtendConfirm(emp)}>
                              Confirm Extension
                            </button>
                            <button style={S.btnOutline()} onClick={() => setExtendPanel(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {activeProbs.length === 0 && (
              <div style={{ ...S.card(), padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
                No active probation periods yet. Use “+ Start Probation” to add one.
              </div>
            )}
          </div>
        )}

        {/* COMPLETED PROBATIONS */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={S.sectionLabel}>Completed Probations</div>
            {completed.length > 0 && (
              <button style={S.btnOutline()} onClick={() => setShowCompleted(v => !v)}>
                {showCompleted ? 'Collapse ▲' : `Show All (${completed.length}) ▼`}
              </button>
            )}
          </div>

          {completed.length === 0 ? (
            <div style={{ ...S.card(), padding: 24, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No completed probations yet.
            </div>
          ) : showCompleted && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(90deg, #1a0a2e 0%, #0c1a3e 50%, #0a1a1a 100%)' }}>
                    {['Name', 'Hire Date', 'Probation End', 'Outcome', 'Manager'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completed.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'transparent', borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--t-text)', fontWeight: 600 }}>{row.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)' }}>{fmtDate(row.hireDate)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)' }}>{fmtDate(row.probationEnd)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: outcomeColor(row.outcome), textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {row.outcome}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)' }}>{row.manager || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
