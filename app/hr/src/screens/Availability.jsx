import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useNavigate } from 'react-router-dom'
import DrillDown from '../components/DrillDown.jsx'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DAYS_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const SHIFTS     = ['AM','PM','EVE']
const SHIFT_LABELS = { AM: '6am–2pm', PM: '2pm–10pm', EVE: '4pm–Close' }
// Avatar accent palette (presentation only — assigned deterministically from the
// real person UUID so a person keeps the same color everywhere).
const AVATAR_COLORS = ['#00e5ff','#7c4dff','#2ad6a0','#ff4d7d','#ffb800','#2979ff']
const initials = (name = '') => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'
const colorFor = (id = '') => AVATAR_COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

// Leadership roles (real role names vary — match broadly)
const MGR_RX = /manager|key ?holder|lead|supervisor/i

// Real locations in view = whatever the roster actually spans
const locationsOf = (employees) => [...new Set(employees.map(e => e.location).filter(Boolean))].sort()

// Human summary of a { Monday:{AM,PM,EVE}, ... } grid
function summarizeGrid(grid) {
  if (!grid || !Object.keys(grid).length) return 'None on file'
  const parts = DAYS_FULL
    .filter(d => SHIFTS.some(sh => grid[d]?.[sh]))
    .map(d => `${d.slice(0, 3)} ${SHIFTS.filter(sh => grid[d]?.[sh]).join('+')}`)
  return parts.length ? parts.join(', ') : 'No days available'
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().split('T')[0] }

function getWeekStart(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function formatWeekLabel(date) {
  const end = new Date(date)
  end.setDate(date.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${date.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function countAvailDays(avail) {
  return DAYS_FULL.filter(d => avail[d] && SHIFTS.some(sh => avail[d][sh])).length
}

function countAvailHours(avail, prefs) {
  const maxH = prefs?.max_hours || 32
  return Math.min(maxH, countAvailDays(avail) * 8)
}

function coverageLevelForDay(day, employees, availData) {
  let count = 0
  employees.forEach(e => {
    const da = availData[e.id]?.[day]
    if (da && SHIFTS.some(sh => da[sh])) count++
  })
  return count
}

function coveragePct(employees, availData) {
  if (!employees.length) return 0
  let total = 0
  DAYS_FULL.forEach(d => {
    total += coverageLevelForDay(d, employees, availData)
  })
  return Math.round((total / (DAYS_FULL.length * employees.length)) * 100)
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    padding: '16px',
    background: 'var(--t-bg, #070b14)',
    minHeight: '100vh',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    color: 'var(--t-text, #e6edf3)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  title: { fontSize: '18px', fontWeight: 700, color: 'var(--t-text)', margin: 0 },
  sub: { fontSize: '11px', color: 'var(--t-text-muted)', marginTop: '3px' },
  tabs: {
    display: 'flex',
    gap: '2px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--t-line)',
    overflowX: 'auto',
  },
  tab: active => ({
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: '-1px',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  }),
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  select: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '6px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    outline: 'none',
  },
  btn: variant => ({
    padding: '7px 14px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid var(--t-line)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    background:
      variant === 'accent'   ? 'var(--t-accent)'   :
      variant === 'success'  ? 'var(--t-success)'  :
      variant === 'danger'   ? 'var(--t-danger)'   :
      variant === 'warn'     ? 'var(--t-warn)'     :
      variant === 'ghost'    ? 'transparent'       : 'var(--t-surface)',
    color:
      variant === 'accent'  ? '#070b14' :
      variant === 'success' ? '#070b14' :
      variant === 'danger'  ? '#fff'    : 'var(--t-text)',
    transition: 'opacity 0.15s',
  }),
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    padding: '16px',
    marginBottom: '12px',
  },
  card2: {
    background: 'var(--t-surface-2, #111827)',
    border: '1px solid var(--t-line)',
    padding: '16px',
    marginBottom: '12px',
  },
  cardHeader: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: {
    padding: '8px 6px',
    textAlign: 'left',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--t-line)',
    whiteSpace: 'nowrap',
  },
  thC: {
    padding: '8px 4px',
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--t-line)',
  },
  td: {
    padding: '7px 6px',
    borderBottom: '1px solid rgba(30,37,48,0.5)',
    verticalAlign: 'middle',
  },
  tdC: {
    padding: '4px',
    borderBottom: '1px solid rgba(30,37,48,0.5)',
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  avatar: color => ({
    width: '28px',
    height: '28px',
    background: color || '#7c4dff',
    color: '#fff',
    fontSize: '9px',
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: '2px',
  }),
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    padding: '24px',
    width: '100%',
    maxWidth: '460px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--t-text)',
    marginBottom: '16px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
    display: 'block',
  },
  input: {
    width: '100%',
    background: 'var(--t-bg, #070b14)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '8px 10px',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  divider: { borderTop: '1px solid var(--t-line)', margin: '12px 0' },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--t-text-faint)',
    fontSize: '13px',
  },
  toast: type => ({
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: type === 'error' ? 'var(--t-danger)' : type === 'warn' ? 'var(--t-warn)' : 'var(--t-success)',
    color: '#070b14',
    padding: '10px 18px',
    fontSize: '12px',
    fontWeight: 700,
    zIndex: 99999,
    pointerEvents: 'none',
  }),
  weekNav: { display: 'flex', alignItems: 'center', gap: '8px' },
  weekLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--t-text)',
    minWidth: '168px',
    textAlign: 'center',
  },
  navBtn: {
    background: 'transparent',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text-muted)',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  shiftCell: (on) => ({
    background:   on ? 'rgba(0,229,255,0.12)'  : 'rgba(255,77,125,0.07)',
    color:        on ? 'var(--t-accent)'        : 'var(--t-text-faint)',
    fontSize: '9px',
    fontWeight: 700,
    textAlign: 'center',
    padding: '3px 4px',
    border: `1px solid ${on ? 'rgba(0,229,255,0.25)' : 'transparent'}`,
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'all 0.1s',
    minWidth: '28px',
  }),
  badge: {
    green:  { display:'inline-block', padding:'2px 7px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', background:'rgba(42,214,160,0.15)',  color:'var(--t-success)' },
    amber:  { display:'inline-block', padding:'2px 7px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', background:'rgba(255,184,0,0.15)',   color:'var(--t-warn)' },
    red:    { display:'inline-block', padding:'2px 7px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', background:'rgba(255,77,125,0.15)',  color:'var(--t-danger)' },
    blue:   { display:'inline-block', padding:'2px 7px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', background:'rgba(41,121,255,0.15)',  color:'#2979ff' },
    purple: { display:'inline-block', padding:'2px 7px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', background:'rgba(124,77,255,0.15)', color:'#7c4dff' },
  },
}

