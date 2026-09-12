import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── PEAK SEASONS ──────────────────────────────────────────────────────────────
const PEAK_SEASONS = [
  { name: 'Winter Holiday', start: [11, 1], end: [2, 28], warn: 'Winter Holiday peak (Dec 1 – Mar 1). Requests require 21-day notice.' },
  { name: 'Memorial Day',   start: [4, 25], end: [5, 2],  warn: 'Memorial Day peak season.' },
  { name: 'Fourth of July', start: [6, 1],  end: [6, 9],  warn: 'Independence Day peak season.' },
  { name: 'Labor Day',      start: [7, 28], end: [8, 7],  warn: 'Labor Day peak season.' },
  { name: 'Thanksgiving',   start: [10, 22],end: [11, 2], warn: 'Thanksgiving peak season.' },
  { name: 'Easter',         start: [3, 8],  end: [3, 20], warn: 'Easter peak season.' },
]

const HARD_BLACKOUT = [
  { label: 'Black Friday',    month: 10, day: 28 },
  { label: 'Christmas Eve',   month: 11, day: 24 },
  { label: 'Christmas Day',   month: 11, day: 25 },
  { label: "New Year's Eve",  month: 11, day: 31 },
  { label: "New Year's Day",  month: 0,  day: 1  },
]

const NOTICE_DAYS = 21

function isPeakDay(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const m = d.getMonth()
  const day = d.getDate()
  for (const p of PEAK_SEASONS) {
    const [sm, sd] = p.start
    const [em, ed] = p.end
    // handles year wrap (winter holiday)
    if (sm > em) {
      if ((m > sm) || (m === sm && day >= sd) || (m < em) || (m === em && day <= ed)) return p
    } else {
      if ((m > sm || (m === sm && day >= sd)) && (m < em || (m === em && day <= ed))) return p
    }
  }
  return null
}

function isBlackoutDay(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return HARD_BLACKOUT.find(b => b.month === d.getMonth() && b.day === d.getDate()) || null
}

function calcNoticeShortfall(startDate) {
  if (!startDate) return null
  const peak = isPeakDay(startDate)
  if (!peak) return null
  const daysNotice = Math.floor((new Date(startDate + 'T12:00:00') - new Date()) / 86400000)
  if (daysNotice < NOTICE_DAYS) return { season: peak.name, days: daysNotice, required: NOTICE_DAYS }
  return null
}

function calcDays(start, end) {
  if (!start) return 0
  const s = new Date(start + 'T12:00:00')
  const e = new Date((end || start) + 'T12:00:00')
  return Math.max(1, Math.ceil((e - s) / 86400000) + 1)
}

