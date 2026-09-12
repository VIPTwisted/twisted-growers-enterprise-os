import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import { useConfig } from '../lib/config.js'
import DrillDown from '../components/DrillDown.jsx'
import FilterBar from '../components/FilterBar.jsx'
import { useFilters, applyFilters } from '../lib/filters.js'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
// NOTE: locations are NOT hardcoded — they are derived live from the scoped
// roster + records (see `locations` memo in the main component).
const SHIFTS = ['1st', '2nd', 'Manager', 'Close']
const CALLOUT_TYPES = ['sick', 'personal', 'no-reason', 'emergency', 'scheduled']
const EVENT_TYPES = ['Callout', 'Late', 'NCNS', 'Early Departure', 'Perfect Attendance Note']
const TODAY = new Date().toISOString().slice(0, 10)

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
function isHR(roleName = '') {
  return HR_ROLES.some(r => roleName.toLowerCase().includes(r))
}

// ── LIVE DATA MAPPERS ─────────────────────────────────────────────────────────
// Map scope_shifts status → internal attendance status
function mapShiftStatus(shiftStatus) {
  if (!shiftStatus) return 'present'
  const s = shiftStatus.toLowerCase()
  if (s === 'clocked_in' || s === 'clocked_out' || s === 'completed') return 'present'
  if (s === 'no_show') return 'ncns'
  if (s === 'callout') return 'callout'
  if (s === 'late') return 'late'
  if (s === 'scheduled') return 'present' // scheduled but no clock data yet = optimistic
  return 'present'
}

// Merge scope_shifts + get_all_time_entries into the unified attendance record shape
function buildLiveRecords(shifts = [], timeEntries = []) {
  // Index time entries by person_id + work_date for O(1) lookup
  const teByKey = {}
  for (const te of timeEntries) {
    const key = `${te.person_id}__${te.work_date}`
    if (!teByKey[key]) teByKey[key] = []
    teByKey[key].push(te)
  }

  return shifts.map((s, idx) => {
    const shiftDate = (s.shift_date || '').slice(0, 10)
    const teList = teByKey[`${s.person_id || s.full_name}__${shiftDate}`] || []
    // pick the entry whose node_id matches the shift's node_id, or first entry
    const te = teList.find(e => e.node_id === s.node_id) || teList[0] || null

    // Derive clocked_in from time entry
    let clockedIn = null
    let minutesLate = 0
    let derivedStatus = mapShiftStatus(s.status)

    if (te && te.punched_in_at) {
      const punchTime = new Date(te.punched_in_at)
      clockedIn = punchTime.toTimeString().slice(0, 5)

      // Calculate lateness relative to shift start_time
      if (s.start_time) {
        const [sh, sm] = s.start_time.split(':').map(Number)
        const ph = punchTime.getHours()
        const pm = punchTime.getMinutes()
        const diffMins = (ph * 60 + pm) - (sh * 60 + sm)
        if (diffMins > 5) {
          minutesLate = diffMins
          derivedStatus = 'late'
        } else {
          derivedStatus = te.punched_out_at ? 'present' : 'present'
        }
      }
    } else if (derivedStatus === 'present' && shiftDate < TODAY) {
      // Past shift with no clock-in and status still 'scheduled' → treat as no_show
      if ((s.status || '').toLowerCase() === 'scheduled') {
        derivedStatus = 'ncns'
      }
    }

    // Derive location name from node_name
    const location = (s.node_name || '').replace(/^Twisted Growers\s*/i, '').trim() || 'Unknown'

    return {
      id: `live-${s.shift_id || idx}-${shiftDate}`,
      date: shiftDate,
      employee_id: s.person_id || s.full_name || `emp-${idx}`,
      person_id: s.person_id || null,
      node_id: s.node_id || null,
      person_name: s.full_name || 'Unknown',
      location,
      role: s.role_name || s.zone || '',
      shift: s.start_time ? `${s.start_time.slice(0,5)}–${(s.end_time || '').slice(0,5)}` : 'Unknown',
      scheduled_in: s.start_time ? s.start_time.slice(0, 5) : null,
      clocked_in: clockedIn,
      status: derivedStatus,
      minutes_late: minutesLate,
      reason: s.exception_type || '',
      covered_by: null,
      logged_by: 'Schedule',
      da_issued: false,
      points: 0,
    }
  })
}

// Map an attendance_incidents type → the screen's internal status vocabulary
const INCIDENT_STATUS = { tardy: 'late', callout: 'callout', ncns: 'ncns' }

// Turn a get_attendance_overview payload into unified attendance records.
// Only incidents on/after minDate are kept, so the 30-day KPI windows stay honest.
function buildIncidentRecords(overview = [], minDate = '0000-00-00') {
  const out = []
  for (const emp of overview) {
    const location = (emp.location || '').replace(/^Twisted Growers\s*/i, '').trim() || 'Unknown'
    for (const inc of (emp.incidents || [])) {
      const date = (inc.date || '').slice(0, 10)
      if (!date || date < minDate) continue
      out.push({
        id: `inc-${inc.id}`,
        date,
        employee_id: emp.person_id || emp.full_name,
        person_id: emp.person_id || null,
        node_id: emp.node_id || null,
        person_name: emp.full_name || 'Unknown',
        location,
        role: emp.role && emp.role !== '—' ? emp.role : '',
        shift: '—',
        scheduled_in: null,
        clocked_in: null,
        status: INCIDENT_STATUS[inc.type] || 'callout',
        minutes_late: 0,
        reason: inc.type === 'tardy' ? 'Tardy' : inc.type === 'ncns' ? 'No Call / No Show' : 'Callout',
        covered_by: null,
        logged_by: inc.recorded_by || 'System',
        da_issued: false,
        points: Number(inc.pts) || 0,
      })
    }
  }
  return out
}

// The overview also doubles as the full assigned roster (person_id + node_id present).
function peopleFromOverview(overview = []) {
  return overview
    .filter(e => e.person_id)
    .map(e => {
      const loc = (e.location || '').replace(/^Twisted Growers\s*/i, '').trim()
      return {
        id: e.person_id,
        person_id: e.person_id,
        node_id: e.node_id || null,
        full_name: e.full_name,
        person_name: e.full_name,
        node_name: loc,
        location: loc,
        role: e.role && e.role !== '—' ? e.role : '',
      }
    })
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dayOfWeek(iso) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00').getDay()]
}

function statusColor(status) {
  const map = {
    present: 'var(--t-success)',
    late: 'var(--t-warn)',
    callout: 'var(--t-alert)',
    ncns: 'var(--t-alert)',
    early_departure: 'var(--t-warn)',
  }
  return map[status] || 'var(--t-text-muted)'
}

function statusBadge(status) {
  const map = {
    present: 'badge green',
    late: 'badge amber',
    callout: 'badge red',
    ncns: 'badge red',
    early_departure: 'badge amber',
  }
  return map[status] || 'badge blue'
}

function statusLabel(status, mins) {
  if (status === 'present') return 'Present'
  if (status === 'late') return `Late (${mins}m)`
  if (status === 'callout') return 'Callout'
  if (status === 'ncns') return 'NCNS'
  if (status === 'early_departure') return 'Early Out'
  return status
}

