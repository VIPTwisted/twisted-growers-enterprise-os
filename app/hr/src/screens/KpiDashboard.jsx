import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

// ─── formatters ───────────────────────────────────────────────────────────────
const DASH = '—'
const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = (n) => { const v = parseFloat(n || 0); if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`; return fmt$(v) }
const fmtPct = (n) => n == null ? DASH : `${Number(n).toFixed(1)}%`
const fmtN = (n) => Number(n || 0).toLocaleString('en-US')
const fmtHrs = (n) => `${Number(n || 0).toFixed(1)}h`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : DASH
const now = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const nn = (v) => (v == null || v === '' || Number.isNaN(v)) ? null : v          // null-normalize
const daysBetween = (a, b = Date.now()) => a ? Math.floor((b - new Date(a).getTime()) / 86400000) : null
const monthsSince = (d) => d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (30 * 86400000))) : null
const isoDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner', 'keyholder']
const isHR = (r = '') => HR_ROLES.some(k => r.toLowerCase().includes(k))

const RANGE_DAYS = { week: 7, month: 30, quarter: 90 }

// disciplinary type / severity mapping (real da_type codes → display)
const DA_LABEL = { verbal: 'Verbal Warning', written: 'Written Warning', final: 'Final Warning', suspension: 'Suspension', termination: 'Termination', coaching: 'Coaching' }
const DA_SEVERITY = { verbal: 'low', coaching: 'low', written: 'medium', final: 'high', suspension: 'high', termination: 'critical' }
const CERT_STATUS = { valid: 'complete', current: 'complete', expiring: 'in_progress', expired: 'overdue', overdue: 'overdue', missing: 'overdue' }

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(rows, filename) {
  if (!rows || !rows.length) return
  const keys = Object.keys(rows[0])
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
}

// ─── threshold helpers ────────────────────────────────────────────────────────
function statusColor(val, { good, warn: warnT } = {}) {
  if (good === undefined || val == null || Number.isNaN(val)) return 'var(--t-text)'
  if (val >= good) return 'var(--t-success)'
  if (val >= warnT) return 'var(--t-warn)'
  return 'var(--t-alert)'
}
function statusBadge(val, thresholds) {
  const c = statusColor(val, thresholds)
  if (c === 'var(--t-success)') return 'badge green'
  if (c === 'var(--t-warn)') return 'badge amber'
  return 'badge red'
}
function trendArrow(curr, prev) {
  if (prev == null || curr == null || Number.isNaN(curr) || Number.isNaN(prev)) return { arrow: '→', delta: 0, color: 'var(--t-text-muted)' }
  const delta = curr - prev
  const pct = prev !== 0 ? ((delta / prev) * 100).toFixed(1) : 0
  if (delta > 0) return { arrow: '▲', delta: pct, color: 'var(--t-success)' }
  if (delta < 0) return { arrow: '▼', delta: Math.abs(pct), color: 'var(--t-alert)' }
  return { arrow: '→', delta: 0, color: 'var(--t-text-muted)' }
}

// ─── REAL DATA ASSEMBLY ─────────────────────────────────────────────────────────
// Every field below is derived from a verified live SECURITY-DEFINER read RPC on
// the HR brain (project fxetuqjryttnypgepsru, schema hr). Nothing is fabricated: when a
// source has no rows, the value stays null/empty and the UI shows an honest state.
function assemble({ summaryRes, prevRes, hrRes, rosterRes, healthRes, reviewsRes, daRes, trainRes, timeRes, calloutRes, gapsRes, pendingRes, policyRes }) {
  const val = (r, d = null) => (r && r.status === 'fulfilled' && !r.value?.error && r.value?.data != null) ? r.value.data : d
  const arr = (r) => { const v = val(r); return Array.isArray(v) ? v : [] }

  const analytics = val(summaryRes) || {}
  const summary = analytics.summary || {}
  const locations = Array.isArray(analytics.locations) ? analytics.locations : []
  const prevSummary = (val(prevRes) || {}).summary || {}
  const hr = val(hrRes) || {}
  const roster = arr(rosterRes)
  const health = arr(healthRes)
  const reviewsRaw = arr(reviewsRes)
  const daRaw = arr(daRes)
  const trainingRaw = arr(trainRes)
  const timeRaw = arr(timeRes)
  const calloutData = val(calloutRes) || {}
  const callouts = Array.isArray(calloutData.callouts) ? calloutData.callouts : []
  const gaps = arr(gapsRes)
  const pending = val(pendingRes) || {}
  const policy = val(policyRes) || {}

  const healthById = Object.fromEntries(health.map(h => [h.person_id, h]))

  // ── canonical employee list (roster = authoritative active people) ──
  const employees = roster.map(r => {
    const h = healthById[r.id] || {}
    return {
      id: r.id,
      full_name: r.full_name,
      location: r.node_name || DASH,
      role: r.role_name || DASH,
      hire_date: r.effective_from || null,
      status: r.is_active === false ? 'inactive' : 'active',
      tenure_months: monthsSince(r.effective_from),
      attendance: nn(h.attendance),
      health_score: nn(h.score),
      shift_count: Number(h.shift_count || 0),
      open_da: Number(h.open_da_count || 0),
      recent_incidents: Number(h.recent_incidents || 0),
      training_pct: nn(h.training),
      coverage: nn(h.coverage),
    }
  })
  const empById = Object.fromEntries(employees.map(e => [e.id, e]))

  // ── locations present in real data ──
  const LOCS = [...new Set([...locations.map(l => l.name), ...employees.map(e => e.location)].filter(x => x && x !== DASH))]

  // ── callouts aggregated per employee (forensic_callouts) ──
  const calloutByEmp = {}
  callouts.forEach(c => {
    const id = c.employee_id
    if (!calloutByEmp[id]) calloutByEmp[id] = { callouts: 0, ncns: 0, uncovered: 0 }
    calloutByEmp[id].callouts += 1
    if (c.exception_type === 'no_show') calloutByEmp[id].ncns += 1
    if (c.covered === false) calloutByEmp[id].uncovered += 1
  })

  // ── attendancePatterns per employee (real: health + forensic callouts) ──
  const attendancePatterns = {}
  employees.forEach(e => {
    const co = calloutByEmp[e.id] || { callouts: 0, ncns: 0 }
    attendancePatterns[e.id] = {
      callouts: co.callouts,
      ncns: co.ncns,
      lates: 0,                              // no tardy-detail source per person → honest 0
      attendance_pct: e.attendance,          // real health attendance score (nullable)
      shifts: e.shift_count,                 // real scheduled/worked shift count
      incidents: e.recent_incidents,
    }
  })

  // ── disciplinary (get_disciplinary_actions) ──
  const disciplinary = daRaw.map(r => {
    const open = r.status === 'active' || r.status === 'open'
    return {
      id: r.id,
      employee_id: r.person_id,
      employee_name: r.person_name || DASH,
      location: empById[r.person_id]?.location || DASH,
      type: DA_LABEL[r.da_type] || (r.da_type ? r.da_type[0].toUpperCase() + r.da_type.slice(1) : 'Action'),
      date: r.da_date,
      severity: DA_SEVERITY[r.da_type] || 'medium',
      manager: r.issuer_name || DASH,
      status: open ? 'open' : 'closed',
      days_open: open ? (daysBetween(r.da_date) ?? 0) : 0,
      description: r.description || '',
    }
  })

  // ── performance reviews (get_reviews_detailed) — overall_score on 0–10 scale ──
  const perfReviews = reviewsRaw.map(r => {
    const days = daysBetween(r.created_at)
    return {
      id: r.id,
      employee_id: r.person_id,
      employee_name: r.employee_name || DASH,
      location: r.node_name || empById[r.person_id]?.location || DASH,
      role: r.role_name || DASH,
      score: nn(r.overall_score),            // 0–10
      review_date: r.created_at,
      days_since_review: days,
      on_pip: r.pip === true,
      status: (days != null && days > 90) ? 'overdue' : 'current',
      raise_rec: r.raise_rec || DASH,
      promo: r.promo || DASH,
    }
  })

  // ── training (get_training_overview) — one row per module completion/cert ──
  const training = trainingRaw.map(r => ({
    person_id: r.person_id,
    employee_name: r.full_name || DASH,
    location: r.node_name || DASH,
    module: r.module || DASH,
    category: r.category || DASH,
    completed_at: r.completed_at,
    cert_expires: r.cert_expires,
    cert_status: r.cert_status || DASH,
    score: nn(r.score),
    status: CERT_STATUS[r.cert_status] || 'in_progress',
    days_overdue: (r.cert_status === 'expired' && r.cert_expires) ? (daysBetween(r.cert_expires) ?? 0) : 0,
  }))
  const COURSES = [...new Set(training.map(t => t.module).filter(m => m && m !== DASH))]
  // group training by employee
  const trainByEmp = {}
  training.forEach(t => {
    if (!trainByEmp[t.person_id]) trainByEmp[t.person_id] = { person_id: t.person_id, employee_name: t.employee_name, location: t.location, courses: [] }
    trainByEmp[t.person_id].courses.push({ course: t.module, status: t.status, days_overdue: t.days_overdue })
  })
  const trainingData = Object.values(trainByEmp).map(g => {
    const total = g.courses.length
    const complete = g.courses.filter(c => c.status === 'complete').length
    return { ...g, compliance_pct: total > 0 ? Math.round((complete / total) * 100) : null }
  })

  // ── time clock (get_all_time_entries) aggregated per employee, weekly OT ──
  const timeByEmp = {}
  timeRaw.forEach(t => {
    const id = t.person_id
    if (!timeByEmp[id]) timeByEmp[id] = { employee_id: id, employee_name: t.full_name || DASH, location: t.node_name || DASH, entries: [], weeks: {} }
    const g = timeByEmp[id]
    const hrs = t.hours_worked != null ? Number(t.hours_worked)
      : (t.punched_out_at && t.punched_in_at) ? (new Date(t.punched_out_at) - new Date(t.punched_in_at)) / 3600000 : 0
    const wk = t.work_date ? new Date(t.work_date) : new Date()
    const wkKey = `${wk.getUTCFullYear()}-W${Math.floor((wk - new Date(Date.UTC(wk.getUTCFullYear(), 0, 1))) / (7 * 86400000))}`
    g.weeks[wkKey] = (g.weeks[wkKey] || 0) + hrs
    g.entries.push({ hrs, open: !t.punched_out_at })
  })
  const timeClock = Object.values(timeByEmp).map(g => {
    const totalHrs = Object.values(g.weeks).reduce((s, h) => s + h, 0)
    const otHrs = Object.values(g.weeks).reduce((s, h) => s + Math.max(0, h - 40), 0)
    const missed = g.entries.filter(e => e.open).length
    const longShift = g.entries.filter(e => e.hrs > 10).length
    return {
      employee_id: g.employee_id,
      employee_name: g.employee_name,
      location: g.location,
      hours_regular: Math.max(0, totalHrs - otHrs),
      hours_ot: otHrs,
      total_hours: totalHrs,
      punches: g.entries.length,
      missed_punches: missed,
      long_shifts: longShift,
      avg_shift_hrs: g.entries.length ? totalHrs / g.entries.length : 0,
    }
  })

  // ── labor (hours are real; wage/cost has no source → cost stays null) ──
  const laborData = timeClock.map(t => ({
    employee_id: t.employee_id,
    employee_name: t.employee_name,
    location: t.location,
    hours_regular: t.hours_regular,
    hours_ot: t.hours_ot,
    total_hours: t.total_hours,
  }))

  // ── scheduling / coverage (get_coverage_gaps) ──
  const byLoc = {}
  const byDay = {}
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  gaps.forEach(g => {
    const req = Number(g.required || 0), sch = Number(g.scheduled || 0)
    byLoc[g.node] = byLoc[g.node] || { required: 0, scheduled: 0 }
    byLoc[g.node].required += req; byLoc[g.node].scheduled += sch
    const dow = g.shift_date ? DAY_LABELS[new Date(g.shift_date).getUTCDay()] : DASH
    byDay[dow] = byDay[dow] || { required: 0, scheduled: 0 }
    byDay[dow].required += req; byDay[dow].scheduled += sch
  })
  const totalRequired = gaps.reduce((s, g) => s + Number(g.required || 0), 0)
  const totalScheduled = gaps.reduce((s, g) => s + Number(g.scheduled || 0), 0)
  const uncoveredRows = gaps.filter(g => Number(g.gap || 0) > 0)
  const scheduling = {
    total_shifts: totalRequired,
    covered_shifts: totalScheduled,
    coverage_rate: totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 1000) / 10 : null,
    uncovered_gaps: uncoveredRows.reduce((s, g) => s + Number(g.gap || 0), 0),
    open_shift_requests: Array.isArray(pending.open_shifts) ? pending.open_shifts.length : 0,
    coverage_by_location: Object.entries(byLoc).map(([location, v]) => ({ location, pct: v.required > 0 ? Math.round((v.scheduled / v.required) * 100) : 0 })),
    coverage_by_day: DAY_LABELS.filter(d => byDay[d]).map(d => ({ day: d, pct: byDay[d].required > 0 ? Math.round((byDay[d].scheduled / byDay[d].required) * 100) : 0 })),
    uncovered_list: uncoveredRows.slice(0, 25).map(g => ({ location: g.node || DASH, date: g.shift_date, gap: Number(g.gap || 0), required: Number(g.required || 0), scheduled: Number(g.scheduled || 0) })),
  }

  // ── turnover / tenure (roster + health + analytics separations) ──
  const perfById = Object.fromEntries(perfReviews.map(p => [p.employee_id, p]))
  const tenure = employees.map(e => {
    const atRisk = e.open_da > 0 || (e.health_score != null && e.health_score < 70) || e.recent_incidents >= 3
    return {
      employee_id: e.id,
      employee_name: e.full_name,
      location: e.location,
      role: e.role,
      hire_date: e.hire_date,
      tenure_months: e.tenure_months,
      at_risk: atRisk,
      risk_score: e.health_score != null ? Math.max(0, 100 - e.health_score) : (e.open_da * 30 + e.recent_incidents * 10),
      perf_score: perfById[e.id]?.score ?? null,
      health_score: e.health_score,
    }
  })

  // ── policy compliance (policies_team_compliance) — honest empty when none ──
  const policyCompliance = {
    policies: Array.isArray(policy.policies) ? policy.policies : [],
    employees: Array.isArray(policy.employees) ? policy.employees : [],
    acks: Array.isArray(policy.acks) ? policy.acks : [],
  }

  // ── executive KPI roll-up ──
  const calloutTotal = callouts.length
  const uncoveredCallouts = callouts.filter(c => c.covered === false).length
  const certsExpiring = training.filter(t => t.cert_status === 'expiring').length
  const certsExpired = training.filter(t => t.cert_status === 'expired').length
  const activePips = perfReviews.filter(p => p.on_pip).length
  const reviewsOverdue = perfReviews.filter(p => p.days_since_review != null && p.days_since_review > 90).length
  const pendingPto = Array.isArray(pending.time_off) ? pending.time_off.length : 0

  const exec = {
    active_headcount: Number(summary.headcount ?? hr.active ?? employees.length),
    active_headcount_prev: nn(prevSummary.headcount),
    scheduled_shifts: Number(summary.scheduled_shifts ?? 0),
    scheduled_shifts_prev: nn(prevSummary.scheduled_shifts),
    coverage_rate: scheduling.coverage_rate,
    callout_count: calloutTotal,
    callout_rate: (Number(summary.scheduled_shifts) > 0) ? Math.round((Number(summary.callouts || 0) / Number(summary.scheduled_shifts)) * 1000) / 10 : null,
    attendance_rate: nn(summary.attendance_rate),
    attendance_rate_prev: nn(prevSummary.attendance_rate),
    tardies: Number(summary.tardies ?? 0),
    ncns: Number(summary.ncns ?? 0),
    labor_hours: nn(summary.labor_hours),
    labor_hours_prev: nn(prevSummary.labor_hours),
    ot_hours: nn(summary.ot_hours),
    labor_cost: nn(summary.labor_cost),        // null — no wage data on file
    training_compliance: nn(summary.training_pct),
    training_compliance_prev: nn(prevSummary.training_pct),
    training_valid: Number(summary.training_valid ?? 0),
    training_total: Number(summary.training_total ?? 0),
    overdue_trainings: certsExpired,
    certs_expiring: certsExpiring,
    open_das: Number(summary.active_das ?? disciplinary.filter(d => d.status === 'open').length),
    open_das_prev: nn(prevSummary.active_das),
    active_pips: activePips,
    pending_pto: pendingPto,
    reviews_overdue: reviewsOverdue,
    uncovered_callouts: uncoveredCallouts,
    revenue: nn(summary.revenue),
    revenue_prev: nn(prevSummary.revenue),
    revenue_goal: nn(summary.revenue_goal),
    spiff: nn(summary.spiff),
    units: Number(summary.units ?? 0),
    turnover_pct: nn(summary.turnover_pct),
    hires_ytd: Number(summary.hires_ytd ?? 0),
    seps_12mo: Number(summary.seps_12mo ?? 0),
    risk_emp: Number(summary.risk_emp ?? tenure.filter(t => t.at_risk).length),
  }

  return {
    employees, empById, LOCS, COURSES,
    attendancePatterns, calloutByEmp, callouts, attendanceOverview: arr(healthRes),
    disciplinary, perfReviews, training, trainingData, timeClock, laborData,
    scheduling, tenure, policyCompliance, locations, exec,
    _hasScope: employees.length > 0 || locations.length > 0,
  }
}

// ─── shared sub-components ────────────────────────────────────────────────────
function Bar({ pct, color, height = 6 }) {
  return (
    <div style={{ height, background: 'var(--t-line)', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(Math.max(pct || 0, 0), 100)}%`, background: color || 'var(--t-accent)', transition: 'width .4s ease' }} />
    </div>
  )
}

