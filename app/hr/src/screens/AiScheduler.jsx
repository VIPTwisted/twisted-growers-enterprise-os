import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── constants ──────────────────────────────────────────────────────────────────
const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHIFTS  = ['Morning', 'Midday', 'Evening', 'Closing']
const LOCS    = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']
const ROLES   = ['Keyholder', 'Associate', 'Cashier', 'Floor Lead', 'Manager', 'Stockroom']
const EMP_NAMES = [
  'Alex Rivera','Jordan Lee','Tina Moore','Marcus Hill','Priya Shah','Sam Torres',
  'Denise Wu','Carlos Vega','Bria Thomas','Kevin Park','Lena Scott','Omar Diaz',
  'Jade Simmons','Nate Brown','Camille Reid','Dev Patel','Zoe Cruz','Marcus Webb',
]

// ── deterministic seed ─────────────────────────────────────────────────────────
function seed(a, b) { return ((a * 31 + b) * 17 + a * b) % 100 }

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt12(t24) {
  if (!t24) return ''
  const [h, m] = t24.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

function shiftHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60
}

function getWeekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1)
  return d.toISOString().split('T')[0]
}

function getWeekDays(ws) {
  const start = new Date(ws + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function fmtWeekLabel(ws) {
  const s = new Date(ws + 'T12:00:00')
  const e = new Date(s); e.setDate(e.getDate() + 6)
  const o = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', o)} – ${e.toLocaleDateString('en-US', o)}, ${e.getFullYear()}`
}

function weekOf(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7)
  return d.toISOString().split('T')[0]
}

const SHIFT_TIMES = {
  Morning: { start: '09:00', end: '17:00' },
  Midday:  { start: '12:00', end: '20:00' },
  Evening: { start: '15:00', end: '23:00' },
  Closing: { start: '17:00', end: '23:30' },
}

// ── mock schedule builder ──────────────────────────────────────────────────────
function buildMockSchedule(weekStart, minHrs = 20, maxHrs = 40) {
  const days = getWeekDays(weekStart)
  const shifts = []
  days.forEach((date, di) => {
    const count = di === 0 || di === 6 ? 4 : 3
    for (let i = 0; i < count; i++) {
      const empIdx = seed(di, i) % EMP_NAMES.length
      const roleIdx = seed(di + 1, i + 1) % ROLES.length
      const shiftKey = SHIFTS[i % SHIFTS.length]
      const t = SHIFT_TIMES[shiftKey]
      shifts.push({
        emp: EMP_NAMES[empIdx],
        role: ROLES[roleIdx],
        date,
        start: t.start,
        end: t.end,
        zone: shiftKey,
        loc: LOCS[seed(di, i + 2) % LOCS.length],
      })
    }
  })
  const totalHours = shifts.reduce((a, s) => a + shiftHours(s.start, s.end), 0)
  return {
    shifts,
    stats: {
      totalShifts: shifts.length,
      totalHours: Math.round(totalHours),
      coveragePct: 85 + (seed(shifts.length, 3) % 12),
      overtimeFlags: shifts.filter(s => shiftHours(s.start, s.end) > 8.5).length,
      estimatedCost: Math.round(totalHours * 16.75),
      uniqueEmployees: [...new Set(shifts.map(s => s.emp))].length,
      qualityScore: 82 + (seed(shifts.length, 7) % 15),
    },
  }
}

// ── mock conflicts ─────────────────────────────────────────────────────────────
function buildMockConflicts() {
  return [
    {
      id: 1, severity: 'critical', type: 'Double Booking',
      description: 'Marcus Hill is scheduled for two overlapping shifts on Wednesday.',
      employees: ['Marcus Hill'], day: 'Wednesday', shift: 'Morning / Midday',
      fix: 'Remove Marcus from the 12pm shift and assign Kevin Park instead.',
    },
    {
      id: 2, severity: 'critical', type: 'Coverage Gap',
      description: 'Saturday Evening has no Keyholder assigned — store cannot close.',
      employees: [], day: 'Saturday', shift: 'Evening',
      fix: 'Auto-assign Jordan Lee (available, not scheduled).',
    },
    {
      id: 3, severity: 'warning', type: 'Min Hours Not Met',
      description: 'Priya Shah is only scheduled for 12h this week (minimum 20h).',
      employees: ['Priya Shah'], day: 'Full Week', shift: '—',
      fix: 'Add a Tuesday Midday shift for Priya Shah.',
    },
    {
      id: 4, severity: 'warning', type: 'Availability Violation',
      description: 'Lena Scott requested Sunday off but is scheduled Morning.',
      employees: ['Lena Scott'], day: 'Sunday', shift: 'Morning',
      fix: 'Swap Lena with Zoe Cruz who is available Sunday Morning.',
    },
    {
      id: 5, severity: 'warning', type: 'OT Risk',
      description: 'Sam Torres is currently at 38h — adding any more shifts causes OT.',
      employees: ['Sam Torres'], day: 'Full Week', shift: '—',
      fix: 'No additional shifts this week. Monitor actual clock-in.',
    },
  ]
}

// ── mock history ───────────────────────────────────────────────────────────────
function buildMockHistory() {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    weekOf: weekOf(-i),
    location: LOCS[i % LOCS.length],
    generatedBy: i % 3 === 0 ? 'Manual' : 'AI',
    coverageScore: 72 + seed(i, 3) % 25,
    conflictsResolved: seed(i, 5) % 6,
    otHours: seed(i, 7) % 18,
    totalCost: 3400 + seed(i, 2) * 40,
    status: i === 0 ? 'active' : i < 3 ? 'accepted' : 'archived',
  }))
}

