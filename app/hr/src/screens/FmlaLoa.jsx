import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { companyName } from '../lib/config.js'

const LEAVE_TYPES = ['FMLA', 'Personal LOA', 'Military', 'Bereavement', 'CT Paid Leave']
const LEAVE_STATUSES = ['ACTIVE', 'RETURNED', 'OVERDUE', 'UPCOMING']

function AccessDeniedOrDisabled() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        padding: 24,
        textAlign: 'center',
        color: 'var(--t-text-muted)',
        fontSize: 13,
      }}>
        FMLA / Leave of Absence tracking is currently disabled. Enable it in Settings → Feature Flags.
      </div>
    </div>
  )
}

export default function FmlaLoa() {
  const fmlaEnabled = useFeatureFlag('fmla_loa')
  const config = useConfig()
  const { session } = useAuth()
  const person = session?.person
  const { locationIds } = useScope() || {}
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r))

  const threshold = config?.fmla_threshold_hours || 1250
  const companyShort = config?.company_short || companyName()

  const [activeTab, setActiveTab] = useState('leaves')
  const [leaves, setLeaves] = useState([])
  const [pending, setPending] = useState([])
  const [reviewHistory, setReviewHistory] = useState([])
  const [roster, setRoster] = useState([])          // real employees + live eligibility
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingLeaveId, setEditingLeaveId] = useState(null)

  // New leave form state
  const [formEmployee, setFormEmployee] = useState('')
  const [formType, setFormType] = useState('FMLA')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formIntermittent, setFormIntermittent] = useState(false)
  const [formNotes, setFormNotes] = useState('')

  // Inline edit state
  const [editFields, setEditFields] = useState({})

  const nodeIds = (locationIds && locationIds.length) ? locationIds : null

  // ── Live wiring: leave cases, pending/history requests, and roster+eligibility
  // all come from real RPCs (leave_cases / leave_requests / people+time_punches).
  // Honest empty states — nothing is fabricated.
  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const [casesRes, reqRes, eligRes] = await Promise.all([
        sb.rpc('fmla_cases', { p_node_ids: nodeIds }),
        sb.rpc('fmla_requests', { p_node_ids: nodeIds }),
        sb.rpc('fmla_eligibility', { p_node_ids: nodeIds, p_threshold: threshold }),
      ])
      if (casesRes.error) throw casesRes.error
      if (reqRes.error) throw reqRes.error
      if (eligRes.error) throw eligRes.error
      setLeaves(Array.isArray(casesRes.data) ? casesRes.data : [])
      const reqs = reqRes.data || {}
      setPending(Array.isArray(reqs.pending) ? reqs.pending : [])
      setReviewHistory(Array.isArray(reqs.history) ? reqs.history : [])
      setRoster(Array.isArray(eligRes.data) ? eligRes.data : [])
    } catch (e) {
      setLoadErr(e?.message || 'Failed to load leave data.')
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(nodeIds), threshold])

  useEffect(() => { loadAll() }, [loadAll])

  if (!fmlaEnabled) return <AccessDeniedOrDisabled />
  if (!isManager) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
          padding: 24,
          textAlign: 'center',
          color: 'var(--t-text-muted)',
          fontSize: 13,
        }}>
          Access Restricted — HR Manager and above only.
        </div>
      </div>
    )
  }

  const activeCount = leaves.filter(l => l.status === 'ACTIVE').length
  const eligibleCount = roster.filter(e => e.eligible).length
  const intermittentCount = leaves.filter(l => l.intermittent && l.status === 'ACTIVE').length
  const avgDuration = (() => {
    const spans = leaves.map(l => {
      const start = l.startDate ? new Date(l.startDate) : null
      const end = (l.actualReturn || l.expectedReturn) ? new Date(l.actualReturn || l.expectedReturn) : null
      if (!start || !end || isNaN(start) || isNaN(end)) return null
      return Math.round((end - start) / 86400000)
    }).filter(d => d != null && d >= 0)
    if (!spans.length) return '—'
    return Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) + ' days'
  })()

  async function handleSubmitLeave() {
    if (!formEmployee || !formStart || !formEnd) return
    const emp = roster.find(e => String(e.id) === String(formEmployee))
    if (!emp) return
    const { error } = await sb.rpc('fmla_create_case', {
      p_person_id: emp.id,
      p_leave_type: formType,
      p_start: formStart,
      p_expected_return: formEnd,
      p_intermittent: formIntermittent,
      p_notes: formNotes || null,
      p_threshold: threshold,
      p_created_by: person?.id || null,
    })
    if (error) { window.alert('Could not create leave request: ' + error.message); return }
    setShowForm(false)
    setFormEmployee('')
    setFormType('FMLA')
    setFormStart('')
    setFormEnd('')
    setFormIntermittent(false)
    setFormNotes('')
    await loadAll()
  }

  async function handleReturnToWork(id) {
    if (!window.confirm('Mark this employee as returned to work? This cannot be undone.')) return
    const { error } = await sb.rpc('fmla_return_to_work', { p_case_id: id })
    if (error) { window.alert('Could not update: ' + error.message); return }
    await loadAll()
  }

  async function handleExtend(id) {
    const ext = prompt('Enter new expected return date (YYYY-MM-DD):')
    if (!ext) return
    const { error } = await sb.rpc('fmla_extend', { p_case_id: id, p_expected_return: ext })
    if (error) { window.alert('Could not extend: ' + error.message); return }
    await loadAll()
  }

  function startEdit(leave) {
    setEditingLeaveId(leave.id)
    setEditFields({
      status: leave.status,
      expectedReturn: leave.expectedReturn || '',
      actualReturn: leave.actualReturn || '',
      medicalClearance: leave.medicalClearance,
      notes: leave.notes || '',
    })
  }

  async function saveEdit(id) {
    const { error } = await sb.rpc('fmla_update_case', {
      p_case_id: id,
      p_status: editFields.status || null,
      p_expected_return: editFields.expectedReturn || null,
      p_actual_return: editFields.actualReturn || null,
      p_medical_clearance: !!editFields.medicalClearance,
      p_notes: editFields.notes ?? null,
    })
    if (error) { window.alert('Could not save: ' + error.message); return }
    setEditingLeaveId(null)
    setEditFields({})
    await loadAll()
  }

  async function reviewRequest(req, action, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    const { error } = await sb.rpc('fmla_review_request', {
      p_request_id: req.id,
      p_action: action,
      p_reviewer_id: person?.id || null,
      p_threshold: threshold,
    })
    if (error) { window.alert('Could not record decision: ' + error.message); return }
    await loadAll()
  }

  const handleApprove = (req) => reviewRequest(req, 'APPROVE')
  const handleMoreInfo = (req) => reviewRequest(req, 'MORE_INFO')
  const handleDeny = (req) => reviewRequest(req, 'DENY', `Deny leave request for ${req.employeeName}? This cannot be undone.`)

  function statusBadgeClass(status) {
    if (status === 'ACTIVE') return 'badge blue'
    if (status === 'RETURNED') return 'badge green'
    if (status === 'OVERDUE') return 'badge red'
    if (status === 'UPCOMING') return 'badge amber'
    return 'badge blue'
  }

  const tabStyle = (tab) => ({
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: activeTab === tab ? 'var(--t-accent)' : 'var(--t-text-muted)',
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    outline: 'none',
  })

  return (
    <div style={{ padding: 24 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            FMLA / LEAVE OF ABSENCE TRACKER
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>
            {companyShort} · HR Compliance
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: 'rgba(0,229,255,0.12)',
            border: '1px solid var(--t-accent)',
            color: 'var(--t-accent)',
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            borderRadius: 0,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          {showForm ? '✕ Cancel' : '+ New Leave Request'}
        </button>
      </div>

      {loadErr && (
        <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 12, borderRadius: 0 }}>
          {loadErr}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Active Leaves', value: activeCount },
          { label: 'FMLA Eligible Employees', value: eligibleCount },
          { label: 'Intermittent FMLA', value: intermittentCount },
          { label: 'Avg Leave Duration', value: avgDuration },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 18px', minWidth: 110, borderRadius: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Inline new leave form */}
      {showForm && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 20, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            New Leave Request
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 600 }}>Employee</div>
              <select
                value={formEmployee}
                onChange={e => setFormEmployee(e.target.value)}
                style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 13, width: '100%', outline: 'none', borderRadius: 0 }}
              >
                <option value="">— Select employee —</option>
                {roster.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.location})</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 600 }}>Leave Type</div>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 13, width: '100%', outline: 'none', borderRadius: 0 }}
              >
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 600 }}>Start Date</div>
              <input
                type="date"
                value={formStart}
                onChange={e => setFormStart(e.target.value)}
                style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', borderRadius: 0 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 600 }}>Expected Return Date</div>
              <input
                type="date"
                value={formEnd}
                onChange={e => setFormEnd(e.target.value)}
                style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', borderRadius: 0 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formIntermittent}
                onChange={e => setFormIntermittent(e.target.checked)}
                style={{ accentColor: 'var(--t-accent)' }}
              />
              Intermittent Leave
            </label>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 600 }}>Notes</div>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={3}
              placeholder="Leave reason, medical details, etc."
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 0 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSubmitLeave}
              style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}
            >
              Submit Request
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
        <button style={tabStyle('leaves')} onClick={() => setActiveTab('leaves')}>Active Leaves</button>
        <button style={tabStyle('review')} onClick={() => setActiveTab('review')}>
          Request Review {pending.length > 0 && <span style={{ background: 'var(--t-accent)', color: '#000', borderRadius: 0, padding: '1px 5px', fontSize: 10, fontWeight: 800, marginLeft: 4 }}>{pending.length}</span>}
        </button>
        <button style={tabStyle('eligibility')} onClick={() => setActiveTab('eligibility')}>Eligibility</button>
      </div>

      {/* ── TAB 1: Active Leaves ── */}
      {activeTab === 'leaves' && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 16, borderRadius: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Leave Records
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Employee', 'Location', 'Type', 'Start Date', 'Exp. Return', 'Actual Return', 'Status', 'FMLA Eligible', 'Intermittent', 'Med. Clearance', 'Notes', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', borderBottom: '1px solid var(--t-line)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map(leave => (
                  editingLeaveId === leave.id ? (
                    <tr key={leave.id} style={{ background: 'var(--t-surface-2)' }}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 700 }}>{leave.employeeName}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.location}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.type}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.startDate}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        <input
                          type="date"
                          value={editFields.expectedReturn}
                          onChange={e => setEditFields(f => ({ ...f, expectedReturn: e.target.value }))}
                          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '4px 6px', fontSize: 12, outline: 'none', width: 120, borderRadius: 0 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        <input
                          type="date"
                          value={editFields.actualReturn}
                          onChange={e => setEditFields(f => ({ ...f, actualReturn: e.target.value }))}
                          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '4px 6px', fontSize: 12, outline: 'none', width: 120, borderRadius: 0 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <select
                          value={editFields.status}
                          onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}
                          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '4px 6px', fontSize: 12, outline: 'none', borderRadius: 0 }}
                        >
                          {LEAVE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <span className={leave.fmlaEligible ? 'badge green' : 'badge amber'}>{leave.fmlaEligible ? 'YES' : 'NO'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.intermittent ? 'Yes' : '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editFields.medicalClearance}
                            onChange={e => setEditFields(f => ({ ...f, medicalClearance: e.target.checked }))}
                            style={{ accentColor: 'var(--t-accent)' }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Cleared</span>
                        </label>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <input
                          type="text"
                          value={editFields.notes}
                          onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '4px 6px', fontSize: 12, outline: 'none', width: 140, borderRadius: 0 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(leave.id)} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Save</button>
                          <button onClick={() => setEditingLeaveId(null)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={leave.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 700 }}>{leave.employeeName}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.location}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.type}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.startDate}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.expectedReturn}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.actualReturn || '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <span className={statusBadgeClass(leave.status)}>{leave.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <span className={leave.fmlaEligible ? 'badge green' : 'badge amber'}>{leave.fmlaEligible ? 'YES' : 'NO'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{leave.intermittent ? 'Yes' : '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <span className={leave.medicalClearance ? 'badge green' : 'badge amber'}>{leave.medicalClearance ? 'CLEARED' : 'PENDING'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={leave.notes}>{leave.notes || '—'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(leave)} style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Edit</button>
                          {leave.status !== 'RETURNED' && (
                            <button onClick={() => handleReturnToWork(leave.id)} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Return</button>
                          )}
                          <button onClick={() => handleExtend(leave.id)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Extend</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12 }}>
                      {loading ? 'Loading…' : loadErr ? loadErr : 'No leave records.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: Request Review ── */}
      {activeTab === 'review' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Pending Requests
          </div>
          {pending.length === 0 && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 16, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12 }}>
              No pending leave requests.
            </div>
          )}
          {pending.map(req => (
            <div key={req.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 18, marginBottom: 14, borderRadius: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{req.employeeName}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{req.location} · {req.type}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {req.docsUploaded && <span className="badge green">Docs: Uploaded</span>}
                  <span className="badge amber">PENDING</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>Requested: </span>
                {req.requestedStart} → {req.requestedEnd}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 14, lineHeight: 1.5 }}>
                {req.reason.length > 80 ? req.reason.slice(0, 80) + '...' : req.reason}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleApprove(req)} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid var(--t-success)', color: 'var(--t-success)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Approve</button>
                <button onClick={() => handleMoreInfo(req)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Request More Info</button>
                <button onClick={() => handleDeny(req)} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Deny</button>
              </div>
            </div>
          ))}

          {reviewHistory.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
                Review History
              </div>
              {reviewHistory.map((h, i) => (
                <div key={i} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px', marginBottom: 8, opacity: 0.7, borderRadius: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{h.employeeName}</span>
                      <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 8 }}>{h.type} · {h.requestedStart} → {h.requestedEnd}</span>
                    </div>
                    <span className={h.status === 'APPROVED' ? 'badge green' : h.status === 'DENIED' ? 'badge red' : 'badge amber'}>
                      {h.status === 'MORE_INFO' ? 'MORE INFO REQ.' : h.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: Eligibility ── */}
      {activeTab === 'eligibility' && (
        <div>
          <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--t-text-muted)', borderRadius: 0 }}>
            <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>FMLA Eligibility Threshold: </span>
            {threshold.toLocaleString()} hours
            <span style={{ marginLeft: 8, color: 'var(--t-text-muted)' }}>(configurable in Settings → White Label)</span>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 16, borderRadius: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 12 }}>
              Employee Eligibility Status
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Employee', 'Location', 'YTD Hours', 'FMLA Eligible', 'Hours Remaining', 'CT Paid Leave Accrued'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', borderBottom: '1px solid var(--t-line)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((emp) => {
                    const eligible = !!emp.eligible
                    const hoursRemaining = eligible ? '—' : (Number(emp.hoursRemaining) || 0).toLocaleString() + ' hrs'
                    const ctAccrued = (Number(emp.ctAccrued) || 0).toFixed(1) + ' hrs'
                    return (
                      <tr key={emp.id}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 700 }}>{emp.name}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{emp.location}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 600 }}>{(Number(emp.ytdHours) || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                          {eligible
                            ? <span className="badge green">ELIGIBLE</span>
                            : <span className="badge amber">NOT YET</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: eligible ? 'var(--t-text-muted)' : 'var(--t-text)' }}>
                          {hoursRemaining}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{ctAccrued}</td>
                      </tr>
                    )
                  })}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12 }}>
                        {loading ? 'Loading…' : 'No employees in scope.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
