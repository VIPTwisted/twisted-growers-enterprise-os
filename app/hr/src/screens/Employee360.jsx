// Employee360.jsx — Twisted Growers HR
// Aurora midnight theme · inline styles · CSS token vars · no Tailwind
// 100% real data — all sections read from Supabase RPCs (HR brain
// fxetuqjryttnypgepsru, schema hr). No mock/seed/localStorage data anywhere.
//   Employee list ......... get_roster(p_node_ids, p_actor)
//   Profile/training/docs . hr_employee_file(p_person_id, p_node_ids)
//   Disciplinary .......... get_disciplinary_actions(p_node_ids)  [filter person_id]
//   Attendance incidents .. get_attendance_overview(p_node_ids)   [filter person_id]
//   1-on-1 meetings ....... get_one_on_ones(p_node_ids, p_actor)  [filter employee]
//   Schedule .............. get_week_schedule(p_node_ids, p_week_start, p_actor)
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Disciplinary type codes → human labels (matches get_disciplinary_actions.da_type)
const DA_LABEL = {
  verbal: 'Verbal Warning', written: 'Written Warning',
  final: 'Final Written Warning', suspension: 'Suspension',
  termination: 'Termination', pip: 'PIP', coaching: 'Coaching Note',
}
const daLabel = t => DA_LABEL[String(t || '').toLowerCase()] || (t || '—')
// Ordered progressive-discipline ladder + the type codes that map to each stage
const DA_STAGES = ['Verbal Warning', 'Written Warning', 'Final Written Warning', 'Suspension', 'Termination']
const daStageIdx = t => {
  const l = daLabel(t)
  const i = DA_STAGES.indexOf(l)
  return i
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
const fmtDate = d => {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt)) return '—'
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

const ts = d => { const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? 0 : t }

const daysBetween = (a, b) => {
  if (!a) return null
  const t = ts(a)
  if (!t) return null
  return Math.max(0, Math.floor(((b ?? Date.now()) - t) / 86400000))
}

const ini = n => !n ? '??' : n.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED BADGE / HELPERS
───────────────────────────────────────────────────────────────────────────── */
function Badge({ type, children }) {
  const map = {
    green:  { bg: 'rgba(29,233,182,.15)',  color: 'var(--t-success)' },
    amber:  { bg: 'rgba(255,179,71,.15)',  color: 'var(--t-warn)'    },
    red:    { bg: 'rgba(255,77,125,.15)',  color: 'var(--t-danger)'  },
    blue:   { bg: 'rgba(59,130,246,.15)',  color: '#60a5fa'          },
    purple: { bg: 'rgba(139,92,246,.15)', color: '#a78bfa'           },
    cyan:   { bg: 'rgba(0,229,255,.12)',  color: 'var(--t-accent)'   },
  }
  const s = map[type] || map.blue
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: 0.5,
    }}>
      {children}
    </span>
  )
}

