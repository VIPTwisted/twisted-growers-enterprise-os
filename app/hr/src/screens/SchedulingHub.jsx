import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ─── shared components ──────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      borderTop: `3px solid ${accent || 'var(--t-accent)'}`,
      padding: '18px 20px', borderRadius: 0, flex: 1, minWidth: 140,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const INP = { fontSize: 12, padding: '7px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none' }
const BTN = { fontSize: 11, fontWeight: 700, padding: '7px 14px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' }
const GHOST_BTN = { fontSize: 11, fontWeight: 600, padding: '7px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

function FilterBar({ dateFrom, setDateFrom, dateTo, setDateTo, search, setSearch, onRefresh, extraFilters }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>FROM</label>
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INP} />
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>TO</label>
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INP} />
      <input type="text" placeholder="Employee name..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, minWidth: 200 }} />
      {extraFilters}
      <button style={BTN} onClick={onRefresh}>↺ Refresh</button>
    </div>
  )
}

function PageHeader({ title, sub, isLive, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text)', margin: 0, textTransform: 'uppercase' }}>{title}</h1>
        {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <span style={{ fontSize: 9, fontWeight: 800, padding: '4px 9px', background: isLive ? 'var(--t-success)' : 'var(--t-text-faint)', color: '#fff', letterSpacing: '.08em', borderRadius: 0 }}>
          {isLive ? 'LIVE' : 'NO DATA'}
        </span>
      </div>
    </div>
  )
}

function QuickLinks({ links }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
      {links.map(({ label, to }) => (
        <NavLink key={to} to={to} style={GHOST_BTN}>{label}</NavLink>
      ))}
    </div>
  )
}

function SectionCard({ title, badge, children, action }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text)' }}>{title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {badge && <span style={{ fontSize: 9, padding: '2px 8px', background: 'var(--t-accent)', color: '#fff', fontWeight: 700, letterSpacing: '.06em' }}>{badge}</span>}
          {action}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

// ─── real-data helpers ───────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

// Monday of the week containing dateStr (schedule RPC is week-anchored on Monday).
function mondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().slice(0, 10)
}

const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}
const durH = (s, e) => {
  const a = toMin(s), b = toMin(e)
  if (a == null || b == null) return 0
  let d = b - a; if (d < 0) d += 1440
  return d / 60
}
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—')

// Shift slot label derived from the real start time (no fabricated shift type).
function slotLabel(start) {
  const h = toMin(start)
  if (h == null) return '—'
  if (h < 11 * 60) return 'Opening'
  if (h < 15 * 60) return 'Mid-Day'
  return 'Closing'
}

const OUT_TYPES = ['callout', 'no_show', 'ncns']

// Live status derived from real fields: the shift's exception (callout/no-show)
// and, for today, the current time against the scheduled start/end.
function deriveStatus(row, nowMin) {
  const exc = String(row.exception_type || '').toLowerCase()
  if (OUT_TYPES.includes(exc)) return 'CALLOUT'
  const isToday = String(row.shift_date || '').slice(0, 10) === TODAY
  if (!isToday) return 'SCHEDULED'
  const sm = toMin(row.start_time), em = toMin(row.end_time)
  if (sm == null || em == null) return 'SCHEDULED'
  if (nowMin < sm) return 'SCHEDULED'
  if (nowMin <= em) return 'ON SHIFT'
  return 'CLOCKED OUT'
}

function statusStyle(status) {
  const base = { fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 0, letterSpacing: '.06em', color: '#fff' }
  const bg = {
    'ON SHIFT':    'var(--t-success)',
    'SCHEDULED':   'var(--t-accent)',
    'CALLOUT':     'var(--t-danger)',
    'CLOCKED OUT': 'var(--t-text-faint)',
  }
  return { ...base, background: bg[status] || 'var(--t-text-muted)' }
}

// ── pending-request normalization (get_pending_requests buckets → flat rows) ──
const KIND_LABEL = { time_off: 'Time Off', swap: 'Shift Swap', claim: 'Shift Claim' }