function SectionHeader({ title, badge, badgeClass = 'badge accent', expanded, onToggle, onExport, onPrint }) {
  return (
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '14px 16px', background: 'var(--t-surface-2)', borderBottom: expanded ? '1px solid var(--t-line)' : 'none', userSelect: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text)' }}>{title}</span>
        {badge && <span className={badgeClass}>{badge}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onExport && <button onClick={e => { e.stopPropagation(); onExport() }} style={btnSm}>CSV</button>}
        {onPrint && <button onClick={e => { e.stopPropagation(); onPrint() }} style={btnSm}>Print</button>}
        <span style={{ color: 'var(--t-text-muted)', fontSize: 14 }}>{expanded ? '▲' : '▼'}</span>
      </div>
    </div>
  )
}

const btnSm = {
  padding: '4px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
  textTransform: 'uppercase', border: '1px solid var(--t-line)', background: 'transparent',
  color: 'var(--t-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
}

function DomainCard({ id, title, badge, badgeClass, children, expandedId, setExpandedId, onExport }) {
  const expanded = expandedId === id
  return (
    <div id={`domain-${id}`} style={{ border: '1px solid var(--t-line)', marginBottom: 8, background: 'var(--t-surface)' }}>
      <SectionHeader title={title} badge={badge} badgeClass={badgeClass} expanded={expanded} onToggle={() => setExpandedId(expanded ? null : id)} onExport={onExport} onPrint={() => window.print()} />
      {expanded && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  )
}

function EmptyState({ label = 'No data for the selected scope and period.' }) {
  return <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13, border: '1px dashed var(--t-line)' }}>{label}</div>
}

