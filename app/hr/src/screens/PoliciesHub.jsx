import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
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

function FilterBar({ dateFrom, setDateFrom, dateTo, setDateTo, search, setSearch, empId, setEmpId, onRefresh, extraFilters }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>FROM</label>
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INP} />
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>TO</label>
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INP} />
      <input type="text" placeholder="Employee name..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, minWidth: 200 }} />
      <input type="text" placeholder="Employee ID..." value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...INP, width: 130 }} />
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
        <span style={{ fontSize: 9, fontWeight: 800, padding: '4px 9px', background: isLive ? 'var(--t-success)' : 'var(--t-warn)', color: '#fff', letterSpacing: '.08em', borderRadius: 0 }}>
          {isLive ? 'LIVE' : 'DEMO'}
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

// Disciplinary type normalization + level derivation (pure reference logic — the
// same raw tokens the shared disciplinary_records / get_disciplinary_actions RPC
// stores). No fabricated records: everything below renders live rows only.
const TYPE_FROM_RAW = {
  verbal_warning:    'Verbal Warning',
  written_warning:   'Written Warning',
  final_warning:     'Final Warning',
  suspension_paid:   'Suspension (Paid)',
  suspension_unpaid: 'Suspension (Unpaid)',
  suspension:        'Suspension',
  pip:               'PIP',
  termination:       'Termination',
}
function normalizeDaType(raw) {
  if (!raw) return 'Written Warning'
  const k = String(raw).toLowerCase().replace(/[\s-]+/g, '_')
  if (TYPE_FROM_RAW[k]) return TYPE_FROM_RAW[k]
  return String(raw).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function levelFromType(label) {
  const s = String(label).toLowerCase()
  if (s.includes('termination') || s.includes('suspension')) return 4
  if (s.includes('final')) return 3
  if (s.includes('written') || s.includes('pip')) return 2
  if (s.includes('verbal')) return 1
  return 2
}
const isSuspensionType = (label) => String(label).toLowerCase().includes('suspension')
const isOpenIncident = (s) => !['closed', 'resolved', 'dismissed'].includes(String(s || 'open').toLowerCase())
const isOpenDeadline = (s) => !['complete', 'completed', 'done', 'resolved', 'filed', 'closed'].includes(String(s || '').toLowerCase())

const QUICK_LINKS = [
  { label: 'Policies',             to: '/policies' },
  { label: 'Handbook',             to: '/handbook' },
  { label: 'Disciplinary',         to: '/disciplinary' },
  { label: 'Incidents',            to: '/incidents' },
  { label: 'Attendance Forensics', to: '/attendance-forensics' },
  { label: 'Exit Interviews',      to: '/exit-interviews' },
  { label: 'HR Investigations',    to: '/hr-investigations' },
  { label: 'FMLA / LOA',          to: '/fmla-loa' },
  { label: "Worker's Comp",        to: '/workers-comp' },
  { label: 'Suspensions',          to: '/suspensions' },
  { label: 'Rehires',              to: '/rehires' },
  { label: 'CT Compliance',        to: '/ct-compliance' },
  { label: 'HR Ops',               to: '/hr-ops' },
]

const CATEGORIES = ['All', 'Disciplinary', 'Leave', 'Compliance', 'Investigations']

// ─── INLINE STYLES ────────────────────────────────────────────────────────────

const S = {
  page: {
    background: 'var(--t-bg)',
    minHeight: '100vh',
    padding: '28px 32px',
    fontFamily: 'inherit',
    color: 'var(--t-text)',
  },
  th: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
    padding: '9px 12px',
    background: 'var(--t-surface-2)',
    borderBottom: '1px solid var(--t-line)',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  td: {
    fontSize: 12,
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    verticalAlign: 'middle',
  },
  tdMuted: {
    fontSize: 12,
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text-muted)',
    verticalAlign: 'middle',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  kpiRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  catBtn: (active) => ({
    fontSize: 11,
    fontWeight: active ? 800 : 600,
    padding: '6px 14px',
    background: active ? 'var(--t-accent)' : 'var(--t-surface)',
    border: `1px solid ${active ? 'var(--t-accent)' : 'var(--t-line)'}`,
    color: active ? '#fff' : 'var(--t-text-muted)',
    borderRadius: 0,
    cursor: 'pointer',
    letterSpacing: '.04em',
    transition: 'all .15s',
  }),
  levelBadge: (level) => ({
    fontSize: 9,
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: 0,
    letterSpacing: '.06em',
    color: '#fff',
    background: level >= 4 ? 'var(--t-danger)' : level === 3 ? 'var(--t-warn)' : level === 2 ? 'var(--t-accent)' : 'var(--t-text-muted)',
  }),
  statusBadge: (status) => ({
    fontSize: 9,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 0,
    letterSpacing: '.06em',
    color: '#fff',
    background: status === 'OPEN' || status === 'ACTIVE'
      ? 'var(--t-danger)'
      : status === 'RESOLVED' || status === 'RETURNING SOON'
        ? 'var(--t-success)'
        : 'var(--t-warn)',
    whiteSpace: 'nowrap',
  }),
  alertCard: (color) => ({
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderLeft: `4px solid ${color}`,
    borderRadius: 0,
    padding: '14px 16px',
    flex: 1,
    minWidth: 220,
  }),
  alertTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '.07em',
    textTransform: 'uppercase',
    color: 'var(--t-text)',
    marginBottom: 6,
  },
  alertSub: {
    fontSize: 11,
    color: 'var(--t-text-muted)',
    lineHeight: 1.5,
  },
  alertMeta: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--t-text-faint)',
    marginTop: 8,
    letterSpacing: '.06em',
  },
  trHover: {
    cursor: 'pointer',
  },
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function PoliciesHub() {
  const { locationIds, nodes } = useScope()
  const navigate = useNavigate()

  // node_id → location name resolver (from the live session node list)
  const nodeNameById = useMemo(() => {
    const m = new Map()
    ;(nodes || []).forEach(n => { if (n?.id) m.set(n.id, n.name) })
    return m
  }, [nodes])

  const [dateFrom, setDateFrom] = useState(MONTH_AGO)
  const [dateTo, setDateTo]     = useState(TODAY)
  const [search, setSearch]     = useState('')
  const [empId, setEmpId]       = useState('')
  const [category, setCategory] = useState('All')
  const [isLive, setIsLive]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [daRows, setDaRows]     = useState([])
  const [leaveRows, setLeaveRows] = useState([])
  const [incidents, setIncidents] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [checklist, setChecklist] = useState([])

  // ── Real Supabase fetch (reuses live HR-brain RPCs) ──────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const ids = locationIds || []
    if (!ids.length) {
      setDaRows([]); setLeaveRows([]); setIncidents([]); setDeadlines([]); setChecklist([])
      setIsLive(false); setLoading(false)
      return
    }
    try {
      const [da, lv, inc, dl, cl] = await Promise.all([
        sb.rpc('get_disciplinary_actions', { p_node_ids: ids }),
        sb.rpc('fmla_cases', { p_node_ids: ids }),
        sb.rpc('get_incidents', { p_node_ids: ids }),
        sb.rpc('compliance_deadlines_list', { p_node_ids: ids }),
        sb.rpc('compliance_checklist_get', { p_node_ids: ids }),
      ])
      const firstErr = da.error || lv.error || inc.error || dl.error || cl.error
      if (firstErr) throw firstErr

      // Disciplinary → table/KPI shape
      setDaRows((Array.isArray(da.data) ? da.data : []).map(r => {
        const type = normalizeDaType(r.da_type || r.type)
        const rawDate = r.da_date || r.issued_date || r.date || r.created_at || null
        const st = String(r.status || '').toLowerCase()
        return {
          id:       r.id,
          employee: r.person_name || '—',
          location: (r.node_id && nodeNameById.get(r.node_id)) || r.node_name || '—',
          type,
          level:    levelFromType(type),
          issued:   rawDate ? String(rawDate).slice(0, 10) : null,
          review:   r.follow_up_date ? String(r.follow_up_date).slice(0, 10) : null,
          status:   st === 'resolved' ? 'RESOLVED' : st === 'pending' ? 'PENDING REVIEW' : 'OPEN',
        }
      }))

      // FMLA / leave cases → table/KPI shape (fmla_cases returns camelCase jsonb)
      setLeaveRows((Array.isArray(lv.data) ? lv.data : []).map(r => ({
        id:        r.id,
        employee:  r.employeeName || '—',
        location:  r.location || '—',
        type:      r.type || 'FMLA',
        start:     r.startDate ? String(r.startDate).slice(0, 10) : null,
        return:    (r.actualReturn || r.expectedReturn) ? String(r.actualReturn || r.expectedReturn).slice(0, 10) : null,
        status:    String(r.status || 'ACTIVE').toUpperCase(),
        eligible:  r.fmlaEligible === true,
      })))

      setIncidents(Array.isArray(inc.data) ? inc.data : [])
      setDeadlines(Array.isArray(dl.data) ? dl.data : [])
      setChecklist(Array.isArray(cl.data) ? cl.data : [])
      setIsLive(true)
    } catch (e) {
      setDaRows([]); setLeaveRows([]); setIncidents([]); setDeadlines([]); setChecklist([])
      setIsLive(false)
      setLoadError('The compliance service is temporarily unavailable. ' + (e?.message || ''))
    } finally {
      setLoading(false)
    }
  }, [locationIds, nodeNameById])

  useEffect(() => { fetchData() }, [fetchData])

  const inRange = useCallback((d) => {
    if (!d) return true
    const s = String(d).slice(0, 10)
    if (dateFrom && s < dateFrom) return false
    if (dateTo && s > dateTo) return false
    return true
  }, [dateFrom, dateTo])

  // Filter DA rows (client-side; the read RPC is scoped by location, dates/text here)
  const filteredDAs = useMemo(() => {
    let rows = daRows.filter(r => inRange(r.issued))
    if (search) rows = rows.filter(r => r.employee?.toLowerCase().includes(search.toLowerCase()))
    if (empId)  rows = rows.filter(r => String(r.id ?? '').toLowerCase().includes(empId.toLowerCase()))
    return rows
  }, [daRows, search, empId, inRange])

  const filteredLeave = useMemo(() => {
    let rows = leaveRows.filter(r => inRange(r.start))
    if (search) rows = rows.filter(r => r.employee?.toLowerCase().includes(search.toLowerCase()))
    if (empId)  rows = rows.filter(r => String(r.id ?? '').toLowerCase().includes(empId.toLowerCase()))
    return rows
  }, [leaveRows, search, empId, inRange])

  // Compliance deadlines in scope, still open (drives alerts + review KPI)
  const openDeadlines = useMemo(
    () => deadlines.filter(d => isOpenDeadline(d.status)),
    [deadlines]
  )

  // ── KPI tile values (all derived from live rows) ─────────────────────────────
  const kpiActiveDAs   = useMemo(() => daRows.filter(r => r.status === 'OPEN').length, [daRows])
  const kpiOpenInvest  = useMemo(() => incidents.filter(r => isOpenIncident(r.status)).length, [incidents])
  const kpiFMLACases   = useMemo(() => leaveRows.filter(r => r.status !== 'RETURNED').length, [leaveRows])
  const kpiSuspensions = useMemo(
    () => daRows.filter(r => r.status === 'OPEN' && isSuspensionType(r.type)).length,
    [daRows]
  )
  const kpiPoliciesReview = openDeadlines.length
  const kpiComplianceScore = useMemo(() => {
    if (!checklist.length) return '—'
    const done = checklist.filter(c => c.checked === true).length
    return Math.round((done / checklist.length) * 100) + '%'
  }, [checklist])

  return (
    <div style={S.page}>
      <PageHeader
        title="Policies & Compliance Hub"
        sub="Central command for disciplinary actions, leave management, and compliance tracking across all Twisted Growers locations."
        isLive={isLive}
      >
        {loading && (
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)', letterSpacing: '.06em' }}>LOADING…</span>
        )}
      </PageHeader>

      {/* Quick Links */}
      <QuickLinks links={QUICK_LINKS} />

      {/* Filter Bar */}
      <FilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo}     setDateTo={setDateTo}
        search={search}     setSearch={setSearch}
        empId={empId}       setEmpId={setEmpId}
        onRefresh={fetchData}
        extraFilters={null}
      />

      {/* Load error (honest failure — no fabricated fallback) */}
      {loadError && (
        <div style={{
          background: 'var(--t-surface)', border: '1px solid var(--t-line)',
          borderLeft: '4px solid var(--t-danger)', borderRadius: 0,
          padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--t-text-muted)',
        }}>
          {loadError}
        </div>
      )}

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} style={S.catBtn(category === cat)} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* KPI Tiles */}
      <div style={S.kpiRow}>
        <KpiTile
          label="Active DAs"
          value={kpiActiveDAs}
          sub="Disciplinary actions open"
          accent="var(--t-danger)"
          onClick={() => navigate('/disciplinary')}
        />
        <KpiTile
          label="Open Investigations"
          value={kpiOpenInvest}
          sub="HR investigations in progress"
          accent="var(--t-danger)"
          onClick={() => navigate('/hr-investigations')}
        />
        <KpiTile
          label="FMLA / Leave Cases"
          value={kpiFMLACases}
          sub="Active leave cases"
          accent="var(--t-warn)"
          onClick={() => navigate('/fmla-loa')}
        />
        <KpiTile
          label="Suspensions Active"
          value={kpiSuspensions}
          sub="Currently suspended employees"
          accent="var(--t-danger)"
          onClick={() => navigate('/suspensions')}
        />
        <KpiTile
          label="Open Compliance Items"
          value={kpiPoliciesReview}
          sub="Deadlines awaiting action"
          accent="var(--t-warn)"
          onClick={() => navigate('/ct-compliance')}
        />
        <KpiTile
          label="Compliance Score"
          value={kpiComplianceScore}
          sub={checklist.length ? `${checklist.filter(c => c.checked).length}/${checklist.length} checklist items met` : 'No checklist tracked yet'}
          accent="var(--t-success)"
          onClick={() => navigate('/ct-compliance')}
        />
      </div>

      {/* Active Disciplinary Actions Table */}
      {(category === 'All' || category === 'Disciplinary') && (
        <SectionCard
          title="Active Disciplinary Actions"
          badge={`${filteredDAs.length} RECORD${filteredDAs.length !== 1 ? 'S' : ''}`}
          action={
            <button style={BTN} onClick={() => navigate('/disciplinary')}>
              View All
            </button>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Employee</th>
                  <th style={S.th}>Location</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Date Issued</th>
                  <th style={S.th}>Level</th>
                  <th style={S.th}>Due For Review</th>
                  <th style={S.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDAs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>
                      No disciplinary records match filters.
                    </td>
                  </tr>
                ) : (
                  filteredDAs.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{ ...S.trHover, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                      onClick={() => navigate('/disciplinary')}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--t-accent-rgb, 59,130,246),0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)'}
                    >
                      <td style={S.td}>{row.employee}</td>
                      <td style={S.tdMuted}>{row.location}</td>
                      <td style={S.td}>{row.type}</td>
                      <td style={S.tdMuted}>{row.issued}</td>
                      <td style={S.td}>
                        <span style={S.levelBadge(row.level)}>LEVEL {row.level}</span>
                      </td>
                      <td style={S.tdMuted}>{row.review}</td>
                      <td style={S.td}>
                        <span style={S.statusBadge(row.status)}>{row.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Leave & FMLA Tracker */}
      {(category === 'All' || category === 'Leave') && (
        <SectionCard
          title="Leave & FMLA Tracker"
          badge={`${filteredLeave.length} ACTIVE`}
          action={
            <button style={BTN} onClick={() => navigate('/fmla-loa')}>
              Manage Leave
            </button>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Employee</th>
                  <th style={S.th}>Location</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Start Date</th>
                  <th style={S.th}>Return Date</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>FMLA Eligible</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeave.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>
                      No leave records match filters.
                    </td>
                  </tr>
                ) : (
                  filteredLeave.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{ ...S.trHover, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                      onClick={() => navigate('/fmla-loa')}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)'}
                    >
                      <td style={S.td}>{row.employee}</td>
                      <td style={S.tdMuted}>{row.location}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{row.type}</td>
                      <td style={S.tdMuted}>{row.start}</td>
                      <td style={S.tdMuted}>{row.return}</td>
                      <td style={S.td}>
                        <span style={S.statusBadge(row.status)}>{row.status}</span>
                      </td>
                      <td style={S.td}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 0,
                          color: '#fff', letterSpacing: '.06em',
                          background: row.eligible ? 'var(--t-success)' : 'var(--t-text-muted)',
                        }}>{row.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Compliance Alerts (live compliance_deadlines rows still open) */}
      {(category === 'All' || category === 'Compliance') && (
        <SectionCard
          title="Compliance Alerts"
          badge={`${openDeadlines.length} ITEM${openDeadlines.length !== 1 ? 'S' : ''}`}
          action={
            <button style={BTN} onClick={() => navigate('/ct-compliance')}>
              View CT Compliance
            </button>
          }
        >
          {openDeadlines.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--t-text-faint)', letterSpacing: '.04em' }}>
              No open compliance deadlines. Add and track requirements in CT Compliance.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {openDeadlines.map((d) => {
                const overdue = d.due_date && String(d.due_date).slice(0, 10) < TODAY
                const color = overdue ? 'var(--t-danger)' : 'var(--t-warn)'
                return (
                  <div key={d.id} style={S.alertCard(color)}>
                    <div style={S.alertTitle}>{d.requirement}</div>
                    {d.notes && <div style={S.alertSub}>{d.notes}</div>}
                    <div style={S.alertMeta}>
                      {d.due_date ? `DUE: ${String(d.due_date).slice(0, 10)}` : 'NO DUE DATE'}
                      {overdue ? ' — OVERDUE' : ''}
                      {d.responsible ? ` — ${d.responsible}` : ''}
                      {d.status ? ` — ${String(d.status).toUpperCase()}` : ''}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button style={{ ...BTN, fontSize: 10, ...(overdue ? { background: 'var(--t-danger)' } : {}) }} onClick={() => navigate('/ct-compliance')}>
                        Review Deadline
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Investigations filtered view — live open-case count */}
      {category === 'Investigations' && (
        <SectionCard title="HR Investigations" badge={`${kpiOpenInvest} OPEN`}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', letterSpacing: '.06em', textAlign: 'center' }}>
              {kpiOpenInvest > 0
                ? `${kpiOpenInvest} open incident case${kpiOpenInvest !== 1 ? 's' : ''} in your locations. Full case management lives in the dedicated module.`
                : 'No open incident cases in your locations. Investigations are managed in the dedicated module.'}
            </div>
            <button style={BTN} onClick={() => navigate('/hr-investigations')}>
              Open HR Investigations
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
