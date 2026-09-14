import { useState, useMemo, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const daysSince = (dateStr) => {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

/* ── role gate ───────────────────────────────────────────── */
const ALLOWED_ROLES = ['admin', 'owner', 'coo', 'hr', 'manager']
const isAllowed = (r = '') => ALLOWED_ROLES.some((x) => r.toLowerCase().includes(x))

/* ── constants ───────────────────────────────────────────── */
const SEP_REASONS = ['Voluntary', 'Resigned', 'Performance', 'Attendance', 'Misconduct', 'Reduction in Force']
const DA_SEVERITIES = ['None', 'Verbal', 'Written', 'Final']
const REHIRE_STATUSES = [
  { val: 'eligible', label: 'Eligible' },
  { val: 'conditional', label: 'Conditional' },
  { val: 'not_eligible', label: 'Not Eligible' },
]

const TRAINING_MODULES = [
  'POS System',
  'Safety & Compliance',
  'Customer Service',
  'Loss Prevention',
  'Product Knowledge',
  'HR Policy Handbook',
]

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
            : variant === 'warn'     ? 'rgba(255,149,0,0.1)'
            : 'var(--t-surface-2)',
  border: `1px solid ${
    variant === 'primary'  ? 'var(--t-accent)'
  : variant === 'danger'   ? 'var(--t-danger)'
  : variant === 'success'  ? 'var(--t-success)'
  : variant === 'warn'     ? 'var(--t-warn)'
  : 'var(--t-line)'
  }`,
  color: variant === 'primary'  ? 'var(--t-accent)'
       : variant === 'danger'   ? 'var(--t-danger)'
       : variant === 'success'  ? 'var(--t-success)'
       : variant === 'warn'     ? 'var(--t-warn)'
       : 'var(--t-text-muted)',
  padding: '7px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
  letterSpacing: '0.03em',
})

const STATUS_BADGE = {
  eligible:     'badge green',
  waiting:      'badge amber',
  conditional:  'badge amber',
  not_eligible: 'badge red',
}

const STATUS_LABEL = {
  eligible:     'Eligible',
  waiting:      'In Waiting Period',
  conditional:  'Conditional',
  not_eligible: 'Not Eligible',
}

const DA_SEV_COLOR = {
  None:    'var(--t-text-faint)',
  Verbal:  'var(--t-warn)',
  Written: 'var(--t-warn)',
  Final:   'var(--t-danger)',
}