function KpiTile({ label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      padding: '14px 16px', flex: 1, minWidth: 110, cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function DataRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--t-line)', fontSize: 13 }}>
      <span style={{ color: 'var(--t-text-muted)' }}>{label}</span>
      <span style={{ color: valueColor || 'var(--t-text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function FeatureDisabled() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>Feature Not Enabled</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>This feature is not available in your current plan or configuration.</div>
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
      {children}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none',
      padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      letterSpacing: 0.5, textTransform: 'uppercase',
      color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
      borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
      marginBottom: -1, whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  )
}

function SmBtn({ children, danger, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov && danger ? 'rgba(255,77,125,.08)' : 'transparent',
        border: `1px solid ${hov ? (danger ? 'var(--t-danger)' : 'var(--t-accent)') : 'var(--t-line)'}`,
        color: hov ? (danger ? 'var(--t-danger)' : 'var(--t-accent)') : 'var(--t-text-muted)',
        padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   DERIVE — build the view model for one employee from real RPC payloads
───────────────────────────────────────────────────────────────────────────── */
function buildTrainingRows(training) {
  const now = Date.now()
  return (training || []).map(t => {
    const completed = t.status === 'completed'
    const expired = completed && t.expires_at && ts(t.expires_at) < now
    const soon = completed && !expired && t.expires_at && (ts(t.expires_at) - now) < 60 * 86400000
    const status = !completed ? 'In Progress' : expired ? 'Expired' : soon ? 'Expiring Soon' : 'Current'
    return {
      module: t.module || '—',
      category: t.category || '—',
      completed: t.completed_at ? fmtDate(t.completed_at) : '—',
      score: t.score ?? null,
      expires: t.expires_at ? fmtDate(t.expires_at) : '—',
      status,
      _completed: completed,
    }
  })
}

function buildTimeline(emp) {
  const events = []
  if (emp.hireDate) {
    events.push({
      icon: '🟢', type: 'Hired', cat: 'Attendance', _ts: ts(emp.hireDate),
      date: fmtDate(emp.hireDate),
      desc: `Onboarded as ${emp.role} at ${emp.loc}`,
      loggedBy: 'System',
    })
  }
  emp.das.forEach(d => events.push({
    icon: '📋', type: 'Disciplinary Action', cat: 'Discipline', _ts: ts(d.da_date || d.created_at),
    date: fmtDate(d.da_date || d.created_at),
    desc: `${daLabel(d.da_type)} — ${d.description || 'No detail provided'}`,
    loggedBy: d.issuer_name || 'HR',
  }))
  ;(emp.training || []).filter(t => t.status === 'completed' && t.completed_at).forEach(t => events.push({
    icon: '✅', type: 'Training Completed', cat: 'Training', _ts: ts(t.completed_at),
    date: fmtDate(t.completed_at),
    desc: `Completed "${t.module}"${t.score != null ? ` — Score: ${t.score}%` : ''}`,
    loggedBy: 'System',
  }))
  emp.incidents.forEach(i => events.push({
    icon: '⚠', type: { tardy: 'Tardy', callout: 'Callout', ncns: 'No-Call No-Show' }[i.type] || 'Attendance Incident',
    cat: 'Attendance', _ts: ts(i.date),
    date: fmtDate(i.date),
    desc: `${(i.type || '').toUpperCase()} — ${i.pts} pt${i.pts === 1 ? '' : 's'}${i.expired ? ' (expired)' : ''}`,
    loggedBy: i.recorded_by || 'System',
  }))
  emp.oneOnOnes.forEach(m => events.push({
    icon: '🔵', type: '1-on-1 Meeting', cat: 'Recognition', _ts: ts(m.meeting_date),
    date: fmtDate(m.meeting_date),
    desc: (m.topics && m.topics.length ? `Topics: ${m.topics.join(', ')}` : (m.notes || 'Check-in meeting')),
    loggedBy: m.manager_name || 'Manager',
  }))
  return events.sort((a, b) => b._ts - a._ts)
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function OverviewTab({ emp, onDrill }) {
  const INCIDENT_COLS = [
    { key: 'date', label: 'Date', value: c => fmtDate(c.date) },
    { key: 'type', label: 'Type', value: c => (c.type || '').toUpperCase() },
    { key: 'pts', label: 'Points', value: c => c.pts, align: 'right', sortKey: c => c.pts },
    { key: 'expiry', label: 'Expires', value: c => c.expiry ? fmtDate(c.expiry) : '—' },
    { key: 'status', label: 'Status', value: c => c.expired ? 'Expired' : 'Active' },
    { key: 'recorded_by', label: 'Recorded By', value: c => c.recorded_by || 'System' },
  ]
  const DA_COLS = [
    { key: 'da_date', label: 'Date', value: d => fmtDate(d.da_date || d.created_at) },
    { key: 'da_type', label: 'Type', value: d => daLabel(d.da_type) },
    { key: 'status', label: 'Status', value: d => d.status || '—' },
    { key: 'issuer_name', label: 'Issued By', value: d => d.issuer_name || '—' },
    { key: 'description', label: 'Detail', value: d => d.description || '—' },
  ]
  const TRAIN_COLS = [
    { key: 'module', label: 'Module', value: r => r.module },
    { key: 'category', label: 'Category', value: r => r.category },
    { key: 'completed', label: 'Completed', value: r => r.completed },
    { key: 'score', label: 'Score', value: r => r.score != null ? `${r.score}%` : '—', align: 'right', sortKey: r => r.score ?? -1 },
    { key: 'expires', label: 'Expires', value: r => r.expires },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const ONE_COLS = [
    { key: 'meeting_date', label: 'Date', value: m => fmtDate(m.meeting_date) },
    { key: 'manager_name', label: 'Manager', value: m => m.manager_name || '—' },
    { key: 'topics', label: 'Topics', value: m => (m.topics || []).join(', ') || '—' },
    { key: 'notes', label: 'Notes', value: m => m.notes || '—' },
  ]
  const dd = (title, columns, rows, accent) => onDrill && onDrill({
    title: `${emp.name} — ${title}`, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent,
  })

  const attColor = emp.attPoints >= 5 ? 'var(--t-danger)' : emp.attPoints > 0 ? 'var(--t-warn)' : 'var(--t-success)'

  return (
    <div>
      {/* KPI tiles — all live */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiTile label="Attendance Points" value={emp.attPoints.toFixed(1)} color={attColor} sub={`${emp.incidents.length} incident${emp.incidents.length === 1 ? '' : 's'}`} onClick={() => dd('Attendance Incidents', INCIDENT_COLS, emp.incidents, attColor)} />
        <KpiTile label="Open DAs" value={emp.openDAs} color={emp.openDAs > 0 ? 'var(--t-danger)' : 'var(--t-success)'} sub={`${emp.das.length} total on file`} onClick={() => dd('Disciplinary Actions', DA_COLS, emp.das, emp.das.length > 0 ? 'var(--t-danger)' : 'var(--t-success)')} />
        <KpiTile label="Training Completion" value={emp.training.length ? `${emp.trainingPct}%` : '—'} color={emp.trainingPct >= 90 ? 'var(--t-success)' : emp.trainingPct >= 75 ? 'var(--t-warn)' : 'var(--t-danger)'} sub={`${emp.training.length} module${emp.training.length === 1 ? '' : 's'}`} onClick={() => dd('Training Modules', TRAIN_COLS, emp.trainingRows, 'var(--t-success)')} />
        <KpiTile label="Documents on File" value={emp.documents.length} color="var(--t-accent)" onClick={() => dd('Documents', [{ key: 'doc', label: 'Document', value: d => d.doc }, { key: 'status', label: 'Status', value: d => d.status }], emp.documentRows, 'var(--t-accent)')} />
        <KpiTile label="1-on-1 Meetings" value={emp.oneOnOnes.length} color="var(--t-accent)" onClick={() => dd('1-on-1 Meetings', ONE_COLS, emp.oneOnOnes, 'var(--t-accent)')} />
      </div>
      {/* Key dates — all live */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 20px' }}>
        <SectionLabel>Key Dates</SectionLabel>
        <DataRow label="Hire Date" value={emp.hireDate ? `${fmtDate(emp.hireDate)}${emp.tenureDays != null ? ` (${emp.tenureDays}d ago)` : ''}` : '—'} />
        <DataRow label="Most Recent Disciplinary Action" value={emp.lastDA ? fmtDate(emp.lastDA.da_date || emp.lastDA.created_at) : 'None on record'} valueColor={emp.lastDA ? 'var(--t-warn)' : 'var(--t-success)'} />
        <DataRow label="Last Training Completed" value={emp.lastTraining ? `${emp.lastTraining.module} · ${fmtDate(emp.lastTraining.completed_at)}` : 'None on record'} />
        <DataRow label="Last 1-on-1 Meeting" value={emp.oneOnOnes[0] ? fmtDate(emp.oneOnOnes[0].meeting_date) : 'None on record'} />
      </div>
    </div>
  )
}

function TimelineTab({ emp }) {
  const CATS = ['All', 'Discipline', 'Training', 'Attendance', 'Recognition']
  const [catFilter, setCatFilter] = useState('All')

  const catColorMap = {
    Attendance:  'var(--t-warn)',
    Discipline:  'var(--t-danger)',
    Training:    'var(--t-success)',
    Recognition: 'var(--t-accent)',
  }

  const allEvents = emp.timeline
  const filtered = catFilter === 'All' ? allEvents : allEvents.filter(e => e.cat === catFilter)

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {CATS.map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            background: catFilter === c ? 'rgba(0,229,255,.1)' : 'transparent',
            border: `1px solid ${catFilter === c ? 'var(--t-accent)' : 'var(--t-line)'}`,
            color: catFilter === c ? 'var(--t-accent)' : 'var(--t-text-muted)',
            padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            {c}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.length === 0 && (
          <EmptyState>{allEvents.length === 0 ? 'No recorded events for this employee yet.' : 'No events in this category.'}</EmptyState>
        )}
        {filtered.map((evt, i) => {
          const borderColor = catColorMap[evt.cat] || 'var(--t-line)'
          return (
            <div key={i} style={{
              display: 'flex', gap: 14, alignItems: 'flex-start',
              padding: '12px 14px',
              borderLeft: `3px solid ${borderColor}`,
              borderBottom: '1px solid var(--t-line)',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)',
            }}>
              <div style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center', marginTop: 1 }}>{evt.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{evt.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{evt.date}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{evt.desc}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>Logged by: {evt.loggedBy}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AttendanceTab({ emp, showPoints }) {
  const incidents = emp.incidents

  // Absence pattern — most common weekday from real incident dates
  const mostDay = useMemo(() => {
    if (!incidents.length) return null
    const counts = [0, 0, 0, 0, 0, 0, 0]
    incidents.forEach(i => { const d = new Date(i.date); if (!isNaN(d)) counts[d.getDay()]++ })
    return DAYS[counts.indexOf(Math.max(...counts))]
  }, [incidents])

  return (
    <div>
      {/* Top summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {showPoints && (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Points Balance</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: emp.attPoints >= 5 ? 'var(--t-danger)' : 'var(--t-warn)', fontFamily: 'var(--font-mono)' }}>
              {emp.attPoints.toFixed(1)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>active (non-expired) points</div>
          </div>
        )}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Absence Pattern</div>
          {mostDay ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--t-text)' }}>
                Most incidents on: <span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>{mostDay}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>Based on {incidents.length} recorded incident{incidents.length === 1 ? '' : 's'}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t-success)' }}>No attendance incidents on record.</div>
          )}
        </div>
      </div>

      {/* Table */}
      {incidents.length === 0 ? (
        <EmptyState>No attendance incidents recorded for this employee.</EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date', 'Type', ...(showPoints ? ['Points'] : []), 'Expires', 'Status', 'Recorded By'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--t-text-muted)',
                    fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                    borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,.02)', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((c, i) => {
                const typeColor = c.type === 'ncns' ? 'var(--t-danger)' : c.type === 'callout' ? 'var(--t-warn)' : 'var(--t-accent)'
                const td = { padding: '8px 12px', borderBottom: '1px solid var(--t-line)', fontSize: 12 }
                return (
                  <tr key={c.id || i}>
                    <td style={td}>{fmtDate(c.date)}</td>
                    <td style={td}>
                      <span style={{ color: typeColor, fontWeight: 700, fontSize: 11 }}>{(c.type || '').toUpperCase()}</span>
                    </td>
                    {showPoints && (
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700, color: typeColor }}>{c.pts}</td>
                    )}
                    <td style={{ ...td, color: 'var(--t-text-muted)' }}>{c.expiry ? fmtDate(c.expiry) : '—'}</td>
                    <td style={td}>
                      <span style={{ color: c.expired ? 'var(--t-text-faint)' : 'var(--t-warn)', fontWeight: 700, fontSize: 11 }}>{c.expired ? 'EXPIRED' : 'ACTIVE'}</span>
                    </td>
                    <td style={{ ...td, color: 'var(--t-text-muted)', fontSize: 11 }}>{c.recorded_by || 'System'}</td>
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

function DisciplineTab({ emp, showProgressive }) {
  const das = emp.das
  // Current progressive stage = furthest ladder step reached across active DAs
  const currentStage = das.reduce((mx, d) => Math.max(mx, daStageIdx(d.da_type)), -1)

  return (
    <div>
      {/* Progressive discipline tracker */}
      {showProgressive && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 20px', marginBottom: 20 }}>
          <SectionLabel>Progressive Discipline Stage</SectionLabel>
          <div style={{ display: 'flex', gap: 0 }}>
            {DA_STAGES.map((stage, i) => {
              const isActive = i === currentStage
              const isPast   = i < currentStage
              const color    = isActive ? 'var(--t-danger)' : isPast ? 'var(--t-warn)' : 'var(--t-line)'
              const textColor = isActive ? 'var(--t-danger)' : isPast ? 'var(--t-warn)' : 'var(--t-text-faint)'
              return (
                <div key={stage} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                  <div style={{
                    width: 24, height: 24, margin: '0 auto',
                    background: isActive ? 'rgba(255,77,125,.15)' : isPast ? 'rgba(255,179,71,.08)' : 'transparent',
                    border: `2px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: textColor,
                    position: 'relative', zIndex: 1,
                  }}>
                    {isPast || isActive ? (i + 1) : '○'}
                  </div>
                  {i < DA_STAGES.length - 1 && (
                    <div style={{
                      position: 'absolute', top: 11, left: '50%', right: '-50%',
                      height: 2, background: isPast ? 'var(--t-warn)' : 'var(--t-line)', zIndex: 0,
                    }} />
                  )}
                  <div style={{ fontSize: 9, color: textColor, marginTop: 6, fontWeight: isActive ? 700 : 400 }}>
                    {stage.split(' ').map((w, wi) => <div key={wi}>{w}</div>)}
                  </div>
                </div>
              )
            })}
          </div>
          {currentStage < 0 && (
            <div style={{ fontSize: 12, color: 'var(--t-success)', marginTop: 10, fontWeight: 600 }}>No disciplinary actions on record.</div>
          )}
        </div>
      )}

      {/* DAs table */}
      {das.length === 0 ? (
        <EmptyState>No disciplinary actions on record.</EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date', 'Type', 'Status', 'Issued By', 'Detail'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--t-text-muted)',
                    fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                    borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,.02)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {das.map((d, i) => {
                const statColor = d.status === 'active' ? 'var(--t-danger)' : d.status === 'under_review' ? 'var(--t-warn)' : 'var(--t-success)'
                const td = { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', fontSize: 12, verticalAlign: 'top' }
                return (
                  <tr key={d.id || i}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(d.da_date || d.created_at)}</td>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--t-text)' }}>{daLabel(d.da_type)}</td>
                    <td style={td}><span style={{ color: statColor, fontWeight: 700, fontSize: 11 }}>{(d.status || '—').toUpperCase()}</span></td>
                    <td style={{ ...td, color: 'var(--t-text-muted)' }}>{d.issuer_name || '—'}</td>
                    <td style={{ ...td, color: 'var(--t-text-muted)' }}>{d.description || '—'}</td>
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

function TrainingTab({ emp }) {
  const rows = emp.trainingRows
  const statusColor = s => s === 'Current' ? 'var(--t-success)' : s === 'Expiring Soon' || s === 'In Progress' ? 'var(--t-warn)' : 'var(--t-danger)'
  if (rows.length === 0) return <EmptyState>No training records on file for this employee.</EmptyState>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Module Name', 'Category', 'Completed', 'Score', 'Expires', 'Status'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', color: 'var(--t-text-muted)',
                fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,.02)', whiteSpace: 'nowrap',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const td = { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', fontSize: 12 }
            const sc = statusColor(r.status)
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                <td style={{ ...td, fontWeight: 600, color: 'var(--t-text)' }}>{r.module}</td>
                <td style={{ ...td, color: 'var(--t-text-muted)' }}>{r.category}</td>
                <td style={td}>{r.completed}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.score == null ? 'var(--t-text-faint)' : r.score >= 85 ? 'var(--t-success)' : 'var(--t-warn)' }}>{r.score != null ? `${r.score}%` : '—'}</td>
                <td style={{ ...td, color: r.status === 'Expired' ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{r.expires}</td>
                <td style={td}><span style={{ color: sc, fontWeight: 700, fontSize: 11 }}>{r.status}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DocumentsTab({ emp }) {
  const docs = emp.documentRows
  const statusColor = s => {
    if (s === 'On File')  return 'var(--t-success)'
    if (s === 'Pending')  return 'var(--t-warn)'
    return 'var(--t-danger)'
  }
  const statusBg = s => {
    if (s === 'On File')  return 'rgba(29,233,182,.08)'
    if (s === 'Pending')  return 'rgba(255,179,71,.08)'
    return 'rgba(255,77,125,.08)'
  }
  if (docs.length === 0) return <EmptyState>No documents on file for this employee.</EmptyState>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {docs.map((d, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px',
          background: statusBg(d.status),
          border: `1px solid ${statusColor(d.status)}30`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{d.doc}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(d.status) }}>{d.status}</span>
        </div>
      ))}
    </div>
  )
}

function ScheduleTab({ emp, locationIds, actorId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const ids = Array.isArray(locationIds) && locationIds.length ? locationIds : []
    if (!ids.length || !emp?.name) { setRows([]); setLoading(false); return }
    setLoading(true)
    const mondayISO = (w) => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + w * 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    Promise.all([-1, 0, 1, 2].map(w => sb.rpc('get_week_schedule', { p_node_ids: ids, p_week_start: mondayISO(w), p_actor: actorId }).then(r => r.data || []).catch(() => [])))
      .then(weeks => {
        if (!alive) return
        const all = weeks.flat().filter(r => (r.full_name || '').toLowerCase() === (emp.name || '').toLowerCase())
        all.sort((a, b) => new Date(a.shift_date) - new Date(b.shift_date))
        setRows(all); setLoading(false)
      })
    return () => { alive = false }
  }, [emp?.name, actorId, JSON.stringify(locationIds)])
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'
  const fmtT = t => t ? String(t).slice(0, 5) : '—'
  return (
    <div>
      <SectionLabel>Scheduled Shifts — {emp.name}</SectionLabel>
      {loading ? <div style={{ padding: 16, color: 'var(--t-accent)', fontSize: 13 }}>Loading schedule…</div> :
        rows.length === 0 ? <div style={{ padding: 16, color: 'var(--t-text-faint)', fontSize: 13 }}>No scheduled shifts found for {emp.name} in this 4-week window. Published shifts appear here automatically.</div> :
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--t-surface-2)' }}>{['Date', 'Shift', 'Location', 'Role', 'Status'].map(h => <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{fmtD(r.shift_date)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-accent)' }}>{fmtT(r.start_time)}–{fmtT(r.end_time)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{r.node_name || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{r.role_name || '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{r.status || 'scheduled'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function Employee360() {
  const { session }              = useAuth()
  const person                   = session?.person
  const { locationIds }          = useScope()
  const ff360                    = useFeatureFlag('employee_360')
  const ffHealthScore            = useFeatureFlag('health_score')
  const ffTimeline               = useFeatureFlag('employee_timeline')
  const ffAttendancePoints       = useFeatureFlag('attendance_points')
  const ffProgressiveDiscipline  = useFeatureFlag('progressive_discipline')

  const role_name   = session?.person?.role_name ?? ''
  const isManager   = /ceo|manager|hr|coo|admin|owner/i.test(role_name)
  const actorId     = person?.id || getSession().id || null

  const routerLoc = useLocation()
  const navrr = useNavigate()
  const targetPid  = routerLoc.state?.personId || null

  const [roster, setRoster]       = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab]             = useState('overview')
  const [file, setFile]           = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [das, setDas]             = useState([])
  const [attendance, setAttendance] = useState([])
  const [oneOnOnes, setOneOnOnes] = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [drill, setDrill]         = useState(null)

  const nodeKey = JSON.stringify(locationIds || [])

  // ── Roster (employee selector) + scoped record sets, per location scope ──────
  useEffect(() => {
    let alive = true
    const nodeIds = Array.isArray(locationIds) ? locationIds : []
    if (nodeIds.length === 0) { setRoster([]); setDas([]); setAttendance([]); setOneOnOnes([]); setRosterLoading(false); return }
    setRosterLoading(true)
    Promise.all([
      sb.rpc('get_roster', { p_node_ids: nodeIds, p_actor: actorId }).then(r => r.data || []).catch(() => []),
      sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }).then(r => r.data || []).catch(() => []),
      sb.rpc('get_attendance_overview', { p_node_ids: nodeIds }).then(r => r.data || []).catch(() => []),
      sb.rpc('get_one_on_ones', { p_node_ids: nodeIds, p_actor: actorId }).then(r => r.data || []).catch(() => []),
    ]).then(([r, d, a, o]) => {
      if (!alive) return
      setRoster(Array.isArray(r) ? r : [])
      setDas(Array.isArray(d) ? d : [])
      setAttendance(Array.isArray(a) ? a : [])
      setOneOnOnes(Array.isArray(o) ? o : [])
      setRosterLoading(false)
      setSelectedId(prev => {
        const list = Array.isArray(r) ? r : []
        if (targetPid && list.some(x => x.id === targetPid)) return targetPid
        if (prev && list.some(x => x.id === prev)) return prev
        return list[0]?.id || null
      })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, actorId, targetPid])

  // ── Per-employee file (profile, training, documents, assignments) ────────────
  useEffect(() => {
    let alive = true
    const nodeIds = Array.isArray(locationIds) ? locationIds : []
    if (!selectedId || nodeIds.length === 0) { setFile(null); return }
    setFileLoading(true)
    sb.rpc('hr_employee_file', { p_person_id: selectedId, p_node_ids: nodeIds })
      .then(({ data, error }) => {
        if (!alive) return
        setFile(error || !data ? null : data)
        setFileLoading(false)
      })
      .catch(() => { if (alive) { setFile(null); setFileLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, nodeKey])

  // ── View model — everything derived from real payloads ───────────────────────
  const emp = useMemo(() => {
    const rosterEntry = roster.find(r => r.id === selectedId) || null
    const p = file?.person || null
    const assignments = file?.assignments || []
    const primary = assignments.find(a => a.status === 'active') || assignments[0] || null
    const training = file?.training || []
    const documents = file?.documents || []

    const personDas = das
      .filter(d => d.person_id === selectedId)
      .sort((a, b) => ts(b.da_date || b.created_at) - ts(a.da_date || a.created_at))
    const attEntry = attendance.find(a => a.person_id === selectedId) || null
    const incidents = (attEntry?.incidents || []).slice().sort((a, b) => ts(b.date) - ts(a.date))
    const personOne = oneOnOnes
      .filter(o => o.employee_person_id === selectedId)
      .sort((a, b) => ts(b.meeting_date) - ts(a.meeting_date))

    const attPoints = incidents.filter(i => !i.expired).reduce((s, i) => s + (Number(i.pts) || 0), 0)
    const openDAs = personDas.filter(d => d.status === 'active').length
    const completedTraining = training.filter(t => t.status === 'completed')
    const trainingPct = training.length ? Math.round(completedTraining.length / training.length * 100) : 0
    const lastTraining = completedTraining
      .slice()
      .sort((a, b) => ts(b.completed_at) - ts(a.completed_at))[0] || null

    const hireDate = p?.created_at || rosterEntry?.effective_from || null
    const isActive = (p?.is_active ?? rosterEntry?.is_active) !== false

    const base = {
      id: selectedId,
      name: p?.full_name || rosterEntry?.full_name || '—',
      role: primary?.role || rosterEntry?.role_name || '—',
      loc: primary?.node_name || rosterEntry?.node_name || '—',
      hireDate,
      tenureDays: daysBetween(hireDate),
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      training,
      trainingRows: buildTrainingRows(training),
      trainingPct,
      documents,
      documentRows: documents.map(d => ({ doc: d.doc_type || d.name || d.title || d.type || 'Document', status: d.status || 'On File' })),
      das: personDas,
      openDAs,
      lastDA: personDas[0] || null,
      incidents,
      attPoints,
      oneOnOnes: personOne,
      lastTraining,
    }
    // Health score = honest composite derived only from real signals
    let hs = 100
    hs -= openDAs * 15
    hs -= (personDas.length - openDAs) * 5
    hs -= Math.round(attPoints) * 4
    if (training.length) hs = Math.round(hs * 0.85 + trainingPct * 0.15)
    base.healthScore = Math.max(0, Math.min(100, Math.round(hs)))
    base.timeline = buildTimeline(base)
    return base
  }, [roster, selectedId, file, das, attendance, oneOnOnes])

  if (!ff360) return <FeatureDisabled />
  if (!isManager) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>Managers Only</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Access to Employee 360 View requires a manager role.</div>
    </div>
  )

  const statusColor = s => s === 'ACTIVE' ? 'var(--t-success)' : 'var(--t-danger)'
  const statusBg    = s => s === 'ACTIVE' ? 'rgba(29,233,182,.15)' : 'rgba(255,77,125,.15)'
  const hScore      = emp.healthScore
  const hColor      = hScore >= 80 ? 'var(--t-success)' : hScore >= 65 ? 'var(--t-warn)' : 'var(--t-danger)'

  const selInput = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '9px 12px', fontSize: 13,
    minWidth: 240, cursor: 'pointer',
  }

  const TABS = [
    { id: 'overview',    label: 'Overview'  },
    ...(ffTimeline ? [{ id: 'timeline', label: 'Timeline' }] : []),
    { id: 'schedule',    label: 'Schedule'   },
    { id: 'attendance',  label: 'Attendance' },
    { id: 'discipline',  label: 'Discipline' },
    { id: 'training',    label: 'Training'   },
    { id: 'documents',   label: 'Documents'  },
  ]

  const navTo = path => { navrr(path) }
  const hasEmployee = !!selectedId && roster.length > 0

  return (
    <div style={{ padding: '24px 28px', minHeight: '100%', color: 'var(--t-text)', paddingBottom: 100 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: 'var(--t-text)' }}>EMPLOYEE 360 VIEW</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
          Full employee profile — overview, timeline, attendance, discipline, training, documents
        </div>
      </div>

      {/* Employee Selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
          Select Employee
        </label>
        <select
          value={selectedId || ''}
          onChange={e => { setSelectedId(e.target.value || null); setTab('overview') }}
          style={selInput}
          disabled={rosterLoading || roster.length === 0}
        >
          {rosterLoading && <option value="">Loading roster…</option>}
          {!rosterLoading && roster.length === 0 && <option value="">No employees in scope</option>}
          {roster.map(r => (
            <option key={r.id} value={r.id}>
              {r.full_name} — {r.role_name || '—'} · {r.node_name || '—'}
            </option>
          ))}
        </select>
        {hasEmployee && (
          <div style={{ fontSize: 10, color: 'var(--t-success)', marginTop: 6, fontWeight: 700, letterSpacing: 0.5 }}>
            ● LIVE — profile, attendance, discipline, training &amp; documents from Supabase
          </div>
        )}
      </div>

      {!hasEmployee ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          {rosterLoading ? 'Loading employees…' : 'No employees are available in the current location scope.'}
        </div>
      ) : (
        <>
          {/* Employee Card */}
          <div style={{
            background: 'var(--t-surface)', border: '1px solid var(--t-line)',
            padding: '20px 24px', marginBottom: 20,
            display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap',
          }}>
            {/* Avatar */}
            <div style={{
              width: 56, height: 56, flexShrink: 0,
              background: 'rgba(0,229,255,.12)', border: '2px solid var(--t-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 18, color: 'var(--t-accent)',
            }}>
              {ini(emp.name)}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', marginBottom: 6 }}>
                {emp.name}{fileLoading && <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 8 }}>loading…</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <Badge type="cyan">{emp.role}</Badge>
                <Badge type="blue">{emp.loc}</Badge>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Hired {fmtDate(emp.hireDate)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 10px',
                  background: statusBg(emp.status), color: statusColor(emp.status),
                }}>
                  {emp.status}
                </span>
                {ffHealthScore && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: `${hColor}22`, border: `1px solid ${hColor}60`,
                    padding: '2px 10px',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Health Score</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: hColor, fontFamily: 'var(--font-mono)' }}>{hScore}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map(t => (
              <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </TabBtn>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ marginBottom: 24 }}>
            {tab === 'schedule'   && <ScheduleTab emp={emp} locationIds={locationIds} actorId={actorId} />}
            {tab === 'overview'   && <OverviewTab emp={emp} onDrill={setDrill} />}
            {tab === 'timeline'   && ffTimeline && <TimelineTab emp={emp} />}
            {tab === 'attendance' && <AttendanceTab emp={emp} showPoints={!!ffAttendancePoints} />}
            {tab === 'discipline' && <DisciplineTab emp={emp} showProgressive={!!ffProgressiveDiscipline} />}
            {tab === 'training'   && <TrainingTab emp={emp} />}
            {tab === 'documents'  && <DocumentsTab emp={emp} />}
          </div>
        </>
      )}

      {/* Sticky Action Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--t-surface)', borderTop: '1px solid var(--t-line)',
        padding: '12px 28px', display: 'flex', gap: 10, flexWrap: 'wrap',
        zIndex: 900,
      }}>
        <SmBtn onClick={() => navTo('/disciplinary')} danger>Issue DA</SmBtn>
        <SmBtn onClick={() => navTo('/one-on-ones')}>Log 1-on-1</SmBtn>
        <SmBtn onClick={() => navTo('/coaching-log')}>Add Coaching Note</SmBtn>
        <SmBtn onClick={() => navTo('/hr-investigations')}>Start Investigation</SmBtn>
        <SmBtn onClick={() => navTo('/schedule')}>View Schedule</SmBtn>
      </div>

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
