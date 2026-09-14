import { useState, useEffect, useMemo, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

/* ── helpers ──────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const today = () => new Date().toISOString().slice(0, 10)
const isHR = (r) => ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some((x) => (r || '').toLowerCase().includes(x))

function daysAgo(dateStr) {
  if (!dateStr) return '—'
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  return d === 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`
}

function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

const initials = (n) =>
  !n ? '?' : n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()

function Stars({ rating, size = 13 }) {
  const n = Math.round(rating || 0)
  return (
    <span style={{ color: 'var(--t-warn)', fontSize: size, letterSpacing: 1 }}>
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  )
}

/* ── pipeline model (matches applicant_records.stage codes in the DB) ── */
const PIPELINE_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired']
const ALL_STAGES = [...PIPELINE_STAGES, 'rejected']
const STAGE_LABEL = {
  applied: 'Applied', screening: 'Screening', interview: 'Interview',
  offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
}
const stageLabel = (s) => STAGE_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
const nextStageOf = (s) => PIPELINE_STAGES[PIPELINE_STAGES.indexOf(s) + 1] || null

/* ── form option catalogs (choices, not data) ─────────────────── */
const DEPARTMENTS = ['Floor Associate', 'Register', 'Key Holder', 'Manager']
const EMP_TYPES = ['Full-time', 'Part-time', 'Seasonal']
const INTERVIEW_FORMATS = ['In-Person', 'Phone', 'Video']
const BENEFITS = ['PTO', 'Health Insurance', 'Employee Discount', 'Flexible Schedule', '401(k)']
const REJECTION_REASONS = ['Overqualified', 'Underqualified', 'No Show', 'Withdrew', 'Position Filled', 'Culture Fit', 'Availability']

const STAGE_COLOR = {
  applied:   'var(--t-text-muted)',
  screening: 'var(--t-warn)',
  interview: '#a78bfa',
  offer:     'var(--t-accent)',
  hired:     'var(--t-success)',
  rejected:  'var(--t-danger)',
}

const STAGE_BADGE = {
  applied:   'badge blue',
  screening: 'badge amber',
  interview: 'badge purple',
  offer:     'badge blue',
  hired:     'badge green',
  rejected:  'badge red',
}

/* ── background-check model (applicant_records.bg_check_status) ── */
const BG_LABEL = { not_requested: 'Not Requested', pending: 'Pending', cleared: 'Cleared', failed: 'Failed' }
const bgLabel = (s) => BG_LABEL[s] || 'Not Requested'
const bgOf = (a) => a?.bg_check_status || 'not_requested'

/* ── CSV export (real data, real download) ────────────────────── */
function downloadCSV(rows, cols, filename) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const text = [
    cols.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => cols.map((c) => esc(c.value(r))).join(',')),
  ].join('\n')
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ── KPI computation (all from live rows) ─────────────────────── */
function buildKPIs(applicants, postings, interviews, locations) {
  const now = new Date()
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const active = applicants.filter((a) => a.stage !== 'rejected')
  const hired = applicants.filter((a) => a.stage === 'hired')
  const offers = applicants.filter((a) => ['offer', 'hired'].includes(a.stage))
  const reachedScreen = active.filter((a) => ['screening', 'interview', 'offer', 'hired'].includes(a.stage))
  const reachedInterview = applicants.filter((a) => ['interview', 'offer', 'hired'].includes(a.stage))
  const newThisWeek = applicants.filter((a) => a.applied_at && new Date(a.applied_at) >= weekAgo)
  const hiredMonth = hired.filter((a) => a.hired_date && new Date(a.hired_date) >= monthStart)

  const interviewRate = active.length > 0 ? Math.round((reachedScreen.length / active.length) * 100) : null
  const offerRate = reachedInterview.length > 0 ? Math.round((offers.length / reachedInterview.length) * 100) : null
  const acceptRate = offers.length > 0 ? Math.round((hired.length / offers.length) * 100) : null

  const hireTimes = hired
    .filter((a) => a.applied_at && a.hired_date)
    .map((a) => daysBetween(a.applied_at, a.hired_date))
    .filter((d) => d !== null && d >= 0)
  const avgDaysToHire = hireTimes.length > 0
    ? Math.round(hireTimes.reduce((s, x) => s + x, 0) / hireTimes.length)
    : null

  const openPostings = postings.filter((p) => (p.status || 'open') === 'open')
  const openTimes = openPostings
    .map((p) => daysBetween(p.created_at, today()))
    .filter((d) => d !== null && d >= 0)
  const avgDaysOpen = openTimes.length > 0
    ? Math.round(openTimes.reduce((s, x) => s + x, 0) / openTimes.length)
    : null

  const byLoc = locations.map((loc) => ({
    name: loc.name,
    openRoles: openPostings.filter((p) => p.node_id === loc.id).reduce((s, p) => s + (p.openings || 1), 0),
    totalApplicants: applicants.filter((a) => a.node_id === loc.id).length,
    interviews: applicants.filter((a) => a.node_id === loc.id && ['screening', 'interview'].includes(a.stage)).length,
    offers: applicants.filter((a) => a.node_id === loc.id && ['offer', 'hired'].includes(a.stage)).length,
    hired: applicants.filter((a) => a.node_id === loc.id && a.stage === 'hired').length,
  }))

  return {
    openPositions: openPostings.reduce((s, p) => s + (p.openings || 1), 0),
    openPostingCount: openPostings.length,
    totalApplicants: applicants.length,
    newThisWeek: newThisWeek.length,
    interviewsScheduled: interviews.filter((iv) => iv.status === 'scheduled').length,
    offersMade: offers.length,
    hiredThisMonth: hiredMonth.length,
    interviewRate, offerRate, acceptRate,
    avgDaysToHire, avgDaysOpen,
    byLoc,
  }
}

/* ── shared input style ───────────────────────────────────────── */
const INP = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '7px 10px',
  fontSize: 13,
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}
const SEL = { ...INP }
const TXT = { ...INP, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }

/* ── section label ────────────────────────────────────────────── */
function SL({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  )
}