/* ── KPI tile ────────────────────────────────────────────── */
function KpiTile({ label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to drill into records' : undefined}
      style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 120, cursor: onClick ? 'pointer' : undefined }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

/* ── Add Former Employee form ────────────────────────────── */
function AddFormerForm({ locationNodes, onSave, onClose, saving }) {
  const [f, setF] = useState({
    node_id: locationNodes[0]?.id || '',
    name: '',
    role: '',
    sep_date: '',
    sep_reason: 'Voluntary',
    da_count: 0,
    da_severity: 'None',
    former_manager: '',
    orig_hire_date: '',
    status: 'eligible',
    notes: '',
  })
  const [training, setTraining] = useState(() => {
    const t = {}; TRAINING_MODULES.forEach(m => { t[m] = false }); return t
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  return (
    <div style={{ border: '1px solid var(--t-accent)', background: 'rgba(0,229,255,0.03)', padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Add Former Employee</div>
        <button style={{ ...btnStyle(), padding: '4px 10px', fontSize: 12 }} onClick={onClose}>✕ Close</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Employee name" />
        </div>
        <div>
          <label style={labelStyle}>Former Role</label>
          <input style={inputStyle} value={f.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Associate" />
        </div>
        <div>
          <label style={labelStyle}>Last Location</label>
          <select style={{ ...selStyle, width: '100%' }} value={f.node_id} onChange={e => set('node_id', e.target.value)}>
            <option value="">— Select —</option>
            {locationNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Separation Date</label>
          <input type="date" style={inputStyle} value={f.sep_date} onChange={e => set('sep_date', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Separation Reason</label>
          <select style={{ ...selStyle, width: '100%' }} value={f.sep_reason} onChange={e => set('sep_reason', e.target.value)}>
            {SEP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Original Hire Date</label>
          <input type="date" style={inputStyle} value={f.orig_hire_date} onChange={e => set('orig_hire_date', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>DA Count</label>
          <input type="number" min={0} style={inputStyle} value={f.da_count} onChange={e => set('da_count', Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </div>
        <div>
          <label style={labelStyle}>Highest DA Severity</label>
          <select style={{ ...selStyle, width: '100%' }} value={f.da_severity} onChange={e => set('da_severity', e.target.value)}>
            {DA_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Rehire Status</label>
          <select style={{ ...selStyle, width: '100%' }} value={f.status} onChange={e => set('status', e.target.value)}>
            {REHIRE_STATUSES.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Former Manager</label>
        <input style={inputStyle} value={f.former_manager} onChange={e => set('former_manager', e.target.value)} placeholder="Manager name" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Prior Training Completions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TRAINING_MODULES.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-text)', cursor: 'pointer', border: '1px solid var(--t-line)', padding: '4px 10px' }}>
              <input type="checkbox" checked={training[m]} onChange={e => setTraining(t => ({ ...t, [m]: e.target.checked }))} style={{ accentColor: 'var(--t-accent)' }} />
              {m}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Notes</label>
        <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={btnStyle()} onClick={onClose} disabled={saving}>Cancel</button>
        <button
          style={{ ...btnStyle('primary'), opacity: saving ? 0.6 : 1 }}
          disabled={saving}
          onClick={() => onSave(f, training)}
        >
          {saving ? 'Saving…' : 'Save Former Employee'}
        </button>
      </div>
    </div>
  )
}

/* ── Rehire Process Flow ─────────────────────────────────── */
function RehireProcess({ emp, onClose, onToast, onDecide, onOnboard }) {
  const [step, setStep]              = useState(1)
  const [refNote, setRefNote]        = useState('')
  const [decision, setDecision]      = useState('APPROVE')
  const [conditions, setConditions]  = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [busy, setBusy]              = useState(false)
  const [credits, setCredits]        = useState(() => {
    const c = {}
    TRAINING_MODULES.forEach(m => { c[m] = emp.prev_training?.[m] || false })
    return c
  })
  const [i9Fresh, setI9Fresh]        = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)

  function finalizeDecision() {
    if (!decisionNotes.trim()) { onToast('Decision notes required'); return }
    if (decision === 'CONDITIONAL' && !conditions.trim()) { onToast('Conditions required for conditional rehire'); return }
    setShowConfirm(true)
  }

  async function confirmDecision() {
    setBusy(true)
    const ok = await onDecide(emp, { decision, conditions, decisionNotes, refNote })
    setBusy(false)
    setShowConfirm(false)
    if (!ok) return
    if (decision === 'DENY') { onClose(); return }
    setStep(3)
  }

  async function initiateOnboarding() {
    setBusy(true)
    const ok = await onOnboard(emp, { credits, i9Fresh })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div style={{ border: '1px solid var(--t-accent)', background: 'rgba(0,229,255,0.03)', padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-accent)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Rehire Process — {emp.name}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>Last location: {emp.location} · Separated: {fmt(emp.sep_date)}</div>
        </div>
        <button style={{ ...btnStyle(), padding: '4px 10px', fontSize: 12 }} onClick={onClose}>✕ Close</button>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
        {['Review History', 'Eligibility Decision', 'Onboarding'].map((s, i) => {
          const active = step === i + 1
          const done   = step > i + 1
          return (
            <div key={s} style={{ flex: 1, borderTop: `3px solid ${active ? 'var(--t-accent)' : done ? 'var(--t-success)' : 'var(--t-line)'}`, paddingTop: 8, paddingRight: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: active ? 'var(--t-accent)' : done ? 'var(--t-success)' : 'var(--t-text-faint)' }}>
                Step {i + 1}: {s}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Review History ── */}
      {step === 1 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* DA history */}
            <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
              <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DA History</div>
              <div style={{ padding: '10px 14px' }}>
                {emp.da_count === 0
                  ? <div style={{ fontSize: 13, color: 'var(--t-success)' }}>No disciplinary actions on record.</div>
                  : (
                    <div style={{ fontSize: 13, color: DA_SEV_COLOR[emp.da_severity] }}>
                      <strong>{emp.da_count}</strong> disciplinary action{emp.da_count !== 1 ? 's' : ''} — highest severity: <strong>{emp.da_severity}</strong>
                    </div>
                  )
                }
              </div>
            </div>

            {/* Separation summary */}
            <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
              <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Separation</div>
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--t-text)' }}>
                <div>Reason: <span style={{ fontWeight: 700 }}>{emp.sep_reason || '—'}</span></div>
                <div style={{ marginTop: 4, color: 'var(--t-text-muted)', fontSize: 12 }}>{daysSince(emp.sep_date)} days since separation.</div>
              </div>
            </div>
          </div>

          {/* Training completions */}
          <div style={{ border: '1px solid var(--t-line)', marginBottom: 16 }}>
            <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Prior Training Completions</div>
            <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRAINING_MODULES.map(m => (
                <span key={m} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--t-line)', color: emp.prev_training?.[m] ? 'var(--t-success)' : 'var(--t-text-faint)', background: emp.prev_training?.[m] ? 'rgba(42,214,160,0.07)' : 'var(--t-surface)' }}>
                  {emp.prev_training?.[m] ? '✓' : '✗'} {m}
                </span>
              ))}
            </div>
          </div>

          {/* Former manager reference */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>Former manager: <strong style={{ color: 'var(--t-text)' }}>{emp.former_manager || '—'}</strong></div>
            <label style={labelStyle}>Reference from former manager</label>
            <textarea
              rows={3}
              value={refNote}
              onChange={e => setRefNote(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Manager reference notes…"
            />
          </div>

          {emp.notes && (
            <div style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid var(--t-warn)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-warn)' }}>
              <strong>Note:</strong> {emp.notes}
            </div>
          )}

          <button style={btnStyle('primary')} onClick={() => setStep(2)}>Next Step →</button>
        </div>
      )}

      {/* ── Step 2: Eligibility Decision ── */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Rehire Decision *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { val: 'APPROVE', label: 'Approve', variant: 'success' },
                { val: 'CONDITIONAL', label: 'Conditional', variant: 'warn' },
                { val: 'DENY', label: 'Deny', variant: 'danger' },
              ].map(opt => (
                <button
                  key={opt.val}
                  style={{ ...btnStyle(decision === opt.val ? opt.variant : 'default'), opacity: decision === opt.val ? 1 : 0.55 }}
                  onClick={() => setDecision(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {decision === 'CONDITIONAL' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Conditions *</label>
              <textarea
                rows={2}
                value={conditions}
                onChange={e => setConditions(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="e.g. Must complete refresher training within 30 days"
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Decision Notes *</label>
            <textarea
              rows={3}
              value={decisionNotes}
              onChange={e => setDecisionNotes(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Document rationale for this decision…"
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnStyle()} onClick={() => setStep(1)}>← Back</button>
            <button
              style={btnStyle(decision === 'APPROVE' ? 'success' : decision === 'CONDITIONAL' ? 'warn' : 'danger')}
              onClick={finalizeDecision}
            >
              Finalize Decision
            </button>
          </div>

          {showConfirm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 400, width: '90%' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)', marginBottom: 10 }}>Confirm Decision</div>
                <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
                  Decision: <strong>{decision}</strong> for {emp.name}.
                  {decision === 'CONDITIONAL' && <><br />Conditions: {conditions}</>}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button style={btnStyle()} onClick={() => setShowConfirm(false)} disabled={busy}>Cancel</button>
                  <button
                    style={{ ...btnStyle(decision === 'APPROVE' ? 'success' : decision === 'CONDITIONAL' ? 'warn' : 'danger'), opacity: busy ? 0.6 : 1 }}
                    disabled={busy}
                    onClick={confirmDecision}
                  >
                    {busy ? 'Saving…' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Onboarding ── */}
      {step === 3 && (
        <div>
          <div style={{ background: 'rgba(42,214,160,0.07)', border: '1px solid var(--t-success)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-success)', fontWeight: 700 }}>
            Decision: {decision} — Proceed with onboarding setup.
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Training Credits — Credit prior completion?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TRAINING_MODULES.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={credits[m] || false}
                    disabled={!emp.prev_training?.[m]}
                    onChange={e => setCredits(c => ({ ...c, [m]: e.target.checked }))}
                    style={{ accentColor: 'var(--t-accent)' }}
                  />
                  {m}
                  {!emp.prev_training?.[m] && <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>(not previously completed)</span>}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={i9Fresh} onChange={e => setI9Fresh(e.target.checked)} style={{ accentColor: 'var(--t-accent)' }} />
              Fresh I-9 required (recommended — employment gap exceeds 90 days)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnStyle()} onClick={() => setStep(2)} disabled={busy}>← Back</button>
            <button style={{ ...btnStyle('success'), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={initiateOnboarding}>
              {busy ? 'Saving…' : 'Initiate Onboarding'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN: Rehires
══════════════════════════════════════════════════════════════ */
export default function Rehires() {
  const enabled = useFeatureFlag('rehires')
  const config  = useConfig()
  const { session } = useAuth()

  const role = session?.person?.role || ''
  const canAccess = isAllowed(role)
  const isManager = isAllowed(role)

  // Real session: identity + org nodes this login can see.
  const me = useMemo(() => getSession(), [])
  const locationNodes = useMemo(
    () => (me.nodes || []).filter(n => n.node_type === 'location'),
    [me.nodes]
  )
  const nodeIds = useMemo(() => {
    const locs = locationNodes.map(n => n.id)
    return locs.length ? locs : (me.nodes || []).map(n => n.id)
  }, [locationNodes, me.nodes])
  const nodeKey = nodeIds.join(',')

  const [tab, setTab]             = useState('eligible')
  const [activeProcess, setActiveProcess] = useState(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [toast, setToast]         = useState(null)
  const [drill, setDrill]         = useState(null)
  const [former, setFormer]       = useState([])
  const [rehired, setRehired]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  const waitingPeriod = config?.rehire_waiting_period_days ?? 90

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load former employees + rehires from the HR brain ──────
  const load = useCallback(async () => {
    setLoading(true)
    const params = { p_node_ids: nodeIds.length ? nodeIds : null }
    const [f, r] = await Promise.all([
      sb.rpc('rehire_list', params),
      sb.rpc('rehire_rehired_list', params),
    ])
    setFormer(!f.error && Array.isArray(f.data) ? f.data : [])
    setRehired(!r.error && Array.isArray(r.data) ? r.data : [])
    setLoading(false)
  }, [nodeKey])

  useEffect(() => { load() }, [load])

  // ── Write handlers ──────
  async function saveFormer(f, training) {
    if (!f.name.trim()) { showToast('Name is required'); return }
    setSaving(true)
    const { data, error } = await sb.rpc('rehire_add_former', {
      p_node_id: f.node_id || null,
      p_employee_name: f.name.trim(),
      p_former_role: f.role || null,
      p_sep_date: f.sep_date || null,
      p_sep_reason: f.sep_reason || null,
      p_da_count: Number(f.da_count) || 0,
      p_da_severity: f.da_severity || 'None',
      p_former_manager: f.former_manager || null,
      p_prev_training: training,
      p_rehire_status: f.status || 'eligible',
      p_notes: f.notes || null,
      p_orig_hire_date: f.orig_hire_date || null,
    })
    setSaving(false)
    if (error || !data?.ok) { showToast('Could not save — try again'); return }
    setShowAdd(false)
    showToast(`Former employee added — ${f.name.trim()}`)
    load()
  }

  async function decide(emp, { decision, conditions, decisionNotes, refNote }) {
    const { data, error } = await sb.rpc('rehire_decide', {
      p_separation_id: emp.id,
      p_decision: decision,
      p_conditions: conditions || null,
      p_decision_notes: decisionNotes || null,
      p_reference_note: refNote || null,
      p_actor: me.id || null,
    })
    if (error || !data?.ok) { showToast('Could not record decision — try again'); return false }
    if (decision === 'DENY') showToast(`Rehire denied — ${emp.name}`)
    else showToast(`Decision recorded — ${emp.name}`)
    load()
    return true
  }

  async function onboard(emp, { credits, i9Fresh }) {
    const { data, error } = await sb.rpc('rehire_onboard', {
      p_separation_id: emp.id,
      p_training_credits: credits,
      p_fresh_i9: !!i9Fresh,
      p_actor: me.id || null,
    })
    if (error || !data?.ok) { showToast('Could not initiate onboarding — try again'); return false }
    showToast(`Onboarding initiated for ${emp.name}`)
    load()
    return true
  }

  async function flagReview(emp) {
    const { data, error } = await sb.rpc('rehire_flag_review', {
      p_separation_id: emp.id,
      p_actor: me.id || null,
    })
    if (error || !data?.ok) { showToast('Could not flag for review — try again'); return }
    showToast(`${emp.name} flagged for review — HR will be notified`)
    load()
  }

  // ── Derived buckets (waiting is time-derived from sep_date vs config) ──────
  const pastWait = (e) => daysSince(e.sep_date) >= waitingPeriod
  const eligibleEmployees    = former.filter(e => (e.status === 'eligible' || e.status === 'conditional') && pastWait(e))
  const waitingEmployees     = former.filter(e => (e.status === 'eligible' || e.status === 'conditional') && !pastWait(e))
  const notEligibleEmployees = former.filter(e => e.status === 'not_eligible')
  const allEligibleRows      = [...eligibleEmployees, ...waitingEmployees]

  const thisYear = new Date().getFullYear()
  const rehiredThisYear = rehired.filter(r => r.rehire && new Date(r.rehire).getFullYear() === thisYear)

  /* ── drill-down columns ── */
  const formerCols = [
    { key: 'name',       label: 'Name',            value: e => e.name },
    { key: 'role',       label: 'Former Role',     value: e => e.role || '—' },
    { key: 'location',   label: 'Last Location',   value: e => e.location },
    { key: 'sep_date',   label: 'Separation Date', value: e => fmt(e.sep_date), sortKey: e => e.sep_date },
    { key: 'sep_reason', label: 'Reason',          value: e => e.sep_reason || '—' },
    { key: 'da',         label: 'DA History',      value: e => e.da_count === 0 ? 'None' : `${e.da_count} · ${e.da_severity}`, sortKey: e => e.da_count },
    { key: 'days',       label: 'Days Since Sep',  value: e => `${daysSince(e.sep_date)}d`, align: 'right', sortKey: e => daysSince(e.sep_date) },
    { key: 'status',     label: 'Rehire Status',   value: e => STATUS_LABEL[e.status] || e.status },
  ]

  const rehiredCols = [
    { key: 'name',      label: 'Name',           value: r => r.name },
    { key: 'orig_hire', label: 'Original Hire',  value: r => fmt(r.orig_hire), sortKey: r => r.orig_hire },
    { key: 'sep',       label: 'Separation',     value: r => fmt(r.sep), sortKey: r => r.sep },
    { key: 'rehire',    label: 'Rehire Date',    value: r => fmt(r.rehire), sortKey: r => r.rehire },
    { key: 'status',    label: 'Current Status', value: r => r.status },
  ]

  function openDrill(title, rows, accent, columns = formerCols, subtitle) {
    setDrill({
      title,
      subtitle: subtitle ?? `${rows.length} record${rows.length !== 1 ? 's' : ''} behind this metric`,
      accent,
      columns,
      rows,
    })
  }

  /* Feature gate */
  if (!enabled) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Feature Disabled</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>Rehire Management is not enabled. Contact your administrator.</div>
      </div>
    )
  }

  /* Role gate */
  if (!canAccess) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-danger)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Access Restricted</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>You do not have permission to view Rehire Management.</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Rehire Management</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>Former employee rehire eligibility and processing</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>
            Waiting period: {waitingPeriod} days · Configurable in Settings → White Label
          </div>
        </div>
        {isManager && (
          <button style={btnStyle('primary')} onClick={() => { setShowAdd(v => !v); setActiveProcess(null) }}>
            + Add Former Employee
          </button>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiTile label="Eligible for Rehire"  value={eligibleEmployees.length}    color="var(--t-success)" onClick={() => openDrill('Eligible for Rehire', eligibleEmployees, 'var(--t-success)')} />
        <KpiTile label="In Waiting Period"    value={waitingEmployees.length}     color="var(--t-warn)"    onClick={() => openDrill('In Waiting Period', waitingEmployees, 'var(--t-warn)')} />
        <KpiTile label="Not Eligible"         value={notEligibleEmployees.length} color="var(--t-danger)"  onClick={() => openDrill('Not Eligible for Rehire', notEligibleEmployees, 'var(--t-danger)')} />
        <KpiTile label="Rehired This Year"    value={rehiredThisYear.length}      color="var(--t-text)"    onClick={() => openDrill('Rehired This Year', rehiredThisYear, 'var(--t-accent)', rehiredCols)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
        {[
          { key: 'eligible',     label: `Rehire Eligible (${allEligibleRows.length})` },
          { key: 'not_eligible', label: `Not Eligible (${notEligibleEmployees.length})` },
          { key: 'rehired',      label: `Rehired (${rehired.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--t-accent)' : '2px solid transparent', color: tab === t.key ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: -1 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Loading…</div>
      )}

      {/* ── Eligible tab ── */}
      {!loading && tab === 'eligible' && (
        <div>
          {showAdd && (
            <AddFormerForm
              locationNodes={locationNodes}
              saving={saving}
              onSave={saveFormer}
              onClose={() => setShowAdd(false)}
            />
          )}

          {activeProcess && (
            <RehireProcess
              emp={activeProcess}
              onClose={() => setActiveProcess(null)}
              onToast={showToast}
              onDecide={decide}
              onOnboard={onboard}
            />
          )}

          <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Name', 'Last Location', 'Separation Date', 'Reason', 'Days Since Sep', 'DA History', 'Rehire Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEligibleRows.map((emp, i) => {
                  const ds = daysSince(emp.sep_date)
                  const isWaiting = !pastWait(emp)
                  const waitRemaining = isWaiting ? waitingPeriod - ds : 0
                  return (
                    <tr key={emp.id} style={{ borderBottom: i < allEligibleRows.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{emp.location}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(emp.sep_date)}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{emp.sep_reason || '—'}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{ds}d</td>
                      <td style={{ padding: '9px 14px' }}>
                        {emp.da_count === 0
                          ? <span style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>None</span>
                          : <span style={{ color: DA_SEV_COLOR[emp.da_severity], fontWeight: 700 }}>{emp.da_count} · {emp.da_severity}</span>
                        }
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span className={STATUS_BADGE[isWaiting ? 'waiting' : emp.status]}>
                          {isWaiting ? `In Waiting Period (${waitRemaining}d)` : STATUS_LABEL[emp.status]}
                        </span>
                        {emp.notes && (
                          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{emp.notes}</div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {isManager && !isWaiting && (
                          <button
                            style={{ ...btnStyle('primary'), padding: '5px 10px', fontSize: 11 }}
                            onClick={() => { setActiveProcess(emp); setShowAdd(false) }}
                          >
                            Start Rehire Process
                          </button>
                        )}
                        {isWaiting && (
                          <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Waiting period active</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {allEligibleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No former employees on file yet. Use “Add Former Employee” to record a separation.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Not Eligible tab ── */}
      {!loading && tab === 'not_eligible' && (
        <div>
          <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Name', 'Separation', 'Reason', 'Final DA', 'Notes', ...(isManager ? ['Override'] : [])].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notEligibleEmployees.map((emp, i) => (
                  <tr key={emp.id} style={{ borderBottom: i < notEligibleEmployees.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(emp.sep_date)}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{emp.sep_reason || '—'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {emp.da_count > 0
                        ? <span style={{ color: DA_SEV_COLOR[emp.da_severity], fontWeight: 700 }}>{emp.da_severity}</span>
                        : <span style={{ color: 'var(--t-text-faint)' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontSize: 12, maxWidth: 220 }}>{emp.notes || '—'}</td>
                    {isManager && (
                      <td style={{ padding: '9px 14px' }}>
                        <button
                          style={{ ...btnStyle('warn'), padding: '5px 10px', fontSize: 11 }}
                          onClick={() => flagReview(emp)}
                        >
                          Mark as Review Required
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {notEligibleEmployees.length === 0 && (
                  <tr>
                    <td colSpan={isManager ? 6 : 5} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No employees marked ineligible.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {isManager && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-text-faint)' }}>
              "Mark as Review Required" routes to the HR Investigation workflow.
            </div>
          )}
        </div>
      )}

      {/* ── Rehired tab ── */}
      {!loading && tab === 'rehired' && (
        <div>
          <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Name', 'Original Hire', 'Separation', 'Rehire Date', 'Current Status'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rehired.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rehired.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{r.name}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(r.orig_hire)}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(r.sep)}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(r.rehire)}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span className="badge green">{r.status}</span>
                    </td>
                  </tr>
                ))}
                {rehired.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No rehires recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