function StatRow({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--t-line)', fontSize: 13 }}>
      <span style={{ color: 'var(--t-text-muted)' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 700, color: color || 'var(--t-text)', fontFamily: 'var(--font-mono)' }}>{value}</span>
        {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function MetricBars({ items, maxVal, color }) {
  if (!items || !items.length) return <EmptyState label="No breakdown available." />
  const max = maxVal || Math.max(...items.map(i => i.value), 1)
  return (
    <div>
      {items.map(item => (
        <div key={item.label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--t-text-muted)' }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: item.color || color || 'var(--t-accent)' }}>{item.display}</span>
          </div>
          <Bar pct={(item.value / max) * 100} color={item.color || color || 'var(--t-accent)'} height={8} />
        </div>
      ))}
    </div>
  )
}

function DataTable({ columns, rows, maxRows = 200, empty = 'No data' }) {
  const [sort, setSort] = useState({ col: null, dir: 'asc' })
  const sorted = useMemo(() => {
    if (!sort.col) return rows
    return [...rows].sort((a, b) => {
      const av = a[sort.col], bv = b[sort.col]
      if (av === bv) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : 1
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
            {columns.map(c => (
              <th key={c.key} onClick={() => setSort(s => ({ col: c.key, dir: s.col === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}
                style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                {c.label}{sort.col === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, maxRows).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)' }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '8px 10px', color: 'var(--t-text)', whiteSpace: c.wrap ? 'normal' : 'nowrap', ...c.style }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? DASH}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>{empty}</div>}
    </div>
  )
}

// ─── Executive KPI Tile ───────────────────────────────────────────────────────
function ExecTile({ label, value, prev, thresholds, isLower, unit = '', onClick, domain }) {
  const empty = value == null || value === DASH
  const numeric = empty ? NaN : parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  const trend = trendArrow(numeric, prev)
  const effectiveTrend = isLower ? { ...trend, color: trend.arrow === '▲' ? 'var(--t-alert)' : trend.arrow === '▼' ? 'var(--t-success)' : 'var(--t-text-muted)' } : trend
  const dotColor = (!empty && thresholds) ? statusColor(numeric, thresholds) : 'var(--t-text-muted)'

  return (
    <div
      onClick={onClick}
      style={{ position: 'relative', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 14px 12px', cursor: onClick ? 'pointer' : 'default', overflow: 'hidden', transition: 'border-color .15s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = 'var(--t-accent)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--t-line)')}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: dotColor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--t-text-muted)', lineHeight: 1.3, flex: 1, paddingRight: 4 }}>{label}</div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 6px ${dotColor}`, marginTop: 2 }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: empty ? 'var(--t-text-faint)' : (dotColor === 'var(--t-text-muted)' ? 'var(--t-text)' : dotColor), lineHeight: 1 }}>
        {empty ? DASH : `${value}${unit}`}
      </div>
      {!empty && prev != null && (
        <div style={{ fontSize: 11, color: effectiveTrend.color, marginTop: 5, display: 'flex', gap: 4 }}>
          <span>{effectiveTrend.arrow}</span>
          <span>{effectiveTrend.delta}%</span>
          <span style={{ color: 'var(--t-text-faint)' }}>vs prior</span>
        </div>
      )}
      {domain && <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 9, color: 'var(--t-text-faint)', letterSpacing: '.5px' }}>DRILL ↓</div>}
    </div>
  )
}

// ─── Alert Card ───────────────────────────────────────────────────────────────
function AlertCard({ severity, title, detail, who, action }) {
  const colors = { critical: 'var(--t-alert)', warning: 'var(--t-warn)', info: 'var(--t-success)' }
  const icons = { critical: '🔴', warning: '🟡', info: '🟢' }
  const c = colors[severity] || 'var(--t-text-muted)'
  return (
    <div style={{ border: `1px solid ${c}40`, background: `${c}08`, padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${c}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span>{icons[severity]}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: c }}>{title}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: who ? 4 : 0 }}>{detail}</div>
          {who && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Affects: {who}</div>}
        </div>
        {action && <span style={{ ...btnSm, borderColor: c, color: c, flexShrink: 0 }}>{action}</span>}
      </div>
    </div>
  )
}

// ─── DOMAIN COMPONENTS ────────────────────────────────────────────────────────

function SchedulingForensics({ d }) {
  const s = d.scheduling
  if (s.total_shifts === 0 && s.coverage_by_location.length === 0) {
    return <EmptyState label="No shifts required in the next two weeks for this scope — nothing to cover." />
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Required Shifts" value={fmtN(s.total_shifts)} />
        <StatRow label="Scheduled" value={fmtN(s.covered_shifts)} color="var(--t-success)" />
        <StatRow label="Coverage Rate" value={fmtPct(s.coverage_rate)} color={statusColor(s.coverage_rate, { good: 90, warn: 80 })} />
        <StatRow label="Uncovered Gaps" value={fmtN(s.uncovered_gaps)} color={s.uncovered_gaps > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="Open Shift Requests" value={fmtN(s.open_shift_requests)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Coverage by Location</div>
          <MetricBars items={s.coverage_by_location.map(l => ({ label: l.location, value: l.pct, display: `${l.pct}%`, color: statusColor(l.pct, { good: 90, warn: 80 }) }))} maxVal={100} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Coverage by Day</div>
          <MetricBars items={s.coverage_by_day.map(x => ({ label: x.day, value: x.pct, display: `${x.pct}%`, color: statusColor(x.pct, { good: 90, warn: 80 }) }))} maxVal={100} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-alert)', marginBottom: 8 }}>Uncovered Gaps</div>
        {s.uncovered_list.length === 0 ? <div style={{ color: 'var(--t-success)', fontSize: 13 }}>All required shifts are scheduled.</div> :
          s.uncovered_list.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12 }}>
              <span style={{ color: 'var(--t-text)' }}>{u.location} — {u.scheduled}/{u.required} scheduled</span>
              <span style={{ color: 'var(--t-text-muted)' }}>{fmtDate(u.date)} · <span style={{ color: 'var(--t-alert)', fontWeight: 700 }}>{u.gap} short</span></span>
            </div>
          ))
        }
      </div>
    </div>
  )
}

function AttendanceForensics({ d }) {
  const rows = d.employees.map(e => {
    const p = d.attendancePatterns[e.id] || {}
    const risk = p.ncns > 0 ? 'HIGH' : p.callouts >= 3 ? 'HIGH' : p.callouts >= 2 ? 'MED' : 'LOW'
    return { name: e.full_name, location: e.location, role: e.role, attendance_pct: p.attendance_pct, callouts: p.callouts || 0, ncns: p.ncns || 0, shifts: p.shifts || 0, risk }
  })
  // callout pattern by weekday — real forensic_callouts
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayCounts = {}
  d.callouts.forEach(c => { const dow = c.callout_date ? DAY_LABELS[new Date(c.callout_date).getUTCDay()] : null; if (dow) dayCounts[dow] = (dayCounts[dow] || 0) + 1 })
  const byDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ label: day, value: dayCounts[day] || 0, display: String(dayCounts[day] || 0) }))
  const totalCallouts = rows.reduce((s, r) => s + r.callouts, 0)
  const totalNcns = rows.reduce((s, r) => s + r.ncns, 0)
  const withPct = rows.filter(r => r.attendance_pct != null)
  const perfect = rows.filter(r => r.callouts === 0 && r.ncns === 0).length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Total Callouts" value={fmtN(totalCallouts)} color={totalCallouts > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="NCNS" value={fmtN(totalNcns)} color={totalNcns > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="No Callout / NCNS" value={`${perfect}/${rows.length}`} color="var(--t-success)" />
        <StatRow label="Avg Attendance" value={withPct.length ? fmtPct(withPct.reduce((s, r) => s + r.attendance_pct, 0) / withPct.length) : DASH} color="var(--t-success)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Callout Pattern by Day</div>
          {totalCallouts === 0 ? <EmptyState label="No callouts recorded." /> : <MetricBars items={byDay} color="var(--t-alert)" />}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Top Callout Employees</div>
          {[...rows].filter(r => r.callouts > 0).sort((a, b) => b.callouts - a.callouts).slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12 }}>
              <span style={{ color: 'var(--t-text)' }}>{r.name}</span>
              <span style={{ fontWeight: 700, color: r.callouts >= 3 ? 'var(--t-alert)' : 'var(--t-warn)' }}>{r.callouts} callouts</span>
            </div>
          ))}
          {rows.every(r => r.callouts === 0) && <div style={{ color: 'var(--t-success)', fontSize: 13 }}>No callouts this period.</div>}
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'attendance_pct', label: 'Attend %', render: v => v == null ? DASH : <span style={{ color: statusColor(v, { good: 95, warn: 85 }), fontWeight: 700 }}>{fmtPct(v)}</span> },
          { key: 'shifts', label: 'Shifts' },
          { key: 'callouts', label: 'Callouts', render: v => <span style={{ color: v >= 3 ? 'var(--t-alert)' : v >= 1 ? 'var(--t-warn)' : 'var(--t-success)', fontWeight: 700 }}>{v}</span> },
          { key: 'ncns', label: 'NCNS', render: v => v > 0 ? <span className="badge red">{v} NCNS</span> : <span className="badge green">0</span> },
          { key: 'risk', label: 'Risk', render: v => <span className={v === 'HIGH' ? 'badge red' : v === 'MED' ? 'badge amber' : 'badge green'}>{v}</span> },
        ]}
        rows={rows}
        empty="No roster in scope."
      />
    </div>
  )
}