function csvDownload(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0]).join(',')
  const lines = rows.map(r =>
    Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob([[headers, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── TOKENS (shared style fragments) ──────────────────────────────────────────
const S = {
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    color: 'var(--t-text-muted)',
    borderBottom: '1px solid var(--t-line)',
    whiteSpace: 'nowrap',
    background: 'transparent',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--t-line)',
    fontSize: 13,
    color: 'var(--t-text)',
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    display: 'block',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
}

// ── KPI TILE (reusable) ───────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color, size = 28, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ ...S.card, padding: '12px 14px', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--t-grad)' }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── FORENSIC KPI PANEL ────────────────────────────────────────────────────────
// Drill-down columns for attendance records
const ATT_COLS = [
  { key: 'person_name', label: 'Employee', value: r => r.person_name },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'role', label: 'Role', value: r => r.role || '—' },
  { key: 'date', label: 'Date', value: r => fmtDate(r.date), sortKey: r => r.date },
  { key: 'shift', label: 'Shift', value: r => r.shift || '—' },
  { key: 'status', label: 'Status', value: r => statusLabel(r.status, r.minutes_late) },
  { key: 'reason', label: 'Reason', value: r => r.reason || '—' },
]

function ForensicKpiPanel({ records, locations }) {
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent, cols = ATT_COLS) => setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: cols, rows, accent })
  const todayRecs = records.filter(r => r.date === TODAY)
  const allEmpIds = [...new Set(records.map(r => r.employee_id))]

  // Row 1 — Today
  const scheduledToday = todayRecs.length
  const clockedIn = todayRecs.filter(r => r.status === 'present' || r.status === 'late').length
  const calloutsToday = todayRecs.filter(r => r.status === 'callout').length
  const latesToday = todayRecs.filter(r => r.status === 'late').length
  const ncnsToday = todayRecs.filter(r => r.status === 'ncns').length
  const coverageRate = scheduledToday > 0 ? Math.round((clockedIn / scheduledToday) * 100) : 0

  // Row 2 — 30-Day Trends
  const totalCallouts30 = records.filter(r => r.status === 'callout').length
  const totalLates30 = records.filter(r => r.status === 'late').length
  const totalNcns30 = records.filter(r => r.status === 'ncns').length

  // Avg attendance rate per day
  const byDate = {}
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { present: 0, total: 0 }
    byDate[r.date].total++
    if (r.status === 'present' || r.status === 'late') byDate[r.date].present++
  })
  const dateRates = Object.entries(byDate).map(([date, v]) => ({ date, rate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0 }))
  const avgAttRate = dateRates.length > 0 ? Math.round(dateRates.reduce((s, d) => s + d.rate, 0) / dateRates.length) : 0
  const bestDay = dateRates.length > 0 ? dateRates.reduce((a, b) => b.rate > a.rate ? b : a) : null
  const worstDay = dateRates.length > 0 ? dateRates.reduce((a, b) => b.rate < a.rate ? b : a) : null

  // Row 3 — Pattern Analysis
  const calloutsByEmp = {}
  records.filter(r => r.status === 'callout').forEach(r => {
    calloutsByEmp[r.employee_id] = (calloutsByEmp[r.employee_id] || 0) + 1
  })
  const repeatOffenders = Object.values(calloutsByEmp).filter(c => c >= 3).length

  // Day-of-week callout rates
  const dowCallouts = { 1: 0, 5: 0, 0: 0, 6: 0 }
  const dowTotal = { 1: 0, 5: 0, 0: 0, 6: 0 }
  records.forEach(r => {
    const dow = new Date(r.date + 'T12:00:00').getDay()
    if ([0, 1, 5, 6].includes(dow)) {
      dowTotal[dow] = (dowTotal[dow] || 0) + 1
      if (r.status === 'callout') dowCallouts[dow] = (dowCallouts[dow] || 0) + 1
    }
  })
  const monCalloutRate = dowTotal[1] > 0 ? Math.round((dowCallouts[1] / dowTotal[1]) * 100) : 0
  const friCalloutRate = dowTotal[5] > 0 ? Math.round((dowCallouts[5] / dowTotal[5]) * 100) : 0
  const wkndCalloutRate = (dowTotal[0] + dowTotal[6]) > 0
    ? Math.round(((dowCallouts[0] + dowCallouts[6]) / (dowTotal[0] + dowTotal[6])) * 100) : 0

  // Peak season (last 7 days)
  const last7 = records.filter(r => {
    const d = new Date(TODAY); const rd = new Date(r.date + 'T12:00:00')
    d.setDate(d.getDate() - 7)
    return rd >= d
  }).filter(r => r.status === 'callout').length

  // DA triggers
  const daTriggers = repeatOffenders

  // Row 4 — Per-Location (locations derived from live data, never hardcoded)
  const locStats = {}
  locations.forEach(loc => { locStats[loc] = { scheduled: 0, present: 0, callouts: 0, lates: 0 } })
  records.filter(r => r.date === TODAY).forEach(r => {
    if (!locStats[r.location]) return
    locStats[r.location].scheduled++
    if (r.status === 'present' || r.status === 'late') locStats[r.location].present++
    if (r.status === 'callout') locStats[r.location].callouts++
    if (r.status === 'late') locStats[r.location].lates++
  })

  // ── Row-level arrays behind aggregate tiles ────────────────────────────────
  const isCallout = r => r.status === 'callout'
  const isLate = r => r.status === 'late'
  const isNcns = r => r.status === 'ncns'
  const isPresent = r => r.status === 'present' || r.status === 'late'
  const dow = r => new Date(r.date + 'T12:00:00').getDay()

  // Repeat offenders + DA triggers: the individual callout records for employees with 3+ callouts
  const repeatOffenderIds = new Set(Object.entries(calloutsByEmp).filter(([, c]) => c >= 3).map(([id]) => id))
  const repeatOffenderRows = records.filter(r => repeatOffenderIds.has(r.employee_id) && (isCallout(r) || isNcns(r)))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Best / worst day → the day's records
  const bestDayRows = bestDay ? records.filter(r => r.date === bestDay.date) : []
  const worstDayRows = worstDay ? records.filter(r => r.date === worstDay.date) : []

  // Avg attendance rate → all present/late records across the period
  const presentRows = records.filter(isPresent).sort((a, b) => b.date.localeCompare(a.date))

  // Per-DOW callout drill lists
  const monCalloutRows = records.filter(r => dow(r) === 1 && isCallout(r))
  const friCalloutRows = records.filter(r => dow(r) === 5 && isCallout(r))
  const wkndCalloutRows = records.filter(r => (dow(r) === 0 || dow(r) === 6) && isCallout(r))
  const last7Rows = records.filter(r => {
    const d = new Date(TODAY); const rd = new Date(r.date + 'T12:00:00')
    d.setDate(d.getDate() - 7)
    return rd >= d && isCallout(r)
  })
  const coverageRows = todayRecs.filter(isPresent)

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Row 1 */}
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--t-text-faint)', marginBottom: 6 }}>Today's Attendance</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiTile label="Scheduled" value={scheduledToday} color="var(--t-text)" onClick={() => openDrill('Scheduled Today', todayRecs, 'var(--t-grad)')} />
        <KpiTile label="Clocked In" value={clockedIn} color="var(--t-success)" onClick={() => openDrill('Clocked In Today', todayRecs.filter(isPresent), 'var(--t-success)')} />
        <KpiTile label="Callouts" value={calloutsToday} color={calloutsToday > 0 ? 'var(--t-alert)' : 'var(--t-text)'} onClick={() => openDrill('Callouts Today', todayRecs.filter(isCallout), 'var(--t-alert)')} />
        <KpiTile label="Lates" value={latesToday} color={latesToday > 1 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openDrill('Late Arrivals Today', todayRecs.filter(isLate), 'var(--t-warn)')} />
        <KpiTile label="NCNS" value={ncnsToday} color={ncnsToday > 0 ? 'var(--t-alert)' : 'var(--t-text)'} onClick={() => openDrill('No Call / No Show Today', todayRecs.filter(isNcns), 'var(--t-alert)')} />
        <KpiTile label="Coverage Rate" value={`${coverageRate}%`} color={coverageRate >= 80 ? 'var(--t-success)' : coverageRate >= 60 ? 'var(--t-warn)' : 'var(--t-alert)'} onClick={() => openDrill('Covered Shifts Today (Present + Late)', coverageRows, 'var(--t-success)')} />
      </div>

      {/* Row 2 */}
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--t-text-faint)', marginBottom: 6 }}>30-Day Trends</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiTile label="Total Callouts" value={totalCallouts30} color={totalCallouts30 > 10 ? 'var(--t-alert)' : 'var(--t-warn)'} onClick={() => openDrill('All Callouts (30 Days)', records.filter(isCallout), 'var(--t-alert)')} />
        <KpiTile label="Total Lates" value={totalLates30} color={totalLates30 > 12 ? 'var(--t-alert)' : 'var(--t-warn)'} onClick={() => openDrill('All Late Arrivals (30 Days)', records.filter(isLate), 'var(--t-warn)')} />
        <KpiTile label="Total NCNS" value={totalNcns30} color={totalNcns30 > 3 ? 'var(--t-alert)' : totalNcns30 > 0 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openDrill('All NCNS (30 Days)', records.filter(isNcns), 'var(--t-alert)')} />
        <KpiTile label="Avg Att. Rate" value={`${avgAttRate}%`} color={avgAttRate >= 85 ? 'var(--t-success)' : avgAttRate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)'} onClick={() => openDrill('Present / Late Records (30 Days)', presentRows, 'var(--t-success)')} />
        <KpiTile label="Best Day" value={bestDay ? `${bestDay.rate}%` : '—'} sub={bestDay ? `${fmtDate(bestDay.date)}` : ''} color="var(--t-success)" onClick={() => openDrill(bestDay ? `Best Day — ${fmtDate(bestDay.date)}` : 'Best Day', bestDayRows, 'var(--t-success)')} />
        <KpiTile label="Worst Day" value={worstDay ? `${worstDay.rate}%` : '—'} sub={worstDay ? `${fmtDate(worstDay.date)}` : ''} color="var(--t-alert)" onClick={() => openDrill(worstDay ? `Worst Day — ${fmtDate(worstDay.date)}` : 'Worst Day', worstDayRows, 'var(--t-alert)')} />
      </div>

      {/* Row 3 */}
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--t-text-faint)', marginBottom: 6 }}>Pattern Analysis</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiTile label="Repeat Offenders" value={repeatOffenders} sub="3+ callouts/30d" color={repeatOffenders > 2 ? 'var(--t-alert)' : repeatOffenders > 0 ? 'var(--t-warn)' : 'var(--t-success)'} onClick={() => openDrill('Repeat Offenders — Callout/NCNS Records', repeatOffenderRows, 'var(--t-alert)')} />
        <KpiTile label="Mon Callout Rate" value={`${monCalloutRate}%`} color={monCalloutRate > 20 ? 'var(--t-alert)' : monCalloutRate > 10 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openDrill('Monday Callouts', monCalloutRows, 'var(--t-alert)')} />
        <KpiTile label="Fri Callout Rate" value={`${friCalloutRate}%`} color={friCalloutRate > 20 ? 'var(--t-alert)' : friCalloutRate > 10 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openDrill('Friday Callouts', friCalloutRows, 'var(--t-alert)')} />
        <KpiTile label="Weekend Callouts" value={`${wkndCalloutRate}%`} color={wkndCalloutRate > 25 ? 'var(--t-alert)' : wkndCalloutRate > 12 ? 'var(--t-warn)' : 'var(--t-text)'} onClick={() => openDrill('Weekend Callouts', wkndCalloutRows, 'var(--t-alert)')} />
        <KpiTile label="Peak Season (7d)" value={last7} sub="recent callouts" color={last7 > 5 ? 'var(--t-alert)' : 'var(--t-warn)'} onClick={() => openDrill('Callouts — Last 7 Days', last7Rows, 'var(--t-warn)')} />
        <KpiTile label="DA Triggers" value={daTriggers} sub="threshold employees" color={daTriggers > 0 ? 'var(--t-alert)' : 'var(--t-success)'} onClick={() => openDrill('DA Trigger Records (Repeat Offenders)', repeatOffenderRows, 'var(--t-alert)')} />
      </div>

      {/* Row 4 — Per-Location compact table */}
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--t-text-faint)', marginBottom: 6 }}>Per-Location — Today</div>
      <div style={{ ...S.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Location', 'Scheduled', 'Present', 'Callouts', 'Lates', 'Rate %'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)', padding: 24 }}>No locations in scope.</td></tr>
            )}
            {locations.map((loc, i) => {
              const s = locStats[loc] || { scheduled: 0, present: 0, callouts: 0, lates: 0 }
              const rate = s.scheduled > 0 ? Math.round((s.present / s.scheduled) * 100) : 0
              return (
                <tr key={loc} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{loc}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{s.scheduled}</td>
                  <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-success)' }}>{s.present}</td>
                  <td style={{ ...S.td, textAlign: 'center', color: s.callouts > 0 ? 'var(--t-alert)' : 'var(--t-text)' }}>{s.callouts}</td>
                  <td style={{ ...S.td, textAlign: 'center', color: s.lates > 0 ? 'var(--t-warn)' : 'var(--t-text)' }}>{s.lates}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: rate >= 80 ? 'var(--t-success)' : rate >= 60 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{rate}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── CALLOUT MODAL ─────────────────────────────────────────────────────────────
function CalloutModal({ employee, date, points, recordedBy, expiryMonths, onClose, onSave }) {
  const [calloutType, setCalloutType] = useState('sick')
  const [note, setNote] = useState('')
  const [notifyMgr, setNotifyMgr] = useState(false)
  const [findCoverage, setFindCoverage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  async function handleSave() {
    if (!employee.person_id || !employee.node_id) {
      setSaveErr('Cannot log — this employee has no linked record/location. Open them from the live roster.')
      return
    }
    setSaving(true)
    setSaveErr('')
    // Persist the checkbox flags into the saved record — no silent dead inputs
    const flags = [notifyMgr ? 'manager notified' : null, findCoverage ? 'coverage requested' : null].filter(Boolean)
    try {
      const { error } = await sb.rpc('add_attendance_incident', {
        p_person_id: employee.person_id,
        p_node_id: employee.node_id,
        p_type: 'callout',
        p_points: points,
        p_reason: `Callout (${calloutType})${note ? ' — ' + note : ''}${flags.length ? ' [' + flags.join('; ') + ']' : ''}`,
        p_recorded_by: recordedBy ?? null,
        p_expiry_months: expiryMonths,
        p_incident_date: date,
      })
      if (error) throw error
      onSave()
    } catch (e) {
      setSaveErr(`Could not log this callout — it was NOT saved. ${e?.message || 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 440, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px' }}>Log Callout</span>
          <button className="btn-ghost btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Employee</label>
            <div style={{ padding: '10px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 13, fontWeight: 600 }}>
              {employee.person_name} — {employee.location}
            </div>
          </div>
          <div>
            <label style={S.label}>Callout Type</label>
            <select style={{ width: '100%' }} value={calloutType} onChange={e => setCalloutType(e.target.value)}>
              {CALLOUT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Note</label>
            <textarea
              style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13, resize: 'vertical', minHeight: 72, fontFamily: 'var(--font-sans)' }}
              placeholder="Manager notes..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={notifyMgr} onChange={e => setNotifyMgr(e.target.checked)} />
              Notify manager
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={findCoverage} onChange={e => setFindCoverage(e.target.checked)} />
              Find coverage
            </label>
          </div>
          {saveErr && (
            <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '10px 12px', fontSize: 12, color: 'var(--t-alert)' }}>
              {saveErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Log Callout'}
            </button>
            <button className="btn-ghost btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LATE MODAL ────────────────────────────────────────────────────────────────
function LateModal({ employee, date, points, recordedBy, expiryMonths, lateCount, onClose, onSave }) {
  const [minutes, setMinutes] = useState(15)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const autoDA = lateCount >= 2
  const autoNote = autoDA
    ? `Auto-generated disciplinary note: This is the ${lateCount + 1}th late arrival in 30 days. Verbal warning recommended per progressive discipline policy.`
    : ''

  async function handleSave() {
    if (!employee.person_id || !employee.node_id) {
      setSaveErr('Cannot log — this employee has no linked record/location. Open them from the live roster.')
      return
    }
    setSaving(true)
    setSaveErr('')
    try {
      const { error } = await sb.rpc('add_attendance_incident', {
        p_person_id: employee.person_id,
        p_node_id: employee.node_id,
        p_type: 'tardy',
        p_points: points,
        p_reason: `${minutes} minutes late${reason ? ' — ' + reason : ''}.${autoNote ? ' ' + autoNote : ''}`,
        p_recorded_by: recordedBy ?? null,
        p_expiry_months: expiryMonths,
        p_incident_date: date,
      })
      if (error) throw error
      onSave()
    } catch (e) {
      setSaveErr(`Could not log this late arrival — it was NOT saved. ${e?.message || 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 440, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px' }}>Log Late</span>
          <button className="btn-ghost btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Employee</label>
            <div style={{ padding: '10px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 13, fontWeight: 600 }}>
              {employee.person_name} — {employee.location}
            </div>
          </div>
          <div>
            <label style={S.label}>Minutes Late</label>
            <input
              type="number"
              min={1}
              max={480}
              style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13 }}
              value={minutes}
              onChange={e => setMinutes(Number(e.target.value))}
            />
          </div>
          <div>
            <label style={S.label}>Reason</label>
            <input
              type="text"
              style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13 }}
              placeholder="Traffic, car trouble, etc."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          {autoDA && (
            <div style={{ background: 'rgba(255,179,71,0.12)', border: '1px solid var(--t-warn)', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-warn)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Auto DA Note — {lateCount + 1}th Late</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{autoNote}</div>
            </div>
          )}
          {saveErr && (
            <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '10px 12px', fontSize: 12, color: 'var(--t-alert)' }}>
              {saveErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Log Late'}
            </button>
            <button className="btn-ghost btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LOG NOTE MODAL ────────────────────────────────────────────────────────────
function NoteModal({ employee, date, onClose, onSave }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  async function handleSave() {
    if (!note.trim()) return
    if (!employee.person_id) {
      setSaveErr('Cannot save — this employee has no linked record. Open them from the live roster.')
      return
    }
    setSaving(true)
    setSaveErr('')
    try {
      const { error } = await sb.rpc('log_attendance_event', {
        p_person_id: employee.person_id,
        p_node_id: employee.node_id ?? null,
        p_type: 'note',
        p_date: date,
        p_notes: note,
      })
      if (error) throw error
      onSave()
    } catch (e) {
      setSaveErr(`Could not save this note — it was NOT saved. ${e?.message || 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 400 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px' }}>Add Note</span>
          <button className="btn-ghost btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>{employee.person_name} — {employee.location}</div>
          <textarea
            style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13, resize: 'vertical', minHeight: 90, fontFamily: 'var(--font-sans)' }}
            placeholder="Manager note..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          {saveErr && (
            <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '10px 12px', fontSize: 12, color: 'var(--t-alert)' }}>
              {saveErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleSave} disabled={saving || !note.trim()}>
              {saving ? 'Saving...' : 'Save Note'}
            </button>
            <button className="btn-ghost btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 1 — DAILY LOG ─────────────────────────────────────────────────────────
function DailyLogTab({ records, isHRUser, points, recordedBy, expiryMonths, onLogged }) {
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [modal, setModal] = useState(null)
  const [ncnsSaving, setNcnsSaving] = useState(false)
  const [ncnsErr, setNcnsErr] = useState('')

  const dayRecs = useMemo(() =>
    records.filter(r => r.date === selectedDate).sort((a, b) => a.person_name.localeCompare(b.person_name))
  , [records, selectedDate])

  const lateCountByEmp = useMemo(() => {
    const m = {}
    records.filter(r => r.status === 'late').forEach(r => {
      m[r.employee_id] = (m[r.employee_id] || 0) + 1
    })
    return m
  }, [records])

  const present = dayRecs.filter(r => r.status === 'present' || r.status === 'late').length
  const late = dayRecs.filter(r => r.status === 'late').length
  const callout = dayRecs.filter(r => r.status === 'callout').length
  const ncns = dayRecs.filter(r => r.status === 'ncns').length
  const coverage = dayRecs.length > 0 ? Math.round((present / dayRecs.length) * 100) : 0

  function openModal(type, emp) { setNcnsErr(''); setModal({ type, emp }) }
  function closeModal() { setModal(null) }
  function handleSaved() { onLogged?.(); closeModal() }

  async function confirmNcns() {
    const emp = modal?.emp
    if (!emp?.person_id || !emp?.node_id) {
      setNcnsErr('Cannot flag — this employee has no linked record/location.')
      return
    }
    setNcnsSaving(true); setNcnsErr('')
    try {
      const { error } = await sb.rpc('add_attendance_incident', {
        p_person_id: emp.person_id,
        p_node_id: emp.node_id,
        p_type: 'ncns',
        p_points: points.ncns,
        p_reason: 'No Call / No Show',
        p_recorded_by: recordedBy ?? null,
        p_expiry_months: expiryMonths,
        p_incident_date: selectedDate,
      })
      if (error) throw error
      handleSaved()
    } catch (e) {
      setNcnsErr(`Could not flag NCNS — it was NOT saved. ${e?.message || 'Please try again.'}`)
    } finally {
      setNcnsSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ ...S.label, marginBottom: 0 }}>Date</label>
        <input
          type="date"
          style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13 }}
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{dayOfWeek(selectedDate)}, {fmtDate(selectedDate)}</span>
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>
          {dayRecs.length} scheduled
        </span>
      </div>

      <div style={{ ...S.card, overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Employee', 'Location', 'Shift', 'Sched. In', 'Clocked In', 'Status', 'Variance', ...(isHRUser ? ['Actions'] : [])].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayRecs.length === 0 && (
              <tr><td colSpan={isHRUser ? 8 : 7} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)', padding: 32 }}>No records for this date.</td></tr>
            )}
            {dayRecs.map((r, i) => {
              const variance = r.status === 'late' ? `+${r.minutes_late}m` : r.status === 'early_departure' ? 'Early' : r.status === 'ncns' || r.status === 'callout' ? 'Absent' : '—'
              const varColor = r.status === 'late' ? 'var(--t-warn)' : r.status === 'ncns' || r.status === 'callout' ? 'var(--t-alert)' : 'var(--t-text-muted)'
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, background: 'var(--t-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--t-on-grad)', flexShrink: 0 }}>
                        {initials(r.person_name)}
                      </div>
                      {r.person_name}
                    </div>
                  </td>
                  <td style={S.td}>{r.location}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.shift}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.scheduled_in || '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.clocked_in || '—'}</td>
                  <td style={S.td}>
                    <span className={statusBadge(r.status)} style={{ fontWeight: 700, ...(r.status === 'ncns' ? { fontWeight: 800 } : {}) }}>
                      {statusLabel(r.status, r.minutes_late)}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: 'var(--font-mono)', color: varColor, fontSize: 12, fontWeight: 700 }}>{variance}</td>
                  {isHRUser && (
                    <td style={{ ...S.td, padding: '6px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {r.status !== 'late' && (
                          <button className="btn-ghost btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => openModal('late', r)}>Late</button>
                        )}
                        {r.status !== 'callout' && (
                          <button className="btn-ghost btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => openModal('callout', r)}>Callout</button>
                        )}
                        {r.status !== 'ncns' && (
                          <button className="btn-ghost btn" style={{ fontSize: 10, padding: '3px 8px', borderColor: 'var(--t-alert)', color: 'var(--t-alert)' }} onClick={() => openModal('ncns', r)}>NCNS</button>
                        )}
                        <button className="btn-ghost btn" style={{ fontSize: 10, padding: '3px 8px', borderColor: 'var(--t-text-faint)', color: 'var(--t-text-faint)' }} onClick={() => openModal('note', r)}>Note</button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {dayRecs.length > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 12 }}>
          <span style={{ color: 'var(--t-success)' }}>Present <strong>{present}</strong></span>
          <span style={{ color: 'var(--t-warn)' }}>Late <strong>{late}</strong></span>
          <span style={{ color: 'var(--t-alert)' }}>Callout <strong>{callout}</strong></span>
          <span style={{ color: 'var(--t-alert)', fontWeight: 800 }}>NCNS <strong>{ncns}</strong></span>
          <span style={{ marginLeft: 'auto', color: coverage >= 80 ? 'var(--t-success)' : 'var(--t-warn)', fontWeight: 700 }}>Coverage {coverage}%</span>
        </div>
      )}

      {modal?.type === 'callout' && (
        <CalloutModal employee={modal.emp} date={selectedDate} points={points.callout} recordedBy={recordedBy} expiryMonths={expiryMonths} onClose={closeModal} onSave={handleSaved} />
      )}
      {modal?.type === 'late' && (
        <LateModal employee={modal.emp} date={selectedDate} points={points.tardy} recordedBy={recordedBy} expiryMonths={expiryMonths} lateCount={lateCountByEmp[modal.emp.employee_id] || 0} onClose={closeModal} onSave={handleSaved} />
      )}
      {modal?.type === 'note' && (
        <NoteModal employee={modal.emp} date={selectedDate} onClose={closeModal} onSave={handleSaved} />
      )}
      {modal?.type === 'ncns' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 380, padding: 28 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t-alert)', marginBottom: 12 }}>Flag as NCNS?</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
              {modal.emp.person_name} will be flagged as No Call / No Show for {fmtDate(selectedDate)}. This action will be logged (+{points.ncns}pt).
            </div>
            {ncnsErr && (
              <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '10px 12px', fontSize: 12, color: 'var(--t-alert)', marginBottom: 14 }}>
                {ncnsErr}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, background: 'var(--t-alert)' }} onClick={confirmNcns} disabled={ncnsSaving}>{ncnsSaving ? 'Saving...' : 'Confirm NCNS'}</button>
              <button className="btn-ghost btn" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TAB 2 — PATTERNS ──────────────────────────────────────────────────────────
function PatternsTab({ records, locations }) {
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterRole, setFilterRole] = useState('All')
  const [dateRange, setDateRange] = useState(30)

  // Derive unique roles from live records
  const roles = useMemo(() => {
    const liveRoles = [...new Set(records.map(r => r.role).filter(Boolean))]
    return ['All', ...liveRoles]
  }, [records])

  // Build per-employee stats from actual records
  const empStats = useMemo(() => {
    const cutoff = new Date(TODAY)
    cutoff.setDate(cutoff.getDate() - dateRange)
    const periodRecs = records.filter(r => new Date(r.date + 'T12:00:00') >= cutoff)

    // Index by employee_id
    const statsMap = {}
    periodRecs.forEach(r => {
      if (!statsMap[r.employee_id]) {
        statsMap[r.employee_id] = {
          id: r.employee_id,
          person_name: r.person_name,
          location: r.location,
          role: r.role,
          callouts: 0, lates: 0, ncns: 0, present: 0, total: 0,
          heatmap: [],
          daTriggered: false,
        }
      }
      statsMap[r.employee_id].total++
      if (r.status === 'callout') statsMap[r.employee_id].callouts++
      else if (r.status === 'late') statsMap[r.employee_id].lates++
      else if (r.status === 'ncns') statsMap[r.employee_id].ncns++
      else if (r.status === 'present') statsMap[r.employee_id].present++
    })

    // Build heatmap (7 days x 8 weeks)
    Object.values(statsMap).forEach(emp => {
      const grid = []
      for (let w = 7; w >= 0; w--) {
        const week = []
        for (let d = 6; d >= 0; d--) {
          const dd = new Date(TODAY)
          dd.setDate(dd.getDate() - (w * 7 + d))
          const dateStr = dd.toISOString().slice(0, 10)
          const rec = records.find(r => r.employee_id === emp.id && r.date === dateStr)
          week.push(rec ? rec.status : 'not-scheduled')
        }
        grid.push(week)
      }
      emp.heatmap = grid
      emp.daTriggered = emp.callouts >= 3 || emp.ncns >= 1
      emp.attRate = emp.total > 0 ? Math.round(((emp.present + emp.lates) / emp.total) * 100) : 100
    })

    return Object.values(statsMap)
      .filter(e => {
        if (filterLoc !== 'All' && e.location !== filterLoc) return false
        if (filterRole !== 'All' && e.role !== filterRole) return false
        return true
      })
      .sort((a, b) => (b.callouts + b.ncns * 2 + b.lates * 0.5) - (a.callouts + a.ncns * 2 + a.lates * 0.5))
  }, [records, filterLoc, filterRole, dateRange])

  function heatColor(status) {
    if (status === 'callout') return 'rgba(255,77,125,0.7)'
    if (status === 'ncns') return 'rgba(255,77,125,1)'
    if (status === 'late') return 'rgba(255,179,71,0.7)'
    if (status === 'present') return 'rgba(29,233,182,0.5)'
    if (status === 'early_departure') return 'rgba(255,179,71,0.4)'
    return 'rgba(255,255,255,0.05)'
  }

  function riskLevel(emp) {
    if (emp.ncns >= 1 || emp.callouts >= 5) return { label: 'Critical', cls: 'badge red' }
    if (emp.callouts >= 3 || emp.lates >= 4) return { label: 'High', cls: 'badge red' }
    if (emp.callouts >= 2 || emp.lates >= 3) return { label: 'Medium', cls: 'badge amber' }
    if (emp.callouts >= 1 || emp.lates >= 2) return { label: 'Low', cls: 'badge blue' }
    return { label: 'Good', cls: 'badge green' }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          {roles.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={dateRange} onChange={e => setDateRange(Number(e.target.value))}>
          <option value={7}>Last 7 Days</option>
          <option value={14}>Last 14 Days</option>
          <option value={30}>Last 30 Days</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, flexWrap: 'wrap' }}>
        {[
          ['Present', 'rgba(29,233,182,0.5)'],
          ['Late', 'rgba(255,179,71,0.7)'],
          ['Callout', 'rgba(255,77,125,0.7)'],
          ['NCNS', 'rgba(255,77,125,1)'],
          ['Not Scheduled', 'rgba(255,255,255,0.05)'],
        ].map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, background: color, border: '1px solid rgba(255,255,255,0.1)' }} />
            <span style={{ color: 'var(--t-text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {empStats.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>No employees match filters.</div>
        )}
        {empStats.map(emp => {
          const risk = riskLevel(emp)
          return (
            <div key={emp.id} style={{ ...S.card, padding: '14px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 50 }}>
                  <div style={{ width: 40, height: 40, background: 'var(--t-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--t-on-grad)' }}>
                    {initials(emp.person_name)}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{emp.person_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{emp.role} · {emp.location}</span>
                    <span className={risk.cls}>{risk.label}</span>
                    {emp.daTriggered && (
                      <span className="badge amber" style={{ fontWeight: 800 }}>DA Trigger — Verbal Warning Recommended</span>
                    )}
                    {emp.ncns >= 1 && (
                      <span className="badge red" style={{ fontWeight: 800 }}>NCNS FLAG</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                      Att. Rate: <strong style={{ color: emp.attRate >= 85 ? 'var(--t-success)' : emp.attRate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{emp.attRate}%</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                      Callouts: <strong style={{ color: emp.callouts >= 3 ? 'var(--t-alert)' : 'var(--t-text)' }}>{emp.callouts}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                      Lates: <strong style={{ color: emp.lates >= 3 ? 'var(--t-warn)' : 'var(--t-text)' }}>{emp.lates}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                      NCNS: <strong style={{ color: emp.ncns > 0 ? 'var(--t-alert)' : 'var(--t-text)' }}>{emp.ncns}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                    {emp.heatmap.map((week, wi) => (
                      <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {week.map((status, di) => (
                          <div
                            key={di}
                            title={status}
                            style={{
                              width: 10,
                              height: 10,
                              background: heatColor(status),
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Prog. Discipline</div>
                  {emp.daTriggered
                    ? <span className="badge amber" style={{ fontSize: 10 }}>Action Needed</span>
                    : <span className="badge green" style={{ fontSize: 10 }}>Clear</span>
                  }
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TAB 3 — CALLOUT LOG ───────────────────────────────────────────────────────
function CalloutLogTab({ records, isHRUser, locations }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterType, setFilterType] = useState('All')
  const [filterEmp, setFilterEmp] = useState('All')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(TODAY); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(TODAY)
  const [selected, setSelected] = useState(new Set())

  const calloutTypes = ['All', 'callout', 'late', 'ncns', 'early_departure']
  const empNames = useMemo(() => ['All', ...new Set(records.map(r => r.person_name))], [records])

  const filtered = useMemo(() => {
    return records
      .filter(r => ['callout', 'late', 'ncns', 'early_departure'].includes(r.status))
      .filter(r => filterLoc === 'All' || r.location === filterLoc)
      .filter(r => filterType === 'All' || r.status === filterType)
      .filter(r => filterEmp === 'All' || r.person_name === filterEmp)
      .filter(r => r.date >= dateFrom && r.date <= dateTo)
      .filter(r =>
        !search ||
        r.person_name.toLowerCase().includes(search.toLowerCase()) ||
        (r.reason || '').toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [records, filterLoc, filterType, filterEmp, dateFrom, dateTo, search])

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))
  }

  function exportCSV() {
    csvDownload(filtered.map(r => ({
      Date: r.date,
      Employee: r.person_name,
      Location: r.location,
      Type: r.status,
      Reason: r.reason || '',
      Shift: r.shift,
      CoveredBy: r.covered_by || '',
      LoggedBy: r.logged_by || '',
      DAIssued: r.da_issued ? 'Yes' : 'No',
    })), 'callout-log.csv')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13, width: 200 }}
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          {calloutTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
        </select>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ minWidth: 160 }}>
          {empNames.map(n => <option key={n}>{n}</option>)}
        </select>
        <input type="date" style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>to</span>
        <input type="date" style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="btn-ghost btn" style={{ marginLeft: 'auto', fontSize: 11, padding: '7px 14px' }} onClick={exportCSV}>Export CSV</button>
      </div>

      {isHRUser && selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, padding: '10px 14px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>{selected.size} selected</span>
          <button className="btn-ghost btn" style={{ fontSize: 11, padding: '5px 12px', borderColor: 'var(--t-alert)', color: 'var(--t-alert)' }} onClick={() => {
              if (selected.size === 0) return
              if (!window.confirm(`Issue disciplinary action for ${selected.size} employee(s)? You will be taken to the DA form.`)) return
              const empIds = [...new Set(filtered.filter(r => selected.has(r.id)).map(r => r.employee_id))]
              navigate('/disciplinary', { state: { preSelectedEmployees: empIds, action: 'create' } })
            }}>Issue DA for Selected</button>
        </div>
      )}

      <div style={{ ...S.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {isHRUser && (
                <th style={{ ...S.th, width: 36, textAlign: 'center' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
              )}
              {['Date', 'Employee', 'Location', 'Type', 'Reason', 'Shift', 'Covered By', 'Logged By', 'DA?'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={isHRUser ? 10 : 9} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)', padding: 32 }}>No events match filters.</td></tr>
            )}
            {filtered.map((r, i) => (
              <tr key={r.id} style={{ background: selected.has(r.id) ? 'rgba(0,229,255,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                {isHRUser && (
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  </td>
                )}
                <td style={{ ...S.td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.date}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{r.person_name}</td>
                <td style={S.td}>{r.location}</td>
                <td style={S.td}><span className={statusBadge(r.status)}>{r.status.toUpperCase()}</span></td>
                <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.reason || '—'}</td>
                <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.shift}</td>
                <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.covered_by || '—'}</td>
                <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.logged_by || '—'}</td>
                <td style={S.td}>
                  {r.da_issued
                    ? <span className="badge red">Yes</span>
                    : <span style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t-text-muted)' }}>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ── TAB 4 — LOG EVENT ─────────────────────────────────────────────────────────
// Event type → attendance_incidents type (others are logged as plain events)
const EVENT_INCIDENT_TYPE = { Callout: 'callout', Late: 'tardy', NCNS: 'ncns' }

function LogEventTab({ records, isHRUser, people, points, recordedBy, expiryMonths, onLogged }) {
  const navigate = useNavigate()
  const [empId, setEmpId] = useState('')
  const [eventType, setEventType] = useState('Callout')
  const [date, setDate] = useState(TODAY)
  const [shift, setShift] = useState('1st')
  const [notes, setNotes] = useState('')
  const [notifiedMgr, setNotifiedMgr] = useState(false)
  const [foundCoverage, setFoundCoverage] = useState(false)
  const [issueVerbal, setIssueVerbal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [err, setErr] = useState('')

  // Live assigned roster (from get_attendance_overview) — no mock fallback
  const employeeList = people
  const selectedEmp = employeeList.find(e => e.person_id === empId)

  const empCallouts = useMemo(() => {
    if (!empId) return 0
    return records.filter(r => r.employee_id === empId && r.status === 'callout').length
  }, [records, empId])

  async function handleSubmit() {
    if (!empId) { setErr('Please select an employee.'); return }
    setSaving(true); setErr('')
    // Persist shift + checkbox flags into the saved record — no silent dead inputs
    const flags = [
      `shift: ${shift}`,
      notifiedMgr ? 'manager notified' : null,
      foundCoverage ? 'coverage found' : null,
      issueVerbal && isHRUser ? 'verbal warning issued' : null,
    ].filter(Boolean)
    const flagStr = ` [${flags.join('; ')}]`
    try {
      const incType = EVENT_INCIDENT_TYPE[eventType]
      let error
      if (incType) {
        if (!selectedEmp?.node_id) throw new Error('Selected employee has no linked location.')
        const pts = incType === 'tardy' ? points.tardy : incType === 'ncns' ? points.ncns : points.callout
        ;({ error } = await sb.rpc('add_attendance_incident', {
          p_person_id: empId,
          p_node_id: selectedEmp.node_id,
          p_type: incType,
          p_points: pts,
          p_reason: (notes || `${eventType} logged via Attendance Manager`) + flagStr,
          p_recorded_by: recordedBy ?? null,
          p_expiry_months: expiryMonths,
          p_incident_date: date,
        }))
      } else {
        // Early Departure / Perfect Attendance Note — logged as a plain event
        ;({ error } = await sb.rpc('log_attendance_event', {
          p_person_id: empId,
          p_node_id: selectedEmp?.node_id || null,
          p_type: eventType.toLowerCase().replace(/ /g, '_'),
          p_date: date,
          p_notes: (notes || '') + flagStr,
        }))
      }
      if (error) throw error
      const wantsDA = issueVerbal && isHRUser
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      setEmpId(''); setNotes(''); setNotifiedMgr(false); setFoundCoverage(false); setIssueVerbal(false)
      onLogged?.()
      // "Issue Verbal Warning" is a real action — route into the disciplinary flow
      if (wantsDA) {
        navigate('/disciplinary', { state: { preSelectedEmployees: [empId], action: 'create' } })
      }
    } catch (e) {
      setErr(`Could not log this event — it was NOT saved. ${e?.message || 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {success && (
        <div style={{ background: 'rgba(29,233,182,0.15)', border: '1px solid var(--t-success)', padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--t-success)', fontWeight: 600 }}>
          Event logged successfully.
        </div>
      )}
      {err && (
        <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--t-alert)' }}>
          {err}
        </div>
      )}

      <div style={{ ...S.card, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={S.label}>Employee</label>
            <select style={{ width: '100%' }} value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">— Select —</option>
              {employeeList.map(e => (
                <option key={e.id || e.person_id} value={e.id || e.person_id}>
                  {e.full_name || e.person_name} · {e.node_name || e.location}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label}>Event Type</label>
            <select style={{ width: '100%' }} value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={S.label}>Date</label>
            <input
              type="date"
              style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13 }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div>
            <label style={S.label}>Shift</label>
            <select style={{ width: '100%' }} value={shift} onChange={e => setShift(e.target.value)}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={S.label}>Reason / Notes</label>
          <textarea
            style={{ width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 12px', fontSize: 13, resize: 'vertical', minHeight: 80, fontFamily: 'var(--font-sans)' }}
            placeholder="Reason, manager notes, context..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {empId && eventType === 'Callout' && empCallouts >= 2 && (
          <div style={{ background: 'rgba(255,179,71,0.1)', border: '1px solid var(--t-warn)', padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-warn)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
              Progressive Discipline Alert
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
              {selectedEmp?.full_name || selectedEmp?.person_name} has {empCallouts} callout{empCallouts !== 1 ? 's' : ''} in the last 30 days. A verbal warning is recommended under progressive discipline policy.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={notifiedMgr} onChange={e => setNotifiedMgr(e.target.checked)} />
            Notified Manager
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={foundCoverage} onChange={e => setFoundCoverage(e.target.checked)} />
            Found Coverage
          </label>
          {isHRUser && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={issueVerbal} onChange={e => setIssueVerbal(e.target.checked)} />
              Issue Verbal Warning (HR only)
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button className="btn" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Submit Event'}
          </button>
          <button className="btn-ghost btn" onClick={() => { setEmpId(''); setNotes(''); setErr('') }}>Clear</button>
        </div>
      </div>
    </div>
  )
}

// ── TAB 5 — REPORTS ───────────────────────────────────────────────────────────
function ReportsTab({ records, locations }) {
  const monthlyData = useMemo(() => {
    const months = []
    for (let m = 11; m >= 0; m--) {
      const d = new Date(TODAY)
      d.setDate(1)
      d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const monthRecs = records.filter(r => r.date.startsWith(key))
      const scheduled = monthRecs.length
      const present = monthRecs.filter(r => r.status === 'present' || r.status === 'late').length
      const callout = monthRecs.filter(r => r.status === 'callout').length
      const late = monthRecs.filter(r => r.status === 'late').length
      const ncns = monthRecs.filter(r => r.status === 'ncns').length
      const rate = scheduled > 0 ? Math.round((present / scheduled) * 100) : 0
      months.push({ key, label, scheduled, present, callout, late, ncns, rate })
    }
    return months
  }, [records])

  const locBreakdown = useMemo(() => {
    return locations.map(loc => {
      const recs = records.filter(r => r.location === loc)
      const scheduled = recs.length
      const present = recs.filter(r => r.status === 'present' || r.status === 'late').length
      const callout = recs.filter(r => r.status === 'callout').length
      const late = recs.filter(r => r.status === 'late').length
      const ncns = recs.filter(r => r.status === 'ncns').length
      const rate = scheduled > 0 ? Math.round((present / scheduled) * 100) : 0
      return { location: loc, scheduled, present, callout, late, ncns, rate }
    })
  }, [records, locations])

  const roleBreakdown = useMemo(() => {
    const roleMap = {}
    records.forEach(r => {
      if (!r.role) return
      if (!roleMap[r.role]) roleMap[r.role] = { role: r.role, scheduled: 0, present: 0, callout: 0, late: 0 }
      roleMap[r.role].scheduled++
      if (r.status === 'present' || r.status === 'late') roleMap[r.role].present++
      if (r.status === 'callout') roleMap[r.role].callout++
      if (r.status === 'late') roleMap[r.role].late++
    })
    return Object.values(roleMap).map(r => ({
      ...r,
      rate: r.scheduled > 0 ? Math.round((r.present / r.scheduled) * 100) : 0,
    })).sort((a, b) => b.callout - a.callout)
  }, [records])

  const dowData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days.map((name, dow) => {
      const recs = records.filter(r => new Date(r.date + 'T12:00:00').getDay() === dow)
      const callout = recs.filter(r => r.status === 'callout').length
      const total = recs.length
      const rate = total > 0 ? Math.round((callout / total) * 100) : 0
      return { name, callout, total, rate }
    })
  }, [records])

  const empStatsMap = useMemo(() => {
    const m = {}
    records.forEach(r => {
      if (!m[r.employee_id]) {
        m[r.employee_id] = {
          id: r.employee_id,
          person_name: r.person_name,
          location: r.location,
          scheduled: 0, present: 0, callout: 0, late: 0, ncns: 0,
        }
      }
      m[r.employee_id].scheduled++
      if (r.status === 'present') m[r.employee_id].present++
      if (r.status === 'callout') m[r.employee_id].callout++
      if (r.status === 'late') m[r.employee_id].late++
      if (r.status === 'ncns') m[r.employee_id].ncns++
    })
    return Object.values(m).map(e => ({
      ...e,
      rate: e.scheduled > 0 ? Math.round(((e.present + e.late) / e.scheduled) * 100) : 100,
    }))
  }, [records])

  const worstEmps = useMemo(() => [...empStatsMap].sort((a, b) => a.rate - b.rate).slice(0, 10), [empStatsMap])
  const perfectEmps = useMemo(() => empStatsMap.filter(e => e.rate >= 90).sort((a, b) => b.rate - a.rate).slice(0, 10), [empStatsMap])

  const maxRate = Math.max(...monthlyData.map(m => m.rate), 1)

  function exportMonthly() {
    csvDownload(monthlyData.map(m => ({
      Month: m.label,
      Scheduled: m.scheduled,
      Present: m.present,
      Callouts: m.callout,
      Lates: m.late,
      NCNS: m.ncns,
      'Rate %': m.rate,
    })), 'attendance-monthly.csv')
  }

  const SectionHead = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--t-text-muted)', marginTop: 28, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--t-line)' }}>
      {children}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-ghost btn" style={{ fontSize: 11, padding: '7px 14px' }} onClick={exportMonthly}>Export Monthly CSV</button>
      </div>

      <SectionHead>Monthly Trend — Last 12 Months</SectionHead>

      <div style={{ ...S.card, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Attendance Rate %</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
          {monthlyData.map(m => {
            const barH = Math.round((m.rate / maxRate) * 72)
            const color = m.rate >= 85 ? 'var(--t-success)' : m.rate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)'
            return (
              <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{m.rate}%</div>
                <div style={{ width: '100%', height: barH, background: color, opacity: 0.75, minHeight: 2 }} />
                <div style={{ fontSize: 9, color: 'var(--t-text-faint)', textAlign: 'center' }}>{m.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ ...S.card, overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{['Month', 'Scheduled', 'Present', 'Callout', 'Late', 'NCNS', 'Rate %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {monthlyData.map((m, i) => (
              <tr key={m.key} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                <td style={{ ...S.td, fontWeight: 600 }}>{m.label}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{m.scheduled}</td>
                <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-success)' }}>{m.present}</td>
                <td style={{ ...S.td, textAlign: 'center', color: m.callout > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{m.callout}</td>
                <td style={{ ...S.td, textAlign: 'center', color: m.late > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{m.late}</td>
                <td style={{ ...S.td, textAlign: 'center', color: m.ncns > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{m.ncns}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: m.rate >= 85 ? 'var(--t-success)' : m.rate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{m.rate}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead>By Location</SectionHead>
      <div style={{ ...S.card, overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{['Location', 'Scheduled', 'Present', 'Callouts', 'Lates', 'NCNS', 'Rate %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {locBreakdown.map((l, i) => (
              <tr key={l.location} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                <td style={{ ...S.td, fontWeight: 700 }}>{l.location}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{l.scheduled}</td>
                <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-success)' }}>{l.present}</td>
                <td style={{ ...S.td, textAlign: 'center', color: l.callout > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{l.callout}</td>
                <td style={{ ...S.td, textAlign: 'center', color: l.late > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{l.late}</td>
                <td style={{ ...S.td, textAlign: 'center', color: l.ncns > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{l.ncns}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: l.rate >= 85 ? 'var(--t-success)' : l.rate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{l.rate}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead>By Role</SectionHead>
      <div style={{ ...S.card, overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{['Role', 'Scheduled', 'Present', 'Callouts', 'Lates', 'Rate %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {roleBreakdown.map((r, i) => (
              <tr key={r.role} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                <td style={{ ...S.td, fontWeight: 600 }}>{r.role}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{r.scheduled}</td>
                <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-success)' }}>{r.present}</td>
                <td style={{ ...S.td, textAlign: 'center', color: r.callout > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{r.callout}</td>
                <td style={{ ...S.td, textAlign: 'center', color: r.late > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{r.late}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: r.rate >= 85 ? 'var(--t-success)' : r.rate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{r.rate}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead>Callout Rate by Day of Week</SectionHead>
      <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {dowData.map(d => {
            const barH = Math.round((d.rate / Math.max(...dowData.map(x => x.rate), 1)) * 60)
            return (
              <div key={d.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.rate > 15 ? 'var(--t-alert)' : d.rate > 8 ? 'var(--t-warn)' : 'var(--t-success)', fontFamily: 'var(--font-mono)' }}>{d.rate}%</div>
                <div style={{ width: '100%', height: Math.max(barH, 2), background: d.rate > 15 ? 'var(--t-alert)' : d.rate > 8 ? 'var(--t-warn)' : 'var(--t-success)', opacity: 0.7 }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>{d.name}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{d.callout} / {d.total}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <SectionHead>Top 10 Worst Attendance</SectionHead>
          <div style={{ ...S.card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Employee', 'Loc', 'Rate', 'Cal', 'Late', 'NCNS'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {worstEmps.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{e.person_name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', fontSize: 11 }}>{e.location}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: e.rate >= 85 ? 'var(--t-success)' : e.rate >= 70 ? 'var(--t-warn)' : 'var(--t-alert)' }}>{e.rate}%</td>
                    <td style={{ ...S.td, textAlign: 'center', color: e.callout > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{e.callout}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: e.late > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{e.late}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: e.ncns > 0 ? 'var(--t-alert)' : 'var(--t-text-muted)' }}>{e.ncns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionHead>Top 10 Perfect Attendance</SectionHead>
          <div style={{ ...S.card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Employee', 'Location', 'Rate', 'Present', 'Sched.'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {perfectEmps.length === 0 && (
                  <tr><td colSpan={5} style={{ ...S.td, color: 'var(--t-text-muted)', textAlign: 'center', padding: 20 }}>No perfect attendance records.</td></tr>
                )}
                {perfectEmps.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{e.person_name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', fontSize: 11 }}>{e.location}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: 'var(--t-success)' }}>{e.rate}%</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{e.present}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{e.scheduled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AttendanceManager() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const cfg = useConfig()

  const [tab, setTab] = useState('daily')
  const [records, setRecords] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const roleName = session?.person?.role_name || ''
  const isHRUser = isHR(roleName)

  // Incident point values + expiry come from White-Label config (same source as
  // the Attendance Points screen), so both screens stay in lockstep.
  const POINTS = useMemo(() => ({
    tardy:   cfg?.points_tardy   ?? 0.5,
    callout: cfg?.points_callout ?? 1.0,
    ncns:    cfg?.points_ncns    ?? 2.0,
  }), [cfg])
  const EXPIRY_MONTHS = cfg?.points_expiry_months ?? 6
  const recordedBy = session?.person?.id ?? getSession().id ?? null

  // ── global filters (custom date range + location + status + employee) ──
  const { fv, onChange, onClear } = useFilters()
  const STATUS_OPTS = [
    { value: 'present', label: 'Present' }, { value: 'late', label: 'Late' },
    { value: 'callout', label: 'Callout' }, { value: 'ncns', label: 'No-Show' },
    { value: 'early_departure', label: 'Early Departure' },
  ]
  // Live location list — derived from the scoped roster + records, never hardcoded
  const locations = useMemo(() => {
    const s = new Set()
    for (const p of people) if (p.location) s.add(p.location)
    for (const r of records) if (r.location && r.location !== 'Unknown') s.add(r.location)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [people, records])

  const FILTERS = useMemo(() => [
    { key: 'q', label: 'employee', type: 'search', width: 170 },
    { key: 'daterange', label: 'Date', type: 'daterange' },
    { key: 'location', label: 'Locations', type: 'multiselect', options: locations.map(l => ({ value: l, label: l })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: STATUS_OPTS },
  ], [locations])
  const filteredRecords = useMemo(() => applyFilters(records, fv, [
    { key: 'q', type: 'search', fields: ['person_name', 'role'] },
    { key: 'daterange', type: 'daterange', get: r => r.date },
    { key: 'location', type: 'multi', get: r => r.location },
    { key: 'status', type: 'multi', get: r => r.status },
  ]), [records, fv])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    // Date window: 30 days back to today (keeps KPI windows honest)
    const dateFrom = new Date(TODAY)
    dateFrom.setDate(dateFrom.getDate() - 30)
    const p_date_from = dateFrom.toISOString().slice(0, 10)
    const p_date_to = TODAY

    // Scope to the user's assigned nodes (fall back to the session's node list)
    const nodeIds = (locationIds?.length ? locationIds : getSession().nodes) || []

    if (!nodeIds.length) {
      setRecords([]); setPeople([]); setLoading(false)
      return
    }

    try {
      // Real reads, fired in parallel:
      //  • scope_shifts + get_all_time_entries → scheduled / present / late from clock data
      //  • get_attendance_overview            → logged callouts / tardies / NCNS + full roster
      const [shiftsRes, timeRes, ovRes] = await Promise.all([
        sb.rpc('scope_shifts', { p_node_ids: nodeIds }),
        sb.rpc('get_all_time_entries', { p_node_ids: nodeIds, p_date_from, p_date_to }),
        sb.rpc('get_attendance_overview', { p_node_ids: nodeIds }),
      ])

      // Only hard-fail if BOTH primary reads failed
      if (shiftsRes.error && ovRes.error) throw (shiftsRes.error || ovRes.error)

      const shifts = shiftsRes.error ? [] : (shiftsRes.data || [])
      const timeEntries = timeRes.error ? [] : (timeRes.data || [])
      const overviewRows = ovRes.error ? [] : (Array.isArray(ovRes.data) ? ovRes.data : [])

      const shiftRecs = buildLiveRecords(shifts, timeEntries)
      const incRecs = buildIncidentRecords(overviewRows, p_date_from)
      const roster = peopleFromOverview(overviewRows)

      // Backfill person_id / node_id on shift rows that lacked them, by name
      const byName = {}
      for (const p of roster) if (p.full_name) byName[p.full_name] = p
      for (const r of shiftRecs) {
        if ((!r.person_id || !r.node_id) && byName[r.person_name]) {
          r.person_id = r.person_id || byName[r.person_name].person_id
          r.node_id = r.node_id || byName[r.person_name].node_id
        }
      }

      // Merge: one record per person+date. A logged incident overrides the
      // shift-derived status, but keeps the shift's scheduling detail.
      const byKey = new Map()
      for (const r of shiftRecs) byKey.set(`${r.employee_id}__${r.date}`, r)
      for (const ir of incRecs) {
        const k = `${ir.employee_id}__${ir.date}`
        const ex = byKey.get(k)
        byKey.set(k, ex
          ? { ...ex, status: ir.status, reason: ex.reason || ir.reason, logged_by: ir.logged_by, points: ir.points, person_id: ex.person_id || ir.person_id, node_id: ex.node_id || ir.node_id }
          : ir)
      }

      setRecords([...byKey.values()])
      setPeople(roster)
    } catch (e) {
      setRecords([]); setPeople([])
      setLoadError(e?.message || 'Unable to load attendance data.')
    } finally {
      setLoading(false)
    }
  }, [locationIds])

  useEffect(() => { fetchData() }, [fetchData])

  const TABS = [
    { key: 'daily',    label: 'Daily Log' },
    { key: 'patterns', label: 'Patterns' },
    { key: 'callouts', label: 'Callout Log' },
    { key: 'log',      label: 'Log Event' },
    { key: 'reports',  label: 'Reports' },
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
            Attendance Manager
          </h1>
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {fmtDate(TODAY)}
          </span>
          {/* Live badge — data is always sourced from the HR backend */}
          <span className="badge green" style={{ fontSize: 10, fontWeight: 800 }}>Live</span>
          {isHRUser && <span className="badge blue" style={{ fontSize: 10 }}>HR Access</span>}
          {/* Refresh button */}
          <button
            className="btn-ghost btn"
            style={{ fontSize: 11, padding: '4px 10px', marginLeft: 4 }}
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
        <p style={{ color: 'var(--t-text-muted)', fontSize: 13, marginTop: 4 }}>
          Forensic attendance tracking, pattern analysis, and progressive discipline management
        </p>
      </div>

      {loadError && (
        <div style={{ background: 'rgba(255,77,125,0.12)', border: '1px solid var(--t-alert)', padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--t-alert)' }}>
          Couldn't load attendance data — {loadError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)' }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Loading attendance data...</div>
          <div style={{ width: 48, height: 2, background: 'var(--t-grad)', margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {/* Global filters — custom date range, location, status, employee */}
          <FilterBar filters={FILTERS} value={fv} onChange={onChange} onClear={onClear}
            resultCount={filteredRecords.length} resultLabel="records" savedViewsKey="attendance_mgr" />

          {/* Forensic KPI Panel — always visible */}
          <ForensicKpiPanel records={filteredRecords} locations={locations} />

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--t-line)', marginBottom: 20 }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 20px',
                  fontSize: 12,
                  fontWeight: tab === t.key ? 800 : 500,
                  color: tab === t.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === t.key ? '2px solid var(--t-accent)' : '2px solid transparent',
                  marginBottom: -2,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'daily'    && <DailyLogTab    records={filteredRecords} isHRUser={isHRUser} points={POINTS} recordedBy={recordedBy} expiryMonths={EXPIRY_MONTHS} onLogged={fetchData} />}
          {tab === 'patterns' && <PatternsTab    records={filteredRecords} locations={locations} />}
          {tab === 'callouts' && <CalloutLogTab  records={filteredRecords} isHRUser={isHRUser} locations={locations} />}
          {tab === 'log'      && <LogEventTab    records={records} isHRUser={isHRUser} people={people} points={POINTS} recordedBy={recordedBy} expiryMonths={EXPIRY_MONTHS} onLogged={fetchData} />}
          {tab === 'reports'  && <ReportsTab     records={filteredRecords} locations={locations} />}
        </>
      )}
    </div>
  )
}
