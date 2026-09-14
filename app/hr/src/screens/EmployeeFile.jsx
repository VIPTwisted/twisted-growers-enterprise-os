import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtT = (t) => (t ? String(t).slice(0, 5) : '')
const money = (v) => (v == null || isNaN(v) ? '—' : `$${Number(v).toLocaleString()}`)

function tenure(hireDate) {
  if (!hireDate) return '—'
  const diff = Date.now() - new Date(hireDate).getTime()
  const days = Math.floor(diff / 86400000)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  if (years === 0) return `${months}mo`
  return `${years}yr ${months}mo`
}

function initials(name = '') {
  return name.split(' ').map((p) => p[0] || '').join('').toUpperCase().slice(0, 2)
}

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHRRole = (r = '') => HR_ROLES.some((k) => r.toLowerCase().includes(k))

const RISK_COLOR = {
  critical: 'var(--t-danger)',
  high:     'var(--t-warn)',
  medium:   'var(--t-accent)',
  low:      'var(--t-success)',
}
const RISK_BADGE = {
  critical: 'badge red',
  high:     'badge amber',
  medium:   'badge blue',
  low:      'badge green',
}
const STATUS_BADGE = {
  active:     'badge green',
  leave:      'badge amber',
  terminated: 'badge red',
}
const STATUS_LABEL = {
  active:     'Active',
  leave:      'On Leave',
  terminated: 'Terminated',
}
const DA_TYPE_BADGE = {
  'Verbal Warning':      'badge blue',
  'Written Warning':     'badge amber',
  'Final Warning':       'badge red',
  'Suspension (Paid)':   'badge amber',
  'Suspension (Unpaid)': 'badge red',
  'PIP':                 'badge purple',
  'Termination':         'badge red',
}
const ATTEND_COLOR = {
  present: 'var(--t-success)',
  late:    'var(--t-warn)',
  callout: 'var(--t-danger)',
  ncns:    '#7f0000',
  off:     'var(--t-surface-2)',
}
const DA_TYPES = ['Verbal Warning', 'Written Warning', 'Final Warning', 'Suspension (Paid)', 'Suspension (Unpaid)', 'PIP', 'Termination']

/* ─────────────────────────────────────────────────────────────────────────────
   REAL-DATA TRANSFORMERS
   Every function below maps a live RPC row shape onto the shape the existing
   render markup expects — so the design is untouched while the data is real.
───────────────────────────────────────────────────────────────────────────── */
const INC_STATUS = { tardy: 'late', callout: 'callout', ncns: 'ncns' }
const incStatus = (t) => INC_STATUS[String(t || '').toLowerCase()] || 'present'
const isAbsence = (s) => s === 'callout' || s === 'ncns'

// Build a 30-day attendance log by joining published shifts with attendance incidents.
function buildAttendance(scheduleRows, incidents) {
  const now = new Date()
  const start = new Date(); start.setDate(start.getDate() - 29)
  const inWindow = (iso) => { const d = new Date(iso); return d >= start && d <= now }
  const incByDate = {}
  ;(incidents || []).forEach((i) => { incByDate[String(i.date).slice(0, 10)] = i })

  const byDate = {}
  ;(scheduleRows || []).forEach((s) => {
    const d = String(s.shift_date).slice(0, 10)
    if (!inWindow(d)) return
    const inc = incByDate[d]
    byDate[d] = {
      date: d,
      shift: (s.start_time || s.end_time) ? `${fmtT(s.start_time)}–${fmtT(s.end_time)}` : '—',
      status: inc ? incStatus(inc.type) : 'present',
      minutes_late: 0,
      reason: '—',
      logged_by: '—',
    }
  })
  ;(incidents || []).forEach((i) => {
    const d = String(i.date).slice(0, 10)
    if (!inWindow(d) || byDate[d]) return
    byDate[d] = { date: d, shift: '—', status: incStatus(i.type), minutes_late: 0, reason: '—', logged_by: '—' }
  })
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

function attendanceStats(rows, incidents) {
  const now = new Date()
  const start = new Date(); start.setDate(start.getDate() - 29)
  const within30 = (incidents || []).filter((i) => { const d = new Date(i.date); return d >= start && d <= now })
  const callouts_30d = within30.filter((i) => incStatus(i.type) === 'callout').length
  const ncns_30d     = within30.filter((i) => incStatus(i.type) === 'ncns').length
  const lates_30d    = within30.filter((i) => incStatus(i.type) === 'late').length

  const scheduled = rows.filter((r) => r.shift !== '—')
  const absentScheduled = scheduled.filter((r) => isAbsence(r.status)).length
  const attendance_rate = scheduled.length
    ? Math.round(((scheduled.length - absentScheduled) / scheduled.length) * 1000) / 10
    : null

  // perfect weeks over last 4 weeks (a week with a scheduled shift and no absence)
  let perfect_weeks = 0
  for (let w = 0; w < 4; w++) {
    const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - w * 7)
    const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6)
    const inWk = rows.filter((r) => { const d = new Date(r.date); return d >= wStart && d <= wEnd })
    const sched = inWk.filter((r) => r.shift !== '—')
    if (sched.length && !inWk.some((r) => isAbsence(r.status))) perfect_weeks++
  }

  // clean streak: days since the most recent absence incident
  const absDates = (incidents || [])
    .filter((i) => isAbsence(incStatus(i.type)))
    .map((i) => new Date(i.date).getTime())
    .sort((a, b) => b - a)
  const streak_days = absDates.length
    ? Math.floor((Date.now() - absDates[0]) / 86400000)
    : null

  return { callouts_30d, ncns_30d, lates_30d, attendance_rate, perfect_weeks, streak_days }
}

function transformTraining(list) {
  return (list || []).map((t, i) => ({
    id: t.id || `t${i}`,
    course: t.module || t.name || t.title || 'Course',
    status: t.status || 'not_started',
    progress: t.status === 'completed' ? 100 : (t.progress ?? 0),
    score: t.score ?? null,
    completed_date: t.completed_at || null,
    attempts: t.attempts ?? (t.status === 'completed' ? 1 : 0),
  }))
}

function transformDA(r, i) {
  const resolved = r.status === 'resolved' || r.status === 'closed'
  return {
    id: r.id || `da${i}`,
    type: r.type || 'Written Warning',
    date: r.issued_date || r.date || null,
    issued_by: r.issued_by_name || r.issued_by || '—',
    violation: r.description || '—',
    corrective: r.corrective_action || r.corrective || '—',
    follow_up: r.follow_up_date || r.follow_up || '—',
    status: resolved ? 'closed' : 'open',
    resolution: resolved ? (r.resolution || r.resolution_notes || 'Resolved.') : null,
  }
}

