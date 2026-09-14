import { useState, useEffect, useMemo, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const DAY = 86400000
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / DAY)

/* Defensive field access — get_incidents aliases vary (inc_type/type, inc_date/date …) */
const fType   = (r) => r.inc_type ?? r.type ?? r.category ?? ''
const fSev    = (r) => (r.severity ?? '').toString()
const fStatus = (r) => (r.status ?? 'open').toString().toLowerCase()
const fOpened = (r) => r.inc_date ?? r.date ?? r.opened ?? r.created_at ?? null
const fClosed = (r) => r.closed_at ?? r.closed ?? (fStatus(r) === 'closed' || fStatus(r) === 'resolved' ? (r.updated_at ?? null) : null)
const fDesc   = (r) => r.description ?? r.summary ?? ''
const fReporter = (r) => r.reporter_name ?? r.person_name ?? r.reported_by_name ?? r.employee_name ?? ''
const fLocation = (r) => r.location ?? r.node_name ?? r.node ?? ''
const fFollowUp = (r) => r.follow_up ?? r.notes ?? r.investigation_notes ?? ''
const caseNum = (r) => {
  const id = (r.id ?? '').toString()
  const yr = fOpened(r) ? new Date(fOpened(r)).getFullYear() : new Date().getFullYear()
  return 'INV-' + yr + '-' + (id ? id.replace(/-/g, '').slice(0, 6).toUpperCase() : '------')
}

/* ── role gate ───────────────────────────────────────────── */
const ALLOWED_ROLES = ['admin', 'owner', 'coo', 'ceo', 'cfo', 'president', 'chief', 'hr', 'manager']
const isAllowed = (r = '') => ALLOWED_ROLES.some((x) => r.toLowerCase().includes(x))

/* ── constants ───────────────────────────────────────────── */
const ALLEGATION_TYPES = [
  'Harassment',
  'Theft',
  'Performance',
  'Conduct',
  'Hostile Work Environment',
  'Discrimination',
  'Policy Violation',
]

const ALLEGATION_BADGE = {
  Harassment:                'badge red',
  Theft:                     'badge red',
  Performance:               'badge amber',
  Conduct:                   'badge amber',
  'Hostile Work Environment':'badge red',
  Discrimination:            'badge red',
  'Policy Violation':        'badge blue',
}

/* Real, persistable incident statuses (update_incident / close_incident write these). */
const STATUSES = ['open', 'investigating', 'escalated', 'closed']
const STATUS_LABEL = {
  open:          'Intake / Open',
  investigating: 'Investigating',
  escalated:     'Escalated',
  closed:        'Closed',
  resolved:      'Resolved',
}
const STATUS_BADGE = {
  open:          'badge blue',
  investigating: 'badge amber',
  escalated:     'badge red',
  closed:        'badge',
  resolved:      'badge green',
}

const SEVERITIES = ['minor', 'moderate', 'major', 'critical']
const SEV_LABEL = { minor: 'Minor', moderate: 'Moderate', major: 'Major', critical: 'Critical' }
const SEV_BADGE = { minor: 'badge', moderate: 'badge amber', major: 'badge red', critical: 'badge red' }
const isSerious = (s) => ['moderate', 'major', 'critical'].includes((s || '').toLowerCase())
const isClosedStatus = (s) => ['closed', 'resolved'].includes((s || '').toLowerCase())

/* ── styles ──────────────────────────────────────────────── */
const selStyle = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '6px 10px',
  fontSize: 13,
  minWidth: 140,
  outline: 'none',
  borderRadius: 0,
}

const inputStyle = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '7px 10px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 0,
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--t-text-muted)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 5,
  display: 'block',
}

const btnStyle = (variant = 'default') => ({
  background: variant === 'primary'  ? 'rgba(0,229,255,0.12)'
            : variant === 'danger'   ? 'rgba(255,59,48,0.1)'
            : variant === 'success'  ? 'rgba(42,214,160,0.1)'
            : 'var(--t-surface-2)',
  border: `1px solid ${
    variant === 'primary'  ? 'var(--t-accent)'
  : variant === 'danger'   ? 'var(--t-danger)'
  : variant === 'success'  ? 'var(--t-success)'
  : 'var(--t-line)'
  }`,
  color: variant === 'primary'  ? 'var(--t-accent)'
       : variant === 'danger'   ? 'var(--t-danger)'
       : variant === 'success'  ? 'var(--t-success)'
       : 'var(--t-text-muted)',
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
  letterSpacing: '0.03em',
})

