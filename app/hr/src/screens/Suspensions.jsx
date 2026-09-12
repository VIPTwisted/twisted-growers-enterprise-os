import { useState, useMemo, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase.js'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const today = () => new Date().toISOString().slice(0, 10)

const addDays = (dateStr, n) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHRRole = (r = '') => HR_ROLES.some(h => r.toLowerCase().includes(h))

const toast = (msg, type = 'success') => {
  try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg, type } })) } catch { /* non-browser */ }
}

function FeatureDisabled() {
  return (
    <div style={{ padding:40, textAlign:'center' }}>
      <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>🔒</div>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--t-text)', marginBottom:6 }}>Feature Not Enabled</div>
      <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>
        Enable <strong>suspensions</strong> in Feature Toggles to access Suspension Management.
      </div>
    </div>
  )
}

/* ── map a live get_suspensions row → the shape this screen renders ───────────
   The RPC returns { id, person_id, person_name, node_id, node_name, susp_type,
   start_date, duration_days, end_date, reason, related_da, witnessed_by,
   issued_by, issued_by_name, manager_notes, status, returned_at,
   returned_on_time }. role_name is enriched from the roster map — never invented. */
const mapSuspension = (r, roleByPerson) => ({
  id:               r.id,
  person_id:        r.person_id || null,
  person_name:      r.person_name || '—',
  node_id:          r.node_id || null,
  node_name:        r.node_name || '—',
  role_name:        (r.person_id && roleByPerson.get(r.person_id)) || '—',
  type:             String(r.susp_type || '').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid',
  start_date:       r.start_date || null,
  duration:         r.duration_days != null ? Number(r.duration_days) : null,
  end_date:         r.end_date || null,
  reason:           r.reason || '—',
  related_da:       r.related_da || '',
  witnessed_by:     r.witnessed_by || '',
  issued_by:        r.issued_by_name || 'HR',
  notes:            r.manager_notes || '',
  status:           r.status || 'active',
  returned_at:      r.returned_at || null,
  returned_on_time: r.returned_on_time === true,
})

/* ── blank new suspension form ───────────────────────────── */
const blankSuspForm = () => ({
  person_id: '',
  type: 'Unpaid',
  start_date: today(),
  duration: 1,
  related_da: '',
  reason: '',
  witnessed_by: '',
  notified: false,
})

