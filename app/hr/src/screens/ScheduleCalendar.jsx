// ScheduleCalendar.jsx — real, live schedule calendar. Reads the published week
// from public.shifts via vsb_get_schedule and writes assignments/removals with
// vsb_assign / vsb_remove (the same real backend the Visual Schedule Builder
// uses). Staff pool comes from get_roster. No mock arrays, no seeds, no
// localStorage datastore — honest empty states when there is nothing scheduled.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Real shift model matches public.shifts (AM 9–5 / PM 1–9), same as vsb_assign.
const SHIFT_TYPES = [
  { id: 'AM', label: 'AM', time: '9a–5p', color: '#ffd60a' },
  { id: 'PM', label: 'PM', time: '1p–9p', color: '#00e5ff' },
]
const ZONES = ['Floor', 'Register', 'Fitting', 'Stock', 'Manager', 'Close']
const KH_RX = /key|manager|lead|owner|supervisor|director|coordinator/i
const isKH = (r) => KH_RX.test(r || '')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function normShiftType(t) {
  return (t || '').toUpperCase() === 'PM' ? 'PM' : 'AM'
}

// Map live vsb_get_schedule rows → internal shift shape (node_id keyed).
function mapLiveShifts(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const shiftTypeId = normShiftType(r.shift_type)
    return {
      shiftId: r.shift_id,
      date: r.shift_date ? String(r.shift_date).slice(0, 10) : '',
      nodeId: r.node_id,
      location: r.node_name || '',
      employee: {
        id: r.person_id,
        name: r.full_name || 'Unknown',
        role: (r.role_name || '').toLowerCase(),
        isKey: r.keyholder === true || isKH(r.role_name),
      },
      shiftType: shiftTypeId,
      zone: r.zone || '',
      status: r.status || 'scheduled',
    }
  })
}

// Coverage for a single day+location grouping.
function calcCoverage(shifts) {
  if (!shifts || shifts.length === 0) return { status: 'empty', label: 'No Shifts', color: 'var(--t-text-faint)' }
  const hasAM  = shifts.some(s => s.shiftType === 'AM')
  const hasPM  = shifts.some(s => s.shiftType === 'PM')
  const hasKey = shifts.some(s => s.employee.isKey)
  if (!hasKey) return { status: 'gap', label: 'No Key', color: 'var(--t-danger)' }
  if (!hasAM || !hasPM) return { status: 'thin', label: 'Thin', color: 'var(--t-warn)' }
  return { status: 'ok', label: 'Covered', color: 'var(--t-success)' }
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      borderRadius: 0,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── Employee Chip ─────────────────────────────────────────────────────────────

function ShiftChip({ shift, small, onRemove, busy }) {
  const emp = shift.employee
  const st = SHIFT_TYPES.find(s => s.id === shift.shiftType) || SHIFT_TYPES[0]
  const nameClr = emp.isKey ? 'var(--t-success)' : '#3d8bff'  // KH green · ASSOC blue
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: small ? '2px 6px' : '3px 8px',
      background: `${st.color}18`,
      border: `1px solid ${st.color}40`,
      borderRadius: 0,
      fontSize: small ? 10 : 11,
      fontWeight: 600,
      color: 'var(--t-text)',
      marginBottom: 2,
      marginRight: 2,
      whiteSpace: 'nowrap',
    }}>
      {emp.isKey && <span style={{ fontSize: 9, color: 'var(--t-success)' }}>&#x1F511;</span>}
      <span style={{ color: nameClr, fontWeight: 700 }}>{emp.name}</span>
      <span style={{ fontSize: 9, color: st.color, fontWeight: 800 }}>{st.label}</span>
      {shift.zone && <span style={{ fontSize: 8, color: 'var(--t-text-faint)', borderLeft: '1px solid var(--t-line)', paddingLeft: 3 }}>{shift.zone}</span>}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(shift) }}
          disabled={busy}
          title="Remove shift"
          style={{ background: 'none', border: 'none', color: 'var(--t-text-faint)', cursor: busy ? 'wait' : 'pointer', fontSize: 10, padding: 0, marginLeft: 2 }}
        >&#10005;</button>
      )}
    </div>
  )
}

