// Schedule.jsx — Twisted Growers HR · Aurora midnight theme
// 4 tabs: Weekly Grid | My Schedule | Open Shifts | Build Schedule
// Forensic KPI panel always visible · deterministic mock data · no Math.random()
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { pushNotification } from '../lib/platform.js'
import DrillDown from '../components/DrillDown.jsx'

/* ─── deterministic seed ─── */
function seed(a, b) { return ((a * 31 + b) * 17 + a * b) % 100 }

/* ─── constants ─── */
const LOCS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']

// Shift color code: AM = yellow, PM = blue (theme accent). Used for the
// AM/PM label band AND the tile outlines in WeeklyGrid. Other color codes
// (KH/ASSOC chips, coverage badges, today highlight) are unchanged.
const SHIFTS = [
  { id: 'AM', label: 'AM Shift', hours: '9:00a – 5:00p', color: '#ffd60a', endHour: 17 },
  { id: 'PM', label: 'PM Shift', hours: '1:00p – 9:00p', color: '#00e5ff', endHour: 21 },
]

const KEY_HOLDERS = [
  'Alex Rivera','Jordan Lee','Sam Torres','Morgan Chen',
  'Casey Park','Riley Kim','Taylor Ng','Drew Patel',
]
const ASSOCIATES = [
  'Chris Wade','Pat Quinn','Dana Mills','Terrell W',
  'Deon Mitchell','Isabel Reyes','Kyle Brennan','Priya Shah',
  'Marcus Webb','Sandra Reyes',
]

const ROLE_MAP = Object.fromEntries([
  ...KEY_HOLDERS.map(n => [n, 'Key Holder']),
  ...ASSOCIATES.map(n  => [n, 'Associate']),
])

// Keyholder if the real role implies it (matches the DB rank<=65 set by name)
const KH_ROLE_RX = /key|manager|lead|owner|supervisor|director/i
const isKeyholderRole = (roleName) => KH_ROLE_RX.test(roleName || '')

function getUnavailableDays(empName) {
  const nameHash = empName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  if (nameHash % 10 < 2) {
    const day1 = nameHash % 7
    const day2 = (nameHash * 3) % 7
    return day1 === day2 ? [day1] : [day1, day2]
  }
  return []
}

function isoWeekStart(days) { return days[0].toISOString().split('T')[0] }
function SCHED_KEY(locationId, weekStart) { return `vip_schedule_${locationId}_${weekStart}` }
function PUB_KEY(locationId, weekStart) { return `vip_schedule_published_${locationId}_${weekStart}` }

const RULES_KEY = 'vip_sched_rules'
const CHANGE_REQ_KEY = 'vip_sched_change_requests'

const DEFAULT_RULES = {
  minHours: 20,
  maxHours: 40,
  minRest: 8,
  maxConsecutive: 6,
  requireKeyHolder: true,
}

function getWeekDays(baseDate) {
  const d   = new Date(baseDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d); x.setDate(d.getDate() + i); return x
  })
}

function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function fmtDay(d) { return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() }
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

function buildShift(locIdx, shiftIdx, dayOffset, weekSeed) {
  const base  = seed(locIdx * 7 + shiftIdx, dayOffset + weekSeed * 13)
  let kh1     = KEY_HOLDERS[base % 8]
  let kh2idx  = (base + 3) % 8
  if (KEY_HOLDERS[kh2idx] === kh1) kh2idx = (base + 4) % 8
  const kh2   = KEY_HOLDERS[kh2idx]
  const assoc = ASSOCIATES[seed(locIdx + shiftIdx * 3, dayOffset + weekSeed * 7) % 10]
  return [
    { name: kh1,   role: 'Key Holder' },
    { name: kh2,   role: 'Key Holder' },
    { name: assoc, role: 'Associate'  },
  ]
}

function buildWeekSchedule(days) {
  const weekSeed = days[0].getMonth() * 10 + Math.floor(days[0].getDate() / 7)
  const schedule = {}
  LOCS.forEach((loc, li) => {
    schedule[loc] = {}
    SHIFTS.forEach((shift, si) => {
      schedule[loc][shift.id] = {}
      days.forEach((day, di) => {
        schedule[loc][shift.id][di] = buildShift(li, si, di, weekSeed)
      })
    })
  })
  return schedule
}