function TimeClockForensics({ d }) {
  const rows = d.timeClock.map(t => ({
    ...t,
    anomaly: t.missed_punches > 0 ? 'Open Punch' : t.total_hours > 10 ? 'Long Shift' : (t.punches > 0 && t.avg_shift_hrs < 4) ? 'Short Shift' : DASH,
  }))
  if (rows.length === 0) return <EmptyState label="No time punches recorded for this scope and period." />
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Punch Pairs" value={fmtN(rows.reduce((s, r) => s + r.punches, 0))} />
        <StatRow label="Open Punches" value={fmtN(rows.reduce((s, r) => s + r.missed_punches, 0))} color={rows.some(r => r.missed_punches > 0) ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="Total Hours" value={fmtHrs(rows.reduce((s, r) => s + r.total_hours, 0))} />
        <StatRow label="OT Hours" value={fmtHrs(rows.reduce((s, r) => s + r.hours_ot, 0))} color={rows.some(r => r.hours_ot > 0) ? 'var(--t-warn)' : 'var(--t-text)'} />
        <StatRow label="Long Shifts (>10h)" value={fmtN(rows.reduce((s, r) => s + r.long_shifts, 0))} color="var(--t-warn)" />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'punches', label: 'Punches' },
          { key: 'hours_regular', label: 'Reg Hrs', render: v => fmtHrs(v) },
          { key: 'hours_ot', label: 'OT Hrs', render: v => <span style={{ color: v > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{fmtHrs(v)}</span> },
          { key: 'avg_shift_hrs', label: 'Avg Shift', render: v => fmtHrs(v) },
          { key: 'missed_punches', label: 'Open', render: v => v > 0 ? <span className="badge red">{v}</span> : <span className="badge green">0</span> },
          { key: 'anomaly', label: 'Anomaly', render: v => v !== DASH ? <span className="badge amber">{v}</span> : DASH },
        ]}
        rows={rows}
      />
    </div>
  )
}

function TrainingForensics({ d }) {
  if (d.training.length === 0) return <EmptyState label="No training or certification records for this scope." />
  const byModule = d.COURSES.map(c => {
    const recs = d.training.filter(t => t.module === c)
    const complete = recs.filter(t => t.status === 'complete').length
    const pct = recs.length ? Math.round((complete / recs.length) * 100) : 0
    return { label: c, value: pct, display: `${pct}%`, color: statusColor(pct, { good: 85, warn: 70 }) }
  })
  const overdue = d.training.filter(t => t.status === 'overdue')
  const avgCompliance = d.trainingData.filter(t => t.compliance_pct != null)
  const avg = avgCompliance.length ? Math.round(avgCompliance.reduce((s, t) => s + t.compliance_pct, 0) / avgCompliance.length) : null

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Avg Compliance" value={fmtPct(avg)} color={statusColor(avg, { good: 85, warn: 70 })} />
        <StatRow label="Cert Records" value={fmtN(d.training.length)} />
        <StatRow label="Valid" value={fmtN(d.training.filter(t => t.status === 'complete').length)} color="var(--t-success)" />
        <StatRow label="Expired / Overdue" value={fmtN(overdue.length)} color={overdue.length > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Completion by Module</div>
        <MetricBars items={byModule} maxVal={100} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Per-Employee Compliance</div>
        <DataTable
          columns={[
            { key: 'employee_name', label: 'Employee' },
            { key: 'location', label: 'Location' },
            { key: 'courses', label: 'Modules', render: v => v.length },
            { key: 'compliance_pct', label: 'Compliance', render: v => v == null ? DASH : <span className={statusBadge(v, { good: 85, warn: 70 })}>{v}%</span> },
          ]}
          rows={d.trainingData}
        />
      </div>
      {overdue.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-alert)', marginBottom: 8 }}>Expired / Overdue Certifications</div>
          <DataTable
            columns={[
              { key: 'employee_name', label: 'Employee' },
              { key: 'location', label: 'Location' },
              { key: 'module', label: 'Module' },
              { key: 'cert_status', label: 'Status', render: v => <span className="badge red">{v}</span> },
              { key: 'days_overdue', label: 'Days Overdue', render: v => v > 0 ? <span style={{ color: 'var(--t-alert)', fontWeight: 700 }}>{v}d</span> : DASH },
            ]}
            rows={overdue}
          />
        </div>
      )}
    </div>
  )
}

function ComplianceForensics({ d }) {
  const p = d.policyCompliance
  const certValid = d.training.filter(t => t.status === 'complete').length
  const certExpired = d.training.filter(t => t.status === 'overdue').length
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Employees In Scope" value={fmtN(p.employees.length || d.employees.length)} />
        <StatRow label="Policies Defined" value={fmtN(p.policies.length)} color={p.policies.length ? 'var(--t-text)' : 'var(--t-text-faint)'} />
        <StatRow label="Policy Acks Logged" value={fmtN(p.acks.length)} color={p.acks.length ? 'var(--t-success)' : 'var(--t-text-faint)'} />
        <StatRow label="Valid Certifications" value={fmtN(certValid)} color="var(--t-success)" />
        <StatRow label="Expired Certifications" value={fmtN(certExpired)} color={certExpired > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
      </div>
      {p.policies.length === 0 ? (
        <EmptyState label="No policies have been published to the acknowledgment system yet. Certification compliance is tracked under the Training domain." />
      ) : (
        <DataTable
          columns={[
            { key: 'name', label: 'Employee' },
            { key: 'location', label: 'Location' },
            { key: 'role', label: 'Role' },
          ]}
          rows={p.employees}
        />
      )}
    </div>
  )
}