/* ── KPI tile ────────────────────────────────────────────── */
function KpiTile({ label, value, color, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined}
      style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 120, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

/* ── Status stepper (reflects real persisted incident status) ─ */
function StatusTracker({ status }) {
  const cur = STATUSES.indexOf(isClosedStatus(status) ? 'closed' : status)
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 0, minWidth: 480 }}>
        {STATUSES.map((s, i) => {
          const done   = i < cur
          const active = i === cur
          return (
            <div key={s} style={{ flex: 1, borderTop: `3px solid ${active ? 'var(--t-accent)' : done ? 'var(--t-success)' : 'var(--t-line)'}`, paddingTop: 8, paddingRight: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: active ? 'var(--t-accent)' : done ? 'var(--t-success)' : 'var(--t-text-faint)', marginBottom: 3 }}>
                {STATUS_LABEL[s]}
              </div>
              {active && <div style={{ fontSize: 10, color: 'var(--t-accent)', fontWeight: 600 }}>Current</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Active Investigation Card ───────────────────────────── */
function ActiveCard({ row, slaDays, isManager, busy, onSaveNotes, onSetStatus, onClose }) {
  const [expanded, setExpanded]         = useState(false)
  const [notes, setNotes]               = useState('')
  const [status, setStatus]             = useState(fStatus(row))
  const [outcome, setOutcome]           = useState('')
  const [showClose, setShowClose]       = useState(false)

  const opened   = fOpened(row)
  const deadline = opened ? new Date(new Date(opened).getTime() + slaDays * DAY) : null
  const remaining = deadline ? daysBetween(new Date(), deadline) : null
  const slaCritical = remaining !== null && remaining <= 3
  const allegation = fType(row)
  const followUp = fFollowUp(row)

  return (
    <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', marginBottom: 14 }}>
      {/* Card header */}
      <div
        style={{ padding: '14px 18px', borderBottom: expanded ? '1px solid var(--t-line)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--t-surface)', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)', letterSpacing: '0.04em' }}>{caseNum(row)}</div>
          {allegation && <span className={ALLEGATION_BADGE[allegation] || 'badge'}>{allegation.toUpperCase()}</span>}
          <span className={STATUS_BADGE[fStatus(row)] || 'badge'}>{(STATUS_LABEL[fStatus(row)] || fStatus(row)).toUpperCase()}</span>
          {fSev(row) && <span className={SEV_BADGE[fSev(row).toLowerCase()] || 'badge'}>{(SEV_LABEL[fSev(row).toLowerCase()] || fSev(row)).toUpperCase()}</span>}
          <span className="badge red">CONFIDENTIAL</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {remaining !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: slaCritical ? 'var(--t-danger)' : 'var(--t-success)' }}>
              {remaining > 0 ? `${remaining} day${remaining !== 1 ? 's' : ''} remaining` : 'SLA overdue'}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ padding: '10px 18px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--t-text-muted)', borderBottom: expanded ? '1px solid var(--t-line)' : 'none' }}>
        <span><b style={{ color: 'var(--t-text)' }}>Reported by:</b> {fReporter(row) || '—'}</span>
        {fLocation(row) && <span><b style={{ color: 'var(--t-text)' }}>Location:</b> {fLocation(row)}</span>}
        <span><b style={{ color: 'var(--t-text)' }}>Opened:</b> {fmt(opened)}</span>
        {deadline && <span><b style={{ color: 'var(--t-text)' }}>SLA Deadline:</b> {fmt(deadline.toISOString())}</span>}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '18px 18px' }}>
          {/* Status tracker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Case Status</div>
            <StatusTracker status={fStatus(row)} />
          </div>

          {/* Summary */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Summary</div>
            <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)', padding: '10px 14px', fontSize: 13, color: 'var(--t-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {fDesc(row) || <span style={{ color: 'var(--t-text-faint)' }}>No summary on file.</span>}
            </div>
          </div>

          {/* Case file / follow-up log */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Case File Notes</div>
            <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)', padding: '10px 14px', fontSize: 13, color: 'var(--t-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {followUp || <span style={{ color: 'var(--t-text-faint)' }}>No notes logged yet.</span>}
            </div>
          </div>

          {isManager && (
            <>
              {/* Status change */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Update Status</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={status} onChange={e => setStatus(e.target.value)} style={selStyle} disabled={busy}>
                    {STATUSES.filter(s => s !== 'closed').map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <button
                    style={btnStyle('primary')}
                    disabled={busy || status === fStatus(row)}
                    onClick={() => onSetStatus(row, status)}
                  >
                    {busy ? 'Saving…' : 'Apply Status'}
                  </button>
                </div>
              </div>

              {/* Add note */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Add Case Note</div>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="Append a timestamped note to the case file…"
                />
                <button
                  style={{ ...btnStyle('primary'), marginTop: 8 }}
                  disabled={busy || !notes.trim()}
                  onClick={() => { onSaveNotes(row, notes, fFollowUp(row)); setNotes('') }}
                >
                  {busy ? 'Saving…' : 'Save Note'}
                </button>
              </div>

              {/* Resolution / close */}
              <div style={{ border: '1px solid var(--t-warn)', background: 'rgba(255,149,0,0.04)', padding: 16, marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-warn)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Resolution — Close Investigation</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Outcome / Findings (required)</label>
                  <textarea
                    rows={3}
                    value={outcome}
                    onChange={e => setOutcome(e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical' }}
                    placeholder="Document findings and rationale…"
                  />
                </div>
                <button
                  style={btnStyle('danger')}
                  disabled={busy}
                  onClick={() => { if (!outcome.trim()) { onSaveNotes(row, '', fFollowUp(row), 'Outcome / findings are required'); return } setShowClose(true) }}
                >
                  Close Investigation
                </button>
              </div>
            </>
          )}

          {/* Confirm close modal */}
          {showClose && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 400, width: '90%' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)', marginBottom: 10 }}>Close Investigation?</div>
                <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
                  This records the outcome and moves <strong>{caseNum(row)}</strong> to history.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button style={btnStyle()} disabled={busy} onClick={() => setShowClose(false)}>Cancel</button>
                  <button style={btnStyle('danger')} disabled={busy} onClick={() => { setShowClose(false); onClose(row, outcome) }}>Confirm Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── New Investigation Form ──────────────────────────────── */
function NewInvestigationForm({ nodes, roster, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({
    allegation: ALLEGATION_TYPES[0],
    severity: 'moderate',
    node_id: nodes[0]?.id || '',
    respondent: '',
    summary: '',
  })
  const [showConfirm, setShowConfirm] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function trySubmit() {
    if (!form.node_id)        { onSubmit(null, 'Select a location'); return }
    if (!form.summary.trim()) { onSubmit(null, 'Summary is required'); return }
    setShowConfirm(true)
  }

  return (
    <div style={{ border: '1px solid var(--t-accent)', background: 'rgba(0,229,255,0.03)', padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Open New Investigation</div>
        <button style={{ ...btnStyle(), padding: '4px 10px', fontSize: 12 }} onClick={onClose}>✕ Cancel</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Allegation Type *</label>
          <select value={form.allegation} onChange={e => set('allegation', e.target.value)} style={{ ...selStyle, width: '100%' }}>
            {ALLEGATION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Severity *</label>
          <select value={form.severity} onChange={e => set('severity', e.target.value)} style={{ ...selStyle, width: '100%' }}>
            {SEVERITIES.map(s => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Location *</label>
          <select value={form.node_id} onChange={e => set('node_id', e.target.value)} style={{ ...selStyle, width: '100%' }}>
            {nodes.length === 0 && <option value="">— No locations in scope —</option>}
            {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Respondent (being investigated)</label>
          <select value={form.respondent} onChange={e => set('respondent', e.target.value)} style={{ ...selStyle, width: '100%' }}>
            <option value="">— Not specified —</option>
            {roster.map(p => <option key={p.id} value={p.full_name}>{p.full_name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Summary *</label>
        <textarea rows={3} value={form.summary} onChange={e => set('summary', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the allegation…" />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t-danger)', cursor: 'default', fontWeight: 700 }}>
          <input type="checkbox" checked readOnly /> Confidential (mandatory)
        </label>
      </div>

      <button style={btnStyle('primary')} disabled={busy} onClick={trySubmit}>{busy ? 'Opening…' : 'Open Investigation'}</button>

      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 420, width: '90%' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)', marginBottom: 10 }}>Open Investigation?</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
              This creates a confidential HR case for <strong>{form.allegation}</strong>.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnStyle()} disabled={busy} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button style={btnStyle('primary')} disabled={busy} onClick={() => { setShowConfirm(false); onSubmit(form) }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN: HRInvestigations
══════════════════════════════════════════════════════════════ */
export default function HRInvestigations() {
  const enabled = useFeatureFlag('hr_investigations')
  const config  = useConfig()
  const { session } = useAuth()

  const role = session?.person?.role || session?.person?.role_name || ''
  const canAccess = isAllowed(role)
  const isManager = canAccess

  const [rows, setRows]         = useState([])
  const [roster, setRoster]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [busyId, setBusyId]     = useState(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab]           = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast]       = useState(null)
  const [drill, setDrill]       = useState(null)
  const [filterAllegation, setFilterAllegation] = useState('all')
  const [filterSeverity, setFilterSeverity]     = useState('all')
  const [filterLocation, setFilterLocation]     = useState('all')

  const slaDays = config?.investigation_sla_days ?? 14
  const company = config?.company_short ?? 'Twisted Growers'

  const nodes = useMemo(() => (getSession().nodes || []).filter(n => n && n.id), [])
  const nodeIds = useMemo(() => nodes.map(n => n.id), [nodes])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  /* ── load real cases + roster ── */
  const load = useCallback(async () => {
    if (!nodeIds.length) { setRows([]); setRoster([]); setLoading(false); return }
    setLoading(true)
    try {
      const [{ data: incData, error: incErr }, { data: rosData }] = await Promise.all([
        sb.rpc('get_incidents', { p_node_ids: nodeIds }),
        sb.rpc('get_roster', { p_node_ids: nodeIds }),
      ])
      if (incErr) throw incErr
      const seen = new Set()
      const clean = (Array.isArray(incData) ? incData : []).filter(r => {
        if (r.id == null) return true
        if (seen.has(r.id)) return false
        seen.add(r.id); return true
      })
      setRows(clean)
      setRoster(Array.isArray(rosData) ? rosData.filter(p => p && p.full_name) : [])
    } catch (e) {
      showToast('Could not load cases: ' + (e.message || 'error'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [nodeIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (enabled && canAccess) load() }, [enabled, canAccess, load])

  /* ── write actions (all persist to the real backend, then reload) ── */
  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
  const actor = session?.person?.full_name || 'Staff'

  async function createCase(form) {
    setCreating(true)
    try {
      const desc = (form.respondent ? `Respondent: ${form.respondent}\n` : '') + form.summary
      const { error } = await sb.rpc('create_incident', {
        p_node_id: form.node_id,
        p_type: form.allegation,
        p_severity: form.severity,
        p_description: desc,
        p_reported_by: getSession().id || null,
      })
      if (error) throw error
      setShowForm(false)
      showToast('Investigation opened')
      await load()
    } catch (e) {
      showToast('Not opened: ' + (e.message || 'error'))
    } finally {
      setCreating(false)
    }
  }

  async function saveNotes(row, note, existing, validationMsg) {
    if (validationMsg) { showToast(validationMsg); return }
    if (!note.trim()) return
    setBusyId(row.id)
    try {
      const appended = (existing ? existing + '\n' : '') + `[${stamp()} · ${actor}] ${note.trim()}`
      const { error } = await sb.rpc('update_incident', { p_incident_id: row.id, p_status: fStatus(row), p_notes: appended })
      if (error) throw error
      showToast('Note saved to case file')
      await load()
    } catch (e) {
      showToast('Not saved: ' + (e.message || 'error'))
    } finally {
      setBusyId(null)
    }
  }

  async function setStatus(row, status) {
    setBusyId(row.id)
    try {
      const { error } = await sb.rpc('update_incident', { p_incident_id: row.id, p_status: status, p_notes: null })
      if (error) throw error
      showToast('Status updated to ' + (STATUS_LABEL[status] || status))
      await load()
    } catch (e) {
      showToast('Not saved: ' + (e.message || 'error'))
    } finally {
      setBusyId(null)
    }
  }

  async function closeCase(row, outcome) {
    setBusyId(row.id)
    try {
      const existing = fFollowUp(row)
      const followUp = (existing ? existing + '\n' : '') + `[${stamp()} · ${actor}] CLOSED — ${outcome.trim()}`
      const { error } = await sb.rpc('close_incident', { p_incident_id: row.id, p_follow_up: followUp })
      if (error) throw error
      showToast(`Case ${caseNum(row)} closed`)
      await load()
    } catch (e) {
      showToast('Not closed: ' + (e.message || 'error'))
    } finally {
      setBusyId(null)
    }
  }

  /* ── derived ── */
  const active = useMemo(() => rows.filter(r => !isClosedStatus(fStatus(r))), [rows])
  const closed = useMemo(() => rows.filter(r => isClosedStatus(fStatus(r))), [rows])

  const overdueCount = useMemo(
    () => active.filter(r => fOpened(r) && daysBetween(fOpened(r), new Date()) > slaDays).length,
    [active, slaDays]
  )
  const seriousOpen = useMemo(() => active.filter(r => isSerious(fSev(r))).length, [active])

  const filteredClosed = useMemo(() => closed.filter(r => {
    if (filterAllegation !== 'all' && fType(r) !== filterAllegation) return false
    if (filterSeverity   !== 'all' && fSev(r).toLowerCase() !== filterSeverity) return false
    if (filterLocation   !== 'all' && fLocation(r) !== filterLocation) return false
    return true
  }), [closed, filterAllegation, filterSeverity, filterLocation])

  const locationOptions = useMemo(
    () => Array.from(new Set(rows.map(fLocation).filter(Boolean))),
    [rows]
  )

  /* Drill-down columns over real rows */
  const ACTIVE_COLS = [
    { key: 'case_num', label: 'Case #', value: caseNum },
    { key: 'allegation', label: 'Allegation', value: fType },
    { key: 'respondent', label: 'Reported By', value: fReporter },
    { key: 'location', label: 'Location', value: fLocation },
    { key: 'severity', label: 'Severity', value: r => SEV_LABEL[fSev(r).toLowerCase()] || fSev(r) },
    { key: 'status', label: 'Status', value: r => STATUS_LABEL[fStatus(r)] || fStatus(r) },
    { key: 'opened', label: 'Opened', value: r => fmt(fOpened(r)), sortKey: fOpened },
  ]
  const CLOSED_COLS = [
    { key: 'case_num', label: 'Case #', value: caseNum },
    { key: 'allegation', label: 'Allegation', value: fType },
    { key: 'respondent', label: 'Reported By', value: fReporter },
    { key: 'location', label: 'Location', value: fLocation },
    { key: 'severity', label: 'Severity', value: r => SEV_LABEL[fSev(r).toLowerCase()] || fSev(r) },
    { key: 'opened', label: 'Opened', value: r => fmt(fOpened(r)), sortKey: fOpened },
    { key: 'closed', label: 'Closed', value: r => fmt(fClosed(r)), sortKey: fClosed },
  ]

  /* Feature gate */
  if (!enabled) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Feature Disabled</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>HR Investigations is not enabled. Contact your administrator.</div>
      </div>
    )
  }

  /* Role gate */
  if (!canAccess) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-danger)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Access Restricted</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>You do not have permission to view HR Investigations.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--t-success)', color: '#000', padding: '11px 18px', fontSize: 13, fontWeight: 700, zIndex: 99999, borderRadius: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>HR Employee Investigations</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>Confidential — {company} HR Department</div>
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>
          SLA: {slaDays} days to close (configurable in Settings → White Label)
        </div>
      </div>

      {/* KPI row — real counts from live cases */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiTile label="Open Investigations" value={loading ? '…' : active.length} color="var(--t-warn)"
          onClick={() => active.length && setDrill({ title: 'Open Investigations', subtitle: `${active.length} active case${active.length === 1 ? '' : 's'}`, columns: ACTIVE_COLS, rows: active, accent: 'var(--t-warn)' })} />
        <KpiTile label="Closed" value={loading ? '…' : closed.length} color="var(--t-success)"
          onClick={() => closed.length && setDrill({ title: 'Closed Investigations', subtitle: `${closed.length} closed case${closed.length === 1 ? '' : 's'}`, columns: CLOSED_COLS, rows: closed, accent: 'var(--t-success)' })} />
        <KpiTile label={`Overdue (SLA ${slaDays}d)`} value={loading ? '…' : overdueCount} color="var(--t-danger)"
          onClick={() => overdueCount && setDrill({ title: 'Overdue Investigations', subtitle: `Past ${slaDays}-day SLA`, columns: ACTIVE_COLS, rows: active.filter(r => fOpened(r) && daysBetween(fOpened(r), new Date()) > slaDays), accent: 'var(--t-danger)' })} />
        <KpiTile label="High-Severity Open" value={loading ? '…' : seriousOpen} color="var(--t-text)"
          onClick={() => seriousOpen && setDrill({ title: 'High-Severity Open Cases', subtitle: `${seriousOpen} case${seriousOpen === 1 ? '' : 's'}`, columns: ACTIVE_COLS, rows: active.filter(r => isSerious(fSev(r))), accent: 'var(--t-accent)' })} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
        {['active', 'closed'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--t-accent)' : '2px solid transparent', color: tab === t ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: -1 }}
          >
            {t === 'active' ? `Active Investigations (${active.length})` : `Closed (${closed.length})`}
          </button>
        ))}
      </div>

      {/* ── Active tab ── */}
      {tab === 'active' && (
        <div>
          {isManager && !showForm && (
            <div style={{ marginBottom: 16 }}>
              <button style={btnStyle('primary')} onClick={() => setShowForm(true)}>+ Open New Investigation</button>
            </div>
          )}

          {showForm && (
            <NewInvestigationForm
              nodes={nodes}
              roster={roster}
              busy={creating}
              onClose={() => setShowForm(false)}
              onSubmit={(form, err) => { if (err) { showToast(err); return } if (form) createCase(form) }}
            />
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--t-text-faint)', fontSize: 13 }}>Loading cases…</div>
          )}

          {!loading && active.map(row => (
            <ActiveCard
              key={row.id}
              row={row}
              slaDays={slaDays}
              isManager={isManager}
              busy={busyId === row.id}
              onSaveNotes={saveNotes}
              onSetStatus={setStatus}
              onClose={closeCase}
            />
          ))}

          {!loading && active.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--t-text-faint)', fontSize: 13 }}>
              {nodeIds.length === 0 ? 'No locations in scope.' : 'No active investigations.'}
            </div>
          )}
        </div>
      )}

      {/* ── Closed tab ── */}
      {tab === 'closed' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <select value={filterAllegation} onChange={e => setFilterAllegation(e.target.value)} style={selStyle}>
              <option value="all">All Allegations</option>
              {ALLEGATION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selStyle}>
              <option value="all">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}
            </select>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={selStyle}>
              <option value="all">All Locations</option>
              {locationOptions.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Case #', 'Allegation', 'Reported By', 'Location', 'Opened', 'Closed', 'Severity'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClosed.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < filteredClosed.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{caseNum(c)}</td>
                    <td style={{ padding: '9px 14px' }}>{fType(c) ? <span className={ALLEGATION_BADGE[fType(c)] || 'badge'}>{fType(c)}</span> : '—'}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text)' }}>{fReporter(c) || '—'}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{fLocation(c) || '—'}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(fOpened(c))}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(fClosed(c))}</td>
                    <td style={{ padding: '9px 14px' }}>{fSev(c) ? <span className={SEV_BADGE[fSev(c).toLowerCase()] || 'badge'}>{SEV_LABEL[fSev(c).toLowerCase()] || fSev(c)}</span> : '—'}</td>
                  </tr>
                ))}
                {filteredClosed.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
                      {loading ? 'Loading…' : closed.length === 0 ? 'No closed investigations yet.' : 'No results match filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
