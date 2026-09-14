import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtDT = (d) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const todayStr = () => new Date().toISOString().slice(0, 10)
const calcDaysOpen = (dateStr) => {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

/* ── constants ───────────────────────────────────────────────── */
const INCIDENT_TYPES_WC = ['Slip/Fall', 'Strain/Overexertion', 'Cut/Laceration', 'Equipment Injury', 'Chemical Exposure', 'Other']
const BODY_PARTS = ['Back/Spine', 'Knee', 'Hand/Wrist', 'Shoulder', 'Ankle/Foot', 'Head', 'Eye', 'Multiple']
const MEDICAL_ATTENTION = ['None', 'First Aid', 'Urgent Care', 'ER', 'Hospitalized']

/* ── style helpers ───────────────────────────────────────────── */
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

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--t-text-muted)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 5,
  display: 'block',
}

const sectionHeaderStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--t-text-muted)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  marginBottom: 12,
}

const surfaceCard = {
  background: 'var(--t-surface)',
  border: '1px solid var(--t-line)',
  padding: 16,
  marginBottom: 16,
  borderRadius: 0,
}

const btnAccent = {
  background: 'rgba(0,229,255,0.12)',
  border: '1px solid var(--t-accent)',
  color: 'var(--t-accent)',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
}

const btnDanger = {
  background: 'rgba(255,59,48,0.1)',
  border: '1px solid var(--t-danger)',
  color: 'var(--t-danger)',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
}

const btnMuted = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text-muted)',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
}

/* ── blank form ──────────────────────────────────────────────── */
const blankForm = () => ({
  personId: '',       // roster person id (real employee)
  nodeId: '',         // org_node id (real location)
  date: todayStr(),
  time: '09:00',
  type: INCIDENT_TYPES_WC[0],
  bodyPart: BODY_PARTS[0],
  description: '',
  medicalAttention: MEDICAL_ATTENTION[0],
  witnesses: '',
  oshaRecordable: false,
  reportedToInsurance: false,
})