function PerformanceForensics({ d }) {
  if (d.perfReviews.length === 0) return <EmptyState label="No performance reviews recorded for this scope." />
  const scored = d.perfReviews.filter(r => r.score != null)
  const buckets = [[0, 4], [4, 6], [6, 8], [8, 10.01]].map(([lo, hi]) => ({
    label: `${lo}–${hi === 10.01 ? 10 : hi}`,
    value: scored.filter(r => r.score >= lo && r.score < hi).length,
    display: String(scored.filter(r => r.score >= lo && r.score < hi).length),
    color: lo >= 8 ? 'var(--t-success)' : lo >= 6 ? 'var(--t-warn)' : 'var(--t-alert)',
  }))
  const avg = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Avg Score" value={avg == null ? DASH : `${avg.toFixed(1)}/10`} color={statusColor(avg, { good: 8, warn: 6 })} />
        <StatRow label="Top Performers (8+)" value={fmtN(scored.filter(r => r.score >= 8).length)} color="var(--t-success)" />
        <StatRow label="Needs Improvement (<6)" value={fmtN(scored.filter(r => r.score < 6).length)} color="var(--t-alert)" />
        <StatRow label="Active PIPs" value={fmtN(d.perfReviews.filter(r => r.on_pip).length)} color="var(--t-alert)" />
        <StatRow label="Overdue (90d+)" value={fmtN(d.perfReviews.filter(r => r.days_since_review != null && r.days_since_review > 90).length)} color="var(--t-warn)" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Score Distribution (of 10)</div>
        <MetricBars items={buckets} maxVal={scored.length || 1} />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'score', label: 'Score', render: v => v == null ? DASH : <span style={{ color: statusColor(v, { good: 8, warn: 6 }), fontWeight: 700 }}>{v.toFixed(1)}/10</span> },
          { key: 'review_date', label: 'Last Review', render: v => fmtDate(v) },
          { key: 'days_since_review', label: 'Days Since', render: v => v == null ? DASH : <span style={{ color: v > 90 ? 'var(--t-alert)' : v > 60 ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: 700 }}>{v}d</span> },
          { key: 'raise_rec', label: 'Raise Rec' },
          { key: 'on_pip', label: 'PIP', render: v => v ? <span className="badge red">Active PIP</span> : DASH },
          { key: 'status', label: 'Status', render: v => <span className={v === 'overdue' ? 'badge red' : 'badge green'}>{v}</span> },
        ]}
        rows={d.perfReviews}
      />
    </div>
  )
}

function DisciplinaryForensics({ d }) {
  if (d.disciplinary.length === 0) return <EmptyState label="No disciplinary actions recorded for this scope." />
  const byType = ['Verbal Warning', 'Written Warning', 'Final Warning', 'Suspension', 'Termination'].map(t => ({
    label: t, value: d.disciplinary.filter(da => da.type === t).length,
    display: String(d.disciplinary.filter(da => da.type === t).length),
    color: t === 'Verbal Warning' ? 'var(--t-warn)' : 'var(--t-alert)',
  })).filter(x => x.value > 0)
  const repeatOffenders = Object.entries(
    d.disciplinary.reduce((acc, da) => { acc[da.employee_name] = (acc[da.employee_name] || 0) + 1; return acc }, {})
  ).filter(([, n]) => n >= 2).map(([name]) => name)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Total Actions" value={fmtN(d.disciplinary.length)} />
        <StatRow label="Open" value={fmtN(d.disciplinary.filter(da => da.status === 'open').length)} color="var(--t-alert)" />
        <StatRow label="Closed" value={fmtN(d.disciplinary.filter(da => da.status === 'closed').length)} color="var(--t-success)" />
        <StatRow label="Repeat Offenders" value={fmtN(repeatOffenders.length)} color={repeatOffenders.length > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="Stale (30d+ open)" value={fmtN(d.disciplinary.filter(da => da.status === 'open' && da.days_open >= 30).length)} color="var(--t-warn)" />
      </div>
      {byType.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Actions by Type</div>
          <MetricBars items={byType} />
        </div>
      )}
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'type', label: 'Type', render: v => <span className={v.includes('Final') || v.includes('Termination') || v.includes('Suspension') ? 'badge red' : v.includes('Written') ? 'badge amber' : 'badge accent'}>{v}</span> },
          { key: 'date', label: 'Date', render: v => fmtDate(v) },
          { key: 'severity', label: 'Severity', render: v => <span className={v === 'critical' || v === 'high' ? 'badge red' : v === 'medium' ? 'badge amber' : 'badge green'}>{v}</span> },
          { key: 'manager', label: 'Issued By' },
          { key: 'status', label: 'Status', render: v => <span className={v === 'open' ? 'badge amber' : 'badge green'}>{v}</span> },
          { key: 'days_open', label: 'Days Open', render: (v, r) => r.status === 'open' ? <span style={{ color: v >= 30 ? 'var(--t-alert)' : 'var(--t-text)', fontWeight: 700 }}>{v}d</span> : DASH },
        ]}
        rows={d.disciplinary}
      />
      {repeatOffenders.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,77,125,.08)', border: '1px solid rgba(255,77,125,.3)' }}>
          <span style={{ fontWeight: 700, color: 'var(--t-alert)', fontSize: 12 }}>REPEAT OFFENDERS: </span>
          <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{repeatOffenders.join(', ')}</span>
        </div>
      )}
    </div>
  )
}

function HealthScoreForensics({ d }) {
  const rows = d.employees.filter(e => e.health_score != null).map(e => ({
    name: e.full_name, location: e.location, role: e.role,
    health_score: e.health_score, attendance: e.attendance, training: e.training_pct,
    coverage: e.coverage, open_da: e.open_da, incidents: e.recent_incidents,
  }))
  if (rows.length === 0) return <EmptyState label="No health-score data available for this scope." />
  const avg = Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length)
  const atRisk = rows.filter(r => r.health_score < 70)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Avg Health Score" value={String(avg)} color={statusColor(avg, { good: 85, warn: 70 })} />
        <StatRow label="Scored Employees" value={fmtN(rows.length)} />
        <StatRow label="Below 70" value={fmtN(atRisk.length)} color={atRisk.length > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="With Open DA" value={fmtN(rows.filter(r => r.open_da > 0).length)} color={rows.some(r => r.open_da > 0) ? 'var(--t-alert)' : 'var(--t-success)'} />
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'health_score', label: 'Health', render: v => <span className={statusBadge(v, { good: 85, warn: 70 })}>{v}</span> },
          { key: 'attendance', label: 'Attend', render: v => v == null ? DASH : `${v}` },
          { key: 'training', label: 'Training', render: v => v == null ? DASH : `${v}` },
          { key: 'coverage', label: 'Coverage', render: v => v == null ? DASH : `${v}` },
          { key: 'open_da', label: 'Open DA', render: v => v > 0 ? <span className="badge red">{v}</span> : <span className="badge green">0</span> },
          { key: 'incidents', label: 'Incidents (90d)', render: v => v > 0 ? <span className="badge amber">{v}</span> : DASH },
        ]}
        rows={rows}
      />
    </div>
  )
}

function LaborForensics({ d }) {
  if (d.laborData.length === 0) return <EmptyState label="No time-punch data to compute labor hours for this scope and period." />
  const totalHrs = d.laborData.reduce((s, r) => s + r.total_hours, 0)
  const totalOt = d.laborData.reduce((s, r) => s + r.hours_ot, 0)
  const byLoc = d.LOCS.map(l => {
    const hrs = d.laborData.filter(r => r.location === l).reduce((s, r) => s + r.total_hours, 0)
    return { label: l, value: hrs, display: fmtHrs(hrs) }
  }).filter(x => x.value > 0)

  return (
    <div>
      <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255,180,0,.06)', border: '1px solid rgba(255,180,0,.25)', fontSize: 12, color: 'var(--t-warn)' }}>
        Labor <strong>cost</strong> is unavailable — no employee wage records exist on file yet. Hours below are live from the time-clock.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Total Hours" value={fmtHrs(totalHrs)} color="var(--t-accent)" />
        <StatRow label="Regular Hours" value={fmtHrs(totalHrs - totalOt)} />
        <StatRow label="OT Hours" value={fmtHrs(totalOt)} color={totalOt > 0 ? 'var(--t-warn)' : 'var(--t-text)'} />
        <StatRow label="OT % of Hours" value={totalHrs > 0 ? fmtPct((totalOt / totalHrs) * 100) : DASH} color={totalOt / Math.max(totalHrs, 1) > 0.15 ? 'var(--t-alert)' : 'var(--t-warn)'} />
        <StatRow label="Labor Cost" value={DASH} color="var(--t-text-faint)" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Hours by Location</div>
        <MetricBars items={byLoc} color="var(--t-accent)" />
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'hours_regular', label: 'Reg Hrs', render: v => fmtHrs(v) },
          { key: 'hours_ot', label: 'OT Hrs', render: v => <span style={{ color: v > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{fmtHrs(v)}</span> },
          { key: 'total_hours', label: 'Total', render: v => <span style={{ fontWeight: 700, color: 'var(--t-accent)' }}>{fmtHrs(v)}</span> },
        ]}
        rows={d.laborData}
      />
    </div>
  )
}