function normOne(r, kind, i) {
  return {
    id:       r.id ?? r.request_id ?? r.claim_id ?? `${kind}-${i}`,
    kind,
    type:     kind === 'time_off' ? (r.type || 'Time Off') : KIND_LABEL[kind],
    employee: r.person_name || r.employee_name || r.full_name || r.requester_name || 'Employee',
    node:     r.node_name || r.org_nodes?.name || '',
    date:     String(r.start_date || r.shift_date || r.date || r.requested_date || '').slice(0, 10),
    status:   String(r.status || 'pending'),
  }
}

function inferKind(r) {
  const t = String(r.request_type || r.kind || r.type || '').toLowerCase()
  if (t.includes('swap')) return 'swap'
  if (t.includes('claim')) return 'claim'
  return 'time_off'
}

// get_pending_requests returns { time_off, shift_swaps, ... }; some deployments
// return a flat typed array. Handle both, honestly, with no fabricated rows.
function normalizePending(data) {
  if (!data) return []
  if (Array.isArray(data)) return data.map((r, i) => normOne(r, inferKind(r), i))
  const out = []
  ;(data.time_off || []).forEach((r, i) => out.push(normOne(r, 'time_off', i)))
  ;(data.shift_swaps || data.swaps || []).forEach((r, i) => out.push(normOne(r, 'swap', i)))
  ;(data.shift_claims || data.claims || []).forEach((r, i) => out.push(normOne(r, 'claim', i)))
  return out
}

// ─── styles object ───────────────────────────────────────────────────────────

const S = {
  page: {
    padding: '28px 32px',
    background: 'var(--t-bg)',
    minHeight: '100vh',
    fontFamily: 'inherit',
    color: 'var(--t-text)',
  },
  kpiRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
    borderBottom: '1px solid var(--t-line)',
    background: 'var(--t-surface-2)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontSize: 12,
    verticalAlign: 'middle',
  },
  coverageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 0,
  },
  coverageCard: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
    padding: 16,
  },
  coverageLocName: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text)',
    marginBottom: 10,
    borderBottom: '1px solid var(--t-line)',
    paddingBottom: 8,
  },
  coverageEmpName: {
    fontSize: 11,
    color: 'var(--t-text)',
    padding: '3px 0',
    borderBottom: '1px solid var(--t-line)',
  },
  coverageEmpty: {
    fontSize: 11,
    color: 'var(--t-text-faint)',
    fontStyle: 'italic',
  },
  coverageGapBadge: {
    display: 'inline-block',
    marginTop: 10,
    fontSize: 9,
    fontWeight: 800,
    padding: '3px 8px',
    background: 'var(--t-danger)',
    color: '#fff',
    letterSpacing: '.06em',
  },
  approveBtn: {
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 10px',
    background: 'var(--t-success)',
    border: 'none',
    color: '#fff',
    borderRadius: 0,
    cursor: 'pointer',
    marginRight: 4,
  },
  denyBtn: {
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 10px',
    background: 'var(--t-danger)',
    border: 'none',
    color: '#fff',
    borderRadius: 0,
    cursor: 'pointer',
  },
  locSelect: {
    ...INP,
    minWidth: 160,
  },
  errBox: {
    padding: '10px 14px', background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-danger)',
    color: 'var(--t-danger)', fontSize: 12, fontWeight: 600, marginBottom: 12, borderRadius: 0,
  },
}

// ─── main component ──────────────────────────────────────────────────────────