const toastErr = (msg) => {
  try {
    window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg, type: 'error' } }))
  } catch { /* non-browser context */ }
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function WorkersComp() {
  const flag = useFeatureFlag('workers_comp')
  const { session } = useAuth()
  const { locationIds, locations } = useScope() || {}
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some((r) => roleName.includes(r))
  const actorName = session?.person?.full_name || session?.person?.display_name || 'Staff'
  const nodeIds = Array.isArray(locationIds) ? locationIds : []

  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [employees, setEmployees] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [noteInputs, setNoteInputs] = useState({})

  /* ── load roster (real employees; honest empty on failure) ─── */
  useEffect(() => {
    if (!nodeIds.length) { setEmployees([]); return }
    sb.rpc('get_roster', { p_node_ids: nodeIds })
      .then(({ data }) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
  }, [nodeIds.join(',')])

  /* ── load real workers-comp claims (real RPC only) ─────────── */
  const loadClaims = useCallback(async () => {
    if (!isManager) { setLoading(false); return [] }
    if (!nodeIds.length) { setIncidents([]); setLoading(false); setLoadError(null); return [] }
    setLoading(true); setLoadError(null)
    try {
      const { data, error } = await sb.rpc('get_workers_comp_claims', { p_node_ids: nodeIds })
      if (error) { setLoadError(error.message || 'Could not load claims.'); setIncidents([]); return [] }
      const list = Array.isArray(data) ? data : []
      setIncidents(list)
      return list
    } catch (e) {
      setLoadError((e && e.message) || 'Could not load claims.')
      setIncidents([])
      return []
    } finally {
      setLoading(false)
    }
  }, [nodeIds.join(','), isManager])

  useEffect(() => { loadClaims() }, [loadClaims])

  /* ── feature gate ────────────────────────────────────────── */
  if (!flag) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...surfaceCard, color: 'var(--t-text-muted)', fontSize: 13 }}>
          This feature is not enabled. Contact your system administrator to enable Workers Compensation tracking.
        </div>
      </div>
    )
  }

  /* ── role gate ───────────────────────────────────────────── */
  if (!isManager) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...surfaceCard, color: 'var(--t-text-muted)', fontSize: 13 }}>
          Access Restricted — HR Manager and above only.
        </div>
      </div>
    )
  }

  /* ── kpi computed values ─────────────────────────────────── */
  const openCount = incidents.filter((i) => i.status === 'OPEN').length
  const closedCount = incidents.filter((i) => i.status === 'CLOSED').length
  const oshaCount = incidents.filter((i) => i.oshaRecordable).length
  const mostRecentDate = incidents.reduce((latest, inc) => {
    const d = new Date(inc.date).getTime()
    return d > latest ? d : latest
  }, 0)
  const daysSinceLast = mostRecentDate > 0 ? Math.floor((Date.now() - mostRecentDate) / 86400000) : null

  /* ── form handlers ───────────────────────────────────────── */
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit() {
    setFormError(null)
    if (!form.personId) { setFormError('Select an employee.'); return }
    if (!form.nodeId) { setFormError('Select a location.'); return }
    if (!form.description.trim()) { setFormError('Description is required.'); return }
    const emp = employees.find((e) => String(e.id) === String(form.personId))
    setSubmitting(true)
    try {
      const { error } = await sb.rpc('create_workers_comp_claim', {
        p_node_id: form.nodeId,
        p_person_id: form.personId,
        p_employee_name: emp?.full_name || null,
        p_incident_date: form.date || null,
        p_occurred_time: form.time || null,
        p_type: form.type,
        p_body_part: form.bodyPart,
        p_description: form.description,
        p_medical_attention: form.medicalAttention,
        p_witnesses: form.witnesses || null,
        p_osha_recordable: !!form.oshaRecordable,
        p_reported_to_insurance: !!form.reportedToInsurance,
        p_reported_by: session?.person?.id || null,
        p_reporter_name: actorName,
      })
      if (error) { setFormError(error.message || 'Could not save claim.'); return }
      setShowForm(false)
      setForm(blankForm())
      await loadClaims()
    } catch (e) {
      setFormError((e && e.message) || 'Could not save claim.')
    } finally {
      setSubmitting(false)
    }
  }

  async function closeCase(id) {
    if (!window.confirm('Close this workers comp case? This action cannot be undone.')) return
    const { error } = await sb.rpc('update_workers_comp_claim', {
      p_claim_id: id, p_status: 'CLOSED', p_note: null, p_actor: actorName,
    })
    if (error) { toastErr('Case not closed — ' + (error.message || 'try again') + '.'); return }
    if (expandedId === id) setExpandedId(null)
    await loadClaims()
  }

  async function addNote(id) {
    const text = (noteInputs[id] || '').trim()
    if (!text) return
    const { error } = await sb.rpc('update_workers_comp_claim', {
      p_claim_id: id, p_status: null, p_note: text, p_actor: actorName,
    })
    if (error) { toastErr('Note not saved — ' + (error.message || 'try again') + '.'); return }
    setNoteInputs((prev) => ({ ...prev, [id]: '' }))
    await loadClaims()
  }

  const statusBadgeClass = (s) => {
    if (s === 'OPEN') return 'badge red'
    if (s === 'CLOSED') return 'badge green'
    if (s === 'PENDING REVIEW') return 'badge amber'
    return 'badge blue'
  }

  const locationList = Array.isArray(locations) ? locations : []

  return (
    <div style={{ padding: 24 }}>
      {/* ── page header ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.03em', marginBottom: 4 }}>
            Workers Compensation
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            Incident logging, claim tracking, and OSHA recordable management
          </div>
        </div>
        <button
          style={btnAccent}
          onClick={() => { setShowForm((v) => !v); setExpandedId(null); setFormError(null) }}
        >
          {showForm ? '✕ Cancel' : '+ Log New Incident'}
        </button>
      </div>

      {/* ── load error (honest, no silent fallback) ───────────── */}
      {loadError && !loading && (
        <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          Could not load workers-comp claims — {loadError}
        </div>
      )}

      {/* ── kpi tiles ────────────────────────────────────────── */}
      <div style={sectionHeaderStyle}>Overview</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* Open Cases */}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Open Cases</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: openCount > 0 ? 'var(--t-danger)' : 'var(--t-text)', lineHeight: 1 }}>{openCount}</div>
        </div>
        {/* Closed This Year */}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Closed</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)', lineHeight: 1 }}>{closedCount}</div>
        </div>
        {/* OSHA Recordable */}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>OSHA Recordable</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: oshaCount > 0 ? 'var(--t-danger)' : 'var(--t-text)', lineHeight: 1 }}>{oshaCount}</div>
        </div>
        {/* Days Since Last Incident */}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 140, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Days Since Last Incident</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: daysSinceLast !== null ? 'var(--t-success)' : 'var(--t-text)', lineHeight: 1 }}>
            {daysSinceLast !== null ? daysSinceLast : '—'}
          </div>
        </div>
      </div>

      {/* ── new incident form ─────────────────────────────────── */}
      {showForm && (
        <div style={{ ...surfaceCard, marginBottom: 24 }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 16 }}>Log New Incident</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {formError && (
              <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 13 }}>{formError}</div>
            )}
            {/* Employee */}
            <div>
              <label style={labelStyle}>Employee *</label>
              <select value={form.personId} onChange={(e) => setField('personId', e.target.value)} style={{ ...selStyle, width: '100%' }}>
                <option value="">— Select Employee —</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
              {employees.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>No employees available for your locations.</div>
              )}
            </div>
            {/* Location */}
            <div>
              <label style={labelStyle}>Location *</label>
              <select value={form.nodeId} onChange={(e) => setField('nodeId', e.target.value)} style={{ ...selStyle, width: '100%' }}>
                <option value="">— Select Location —</option>
                {locationList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {/* Date + Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                <input type="time" value={form.time} onChange={(e) => setField('time', e.target.value)} style={inputStyle} />
              </div>
            </div>
            {/* Incident Type */}
            <div>
              <label style={labelStyle}>Incident Type *</label>
              <select value={form.type} onChange={(e) => setField('type', e.target.value)} style={{ ...selStyle, width: '100%' }}>
                {INCIDENT_TYPES_WC.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* Body Part */}
            <div>
              <label style={labelStyle}>Body Part Affected *</label>
              <select value={form.bodyPart} onChange={(e) => setField('bodyPart', e.target.value)} style={{ ...selStyle, width: '100%' }}>
                {BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Description */}
            <div>
              <label style={labelStyle}>Description *</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                placeholder="Describe what happened in detail…"
              />
            </div>
            {/* Medical Attention */}
            <div>
              <label style={labelStyle}>Medical Attention Required</label>
              <select value={form.medicalAttention} onChange={(e) => setField('medicalAttention', e.target.value)} style={{ ...selStyle, width: '100%' }}>
                {MEDICAL_ATTENTION.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {/* Witnesses */}
            <div>
              <label style={labelStyle}>Witness Names</label>
              <input type="text" value={form.witnesses} onChange={(e) => setField('witnesses', e.target.value)} style={inputStyle} placeholder="Names of any witnesses" />
            </div>
            {/* Toggles */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.oshaRecordable} onChange={(e) => setField('oshaRecordable', e.target.checked)} style={{ accentColor: 'var(--t-accent)' }} />
                OSHA Recordable
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.reportedToInsurance} onChange={(e) => setField('reportedToInsurance', e.target.checked)} style={{ accentColor: 'var(--t-accent)' }} />
                Reported to Insurance
              </label>
            </div>
            {/* Submit */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--t-line)' }}>
              <button style={{ ...btnAccent, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Incident'}
              </button>
              <button style={btnMuted} onClick={() => { setShowForm(false); setForm(blankForm()); setFormError(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── incidents table ───────────────────────────────────── */}
      <div style={sectionHeaderStyle}>All Incidents</div>
      <div style={{ border: '1px solid var(--t-line)', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Claim', 'Date', 'Employee', 'Location', 'Type', 'Body Part', 'Medical Attention', 'OSHA Recordable', 'Status', 'Days Open', 'Action'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', borderBottom: '1px solid var(--t-line)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>Loading claims…</td></tr>
            )}
            {!loading && incidents.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--t-text-faint)' }}>
                  No workers-comp claims on record for your locations. Use “+ Log New Incident” to file the first claim.
                </td>
              </tr>
            )}
            {!loading && incidents.map((inc) => (
              <>
                <tr key={inc.id} style={{ borderBottom: '1px solid var(--t-line)', background: expandedId === inc.id ? 'var(--t-surface-2)' : 'transparent' }}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{inc.claimNum}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{fmt(inc.date)}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 600 }}>{inc.employee}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{inc.location}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{inc.type}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)' }}>{inc.bodyPart}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)' }}>{inc.medicalAttention}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                    {inc.oshaRecordable
                      ? <span className="badge red">YES</span>
                      : <span className="badge green">NO</span>}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                    <span className={statusBadgeClass(inc.status)}>{inc.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)' }}>
                    {calcDaysOpen(inc.date)}d
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                      <button
                        style={btnMuted}
                        onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
                      >
                        {expandedId === inc.id ? 'Collapse' : 'View/Edit'}
                      </button>
                      {inc.status !== 'CLOSED' && (
                        <button style={btnDanger} onClick={() => closeCase(inc.id)}>
                          Close Case
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* ── expanded detail row ────────────────────── */}
                {expandedId === inc.id && (
                  <tr key={inc.id + '-detail'}>
                    <td colSpan={11} style={{ padding: 0, borderBottom: '2px solid var(--t-accent)' }}>
                      <div style={{ background: 'var(--t-surface-2)', padding: 20 }}>
                        {/* Detail grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                          <div>
                            <div style={sectionHeaderStyle}>Incident Details</div>
                            <div style={{ fontSize: 13, color: 'var(--t-text-faint)', lineHeight: 1.7, marginBottom: 10 }}>{inc.description || '—'}</div>
                            <div style={{ fontSize: 12, marginBottom: 6 }}>
                              <span style={{ color: 'var(--t-text-muted)', fontWeight: 700 }}>Claim #: </span>
                              <span style={{ color: 'var(--t-text)' }}>{inc.claimNum}</span>
                            </div>
                            <div style={{ fontSize: 12, marginBottom: 6 }}>
                              <span style={{ color: 'var(--t-text-muted)', fontWeight: 700 }}>Medical: </span>
                              <span style={{ color: 'var(--t-text)' }}>{inc.medicalAttention}</span>
                            </div>
                            {inc.witnesses && (
                              <div style={{ fontSize: 12, marginBottom: 6 }}>
                                <span style={{ color: 'var(--t-text-muted)', fontWeight: 700 }}>Witnesses: </span>
                                <span style={{ color: 'var(--t-text)' }}>{inc.witnesses}</span>
                              </div>
                            )}
                            <div style={{ fontSize: 12, marginBottom: 6 }}>
                              <span style={{ color: 'var(--t-text-muted)', fontWeight: 700 }}>Insurance Reported: </span>
                              <span style={{ color: inc.reportedToInsurance ? 'var(--t-success)' : 'var(--t-text-muted)' }}>
                                {inc.reportedToInsurance ? 'Yes' : 'No'}
                              </span>
                            </div>
                          </div>

                          {/* Notes log + add note */}
                          <div>
                            <div style={sectionHeaderStyle}>Case Notes</div>
                            <div style={{ marginBottom: 12 }}>
                              {(inc.notes || []).map((n, idx) => (
                                <div
                                  key={idx}
                                  style={{ paddingLeft: 8, borderLeft: '2px solid var(--t-accent)', marginBottom: 10 }}
                                >
                                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 2 }}>{fmtDT(n.ts)}{n.actor ? ' · ' + n.actor : ''}</div>
                                  <div style={{ fontSize: 13, color: 'var(--t-text)' }}>{n.note}</div>
                                </div>
                              ))}
                              {(!inc.notes || inc.notes.length === 0) && (
                                <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No notes yet.</div>
                              )}
                            </div>
                            <textarea
                              rows={3}
                              value={noteInputs[inc.id] || ''}
                              onChange={(e) => setNoteInputs((prev) => ({ ...prev, [inc.id]: e.target.value }))}
                              style={{ ...inputStyle, resize: 'vertical', fontSize: 12, marginBottom: 8 }}
                              placeholder="Add a case note…"
                            />
                            <button style={btnAccent} onClick={() => addNote(inc.id)}>Add Note</button>
                          </div>

                          {/* Timeline + attachment */}
                          <div>
                            <div style={sectionHeaderStyle}>Case Timeline</div>
                            <div style={{ marginBottom: 16 }}>
                              {(inc.notes || []).map((n, idx) => (
                                <div
                                  key={idx}
                                  style={{ display: 'flex', gap: 10, marginBottom: 10, paddingLeft: 8, borderLeft: '2px solid var(--t-accent)' }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 2 }}>{fmtDT(n.ts)}</div>
                                    <div style={{ fontSize: 12, color: 'var(--t-text)' }}>{n.note}</div>
                                  </div>
                                </div>
                              ))}
                              {(!inc.notes || inc.notes.length === 0) && (
                                <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No timeline entries yet.</div>
                              )}
                            </div>
                            <div style={sectionHeaderStyle}>File Attachment</div>
                            <button
                              disabled
                              style={{ ...btnMuted, opacity: 0.45, cursor: 'not-allowed' }}
                              title="File attachments are not yet available"
                            >
                              Attach File <span style={{ color: 'var(--t-text-muted)', fontWeight: 400 }}>(not yet available)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