// ─── KPI TILE ─────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red'   && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)' }} />}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color: color || 'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function Toast({ msg, type }) {
  if (!msg) return null
  return <div style={S.toast(type)}>{msg}</div>
}

// ─── KPI PANEL ────────────────────────────────────────────────────────────────

// Drill-down column sets for Availability
const EMP_AVAIL_COLS = [
  { key: 'name', label: 'Employee', value: e => e.name },
  { key: 'role', label: 'Role', value: e => e.role },
  { key: 'location', label: 'Location', value: e => e.location },
  { key: 'availDays', label: 'Days/Wk', align: 'right', value: e => e.availDays, sortKey: e => e.availDays },
  { key: 'availHours', label: 'Hours/Wk', align: 'right', value: e => `${e.availHours}h`, sortKey: e => e.availHours },
  { key: 'tier', label: 'Availability', value: e => e.tier },
]
const REQUEST_COLS = [
  { key: 'emp_name', label: 'Employee', value: r => r.emp_name },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'current_summary', label: 'Current', value: r => r.current_summary },
  { key: 'requested', label: 'Requested Change', value: r => r.requested },
  { key: 'effective', label: 'Effective', value: r => r.effective, sortKey: r => r.effective },
  { key: 'reason', label: 'Reason', value: r => r.reason },
  { key: 'status', label: 'Status', value: r => (r.status || '').toUpperCase() },
]