function transformLiveRows(rows, days) {
  if (!rows || rows.length === 0) return null
  const schedule = {}
  rows.forEach(row => {
    const loc = row.node_name || 'Orange'
    if (!schedule[loc]) {
      schedule[loc] = {}
      SHIFTS.forEach(sh => {
        schedule[loc][sh.id] = {}
        days.forEach((_, di) => { schedule[loc][sh.id][di] = [] })
      })
    }
    const rowDate = new Date(row.shift_date)
    const dayIdx = days.findIndex(d => isSameDay(d, rowDate))
    if (dayIdx === -1) return
    const hour = row.start_time ? parseInt(row.start_time.split(':')[0], 10) : 9
    const shiftId = hour < 13 ? 'AM' : 'PM'
    const isKH = row.keyholder_eligible === true || (row.role_name || '').toLowerCase().includes('key')
    const emp = { name: row.full_name || 'Unknown', role: isKH ? 'Key Holder' : 'Associate' }
    if (!schedule[loc][shiftId][dayIdx]) schedule[loc][shiftId][dayIdx] = []
    schedule[loc][shiftId][dayIdx].push(emp)
  })
  return schedule
}

function computeWeeklyHours(slots) {
  const hours = {}
  Object.values(slots).forEach(emps => {
    emps.forEach(e => { hours[e.name] = (hours[e.name] || 0) + 8 })
  })
  return hours
}

/* ─── Toast ─── */
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position:'fixed', bottom:24, right:24,
      background: type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
      color:'#fff', padding:'12px 20px', fontWeight:700, fontSize:13,
      zIndex:9999, borderRadius:0, maxWidth:380, boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
    }}>{msg}</div>
  )
}

/* ─── KPI Tile ─── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background:'var(--t-surface)',
      border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,
      padding:'14px 16px', position:'relative', overflow:'hidden', borderRadius:0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert==='red'   && <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)' }}/>}
      {alert==='amber' && <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)' }}/>}
      <div style={{ fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11,color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ─── Employee chip ─── */
function EmpChip({ emp }) {
  const isKH = emp.role === 'Key Holder'
  return (
    <div style={{
      background: isKH ? 'rgba(0,229,255,0.12)' : 'rgba(52,199,89,0.12)',
      border:`1px solid ${isKH ? 'var(--t-accent)' : 'var(--t-success)'}`,
      borderRadius:0, padding:'2px 6px', fontSize:11, fontWeight:600,
      color: isKH ? 'var(--t-accent)' : 'var(--t-success)',
      whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:3,
    }}>
      <span style={{ fontSize:9, opacity:.7 }}>{isKH ? 'KH' : 'ASSOC'}</span>
      {emp.name}
    </div>
  )
}

/* ─── Coverage badge ─── */
function CoverageBadge({ slot }) {
  const empCount = slot.length
  const khCount  = slot.filter(e => e.role === 'Key Holder').length
  if (empCount === 0 || khCount === 0) {
    return <div style={{ fontSize:9,fontWeight:800,color:'var(--t-danger)',background:'rgba(255,59,48,0.12)',border:'1px solid var(--t-danger)',padding:'2px 5px',borderRadius:0,letterSpacing:'.04em',marginBottom:3 }}>NO KEY HOLDER</div>
  }
  if (empCount < 2) {
    return <div style={{ fontSize:9,fontWeight:800,color:'var(--t-warn)',background:'rgba(255,149,0,0.12)',border:'1px solid var(--t-warn)',padding:'2px 5px',borderRadius:0,letterSpacing:'.04em',marginBottom:3 }}>UNDERSTAFFED</div>
  }
  if (empCount > 5) {
    return <div style={{ fontSize:9,fontWeight:800,color:'var(--t-accent)',background:'rgba(0,229,255,0.1)',border:'1px solid var(--t-accent)',padding:'2px 5px',borderRadius:0,letterSpacing:'.04em',marginBottom:3 }}>OVERSTAFFED</div>
  }
  return null
}

/* ─── Data source badge ─── */
function DataBadge({ isLive }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:0,
      fontSize:10, fontWeight:800, letterSpacing:'.08em',
      border:`1px solid ${isLive ? 'var(--t-success)' : 'var(--t-warn)'}`,
      color: isLive ? 'var(--t-success)' : 'var(--t-warn)',
      background: isLive ? 'rgba(29,233,182,0.10)' : 'rgba(255,179,71,0.10)',
    }}>
      <span style={{ width:6,height:6,borderRadius:'50%',background:isLive?'var(--t-success)':'var(--t-warn)',display:'inline-block' }}/>
      {isLive ? 'LIVE' : 'DEMO'}
    </div>
  )
}