function todayStr() { return new Date().toISOString().split('T')[0] }

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShort(s) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function exportCSV(rows, filename) {
  const cols = ['Employee', 'Location', 'Type', 'Start', 'End', 'Days', 'Reason', 'Status', 'Submitted']
  const lines = [cols.join(','), ...rows.map(r => [
    `"${r.persons?.full_name || r.person_name || ''}"`,
    `"${r.org_nodes?.name || r.node_name || ''}"`,
    r.type || '',
    r.start_date || '',
    r.end_date || '',
    calcDays(r.start_date, r.end_date),
    `"${(r.reason || '').replace(/"/g, "'")}"`,
    r.status || '',
    (r.created_at || r.submitted_at || '').slice(0, 10),
  ].join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  page: { background: 'var(--t-bg, #070b14)', minHeight: '100vh', padding: '0 0 60px', fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'var(--t-text, #e2e8f0)' },
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--t-line, #1e2530)', background: 'var(--t-bg, #070b14)' },
  hdrTitle: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0, letterSpacing: '-0.02em' },
  hdrSub: { fontSize: 11, color: 'var(--t-text-muted, #6b7a90)', marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' },
  body: { padding: '20px 24px' },
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--t-line, #1e2530)', border: '1px solid var(--t-line)', marginBottom: 20 },
  kpiCell: { background: 'var(--t-surface, #0d1117)', padding: '14px 18px' },
  kpiLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-text-muted, #6b7a90)', marginBottom: 6 },
  kpiVal: (c) => ({ fontSize: 22, fontWeight: 800, color: c || 'var(--t-text)', lineHeight: 1 }),
  kpiSub: { fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 4 },
  tabRow: { display: 'flex', borderBottom: '1px solid var(--t-line, #1e2530)', marginBottom: 20, overflowX: 'auto' },
  tabBtn: (a) => ({ padding: '10px 18px', background: 'none', border: 'none', borderBottom: a ? '2px solid #00e5ff' : '2px solid transparent', color: a ? '#00e5ff' : 'var(--t-text-muted, #6b7a90)', fontSize: 11, fontWeight: a ? 700 : 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'color 0.15s' }),
  card: { background: 'var(--t-surface, #0d1117)', border: '1px solid var(--t-line, #1e2530)', marginBottom: 10 },
  cardHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--t-line)', background: 'rgba(255,255,255,0.02)' },
  cardHdrTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-text-muted)' },
  cardBody: { padding: '14px 16px' },
  reqRow: (bc) => ({ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderLeft: `3px solid ${bc || '#1e2530'}`, marginBottom: 8, padding: '14px 16px' }),
  btnPrimary: { background: '#00e5ff', color: '#070b14', border: 'none', padding: '9px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: 'var(--t-text-muted, #6b7a90)', border: '1px solid var(--t-line)', padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit' },
  btnApprove: { background: 'rgba(42,214,160,0.15)', color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.35)', padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnDeny: { background: 'rgba(255,77,125,0.12)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.3)', padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm: { background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  input: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  select: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none', cursor: 'pointer' },
  textarea: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: 80 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-text-muted)', display: 'block', marginBottom: 6 },
  fg: { marginBottom: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#0d1117', border: '1px solid var(--t-line)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' },
  modalHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,0.05)' },
  modalTitle: { fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e5ff' },
  modalBody: { padding: '20px' },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--t-line)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(30,37,48,0.5)', color: 'var(--t-text)', verticalAlign: 'middle' },
  calTh: { padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' },
  calTd: (peak, blackout, isToday) => ({ border: '1px solid var(--t-line)', padding: 4, minHeight: 64, verticalAlign: 'top', background: blackout ? 'rgba(255,77,125,0.08)' : peak ? 'rgba(255,184,0,0.05)' : isToday ? 'rgba(0,229,255,0.04)' : 'transparent', cursor: 'default' }),
  divRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(30,37,48,0.6)', fontSize: 12 },
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function statusColor(s) {
  return s === 'approved' ? '#2ad6a0' : s === 'denied' ? '#ff4d7d' : s === 'pending' ? '#ffb800' : '#6b7a90'
}
function typeColor(t) {
  switch ((t || '').toLowerCase()) {
    case 'pto': return '#00e5ff'
    case 'sick': return '#ff4d7d'
    case 'personal': return '#7c4dff'
    case 'bereavement': return '#2979ff'
    case 'fmla': return '#ff9800'
    case 'unpaid': return '#9e9e9e'
    default: return '#6b7a90'
  }
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: color || '#e2e8f0', background: bg || (color ? color + '22' : 'rgba(255,255,255,0.08)'), border: `1px solid ${color ? color + '44' : '#1e2530'}` }}>
      {label}
    </span>
  )
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  function show(msg, type = 'success') {
    clearTimeout(timer.current)
    setToast({ msg, type })
    timer.current = setTimeout(() => setToast(null), 3000)
  }
  function ToastEl() {
    if (!toast) return null
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '12px 20px', fontSize: 13, fontWeight: 700, zIndex: 2000, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', letterSpacing: '0.04em' }}>
        {toast.msg}
      </div>
    )
  }
  return { show, ToastEl }
}

