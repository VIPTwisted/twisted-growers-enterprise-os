import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'
import { companyName } from '../lib/config.js'

/* ─────────────────────────────────────────────────────────────────
   Training & Compliance — 100% real data.
   Catalog + per-employee compliance matrix come from
   hr_training_overview(p_node_ids). Writes go through
   hr_training_upsert_module and hr_training_set_progress. No mock
   employees, no seeded matrix, no localStorage datastore.
───────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const isHRRole = (roleName = '') =>
  ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.toLowerCase().includes(r))

const getCourse = (id, modules) => modules.find(c => c.id === id)

const daysUntil = (d) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null

const statusColor = (s) => {
  if (s === 'complete')    return '#2ad6a0'
  if (s === 'in-progress') return '#ffb800'
  if (s === 'overdue')     return '#ff4d7d'
  return 'rgba(120,160,220,.25)'
}

const statusIcon = (s) => {
  if (s === 'complete')    return '✓'
  if (s === 'in-progress') return '◷'
  if (s === 'overdue')     return '⚠'
  if (s === 'needs-retake')return '↻'
  return '✗'
}

const titleCase = (s = '') => s.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())

const CATEGORY_COLORS = {
  Policy:     '#00e5ff',
  Compliance: '#ff4d7d',
  Operations: '#ffb800',
  Product:    '#9b59b6',
  Service:    '#2ad6a0',
  Leadership: '#3498db',
  Safety:     '#ff6b35',
  Wellness:   '#34d399',
  General:    '#7f8fa6',
}

function catBadgeStyle(cat) {
  const c = CATEGORY_COLORS[cat] || '#aaa'
  return {
    display: 'inline-block',
    padding: '2px 7px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: c,
    border: `1px solid ${c}`,
    background: `${c}18`,
  }
}

function ProgressBar({ pct, slim }) {
  const c = pct === 100 ? '#2ad6a0' : pct >= 70 ? '#ffb800' : '#ff4d7d'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: slim ? 60 : 90, height: slim ? 4 : 6,
        background: 'rgba(120,160,220,.14)', border: '1px solid var(--t-line)', flexShrink: 0,
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: c }}>{pct}%</span>
    </div>
  )
}

function KpiTile({ label, value, sub, color, small, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
      padding: small ? '10px 12px' : '14px 16px', minWidth: small ? 80 : 110,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 18 : 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || 'var(--t-text)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13, border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   KPI PANEL
───────────────────────────────────────────────────────────────── */
function KpiPanel({ matrix, modules }) {
  const reqIds = useMemo(() => modules.filter(m => m.required).map(m => m.id), [modules])
  const locations = useMemo(() => Array.from(new Set(matrix.map(e => e.location).filter(l => l && l !== '—'))), [matrix])
  const totalEmp = matrix.length || 1

  const empStats = useMemo(() => matrix.map(emp => {
    const reqRecs = emp.records.filter(r => reqIds.includes(r.course_id))
    const done    = reqRecs.filter(r => r.status === 'complete').length
    const pct     = reqRecs.length ? Math.round((done / reqRecs.length) * 100) : 0
    const overdue = reqRecs.filter(r => r.status === 'overdue').length
    const inProg  = reqRecs.filter(r => r.status === 'in-progress').length
    return { ...emp, reqDone: done, reqTotal: reqRecs.length, pct, overdue, inProg, isCompliant: reqRecs.length > 0 && done === reqRecs.length }
  }), [matrix, reqIds])

  const fullyCompliant = empStats.filter(e => e.isCompliant).length
  const partial        = empStats.filter(e => !e.isCompliant && e.pct > 0).length
  const nonCompliant   = empStats.filter(e => e.pct === 0).length
  const overallPct     = Math.round(empStats.reduce((a, e) => a + e.pct, 0) / totalEmp)
  const totalOverdue   = empStats.reduce((a, e) => a + e.overdue, 0)
  const neverStarted   = empStats.filter(e => e.pct === 0 && e.reqDone === 0).length
  const stalled        = empStats.filter(e => e.inProg > 0 && e.pct < 30).length
  const complianceGap  = Math.max(0, 90 - overallPct)

  const allRecords = matrix.flatMap(e => e.records)
  const totalRecs  = allRecords.length || 1
  const completeRecs = allRecords.filter(r => r.status === 'complete').length
  const completionRate = Math.round((completeRecs / totalRecs) * 100)
  const scores = allRecords.filter(r => r.score != null).map(r => r.score)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const passRate = scores.length ? Math.round(scores.filter(s => s >= 75).length / scores.length * 100) : 0
  const failedAttempts = allRecords.filter(r => r.score != null && r.score < 75).length
  const retakesNeeded  = allRecords.filter(r => r.status === 'needs-retake').length

  // Real expiry: records with an expires_at inside the next 30 days.
  const expiring30 = allRecords.filter(r => { const dl = daysUntil(r.expires_at); return dl != null && dl >= 0 && dl <= 30 }).length
  // Real attempt effort.
  const attemptRecs = allRecords.filter(r => r.attempts > 0)
  const avgAttempts = attemptRecs.length ? (attemptRecs.reduce((a, r) => a + r.attempts, 0) / attemptRecs.length).toFixed(1) : '0'

  // New hires (created in last 90d) with zero activity.
  const newHiresNoEnroll = matrix.filter(e => {
    const dl = daysUntil(e.hire_date)
    const isNew = dl != null && dl >= -90
    return isNew && e.records.every(r => r.status === 'not-started')
  }).length

  const locationStats = locations.map(loc => {
    const locEmps = empStats.filter(e => e.location === loc)
    if (!locEmps.length) return null
    const avg  = Math.round(locEmps.reduce((a, e) => a + e.pct, 0) / locEmps.length)
    const full = locEmps.filter(e => e.isCompliant).length
    const part = locEmps.filter(e => !e.isCompliant && e.pct > 0).length
    const ov   = locEmps.reduce((a, e) => a + e.overdue, 0)
    const dates = locEmps.flatMap(e => e.records.map(r => r.completion_date || r.start_date)).filter(Boolean)
    const lastUpdated = dates.length ? fmt(dates.sort().slice(-1)[0]) : '—'
    return { loc, avg, full, part, ov, lastUpdated, count: locEmps.length }
  }).filter(Boolean)

  const sRow = { borderBottom: '1px solid var(--t-line)', padding: '8px 10px', fontSize: 12, color: 'var(--t-text)' }
  const sHdr = { ...sRow, fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', background: 'var(--t-surface-2)' }

  // ── Drill-down wiring ───────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, columns, accent) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  const EMP_COLS = [
    { key: 'name', label: 'Employee', value: e => e.name },
    { key: 'location', label: 'Location', value: e => e.location },
    { key: 'role', label: 'Role', value: e => e.role },
    { key: 'pct', label: 'Compliance', value: e => `${e.pct}%`, align: 'right', sortKey: e => e.pct },
    { key: 'reqDone', label: 'Required Done', value: e => `${e.reqDone}/${e.reqTotal}`, align: 'right', sortKey: e => e.reqDone },
    { key: 'overdue', label: 'Overdue', value: e => e.overdue, align: 'right', sortKey: e => e.overdue },
    { key: 'inProg', label: 'In Progress', value: e => e.inProg, align: 'right', sortKey: e => e.inProg },
  ]
  const flatRecords = useMemo(() => matrix.flatMap(emp => emp.records.map(rec => ({ emp, course: getCourse(rec.course_id, modules), rec }))), [matrix, modules])
  const REC_COLS = [
    { key: 'emp', label: 'Employee', value: r => r.emp.name },
    { key: 'loc', label: 'Location', value: r => r.emp.location },
    { key: 'course', label: 'Course', value: r => r.course?.name || '—' },
    { key: 'status', label: 'Status', value: r => titleCase(r.rec.status) },
    { key: 'progress', label: 'Progress', value: r => `${r.rec.progress_pct}%`, align: 'right', sortKey: r => r.rec.progress_pct },
    { key: 'score', label: 'Score', value: r => r.rec.score != null ? `${r.rec.score}%` : '—', align: 'right', sortKey: r => r.rec.score ?? -1 },
    { key: 'attempts', label: 'Attempts', value: r => r.rec.attempts || 0, align: 'right', sortKey: r => r.rec.attempts || 0 },
  ]
  const COURSE_COLS = [
    { key: 'name', label: 'Course', value: c => c.name },
    { key: 'category', label: 'Category', value: c => c.category },
    { key: 'required', label: 'Required', value: c => c.required ? 'Yes' : 'No' },
    { key: 'duration', label: 'Duration', value: c => `${c.duration}m`, align: 'right', sortKey: c => c.duration },
    { key: 'passing_score', label: 'Passing', value: c => `${c.passing_score}%`, align: 'right', sortKey: c => c.passing_score },
    { key: 'enrolled', label: 'Enrolled', value: c => c.enrolled ?? '—', align: 'right', sortKey: c => c.enrolled ?? 0 },
    { key: 'completionPct', label: 'Completion', value: c => c.completionPct != null ? `${c.completionPct}%` : '—', align: 'right', sortKey: c => c.completionPct ?? 0 },
  ]
  const courseRows = (list) => list.map(c => {
    const recs = matrix.flatMap(e => e.records.filter(r => r.course_id === c.id))
    const done = recs.filter(r => r.status === 'complete').length
    return { ...c, enrolled: recs.length, completionPct: recs.length ? Math.round(done / recs.length * 100) : 0 }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
      {/* Row 1 — Overall Compliance */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 8 }}>Overall Compliance</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KpiTile label="Overall Compliance" value={`${overallPct}%`} color={overallPct >= 90 ? '#2ad6a0' : overallPct >= 70 ? '#ffb800' : '#ff4d7d'}
            onClick={() => openDrill('Overall Compliance — All Employees', empStats, EMP_COLS, 'var(--t-accent)')} />
          <KpiTile label="Fully Compliant" value={fullyCompliant} color="#2ad6a0"
            onClick={() => openDrill('Fully Compliant Employees', empStats.filter(e => e.isCompliant), EMP_COLS, '#2ad6a0')} />
          <KpiTile label="Partial Compliance" value={partial} color="#ffb800"
            onClick={() => openDrill('Partial Compliance', empStats.filter(e => !e.isCompliant && e.pct > 0), EMP_COLS, '#ffb800')} />
          <KpiTile label="Non-Compliant" value={nonCompliant} color="#ff4d7d"
            onClick={() => openDrill('Non-Compliant Employees', empStats.filter(e => e.pct === 0), EMP_COLS, '#ff4d7d')} />
          <KpiTile label="Expiring (30d)" value={expiring30} color={expiring30 > 0 ? '#ffb800' : '#2ad6a0'} sub="certifications"
            onClick={() => openDrill('Certifications Expiring in 30 Days', flatRecords.filter(r => { const dl = daysUntil(r.rec.expires_at); return dl != null && dl >= 0 && dl <= 30 }), REC_COLS, '#ffb800')} />
          <KpiTile label="Overdue Courses" value={totalOverdue} color={totalOverdue > 0 ? '#ff4d7d' : '#2ad6a0'}
            onClick={() => openDrill('Overdue Required Courses', flatRecords.filter(r => r.rec.status === 'overdue' && reqIds.includes(r.rec.course_id)), REC_COLS, '#ff4d7d')} />
        </div>
      </div>

      {/* Row 2 — By Location */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 8 }}>By Location</div>
        {locationStats.length === 0 ? (
          <EmptyState>No employees in the selected scope yet.</EmptyState>
        ) : (
          <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 90px 80px 70px 70px 110px', ...sHdr }}>
              <span>Location</span><span>Compliance %</span><span>Fully Done</span>
              <span>Partial</span><span>Overdue</span><span>Last Updated</span>
            </div>
            {locationStats.map(s => (
              <div key={s.loc} style={{ display: 'grid', gridTemplateColumns: '160px 90px 80px 70px 70px 110px', ...sRow, background: 'var(--t-surface)' }}>
                <span style={{ fontWeight: 600 }}>{s.loc}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: s.avg >= 90 ? '#2ad6a0' : s.avg >= 70 ? '#ffb800' : '#ff4d7d' }}>{s.avg}%</span>
                <span style={{ color: '#2ad6a0' }}>{s.full}</span>
                <span style={{ color: '#ffb800' }}>{s.part}</span>
                <span style={{ color: '#ff4d7d' }}>{s.ov}</span>
                <span style={{ color: 'var(--t-text-muted)', fontSize: 11 }}>{s.lastUpdated}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3 — Course Stats */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 8 }}>Course Stats</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KpiTile label="Total Courses" value={modules.length}
            onClick={() => openDrill('All Courses', courseRows(modules), COURSE_COLS, 'var(--t-accent)')} />
          <KpiTile label="Required" value={reqIds.length} color="var(--t-accent)"
            onClick={() => openDrill('Required Courses', courseRows(modules.filter(c => c.required)), COURSE_COLS, 'var(--t-accent)')} />
          <KpiTile label="Completion Rate" value={`${completionRate}%`} color={completionRate >= 70 ? '#2ad6a0' : '#ffb800'}
            onClick={() => openDrill('Completed Training Records', flatRecords.filter(r => r.rec.status === 'complete'), REC_COLS, '#2ad6a0')} />
          <KpiTile label="Avg Score" value={scores.length ? `${avgScore}%` : '—'} color={avgScore >= 80 ? '#2ad6a0' : '#ffb800'}
            onClick={() => openDrill('Scored Records', flatRecords.filter(r => r.rec.score != null), REC_COLS, '#ffb800')} />
          <KpiTile label="Pass Rate" value={scores.length ? `${passRate}%` : '—'} color={passRate >= 80 ? '#2ad6a0' : '#ff4d7d'}
            onClick={() => openDrill('Passing Records (≥75%)', flatRecords.filter(r => r.rec.score != null && r.rec.score >= 75), REC_COLS, '#2ad6a0')} />
          <KpiTile label="Avg Attempts" value={avgAttempts} sub="per attempted course" color="var(--t-text-muted)"
            onClick={() => openDrill('Attempted Records', flatRecords.filter(r => (r.rec.attempts || 0) > 0), REC_COLS, 'var(--t-text-muted)')} />
        </div>
      </div>

      {/* Row 4 — Risk Indicators */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 8 }}>Risk Indicators</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KpiTile label="Never Started" value={neverStarted} color={neverStarted > 0 ? '#ff4d7d' : '#2ad6a0'} sub="employees"
            onClick={() => openDrill('Never-Started Employees', empStats.filter(e => e.pct === 0 && e.reqDone === 0), EMP_COLS, '#ff4d7d')} />
          <KpiTile label="Stalled" value={stalled} color={stalled > 2 ? '#ff4d7d' : '#ffb800'} sub="low progress"
            onClick={() => openDrill('Stalled Employees', empStats.filter(e => e.inProg > 0 && e.pct < 30), EMP_COLS, '#ffb800')} />
          <KpiTile label="Failed Attempts" value={failedAttempts} color={failedAttempts > 5 ? '#ff4d7d' : '#ffb800'}
            onClick={() => openDrill('Failed Attempts (<75%)', flatRecords.filter(r => r.rec.score != null && r.rec.score < 75), REC_COLS, '#ff4d7d')} />
          <KpiTile label="Retakes Needed" value={retakesNeeded} color={retakesNeeded > 0 ? '#ffb800' : '#2ad6a0'}
            onClick={() => openDrill('Retakes Needed', flatRecords.filter(r => r.rec.status === 'needs-retake'), REC_COLS, '#ffb800')} />
          <KpiTile label="New Hires Not Enrolled" value={newHiresNoEnroll} color={newHiresNoEnroll > 0 ? '#ff4d7d' : '#2ad6a0'}
            onClick={() => openDrill('New Hires Not Enrolled', empStats.filter(e => { const dl = daysUntil(e.hire_date); return dl != null && dl >= -90 && e.records.every(r => r.status === 'not-started') }), EMP_COLS, '#ff4d7d')} />
          <KpiTile label="Gap vs 90% Target" value={complianceGap > 0 ? `-${complianceGap}%` : '✓'} color={complianceGap > 0 ? '#ff4d7d' : '#2ad6a0'}
            onClick={() => openDrill('Below-Target Employees (<90%)', empStats.filter(e => e.pct < 90), EMP_COLS, '#ff4d7d')} />
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   CELL DETAIL MODAL
───────────────────────────────────────────────────────────────── */
function CellModal({ cell, onClose }) {
  if (!cell) return null
  const { emp, rec, course } = cell
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 440, padding: 28, position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 4 }}>Training Record</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t-text)', marginBottom: 2 }}>{course?.name || '—'}</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>{emp.name} · {emp.location}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Status',     value: titleCase(rec.status), color: statusColor(rec.status) },
            { label: 'Progress',   value: `${rec.progress_pct}%`, color: statusColor(rec.status) },
            { label: 'Score',      value: rec.score != null ? `${rec.score}%` : '—', color: rec.score != null ? (rec.score >= (course?.passing_score || 0) ? '#2ad6a0' : '#ff4d7d') : 'var(--t-text-muted)' },
            { label: 'Attempts',   value: rec.attempts || 0 },
            { label: 'Started',    value: fmt(rec.start_date) },
            { label: 'Completed',  value: fmt(rec.completion_date) },
          ].map(f => (
            <div key={f.label} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 3 }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: f.color || 'var(--t-text)' }}>{f.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--t-text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Passing Score Required</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{course?.passing_score ?? '—'}%</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Category</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{course?.category || '—'}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Duration</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{course?.duration ?? '—'} min</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Certification Expires</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{fmt(rec.expires_at)}</span></div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB 1 — COMPLIANCE MATRIX
───────────────────────────────────────────────────────────────── */
function ComplianceMatrix({ matrix, modules }) {
  const [filterLoc,    setFilterLoc]    = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterRole,   setFilterRole]   = useState('All')
  const [cellModal,    setCellModal]    = useState(null)

  const reqIds    = useMemo(() => modules.filter(m => m.required).map(m => m.id), [modules])
  const locations = useMemo(() => Array.from(new Set(matrix.map(e => e.location).filter(l => l && l !== '—'))), [matrix])
  const roles     = useMemo(() => ['All', ...Array.from(new Set(matrix.map(e => e.role).filter(r => r && r !== '—')))], [matrix])

  const filtered = useMemo(() => matrix.filter(emp => {
    if (filterLoc !== 'All' && emp.location !== filterLoc) return false
    if (filterRole !== 'All' && emp.role !== filterRole)   return false
    if (filterStatus !== 'All') {
      const reqRecs = emp.records.filter(r => reqIds.includes(r.course_id))
      const done    = reqRecs.filter(r => r.status === 'complete').length
      const pct     = reqRecs.length ? Math.round(done / reqRecs.length * 100) : 0
      if (filterStatus === 'compliant'   && pct < 100)  return false
      if (filterStatus === 'overdue'     && !reqRecs.some(r => r.status === 'overdue')) return false
      if (filterStatus === 'in-progress' && !reqRecs.some(r => r.status === 'in-progress')) return false
    }
    return true
  }), [matrix, filterLoc, filterStatus, filterRole, reqIds])

  const courseCompletionPct = useMemo(() => modules.map(course => {
    const recs = matrix.flatMap(e => e.records.filter(r => r.course_id === course.id))
    const done = recs.filter(r => r.status === 'complete').length
    return recs.length ? Math.round(done / recs.length * 100) : 0
  }), [matrix, modules])

  function exportCSV() {
    const header = ['Employee', 'Location', 'Role', ...modules.map(c => c.name)].join(',')
    const rows = filtered.map(emp => {
      const byId = Object.fromEntries(emp.records.map(r => [r.course_id, r.status]))
      return [emp.name, emp.location, emp.role, ...modules.map(c => byId[c.id] || 'not-started')].join(',')
    })
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'compliance_matrix.csv'; a.click()
  }

  const thStyle = {
    padding: '9px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--t-text-muted)', whiteSpace: 'nowrap',
    background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)',
    borderRight: '1px solid var(--t-line)', position: 'sticky', top: 0, zIndex: 2,
  }
  const tdEmp = {
    padding: '8px 10px', fontSize: 12, fontWeight: 600, color: 'var(--t-text)',
    whiteSpace: 'nowrap', borderBottom: '1px solid var(--t-line)',
    borderRight: '1px solid var(--t-line)', background: 'var(--t-surface)',
    position: 'sticky', left: 0, zIndex: 1,
  }

  if (!modules.length) return <EmptyState>No courses in the catalog yet. Add one from the “Add Course” tab.</EmptyState>
  if (!matrix.length)  return <EmptyState>No employees in the selected scope yet.</EmptyState>

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
          <option value="All">All Statuses</option>
          <option value="compliant">Compliant</option>
          <option value="in-progress">In Progress</option>
          <option value="overdue">Overdue</option>
        </select>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={exportCSV} style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-accent)', cursor: 'pointer' }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Matrix */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 500, border: '1px solid var(--t-line)' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 900, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: 160, left: 0, zIndex: 3, position: 'sticky' }}>Employee</th>
              {modules.map(c => (
                <th key={c.id} style={{ ...thStyle, minWidth: 90, textAlign: 'center' }}>
                  {c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => {
              const byId = Object.fromEntries(emp.records.map(r => [r.course_id, r]))
              return (
                <tr key={emp.id}>
                  <td style={tdEmp}>
                    <div style={{ fontWeight: 700 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 400 }}>{emp.location} · {emp.role}</div>
                  </td>
                  {modules.map(course => {
                    const rec = byId[course.id] || { course_id: course.id, status: 'not-started', progress_pct: 0, score: null, attempts: 0 }
                    const bg = rec.status === 'complete' ? 'rgba(42,214,160,.13)' : rec.status === 'in-progress' ? 'rgba(255,184,0,.10)' : rec.status === 'overdue' ? 'rgba(255,77,125,.13)' : 'transparent'
                    return (
                      <td key={course.id}
                        onClick={() => setCellModal({ emp, rec, course })}
                        title={`${emp.name} — ${course.name}\nStatus: ${rec.status}\nScore: ${rec.score != null ? rec.score + '%' : 'N/A'}`}
                        style={{ padding: '6px', textAlign: 'center', background: bg, borderBottom: '1px solid var(--t-line)', borderRight: '1px solid var(--t-line)', cursor: 'pointer' }}>
                        <span style={{ fontSize: 15, color: statusColor(rec.status) }}>{statusIcon(rec.status)}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...tdEmp, fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', background: 'var(--t-surface-2)' }}>Course Completion %</td>
              {courseCompletionPct.map((pct, i) => (
                <td key={i} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--t-surface-2)', borderTop: '2px solid var(--t-line)', borderRight: '1px solid var(--t-line)' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct >= 80 ? '#2ad6a0' : pct >= 60 ? '#ffb800' : '#ff4d7d' }}>{pct}%</span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {cellModal && <CellModal cell={cellModal} onClose={() => setCellModal(null)} />}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB 2 — MY TRAINING
───────────────────────────────────────────────────────────────── */
function MyTraining({ matrix, modules, session, onProgressUpdate }) {
  const personId = session?.person?.id || null
  const [busy, setBusy] = useState(null)

  const myRow = useMemo(() => matrix.find(e => e.id === personId) || null, [matrix, personId])
  const reqIds = useMemo(() => modules.filter(m => m.required).map(m => m.id), [modules])

  const recById = useMemo(() => {
    if (!myRow) return {}
    return Object.fromEntries(myRow.records.map(r => [r.course_id, r]))
  }, [myRow])

  const recFor = (id) => recById[id] || { course_id: id, status: 'not-started', progress_pct: 0, score: null, attempts: 0 }

  async function handleAction(courseId, action) {
    if (!personId) return
    const status = action === 'Retake' ? 'needs-retake' : 'in-progress'
    setBusy(courseId)
    try {
      const { data, error } = await sb.rpc('hr_training_set_progress', {
        p_person_id: personId,
        p_module_id: courseId,
        p_status:    status,
        p_node_id:   myRow?.node_id ?? null,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'Could not update.')
      if (onProgressUpdate) await onProgressUpdate()
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: e.message || 'Could not update training.', type: 'error' } })) } catch (_) { /* non-browser */ }
    } finally {
      setBusy(null)
    }
  }

  const cardStyle = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }
  const rowStyle  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }

  // ── Drill-down wiring ───────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const myRows = useMemo(() => modules.map(c => ({ rec: recFor(c.id), course: c })), [modules, recById]) // eslint-disable-line react-hooks/exhaustive-deps
  const MY_COLS = [
    { key: 'course', label: 'Course', value: r => r.course?.name || '—' },
    { key: 'category', label: 'Category', value: r => r.course?.category || '—' },
    { key: 'required', label: 'Required', value: r => r.course?.required ? 'Yes' : 'No' },
    { key: 'status', label: 'Status', value: r => titleCase(r.rec.status) },
    { key: 'progress', label: 'Progress', value: r => `${r.rec.progress_pct}%`, align: 'right', sortKey: r => r.rec.progress_pct },
    { key: 'score', label: 'Score', value: r => r.rec.score != null ? `${r.rec.score}%` : '—', align: 'right', sortKey: r => r.rec.score ?? -1 },
  ]
  const openDrill = (title, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: MY_COLS, rows, accent })

  if (!modules.length) return <EmptyState>No courses in the catalog yet.</EmptyState>
  if (!personId)       return <EmptyState>Sign in to view your training assignments.</EmptyState>
  if (!myRow)          return <EmptyState>You have no training records at your assigned location yet.</EmptyState>

  const done     = modules.filter(c => recFor(c.id).status === 'complete').length
  const total    = modules.length
  const reqDone  = reqIds.filter(id => recFor(id).status === 'complete').length
  const reqTotal = reqIds.length
  const overdue  = modules.filter(c => recFor(c.id).status === 'overdue').length
  const nextDue  = modules.find(c => { const s = recFor(c.id).status; return s === 'not-started' || s === 'overdue' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <KpiTile label="Courses Done" value={`${done}/${total}`} color="var(--t-accent)"
          onClick={() => openDrill('My Completed Courses', myRows.filter(r => r.rec.status === 'complete'), 'var(--t-accent)')} />
        <KpiTile label="Required Done" value={`${reqDone}/${reqTotal}`} color={reqTotal > 0 && reqDone === reqTotal ? '#2ad6a0' : '#ffb800'}
          onClick={() => openDrill('My Required Courses', myRows.filter(r => reqIds.includes(r.course.id)), '#2ad6a0')} />
        <KpiTile label="Overdue" value={overdue} color={overdue > 0 ? '#ff4d7d' : '#2ad6a0'}
          onClick={() => openDrill('My Overdue Courses', myRows.filter(r => r.rec.status === 'overdue'), '#ff4d7d')} />
        <KpiTile label="Next Due" value={nextDue ? nextDue.name.split(' ').slice(0, 2).join(' ') + '…' : '✓ All clear'} color={nextDue ? '#ffb800' : '#2ad6a0'}
          onClick={() => openDrill('My Not-Started / Overdue Courses', myRows.filter(r => r.rec.status === 'not-started' || r.rec.status === 'overdue'), '#ffb800')} />
      </div>

      {/* Course cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {modules.map(course => {
          const rec   = recFor(course.id)
          const s     = rec.status
          const color = statusColor(s)
          const label = s === 'not-started' ? 'Start' : s === 'in-progress' ? 'Resume' : s === 'complete' ? 'Review' : 'Retake'
          const isReview = s === 'complete'
          return (
            <div key={course.id} style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
              <div style={rowStyle}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{course.name}</div>
                  <span className={course.required ? 'badge red' : 'badge blue'}>{course.required ? 'Required' : 'Optional'}</span>
                  <span style={catBadgeStyle(course.category)}>{course.category}</span>
                </div>
                <span style={{ fontSize: 13, color, fontWeight: 700, whiteSpace: 'nowrap' }}>{statusIcon(s)} {titleCase(s)}</span>
              </div>

              {s === 'in-progress' && <div><ProgressBar pct={rec.progress_pct} /></div>}

              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t-text-muted)', flexWrap: 'wrap' }}>
                <span>⏱ {course.duration} min</span>
                <span>v{course.version}</span>
                <span>Pass: {course.passing_score}%</span>
                {rec.score != null && <span style={{ color: rec.score >= course.passing_score ? '#2ad6a0' : '#ff4d7d', fontWeight: 700 }}>Score: {rec.score}%</span>}
                {rec.completion_date && <span>Completed {fmt(rec.completion_date)}</span>}
                {s === 'overdue' && <span style={{ color: '#ff4d7d', fontWeight: 700 }}>⚠ OVERDUE</span>}
              </div>

              <div>
                <button
                  onClick={() => !isReview && handleAction(course.id, label)}
                  disabled={busy === course.id || isReview}
                  style={{
                    padding: '6px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
                    textTransform: 'uppercase', cursor: isReview ? 'default' : (busy === course.id ? 'wait' : 'pointer'),
                    background: isReview ? 'transparent' : 'var(--t-accent)',
                    color: isReview ? 'var(--t-text-muted)' : '#000',
                    border: isReview ? '1px solid var(--t-line)' : 'none',
                    opacity: busy === course.id ? .6 : 1,
                  }}>
                  {busy === course.id ? 'Saving…' : label}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB 3 — COURSES
───────────────────────────────────────────────────────────────── */
function CourseDetail({ course, matrix, onClose }) {
  const recs = matrix.flatMap(e => e.records.filter(r => r.course_id === course.id))
  const done = recs.filter(r => r.status === 'complete').length
  const pct  = recs.length ? Math.round(done / recs.length * 100) : 0
  const objectives = (course.objectives || '').split('\n').map(o => o.trim()).filter(Boolean)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 500, padding: 28, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>{course.name}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={catBadgeStyle(course.category)}>{course.category}</span>
              <span className={course.required ? 'badge red' : 'badge blue'}>{course.required ? 'Required' : 'Optional'}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          <KpiTile label="Completion" value={`${pct}%`} color={pct >= 80 ? '#2ad6a0' : '#ffb800'} small />
          <KpiTile label="Enrolled" value={recs.length} small />
          <KpiTile label="Duration" value={`${course.duration}m`} small />
        </div>

        {course.description && (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
            <strong style={{ color: 'var(--t-text)', display: 'block', marginBottom: 4 }}>About this course</strong>
            {course.description}
          </div>
        )}

        {objectives.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14 }}>
            <strong style={{ color: 'var(--t-text)', display: 'block', marginBottom: 6 }}>Objectives</strong>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
              {objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t-text-muted)', borderTop: '1px solid var(--t-line)', paddingTop: 14 }}>
          <span>Passing Score: <strong style={{ color: 'var(--t-text)' }}>{course.passing_score}%</strong></span>
          <span>Version: <strong style={{ color: 'var(--t-text)' }}>v{course.version}</strong></span>
          <span>Renews: <strong style={{ color: 'var(--t-text)' }}>{course.expires_in_days ? `${course.expires_in_days}d` : 'No expiry'}</strong></span>
        </div>
      </div>
    </div>
  )
}

function Courses({ matrix, modules }) {
  const [filterCat, setFilterCat] = useState('All')
  const [filterReq, setFilterReq] = useState('All')
  const [detail,    setDetail]    = useState(null)

  const cats = useMemo(() => ['All', ...Array.from(new Set(modules.map(c => c.category)))], [modules])

  const filtered = useMemo(() => modules.filter(c => {
    if (filterCat !== 'All' && c.category !== filterCat) return false
    if (filterReq === 'required' && !c.required) return false
    if (filterReq === 'optional' && c.required)  return false
    return true
  }), [modules, filterCat, filterReq])

  if (!modules.length) return <EmptyState>No courses in the catalog yet. Add one from the “Add Course” tab.</EmptyState>

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterReq} onChange={e => setFilterReq(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
          <option value="All">Required &amp; Optional</option>
          <option value="required">Required Only</option>
          <option value="optional">Optional Only</option>
        </select>
      </div>

      {/* Course Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map(course => {
          const recs = matrix.flatMap(e => e.records.filter(r => r.course_id === course.id))
          const done = recs.filter(r => r.status === 'complete').length
          const pct  = recs.length ? Math.round(done / recs.length * 100) : 0
          return (
            <div key={course.id}
              onClick={() => setDetail(course)}
              style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px', cursor: 'pointer', transition: 'border-color .2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--t-accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--t-line)'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.4, flex: 1, marginRight: 8 }}>{course.name}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={catBadgeStyle(course.category)}>{course.category}</span>
                <span className={course.required ? 'badge red' : 'badge blue'}>{course.required ? 'Required' : 'Optional'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10 }}>
                <span>⏱ {course.duration}m</span>
                <span>v{course.version}</span>
                <span>{recs.length} enrolled</span>
              </div>
              <ProgressBar pct={pct} slim />
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4 }}>{done} of {recs.length} employees complete</div>
            </div>
          )
        })}
      </div>

      {detail && <CourseDetail course={detail} matrix={matrix} onClose={() => setDetail(null)} />}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB 4 — ADD COURSE
───────────────────────────────────────────────────────────────── */
const CATEGORIES = ['Policy', 'Compliance', 'Operations', 'Product', 'Service', 'Leadership', 'Safety', 'Wellness', 'General']

function AddCourse({ onSaved }) {
  const blank = { name: '', category: 'Policy', description: '', objectives: '', duration: 30, required: true, passing_score: 80, version: '1.0', due_within: 365 }
  const [form,    setForm]    = useState(blank)
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [err,     setErr]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim())        { setErr('Course name is required.'); return }
    if (!form.description.trim()) { setErr('Description is required.'); return }
    setSaving(true); setErr('')
    try {
      const { data, error } = await sb.rpc('hr_training_upsert_module', {
        p_name:             form.name,
        p_category:         form.category || null,
        p_description:      form.description || null,
        p_duration_minutes: form.duration ? parseInt(form.duration, 10) : null,
        p_is_required:      !!form.required,
        p_expires_in_days:  form.due_within ? parseInt(form.due_within, 10) : null,
        p_passing_score:    form.passing_score ? parseInt(form.passing_score, 10) : null,
        p_version:          form.version || null,
        p_objectives:       form.objectives || null,
      })
      if (error) throw error
      if (data && data.ok === false) { setErr(data.error || 'Could not save course.'); setSaving(false); return }
    } catch (e2) {
      setErr(e2?.message || 'Could not save course — it was not created.')
      setSaving(false); return
    }
    setSaving(false); setSuccess(true)
    setForm(blank)
    if (onSaved) await onSaved()
    setTimeout(() => setSuccess(false), 3500)
  }

  const label = { fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6, display: 'block' }
  const input = { width: '100%', fontSize: 13, padding: '8px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', boxSizing: 'border-box' }
  const field = { display: 'flex', flexDirection: 'column', gap: 0 }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {success && (
        <div style={{ background: 'rgba(42,214,160,.15)', border: '1px solid #2ad6a0', color: '#2ad6a0', padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          ✓ Course saved to the catalog.
        </div>
      )}
      {err && <div style={{ background: 'rgba(255,77,125,.12)', border: '1px solid #ff4d7d', color: '#ff4d7d', padding: '10px 14px', fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={field}>
          <span style={label}>Course Name *</span>
          <input style={input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={"e.g. " + companyName() + " Employee Handbook"} />
        </div>
        <div style={field}>
          <span style={label}>Category</span>
          <select style={input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={field}>
        <span style={label}>Description *</span>
        <textarea style={{ ...input, height: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this course cover?" />
      </div>

      <div style={field}>
        <span style={label}>Objectives (one per line)</span>
        <textarea style={{ ...input, height: 70, resize: 'vertical' }} value={form.objectives} onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} placeholder="Understand..., Demonstrate..., Apply..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <div style={field}>
          <span style={label}>Duration (min)</span>
          <input style={input} type="number" min={5} max={480} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))} />
        </div>
        <div style={field}>
          <span style={label}>Passing Score %</span>
          <input style={input} type="number" min={50} max={100} value={form.passing_score} onChange={e => setForm(f => ({ ...f, passing_score: +e.target.value }))} />
        </div>
        <div style={field}>
          <span style={label}>Version</span>
          <input style={input} value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.0" />
        </div>
        <div style={field}>
          <span style={label}>Renews Every (days)</span>
          <input style={input} type="number" min={0} max={1825} value={form.due_within} onChange={e => setForm(f => ({ ...f, due_within: +e.target.value }))} placeholder="blank = no expiry" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...label, margin: 0 }}>Required Course</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
          <span style={{ fontSize: 13, color: 'var(--t-text)' }}>{form.required ? 'Yes — Mandatory for all employees' : 'No — Optional'}</span>
        </label>
      </div>

      <div style={field}>
        <span style={label}>Attach Content <span style={{ color: 'var(--t-text-muted)', fontWeight: 400, textTransform: 'none' }}>(not yet available)</span></span>
        <div style={{ ...input, padding: '12px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12, cursor: 'not-allowed', opacity: 0.45, border: '1px dashed var(--t-line)' }}
          title="Content upload is not yet available">
          Uploading PDF / SCORM / Video is not yet available
        </div>
      </div>

      <button type="submit" disabled={saving} style={{ padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', background: 'var(--t-accent)', color: '#000', border: 'none', cursor: 'pointer', opacity: saving ? .6 : 1, alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Add Course'}
      </button>
    </form>
  )
}

/* ─────────────────────────────────────────────────────────────────
   TAB 5 — REPORTS
───────────────────────────────────────────────────────────────── */
function Reports({ matrix, modules }) {
  const reqIds = useMemo(() => modules.filter(m => m.required).map(m => m.id), [modules])
  const modMap = useMemo(() => Object.fromEntries(modules.map(m => [m.id, m])), [modules])
  const allRecords = useMemo(() => matrix.flatMap(e => e.records), [matrix])

  const empStats = useMemo(() => matrix.map(emp => {
    const reqRecs  = emp.records.filter(r => reqIds.includes(r.course_id))
    const done     = reqRecs.filter(r => r.status === 'complete').length
    const overdue  = reqRecs.filter(r => r.status === 'overdue')
    const pct      = reqRecs.length ? Math.round(done / reqRecs.length * 100) : 0
    return { ...emp, pct, overdue, overdueCount: overdue.length, isCompliant: reqRecs.length > 0 && done === reqRecs.length }
  }), [matrix, reqIds])

  const byRole = useMemo(() => {
    const roles = Array.from(new Set(matrix.map(e => e.role).filter(r => r && r !== '—')))
    return roles.map(role => {
      const emps = empStats.filter(e => e.role === role)
      const avg  = emps.length ? Math.round(emps.reduce((a, e) => a + e.pct, 0) / emps.length) : 0
      return { role, avg, count: emps.length }
    })
  }, [empStats, matrix])

  const nonCompliant = empStats.filter(e => !e.isCompliant && e.overdueCount > 0).sort((a, b) => b.overdueCount - a.overdueCount)

  // Real completions-per-month over the last 6 calendar months.
  const monthlyTrend = useMemo(() => {
    const base = new Date(); base.setDate(1)
    const months = []
    for (let i = 5; i >= 0; i--) months.push(new Date(base.getFullYear(), base.getMonth() - i, 1))
    const completed = allRecords.filter(r => r.status === 'complete' && r.completion_date)
    return months.map(d => ({
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      count: completed.filter(r => { const c = new Date(r.completion_date); return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() }).length,
    }))
  }, [allRecords])
  const trendMax = Math.max(1, ...monthlyTrend.map(m => m.count))

  // Real training hours completed this quarter (module duration × completions).
  const trainingHoursThisQ = useMemo(() => {
    const q = new Date(); q.setMonth(Math.floor(q.getMonth() / 3) * 3, 1); q.setHours(0, 0, 0, 0)
    const done = allRecords.filter(r => r.status === 'complete' && r.completion_date && new Date(r.completion_date) >= q)
    return Math.round(done.reduce((a, r) => a + ((modMap[r.course_id]?.duration || 0) / 60), 0))
  }, [allRecords, modMap])

  // Real upcoming certification expirations from training_records.expires_at.
  const expirations = useMemo(() =>
    matrix.flatMap(e => e.records.filter(r => r.expires_at).map(r => ({
      name: e.name, loc: e.location, course: modMap[r.course_id]?.name || '—', days: daysUntil(r.expires_at),
    }))).filter(x => x.days != null && x.days >= 0).sort((a, b) => a.days - b.days).slice(0, 12)
  , [matrix, modMap])

  function exportReport() {
    const lines = ['Employee,Location,Role,Compliance%,Overdue Courses']
    empStats.forEach(e => {
      const od = e.overdue.map(r => modMap[r.course_id]?.name || r.course_id).join('; ')
      lines.push(`"${e.name}","${e.location}","${e.role}",${e.pct},"${od}"`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'training_report.csv'; a.click()
  }

  const secHdr = { fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 10, display: 'block' }
  const sRow   = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text)' }
  const card   = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 18px' }

  if (!matrix.length) return <EmptyState>No employees in the selected scope yet.</EmptyState>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={exportReport} style={{ padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-accent)', cursor: 'pointer' }}>
          ⬇ Export Full Report CSV
        </button>
      </div>

      {/* Training Hours */}
      <div style={card}>
        <span style={secHdr}>Training Hours Completed This Quarter</span>
        <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--t-accent)' }}>{trainingHoursThisQ.toLocaleString()} hrs</div>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>Across {matrix.length} employees, {modules.length} courses</div>
      </div>

      {/* Completions Trend */}
      <div style={card}>
        <span style={secHdr}>Course Completions (Last 6 Months)</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 90 }}>
          {monthlyTrend.map(m => (
            <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--t-accent)' }}>{m.count}</div>
              <div style={{ width: '100%', height: `${(m.count / trendMax) * 60}px`, minHeight: 2, background: m.count > 0 ? 'var(--t-accent)' : 'var(--t-line)', opacity: .85 }} />
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{m.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By Role */}
      <div style={card}>
        <span style={secHdr}>Compliance By Role</span>
        {byRole.length === 0 ? <div style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>No role data in scope.</div> : byRole.map(r => (
          <div key={r.role} style={sRow}>
            <span style={{ flex: 1 }}>{r.role}</span>
            <span style={{ color: 'var(--t-text-muted)', fontSize: 11, marginRight: 16 }}>{r.count} employees</span>
            <ProgressBar pct={r.avg} slim />
          </div>
        ))}
      </div>

      {/* Non-Compliant List */}
      <div style={card}>
        <span style={secHdr}>Non-Compliant Employees</span>
        {nonCompliant.length === 0 ? (
          <div style={{ color: '#2ad6a0', fontSize: 13, fontWeight: 600 }}>✓ No employees with overdue required courses.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Employee', 'Location', 'Compliance', 'Overdue Courses'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nonCompliant.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--t-line)' }}>{emp.name}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text-muted)' }}>{emp.location}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--t-line)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: emp.pct >= 70 ? '#ffb800' : '#ff4d7d' }}>{emp.pct}%</span>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--t-line)' }}>
                      {emp.overdue.slice(0, 2).map(r => modMap[r.course_id]?.name).filter(Boolean).join(', ')}
                      {emp.overdue.length > 2 && <span style={{ color: 'var(--t-text-muted)' }}> +{emp.overdue.length - 2} more</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming Expirations */}
      <div style={card}>
        <span style={secHdr}>Upcoming Certification Expirations</span>
        {expirations.length === 0 ? (
          <div style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>No certifications are approaching expiry.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 80px 1fr 1fr', gap: 0 }}>
            {['Employee', 'Days Left', 'Course', 'Location'].map(h => (
              <div key={h} style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>{h}</div>
            ))}
            {expirations.map((ex, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{ex.name}</div>
                <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: 12, fontFamily: 'var(--font-mono)', color: ex.days <= 30 ? '#ff4d7d' : ex.days <= 60 ? '#ffb800' : '#2ad6a0', fontWeight: 700 }}>{ex.days}d</div>
                <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text-muted)' }}>{ex.course}</div>
                <div style={{ padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text-muted)' }}>{ex.loc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   ROOT COMPONENT
───────────────────────────────────────────────────────────────── */
export default function Training() {
  const { session }     = useAuth()
  const { locationIds } = useScope()
  const roleName        = session?.person?.role_name || ''
  const isHR            = isHRRole(roleName)

  const [modules,   setModules]   = useState([])
  const [matrix,    setMatrix]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [activeTab, setActiveTab] = useState(isHR ? 0 : 1)

  const TABS = [
    { label: 'Compliance Matrix', hrOnly: true  },
    { label: 'My Training',       hrOnly: false },
    { label: 'Courses',           hrOnly: false },
    { label: 'Add Course',        hrOnly: true  },
    { label: 'Reports',           hrOnly: true  },
  ]
  const visibleTabs = TABS.map((t, i) => ({ ...t, index: i })).filter(t => isHR || !t.hrOnly)

  const scopeKey = (locationIds || []).join(',')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await sb.rpc('hr_training_overview', { p_node_ids: locationIds && locationIds.length ? locationIds : null })
      if (error) throw error
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Could not load training data.')
      setModules((data.modules || []).map(m => ({ ...m })))
      setMatrix((data.employees || []).map(e => ({
        id: e.id, name: e.name, location: e.location, role: e.role, node_id: e.node_id, hire_date: e.hire_date,
        records: (e.records || []).map(r => ({
          employee_id: e.id, course_id: r.module_id, status: r.status,
          progress_pct: r.progress_pct, score: r.score, attempts: r.attempts,
          start_date: r.start_date, completion_date: r.completion_date, expires_at: r.expires_at,
        })),
      })))
    } catch (e) {
      setError(e?.message || 'Could not load training data.')
      setModules([]); setMatrix([])
    } finally {
      setLoading(false)
    }
  }, [scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const tabBar = { display: 'flex', gap: 0, borderBottom: '2px solid var(--t-line)', marginBottom: 20 }
  const tabBtn = (active) => ({
    padding: '10px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px',
    textTransform: 'uppercase', cursor: 'pointer', background: 'transparent',
    border: 'none', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    marginBottom: '-2px', transition: 'color .15s',
  })

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.3px' }}>Training &amp; Compliance</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            {companyName()} · {loading ? 'Loading…' : `${matrix.length} employees · ${modules.length} courses`}
          </div>
        </div>
        {loading && <div style={{ fontSize: 11, color: 'var(--t-accent)', fontWeight: 600, letterSpacing: '.5px' }}>● Syncing…</div>}
      </div>

      {error && (
        <div style={{ background: 'rgba(255,77,125,.12)', border: '1px solid #ff4d7d', color: '#ff4d7d', padding: '12px 16px', fontSize: 13, marginBottom: 20 }}>
          {error}
          <button onClick={load} style={{ marginLeft: 12, padding: '4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: 'transparent', border: '1px solid #ff4d7d', color: '#ff4d7d', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {!error && (
        <>
          {/* KPI Panel */}
          <KpiPanel matrix={matrix} modules={modules} />

          {/* Tab Bar */}
          <div style={tabBar}>
            {visibleTabs.map(t => (
              <button key={t.index} style={tabBtn(activeTab === t.index)} onClick={() => setActiveTab(t.index)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 0 && isHR && <ComplianceMatrix matrix={matrix} modules={modules} />}
            {activeTab === 1 && <MyTraining matrix={matrix} modules={modules} session={session} onProgressUpdate={load} />}
            {activeTab === 2 && <Courses matrix={matrix} modules={modules} />}
            {activeTab === 3 && isHR && <AddCourse onSaved={load} />}
            {activeTab === 4 && isHR && <Reports matrix={matrix} modules={modules} />}
          </div>
        </>
      )}
    </div>
  )
}