function TurnoverForensics({ d }) {
  if (d.tenure.length === 0) return <EmptyState label="No roster in scope." />
  const tenureBuckets = [
    { label: '0–30 days', fn: m => m != null && m <= 1 },
    { label: '31–90 days', fn: m => m != null && m > 1 && m <= 3 },
    { label: '91–180 days', fn: m => m != null && m > 3 && m <= 6 },
    { label: '6–12 months', fn: m => m != null && m > 6 && m <= 12 },
    { label: '1–2 years', fn: m => m != null && m > 12 && m <= 24 },
    { label: '2+ years', fn: m => m != null && m > 24 },
  ].map(b => ({ label: b.label, value: d.tenure.filter(t => b.fn(t.tenure_months)).length, display: String(d.tenure.filter(t => b.fn(t.tenure_months)).length) }))

  const atRisk = d.tenure.filter(t => t.at_risk)
  const tenured = d.tenure.filter(t => t.tenure_months != null)
  const avgTenure = tenured.length ? Math.round(tenured.reduce((s, t) => s + t.tenure_months, 0) / tenured.length) : null

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
        <StatRow label="Active Employees" value={fmtN(d.employees.length)} />
        <StatRow label="Hires (YTD)" value={fmtN(d.exec.hires_ytd)} />
        <StatRow label="Separations (12mo)" value={fmtN(d.exec.seps_12mo)} color={d.exec.seps_12mo > 0 ? 'var(--t-warn)' : 'var(--t-success)'} />
        <StatRow label="Turnover Rate" value={fmtPct(d.exec.turnover_pct)} color={statusColor(d.exec.turnover_pct == null ? null : 100 - d.exec.turnover_pct, { good: 90, warn: 80 })} />
        <StatRow label="At-Risk" value={fmtN(atRisk.length)} color={atRisk.length > 0 ? 'var(--t-alert)' : 'var(--t-success)'} />
        <StatRow label="Avg Tenure" value={avgTenure == null ? DASH : `${avgTenure}mo`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-text-muted)', marginBottom: 8 }}>Tenure Distribution</div>
          <MetricBars items={tenureBuckets} color="var(--t-accent)" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--t-alert)', marginBottom: 8 }}>At-Risk Employees</div>
          {atRisk.length === 0 ? <div style={{ color: 'var(--t-success)', fontSize: 13 }}>No at-risk employees</div> :
            atRisk.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12 }}>
                <span style={{ color: 'var(--t-text)' }}>{t.employee_name}</span>
                <span style={{ color: 'var(--t-alert)', fontWeight: 700 }}>Risk: {t.risk_score}</span>
              </div>
            ))
          }
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'employee_name', label: 'Employee' },
          { key: 'location', label: 'Location' },
          { key: 'role', label: 'Role' },
          { key: 'hire_date', label: 'Hire Date', render: v => fmtDate(v) },
          { key: 'tenure_months', label: 'Tenure', render: v => v == null ? DASH : `${v}mo` },
          { key: 'health_score', label: 'Health', render: v => v == null ? DASH : <span style={{ color: statusColor(v, { good: 85, warn: 70 }), fontWeight: 700 }}>{v}</span> },
          { key: 'perf_score', label: 'Perf', render: v => v == null ? DASH : <span style={{ color: statusColor(v, { good: 8, warn: 6 }), fontWeight: 700 }}>{v.toFixed(1)}</span> },
          { key: 'at_risk', label: 'At Risk', render: v => v ? <span className="badge red">AT RISK</span> : <span className="badge green">Stable</span> },
        ]}
        rows={d.tenure}
      />
    </div>
  )
}