export default function SchedulingHub() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const navigate = useNavigate()

  const person = session?.person ?? {}
  const reviewerId = person.id || null

  // filter state
  const [dateFrom, setDateFrom] = useState(TODAY)
  const [dateTo,   setDateTo]   = useState(TODAY)
  const [search,   setSearch]   = useState('')
  const [locFilter, setLocFilter] = useState('All')

  // data state (100% live — no mock fallback)
  const [weekRows, setWeekRows] = useState([])
  const [pending,  setPending]  = useState([])
  const [gapsCount, setGapsCount] = useState(0)
  const [isLive,   setIsLive]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState(null)
  const [reqStates, setReqStates] = useState({}) // id -> 'approved' | 'denied'
  const [busy,     setBusy]     = useState({})
  const [drill,    setDrill]    = useState(null)
  const [toast,    setToast]    = useState(null)

  const weekStart = useMemo(() => mondayOf(dateFrom), [dateFrom])
  const nowMin = useMemo(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }, [])

  // ── fetch (real RPCs only) ───────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const ids = locationIds?.length ? locationIds : []
    if (!ids.length) {
      setWeekRows([]); setPending([]); setGapsCount(0); setIsLive(false); setErr(null); setLoading(false)
      return
    }
    setLoading(true); setErr(null)
    try {
      const [schRes, reqRes, gapRes] = await Promise.all([
        sb.rpc('get_week_schedule',   { p_node_ids: ids, p_week_start: weekStart, p_actor: reviewerId }),
        sb.rpc('get_pending_requests', { p_node_ids: ids }),
        sb.rpc('get_coverage_gaps',   { p_node_ids: ids, p_date_from: dateFrom, p_date_to: dateTo }),
      ])
      if (schRes.error) throw schRes.error
      if (reqRes.error) throw reqRes.error
      setWeekRows(Array.isArray(schRes.data) ? schRes.data : [])
      setPending(normalizePending(reqRes.data))
      // Coverage gaps are a supporting metric — tolerate its absence without
      // failing the whole page.
      setGapsCount(!gapRes.error && Array.isArray(gapRes.data) ? gapRes.data.length : 0)
      setReqStates({})
      setIsLive(true)
    } catch (e) {
      setWeekRows([]); setPending([]); setGapsCount(0); setIsLive(false)
      setErr(e?.message || 'Could not load scheduling data.')
    } finally {
      setLoading(false)
    }
  }, [locationIds, weekStart, dateFrom, dateTo, reviewerId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── derived schedule rows (real fields only) ─────────────────────────────────

  const scheduleRows = useMemo(() => weekRows.map((r, i) => ({
    id:         r.shift_id || `${r.full_name || 'row'}-${r.shift_date || ''}-${i}`,
    employee:   r.full_name || 'Unknown',
    location:   r.node_name || '—',
    role:       r.role_name || '—',
    slot:       slotLabel(r.start_time),
    start:      fmtTime(r.start_time),
    end:        fmtTime(r.end_time),
    hours:      durH(r.start_time, r.end_time),
    shift_date: String(r.shift_date || '').slice(0, 10),
    status:     deriveStatus(r, nowMin),
  })), [weekRows, nowMin])

  const locNames = useMemo(() => {
    const names = (locations || []).map(l => l.name).filter(Boolean)
    scheduleRows.forEach(r => { if (r.location && r.location !== '—' && !names.includes(r.location)) names.push(r.location) })
    return names
  }, [locations, scheduleRows])

  const inRange = useMemo(() => scheduleRows.filter(r =>
    (!dateFrom || r.shift_date >= dateFrom) && (!dateTo || r.shift_date <= dateTo)
  ), [scheduleRows, dateFrom, dateTo])

  const filteredSchedule = useMemo(() => inRange.filter(row => {
    const nameMatch = !search || row.employee?.toLowerCase().includes(search.toLowerCase())
    const locMatch  = locFilter === 'All' || row.location === locFilter
    return nameMatch && locMatch
  }), [inRange, search, locFilter])

  const todayRows = useMemo(() => scheduleRows.filter(r => r.shift_date === TODAY), [scheduleRows])

  // ── KPI computations (all derived from live schedule) ───────────────────────

  const kpiOnShift   = todayRows.filter(r => r.status === 'ON SHIFT').length
  const kpiScheduled = todayRows.filter(r => r.status !== 'CALLOUT').length
  const kpiCallouts  = todayRows.filter(r => r.status === 'CALLOUT').length

  const weeklyHours = useMemo(() => {
    const m = {}
    scheduleRows.forEach(r => { if (r.status !== 'CALLOUT') m[r.employee] = (m[r.employee] || 0) + r.hours })
    return m
  }, [scheduleRows])
  const empCount   = Object.keys(weeklyHours).length
  const totalHours = Object.values(weeklyHours).reduce((a, b) => a + b, 0)
  const avgWeek    = empCount ? totalHours / empCount : 0
  const otRisk     = Object.values(weeklyHours).filter(h => h >= 40).length

  // ── coverage board (today, by location) ──────────────────────────────────────

  const coverageData = useMemo(() => {
    const byLoc = {}
    const ensure = (loc) => { if (!byLoc[loc]) byLoc[loc] = { location: loc, onShift: [], scheduled: [], gaps: 0 } }
    locNames.forEach(ensure)
    todayRows.forEach(r => {
      ensure(r.location)
      if (r.status === 'ON SHIFT') byLoc[r.location].onShift.push(r.employee)
      else if (r.status === 'SCHEDULED') byLoc[r.location].scheduled.push(r.employee)
      if (r.status === 'CALLOUT') byLoc[r.location].gaps += 1
    })
    const order = locNames.length ? locNames : Object.keys(byLoc)
    return order.map(l => byLoc[l]).filter(Boolean)
  }, [todayRows, locNames])

  // ── request action handlers (real writes, per request kind) ─────────────────

  async function handleRequestAction(req, action) {
    const bkey = `${req.id}-${action}`
    if (busy[bkey] || reqStates[req.id]) return
    setBusy(b => ({ ...b, [bkey]: true }))
    const prevStates = reqStates
    setReqStates(s => ({ ...s, [req.id]: action === 'approve' ? 'approved' : 'denied' })) // optimistic
    try {
      let res
      if (req.kind === 'time_off') {
        res = await sb.rpc('review_time_off', { p_request_id: req.id, p_action: action, p_reviewer_id: reviewerId })
      } else if (req.kind === 'swap') {
        res = await sb.rpc('review_swap', { p_request_id: req.id, p_action: action })
      } else {
        res = await sb.rpc('review_shift_claim', { p_claim_id: req.id, p_action: action, p_reviewer_id: reviewerId })
      }
      if (res?.error) throw res.error
      showToast(`${req.employee} — ${action === 'approve' ? 'approved' : 'denied'}`)
      import('../lib/audit.js').then(m => m.logAudit(action === 'approve' ? 'Request Approved' : 'Request Denied', { target: req.employee, node: req.node, meta: { type: req.type } })).catch(() => {})
    } catch (e) {
      setReqStates(prevStates) // revert
      showToast(e?.message || 'Action failed — not saved.', 'error')
    } finally {
      setBusy(b => ({ ...b, [bkey]: false }))
    }
  }

  // ── Drill-down: KPI tiles expose the schedule/coverage rows behind them ─────
  const SHIFT_COLS = [
    { key: 'employee', label: 'Employee', value: r => r.employee },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role',     label: 'Role',     value: r => r.role },
    { key: 'slot',     label: 'Shift',    value: r => r.slot },
    { key: 'start',    label: 'Start',    value: r => r.start },
    { key: 'end',      label: 'End',      value: r => r.end },
    { key: 'status',   label: 'Status',   value: r => r.status },
  ]
  const HOURS_COLS = [
    { key: 'employee', label: 'Employee', value: r => r.employee },
    { key: 'hours',    label: 'Hours / Week', value: r => `${r.hours.toFixed(1)}h`, align: 'right', sortKey: r => r.hours },
  ]
  const COVERAGE_COLS = [
    { key: 'location', label: 'Location',  value: r => r.location },
    { key: 'onCount',  label: 'On Shift',  value: r => r.onShift.length, align: 'right', sortKey: r => r.onShift.length },
    { key: 'staff',    label: 'On Shift Staff', value: r => (r.onShift.length ? r.onShift.join(', ') : '—') },
    { key: 'gaps',     label: 'Gaps',      value: r => r.gaps, align: 'right', sortKey: r => r.gaps },
  ]
  const openDrill = (title, rows, accent, columns = SHIFT_COLS) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  const hoursRows = useMemo(
    () => Object.entries(weeklyHours).map(([employee, hours]) => ({ employee, hours })),
    [weeklyHours]
  )

  // ─────────────────────────────────────────────────────────────────────────

  const TH = ({ children, style }) => <th style={{ ...S.th, ...style }}>{children}</th>
  const TD = ({ children, style }) => <td style={{ ...S.td, ...style }}>{children}</td>

  const visiblePending = pending
  const pendingCount = visiblePending.filter(r => !reqStates[r.id]).length

  return (
    <div style={S.page}>
      <PageHeader
        title="Scheduling Hub"
        sub={`Week of ${weekStart} · ${person.full_name ?? ''}${person.role_name ? ' · ' + person.role_name : ''}`}
        isLive={isLive}
      >
        <button style={BTN} onClick={() => navigate('/schedule')}>+ New Shift</button>
        <button style={{ ...BTN, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }} onClick={() => navigate('/ai-schedule')}>AI Schedule</button>
      </PageHeader>

      {/* quick links */}
      <QuickLinks links={[
        { label: 'Schedule',       to: '/schedule' },
        { label: 'Calendar',       to: '/cal' },
        { label: 'Zones',          to: '/zones' },
        { label: 'Availability',   to: '/availability' },
        { label: 'Bookends',       to: '/bookends' },
        { label: 'Time Clock',     to: '/timeclock' },
        { label: 'TC Kiosk',       to: '/timeclock-kiosk' },
        { label: 'Attendance',     to: '/attendance' },
        { label: 'Callout',        to: '/callout' },
        { label: 'Coverage',       to: '/coverage' },
        { label: 'Shift Market',   to: '/shift-marketplace' },
        { label: 'AI Scheduler',   to: '/ai-schedule' },
      ]} />

      {err && <div style={S.errBox}>{err}</div>}

      {/* KPI row */}
      <div style={S.kpiRow}>
        <KpiTile label="On Shift Now"       value={kpiOnShift}   sub="Active right now"        accent="var(--t-success)" onClick={() => openDrill('On Shift Now', todayRows.filter(r => r.status === 'ON SHIFT'), 'var(--t-success)')} />
        <KpiTile label="Scheduled Today"    value={kpiScheduled} sub="Total shifts today"      accent="var(--t-accent)"  onClick={() => openDrill('Scheduled Today', todayRows.filter(r => r.status !== 'CALLOUT'), 'var(--t-accent)')} />
        <KpiTile label="Callouts Today"     value={kpiCallouts}  sub="Unplanned absences"      accent="var(--t-danger)"  onClick={() => openDrill('Callouts Today', todayRows.filter(r => r.status === 'CALLOUT'), 'var(--t-danger)')} />
        <KpiTile label="Open Coverage Gaps" value={gapsCount}    sub="Shifts needing coverage" accent="var(--t-warn)"    onClick={() => openDrill('Coverage — Today by Location', coverageData, 'var(--t-warn)', COVERAGE_COLS)} />
        <KpiTile label="Avg Hours / Week"   value={`${avgWeek.toFixed(1)}h`} sub={`${empCount} employee${empCount === 1 ? '' : 's'} scheduled`} accent="var(--t-accent)" onClick={() => openDrill('Weekly Hours by Employee', hoursRows, 'var(--t-accent)', HOURS_COLS)} />
        <KpiTile label="OT Risk"            value={otRisk}       sub="Employees ≥ 40h"         accent="var(--t-warn)"    onClick={() => openDrill('OT Risk — ≥ 40h This Week', hoursRows.filter(r => r.hours >= 40), 'var(--t-warn)', HOURS_COLS)} />
      </div>

      {/* filter bar */}
      <FilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo}     setDateTo={setDateTo}
        search={search}     setSearch={setSearch}
        onRefresh={fetchData}
        extraFilters={
          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            style={S.locSelect}
          >
            <option value="All">All Locations</option>
            {locNames.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        }
      />

      {/* schedule table */}
      <SectionCard
        title="Schedule"
        badge={`${filteredSchedule.length} shifts`}
        action={
          <button style={{ ...BTN, fontSize: 10 }} onClick={() => navigate('/schedule')}>
            Full View
          </button>
        }
      >
        {loading ? (
          <div style={{ color: 'var(--t-text-muted)', fontSize: 12, padding: '12px 0' }}>Loading schedule...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Location</TH>
                  <TH>Role</TH>
                  <TH>Shift</TH>
                  <TH>Start</TH>
                  <TH>End</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...S.td, color: 'var(--t-text-faint)', textAlign: 'center', padding: '20px 0' }}>
                      {locationIds?.length ? 'No shifts scheduled for the selected dates and filters.' : 'No locations in scope.'}
                    </td>
                  </tr>
                ) : filteredSchedule.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}
                  >
                    <TD style={{ fontWeight: 600 }}>{row.employee}</TD>
                    <TD>{row.location}</TD>
                    <TD>{row.role}</TD>
                    <TD>{row.slot}</TD>
                    <TD style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.start}</TD>
                    <TD style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.end}</TD>
                    <TD><span style={statusStyle(row.status)}>{row.status}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* coverage board */}
      <SectionCard
        title="Coverage Board"
        badge="Today"
        action={
          <button style={{ ...BTN, fontSize: 10 }} onClick={() => navigate('/coverage')}>
            Full Coverage
          </button>
        }
      >
        {coverageData.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No locations in scope.</div>
        ) : (
          <div style={S.coverageGrid}>
            {coverageData.map(loc => (
              <div key={loc.location} style={S.coverageCard}>
                <div style={S.coverageLocName}>{loc.location}</div>
                {loc.onShift.length === 0 ? (
                  <div style={S.coverageEmpty}>No one on shift now</div>
                ) : (
                  loc.onShift.map(name => (
                    <div key={name} style={S.coverageEmpName}>{name}</div>
                  ))
                )}
                {loc.scheduled.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 8 }}>
                    {loc.scheduled.length} scheduled today
                  </div>
                )}
                {loc.gaps > 0 && (
                  <div>
                    <span style={S.coverageGapBadge}>{loc.gaps} GAP{loc.gaps > 1 ? 'S' : ''}</span>
                  </div>
                )}
                {loc.gaps === 0 && loc.onShift.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: 'var(--t-success)', color: '#fff', letterSpacing: '.06em' }}>COVERED</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* pending requests */}
      <SectionCard
        title="Pending Requests"
        badge={`${pendingCount} pending`}
        action={
          <button style={{ ...BTN, fontSize: 10 }} onClick={() => navigate('/requests')}>
            All Requests
          </button>
        }
      >
        {visiblePending.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>
            {loading ? 'Loading requests...' : 'No pending requests in scope.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <TH>Type</TH>
                  <TH>Employee</TH>
                  <TH>Location</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Action</TH>
                </tr>
              </thead>
              <tbody>
                {visiblePending.map((req, i) => {
                  const resolved = reqStates[req.id]
                  const bk = `${req.id}-`
                  const inFlight = busy[`${bk}approve`] || busy[`${bk}deny`]
                  return (
                    <tr
                      key={req.id}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)',
                        opacity: resolved ? 0.5 : 1,
                      }}
                    >
                      <TD>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', letterSpacing: '.05em' }}>
                          {req.type}
                        </span>
                      </TD>
                      <TD style={{ fontWeight: 600 }}>{req.employee}</TD>
                      <TD>{req.node || '—'}</TD>
                      <TD style={{ fontFamily: 'monospace', fontSize: 11 }}>{req.date || '—'}</TD>
                      <TD>
                        {resolved ? (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 0, letterSpacing: '.06em', color: '#fff',
                            background: resolved === 'approved' ? 'var(--t-success)' : 'var(--t-danger)',
                          }}>
                            {resolved === 'approved' ? 'APPROVED' : 'DENIED'}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', background: 'var(--t-warn)', color: '#fff', letterSpacing: '.06em' }}>
                            {(req.status || 'PENDING').toUpperCase()}
                          </span>
                        )}
                      </TD>
                      <TD>
                        {!resolved && (
                          <>
                            <button
                              style={{ ...S.approveBtn, opacity: inFlight ? 0.6 : 1 }}
                              disabled={inFlight}
                              onClick={() => handleRequestAction(req, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              style={{ ...S.denyBtn, opacity: inFlight ? 0.6 : 1 }}
                              disabled={inFlight}
                              onClick={() => handleRequestAction(req, 'deny')}
                            >
                              Deny
                            </button>
                          </>
                        )}
                      </TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <DrillDown
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title}
        subtitle={drill?.subtitle}
        columns={drill?.columns || []}
        rows={drill?.rows || []}
        accent={drill?.accent}
      />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
          color: '#fff', padding: '12px 20px', fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