/* ─── Tab 1: Weekly Grid ─── */
function WeeklyGrid({ days, schedule, today, locFilter, setLocFilter }) {
  const visLocs = locFilter === 'All' ? LOCS : [locFilter]
  function locStatus(loc) {
    let gaps = 0
    days.forEach((_, di) => {
      SHIFTS.forEach(sh => {
        const slot = schedule[loc]?.[sh.id]?.[di] || []
        if (!slot.some(e => e.role === 'Key Holder')) gaps++
      })
    })
    if (gaps === 0) return 'green'
    if (gaps <= 2)  return 'amber'
    return 'red'
  }
  return (
    <div>
      <div style={{ display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' }}>
        {['All',...LOCS].map(loc => {
          const active = locFilter === loc
          const status = loc !== 'All' ? locStatus(loc) : null
          return (
            <button key={loc} onClick={() => setLocFilter(loc)} style={{
              padding:'4px 12px',
              background: active ? 'var(--t-accent)' : 'var(--t-surface)',
              color: active ? 'var(--t-on-grad)' : 'var(--t-text-muted)',
              border:`1px solid ${!active&&status==='red'?'var(--t-danger)':!active&&status==='amber'?'var(--t-warn)':active?'var(--t-accent)':'var(--t-line)'}`,
              borderRadius:0, fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:'.04em',
            }}>
              {loc!=='All'&&status&&<span style={{ display:'inline-block',width:6,height:6,borderRadius:'50%',background:status==='green'?'var(--t-success)':status==='amber'?'var(--t-warn)':'var(--t-danger)',marginRight:5 }}/>}
              {loc}
            </button>
          )
        })}
      </div>

      {visLocs.filter(loc => schedule[loc]).length === 0 && (
        <div style={{ padding:'32px',textAlign:'center',color:'var(--t-text-faint)',border:'1px dashed var(--t-line)',fontSize:13,lineHeight:1.7 }}>
          No published schedule for this week at {locFilter === 'All' ? 'any location' : locFilter}.<br/>
          Build and publish one in <b>Build Schedule</b> — real shifts only, no placeholder data.
        </div>
      )}
      {visLocs.filter(loc => schedule[loc]).map(loc => (
        <div key={loc} style={{ marginBottom:24 }}>
          <div style={{ fontSize:10,fontWeight:800,letterSpacing:'.12em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:8 }}>{loc}</div>
          <div style={{ display:'grid',gridTemplateColumns:'80px repeat(7, 1fr)',gap:2,marginBottom:2 }}>
            <div/>
            {days.map((d, di) => {
              const isToday = isSameDay(d, today)
              return (
                <div key={di} style={{ textAlign:'center',padding:'4px 0',background:isToday?'var(--t-accent-soft)':'transparent',border:isToday?'1px solid var(--t-accent)':'1px solid transparent',borderRadius:0 }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:'.06em',color:'var(--t-text-muted)' }}>{fmtDay(d)}</div>
                  <div style={{ fontSize:12,fontWeight:800,color:isToday?'var(--t-accent)':'var(--t-text)' }}>{fmtDate(d)}</div>
                </div>
              )
            })}
          </div>
          {SHIFTS.map(sh => (
            <div key={sh.id} style={{ display:'grid',gridTemplateColumns:'80px repeat(7, 1fr)',gap:2,marginBottom:2 }}>
              <div style={{ display:'flex',flexDirection:'column',justifyContent:'center',padding:'6px 8px',background:'var(--t-surface)',border:`1px solid ${sh.color}`,borderRadius:0 }}>
                <div style={{ fontSize:9,fontWeight:800,color:sh.color,letterSpacing:'.06em' }}>{sh.id}</div>
                <div style={{ fontSize:8,color:'var(--t-text-faint)',marginTop:2 }}>{sh.hours}</div>
              </div>
              {days.map((d, di) => {
                const slot = schedule[loc]?.[sh.id]?.[di] || []
                const isToday = isSameDay(d, today)
                return (
                  <div key={di} style={{ padding:'4px 5px',background:isToday?'var(--t-accent-soft)':'var(--t-surface)',border:`1px solid ${sh.color}`,borderRadius:0,minHeight:52,display:'flex',flexDirection:'column',gap:2 }}>
                    <CoverageBadge slot={slot} />
                    {slot.map((emp, ei) => <EmpChip key={ei} emp={emp} />)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─── Tab 2: My Schedule ─── */
function MySchedule({ days, schedule, person, today, onDrill }) {
  const myShifts = []
  days.forEach((d, di) => {
    LOCS.forEach(loc => {
      SHIFTS.forEach(sh => {
        const slot = schedule[loc]?.[sh.id]?.[di] || []
        const me = slot.find(e => e.name === person?.full_name)
        if (me) myShifts.push({ date:d, loc, shift:sh, role:me.role, di })
      })
    })
  })
  if (myShifts.length === 0) {
    return <div style={{ padding:32,textAlign:'center',color:'var(--t-text-faint)',fontSize:13 }}>No shifts scheduled this week.</div>
  }
  const totalHours = myShifts.length * 8
  // Row-level records behind My Schedule KPIs — one row per assigned shift
  const MY_COLS = [
    { key: 'date', label: 'Date', value: s => `${fmtDay(s.date)} ${fmtDate(s.date)}`, sortKey: s => s.di },
    { key: 'loc', label: 'Location', value: s => s.loc },
    { key: 'shift', label: 'Shift', value: s => s.shift.label },
    { key: 'hours', label: 'Time', value: s => s.shift.hours },
    { key: 'role', label: 'Role', value: s => s.role },
    { key: 'len', label: 'Hours', value: () => '8h', align: 'right' },
    { key: 'earn', label: 'Est. Pay', value: () => '$120', align: 'right' },
  ]
  const drillMine = (title, accent) => onDrill && onDrill({
    title, subtitle: `${myShifts.length} shift${myShifts.length === 1 ? '' : 's'} this week`,
    columns: MY_COLS, rows: myShifts, accent,
  })
  return (
    <div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8,marginBottom:16 }}>
        <KTile label="Shifts This Week" value={myShifts.length} onClick={() => drillMine('My Shifts This Week', 'var(--t-accent)')} />
        <KTile label="Total Hours" value={`${totalHours}h`} color="var(--t-accent)" onClick={() => drillMine('My Hours — Shift Breakdown', 'var(--t-accent)')} />
        <KTile label="Est. Earnings" value={`$${(totalHours*15).toLocaleString()}`} color="var(--t-success)" onClick={() => drillMine('Est. Earnings — Shift Breakdown', 'var(--t-success)')} />
      </div>
      {myShifts.map((s, i) => {
        const isToday = isSameDay(s.date, today)
        return (
          <div key={i} style={{ background:'var(--t-surface)',border:`1px solid ${isToday?'var(--t-accent)':'var(--t-line)'}`,padding:'12px 16px',marginBottom:6,borderRadius:0,display:'flex',alignItems:'center',gap:12 }}>
            {isToday && <div style={{ position:'relative',width:4,height:'100%',background:'var(--t-accent)',borderRadius:0 }}/>}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:700,color:isToday?'var(--t-accent)':'var(--t-text)',marginBottom:3 }}>
                {fmtDay(s.date)} {fmtDate(s.date)} {isToday&&<span style={{ fontSize:9,color:'var(--t-accent)',marginLeft:4 }}>TODAY</span>}
              </div>
              <div style={{ fontSize:11,color:'var(--t-text-muted)' }}>{s.loc} · {s.shift.label} · {s.shift.hours}</div>
            </div>
            <div style={{ fontSize:10,fontWeight:700,color:s.role==='Key Holder'?'var(--t-accent)':'var(--t-success)',border:`1px solid ${s.role==='Key Holder'?'var(--t-accent)':'var(--t-success)'}`,padding:'2px 8px',borderRadius:0 }}>
              {s.role==='Key Holder'?'KH':'ASSOC'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Tab 3: Open Shifts ─── */
function OpenShifts({ days, schedule, toast }) {
  const [claimed, setClaimed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vip_claimed_shifts') || '{}') } catch { return {} }
  })
  const openSlots = []
  days.forEach((d, di) => {
    LOCS.forEach(loc => {
      SHIFTS.forEach(sh => {
        const slot = schedule[loc]?.[sh.id]?.[di] || []
        const hasKH = slot.some(e => e.role === 'Key Holder')
        if (!hasKH || slot.length < 2) {
          const key = `${loc}_${sh.id}_${di}`
          openSlots.push({ key, date:d, loc, shift:sh, slot, hasKH, di })
        }
      })
    })
  })
  function claimShift(key) {
    const updated = { ...claimed, [key]:true }
    setClaimed(updated)
    localStorage.setItem('vip_claimed_shifts', JSON.stringify(updated))
    toast('Shift claimed! Manager will confirm.', 'success')
  }
  if (openSlots.length === 0) {
    return <div style={{ padding:32,textAlign:'center',color:'var(--t-success)',fontSize:13,fontWeight:700 }}>All shifts are fully covered this week.</div>
  }
  return (
    <div>
      <div style={{ fontSize:11,color:'var(--t-text-muted)',marginBottom:12 }}>
        {openSlots.length} open slot{openSlots.length!==1?'s':''} — claim a shift to notify your manager
      </div>
      {openSlots.map(s => {
        const isClaimed = claimed[s.key]
        return (
          <div key={s.key} style={{ background:'var(--t-surface)',border:`1px solid ${s.hasKH?'var(--t-warn)':'var(--t-danger)'}`,padding:'12px 16px',marginBottom:6,borderRadius:0,display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13,fontWeight:700,color:'var(--t-text)',marginBottom:3 }}>{fmtDay(s.date)} {fmtDate(s.date)} · {s.loc}</div>
              <div style={{ fontSize:11,color:'var(--t-text-muted)',marginBottom:4 }}>{s.shift.label} · {s.shift.hours}</div>
              {!s.hasKH && <div style={{ fontSize:9,fontWeight:800,color:'var(--t-danger)',letterSpacing:'.06em' }}>NO KEY HOLDER</div>}
              {s.hasKH&&s.slot.length<2 && <div style={{ fontSize:9,fontWeight:800,color:'var(--t-warn)',letterSpacing:'.06em' }}>UNDERSTAFFED</div>}
            </div>
            <button onClick={() => !isClaimed && claimShift(s.key)} disabled={isClaimed} style={{ padding:'6px 14px',background:isClaimed?'var(--t-surface)':'var(--t-accent)',color:isClaimed?'var(--t-text-faint)':'var(--t-on-grad)',border:`1px solid ${isClaimed?'var(--t-line)':'var(--t-accent)'}`,borderRadius:0,fontSize:11,fontWeight:700,cursor:isClaimed?'default':'pointer' }}>
              {isClaimed ? 'CLAIMED' : 'CLAIM'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Tab 4: Build Schedule ─── */
function BuildSchedule({ days, schedule, setSchedule, toast, weekStartStr, roster = [] }) {
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RULES_KEY)) || DEFAULT_RULES } catch { return DEFAULT_RULES }
  })
  const [editLoc, setEditLoc]     = useState(LOCS[0])
  const [editShift, setEditShift] = useState(SHIFTS[0].id)
  const [editDay, setEditDay]     = useState(0)
  const [published, setPublished] = useState({})

  function saveRules(r) { setRules(r); localStorage.setItem(RULES_KEY, JSON.stringify(r)) }

  function addEmployee(loc, shiftId, dayIdx, name, role) {
    const updated = JSON.parse(JSON.stringify(schedule))
    if (!updated[loc]) updated[loc] = {}
    if (!updated[loc][shiftId]) updated[loc][shiftId] = {}
    if (!updated[loc][shiftId][dayIdx]) updated[loc][shiftId][dayIdx] = []
    const existing = updated[loc][shiftId][dayIdx]
    if (existing.find(e => e.name === name)) return
    existing.push({ name, role })
    setSchedule(updated)
    localStorage.setItem(SCHED_KEY(loc, weekStartStr), JSON.stringify(updated[loc]))
    toast(`Added ${name} to ${loc} ${shiftId} ${fmtDay(days[dayIdx])}`, 'success')
  }

  function removeEmployee(loc, shiftId, dayIdx, name) {
    const updated = JSON.parse(JSON.stringify(schedule))
    if (updated[loc]?.[shiftId]?.[dayIdx]) {
      updated[loc][shiftId][dayIdx] = updated[loc][shiftId][dayIdx].filter(e => e.name !== name)
    }
    setSchedule(updated)
    localStorage.setItem(SCHED_KEY(loc, weekStartStr), JSON.stringify(updated[loc]))
    toast(`Removed ${name}`, 'success')
  }

  function publishSchedule(loc) {
    localStorage.setItem(PUB_KEY(loc, weekStartStr), 'true')
    setPublished(p => ({ ...p, [loc]:true }))
    toast(`${loc} schedule published!`, 'success')
  }

  const currentSlot = schedule[editLoc]?.[editShift]?.[editDay] || []
  const rosterByName = Object.fromEntries((roster || []).map(r => [r.full_name, r]))
  const allEmps = (roster || []).map(r => r.full_name).filter(n => !currentSlot.find(e => e.name === n))

  const weeklyHours = useMemo(() => {
    const slots = {}
    Object.entries(schedule).forEach(([loc, shiftMap]) => {
      Object.entries(shiftMap).forEach(([shId, dayMap]) => {
        Object.entries(dayMap).forEach(([di, emps]) => { slots[`${loc}_${shId}_${di}`] = emps })
      })
    })
    return computeWeeklyHours(slots)
  }, [schedule])

  return (
    <div style={{ display:'grid',gridTemplateColumns:'1fr 320px',gap:16 }}>
      <div>
        <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' }}>
          <select value={editLoc} onChange={e=>setEditLoc(e.target.value)} style={{ padding:'4px 8px',background:'var(--t-surface)',color:'var(--t-text)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700 }}>
            {LOCS.map(l => <option key={l}>{l}</option>)}
          </select>
          <select value={editShift} onChange={e=>setEditShift(e.target.value)} style={{ padding:'4px 8px',background:'var(--t-surface)',color:'var(--t-text)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700 }}>
            {SHIFTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={editDay} onChange={e=>setEditDay(Number(e.target.value))} style={{ padding:'4px 8px',background:'var(--t-surface)',color:'var(--t-text)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700 }}>
            {days.map((d, i) => <option key={i} value={i}>{fmtDay(d)} {fmtDate(d)}</option>)}
          </select>
        </div>
        <div style={{ background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:12,marginBottom:12,borderRadius:0 }}>
          <div style={{ fontSize:10,fontWeight:700,color:'var(--t-text-muted)',letterSpacing:'.08em',marginBottom:8 }}>CURRENT SLOT — {editLoc} {editShift} {fmtDay(days[editDay])}</div>
          {currentSlot.length === 0 ? (
            <div style={{ color:'var(--t-text-faint)',fontSize:12 }}>No employees assigned</div>
          ) : (
            <div style={{ display:'flex',flexWrap:'wrap',gap:4 }}>
              {currentSlot.map((emp, i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:3 }}>
                  <EmpChip emp={emp} />
                  <button onClick={() => removeEmployee(editLoc,editShift,editDay,emp.name)} style={{ background:'none',border:'none',color:'var(--t-danger)',cursor:'pointer',fontSize:12,padding:0 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:12,borderRadius:0 }}>
          <div style={{ fontSize:10,fontWeight:700,color:'var(--t-text-muted)',letterSpacing:'.08em',marginBottom:8 }}>ADD EMPLOYEE</div>
          <div style={{ display:'flex',flexDirection:'column',gap:3,maxHeight:240,overflowY:'auto' }}>
            {allEmps.map(name => {
              const role = isKeyholderRole(rosterByName[name]?.role_name) ? 'Key Holder' : 'Associate'
              const isUnavail = false
              return (
                <div key={name} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 6px',background:isUnavail?'rgba(255,59,48,0.06)':'transparent',borderRadius:0 }}>
                  <div style={{ fontSize:12,color:isUnavail?'var(--t-text-faint)':'var(--t-text)' }}>
                    {name}
                    <span style={{ fontSize:9,color:'var(--t-text-muted)',marginLeft:5 }}>{role==='Key Holder'?'KH':'ASSOC'}</span>
                    {isUnavail && <span style={{ fontSize:9,color:'var(--t-danger)',marginLeft:5 }}>UNAVAIL</span>}
                    {weeklyHours[name] >= DEFAULT_RULES.maxHours && <span style={{ fontSize:9,color:'var(--t-warn)',marginLeft:5 }}>MAX HRS</span>}
                  </div>
                  <button onClick={() => !isUnavail && addEmployee(editLoc,editShift,editDay,name,role)} disabled={isUnavail} style={{ padding:'2px 8px',background:isUnavail?'transparent':'var(--t-accent)',color:isUnavail?'var(--t-text-faint)':'var(--t-on-grad)',border:`1px solid ${isUnavail?'var(--t-line)':'var(--t-accent)'}`,borderRadius:0,fontSize:9,fontWeight:700,cursor:isUnavail?'default':'pointer' }}>ADD</button>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display:'flex',gap:6,marginTop:12,flexWrap:'wrap' }}>
          {LOCS.map(loc => (
            <button key={loc} onClick={() => publishSchedule(loc)} style={{ padding:'6px 14px',background:published[loc]?'var(--t-success)':'var(--t-surface)',color:published[loc]?'var(--t-on-grad)':'var(--t-text-muted)',border:`1px solid ${published[loc]?'var(--t-success)':'var(--t-line)'}`,borderRadius:0,fontSize:10,fontWeight:700,cursor:'pointer' }}>
              {published[loc] ? `${loc} DONE` : `Publish ${loc}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
        <div style={{ background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:12,borderRadius:0 }}>
          <div style={{ fontSize:10,fontWeight:700,color:'var(--t-text-muted)',letterSpacing:'.08em',marginBottom:8 }}>SCHEDULING RULES</div>
          {[
            { key:'minHours', label:'Min Hours/Week', min:0, max:40 },
            { key:'maxHours', label:'Max Hours/Week', min:20, max:60 },
            { key:'minRest',  label:'Min Rest Hours', min:4, max:12 },
            { key:'maxConsecutive', label:'Max Consecutive Days', min:1, max:7 },
          ].map(r => (
            <div key={r.key} style={{ marginBottom:8 }}>
              <div style={{ display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--t-text-muted)',marginBottom:3 }}>
                <span>{r.label}</span><span style={{ color:'var(--t-accent)',fontWeight:700 }}>{rules[r.key]}</span>
              </div>
              <input type="range" min={r.min} max={r.max} value={rules[r.key]} onChange={e => saveRules({ ...rules, [r.key]:Number(e.target.value) })} style={{ width:'100%',accentColor:'var(--t-accent)' }} />
            </div>
          ))}
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6 }}>
            <span style={{ fontSize:11,color:'var(--t-text-muted)' }}>Require Key Holder</span>
            <button onClick={() => saveRules({ ...rules, requireKeyHolder:!rules.requireKeyHolder })} style={{ padding:'2px 10px',background:rules.requireKeyHolder?'var(--t-success)':'var(--t-surface)',color:rules.requireKeyHolder?'var(--t-on-grad)':'var(--t-text-muted)',border:`1px solid ${rules.requireKeyHolder?'var(--t-success)':'var(--t-line)'}`,borderRadius:0,fontSize:10,fontWeight:700,cursor:'pointer' }}>
              {rules.requireKeyHolder ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div style={{ background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:12,borderRadius:0 }}>
          <div style={{ fontSize:10,fontWeight:700,color:'var(--t-text-muted)',letterSpacing:'.08em',marginBottom:8 }}>WEEKLY HOURS</div>
          <div style={{ maxHeight:200,overflowY:'auto' }}>
            {Object.entries(weeklyHours).sort((a,b) => b[1]-a[1]).map(([name, hrs]) => (
              <div key={name} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 0',borderBottom:'1px solid var(--t-line)' }}>
                <span style={{ fontSize:11,color:'var(--t-text)' }}>{name}</span>
                <span style={{ fontSize:11,fontWeight:700,color:hrs>rules.maxHours?'var(--t-danger)':hrs<rules.minHours?'var(--t-warn)':'var(--t-success)' }}>{hrs}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ─── */
export default function Schedule() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const person = session?.person

  const today  = new Date()
  const [baseDate, setBaseDate] = useState(today)
  const days   = useMemo(() => getWeekDays(baseDate), [baseDate])
  const weekStartStr = useMemo(() => isoWeekStart(days), [days])

  const [activeTab, setActiveTab] = useState('grid')
  const [locFilter, setLocFilter] = useState('All')
  const [toast, setToast]         = useState(null)
  const [isLive, setIsLive]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [schedule, setSchedule]   = useState({})   // live-only; never seeded with mock data

  const showToast = useCallback((msg, type = 'success') => { setToast({ msg, type }) }, [])

  const loadSchedule = useCallback(async () => {
    if (!locationIds || locationIds.length === 0) { setSchedule({}); setIsLive(false); return }
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_week_schedule', {
        p_node_ids: locationIds, p_week_start: weekStartStr, p_actor: person?.id || null,
      })
      if (error) throw error
      const liveSchedule = transformLiveRows(data, days)
      setSchedule(liveSchedule || {})
      setIsLive(Array.isArray(data) && data.length > 0)
    } catch (err) {
      console.warn('[Schedule] live data error:', err)
      setSchedule({}); setIsLive(false)
    } finally { setLoading(false) }
  }, [locationIds, weekStartStr, days, person?.id])

  useEffect(() => { loadSchedule() }, [locationIds.join(','), weekStartStr])

  // Live roster for the Build tab (real people only — no hardcoded names)
  const [roster, setRoster] = useState([])
  useEffect(() => {
    if (!locationIds || locationIds.length === 0) { setRoster([]); return }
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: person?.id || null })
      .then(({ data }) => setRoster(Array.isArray(data) ? data : []))
      .catch(() => setRoster([]))
  }, [locationIds.join(','), person?.id])

  const kpis = useMemo(() => {
    let totalSlots=0, coveredSlots=0, noKH=0, understaffed=0, overstaffed=0, totalEmps=0
    Object.keys(schedule).forEach(loc => {
      days.forEach((_, di) => {
        SHIFTS.forEach(sh => {
          const slot = schedule[loc]?.[sh.id]?.[di] || []
          totalSlots++; totalEmps += slot.length
          const hasKH = slot.some(e => e.role === 'Key Holder')
          if (!hasKH) noKH++
          else if (slot.length < 2) understaffed++
          else if (slot.length > 5) overstaffed++
          else coveredSlots++
        })
      })
    })
    const coverage = totalSlots > 0 ? Math.round((coveredSlots / totalSlots) * 100) : 0
    return { totalSlots, coveredSlots, noKH, understaffed, overstaffed, totalEmps, coverage }
  }, [schedule, days])

  // ── Forensic drill-down: flatten every scheduled slot into a row-level record ──
  const [drill, setDrill] = useState(null)
  const slotRecords = useMemo(() => {
    const rows = []
    Object.keys(schedule).forEach(loc => {
      days.forEach((d, di) => {
        SHIFTS.forEach(sh => {
          const slot = schedule[loc]?.[sh.id]?.[di] || []
          const khCount = slot.filter(e => e.role === 'Key Holder').length
          const hasKH = khCount > 0
          const status = !hasKH ? 'No Key Holder' : slot.length < 2 ? 'Understaffed' : slot.length > 5 ? 'Overstaffed' : 'Covered'
          rows.push({
            loc, shift: sh.label, shiftId: sh.id, day: d, di,
            headcount: slot.length, khCount,
            staff: slot.map(e => e.name).join(', ') || '—',
            status,
          })
        })
      })
    })
    return rows
  }, [schedule, days])

  const SLOT_COLS = [
    { key: 'day', label: 'Date', value: r => `${fmtDay(r.day)} ${fmtDate(r.day)}`, sortKey: r => r.di },
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'shift', label: 'Shift', value: r => r.shift },
    { key: 'staff', label: 'Assigned Staff', value: r => r.staff },
    { key: 'headcount', label: 'Headcount', value: r => r.headcount, align: 'right', sortKey: r => r.headcount },
    { key: 'khCount', label: 'Key Holders', value: r => r.khCount, align: 'right', sortKey: r => r.khCount },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} slot${rows.length === 1 ? '' : 's'} · week of ${fmtDate(days[0])}`,
    columns: SLOT_COLS, rows, accent,
  })

  const TABS = [
    { id:'grid',  label:'Weekly Grid'    },
    { id:'mine',  label:'My Schedule'    },
    { id:'open',  label:'Open Shifts'    },
    { id:'build', label:'Build Schedule' },
  ]

  return (
    <div style={{ fontFamily:'var(--font-sans)',color:'var(--t-text)',fontSize:13 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ fontSize:16,fontWeight:800,letterSpacing:'-.3px' }}>SCHEDULE</div>
          <DataBadge isLive={isLive} />
          {loading && <div style={{ fontSize:10,color:'var(--t-text-muted)',fontWeight:600 }}>Loading...</div>}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()-7); setBaseDate(d) }} style={{ padding:'4px 10px',background:'var(--t-surface)',color:'var(--t-text-muted)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700,cursor:'pointer' }}>PREV</button>
          <div style={{ fontSize:11,fontWeight:700,color:'var(--t-text-muted)',minWidth:130,textAlign:'center' }}>{fmtDate(days[0])} – {fmtDate(days[6])}</div>
          <button onClick={() => { const d=new Date(baseDate); d.setDate(d.getDate()+7); setBaseDate(d) }} style={{ padding:'4px 10px',background:'var(--t-surface)',color:'var(--t-text-muted)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700,cursor:'pointer' }}>NEXT</button>
          <button onClick={() => setBaseDate(today)} style={{ padding:'4px 10px',background:'var(--t-accent)',color:'var(--t-on-grad)',border:'1px solid var(--t-accent)',borderRadius:0,fontSize:11,fontWeight:700,cursor:'pointer' }}>TODAY</button>
          <button onClick={loadSchedule} disabled={loading} style={{ padding:'4px 10px',background:'var(--t-surface)',color:'var(--t-text-muted)',border:'1px solid var(--t-line)',borderRadius:0,fontSize:11,fontWeight:700,cursor:'pointer',opacity:loading?.5:1 }}>REFRESH</button>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:6,marginBottom:16 }}>
        <KTile label="Coverage Score" value={`${kpis.coverage}%`} sub={`${kpis.coveredSlots}/${kpis.totalSlots} slots`} color={kpis.coverage>=90?'var(--t-success)':kpis.coverage>=70?'var(--t-warn)':'var(--t-danger)'} alert={kpis.coverage<70?'red':kpis.coverage<90?'amber':null} onClick={() => openDrill('Covered Slots', slotRecords.filter(r => r.status === 'Covered'), 'var(--t-success)')} />
        <KTile label="No Key Holder" value={kpis.noKH} sub="shifts without KH" color={kpis.noKH>0?'var(--t-danger)':'var(--t-success)'} alert={kpis.noKH>0?'red':null} onClick={() => openDrill('Shifts Without a Key Holder', slotRecords.filter(r => r.status === 'No Key Holder'), 'var(--t-danger)')} />
        <KTile label="Understaffed" value={kpis.understaffed} sub="shifts below min" color={kpis.understaffed>2?'var(--t-warn)':'var(--t-text)'} alert={kpis.understaffed>2?'amber':null} onClick={() => openDrill('Understaffed Shifts', slotRecords.filter(r => r.status === 'Understaffed'), 'var(--t-warn)')} />
        <KTile label="Overstaffed" value={kpis.overstaffed} sub="shifts above max" color="var(--t-text)" onClick={() => openDrill('Overstaffed Shifts', slotRecords.filter(r => r.status === 'Overstaffed'), 'var(--t-accent)')} />
        <KTile label="Total Emp-Shifts" value={kpis.totalEmps} sub="across all locations" color="var(--t-accent)" onClick={() => openDrill('All Scheduled Slots', slotRecords, 'var(--t-accent)')} />
      </div>

      <div style={{ display:'flex',gap:2,marginBottom:16,borderBottom:'1px solid var(--t-line)' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding:'8px 14px',background:activeTab===tab.id?'var(--t-accent)':'transparent',color:activeTab===tab.id?'var(--t-on-grad)':'var(--t-text-muted)',border:'none',borderRadius:0,fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:'.06em' }}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'grid'  && <WeeklyGrid days={days} schedule={schedule} today={today} locFilter={locFilter} setLocFilter={setLocFilter} />}
      {activeTab === 'mine'  && <MySchedule days={days} schedule={schedule} person={person} today={today} onDrill={setDrill} />}
      {activeTab === 'open'  && <OpenShifts days={days} schedule={schedule} toast={showToast} />}
      {activeTab === 'build' && <BuildSchedule days={days} schedule={schedule} setSchedule={setSchedule} toast={showToast} weekStartStr={weekStartStr} roster={roster} />}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
