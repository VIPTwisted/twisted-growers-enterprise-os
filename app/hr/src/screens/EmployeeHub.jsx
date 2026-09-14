import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ── SHARED COMPONENTS ────────────────────────────────────────────────────────

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

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
const WEEK_AGO = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
const PROBATION_CUTOFF = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Derive employment status from real data only: an inactive person is
// terminated; a still-active person hired within the probation window (90d,
// from their real earliest assignment effective_from) is on probation.
function deriveStatus(emp) {
  if (emp.is_active === false) return 'TERMINATED'
  if (emp.effective_from && emp.effective_from >= PROBATION_CUTOFF) return 'PROBATION'
  return 'ACTIVE'
}

function statusColor(status) {
  if (status === 'ACTIVE') return 'var(--t-success)'
  if (status === 'PROBATION') return 'var(--t-warn)'
  return 'var(--t-danger)'
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

const S = {
  page: {
    padding: '24px 28px',
    background: 'var(--t-bg)',
    minHeight: '100vh',
    color: 'var(--t-text)',
    fontFamily: 'inherit',
  },
  kpiRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  locationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 16,
  },
  locationCard: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
    padding: '14px 16px',
  },
  locationName: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--t-text)',
    marginBottom: 10,
    borderBottom: '1px solid var(--t-line)',
    paddingBottom: 8,
  },
  locationStat: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'var(--t-text-muted)',
    marginBottom: 5,
  },
  locationStatVal: {
    fontWeight: 700,
    color: 'var(--t-text)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    padding: '9px 12px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
    background: 'var(--t-surface-2)',
    borderBottom: '1px solid var(--t-line)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    verticalAlign: 'middle',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background .12s',
  },
  statusBadge: {
    fontSize: 9,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 0,
    letterSpacing: '.06em',
    color: '#fff',
    display: 'inline-block',
  },
  locationSelect: {
    ...INP,
    minWidth: 160,
  },
  emptyRow: {
    padding: '28px 12px',
    textAlign: 'center',
    color: 'var(--t-text-faint)',
    fontSize: 12,
  },
}