// ─── Live Badge ─────────────────────────────────────────────────────────────

function DataBadge() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 0,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      background: 'rgba(42,214,160,.15)',
      border: '1px solid var(--t-success)',
      color: 'var(--t-success)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-success)', display: 'inline-block' }} />
      LIVE
    </span>
  )
}

// ─── Week Grid View ────────────────────────────────────────────────────────────

function WeekGrid({ shifts, weekStart, gridLocations, onAssign, onRemove, busy }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Group shifts by date → node_id
  const byDateNode = useMemo(() => {
    const map = {}
    shifts.forEach(s => {
      const key = `${s.date}__${s.nodeId}`
      if (!map[key]) map[key] = []
      map[key].push(s)
    })
    return map
  }, [shifts])

  const cellStyle = {
    borderRight: '1px solid var(--t-line)',
    borderBottom: '1px solid var(--t-line)',
    padding: '6px 6px',
    minHeight: 80,
    verticalAlign: 'top',
    background: 'var(--t-surface)',
  }

  const headStyle = {
    padding: '8px 6px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.06em',
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    borderRight: '1px solid var(--t-line)',
    borderBottom: '1px solid var(--t-line)',
    background: 'var(--t-bg)',
    textAlign: 'center',
  }

  if (gridLocations.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No locations in your scope. Nothing to schedule.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', borderLeft: '1px solid var(--t-line)', borderTop: '1px solid var(--t-line)' }}>
        <colgroup>
          <col style={{ width: 110 }} />
          {days.map((_, i) => <col key={i} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...headStyle, textAlign: 'left' }}>Location</th>
            {days.map(d => {
              const dt = new Date(d + 'T00:00:00')
              const isToday = d === today()
              return (
                <th key={d} style={{
                  ...headStyle,
                  color: isToday ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  borderBottom: isToday ? '2px solid var(--t-accent)' : '1px solid var(--t-line)',
                }}>
                  <div>{DOW_SHORT[dt.getDay()]}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? 'var(--t-accent)' : 'var(--t-text)' }}>{dt.getDate()}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {gridLocations.map(loc => (
            <tr key={loc.id}>
              <td style={{ ...cellStyle, fontWeight: 700, fontSize: 11, color: 'var(--t-text-muted)', verticalAlign: 'middle', textAlign: 'left' }}>
                {loc.name}
              </td>
              {days.map(d => {
                const key = `${d}__${loc.id}`
                const dayShifts = byDateNode[key] || []
                const cov = calcCoverage(dayShifts)
                return (
                  <td key={d} style={{ ...cellStyle }}>
                    {dayShifts.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: cov.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                          {cov.label}
                        </span>
                      </div>
                    )}
                    {dayShifts.map((s) => (
                      <ShiftChip key={s.shiftId} shift={s} small busy={busy} onRemove={onRemove} />
                    ))}
                    <button
                      onClick={() => onAssign(loc, d)}
                      disabled={busy}
                      style={{
                        marginTop: 2, width: '100%', fontSize: 10, fontWeight: 700, padding: '3px 0',
                        cursor: busy ? 'wait' : 'pointer', background: 'transparent',
                        color: dayShifts.length === 0 ? 'var(--t-text-faint)' : 'var(--t-accent)',
                        border: '1px dashed var(--t-line)', borderRadius: 0,
                      }}
                    >+ Assign</button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Month Calendar View ───────────────────────────────────────────────────────

function MonthCalendar({ shifts, year, month, gridLocations }) {
  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const todayStr = today()
  const locIds = new Set(gridLocations.map(l => l.id))

  const byDate = useMemo(() => {
    const map = {}
    shifts.forEach(s => {
      if (!locIds.has(s.nodeId)) return
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    })
    return map
  }, [shifts, gridLocations])

  const weeks = []
  let cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) {
    cells.push(d)
    if (cells.length === 7) { weeks.push(cells); cells = [] }
  }
  if (cells.length > 0) {
    while (cells.length < 7) cells.push(null)
    weeks.push(cells)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', borderLeft: '1px solid var(--t-line)', borderTop: '1px solid var(--t-line)' }}>
        <thead>
          <tr>
            {DOW_SHORT.map(d => (
              <th key={d} style={{
                padding: '8px 6px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.08em',
                color: 'var(--t-text-muted)',
                textTransform: 'uppercase',
                borderRight: '1px solid var(--t-line)',
                borderBottom: '1px solid var(--t-line)',
                background: 'var(--t-bg)',
                textAlign: 'center',
                width: '14.28%',
              }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) {
                  return <td key={di} style={{ borderRight: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)', background: 'var(--t-bg)', minHeight: 90 }} />
                }
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayShifts = byDate[dateStr] || []
                const isToday = dateStr === todayStr

                // Count location gaps for the day
                const gaps = gridLocations.filter(loc => {
                  const locShifts = dayShifts.filter(s => s.nodeId === loc.id)
                  return locShifts.length > 0 && calcCoverage(locShifts).status !== 'ok'
                }).length
                const anyShifts = dayShifts.length > 0

                return (
                  <td key={di} style={{
                    borderRight: '1px solid var(--t-line)',
                    borderBottom: '1px solid var(--t-line)',
                    borderTop: isToday ? '2px solid var(--t-accent)' : undefined,
                    background: isToday ? 'rgba(var(--t-accent-rgb, 99,102,241),.06)' : 'var(--t-surface)',
                    verticalAlign: 'top',
                    padding: '6px 8px',
                    minHeight: 90,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: isToday ? 800 : 600,
                        color: isToday ? 'var(--t-accent)' : 'var(--t-text)',
                      }}>
                        {day}
                      </span>
                      {anyShifts && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: gaps > 0 ? 'var(--t-danger)' : 'var(--t-success)', textTransform: 'uppercase' }}>
                          {gaps > 0 ? `${gaps} gap${gaps > 1 ? 's' : ''}` : 'OK'}
                        </span>
                      )}
                    </div>
                    {dayShifts.slice(0, 4).map((s) => (
                      <div key={s.shiftId} style={{
                        fontSize: 10,
                        padding: '1px 4px',
                        marginBottom: 2,
                        background: `${(SHIFT_TYPES.find(t => t.id === s.shiftType) || SHIFT_TYPES[0]).color}22`,
                        borderLeft: `2px solid ${(SHIFT_TYPES.find(t => t.id === s.shiftType) || SHIFT_TYPES[0]).color}`,
                        color: 'var(--t-text)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {s.employee.name}
                      </div>
                    ))}
                    {dayShifts.length > 4 && (
                      <div style={{ fontSize: 9, color: 'var(--t-text-muted)', paddingLeft: 4 }}>
                        +{dayShifts.length - 4} more
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Assign Drawer ─────────────────────────────────────────────────────────────

function AssignDrawer({ target, roster, assignedIds, onClose, onPick, busy }) {
  const [q, setQ] = useState('')
  const [shiftType, setShiftType] = useState('AM')
  const [zone, setZone] = useState('Floor')

  const pool = useMemo(() => {
    const has = assignedIds
    const ql = q.trim().toLowerCase()
    const rows = roster.filter(e => !has.has(e.id))
    const filtered = ql ? rows.filter(e => e.name.toLowerCase().includes(ql) || (e.role || '').toLowerCase().includes(ql)) : rows
    return filtered.sort((a, b) => (b.kh - a.kh) || a.name.localeCompare(b.name))
  }, [roster, assignedIds, q])

  const posClr = (kh) => kh ? 'var(--t-success)' : '#3d8bff'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px,94vw)', height: '100%', background: 'var(--t-bg)', borderLeft: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)' }}>Assign shift</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{target.loc.name} · {fmtDate(target.date)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {SHIFT_TYPES.map(st => (
              <button key={st.id} onClick={() => setShiftType(st.id)} style={{
                flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0,
                background: shiftType === st.id ? st.color : 'var(--t-surface-2)',
                color: shiftType === st.id ? '#04121a' : 'var(--t-text-muted)',
                border: `1px solid ${shiftType === st.id ? st.color : 'var(--t-line)'}`,
              }}>{st.label} · {st.time}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Zone</span>
            <select value={zone} onChange={e => setZone(e.target.value)} style={{ flex: 1, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 8px', fontSize: 12, borderRadius: 0 }}>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search staff…" style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 12, outline: 'none', borderRadius: 0 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {roster.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)' }}>No staff in your scope.</div>}
          {roster.length > 0 && pool.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)' }}>No staff match.</div>}
          {pool.map(e => (
            <div key={e.id} onClick={() => onPick(target.loc, target.date, shiftType, zone, e)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', marginBottom: 4, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 4px', color: posClr(e.kh), border: `1px solid ${posClr(e.kh)}` }}>{e.kh ? 'KH' : 'A'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: posClr(e.kh) }}>{e.name}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{e.role || 'Staff'}{e.loc && e.loc !== target.loc.name ? ` · ${e.loc}` : ''}</div>
              </div>
              <span style={{ color: 'var(--t-accent)', fontWeight: 800 }}>+</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--t-line)' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700, background: 'var(--t-accent)', color: '#04121a', border: 'none', cursor: 'pointer', borderRadius: 0 }}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ScheduleCalendar() {
  const { locations, locationIds } = useScope()
  const { session } = useAuth()
  const personId = session?.person?.id || null

  const [view, setView] = useState('week')          // 'week' | 'month'
  const [locFilter, setLocFilter] = useState('All')  // 'All' | node_id
  const [weekStart, setWeekStart] = useState(() => getMonday(today()))
  const [monthOffset, setMonthOffset] = useState(0)

  const [shifts, setShifts] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null)  // { loc:{id,name}, date }
  const [toast, setToast] = useState(null)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  // Locations that make up the grid rows (respects the in-page filter).
  const gridLocations = useMemo(() => {
    const base = locations || []
    return locFilter === 'All' ? base : base.filter(l => l.id === locFilter)
  }, [locations, locFilter])

  // Derived month/year
  const { year, month } = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return { year: d.getFullYear(), month: d.getMonth() }
  }, [monthOffset])

  // Staff pool for the assign drawer (real, scoped).
  useEffect(() => {
    if (!locationIds || locationIds.length === 0) { setRoster([]); return }
    let cancelled = false
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: personId })
      .then(({ data }) => {
        if (cancelled) return
        const seen = new Set()
        setRoster((Array.isArray(data) ? data : [])
          .filter(p => p.id && !seen.has(p.id) && seen.add(p.id))
          .map(p => ({ id: p.id, name: p.full_name, role: p.role_name || '', kh: isKH(p.role_name), loc: p.node_name || '' })))
      })
      .catch(() => { if (!cancelled) setRoster([]) })
    return () => { cancelled = true }
  }, [JSON.stringify(locationIds), personId]) // eslint-disable-line

  // Fetch the real schedule for the week (or the weeks overlapping the month).
  const loadSchedule = useCallback(async () => {
    const ids = locationIds && locationIds.length > 0 ? locationIds : null
    if (!ids) { setShifts([]); setError(null); return }

    setLoading(true)
    setError(null)
    try {
      if (view === 'week') {
        const { data, error: rpcErr } = await sb.rpc('vsb_get_schedule', {
          p_node_ids: ids, p_week_start: weekStart, p_actor: personId,
        })
        if (rpcErr) throw rpcErr
        setShifts(mapLiveShifts(data))
      } else {
        // Month: fetch every week that overlaps the visible month, then filter.
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const startMon = getMonday(firstDay.toISOString().slice(0, 10))
        const weeksToFetch = []
        let cur = startMon
        while (new Date(cur + 'T00:00:00') <= lastDay) {
          weeksToFetch.push(cur)
          cur = addDays(cur, 7)
        }
        const results = await Promise.all(weeksToFetch.map(ws =>
          sb.rpc('vsb_get_schedule', { p_node_ids: ids, p_week_start: ws, p_actor: personId })
        ))
        const firstErr = results.find(r => r.error)
        if (firstErr) throw firstErr.error
        const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
        const allRows = results.flatMap(r => Array.isArray(r.data) ? r.data : [])
        const filtered = allRows.filter(r => r.shift_date && String(r.shift_date).startsWith(monthPrefix))
        setShifts(mapLiveShifts(filtered))
      }
    } catch (e) {
      setError(e?.message || 'Could not load the schedule.')
      setShifts([])
    } finally {
      setLoading(false)
    }
  }, [view, weekStart, year, month, JSON.stringify(locationIds), personId]) // eslint-disable-line

  useEffect(() => { loadSchedule() }, [loadSchedule])

  // ── Writes ──────────────────────────────────────────────────────────────────
  const assignedIdsFor = useMemo(() => {
    if (!assignTarget) return new Set()
    return new Set(shifts
      .filter(s => s.nodeId === assignTarget.loc.id && s.date === assignTarget.date)
      .map(s => s.employee.id))
  }, [shifts, assignTarget])

  async function handlePick(loc, date, shiftType, zone, emp) {
    if (busy) return
    setBusy(true)
    try {
      const { error: e } = await sb.rpc('vsb_assign', {
        p_node_id: loc.id, p_person_id: emp.id, p_shift_date: date,
        p_shift_type: shiftType, p_zone: zone, p_actor: personId,
      })
      if (e) throw e
      await loadSchedule()
      showToast(`${emp.name} → ${shiftType} ${fmtDate(date)}`)
    } catch (err) {
      showToast(`Not saved — ${err?.message || 'assign failed'}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(shift) {
    if (busy || !shift?.shiftId) return
    setBusy(true)
    try {
      const { error: e } = await sb.rpc('vsb_remove', { p_shift_id: shift.shiftId, p_actor: personId })
      if (e) throw e
      await loadSchedule()
      showToast(`Removed ${shift.employee.name}`)
    } catch (err) {
      showToast(`Not removed — ${err?.message || 'remove failed'}`)
    } finally {
      setBusy(false)
    }
  }

  // KPI derivations (all from live shifts)
  const kpis = useMemo(() => {
    const totalShifts = shifts.length
    const uniqueEmps = new Set(shifts.map(s => s.employee.id)).size
    let gaps = 0
    const dateLocPairs = new Set(shifts.map(s => `${s.date}__${s.nodeId}`))
    dateLocPairs.forEach(key => {
      const dayLocShifts = shifts.filter(s => `${s.date}__${s.nodeId}` === key)
      if (calcCoverage(dayLocShifts).status !== 'ok') gaps++
    })
    const totalHours = totalShifts * 8   // AM/PM shifts are 8h each
    return { totalShifts, uniqueEmps, gaps, totalHours }
  }, [shifts])

  // Navigation labels
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    return `${fmtDate(weekStart)} – ${fmtDate(end)}`
  }, [weekStart])
  const monthLabel = `${MONTH_NAMES[month]} ${year}`

  function prevWeek() { setWeekStart(w => addDays(w, -7)) }
  function nextWeek() { setWeekStart(w => addDays(w, 7)) }
  function gotoToday() { setWeekStart(getMonday(today())); setMonthOffset(0) }

  const btnBase = {
    padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 0,
    border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)', cursor: 'pointer',
  }
  const btnActive = { ...btnBase, background: 'var(--t-accent)', color: '#fff', border: '1px solid var(--t-accent)' }

  const hasScope = locationIds && locationIds.length > 0

  return (
    <div style={{ padding: 0, background: 'var(--t-bg)', minHeight: '100%', fontFamily: 'inherit' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        padding: '16px 20px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.01em' }}>
            Schedule Calendar
          </span>
          <DataBadge />
          {loading && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Loading…</span>}
          {busy && <span style={{ fontSize: 11, color: 'var(--t-accent)' }}>Saving…</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--t-line)' }}>
            <button style={view === 'week' ? btnActive : btnBase} onClick={() => setView('week')}>Week</button>
            <button style={view === 'month' ? btnActive : btnBase} onClick={() => setView('month')}>Month</button>
          </div>

          {/* Location filter (real locations from scope) */}
          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            style={{ ...btnBase, padding: '6px 10px' }}
          >
            <option value="All">All Locations</option>
            {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button style={btnBase} onClick={view === 'week' ? prevWeek : () => setMonthOffset(o => o - 1)}>&#8249;</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', minWidth: 180, textAlign: 'center' }}>
              {view === 'week' ? weekLabel : monthLabel}
            </span>
            <button style={btnBase} onClick={view === 'week' ? nextWeek : () => setMonthOffset(o => o + 1)}>&#8250;</button>
          </div>

          <button style={btnBase} onClick={gotoToday}>Today</button>
          <button style={btnBase} onClick={loadSchedule} disabled={loading || busy}>&#8635; Refresh</button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ borderRight: '1px solid var(--t-line)' }}>
          <KTile label="Total Shifts" value={kpis.totalShifts} sub={view === 'week' ? 'This week' : 'This month'} />
        </div>
        <div style={{ borderRight: '1px solid var(--t-line)' }}>
          <KTile label="Staff Scheduled" value={kpis.uniqueEmps} sub="Unique employees" />
        </div>
        <div style={{ borderRight: '1px solid var(--t-line)' }}>
          <KTile
            label="Coverage Gaps"
            value={kpis.gaps}
            sub="Day/location combos"
            color={kpis.gaps > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
            alert={kpis.gaps > 0 ? 'red' : undefined}
          />
        </div>
        <div>
          <KTile label="Total Hours" value={kpis.totalHours.toLocaleString()} sub="Scheduled hours" />
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ padding: '10px 20px', background: 'rgba(255,59,48,.1)', borderBottom: '1px solid var(--t-danger)', fontSize: 12, color: 'var(--t-danger)' }}>
          {error}
        </div>
      )}

      {/* ── Calendar body ── */}
      <div style={{ padding: 0 }}>
        {!hasScope ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
            No locations in your scope. Nothing to schedule.
          </div>
        ) : view === 'week' ? (
          <WeekGrid
            shifts={shifts}
            weekStart={weekStart}
            gridLocations={gridLocations}
            onAssign={(loc, date) => setAssignTarget({ loc, date })}
            onRemove={handleRemove}
            busy={busy}
          />
        ) : (
          <MonthCalendar shifts={shifts} year={year} month={month} gridLocations={gridLocations} />
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: 'flex', gap: 16, padding: '12px 20px', borderTop: '1px solid var(--t-line)',
        background: 'var(--t-surface)', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Shift Types</span>
        {SHIFT_TYPES.map(st => (
          <span key={st.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t-text)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
            {st.label} {st.time}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#2ad6a0' }}>
          &#x1F511; = Key Holder on duty
        </span>
      </div>

      {/* ── Assign drawer (week view only) ── */}
      {assignTarget && (
        <AssignDrawer
          target={assignTarget}
          roster={roster}
          assignedIds={assignedIdsFor}
          onClose={() => setAssignTarget(null)}
          onPick={handlePick}
          busy={busy}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#04121a', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