// ─── ALERT CENTER ─────────────────────────────────────────────────────────────
function buildAlerts(d) {
  const alerts = []

  // CRITICAL — uncovered callouts (real forensic_callouts)
  d.callouts.filter(c => c.covered === false).forEach(c => alerts.push({
    severity: 'critical', title: 'Uncovered Callout', detail: `${c.employee || 'Employee'} called out (${c.exception_type || 'callout'}) — shift not covered.`,
    who: `${c.employee || '—'} @ ${c.node || '—'} (${fmtDate(c.callout_date)})`, action: 'Find Coverage',
  }))
  // CRITICAL — uncovered scheduling gaps
  d.scheduling.uncovered_list.forEach(u => alerts.push({
    severity: 'critical', title: 'Uncovered Shift Gap', detail: `${u.location}: ${u.scheduled}/${u.required} scheduled — ${u.gap} short.`,
    who: `${u.location} (${fmtDate(u.date)})`, action: 'Schedule',
  }))
  // CRITICAL — open punches
  d.timeClock.filter(t => t.missed_punches > 0).forEach(t => alerts.push({
    severity: 'critical', title: 'Open Time Punch', detail: `${t.employee_name} has ${t.missed_punches} punch(es) with no clock-out.`,
    who: t.employee_name, action: 'Correct Punch',
  }))

  // WARNING — expired certifications
  d.training.filter(t => t.status === 'overdue').forEach(t => alerts.push({
    severity: 'warning', title: 'Certification Expired', detail: `${t.employee_name}: "${t.module}" expired${t.days_overdue > 0 ? ` ${t.days_overdue} days ago` : ''}.`,
    who: t.employee_name, action: 'Renew',
  }))
  // WARNING — overdue reviews
  d.perfReviews.filter(r => r.days_since_review != null && r.days_since_review > 90).forEach(r => alerts.push({
    severity: 'warning', title: 'Performance Review Overdue', detail: `${r.employee_name} last reviewed ${r.days_since_review} days ago.`,
    who: r.employee_name, action: 'Schedule',
  }))
  // WARNING — stale disciplinary actions
  d.disciplinary.filter(da => da.status === 'open' && da.days_open > 30).forEach(da => alerts.push({
    severity: 'warning', title: 'Stale Disciplinary Action', detail: `${da.type} for ${da.employee_name} open ${da.days_open} days.`,
    who: da.employee_name, action: 'Resolve',
  }))
  // WARNING — active PIPs
  d.perfReviews.filter(r => r.on_pip).forEach(r => alerts.push({
    severity: 'warning', title: 'Active PIP', detail: `${r.employee_name} is on a Performance Improvement Plan.`,
    who: r.employee_name, action: 'Review',
  }))

  // INFO — expiring certs
  d.training.filter(t => t.cert_status === 'expiring').forEach(t => alerts.push({
    severity: 'info', title: 'Certification Expiring', detail: `${t.employee_name}: "${t.module}" expires ${fmtDate(t.cert_expires)}.`,
    who: t.employee_name,
  }))
  // INFO — OT hours
  d.timeClock.filter(t => t.hours_ot > 0).forEach(t => alerts.push({
    severity: 'info', title: 'Overtime Recorded', detail: `${t.employee_name} logged ${fmtHrs(t.hours_ot)} of overtime.`,
    who: t.employee_name,
  }))
  // INFO — at-risk / low health
  d.tenure.filter(t => t.at_risk).forEach(t => alerts.push({
    severity: 'info', title: 'Retention Risk', detail: `${t.employee_name} flagged at-risk (risk score ${t.risk_score}).`,
    who: t.employee_name,
  }))

  return alerts
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function KpiDashboard() {
  const { session } = useAuth()
  const scope = useScope()
  const role = session?.person?.role_name || getSession().role_name || ''

  const [view, setView] = useState('executive')
  const [locFilter, setLocFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [empSearch, setEmpSearch] = useState('')
  const [dateRange, setDateRange] = useState('month')
  const [expandedDomain, setExpandedDomain] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [data, setData] = useState(null)
  const [lastUpdated, setLastUpdated] = useState('')

  const locationIds = scope?.locationIds || []
  const scopeKey = locationIds.join(',')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    // Scope reads by the selected locations (session nodes). No fallback to fabricated data.
    const sessNodes = (getSession().nodes || []).filter(n => n.node_type === 'location').map(n => n.id)
    const nodeIds = locationIds.length ? locationIds : (sessNodes.length ? sessNodes : null)

    const days = RANGE_DAYS[dateRange] || 30
    const dateTo = isoDay(0)
    const dateFrom = isoDay(-days)
    const prevTo = isoDay(-days - 1)
    const prevFrom = isoDay(-days * 2 - 1)
    const gapTo = isoDay(14)

    try {
      const [summaryRes, prevRes, hrRes, rosterRes, healthRes, reviewsRes, daRes, trainRes, timeRes, calloutRes, gapsRes, pendingRes, policyRes] = await Promise.allSettled([
        sb.rpc('get_analytics_summary', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('get_analytics_summary', { p_node_ids: nodeIds, p_date_from: prevFrom, p_date_to: prevTo }),
        sb.rpc('hr_dashboard', { p_node_ids: nodeIds }),
        sb.rpc('get_roster', { p_node_ids: nodeIds, p_actor: null }),
        sb.rpc('get_health_scores', { p_node_ids: nodeIds }),
        sb.rpc('get_reviews_detailed', { p_node_ids: nodeIds }),
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }),
        sb.rpc('get_training_overview', { p_node_ids: nodeIds }),
        sb.rpc('get_all_time_entries', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('forensic_callouts', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('get_coverage_gaps', { p_node_ids: nodeIds, p_date_from: dateTo, p_date_to: gapTo }),
        sb.rpc('get_pending_requests', { p_node_ids: nodeIds }),
        sb.rpc('policies_team_compliance', { p_node_ids: nodeIds }),
      ])
      setData(assemble({ summaryRes, prevRes, hrRes, rosterRes, healthRes, reviewsRes, daRes, trainRes, timeRes, calloutRes, gapsRes, pendingRes, policyRes }))
    } catch (e) {
      setErr(e?.message || 'Unable to load HR intelligence.')
      setData(null)
    } finally {
      setLoading(false)
      setLastUpdated(now())
    }
  }, [scopeKey, dateRange])

  useEffect(() => { load() }, [load])

  const d = data
  const alerts = useMemo(() => d ? buildAlerts(d) : [], [d])

  const filteredEmployees = useMemo(() => {
    if (!d) return []
    return d.employees.filter(e => {
      if (locFilter !== 'All' && e.location !== locFilter) return false
      if (roleFilter !== 'All' && e.role !== roleFilter) return false
      if (empSearch && !e.full_name.toLowerCase().includes(empSearch.toLowerCase())) return false
      return true
    })
  }, [d, locFilter, roleFilter, empSearch])

  // access control — all hooks run above this early return (rules-of-hooks safe)
  if (!isHR(role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)', marginBottom: 8 }}>Access Restricted</div>
        <div style={{ color: 'var(--t-text-muted)', fontSize: 14 }}>Forensic Command Center requires HR Manager access or above.</div>
      </div>
    )
  }

  function drillTo(domainId) {
    setView('forensic')
    setExpandedDomain(domainId)
    setTimeout(() => {
      const el = document.getElementById(`domain-${domainId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const ex = d?.exec || {}
  const LOCS = ['All', ...(d?.LOCS || [])]
  const ROLES = ['All', ...[...new Set((d?.employees || []).map(e => e.role))].filter(r => r && r !== DASH)]

  const viewBtn = (v) => ({
    padding: '9px 20px', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
    letterSpacing: '1px', textTransform: 'uppercase', border: 'none', cursor: 'pointer',
    background: view === v ? 'var(--t-accent)' : 'var(--t-surface-2)',
    color: view === v ? '#070b14' : 'var(--t-text-muted)',
    borderBottom: view === v ? '2px solid var(--t-accent)' : '2px solid transparent',
    transition: 'all .15s',
  })
  const locPill = (l) => ({
    padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: '1px solid ' + (locFilter === l ? 'var(--t-accent)' : 'var(--t-line)'),
    background: locFilter === l ? 'var(--t-accent-soft)' : 'transparent',
    color: locFilter === l ? 'var(--t-accent)' : 'var(--t-text-muted)',
    fontFamily: 'var(--font-sans)', transition: 'all .15s',
  })

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const noData = !loading && !err && d && !d._hasScope

  return (
    <>
      {/* PAGE HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.5px' }}>
            Forensic Command Center
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            CEO/HR Intelligence · Live data · {lastUpdated ? `Updated ${lastUpdated}` : 'Loading…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={load} style={{ ...btnSm, padding: '7px 14px' }}>↻ Refresh</button>
          <button onClick={() => window.print()} style={{ ...btnSm, padding: '7px 14px' }}>Print</button>
          {view === 'forensic' && (
            <button onClick={() => exportCSV(filteredEmployees, 'vip-forensic-export.csv')} style={{ ...btnSm, padding: '7px 14px', borderColor: 'var(--t-accent)', color: 'var(--t-accent)' }}>CSV</button>
          )}
        </div>
      </div>

      {/* VIEW TOGGLE */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--t-line)', paddingBottom: 0 }}>
        {[['executive', 'Executive'], ['forensic', 'Forensic'], ['alerts', 'Alert Center']].map(([v, label]) => (
          <button key={v} style={viewBtn(v)} onClick={() => setView(v)}>
            {label}
            {v === 'alerts' && criticalCount > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--t-alert)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                {criticalCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* GLOBAL FILTER BAR */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {LOCS.map(l => <button key={l} style={locPill(l)} onClick={() => setLocFilter(l)}>{l}</button>)}
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 10px', fontSize: 12, minWidth: 130 }}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          value={empSearch} onChange={e => setEmpSearch(e.target.value)}
          placeholder="Search employee…"
          style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 10px', fontSize: 12, minWidth: 160, fontFamily: 'var(--font-sans)' }}
        />
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 10px', fontSize: 12, minWidth: 120 }}>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="quarter">Last 90 Days</option>
        </select>
        {(locFilter !== 'All' || roleFilter !== 'All' || empSearch) && (
          <button onClick={() => { setLocFilter('All'); setRoleFilter('All'); setEmpSearch('') }} style={{ ...btnSm, color: 'var(--t-alert)', borderColor: 'var(--t-alert)' }}>Clear Filters</button>
        )}
      </div>

      {/* ERROR */}
      {err && (
        <div style={{ padding: '16px 18px', background: 'rgba(255,77,125,.08)', border: '1px solid rgba(255,77,125,.35)', color: 'var(--t-alert)', fontSize: 13, marginBottom: 20 }}>
          Could not load live HR data: {err} <button onClick={load} style={{ ...btnSm, marginLeft: 10, borderColor: 'var(--t-alert)', color: 'var(--t-alert)' }}>Retry</button>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ padding: '0 0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 16 }}>
            {Array.from({ length: 20 }).map((_, i) => <div key={i} style={{ height: 80, background: 'var(--t-surface)', border: '1px solid var(--t-line)', animation: 'pulse 1.4s ease infinite', animationDelay: `${i * 0.05}s` }} />)}
          </div>
        </div>
      )}

      {noData && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 14, border: '1px dashed var(--t-line)' }}>
          No locations are in your current scope, so there is nothing to report. Select a location from the scope selector.
        </div>
      )}

      {/* ── EXECUTIVE VIEW ───────────────────────────────────────── */}
      {!loading && !err && d && d._hasScope && view === 'executive' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 8 }}>Workforce Health</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
            <ExecTile label="Active Headcount" value={ex.active_headcount} prev={ex.active_headcount_prev} thresholds={{ good: 15, warn: 8 }} onClick={() => drillTo('turnover')} domain="turnover" />
            <ExecTile label="Scheduled Shifts" value={ex.scheduled_shifts} prev={ex.scheduled_shifts_prev} thresholds={{ good: 100, warn: 40 }} onClick={() => drillTo('scheduling')} domain="scheduling" />
            <ExecTile label="Coverage Rate" value={ex.coverage_rate == null ? DASH : fmtPct(ex.coverage_rate)} thresholds={{ good: 90, warn: 80 }} onClick={() => drillTo('scheduling')} domain="scheduling" />
            <ExecTile label="Callouts" value={ex.callout_count} thresholds={{ good: 0, warn: 5 }} isLower onClick={() => drillTo('attendance')} domain="attendance" />
            <ExecTile label="Attendance Rate" value={ex.attendance_rate == null ? DASH : fmtPct(ex.attendance_rate)} prev={ex.attendance_rate_prev} thresholds={{ good: 92, warn: 85 }} onClick={() => drillTo('attendance')} domain="attendance" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 8 }}>Time & Attendance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
            <ExecTile label="Labor Hours" value={ex.labor_hours == null ? DASH : ex.labor_hours} prev={ex.labor_hours_prev} onClick={() => drillTo('labor')} domain="labor" />
            <ExecTile label="OT Hours" value={ex.ot_hours == null ? DASH : ex.ot_hours} thresholds={{ good: 0, warn: 10 }} isLower onClick={() => drillTo('labor')} domain="labor" />
            <ExecTile label="Tardies" value={ex.tardies} thresholds={{ good: 0, warn: 3 }} isLower onClick={() => drillTo('attendance')} domain="attendance" />
            <ExecTile label="NCNS" value={ex.ncns} thresholds={{ good: 0, warn: 1 }} isLower onClick={() => drillTo('attendance')} domain="attendance" />
            <ExecTile label="Uncovered Callouts" value={ex.uncovered_callouts} thresholds={{ good: 0, warn: 1 }} isLower onClick={() => drillTo('attendance')} domain="attendance" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 8 }}>Training & Compliance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
            <ExecTile label="Training Compliance" value={ex.training_compliance == null ? DASH : fmtPct(ex.training_compliance)} prev={ex.training_compliance_prev} thresholds={{ good: 90, warn: 75 }} onClick={() => drillTo('training')} domain="training" />
            <ExecTile label="Certs Expired" value={ex.overdue_trainings} thresholds={{ good: 0, warn: 3 }} isLower onClick={() => drillTo('training')} domain="training" />
            <ExecTile label="Certs Expiring (30d)" value={ex.certs_expiring} thresholds={{ good: 0, warn: 2 }} isLower onClick={() => drillTo('training')} domain="training" />
            <ExecTile label="Valid Certs" value={ex.training_valid} onClick={() => drillTo('training')} domain="training" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 8 }}>HR Activity</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
            <ExecTile label="Open DAs" value={ex.open_das} prev={ex.open_das_prev} thresholds={{ good: 0, warn: 2 }} isLower onClick={() => drillTo('disciplinary')} domain="disciplinary" />
            <ExecTile label="Active PIPs" value={ex.active_pips} thresholds={{ good: 0, warn: 1 }} isLower onClick={() => drillTo('performance')} domain="performance" />
            <ExecTile label="Reviews Overdue" value={ex.reviews_overdue} thresholds={{ good: 0, warn: 2 }} isLower onClick={() => drillTo('performance')} domain="performance" />
            <ExecTile label="Pending PTO" value={ex.pending_pto} thresholds={{ good: 0, warn: 3 }} isLower />
            <ExecTile label="At-Risk Employees" value={ex.risk_emp} thresholds={{ good: 0, warn: 2 }} isLower onClick={() => drillTo('turnover')} domain="turnover" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 8 }}>Business</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
            <ExecTile label="Revenue" value={ex.revenue == null ? DASH : fmtK(ex.revenue)} prev={ex.revenue_prev} />
            <ExecTile label="Revenue Goal" value={ex.revenue_goal == null ? DASH : fmtK(ex.revenue_goal)} />
            <ExecTile label="Units Sold" value={ex.units} />
            <ExecTile label="Spiff Payouts" value={ex.spiff == null ? DASH : fmtK(ex.spiff)} />
            <ExecTile label="Labor Cost" value={ex.labor_cost == null ? DASH : fmtK(ex.labor_cost)} />
          </div>

          <div style={{ padding: '10px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text-muted)' }}>
            Click any tile to drill into its forensic domain. Values marked {DASH} have no recorded source for the current scope/period (e.g. labor cost has no wage data on file).
            &nbsp;·&nbsp;
            <span style={{ color: 'var(--t-success)' }}>● Green: On target</span>&nbsp;
            <span style={{ color: 'var(--t-warn)' }}>● Amber: Watch</span>&nbsp;
            <span style={{ color: 'var(--t-alert)' }}>● Red: Off target</span>
          </div>
        </div>
      )}

      {/* ── FORENSIC VIEW ────────────────────────────────────────── */}
      {!loading && !err && d && d._hasScope && view === 'forensic' && (
        <div>
          <DomainCard id="scheduling" title="Domain 1 — Scheduling & Coverage" badge={`${d.scheduling.uncovered_gaps} gaps`} badgeClass={d.scheduling.uncovered_gaps > 0 ? 'badge red' : 'badge green'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.scheduling.uncovered_list, 'scheduling.csv')}>
            <SchedulingForensics d={d} />
          </DomainCard>

          <DomainCard id="attendance" title="Domain 2 — Attendance Forensics" badge={`${d.exec.callout_count} callouts`} badgeClass={d.exec.callout_count > 0 ? 'badge amber' : 'badge green'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.employees.map(e => ({ name: e.full_name, location: e.location, ...(d.attendancePatterns[e.id] || {}) })), 'attendance.csv')}>
            <AttendanceForensics d={d} />
          </DomainCard>

          <DomainCard id="timeclock" title="Domain 3 — Time Clock Forensics" badge={`${d.timeClock.reduce((s, t) => s + t.missed_punches, 0)} open punches`} badgeClass={d.timeClock.some(t => t.missed_punches > 0) ? 'badge amber' : 'badge green'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.timeClock, 'timeclock.csv')}>
            <TimeClockForensics d={d} />
          </DomainCard>

          <DomainCard id="training" title="Domain 4 — Training Forensics" badge={ex.training_compliance == null ? 'no records' : `${Math.round(ex.training_compliance)}% compliant`} badgeClass={(ex.training_compliance || 0) >= 85 ? 'badge green' : 'badge amber'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.training, 'training.csv')}>
            <TrainingForensics d={d} />
          </DomainCard>

          <DomainCard id="compliance" title="Domain 5 — Policy & Cert Compliance" badge={`${d.training.filter(t => t.status === 'overdue').length} expired`} badgeClass="badge accent" expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.policyCompliance.employees, 'compliance.csv')}>
            <ComplianceForensics d={d} />
          </DomainCard>

          <DomainCard id="performance" title="Domain 6 — Performance Forensics" badge={`${d.perfReviews.filter(r => r.on_pip).length} PIPs`} badgeClass={d.perfReviews.some(r => r.on_pip) ? 'badge red' : 'badge green'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.perfReviews.map(r => ({ name: r.employee_name, location: r.location, score: r.score, days_since: r.days_since_review, pip: r.on_pip })), 'performance.csv')}>
            <PerformanceForensics d={d} />
          </DomainCard>

          <DomainCard id="disciplinary" title="Domain 7 — Disciplinary Forensics" badge={`${d.disciplinary.filter(da => da.status === 'open').length} open`} badgeClass={d.disciplinary.some(da => da.status === 'open' && da.severity === 'critical') ? 'badge red' : 'badge amber'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.disciplinary, 'disciplinary.csv')}>
            <DisciplinaryForensics d={d} />
          </DomainCard>

          <DomainCard id="health" title="Domain 8 — Employee Health Scores" badge="Health Index" badgeClass="badge accent" expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.employees.map(e => ({ name: e.full_name, location: e.location, health: e.health_score, attendance: e.attendance, open_da: e.open_da })), 'health.csv')}>
            <HealthScoreForensics d={d} />
          </DomainCard>

          <DomainCard id="labor" title="Domain 9 — Labor Hours Forensics" badge={ex.labor_hours == null ? 'no punches' : fmtHrs(ex.labor_hours)} badgeClass="badge accent" expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.laborData, 'labor-hours.csv')}>
            <LaborForensics d={d} />
          </DomainCard>

          <DomainCard id="turnover" title="Domain 10 — Turnover & Retention" badge={`${d.tenure.filter(t => t.at_risk).length} at risk`} badgeClass={d.tenure.some(t => t.at_risk) ? 'badge amber' : 'badge green'} expandedId={expandedDomain} setExpandedId={setExpandedDomain} onExport={() => exportCSV(d.tenure, 'turnover.csv')}>
            <TurnoverForensics d={d} />
          </DomainCard>

          {expandedDomain === null && (
            <div style={{ padding: '20px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
              Click any domain header above to expand its full forensic analysis.
            </div>
          )}
        </div>
      )}

      {/* ── ALERT CENTER ─────────────────────────────────────────── */}
      {!loading && !err && d && d._hasScope && view === 'alerts' && (
        <div>
          {(['critical', 'warning', 'info']).map(sev => {
            const sevAlerts = alerts.filter(a => a.severity === sev)
            if (sevAlerts.length === 0) return null
            const sevLabels = { critical: '🔴 Critical — Immediate Action Required', warning: '🟡 Warning — Action Needed', info: '🟢 Info — Monitor' }
            const sevColors = { critical: 'var(--t-alert)', warning: 'var(--t-warn)', info: 'var(--t-success)' }
            return (
              <div key={sev} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: sevColors[sev], marginBottom: 10, padding: '8px 0', borderBottom: `2px solid ${sevColors[sev]}40` }}>
                  {sevLabels[sev]} ({sevAlerts.length})
                </div>
                {sevAlerts.map((a, i) => <AlertCard key={i} {...a} />)}
              </div>
            )
          })}
          {alerts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-success)', fontSize: 16, fontWeight: 700 }}>
              ✓ No active alerts — all systems nominal
            </div>
          )}
        </div>
      )}
    </>
  )
}