function transformReview(r, i) {
  return {
    id: r.id || `rv${i}`,
    period: r.period || '—',
    reviewer: r.reviewer_name || '—',
    date: r.created_at || r.review_date || null,
    overall_score: Number(r.overall_score) || 0,
    categories: (r.scores && typeof r.scores === 'object') ? r.scores : {},
    comments: (r.notes && typeof r.notes === 'object')
      ? (r.notes.overall || r.notes.summary || '')
      : (typeof r.notes === 'string' ? r.notes : ''),
    status: r.status || 'draft',
  }
}

function transformDocument(d, i) {
  return {
    id: d.id || `d${i}`,
    name: d.name || d.title || d.doc_type || d.type || 'Document',
    type: d.type || d.doc_type || 'Document',
    date: d.date || d.created_at || d.filed_at || d.assigned_at || null,
    filed_by: d.filed_by || d.filed_by_name || '—',
    status: d.status || 'on file',
    url: d.url || d.file_url || null,
  }
}

// Derive a real activity history by merging live discipline / review / training /
// attendance records — no fabricated events.
function buildHistory(das, reviews, training, incidents) {
  const out = []
  das.forEach((d) => out.push({
    id: `h-da-${d.id}`, date: d.date, type: 'Disciplinary',
    description: `${d.type} issued — ${d.violation}`, changed_by: d.issued_by,
  }))
  reviews.forEach((r) => out.push({
    id: `h-rv-${r.id}`, date: r.date, type: 'Review',
    description: `${r.period} performance review — score ${r.overall_score.toFixed(1)}/5`, changed_by: r.reviewer,
  }))
  training.filter((t) => t.status === 'completed' && t.completed_date).forEach((t) => out.push({
    id: `h-tr-${t.id}`, date: t.completed_date, type: 'Training',
    description: `Completed: ${t.course}${t.score != null ? ` (score ${t.score}%)` : ''}`, changed_by: 'System',
  }))
  ;(incidents || []).slice(0, 20).forEach((inc, i) => {
    const s = incStatus(inc.type)
    if (s === 'present') return
    out.push({
      id: `h-att-${i}-${inc.date}`, date: String(inc.date).slice(0, 10), type: 'Attendance',
      description: s === 'ncns' ? 'NCNS — no-call no-show on scheduled shift'
        : s === 'callout' ? 'Callout on scheduled shift' : 'Late arrival on scheduled shift',
      changed_by: 'System',
    })
  })
  return out.filter((e) => e.date).sort((a, b) => new Date(b.date) - new Date(a.date))
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLE TOKENS (shared)
───────────────────────────────────────────────────────────────────────────── */
const card = {
  background:  'var(--t-surface)',
  border:      '1px solid var(--t-line)',
  borderRadius: 8,
  padding:     20,
}
const cardSm = { ...card, padding: 14 }
const label12 = { fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }
const val18 = { fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }
const val24 = { fontSize: 24, fontWeight: 900, color: 'var(--t-text)' }
const sub11  = { fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th  = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', letterSpacing: '0.05em', textTransform: 'uppercase' }
const td0 = { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', verticalAlign: 'middle' }
const inp = { width: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 6, color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }

const emptyBox = (msg) => (
  <div style={{ ...card, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13, padding: 32 }}>{msg}</div>
)

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function KpiCell({ label, value, sub, accent }) {
  return (
    <div style={{ ...cardSm, display:'flex', flexDirection:'column', gap:2, minWidth:110 }}>
      <div style={label12}>{label}</div>
      <div style={{ ...val18, color: accent || 'var(--t-text)' }}>{value}</div>
      {sub && <div style={sub11}>{sub}</div>}
    </div>
  )
}

function StarRating({ score }) {
  const full  = Math.floor(score)
  const half  = score % 1 >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  return (
    <span style={{ fontSize: 15, color: 'var(--t-warn)' }}>
      {'★'.repeat(Math.max(0, full))}
      {half ? '½' : ''}
      {'☆'.repeat(Math.max(0, empty))}
      <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 6 }}>{score.toFixed(1)}</span>
    </span>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 8, background: 'var(--t-surface-2)', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${Math.min(pct || 0, 100)}%`, height: '100%', background: color || 'var(--t-accent)', borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  )
}

function ActionBtn({ children, color, onClick }) {
  const [hov, setHov] = useState(false)
  const bg = color || 'var(--t-surface-2)'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6,
        border: `1px solid var(--t-line)`, cursor: 'pointer',
        background: hov ? (color || 'var(--t-accent)') : bg,
        color: hov ? (color ? '#fff' : 'var(--t-surface)') : 'var(--t-text)',
        transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

function TabBtn({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
        border: 'none', cursor: 'pointer', background: 'transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
        borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
        whiteSpace: 'nowrap', transition: 'all 0.15s',
      }}
    >
      {label}
      {count != null && (
        <span style={{ marginLeft: 6, fontSize: 11, background: active ? 'var(--t-accent)' : 'var(--t-surface-2)', color: active ? 'var(--t-surface)' : 'var(--t-text-muted)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>
          {count}
        </span>
      )}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 1 — OVERVIEW
───────────────────────────────────────────────────────────────────────────── */
function TabOverview({ emp, activity }) {
  const TYPE_DOT = {
    Disciplinary: 'var(--t-danger)',
    Review:       'var(--t-accent)',
    Training:     'var(--t-success)',
    Attendance:   'var(--t-warn)',
    HR:           'var(--t-text-muted)',
  }
  const attRate = emp.attendance_rate
  const attColor = attRate == null ? 'var(--t-text-muted)' : attRate >= 90 ? 'var(--t-success)' : attRate >= 80 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      {/* Employee Info */}
      <div style={{ ...card, gridColumn:'1 / -1' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Contact & Profile</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {[
            ['Email',            emp.email || emp.login_id],
            ['Phone',            emp.phone],
            ['Address',          emp.address],
            ['Emergency Contact',emp.emergency_name ? `${emp.emergency_name}${emp.emergency_rel ? ` (${emp.emergency_rel})` : ''}` : null],
            ['Emergency Phone',  emp.emergency_phone],
            ['Schedule Notes',   emp.schedule_notes],
          ].map(([k,v]) => (
            <div key={k}>
              <div style={label12}>{k}</div>
              <div style={{ fontSize:13, color:'var(--t-text)' }}>{v || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance Summary */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Attendance — 30 Days</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            ['Attendance Rate', attRate == null ? '—' : `${attRate}%`, attColor],
            ['Callouts',        emp.callouts_30d,                emp.callouts_30d <= 1 ? 'var(--t-success)' : emp.callouts_30d <= 3 ? 'var(--t-warn)' : 'var(--t-danger)'],
            ['Lates',           emp.lates_30d,                   emp.lates_30d <= 1 ? 'var(--t-success)' : emp.lates_30d <= 2 ? 'var(--t-warn)' : 'var(--t-danger)'],
            ['NCNS',            emp.ncns_30d,                    emp.ncns_30d === 0 ? 'var(--t-success)' : 'var(--t-danger)'],
          ].map(([k,v,c]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:13, color:'var(--t-text-muted)' }}>{k}</span>
              <span style={{ fontSize:15, fontWeight:800, color:c }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:6 }}>
            <div style={{ ...label12, marginBottom:6 }}>Rate Trend</div>
            <ProgressBar pct={attRate || 0} color={attColor} />
          </div>
        </div>
      </div>

      {/* Performance & Compliance */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Performance & Compliance</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            ['Latest Review Score', emp.review_score == null ? '—' : `${emp.review_score}/5`, emp.review_score == null ? 'var(--t-text-muted)' : emp.review_score >= 4 ? 'var(--t-success)' : emp.review_score >= 3 ? 'var(--t-warn)' : 'var(--t-danger)'],
            ['Revenue MTD',        money(emp.revenue_mtd),                  'var(--t-accent)'],
            ['Avg Ticket',         money(emp.avg_ticket),                   'var(--t-text)'],
            ['Training Complete',  `${emp.training_pct}%`,                  emp.training_pct >= 90 ? 'var(--t-success)' : emp.training_pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'],
            ['Policy Signed',      emp.policy_signed ? 'Yes' : 'UNSIGNED',  emp.policy_signed ? 'var(--t-success)' : 'var(--t-danger)'],
            ['Open DAs',           emp.open_das,                             emp.open_das === 0 ? 'var(--t-success)' : 'var(--t-danger)'],
          ].map(([k,v,c]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:13, color:'var(--t-text-muted)' }}>{k}</span>
              <span style={{ fontSize:14, fontWeight:800, color:c }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:6 }}>
            <div style={{ ...label12, marginBottom:6 }}>Training Progress</div>
            <ProgressBar pct={emp.training_pct} color={emp.training_pct >= 90 ? 'var(--t-success)' : emp.training_pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'} />
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div style={{ ...card, gridColumn:'1 / -1' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Recent Activity</div>
        {activity.length === 0 ? (
          <div style={{ fontSize:13, color:'var(--t-text-faint)', padding:'8px 0' }}>No recorded activity yet.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {activity.map((a, i) => (
              <div key={a.id} style={{ display:'flex', gap:14, padding:'10px 0', borderBottom: i < activity.length-1 ? '1px solid var(--t-line)' : 'none' }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: TYPE_DOT[a.type] || 'var(--t-text-muted)', marginTop:4, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'var(--t-text)' }}>{a.description}</div>
                  <div style={{ fontSize:11, color:'var(--t-text-faint)', marginTop:2 }}>{fmt(a.date)} · {a.changed_by}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color: TYPE_DOT[a.type] || 'var(--t-text-muted)', whiteSpace:'nowrap', alignSelf:'flex-start' }}>{a.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 2 — ATTENDANCE
───────────────────────────────────────────────────────────────────────────── */
function TabAttendance({ emp, rows }) {
  const calRows = useMemo(() => {
    const weeks = []
    for (let w = 0; w < 4; w++) {
      const week = []
      for (let d = 6; d >= 0; d--) {
        const dd = new Date()
        dd.setDate(dd.getDate() - (w * 7 + d))
        const ds = dd.toISOString().slice(0,10)
        const hit = rows.find((r) => r.date === ds)
        week.push({ date: ds, status: hit ? hit.status : 'off', label: dd.toLocaleDateString('en-US',{weekday:'short'}) })
      }
      weeks.push(week)
    }
    return weeks.reverse()
  }, [rows])

  const calloutDays = useMemo(() => {
    const map = {}
    rows.filter((r) => r.status === 'callout' || r.status === 'ncns').forEach((r) => {
      const dow = new Date(r.date).toLocaleDateString('en-US',{weekday:'long'})
      map[dow] = (map[dow] || 0) + 1
    })
    return Object.entries(map).sort((a,b) => b[1]-a[1])
  }, [rows])

  const COLS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Mini Calendar */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>28-Day Attendance Calendar</div>
        {rows.length === 0 && (
          <div style={{ fontSize:13, color:'var(--t-text-faint)', marginBottom:12 }}>No published shifts or attendance incidents in the last 30 days.</div>
        )}
        <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'separate', borderSpacing:4, minWidth:500 }}>
            <thead>
              <tr>
                {COLS.map((c) => <th key={c} style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', padding:'0 6px 6px', textAlign:'center' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {calRows.map((week, wi) => (
                <tr key={wi}>
                  {week.map((day) => (
                    <td key={day.date} style={{ padding:2 }}>
                      <div
                        title={`${day.date} — ${day.status}`}
                        style={{
                          width:36, height:36, borderRadius:6,
                          background: ATTEND_COLOR[day.status] || 'var(--t-surface-2)',
                          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                          opacity: day.status === 'off' ? 0.3 : 1,
                          border: '1px solid var(--t-line)',
                        }}
                      >
                        <span style={{ fontSize:10, color: day.status === 'off' ? 'var(--t-text-faint)' : '#fff', fontWeight:700 }}>
                          {new Date(day.date).getDate()}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:'flex', gap:16, marginTop:12 }}>
            {[['Present','present'],['Late','late'],['Callout','callout'],['NCNS','ncns'],['Off','off']].map(([l,k]) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:12, height:12, borderRadius:3, background: ATTEND_COLOR[k], border:'1px solid var(--t-line)', opacity: k==='off'?0.4:1 }} />
                <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pattern Analysis */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={card}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Pattern Analysis</div>
          {calloutDays.length > 0 ? (
            <>
              <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:8 }}>Callout frequency by day:</div>
              {calloutDays.map(([day,cnt]) => (
                <div key={day} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:13, color:'var(--t-text)', width:90 }}>{day}</span>
                  <div style={{ flex:1 }}><ProgressBar pct={(cnt/Math.max(rows.length,1))*100*10} color='var(--t-danger)' /></div>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--t-danger)', width:20, textAlign:'right' }}>{cnt}</span>
                </div>
              ))}
            </>
          ) : <div style={{ fontSize:13, color:'var(--t-success)' }}>No callout pattern detected.</div>}
        </div>
        <div style={card}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>30-Day Summary</div>
          {[
            ['Attendance Rate',  emp.attendance_rate == null ? '—' : `${emp.attendance_rate}%`, emp.attendance_rate != null && emp.attendance_rate < 90],
            ['Callouts (30d)',    emp.callouts_30d,           emp.callouts_30d > 1],
            ['Lates (30d)',       emp.lates_30d,              emp.lates_30d > 1],
            ['NCNS',              emp.ncns_30d,               emp.ncns_30d > 0],
          ].map(([k,v,warn]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:13, color:'var(--t-text-muted)' }}>{k}</span>
              <span style={{ fontSize:13, fontWeight:800, color: warn ? 'var(--t-danger)' : 'var(--t-success)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Log Table */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Attendance Log — 30 Days</div>
        {rows.length === 0 ? (
          <div style={{ fontSize:13, color:'var(--t-text-faint)', padding:'8px 0' }}>No attendance records in the last 30 days.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  {['Date','Shift','Status','Min Late','Reason','Logged By'].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r, i) => (
                  <tr key={r.date} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={td0}>{fmtShort(r.date)}</td>
                    <td style={td0}>{r.shift}</td>
                    <td style={td0}>
                      <span className={r.status === 'present' ? 'badge green' : r.status === 'late' ? 'badge amber' : r.status === 'ncns' ? 'badge red' : r.status === 'callout' ? 'badge red' : 'badge blue'}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ ...td0, color: r.minutes_late > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{r.minutes_late > 0 ? `${r.minutes_late}m` : '—'}</td>
                    <td style={{ ...td0, color:'var(--t-text-muted)' }}>{r.reason || '—'}</td>
                    <td style={{ ...td0, color:'var(--t-text-muted)' }}>{r.logged_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 3 — TRAINING
───────────────────────────────────────────────────────────────────────────── */
function TabTraining({ emp, training }) {
  const completed  = training.filter((t) => t.status === 'completed')
  const inProgress = training.filter((t) => t.status === 'in_progress')
  const notStarted = training.filter((t) => t.status === 'not_started')

  const STATUS_BADGE_T = { completed:'badge green', in_progress:'badge amber', not_started:'badge red' }
  const STATUS_LABEL_T = { completed:'Completed', in_progress:'In Progress', not_started:'Not Started' }

  if (training.length === 0) return emptyBox('No training records on file for this employee.')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Compliance bar */}
      <div style={{ ...card, display:'flex', gap:24, alignItems:'center' }}>
        <div style={{ minWidth:80 }}>
          <div style={label12}>Compliance</div>
          <div style={{ ...val24, color: emp.training_pct >= 90 ? 'var(--t-success)' : emp.training_pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{emp.training_pct}%</div>
        </div>
        <div style={{ flex:1 }}>
          <ProgressBar pct={emp.training_pct} color={emp.training_pct >= 90 ? 'var(--t-success)' : emp.training_pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'} />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>{completed.length} completed</span>
            <span style={{ fontSize:11, color:'var(--t-warn)' }}>{inProgress.length} in progress</span>
            <span style={{ fontSize:11, color:'var(--t-danger)' }}>{notStarted.length} not started</span>
          </div>
        </div>
      </div>

      {/* Urgent — Not Started */}
      {notStarted.length > 0 && (
        <div style={{ ...card, border:'1px solid var(--t-danger)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--t-danger)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Required — Not Started</div>
          {notStarted.map((t) => (
            <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:13, color:'var(--t-text)' }}>{t.course}</span>
              <span className="badge red">NOT STARTED</span>
            </div>
          ))}
        </div>
      )}

      {/* Full table */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>All Courses</div>
        <div style={{ overflowX:'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>{['Course','Status','Progress','Score','Completed','Attempts'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {training.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                  <td style={td0}>{t.course}</td>
                  <td style={td0}><span className={STATUS_BADGE_T[t.status] || 'badge blue'}>{STATUS_LABEL_T[t.status] || t.status}</span></td>
                  <td style={{ ...td0, minWidth:120 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <ProgressBar pct={t.progress} color={t.status === 'completed' ? 'var(--t-success)' : 'var(--t-accent)'} />
                      <span style={{ fontSize:11, color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{t.progress}%</span>
                    </div>
                  </td>
                  <td style={{ ...td0, fontWeight:700, color: t.score != null ? (t.score >= 80 ? 'var(--t-success)' : t.score >= 60 ? 'var(--t-warn)' : 'var(--t-danger)') : 'var(--t-text-faint)' }}>
                    {t.score != null ? `${t.score}%` : '—'}
                  </td>
                  <td style={{ ...td0, color:'var(--t-text-muted)' }}>{fmt(t.completed_date)}</td>
                  <td style={{ ...td0, textAlign:'center', color:'var(--t-text-muted)' }}>{t.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 4 — DISCIPLINARY
───────────────────────────────────────────────────────────────────────────── */
const PROG_STEPS = ['Verbal Warning','Written Warning','Final Warning','Suspension','PIP','Termination']

function IssueDAForm({ onIssue, saving }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(DA_TYPES[1])
  const [description, setDescription] = useState('')
  const [corrective, setCorrective] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    if (!description.trim()) { setErr('Violation description is required.'); return }
    setErr('')
    const ok = await onIssue({ type, description: description.trim(), corrective: corrective.trim(), follow_up: followUp || null })
    if (ok) { setDescription(''); setCorrective(''); setFollowUp(''); setOpen(false) }
  }

  if (!open) {
    return (
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <ActionBtn color='var(--t-danger)' onClick={() => setOpen(true)}>+ Issue Disciplinary Action</ActionBtn>
      </div>
    )
  }
  return (
    <div style={card}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>New Disciplinary Action</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <div style={label12}>Type</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
            {DA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={label12}>Follow-up Date</div>
          <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} style={inp} />
        </div>
        <div style={{ gridColumn:'1 / -1' }}>
          <div style={label12}>Violation</div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inp, resize:'vertical' }} />
        </div>
        <div style={{ gridColumn:'1 / -1' }}>
          <div style={label12}>Corrective Action</div>
          <textarea value={corrective} onChange={(e) => setCorrective(e.target.value)} rows={2} style={{ ...inp, resize:'vertical' }} />
        </div>
      </div>
      {err && <div style={{ fontSize:12, color:'var(--t-danger)', marginTop:8 }}>{err}</div>}
      <div style={{ display:'flex', gap:8, marginTop:12, justifyContent:'flex-end' }}>
        <ActionBtn onClick={() => setOpen(false)}>Cancel</ActionBtn>
        <ActionBtn color='var(--t-danger)' onClick={submit}>{saving ? 'Saving…' : 'Issue DA'}</ActionBtn>
      </div>
    </div>
  )
}

function TabDisciplinary({ das, isHR, onIssue, onResolve, saving }) {
  const latestOpen = das.find((d) => d.status === 'open')
  const stepIdx = latestOpen ? PROG_STEPS.indexOf(latestOpen.type.replace(' (Paid)','').replace(' (Unpaid)','')) : -1

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {isHR && <IssueDAForm onIssue={onIssue} saving={saving} />}

      {/* Progressive Discipline Tracker */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Progressive Discipline Tracker</div>
        <div style={{ display:'flex', gap:0, alignItems:'center', overflowX:'auto' }}>
          {PROG_STEPS.map((step, i) => {
            const active = i === stepIdx
            const past   = i < stepIdx
            const color  = active ? 'var(--t-danger)' : past ? 'var(--t-warn)' : 'var(--t-text-faint)'
            return (
              <div key={step} style={{ display:'flex', alignItems:'center' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, minWidth:90 }}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%',
                    background: active ? 'var(--t-danger)' : past ? 'var(--t-warn)' : 'var(--t-surface-2)',
                    border: `2px solid ${color}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:14, fontWeight:900, color: active || past ? '#fff' : 'var(--t-text-faint)',
                  }}>
                    {past ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color, textAlign:'center', letterSpacing:'0.02em', lineHeight:1.2 }}>{step}</span>
                </div>
                {i < PROG_STEPS.length - 1 && (
                  <div style={{ flex:1, height:2, background: past ? 'var(--t-warn)' : 'var(--t-line)', minWidth:20, margin:'0 4px', marginBottom:18 }} />
                )}
              </div>
            )
          })}
        </div>
        {latestOpen && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(255,77,125,.08)', borderRadius:6, border:'1px solid var(--t-danger)', fontSize:13, color:'var(--t-danger)' }}>
            Active: <strong>{latestOpen.type}</strong> — Issued {fmt(latestOpen.date)}
          </div>
        )}
      </div>

      {/* DA Timeline */}
      {das.map((da) => (
        <div key={da.id} style={{ ...card, borderLeft:`3px solid ${da.status==='open' ? 'var(--t-danger)' : 'var(--t-line)'}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span className={DA_TYPE_BADGE[da.type] || 'badge blue'}>{da.type}</span>
              <span className={da.status === 'open' ? 'badge red' : 'badge green'}>{da.status.toUpperCase()}</span>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:12, color:'var(--t-text-muted)' }}>{fmt(da.date)}</span>
              {isHR && da.status === 'open' && (
                <ActionBtn color='var(--t-success)' onClick={() => onResolve(da.id)}>Resolve</ActionBtn>
              )}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={label12}>Issued By</div>
              <div style={{ fontSize:13, color:'var(--t-text)' }}>{da.issued_by}</div>
            </div>
            <div>
              <div style={label12}>Violation</div>
              <div style={{ fontSize:13, color:'var(--t-text)' }}>{da.violation}</div>
            </div>
            <div>
              <div style={label12}>Corrective Action</div>
              <div style={{ fontSize:13, color:'var(--t-text)' }}>{da.corrective}</div>
            </div>
            <div>
              <div style={label12}>Follow-up / Resolution</div>
              <div style={{ fontSize:13, color: da.resolution ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{da.resolution || da.follow_up}</div>
            </div>
          </div>
        </div>
      ))}

      {das.length === 0 && (
        <div style={{ ...card, textAlign:'center', color:'var(--t-success)', fontSize:14, fontWeight:700 }}>No disciplinary actions on file.</div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 5 — REVIEWS
───────────────────────────────────────────────────────────────────────────── */
const catLabel = (k) => String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function TabReviews({ reviews }) {
  if (reviews.length === 0) return emptyBox('No performance reviews on file for this employee.')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Score Trend */}
      <div style={card}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Score Trend</div>
        <div style={{ display:'flex', gap:16 }}>
          {reviews.map((r) => (
            <div key={r.id} style={{ flex:1, ...cardSm, background:'var(--t-surface-2)', textAlign:'center' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:6 }}>{r.period}</div>
              <div style={{ fontSize:28, fontWeight:900, color: r.overall_score >= 4 ? 'var(--t-success)' : r.overall_score >= 3 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{r.overall_score.toFixed(1)}</div>
              <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>out of 5</div>
            </div>
          ))}
        </div>
      </div>

      {/* Individual Reviews */}
      {reviews.map((r) => {
        const cats = Object.entries(r.categories).filter(([, v]) => typeof v === 'number')
        return (
          <div key={r.id} style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)' }}>{r.period}</div>
                <div style={{ fontSize:13, color:'var(--t-text-muted)', marginTop:2 }}>Reviewed by {r.reviewer} · {fmt(r.date)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <StarRating score={r.overall_score} />
                <span className={r.status === 'acknowledged' ? 'badge green' : 'badge amber'} style={{ display:'block', marginTop:6 }}>
                  {r.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Category scores */}
            {cats.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
                {cats.map(([cat, score]) => (
                  <div key={cat} style={{ background:'var(--t-surface-2)', borderRadius:6, padding:'10px 12px' }}>
                    <div style={label12}>{catLabel(cat)}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                      <div style={{ flex:1 }}><ProgressBar pct={(score/5)*100} color={score >= 4 ? 'var(--t-success)' : score >= 3 ? 'var(--t-warn)' : 'var(--t-danger)'} /></div>
                      <span style={{ fontSize:13, fontWeight:800, color: score >= 4 ? 'var(--t-success)' : score >= 3 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{Number(score).toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comments */}
            {r.comments && (
              <div style={{ background:'var(--t-surface-2)', borderRadius:6, padding:'12px 14px' }}>
                <div style={label12}>Reviewer Comments</div>
                <div style={{ fontSize:13, color:'var(--t-text)', lineHeight:1.6, marginTop:4 }}>{r.comments}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 6 — DOCUMENTS
───────────────────────────────────────────────────────────────────────────── */
function TabDocuments({ docs }) {
  const TYPE_BADGE_D = {
    Disciplinary: 'badge red',
    Review:       'badge blue',
    Onboarding:   'badge green',
    Payroll:      'badge purple',
    Policy:       'badge amber',
  }

  if (docs.length === 0) return emptyBox('No documents on file for this employee.')

  return (
    <div style={card}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--t-text-muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Employee File Documents</div>
      <div style={{ overflowX:'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>{['Document Name','Type','Date Filed','Filed By','Status','Download'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={d.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                <td style={{ ...td0, fontWeight:600, color:'var(--t-text)' }}>{d.name}</td>
                <td style={td0}><span className={TYPE_BADGE_D[d.type] || 'badge blue'}>{d.type}</span></td>
                <td style={{ ...td0, color:'var(--t-text-muted)' }}>{fmt(d.date)}</td>
                <td style={{ ...td0, color:'var(--t-text-muted)' }}>{d.filed_by}</td>
                <td style={td0}>
                  <span className={String(d.status).toLowerCase() === 'signed' ? 'badge green' : String(d.status).toLowerCase() === 'active' ? 'badge red' : String(d.status).toLowerCase() === 'closed' ? 'badge blue' : 'badge amber'}>
                    {String(d.status).toUpperCase()}
                  </span>
                </td>
                <td style={td0}>
                  <button
                    onClick={() => { if (d.url) window.open(d.url, '_blank', 'noopener') }}
                    disabled={!d.url}
                    style={{ fontSize:12, padding:'4px 10px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', borderRadius:4, color: d.url ? 'var(--t-accent)' : 'var(--t-text-faint)', cursor: d.url ? 'pointer' : 'not-allowed', fontWeight:700 }}
                  >↓ {d.url ? 'Open' : 'N/A'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 7 — HISTORY
───────────────────────────────────────────────────────────────────────────── */
const HISTORY_TYPES = ['All','Disciplinary','Review','Training','Attendance','HR']
const TYPE_BADGE_H = {
  Disciplinary: 'badge red',
  Review:       'badge blue',
  Training:     'badge green',
  Attendance:   'badge amber',
  HR:           'badge purple',
}

function TabHistory({ history }) {
  const [filter, setFilter] = useState('All')
  const filtered = filter === 'All' ? history : history.filter((h) => h.type === filter)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Filter */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {HISTORY_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding:'6px 14px', fontSize:12, fontWeight:700, borderRadius:16,
              border:'1px solid var(--t-line)', cursor:'pointer',
              background: filter === t ? 'var(--t-accent)' : 'var(--t-surface-2)',
              color:      filter === t ? 'var(--t-surface)' : 'var(--t-text-muted)',
              transition:'all 0.15s',
            }}
          >{t}</button>
        ))}
      </div>

      <div style={card}>
        <div style={{ overflowX:'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>{['Date','Event Type','Description','Changed By'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((h, i) => (
                <tr key={h.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                  <td style={{ ...td0, whiteSpace:'nowrap', color:'var(--t-text-muted)' }}>{fmt(h.date)}</td>
                  <td style={td0}><span className={TYPE_BADGE_H[h.type] || 'badge blue'}>{h.type}</span></td>
                  <td style={{ ...td0, color:'var(--t-text)' }}>{h.description}</td>
                  <td style={{ ...td0, color:'var(--t-text-muted)' }}>{h.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:32, color:'var(--t-text-faint)', fontSize:13 }}>No history records for this filter.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function EmployeeFile() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { locationIds } = useScope()

  const person   = session?.person || {}
  const actorId  = person.id || null
  const isHR     = isHRRole(person.role_name || '')

  const [roster,     setRoster]     = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [emp,        setEmp]        = useState(null)
  const [training,   setTraining]   = useState([])
  const [das,        setDas]        = useState([])
  const [reviews,    setReviews]    = useState([])
  const [documents,  setDocuments]  = useState([])
  const [attRows,    setAttRows]    = useState([])
  const [history,    setHistory]    = useState([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [tab,        setTab]        = useState('overview')

  /* ── roster (employee selector) ── */
  useEffect(() => {
    let alive = true
    const ids = Array.isArray(locationIds) ? locationIds : []
    setLoadingRoster(true)
    sb.rpc('get_roster', { p_node_ids: ids })
      .then(({ data, error }) => {
        if (!alive) return
        const list = (!error && Array.isArray(data)) ? data : []
        setRoster(list)
        setSelectedId((prev) => {
          if (prev && list.some((r) => (r.id ?? r.person_id) === prev)) return prev
          const mine = list.find((r) => (r.id ?? r.person_id) === actorId)
          return (mine ? (mine.id ?? mine.person_id) : (list[0] ? (list[0].id ?? list[0].person_id) : null))
        })
      })
      .catch(() => { if (alive) setRoster([]) })
      .finally(() => { if (alive) setLoadingRoster(false) })
    return () => { alive = false }
  }, [JSON.stringify(locationIds), actorId])

  /* ── per-employee real file loader (also used to refresh after writes) ── */
  const loadFile = useCallback(async () => {
    if (!selectedId) { setEmp(null); return }
    const ids = Array.isArray(locationIds) ? locationIds : []
    setLoading(true)
    const rosterRow = roster.find((r) => (r.id ?? r.person_id) === selectedId) || {}
    const fullName = rosterRow.full_name || ''

    // 5-week schedule window for attendance-rate + calendar
    const mondayISO = (w) => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + w * 7); return d.toISOString().slice(0, 10) }

    const [fileRes, daRes, rvRes, ovRes, ecRes, ...schedRes] = await Promise.all([
      sb.rpc('hr_employee_file', { p_person_id: selectedId, p_node_ids: ids }).catch(() => ({ data: null })),
      sb.rpc('get_disciplinary_actions', { p_node_ids: ids }).catch(() => ({ data: null })),
      sb.rpc('get_performance_reviews', { p_node_ids: ids }).catch(() => ({ data: null })),
      sb.rpc('get_attendance_overview', { p_node_ids: ids }).catch(() => ({ data: null })),
      sb.rpc('get_my_emergency_contacts', { p_person_id: selectedId }).catch(() => ({ data: null })),
      ...[-4, -3, -2, -1, 0].map((w) =>
        sb.rpc('get_week_schedule', { p_node_ids: ids, p_week_start: mondayISO(w), p_actor: actorId }).then((r) => r.data || []).catch(() => [])
      ),
    ])

    const file = fileRes.data && fileRes.data.person ? fileRes.data : null
    const p = file?.person || {}
    const primary = (file?.assignments || []).find((a) => a.status === 'active') || (file?.assignments || [])[0] || {}

    // discipline / reviews scoped to this person
    const daList = (Array.isArray(daRes.data) ? daRes.data : [])
      .filter((r) => (r.person_id) === selectedId)
      .map(transformDA)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    const rvList = (Array.isArray(rvRes.data) ? rvRes.data : [])
      .filter((r) => (r.person_id) === selectedId)
      .map(transformReview)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

    // attendance incidents for this person
    const ovRow = (Array.isArray(ovRes.data) ? ovRes.data : []).find((o) => o.person_id === selectedId)
    const incidents = (ovRow && Array.isArray(ovRow.incidents)) ? ovRow.incidents : []

    // schedule rows for this person across the 5-week window
    const scheduleRows = schedRes.flat().filter((s) => String(s.full_name || '').toLowerCase() === fullName.toLowerCase())

    const rows = buildAttendance(scheduleRows, incidents)
    const attStats = attendanceStats(rows, incidents)

    const trainingRows = transformTraining(file?.training)
    const trainingPct = trainingRows.length
      ? Math.round(trainingRows.filter((t) => t.status === 'completed').length / trainingRows.length * 100)
      : 0
    const docRows = (Array.isArray(file?.documents) ? file.documents : []).map(transformDocument)
    const contact = (Array.isArray(ecRes.data) && ecRes.data.length) ? ecRes.data[0] : null

    const rl = String(rosterRow.risk || '').toLowerCase() || 'low'
    const statusRaw = rosterRow.status || rosterRow.assignment_status || 'active'
    const status = statusRaw === 'terminated' ? 'terminated'
      : (statusRaw === 'leave' || p.is_active === false) ? 'leave' : 'active'

    const openDas = daList.filter((d) => d.status === 'open').length
    const lastDa = daList[0]?.date || null

    const built = {
      id: selectedId,
      full_name: rosterRow.full_name || p.full_name || '—',
      login_id: rosterRow.login_id || p.login_id || '',
      role_name: rosterRow.role || rosterRow.role_name || primary.role || '—',
      location: rosterRow.location || rosterRow.node_name || primary.node_name || '—',
      node_id: rosterRow.node_id || primary.node_id || (ids[0] || null),
      status,
      hire_date: rosterRow.hire_date || p.created_at || null,
      wage: rosterRow.wage != null ? Number(rosterRow.wage) : null,
      phone: rosterRow.phone || contact?.phone_primary || null,
      email: p.login_id || rosterRow.login_id || null,
      address: contact?.address || null,
      emergency_name: contact?.contact_name || null,
      emergency_rel: contact?.relationship || null,
      emergency_phone: contact?.phone_primary || null,
      schedule_notes: null,
      risk_level: rl,
      risk_score: rosterRow.risk_score != null ? rosterRow.risk_score : null,
      attendance_rate: attStats.attendance_rate,
      callouts_30d: attStats.callouts_30d,
      lates_30d: attStats.lates_30d,
      ncns_30d: attStats.ncns_30d,
      perfect_weeks: attStats.perfect_weeks,
      streak_days: attStats.streak_days,
      review_score: rvList[0] ? Math.round(rvList[0].overall_score * 10) / 10 : null,
      revenue_mtd: null,   // no proven per-person sales RPC in HR brain — honest empty
      avg_ticket: null,
      training_pct: trainingPct,
      policy_signed: !!rosterRow.policy_signed,
      open_das: openDas,
      last_da_date: lastDa,
      review_due: null,
    }

    setEmp(built)
    setTraining(trainingRows)
    setDas(daList)
    setReviews(rvList)
    setDocuments(docRows)
    setAttRows(rows)
    setHistory(buildHistory(daList, rvList, trainingRows, incidents))
    setLoading(false)
  }, [selectedId, roster, JSON.stringify(locationIds), actorId])

  useEffect(() => { loadFile() }, [loadFile])

  /* ── write actions ── */
  const issueDA = useCallback(async ({ type, description, corrective, follow_up }) => {
    if (!selectedId) return false
    setSaving(true)
    const { error } = await sb.rpc('create_disciplinary_action', {
      p_person_id: selectedId,
      p_node_id: emp?.node_id || (locationIds?.[0] ?? null),
      p_type: type,
      p_description: description,
      p_corrective_action: corrective || null,
      p_issued_by_id: actorId,
      p_follow_up_date: follow_up || null,
    }).catch((e) => ({ error: e }))
    setSaving(false)
    if (error) return false
    await loadFile()
    return true
  }, [selectedId, emp, locationIds, actorId, loadFile])

  const resolveDA = useCallback(async (id) => {
    const { error } = await sb.rpc('resolve_disciplinary_action', {
      p_da_id: id,
      p_resolution_notes: 'Marked resolved from employee file.',
      p_manager_id: actorId,
    }).catch((e) => ({ error: e }))
    if (!error) await loadFile()
  }, [actorId, loadFile])

  /* ── loading / empty states ── */
  if (loadingRoster) {
    return (
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:400 }}>
        <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>Loading employee roster…</div>
      </div>
    )
  }

  if (roster.length === 0) {
    return (
      <div style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:14, color:'var(--t-text-muted)' }}>No employees found for your assigned locations.</div>
        <button onClick={() => navigate('/roster')} style={{ marginTop:16, padding:'8px 18px', fontSize:13, cursor:'pointer', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', borderRadius:6, color:'var(--t-text)' }}>Go to Roster</button>
      </div>
    )
  }

  const riskColor   = RISK_COLOR[emp?.risk_level] || 'var(--t-text-muted)'
  const riskBadge   = RISK_BADGE[emp?.risk_level] || 'badge blue'
  const statusBadge = STATUS_BADGE[emp?.status]   || 'badge blue'

  const avgScore = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.overall_score, 0) / reviews.length).toFixed(1)
    : null

  const daysSinceDA = emp?.last_da_date
    ? Math.floor((Date.now() - new Date(emp.last_da_date).getTime()) / 86400000)
    : null

  const selInput = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, borderRadius: 6, minWidth: 280, cursor: 'pointer',
  }

  const TABS = [
    { id:'overview',      label:'Overview' },
    { id:'attendance',    label:'Attendance' },
    { id:'training',      label:'Training' },
    { id:'disciplinary',  label:'Disciplinary', count: emp?.open_das || undefined },
    { id:'reviews',       label:'Reviews' },
    { id:'documents',     label:'Documents' },
    { id:'history',       label:'History' },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: 'var(--font, Inter, sans-serif)' }}>

      {/* ── BACK NAV + EMPLOYEE SELECTOR ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom: 16 }}>
        <button
          onClick={() => navigate('/roster')}
          style={{ fontSize:12, color:'var(--t-text-muted)', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:4 }}
        >
          ← Back to Roster
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Employee</span>
          <select value={selectedId || ''} onChange={(e) => { setSelectedId(e.target.value); setTab('overview') }} style={selInput}>
            {roster.map((r) => {
              const id = r.id ?? r.person_id
              return <option key={id} value={id}>{r.full_name} — {(r.role || r.role_name || '—')} · {(r.location || r.node_name || '—')}</option>
            })}
          </select>
        </div>
      </div>

      {(loading || !emp) ? (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:300 }}>
          <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>Loading employee file…</div>
        </div>
      ) : (
      <>
      {/* ═══════════════════════════════════════════════════════════ HEADER ═══ */}
      <div style={{
        background:  'var(--t-surface)',
        border:      '1px solid var(--t-line)',
        borderRadius: 12,
        padding:     24,
        marginBottom: 16,
      }}>
        <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
          {/* Avatar */}
          <div style={{
            width:72, height:72, borderRadius:16,
            background: riskColor,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:26, fontWeight:900, color:'#fff', flexShrink:0,
            boxShadow:`0 0 0 3px ${riskColor}33`,
          }}>
            {initials(emp.full_name)}
          </div>

          {/* Identity */}
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
              <h1 style={{ fontSize:24, fontWeight:900, color:'var(--t-text)', margin:0 }}>{emp.full_name}</h1>
              <span className={statusBadge} style={{ fontSize:12 }}>{STATUS_LABEL[emp.status] || emp.status}</span>
              <span className={riskBadge} style={{ fontSize:12 }}>{(emp.risk_level || 'low').toUpperCase()} RISK</span>
            </div>
            <div style={{ fontSize:14, color:'var(--t-text-muted)', marginBottom:8 }}>
              {emp.role_name} · {emp.location}
            </div>
            <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              {[
                ['Hire Date',  fmt(emp.hire_date)],
                ['Tenure',     tenure(emp.hire_date)],
                ['Wage',       emp.wage != null ? `$${emp.wage.toFixed(2)}/hr` : '—'],
                ['Employee ID',emp.id],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', gap:6 }}>
                  <span style={{ fontSize:12, color:'var(--t-text-faint)' }}>{k}:</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          {isHR && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignSelf:'flex-start' }}>
              <ActionBtn color='var(--t-danger)'   onClick={() => setTab('disciplinary')}>Issue DA</ActionBtn>
              <ActionBtn color='var(--t-accent)'   onClick={() => navigate('/reviews')}>Request Review</ActionBtn>
              <ActionBtn onClick={() => navigate('/messages')}>Send Message</ActionBtn>
              <ActionBtn onClick={() => navigate('/roster')}>Edit Profile</ActionBtn>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FORENSIC KPI STRIP ═══ */}
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>

        {/* Row 1 — Attendance */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', borderRadius:8, padding:'12px 16px' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--t-text-muted)', letterSpacing:'0.08em', marginBottom:10, textTransform:'uppercase' }}>Attendance — 30 Days</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            <KpiCell label="Attend Rate"   value={emp.attendance_rate == null ? '—' : `${emp.attendance_rate}%`}  sub="30 days"   accent={emp.attendance_rate == null ? 'var(--t-text-muted)' : emp.attendance_rate >= 90 ? 'var(--t-success)' : emp.attendance_rate >= 80 ? 'var(--t-warn)' : 'var(--t-danger)'} />
            <KpiCell label="Callouts"      value={emp.callouts_30d}           sub="30 days"   accent={emp.callouts_30d <= 1 ? 'var(--t-success)' : emp.callouts_30d <= 2 ? 'var(--t-warn)' : 'var(--t-danger)'} />
            <KpiCell label="Lates"         value={emp.lates_30d}              sub="30 days"   accent={emp.lates_30d <= 1 ? 'var(--t-success)' : 'var(--t-warn)'} />
            <KpiCell label="NCNS"          value={emp.ncns_30d}               sub="30 days"   accent={emp.ncns_30d === 0 ? 'var(--t-success)' : 'var(--t-danger)'} />
            <KpiCell label="Perfect Weeks" value={emp.perfect_weeks}          sub="last 4 wk" accent='var(--t-accent)' />
            <KpiCell label="Clean Streak"  value={emp.streak_days == null ? '—' : `${emp.streak_days}d`}      sub="days"      accent={emp.streak_days != null && emp.streak_days >= 14 ? 'var(--t-success)' : 'var(--t-text-muted)'} />
          </div>
        </div>

        {/* Row 2 — Performance */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', borderRadius:8, padding:'12px 16px' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--t-text-muted)', letterSpacing:'0.08em', marginBottom:10, textTransform:'uppercase' }}>Performance</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            <KpiCell label="Review Score"   value={avgScore == null ? '—' : `${avgScore}/5`}             sub="avg"    accent={avgScore == null ? 'var(--t-text-muted)' : parseFloat(avgScore) >= 4 ? 'var(--t-success)' : parseFloat(avgScore) >= 3 ? 'var(--t-warn)' : 'var(--t-danger)'} />
            <KpiCell label="Revenue MTD"    value={emp.revenue_mtd == null ? '—' : `$${(emp.revenue_mtd/1000).toFixed(1)}k`} sub="this month" accent='var(--t-accent)' />
            <KpiCell label="Avg Ticket"     value={emp.avg_ticket == null ? '—' : `$${emp.avg_ticket.toFixed(0)}`}           sub="MTD"       accent='var(--t-text)' />
            <KpiCell label="Training"       value={`${emp.training_pct}%`}       sub="complete"  accent={emp.training_pct >= 90 ? 'var(--t-success)' : emp.training_pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'} />
            <KpiCell label="Policy Signed"  value={emp.policy_signed ? 'YES' : 'NO'} sub="policy" accent={emp.policy_signed ? 'var(--t-success)' : 'var(--t-danger)'} />
            <KpiCell label="Open DAs"       value={emp.open_das}                sub="active"    accent={emp.open_das === 0 ? 'var(--t-success)' : 'var(--t-danger)'} />
          </div>
        </div>

        {/* Row 3 — HR Risk */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', borderRadius:8, padding:'12px 16px' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--t-text-muted)', letterSpacing:'0.08em', marginBottom:10, textTransform:'uppercase' }}>HR Risk</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            <KpiCell label="Risk Level"     value={(emp.risk_level || 'LOW').toUpperCase()} sub="current" accent={riskColor} />
            <KpiCell label="Risk Score"     value={emp.risk_score == null ? '—' : emp.risk_score}    sub="composite"  accent={riskColor} />
            <KpiCell label="DA Count"       value={das.length}   sub="all time"   accent={das.length === 0 ? 'var(--t-success)' : das.length <= 2 ? 'var(--t-warn)' : 'var(--t-danger)'} />
            <KpiCell label="Last DA"        value={emp.last_da_date ? fmtShort(emp.last_da_date) : 'None'} sub="date" accent={emp.last_da_date ? 'var(--t-warn)' : 'var(--t-success)'} />
            <KpiCell label="Days Since DA"  value={daysSinceDA != null ? `${daysSinceDA}d` : 'N/A'}       sub="days" accent={daysSinceDA != null && daysSinceDA < 30 ? 'var(--t-danger)' : 'var(--t-success)'} />
            <KpiCell label="Review Due"     value={emp.review_due ? fmtShort(emp.review_due) : '—'}       sub="next review" accent={emp.review_due && new Date(emp.review_due) < new Date() ? 'var(--t-danger)' : 'var(--t-accent)'} />
          </div>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{
        background:    'var(--t-surface)',
        border:        '1px solid var(--t-line)',
        borderRadius:  '8px 8px 0 0',
        borderBottom:  'none',
        display:       'flex',
        overflowX:     'auto',
        padding:       '0 8px',
      }}>
        {TABS.map((t) => (
          <TabBtn
            key={t.id}
            label={t.label}
            count={t.count}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        background:   'var(--t-surface)',
        border:       '1px solid var(--t-line)',
        borderTop:    'none',
        borderRadius: '0 0 8px 8px',
        padding:      20,
      }}>
        {tab === 'overview'     && <TabOverview     emp={emp} activity={history.slice(0, 10)} />}
        {tab === 'attendance'   && <TabAttendance   emp={emp} rows={attRows} />}
        {tab === 'training'     && <TabTraining     emp={emp} training={training} />}
        {tab === 'disciplinary' && <TabDisciplinary das={das} isHR={isHR} onIssue={issueDA} onResolve={resolveDA} saving={saving} />}
        {tab === 'reviews'      && <TabReviews      reviews={reviews} />}
        {tab === 'documents'    && <TabDocuments    docs={documents} />}
        {tab === 'history'      && <TabHistory      history={history} />}
      </div>
      </>
      )}

    </div>
  )
}
