import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useNavigate } from 'react-router-dom'
import DrillDown from '../components/DrillDown.jsx'

/* ──────────────────────────────────────────────────────────────────────────
   MyHome — 100% real data.
   Every value on this screen is served by an existing security-definer RPC on
   the HR brain (fxetuqjryttnypgepsru, schema hr). Nothing is seeded, faked, or read from
   localStorage as a datastore. Where the backend has no rows yet, the screen
   shows an honest empty state instead of inventing numbers.

   RPCs consumed (all pre-existing):
     get_my_home, get_roster, get_gamification_board, get_my_time_entries,
     get_training_overview, get_attendance_overview, get_cockpit_sales,
     get_comms_hub, get_pending_requests, get_week_schedule, get_huddle_tasks,
     get_all_time_entries, benefits_my_summary
   Writes wired to real RPCs:
     clock_in, clock_out, set_huddle_task_complete, broadcast_ack
   ────────────────────────────────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function mondayOf(d) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d)) return '—'
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
function fmtTime(v) {
  // v may be 'HH:MM:SS' or a full timestamp
  if (!v) return ''
  let d
  if (/^\d{1,2}:\d{2}/.test(v)) d = new Date(`2000-01-01T${v}`)
  else d = new Date(v)
  if (isNaN(d)) return String(v)
  const h = d.getHours() % 12 || 12
  return `${h}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`
}
function timeAgo(v) {
  if (!v) return ''
  const then = new Date(v).getTime()
  if (isNaN(then)) return ''
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'Yesterday' : `${d}d ago`
}
const KH_RX = /key|manager|lead|owner|supervisor|director|coo|ceo|assistant/i

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function SL({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>
}

function Empty({ children }) {
  return <div style={{ background: 'var(--t-surface)', border: '1px dashed var(--t-line)', padding: '16px 18px', fontSize: 12, color: 'var(--t-text-muted)' }}>{children}</div>
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = now.getHours() % 12 || 12, m = pad(now.getMinutes()), s = pad(now.getSeconds()), ampm = now.getHours() >= 12 ? 'PM' : 'AM'
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dateStr = `${days[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.02em', fontFamily: 'monospace' }}>{h}:{m}:{s} <span style={{ fontSize: 20, color: 'var(--t-accent)' }}>{ampm}</span></div>
      <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 4 }}>{dateStr}</div>
    </div>
  )
}

// Live "on shift" elapsed / next-shift panel — driven by real punch + schedule.
function ShiftBanner({ punchStatus, punchInAt, nextShift, todayTeam, nav }) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (punchStatus !== 'in' || !punchInAt) return
    const startMs = new Date(punchInAt).getTime()
    const tick = () => {
      if (isNaN(startMs)) { setElapsed('on shift'); return }
      const totalSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60
      setElapsed(`${h}h ${pad(m)}m ${pad(s)}s`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [punchStatus, punchInAt])

  if (punchStatus === 'in') {
    return (
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '20px 24px' }}>
        <div style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid var(--t-success)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 10, height: 10, background: 'var(--t-success)', flexShrink: 0, boxShadow: '0 0 8px var(--t-success)' }} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-success)', textTransform: 'uppercase', marginBottom: 3 }}>YOU ARE CURRENTLY ON SHIFT</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)', fontFamily: 'monospace' }}>{elapsed || 'Calculating…'}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Time elapsed since clock-in{punchInAt ? ` · ${fmtTime(punchInAt)}` : ''}</div>
          </div>
          {todayTeam.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Your team today</div>
              {todayTeam.slice(0, 4).map((t, i) => <div key={i} style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{t.name}</div>)}
            </div>
          )}
          <button onClick={() => nav('/schedule')} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>View Full Schedule</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 12 }}>NEXT SHIFT</div>
      {nextShift ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>Location</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{nextShift.node_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>Shift</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{fmtTime(nextShift.start_time)} – {fmtTime(nextShift.end_time)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>Date</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{(() => { const d = new Date(nextShift.shift_date); return isNaN(d) ? '—' : `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}` })()}</div>
              </div>
            </div>
          </div>
          <button onClick={() => nav('/schedule')} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}>View Full Schedule</button>
        </div>
      ) : (
        <Empty>No upcoming shift is on your published schedule. Check back once the schedule is posted.</Empty>
      )}
    </div>
  )
}

export default function MyHome() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { locationIds, activeLocation } = useScope()
  const person = session?.person
  const myName = person?.full_name || 'Employee'
  const role = person?.role_name || ''
  const initials = myName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Role gate (mirrors Cockpit.jsx pattern)
  const nowH = new Date().getHours()
  const roleName2 = role.toLowerCase()
  const isMgr = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName2.includes(r))
  const isKH = !isMgr && (roleName2.includes('key') || roleName2.includes('holder'))
  const khCanSeeSalesMTD = isMgr || (isKH && nowH >= 12)
  const canSeeSalesDollars = isMgr || (isKH && khCanSeeSalesMTD)

  const weekStart = useMemo(() => iso(mondayOf(new Date())), [])
  const today = useMemo(() => iso(new Date()), [])

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [punchLoading, setPunchLoading] = useState(false)
  const [busyTask, setBusyTask] = useState(null)
  const [drill, setDrill] = useState(null)

  const load = useCallback(async () => {
    const ids = (locationIds && locationIds.length ? locationIds : (getSession().nodes || []).map(n => n.id)).filter(Boolean)
    if (!person?.id) { setLoading(false); return }
    const S = (p) => Promise.resolve(p).then((r) => r).catch((e) => ({ error: e }))
    const [home, roster, board, times, training, attend, sales, comms, pend, sched, tasks, allToday, benefits] = await Promise.all([
      S(sb.rpc('get_my_home', { p_person_id: person.id })),
      S(sb.rpc('get_roster', { p_node_ids: ids, p_actor: person.id })),
      S(sb.rpc('get_gamification_board', { p_node_ids: ids })),
      S(sb.rpc('get_my_time_entries', { p_person_id: person.id, p_node_ids: ids, p_start_date: weekStart, p_end_date: today })),
      S(sb.rpc('get_training_overview', { p_node_ids: ids })),
      S(sb.rpc('get_attendance_overview', { p_node_ids: ids })),
      S(sb.rpc('get_cockpit_sales', { p_node_ids: ids })),
      S(sb.rpc('get_comms_hub', { p_person_id: person.id, p_node_ids: ids })),
      S(sb.rpc('get_pending_requests', { p_node_ids: ids })),
      S(sb.rpc('get_week_schedule', { p_node_ids: ids, p_week_start: weekStart, p_actor: person.id })),
      S(sb.rpc('get_huddle_tasks', { p_node_ids: ids, p_date: today })),
      S(sb.rpc('get_all_time_entries', { p_node_ids: ids, p_date_from: today, p_date_to: today })),
      S(sb.rpc('benefits_my_summary', { p_person_id: person.id })),
    ])
    setData({
      home: home?.data || null,
      roster: Array.isArray(roster?.data) ? roster.data : [],
      board: board?.data || null,
      times: Array.isArray(times?.data) ? times.data : [],
      training: Array.isArray(training?.data) ? training.data : [],
      attend: Array.isArray(attend?.data) ? attend.data : [],
      sales: Array.isArray(sales?.data) ? sales.data : [],
      comms: comms?.data || null,
      pend: pend?.data || null,
      sched: Array.isArray(sched?.data) ? sched.data : [],
      tasks: Array.isArray(tasks?.data) ? tasks.data : [],
      allToday: Array.isArray(allToday?.data) ? allToday.data : [],
      benefits: benefits?.data || null,
    })
    setLoading(false)
  }, [locationIds.join(','), person?.id, weekStart, today])

  useEffect(() => { setLoading(true); load() }, [load])

  /* ── Derived, real values ─────────────────────────────────────────────── */
  const d = data || {}
  const employees = useMemo(() => Array.isArray(d.board?.employees) ? d.board.employees : [], [d.board])
  const myBoard = useMemo(() => employees.find(e => e.id === person?.id) || null, [employees, person?.id])
  const leaderboard = useMemo(() => [...employees].sort((a, b) => (b.points_total || 0) - (a.points_total || 0)), [employees])
  const myRank = useMemo(() => { const i = leaderboard.findIndex(e => e.id === person?.id); return i >= 0 ? i + 1 : null }, [leaderboard, person?.id])

  const myLocation = myBoard?.location
    || activeLocation?.name
    || (d.roster || []).find(r => r.id === person?.id)?.node_name
    || (d.sales || [])[0]?.node_name
    || '—'
  const myNodeId = myBoard?.node_id
    || (d.roster || []).find(r => r.id === person?.id)?.node_id
    || (locationIds && locationIds[0])
    || null

  // Punch status from live time entries (open entry = clocked in).
  const openEntry = useMemo(() => (d.times || []).find(t => t.punched_in_at && !t.punched_out_at) || null, [d.times])
  const punchStatus = openEntry ? 'in' : 'out'
  const punchInAt = openEntry?.punched_in_at || null

  // Hours worked this week.
  const hoursThisWeek = useMemo(() => (d.times || []).reduce((s, t) => s + (Number(t.hours_worked) || 0), 0), [d.times])
  const hoursGoal = 40
  const hoursPct = Math.min(100, Math.round(hoursThisWeek / hoursGoal * 100))

  // Training (mine).
  const myTraining = useMemo(() => (d.training || []).filter(t => t.person_id === person?.id), [d.training, person?.id])
  const trainDue = useMemo(() => myTraining.filter(t => /expired|overdue|expiring|due soon/i.test(String(t.cert_status || ''))).length, [myTraining])
  const trainingPct = myTraining.length ? Math.round((myTraining.length - trainDue) / myTraining.length * 100) : null

  // Attendance (mine).
  const myAttend = useMemo(() => (d.attend || []).find(a => a.person_id === person?.id) || null, [d.attend, person?.id])
  const myIncidents = useMemo(() => Array.isArray(myAttend?.incidents) ? myAttend.incidents : [], [myAttend])
  const attendancePts = useMemo(() => myIncidents.reduce((s, i) => s + (Number(i.pts) || 0), 0), [myIncidents])
  const attendanceScore = myAttend ? Math.max(0, 100 - attendancePts) : null

  // Sales (location scope — gated by role).
  const salesMtd = useMemo(() => (d.sales || []).reduce((s, r) => s + (Number(r.mtd_amount) || 0), 0), [d.sales])
  const salesGoal = useMemo(() => (d.sales || []).reduce((s, r) => s + (Number(r.monthly_goal) || 0), 0), [d.sales])
  const salesPct = salesGoal ? Math.min(100, Math.round(salesMtd / salesGoal * 100)) : 0

  // Gamification (mine).
  const points = Number(myBoard?.points_total || 0)
  const spiffs = Number(myBoard?.spiff_total || 0)
  const streak = myBoard?.streak != null ? Number(myBoard.streak) : (d.home?.streak != null ? Number(d.home.streak) : null)
  const level = points > 0 ? Math.floor(points / 1000) + 1 : null

  // My tasks (huddle tasks assigned to me / unassigned at my node, today).
  const myTasks = useMemo(() => (d.tasks || []).filter(t => t.assignee_id === person?.id || t.assignee_id == null), [d.tasks, person?.id])
  const openTasks = useMemo(() => myTasks.filter(t => !t.is_complete), [myTasks])
  const overdueTasks = useMemo(() => myTasks.filter(t => !t.is_complete && /urgent|high|overdue/i.test(String(t.priority || ''))).length, [myTasks])

  // Schedule-derived shifts.
  const myShifts = useMemo(() => (d.sched || [])
    .filter(r => (r.person_id === person?.id) || (r.full_name === myName))
    .filter(r => r.shift_date && r.shift_date >= today)
    .sort((a, b) => String(a.shift_date).localeCompare(String(b.shift_date))), [d.sched, person?.id, myName, today])
  const nextShift = d.home?.next_shift || myShifts[0] || null
  const todayCrew = useMemo(() => (d.sched || [])
    .filter(r => r.shift_date === today)
    .map(r => ({ name: r.full_name || 'Unknown', role: (r.keyholder_eligible || KH_RX.test(r.role_name || '')) ? 'KH' : 'ASSOC', role_name: r.role_name })), [d.sched, today])

  // Announcements — real, from get_my_home (ids + ack flag) enriched with body from comms feed.
  const commsActivity = useMemo(() => Array.isArray(d.comms?.activity) ? d.comms.activity : [], [d.comms])
  const announcements = useMemo(() => (d.home?.unread_announcements || []).map(a => {
    const act = commsActivity.find(x => x.src === 'announce' && String(x.preview || '').startsWith(a.title))
    const body = act ? String(act.preview || '').slice(a.title.length).replace(/^\s*[—-]\s*/, '') : ''
    return { id: a.id, title: a.title, body, requires_ack: a.requires_ack, date: fmtDate(a.created_at) }
  }), [d.home, commsActivity])

  // Team status (managers) — roster + live open punches today.
  const teamStatus = useMemo(() => (d.roster || []).slice(0, 10).map(r => {
    const isIn = (d.allToday || []).some(t => t.person_id === r.id && t.punched_in_at && !t.punched_out_at)
    return { id: r.id, name: r.full_name, role: KH_RX.test(r.role_name || '') ? 'KH' : 'ASSOC', status: isIn ? 'in' : 'out' }
  }), [d.roster, d.allToday])
  const onFloorCount = teamStatus.filter(t => t.status === 'in').length

  /* ── Writes ───────────────────────────────────────────────────────────── */
  const handlePunch = async () => {
    if (!person?.id) return
    setPunchLoading(true)
    try {
      const fn = punchStatus === 'out' ? 'clock_in' : 'clock_out'
      const { error } = await sb.rpc(fn, { p_person_id: person.id, p_node_id: myNodeId })
      if (error) throw error
      await load()
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Clock action failed. Try again.', type: 'error' } })) } catch {}
    } finally {
      setPunchLoading(false)
    }
  }

  const toggleTask = async (task) => {
    setBusyTask(task.id)
    try {
      const { error } = await sb.rpc('set_huddle_task_complete', { p_id: task.id, p_complete: !task.is_complete })
      if (error) throw error
      await load()
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not update task.', type: 'error' } })) } catch {}
    } finally {
      setBusyTask(null)
    }
  }

  const ackAnnouncement = async (annId) => {
    if (!person?.id || !annId) return
    try {
      const { error } = await sb.rpc('broadcast_ack', { p_announcement_id: annId, p_person_id: person.id })
      if (error) throw error
      await load()
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not acknowledge.', type: 'error' } })) } catch {}
    }
  }

  const now2 = new Date()
  const hour = now2.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  /* ── Forensic drill-down record sets (built from real data) ───────────── */
  const hoursRows = useMemo(() => (d.times || []).map(t => ({
    date: fmtDate(t.work_date), location: t.node_name || myLocation,
    in: fmtTime(t.punched_in_at), out: t.punched_out_at ? fmtTime(t.punched_out_at) : 'Open',
    hours: Number(t.hours_worked) || 0,
  })), [d.times, myLocation])
  const HOURS_COLS = [
    { key: 'date', label: 'Date', value: r => r.date },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'in', label: 'Clock-In', value: r => r.in },
    { key: 'out', label: 'Clock-Out', value: r => r.out },
    { key: 'hours', label: 'Hours', value: r => `${r.hours}h`, align: 'right', sortKey: r => r.hours },
  ]

  const salesRows = useMemo(() => (d.sales || []).map(r => ({
    loc: r.node_name, mtd: Number(r.mtd_amount) || 0, today: Number(r.today_amount) || 0,
    txns: Number(r.today_txns) || 0, units: Number(r.today_units) || 0,
  })), [d.sales])
  const SALES_COLS = [
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'mtd', label: 'Sales MTD', value: r => `$${r.mtd.toLocaleString()}`, align: 'right', sortKey: r => r.mtd },
    { key: 'today', label: 'Today', value: r => `$${r.today.toLocaleString()}`, align: 'right', sortKey: r => r.today },
    { key: 'txns', label: 'Txns Today', value: r => r.txns, align: 'right', sortKey: r => r.txns },
    { key: 'units', label: 'Units Today', value: r => r.units, align: 'right', sortKey: r => r.units },
  ]

  const attendanceRows = useMemo(() => myIncidents.map(i => ({
    date: fmtDate(i.date), type: i.type || '—', pts: Number(i.pts) || 0,
  })), [myIncidents])
  const ATTEND_COLS = [
    { key: 'date', label: 'Date', value: r => r.date },
    { key: 'type', label: 'Event', value: r => r.type },
    { key: 'pts', label: 'Points', value: r => r.pts, align: 'right', sortKey: r => r.pts },
  ]

  const trainingRows = useMemo(() => myTraining.map(t => ({
    module: t.module, status: t.cert_status || '—', score: t.score != null ? `${t.score}%` : '—',
    expires: t.cert_expires ? fmtDate(t.cert_expires) : '—', sortScore: Number(t.score) || 0,
  })), [myTraining])
  const TRAIN_COLS = [
    { key: 'module', label: 'Module', value: r => r.module },
    { key: 'status', label: 'Status', value: r => r.status },
    { key: 'score', label: 'Score', value: r => r.score, align: 'right', sortKey: r => r.sortScore },
    { key: 'expires', label: 'Expires', value: r => r.expires },
  ]

  const taskRows = useMemo(() => myTasks.map(t => ({
    title: t.description, due: t.due_label || '—', pri: t.priority || '—',
    status: t.is_complete ? 'Complete' : 'Open',
  })), [myTasks])
  const TASK_COLS = [
    { key: 'title', label: 'Task', value: r => r.title },
    { key: 'due', label: 'Due', value: r => r.due },
    { key: 'pri', label: 'Priority', value: r => r.pri },
    { key: 'status', label: 'Status', value: r => r.status },
  ]

  const ptoLeave = d.benefits?.leave || null
  const ptoRows = useMemo(() => {
    if (!ptoLeave) return []
    const accrued = Number(ptoLeave.accrued_hours) || 0
    const used = Number(ptoLeave.used_hours) || 0
    return [
      { type: 'Accrued', hours: accrued, status: 'Balance' },
      { type: 'Used', hours: used, status: 'Balance' },
      { type: 'Remaining', hours: accrued - used, status: 'Available' },
    ]
  }, [ptoLeave])
  const PTO_COLS = [
    { key: 'type', label: 'Type', value: r => r.type },
    { key: 'hours', label: 'Hours', value: r => `${r.hours}h`, align: 'right', sortKey: r => r.hours },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const ptoRemaining = ptoLeave ? (Number(ptoLeave.accrued_hours) || 0) - (Number(ptoLeave.used_hours) || 0) : null

  const rankRows = useMemo(() => leaderboard.map((e, i) => ({
    rank: i + 1, name: e.id === person?.id ? `${e.display_name || e.full_name} (me)` : (e.display_name || e.full_name),
    points: Number(e.points_total) || 0, streak: Number(e.streak) || 0, spiffs: Number(e.spiff_total) || 0,
  })), [leaderboard, person?.id])
  const RANK_COLS = [
    { key: 'rank', label: 'Rank', value: r => `#${r.rank}`, align: 'right', sortKey: r => r.rank },
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'points', label: 'XP Points', value: r => r.points.toLocaleString(), align: 'right', sortKey: r => r.points },
    { key: 'streak', label: 'Streak', value: r => `${r.streak}d`, align: 'right', sortKey: r => r.streak },
    { key: 'spiffs', label: 'Spiffs', value: r => `$${r.spiffs.toLocaleString()}`, align: 'right', sortKey: r => r.spiffs },
  ]

  const openDrill = (title, rows, columns, accent, subtitle) => setDrill({
    title, subtitle: subtitle || `${rows.length} record${rows.length === 1 ? '' : 's'} behind this metric`, rows, columns, accent,
  })

  const QUICK_LINKS = [
    { label: 'Clock In/Out', icon: '⏱', path: '/time-clock' },
    { label: 'My Schedule', icon: '📅', path: '/schedule' },
    { label: 'Request Time Off', icon: '🏖', path: '/requests' },
    { label: 'My Training', icon: '🎓', path: '/training' },
    { label: 'Compliments', icon: '⭐', path: '/compliments' },
    { label: 'My Docs', icon: '📄', path: '/my-docs' },
    { label: 'Pay/Direct Deposit', icon: '💳', path: '/direct-deposit' },
    { label: 'Goals', icon: '🎯', path: '/goals' },
  ]

  /* ── Pending actions (real) ───────────────────────────────────────────── */
  const pendingItems = []
  announcements.filter(a => a.requires_ack).forEach(a => pendingItems.push({
    id: `ack-${a.id}`, icon: '📋', border: 'var(--t-accent)', color: 'var(--t-accent)',
    title: a.title, note: 'Policy acknowledgment required', label: 'Acknowledge', onClick: () => ackAnnouncement(a.id),
  }))
  myTraining.filter(t => /expired|overdue/i.test(String(t.cert_status || ''))).forEach(t => pendingItems.push({
    id: `trn-${t.module}`, icon: '🎓', border: 'var(--t-warn)', color: 'var(--t-warn)',
    title: t.module, note: 'Training certification overdue', label: 'Start', onClick: () => nav('/training'),
  }))
  if ((d.home?.open_requests?.time_off_count || 0) > 0) pendingItems.push({
    id: 'pto', icon: '🏖', border: 'var(--t-warn)', color: 'var(--t-warn)',
    title: `${d.home.open_requests.time_off_count} time-off request(s) awaiting approval`, note: 'Time off pending', label: 'View', onClick: () => nav('/requests'),
  })
  if ((d.home?.open_requests?.swap_count || 0) > 0) pendingItems.push({
    id: 'swap', icon: '🔄', border: 'var(--t-accent)', color: 'var(--t-accent)',
    title: `${d.home.open_requests.swap_count} shift swap request(s) pending`, note: 'Swap pending', label: 'View', onClick: () => nav('/schedule'),
  })
  if (isMgr) {
    const to = Array.isArray(d.pend?.time_off) ? d.pend.time_off : []
    if (to.length) pendingItems.push({
      id: 'mgr-pto', icon: '✅', border: 'var(--t-danger)', color: 'var(--t-danger)',
      title: `${to.length} team time-off request(s) to review`, note: 'Awaiting your approval', label: 'Review', onClick: () => nav('/requests'),
    })
    const sw = Array.isArray(d.pend?.shift_swaps) ? d.pend.shift_swaps : []
    if (sw.length) pendingItems.push({
      id: 'mgr-swap', icon: '🔄', border: 'var(--t-warn)', color: 'var(--t-warn)',
      title: `${sw.length} team shift swap(s) to review`, note: 'Awaiting your approval', label: 'Review', onClick: () => nav('/schedule'),
    })
  }

  const notifCount = (d.home?.unread_announcements?.length || 0) + (Number(d.comms?.unread_dms) || 0)

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: 'var(--t-bg)', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Loading your dashboard…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: '100%', background: 'var(--t-bg)' }}>

      {/* HERO HEADER */}
      <div style={{ background: 'linear-gradient(135deg,#0a1628 0%,#0d1f3c 50%,#060e1a 100%)', borderBottom: '1px solid var(--t-line)', padding: '24px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, background: 'var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#000', flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>{greeting}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)' }}>{myName}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{role || '—'} · {myLocation}</div>
        </div>
        <Clock />
      </div>

      {/* SHIFT BANNER (real punch / next shift) */}
      <ShiftBanner punchStatus={punchStatus} punchInAt={punchInAt} nextShift={nextShift} todayTeam={todayCrew.filter(t => t.name !== myName)} nav={nav} />

      {/* PUNCH CLOCK HERO */}
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Time Clock</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: punchStatus === 'in' ? 'var(--t-success)' : 'var(--t-danger)', boxShadow: punchStatus === 'in' ? '0 0 8px var(--t-success)' : undefined }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>
              {punchStatus === 'in' ? `Clocked In${punchInAt ? ` · ${fmtTime(punchInAt)}` : ''}` : 'Not Clocked In'}
            </span>
          </div>
          {punchStatus === 'in' && punchInAt && (
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>Session started {fmtTime(punchInAt)}</div>
          )}
        </div>
        <button onClick={handlePunch} disabled={punchLoading || !myNodeId} style={{
          background: punchStatus === 'out' ? 'var(--t-success)' : 'var(--t-danger)',
          color: '#000', border: 'none', padding: '12px 28px', fontSize: 14, fontWeight: 900, cursor: (punchLoading || !myNodeId) ? 'not-allowed' : 'pointer',
          opacity: (punchLoading || !myNodeId) ? 0.7 : 1, letterSpacing: '.05em',
        }}>
          {punchLoading ? '…' : punchStatus === 'out' ? 'CLOCK IN' : 'CLOCK OUT'}
        </button>
        <button onClick={() => nav('/time-clock')} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '12px 18px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          Full Timecard
        </button>
      </div>

      {/* WHO YOU'RE WORKING WITH TODAY */}
      <div style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 10 }}>
          YOUR TEAM TODAY · {fmtDate(today)}
        </div>
        {todayCrew.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayCrew.map((emp, i) => (
              <div key={`${emp.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px',
                  background: emp.role === 'KH' ? 'rgba(0,229,255,0.15)' : 'rgba(52,199,89,0.15)',
                  color: emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)',
                  border: `1px solid ${emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)'}`,
                  minWidth: 40, textAlign: 'center', flexShrink: 0,
                }}>{emp.role}</span>
                <span style={{ fontSize: 13, fontWeight: emp.name === myName ? 800 : 500, color: emp.name === myName ? 'var(--t-text)' : 'var(--t-text-muted)' }}>{emp.name}</span>
                {emp.name === myName && <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>← you</span>}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No shifts are published for today at your location{myLocation !== '—' ? ` (${myLocation})` : ''}.</Empty>
        )}
      </div>

      {/* MY STATS KPI PANEL */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--t-line)', background: '#080d18' }}>
        <SL>MY STATS THIS WEEK</SL>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8, marginBottom: 16 }}>
          <KTile label="Hours This Week" value={`${hoursThisWeek}h`} sub={`of ${hoursGoal}h goal`} color={hoursThisWeek >= hoursGoal ? 'var(--t-success)' : 'var(--t-text)'} onClick={() => openDrill('Hours This Week — Day by Day', hoursRows, HOURS_COLS, 'var(--t-accent)')} />
          <KTile
            label="Sales MTD"
            value={
              !salesGoal ? '—'
                : isMgr ? `$${(salesMtd / 1000).toFixed(1)}k`
                  : isKH && khCanSeeSalesMTD
                    ? (() => { const gap = Math.max(0, salesGoal - salesMtd); return gap > 0 ? `${salesPct}% — Need $${(gap / 1000).toFixed(1)}k` : `${salesPct}% ✓` })()
                    : isKH ? 'Available after 12PM' : '—'
            }
            sub={isMgr && salesGoal ? `${salesPct}% of goal` : undefined}
            color={salesPct >= 90 ? 'var(--t-success)' : salesPct >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'}
            onClick={canSeeSalesDollars && salesRows.length ? () => openDrill('Sales — By Location', salesRows, SALES_COLS, 'var(--t-success)') : undefined}
          />
          <KTile label="Attendance" value={attendanceScore != null ? `${attendanceScore}%` : '—'} sub={attendanceScore != null ? 'last 30 days' : 'no records'} color={attendanceScore == null ? 'var(--t-text-muted)' : attendanceScore >= 95 ? 'var(--t-success)' : 'var(--t-warn)'} onClick={myIncidents.length ? () => openDrill('Attendance — Incidents', attendanceRows, ATTEND_COLS, 'var(--t-success)') : undefined} />
          <KTile label="Training" value={trainingPct != null ? `${trainingPct}%` : '—'} sub={trainingPct != null ? `${trainDue} module${trainDue !== 1 ? 's' : ''} due` : 'no modules'} alert={trainDue > 0 ? 'amber' : null} color='var(--t-text)' onClick={myTraining.length ? () => openDrill('Training Modules', trainingRows, TRAIN_COLS, 'var(--t-warn)') : undefined} />
          <KTile label="PTO Balance" value={ptoRemaining != null ? `${ptoRemaining}h` : '—'} sub={ptoRemaining != null ? 'available' : 'no balance on file'} color='var(--t-accent)' onClick={ptoRows.length ? () => openDrill('PTO Balance — Ledger', ptoRows, PTO_COLS, 'var(--t-accent)') : undefined} />
          <KTile label="Spiffs Earned" value={isMgr ? `$${spiffs.toLocaleString()}` : '—'} sub={isMgr ? 'year to date' : 'manager view'} color='var(--t-success)' onClick={isMgr && canSeeSalesDollars && salesRows.length ? () => openDrill('Sales Driving Spiffs — By Location', salesRows, SALES_COLS, 'var(--t-success)') : undefined} />
          <KTile label="Open Tasks" value={openTasks.length} sub={`${overdueTasks} high priority`} alert={overdueTasks > 0 ? 'red' : null} color={overdueTasks > 0 ? 'var(--t-danger)' : 'var(--t-text)'} onClick={myTasks.length ? () => openDrill('My Tasks', taskRows, TASK_COLS, 'var(--t-danger)') : undefined} />
          <KTile label="Team Rank" value={myRank != null ? `#${myRank}` : '—'} sub={leaderboard.length ? `of ${leaderboard.length}` : 'no ranking'} color='var(--t-accent)' onClick={leaderboard.length ? () => openDrill('Team Rank — Leaderboard', rankRows, RANK_COLS, 'var(--t-accent)') : undefined} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>HOURS PROGRESS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }}>{hoursThisWeek}h</span>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>/ {hoursGoal}h</span>
            </div>
            <div style={{ background: 'var(--t-surface-2)', height: 8, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${hoursPct}%`, background: hoursPct >= 100 ? 'var(--t-success)' : hoursPct >= 75 ? 'var(--t-accent)' : 'var(--t-warn)', transition: 'width .5s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4 }}>{hoursPct}% complete</div>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>SALES PROGRESS</div>
            {canSeeSalesDollars && salesGoal ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }}>
                    {isMgr ? `$${(salesMtd / 1000).toFixed(1)}k` : `${salesPct}%`}
                  </span>
                  {isMgr && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>/ ${(salesGoal / 1000).toFixed(1)}k</span>}
                </div>
                <div style={{ background: 'var(--t-surface-2)', height: 8, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${salesPct}%`, background: salesPct >= 90 ? 'var(--t-success)' : salesPct >= 70 ? 'var(--t-accent)' : 'var(--t-warn)', transition: 'width .5s' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4 }}>
                  {isMgr ? `${salesPct}% to monthly goal`
                    : (() => { const gap = Math.max(0, salesGoal - salesMtd); return gap > 0 ? `${salesPct}% complete — Need $${gap.toLocaleString()} more` : 'Goal reached!' })()}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '12px 0' }}>
                {!salesGoal ? 'No sales goal on file for your location' : isKH ? 'Sales data available after 12:00 PM' : '—'}
              </div>
            )}
          </div>
        </div>

        <SL>GAMIFICATION</SL>
        {points > 0 || streak != null || myRank != null ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
            <KTile label="XP Points" value={points.toLocaleString()} sub="total earned" color='#c084fc' onClick={leaderboard.length ? () => openDrill('XP Points — Leaderboard', rankRows, RANK_COLS, '#c084fc') : undefined} />
            <KTile label="Level" value={level != null ? level : '—'} sub={level != null ? `${points % 1000}/1000 to next` : 'earn points'} color='#c084fc' />
            <KTile label="Login Streak" value={streak != null ? `${streak}d` : '—'} sub={streak != null ? 'keep it going' : 'no streak yet'} color='var(--t-warn)' />
            <KTile label="Team Rank" value={myRank != null ? `#${myRank}` : '—'} sub={myRank != null && leaderboard.length ? `top ${Math.max(1, Math.round(myRank / leaderboard.length * 100))}%` : '—'} color='var(--t-accent)' onClick={leaderboard.length ? () => openDrill('Team Rank — Leaderboard', rankRows, RANK_COLS, 'var(--t-accent)') : undefined} />
          </div>
        ) : (
          <Empty>No points earned yet. Complete shifts, training, and recognitions to climb the leaderboard.</Empty>
        )}
      </div>

      {/* PENDING ACTIONS */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--t-line)' }}>
        <SL>MY PENDING ACTIONS</SL>
        {pendingItems.length === 0 ? (
          <div style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid var(--t-success)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, color: 'var(--t-success)' }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-success)' }}>All caught up</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingItems.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '12px 14px', borderLeft: `3px solid ${p.border}` }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{p.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{p.note}</div>
                </div>
                <button onClick={p.onClick} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: p.color, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                  {p.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* UPCOMING SHIFTS */}
        <div>
          <SL>MY UPCOMING SHIFTS</SL>
          {myShifts.length > 0 ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
              {myShifts.slice(0, 6).map((s, i) => {
                const dt = new Date(s.shift_date)
                const isToday = s.shift_date === today
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderBottom: i < Math.min(6, myShifts.length) - 1 ? '1px solid var(--t-line)' : undefined, background: isToday ? 'rgba(0,229,255,.05)' : undefined }}>
                    <div style={{ textAlign: 'center', minWidth: 44, flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700 }}>{isNaN(dt) ? '' : DOW[dt.getDay()].toUpperCase()}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? 'var(--t-accent)' : 'var(--t-text)' }}>{isNaN(dt) ? '—' : dt.getDate()}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{s.node_name || myLocation} · {s.role_name || role}</div>
                    </div>
                    {isToday && <span className="badge blue" style={{ fontSize: 9 }}>Today</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty>No upcoming shifts on your published schedule.</Empty>
          )}
          <button onClick={() => nav('/schedule')} style={{ width: '100%', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '8px', fontSize: 11, cursor: 'pointer', marginTop: 6, fontWeight: 600 }}>View Full Schedule →</button>
        </div>

        {/* ANNOUNCEMENTS */}
        <div>
          <SL>ANNOUNCEMENTS</SL>
          {announcements.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {announcements.map(a => (
                <div key={a.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', flex: 1, marginRight: 8 }}>{a.title}</div>
                    {a.requires_ack && <span className="badge amber" style={{ fontSize: 9, flexShrink: 0 }}>ACK</span>}
                  </div>
                  {a.body && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 4 }}>{a.body}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{a.date}</div>
                    {a.requires_ack && (
                      <button onClick={() => ackAnnouncement(a.id)} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-accent)', padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>Acknowledge</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No unread announcements. You're all caught up.</Empty>
          )}
        </div>

      </div>

      {/* TEAM STATUS (managers only) */}
      {isMgr && (
        <div style={{ padding: '0 24px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SL>TODAY'S SHIFT STATUS · {onFloorCount} on floor</SL>
            <button onClick={() => nav('/time-clock')} style={{ background: 'transparent', border: 'none', color: 'var(--t-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>View Live Floor →</button>
          </div>
          {teamStatus.length > 0 ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
              {teamStatus.map((emp, i) => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < teamStatus.length - 1 ? '1px solid var(--t-line)' : undefined }}>
                  <div style={{ width: 9, height: 9, background: emp.status === 'in' ? 'var(--t-success)' : 'var(--t-danger)', flexShrink: 0, boxShadow: emp.status === 'in' ? '0 0 6px var(--t-success)' : undefined }} />
                  <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{emp.name}</span></div>
                  <span style={{ fontSize: 11, color: emp.status === 'in' ? 'var(--t-success)' : 'var(--t-text-muted)', fontWeight: 600 }}>{emp.status === 'in' ? 'On Floor' : 'Off Shift'}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    background: emp.role === 'KH' ? 'rgba(0,229,255,0.12)' : 'rgba(52,199,89,0.12)',
                    color: emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)',
                    border: `1px solid ${emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)'}`,
                    minWidth: 40, textAlign: 'center', flexShrink: 0,
                  }}>{emp.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No roster is available for your location scope.</Empty>
          )}
        </div>
      )}

      {/* RECENT ACTIVITY / NOTIFICATIONS */}
      <div style={{ padding: '0 24px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SL>RECENT ACTIVITY</SL>
          <button onClick={() => nav('/notifications')} style={{ background: 'transparent', border: 'none', color: 'var(--t-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
            View All {notifCount > 0 ? `(${notifCount})` : ''} →
          </button>
        </div>
        {commsActivity.length > 0 ? (
          commsActivity.slice(0, 5).map((n, i) => {
            const border = n.src === 'announce' ? 'var(--t-accent)' : 'var(--t-warn)'
            const icon = n.src === 'announce' ? '📢' : n.src === 'dm' ? '💬' : '🔔'
            return (
              <div key={i} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 6, display: 'flex', gap: 12, padding: '12px 14px', borderLeft: `3px solid ${border}`, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', lineHeight: 1.4 }}>{n.preview || n.sender || 'Activity'}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{n.sender ? `${n.sender} · ` : ''}{timeAgo(n.at)}</div>
                </div>
              </div>
            )
          })
        ) : (
          <Empty>No recent activity.</Empty>
        )}
      </div>

      {/* QUICK LINKS */}
      <div style={{ padding: '0 24px 20px' }}>
        <SL>QUICK ACCESS</SL>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_LINKS.map(({ label, icon, path }) => (
            <button key={label} onClick={() => nav(path)} style={{
              background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 10px',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              color: 'var(--t-text)', fontFamily: 'inherit',
            }}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textAlign: 'center', letterSpacing: '.04em' }}>{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* MY TASKS */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SL>MY TASKS</SL>
          <button onClick={() => nav('/tasks')} style={{ background: 'transparent', border: 'none', color: 'var(--t-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>View All →</button>
        </div>
        {myTasks.length > 0 ? (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            {myTasks.slice(0, 6).map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < Math.min(6, myTasks.length) - 1 ? '1px solid var(--t-line)' : undefined, opacity: t.is_complete ? 0.55 : 1 }}>
                <button onClick={() => toggleTask(t)} disabled={busyTask === t.id} title={t.is_complete ? 'Mark incomplete' : 'Mark complete'} style={{ width: 16, height: 16, border: `2px solid ${t.is_complete ? 'var(--t-success)' : 'var(--t-line)'}`, background: t.is_complete ? 'var(--t-success)' : 'transparent', flexShrink: 0, cursor: busyTask === t.id ? 'wait' : 'pointer', padding: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', textDecoration: t.is_complete ? 'line-through' : undefined }}>{t.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{t.assignee_name ? `${t.assignee_name} · ` : ''}Due {t.due_label || '—'}</div>
                </div>
                {t.priority && <span className={`badge ${/urgent/i.test(t.priority) ? 'red' : /high/i.test(t.priority) ? 'amber' : 'blue'}`} style={{ fontSize: 9 }}>{t.priority}</span>}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No tasks assigned to you today.</Empty>
        )}
      </div>

      {/* LEADERBOARD */}
      <div style={{ padding: '0 24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SL>TEAM LEADERBOARD PREVIEW</SL>
          <button onClick={() => nav('/leaderboards')} style={{ background: 'transparent', border: 'none', color: 'var(--t-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Full Board →</button>
        </div>
        {leaderboard.length > 0 ? (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Rank', 'Name', 'XP Points', 'Streak', 'Spiffs'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 6).map((e, i) => {
                  const isMine = e.id === person?.id
                  const nm = e.display_name || e.full_name
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--t-line)', background: isMine ? 'rgba(0,229,255,.05)' : undefined }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c2e' : 'var(--t-text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: isMine ? 700 : 500, color: isMine ? 'var(--t-accent)' : 'var(--t-text)' }}>
                        {nm}{isMine ? ' (me)' : ''}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#c084fc', fontWeight: 700 }}>{(Number(e.points_total) || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--t-text)' }}>{Number(e.streak) || 0}d</td>
                      <td style={{ padding: '8px 12px', color: 'var(--t-success)', fontWeight: 700 }}>
                        {isMgr ? `$${(Number(e.spiff_total) || 0).toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No leaderboard data for your location scope yet.</Empty>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