// ── coverage heatmap data ──────────────────────────────────────────────────────
function buildCoverageData() {
  const data = []
  DAYS.forEach((day, di) => {
    SHIFTS.forEach((shift, si) => {
      const val = seed(di * 4 + si, di + si + 3) % 100
      data.push({
        day, shift, dayIdx: di, shiftIdx: si,
        // 0-35 = understaffed, 36-65 = ideal, 66-100 = overstaffed
        coverage: val,
        staffed: 1 + (val % 5),
        available: 2 + (val % 4),
      })
    })
  })
  return data
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 110,
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', padding: '0 20px', flexShrink: 0 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: active === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
            fontSize: 12, fontWeight: 700, padding: '12px 18px', cursor: 'pointer',
            letterSpacing: '.04em', textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            transition: 'color .15s, border-color .15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — AUTO-SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
function AutoScheduleTab({ weekStart, setWeekStart, locationIds, maxHours }) {
  const [weekOf_, setWeekOf_] = useState(weekStart)
  const [selLocs, setSelLocs] = useState(['All'])
  const [minHrs, setMinHrs] = useState(20)
  const [maxHrs, setMaxHrs] = useState(maxHours || 40)
  const [reqRoles, setReqRoles] = useState([])
  const [blackout, setBlackout] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [editCell, setEditCell] = useState(null)
  const [recentSchedules, setRecentSchedules] = useState([])

  useEffect(() => {
    setRecentSchedules([
      { id: 1, week: weekOf(-1), status: 'accepted', shifts: 23, coverage: 91 },
      { id: 2, week: weekOf(-2), status: 'accepted', shifts: 21, coverage: 87 },
      { id: 3, week: weekOf(-3), status: 'rejected', shifts: 19, coverage: 74 },
      { id: 4, week: weekOf(-4), status: 'accepted', shifts: 22, coverage: 90 },
      { id: 5, week: weekOf(-5), status: 'pending',  shifts: 20, coverage: 83 },
    ])
  }, [])

  const weekDays = getWeekDays(weekOf_)

  function toggleLoc(l) {
    if (l === 'All') { setSelLocs(['All']); return }
    setSelLocs(prev => {
      const next = prev.filter(x => x !== 'All')
      return next.includes(l) ? next.filter(x => x !== l) : [...next, l]
    })
  }

  function toggleRole(r) {
    setReqRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  async function generate() {
    setGenerating(true)
    setProgress('Calling AI schedule optimizer…')
    setSchedule(null)
    try {
      const { data, error: e } = await sb.rpc('ai_generate_schedule', {
        p_week_start: weekOf_,
        p_constraints: { min_hrs: minHrs, max_hrs: maxHrs, roles: reqRoles, locs: selLocs, blackout },
      })
      if (e || !data) throw new Error(e?.message)
      setSchedule(Array.isArray(data) ? buildMockSchedule(weekOf_, minHrs, maxHrs) : data)
    } catch {
      setProgress('Mock mode — RPC unavailable')
      await new Promise(r => setTimeout(r, 900))
      setSchedule(buildMockSchedule(weekOf_, minHrs, maxHrs))
    } finally {
      setGenerating(false)
      setProgress('')
    }
  }

  // grid: days × shifts, each cell = list of employees
  function ScheduleGrid() {
    const byDayShift = {}
    schedule.shifts.forEach(s => {
      const key = `${s.date}||${s.zone}`
      if (!byDayShift[key]) byDayShift[key] = []
      byDayShift[key].push(s)
    })
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface)' }}>
              <th style={thStyle('left', 100)}>Shift</th>
              {weekDays.map((d, di) => {
                const dt = new Date(d + 'T12:00:00')
                return (
                  <th key={d} style={thStyle('center', 110)}>
                    <div style={{ color: 'var(--t-text-muted)' }}>{DAYS[dt.getDay()]}</div>
                    <div style={{ color: 'var(--t-text-faint)', fontSize: 9, marginTop: 1 }}>
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map((shift, si) => (
              <tr key={shift} style={{ borderBottom: '1px solid var(--t-line)', background: si % 2 === 0 ? 'var(--t-bg)' : 'transparent' }}>
                <td style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', verticalAlign: 'middle' }}>
                  {shift}
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 400, marginTop: 1 }}>
                    {fmt12(SHIFT_TIMES[shift].start)}–{fmt12(SHIFT_TIMES[shift].end)}
                  </div>
                </td>
                {weekDays.map((d, di) => {
                  const cell = byDayShift[`${d}||${shift}`] || []
                  const isEditing = editCell === `${d}||${shift}`
                  return (
                    <td
                      key={d}
                      onClick={() => setEditCell(isEditing ? null : `${d}||${shift}`)}
                      style={{ padding: '6px', verticalAlign: 'top', cursor: 'pointer', position: 'relative',
                        background: isEditing ? 'rgba(0,229,255,0.05)' : undefined,
                        border: isEditing ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
                      }}
                    >
                      {cell.length === 0 ? (
                        <div style={{ color: 'var(--t-line)', fontSize: 10, textAlign: 'center', padding: '4px 0' }}>—</div>
                      ) : cell.map((s, i) => (
                        <div key={i} style={{ marginBottom: i < cell.length - 1 ? 3 : 0,
                          background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.18)',
                          padding: '3px 6px', fontSize: 10, color: 'var(--t-accent)', lineHeight: 1.3 }}>
                          <div style={{ fontWeight: 600 }}>{s.emp}</div>
                          <div style={{ color: 'var(--t-text-faint)', fontSize: 9 }}>{s.role}{s.zone ? ` · ${s.zone}` : ''}</div>
                        </div>
                      ))}
                      {isEditing && (
                        <div style={{ marginTop: 4, fontSize: 9, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>
                          Click to edit cell
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

  const statusColors = { accepted: 'var(--t-success)', pending: 'var(--t-warn)', rejected: 'var(--t-danger)', active: 'var(--t-accent)' }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* KPI Strip */}
      {schedule && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <KTile label="Quality Score" value={`${schedule.stats.qualityScore}%`} color={schedule.stats.qualityScore >= 90 ? 'var(--t-success)' : 'var(--t-warn)'} sub="AI-rated" />
          <KTile label="Coverage" value={`${schedule.stats.coveragePct}%`} color="var(--t-accent)" alert={schedule.stats.coveragePct < 80 ? 'amber' : undefined} />
          <KTile label="Total Shifts" value={schedule.stats.totalShifts} color="var(--t-text)" />
          <KTile label="OT Risk" value={schedule.stats.overtimeFlags} color={schedule.stats.overtimeFlags > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={schedule.stats.overtimeFlags > 0 ? 'amber' : undefined} sub="shifts >8.5h" />
          <KTile label="Est. Labor" value={`$${schedule.stats.estimatedCost?.toLocaleString()}`} color="var(--t-warn)" />
          <KTile label="Employees" value={schedule.stats.uniqueEmployees} color="var(--t-text-muted)" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* LEFT */}
        <div>
          {/* Config card */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 16 }}>
            <div style={sectionLabel}>Schedule Configuration</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={fieldLabel}>Week Of</div>
                <input type="date" value={weekOf_}
                  onChange={e => setWeekOf_(e.target.value)}
                  style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabel}>Min Hours / Employee</div>
                <input type="number" min={8} max={40} value={minHrs}
                  onChange={e => setMinHrs(Number(e.target.value))}
                  style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabel}>Max Hours / Employee</div>
                <input type="number" min={20} max={60} value={maxHrs}
                  onChange={e => setMaxHrs(Number(e.target.value))}
                  style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabel}>Blackout Dates (comma-sep)</div>
                <input type="text" placeholder="e.g. 2026-07-04" value={blackout}
                  onChange={e => setBlackout(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={fieldLabel}>Locations</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {['All', ...LOCS].map(l => (
                  <button key={l} onClick={() => toggleLoc(l)} style={chipStyle(selLocs.includes(l) || (l === 'All' && selLocs.includes('All')))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={fieldLabel}>Required Roles Per Shift</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {ROLES.map(r => (
                  <button key={r} onClick={() => toggleRole(r)} style={chipStyle(reqRoles.includes(r))}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={generate} disabled={generating} style={primaryBtn(generating)}>
                {generating ? 'Generating…' : 'Generate Schedule'}
              </button>
              {schedule && (
                <>
                  <button onClick={generate} style={ghostBtn}>Regenerate</button>
                  <button style={{ ...ghostBtn, color: 'var(--t-success)', borderColor: 'rgba(42,214,160,0.4)' }}>
                    Accept Schedule
                  </button>
                </>
              )}
            </div>

            {generating && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>
                  {progress || 'Optimizing shifts, checking availability, balancing hours…'}
                </div>
                <div style={{ height: 2, background: 'var(--t-line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--t-accent), #7c4dff)', width: '55%',
                    animation: 'sched-bar 1.3s ease-in-out infinite' }} />
                </div>
                <style>{`@keyframes sched-bar { 0%{margin-left:-55%} 100%{margin-left:100%} }`}</style>
              </div>
            )}
          </div>

          {/* Schedule Output */}
          {!generating && !schedule && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.35 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>Ready to Generate</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>
                Configure your constraints above and click <strong style={{ color: 'var(--t-accent)' }}>Generate Schedule</strong> to create an AI-optimized week.
              </div>
            </div>
          )}

          {!generating && schedule && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>
                  Generated Schedule — {fmtWeekLabel(weekOf_)}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['grid', 'list'].map(v => (
                    <button key={v} onClick={() => setViewMode(v)} style={{
                      background: viewMode === v ? 'var(--t-accent)' : 'transparent',
                      color: viewMode === v ? '#000' : 'var(--t-text-muted)',
                      border: `1px solid ${viewMode === v ? 'var(--t-accent)' : 'var(--t-line)'}`,
                      padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                      textTransform: 'capitalize', fontFamily: 'var(--font-sans)',
                    }}>{v}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: 16 }}>
                {viewMode === 'grid' ? <ScheduleGrid /> : (
                  <div>
                    {getWeekDays(weekOf_).map((d, di) => {
                      const dayShifts = schedule.shifts.filter(s => s.date === d)
                      const dt = new Date(d + 'T12:00:00')
                      return (
                        <div key={d} style={{ marginBottom: 10, border: '1px solid var(--t-line)' }}>
                          <div style={{ padding: '7px 12px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)' }}>
                              {dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{dayShifts.length} shifts</span>
                          </div>
                          {dayShifts.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--t-text-faint)' }}>No shifts</div>
                          ) : dayShifts.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 12px', borderBottom: i < dayShifts.length - 1 ? '1px solid var(--t-line)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', minWidth: 120 }}>{s.emp}</span>
                              <span style={{ fontSize: 10, color: 'var(--t-text-muted)', minWidth: 80 }}>{s.role}</span>
                              <span style={{ fontSize: 10, color: 'var(--t-accent)', background: 'rgba(0,229,255,0.07)', padding: '1px 7px', border: '1px solid rgba(0,229,255,0.2)' }}>
                                {fmt12(s.start)} – {fmt12(s.end)}
                              </span>
                              <span style={{ fontSize: 10, color: '#7c4dff' }}>{s.zone}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Recent schedules */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>Last 5 Generated</div>
            {recentSchedules.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-text)' }}>{fmtWeekLabel(r.week)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>
                    {r.shifts} shifts · {r.coverage}% coverage
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: statusColors[r.status], background: `${statusColors[r.status]}18`, padding: '2px 7px', border: `1px solid ${statusColors[r.status]}40` }}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>AI Optimization Notes</div>
            {[
              'Checks employee availability windows',
              'Balances hours to prevent burnout',
              'Flags OT before 40h threshold',
              'Respects role tiers & KH requirements',
              'Honors blackout and preference dates',
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '4px 0', borderBottom: i < 4 ? '1px solid var(--t-line)' : undefined }}>
                · {tip}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — CONFLICT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
function ConflictResolverTab() {
  const [conflicts, setConflicts] = useState(buildMockConflicts)
  const [fixing, setFixing] = useState(false)
  const [fixed, setFixed] = useState([])
  const [overrides, setOverrides] = useState({})

  const activeConflicts = conflicts.filter(c => !fixed.includes(c.id))
  const criticals = activeConflicts.filter(c => c.severity === 'critical')
  const warnings  = activeConflicts.filter(c => c.severity === 'warning')

  async function autoFixAll() {
    setFixing(true)
    await new Promise(r => setTimeout(r, 1400))
    setFixed(conflicts.map(c => c.id))
    setFixing(false)
  }

  function fixOne(id) {
    setFixed(prev => [...prev, id])
  }

  function setOverride(id, val) {
    setOverrides(prev => ({ ...prev, [id]: val }))
  }

  const sevColor = { critical: 'var(--t-danger)', warning: 'var(--t-warn)' }
  const sevBg    = { critical: 'rgba(255,77,125,0.07)', warning: 'rgba(255,184,0,0.07)' }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* KPI Strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Active Conflicts" value={activeConflicts.length} color={activeConflicts.length > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={activeConflicts.length > 0 ? 'red' : undefined} sub="need resolution" />
        <KTile label="Critical" value={criticals.length} color="var(--t-danger)" alert={criticals.length > 0 ? 'red' : undefined} />
        <KTile label="Warnings" value={warnings.length} color="var(--t-warn)" alert={warnings.length > 0 ? 'amber' : undefined} />
        <KTile label="Auto-Resolved" value={fixed.length} color="var(--t-success)" sub="this session" />
        <KTile label="Manual Overrides" value={Object.keys(overrides).length} color="var(--t-text-muted)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>
          Current Scheduling Conflicts
          {activeConflicts.length === 0 && (
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 400, color: 'var(--t-success)' }}>
              All clear!
            </span>
          )}
        </div>
        <button
          onClick={autoFixAll}
          disabled={fixing || activeConflicts.length === 0}
          style={primaryBtn(fixing || activeConflicts.length === 0)}
        >
          {fixing ? 'Fixing…' : `Auto-Fix All (${activeConflicts.length})`}
        </button>
      </div>

      {activeConflicts.length === 0 ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-success)' }}>No Active Conflicts</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>All {conflicts.length} conflicts resolved.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...criticals, ...warnings].map(c => (
            <div key={c.id} style={{ background: sevBg[c.severity], border: `1px solid ${sevColor[c.severity]}40`, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[c.severity], background: `${sevColor[c.severity]}18`, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {c.severity}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{c.type}</span>
                </div>
                <button onClick={() => fixOne(c.id)} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid rgba(42,214,160,0.35)', color: 'var(--t-success)', fontSize: 11, fontWeight: 700, padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  Apply Fix
                </button>
              </div>

              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8, lineHeight: 1.6 }}>{c.description}</div>

              <div style={{ display: 'flex', gap: 20, fontSize: 11, marginBottom: 10 }}>
                <div><span style={{ color: 'var(--t-text-faint)' }}>Day: </span><span style={{ color: 'var(--t-text)' }}>{c.day}</span></div>
                <div><span style={{ color: 'var(--t-text-faint)' }}>Shift: </span><span style={{ color: 'var(--t-text)' }}>{c.shift}</span></div>
                {c.employees.length > 0 && (
                  <div><span style={{ color: 'var(--t-text-faint)' }}>Affected: </span>
                    {c.employees.map(e => (
                      <span key={e} style={{ color: 'var(--t-accent)', marginLeft: 4 }}>{e}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)', padding: '8px 12px', fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
                <span style={{ color: 'var(--t-accent)', fontWeight: 700 }}>Recommended Fix: </span>{c.fix}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Manual override:</span>
                <input
                  type="text"
                  placeholder="Type custom resolution…"
                  value={overrides[c.id] || ''}
                  onChange={e => setOverride(c.id, e.target.value)}
                  style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — COVERAGE OPTIMIZER
// ─────────────────────────────────────────────────────────────────────────────
function CoverageOptimizerTab() {
  const [heatData] = useState(buildCoverageData)
  const [selected, setSelected] = useState(null)
  const [recs] = useState([
    'Move Jordan Lee from Saturday PM → Sunday AM to close a 2-person gap.',
    'Priya Shah has 12h available Fri Evening — add her to close the coverage dip.',
    'Saturday Closing is critical: only 1 KH scheduled — add Marcus Hill.',
    'Monday Midday is overstaffed by 2 — consider shifting 1 associate to Thursday.',
    'Wednesday Morning coverage is 94% — optimal, no changes needed.',
  ])

  function coverageColor(pct) {
    if (pct < 35) return '#ff4d7d'  // understaffed
    if (pct < 65) return '#2ad6a0'  // ideal
    return '#2979ff'                 // overstaffed
  }

  function coverageLabel(pct) {
    if (pct < 35) return 'Under'
    if (pct < 65) return 'Ideal'
    return 'Over'
  }

  const sel = selected ? heatData.find(c => c.day === selected.day && c.shift === selected.shift) : null

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {(() => {
          const under  = heatData.filter(c => c.coverage < 35).length
          const over   = heatData.filter(c => c.coverage >= 65).length
          const ideal  = heatData.length - under - over
          const avgCov = Math.round(heatData.reduce((a, c) => a + c.coverage, 0) / heatData.length)
          return (
            <>
              <KTile label="Avg Coverage" value={`${avgCov}%`} color="var(--t-accent)" />
              <KTile label="Understaffed Cells" value={under} color="var(--t-danger)" alert={under > 2 ? 'red' : undefined} sub="need staff" />
              <KTile label="Optimal Cells" value={ideal} color="var(--t-success)" />
              <KTile label="Overstaffed Cells" value={over} color="#2979ff" sub="excess labor" />
              <KTile label="OT Risk Shifts" value={heatData.filter(c => c.coverage >= 85).length} color="var(--t-warn)" alert="amber" />
            </>
          )
        })()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Heatmap */}
        <div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={sectionLabel}>Coverage Heatmap — 7 Days × 4 Shifts</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--t-text-faint)' }}>
                {[['#ff4d7d','Under'], ['#2ad6a0','Ideal'], ['#2979ff','Over']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, background: c, display: 'inline-block', flexShrink: 0 }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
              <div />
              {DAYS.map(d => (
                <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textAlign: 'center', padding: '4px 0' }}>{d}</div>
              ))}
            </div>

            {SHIFTS.map((shift, si) => (
              <div key={shift} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', display: 'flex', alignItems: 'center', paddingRight: 6, justifyContent: 'flex-end' }}>
                  {shift}
                </div>
                {DAYS.map((day, di) => {
                  const cell = heatData.find(c => c.dayIdx === di && c.shiftIdx === si)
                  if (!cell) return <div key={day} />
                  const isSelected = selected?.day === day && selected?.shift === shift
                  const bg = coverageColor(cell.coverage)
                  return (
                    <div
                      key={day}
                      onClick={() => setSelected(isSelected ? null : { day, shift })}
                      title={`${day} ${shift}: ${cell.coverage}% (${cell.staffed} staffed)`}
                      style={{
                        height: 52, background: `${bg}22`,
                        border: `2px solid ${isSelected ? bg : `${bg}60`}`,
                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 2,
                        transition: 'border-color .15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: bg }}>{cell.coverage}%</div>
                      <div style={{ fontSize: 9, color: bg, opacity: 0.8 }}>{coverageLabel(cell.coverage)}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Cell detail */}
          {sel ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
              <div style={sectionLabel}>{sel.day} — {sel.shift}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Coverage', `${sel.coverage}%`],
                  ['Status', coverageLabel(sel.coverage)],
                  ['Scheduled', `${sel.staffed} employees`],
                  ['Available', `${sel.available} employees`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ color: 'var(--t-text-faint)' }}>{l}</span>
                    <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 6 }}>Available Employees</div>
                {Array.from({ length: sel.available }, (_, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '3px 0', borderBottom: '1px solid var(--t-line)' }}>
                    {EMP_NAMES[(sel.dayIdx * 4 + sel.shiftIdx + i + 3) % EMP_NAMES.length]}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', lineHeight: 1.7 }}>
                Click any cell in the heatmap to see who's scheduled and who's available.
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>AI Recommendations</div>
            {recs.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '7px 0', borderBottom: i < recs.length - 1 ? '1px solid var(--t-line)' : undefined, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--t-accent)', fontWeight: 700, marginRight: 6 }}>→</span>{r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — SCHEDULE HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleHistoryTab() {
  const [history] = useState(buildMockHistory)
  const [viewId, setViewId] = useState(null)

  const totalGenerated = history.length
  const aiCount  = history.filter(h => h.generatedBy === 'AI').length
  const avgCov   = Math.round(history.reduce((a, h) => a + h.coverageScore, 0) / history.length)
  const totalOT  = history.reduce((a, h) => a + h.otHours, 0)
  const totalCost = history.reduce((a, h) => a + h.totalCost, 0)

  const statusStyle = {
    active:   { color: 'var(--t-accent)',   bg: 'rgba(0,229,255,0.1)',    border: 'rgba(0,229,255,0.3)' },
    accepted: { color: 'var(--t-success)',  bg: 'rgba(42,214,160,0.1)',   border: 'rgba(42,214,160,0.3)' },
    archived: { color: 'var(--t-text-faint)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Schedules Generated" value={totalGenerated} color="var(--t-text)" sub="12 weeks" />
        <KTile label="AI vs Manual" value={`${aiCount}/${totalGenerated - aiCount}`} color="var(--t-accent)" sub="AI/Manual split" />
        <KTile label="Avg Coverage Score" value={`${avgCov}%`} color={avgCov >= 85 ? 'var(--t-success)' : 'var(--t-warn)'} />
        <KTile label="Total OT Hours" value={`${totalOT}h`} color="var(--t-warn)" alert={totalOT > 50 ? 'amber' : undefined} />
        <KTile label="Total Labor Est." value={`$${totalCost.toLocaleString()}`} color="var(--t-text-muted)" sub="12 weeks" />
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Week Of', 'Location', 'Generated By', 'Coverage Score', 'Conflicts Resolved', 'OT Hours', 'Est. Cost', 'Status', ''].map(h => (
                <th key={h} style={thStyle('left', 'auto')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((row, i) => {
              const ss = statusStyle[row.status] || statusStyle.archived
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={tdStyle}><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{fmtWeekLabel(row.weekOf)}</span></td>
                  <td style={tdStyle}><span style={{ color: 'var(--t-text-muted)' }}>{row.location}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: row.generatedBy === 'AI' ? 'var(--t-accent)' : 'var(--t-text-muted)', background: row.generatedBy === 'AI' ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.05)', padding: '2px 7px', border: row.generatedBy === 'AI' ? '1px solid rgba(0,229,255,0.3)' : '1px solid var(--t-line)' }}>
                      {row.generatedBy}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: row.coverageScore >= 85 ? 'var(--t-success)' : row.coverageScore >= 75 ? 'var(--t-warn)' : 'var(--t-danger)', fontWeight: 700 }}>
                      {row.coverageScore}%
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ color: 'var(--t-text-muted)' }}>{row.conflictsResolved}</span></td>
                  <td style={tdStyle}><span style={{ color: row.otHours > 10 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{row.otHours}h</span></td>
                  <td style={tdStyle}><span style={{ color: 'var(--t-text-muted)', fontVariantNumeric: 'tabular-nums' }}>${row.totalCost.toLocaleString()}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: ss.color, background: ss.bg, padding: '2px 7px', border: `1px solid ${ss.border}` }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => setViewId(viewId === row.id ? null : row.id)} style={ghostBtn}>
                      {viewId === row.id ? 'Close' : 'View'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewId && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)', marginBottom: 8 }}>
            Schedule Details — Week {viewId}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.8 }}>
            Full shift breakdown for this week would be fetched from the database in production.
            Mock preview: {12 + seed(viewId, 3) % 10} shifts across {2 + (viewId % LOCS.length)} locations.
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const sectionLabel = {
  fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)',
  textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12,
}

const fieldLabel = {
  fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase',
  letterSpacing: '.06em', marginBottom: 4,
}

const inputStyle = {
  width: '100%', background: 'var(--t-bg)', border: '1px solid var(--t-line)',
  color: 'var(--t-text)', padding: '7px 10px', fontSize: 12,
  fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
}

function chipStyle(active) {
  return {
    background: active ? 'rgba(0,229,255,0.12)' : 'transparent',
    border: `1px solid ${active ? 'rgba(0,229,255,0.5)' : 'var(--t-line)'}`,
    color: active ? 'var(--t-accent)' : 'var(--t-text-faint)',
    fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)',
    fontWeight: active ? 700 : 400,
  }
}

function primaryBtn(disabled) {
  return {
    background: disabled ? 'rgba(0,229,255,0.1)' : 'linear-gradient(135deg, var(--t-accent) 0%, #2979ff 100%)',
    color: disabled ? 'var(--t-text-faint)' : '#000',
    border: 'none', padding: '9px 22px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 12, letterSpacing: '.03em', fontFamily: 'var(--font-sans)',
  }
}

const ghostBtn = {
  background: 'transparent', border: '1px solid var(--t-line)',
  color: 'var(--t-text-muted)', padding: '7px 14px', cursor: 'pointer',
  fontSize: 11, fontFamily: 'var(--font-sans)',
}

function thStyle(align = 'left', minW = 'auto') {
  return {
    padding: '8px 12px', textAlign: align, color: 'var(--t-text-faint)', fontWeight: 700,
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em',
    borderBottom: '1px solid var(--t-line)', minWidth: minW, whiteSpace: 'nowrap',
  }
}

const tdStyle = { padding: '9px 12px', verticalAlign: 'middle' }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function AiScheduler() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))

  const [tab, setTab] = useState('auto')
  const [weekStart] = useState(getWeekStart)

  const TABS = [
    { id: 'auto',      label: 'Auto-Schedule' },
    { id: 'conflicts', label: 'Conflict Resolver' },
    { id: 'coverage',  label: 'Coverage Optimizer' },
    { id: 'history',   label: 'Schedule History' },
  ]

  if (!isHR) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Manager or HR access required to use the AI Scheduler.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--t-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--t-line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>
              AI Schedule Manager
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3 }}>
              Week of {fmtWeekLabel(weekStart)} · {locationIds?.length || 0} location{locationIds?.length !== 1 ? 's' : ''} in scope
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge blue" style={{ fontSize: 10 }}>AI-Powered</span>
            <span className="badge green" style={{ fontSize: 10 }}>HR Access</span>
          </div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'auto'      && <AutoScheduleTab weekStart={weekStart} setWeekStart={() => {}} locationIds={locationIds} maxHours={40} />}
        {tab === 'conflicts' && <ConflictResolverTab />}
        {tab === 'coverage'  && <CoverageOptimizerTab />}
        {tab === 'history'   && <ScheduleHistoryTab />}
      </div>
    </div>
  )
}
