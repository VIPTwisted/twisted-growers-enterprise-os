import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtDT = (d) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const todayStr = () => new Date().toISOString().slice(0, 10)
const daysOpen = (dateStr) => {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHRRole = (r = '') => HR_ROLES.some((x) => r.toLowerCase().includes(x))

/* ── constants ───────────────────────────────────────────────── */
const INCIDENT_TYPES = [
  'Theft/Shoplifting',
  'Suspected Employee Theft',
  'Customer Altercation',
  'Slip/Fall/Injury',
  'Property Damage',
  'Register Discrepancy',
  'HR Policy Violation',
  'Safety Hazard',
  'Other',
]

const SEVERITY_LEVELS = ['Critical', 'High', 'Medium', 'Low']
const STATUS_OPTIONS = ['open', 'in-review', 'resolved', 'closed']

const SEVERITY_BADGE = {
  Critical: 'badge red',
  High:     'badge amber',
  Medium:   'badge blue',
  Low:      'badge green',
}

const SEVERITY_BORDER = {
  Critical: 'var(--t-danger)',
  High:     'var(--t-warn)',
  Medium:   'var(--t-accent)',
  Low:      'var(--t-success)',
}

const STATUS_BADGE = {
  open:       'badge red',
  'in-review':'badge amber',
  resolved:   'badge green',
  closed:     'badge blue',
}

const STATUS_LABEL = {
  open:       'Open',
  'in-review':'In Review',
  resolved:   'Resolved',
  closed:     'Closed',
}

const TYPE_SHORT = {
  'Theft/Shoplifting':        'Theft',
  'Suspected Employee Theft': 'Emp. Theft',
  'Customer Altercation':     'Altercation',
  'Slip/Fall/Injury':         'Slip/Fall',
  'Property Damage':          'Property',
  'Register Discrepancy':     'Register $',
  'HR Policy Violation':      'HR Violation',
  'Safety Hazard':            'Safety',
  'Other':                    'Other',
}

/* ── investigation checklist items ───────────────────────────── */
const CHECKLIST_ITEMS = [
  { id: 'initial_report',     label: 'Initial report filed' },
  { id: 'witnesses',          label: 'Witnesses interviewed' },
  { id: 'camera_reviewed',    label: 'Camera footage reviewed' },
  { id: 'police_report',      label: 'Police report obtained (if applicable)' },
  { id: 'hr_notified',        label: 'HR notified' },
  { id: 'employee_statement', label: 'Employee statement taken' },
  { id: 'resolution',         label: 'Resolution determined' },
  { id: 'case_closed',        label: 'Case closed' },
]

/* ── blank file incident form ────────────────────────────────── */
const blankForm = () => ({
  type: INCIDENT_TYPES[0],
  severity: 'Medium',
  date: todayStr(),
  time: '12:00',
  location: '',
  description: '',
  employees_involved: [],
  witnesses: '',
  customer_involved: false,
  customer_name: '',
  customer_contact: '',
  police_called: false,
  police_report_num: '',
  estimated_loss: '',
  immediate_action: '',
  follow_up: false,
  notify_hr: true,
})

/* ── styled select helper ────────────────────────────────────── */
const selStyle = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '6px 10px',
  fontSize: 13,
  minWidth: 140,
  outline: 'none',
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

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENT: KPI PANEL
══════════════════════════════════════════════════════════════ */
function KpiPanel({ incidents, locationNames }) {
  const thisYear = new Date().getFullYear()
  const thisMonth = `${thisYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const lastYear = thisYear - 1

  const total      = incidents.length
  const open       = incidents.filter(r => r.status === 'open').length
  const resolvedMo = incidents.filter(r => r.status === 'resolved' && (r.date || '').startsWith(thisMonth)).length
  const ytd        = incidents.filter(r => (r.date || '').startsWith(String(thisYear))).length
  const lastYtd    = incidents.filter(r => (r.date || '').startsWith(String(lastYear))).length
  const vsLastYear = lastYtd === 0 ? null : Math.round(((ytd - lastYtd) / lastYtd) * 100)

  const avgRes = useMemo(() => {
    const resolved = incidents.filter(r => r.status === 'resolved' || r.status === 'closed')
    if (!resolved.length) return '—'
    const days = resolved.map(r => daysOpen(r.date))
    return (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)
  }, [incidents])

  // By type counts
  const byType = useMemo(() => {
    const counts = {}
    INCIDENT_TYPES.forEach(t => { counts[t] = 0 })
    incidents.forEach(r => { if (counts[r.type] !== undefined) counts[r.type]++ })
    return counts
  }, [incidents])

  // Risk row
  const critical7 = incidents.filter(r => r.status === 'open' && r.severity === 'Critical' && daysOpen(r.date) > 7).length
  const repeatLoc  = useMemo(() => {
    const locCounts = {}
    incidents.forEach(r => { locCounts[r.location] = (locCounts[r.location] || 0) + 1 })
    return Object.values(locCounts).filter(c => c >= 3).length
  }, [incidents])
  const policeRep  = incidents.filter(r => r.police_called).length
  const insClaims  = incidents.filter(r => r.type === 'Slip/Fall/Injury' && r.status !== 'closed').length
  const escalated  = incidents.filter(r => r.investigation_notes && r.investigation_notes.toLowerCase().includes('escalat')).length
  const awaiting   = incidents.filter(r => r.status === 'in-review').length

  // By location table
  const locData = useMemo(() => {
    return (locationNames || []).map(loc => {
      const rows = incidents.filter(r => r.location === loc)
      const openN = rows.filter(r => r.status === 'open').length
      const resolvedN = rows.filter(r => r.status === 'resolved' || r.status === 'closed').length
      const typeCounts = {}
      rows.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1 })
      const mostCommon = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      const risk = openN >= 3 ? 'High' : openN >= 1 ? 'Medium' : 'Low'
      return { loc, open: openN, resolved: resolvedN, total: rows.length, mostCommon, risk }
    })
  }, [incidents, locationNames])

  const kpiTile = (label, value, color) => (
    <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1 }}>{value}</div>
    </div>
  )

  const chipStyle = (color) => ({
    display: 'inline-block',
    background: 'var(--t-surface)',
    border: `1px solid var(--t-line)`,
    padding: '6px 12px',
    fontSize: 12,
    color: color || 'var(--t-text)',
  })

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Row 1 — Volume */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Volume</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpiTile('Total Incidents', total, 'var(--t-text)')}
        {kpiTile('Open', open, open > 0 ? 'var(--t-danger)' : 'var(--t-success)')}
        {kpiTile('Resolved This Month', resolvedMo, 'var(--t-success)')}
        {kpiTile('Avg Resolution Days', avgRes, 'var(--t-text)')}
        {kpiTile('YTD', ytd, 'var(--t-text)')}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>vs Last Year</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: vsLastYear === null ? 'var(--t-text)' : vsLastYear > 0 ? 'var(--t-danger)' : 'var(--t-success)', lineHeight: 1 }}>
            {vsLastYear === null ? '—' : `${vsLastYear > 0 ? '+' : ''}${vsLastYear}%`}
          </div>
        </div>
      </div>

      {/* Row 2 — By Type */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>By Type</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {INCIDENT_TYPES.map(t => (
          <div key={t} style={chipStyle(byType[t] > 0 ? 'var(--t-text)' : 'var(--t-text-faint)')}>
            <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 2 }}>{TYPE_SHORT[t]}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{byType[t]}</div>
          </div>
        ))}
      </div>

      {/* Row 3 — Risk */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Risk Signals</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['Critical Unresolved >7d', critical7, critical7 > 0 ? 'var(--t-danger)' : null],
          ['Repeat Locations',        repeatLoc,  repeatLoc > 0 ? 'var(--t-warn)' : null],
          ['Police Reports Filed',    policeRep,  policeRep > 0 ? 'var(--t-warn)' : null],
          ['Insurance Claims',        insClaims,  insClaims > 0 ? 'var(--t-danger)' : null],
          ['Escalated to Mgmt',       escalated,  escalated > 0 ? 'var(--t-warn)' : null],
          ['Awaiting Investigation',  awaiting,   awaiting > 0 ? 'var(--t-accent)' : null],
        ].map(([label, val, col]) => kpiTile(label, val, col))}
      </div>

      {/* Row 4 — By Location */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>By Location</div>
      <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Location', 'Open', 'Resolved', 'Total', 'Most Common Type', 'Risk Level'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locData.map((row, i) => (
              <tr key={row.loc} style={{ borderBottom: i < locData.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{row.loc}</td>
                <td style={{ padding: '9px 14px', color: row.open > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: row.open > 0 ? 700 : 400 }}>{row.open}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{row.resolved}</td>
                <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{row.total}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontSize: 12 }}>{row.mostCommon}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span className={row.risk === 'High' ? 'badge red' : row.risk === 'Medium' ? 'badge amber' : 'badge green'}>{row.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENT: INCIDENT DETAIL PANEL
══════════════════════════════════════════════════════════════ */
function DetailPanel({ incident, onClose, onAction, isHR }) {
  const [notes, setNotes] = useState(incident.investigation_notes || '')
  const [saving, setSaving] = useState(false)

  async function saveNotes() {
    setSaving(true)
    const { error } = await sb.rpc('update_incident_full', { p_incident_id: incident.id, p_notes: notes })
    setSaving(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Notes not saved — ' + (error.message || 'try again') + '.', type: 'error' } }))
      return
    }
    onAction('refresh', incident.id)
  }

  const infoRow = (label, value) => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10, borderBottom: '1px solid var(--t-line)', paddingBottom: 10 }}>
      <div style={{ minWidth: 140, fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t-text)', flex: 1 }}>{value || '—'}</div>
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 640, minHeight: '100vh', padding: 0, position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em' }}>{incident.incident_number}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{incident.location} · {fmtDT(incident.date)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={SEVERITY_BADGE[incident.severity] || 'badge'}>{incident.severity}</span>
            <span className={STATUS_BADGE[incident.status] || 'badge'}>{STATUS_LABEL[incident.status]}</span>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Summary */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{incident.type}</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-faint)', lineHeight: 1.7 }}>{incident.summary}</div>
          </div>

          {/* Details */}
          {infoRow('Reported By', incident.reported_by)}
          {infoRow('Employees Involved', (incident.employees_involved || []).join(', ') || 'None')}
          {infoRow('Witnesses', incident.witnesses)}
          {incident.customer_involved && infoRow('Customer', `${incident.customer_name || '?'}${incident.customer_contact ? ' · ' + incident.customer_contact : ''}`)}
          {incident.police_called && infoRow('Police Report', incident.police_report_num || 'Filed — no number')}
          {(incident.estimated_loss > 0) && infoRow('Estimated Loss', `$${Number(incident.estimated_loss).toFixed(2)}`)}
          {infoRow('Immediate Action', incident.immediate_action)}
          {infoRow('Assigned Investigator', incident.assigned_investigator)}
          {infoRow('Follow-up Required', incident.follow_up ? 'Yes' : 'No')}

          {/* Timeline */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Timeline</div>
            {(incident.timeline || []).map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, paddingLeft: 8, borderLeft: '2px solid var(--t-accent)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 2 }}>{fmtDT(t.ts)} · {t.actor}</div>
                  <div style={{ fontSize: 13, color: 'var(--t-text)' }}>{t.note}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Investigation notes (HR only) */}
          {isHR && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Investigation Notes</div>
              <textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                placeholder="Add investigation notes…"
              />
              <button onClick={saveNotes} disabled={saving} style={{ marginTop: 8, background: 'rgba(0,229,255,0.1)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save Notes'}
              </button>
            </div>
          )}

          {/* Actions (HR only) */}
          {isHR && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--t-line)', paddingTop: 16 }}>
              {incident.status === 'open' && (
                <button onClick={() => onAction('status', incident.id, 'in-review')} style={{ background: 'rgba(255,149,0,0.1)', border: '1px solid var(--t-warn)', color: 'var(--t-warn)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Mark In Review
                </button>
              )}
              {(incident.status === 'open' || incident.status === 'in-review') && (
                <button onClick={() => onAction('status', incident.id, 'resolved')} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Mark Resolved
                </button>
              )}
              {incident.status === 'resolved' && (
                <button onClick={() => onAction('status', incident.id, 'closed')} style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Close Case
                </button>
              )}
              <button onClick={() => onAction('escalate', incident.id)} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Escalate
              </button>
              <button onClick={() => onAction('report', incident.id)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Generate Report
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENT: FILE INCIDENT FORM
══════════════════════════════════════════════════════════════ */
function FileIncidentTab({ locations, employees, onSubmit }) {
  const { session } = useAuth()
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.location) { setError('Select a location.'); return }
    if (!form.description.trim()) { setError('Description is required.'); return }
    setSaving(true); setError(null)
    const res = await onSubmit(form)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setSuccess(true)
    setForm(blankForm())
    setTimeout(() => setSuccess(false), 3000)
  }

  const fmtLoss = Number(form.estimated_loss || 0).toFixed(2)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
      {/* LEFT: Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--t-line)', paddingBottom: 8 }}>File New Incident</div>

        {success && <div style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>Incident filed successfully.</div>}
        {error && <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Incident Type *</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={{ ...selStyle, width: '100%' }}>
              {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Severity *</label>
            <select value={form.severity} onChange={e => set('severity', e.target.value)} style={{ ...selStyle, width: '100%' }}>
              {SEVERITY_LEVELS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Location *</label>
            <select value={form.location} onChange={e => set('location', e.target.value)} style={{ ...selStyle, width: '100%' }}>
              <option value="">— Select —</option>
              {locations.map(l => <option key={l.id || l.name}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description *</label>
          <textarea rows={4} value={form.description} onChange={e => set('description', e.target.value)} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} placeholder="Describe what happened in detail…" />
        </div>

        <div>
          <label style={labelStyle}>Employees Involved</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: '1px solid var(--t-line)', padding: '8px 10px', background: 'var(--t-surface-2)', minHeight: 40 }}>
            {employees.map(emp => {
              const sel = form.employees_involved.includes(emp.full_name)
              return (
                <button key={emp.id}
                  onClick={() => set('employees_involved', sel ? form.employees_involved.filter(n => n !== emp.full_name) : [...form.employees_involved, emp.full_name])}
                  style={{ background: sel ? 'rgba(0,229,255,0.15)' : 'var(--t-surface)', border: `1px solid ${sel ? 'var(--t-accent)' : 'var(--t-line)'}`, color: sel ? 'var(--t-accent)' : 'var(--t-text-muted)', padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}
                >
                  {emp.full_name}
                </button>
              )
            })}
            {employees.length === 0 && <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No employees loaded</span>}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Witnesses</label>
          <input type="text" value={form.witnesses} onChange={e => set('witnesses', e.target.value)} style={inputStyle} placeholder="Name(s) of witnesses" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Customer Involved?</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {[true, false].map(v => (
                <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
                  <input type="radio" checked={form.customer_involved === v} onChange={() => set('customer_involved', v)} />
                  {v ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Police Called?</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {[true, false].map(v => (
                <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
                  <input type="radio" checked={form.police_called === v} onChange={() => set('police_called', v)} />
                  {v ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
          </div>
        </div>

        {form.customer_involved && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Customer Name</label>
              <input type="text" value={form.customer_name} onChange={e => set('customer_name', e.target.value)} style={inputStyle} placeholder="Full name or Unknown" />
            </div>
            <div>
              <label style={labelStyle}>Customer Contact</label>
              <input type="text" value={form.customer_contact} onChange={e => set('customer_contact', e.target.value)} style={inputStyle} placeholder="Phone or email" />
            </div>
          </div>
        )}

        {form.police_called && (
          <div>
            <label style={labelStyle}>Police Report #</label>
            <input type="text" value={form.police_report_num} onChange={e => set('police_report_num', e.target.value)} style={inputStyle} placeholder="PD-YYYY-NNNN" />
          </div>
        )}

        {(form.type === 'Theft/Shoplifting' || form.type === 'Suspected Employee Theft' || form.type === 'Register Discrepancy') && (
          <div>
            <label style={labelStyle}>Estimated $ Loss</label>
            <input type="number" min="0" step="0.01" value={form.estimated_loss} onChange={e => set('estimated_loss', e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} placeholder="0.00" />
          </div>
        )}

        <div>
          <label style={labelStyle}>Immediate Action Taken</label>
          <textarea rows={3} value={form.immediate_action} onChange={e => set('immediate_action', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="What was done immediately after the incident?" />
        </div>

        <div>
          <label style={labelStyle}>Photos / Evidence</label>
          <div style={{ border: '1px dashed var(--t-line)', padding: '16px 14px', background: 'var(--t-surface-2)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>📎</span>
            <div>
              <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Attach photos or evidence files</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>File attachments are not yet available — keep evidence files with your manager</div>
            </div>
            <button disabled title="File attachments are not yet available" style={{ marginLeft: 'auto', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 12, cursor: 'not-allowed', opacity: 0.45 }}>
              Browse Files <span style={{ color: 'var(--t-text-faint)', fontWeight: 400 }}>(not yet available)</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.follow_up} onChange={e => set('follow_up', e.target.checked)} />
            Follow-up required
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.notify_hr} onChange={e => set('notify_hr', e.target.checked)} />
            Notify HR immediately
          </label>
        </div>

        <div style={{ paddingTop: 8, borderTop: '1px solid var(--t-line)' }}>
          <button onClick={handleSubmit} disabled={saving} style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, letterSpacing: '0.04em' }}>
            {saving ? 'Filing Incident…' : 'File Incident Report'}
          </button>
        </div>
      </div>

      {/* RIGHT: Live Preview */}
      <div style={{ background: '#fff', color: '#000', padding: 24, fontFamily: 'Arial, sans-serif', border: '1px solid #ccc', fontSize: 12, position: 'sticky', top: 20 }}>
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, letterSpacing: '0.06em', borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12 }}>INCIDENT REPORT</div>
        <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginBottom: 16 }}>Twisted Growers — Massachusetts</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {[['Report #', 'PENDING'], ['Date', form.date], ['Time', form.time], ['Location', form.location || '—']].map(([k, v]) => (
            <div key={k}><span style={{ fontWeight: 700, fontSize: 10 }}>{k}: </span><span>{v}</span></div>
          ))}
        </div>
        <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>TYPE: </span>{form.type}</div>
        <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>SEVERITY: </span>{form.severity}</div>
        <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>DESCRIPTION: </span><div style={{ marginTop: 4, lineHeight: 1.5, color: '#333' }}>{form.description || '…'}</div></div>
        {form.employees_involved.length > 0 && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>EMPLOYEES INVOLVED: </span>{form.employees_involved.join(', ')}</div>}
        {form.witnesses && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>WITNESSES: </span>{form.witnesses}</div>}
        {form.customer_involved && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>CUSTOMER: </span>{form.customer_name || 'Unknown'}</div>}
        {form.police_called && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>POLICE REPORT: </span>{form.police_report_num || 'Filed'}</div>}
        {form.estimated_loss > 0 && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>EST. LOSS: </span>${fmtLoss}</div>}
        {form.immediate_action && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 10 }}>IMMEDIATE ACTION: </span><div style={{ marginTop: 4, lineHeight: 1.5, color: '#333' }}>{form.immediate_action}</div></div>}
        <div style={{ marginTop: 16, borderTop: '1px solid #ccc', paddingTop: 10, fontSize: 10, color: '#888' }}>
          Reported by: {session?.person?.full_name || 'Staff'} · {todayStr()}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENT: INVESTIGATION TAB
══════════════════════════════════════════════════════════════ */
function InvestigationTab({ incidents, onAction }) {
  const active = incidents.filter(r => r.status === 'in-review')
  const [checklists, setChecklists] = useState({})
  const [recs, setRecs] = useState({})

  // Seed checklist state from the persisted `checklist` jsonb on each incident.
  useEffect(() => {
    const seed = {}
    incidents.forEach(i => { if (i.checklist && typeof i.checklist === 'object') seed[i.id] = i.checklist })
    setChecklists(seed)
  }, [incidents])

  function toggleCheck(incId, itemId) {
    setChecklists(prev => {
      const cur = prev[incId] || {}
      const val = !cur[itemId]
      const next = { ...cur, [itemId]: val ? new Date().toISOString() : null }
      onAction('checklist', incId, next)   // persist to the incident row
      return { ...prev, [incId]: next }
    })
  }

  function getCheck(incId, itemId) {
    return !!(checklists[incId] || {})[itemId]
  }

  function getCheckTs(incId, itemId) {
    return (checklists[incId] || {})[itemId]
  }

  if (active.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🔍</div>
        <div style={{ fontWeight: 700, color: 'var(--t-text-muted)' }}>No active investigations</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-faint)', marginTop: 6 }}>Mark incidents as "In Review" to begin an investigation.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {active.map(inc => {
        const done = CHECKLIST_ITEMS.filter(ci => getCheck(inc.id, ci.id)).length
        const pct = Math.round((done / CHECKLIST_ITEMS.length) * 100)
        return (
          <div key={inc.id} style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--t-surface)' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)', marginBottom: 3 }}>{inc.incident_number} — {inc.type}</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{inc.location} · Filed {fmt(inc.date)} · {daysOpen(inc.date)} days ago</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                  <span style={{ color: pct === 100 ? 'var(--t-success)' : 'var(--t-text)', fontWeight: 700 }}>{pct}%</span> complete
                </div>
                <span className={SEVERITY_BADGE[inc.severity] || 'badge'}>{inc.severity}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Left: Checklist */}
              <div style={{ padding: '16px 18px', borderRight: '1px solid var(--t-line)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>Investigation Checklist</div>
                {/* Progress bar */}
                <div style={{ height: 4, background: 'var(--t-line)', marginBottom: 12, borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--t-success)' : 'var(--t-accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                {CHECKLIST_ITEMS.map(ci => {
                  const checked = getCheck(inc.id, ci.id)
                  const ts = getCheckTs(inc.id, ci.id)
                  return (
                    <label key={ci.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCheck(inc.id, ci.id)} style={{ marginTop: 2, accentColor: 'var(--t-accent)', width: 14, height: 14 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: checked ? 'var(--t-text-muted)' : 'var(--t-text)', textDecoration: checked ? 'line-through' : 'none' }}>{ci.label}</div>
                        {ts && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 1 }}>{fmtDT(ts)}</div>}
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Right: Details */}
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Case Details</div>
                <div style={{ fontSize: 13, color: 'var(--t-text-faint)', lineHeight: 1.7, marginBottom: 12 }}>{inc.summary}</div>
                <div style={{ fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--t-text-muted)', fontWeight: 600 }}>Investigator: </span><span style={{ color: 'var(--t-text)' }}>{inc.assigned_investigator || '—'}</span></div>
                {inc.estimated_loss > 0 && <div style={{ fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--t-text-muted)', fontWeight: 600 }}>Est. Loss: </span><span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>${Number(inc.estimated_loss).toFixed(2)}</span></div>}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 14, marginBottom: 8 }}>Resolution Recommendation</div>
                <textarea
                  rows={3}
                  value={recs[inc.id] || ''}
                  onChange={e => setRecs(r => ({ ...r, [inc.id]: e.target.value }))}
                  placeholder="Enter recommendation… (saved to the case timeline on Resolve)"
                  style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => {
                      const note = (recs[inc.id] || '').trim()
                      onAction('status', inc.id, 'resolved', note ? 'Resolution: ' + note : null)
                      setRecs(r => ({ ...r, [inc.id]: '' }))
                    }}
                    style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >Resolve</button>
                  <button onClick={() => onAction('escalate', inc.id)} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Escalate</button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENT: REPORTS TAB
══════════════════════════════════════════════════════════════ */
function ReportsTab({ incidents, locationNames }) {
  // Monthly table (last 12 months)
  const monthly = useMemo(() => {
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      const rows = incidents.filter(r => (r.date || '').startsWith(key))
      months.push({ key, label, total: rows.length, open: rows.filter(r => r.status === 'open').length, resolved: rows.filter(r => r.status === 'resolved' || r.status === 'closed').length })
    }
    return months
  }, [incidents])

  // By type
  const byType = useMemo(() => {
    const total = incidents.length || 1
    return INCIDENT_TYPES.map(t => {
      const count = incidents.filter(r => r.type === t).length
      return { type: t, count, pct: Math.round((count / total) * 100) }
    }).sort((a, b) => b.count - a.count)
  }, [incidents])

  // By location
  const byLoc = useMemo(() => {
    return (locationNames || []).map(loc => {
      const rows = incidents.filter(r => r.location === loc)
      const avg = rows.length === 0 ? 0 : (rows.map(r => daysOpen(r.date)).reduce((a, b) => a + b, 0) / rows.length).toFixed(1)
      return { loc, total: rows.length, open: rows.filter(r => r.status === 'open').length, avg }
    })
  }, [incidents, locationNames])

  // Avg resolution by type
  const avgByType = useMemo(() => {
    return INCIDENT_TYPES.map(t => {
      const rows = incidents.filter(r => r.type === t && (r.status === 'resolved' || r.status === 'closed'))
      if (!rows.length) return { type: t, avg: '—' }
      const avg = (rows.map(r => daysOpen(r.date)).reduce((a, b) => a + b, 0) / rows.length).toFixed(1)
      return { type: t, avg }
    })
  }, [incidents])

  // Loss summary
  const totalLoss = incidents.reduce((s, r) => s + Number(r.estimated_loss || 0), 0)
  const theftLoss = incidents.filter(r => r.type === 'Theft/Shoplifting' || r.type === 'Suspected Employee Theft').reduce((s, r) => s + Number(r.estimated_loss || 0), 0)
  const regLoss   = incidents.filter(r => r.type === 'Register Discrepancy').reduce((s, r) => s + Number(r.estimated_loss || 0), 0)

  // High-risk: repeat locations (3+)
  const locCounts = {}
  incidents.forEach(r => { locCounts[r.location] = (locCounts[r.location] || 0) + 1 })
  const repeatLocs = Object.entries(locCounts).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1])

  // Repeat employees
  const empCounts = {}
  incidents.forEach(r => (r.employees_involved || []).forEach(e => { empCounts[e] = (empCounts[e] || 0) + 1 }))
  const repeatEmps = Object.entries(empCounts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])

  function exportCSV() {
    const cols = ['Incident #', 'Date', 'Location', 'Type', 'Severity', 'Status', 'Summary', 'Est. Loss', 'Police', 'Days Open']
    const rows = incidents.map(r => [
      r.incident_number, r.date, r.location, r.type, r.severity, r.status,
      `"${(r.summary || '').replace(/"/g, '""')}"`,
      r.estimated_loss || 0, r.police_called ? 'Yes' : 'No', daysOpen(r.date),
    ])
    const csv = [cols.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `incidents-report-${todayStr()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const sectionHead = (title) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, marginTop: 20, paddingBottom: 6, borderBottom: '1px solid var(--t-line)' }}>{title}</div>
  )

  const tableHead = (cols) => (
    <thead><tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
      {cols.map(c => <th key={c} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c}</th>)}
    </tr></thead>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Reports &amp; Analytics</div>
        <button onClick={exportCSV} style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>Export CSV</button>
      </div>

      {sectionHead('Monthly Summary — Last 12 Months')}
      <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          {tableHead(['Month', 'Total', 'Open', 'Resolved'])}
          <tbody>
            {monthly.map((m, i) => (
              <tr key={m.key} style={{ borderBottom: i < monthly.length - 1 ? '1px solid var(--t-line)' : 'none', background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{m.label}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{m.total}</td>
                <td style={{ padding: '8px 12px', color: m.open > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{m.open}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-success)' }}>{m.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sectionHead('By Type — Breakdown')}
      <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          {tableHead(['Type', 'Count', '% of Total', 'Avg Resolution (days)'])}
          <tbody>
            {byType.map((row, i) => {
              const avg = avgByType.find(a => a.type === row.type)?.avg
              return (
                <tr key={row.type} style={{ borderBottom: i < byType.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{row.type}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: row.count > 0 ? 'var(--t-text)' : 'var(--t-text-faint)' }}>{row.count}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ height: 6, width: `${row.pct * 2}px`, maxWidth: 80, background: 'var(--t-accent)', opacity: 0.6 }} />
                      {row.pct}%
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)' }}>{avg || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {sectionHead('By Location — Breakdown')}
      <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          {tableHead(['Location', 'Total', 'Open', 'Avg Days Open'])}
          <tbody>
            {byLoc.map((row, i) => (
              <tr key={row.loc} style={{ borderBottom: i < byLoc.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{row.loc}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{row.total}</td>
                <td style={{ padding: '8px 12px', color: row.open > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: row.open > 0 ? 700 : 400 }}>{row.open}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)' }}>{row.avg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sectionHead('Loss Summary')}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          ['Total Estimated Loss', `$${totalLoss.toFixed(2)}`, 'var(--t-danger)'],
          ['Theft / Shoplifting', `$${theftLoss.toFixed(2)}`, 'var(--t-warn)'],
          ['Register Discrepancies', `$${regLoss.toFixed(2)}`, 'var(--t-warn)'],
          ['Property Damage', `$${incidents.filter(r => r.type === 'Property Damage').reduce((s, r) => s + Number(r.estimated_loss || 0), 0).toFixed(2)}`, 'var(--t-text)'],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 20px', minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {sectionHead('High-Risk Patterns')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>Repeat Locations (3+ incidents)</div>
          {repeatLocs.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>None identified</div>
            : repeatLocs.map(([loc, count]) => (
              <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{loc}</span>
                <span className="badge red">{count} incidents</span>
              </div>
            ))
          }
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>Repeat Employees (2+ incidents)</div>
          {repeatEmps.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--t-text-faint)' }}>None identified</div>
            : repeatEmps.map(([emp, count]) => (
              <div key={emp} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{emp}</span>
                <span className="badge amber">{count} incidents</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function Incidents() {
  const { locationIds, locations } = useScope()
  const { session } = useAuth()

  const roleName = session?.person?.role_name || ''
  const isHR = isHRRole(roleName)

  /* ── state ───────────────────────────────────────────────── */
  const [tab, setTab] = useState('all')      // 'all' | 'file' | 'investigation' | 'reports'
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [employees, setEmployees] = useState([])

  const actorName = session?.person?.full_name || session?.person?.display_name || 'Staff'

  /* ── filters ──────────────────────────────────────────────── */
  const [filterLoc,      setFilterLoc]      = useState('All')
  const [filterType,     setFilterType]     = useState('All')
  const [filterSeverity, setFilterSeverity] = useState('All')
  const [filterStatus,   setFilterStatus]   = useState('All')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')

  /* ── detail panel ─────────────────────────────────────────── */
  const [detail, setDetail] = useState(null)

  /* ── load employees (real roster; honest empty on failure) ── */
  useEffect(() => {
    if (!locationIds.length) { setEmployees([]); return }
    sb.rpc('get_roster', { p_node_ids: locationIds })
      .then(({ data }) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
  }, [locationIds.join(',')])

  /* ── load incidents (real RPC only; no mock fallback) ─────── */
  const loadIncidents = useCallback(async () => {
    if (!locationIds.length) { setIncidents([]); setLoading(false); setLoadError(null); return [] }
    setLoading(true); setLoadError(null)
    try {
      const { data, error } = await sb.rpc('get_incidents_full', { p_node_ids: locationIds })
      if (error) { setLoadError(error.message || 'Could not load incidents.'); setIncidents([]); return [] }
      const list = Array.isArray(data) ? data : []
      setIncidents(list)
      return list
    } catch (e) {
      setLoadError((e && e.message) || 'Could not load incidents.')
      setIncidents([])
      return []
    } finally {
      setLoading(false)
    }
  }, [locationIds.join(',')])

  useEffect(() => { loadIncidents() }, [loadIncidents])

  // Refresh from the server and keep an open detail panel in sync.
  async function refreshAfterWrite(incidentId) {
    const list = await loadIncidents()
    const target = incidentId || detail?.id
    if (target) {
      const upd = list.find(r => r.id === target)
      if (upd && detail?.id === target) setDetail(upd)
    }
    return list
  }

  /* ── handle actions from child components ─────────────────── */
  async function handleAction(action, incidentId, payload, note) {
    if (action === 'status') {
      const { error } = await sb.rpc('update_incident_full', {
        p_incident_id: incidentId, p_status: payload, p_note: note || null, p_actor: actorName,
      })
      if (error) {
        window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Status not saved — ' + (error.message || 'try again') + '.', type: 'error' } }))
        return
      }
      await refreshAfterWrite(incidentId)
    } else if (action === 'notes') {
      const { error } = await sb.rpc('update_incident_full', {
        p_incident_id: incidentId, p_notes: payload?.notes ?? '', p_actor: actorName,
      })
      if (error) {
        window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Notes not saved — ' + (error.message || 'try again') + '.', type: 'error' } }))
        return
      }
      await refreshAfterWrite(incidentId)
    } else if (action === 'escalate') {
      const { error } = await sb.rpc('update_incident_full', {
        p_incident_id: incidentId, p_escalate: true, p_actor: actorName,
      })
      if (error) {
        window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Escalation not saved — ' + (error.message || 'try again') + '.', type: 'error' } }))
        return
      }
      await refreshAfterWrite(incidentId)
    } else if (action === 'checklist') {
      const { error } = await sb.rpc('incident_set_checklist', {
        p_incident_id: incidentId, p_checklist: payload || {},
      })
      if (error) {
        window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Checklist not saved — ' + (error.message || 'try again') + '.', type: 'error' } }))
        return
      }
      await refreshAfterWrite(incidentId)
    } else if (action === 'refresh') {
      await refreshAfterWrite(incidentId)
    } else if (action === 'report') {
      const inc = incidents.find(r => r.id === incidentId)
      if (!inc) return
      const text = `INCIDENT REPORT\n${inc.incident_number} — ${inc.type}\nDate: ${inc.date} | Location: ${inc.location} | Severity: ${inc.severity}\nStatus: ${STATUS_LABEL[inc.status]}\n\nSummary:\n${inc.summary}\n\nImmediate Action:\n${inc.immediate_action}\n\nInvestigation Notes:\n${inc.investigation_notes || 'None'}`
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${inc.incident_number}-report.txt`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  /* ── submit new incident (real write, then reload) ────────── */
  async function submitIncident(form) {
    const nodeId = locations.find(l => l.name === form.location)?.id || locationIds[0] || null
    if (!nodeId) return { error: 'No location is available for your access.' }
    try {
      const { error } = await sb.rpc('create_incident_full', {
        p_node_id:            nodeId,
        p_type:               form.type,
        p_severity:           form.severity,
        p_incident_date:      form.date || null,
        p_occurred_time:      form.time || null,
        p_description:        form.description,
        p_reported_by:        session?.person?.id || null,
        p_reporter_name:      actorName,
        p_employees_involved: form.employees_involved || [],
        p_witnesses:          form.witnesses || null,
        p_customer_involved:  !!form.customer_involved,
        p_customer_name:      form.customer_name || null,
        p_customer_contact:   form.customer_contact || null,
        p_police_called:      !!form.police_called,
        p_police_report_num:  form.police_report_num || null,
        p_estimated_loss:     Number(form.estimated_loss || 0),
        p_immediate_action:   form.immediate_action || null,
        p_follow_up:          !!form.follow_up,
        p_notify_hr:          !!form.notify_hr,
      })
      if (error) return { error: error.message }
    } catch (e) { return { error: (e && e.message) || 'Could not save incident.' } }
    await loadIncidents()
    return { error: null }
  }

  /* ── filtered list ────────────────────────────────────────── */
  const filtered = useMemo(() => {
    return incidents.filter(r => {
      if (filterLoc !== 'All' && r.location !== filterLoc) return false
      if (filterType !== 'All' && r.type !== filterType) return false
      if (filterSeverity !== 'All' && r.severity !== filterSeverity) return false
      if (filterStatus !== 'All' && r.status !== filterStatus) return false
      if (filterDateFrom && r.date < filterDateFrom) return false
      if (filterDateTo && r.date > filterDateTo + 'T23:59:59') return false
      if (filterEmployee) {
        const emp = filterEmployee.toLowerCase()
        const empMatch = (r.employees_involved || []).some(e => e.toLowerCase().includes(emp)) ||
          (r.reported_by || '').toLowerCase().includes(emp)
        if (!empMatch) return false
      }
      return true
    })
  }, [incidents, filterLoc, filterType, filterSeverity, filterStatus, filterDateFrom, filterDateTo, filterEmployee])

  const openCount = incidents.filter(r => r.status === 'open').length
  const inReviewCount = incidents.filter(r => r.status === 'in-review').length

  /* Real location names — from the caller's scope, else distinct from data. */
  const locationNames = useMemo(() => {
    const fromScope = (locations || []).map(l => l.name).filter(Boolean)
    if (fromScope.length) return fromScope
    return [...new Set(incidents.map(r => r.location).filter(Boolean))].sort()
  }, [locations, incidents])

  const TABS = [
    { id: 'all',           label: 'All Incidents',  badge: openCount > 0 ? openCount : null },
    { id: 'file',          label: 'File Incident',   badge: null },
    { id: 'investigation', label: 'Investigation',   badge: inReviewCount > 0 ? inReviewCount : null, hrOnly: true },
    { id: 'reports',       label: 'Reports',         badge: null },
  ]

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── Page header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>Incident Management</div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', fontWeight: 500 }}>
            Loss prevention, safety, HR violations &amp; investigations{locationNames.length ? ` — ${locationNames.length} location${locationNames.length === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isHR && (
            <button onClick={() => setTab('file')} style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
              + File Incident
            </button>
          )}
        </div>
      </div>

      {/* ── Load error (honest, no silent fallback) ───────────── */}
      {loadError && !loading && (
        <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          Could not load incidents — {loadError}
        </div>
      )}

      {/* ── KPI Panel ─────────────────────────────────────────── */}
      {loading
        ? <div className="loader" style={{ marginBottom: 20 }}>Loading incidents…</div>
        : <KpiPanel incidents={incidents} locationNames={locationNames} />
      }

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.filter(t => !t.hrOnly || isHR).map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge != null && (
              <span className="badge amber" style={{ marginLeft: 6 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: ALL INCIDENTS
      ══════════════════════════════════════════════════════ */}
      {tab === 'all' && (
        <>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={selStyle}>
              <option value="All">All Locations</option>
              {locationNames.map(l => <option key={l}>{l}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
              <option value="All">All Types</option>
              {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selStyle}>
              <option value="All">All Severity</option>
              {SEVERITY_LEVELS.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
              <option value="All">All Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              style={{ ...selStyle, minWidth: 120 }}
              title="From date"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              style={{ ...selStyle, minWidth: 120 }}
              title="To date"
            />
            <input
              type="text"
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              placeholder="Employee name…"
              style={{ ...selStyle, minWidth: 160 }}
            />
            {(filterLoc !== 'All' || filterType !== 'All' || filterSeverity !== 'All' || filterStatus !== 'All' || filterDateFrom || filterDateTo || filterEmployee) && (
              <button
                onClick={() => { setFilterLoc('All'); setFilterType('All'); setFilterSeverity('All'); setFilterStatus('All'); setFilterDateFrom(''); setFilterDateTo(''); setFilterEmployee('') }}
                style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-text-faint)' }}>{filtered.length} of {incidents.length}</div>
          </div>

          {/* Cards */}
          {filtered.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🔍</div>
              <div style={{ fontWeight: 700 }}>No incidents found</div>
              <div style={{ fontSize: 13, color: 'var(--t-text-faint)', marginTop: 6 }}>Adjust filters or file a new incident.</div>
            </div>
          )}

          {filtered.map(row => {
            const days = daysOpen(row.date)
            const isCriticalOld = row.severity === 'Critical' && row.status === 'open' && days > 7
            return (
              <div
                key={row.id}
                style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)', marginBottom: 8, borderLeft: `3px solid ${SEVERITY_BORDER[row.severity] || 'var(--t-line)'}`, cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => setDetail(row)}
              >
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    {/* Left info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-accent)', letterSpacing: '0.04em' }}>{row.incident_number}</span>
                        <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{fmtDT(row.date)}</span>
                        <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>·</span>
                        <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{row.location}</span>
                        <span className={SEVERITY_BADGE[row.severity] || 'badge'}>{row.severity}</span>
                        <span className={STATUS_BADGE[row.status] || 'badge'}>{STATUS_LABEL[row.status]}</span>
                        {isCriticalOld && <span className="badge red">⚠ {days}d open</span>}
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: 13, marginBottom: 3 }}>{row.type}</div>
                      <div style={{ fontSize: 12, color: 'var(--t-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>{row.summary}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4, display: 'flex', gap: 12 }}>
                        <span>Reported by: {row.reported_by}</span>
                        {row.police_called && <span style={{ color: 'var(--t-warn)' }}>🚔 Police report</span>}
                        {row.estimated_loss > 0 && <span style={{ color: 'var(--t-danger)' }}>$ {Number(row.estimated_loss).toFixed(2)} loss</span>}
                      </div>
                    </div>

                    {/* Right actions */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 12, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>{days}d open</div>
                      <button
                        onClick={() => setDetail(row)}
                        style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
                      >
                        View
                      </button>
                      {isHR && row.status === 'open' && (
                        <button
                          onClick={() => handleAction('status', row.id, 'in-review')}
                          style={{ background: 'rgba(255,149,0,0.1)', border: '1px solid var(--t-warn)', color: 'var(--t-warn)', padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Review
                        </button>
                      )}
                      {isHR && row.status === 'in-review' && (
                        <button
                          onClick={() => handleAction('status', row.id, 'resolved')}
                          style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: FILE INCIDENT
      ══════════════════════════════════════════════════════ */}
      {tab === 'file' && (
        <FileIncidentTab
          locations={locations}
          employees={employees}
          onSubmit={submitIncident}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: INVESTIGATION (HR only)
      ══════════════════════════════════════════════════════ */}
      {tab === 'investigation' && isHR && (
        <InvestigationTab incidents={incidents} onAction={handleAction} />
      )}
      {tab === 'investigation' && !isHR && (
        <div className="empty-state">HR access required for investigations.</div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: REPORTS
      ══════════════════════════════════════════════════════ */}
      {tab === 'reports' && (
        <ReportsTab incidents={incidents} locationNames={locationNames} />
      )}

      {/* ══════════════════════════════════════════════════════
          DETAIL SIDE PANEL
      ══════════════════════════════════════════════════════ */}
      {detail && (
        <DetailPanel
          incident={detail}
          isHR={isHR}
          onClose={() => setDetail(null)}
          onAction={handleAction}
        />
      )}
    </>
  )
}