/* ── KPI tile ─────────────────────────────────────────────────── */
function KTile({ label, value, color, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to drill into records' : undefined}
      style={{
      background: 'var(--t-surface)',
      border: '1px solid var(--t-line)',
      padding: '12px 14px',
      flex: '1 1 140px',
      ...(onClick ? { cursor: 'pointer' } : {}),
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── applicant side panel (all real record data + live event log) ── */
function ApplicantPanel({ applicant, onClose, onAdvance, onReject, onSaveNote, canAct, bgCheckGate, bgStatus }) {
  const [note, setNote] = useState(applicant.notes || '')
  const [noteSaving, setNoteSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejReason, setRejReason] = useState(REJECTION_REASONS[0])
  const [events, setEvents] = useState(null) // null = loading

  useEffect(() => {
    let alive = true
    sb.rpc('get_ats_events', { p_applicant_id: applicant.id }).then(({ data, error }) => {
      if (!alive) return
      setEvents(!error && Array.isArray(data) ? data : [])
    })
    return () => { alive = false }
  }, [applicant.id])

  const nextStage = nextStageOf(applicant.stage)
  const canAdvance = canAct && !['hired', 'rejected'].includes(applicant.stage) && nextStage
  const canReject = canAct && !['hired', 'rejected'].includes(applicant.stage)
  const advanceBlocked = bgCheckGate && applicant.stage === 'interview' && bgStatus !== 'cleared'

  async function doAdvance() {
    if (!nextStage) return
    setAdvancing(true)
    await onAdvance(applicant, nextStage, note)
    setAdvancing(false)
  }

  async function doReject() {
    setRejecting(true)
    await onReject(applicant, rejReason)
    setRejecting(false)
  }

  async function doSaveNote() {
    setNoteSaving(true)
    await onSaveNote(applicant, note)
    setNoteSaving(false)
  }

  // Real timeline: the applied_at fact from the record + only recorded events.
  const timeline = [
    { id: 'applied', event: 'Applied', note: `Source: ${applicant.source || '—'}`, created_at: applicant.applied_at },
    ...(events || []),
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 480, maxWidth: '96vw', height: '100vh', overflowY: 'auto',
        background: 'var(--t-surface)', borderLeft: '1px solid var(--t-line)',
        padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 0, background: 'var(--t-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: '#000', flexShrink: 0,
          }}>{initials(applicant.full_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-text)', lineHeight: 1.2 }}>{applicant.full_name}</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 2 }}>{applicant.position} — {applicant.location}</div>
          </div>
          <span className={STAGE_BADGE[applicant.stage] || 'badge blue'}>{stageLabel(applicant.stage)}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-text-muted)', fontSize: 18, padding: '4px 8px' }}>✕</button>
        </div>

        {/* contact */}
        <div>
          <SL>Contact</SL>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13 }}>
            {[
              ['Email', applicant.email],
              ['Phone', applicant.phone],
              ['Applied', fmt(applicant.applied_at)],
              ['Source', applicant.source],
              ['Rating', null],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{k}</div>
                {k === 'Rating'
                  ? (applicant.rating ? <Stars rating={applicant.rating} /> : <span style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>Not rated yet</span>)
                  : <div style={{ color: 'var(--t-text)' }}>{v || '—'}</div>
                }
              </div>
            ))}
          </div>
        </div>

        {/* resume */}
        <div>
          <SL>Resume</SL>
          <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '10px 12px', fontSize: 12, lineHeight: 1.6 }}>
            {applicant.resume_url
              ? <a href={applicant.resume_url} target="_blank" rel="noreferrer" style={{ color: 'var(--t-accent)', fontWeight: 600 }}>Open resume ↗</a>
              : <span style={{ color: 'var(--t-text-faint)' }}>No resume on file.</span>}
          </div>
        </div>

        {/* notes */}
        <div>
          <SL>Internal Notes</SL>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="Add interview notes, follow-up items…"
            style={{ ...TXT, fontSize: 12 }} />
          {canAct && (
            <button onClick={doSaveNote} disabled={noteSaving}
              style={{ marginTop: 6, background: 'none', border: '1px solid var(--t-accent)', borderRadius: 4, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', cursor: 'pointer' }}>
              {noteSaving ? 'Saving…' : 'Save Note'}
            </button>
          )}
        </div>

        {/* status history — real recorded events only */}
        <div>
          <SL>Status Timeline</SL>
          {events === null ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Loading history…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((h, i) => (
                <div key={h.id || i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--t-accent)', marginTop: 4 }} />
                    {i < timeline.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--t-line)', minHeight: 20 }} />}
                  </div>
                  <div style={{ paddingBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{h.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                      {fmt(h.created_at)}{h.note ? ` — ${h.note}` : ''}{h.actor ? ` (${h.actor})` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>
                  No pipeline actions recorded yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* actions */}
        {canAct && !['hired', 'rejected'].includes(applicant.stage) && (
          <div>
            <SL>Actions</SL>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canAdvance && (
                <button
                  onClick={doAdvance}
                  disabled={advancing || advanceBlocked}
                  title={advanceBlocked ? 'Background check must be cleared before advancing to offer' : undefined}
                  style={{ background: advanceBlocked ? 'var(--t-surface-2)' : 'var(--t-success)', color: advanceBlocked ? 'var(--t-text-muted)' : '#000', border: advanceBlocked ? '1px solid var(--t-line)' : 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: advanceBlocked ? 'not-allowed' : 'pointer', opacity: advanceBlocked ? 0.4 : 1 }}>
                  {advancing ? '…' : `Advance → ${stageLabel(nextStage)}`}
                </button>
              )}
              {canReject && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={rejReason} onChange={(e) => setRejReason(e.target.value)} style={{ ...SEL, width: 'auto' }}>
                    {REJECTION_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <button onClick={doReject} disabled={rejecting}
                    style={{ background: 'var(--t-danger)', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {rejecting ? '…' : 'Reject'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {applicant.stage === 'hired' && (
          <div style={{ background: 'rgba(29,233,182,.08)', border: '1px solid var(--t-success)', borderRadius: 4, padding: '12px 14px', fontSize: 13, color: 'var(--t-success)', fontWeight: 600 }}>
            ✓ Hired{applicant.hired_date ? ` ${fmt(applicant.hired_date)}` : ''} — no further pipeline action needed.
          </div>
        )}
        {applicant.stage === 'rejected' && (
          <div style={{ background: 'rgba(255,77,77,.08)', border: '1px solid var(--t-danger)', borderRadius: 4, padding: '12px 14px', fontSize: 13, color: 'var(--t-danger)', fontWeight: 600 }}>
            ✗ Rejected — {applicant.rejection_reason || 'reason not recorded'}.
          </div>
        )}
      </div>
    </div>
  )
}

/* ── MAIN COMPONENT ───────────────────────────────────────────── */
export default function ATS() {
  const { session } = useAuth()
  const { locationIds, locations, activeLocation, nodes } = useScope()
  const role = session?.person?.role_name || ''
  const actor = session?.person?.full_name || null
  const canAct = isHR(role)
  const bgCheckGate = useFeatureFlag('bg_check_gate')

  const locMap = useMemo(
    () => Object.fromEntries((nodes || []).map((n) => [n.id, n.name])),
    [nodes]
  )

  const [applicants, setApplicants] = useState([])
  const [postings, setPostings] = useState([])
  const [interviews, setInterviews] = useState([])
  const [interviewers, setInterviewers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [tab, setTab] = useState('pipeline')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)
  const [drill, setDrill] = useState(null)

  /* filters — pipeline / applications */
  const [filterPos, setFilterPos] = useState('')
  const [filterLoc, setFilterLoc] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  /* post job form */
  const [jobForm, setJobForm] = useState({
    title: '', nodeIds: [], dept: DEPARTMENTS[0], type: EMP_TYPES[0],
    pay_min: '', pay_max: '', hours: '', openings: 1, description: '', requirements: '',
    benefits: [], start_date: '', deadline: '', post_to: 'all',
  })
  const [jobSaving, setJobSaving] = useState(false)
  const [jobSaved, setJobSaved] = useState(false)

  /* interview scheduling */
  const [ivForm, setIvForm] = useState({ applicant_id: '', date: today(), time: '10:00 AM', interviewer_id: '', format: 'In-Person', notes: '' })
  const [ivRating, setIvRating] = useState(null) // { id, applicant_name, culture, experience, availability, presentation, sales, rec, notes }
  const [ivSaving, setIvSaving] = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── load — everything from the live backend, honest on failure ── */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setLoadError(null)
    const [appsRes, postRes, ivRes, rosterRes] = await Promise.allSettled([
      sb.rpc('get_job_applications', { p_node_ids: locationIds }),
      sb.rpc('get_job_postings', { p_node_ids: locationIds }),
      sb.rpc('get_ats_interviews', { p_node_ids: locationIds }),
      sb.rpc('get_roster', { p_node_ids: locationIds }),
    ])

    if (appsRes.status === 'fulfilled' && !appsRes.value.error) {
      setApplicants((appsRes.value.data || []).map((a) => ({
        ...a,
        location: locMap[a.node_id] || '—',
      })))
    } else {
      setApplicants([])
      setLoadError(appsRes.status === 'fulfilled' ? (appsRes.value.error?.message || 'Failed to load applications') : String(appsRes.reason))
    }

    setPostings(postRes.status === 'fulfilled' && !postRes.value.error ? (postRes.value.data || []) : [])
    setInterviews(ivRes.status === 'fulfilled' && !ivRes.value.error ? (ivRes.value.data || []) : [])
    setInterviewers(
      rosterRes.status === 'fulfilled' && !rosterRes.value.error
        ? (rosterRes.value.data || []).filter((p) => p.is_active !== false)
        : []
    )
    setLoading(false)
  }, [locationIds.join(','), locMap])

  useEffect(() => { load() }, [load])

  /* ── drill-down columns + helper ──────────────────────────── */
  const APPLICANT_COLS = [
    { key: 'full_name', label: 'Applicant', value: (r) => r.full_name },
    { key: 'position',  label: 'Position',  value: (r) => r.position },
    { key: 'location',  label: 'Location',  value: (r) => r.location },
    { key: 'stage',     label: 'Stage',     value: (r) => stageLabel(r.stage) },
    { key: 'applied',   label: 'Applied',   value: (r) => fmt(r.applied_at), sortKey: (r) => r.applied_at || '' },
    { key: 'source',    label: 'Source',    value: (r) => r.source || '—' },
    { key: 'rating',    label: 'Rating',    align: 'center', value: (r) => `${r.rating || 0}★`, sortKey: (r) => r.rating || 0 },
  ]
  const POSITION_COLS = [
    { key: 'title',    label: 'Position',  value: (r) => r.title },
    { key: 'location', label: 'Location',  value: (r) => r.location || '—' },
    { key: 'dept',     label: 'Department', value: (r) => r.dept || '—' },
    { key: 'type',     label: 'Type',      value: (r) => r.employment_type || '—' },
    { key: 'openings', label: 'Needed',    align: 'center', value: (r) => r.openings || 1, sortKey: (r) => r.openings || 1 },
    { key: 'pay',      label: 'Pay Range', value: (r) => (r.pay_min || r.pay_max) ? `$${r.pay_min ?? '—'}–$${r.pay_max ?? '—'}/hr` : '—', sortKey: (r) => r.pay_min || 0 },
    { key: 'posted',   label: 'Posted',    value: (r) => fmt(r.created_at), sortKey: (r) => r.created_at || '' },
    { key: 'deadline', label: 'Deadline',  value: (r) => fmt(r.deadline), sortKey: (r) => r.deadline || '' },
  ]
  const INTERVIEW_COLS = [
    { key: 'applicant_name', label: 'Applicant',   value: (r) => r.applicant_name },
    { key: 'position',       label: 'Position',    value: (r) => r.position || '—' },
    { key: 'location',       label: 'Location',    value: (r) => r.location || '—' },
    { key: 'interviewer',    label: 'Interviewer', value: (r) => r.interviewer_name || '—' },
    { key: 'date',           label: 'Date',        value: (r) => r.scheduled_date || '—', sortKey: (r) => r.scheduled_date || '' },
    { key: 'time',           label: 'Time',        value: (r) => r.scheduled_time || '—' },
    { key: 'format',         label: 'Format',      value: (r) => r.format || '—' },
    { key: 'status',         label: 'Status',      value: (r) => r.status },
  ]
  function openDrill({ title, subtitle, rows, columns = APPLICANT_COLS, accent = 'var(--t-accent)', summary }) {
    setDrill({ title, subtitle, rows, columns, accent, summary })
  }

  /* ── applicant writes (real RPC, then refresh from server) ── */
  async function advanceApplicant(a, newStage, note = null) {
    const { error } = await sb.rpc('advance_application', {
      p_application_id: a.id, p_stage: newStage, p_notes: note || null, p_actor: actor,
    })
    if (error) {
      showToast(`Not saved — ${error.message}`, 'error')
      return false
    }
    setSelected(null)
    showToast(`Moved to ${stageLabel(newStage)}`)
    await load(true)
    return true
  }

  async function rejectApplicant(a, reason) {
    const { error } = await sb.rpc('advance_application', {
      p_application_id: a.id, p_stage: 'rejected', p_notes: reason || null, p_actor: actor,
    })
    if (error) {
      showToast(`Not saved — ${error.message}`, 'error')
      return false
    }
    setSelected(null)
    showToast('Applicant rejected', 'warn')
    await load(true)
    return true
  }

  async function saveApplicantNote(a, note) {
    const { error } = await sb.rpc('update_applicant_notes', { p_applicant_id: a.id, p_notes: note })
    if (error) {
      showToast(`Note not saved — ${error.message}`, 'error')
      return false
    }
    showToast('Note saved')
    await load(true)
    return true
  }

  async function setBgStatus(a, status) {
    const { error } = await sb.rpc('set_bg_check_status', { p_applicant_id: a.id, p_status: status, p_actor: actor })
    if (error) {
      showToast(`Not saved — ${error.message}`, 'error')
      return false
    }
    showToast(`Background check ${bgLabel(status).toLowerCase()} — ${a.full_name}`)
    await load(true)
    return true
  }

  /* ── KPIs ─────────────────────────────────────────────────── */
  const kpi = useMemo(
    () => buildKPIs(applicants, postings, interviews, locations),
    [applicants, postings, interviews, locations]
  )

  /* ── kanban groups ────────────────────────────────────────── */
  const byStage = useMemo(() => {
    const map = {}
    PIPELINE_STAGES.forEach((s) => { map[s] = [] })
    applicants.filter((a) => a.stage !== 'rejected').forEach((a) => {
      const s = a.stage && map[a.stage] !== undefined ? a.stage : 'applied'
      map[s].push(a)
    })
    return map
  }, [applicants])

  /* ── filtered list ────────────────────────────────────────── */
  const filtered = useMemo(() => {
    return applicants.filter((a) => {
      if (filterPos && a.position !== filterPos) return false
      if (filterLoc && a.location !== filterLoc) return false
      if (filterStage && a.stage !== filterStage) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!a.full_name?.toLowerCase().includes(q) &&
            !a.email?.toLowerCase().includes(q) &&
            !a.position?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [applicants, filterPos, filterLoc, filterStage, filterSearch])

  /* ── post job ─────────────────────────────────────────────── */
  function setJF(k, v) { setJobForm((f) => ({ ...f, [k]: v })) }
  function toggleBenefit(b) {
    setJobForm((f) => ({
      ...f,
      benefits: f.benefits.includes(b) ? f.benefits.filter((x) => x !== b) : [...f.benefits, b],
    }))
  }
  function toggleJobLoc(id) {
    setJobForm((f) => ({
      ...f,
      nodeIds: f.nodeIds.includes(id) ? f.nodeIds.filter((x) => x !== id) : [...f.nodeIds, id],
    }))
  }

  async function submitJob(e) {
    e.preventDefault()
    if (!jobForm.title || jobForm.nodeIds.length === 0) return
    setJobSaving(true)
    let failed = null
    for (const nid of jobForm.nodeIds) {
      const { error } = await sb.rpc('create_job_posting', {
        p_node_id: nid,
        p_title: jobForm.title,
        p_description: jobForm.description || null,
        p_pay_min: parseFloat(jobForm.pay_min) || null,
        p_pay_max: parseFloat(jobForm.pay_max) || null,
        p_requirements: jobForm.requirements || null,
        p_dept: jobForm.dept || null,
        p_employment_type: jobForm.type || null,
        p_hours: parseInt(jobForm.hours) || null,
        p_openings: parseInt(jobForm.openings) || 1,
        p_deadline: jobForm.deadline || null,
        p_start_date: jobForm.start_date || null,
        p_benefits: jobForm.benefits,
        p_post_to: jobForm.post_to || null,
      })
      if (error) { failed = error; break }
    }
    setJobSaving(false)
    if (failed) {
      showToast(`Posting not saved — ${failed.message}`, 'error')
      return
    }
    setJobSaved(true)
    showToast('Job posting created!')
    setTimeout(() => setJobSaved(false), 4000)
    setJobForm({ title: '', nodeIds: [], dept: DEPARTMENTS[0], type: EMP_TYPES[0], pay_min: '', pay_max: '', hours: '', openings: 1, description: '', requirements: '', benefits: [], start_date: '', deadline: '', post_to: 'all' })
    await load(true)
  }

  /* ── schedule interview ───────────────────────────────────── */
  async function submitInterview(e) {
    e.preventDefault()
    if (!ivForm.applicant_id || !ivForm.date) return
    setIvSaving(true)
    const iver = interviewers.find((p) => p.id === ivForm.interviewer_id)
    const { error } = await sb.rpc('schedule_ats_interview', {
      p_applicant_id: ivForm.applicant_id,
      p_date: ivForm.date,
      p_time: ivForm.time || null,
      p_interviewer_id: iver?.id || null,
      p_interviewer_name: iver?.full_name || null,
      p_format: ivForm.format,
      p_notes: ivForm.notes || null,
      p_created_by: actor,
    })
    setIvSaving(false)
    if (error) {
      showToast(`Interview not saved — ${error.message}`, 'error')
      return
    }
    showToast('Interview scheduled!')
    setIvForm({ applicant_id: '', date: today(), time: '10:00 AM', interviewer_id: '', format: 'In-Person', notes: '' })
    await load(true)
  }

  /* ── save interview evaluation ────────────────────────────── */
  async function saveRating() {
    if (!ivRating) return
    const ratings = {
      culture: ivRating.culture, experience: ivRating.experience,
      availability: ivRating.availability, presentation: ivRating.presentation,
      sales: ivRating.sales,
    }
    const { error } = await sb.rpc('save_ats_interview_result', {
      p_interview_id: ivRating.id,
      p_result: ivRating.rec,
      p_ratings: ratings,
      p_notes: ivRating.notes || null,
      p_actor: actor,
    })
    if (error) {
      showToast(`Evaluation not saved — ${error.message}`, 'error')
      return
    }
    showToast('Interview evaluation saved!')
    setIvRating(null)
    await load(true)
  }

  /* ── report helpers (all from live rows) ──────────────────── */
  const rejReasonDist = useMemo(() => {
    const map = {}
    applicants.filter((a) => a.stage === 'rejected' && a.rejection_reason).forEach((a) => {
      map[a.rejection_reason] = (map[a.rejection_reason] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [applicants])

  const sourceData = useMemo(() => {
    const map = {}
    applicants.forEach((a) => { map[a.source || 'Other'] = (map[a.source || 'Other'] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [applicants])

  const interviewerStats = useMemo(() => {
    const byName = {}
    interviews.forEach((iv) => {
      const name = iv.interviewer_name || '—'
      if (!byName[name]) byName[name] = { name, total: 0, completed: 0, hired: 0 }
      byName[name].total += 1
      if (iv.status === 'completed') {
        byName[name].completed += 1
        const app = applicants.find((a) => a.id === iv.applicant_id)
        if (app?.stage === 'hired') byName[name].hired += 1
      }
    })
    return Object.values(byName).filter((m) => m.total > 0)
  }, [interviews, applicants])

  // monthly time-to-hire trend from real hires (applied_at → hired_date)
  const hireTrend = useMemo(() => {
    const buckets = {}
    applicants
      .filter((a) => a.stage === 'hired' && a.applied_at && a.hired_date)
      .forEach((a) => {
        const d = daysBetween(a.applied_at, a.hired_date)
        if (d === null || d < 0) return
        const m = String(a.hired_date).slice(0, 7) // YYYY-MM
        if (!buckets[m]) buckets[m] = { sum: 0, n: 0 }
        buckets[m].sum += d; buckets[m].n += 1
      })
    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([m, v]) => ({
        month: new Date(m + '-02').toLocaleDateString('en-US', { month: 'short' }),
        days: Math.round(v.sum / v.n),
      }))
  }, [applicants])

  if (loading) return <div className="loader">Loading ATS…</div>

  const TABS = [
    { key: 'pipeline',     label: 'Pipeline' },
    { key: 'applications', label: 'Applications' },
    { key: 'post',         label: 'Post Job' },
    { key: 'interviews',   label: 'Interviews' },
    { key: 'reports',      label: 'Reports' },
  ]

  const uniquePositions = [...new Set(applicants.map((a) => a.position).filter(Boolean))].sort()
  const locNames = locations.map((l) => l.name)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── TOAST ────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'warn' ? 'var(--t-warn)' : toast.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
          color: '#000', padding: '10px 18px', borderRadius: 6, fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 16px rgba(0,0,0,.4)',
        }}>{toast.msg}</div>
      )}

      {/* ── HEADER ───────────────────────────────────────────── */}
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 24px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 4 }}>HR Platform</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>Applicant Tracking System</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
          {activeLocation ? activeLocation.name : `All locations (${locations.length})`}
        </div>
      </div>

      {/* ── LOAD ERROR (honest, not fabricated) ──────────────── */}
      {loadError && (
        <div style={{ background: 'rgba(255,77,77,.08)', borderBottom: '1px solid var(--t-danger)', padding: '10px 24px', fontSize: 12, color: 'var(--t-danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
          Could not load applications — {loadError}
          <button onClick={() => load()} style={{ background: 'none', border: '1px solid var(--t-danger)', borderRadius: 4, padding: '3px 10px', fontSize: 11, color: 'var(--t-danger)', cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {/* ── KPI PANEL ────────────────────────────────────────── */}
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Row 1: Pipeline Volume */}
        <div>
          <SL>Pipeline Volume</SL>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <KTile label="Open Positions"     value={kpi.openPositions}     color="var(--t-accent)"   sub={`${kpi.openPostingCount} posting${kpi.openPostingCount !== 1 ? 's' : ''}`}
              onClick={() => openDrill({ title: 'Open Positions', subtitle: `${kpi.openPostingCount} postings · ${kpi.openPositions} roles needed`, rows: postings.filter(p => (p.status || 'open') === 'open'), columns: POSITION_COLS })} />
            <KTile label="Total Applicants"   value={kpi.totalApplicants}   sub="all stages incl. rejected"
              onClick={() => openDrill({ title: 'Total Applicants', subtitle: 'All applicants across every stage', rows: applicants })} />
            <KTile label="New This Week"      value={kpi.newThisWeek}       color="var(--t-warn)"     sub="last 7 days"
              onClick={() => { const w = new Date(); w.setDate(w.getDate() - 7); openDrill({ title: 'New This Week', subtitle: 'Applied in the last 7 days', accent: 'var(--t-warn)', rows: applicants.filter(a => a.applied_at && new Date(a.applied_at) >= w) }) }} />
            <KTile label="Interviews Sched."  value={kpi.interviewsScheduled} color="#a78bfa"         sub="upcoming"
              onClick={() => openDrill({ title: 'Interviews Scheduled', subtitle: 'Upcoming interviews', accent: '#a78bfa', rows: interviews.filter(iv => iv.status === 'scheduled'), columns: INTERVIEW_COLS })} />
            <KTile label="Offers Made"        value={kpi.offersMade}        color="var(--t-success)"  sub="offer + hired stages"
              onClick={() => openDrill({ title: 'Offers Made', subtitle: 'Applicants at offer or hired stage', accent: 'var(--t-success)', rows: applicants.filter(a => ['offer', 'hired'].includes(a.stage)) })} />
            <KTile label="Hired This Month"   value={kpi.hiredThisMonth}    color="var(--t-success)"  sub="current month"
              onClick={() => { const ms = new Date(new Date().getFullYear(), new Date().getMonth(), 1); openDrill({ title: 'Hired This Month', subtitle: 'Hires with a hire date in the current month', accent: 'var(--t-success)', rows: applicants.filter(a => a.stage === 'hired' && a.hired_date && new Date(a.hired_date) >= ms) }) }} />
          </div>
        </div>

        {/* Row 2: Funnel Metrics */}
        <div>
          <SL>Funnel Metrics</SL>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <KTile label="Applicant → Screening" value={kpi.interviewRate === null ? '—' : `${kpi.interviewRate}%`} sub="reached screening+"
              onClick={() => openDrill({ title: 'Reached Screening Stage', subtitle: 'Active applicants at screening or beyond', rows: applicants.filter(a => ['screening', 'interview', 'offer', 'hired'].includes(a.stage)) })} />
            <KTile label="Interview → Offer"     value={kpi.offerRate === null ? '—' : `${kpi.offerRate}%`}     sub="conversion rate"
              onClick={() => openDrill({ title: 'Interview Stage & Beyond', subtitle: 'Applicants who reached the interview stage', rows: applicants.filter(a => ['interview', 'offer', 'hired'].includes(a.stage)) })} />
            <KTile label="Offer Acceptance"       value={kpi.acceptRate === null ? '—' : `${kpi.acceptRate}%`}    color="var(--t-success)" sub="offers accepted"
              onClick={() => openDrill({ title: 'Offers & Acceptances', subtitle: 'Offer + hired stage applicants', accent: 'var(--t-success)', rows: applicants.filter(a => ['offer', 'hired'].includes(a.stage)) })} />
            <KTile label="Avg Days to Hire"       value={kpi.avgDaysToHire === null ? '—' : `${kpi.avgDaysToHire}d`} sub="applied → hired"
              onClick={() => openDrill({ title: 'Time to Hire', subtitle: kpi.avgDaysToHire === null ? 'No completed hires with dates yet' : `Avg ${kpi.avgDaysToHire}d from applied to hired`, accent: 'var(--t-success)', rows: applicants.filter(a => a.stage === 'hired' && a.hired_date), columns: [...APPLICANT_COLS, { key: 'days', label: 'Days to Hire', align: 'center', value: (r) => { const d = daysBetween(r.applied_at, r.hired_date); return d == null ? '—' : `${d}d` }, sortKey: (r) => daysBetween(r.applied_at, r.hired_date) ?? 0 }] })} />
            <KTile label="Avg Days Open"          value={kpi.avgDaysOpen === null ? '—' : `${kpi.avgDaysOpen}d`}   color="var(--t-warn)" sub="per open position"
              onClick={() => openDrill({ title: 'Days Position Open', subtitle: kpi.avgDaysOpen === null ? 'No open postings yet' : `Avg ${kpi.avgDaysOpen}d per open position`, accent: 'var(--t-warn)', rows: postings.filter(p => (p.status || 'open') === 'open'), columns: [...POSITION_COLS, { key: 'daysopen', label: 'Days Open', align: 'center', value: (r) => { const d = daysBetween(r.created_at, today()); return d == null ? '—' : `${d}d` }, sortKey: (r) => daysBetween(r.created_at, today()) ?? 0 }] })} />
          </div>
        </div>

        {/* Row 3: By Location */}
        <div>
          <SL>By Location</SL>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)' }}>
                  {['Location','Open Roles','Total Applicants','Interviews','Offers','Hired'].map((h) => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpi.byLoc.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '10px 12px', color: 'var(--t-text-faint)' }}>No locations in scope.</td></tr>
                )}
                {kpi.byLoc.map((row) => (
                  <tr key={row.name} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{row.name}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-accent)', fontWeight: 700 }}>{row.openRoles}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-text)' }}>{row.totalApplicants}</td>
                    <td style={{ padding: '7px 12px', color: '#a78bfa' }}>{row.interviews}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-success)' }}>{row.offers}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-success)', fontWeight: 700 }}>{row.hired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── BG CHECK KPI ROW (gate-gated, from real record status) ── */}
      {bgCheckGate && (() => {
        const pending      = applicants.filter((a) => bgOf(a) === 'pending').length
        const cleared      = applicants.filter((a) => bgOf(a) === 'cleared').length
        const failed       = applicants.filter((a) => bgOf(a) === 'failed').length
        const notRequested = applicants.filter((a) => a.stage !== 'rejected' && bgOf(a) === 'not_requested').length
        const BG_COL = { key: 'bg', label: 'BG Status', value: (r) => bgLabel(bgOf(r)) }
        return (
          <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '12px 24px' }}>
            <SL>Background Check Status</SL>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <KTile label="BG Checks Pending"      value={pending}      color="var(--t-warn)"
                onClick={() => openDrill({ title: 'Background Checks — Pending', subtitle: 'Awaiting results', accent: 'var(--t-warn)', rows: applicants.filter(a => bgOf(a) === 'pending'), columns: [...APPLICANT_COLS, BG_COL] })} />
              <KTile label="Cleared"                value={cleared}      color="var(--t-success)"
                onClick={() => openDrill({ title: 'Background Checks — Cleared', subtitle: 'Passed background check', accent: 'var(--t-success)', rows: applicants.filter(a => bgOf(a) === 'cleared'), columns: [...APPLICANT_COLS, BG_COL] })} />
              <KTile label="Failed"                 value={failed}       color="var(--t-danger)"
                onClick={() => openDrill({ title: 'Background Checks — Failed', subtitle: 'Did not pass background check', accent: 'var(--t-danger)', rows: applicants.filter(a => bgOf(a) === 'failed'), columns: [...APPLICANT_COLS, BG_COL] })} />
              <KTile label="Not Requested (Active)" value={notRequested} sub="active candidates"
                onClick={() => openDrill({ title: 'Background Checks — Not Requested', subtitle: 'Active candidates with no BG check requested', rows: applicants.filter(a => a.stage !== 'rejected' && bgOf(a) === 'not_requested'), columns: [...APPLICANT_COLS, BG_COL] })} />
            </div>
          </div>
        )
      })()}

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '0 24px', display: 'flex', gap: 0 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
            padding: '12px 18px', fontWeight: tab === t.key ? 700 : 500, fontSize: 13, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ══════════════════════════════════════════════════════
            TAB 1 — PIPELINE (Kanban)
        ══════════════════════════════════════════════════════ */}
        {tab === 'pipeline' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>
                Kanban Pipeline — {applicants.filter(a => a.stage !== 'rejected').length} active applicants
              </div>
              <span className="badge red">{applicants.filter(a => a.stage === 'rejected').length} rejected</span>
            </div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
              {PIPELINE_STAGES.map((stage) => {
                const cards = byStage[stage] || []
                return (
                  <div key={stage} style={{
                    flex: '0 0 210px', background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                    borderTop: `3px solid ${STAGE_COLOR[stage]}`, borderRadius: 4, minHeight: 200,
                  }}>
                    {/* col header */}
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{stageLabel(stage)}</div>
                      <div style={{
                        background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                        borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                        color: STAGE_COLOR[stage],
                      }}>{cards.length}</div>
                    </div>
                    {/* cards */}
                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
                      {cards.length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--t-text-faint)', textAlign: 'center', padding: '20px 8px' }}>Empty</div>
                      )}
                      {cards.map((a) => (
                        <div key={a.id} onClick={() => setSelected(a)} style={{
                          background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                          borderRadius: 4, padding: '10px 10px', cursor: 'pointer',
                          transition: 'border-color .15s',
                        }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--t-accent)'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--t-line)'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 0, background: 'var(--t-accent)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 800, fontSize: 10, color: '#000', flexShrink: 0,
                            }}>{initials(a.full_name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name}</div>
                              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.position}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <Stars rating={a.rating} size={11} />
                            <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{daysAgo(a.applied_at)}</span>
                          </div>
                          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 9, color: 'var(--t-text-faint)', background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 2, padding: '1px 5px' }}>{a.location}</span>
                            <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>{a.source}</span>
                          </div>
                          {canAct && a.stage !== 'hired' && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                              {nextStageOf(a.stage) && (() => {
                                const nextStageKanban = nextStageOf(a.stage)
                                const kanbanBlocked = bgCheckGate && a.stage === 'interview' && bgOf(a) !== 'cleared'
                                return (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (!kanbanBlocked) advanceApplicant(a, nextStageKanban) }}
                                    disabled={kanbanBlocked}
                                    title={kanbanBlocked ? 'Background check must be cleared before advancing to offer' : undefined}
                                    style={{ flex: 1, fontSize: 10, padding: '3px 0', background: kanbanBlocked ? 'var(--t-surface)' : 'var(--t-success)', color: kanbanBlocked ? 'var(--t-text-muted)' : '#000', border: kanbanBlocked ? '1px solid var(--t-line)' : 'none', borderRadius: 3, fontWeight: 700, cursor: kanbanBlocked ? 'not-allowed' : 'pointer', opacity: kanbanBlocked ? 0.4 : 1 }}>
                                    Advance
                                  </button>
                                )
                              })()}
                              <button onClick={(e) => { e.stopPropagation(); rejectApplicant(a, null) }}
                                style={{ flex: 1, fontSize: 10, padding: '3px 0', background: 'none', color: 'var(--t-danger)', border: '1px solid var(--t-danger)', borderRadius: 3, fontWeight: 700, cursor: 'pointer' }}>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 2 — APPLICATIONS (full table + filters)
        ══════════════════════════════════════════════════════ */}
        {tab === 'applications' && (
          <div>
            {/* filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search name, email, position…"
                style={{ ...INP, width: 240 }} />
              <select value={filterPos} onChange={(e) => setFilterPos(e.target.value)} style={{ ...SEL, width: 180 }}>
                <option value="">All Positions</option>
                {uniquePositions.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select value={filterLoc} onChange={(e) => setFilterLoc(e.target.value)} style={{ ...SEL, width: 150 }}>
                <option value="">All Locations</option>
                {locNames.map((l) => <option key={l}>{l}</option>)}
              </select>
              <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={{ ...SEL, width: 150 }}>
                <option value="">All Stages</option>
                {ALL_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </select>
              <button onClick={() => { setFilterSearch(''); setFilterPos(''); setFilterLoc(''); setFilterStage('') }}
                style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 4, padding: '7px 12px', color: 'var(--t-text-muted)', cursor: 'pointer', fontSize: 12 }}>
                Clear
              </button>
              <span style={{ fontSize: 12, color: 'var(--t-text-faint)', marginLeft: 4 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* export (real CSV of the filtered rows) */}
            {canAct && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => {
                    if (filtered.length === 0) { showToast('Nothing to export', 'warn'); return }
                    downloadCSV(filtered, APPLICANT_COLS, `ats-applicants-${today()}.csv`)
                    showToast(`Exported ${filtered.length} applicant${filtered.length !== 1 ? 's' : ''} to CSV`)
                  }}
                  style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 4, padding: '6px 14px', color: 'var(--t-text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Export CSV
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--t-text-faint)', padding: 40, fontSize: 14 }}>
                {applicants.length === 0 ? 'No applications on file for this scope yet.' : 'No applicants match your filters.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--t-surface-2)' }}>
                      {['Name','Position','Location','Applied','Status','Rating',
                         ...(bgCheckGate ? ['BG Check'] : []),
                         'Next Step','Actions'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => {
                      const next = nextStageOf(a.stage)
                      const bgStatus = bgOf(a)
                      const advanceBlocked = bgCheckGate && a.stage === 'interview' && bgStatus !== 'cleared'
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--t-line)', cursor: 'pointer' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--t-surface-2)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          onClick={() => setSelected(a)}>
                          <td style={{ padding: '9px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 26, height: 26, borderRadius: 0, background: 'var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9, color: '#000', flexShrink: 0 }}>{initials(a.full_name)}</div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{a.full_name}</div>
                                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{a.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--t-text)' }}>{a.position}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{a.location}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>{a.applied_at ? String(a.applied_at).slice(0, 10) : '—'}</td>
                          <td style={{ padding: '9px 12px' }}><span className={STAGE_BADGE[a.stage] || 'badge blue'}>{stageLabel(a.stage)}</span></td>
                          <td style={{ padding: '9px 12px' }}><Stars rating={a.rating} size={12} /></td>
                          {bgCheckGate && (
                            <td style={{ padding: '9px 12px' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span className={
                                  bgStatus === 'cleared' ? 'badge green'  :
                                  bgStatus === 'failed'  ? 'badge red'    :
                                  bgStatus === 'pending' ? 'badge amber'  :
                                  'badge blue'
                                } style={{ fontSize: 10 }}>{bgLabel(bgStatus)}</span>
                                {canAct && bgStatus === 'not_requested' && (
                                  <button onClick={() => setBgStatus(a, 'pending')}
                                    style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 0, padding: '2px 6px', fontSize: 10, color: 'var(--t-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Request</button>
                                )}
                                {canAct && bgStatus === 'pending' && (
                                  <div style={{ display: 'flex', gap: 3 }}>
                                    <button onClick={() => setBgStatus(a, 'cleared')}
                                      style={{ background: 'none', border: '1px solid var(--t-success)', borderRadius: 0, padding: '2px 6px', fontSize: 10, color: 'var(--t-success)', cursor: 'pointer' }}>Clear</button>
                                    <button onClick={() => {
                                      if (window.confirm(`Mark background check for ${a.full_name} as Failed?`)) setBgStatus(a, 'failed')
                                    }} style={{ background: 'none', border: '1px solid var(--t-danger)', borderRadius: 0, padding: '2px 6px', fontSize: 10, color: 'var(--t-danger)', cursor: 'pointer' }}>Fail</button>
                                  </div>
                                )}
                              </div>
                            </td>
                          )}
                          <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', fontSize: 11 }}>{a.stage === 'rejected' ? '—' : a.stage === 'hired' ? 'Hired' : (next ? stageLabel(next) : '—')}</td>
                          <td style={{ padding: '9px 12px' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => setSelected(a)}
                                style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 3, padding: '3px 8px', fontSize: 11, color: 'var(--t-text)', cursor: 'pointer' }}>View</button>
                              {canAct && !['hired', 'rejected'].includes(a.stage) && next && (
                                <button
                                  onClick={() => { if (!advanceBlocked) advanceApplicant(a, next) }}
                                  disabled={advanceBlocked}
                                  title={advanceBlocked ? 'Background check must be cleared before advancing to offer' : undefined}
                                  style={{ background: 'none', border: `1px solid ${advanceBlocked ? 'var(--t-line)' : 'var(--t-success)'}`, borderRadius: 3, padding: '3px 8px', fontSize: 11, color: advanceBlocked ? 'var(--t-text-muted)' : 'var(--t-success)', cursor: advanceBlocked ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: advanceBlocked ? 0.4 : 1 }}>→</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 3 — POST JOB
        ══════════════════════════════════════════════════════ */}
        {tab === 'post' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'flex-start' }}>
              {/* form */}
              <form onSubmit={submitJob} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <SL>Position Details</SL>
                  <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Position Title *</label>
                      <input value={jobForm.title} onChange={(e) => setJF('title', e.target.value)} required placeholder="e.g. Sales Associate" style={INP} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Location(s) * (select all that apply)</label>
                      {locations.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No locations available in your scope.</div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {locations.map((loc) => (
                            <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                              <input type="checkbox" checked={jobForm.nodeIds.includes(loc.id)} onChange={() => toggleJobLoc(loc.id)} />
                              {loc.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Department</label>
                        <select value={jobForm.dept} onChange={(e) => setJF('dept', e.target.value)} style={SEL}>
                          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Employment Type</label>
                        <select value={jobForm.type} onChange={(e) => setJF('type', e.target.value)} style={SEL}>
                          {EMP_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Pay Min ($/hr)</label>
                        <input type="number" value={jobForm.pay_min} onChange={(e) => setJF('pay_min', e.target.value)} placeholder="16.00" min="15" max="40" step="0.25" style={INP} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Pay Max ($/hr)</label>
                        <input type="number" value={jobForm.pay_max} onChange={(e) => setJF('pay_max', e.target.value)} placeholder="20.00" min="15" max="40" step="0.25" style={INP} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Est. Hours/Week</label>
                        <input type="number" value={jobForm.hours} onChange={(e) => setJF('hours', e.target.value)} placeholder="32" min="8" max="50" style={INP} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Openings (per location)</label>
                        <input type="number" value={jobForm.openings} onChange={(e) => setJF('openings', e.target.value)} min="1" max="20" style={INP} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Application Deadline</label>
                        <input type="date" value={jobForm.deadline} onChange={(e) => setJF('deadline', e.target.value)} style={INP} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Start Date</label>
                        <select value={jobForm.start_date} onChange={(e) => setJF('start_date', e.target.value)} style={SEL}>
                          <option value="">Immediate</option>
                          <option value="flexible">Flexible</option>
                          <option value="specific">Specific Date</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <SL>Job Description & Requirements</SL>
                  <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Job Description</label>
                      <textarea value={jobForm.description} onChange={(e) => setJF('description', e.target.value)} style={{ ...TXT, minHeight: 110 }}
                        placeholder="Describe the role, responsibilities, and what makes it a great fit…" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Requirements</label>
                      <textarea value={jobForm.requirements} onChange={(e) => setJF('requirements', e.target.value)} style={TXT}
                        placeholder="• Must be 18+ years of age&#10;• Reliable transportation&#10;• Weekend availability required" />
                    </div>
                  </div>
                </div>

                <div>
                  <SL>Benefits</SL>
                  <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {BENEFITS.map((b) => (
                      <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                        <input type="checkbox" checked={jobForm.benefits.includes(b)} onChange={() => toggleBenefit(b)} />
                        {b}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <SL>Distribution</SL>
                  <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '14px 18px' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Post to</label>
                    <select value={jobForm.post_to} onChange={(e) => setJF('post_to', e.target.value)} style={SEL}>
                      <option value="instore">In-Store Only</option>
                      <option value="website">Company Website</option>
                      <option value="indeed">Indeed</option>
                      <option value="all">All Channels</option>
                    </select>
                  </div>
                </div>

                <div>
                  <button type="submit" disabled={jobSaving || jobForm.nodeIds.length === 0}
                    style={{ background: 'var(--t-accent)', color: '#000', border: 'none', borderRadius: 4, padding: '11px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: (jobSaving || jobForm.nodeIds.length === 0) ? .5 : 1 }}>
                    {jobSaving ? 'Posting…' : 'Post Job'}
                  </button>
                  {jobSaved && <span style={{ marginLeft: 12, color: 'var(--t-success)', fontWeight: 700, fontSize: 13 }}>✓ Posted successfully</span>}
                </div>
              </form>

              {/* open positions sidebar — live postings */}
              <div>
                <SL>Currently Open Positions</SL>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {postings.filter((p) => (p.status || 'open') === 'open').length === 0 && (
                    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '12px 14px', fontSize: 12, color: 'var(--t-text-faint)' }}>
                      No open postings for this scope yet.
                    </div>
                  )}
                  {postings.filter((p) => (p.status || 'open') === 'open').map((p) => (
                    <div key={p.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 4 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>{p.location || '—'}{p.employment_type ? ` · ${p.employment_type}` : ''}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge blue">{p.openings || 1} needed</span>
                        {(p.pay_min || p.pay_max) && <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>${p.pay_min ?? '—'}–${p.pay_max ?? '—'}/hr</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 6 }}>
                        Posted {fmt(p.created_at)}{p.deadline ? ` · Deadline ${fmt(p.deadline)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 4 — INTERVIEWS
        ══════════════════════════════════════════════════════ */}
        {tab === 'interviews' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* interview table — live */}
            <div>
              <SL>Interviews</SL>
              {interviews.length === 0 ? (
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '18px 16px', fontSize: 12, color: 'var(--t-text-faint)' }}>
                  No interviews scheduled yet{canAct ? ' — use the form below to schedule one.' : '.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2)' }}>
                        {['Applicant','Position','Location','Interviewer','Date','Time','Format','Status','Result'].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {interviews.map((iv) => (
                        <tr key={iv.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--t-text)' }}>{iv.applicant_name}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{iv.position || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{iv.location || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{iv.interviewer_name || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--t-text)', fontFamily: 'monospace' }}>{iv.scheduled_date || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{iv.scheduled_time || '—'}</td>
                          <td style={{ padding: '8px 10px' }}><span className="badge blue">{iv.format || '—'}</span></td>
                          <td style={{ padding: '8px 10px' }}>
                            <span className={iv.status === 'completed' ? 'badge green' : 'badge amber'}>{iv.status === 'completed' ? 'Completed' : 'Scheduled'}</span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {iv.result
                              ? <span className="badge green">{iv.result}</span>
                              : canAct
                                ? <button onClick={() => setIvRating({ id: iv.id, applicant_name: iv.applicant_name, culture: 3, experience: 3, availability: 3, presentation: 3, sales: 3, rec: 'Advance', notes: '' })}
                                    style={{ background: 'none', border: '1px solid var(--t-accent)', borderRadius: 3, padding: '3px 8px', fontSize: 11, color: 'var(--t-accent)', cursor: 'pointer', fontWeight: 600 }}>Rate</button>
                                : <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>Pending</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* schedule interview form */}
            {canAct && (
              <div>
                <SL>Schedule Interview</SL>
                <form onSubmit={submitInterview} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Applicant *</label>
                    <select value={ivForm.applicant_id} onChange={(e) => setIvForm((f) => ({ ...f, applicant_id: e.target.value }))} required style={SEL}>
                      <option value="">— Select applicant —</option>
                      {applicants.filter((a) => !['hired', 'rejected'].includes(a.stage)).map((a) => (
                        <option key={a.id} value={a.id}>{a.full_name} — {a.position} ({a.location})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Date *</label>
                    <input type="date" value={ivForm.date} onChange={(e) => setIvForm((f) => ({ ...f, date: e.target.value }))} required style={INP} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Time</label>
                    <input type="text" value={ivForm.time} onChange={(e) => setIvForm((f) => ({ ...f, time: e.target.value }))} placeholder="10:00 AM" style={INP} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Interviewer</label>
                    <select value={ivForm.interviewer_id} onChange={(e) => setIvForm((f) => ({ ...f, interviewer_id: e.target.value }))} style={SEL}>
                      <option value="">— Select interviewer —</option>
                      {interviewers.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.role_name ? ` — ${m.role_name}` : ''}{m.node_name ? ` (${m.node_name})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Format</label>
                    <select value={ivForm.format} onChange={(e) => setIvForm((f) => ({ ...f, format: e.target.value }))} style={SEL}>
                      {INTERVIEW_FORMATS.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Notes</label>
                    <textarea value={ivForm.notes} onChange={(e) => setIvForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={TXT} placeholder="Location, parking instructions, what to bring…" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <button type="submit" disabled={ivSaving}
                      style={{ background: 'var(--t-accent)', color: '#000', border: 'none', borderRadius: 4, padding: '9px 20px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                      {ivSaving ? 'Saving…' : 'Schedule Interview'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 5 — REPORTS
        ══════════════════════════════════════════════════════ */}
        {tab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* funnel by position */}
            <div>
              <SL>Hiring Funnel by Position</SL>
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, overflow: 'hidden' }}>
                {uniquePositions.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--t-text-faint)' }}>No applications on file yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2)' }}>
                        {['Position','Total','Applied','Screening','Interview','Offer','Hired','Rejected','Conv. Rate'].map((h) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniquePositions.map((pos) => {
                        const posApps = applicants.filter((a) => a.position === pos)
                        const hired = posApps.filter((a) => a.stage === 'hired').length
                        return (
                          <tr key={pos} style={{ borderBottom: '1px solid var(--t-line)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{pos}</td>
                            <td style={{ padding: '8px 12px' }}>{posApps.length}</td>
                            {PIPELINE_STAGES.map((s) => (
                              <td key={s} style={{ padding: '8px 12px', color: STAGE_COLOR[s] }}>
                                {posApps.filter((a) => a.stage === s).length}
                              </td>
                            ))}
                            <td style={{ padding: '8px 12px', color: 'var(--t-danger)' }}>{posApps.filter((a) => a.stage === 'rejected').length}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-success)' }}>
                              {posApps.length > 0 ? `${Math.round(hired / posApps.length * 100)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* source of hire + rejection reasons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <SL>Source of Applicants</SL>
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '14px 16px' }}>
                  {sourceData.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No applications recorded yet.</div>
                    : sourceData.map(([src, count]) => {
                        const pct = applicants.length > 0 ? Math.round(count / applicants.length * 100) : 0
                        return (
                          <div key={src} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{src}</span>
                              <span style={{ color: 'var(--t-text-muted)' }}>{count} ({pct}%)</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--t-surface-2)', borderRadius: 3 }}>
                              <div style={{ height: 6, width: `${pct}%`, background: 'var(--t-accent)', borderRadius: 3 }} />
                            </div>
                          </div>
                        )
                      })}
                </div>
              </div>

              <div>
                <SL>Rejection Reasons</SL>
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '14px 16px' }}>
                  {rejReasonDist.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No rejections recorded.</div>
                    : rejReasonDist.map(([reason, count]) => {
                        const total = applicants.filter(a => a.stage === 'rejected').length
                        const pct = Math.round(count / Math.max(total, 1) * 100)
                        return (
                          <div key={reason} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{reason}</span>
                              <span style={{ color: 'var(--t-text-muted)' }}>{count} ({pct}%)</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--t-surface-2)', borderRadius: 3 }}>
                              <div style={{ height: 6, width: `${pct}%`, background: 'var(--t-danger)', borderRadius: 3 }} />
                            </div>
                          </div>
                        )
                      })}
                </div>
              </div>
            </div>

            {/* interview-to-hire by location */}
            <div>
              <SL>Interview → Hire Ratio by Location</SL>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--t-surface-2)' }}>
                      {['Location','Applicants','Interviewed','Hired','Hire Rate','Avg Rating'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locations.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: '10px 12px', color: 'var(--t-text-faint)' }}>No locations in scope.</td></tr>
                    )}
                    {locations.map((loc) => {
                      const locApps = applicants.filter(a => a.node_id === loc.id)
                      const interviewed = locApps.filter(a => ['screening', 'interview', 'offer', 'hired'].includes(a.stage)).length
                      const hired = locApps.filter(a => a.stage === 'hired').length
                      const rated = locApps.filter(a => a.rating)
                      const avgRating = rated.length > 0 ? (rated.reduce((s, a) => s + (a.rating || 0), 0) / rated.length).toFixed(1) : null
                      return (
                        <tr key={loc.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{loc.name}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{locApps.length}</td>
                          <td style={{ padding: '8px 12px', color: '#a78bfa' }}>{interviewed}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--t-success)', fontWeight: 700 }}>{hired}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                            {interviewed > 0 ? <span style={{ color: hired / interviewed > 0.5 ? 'var(--t-success)' : 'var(--t-warn)' }}>{Math.round(hired / interviewed * 100)}%</span> : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--t-warn)' }}>
                            {avgRating ? <>{'★'.repeat(Math.round(parseFloat(avgRating)))} {avgRating}</> : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* interviewer success rates */}
            <div>
              <SL>Interviewer Success Rates</SL>
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, overflow: 'hidden' }}>
                {interviewerStats.length === 0
                  ? <div style={{ padding: 16, fontSize: 12, color: 'var(--t-text-faint)' }}>No interviews recorded yet.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--t-surface-2)' }}>
                          {['Interviewer','Interviews','Completed','Candidates Hired','Success Rate'].map((h) => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {interviewerStats.map((m) => (
                          <tr key={m.name} style={{ borderBottom: '1px solid var(--t-line)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{m.name}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{m.total}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{m.completed}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--t-success)', fontWeight: 700 }}>{m.hired}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: m.completed > 0 && (m.hired / m.completed) > .4 ? 'var(--t-success)' : 'var(--t-warn)' }}>
                              {m.completed > 0 ? `${Math.round(m.hired / m.completed * 100)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </div>

            {/* time-to-hire trend — from real hires only */}
            <div>
              <SL>Time-to-Hire Trend (Monthly Avg Days)</SL>
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 4, padding: '16px 18px' }}>
                {hireTrend.length === 0
                  ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No completed hires with applied + hire dates yet.</div>
                  : hireTrend.map((row) => {
                      const max = Math.max(30, ...hireTrend.map((r) => r.days))
                      const pct = Math.round(row.days / max * 100)
                      return (
                        <div key={row.month} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ width: 32, fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, flexShrink: 0 }}>{row.month}</span>
                          <div style={{ flex: 1, height: 8, background: 'var(--t-surface-2)', borderRadius: 4 }}>
                            <div style={{ height: 8, width: `${pct}%`, background: row.days <= 20 ? 'var(--t-success)' : row.days <= 24 ? 'var(--t-warn)' : 'var(--t-danger)', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 40, fontSize: 12, color: 'var(--t-text)', fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>{row.days}d</span>
                        </div>
                      )
                    })}
              </div>
            </div>

            {/* export — real CSV */}
            <div>
              <button
                onClick={() => {
                  if (applicants.length === 0) { showToast('Nothing to export', 'warn'); return }
                  downloadCSV(applicants, [...APPLICANT_COLS, { key: 'bg', label: 'BG Status', value: (r) => bgLabel(bgOf(r)) }, { key: 'rej', label: 'Rejection Reason', value: (r) => r.rejection_reason || '' }], `ats-full-report-${today()}.csv`)
                  showToast(`Exported ${applicants.length} records to CSV`)
                }}
                style={{ background: 'none', border: '1px solid var(--t-accent)', borderRadius: 4, padding: '9px 20px', color: 'var(--t-accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Export Full Report CSV
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── APPLICANT SIDE PANEL ─────────────────────────────── */}
      {selected && (
        <ApplicantPanel
          applicant={selected}
          onClose={() => setSelected(null)}
          onAdvance={advanceApplicant}
          onReject={rejectApplicant}
          onSaveNote={saveApplicantNote}
          canAct={canAct}
          bgCheckGate={bgCheckGate}
          bgStatus={bgOf(selected)}
        />
      )}

      {/* ── INTERVIEW RATING MODAL ────────────────────────────── */}
      {ivRating && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '24px 26px', width: 440, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--t-text)', marginBottom: 4 }}>Post-Interview Evaluation</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 18 }}>{ivRating.applicant_name}</div>

            {[
              ['culture',       'Culture Fit'],
              ['experience',    'Experience'],
              ['availability',  'Availability'],
              ['presentation',  'Presentation'],
              ['sales',         'Sales Aptitude'],
            ].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{label}</label>
                  <Stars rating={ivRating[key]} size={14} />
                </div>
                <input type="range" min={1} max={5} step={1} value={ivRating[key]}
                  onChange={(e) => setIvRating((r) => ({ ...r, [key]: parseInt(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--t-warn)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>
                  <span>Poor</span><span>Excellent</span>
                </div>
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>
                Overall: {(() => {
                  const avg = ([ivRating.culture, ivRating.experience, ivRating.availability, ivRating.presentation, ivRating.sales].reduce((s, x) => s + (parseInt(x) || 0), 0) / 5).toFixed(1)
                  return <><Stars rating={parseFloat(avg)} size={14} /> ({avg}/5)</>
                })()}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Recommendation</label>
              <select value={ivRating.rec} onChange={(e) => setIvRating((r) => ({ ...r, rec: e.target.value }))} style={SEL}>
                <option value="Advance">Advance to Next Stage</option>
                <option value="Hold">Hold — Review More Candidates</option>
                <option value="Reject">Do Not Advance</option>
                <option value="Offer">Extend Offer</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 5 }}>Notes</label>
              <textarea value={ivRating.notes} onChange={(e) => setIvRating((r) => ({ ...r, notes: e.target.value }))} rows={3} style={TXT} placeholder="Key observations, concerns, strengths…" />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={saveRating}
                style={{ background: 'var(--t-accent)', color: '#000', border: 'none', borderRadius: 4, padding: '9px 20px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Save Evaluation
              </button>
              <button onClick={() => setIvRating(null)}
                style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 4, padding: '9px 16px', color: 'var(--t-text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FORENSIC DRILL-DOWN ───────────────────────────────── */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
