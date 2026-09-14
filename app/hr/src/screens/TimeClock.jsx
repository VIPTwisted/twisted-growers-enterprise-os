import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { KEY, lsGet, lsSet, awardPoints, pushNotification } from '../lib/platform.js'
import DrillDown from '../components/DrillDown.jsx'
import { buildBriefing } from '../lib/greetings.js'
import PulseGate from '../components/PulseGate.jsx'
import { getPulseSettings, pulseDoneToday, pulseReminderText } from '../lib/pulse.js'

// count messages/alerts waiting for a person (task messages + coverage asks)
function pendingMsgCount(person) {
  let n = 0
  try {
    const tm = JSON.parse(localStorage.getItem('vip_task_messages') || '{}')
    Object.values(tm).flat().forEach(m => { if (m.to === person?.full_name) n++ })
    const cov = JSON.parse(localStorage.getItem('vip_coverage_requests') || '[]')
    cov.forEach(r => (r.recipients || []).forEach(rc => { if (rc.id === person?.id && rc.status === 'pending') n++ }))
  } catch (_) {}
  return n
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function todayStr() { return new Date().toISOString().slice(0, 10) }
function pad2(n) { return String(n).padStart(2, '0') }

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtTimeFull(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}
function fmtDateShort(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDayAbbr(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}
function fmtDateFull(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getWeekStart(offset = 0) {
  const d = new Date()
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day + offset * 7)
  d.setHours(0, 0, 0, 0)
  return d
}
function getWeekDates(offset = 0) {
  const start = getWeekStart(offset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}
function weekLabel(offset) {
  const dates = getWeekDates(offset)
  const s = new Date(dates[0] + 'T00:00:00')
  const e = new Date(dates[6] + 'T00:00:00')
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (offset === 0) return `This Week (${fmt(s)} – ${fmt(e)})`
  if (offset === -1) return `Last Week (${fmt(s)} – ${fmt(e)})`
  return `${fmt(s)} – ${fmt(e)}`
}

function calcHoursNum(inTs, outTs) {
  if (!inTs) return 0
  const end = outTs ? new Date(outTs) : new Date()
  const diff = (end - new Date(inTs)) / 3600000
  return diff > 0 ? diff : 0
}
function calcNetHours(inTs, outTs, breakMins = 0) {
  const raw = calcHoursNum(inTs, outTs)
  const autoBreak = raw > 5 ? 0.5 : 0
  const manualBreak = breakMins / 60
  return Math.max(0, raw - autoBreak - manualBreak)
}

function elapsedHms(since) {
  if (!since) return null
  const ms = Date.now() - new Date(since).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}
function elapsedMins(since) {
  if (!since) return 0
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000)
}

function isHR(roleName) {
  if (!roleName) return false
  const r = roleName.toLowerCase()
  return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(k => r.includes(k))
}

/* ══════════════════════════════════════════════════════════════
   CSV EXPORT
══════════════════════════════════════════════════════════════ */
function downloadCSV(filename, headers, rows) {
  const lines = [headers, ...rows].map(r =>
    r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* ══════════════════════════════════════════════════════════════
   DETERMINISTIC MOCK DATA
══════════════════════════════════════════════════════════════ */
// THE PUNCHES ARE ROWS (Bible §12g, 14 Sep 2026). The manager views used to draw a 30-day
// history for eighteen typed-in people from a seed. They now read hr.get_all_time_entries
// (hr.time_punches through the reach rule) for the last 30 days and the roster for the people;
// the store below is filled once by the root component and read synchronously by the tabs.
// Location sales per hour is not a number this screen holds — it shows '—'.
import { getLocationNames, locColor } from '../lib/locations.js'
const LOCATIONS = getLocationNames()
const LOC_SALES = {}   // revenue per location is not recorded here; revenue/hour shows '—'

const LIVE = { punches: [], employees: [], loaded: false, error: '' }
let ALL_EMPLOYEES = []   // filled from the roster; never a typed-in list
export function setTimeClockData({ punches, employees, error }) {
  LIVE.punches = Array.isArray(punches) ? punches : []
  LIVE.employees = Array.isArray(employees) ? employees : []
  LIVE.loaded = true
  LIVE.error = error || ''
  ALL_EMPLOYEES = LIVE.employees
}
function punchStatus(r, today) {
  if (r.punched_out_at) return 'complete'
  return String(r.work_date) === today ? 'active' : 'missing_out'
}
export function rowsToPunches(rows, roster) {
  const today = todayStr()
  const byId = Object.fromEntries((roster || []).map(e => [e.id, e]))
  return (rows || []).map(r => {
    const emp = byId[r.person_id] || {}
    const inAt = r.punched_in_at ? new Date(r.punched_in_at) : null
    return {
      id: r.id, person_id: r.person_id, full_name: r.full_name || emp.full_name || '—', role_name: emp.role_name || '—',
      location: r.node_name || emp.location || '—', work_date: String(r.work_date || '').slice(0, 10),
      punched_in_at: inAt ? inAt.toISOString().slice(0, 19) : null,
      punched_out_at: r.punched_out_at ? new Date(r.punched_out_at).toISOString().slice(0, 19) : null,
      status: punchStatus(r, today), break_mins: 0, is_late: false, hours_worked: r.hours_worked == null ? null : Number(r.hours_worked), notes: r.notes || '',
    }
  })
}
function getAllPunches() { return LIVE.punches }

function buildMyPunches(personId, weekDates) {
  const all = getAllPunches()
  const dateSet = new Set(weekDates)
  return all.filter(p => p.person_id === personId && dateSet.has(p.work_date))
}

/* ══════════════════════════════════════════════════════════════
   STYLE TOKENS
══════════════════════════════════════════════════════════════ */
const inputStyle = {
  width: '100%', background: 'var(--t-surface)', color: 'var(--t-text)',
  border: '1px solid var(--t-line)', padding: '8px 10px', fontSize: '13px',
  boxSizing: 'border-box', outline: 'none',
}
const btnPrimary = {
  padding: '10px 18px', background: 'var(--t-accent)', color: '#000',
  border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const btnGhost = {
  padding: '10px 18px', background: 'transparent', color: 'var(--t-text-muted)',
  border: '1px solid var(--t-line)', fontWeight: 600, fontSize: '13px',
  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
}
const btnSm = (color = 'var(--t-text-muted)') => ({
  fontSize: '10px', padding: '3px 8px', background: 'transparent',
  color, border: `1px solid ${color}`, cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.3px',
})
const thStyle = {
  padding: '9px 10px', textAlign: 'left', color: 'var(--t-text-muted)',
  fontWeight: 600, fontSize: '10px', textTransform: 'uppercase',
  letterSpacing: '0.5px', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap',
}
const tdStyle = { padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: '13px' }

/* ══════════════════════════════════════════════════════════════
   KPI TILE COMPONENT
══════════════════════════════════════════════════════════════ */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   FORENSIC KPI PANEL (always visible at top)
══════════════════════════════════════════════════════════════ */
// Drill-down column set for punch records
const PUNCH_COLS = [
  { key: 'full_name', label: 'Employee', value: p => p.full_name },
  { key: 'location', label: 'Location', value: p => p.location },
  { key: 'work_date', label: 'Date', value: p => fmtDateFull(p.work_date), sortKey: p => p.work_date },
  { key: 'punched_in_at', label: 'Clock In', value: p => fmtTime(p.punched_in_at), sortKey: p => p.punched_in_at || '' },
  { key: 'punched_out_at', label: 'Clock Out', value: p => p.punched_out_at ? fmtTime(p.punched_out_at) : 'Active', sortKey: p => p.punched_out_at || '' },
  { key: 'hours', label: 'Hours', align: 'right', value: p => `${calcHoursNum(p.punched_in_at, p.punched_out_at).toFixed(2)}h`, sortKey: p => calcHoursNum(p.punched_in_at, p.punched_out_at) },
  { key: 'status', label: 'Status', value: p => (p.status || '').toUpperCase() },
]

function ForensicKPIPanel({ now }) {
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent, cols = PUNCH_COLS) => setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: cols, rows, accent })
  const allPunches = getAllPunches()
  const today = todayStr()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  // Today's punches
  const todayPunches = allPunches.filter(p => p.work_date === today)
  const clockedInNow = todayPunches.filter(p => !p.punched_out_at && p.status === 'active')
  const clockedOutToday = todayPunches.filter(p => p.punched_out_at)
  const onBreak = clockedInNow.filter(p => p.break_mins > 0)
  const lateToday = todayPunches.filter(p => p.is_late)
  const missingPunches = allPunches.filter(p =>
    p.work_date === yesterdayStr && !p.punched_out_at && p.status === 'missing_out'
  )

  // OT risk: employees with >35h this week
  const weekDates = getWeekDates(0)
  const weekSet = new Set(weekDates)
  const weekPunches = allPunches.filter(p => weekSet.has(p.work_date))
  const empHoursMap = {}
  weekPunches.forEach(p => {
    if (!empHoursMap[p.person_id]) empHoursMap[p.person_id] = 0
    empHoursMap[p.person_id] += calcHoursNum(p.punched_in_at, p.punched_out_at)
  })
  const otRisk = Object.values(empHoursMap).filter(h => h > 35).length
  const totalHoursWeek = Object.values(empHoursMap).reduce((a, b) => a + b, 0)
  // OT-risk employee rollup rows (for drill-down)
  const empMeta = {}
  weekPunches.forEach(p => { if (!empMeta[p.person_id]) empMeta[p.person_id] = { full_name: p.full_name, location: p.location } })
  const otRiskRows = Object.entries(empHoursMap)
    .filter(([, h]) => h > 35)
    .map(([pid, h]) => ({ full_name: empMeta[pid]?.full_name || pid, location: empMeta[pid]?.location || '—', hours: h }))
  const weekHoursRows = Object.entries(empHoursMap)
    .map(([pid, h]) => ({ full_name: empMeta[pid]?.full_name || pid, location: empMeta[pid]?.location || '—', hours: h }))
  const EMP_HOURS_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'hours', label: 'Hours This Week', align: 'right', value: r => `${r.hours.toFixed(1)}h`, sortKey: r => r.hours },
  ]

  // Today totals
  const totalHoursToday = todayPunches.reduce((a, p) => a + calcHoursNum(p.punched_in_at, p.punched_out_at), 0)
  const completedShifts = clockedOutToday.length
  const avgShiftLen = completedShifts > 0
    ? (clockedOutToday.reduce((a, p) => a + calcHoursNum(p.punched_in_at, p.punched_out_at), 0) / completedShifts)
    : 0

  // Earliest / latest
  const inTimes = todayPunches.map(p => new Date(p.punched_in_at)).filter(Boolean).sort((a, b) => a - b)
  const outTimes = clockedOutToday.map(p => new Date(p.punched_out_at)).sort((a, b) => a - b)
  const earliest = inTimes.length > 0 ? fmtTime(inTimes[0].toISOString()) : '—'
  const latest = outTimes.length > 0 ? fmtTime(outTimes[outTimes.length - 1].toISOString()) : '—'

  // Punch accuracy: punches with both in+out vs total completed
  const weekCompleted = weekPunches.filter(p => p.punched_out_at)
  const punchAccuracy = weekCompleted.length > 0
    ? Math.round((weekCompleted.filter(p => p.status === 'approved').length / weekCompleted.length) * 100)
    : 100

  // By-location stats
  const locStats = LOCATIONS.map(loc => {
    const locToday = todayPunches.filter(p => p.location === loc)
    const locWeek = weekPunches.filter(p => p.location === loc)
    const locEmpHours = {}
    locWeek.forEach(p => {
      if (!locEmpHours[p.person_id]) locEmpHours[p.person_id] = 0
      locEmpHours[p.person_id] += calcHoursNum(p.punched_in_at, p.punched_out_at)
    })
    return {
      loc,
      clockedIn: locToday.filter(p => !p.punched_out_at && p.status === 'active').length,
      hoursToday: locToday.reduce((a, p) => a + calcHoursNum(p.punched_in_at, p.punched_out_at), 0),
      otRisk: Object.values(locEmpHours).filter(h => h > 35).length,
      missing: missingPunches.filter(p => p.location === loc).length,
    }
  })

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 8 }}>
        <KTile label="Clocked In Now" value={clockedInNow.length} sub="employees active" color="var(--t-success)" onClick={() => openDrill('Clocked In Now', clockedInNow, 'var(--t-success)')} />
        <KTile label="Clocked Out Today" value={clockedOutToday.length} sub="shifts completed" color="var(--t-text)" onClick={() => openDrill('Clocked Out Today', clockedOutToday, 'var(--t-accent)')} />
        <KTile label="On Break" value={onBreak.length} sub="mid-shift break" color="var(--t-warn)" alert={onBreak.length > 2 ? 'amber' : null} onClick={() => openDrill('On Break', onBreak, 'var(--t-warn)')} />
        <KTile label="Late Today" value={lateToday.length} sub=">5 min after sched" color={lateToday.length > 0 ? 'var(--t-warn)' : 'var(--t-text)'} alert={lateToday.length > 0 ? 'amber' : null} onClick={() => openDrill('Late Arrivals Today', lateToday, 'var(--t-warn)')} />
        <KTile label="Missing Punches" value={missingPunches.length} sub="no clock-out yesterday" color={missingPunches.length > 0 ? 'var(--t-danger)' : 'var(--t-text)'} alert={missingPunches.length > 0 ? 'red' : null} onClick={() => openDrill('Missing Punches (No Clock-Out)', missingPunches, 'var(--t-danger)')} />
        <KTile label="OT Risk" value={otRisk} sub=">35h this week" color={otRisk > 0 ? 'var(--t-danger)' : 'var(--t-text)'} alert={otRisk > 0 ? 'amber' : null} onClick={() => openDrill('Overtime Risk (>35h this week)', otRiskRows, 'var(--t-danger)', EMP_HOURS_COLS)} />
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 8 }}>
        <KTile label="Total Hours Today" value={`${totalHoursToday.toFixed(1)}h`} sub="all employees" color="var(--t-accent)" onClick={() => openDrill("Today's Punches", todayPunches, 'var(--t-accent)')} />
        <KTile label="Avg Shift Length" value={`${avgShiftLen.toFixed(1)}h`} sub="completed shifts" color="var(--t-text)" onClick={() => openDrill('Completed Shifts Today', clockedOutToday, 'var(--t-accent)')} />
        <KTile label="Earliest Clock-In" value={earliest} sub="today's first punch" color="var(--t-text)" onClick={() => openDrill("Today's Clock-Ins", todayPunches, 'var(--t-accent)')} />
        <KTile label="Latest Clock-Out" value={latest} sub="today's last out" color="var(--t-text)" onClick={() => openDrill("Today's Clock-Outs", clockedOutToday, 'var(--t-accent)')} />
        <KTile label="Punch Accuracy" value={`${punchAccuracy}%`} sub="approved/total this wk" color={punchAccuracy < 90 ? 'var(--t-warn)' : 'var(--t-success)'} alert={punchAccuracy < 85 ? 'amber' : null} onClick={() => openDrill('Completed Punches This Week', weekCompleted, 'var(--t-success)')} />
        <KTile label="Payroll Hours (Wk)" value={`${totalHoursWeek.toFixed(0)}h`} sub="all staff this week" color="var(--t-text)" onClick={() => openDrill('Hours by Employee — This Week', weekHoursRows, 'var(--t-accent)', EMP_HOURS_COLS)} />
      </div>

      {/* Row 3: By-location table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>By Location</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Location', 'In Now', 'Hrs Today', 'OT Risk', 'Missing Punch'].map(h => (
                <th key={h} style={{ ...thStyle, fontSize: 10, padding: '5px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locStats.map(s => (
              <tr key={s.loc} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ ...tdStyle, padding: '6px 10px', fontWeight: 700, color: 'var(--t-text)' }}>{s.loc}</td>
                <td style={{ ...tdStyle, padding: '6px 10px', fontFamily: 'monospace', color: 'var(--t-success)' }}>{s.clockedIn}</td>
                <td style={{ ...tdStyle, padding: '6px 10px', fontFamily: 'monospace' }}>{s.hoursToday.toFixed(1)}h</td>
                <td style={{ ...tdStyle, padding: '6px 10px' }}>
                  {s.otRisk > 0
                    ? <span className="badge amber" style={{ fontSize: 10 }}>{s.otRisk} emp</span>
                    : <span style={{ color: 'var(--t-text-faint)' }}>—</span>}
                </td>
                <td style={{ ...tdStyle, padding: '6px 10px' }}>
                  {s.missing > 0
                    ? <span className="badge red" style={{ fontSize: 10 }}>{s.missing}</span>
                    : <span style={{ color: 'var(--t-text-faint)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   FIX PUNCH MODAL
══════════════════════════════════════════════════════════════ */
function FixPunchModal({ punch, personId, managerId, onClose, onSave }) {
  const [form, setForm] = useState({
    date: punch?.work_date || todayStr(),
    clockIn: punch?.punched_in_at ? new Date(punch.punched_in_at).toTimeString().slice(0, 5) : '',
    clockOut: punch?.punched_out_at ? new Date(punch.punched_out_at).toTimeString().slice(0, 5) : '',
    reason: 'Manager correction',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  const REASONS = ['Manager correction', 'Forgot to clock in', 'System error', 'Missed clock-out', 'Break not recorded', 'Schedule adjustment', 'Other']

  async function handleSave() {
    if (!form.clockIn) { setErr('Clock-in time is required'); return }
    if (!form.reason) { setErr('Reason is required'); return }
    setErr(null); setSaving(true)
    const inTs = `${form.date}T${form.clockIn}:00`
    const outTs = form.clockOut ? `${form.date}T${form.clockOut}:00` : null
    try {
      const { error } = await sb.rpc('edit_time_entry', {
        p_punch_id: punch?.id ?? null,
        p_punched_in_at: inTs,
        p_punched_out_at: outTs,
        p_manager_id: managerId,
      })
      if (error) throw error
    } catch { /* mock: silent success */ }
    import('../lib/audit.js').then(m => m.logAudit('Time Card Edited', { target: punch?.person_name || punch?.full_name || 'Employee', meta: { punch_id: punch?.id ?? null, in: inTs, out: outTs } })).catch(() => {})
    setSaving(false); setDone(true)
    setTimeout(() => { onSave(); onClose() }, 800)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '28px', width: '440px', maxWidth: '96vw' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--t-text)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Edit Punch — {punch?.work_date || 'New Punch'}
        </div>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--t-success)', fontWeight: 700, fontSize: '15px' }}>Punch updated.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Clock In *</label>
                  <input type="time" value={form.clockIn} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Clock Out</label>
                  <input type="time" value={form.clockOut} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Reason *</label>
                <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={inputStyle}>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {err && <div style={{ color: 'var(--t-danger)', fontSize: '12px', marginTop: '10px' }}>{err}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 1, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Punch'}
              </button>
              <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SCHEDULE HELPER
══════════════════════════════════════════════════════════════ */
function getScheduledShift(_personId) {
  // No posted shift is read here yet (the TG drafter posts to the OS schedule; the HR punch board
  // shows it). Until a shift is posted the comparison says so instead of inventing 8/9/10 am.
  return { startHour: null, endHour: null, label: 'no shift posted' }
}

/* ══════════════════════════════════════════════════════════════
   TAB 1: CLOCK IN / OUT
══════════════════════════════════════════════════════════════ */
function ClockTab({ session, locationIds, locations }) {
  const person = session?.person || {}
  const personId = person.id
  const isManager = isHR(person.role_name)

  const [now, setNow] = useState(new Date())
  const [activePunch, setActivePunch] = useState(null)
  const [breakStart, setBreakStart] = useState(() => {
    try { return localStorage.getItem(`vip_break_start_${personId}`) || null } catch { return null }
  })
  const [breakAccumMins, setBreakAccumMins] = useState(() => {
    try { return parseInt(localStorage.getItem(`vip_break_accum_${personId}`) || '0', 10) } catch { return 0 }
  })
  const [recentPunches, setRecentPunches] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(locations?.[0]?.name || '')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [breakTypePicker, setBreakTypePicker] = useState(false)
  const [breakType, setBreakType] = useState(null)
  const [breakLog, setBreakLog] = useState([])
  const [punchInStatus, setPunchInStatus] = useState(null)
  const [clockInBrief, setClockInBrief] = useState(null)
  const [pulseGate, setPulseGate] = useState(null)   // { onDone } — blocking pulse before continuing
  const [activityConfirmed, setActivityConfirmed] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // Restore clock-in state from localStorage
  useEffect(() => {
    if (!personId) return
    try {
      const stored = localStorage.getItem(`vip_active_punch_${personId}`)
      if (stored) setActivePunch(JSON.parse(stored))
    } catch {}
    try { const bt = localStorage.getItem(`vip_break_type_${personId}`); if (bt) setBreakType(bt) } catch {}
    try { const bl = localStorage.getItem(`vip_break_log_${personId}`); if (bl) setBreakLog(JSON.parse(bl)) } catch {}
    loadRecent()
  }, [personId])

  async function loadRecent() {
    if (!personId) return
    try {
      const weekStart = getWeekDates(0)[0]
      const { data, error } = await sb.rpc('get_my_time_punches', { p_person_id: personId, p_from: weekStart })
      if (error) throw error
      if (Array.isArray(data) && data.length > 0) { setRecentPunches(data.slice(0, 5)); return }
    } catch {}
    // Mock fallback
    const myPunches = getAllPunches()
      .filter(p => p.person_id === personId)
      .sort((a, b) => b.punched_in_at.localeCompare(a.punched_in_at))
      .slice(0, 5)
    setRecentPunches(myPunches)
  }

  async function handleClockIn() {
    if (!personId || busy) return
    setBusy(true)
    const nodeId = selectedLocation
    const { error } = await sb.rpc('punch_in', { p_person_id: personId, p_node_id: nodeId })
    if (error) {
      setBusy(false)
      setToast('Clock-in failed — ' + (error.message || 'not recorded') + '.')
      return
    }
    const punch = { id: `live-${Date.now()}`, punched_in_at: new Date().toISOString() }
    setActivePunch(punch)
    try { localStorage.setItem(`vip_active_punch_${personId}`, JSON.stringify(punch)) } catch {}
    lsSet(KEY.punchStatus(), {
      personId,
      clocked_in: true,
      punch_in_time: Date.now(),
      location: selectedLocation,
      shift: getScheduledShift(personId).label,
    })
    awardPoints(personId, 10, 'Clocked in for shift')
    setBreakAccumMins(0)
    try { localStorage.removeItem(`vip_break_accum_${personId}`); localStorage.removeItem(`vip_break_start_${personId}`) } catch {}
    setBreakStart(null)
    setBreakType(null)
    setBreakLog([])
    try { localStorage.removeItem(`vip_break_type_${personId}`); localStorage.removeItem(`vip_break_log_${personId}`) } catch {}
    // Schedule comparison
    const sched = getScheduledShift(personId)
    const nowHour = new Date().getHours()
    const nowMin = new Date().getMinutes()
    const diffMins = sched.startHour == null ? null : (nowHour - sched.startHour) * 60 + nowMin
    let statusLabel, statusColor
    if (diffMins == null) { statusLabel = 'Clocked in — no shift posted to compare against'; statusColor = 'var(--t-text-muted)' }
    else if (diffMins <= -5) { statusLabel = `Early by ${Math.abs(diffMins)} min`; statusColor = 'var(--t-info, var(--t-accent))' }
    else if (diffMins <= 5) { statusLabel = 'On Time ✓'; statusColor = 'var(--t-success)' }
    else if (diffMins <= 15) { statusLabel = `Late by ${diffMins} min ⚠`; statusColor = 'var(--t-warn)' }
    else { statusLabel = `LATE — ${diffMins} min`; statusColor = 'var(--t-danger)' }
    setPunchInStatus({ shift: sched.label, label: statusLabel, color: statusColor })
    // Daily Pulse is required each shift — schedule the reminder N minutes in.
    const ps = getPulseSettings()
    if (!pulseDoneToday(personId)) {
      if (ps.enforceOnClockIn) {
        setTimeout(() => { if (!pulseDoneToday(personId)) setPulseGate({ onDone: () => setPulseGate(null) }) }, 400)
      } else if (ps.aiReminder && ps.reminderMins > 0) {
        setTimeout(() => {
          if (!pulseDoneToday(personId)) setPulseGate({ reminder: true, message: pulseReminderText(person?.full_name), onDone: () => setPulseGate(null) })
        }, ps.reminderMins * 60000)
      }
    }
    // energetic clock-in briefing: showroom reminder + late warning + message check
    setClockInBrief(buildBriefing({
      name: person?.full_name, mode: 'clockin',
      isLate: diffMins > 5, minutesLate: diffMins > 5 ? diffMins : 0,
      hasMessages: pendingMsgCount(person) > 0, messageCount: pendingMsgCount(person),
      scheduledShift: sched.label,
    }))
    setToast('Clocked in successfully')
    await loadRecent()
    setBusy(false)
  }

  async function handleClockOut() {
    if (!personId || busy) return
    setBusy(true)
    const { error } = await sb.rpc('punch_out', { p_person_id: personId })
    if (error) {
      setBusy(false)
      setToast('Clock-out failed — ' + (error.message || 'not recorded') + '.')
      return
    }
    const punchInTime = activePunch?.punched_in_at ? new Date(activePunch.punched_in_at).getTime() : Date.now()
    setActivePunch(null)
    try { localStorage.removeItem(`vip_active_punch_${personId}`) } catch {}
    lsSet(KEY.punchStatus(), { personId, clocked_in: false, clock_out_time: Date.now() })
    const records = lsGet(KEY.timeRecords(personId), [])
    records.unshift({
      date: new Date().toDateString(),
      punchIn: punchInTime,
      punchOut: Date.now(),
      location: selectedLocation,
      totalMs: Date.now() - punchInTime,
    })
    lsSet(KEY.timeRecords(personId), records.slice(0, 60))
    awardPoints(personId, 5, 'Completed shift')
    setBreakStart(null)
    try { localStorage.removeItem(`vip_break_start_${personId}`) } catch {}
    setToast('Clocked out. Have a great day!')
    await loadRecent()
    setBusy(false)
  }

  function handleStartBreak() {
    const bs = new Date().toISOString()
    setBreakStart(bs)
    try { localStorage.setItem(`vip_break_start_${personId}`, bs) } catch {}
    setToast('Break started')
  }

  function handleEndBreak() {
    if (!breakStart) return
    // REQUIRED: answer the Daily Pulse before clocking back in from break
    const ps = getPulseSettings()
    if (ps.enforceOnBreakReturn && !pulseDoneToday(personId)) {
      setPulseGate({ onDone: () => { setPulseGate(null); doEndBreak() } })
      return
    }
    doEndBreak()
  }

  function doEndBreak() {
    if (!breakStart) return
    const mins = elapsedMins(breakStart)
    const total = breakAccumMins + mins
    setBreakAccumMins(total)
    try { localStorage.setItem(`vip_break_accum_${personId}`, String(total)) } catch {}
    setBreakStart(null)
    try { localStorage.removeItem(`vip_break_start_${personId}`) } catch {}
    const entry = { type: breakType, mins }
    const newLog = [...breakLog, entry]
    setBreakLog(newLog)
    try { localStorage.setItem(`vip_break_log_${personId}`, JSON.stringify(newLog)) } catch {}
    setBreakType(null)
    try { localStorage.removeItem(`vip_break_type_${personId}`) } catch {}
    setToast(`Break ended — ${mins} min recorded`)
  }

  function handleStartBreakTyped(type) {
    const bs = new Date().toISOString()
    setBreakStart(bs)
    setBreakType(type)
    setBreakTypePicker(false)
    try { localStorage.setItem(`vip_break_start_${personId}`, bs) } catch {}
    try { localStorage.setItem(`vip_break_type_${personId}`, type) } catch {}
    setToast(`${type === 'paid' ? 'Paid break' : type === 'meal' ? 'Meal break' : 'Personal break'} started`)
  }

  const clockedIn = !!activePunch
  const onBreakNow = !!breakStart
  const hh = pad2(now.getHours()), mm = pad2(now.getMinutes()), ss = pad2(now.getSeconds())
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const elapsed = clockedIn ? elapsedHms(activePunch.punched_in_at) : null
  const breakElapsed = onBreakNow ? elapsedHms(breakStart) : null
  const currentBreakMins = onBreakNow ? elapsedMins(breakStart) : 0
  const totalBreakMins = breakAccumMins + currentBreakMins

  // Today's hours net of breaks (meal breaks are unpaid)
  const grossHours = clockedIn ? calcHoursNum(activePunch.punched_in_at, null) : 0
  const unpaidMins = breakLog.filter(b => b.type === 'meal').reduce((a, b) => a + b.mins, 0) + (breakType === 'meal' ? currentBreakMins : 0)
  const netHours = Math.max(0, grossHours - unpaidMins / 60)

  const locOptions = locations && locations.length > 0
    ? [...new Set(locations.map(l => l.name))]
    : LOCATIONS

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      {pulseGate && (
        <PulseGate
          person={person}
          title={pulseGate.reminder ? 'Daily Pulse — required this shift' : 'Daily Pulse — required to clock back in'}
          onComplete={() => pulseGate.onDone && pulseGate.onDone()}
          onCancel={pulseGate.reminder ? () => setPulseGate(null) : undefined}
        />
      )}
      {clockInBrief && (
        <div onClick={() => setClockInBrief(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.74)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px,96vw)', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--t-grad, linear-gradient(135deg,var(--t-accent),#7c4dff))', padding: '16px 20px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-on-grad,#04212a)' }}>{clockInBrief.salutation}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-on-grad,#04212a)', opacity: 0.85, marginTop: 2 }}>You're clocked in — let's have a great shift! ✅</div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{clockInBrief.greeting}</div>
              {clockInBrief.floorReminder && <div style={{ fontSize: 12, color: 'var(--t-text)', background: 'rgba(255,59,48,.06)', border: '1px solid var(--t-danger)', padding: '10px 12px', lineHeight: 1.5 }}>{clockInBrief.floorReminder}</div>}
              {clockInBrief.lateWarning && <div style={{ fontSize: 12, color: 'var(--t-warn)', background: 'rgba(255,184,0,.08)', border: '1px solid var(--t-warn)', padding: '10px 12px' }}>{clockInBrief.lateWarning}</div>}
              {clockInBrief.messageReminder && <div style={{ fontSize: 12, color: 'var(--t-accent)', background: 'rgba(0,229,255,.06)', border: '1px solid var(--t-accent)', padding: '10px 12px' }}>{clockInBrief.messageReminder}</div>}
              <button onClick={() => setClockInBrief(null)} style={{ marginTop: 2, fontSize: 13, fontWeight: 800, padding: '11px', background: 'var(--t-accent)', color: 'var(--t-on-grad,#04212a)', border: 'none', cursor: 'pointer', letterSpacing: '.04em' }}>LET'S GO 🚀</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{ background: 'var(--t-success)', color: '#000', padding: '10px 16px', fontWeight: 700, fontSize: '13px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {toast}
        </div>
      )}

      {/* Live clock face */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '36px 24px', textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '62px', fontWeight: 800, color: 'var(--t-accent)', letterSpacing: '6px', lineHeight: 1 }}>
          {hh}:{mm}:{ss}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--t-text-muted)', marginTop: '8px', letterSpacing: '0.3px' }}>{dateLabel}</div>

        {/* Status badge */}
        <div style={{ marginTop: '16px' }}>
          {clockedIn ? (
            <span className="badge green" style={{ fontSize: '12px', padding: '4px 12px' }}>
              CLOCKED IN · Since {fmtTime(activePunch.punched_in_at)}
            </span>
          ) : (
            <span className="badge red" style={{ fontSize: '12px', padding: '4px 12px' }}>CLOCKED OUT</span>
          )}
        </div>

        {/* Elapsed timer */}
        {clockedIn && elapsed && (
          <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--t-text-muted)' }}>
            On shift for{' '}
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)', fontSize: '18px' }}>{elapsed}</span>
          </div>
        )}

        {/* Net hours today */}
        {clockedIn && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--t-text-faint)' }}>
            Net today: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{netHours.toFixed(2)}h</span>
            {totalBreakMins > 0 && <span> · Break: {totalBreakMins}m ({unpaidMins}m unpaid)</span>}
          </div>
        )}

        {/* Schedule comparison */}
        {clockedIn && punchInStatus && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--t-text-muted)' }}>
            Shift: {punchInStatus.shift} · <span style={{ color: punchInStatus.color, fontWeight: 700 }}>{punchInStatus.label}</span>
          </div>
        )}

        {/* Location selector */}
        {isManager && locOptions.length > 1 ? (
          <div style={{ marginTop: '20px' }}>
            <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
              style={{ ...inputStyle, maxWidth: '260px', margin: '0 auto' }}>
              {locOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ marginTop: '18px', fontSize: '12px', color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Location: {selectedLocation}
          </div>
        )}

        {/* Main punch button */}
        <button
          onClick={clockedIn ? handleClockOut : handleClockIn}
          disabled={busy || onBreakNow}
          style={{
            marginTop: '22px', width: '100%', padding: '22px', fontSize: '20px',
            fontWeight: 800, letterSpacing: '2px',
            background: onBreakNow ? 'var(--t-surface-2)' : clockedIn ? 'var(--t-danger)' : 'var(--t-success)',
            color: onBreakNow ? 'var(--t-text-muted)' : '#fff',
            border: 'none', cursor: busy || onBreakNow ? 'default' : 'pointer',
            textTransform: 'uppercase', opacity: busy ? 0.75 : 1, transition: 'opacity 0.2s',
          }}
        >
          {busy ? '…' : onBreakNow ? 'ON BREAK' : clockedIn ? 'CLOCK OUT' : 'CLOCK IN'}
        </button>

        {/* Break tracking */}
        {clockedIn && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {onBreakNow ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--t-warn)', fontFamily: 'monospace', fontWeight: 700, marginBottom: '6px' }}>
                  Break ({breakType || 'personal'}): {breakElapsed}
                </div>
                <button onClick={handleEndBreak} style={{ ...btnSm('var(--t-warn)'), fontSize: '12px', padding: '6px 16px' }}>
                  End Break
                </button>
              </div>
            ) : breakTypePicker ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => handleStartBreakTyped('paid')} style={{ ...btnSm('var(--t-success)'), fontSize: '11px', padding: '5px 12px', borderRadius: 0 }}>
                  Paid Break (15 min)
                </button>
                <button onClick={() => handleStartBreakTyped('meal')} style={{ ...btnSm('var(--t-warn)'), fontSize: '11px', padding: '5px 12px', borderRadius: 0 }}>
                  Meal Break (30 min)
                </button>
                <button onClick={() => handleStartBreakTyped('personal')} style={{ ...btnSm('var(--t-text-muted)'), fontSize: '11px', padding: '5px 12px', borderRadius: 0 }}>
                  Personal Break
                </button>
                <button onClick={() => setBreakTypePicker(false)} style={{ ...btnSm('var(--t-danger)'), fontSize: '11px', padding: '5px 10px', borderRadius: 0 }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setBreakTypePicker(true)} style={{ ...btnSm('var(--t-text-muted)'), fontSize: '12px', padding: '6px 16px', borderRadius: 0 }}>
                Start Break
              </button>
            )}
          </div>
        )}

        {/* Auto clock-out warning */}
        {clockedIn && (() => {
          const mins = elapsedMins(activePunch?.punched_in_at)
          const hrs = mins / 60
          if (hrs > 10) return (
            <div style={{ marginTop: '10px', background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', padding: '10px 14px', borderRadius: 0, fontSize: '12px' }}>
              <div style={{ color: 'var(--t-danger)', fontWeight: 700, marginBottom: '6px' }}>
                Shift exceeds 10 hours. Auto clock-out will occur unless you confirm activity.
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => {
                  try { localStorage.setItem(`vip_activity_confirm_${personId}`, new Date().toISOString()) } catch {}
                  setActivityConfirmed(true)
                  setTimeout(() => setActivityConfirmed(false), 3600000)
                }} style={{ ...btnSm('var(--t-success)'), padding: '5px 12px', fontSize: '11px', borderRadius: 0 }}>
                  I'm Still Here — Reset Timer
                </button>
                <button onClick={handleClockOut} style={{ ...btnSm('var(--t-danger)'), padding: '5px 12px', fontSize: '11px', borderRadius: 0 }}>
                  Clock Out Now
                </button>
              </div>
            </div>
          )
          if (hrs > 8) return (
            <div style={{ marginTop: '10px', background: 'rgba(255,149,0,0.1)', border: '1px solid var(--t-warn)', padding: '10px 14px', borderRadius: 0, fontSize: '12px' }}>
              <div style={{ color: 'var(--t-warn)', fontWeight: 700, marginBottom: '4px' }}>
                You've been clocked in for {Math.floor(hrs)}h {mins % 60}m.
              </div>
              <div style={{ color: 'var(--t-text-muted)', marginBottom: '6px', fontSize: '11px' }}>
                If you're still working, no action needed.
              </div>
              <button style={{ ...btnSm('var(--t-warn)'), padding: '5px 12px', fontSize: '11px', borderRadius: 0 }}>
                Request Manager Review
              </button>
            </div>
          )
          return null
        })()}
      </div>

      {/* Today's punch summary */}
      {clockedIn && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '12px' }}>Today's Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 4 }}>CLOCK IN</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)', fontSize: '15px' }}>{fmtTime(activePunch.punched_in_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 4 }}>BREAK</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, color: totalBreakMins > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)', fontSize: '14px' }}>
                {totalBreakMins > 0 ? `${totalBreakMins}m` : '—'}
              </div>
              {breakLog.length > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginTop: 2 }}>
                  {breakLog.filter(b => b.type === 'paid').reduce((a, b) => a + b.mins, 0) > 0 && (
                    <span>Paid: {breakLog.filter(b => b.type === 'paid').reduce((a, b) => a + b.mins, 0)}m · </span>
                  )}
                  {breakLog.filter(b => b.type === 'meal').reduce((a, b) => a + b.mins, 0) > 0 && (
                    <span>Meal: {breakLog.filter(b => b.type === 'meal').reduce((a, b) => a + b.mins, 0)}m (unpaid)</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 4 }}>NET HRS</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-accent)', fontSize: '15px' }}>{netHours.toFixed(2)}h</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 4 }}>SHIFT STATUS</div>
              {punchInStatus ? (
                <div style={{ fontSize: '11px', fontWeight: 700, color: punchInStatus.color }}>{punchInStatus.label}</div>
              ) : (
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text-faint)', fontSize: '14px' }}>—</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent punches */}
      {recentPunches.length > 0 && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '12px' }}>Recent Punches</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>{['Date', 'In', 'Out', 'Hours', 'Status'].map(h => (
                <th key={h} style={{ ...thStyle, fontSize: '10px', padding: '6px 8px' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {recentPunches.map(p => {
                const hrs = calcHoursNum(p.punched_in_at, p.punched_out_at)
                const status = !p.punched_out_at ? 'active' : (p.status || 'pending')
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '8px', color: 'var(--t-text)' }}>
                      {fmtDateShort(p.work_date)} <span style={{ color: 'var(--t-text-faint)', fontSize: '10px' }}>{fmtDayAbbr(p.work_date)}</span>
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--t-text)' }}>{fmtTime(p.punched_in_at)}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: p.punched_out_at ? 'var(--t-text)' : 'var(--t-accent)' }}>
                      {p.punched_out_at ? fmtTime(p.punched_out_at) : 'Active'}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--t-text)' }}>
                      {p.punched_out_at ? `${hrs.toFixed(2)}h` : '—'}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${status === 'approved' ? 'green' : status === 'active' ? 'amber' : 'amber'}`} style={{ fontSize: '10px' }}>
                        {status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DISPUTE HELPER
══════════════════════════════════════════════════════════════ */
function submitDispute(punch, reason, notes) {
  try {
    const disputes = JSON.parse(localStorage.getItem('vip_disputes') || '[]')
    disputes.push({
      id: disputes.length + 1,
      punch_id: punch.id,
      employee_id: punch.person_id,
      employee_name: punch.full_name,
      location: punch.location,
      work_date: punch.work_date,
      reason,
      notes,
      status: 'open',
      submitted_at: new Date().toISOString(),
      manager_notes: '',
      resolved_at: null,
    })
    localStorage.setItem('vip_disputes', JSON.stringify(disputes))
  } catch {}
}

/* ══════════════════════════════════════════════════════════════
   TAB 2: MY TIMECARD
══════════════════════════════════════════════════════════════ */
function MyTimecardTab({ session, isManager, canEdit = false }) {
  const person = session?.person || {}
  const personId = person.id

  const [weekOffset, setWeekOffset] = useState(0)
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(false)
  const [fixTarget, setFixTarget] = useState(null)
  const [approvedIds, setApprovedIds] = useState(new Set())
  const [disputeRow, setDisputeRow] = useState(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeNotes, setDisputeNotes] = useState('')
  const [disputeToast, setDisputeToast] = useState(null)

  useEffect(() => {
    if (!disputeToast) return
    const t = setTimeout(() => setDisputeToast(null), 4000)
    return () => clearTimeout(t)
  }, [disputeToast])

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const loadPunches = useCallback(async () => {
    if (!personId) return
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_my_time_punches', { p_person_id: personId, p_from: weekStart, p_to: weekEnd })
      if (error) throw error
      if (Array.isArray(data) && data.length > 0) { setPunches([...data].reverse()); setLoading(false); return }
    } catch {}
    setPunches(buildMyPunches(personId, weekDates))
    setLoading(false)
  }, [personId, weekStart, weekEnd])

  useEffect(() => { loadPunches() }, [loadPunches])

  const rows = weekDates.map(d => {
    const punch = punches.find(p => p.work_date === d)
    if (!punch) return { date: d, empty: true }
    const rawH = calcHoursNum(punch.punched_in_at, punch.punched_out_at)
    const breakMin = punch.break_mins || (rawH > 5 ? 30 : 0)
    const netH = Math.max(0, rawH - breakMin / 60)
    const regH = Math.min(netH, 8)
    const otH = Math.max(0, netH - 8)
    const status = approvedIds.has(punch.id) ? 'approved' : (!punch.punched_out_at ? 'active' : (punch.status || 'pending'))
    return { ...punch, date: d, rawH, breakMin, netH, regH, otH, status, empty: false }
  })

  const totals = rows.reduce((a, r) => ({
    net: a.net + (r.netH || 0),
    reg: a.reg + (r.regH || 0),
    ot: a.ot + (r.otH || 0),
  }), { net: 0, reg: 0, ot: 0 })

  function exportCSV() {
    downloadCSV(`timecard-${weekStart}.csv`,
      ['Date', 'Day', 'Clock In', 'Clock Out', 'Break (min)', 'Net Hours', 'Regular', 'OT', 'Status'],
      rows.filter(r => !r.empty).map(r => [
        r.date, fmtDayAbbr(r.date),
        fmtTime(r.punched_in_at),
        r.punched_out_at ? fmtTime(r.punched_out_at) : 'Active',
        r.breakMin, r.netH?.toFixed(2), r.regH?.toFixed(2), r.otH?.toFixed(2), r.status,
      ])
    )
  }

  return (
    <div>
      {disputeToast && (
        <div style={{ background: 'var(--t-warn)', color: '#000', padding: '10px 16px', fontWeight: 700, fontSize: '13px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0 }}>
          {disputeToast}
        </div>
      )}
      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '16px' }}>←</button>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t-text)', minWidth: '260px', textAlign: 'center' }}>{weekLabel(weekOffset)}</span>
        <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}
          style={{ ...btnGhost, padding: '6px 14px', fontSize: '16px', opacity: weekOffset >= 0 ? 0.35 : 1 }}>→</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={exportCSV} style={{ ...btnGhost, padding: '6px 14px', fontSize: '11px', color: 'var(--t-accent)', border: '1px solid var(--t-accent)' }}>Export CSV</button>
          <button onClick={() => window.print()} style={{ ...btnGhost, padding: '6px 14px', fontSize: '11px' }}>Print</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: '13px' }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Date', 'Day', 'Clock In', 'Clock Out', 'Break', 'Break Type', 'Reg Hrs', 'OT Hrs', 'Status', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.date} style={{ borderBottom: '1px solid var(--t-line)', background: row.empty ? 'transparent' : 'transparent' }}>
                  <td style={tdStyle}>{fmtDateShort(row.date)}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{fmtDayAbbr(row.date)}</td>
                  {row.empty ? (
                    <>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-faint)' }}>—</td>
                      <td style={tdStyle}><span className="badge purple" style={{ fontSize: '10px' }}>DAY OFF</span></td>
                      <td style={tdStyle} />
                    </>
                  ) : (
                    <>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{fmtTime(row.punched_in_at)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: row.punched_out_at ? 'var(--t-text)' : 'var(--t-accent)' }}>
                        {row.punched_out_at ? fmtTime(row.punched_out_at) : 'Active'}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.breakMin > 0 ? `${row.breakMin}m` : '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontSize: '11px' }}>
                        {(() => {
                          try {
                            const bl = JSON.parse(localStorage.getItem(`vip_break_log_${personId}`) || '[]')
                            if (bl.length > 0 && row.work_date === todayStr()) {
                              return bl.map(b => b.type).join(', ')
                            }
                          } catch {}
                          return '—'
                        })()}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>
                        {row.punched_out_at ? `${row.regH.toFixed(2)}h` : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: row.otH > 0 ? 700 : 400, color: row.otH > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                        {row.otH > 0 ? `${row.otH.toFixed(2)}h` : '—'}
                      </td>
                      <td style={tdStyle}>
                        <span className={`badge ${row.status === 'approved' ? 'green' : row.status === 'active' ? 'blue' : row.status === 'missing_out' ? 'red' : 'amber'}`} style={{ fontSize: '10px' }}>
                          {row.status === 'missing_out' ? 'MISSING OUT' : row.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {isManager && row.status !== 'approved' && row.status !== 'active' && (
                            <button onClick={() => setApprovedIds(p => new Set([...p, row.id]))}
                              style={btnSm('var(--t-success)')}>Approve</button>
                          )}
                          {canEdit && (
                            <button onClick={() => setFixTarget(row)} style={btnSm('var(--t-text-muted)')}>Edit</button>
                          )}
                          {!isManager && row.status === 'pending' && (
                            <button onClick={() => setDisputeRow(row)} style={btnSm('var(--t-warn)')}>Flag</button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--t-surface-2)', borderTop: '2px solid var(--t-line)' }}>
                <td colSpan={6} style={{ padding: '10px', fontWeight: 700, fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Weekly Totals</td>
                <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--t-text)' }}>{totals.reg.toFixed(2)}h</td>
                <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 800, color: totals.ot > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                  {totals.ot > 0 ? `${totals.ot.toFixed(2)}h` : '—'}
                </td>
                <td colSpan={2} style={{ padding: '10px', fontSize: '11px', color: 'var(--t-text-muted)' }}>
                  Net: {totals.net.toFixed(2)}h{totals.ot > 0 ? ' · OT applies' : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {fixTarget && (
        <FixPunchModal
          punch={fixTarget} personId={personId} managerId={personId}
          onClose={() => setFixTarget(null)} onSave={() => { setFixTarget(null); loadPunches() }}
        />
      )}

      {disputeRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '28px', width: '480px', maxWidth: '96vw', borderRadius: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--t-text)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>Dispute Punch</div>
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <span style={{ color: 'var(--t-text-muted)' }}>Date: <strong style={{ color: 'var(--t-text)' }}>{disputeRow.work_date}</strong></span>
                <span style={{ color: 'var(--t-text-muted)' }}>In: <strong style={{ color: 'var(--t-text)', fontFamily: 'monospace' }}>{fmtTime(disputeRow.punched_in_at)}</strong></span>
                <span style={{ color: 'var(--t-text-muted)' }}>Out: <strong style={{ color: 'var(--t-text)', fontFamily: 'monospace' }}>{disputeRow.punched_out_at ? fmtTime(disputeRow.punched_out_at) : '—'}</strong></span>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Reason *</label>
              <select value={disputeReason} onChange={e => setDisputeReason(e.target.value)} style={{ ...inputStyle }}>
                <option value="">— Select reason —</option>
                {['Wrong clock-in time', 'Wrong clock-out time', 'Missing punch', 'Break not recorded', 'Unauthorized deduction', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: 'var(--t-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '5px', letterSpacing: '0.5px' }}>Notes *</label>
              <textarea value={disputeNotes} onChange={e => setDisputeNotes(e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Describe the issue..." />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => {
                if (!disputeReason || !disputeNotes.trim()) return
                submitDispute(disputeRow, disputeReason, disputeNotes)
                pushNotification({
                  title: 'Timecard Dispute Submitted',
                  message: `Your dispute for ${disputeRow.work_date} has been submitted for manager review.`,
                  type: 'info',
                  category: 'hr',
                  targetPersonIds: [personId],
                })
                setDisputeRow(null); setDisputeReason(''); setDisputeNotes('')
                setDisputeToast('Dispute submitted — your manager will be notified')
              }} style={{ ...btnPrimary, flex: 1, borderRadius: 0 }}>Submit Dispute</button>
              <button onClick={() => { setDisputeRow(null); setDisputeReason(''); setDisputeNotes('') }} style={{ ...btnGhost, flex: 1, borderRadius: 0 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   DISPUTES PANEL
══════════════════════════════════════════════════════════════ */
function DisputesPanel() {
  const [disputes, setDisputesState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vip_disputes') || '[]') } catch { return [] }
  })
  const [managerNotes, setManagerNotes] = useState({})
  const [reviewingId, setReviewingId] = useState(null)

  function updateDispute(id, patch) {
    try {
      const all = JSON.parse(localStorage.getItem('vip_disputes') || '[]')
      const updated = all.map(d => d.id === id ? { ...d, ...patch } : d)
      localStorage.setItem('vip_disputes', JSON.stringify(updated))
      setDisputesState(updated)
    } catch {}
  }

  const now = new Date()
  const weekAgo = new Date(now - 7 * 86400000).toISOString()
  const openDisputes = disputes.filter(d => d.status === 'open')
  const reviewDisputes = disputes.filter(d => d.status === 'under_review')
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved' && d.resolved_at > weekAgo)
  const openCount = openDisputes.length
  const reviewCount = reviewDisputes.length
  const resolvedCount = resolvedDisputes.length

  const [drill, setDrill] = useState(null)
  const DISPUTE_COLS = [
    { key: 'employee_name', label: 'Employee', value: d => d.employee_name },
    { key: 'location', label: 'Location', value: d => d.location || '—' },
    { key: 'work_date', label: 'Work Date', value: d => d.work_date },
    { key: 'reason', label: 'Reason', value: d => d.reason || '—' },
    { key: 'status', label: 'Status', value: d => (d.status === 'under_review' ? 'UNDER REVIEW' : (d.status || '').toUpperCase()) },
    { key: 'submitted_at', label: 'Submitted', value: d => new Date(d.submitted_at).toLocaleDateString('en-US'), sortKey: d => d.submitted_at || '' },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} dispute${rows.length === 1 ? '' : 's'}`, columns: DISPUTE_COLS, rows, accent })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        <KTile label="Open Disputes" value={openCount} sub="awaiting review" color={openCount > 0 ? 'var(--t-danger)' : 'var(--t-text)'} alert={openCount > 0 ? 'red' : null} onClick={() => openDrill('Open Disputes', openDisputes, 'var(--t-danger)')} />
        <KTile label="Under Review" value={reviewCount} sub="in progress" color={reviewCount > 0 ? 'var(--t-warn)' : 'var(--t-text)'} alert={reviewCount > 0 ? 'amber' : null} onClick={() => openDrill('Disputes Under Review', reviewDisputes, 'var(--t-warn)')} />
        <KTile label="Resolved This Week" value={resolvedCount} sub="last 7 days" color="var(--t-success)" onClick={() => openDrill('Disputes Resolved This Week', resolvedDisputes, 'var(--t-success)')} />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
      {disputes.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: '13px' }}>No disputes on record.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['#', 'Employee', 'Date', 'Reason', 'Status', 'Submitted', 'Notes', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {disputes.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>#{d.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{d.employee_name}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{d.work_date}</td>
                  <td style={{ ...tdStyle, maxWidth: 180, fontSize: '11px' }}>{d.reason}</td>
                  <td style={tdStyle}>
                    <span className={`badge ${d.status === 'open' ? 'red' : d.status === 'under_review' ? 'amber' : 'green'}`} style={{ fontSize: '9px' }}>
                      {d.status === 'under_review' ? 'UNDER REVIEW' : d.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: '10px', color: 'var(--t-text-muted)' }}>{new Date(d.submitted_at).toLocaleDateString()}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, fontSize: '11px' }}>
                    {reviewingId === d.id ? (
                      <textarea value={managerNotes[d.id] || ''} onChange={e => setManagerNotes(n => ({ ...n, [d.id]: e.target.value }))}
                        rows={2} style={{ ...inputStyle, fontSize: '11px', resize: 'vertical', borderRadius: 0 }} placeholder="Manager notes..." />
                    ) : (
                      <span style={{ color: 'var(--t-text-muted)' }}>{d.manager_notes || '—'}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {d.status === 'open' && (
                        <button onClick={() => { updateDispute(d.id, { status: 'under_review' }); setReviewingId(d.id) }} style={btnSm('var(--t-warn)')}>Review</button>
                      )}
                      {d.status !== 'resolved' && (
                        <button onClick={() => {
                          if (!window.confirm('Resolve this dispute?')) return
                          updateDispute(d.id, { status: 'resolved', resolved_at: new Date().toISOString(), manager_notes: managerNotes[d.id] || d.manager_notes })
                          setReviewingId(null)
                        }} style={btnSm('var(--t-success)')}>Resolve</button>
                      )}
                      {d.status !== 'resolved' && (
                        <button onClick={() => {
                          if (!window.confirm('Dismiss this dispute?')) return
                          updateDispute(d.id, { status: 'resolved', resolved_at: new Date().toISOString(), manager_notes: 'Dismissed' })
                        }} style={btnSm('var(--t-danger)')}>Dismiss</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 3: ALL TIMECARDS (HR only)
══════════════════════════════════════════════════════════════ */
function AllTimecardsTab({ session, canEdit = false }) {
  const managerId = session?.person?.id
  const [allTab, setAllTab] = useState('punches')

  const allPunches = getAllPunches()
  const [locFilter, setLocFilter] = useState('All')
  const [empFilter, setEmpFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFrom, setDateFrom] = useState(getWeekDates(0)[0])
  const [dateTo, setDateTo] = useState(todayStr())
  const [sortCol, setSortCol] = useState('work_date')
  const [sortAsc, setSortAsc] = useState(false)
  const [approvedIds, setApprovedIds] = useState(new Set())
  const [rejectedIds, setRejectedIds] = useState(new Set())
  const [editTarget, setEditTarget] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const allEmployeeNames = ['All', ...new Set(ALL_EMPLOYEES.map(e => e.full_name))]

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const missingPunches = allPunches.filter(p =>
    p.work_date === yesterdayStr && !p.punched_out_at && p.status === 'missing_out'
  )

  function filtered() {
    let rows = [...allPunches]
    if (locFilter !== 'All') rows = rows.filter(r => r.location === locFilter)
    if (empFilter !== 'All') rows = rows.filter(r => r.full_name === empFilter)
    if (statusFilter !== 'All') rows = rows.filter(r => {
      const effective = approvedIds.has(r.id) ? 'approved' : rejectedIds.has(r.id) ? 'rejected' : r.status
      return effective === statusFilter
    })
    rows = rows.filter(r => r.work_date >= dateFrom && r.work_date <= dateTo)
    rows.sort((a, b) => {
      const va = a[sortCol] || ''
      const vb = b[sortCol] || ''
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return rows
  }

  function sort(col) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
    setPage(0)
  }

  const rows = filtered()
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)

  function bulkApprove() {
    const pending = rows.filter(r => r.status === 'pending' && !approvedIds.has(r.id) && !rejectedIds.has(r.id))
    setApprovedIds(prev => new Set([...prev, ...pending.map(r => r.id)]))
  }

  function exportPayroll() {
    downloadCSV(`payroll-export-${todayStr()}.csv`,
      ['Employee', 'Location', 'Date', 'Clock In', 'Clock Out', 'Break (min)', 'Gross Hours', 'Net Hours', 'Status'],
      rows.filter(r => r.punched_out_at).map(r => {
        const gross = calcHoursNum(r.punched_in_at, r.punched_out_at)
        const net = Math.max(0, gross - (r.break_mins || 0) / 60)
        const status = approvedIds.has(r.id) ? 'approved' : rejectedIds.has(r.id) ? 'rejected' : r.status
        return [r.full_name, r.location, r.work_date, fmtTime(r.punched_in_at), fmtTime(r.punched_out_at), r.break_mins || 0, gross.toFixed(2), net.toFixed(2), status]
      })
    )
  }

  const SortArrow = ({ col }) => (
    <span style={{ opacity: sortCol === col ? 1 : 0.3, marginLeft: 3 }}>
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: '16px' }}>
        {['punches', 'disputes'].map(t => (
          <button key={t} onClick={() => setAllTab(t)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none',
            borderBottom: allTab === t ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: allTab === t ? 'var(--t-accent)' : 'var(--t-text-muted)',
            cursor: 'pointer', fontWeight: allTab === t ? 700 : 400,
            fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '-1px',
          }}>{t === 'punches' ? 'All Timecards' : 'Disputes'}</button>
        ))}
      </div>

      {allTab === 'disputes' && <DisputesPanel />}

      {allTab === 'punches' && <>
      {/* Missing punches alert */}
      {missingPunches.length > 0 && (
        <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid var(--t-danger)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 4, height: '100%', background: 'var(--t-danger)', borderRadius: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--t-danger)', fontSize: '12px', textTransform: 'uppercase', marginBottom: 4 }}>
              Missing Punches — Yesterday ({yesterdayStr})
            </div>
            <div style={{ fontSize: '12px', color: 'var(--t-text-muted)' }}>
              {missingPunches.map(p => (
                <span key={p.id} style={{ marginRight: 12 }}>
                  {p.full_name} ({p.location})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          {['All', ...LOCATIONS].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={empFilter} onChange={e => { setEmpFilter(e.target.value); setPage(0) }} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          {allEmployeeNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          {['All', 'active', 'pending', 'approved', 'missing_out'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={bulkApprove} style={{ ...btnPrimary, padding: '7px 14px', fontSize: '11px', background: 'var(--t-success)', color: '#fff' }}>
            Bulk Approve Pending
          </button>
          <button onClick={exportPayroll} style={{ ...btnGhost, padding: '7px 14px', fontSize: '11px', color: 'var(--t-accent)', border: '1px solid var(--t-accent)' }}>
            Export Payroll CSV
          </button>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', marginBottom: '10px' }}>
        Showing {pageRows.length} of {rows.length} records
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {[
                { label: 'Employee', col: 'full_name' },
                { label: 'Location', col: 'location' },
                { label: 'Date', col: 'work_date' },
                { label: 'Clock In', col: 'punched_in_at' },
                { label: 'Clock Out', col: 'punched_out_at' },
                { label: 'Break', col: null },
                { label: 'Net Hrs', col: null },
                { label: 'Status', col: 'status' },
                { label: 'Actions', col: null },
              ].map(h => (
                <th key={h.label}
                  style={{ ...thStyle, cursor: h.col ? 'pointer' : 'default' }}
                  onClick={h.col ? () => sort(h.col) : undefined}>
                  {h.label}{h.col && <SortArrow col={h.col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-text-muted)', padding: '32px' }}>No records found.</td></tr>
            )}
            {pageRows.map(row => {
              const gross = calcHoursNum(row.punched_in_at, row.punched_out_at)
              const breakMin = row.break_mins || (gross > 5 ? 30 : 0)
              const net = Math.max(0, gross - breakMin / 60)
              const effectiveStatus = approvedIds.has(row.id) ? 'approved' : rejectedIds.has(row.id) ? 'rejected' : row.status
              return (
                <tr key={row.id}
                  style={{ borderBottom: '1px solid var(--t-line)', background: effectiveStatus === 'missing_out' ? 'rgba(255,59,48,0.04)' : 'transparent' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>{row.full_name}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.location}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{row.work_date}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>{fmtTime(row.punched_in_at)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px', color: row.punched_out_at ? 'var(--t-text)' : 'var(--t-danger)' }}>
                    {row.punched_out_at ? fmtTime(row.punched_out_at) : 'MISSING'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontSize: '11px' }}>{breakMin > 0 ? `${breakMin}m` : '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: net > 9 ? 'var(--t-warn)' : 'var(--t-text)', fontSize: '11px' }}>
                    {row.punched_out_at ? `${net.toFixed(2)}h` : '—'}
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge ${effectiveStatus === 'approved' ? 'green' : effectiveStatus === 'rejected' ? 'red' : effectiveStatus === 'active' ? 'blue' : effectiveStatus === 'missing_out' ? 'red' : 'amber'}`} style={{ fontSize: '9px' }}>
                      {effectiveStatus === 'missing_out' ? 'MISSING OUT' : effectiveStatus.toUpperCase()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {effectiveStatus !== 'approved' && effectiveStatus !== 'active' && (
                        <button onClick={() => setApprovedIds(p => new Set([...p, row.id]))} style={btnSm('var(--t-success)')}>✓</button>
                      )}
                      {effectiveStatus !== 'rejected' && effectiveStatus !== 'active' && (
                        <button onClick={() => setRejectedIds(p => new Set([...p, row.id]))} style={btnSm('var(--t-danger)')}>✗</button>
                      )}
                      {canEdit
                        ? <button onClick={() => setEditTarget(row)} style={btnSm('var(--t-text-muted)')}>Edit</button>
                        : <span title="Timecard editing not granted — ask an admin" style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>🔒</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ ...btnGhost, padding: '5px 12px', fontSize: '12px', opacity: page === 0 ? 0.35 : 1 }}>← Prev</button>
          <span style={{ fontSize: '12px', color: 'var(--t-text-muted)', padding: '6px 12px' }}>Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ ...btnGhost, padding: '5px 12px', fontSize: '12px', opacity: page >= totalPages - 1 ? 0.35 : 1 }}>Next →</button>
        </div>
      )}

      {editTarget && (
        <FixPunchModal
          punch={editTarget} personId={editTarget.person_id} managerId={managerId}
          onClose={() => setEditTarget(null)} onSave={() => setEditTarget(null)}
        />
      )}
      </>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 4: TIME REPORTS
══════════════════════════════════════════════════════════════ */
function TimeReportsTab() {
  const allPunches = getAllPunches()
  const [reportWeekOffset, setReportWeekOffset] = useState(0)

  const weekDates = getWeekDates(reportWeekOffset)
  const prevWeekDates = getWeekDates(reportWeekOffset - 1)
  const weekSet = new Set(weekDates)
  const prevWeekSet = new Set(prevWeekDates)

  const today = todayStr()
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

  // Hours per employee this week vs last
  const empWeekHours = {}
  const empPrevHours = {}
  ALL_EMPLOYEES.forEach(e => { empWeekHours[e.id] = 0; empPrevHours[e.id] = 0 })

  allPunches.forEach(p => {
    if (weekSet.has(p.work_date)) empWeekHours[p.person_id] = (empWeekHours[p.person_id] || 0) + calcHoursNum(p.punched_in_at, p.punched_out_at)
    if (prevWeekSet.has(p.work_date)) empPrevHours[p.person_id] = (empPrevHours[p.person_id] || 0) + calcHoursNum(p.punched_in_at, p.punched_out_at)
  })

  // Missed punches (30 days)
  const empMissed = {}
  ALL_EMPLOYEES.forEach(e => { empMissed[e.id] = 0 })
  allPunches.filter(p => p.work_date >= thirtyDaysAgoStr && p.status === 'missing_out').forEach(p => {
    empMissed[p.person_id] = (empMissed[p.person_id] || 0) + 1
  })

  // Hours by location this week
  const locHoursWeek = {}
  LOCATIONS.forEach(l => { locHoursWeek[l] = 0 })
  allPunches.filter(p => weekSet.has(p.work_date)).forEach(p => {
    locHoursWeek[p.location] = (locHoursWeek[p.location] || 0) + calcHoursNum(p.punched_in_at, p.punched_out_at)
  })

  // Revenue per labor hour
  const revPerHr = LOCATIONS.reduce((acc, loc) => {
    const hrs = locHoursWeek[loc] || 1
    acc[loc] = LOC_SALES[loc] == null ? null : (LOC_SALES[loc] * 7 / hrs).toFixed(2) // no revenue recorded here → null
    return acc
  }, {})

  // 6-week hours trend per location
  const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => {
    const dates = getWeekDates(-(5 - i))
    const ws = new Set(dates)
    const hrs = {}
    LOCATIONS.forEach(l => { hrs[l] = 0 })
    allPunches.filter(p => ws.has(p.work_date)).forEach(p => {
      hrs[p.location] = (hrs[p.location] || 0) + calcHoursNum(p.punched_in_at, p.punched_out_at)
    })
    const label = `W${i + 1}`
    return { label, ...hrs }
  })
  const maxTrendHrs = Math.max(...SIX_WEEKS.map(w => Math.max(...LOCATIONS.map(l => w[l]))))

  const LOC_COLORS = new Proxy({}, { get: (_, n) => (typeof n === 'string' ? locColor(n) : undefined) })

  const employeeReport = ALL_EMPLOYEES.map(e => ({
    ...e,
    weekHrs: empWeekHours[e.id] || 0,
    prevHrs: empPrevHours[e.id] || 0,
    delta: (empWeekHours[e.id] || 0) - (empPrevHours[e.id] || 0),
    ot: Math.max(0, (empWeekHours[e.id] || 0) - 40),
    missed30: empMissed[e.id] || 0,
  })).sort((a, b) => b.weekHrs - a.weekHrs)

  const sectionStyle = { marginBottom: 24, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '20px' }
  const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 16 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => setReportWeekOffset(w => w - 1)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '16px' }}>←</button>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t-text)', minWidth: '240px', textAlign: 'center' }}>{weekLabel(reportWeekOffset)}</span>
        <button onClick={() => setReportWeekOffset(w => w + 1)} disabled={reportWeekOffset >= 0}
          style={{ ...btnGhost, padding: '6px 14px', fontSize: '16px', opacity: reportWeekOffset >= 0 ? 0.35 : 1 }}>→</button>
      </div>

      {/* 1: Hours vs last week */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Hours by Employee — This Week vs Last</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Employee', 'Role', 'Location', 'This Week', 'Last Week', 'Delta', 'Status'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employeeReport.map(e => {
                const deltaPos = e.delta > 0
                const otRisk = e.weekHrs > 40
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>{e.full_name}</td>
                    <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontSize: '11px' }}>{e.role_name}</td>
                    <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontSize: '11px' }}>{e.location}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: otRisk ? 'var(--t-danger)' : 'var(--t-text)' }}>
                      {e.weekHrs.toFixed(1)}h
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{e.prevHrs.toFixed(1)}h</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: deltaPos ? 'var(--t-success)' : e.delta < 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                      {e.delta > 0 ? '+' : ''}{e.delta.toFixed(1)}h
                    </td>
                    <td style={tdStyle}>
                      {otRisk
                        ? <span className="badge red" style={{ fontSize: '10px' }}>OT</span>
                        : e.weekHrs > 35
                          ? <span className="badge amber" style={{ fontSize: '10px' }}>OT RISK</span>
                          : <span className="badge green" style={{ fontSize: '10px' }}>OK</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2: OT summary */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Overtime Summary — This Week</div>
        {employeeReport.filter(e => e.weekHrs > 35).length === 0 ? (
          <div style={{ color: 'var(--t-success)', fontSize: '13px' }}>No OT risk employees this week.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {employeeReport.filter(e => e.weekHrs > 35).map(e => {
              const ot = e.weekHrs - 40
              const isOver = e.weekHrs > 40
              return (
                <div key={e.id} style={{ background: 'var(--t-bg)', border: `1px solid ${isOver ? 'var(--t-danger)' : 'var(--t-warn)'}`, padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: '13px', marginBottom: 4 }}>{e.full_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', marginBottom: 8 }}>{e.location} · {e.role_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 2 }}>TOTAL HRS</div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '18px', color: isOver ? 'var(--t-danger)' : 'var(--t-warn)' }}>{e.weekHrs.toFixed(1)}h</div>
                    </div>
                    {isOver && (
                      <div>
                        <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginBottom: 2 }}>OT HOURS</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '18px', color: 'var(--t-danger)' }}>+{ot.toFixed(1)}h</div>
                      </div>
                    )}
                  </div>
                  {/* Mini progress bar */}
                  <div style={{ marginTop: '10px', background: 'var(--t-line)', height: '4px', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (e.weekHrs / 50) * 100)}%`, background: isOver ? 'var(--t-danger)' : 'var(--t-warn)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginTop: 4 }}>{e.weekHrs.toFixed(1)} / 40h threshold</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 3: Missed punches 30 days */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Missed Punches — Last 30 Days</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Employee', 'Location', 'Missed Punches', 'Severity'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {employeeReport.filter(e => e.missed30 > 0).sort((a, b) => b.missed30 - a.missed30).map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{e.full_name}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{e.location}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: e.missed30 >= 3 ? 'var(--t-danger)' : 'var(--t-warn)' }}>{e.missed30}</td>
                  <td style={tdStyle}>
                    {e.missed30 >= 3 ? <span className="badge red" style={{ fontSize: '10px' }}>HIGH</span>
                      : e.missed30 >= 2 ? <span className="badge amber" style={{ fontSize: '10px' }}>MODERATE</span>
                      : <span className="badge blue" style={{ fontSize: '10px' }}>LOW</span>}
                  </td>
                </tr>
              ))}
              {employeeReport.filter(e => e.missed30 > 0).length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-success)', padding: '24px' }}>Zero missed punches in 30 days.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4: Revenue per labor hour */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Revenue per Labor Hour — This Week (Est.)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
          {LOCATIONS.map(loc => {
            const hrs = locHoursWeek[loc] || 0
            const rph = revPerHr[loc] == null ? null : parseFloat(revPerHr[loc])
            return (
              <div key={loc} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: LOC_COLORS[loc], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{loc}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>{rph == null ? '—' : `$${rph.toFixed(0)}`}</div>
                <div style={{ fontSize: '10px', color: 'var(--t-text-faint)' }}>/labor hr · {hrs.toFixed(0)}h worked</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 5: 6-week trend bar chart */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Labor Hours Trend — 6 Weeks by Location</div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', overflowX: 'auto', paddingBottom: '8px' }}>
          {SIX_WEEKS.map((w, wi) => (
            <div key={wi} style={{ flex: '0 0 auto', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center', height: '160px', marginBottom: '6px' }}>
                {LOCATIONS.map(loc => {
                  const h = w[loc] || 0
                  const pct = maxTrendHrs > 0 ? (h / maxTrendHrs) * 100 : 0
                  return (
                    <div key={loc} title={`${loc}: ${h.toFixed(1)}h`}
                      style={{ width: '16px', height: `${pct}%`, background: LOC_COLORS[loc], opacity: 0.85, transition: 'height 0.3s', position: 'relative', minHeight: h > 0 ? '2px' : '0' }} />
                  )
                })}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--t-text-muted)', fontWeight: 600 }}>{w.label}</div>
              <div style={{ fontSize: '9px', color: 'var(--t-text-faint)' }}>
                {LOCATIONS.reduce((a, l) => a + (w[l] || 0), 0).toFixed(0)}h
              </div>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
          {LOCATIONS.map(loc => (
            <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', background: LOC_COLORS[loc], borderRadius: 2 }} />
              <span style={{ fontSize: '11px', color: 'var(--t-text-muted)' }}>{loc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 6: Avg shift by location */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>Average Shift Length — This Week by Location</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
          {LOCATIONS.map(loc => {
            const locPunches = allPunches.filter(p => weekSet.has(p.work_date) && p.location === loc && p.punched_out_at)
            const avgHrs = locPunches.length > 0
              ? locPunches.reduce((a, p) => a + calcHoursNum(p.punched_in_at, p.punched_out_at), 0) / locPunches.length
              : 0
            return (
              <div key={loc} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: LOC_COLORS[loc], fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{loc}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 800, color: 'var(--t-text)' }}>{avgHrs.toFixed(1)}h</div>
                <div style={{ fontSize: '10px', color: 'var(--t-text-faint)', marginTop: 4 }}>{locPunches.length} completed shifts</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB 5: LIVE FLOOR (HR only)
══════════════════════════════════════════════════════════════ */

// Floor status from today's punch rows (no seed): clocked in (open punch), clocked out
// (closed punch), not yet in (no punch today). Breaks and no-shows need break rows and a
// posted shift, which are not read here yet — those statuses are never invented.
function buildFloorStatus() {
  const today = todayStr()
  const todays = getAllPunches().filter(p => p.work_date === today)
  return ALL_EMPLOYEES.map(emp => {
    const punch = todays.find(p => p.person_id === emp.id)
    const status = !punch ? 'not_yet_in' : punch.punched_out_at ? 'clocked_out' : 'clocked_in'
    return {
      ...emp,
      status,
      clockInTs: punch?.punched_in_at || null,
      isLate: false,
      breakType: null,
      breakMinsElapsed: 0,
      scheduledTime: null,
    }
  })
}

function getFloorStatus() { return buildFloorStatus() }

function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function statusColor(status) {
  if (status === 'clocked_in') return 'var(--t-success)'
  if (status === 'on_break')   return 'var(--t-warn)'
  if (status === 'no_show')    return 'var(--t-danger)'
  if (status === 'not_yet_in') return 'var(--t-line)'
  return 'var(--t-text-faint)'
}

function statusLabel(status) {
  if (status === 'clocked_in') return 'CLOCKED IN'
  if (status === 'on_break')   return 'ON BREAK'
  if (status === 'clocked_out') return 'CLOCKED OUT'
  if (status === 'not_yet_in') return 'NOT YET IN'
  if (status === 'no_show')    return 'NO SHOW'
  return status.toUpperCase()
}

function elapsedLabel(clockInTs) {
  if (!clockInTs) return null
  const ms = Date.now() - new Date(clockInTs).getTime()
  if (ms < 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${pad2(m)}m`
}

function LiveFloorTab() {
  const floorData = getFloorStatus()
  const [locFilter, setLocFilter] = useState('All')
  const [toastMsg, setToastMsg] = useState(null)
  const [tick, setTick] = useState(0)
  const [drill, setDrill] = useState(null)
  const FLOOR_COLS = [
    { key: 'full_name', label: 'Employee', value: e => e.full_name },
    { key: 'location', label: 'Location', value: e => e.location },
    { key: 'status', label: 'Status', value: e => statusLabel(e.status) },
    { key: 'clockInTs', label: 'Clock In', value: e => e.clockInTs ? fmtTime(e.clockInTs) : '—', sortKey: e => e.clockInTs || '' },
    { key: 'elapsed', label: 'On Shift', value: e => elapsedLabel(e.clockInTs) || '—' },
    { key: 'isLate', label: 'Late?', value: e => (e.isLate ? 'LATE' : '—') },
    { key: 'breakMinsElapsed', label: 'Break Min', align: 'right', value: e => (e.status === 'on_break' ? `${e.breakMinsElapsed}m` : '—'), sortKey: e => e.breakMinsElapsed || 0 },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: FLOOR_COLS, rows, accent })

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 3000)
    return () => clearTimeout(t)
  }, [toastMsg])

  const filtered = locFilter === 'All' ? floorData : floorData.filter(e => e.location === locFilter)

  const clockedInList = floorData.filter(e => e.status === 'clocked_in')
  const onBreakList   = floorData.filter(e => e.status === 'on_break')
  const lateList      = floorData.filter(e => e.isLate)
  const noShowList    = floorData.filter(e => e.status === 'no_show' || e.status === 'not_yet_in')
  const clockedInCount  = clockedInList.length
  const onBreakCount    = onBreakList.length
  const lateCount       = lateList.length
  const noShowCount     = noShowList.length

  // Alerts
  const longShiftAlerts = floorData.filter(e => {
    if (!e.clockInTs || e.status === 'clocked_out') return false
    const hrs = (Date.now() - new Date(e.clockInTs).getTime()) / 3600000
    return hrs > 8
  })
  const noShowAlerts = floorData.filter(e => e.status === 'no_show')
  const longBreakAlerts = floorData.filter(e => e.status === 'on_break' && e.breakMinsElapsed > 45)

  return (
    <div>
      {toastMsg && (
        <div style={{ background: 'var(--t-success)', color: '#000', padding: '10px 16px', fontWeight: 700, fontSize: '13px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {toastMsg}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
        <KTile label="Currently Clocked In" value={clockedInCount} sub="employees active" color="var(--t-success)" onClick={() => openDrill('Currently Clocked In', clockedInList, 'var(--t-success)')} />
        <KTile label="On Break Right Now" value={onBreakCount} sub="mid-shift break" color="var(--t-warn)" alert={onBreakCount > 2 ? 'amber' : null} onClick={() => openDrill('On Break Right Now', onBreakList, 'var(--t-warn)')} />
        <KTile label="Late Arrivals Today" value={lateCount} sub="arrived after 9:05 AM" color={lateCount > 0 ? 'var(--t-warn)' : 'var(--t-text)'} alert={lateCount > 0 ? 'amber' : null} onClick={() => openDrill('Late Arrivals Today', lateList, 'var(--t-warn)')} />
        <KTile label="No-Show / Not Punched" value={noShowCount} sub="expected but absent" color={noShowCount > 0 ? 'var(--t-danger)' : 'var(--t-text)'} alert={noShowCount > 0 ? 'red' : null} onClick={() => openDrill('No-Show / Not Punched', noShowList, 'var(--t-danger)')} />
      </div>

      {/* Location filter tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 16 }}>
        {['All', ...LOCATIONS].map(loc => (
          <button key={loc} onClick={() => setLocFilter(loc)}
            style={{
              padding: '8px 14px', background: 'transparent', border: 'none',
              borderBottom: locFilter === loc ? '2px solid var(--t-accent)' : '2px solid transparent',
              color: locFilter === loc ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontWeight: locFilter === loc ? 700 : 400,
              fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
              cursor: 'pointer', marginBottom: '-1px', whiteSpace: 'nowrap',
            }}>
            {loc}
          </button>
        ))}
      </div>

      {/* Employee grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 20 }}>
        {filtered.map(emp => {
          const elapsed = emp.clockInTs ? elapsedLabel(emp.clockInTs) : null
          const sc = statusColor(emp.status)
          return (
            <div key={emp.id} style={{
              background: 'var(--t-surface)', border: `1px solid ${emp.status === 'no_show' ? 'var(--t-danger)' : emp.status === 'on_break' ? 'var(--t-warn)' : 'var(--t-line)'}`,
              padding: '14px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {/* Top row: avatar + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, background: sc, color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                  opacity: emp.status === 'clocked_out' ? 0.45 : 1,
                }}>
                  {initials(emp.full_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {emp.full_name}
                    {emp.isLate && (
                      <span style={{ fontSize: 10, padding: '1px 5px', background: 'rgba(255,149,0,.15)', color: 'var(--t-warn)', fontWeight: 700 }}>⚠ LATE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {emp.role_name} · {emp.location}
                  </div>
                </div>
              </div>

              {/* Status badge */}
              <div>
                <span className={`badge ${emp.status === 'clocked_in' ? 'green' : emp.status === 'on_break' ? 'amber' : emp.status === 'no_show' ? 'red' : 'purple'}`}
                  style={{ fontSize: 10 }}>
                  {statusLabel(emp.status)}
                </span>
              </div>

              {/* Detail line */}
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                {emp.status === 'clocked_in' && elapsed && (
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{elapsed}</span>
                )}
                {emp.status === 'on_break' && (
                  <span>{emp.breakType} · <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-warn)' }}>{emp.breakMinsElapsed}m</span></span>
                )}
                {emp.status === 'not_yet_in' && emp.scheduledTime && (
                  <span style={{ color: 'var(--t-text-faint)' }}>Scheduled: {emp.scheduledTime}</span>
                )}
                {emp.status === 'clocked_out' && (
                  <span style={{ color: 'var(--t-text-faint)' }}>Shift complete</span>
                )}
                {emp.status === 'no_show' && (
                  <span style={{ color: 'var(--t-danger)' }}>Expected — not punched</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Alerts section */}
      {(longShiftAlerts.length > 0 || noShowAlerts.length > 0 || longBreakAlerts.length > 0) && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-danger)', textTransform: 'uppercase', marginBottom: 8 }}>
            Active Alerts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {longShiftAlerts.map(emp => {
              const hrs = ((Date.now() - new Date(emp.clockInTs).getTime()) / 3600000).toFixed(1)
              return (
                <div key={`ls-${emp.id}`} style={{ background: 'rgba(255,59,48,.06)', border: '1px solid var(--t-danger)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                      {emp.location} · Clocked in for <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-danger)' }}>{hrs}h</span> — exceeds 8h threshold
                    </div>
                  </div>
                  <button onClick={() => setToastMsg(`Message sent to ${emp.full_name}`)}
                    style={{ ...btnSm('var(--t-danger)'), fontSize: 11, padding: '5px 10px' }}>
                    Notify Employee
                  </button>
                </div>
              )
            })}
            {noShowAlerts.map(emp => (
              <div key={`ns-${emp.id}`} style={{ background: 'rgba(255,59,48,.06)', border: '1px solid var(--t-danger)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                    {emp.location} · Expected today — no punch recorded
                  </div>
                </div>
                <button onClick={() => setToastMsg(`Message sent to ${emp.full_name}`)}
                  style={{ ...btnSm('var(--t-danger)'), fontSize: 11, padding: '5px 10px' }}>
                  Notify Employee
                </button>
              </div>
            ))}
            {longBreakAlerts.map(emp => (
              <div key={`lb-${emp.id}`} style={{ background: 'rgba(255,149,0,.06)', border: '1px solid var(--t-warn)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                    {emp.location} · {emp.breakType} — <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-warn)' }}>{emp.breakMinsElapsed}m</span> on break (exceeds 45m)
                  </div>
                </div>
                <button onClick={() => setToastMsg(`Message sent to ${emp.full_name}`)}
                  style={{ ...btnSm('var(--t-warn)'), fontSize: 11, padding: '5px 10px' }}>
                  Notify Employee
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAYROLL HELPERS
══════════════════════════════════════════════════════════════ */

// Bi-weekly pay period: anchor Jan 1 2026, 14-day periods
function getBiweeklyPeriod(offset = 0) {
  const anchor = new Date('2026-01-01T00:00:00')
  const now = new Date()
  const diffDays = Math.floor((now - anchor) / 86400000)
  const currentPeriodIdx = Math.floor(diffDays / 14)
  const targetIdx = currentPeriodIdx + offset
  const startMs = anchor.getTime() + targetIdx * 14 * 86400000
  const endMs   = startMs + 13 * 86400000
  const start   = new Date(startMs)
  const end     = new Date(endMs)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
    label: `${fmt(start)} – ${fmt(end)}${offset === 0 ? ' (Current)' : ''}`,
    isCurrent: offset === 0,
    dates: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(startMs + i * 86400000)
      return d.toISOString().slice(0, 10)
    }),
  }
}

function buildPayrollData(period) {
  const dateSet = new Set(period.dates)
  const allPunches = getAllPunches()

  return ALL_EMPLOYEES.map((emp, ei) => {
    // Pay rate: the person's hourly rate when the roster carries one; otherwise null and the
    // pay columns show '—' (no rate is ever invented)
    const rate = emp.hourly == null ? null : Number(emp.hourly)

    const empPunches = allPunches.filter(p => p.person_id === emp.id && dateSet.has(p.work_date) && p.punched_out_at)

    // Compute hours per day to detect daily OT (>8h/day) and weekly OT (>40h/week)
    const weeklyHrs = [0, 0] // [week1, week2]
    const dailyBreakdown = period.dates.map(date => {
      const punch = empPunches.find(p => p.work_date === date)
      if (!punch) return { date, clockIn: null, clockOut: null, breakMins: 0, regH: 0, otH: 0, dailyPay: 0 }
      const gross = calcHoursNum(punch.punched_in_at, punch.punched_out_at)
      const breakMin = punch.break_mins || (gross > 5 ? 30 : 0)
      const net = Math.max(0, gross - breakMin / 60)
      const regH = Math.min(net, 8)
      const otH = Math.max(0, net - 8)
      return {
        date,
        clockIn: fmtTime(punch.punched_in_at),
        clockOut: fmtTime(punch.punched_out_at),
        breakMins: breakMin,
        regH,
        otH,
        dailyPay: rate == null ? null : regH * rate + otH * rate * 1.5,
      }
    })

    // Weekly OT calculation: week 1 = days 0-6, week 2 = days 7-13
    const week1Hrs = dailyBreakdown.slice(0, 7).reduce((a, r) => a + r.regH + r.otH, 0)
    const week2Hrs = dailyBreakdown.slice(7).reduce((a, r) => a + r.regH + r.otH, 0)

    // Recalculate with weekly OT threshold (>40h/week)
    const weeklyOT1 = Math.max(0, week1Hrs - 40)
    const weeklyOT2 = Math.max(0, week2Hrs - 40)
    const totalOT = dailyBreakdown.reduce((a, r) => a + r.otH, 0) + weeklyOT1 + weeklyOT2
    const totalReg = dailyBreakdown.reduce((a, r) => a + r.regH, 0)
    const grossPay = rate == null ? null : totalReg * rate + totalOT * rate * 1.5

    // Status: pending until a pay run records otherwise (pay runs live in the OS Finance lane)
    const status = 'pending'

    return {
      ...emp,
      rate,
      totalReg,
      totalOT,
      grossPay,
      status,
      dailyBreakdown,
    }
  })
}

/* ══════════════════════════════════════════════════════════════
   TAB 6: PAYROLL SUMMARY (flag: payroll_summary, HR only)
══════════════════════════════════════════════════════════════ */
function PayrollSummaryTab({ session }) {
  const [periodOffset, setPeriodOffset] = useState(0)
  const [sortCol, setSortCol] = useState('full_name')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedEmp, setExpandedEmp] = useState(null)
  const [statuses, setStatuses] = useState({}) // override statuses keyed by emp.id
  const [confirmModal, setConfirmModal] = useState(false)
  const [toast, setToast] = useState(null)

  const period = getBiweeklyPeriod(periodOffset)
  const payrollRows = buildPayrollData(period)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const effectiveStatus = (emp) => statuses[emp.id] || emp.status

  // Sorted rows
  const sorted = [...payrollRows].sort((a, b) => {
    let va, vb
    if (sortCol === 'full_name')  { va = a.full_name; vb = b.full_name }
    else if (sortCol === 'grossPay') { va = a.grossPay; vb = b.grossPay; return sortAsc ? va - vb : vb - va }
    else if (sortCol === 'totalReg') { va = a.totalReg + a.totalOT; vb = b.totalReg + b.totalOT; return sortAsc ? va - vb : vb - va }
    else if (sortCol === 'location') { va = a.location; vb = b.location }
    else { va = a.full_name; vb = b.full_name }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(s => !s)
    else { setSortCol(col); setSortAsc(true) }
  }

  // KPI aggregates
  const totalGross    = payrollRows.reduce((a, r) => a + r.grossPay, 0)
  const totalRegHrs   = payrollRows.reduce((a, r) => a + r.totalReg, 0)
  const totalOTHrs    = payrollRows.reduce((a, r) => a + r.totalOT, 0)
  const employerCost  = totalGross * 1.12

  // Drill-down over payroll rows
  const [drill, setDrill] = useState(null)
  const PAYROLL_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role_name', label: 'Role', value: r => r.role_name },
    { key: 'rate', label: 'Rate', align: 'right', value: r => `$${r.rate.toFixed(2)}`, sortKey: r => r.rate },
    { key: 'totalReg', label: 'Reg Hrs', align: 'right', value: r => `${r.totalReg.toFixed(1)}h`, sortKey: r => r.totalReg },
    { key: 'totalOT', label: 'OT Hrs', align: 'right', value: r => `${r.totalOT.toFixed(1)}h`, sortKey: r => r.totalOT },
    { key: 'grossPay', label: 'Gross Pay', align: 'right', value: r => `$${r.grossPay.toFixed(2)}`, sortKey: r => r.grossPay },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'} · ${period.label}`, columns: PAYROLL_COLS, rows, accent })

  // Per-location chips
  const locChips = LOCATIONS.map(loc => {
    const rows = payrollRows.filter(r => r.location === loc)
    const pay  = rows.reduce((a, r) => a + r.grossPay, 0)
    const hrs  = rows.reduce((a, r) => a + r.totalReg + r.totalOT, 0)
    return { loc, pay, hrs }
  })

  function handleApproveAll() {
    const next = {}
    payrollRows.forEach(r => { if (effectiveStatus(r) === 'pending') next[r.id] = 'approved' })
    setStatuses(prev => ({ ...prev, ...next }))
    setConfirmModal(false)
    setToast('All pending records approved')
  }

  function exportCSV(variant = 'standard') {
    const headers = variant === 'adp'
      ? ['Co Code', 'Batch ID', 'File #', 'Employee Name', 'Location', 'Reg Hrs', 'O/T Hrs', 'Reg Earnings', 'O/T Earnings', 'Total Earnings']
      : variant === 'qb'
      ? ['Employee ID', 'Employee Name', 'Location', 'Hourly Rate', 'Regular Hours', 'OT Hours', 'Regular Pay', 'OT Pay', 'Gross Pay', 'Pay Period']
      : ['Employee ID', 'Name', 'Location', 'Pay Rate', 'Regular Hours', 'OT Hours', 'Regular Pay', 'OT Pay', 'Gross Pay', 'Pay Period']

    const rows = sorted.map(r => {
      const regPay = r.totalReg * r.rate
      const otPay  = r.totalOT * r.rate * 1.5
      if (variant === 'adp') return ['Twisted Growers', 'BIWEEKLY', r.id, r.full_name, r.location, r.totalReg.toFixed(2), r.totalOT.toFixed(2), regPay.toFixed(2), otPay.toFixed(2), r.grossPay.toFixed(2)]
      return [r.id, r.full_name, r.location, r.rate.toFixed(2), r.totalReg.toFixed(2), r.totalOT.toFixed(2), regPay.toFixed(2), otPay.toFixed(2), r.grossPay.toFixed(2), period.label]
    })

    const suffix = variant === 'adp' ? '-adp' : variant === 'qb' ? '-quickbooks' : ''
    downloadCSV(`payroll-${period.start}${suffix}.csv`, headers, rows)
    setToast(`Exported ${variant === 'adp' ? 'ADP' : variant === 'qb' ? 'QuickBooks' : 'Payroll'} CSV`)
  }

  const SortArrow = ({ col }) => (
    <span style={{ opacity: sortCol === col ? 1 : 0.3, marginLeft: 3 }}>
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  const isManager = session?.person && isHR(session.person.role_name)

  return (
    <div>
      {toast && (
        <div style={{ background: 'var(--t-success)', color: '#000', padding: '10px 16px', fontWeight: 700, fontSize: '13px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {toast}
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '28px', width: '400px', maxWidth: '96vw' }}>
            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--t-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Approve All Pending?</div>
            <div style={{ fontSize: '13px', color: 'var(--t-text-muted)', marginBottom: '22px' }}>
              This will mark all PENDING payroll records as APPROVED for {period.label}. This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleApproveAll} style={{ ...btnPrimary, flex: 1, background: 'var(--t-success)', color: '#000' }}>Confirm</button>
              <button onClick={() => setConfirmModal(false)} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay period selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px' }}>
        <button onClick={() => setPeriodOffset(o => o - 1)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px' }}>← Prev</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--t-text)' }}>{period.label}</span>
        <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0}
          style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px', opacity: periodOffset >= 0 ? 0.35 : 1 }}>Next →</button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
        <KTile label="Total Gross Pay" value={`$${totalGross.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="this pay period" color="var(--t-accent)" onClick={() => openDrill('Gross Pay by Employee', sorted, 'var(--t-accent)')} />
        <KTile label="Regular Hours" value={`${totalRegHrs.toFixed(0)}h`} sub="all employees" color="var(--t-text)" onClick={() => openDrill('Regular Hours by Employee', sorted, 'var(--t-accent)')} />
        <KTile label="Overtime Hours" value={`${totalOTHrs.toFixed(1)}h`} sub="OT @ 1.5×" color={totalOTHrs > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)'} alert={totalOTHrs > 0 ? 'amber' : null} onClick={() => openDrill('Employees with Overtime', payrollRows.filter(r => r.totalOT > 0), 'var(--t-danger)')} />
        <KTile label="Est. Employer Cost" value={`$${employerCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="gross × 1.12 (benefits/tax)" color="var(--t-text-muted)" onClick={() => openDrill('Employer Cost by Employee', sorted, 'var(--t-text-muted)')} />
      </div>

      {/* Per-location chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {locChips.map(c => (
          <div key={c.loc} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '6px 12px', fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{c.loc}:</span>{' '}
            <span style={{ fontFamily: 'monospace' }}>${c.pay.toFixed(0)}</span>{' · '}
            <span style={{ fontFamily: 'monospace' }}>{(c.hrs).toFixed(0)}h</span>
          </div>
        ))}
      </div>

      {/* Payroll table */}
      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {[
                { label: 'Employee',  col: 'full_name' },
                { label: 'Location',  col: 'location' },
                { label: 'Role',      col: null },
                { label: 'Pay Rate',  col: null },
                { label: 'Reg Hrs',   col: 'totalReg' },
                { label: 'OT Hrs',    col: null },
                { label: 'Gross Pay', col: 'grossPay' },
                { label: 'Status',    col: null },
              ].map(h => (
                <th key={h.label}
                  style={{ ...thStyle, cursor: h.col ? 'pointer' : 'default' }}
                  onClick={h.col ? () => toggleSort(h.col) : undefined}>
                  {h.label}{h.col && <SortArrow col={h.col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const eff = effectiveStatus(row)
              const isExpanded = expandedEmp === row.id
              return [
                <tr key={row.id}
                  onClick={() => setExpandedEmp(isExpanded ? null : row.id)}
                  style={{ borderBottom: '1px solid var(--t-line)', cursor: 'pointer', background: isExpanded ? 'rgba(0,229,255,.04)' : 'transparent' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{isExpanded ? '▼' : '▶'}</span>
                      {row.full_name}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.location}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontSize: 11 }}>{row.role_name}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${row.rate.toFixed(2)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.totalReg.toFixed(1)}h</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: row.totalOT > 0 ? 700 : 400, color: row.totalOT > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                    {row.totalOT > 0 ? `${row.totalOT.toFixed(1)}h` : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>
                    ${row.grossPay.toFixed(2)}
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge ${eff === 'approved' ? 'green' : eff === 'exported' ? 'purple' : 'amber'}`} style={{ fontSize: 10 }}>
                      {eff.toUpperCase()}
                    </span>
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${row.id}-detail`} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td colSpan={8} style={{ padding: '0 0 12px 20px', background: 'var(--t-bg)' }}>
                      <div style={{ padding: '12px 0', fontSize: 11 }}>
                        <div style={{ fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontSize: 10 }}>
                          Daily Breakdown — {period.label}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              {['Date', 'Clock In', 'Clock Out', 'Break', 'Reg Hrs', 'OT Hrs', 'Daily Pay'].map(h => (
                                <th key={h} style={{ ...thStyle, fontSize: 10, padding: '5px 8px' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {row.dailyBreakdown.map(day => (
                              <tr key={day.date} style={{ borderBottom: '1px solid var(--t-line)' }}>
                                <td style={{ padding: '5px 8px', color: 'var(--t-text)' }}>
                                  {fmtDateShort(day.date)} <span style={{ color: 'var(--t-text-faint)', fontSize: 10 }}>{fmtDayAbbr(day.date)}</span>
                                </td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: day.clockIn ? 'var(--t-text)' : 'var(--t-text-faint)' }}>
                                  {day.clockIn || '—'}
                                </td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: day.clockOut ? 'var(--t-text)' : 'var(--t-text-faint)' }}>
                                  {day.clockOut || '—'}
                                </td>
                                <td style={{ padding: '5px 8px', color: 'var(--t-text-muted)' }}>
                                  {day.breakMins > 0 ? `${day.breakMins}m` : '—'}
                                </td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>
                                  {day.regH > 0 ? `${day.regH.toFixed(2)}h` : '—'}
                                </td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: day.otH > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                                  {day.otH > 0 ? `${day.otH.toFixed(2)}h` : '—'}
                                </td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 600 }}>
                                  {day.dailyPay > 0 ? `$${day.dailyPay.toFixed(2)}` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', padding: '8px 0', marginBottom: 16 }}>
        This is an estimated payroll summary. Final amounts subject to payroll processor review. OT calculated at 1.5× for hours exceeding 40/week.
      </div>

      {/* Bottom action bar */}
      {isManager && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--t-line)', paddingTop: 14 }}>
          <button onClick={() => setConfirmModal(true)}
            style={{ ...btnPrimary, background: 'var(--t-success)', color: '#000' }}>
            Approve All
          </button>
          <button onClick={() => exportCSV('standard')} style={{ ...btnGhost, color: 'var(--t-accent)', border: '1px solid var(--t-accent)' }}>
            Export Payroll CSV
          </button>
          <button onClick={() => exportCSV('adp')} style={btnGhost}>
            Export for ADP
          </button>
          <button onClick={() => exportCSV('qb')} style={btnGhost}>
            Export for QuickBooks
          </button>
        </div>
      )}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════ */
export default function TimeClock() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const flagPayroll = useFeatureFlag('payroll_summary')

  const person = session?.person || {}
  const roleName = person.role_name || ''
  const canSeeHR = isHR(roleName)

  // Timecard EDITING is admin-controlled: admins/execs always can; everyone else
  // only if explicitly granted (feature_grants). Employees cannot edit by default.
  const isExecEditor = /admin|owner|coo|ceo|cfo|president|chief/i.test(roleName)
  const [tcGranted, setTcGranted] = useState(false)
  useEffect(() => {
    if (isExecEditor || !person.id) { setTcGranted(false); return }
    let alive = true
    sb.rpc('can_use_feature', { p_feature: 'timecard_edit', p_person_id: person.id })
      .then(({ data }) => { if (alive) setTcGranted(!!data) }).catch(() => { if (alive) setTcGranted(false) })
    return () => { alive = false }
  }, [person.id, isExecEditor])
  const canEditTC = isExecEditor || tcGranted

  const [tab, setTab] = useState('clock')
  const [now, setNow] = useState(new Date())
  const [dataVer, setDataVer] = useState(0)
  const [dataError, setDataError] = useState('')
  useEffect(() => {
    if (!locationIds?.length) return undefined
    let alive = true
    const to = todayStr()
    const from = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()
    Promise.all([
      sb.rpc('get_all_time_entries', { p_node_ids: locationIds, p_date_from: from, p_date_to: to }),
      sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: person.id || null }),
    ]).then(([t, r]) => {
      if (!alive) return
      const roster = (Array.isArray(r.data) ? r.data : []).filter(e => e.id).map(e => ({ id: e.id, full_name: e.full_name, role_name: e.role_name || 'Associate', location: e.node_name || '—', hourly: null }))
      const err = [t.error, r.error].filter(Boolean).map(e => e.message).join(' · ')
      setTimeClockData({ punches: rowsToPunches(Array.isArray(t.data) ? t.data : [], roster), employees: roster, error: err })
      setDataError(err)
      setDataVer(v => v + 1)
    })
    return () => { alive = false }
  }, [JSON.stringify(locationIds), person.id, now])

  // Tick for KPI panel refresh
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const TABS = [
    { id: 'clock',      label: 'Clock In / Out' },
    { id: 'timecard',   label: 'My Timecard' },
    ...(canSeeHR ? [{ id: 'all',      label: 'All Timecards' }] : []),
    ...(canSeeHR ? [{ id: 'floor',    label: 'Live Floor'    }] : []),
    ...(canSeeHR ? [{ id: 'reports',  label: 'Time Reports'  }] : []),
    ...(canSeeHR && flagPayroll ? [{ id: 'payroll', label: 'Payroll Summary' }] : []),
  ]

  // Normalize locations prop
  const resolvedLocations = locations && locations.length > 0
    ? locations
    : LOCATIONS.map((name, i) => ({ id: `loc-${i}`, name }))

  return (
    <div style={{ padding: '20px', maxWidth: '1440px' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
          Time Management
        </div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--t-text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Time Clock
        </h1>
        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--t-text-faint)' }}>
          {person.full_name || ''}{roleName ? ` · ${roleName}` : ''}
          {canSeeHR && <span className="badge purple" style={{ fontSize: '10px', marginLeft: 8 }}>HR VIEW</span>}
        </div>
      </div>

      {dataError && <div style={{ fontSize: 12, color: 'var(--t-danger)', marginBottom: 10 }}>Could not read time entries: {dataError}</div>}
      {/* KPI Panel — always visible */}
      {canSeeHR && <ForensicKPIPanel now={now} key={`kpi-${dataVer}`} />}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px', background: 'transparent',
              color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: tab === t.id ? 700 : 400,
              fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
              marginBottom: '-1px', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: 'none', padding: '24px' }}>
        {tab === 'clock' && (
          <ClockTab session={session} locationIds={locationIds} locations={resolvedLocations} />
        )}
        {tab === 'timecard' && (
          <MyTimecardTab session={session} isManager={canSeeHR} canEdit={canEditTC} />
        )}
        {tab === 'all' && canSeeHR && (
          <AllTimecardsTab key={`all-${dataVer}`} session={session} canEdit={canEditTC} />
        )}
        {tab === 'floor' && canSeeHR && (
          <LiveFloorTab key={`floor-${dataVer}`} />
        )}
        {tab === 'reports' && canSeeHR && (
          <TimeReportsTab key={`rep-${dataVer}`} />
        )}
        {tab === 'payroll' && canSeeHR && flagPayroll && (
          <PayrollSummaryTab session={session} />
        )}
      </div>
    </div>
  )
}