const selStyle = {
  background:'var(--t-surface-2)',
  border:'1px solid var(--t-line)',
  color:'var(--t-text)',
  padding:'6px 10px',
  fontSize:13,
  borderRadius:0,
}
const inputStyle = {
  background:'var(--t-surface-2)',
  border:'1px solid var(--t-line)',
  color:'var(--t-text)',
  padding:'6px 10px',
  fontSize:13,
  width:'100%',
  boxSizing:'border-box',
  borderRadius:0,
}
const taStyle = { ...inputStyle, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════ */
export default function Suspensions() {
  const suspEnabled = useFeatureFlag('suspensions')
  const config      = useConfig()
  const { session } = useAuth()
  const { locationIds, nodes } = useScope() || {}
  const roleName    = session?.person?.role_name || ''
  const personId    = session?.person?.id || null
  const isManager   = isHRRole(roleName)

  const maxDays = Number(config.suspension_max_days) || 5

  const [activeTab, setActiveTab]     = useState('active')
  const [records, setRecords]         = useState([])
  const [employees, setEmployees]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState(blankSuspForm)
  const [saving, setSaving]           = useState(false)
  const [noteEdits, setNoteEdits]     = useState({})
  const [savingNote, setSavingNote]   = useState(null)
  const [returningId, setReturningId] = useState(null)
  const [confirmReturn, setConfirmReturn] = useState(null)

  const locKey = (locationIds || []).join(',')

  /* role lookup enriched from the roster (person_id → role name) */
  const roleByPerson = useMemo(
    () => new Map((employees || []).map(e => [e.id || e.person_id, e.role_name])),
    [employees]
  )

  /* ── load suspensions (real) ─────────────────────────────── */
  const load = useCallback(() => {
    const ids = locationIds || []
    if (!ids.length) { setRecords([]); setLoading(false); return }
    setLoading(true)
    sb.rpc('get_suspensions', { p_node_ids: ids })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Suspensions] get_suspensions failed:', error.message || error)
          setRecords([]); setLoadError('The suspension service is temporarily unavailable.')
        } else {
          setLoadError(null)
          setRecords(Array.isArray(data) ? data.map(r => mapSuspension(r, roleByPerson)) : [])
        }
        setLoading(false)
      })
      .catch((e) => {
        console.error('[Suspensions] get_suspensions error:', e)
        setRecords([]); setLoadError('The suspension service is temporarily unavailable.'); setLoading(false)
      })
  }, [locKey, roleByPerson])

  useEffect(() => { load() }, [load])

  /* ── load roster for the employee picker + role enrichment ── */
  useEffect(() => {
    const ids = locationIds || []
    if (!ids.length) { setEmployees([]); return }
    sb.rpc('get_roster', { p_node_ids: ids })
      .then(({ data, error }) => setEmployees(!error && Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
  }, [locKey])

  /* ── active vs history split (real status) ───────────────── */
  const activeList  = useMemo(() => records.filter(r => r.status !== 'returned'), [records])
  const historyList = useMemo(() => records.filter(r => r.status === 'returned'), [records])

  /* history filters */
  const [hFilterLoc,  setHFilterLoc]  = useState('All')
  const [hFilterType, setHFilterType] = useState('All')
  const [hFilterFrom, setHFilterFrom] = useState('')
  const [hFilterTo,   setHFilterTo]   = useState('')
  const [hSearch,     setHSearch]     = useState('')

  /* real location list — session nodes + any location present in records */
  const locNames = useMemo(() => {
    const s = new Set()
    ;(nodes || []).forEach(n => { if ((n.node_type === 'location' || !n.node_type) && n.name) s.add(n.name) })
    records.forEach(r => { if (r.node_name && r.node_name !== '—') s.add(r.node_name) })
    return ['All', ...[...s].sort()]
  }, [nodes, records])

  /* KPIs — derived from real records */
  const kpis = useMemo(() => {
    const now = new Date()
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    const quarterly = records.filter(r => r.start_date && new Date(r.start_date) >= qStart).length
    const withDur = records.filter(r => r.duration != null)
    const avg = withDur.length
      ? Math.round(withDur.reduce((s, r) => s + r.duration, 0) / withDur.length)
      : null
    const returned = historyList.length
    const onTime = historyList.filter(r => r.returned_on_time).length
    return {
      active:      activeList.length,
      quarterly,
      avgDuration: avg != null ? `${avg} day${avg !== 1 ? 's' : ''}` : '—',
      returnRate:  returned ? `${Math.round((onTime / returned) * 100)}%` : '—',
    }
  }, [records, activeList, historyList])

  /* computed end date */
  const computedEnd = form.start_date && form.duration
    ? addDays(form.start_date, Number(form.duration))
    : ''

  /* filtered history */
  const filteredHistory = useMemo(() => {
    return historyList.filter(r => {
      if (hFilterLoc  !== 'All' && r.node_name !== hFilterLoc)  return false
      if (hFilterType !== 'All' && r.type      !== hFilterType)  return false
      if (hFilterFrom && r.start_date < hFilterFrom)             return false
      if (hFilterTo   && r.start_date > hFilterTo)               return false
      if (hSearch && !r.person_name.toLowerCase().includes(hSearch.toLowerCase())) return false
      return true
    })
  }, [historyList, hFilterLoc, hFilterType, hFilterFrom, hFilterTo, hSearch])

  if (!suspEnabled) return <FeatureDisabled />

  /* ── form submit → real write ─────────────────────────────── */
  async function handleIssue() {
    const emp = employees.find(e => (e.id || e.person_id) === form.person_id)
    if (!emp) { toast('Select an employee from the roster before issuing.', 'error'); return }
    if (!form.reason.trim()) { toast('A reason is required to issue a suspension.', 'error'); return }
    if (!form.notified) {
      toast('Employee must be notified before issuing suspension.', 'error')
      return
    }
    const nodeId = emp.node_id || (locationIds || [])[0] || null
    if (!nodeId) { toast('No location in scope to attach this suspension to.', 'error'); return }
    const dur = Math.min(Math.max(1, Number(form.duration)), maxDays)
    const msg = `Issue ${dur}-day ${form.type.toLowerCase()} suspension for ${emp.full_name}? This cannot be undone.`
    if (!window.confirm(msg)) return

    setSaving(true)
    let err = null
    try {
      const { error } = await sb.rpc('issue_suspension', {
        p_person_id:     form.person_id,
        p_node_id:       nodeId,
        p_type:          form.type,
        p_start_date:    form.start_date,
        p_duration_days: dur,
        p_reason:        form.reason,
        p_related_da:    form.related_da || null,
        p_witnessed_by:  form.witnessed_by || null,
        p_issued_by:     personId,
      })
      err = error
    } catch (e) { err = e || new Error('save failed') }
    setSaving(false)

    if (err) {
      console.error('[Suspensions] issue_suspension failed:', err.message || err)
      toast('Not saved — ' + (err.message || 'server error') + '.', 'error')
      return
    }
    import('../lib/audit.js').then(m => m.logAudit('Suspension Issued', { target: emp.full_name || form.person_id, meta: { type: form.type, days: dur } })).catch(() => {})
    setForm(blankSuspForm())
    setShowForm(false)
    toast(`Suspension issued for ${emp.full_name}.`, 'success')
    load()
    setActiveTab('active')
  }

  /* ── save manager notes → real write ─────────────────────── */
  async function saveNote(id) {
    const val = noteEdits[id] !== undefined ? noteEdits[id] : ''
    setSavingNote(id)
    let err = null
    try {
      const { error } = await sb.rpc('update_suspension_note', { p_id: id, p_note: val })
      err = error
    } catch (e) { err = e || new Error('save failed') }
    setSavingNote(null)
    if (err) {
      console.error('[Suspensions] update_suspension_note failed:', err.message || err)
      toast('Notes not saved — ' + (err.message || 'server error') + '.', 'error')
      return
    }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, notes: val } : r))
    setNoteEdits(prev => { const n = { ...prev }; delete n[id]; return n })
    toast('Manager notes saved.', 'success')
  }

  /* ── mark returned → real write ──────────────────────────── */
  async function markReturned(id) {
    setReturningId(id)
    let err = null
    try {
      const { error } = await sb.rpc('mark_suspension_returned', { p_id: id, p_actor: personId, p_note: null })
      err = error
    } catch (e) { err = e || new Error('return failed') }
    setReturningId(null)
    setConfirmReturn(null)
    if (err) {
      console.error('[Suspensions] mark_suspension_returned failed:', err.message || err)
      toast('Not saved — ' + (err.message || 'server error') + '.', 'error')
      return
    }
    import('../lib/audit.js').then(m => m.logAudit('Suspension Returned', { target: id })).catch(() => {})
    toast('Employee marked as returned. RTW check-in queued.', 'success')
    load()
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── page header ───────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20, gap:16, flexWrap:'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom:4 }}>Suspension Management</div>
          <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>
            Track and manage employee suspensions with full documentation
          </div>
        </div>
        {isManager && (
          <button
            className="btn-approve"
            onClick={() => setShowForm(s => !s)}
          >
            {showForm ? 'Cancel' : '+ Issue Suspension'}
          </button>
        )}
      </div>

      {/* ── config note ───────────────────────────────────── */}
      <div style={{ fontSize:12, color:'var(--t-text-muted)', marginBottom:16 }}>
        Max suspension duration:{' '}
        <strong style={{ color:'var(--t-text)' }}>{maxDays} days</strong>
        {' '}(configurable in Settings)
      </div>

      {/* ── load error banner ─────────────────────────────── */}
      {loadError && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-danger)', borderLeft:'4px solid var(--t-danger)', padding:'12px 14px', marginBottom:16, fontSize:13, color:'var(--t-danger)' }}>
          {loadError}
        </div>
      )}

      {/* ── KPI row ───────────────────────────────────────── */}
      <div className="kpis" style={{ marginBottom:20 }}>
        {[
          ['Active Suspensions',          kpis.active,      kpis.active > 0 ? 'amber' : ''],
          ['Suspensions This Quarter',     kpis.quarterly,   ''],
          ['Avg Duration',                 kpis.avgDuration, ''],
          ['Return Rate (on schedule)',    kpis.returnRate,  'green'],
        ].map(([label, val, color]) => (
          <div key={label} className="kpi">
            <div className="label">{label}</div>
            <div className={`val${color ? ' ' + color : ''}`}>{loading ? '…' : val}</div>
          </div>
        ))}
      </div>

      {/* ── new suspension form ───────────────────────────── */}
      {showForm && isManager && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:20, marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--t-accent)', letterSpacing:'0.06em', marginBottom:16 }}>
            ISSUE NEW SUSPENSION
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>EMPLOYEE *</div>
              <select
                value={form.person_id}
                onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}
                style={{ ...selStyle, width:'100%' }}
              >
                <option value="">
                  {employees.length ? 'Select employee…' : 'No employees in scope'}
                </option>
                {employees.map(e => (
                  <option key={e.id || e.person_id} value={e.id || e.person_id}>
                    {e.full_name}{e.node_name ? ` · ${e.node_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>SUSPENSION TYPE</div>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ ...selStyle, width:'100%' }}
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>START DATE</div>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>DURATION (DAYS, MAX {maxDays})</div>
              <input
                type="number"
                min={1}
                max={maxDays}
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>END DATE (AUTO)</div>
              <input value={computedEnd ? fmt(computedEnd) : '—'} readOnly style={{ ...inputStyle, opacity:0.6, cursor:'default' }}/>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>RELATED DA (OPTIONAL)</div>
            <input
              value={form.related_da}
              onChange={e => setForm(f => ({ ...f, related_da: e.target.value }))}
              placeholder="e.g. DA #004 — Final Warning"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>REASON *</div>
            <textarea
              rows={3}
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Describe the reason for suspension…"
              style={taStyle}
            />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>WITNESSED BY</div>
            <input
              value={form.witnessed_by}
              onChange={e => setForm(f => ({ ...f, witnessed_by: e.target.value }))}
              placeholder="Name(s) of witnesses"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--t-text)' }}>
              <input
                type="checkbox"
                checked={form.notified}
                onChange={e => setForm(f => ({ ...f, notified: e.target.checked }))}
                style={{ accentColor:'var(--t-accent)', width:14, height:14 }}
              />
              Employee has been notified{' '}
              <span style={{ color:'var(--t-danger)', fontSize:11 }}>(required)</span>
            </label>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-approve" onClick={handleIssue} disabled={saving} style={{ opacity:saving?0.6:1, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Issuing…' : 'Issue Suspension'}
            </button>
            <button
              className="action-btn-sm"
              onClick={() => { setForm(blankSuspForm()); setShowForm(false) }}
              style={{ color:'var(--t-text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── tab bar ───────────────────────────────────────── */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--t-line)' }}>
        {[['active','Active Suspensions'],['history','Suspension History']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding:'10px 18px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none',
              background:'none', color: activeTab === id ? 'var(--t-accent)' : 'var(--t-text-muted)',
              borderBottom: activeTab === id ? '2px solid var(--t-accent)' : '2px solid transparent',
              letterSpacing:'0.04em',
            }}
          >
            {label}
            {id === 'active' && activeList.length > 0 && (
              <span style={{ marginLeft:6, background:'var(--t-danger)', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 5px' }}>
                {activeList.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          TAB 1 — ACTIVE SUSPENSIONS
      ════════════════════════════════════════════════════ */}
      {activeTab === 'active' && (
        <>
          {loading && (
            <div className="empty-state">
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>Loading suspensions…</div>
            </div>
          )}

          {!loading && activeList.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>✅</div>
              <div style={{ fontWeight:700, marginBottom:6 }}>No active suspensions</div>
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>All employees are currently active.</div>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {!loading && activeList.map(sus => {
              const now = new Date()
              const end = sus.end_date ? new Date(sus.end_date) : null
              const isOverdue = end && end < now
              const noteVal = noteEdits[sus.id] !== undefined ? noteEdits[sus.id] : sus.notes
              const dirty = noteEdits[sus.id] !== undefined && noteEdits[sus.id] !== sus.notes

              return (
                <div
                  key={sus.id}
                  style={{
                    background:'var(--t-surface)',
                    border:`1px solid ${sus.type === 'Unpaid' ? 'var(--t-danger)' : 'var(--t-warn)'}`,
                    borderLeft:`4px solid ${sus.type === 'Unpaid' ? 'var(--t-danger)' : 'var(--t-warn)'}`,
                    padding:0,
                  }}
                >
                  {/* card header */}
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--t-line)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:'var(--t-text)', marginBottom:3 }}>{sus.person_name}</div>
                      <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{sus.node_name} · {sus.role_name}</div>
                    </div>
                    <span className={sus.type === 'Unpaid' ? 'badge red' : 'badge amber'} style={{ fontSize:12, fontWeight:700 }}>
                      {sus.type.toUpperCase()}
                    </span>
                  </div>

                  {/* card body */}
                  <div style={{ padding:16 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10, marginBottom:14 }}>
                      {[
                        ['Start Date',    fmt(sus.start_date)],
                        ['End Date',      fmt(sus.end_date)],
                        ['Duration',      sus.duration != null ? `${sus.duration} day${sus.duration !== 1 ? 's' : ''}` : '—'],
                        ['Issued By',     sus.issued_by],
                      ].map(([label, val]) => (
                        <div key={label} style={{ background:'var(--t-surface-2)', padding:'8px 10px' }}>
                          <div style={{ fontSize:10, color:'var(--t-text-muted)', letterSpacing:'0.05em', marginBottom:2 }}>{label.toUpperCase()}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--t-text)' }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom:12, fontSize:13, color:'var(--t-text)', lineHeight:1.6 }}>
                      <strong style={{ color:'var(--t-text-muted)', fontSize:11, letterSpacing:'0.05em' }}>REASON: </strong>
                      {sus.reason}
                    </div>

                    {sus.witnessed_by && (
                      <div style={{ marginBottom:12, fontSize:12 }}>
                        <strong style={{ color:'var(--t-text-muted)', fontSize:11, letterSpacing:'0.05em' }}>WITNESSED BY: </strong>
                        <span style={{ color:'var(--t-text)' }}>{sus.witnessed_by}</span>
                      </div>
                    )}

                    {sus.related_da && (
                      <div style={{ marginBottom:12, fontSize:12 }}>
                        <strong style={{ color:'var(--t-text-muted)', fontSize:11, letterSpacing:'0.05em' }}>RELATED DA: </strong>
                        <span
                          style={{ color:'var(--t-accent)', cursor:'pointer', textDecoration:'underline' }}
                          onClick={() => window.location.hash = '/disciplinary'}
                        >
                          {sus.related_da}
                        </span>
                      </div>
                    )}

                    <div style={{
                      fontSize:13,
                      fontWeight:700,
                      color: isOverdue ? 'var(--t-danger)' : 'var(--t-success)',
                      marginBottom:14,
                    }}>
                      Returns: {fmt(sus.end_date)}
                      {isOverdue && <span style={{ marginLeft:8, fontSize:11 }}>— OVERDUE</span>}
                    </div>

                    {/* notes */}
                    {isManager && (
                      <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>MANAGER NOTES</div>
                        <textarea
                          rows={2}
                          value={noteVal}
                          onChange={e => setNoteEdits(prev => ({ ...prev, [sus.id]: e.target.value }))}
                          placeholder="Add notes…"
                          style={taStyle}
                        />
                        {dirty && (
                          <button
                            className="action-btn-sm"
                            onClick={() => saveNote(sus.id)}
                            disabled={savingNote === sus.id}
                            style={{ marginTop:6, color:'var(--t-accent)' }}
                          >
                            {savingNote === sus.id ? 'Saving…' : 'Save Notes'}
                          </button>
                        )}
                      </div>
                    )}

                    {isManager && (
                      <button
                        className="btn-approve"
                        onClick={() => setConfirmReturn(sus)}
                        disabled={returningId === sus.id}
                        style={{ fontSize:12, opacity:returningId === sus.id ? 0.6 : 1 }}
                      >
                        {returningId === sus.id ? 'Saving…' : 'Mark Returned'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB 2 — SUSPENSION HISTORY
      ════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <>
          {/* filters */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <input
              value={hSearch}
              onChange={e => setHSearch(e.target.value)}
              placeholder="Search employee…"
              style={{ ...selStyle, minWidth:180 }}
            />
            <select value={hFilterLoc} onChange={e => setHFilterLoc(e.target.value)} style={selStyle}>
              {locNames.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
            </select>
            <select value={hFilterType} onChange={e => setHFilterType(e.target.value)} style={selStyle}>
              <option value="All">All Types</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
            <input type="date" value={hFilterFrom} onChange={e => setHFilterFrom(e.target.value)} style={{ ...selStyle, minWidth:130 }} title="From date"/>
            <input type="date" value={hFilterTo}   onChange={e => setHFilterTo(e.target.value)}   style={{ ...selStyle, minWidth:130 }} title="To date"/>
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--t-text-faint)' }}>{filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}</span>
          </div>

          {loading && (
            <div className="empty-state">
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>Loading history…</div>
            </div>
          )}

          {!loading && filteredHistory.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>📋</div>
              <div style={{ fontWeight:700, marginBottom:6 }}>No records found</div>
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>
                {historyList.length === 0 ? 'Returned suspensions will appear here.' : 'Try adjusting your filters.'}
              </div>
            </div>
          )}

          {!loading && filteredHistory.length > 0 && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
                      {['Employee','Location','Start','End','Duration','Type','Reason','Issued By','On Time','Related DA'].map(h => (
                        <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontWeight:700, fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((row, i) => (
                      <tr key={row.id} style={{ borderBottom: i < filteredHistory.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                        <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--t-text)', whiteSpace:'nowrap' }}>{row.person_name}</td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.node_name}</td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmt(row.start_date)}</td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmt(row.end_date)}</td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.duration != null ? `${row.duration}d` : '—'}</td>
                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                          <span className={row.type === 'Unpaid' ? 'badge red' : 'badge amber'}>{row.type}</span>
                        </td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', maxWidth:200 }}>
                          {row.reason?.slice(0, 60)}{row.reason?.length > 60 ? '…' : ''}
                        </td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.issued_by}</td>
                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                          <span className={row.returned_on_time ? 'badge green' : 'badge red'}>
                            {row.returned_on_time ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap', fontSize:11 }}>
                          {row.related_da || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── confirm return modal ─────────────────────────── */}
      {confirmReturn && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setConfirmReturn(null)}
        >
          <div
            style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:28, maxWidth:400, width:'90%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize:15, fontWeight:700, color:'var(--t-text)', marginBottom:10 }}>Confirm Return</div>
            <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:20, lineHeight:1.6 }}>
              Mark <strong style={{ color:'var(--t-text)' }}>{confirmReturn.person_name}</strong> as returned from suspension?
              This will move the record to history and queue an RTW check-in.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-approve" onClick={() => markReturned(confirmReturn.id)} disabled={returningId === confirmReturn.id}>
                {returningId === confirmReturn.id ? 'Saving…' : 'Confirm Return'}
              </button>
              <button
                className="action-btn-sm"
                onClick={() => setConfirmReturn(null)}
                style={{ color:'var(--t-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── compliance note ──────────────────────────────── */}
      <div style={{ marginTop:28, padding:14, background:'var(--t-surface-2)', border:'1px solid var(--t-line)', fontSize:12, color:'var(--t-text-muted)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--t-text)', fontSize:11, letterSpacing:'0.05em' }}>COMPLIANCE NOTE: </strong>
        Suspensions must be documented with a related DA on file. Unpaid suspensions require prior written
        warning in the employee's record per company progressive discipline policy.
      </div>
    </>
  )
}