// ── PEAK WARNING ──────────────────────────────────────────────────────────────
function PeakWarning({ startDate }) {
  if (!startDate) return null
  const blackout = isBlackoutDay(startDate)
  if (blackout) return (
    <div style={{ background: 'rgba(255,77,125,0.1)', border: '1px solid rgba(255,77,125,0.4)', padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#ff4d7d', marginBottom: 4 }}>HARD BLACKOUT — {blackout.label}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,200,200,0.9)' }}>This date is a company blackout date — requests are not approved. Contact HR directly.</div>
    </div>
  )
  const shortfall = calcNoticeShortfall(startDate)
  if (shortfall) return (
    <div style={{ background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.35)', padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#ff4d7d', marginBottom: 4 }}>⚠ PEAK SEASON — INSUFFICIENT NOTICE</div>
      <div style={{ fontSize: 11, color: 'rgba(255,210,190,0.9)', lineHeight: 1.6 }}>
        Falls during <strong>{shortfall.season}</strong> peak season.<br />
        You are <strong>{shortfall.required - shortfall.days} days short</strong> of the required {NOTICE_DAYS}-day minimum.<br />
        This will be flagged as URGENT to HR and COO and may be denied.
      </div>
    </div>
  )
  const peak = isPeakDay(startDate)
  if (peak) return (
    <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800', marginBottom: 4 }}>PEAK SEASON — {peak.name.toUpperCase()}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,230,180,0.9)' }}>{peak.warn}</div>
    </div>
  )
  return (
    <div style={{ background: 'rgba(42,214,160,0.06)', border: '1px solid rgba(42,214,160,0.25)', padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#2ad6a0' }}>✓ No peak season conflicts — this date looks good.</div>
    </div>
  )
}

// ── SUBMIT MODAL ──────────────────────────────────────────────────────────────
function SubmitModal({ personId, locationIds, locations, onClose, onSubmitted }) {
  const [form, setForm] = useState({ type: 'PTO', node_id: locationIds?.[0] || '', start_date: '', end_date: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const days = calcDays(form.start_date, form.end_date)

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })); setErr(null) }

  async function submit() {
    if (!form.start_date) { setErr('Start date is required.'); return }
    if (isBlackoutDay(form.start_date)) { setErr(`${isBlackoutDay(form.start_date).label} is a company blackout date — no requests accepted.`); return }
    if (!form.reason.trim()) { setErr('Please provide a reason.'); return }
    setBusy(true)
    const { error } = await sb.rpc('submit_pto_request', {
      p_person_id:  personId,
      p_node_id:    form.node_id,
      p_type:       form.type,
      p_start_date: form.start_date,
      p_end_date:   form.end_date || form.start_date,
      p_reason:     form.reason,
    })
    setBusy(false)
    if (error) { setErr('Could not submit request — ' + (error.message || 'please try again') + '.'); return }
    onSubmitted()
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHdr}>
          <span style={S.modalTitle}>Request Time Off</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7a90', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={S.modalBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={S.fg}>
              <label style={S.label}>Type</label>
              <select value={form.type} onChange={e => upd('type', e.target.value)} style={S.select}>
                {['PTO', 'Sick', 'Personal', 'Bereavement', 'Unpaid', 'FMLA'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={S.fg}>
              <label style={S.label}>Location</label>
              <select value={form.node_id} onChange={e => upd('node_id', e.target.value)} style={S.select}>
                {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={S.fg}>
              <label style={S.label}>Start Date</label>
              <input type="date" value={form.start_date} min={todayStr()} onChange={e => { upd('start_date', e.target.value); if (!form.end_date || form.end_date < e.target.value) upd('end_date', e.target.value) }} style={S.input} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>End Date</label>
              <input type="date" value={form.end_date} min={form.start_date || todayStr()} onChange={e => upd('end_date', e.target.value)} style={S.input} />
            </div>
          </div>
          {form.start_date && <PeakWarning startDate={form.start_date} />}
          {days > 0 && <div style={{ fontSize: 11, color: '#00e5ff', marginBottom: 14 }}>{days} day{days !== 1 ? 's' : ''} · ~{days * 8} hours</div>}
          <div style={S.fg}>
            <label style={S.label}>Reason</label>
            <textarea value={form.reason} onChange={e => upd('reason', e.target.value)} placeholder="Brief reason for your request…" style={S.textarea} />
          </div>
          {err && <div style={{ fontSize: 12, color: '#ff4d7d', padding: '8px 12px', background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.3)', marginBottom: 10 }}>{err}</div>}
        </div>
        <div style={S.modalFoot}>
          <button onClick={onClose} style={S.btnGhost} disabled={busy}>Cancel</button>
          <button onClick={submit} style={S.btnPrimary} disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
        </div>
      </div>
    </div>
  )
}

// ── DENY MODAL ────────────────────────────────────────────────────────────────
function DenyModal({ target, onClose, onDenied }) {
  const [busy, setBusy] = useState(false)
  async function confirm() {
    setBusy(true)
    await onDenied(target.id)
    setBusy(false)
    onClose()
  }
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 400 }}>
        <div style={{ ...S.modalHdr }}>
          <span style={{ ...S.modalTitle, color: '#ff4d7d' }}>Deny Request</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7a90', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={S.modalBody}>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 6 }}>
            Deny the time-off request for <strong style={{ color: 'var(--t-text)' }}>{target.name}</strong>?
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
            The employee will see this request marked as denied. This can’t be undone from here.
          </div>
        </div>
        <div style={S.modalFoot}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={confirm} style={S.btnDeny} disabled={busy}>{busy ? '…' : 'Confirm Deny'}</button>
        </div>
      </div>
    </div>
  )
}

// ── MY REQUESTS TAB ───────────────────────────────────────────────────────────
function TabMyRequests({ myReqs, loading, onNewRequest, onCancel }) {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  const filtered = useMemo(() => myReqs.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterType && r.type !== filterType) return false
    return true
  }), [myReqs, filterStatus, filterType])

  if (loading) return <Spinner />

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onNewRequest} style={S.btnPrimary}>+ New Request</button>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...S.select, width: 140 }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...S.select, width: 150 }}>
          <option value="">All Types</option>
          {['PTO', 'Sick', 'Personal', 'Bereavement', 'Unpaid', 'FMLA'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterStatus || filterType) && <button onClick={() => { setFilterStatus(''); setFilterType('') }} style={S.btnSm}>Clear</button>}
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{filtered.length} request{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {filtered.length === 0
        ? <Empty text={filterStatus || filterType ? 'No requests match filters' : 'No requests yet — click + New Request'} />
        : filtered.map(r => <MyReqCard key={r.id} req={r} onCancel={onCancel} />)
      }
    </>
  )
}