function KpiPanel({ employees, availData, requests }) {
  const [drill, setDrill] = useState(null)
  // Per-employee availability roster
  const roster = employees.map(e => {
    const av = availData[e.id] || {}
    const availDays = countAvailDays(av)
    const availHours = countAvailHours(av, {})
    const tier = availDays >= 6 ? 'Fully Available' : availDays >= 3 ? 'Partially Available' : 'Limited'
    return { ...e, availDays, availHours, tier }
  })
  const openEmpDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: EMP_AVAIL_COLS, rows: [...rows].sort((a, b) => b.availDays - a.availDays), accent })
  const openReqDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} request${rows.length === 1 ? '' : 's'}`, columns: REQUEST_COLS, rows, accent })
  const availOnDay = (dayName) => roster.filter(e => SHIFTS.some(sh => (availData[e.id]?.[dayName]?.[sh])))

  // Row 1 stats
  const total = employees.length
  const fullAvail  = employees.filter(e => countAvailDays(availData[e.id] || {}) >= 6).length
  const partAvail  = employees.filter(e => { const d = countAvailDays(availData[e.id] || {}); return d >= 3 && d < 6 }).length
  const limited    = employees.filter(e => countAvailDays(availData[e.id] || {}) < 3).length
  const avgDays    = total ? (employees.reduce((s, e) => s + countAvailDays(availData[e.id] || {}), 0) / total).toFixed(1) : '—'
  const avgHours   = total ? Math.round(employees.reduce((s, e) => s + countAvailHours(availData[e.id] || {}, {}), 0) / total) : '—'

  // Row 2 stats
  const dayCounts = DAYS_FULL.map(d => ({ day: d, count: coverageLevelForDay(d, employees, availData) }))
  const bestDay  = dayCounts.reduce((a, b) => b.count > a.count ? b : a, dayCounts[0])
  const worstDay = dayCounts.reduce((a, b) => b.count < a.count ? b : a, dayCounts[0])
  const pending  = requests.filter(r => r.status === 'pending').length
  const approved = requests.filter(r => r.status === 'approved').length
  const changesThisMonth = requests.length
  const overallScore = coveragePct(employees, availData)

  // Row 3 — by-location (locations derived from the real roster)
  const locStats = locationsOf(employees).map(loc => {
    const emps = employees.filter(e => e.location === loc)
    const daySummary = DAYS_FULL.map(d => {
      const cnt = coverageLevelForDay(d, emps, availData)
      const color = cnt >= 3 ? 'var(--t-success)' : cnt >= 2 ? 'var(--t-warn)' : 'var(--t-danger)'
      return { d, cnt, color }
    })
    const score = coveragePct(emps, availData)
    return { loc, emps: emps.length, daySummary, score }
  })

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '8px' }}>
        <KTile label="Total Employees"    value={total}     sub="all locations" onClick={() => openEmpDrill('All Employees — Availability', roster, 'var(--t-accent)')} />
        <KTile label="Fully Available"    value={fullAvail} sub="6–7 days/wk"   color="var(--t-success)" alert={fullAvail < 5 ? 'amber' : null} onClick={() => openEmpDrill('Fully Available Employees (6–7 days)', roster.filter(e => e.availDays >= 6), 'var(--t-success)')} />
        <KTile label="Partially Available" value={partAvail} sub="3–5 days/wk"  color="var(--t-warn)" onClick={() => openEmpDrill('Partially Available Employees (3–5 days)', roster.filter(e => e.availDays >= 3 && e.availDays < 6), 'var(--t-warn)')} />
        <KTile label="Limited (<3 days)"  value={limited}   sub="students/PT"   color="var(--t-danger)" alert={limited > 6 ? 'red' : null} onClick={() => openEmpDrill('Limited Availability Employees (<3 days)', roster.filter(e => e.availDays < 3), 'var(--t-danger)')} />
        <KTile label="Avg Available Days" value={avgDays}   sub="per employee/wk" onClick={() => openEmpDrill('Availability Days by Employee', roster, 'var(--t-accent)')} />
        <KTile label="Avg Hours Avail"    value={`${avgHours}h`} sub="per employee/wk" onClick={() => openEmpDrill('Availability Hours by Employee', roster, 'var(--t-accent)')} />
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '8px' }}>
        <KTile label="Best Coverage Day"  value={bestDay?.day?.slice(0,3) || '—'}  sub={`${bestDay?.count || 0} available`} color="var(--t-success)" onClick={() => openEmpDrill(bestDay ? `Available on ${bestDay.day} (Best Coverage)` : 'Best Coverage Day', availOnDay(bestDay?.day), 'var(--t-success)')} />
        <KTile label="Worst Coverage Day" value={worstDay?.day?.slice(0,3) || '—'} sub={`${worstDay?.count || 0} available`} color="var(--t-danger)" alert={worstDay?.count < 3 ? 'red' : 'amber'} onClick={() => openEmpDrill(worstDay ? `Available on ${worstDay.day} (Worst Coverage)` : 'Worst Coverage Day', availOnDay(worstDay?.day), 'var(--t-danger)')} />
        <KTile label="Changes This Month" value={changesThisMonth} sub={`${approved} approved`} onClick={() => openReqDrill('All Change Requests', requests, 'var(--t-accent)')} />
        <KTile label="Pending Requests"   value={pending}  sub="awaiting review" color="var(--t-warn)" alert={pending > 2 ? 'amber' : null} onClick={() => openReqDrill('Pending Change Requests', requests.filter(r => r.status === 'pending'), 'var(--t-warn)')} />
        <KTile label="Coverage Score"     value={`${overallScore}%`} sub="all locations avg" color={overallScore >= 70 ? 'var(--t-success)' : overallScore >= 50 ? 'var(--t-warn)' : 'var(--t-danger)'} alert={overallScore < 50 ? 'red' : null} onClick={() => openEmpDrill('All Employees — Availability', roster, 'var(--t-accent)')} />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Row 3 — by-location coverage matrix */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
          Coverage by Location &amp; Day
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...S.table, fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: '110px' }}>Location</th>
                <th style={S.th}>Staff</th>
                <th style={S.th}>Score</th>
                {DAYS_SHORT.map(d => <th key={d} style={S.thC}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {locStats.map(ls => (
                <tr key={ls.loc}>
                  <td style={S.td}>
                    <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{ls.loc}</span>
                  </td>
                  <td style={S.td}><span style={{ color: 'var(--t-text-muted)' }}>{ls.emps}</span></td>
                  <td style={S.td}>
                    <span style={{
                      fontWeight: 700,
                      color: ls.score >= 70 ? 'var(--t-success)' : ls.score >= 50 ? 'var(--t-warn)' : 'var(--t-danger)',
                    }}>{ls.score}%</span>
                  </td>
                  {ls.daySummary.map(({ d, cnt, color }) => (
                    <td key={d} style={S.tdC}>
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color,
                        background: `${color}18`,
                        padding: '2px 4px',
                        textAlign: 'center',
                      }}>{cnt}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── SHIFT CELL TOGGLE ────────────────────────────────────────────────────────

function ShiftToggle({ on, onClick, label }) {
  return (
    <div
      style={S.shiftCell(on)}
      onClick={onClick}
      title={label}
    >
      {on ? '✓' : '·'}
    </div>
  )
}

// ─── TAB 1: MY AVAILABILITY ───────────────────────────────────────────────────

function MyAvailability({ myEmp, myAvail, myPrefs, myBlackouts, onSave, saving, isHR }) {
  const [shifts, setShifts] = useState(() => {
    const init = {}
    DAYS_FULL.forEach(d => {
      init[d] = {}
      SHIFTS.forEach(sh => { init[d][sh] = myAvail?.[d]?.[sh] ?? false })
    })
    return init
  })
  const [prefShift,  setPrefShift]  = useState(myPrefs?.preferred_shift || 'any')
  const [maxHours,   setMaxHours]   = useState(myPrefs?.max_hours || 32)
  const [blackouts,  setBlackouts]  = useState(myBlackouts || [])
  const [newBo,      setNewBo]      = useState('')

  const toggleShift = (day, sh) => {
    setShifts(prev => ({
      ...prev,
      [day]: { ...prev[day], [sh]: !prev[day][sh] },
    }))
  }

  const addBlackout = () => {
    if (newBo && !blackouts.includes(newBo)) {
      setBlackouts(prev => [...prev, newBo].sort())
      setNewBo('')
    }
  }

  const removeBlackout = (w) => setBlackouts(prev => prev.filter(x => x !== w))

  const handleSave = () => {
    onSave({ shifts, prefs: { preferred_shift: prefShift, max_hours: maxHours }, blackouts })
  }

  const availDays = DAYS_FULL.filter(d => SHIFTS.some(sh => shifts[d][sh])).length
  const totalSlots = DAYS_FULL.reduce((s, d) => s + SHIFTS.filter(sh => shifts[d][sh]).length, 0)

  const [drill, setDrill] = useState(null)
  const dayRows = DAYS_FULL.map(d => {
    const onShifts = SHIFTS.filter(sh => shifts[d][sh])
    return {
      day: d,
      slots: onShifts.length,
      shifts: onShifts.length ? onShifts.map(sh => `${sh} (${SHIFT_LABELS[sh]})`).join(', ') : 'Unavailable',
      available: onShifts.length > 0,
    }
  })
  const DAY_COLS = [
    { key: 'day', label: 'Day', value: r => r.day },
    { key: 'shifts', label: 'Available Shifts', value: r => r.shifts },
    { key: 'slots', label: 'Slots', align: 'right', value: r => r.slots, sortKey: r => r.slots },
    { key: 'available', label: 'Status', value: r => (r.available ? 'Available' : 'Off') },
  ]
  const openDayDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} day${rows.length === 1 ? '' : 's'}`, columns: DAY_COLS, rows, accent })

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <KTile label="Available Days"  value={availDays}    sub="of 7 this week" color="var(--t-accent)" onClick={() => openDayDrill('My Available Days', dayRows.filter(r => r.available), 'var(--t-accent)')} />
        <KTile label="Available Slots" value={totalSlots}   sub={`of ${DAYS_FULL.length * SHIFTS.length} total`} onClick={() => openDayDrill('My Availability by Day', dayRows, 'var(--t-accent)')} />
        <KTile label="Max Hours"       value={`${maxHours}h`} sub="per week" onClick={() => openDayDrill('My Availability by Day', dayRows, 'var(--t-accent)')} />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Main grid */}
      <div style={S.card}>
        <div style={S.cardHeader}>My Weekly Availability</div>
        <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', marginBottom: '14px' }}>
          Check each shift you are available. AM = 6am–2pm · PM = 2pm–10pm · EVE = 4pm–Close.
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: '100px' }}>Day</th>
                {SHIFTS.map(sh => (
                  <th key={sh} style={S.thC}>
                    <div>{sh}</div>
                    <div style={{ fontSize: '9px', fontWeight: 400, color: 'var(--t-text-faint)', marginTop: '2px' }}>{SHIFT_LABELS[sh]}</div>
                  </th>
                ))}
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {DAYS_FULL.map((d, di) => {
                const anyOn = SHIFTS.some(sh => shifts[d][sh])
                const allOn = SHIFTS.every(sh => shifts[d][sh])
                return (
                  <tr key={d}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{d}</div>
                      <div style={{ fontSize: '9px', color: 'var(--t-text-faint)' }}>{DAYS_SHORT[di]}</div>
                    </td>
                    {SHIFTS.map(sh => (
                      <td key={sh} style={S.tdC}>
                        <ShiftToggle
                          on={shifts[d][sh]}
                          onClick={() => toggleShift(d, sh)}
                          label={`${d} ${sh}`}
                        />
                      </td>
                    ))}
                    <td style={S.td}>
                      {allOn  && <span style={S.badge.green}>Open</span>}
                      {!allOn && anyOn  && <span style={S.badge.amber}>Partial</span>}
                      {!anyOn && <span style={S.badge.red}>Off</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Quick-fill row */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: 'var(--t-text-muted)', alignSelf: 'center' }}>Quick fill:</span>
          <button style={S.btn('ghost')} onClick={() => {
            setShifts(() => { const n = {}; DAYS_FULL.forEach(d => { n[d] = { AM: true, PM: true, EVE: true } }); return n })
          }}>All Open</button>
          <button style={S.btn('ghost')} onClick={() => {
            setShifts(() => { const n = {}; DAYS_FULL.slice(0,5).forEach(d => { n[d] = { AM: true, PM: true, EVE: false } }); DAYS_FULL.slice(5).forEach(d => { n[d] = { AM: false, PM: false, EVE: false } }); return n })
          }}>Weekdays Only</button>
          <button style={S.btn('ghost')} onClick={() => {
            setShifts(() => { const n = {}; DAYS_FULL.forEach(d => { n[d] = { AM: true, PM: false, EVE: false } }); return n })
          }}>AM Only</button>
          <button style={{ ...S.btn('danger'), fontSize: '11px' }} onClick={() => {
            setShifts(() => { const n = {}; DAYS_FULL.forEach(d => { n[d] = { AM: false, PM: false, EVE: false } }); return n })
          }}>Clear All</button>
        </div>
      </div>

      {/* Preferences */}
      <div style={S.card}>
        <div style={S.cardHeader}>Preferences</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={S.label}>Preferred Shift</label>
            <select value={prefShift} onChange={e => setPrefShift(e.target.value)} style={{ ...S.select, width: '100%' }}>
              <option value="any">No Preference</option>
              <option value="AM">AM (Morning)</option>
              <option value="PM">PM (Afternoon)</option>
              <option value="EVE">EVE (Evening)</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Max Hours / Week</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="range"
                min={8}
                max={40}
                value={maxHours}
                onChange={e => setMaxHours(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t-accent)', minWidth: '36px' }}>{maxHours}h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Blackout weeks */}
      <div style={S.card}>
        <div style={S.cardHeader}>Unavailable Weeks (Blackouts)</div>
        <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', marginBottom: '12px' }}>
          Mark specific weeks you cannot work (vacation, medical, etc.)
        </div>
        {blackouts.length === 0 && (
          <div style={{ color: 'var(--t-text-faint)', fontSize: '12px', marginBottom: '12px' }}>No blackout weeks set.</div>
        )}
        {blackouts.map(w => (
          <div key={w} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--t-text)', fontSize: '12px' }}>Week of {w}</span>
              <span style={{ ...S.badge.red, marginLeft: '8px' }}>Blackout</span>
            </div>
            <button style={{ ...S.btn('ghost'), padding: '3px 8px', fontSize: '11px', color: 'var(--t-danger)' }} onClick={() => removeBlackout(w)}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            type="date"
            value={newBo}
            onChange={e => setNewBo(e.target.value)}
            style={{ ...S.input, flex: 1 }}
            placeholder="Select week start (Monday)"
          />
          <button style={S.btn('accent')} onClick={addBlackout}>Add Blackout</button>
        </div>
      </div>

      {/* Save / Submit */}
      {!isHR && (
        <div style={{ marginTop: 14, background: 'rgba(255,179,71,.08)', border: '1px solid var(--t-warn)', padding: '10px 14px', fontSize: 12, color: 'var(--t-text-muted)' }}>
          🔒 Availability changes require <b style={{ color: 'var(--t-text)' }}>HR approval</b>. Submitting sends a request — your schedule availability updates only once a manager approves it.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 12 }}>
        <button style={S.btn('accent')} onClick={handleSave} disabled={saving}>
          {saving ? (isHR ? 'Saving…' : 'Submitting…') : (isHR ? 'Save My Availability' : 'Submit Change for Approval')}
        </button>
      </div>
    </div>
  )
}

// ─── WHO'S AVAILABLE MODAL ────────────────────────────────────────────────────

function WhoModal({ day, shift, employees, availData, onClose }) {
  const available = employees.filter(e => availData[e.id]?.[day]?.[shift])
  const unavailable = employees.filter(e => !availData[e.id]?.[day]?.[shift])
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalTitle}>
          {day} — {shift} ({SHIFT_LABELS[shift]})
          <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', fontWeight: 400, marginTop: '3px' }}>
            {available.length} available · {unavailable.length} unavailable
          </div>
        </div>

        {available.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t-success)', textTransform: 'uppercase', marginBottom: '8px' }}>Available</div>
            {available.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={S.avatar(e.color)}>{e.avatar}</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-text)' }}>{e.name}</div>
                  <div style={{ fontSize: '9px', color: 'var(--t-text-muted)' }}>{e.role} · {e.location}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {unavailable.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t-danger)', textTransform: 'uppercase', marginBottom: '8px' }}>Unavailable</div>
            {unavailable.slice(0, 6).map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', opacity: 0.6 }}>
                <div style={S.avatar(e.color)}>{e.avatar}</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-text)' }}>{e.name}</div>
                  <div style={{ fontSize: '9px', color: 'var(--t-text-muted)' }}>{e.role} · {e.location}</div>
                </div>
              </div>
            ))}
            {unavailable.length > 6 && (
              <div style={{ fontSize: '11px', color: 'var(--t-text-faint)', marginTop: '4px' }}>
                +{unavailable.length - 6} more
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button style={S.btn('ghost')} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── TAB 2: TEAM AVAILABILITY MATRIX ─────────────────────────────────────────

function TeamAvailability({ employees, availData, navigate }) {
  const [locFilter, setLocFilter] = useState('All')
  const [whoModal,  setWhoModal]  = useState(null) // { day, shift }

  const locOptions = ['All', ...locationsOf(employees)]
  const filtered = employees.filter(e => locFilter === 'All' || e.location === locFilter)

  const managers  = filtered.filter(e => MGR_RX.test(e.role || ''))
  const assocs    = filtered.filter(e => !MGR_RX.test(e.role || ''))

  const coverageDot = (count) => {
    if (count >= 3) return 'var(--t-success)'
    if (count >= 2) return 'var(--t-warn)'
    return 'var(--t-danger)'
  }

  const renderGroup = (group, label) => {
    if (!group.length) return null
    return (
      <div style={S.card} key={label}>
        <div style={S.cardHeader}>
          {label}
          <span style={S.badge.purple}>{group.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: '150px' }}>Employee</th>
                {DAYS_FULL.map((d, di) => (
                  <th key={d} colSpan={3} style={{ ...S.thC, borderLeft: '1px solid var(--t-line)' }}>
                    <div>{DAYS_SHORT[di]}</div>
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginTop: '4px' }}>
                      {SHIFTS.map(sh => {
                        const cnt = coverageLevelForDay(d, filtered, availData)
                        return (
                          <div
                            key={sh}
                            style={{ fontSize: '7px', fontWeight: 700, color: coverageDot(cnt), width: '20px', textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => setWhoModal({ day: d, shift: sh })}
                            title={`${d} ${sh} — click to see who's available`}
                          >
                            {sh}
                          </div>
                        )
                      })}
                    </div>
                  </th>
                ))}
                <th style={S.th}>Days</th>
              </tr>
            </thead>
            <tbody>
              {group.map(emp => {
                const ea = availData[emp.id] || {}
                const availDays = countAvailDays(ea)
                return (
                  <tr key={emp.id}>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={S.avatar(emp.color)}>{emp.avatar}</div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-text)' }}>{emp.name}</div>
                          <div style={{ fontSize: '9px', color: 'var(--t-text-muted)' }}>{emp.role} · {emp.location}</div>
                        </div>
                      </div>
                    </td>
                    {DAYS_FULL.map(d => (
                      SHIFTS.map(sh => (
                        <td key={`${d}-${sh}`} style={{ ...S.tdC, borderLeft: sh === 'AM' ? '1px solid var(--t-line)' : 'none' }}>
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              background: ea[d]?.[sh] ? 'rgba(0,229,255,0.2)' : 'transparent',
                              border: `1px solid ${ea[d]?.[sh] ? 'rgba(0,229,255,0.4)' : 'var(--t-line)'}`,
                              margin: '0 auto',
                              cursor: 'pointer',
                            }}
                            onClick={() => setWhoModal({ day: d, shift: sh })}
                            title={`${d} ${sh} — ${ea[d]?.[sh] ? 'Available' : 'Not available'}`}
                          />
                        </td>
                      ))
                    ))}
                    <td style={S.td}>
                      <span style={{
                        fontWeight: 700,
                        color: availDays >= 6 ? 'var(--t-success)' : availDays >= 3 ? 'var(--t-warn)' : 'var(--t-danger)',
                        fontSize: '12px',
                      }}>
                        {availDays}/7
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={S.toolbar}>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={S.select}>
          {locOptions.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
        </select>
        <button style={S.btn('ghost')} onClick={() => window.print()}>Export PDF</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--t-text-muted)', alignItems: 'center' }}>
          <span><span style={{ color: 'var(--t-success)', fontWeight: 700 }}>■</span> Available</span>
          <span><span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>■</span> Partial</span>
          <span><span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>■</span> Off</span>
        </div>
      </div>

      {/* Coverage heat row */}
      <div style={{ ...S.card, marginBottom: '12px' }}>
        <div style={S.cardHeader}>Coverage Heat Map — Click a cell to see who is available</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {DAYS_FULL.map((d, di) => {
            const cnt = coverageLevelForDay(d, filtered, availData)
            const pct = filtered.length ? Math.round((cnt / filtered.length) * 100) : 0
            return (
              <div key={d} style={{
                background: pct >= 70 ? 'rgba(42,214,160,0.1)' : pct >= 40 ? 'rgba(255,184,0,0.1)' : 'rgba(255,77,125,0.1)',
                border: `1px solid ${pct >= 70 ? 'rgba(42,214,160,0.3)' : pct >= 40 ? 'rgba(255,184,0,0.3)' : 'rgba(255,77,125,0.3)'}`,
                padding: '8px 4px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: '4px' }}>{DAYS_SHORT[di]}</div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: pct >= 70 ? 'var(--t-success)' : pct >= 40 ? 'var(--t-warn)' : 'var(--t-danger)',
                  lineHeight: 1,
                }}>{cnt}</div>
                <div style={{ fontSize: '9px', color: 'var(--t-text-faint)', marginTop: '2px' }}>avail</div>
                <div style={{ display: 'flex', gap: '2px', marginTop: '6px', justifyContent: 'center' }}>
                  {SHIFTS.map(sh => (
                    <div
                      key={sh}
                      style={{
                        fontSize: '7px',
                        fontWeight: 700,
                        color: 'var(--t-accent)',
                        cursor: 'pointer',
                        padding: '1px 3px',
                        background: 'rgba(0,229,255,0.1)',
                        border: '1px solid rgba(0,229,255,0.2)',
                      }}
                      onClick={() => setWhoModal({ day: d, shift: sh })}
                    >
                      {sh}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {renderGroup(managers, 'Key Holders & Managers')}
      {renderGroup(assocs,  'Associates')}

      {filtered.length === 0 && <div style={S.emptyState}>No employees for this location.</div>}

      {whoModal && (
        <WhoModal
          day={whoModal.day}
          shift={whoModal.shift}
          employees={filtered}
          availData={availData}
          onClose={() => setWhoModal(null)}
        />
      )}
    </div>
  )
}

// ─── TAB 3: COVERAGE GAPS ────────────────────────────────────────────────────

function CoverageGaps({ employees, availData, navigate }) {
  // Build next 14 days
  const today = new Date()
  const NEED_PER_SHIFT = 3 // target coverage per shift

  const days14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dayName = DAYS_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1]
    return { date: d, dayName, label: `${d.toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric' })}` }
  })

  const gaps = days14.map(({ date, dayName, label }) => {
    const shiftGaps = SHIFTS.map(sh => {
      const avail = employees.filter(e => availData[e.id]?.[dayName]?.[sh]).length
      const needed = Math.max(0, NEED_PER_SHIFT - avail)
      return { sh, avail, needed, gap: needed > 0 }
    })
    const hasGap = shiftGaps.some(s => s.gap)
    return { date, dayName, label, shiftGaps, hasGap }
  })

  const totalGaps = gaps.reduce((s, d) => s + d.shiftGaps.filter(s => s.gap).length, 0)

  // Flatten to per-shift rows for drill-down
  const shiftRows = gaps.flatMap(({ label, dayName, shiftGaps }) =>
    shiftGaps.map(sg => ({
      label, dayName, shift: sg.sh, avail: sg.avail, needed: sg.needed,
      status: sg.gap ? `Need ${sg.needed} more` : 'Covered',
      isGap: sg.gap,
    }))
  )
  const GAP_COLS = [
    { key: 'label', label: 'Date', value: r => r.label },
    { key: 'dayName', label: 'Day', value: r => r.dayName },
    { key: 'shift', label: 'Shift', value: r => `${r.shift} (${SHIFT_LABELS[r.shift] || ''})` },
    { key: 'avail', label: 'Available', align: 'right', value: r => r.avail, sortKey: r => r.avail },
    { key: 'needed', label: 'Short By', align: 'right', value: r => (r.needed > 0 ? r.needed : '—'), sortKey: r => r.needed },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const [drill, setDrill] = useState(null)
  const openGapDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} shift slot${rows.length === 1 ? '' : 's'} · next 14 days`, columns: GAP_COLS, rows, accent })

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <KTile
          label="Coverage Gaps (14 days)"
          value={totalGaps}
          sub={`across ${gaps.filter(d => d.hasGap).length} days`}
          color="var(--t-danger)"
          alert={totalGaps > 5 ? 'red' : totalGaps > 0 ? 'amber' : null}
          onClick={() => openGapDrill('Coverage Gaps — Understaffed Shifts', shiftRows.filter(r => r.isGap), 'var(--t-danger)')}
        />
        <KTile
          label="Shifts OK"
          value={gaps.reduce((s, d) => s + d.shiftGaps.filter(sh => !sh.gap).length, 0)}
          sub="adequately covered"
          color="var(--t-success)"
          onClick={() => openGapDrill('Adequately Covered Shifts', shiftRows.filter(r => !r.isGap), 'var(--t-success)')}
        />
        <KTile
          label="Target / Shift"
          value={`${NEED_PER_SHIFT}+`}
          sub="minimum employees"
          onClick={() => openGapDrill('All Shift Slots — Next 14 Days', shiftRows, 'var(--t-accent)')}
        />
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          Next 14 Days — Coverage Gap Analysis
          <button
            style={{ ...S.btn('accent'), marginLeft: 'auto', padding: '4px 10px', fontSize: '11px' }}
            onClick={() => navigate('/coverage')}
          >
            Coverage Board →
          </button>
        </div>

        {gaps.map(({ date, dayName, label, shiftGaps, hasGap }) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 0',
            borderBottom: '1px solid var(--t-line)',
            background: hasGap ? 'rgba(255,77,125,0.03)' : 'transparent',
          }}>
            {/* Date label */}
            <div style={{ minWidth: '130px', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-text)' }}>{label}</div>
              <div style={{ fontSize: '9px', color: 'var(--t-text-muted)', marginTop: '2px' }}>{dayName}</div>
            </div>

            {/* Shift breakdown */}
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              {shiftGaps.map(({ sh, avail, needed, gap }) => (
                <div key={sh} style={{
                  flex: 1,
                  background: gap ? 'rgba(255,77,125,0.08)' : 'rgba(42,214,160,0.06)',
                  border: `1px solid ${gap ? 'rgba(255,77,125,0.25)' : 'rgba(42,214,160,0.15)'}`,
                  padding: '6px 8px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: '3px' }}>{sh}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: gap ? 'var(--t-danger)' : 'var(--t-success)', lineHeight: 1 }}>
                    {avail}
                  </div>
                  <div style={{ fontSize: '8px', color: 'var(--t-text-faint)', marginTop: '2px' }}>
                    {gap ? `need ${needed} more` : 'covered'}
                  </div>
                </div>
              ))}
            </div>

            {/* Status / Action */}
            <div style={{ minWidth: '100px', textAlign: 'right', flexShrink: 0 }}>
              {hasGap ? (
                <button
                  style={{ ...S.btn('danger'), padding: '4px 10px', fontSize: '10px' }}
                  onClick={() => navigate('/coverage')}
                >
                  Find Coverage
                </button>
              ) : (
                <span style={S.badge.green}>Staffed</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB 4: CHANGE REQUESTS ───────────────────────────────────────────────────

function ChangeRequests({ employees, requests, reviewerId, onRefresh, showToast }) {
  const [filter, setFilter] = useState('pending')
  const [histLog, setHistLog] = useState([]) // { id, action, by, at }
  const [busy, setBusy] = useState(null)

  const filtered = requests.filter(r => filter === 'all' || r.status === filter)

  const handleAction = async (req, action) => {
    setBusy(req.id)
    try {
      // On approval the RPC applies the requested grid/prefs/blackouts server-side.
      const { data, error } = await sb.rpc('resolve_availability_request', {
        p_request_id: req.id,
        p_action: action,
        p_reviewer: reviewerId || null,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'Could not resolve request')
      setHistLog(prev => [{
        id: req.id,
        action,
        emp: req.emp_name,
        at: new Date().toLocaleString(),
      }, ...prev])
      showToast(`Request ${action === 'approve' ? 'approved & applied' : 'denied'} for ${req.emp_name || 'employee'}`)
      await onRefresh()
    } catch (e) {
      showToast(`Not saved — ${e.message || 'request could not be resolved'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const pending = requests.filter(r => r.status === 'pending').length

  const [drill, setDrill] = useState(null)
  const REQ_COLS = [
    { key: 'emp_name', label: 'Employee', value: r => r.emp_name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'current_summary', label: 'Current', value: r => r.current_summary },
    { key: 'requested', label: 'Requested Change', value: r => r.requested },
    { key: 'effective', label: 'Effective', value: r => r.effective, sortKey: r => r.effective },
    { key: 'reason', label: 'Reason', value: r => r.reason },
    { key: 'status', label: 'Status', value: r => (r.status || '').toUpperCase() },
  ]
  const openReqDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} request${rows.length === 1 ? '' : 's'}`, columns: REQ_COLS, rows, accent })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <KTile label="Total Requests"  value={requests.length}                                    sub="this month" onClick={() => openReqDrill('All Change Requests', requests, 'var(--t-accent)')} />
        <KTile label="Pending"         value={pending}                                            sub="need action" color="var(--t-warn)" alert={pending > 0 ? 'amber' : null} onClick={() => openReqDrill('Pending Change Requests', requests.filter(r => r.status === 'pending'), 'var(--t-warn)')} />
        <KTile label="Approved"        value={requests.filter(r => r.status === 'approved').length} sub="this month" color="var(--t-success)" onClick={() => openReqDrill('Approved Change Requests', requests.filter(r => r.status === 'approved'), 'var(--t-success)')} />
        <KTile label="Denied"          value={requests.filter(r => r.status === 'denied').length}   sub="this month" color="var(--t-danger)" onClick={() => openReqDrill('Denied Change Requests', requests.filter(r => r.status === 'denied'), 'var(--t-danger)')} />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      <div style={S.toolbar}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={S.select}>
          <option value="all">All Requests</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <span style={{ fontSize: '11px', color: 'var(--t-text-muted)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>Availability Change Requests</div>
        {filtered.length === 0 ? (
          <div style={S.emptyState}>No {filter === 'all' ? '' : filter} requests.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Employee</th>
                  <th style={S.th}>Current Availability</th>
                  <th style={S.th}>Requested Change</th>
                  <th style={S.th}>Effective</th>
                  <th style={S.th}>Reason</th>
                  <th style={S.th}>Submitted</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => {
                  const emp = employees.find(e => e.id === req.emp_id)
                  return (
                    <tr key={req.id}>
                      <td style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {emp && <div style={S.avatar(emp.color)}>{emp.avatar}</div>}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-text)' }}>{req.emp_name}</div>
                            <div style={{ fontSize: '9px', color: 'var(--t-text-muted)' }}>{req.location}</div>
                          </div>
                        </div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', maxWidth: '140px' }}>{req.current_summary}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontSize: '11px', color: 'var(--t-accent)', maxWidth: '160px' }}>{req.requested}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t-text)' }}>{req.effective}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', maxWidth: '160px', fontStyle: 'italic' }}>
                          "{req.reason}"
                        </div>
                      </td>
                      <td style={S.td}>
                        <div style={{ fontSize: '10px', color: 'var(--t-text-faint)' }}>{req.submitted}</div>
                      </td>
                      <td style={S.td}>
                        {req.status === 'pending'  && <span style={S.badge.amber}>Pending</span>}
                        {req.status === 'approved' && <span style={S.badge.green}>Approved</span>}
                        {req.status === 'denied'   && <span style={S.badge.red}>Denied</span>}
                      </td>
                      <td style={S.td}>
                        {req.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              style={{ ...S.btn('success'), padding: '4px 10px', fontSize: '11px', opacity: busy === req.id ? 0.5 : 1 }}
                              disabled={busy === req.id}
                              onClick={() => handleAction(req, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              style={{ ...S.btn('danger'), padding: '4px 10px', fontSize: '11px', opacity: busy === req.id ? 0.5 : 1 }}
                              disabled={busy === req.id}
                              onClick={() => handleAction(req, 'deny')}
                            >
                              Deny
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--t-text-faint)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History log */}
      {histLog.length > 0 && (
        <div style={S.card2}>
          <div style={S.cardHeader}>Action Log (This Session)</div>
          {histLog.map((h, i) => (
            <div key={i} style={{ fontSize: '11px', color: 'var(--t-text-muted)', padding: '4px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ color: h.action === 'approve' ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 700 }}>
                {h.action === 'approve' ? 'Approved' : 'Denied'}
              </span>
              {' '}request #{h.id} for <strong style={{ color: 'var(--t-text)' }}>{h.emp}</strong>
              <span style={{ color: 'var(--t-text-faint)', marginLeft: '8px' }}>{h.at}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Availability() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const navigate = useNavigate()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR     = ['ceo','hr','manager','coo','admin','owner'].some(x => roleName.includes(x))
  const personId = session?.person?.id || null

  const [tab, setTab]           = useState(isHR ? 'team' : 'mine')
  const [weekOffset, setWeekOff] = useState(0)
  const weekStart               = getWeekStart(weekOffset)

  const [employees, setEmployees] = useState([])
  const [availData, setAvailData] = useState({})
  const [blackouts, setBlackouts] = useState({})
  const [prefs,     setPrefs]     = useState({})
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [saving,    setSaving]    = useState(false)

  const [toast, setToast]       = useState(null)
  const toastTimer              = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // ── Load (all real; no fabrication — errors surface as an honest empty state) ──
  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [rosterRes, availRes, reqRes] = await Promise.all([
        sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: personId }),
        sb.rpc('get_team_availability', { p_node_ids: locationIds }),
        sb.rpc('get_availability_requests', { p_node_ids: locationIds }),
      ])
      if (rosterRes.error) throw rosterRes.error
      if (availRes.error) throw availRes.error
      if (reqRes.error) throw reqRes.error

      const seen = new Set()
      const emps = (Array.isArray(rosterRes.data) ? rosterRes.data : [])
        .filter(p => p.id && !seen.has(p.id) && seen.add(p.id))
        .map(p => ({
          id: p.id,
          name: p.full_name || '—',
          role: p.role_name || '—',
          location: p.node_name || '—',
          avatar: initials(p.full_name),
          color: colorFor(p.id),
        }))
      setEmployees(emps)

      const norm = {}, pf = {}, bo = {}
      ;(Array.isArray(availRes.data) ? availRes.data : []).forEach(row => {
        norm[row.person_id] = row.availability_json || {}
        pf[row.person_id]   = { preferred_shift: row.preferred_shift || 'any', max_hours: row.max_hours || 32 }
        bo[row.person_id]   = Array.isArray(row.blackout_weeks) ? row.blackout_weeks : []
      })
      setAvailData(norm)
      setPrefs(pf)
      setBlackouts(bo)

      const reqs = (Array.isArray(reqRes.data) ? reqRes.data : []).map(r => {
        const payload = r.requested || {}
        return {
          id: r.id,
          emp_id: r.person_id,
          person_id: r.person_id,
          emp_name: r.person_name || '—',
          location: r.location || '—',
          current_summary: summarizeGrid(norm[r.person_id]),
          requested: summarizeGrid(payload.shifts),
          requestedPayload: payload,
          effective: payload.effective || '—',
          reason: payload.reason || payload.note || '',
          status: r.status || 'pending',
          submitted: (r.created_at || '').split('T')[0],
        }
      })
      setRequests(reqs)
    } catch (e) {
      setLoadError(e?.message || 'Could not load availability data')
      setEmployees([])
      setAvailData({})
      setPrefs({})
      setBlackouts({})
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [locationIds, personId])

  useEffect(() => { loadData() }, [loadData])

  // ── Save my availability ──
  // POLICY: employees may NOT change availability directly. They submit a change
  // request that HR/managers approve (approval then applies it). HR saves directly.
  const handleSaveMine = async ({ shifts: newShifts, prefs: newPrefs, blackouts: newBo }) => {
    if (!personId) {
      showToast('Not saved — no signed-in person on this session.', 'error')
      return
    }
    setSaving(true)
    try {
      if (!isHR) {
        const { data, error } = await sb.rpc('submit_availability_request', {
          p_person_id: personId,
          p_requested: {
            shifts: newShifts,
            prefs: newPrefs,
            blackouts: newBo,
            reason: 'Availability change requested by employee',
            effective: isoDate(getWeekStart(1)),
          },
        })
        if (error) throw error
        if (data && data.ok === false) throw new Error(data.error || 'Request rejected')
        showToast('Submitted for HR approval — your availability updates once approved.', 'success')
      } else {
        const { data, error } = await sb.rpc('save_availability_grid', {
          p_person_id: personId,
          p_node_id: null,
          p_grid: newShifts,
          p_preferred_shift: newPrefs.preferred_shift === 'any' ? null : newPrefs.preferred_shift,
          p_max_hours: newPrefs.max_hours ?? null,
          p_blackouts: newBo,
        })
        if (error) throw error
        if (data && data.ok === false) throw new Error(data.error || 'Save rejected')
        showToast('Availability saved!', 'success')
      }
      await loadData()
    } catch (e) {
      showToast(`Not saved — ${e?.message || 'server error'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Resolve my employee record (never impersonate someone else's row)
  const myEmp   = employees.find(e => e.id === personId) || null
  const myAvail = (personId && availData[personId]) || {}
  const myPrefs = (personId && prefs[personId])     || {}
  const myBo    = (personId && blackouts[personId]) || []

  // ── Tab config ──
  const TABS = isHR
    ? [
        { id: 'mine',     label: 'My Availability' },
        { id: 'team',     label: 'Team Availability' },
        { id: 'gaps',     label: 'Coverage Gaps' },
        { id: 'requests', label: `Change Requests${requests.filter(r=>r.status==='pending').length > 0 ? ` (${requests.filter(r=>r.status==='pending').length})` : ''}` },
      ]
    : [
        { id: 'mine',     label: 'My Availability' },
        { id: 'team',     label: 'Team Grid' },
      ]

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>Availability Manager</div>
          <div style={S.sub}>
            Weekly shift availability · coverage analysis · change requests
            {isHR && <span style={{ ...S.badge.purple, marginLeft: '8px' }}>HR View</span>}
          </div>
        </div>
        {/* Week nav */}
        <div style={S.weekNav}>
          <button style={S.navBtn} onClick={() => setWeekOff(o => o - 1)}>‹</button>
          <div style={S.weekLabel}>{formatWeekLabel(weekStart)}</div>
          <button style={S.navBtn} onClick={() => setWeekOff(o => o + 1)}>›</button>
          {weekOffset !== 0 && (
            <button style={{ ...S.btn('ghost'), fontSize: '11px', padding: '4px 10px' }} onClick={() => setWeekOff(0)}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* Forensic KPI Panel — always visible */}
      {!loading && employees.length > 0 && (
        <KpiPanel
          employees={employees}
          availData={availData}
          requests={requests}
        />
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading / error */}
      {loading ? (
        <div style={{ ...S.emptyState, padding: '64px 24px' }}>
          <div style={{ color: 'var(--t-accent)', fontSize: '12px', fontWeight: 600 }}>Loading availability data…</div>
        </div>
      ) : loadError ? (
        <div style={{ ...S.emptyState, padding: '64px 24px' }}>
          <div style={{ color: 'var(--t-danger)', fontSize: '13px', fontWeight: 700, marginBottom: 8 }}>Couldn't load availability data</div>
          <div style={{ fontSize: '11px', color: 'var(--t-text-muted)', marginBottom: 14 }}>{loadError}</div>
          <button style={S.btn('accent')} onClick={loadData}>Retry</button>
        </div>
      ) : employees.length === 0 ? (
        <div style={{ ...S.emptyState, padding: '64px 24px' }}>
          No employees in the selected scope yet — availability appears here once staff are assigned to your locations.
        </div>
      ) : (
        <>
          {tab === 'mine' && (
            <MyAvailability
              myEmp={myEmp}
              myAvail={myAvail}
              myPrefs={myPrefs}
              myBlackouts={myBo}
              onSave={handleSaveMine}
              saving={saving}
              isHR={isHR}
            />
          )}

          {tab === 'team' && (
            <TeamAvailability
              employees={employees}
              availData={availData}
              navigate={navigate}
            />
          )}

          {tab === 'gaps' && isHR && (
            <CoverageGaps
              employees={employees}
              availData={availData}
              navigate={navigate}
            />
          )}

          {tab === 'requests' && isHR && (
            <ChangeRequests
              employees={employees}
              requests={requests}
              reviewerId={personId}
              onRefresh={loadData}
              showToast={showToast}
            />
          )}
        </>
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