export default function EmployeeHub() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const navigate = useNavigate()

  // Real location names in the current scope (drives the filter + breakdown).
  const scopeLocations = useMemo(() => (locations || []).map(l => l.name), [locations])
  // Node-id argument for RPCs (null = every reachable location).
  const nodeArg = useMemo(
    () => (locationIds && locationIds.length ? locationIds : null),
    [locationIds]
  )

  const [dateFrom, setDateFrom] = useState(MONTH_AGO)
  const [dateTo, setDateTo] = useState(TODAY)
  const [search, setSearch] = useState('')
  const [empId, setEmpId] = useState('')
  const [locationFilter, setLocationFilter] = useState('All')
  const [roster, setRoster] = useState([])
  const [summary, setSummary] = useState(null)      // { total_active, new_hires_30d, on_probation, terminations_30d, terminated[] }
  const [attendance, setAttendance] = useState(null) // { rate, attended, missed } | null
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [drill, setDrill] = useState(null)

  const loadRoster = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Reuse existing live RPCs for every dimension; author-new only for the
      // terminations-inclusive headcount summary (employee_hub_summary).
      const [rosterRes, timeRes, callRes, daRes, shiftRes, sumRes] = await Promise.all([
        sb.rpc('get_roster', { p_node_ids: nodeArg }),
        sb.rpc('get_all_time_entries', { p_node_ids: nodeArg, p_date_from: WEEK_AGO, p_date_to: TODAY }),
        sb.rpc('forensic_callouts', { p_node_ids: nodeArg, p_date_from: MONTH_AGO, p_date_to: TODAY }),
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeArg }),
        sb.rpc('scope_shifts', { p_node_ids: nodeArg }),
        sb.rpc('employee_hub_summary', { p_node_ids: nodeArg }),
      ])
      if (rosterRes.error) throw rosterRes.error

      const base = rosterRes.data || []
      const timeEntries = timeRes.error ? [] : (timeRes.data || [])
      const callouts = callRes.error ? [] : ((callRes.data && callRes.data.callouts) || [])
      const das = daRes.error ? [] : (daRes.data || [])
      const shifts = shiftRes.error ? [] : (shiftRes.data || [])

      // ── Per-person aggregates from real rows ──────────────────────────────
      const hoursByPerson = {}
      const onShiftByPerson = {}
      for (const t of timeEntries) {
        const h = Number(t.hours_worked) || 0
        hoursByPerson[t.person_id] = (hoursByPerson[t.person_id] || 0) + h
        if (t.work_date === TODAY && !t.punched_out_at) onShiftByPerson[t.person_id] = true
      }
      const calloutsByPerson = {}
      for (const c of callouts) {
        if (!c.employee_id) continue
        calloutsByPerson[c.employee_id] = (calloutsByPerson[c.employee_id] || 0) + 1
      }
      const openDaByPerson = {}
      for (const d of das) {
        if ((d.status || '').toLowerCase() !== 'active') continue
        openDaByPerson[d.person_id] = (openDaByPerson[d.person_id] || 0) + 1
      }

      const enriched = base.map(emp => ({
        ...emp,
        hours_week: Math.round((hoursByPerson[emp.id] || 0) * 10) / 10,
        callouts_30d: calloutsByPerson[emp.id] || 0,
        open_das: openDaByPerson[emp.id] || 0,
        on_shift: !!onShiftByPerson[emp.id],
        status: deriveStatus(emp),
      }))
      setRoster(enriched)

      // ── Attendance rate from real shift dispositions (last 30 days) ───────
      let attended = 0, missed = 0
      for (const s of shifts) {
        if (s.shift_date < MONTH_AGO || s.shift_date > TODAY) continue
        const st = (s.status || '').toLowerCase()
        if (st === 'clocked_in' || st === 'clocked_out' || st === 'completed' || st === 'worked') attended++
        else if (st === 'callout' || st === 'no_show' || st === 'absent') missed++
      }
      const denom = attended + missed
      setAttendance(denom > 0 ? { rate: Math.round((attended / denom) * 100), attended, missed } : null)

      setSummary(sumRes.error ? null : (sumRes.data || null))
      setIsLive(true)
    } catch (e) {
      setRoster([])
      setSummary(null)
      setAttendance(null)
      setIsLive(false)
      setLoadError(e?.message || 'Unable to load employee data.')
    } finally {
      setLoading(false)
    }
  }, [nodeArg])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const filteredRoster = useMemo(() => {
    return roster.filter(emp => {
      const matchSearch = !search || (emp.full_name || '').toLowerCase().includes(search.toLowerCase())
      const matchId = !empId || String(emp.id || '').toLowerCase().includes(empId.toLowerCase())
      const matchLoc = locationFilter === 'All' || emp.node_name === locationFilter
      return matchSearch && matchId && matchLoc
    })
  }, [roster, search, empId, locationFilter])

  // Locations present in real data, unioned with the session's scope locations.
  const locationNames = useMemo(() => {
    const set = new Set(scopeLocations)
    roster.forEach(e => { if (e.node_name) set.add(e.node_name) })
    return [...set].sort()
  }, [scopeLocations, roster])

  const locationStats = useMemo(() => {
    return locationNames.map(loc => {
      const emps = roster.filter(e => e.node_name === loc)
      return {
        name: loc,
        headcount: emps.length,
        keyHolders: emps.filter(e => /key\s*holder/i.test(e.role_name || '')).length,
        associates: emps.filter(e => /associate|budtender/i.test(e.role_name || '')).length,
        onShift: emps.filter(e => e.on_shift).length,
      }
    })
  }, [roster, locationNames])

  const locationCount = locationNames.length

  const person = session?.person || {}

  // ── Real KPI values (server summary is authoritative for headcount) ─────────
  const kActive = summary?.total_active ?? roster.filter(e => e.status !== 'TERMINATED').length
  const kNewHires = summary?.new_hires_30d ?? roster.filter(e => e.effective_from && e.effective_from >= MONTH_AGO).length
  const kTerminations = summary?.terminations_30d ?? 0
  const kProbation = summary?.on_probation ?? roster.filter(e => e.status === 'PROBATION').length
  const kOpenDas = roster.reduce((n, e) => n + (e.open_das || 0), 0)
  const terminatedRows = summary?.terminated || []

  // ── Forensic drill-down: real roster rows behind each KPI ──────────────────
  const EMP_COLS = [
    { key: 'full_name', label: 'Employee', value: e => e.full_name || '—' },
    { key: 'id', label: 'ID', value: e => e.login_id || e.id || '—' },
    { key: 'role_name', label: 'Role', value: e => e.role_name || '—' },
    { key: 'node_name', label: 'Location', value: e => e.node_name || '—' },
    { key: 'hours_week', label: 'Hrs/Wk', value: e => e.hours_week != null ? `${e.hours_week}h` : '—', align: 'right', sortKey: e => e.hours_week || 0 },
    { key: 'callouts_30d', label: 'Callouts 30d', value: e => e.callouts_30d ?? '—', align: 'right', sortKey: e => e.callouts_30d || 0 },
    { key: 'open_das', label: 'Open DAs', value: e => e.open_das ?? '—', align: 'right', sortKey: e => e.open_das || 0 },
    { key: 'status', label: 'Status', value: e => e.status || '—' },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: EMP_COLS, rows, accent,
  })

  return (
    <div style={S.page}>
      <PageHeader
        title="Employee Hub"
        sub={`${locationCount} location${locationCount !== 1 ? 's' : ''} · ${person.full_name || 'User'} · ${person.role_name || 'Staff'}`}
        isLive={isLive}
      />

      <QuickLinks links={[
        { label: 'Employees',         to: '/employees' },
        { label: 'Roster',            to: '/roster' },
        { label: 'Org Chart',         to: '/org-chart' },
        { label: 'Employee 360',      to: '/employee-360' },
        { label: 'Probation',         to: '/probation' },
        { label: 'Health Scores',     to: '/health-scores' },
        { label: 'Skills Matrix',     to: '/skills-matrix' },
        { label: 'Attendance Points', to: '/attendance-points' },
        { label: 'Coaching Log',      to: '/coaching-log' },
        { label: '1-on-1s',           to: '/one-on-ones' },
      ]} />

      {loadError && (
        <div style={{
          background: 'var(--t-surface)', border: '1px solid var(--t-danger)',
          borderLeft: '3px solid var(--t-danger)', color: 'var(--t-text)',
          padding: '12px 16px', marginBottom: 16, fontSize: 12, borderRadius: 0,
        }}>
          Unable to load live employee data: {loadError}
        </div>
      )}

      {/* KPI TILES */}
      <div style={S.kpiRow}>
        <KpiTile
          label="Total Active Employees"
          value={kActive}
          sub="across all locations"
          accent="var(--t-accent)"
          onClick={() => openDrill('All Employees', roster, 'var(--t-accent)')}
        />
        <KpiTile
          label="New Hires – 30 Days"
          value={kNewHires}
          sub="last 30 days"
          accent="var(--t-success)"
          onClick={() => openDrill('New Hires — Last 30 Days', roster.filter(e => e.effective_from && e.effective_from >= MONTH_AGO), 'var(--t-success)')}
        />
        <KpiTile
          label="Terminations – 30 Days"
          value={kTerminations}
          sub="last 30 days"
          accent="var(--t-danger)"
          onClick={() => openDrill('Terminated Employees — Last 30 Days', terminatedRows, 'var(--t-danger)')}
        />
        <KpiTile
          label="On Probation"
          value={kProbation}
          sub="within 90 days of hire"
          accent="var(--t-warn)"
          onClick={() => openDrill('Employees On Probation', roster.filter(e => e.status === 'PROBATION'), 'var(--t-warn)')}
        />
        <KpiTile
          label="Avg Attendance Rate"
          value={attendance ? `${attendance.rate}%` : '—'}
          sub={attendance ? `${attendance.attended} worked · ${attendance.missed} missed (30d)` : 'no shifts recorded'}
          accent="var(--t-success)"
          onClick={() => openDrill('Attendance — Employees With Callouts (30d)', [...roster].filter(e => e.callouts_30d > 0).sort((a, b) => b.callouts_30d - a.callouts_30d), 'var(--t-warn)')}
        />
        <KpiTile
          label="Open Disciplinary Actions"
          value={kOpenDas}
          sub="requires review"
          accent="var(--t-danger)"
          onClick={() => openDrill('Employees With Open Disciplinary Actions', [...roster].filter(e => e.open_das > 0).sort((a, b) => b.open_das - a.open_das), 'var(--t-danger)')}
        />
      </div>

      {/* FILTER BAR */}
      <FilterBar
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        search={search}
        setSearch={setSearch}
        empId={empId}
        setEmpId={setEmpId}
        onRefresh={loadRoster}
        extraFilters={
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            style={S.locationSelect}
          >
            <option value="All">All Locations</option>
            {locationNames.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        }
      />

      {/* LOCATION BREAKDOWN */}
      <SectionCard title="Location Breakdown" badge={`${locationStats.length} LOCATION${locationStats.length === 1 ? '' : 'S'}`}>
        {locationStats.length === 0 && (
          <div style={S.emptyRow}>
            {loading ? 'Loading locations…' : 'No locations in the current scope.'}
          </div>
        )}
        <div style={S.locationGrid}>
          {locationStats.map(loc => (
            <div key={loc.name}
              title="Click to drill into records"
              onClick={() => openDrill(`${loc.name} — Roster`, roster.filter(e => e.node_name === loc.name), 'var(--t-accent)')}
              style={{ ...S.locationCard, cursor: 'pointer' }}>
              <div style={S.locationName}>{loc.name}</div>
              <div style={S.locationStat}>
                <span>Headcount</span>
                <span style={S.locationStatVal}>{loc.headcount}</span>
              </div>
              <div style={S.locationStat}>
                <span>Key Holders</span>
                <span style={S.locationStatVal}>{loc.keyHolders}</span>
              </div>
              <div style={S.locationStat}>
                <span>Associates</span>
                <span style={S.locationStatVal}>{loc.associates}</span>
              </div>
              <div style={S.locationStat}>
                <span>On Shift Now</span>
                <span style={{
                  ...S.locationStatVal,
                  color: loc.onShift > 0 ? 'var(--t-success)' : 'var(--t-text-muted)',
                }}>{loc.onShift}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* EMPLOYEE ROSTER TABLE */}
      <SectionCard
        title="Employee Roster"
        badge={`${filteredRoster.length} RECORDS`}
        action={
          loading
            ? <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>Loading...</span>
            : null
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>ID</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>Location</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Hrs/Wk</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Callouts 30d</th>
                <th style={{ ...S.th, textAlign: 'right' }}>DAs</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={8} style={S.emptyRow}>
                    {loading ? 'Loading roster...' : 'No employees match the current filters.'}
                  </td>
                </tr>
              ) : (
                filteredRoster.map(emp => (
                  <tr
                    key={emp.id}
                    style={{
                      ...S.tr,
                      background: hoveredRow === emp.id ? 'var(--t-surface-2)' : 'transparent',
                    }}
                    onMouseEnter={() => setHoveredRow(emp.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => navigate('/employees')}
                  >
                    <td style={{ ...S.td, fontWeight: 600 }}>{emp.full_name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{emp.login_id || '—'}</td>
                    <td style={S.td}>{emp.role_name || '—'}</td>
                    <td style={S.td}>{emp.node_name || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{emp.hours_week}h</td>
                    <td style={{
                      ...S.td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: emp.callouts_30d >= 3 ? 'var(--t-warn)' : 'var(--t-text)',
                    }}>{emp.callouts_30d}</td>
                    <td style={{
                      ...S.td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: emp.open_das > 0 ? 'var(--t-danger)' : 'var(--t-text)',
                    }}>{emp.open_das}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <span style={{
                        ...S.statusBadge,
                        background: statusColor(emp.status),
                      }}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