function MyReqCard({ req, onCancel }) {
  const days = req.total_days || calcDays(req.start_date, req.end_date)
  const sc = statusColor(req.status)
  const tc = typeColor(req.type)
  const peak = isPeakDay(req.start_date)
  const shortfall = calcNoticeShortfall(req.start_date)
  return (
    <div style={S.reqRow(sc)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
            <Badge label={req.type} color={tc} />
            <Badge label={req.status} color={sc} />
            {peak && <Badge label={`Peak: ${peak.name}`} color="#ffb800" />}
            {shortfall && <Badge label="Short Notice" color="#ff4d7d" />}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', marginBottom: 4 }}>
            {fmtDate(req.start_date)}
            {req.end_date && req.end_date !== req.start_date && ` – ${fmtDate(req.end_date)}`}
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 400, marginLeft: 10 }}>{days} day{days !== 1 ? 's' : ''}</span>
          </div>
          {req.reason && <div style={{ fontSize: 12, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>"{req.reason}"</div>}
          {req.status === 'approved' && (req.reviewer?.display_name || req.reviewer?.full_name) && <div style={{ fontSize: 10, color: '#2ad6a0', marginTop: 4 }}>Approved by {req.reviewer.display_name || req.reviewer.full_name}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{(req.created_at || '').slice(0, 10)}</div>
          {req.status === 'pending' && <button onClick={() => onCancel(req.id)} style={S.btnSm}>Cancel</button>}
        </div>
      </div>
    </div>
  )
}

// ── ALL REQUESTS TAB (HR) ─────────────────────────────────────────────────────
function TabAllRequests({ allReqs, loading, locations, personId, onApprove, onDeny, acting }) {
  const [fLoc, setFLoc] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fType, setFType] = useState('')
  const [fName, setFName] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const filtered = useMemo(() => allReqs.filter(r => {
    const locName = r.org_nodes?.name || r.node_name || ''
    const empName = (r.persons?.full_name || r.person_name || '').toLowerCase()
    if (fLoc && locName !== fLoc) return false
    if (fStatus && r.status !== fStatus) return false
    if (fType && r.type !== fType) return false
    if (fName && !empName.includes(fName.toLowerCase())) return false
    if (fFrom && r.start_date < fFrom) return false
    if (fTo && r.start_date > fTo) return false
    return true
  }), [allReqs, fLoc, fStatus, fType, fName, fFrom, fTo])

  function handleExport() { exportCSV(filtered, `time-off-requests-${todayStr()}.csv`) }

  if (loading) return <Spinner />

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={fLoc} onChange={e => setFLoc(e.target.value)} style={{ ...S.select, width: 130 }}>
          <option value="">All Locations</option>
          {(locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...S.select, width: 120 }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ ...S.select, width: 130 }}>
          <option value="">All Types</option>
          {['PTO', 'Sick', 'Personal', 'Bereavement', 'Unpaid', 'FMLA'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Search employee…" style={{ ...S.input, width: 160 }} />
        <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ ...S.input, width: 140 }} title="From date" />
        <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ ...S.input, width: 140 }} title="To date" />
        <button onClick={handleExport} style={S.btnGhost}>Export CSV</button>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{filtered.length} rows</span>
      </div>
      {filtered.length === 0 ? <Empty text="No requests match filters" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Employee', 'Location', 'Type', 'Dates', 'Days', 'Reason', 'Status', 'Submitted', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const sc = statusColor(r.status)
                const peak = isPeakDay(r.start_date)
                const shortfall = calcNoticeShortfall(r.start_date)
                const days = r.total_days || calcDays(r.start_date, r.end_date)
                const name = r.persons?.full_name || r.person_name || '—'
                const loc = r.org_nodes?.name || r.node_name || '—'
                const isAct = acting === r.id
                return (
                  <tr key={r.id} style={{ background: r.status === 'pending' && (peak || shortfall) ? 'rgba(255,184,0,0.04)' : undefined }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      {(peak || shortfall) && <div style={{ fontSize: 10, color: shortfall ? '#ff4d7d' : '#ffb800', marginTop: 2 }}>{shortfall ? '⚠ Short Notice' : `Peak: ${peak.name}`}</div>}
                    </td>
                    <td style={S.td}>{loc}</td>
                    <td style={S.td}><Badge label={r.type} color={typeColor(r.type)} /></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtShort(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmtShort(r.end_date)}` : ''}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{days}</td>
                    <td style={{ ...S.td, maxWidth: 200, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>{r.reason || '—'}</td>
                    <td style={S.td}><Badge label={r.status} color={sc} /></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{(r.created_at || '').slice(0, 10)}</td>
                    <td style={S.td}>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => onApprove(r.id)} style={S.btnApprove} disabled={isAct}>{isAct ? '…' : '✓'}</button>
                          <button onClick={() => onDeny(r.id, name)} style={S.btnDeny} disabled={isAct}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── CALENDAR TAB ──────────────────────────────────────────────────────────────
function TabCalendar({ allReqs, myReqs }) {
  const [cal, setCal] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })
  const tStr = todayStr()
  const { y, m } = cal

  const firstDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const combined = [...(allReqs || []), ...(myReqs || [])]

  // Build day → events map
  const dayMap = useMemo(() => {
    const map = {}
    combined.forEach(r => {
      if (!r.start_date) return
      let cur = new Date(r.start_date + 'T12:00:00')
      const end = new Date((r.end_date || r.start_date) + 'T12:00:00')
      while (cur <= end) {
        const ds = cur.toISOString().slice(0, 10)
        if (!map[ds]) map[ds] = []
        map[ds].push(r)
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [combined])

  function prev() { setCal(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }) }
  function next() { setCal(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }) }

  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const rows = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  const monthLabel = new Date(y, m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prev} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 16 }}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{monthLabel}</span>
        <button onClick={next} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 16 }}>›</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <th key={d} style={S.calTh}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((d, ci) => {
                // row is Sun-indexed from firstDow; remap to Mon-first display
                const colMap = [1, 2, 3, 4, 5, 6, 0] // Mon=0...Sun=6 → JS .getDay() offset
                if (!d) return <td key={ci} style={{ border: '1px solid var(--t-line)', padding: 4, minHeight: 64 }} />
                const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const peak = !!isPeakDay(ds)
                const blackout = !!isBlackoutDay(ds)
                const isToday = ds === tStr
                const evts = dayMap[ds] || []
                return (
                  <td key={ci} style={S.calTd(peak, blackout, isToday)}>
                    <div style={{ fontSize: 10, fontWeight: isToday ? 800 : 400, color: blackout ? '#ff4d7d' : isToday ? '#00e5ff' : 'var(--t-text-muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {d}
                      {isToday && <span style={{ width: 5, height: 5, background: '#00e5ff', borderRadius: '50%' }} />}
                    </div>
                    {blackout && <div style={{ fontSize: 8, color: '#ff4d7d', fontWeight: 700, letterSpacing: '0.05em' }}>BLACKOUT</div>}
                    {evts.slice(0, 3).map((r, idx) => {
                      const name = r.persons?.full_name || r.person_name || 'Request'
                      return (
                        <div key={idx} style={{ fontSize: 9, fontWeight: 600, padding: '1px 4px', marginBottom: 1, background: r.status === 'approved' ? 'rgba(42,214,160,0.25)' : 'rgba(255,184,0,0.2)', color: r.status === 'approved' ? '#2ad6a0' : '#ffb800', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {name.split(' ')[0]} · {r.type}
                        </div>
                      )
                    })}
                    {evts.length > 3 && <div style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>+{evts.length - 3} more</div>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { color: '#2ad6a0', label: 'Approved' },
          { color: '#ffb800', label: 'Pending' },
          { color: '#ff4d7d', label: 'Blackout' },
          { color: 'rgba(255,184,0,0.2)', label: 'Peak Season', border: '1px solid rgba(255,184,0,0.4)' },
          { color: 'rgba(0,229,255,0.15)', label: 'Today', border: '1px solid rgba(0,229,255,0.4)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: l.color, border: l.border || 'none', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── REPORT TAB (HR) ───────────────────────────────────────────────────────────
function TabReport({ allReqs, loading }) {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${lastMonthD.getFullYear()}-${String(lastMonthD.getMonth() + 1).padStart(2, '0')}`

  const thisMonthReqs = useMemo(() => allReqs.filter(r => (r.created_at || '').slice(0, 7) === thisMonth), [allReqs, thisMonth])
  const lastMonthReqs = useMemo(() => allReqs.filter(r => (r.created_at || '').slice(0, 7) === lastMonth), [allReqs, lastMonth])

  const approved = thisMonthReqs.filter(r => r.status === 'approved')
  const denied = thisMonthReqs.filter(r => r.status === 'denied')
  const pending = thisMonthReqs.filter(r => r.status === 'pending')
  const totalDays = thisMonthReqs.reduce((acc, r) => acc + (r.total_days || calcDays(r.start_date, r.end_date)), 0)
  const avgDays = thisMonthReqs.length > 0 ? (totalDays / thisMonthReqs.length).toFixed(1) : 0
  const peakReqs = thisMonthReqs.filter(r => isPeakDay(r.start_date))

  // By location
  const byLoc = useMemo(() => {
    const map = {}
    thisMonthReqs.forEach(r => {
      const loc = r.org_nodes?.name || r.node_name || 'Unknown'
      if (!map[loc]) map[loc] = { requests: 0, approved: 0, denied: 0, days: 0 }
      map[loc].requests++
      if (r.status === 'approved') map[loc].approved++
      if (r.status === 'denied') map[loc].denied++
      map[loc].days += r.total_days || calcDays(r.start_date, r.end_date)
    })
    return Object.entries(map).sort((a, b) => b[1].requests - a[1].requests)
  }, [thisMonthReqs])

  // By type
  const byType = useMemo(() => {
    const map = {}
    thisMonthReqs.forEach(r => {
      if (!map[r.type]) map[r.type] = { count: 0, days: 0 }
      map[r.type].count++
      map[r.type].days += r.total_days || calcDays(r.start_date, r.end_date)
    })
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count)
  }, [thisMonthReqs])

  const trendPct = lastMonthReqs.length > 0
    ? Math.round(((thisMonthReqs.length - lastMonthReqs.length) / lastMonthReqs.length) * 100)
    : null

  if (loading) return <Spinner />

  return (
    <>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--t-line)', border: '1px solid var(--t-line)', marginBottom: 20 }}>
        {[
          { label: 'This Month', val: thisMonthReqs.length, color: 'var(--t-text)', sub: trendPct !== null ? `${trendPct > 0 ? '+' : ''}${trendPct}% vs last month` : '' },
          { label: 'Approved', val: approved.length, color: '#2ad6a0', sub: `${totalDays} total days` },
          { label: 'Denied', val: denied.length, color: '#ff4d7d', sub: '' },
          { label: 'Pending', val: pending.length, color: '#ffb800', sub: 'awaiting review' },
          { label: 'Avg Days', val: avgDays, color: '#00e5ff', sub: 'per request' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--t-surface)', padding: '14px 18px' }}>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={S.kpiVal(k.color)}>{k.val}</div>
            {k.sub && <div style={S.kpiSub}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* By Location */}
        <div style={S.card}>
          <div style={S.cardHdr}><span style={S.cardHdrTitle}>By Location</span></div>
          <div style={{ padding: 0 }}>
            <table style={S.table}>
              <thead><tr>{['Location', 'Requests', 'Approved', 'Denied', 'Days'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {byLoc.length === 0 ? <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)' }}>No data</td></tr> : byLoc.map(([loc, d]) => (
                  <tr key={loc}>
                    <td style={S.td}>{loc}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{d.requests}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#2ad6a0' }}>{d.approved}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#ff4d7d' }}>{d.denied}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#00e5ff' }}>{d.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Type */}
        <div style={S.card}>
          <div style={S.cardHdr}><span style={S.cardHdrTitle}>By Type</span></div>
          <div style={{ padding: 0 }}>
            <table style={S.table}>
              <thead><tr>{['Type', 'Count', 'Days'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {byType.length === 0 ? <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)' }}>No data</td></tr> : byType.map(([type, d]) => (
                  <tr key={type}>
                    <td style={S.td}><Badge label={type} color={typeColor(type)} /></td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{d.count}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)' }}>{d.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Peak season callout */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cardHdr}>
          <span style={S.cardHdrTitle}>Peak Season Requests This Month</span>
          <Badge label={`${peakReqs.length} flagged`} color={peakReqs.length > 0 ? '#ffb800' : '#2ad6a0'} />
        </div>
        {peakReqs.length === 0
          ? <div style={{ ...S.cardBody, color: 'var(--t-text-faint)', fontSize: 12 }}>No peak-season requests this month.</div>
          : <div style={{ padding: 0, overflowX: 'auto' }}>
            <table style={S.table}>
              <thead><tr>{['Employee', 'Type', 'Start Date', 'Season', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {peakReqs.map(r => (
                  <tr key={r.id}>
                    <td style={S.td}>{r.persons?.full_name || r.person_name || '—'}</td>
                    <td style={S.td}><Badge label={r.type} color={typeColor(r.type)} /></td>
                    <td style={S.td}>{fmtDate(r.start_date)}</td>
                    <td style={S.td}><span style={{ color: '#ffb800', fontSize: 11, fontWeight: 600 }}>{isPeakDay(r.start_date)?.name}</span></td>
                    <td style={S.td}><Badge label={r.status} color={statusColor(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>

      {/* Trend */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cardHdr}><span style={S.cardHdrTitle}>Month-over-Month Trend</span></div>
        <div style={S.cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[['This Month', thisMonthReqs.length], ['Last Month', lastMonthReqs.length]].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t-text)' }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>requests submitted</div>
              </div>
            ))}
          </div>
          {trendPct !== null && (
            <div style={{ marginTop: 12, fontSize: 12, color: trendPct > 10 ? '#ff4d7d' : trendPct < 0 ? '#2ad6a0' : 'var(--t-text-muted)' }}>
              {trendPct > 0 ? `▲ ${trendPct}% increase` : trendPct < 0 ? `▼ ${Math.abs(trendPct)}% decrease` : 'No change'} vs last month
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</div>
  )
}
function Empty({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>○</div>
      {text}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function Requests() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))
  const personId = session?.person?.id

  const [tab, setTab] = useState('my')
  const [loadingMy, setLoadingMy] = useState(true)
  const [loadingAll, setLoadingAll] = useState(false)
  const [myReqs, setMyReqs] = useState([])
  const [allReqs, setAllReqs] = useState([])
  const [showSubmit, setShowSubmit] = useState(false)
  const [denyTarget, setDenyTarget] = useState(null) // { id, name }
  const [acting, setActing] = useState(null)
  const { show: toast, ToastEl } = useToast()

  // Real columns: notes (aliased to reason for the UI), reviewer name embedded
  // via the reviewed_by FK. No mock fallback — an empty result is an honest
  // empty state, not a reason to fabricate rows.
  const MY_SELECT = 'id,person_id,node_id,type,start_date,end_date,total_days,status,created_at,reviewed_by,reviewed_at,reason:notes,reviewer:people!time_off_requests_reviewed_by_fkey(full_name,display_name),org_nodes(name)'
  const ALL_SELECT = 'id,person_id,node_id,type,start_date,end_date,total_days,status,created_at,reviewed_by,reviewed_at,reason:notes,persons:people!time_off_requests_person_id_fkey(full_name,display_name),reviewer:people!time_off_requests_reviewed_by_fkey(full_name,display_name),org_nodes(name)'

  // ── LOAD MY REQUESTS ──
  const loadMy = useCallback(async () => {
    if (!personId) { setMyReqs([]); setLoadingMy(false); return }
    setLoadingMy(true)
    const { data, error } = await sb
      .from('time_off_requests')
      .select(MY_SELECT)
      .eq('person_id', personId)
      .order('start_date', { ascending: false })
    if (error) { console.error('[requests] loadMy', error); toast('Could not load your requests.', 'error') }
    setMyReqs(error ? [] : (data || []))
    setLoadingMy(false)
  }, [personId])

  // ── LOAD ALL REQUESTS (HR) ──
  const loadAll = useCallback(async () => {
    if (!isHR) return
    setLoadingAll(true)
    const { data, error } = await sb
      .from('time_off_requests')
      .select(ALL_SELECT)
      .in('node_id', locationIds || [])
      .order('created_at', { ascending: false })
    if (error) { console.error('[requests] loadAll', error); toast('Could not load team requests.', 'error') }
    setAllReqs(error ? [] : (data || []))
    setLoadingAll(false)
  }, [isHR, locationIds?.join(',')])

  useEffect(() => { loadMy() }, [loadMy])
  useEffect(() => { if (isHR) loadAll() }, [loadAll, isHR])

  // ── REVIEW (approve / deny) — real write, then refresh from server ──
  async function review(requestId, action) {
    setActing(requestId)
    // review_time_off(p_action, p_request_id, p_reviewer_id) — verified live signature.
    const { error } = await sb.rpc('review_time_off', {
      p_action: action,
      p_request_id: requestId,
      p_reviewer_id: personId,
    })
    setActing(null)
    if (error) {
      console.error('[requests] review_time_off', error)
      toast('Could not ' + (action === 'approved' ? 'approve' : 'deny') + ' — please try again.', 'error')
      return false
    }
    toast(action === 'approved' ? 'Request approved' : 'Request denied', action === 'approved' ? 'success' : 'error')
    await Promise.all([loadAll(), loadMy()])
    return true
  }

  function handleApprove(requestId) { return review(requestId, 'approved') }
  async function handleDeny(requestId) { await review(requestId, 'denied') }

  function openDeny(id, name) { setDenyTarget({ id, name }) }

  // ── CANCEL MY REQUEST — SECURITY DEFINER RPC (ownership + pending-only) ──
  async function handleCancel(requestId) {
    setActing(requestId)
    const { error } = await sb.rpc('cancel_time_off_request', {
      p_request_id: requestId,
      p_person_id: personId,
    })
    setActing(null)
    if (error) {
      console.error('[requests] cancel_time_off_request', error)
      toast('Could not cancel this request.', 'error')
      return
    }
    toast('Request cancelled')
    await loadMy()
    if (isHR) loadAll()
  }

  function handleSubmitted() {
    setShowSubmit(false)
    toast('Request submitted!')
    loadMy()
    if (isHR) loadAll()
  }

  // ── KPI COUNTS ──
  const myPending = myReqs.filter(r => r.status === 'pending').length
  const teamPending = allReqs.filter(r => r.status === 'approved' || r.status === 'pending').length
  const teamNeedApproval = allReqs.filter(r => r.status === 'pending').length
  const myApproved = myReqs.filter(r => r.status === 'approved').length

  const TABS = [
    { id: 'my', label: 'My Requests', count: myReqs.length },
    { id: 'submit', label: 'Submit Request' },
    ...(isHR ? [
      { id: 'all', label: 'All Requests', count: teamNeedApproval > 0 ? teamNeedApproval : undefined, countColor: '#ff4d7d' },
      { id: 'report', label: 'Report' },
    ] : []),
    { id: 'calendar', label: 'Calendar' },
  ]

  return (
    <div style={S.page}>
      {/* Page header */}
      <div style={S.hdr}>
        <div>
          <div style={S.hdrTitle}>PTO &amp; Leave Requests</div>
          <div style={S.hdrSub}>Request · Track · Approve</div>
        </div>
        <button onClick={() => setTab('submit')} style={S.btnPrimary}>+ New Request</button>
      </div>

      <div style={S.body}>
        {/* KPI strip */}
        <div style={S.kpiStrip}>
          <div style={S.kpiCell}>
            <div style={S.kpiLabel}>My Approved</div>
            <div style={S.kpiVal('#2ad6a0')}>{myApproved}</div>
            <div style={S.kpiSub}>this year</div>
          </div>
          <div style={S.kpiCell}>
            <div style={S.kpiLabel}>My Pending</div>
            <div style={S.kpiVal(myPending > 0 ? '#ffb800' : undefined)}>{myPending}</div>
            <div style={S.kpiSub}>awaiting decision</div>
          </div>
          {isHR && <>
            <div style={S.kpiCell}>
              <div style={S.kpiLabel}>Team Requests</div>
              <div style={S.kpiVal()}>{teamPending}</div>
              <div style={S.kpiSub}>approved + pending</div>
            </div>
            <div style={S.kpiCell}>
              <div style={S.kpiLabel}>Need Approval</div>
              <div style={S.kpiVal(teamNeedApproval > 0 ? '#ff4d7d' : undefined)}>{teamNeedApproval}</div>
              <div style={S.kpiSub}>pending your review</div>
            </div>
          </>}
        </div>

        {/* Tabs */}
        <div style={S.tabRow}>
          {TABS.map(t => (
            <button key={t.id} style={S.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
              {t.count != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 6, minWidth: 18, height: 16, padding: '0 4px', background: t.countColor || 'rgba(255,255,255,0.12)', color: t.countColor ? '#fff' : 'var(--t-text-muted)', fontSize: 10, fontWeight: 800 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'my' && (
          <TabMyRequests myReqs={myReqs} loading={loadingMy} onNewRequest={() => setTab('submit')} onCancel={handleCancel} />
        )}

        {tab === 'submit' && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
              Fill out the form below to submit a time off request.
            </div>
            <SubmitForm personId={personId} locationIds={locationIds} locations={locations} onSubmitted={handleSubmitted} />
          </div>
        )}

        {tab === 'all' && isHR && (
          <TabAllRequests
            allReqs={allReqs}
            loading={loadingAll}
            locations={locations}
            personId={personId}
            onApprove={handleApprove}
            onDeny={openDeny}
            acting={acting}
          />
        )}

        {tab === 'calendar' && (
          <TabCalendar allReqs={allReqs} myReqs={myReqs} />
        )}

        {tab === 'report' && isHR && (
          <TabReport allReqs={allReqs} loading={loadingAll} />
        )}
      </div>

      {/* Modals */}
      {showSubmit && (
        <SubmitModal personId={personId} locationIds={locationIds} locations={locations} onClose={() => setShowSubmit(false)} onSubmitted={handleSubmitted} />
      )}
      {denyTarget && (
        <DenyModal target={denyTarget} onClose={() => setDenyTarget(null)} onDenied={handleDeny} />
      )}

      <ToastEl />
    </div>
  )
}

// ── INLINE SUBMIT FORM (tab version) ─────────────────────────────────────────
function SubmitForm({ personId, locationIds, locations, onSubmitted }) {
  const [form, setForm] = useState({ type: 'PTO', node_id: locationIds?.[0] || '', start_date: '', end_date: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const days = calcDays(form.start_date, form.end_date)

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })); setErr(null) }

  async function submit() {
    if (!form.start_date) { setErr('Start date is required.'); return }
    if (isBlackoutDay(form.start_date)) { setErr(`${isBlackoutDay(form.start_date).label} is a company blackout date.`); return }
    if (!form.reason.trim()) { setErr('Please provide a reason.'); return }
    if (!personId) { setErr('No signed-in employee — please sign in again.'); return }
    if (!form.node_id) { setErr('Please choose a location.'); return }
    setBusy(true)
    const { error } = await sb.rpc('submit_pto_request', {
      p_person_id:  personId,
      p_node_id:    form.node_id,
      p_type:       form.type,
      p_start_date: form.start_date,
      p_end_date:   form.end_date || form.start_date,
      p_reason:     form.reason,
    })
    setBusy(false)
    if (error) { setErr('Could not submit request — ' + (error.message || 'please try again') + '.'); return }
    setDone(true)
    setTimeout(onSubmitted, 1200)
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#2ad6a0' }}>Request Submitted</div>
      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 6 }}>Redirecting to My Requests…</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={S.fg}>
          <label style={S.label}>Type</label>
          <select value={form.type} onChange={e => upd('type', e.target.value)} style={S.select}>
            {['PTO', 'Sick', 'Personal', 'Bereavement', 'Unpaid', 'FMLA'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.fg}>
          <label style={S.label}>Location</label>
          <select value={form.node_id} onChange={e => upd('node_id', e.target.value)} style={S.select}>
            {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={S.fg}>
          <label style={S.label}>Start Date</label>
          <input type="date" value={form.start_date} min={todayStr()} onChange={e => { upd('start_date', e.target.value); if (!form.end_date || form.end_date < e.target.value) upd('end_date', e.target.value) }} style={S.input} />
        </div>
        <div style={S.fg}>
          <label style={S.label}>End Date</label>
          <input type="date" value={form.end_date} min={form.start_date || todayStr()} onChange={e => upd('end_date', e.target.value)} style={S.input} />
        </div>
      </div>
      {form.start_date && <PeakWarning startDate={form.start_date} />}
      {days > 0 && <div style={{ fontSize: 11, color: '#00e5ff', marginBottom: 14 }}>{days} day{days !== 1 ? 's' : ''} · ~{days * 8} hours</div>}
      <div style={S.fg}>
        <label style={S.label}>Reason</label>
        <textarea value={form.reason} onChange={e => upd('reason', e.target.value)} placeholder="Brief reason for your request…" style={S.textarea} />
      </div>
      {err && <div style={{ fontSize: 12, color: '#ff4d7d', padding: '8px 12px', background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.3)', marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={submit} style={S.btnPrimary} disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</button>
      </div>
    </div>
  )
}
