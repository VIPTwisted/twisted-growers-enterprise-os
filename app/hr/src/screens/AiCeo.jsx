import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

// ── HELPERS ───────────────────────────────────────────────────────────────────
const num = (v) => (typeof v === 'number' ? v : parseFloat(v)) || 0
const kFmt = (v) => `$${(num(v) / 1000).toFixed(num(v) >= 100000 ? 0 : 1)}K`
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const DAY = 86400000

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// rpc that resolves to data or null (never throws), matching CommandCenter pattern.
const rpc = (fn, args) => sb.rpc(fn, args).then(r => (r.error ? null : r.data)).catch(() => null)

// ── SHARED COMPONENTS (presentational — unchanged design) ─────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', borderRadius: 0,
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function Tab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      padding: '10px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
      borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
      transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    }}>
      {label}
      {badge != null && (
        <span style={{
          background: badge > 0 ? 'var(--t-accent)' : 'var(--t-surface-2)',
          color: badge > 0 ? '#000' : 'var(--t-text-muted)',
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
          minWidth: 18, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function RiskBar({ pct }) {
  const color = pct >= 80 ? 'var(--t-danger)' : pct >= 60 ? 'var(--t-warn)' : 'var(--t-success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--t-surface-2)', borderRadius: 0, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function DataPoint({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 4 }}>
      <span style={{ color: 'var(--t-accent)', flexShrink: 0, marginTop: 1 }}>›</span>
      <span>{text}</span>
    </div>
  )
}

function CategoryBadge({ cat }) {
  const map = {
    Sales: { bg: 'rgba(0,229,255,.12)', color: 'var(--t-accent)' },
    HR: { bg: 'rgba(100,150,255,.12)', color: '#6496ff' },
    Operations: { bg: 'rgba(255,180,50,.12)', color: 'var(--t-warn)' },
    Risk: { bg: 'rgba(255,80,80,.12)', color: 'var(--t-danger)' },
    Opportunity: { bg: 'rgba(50,220,120,.12)', color: 'var(--t-success)' },
  }
  const style = map[cat] || { bg: 'var(--t-surface-2)', color: 'var(--t-text-muted)' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 0, background: style.bg, color: style.color }}>
      {cat}
    </span>
  )
}

function RiskBadge({ level }) {
  const map = { low: { c: 'var(--t-success)', label: 'Low Priority' }, medium: { c: 'var(--t-warn)', label: 'Medium Priority' }, high: { c: 'var(--t-danger)', label: 'High Priority' } }
  const m = map[level] || map.low
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: m.c, padding: '2px 8px', border: `1px solid ${m.c}`, borderRadius: 0 }}>{m.label}</span>
}

function EmptyState({ children }) {
  return (
    <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
      {children}
    </div>
  )
}

// ── DERIVATION: real aggregates → executive model ─────────────────────────────
// All numbers below come from live RPCs. Nothing is randomised or fabricated.
function computeModel(d, locName) {
  const hr = d.hr || {}
  const das = Array.isArray(d.das) ? d.das : []
  const att = Array.isArray(d.att) ? d.att : []
  const gaps = Array.isArray(d.gaps) ? d.gaps : []
  const leaders = Array.isArray(d.leaders) ? d.leaders : []
  const sales = d.sales || {}
  const anns = Array.isArray(d.comms?.announcements) ? d.comms.announcements : []
  const byLoc = Array.isArray(hr.by_location) ? hr.by_location : []

  const headcount = num(hr.headcount ?? hr.active)
  const trainingComplete = num(hr.training_complete)
  const trainingOverdue = num(hr.training_overdue)
  const trainingDueSoon = num(hr.training_due_soon)
  const trainingTotal = trainingComplete + trainingOverdue + trainingDueSoon
  const trainingPct = trainingTotal ? Math.round((trainingComplete / trainingTotal) * 100) : null
  const docsPending = num(hr.docs_pending_ack)
  const pendingPto = num(d.pto)

  // Open disciplinary actions (not acknowledged / not closed).
  const openDas = das.filter(a => {
    const s = (a.status || '').toLowerCase()
    return !['closed', 'resolved', 'rescinded', 'expired'].includes(s)
  })
  // DA follow-ups overdue (needs action today).
  const overdueFollowups = openDas.filter(a => a.follow_up_date && new Date(a.follow_up_date) <= new Date())

  // Retention watch: employees ranked by active DA count (live signal, no guessing).
  const byPerson = {}
  for (const a of openDas) {
    const key = a.person_id || a.person_name
    if (!key) continue
    if (!byPerson[key]) byPerson[key] = { name: a.person_name || 'Unnamed', loc: a.node_name || a.location || '', count: 0, latest: null }
    byPerson[key].count += 1
    if (!byPerson[key].latest || (a.issued_date && a.issued_date > byPerson[key].latest)) byPerson[key].latest = a.issued_date
  }
  const retentionWatch = Object.values(byPerson).sort((x, y) => y.count - x.count)

  // Attendance events by type (real event list).
  const attByType = {}
  for (const e of att) {
    const t = (e.type || 'event').toLowerCase()
    attByType[t] = (attByType[t] || 0) + 1
  }

  // Sales run-rate forecast from the real trailing 30-day total (linear extrapolation).
  const sales30 = num(sales.total_amount)
  const hasSales = sales30 > 0
  const forecast = hasSales
    ? { '30d': sales30, '60d': sales30 * 2, '90d': sales30 * 3 }
    : null

  // Per-location scorecard from real by_location rows (headcount + training overdue) + DA counts.
  const daByNode = {}
  for (const a of openDas) {
    const n = a.node_name || a.location || '—'
    daByNode[n] = (daByNode[n] || 0) + 1
  }
  const gapsByNode = {}
  for (const g of gaps) {
    const n = g.node_name || g.location || '—'
    gapsByNode[n] = (gapsByNode[n] || 0) + 1
  }
  const scorecard = byLoc.map(l => {
    const name = l.node_name || locName(l.node_id) || '—'
    const hc = num(l.headcount)
    const to = num(l.training_overdue)
    const openDaN = daByNode[name] || 0
    const gapN = gapsByNode[name] || 0
    // Health = 100 penalised by real operational signals, relative to headcount.
    let score = 100
    if (hc > 0) score -= Math.min(40, Math.round((to / hc) * 60))
    score -= Math.min(25, openDaN * 8)
    score -= Math.min(20, gapN * 6)
    score = Math.max(0, Math.min(100, score))
    return { loc: name, score, headcount: hc, trainingOverdue: to, openDa: openDaN, gaps: gapN }
  }).sort((a, b) => b.score - a.score)

  // Chain-wide business health from the same real signals.
  let health = null
  if (headcount > 0) {
    let s = 100
    s -= Math.min(30, gaps.length * 6)
    s -= Math.min(25, openDas.length * 5)
    if (trainingPct != null) s -= Math.round((1 - trainingPct / 100) * 25)
    s -= Math.min(10, docsPending)
    s -= Math.min(10, pendingPto > headcount ? 10 : Math.round((pendingPto / Math.max(1, headcount)) * 10))
    health = Math.max(0, Math.min(100, Math.round(s)))
  }

  const topPerformer = leaders[0]
    ? (leaders[0].full_name || leaders[0].person_name || leaders[0].name || null)
    : null
  const topPerformerLoc = leaders[0]?.node_name || leaders[0]?.location || ''

  const alertsCount = gaps.length + overdueFollowups.length

  // ── Insights: derived strictly from live data. Empty when nothing is flagged. ──
  const insights = []
  if (gaps.length > 0) {
    insights.push({
      id: 'ins-coverage', category: 'Risk',
      title: `${gaps.length} coverage gap${gaps.length > 1 ? 's' : ''} in the next 7 days`,
      body: 'Scheduled shifts are short of required staffing. Resolve before the shift date to stay within policy.',
      dataPoints: gaps.slice(0, 4).map(g => `${g.node_name || g.location || 'Location'} — ${g.shift_date || g.date || 'upcoming'}${g.role ? ` · ${g.role}` : ''}`),
      action: 'Open the schedule and fill the open shifts.',
      actionType: 'schedule', route: '/schedule',
    })
  }
  if (overdueFollowups.length > 0) {
    insights.push({
      id: 'ins-da', category: 'HR',
      title: `${overdueFollowups.length} disciplinary follow-up${overdueFollowups.length > 1 ? 's' : ''} overdue`,
      body: 'Open disciplinary actions have a follow-up date that has passed. Progressive-discipline policy requires timely review.',
      dataPoints: overdueFollowups.slice(0, 4).map(a => `${a.person_name || 'Employee'} — ${a.type || 'action'} · follow-up ${a.follow_up_date}`),
      action: 'Review the disciplinary records and complete the follow-ups.',
      actionType: 'da', route: '/disciplinary',
    })
  }
  if (trainingOverdue > 0) {
    insights.push({
      id: 'ins-training', category: 'HR',
      title: `${trainingOverdue} training assignment${trainingOverdue > 1 ? 's' : ''} overdue`,
      body: `Chain-wide training completion is at ${trainingPct != null ? trainingPct + '%' : 'an incomplete level'}. Overdue items may include compliance-required courses.`,
      dataPoints: [
        `Overdue: ${trainingOverdue}`,
        `Due soon: ${trainingDueSoon}`,
        `Completed: ${trainingComplete}`,
      ],
      action: 'Reassign or send reminders for overdue training.',
      actionType: 'training', route: '/training-lms',
    })
  }
  if (pendingPto > 0) {
    insights.push({
      id: 'ins-pto', category: 'Operations',
      title: `${pendingPto} time-off request${pendingPto > 1 ? 's' : ''} awaiting review`,
      body: 'Pending PTO requests are unresolved. Review them ahead of the affected shifts to avoid coverage surprises.',
      dataPoints: [`Pending requests: ${pendingPto}`, `Active headcount: ${headcount}`],
      action: 'Review and approve or decline pending requests.',
      actionType: 'pto', route: '/requests',
    })
  }
  if (docsPending > 0) {
    insights.push({
      id: 'ins-docs', category: 'HR',
      title: `${docsPending} document acknowledgement${docsPending > 1 ? 's' : ''} outstanding`,
      body: 'Employees have unacknowledged policy or handbook documents assigned to them.',
      dataPoints: [`Outstanding acknowledgements: ${docsPending}`],
      action: 'Follow up on outstanding document acknowledgements.',
      actionType: 'docs', route: '/documents',
    })
  }
  if (hasSales) {
    insights.push({
      id: 'ins-sales', category: 'Sales',
      title: `${kFmt(sales30)} in sales over the last 30 days`,
      body: `${num(sales.sale_count)} transactions · ${num(sales.total_units)} units. Linear run-rate projects ${kFmt(sales30 * 3)} over the next 90 days if the pace holds.`,
      dataPoints: [
        `Transactions: ${num(sales.sale_count)}`,
        `Units sold: ${num(sales.total_units)}`,
        `30-day total: ${kFmt(sales30)}`,
      ],
      action: 'Review the sales detail by location and category.',
      actionType: 'sales', route: '/sales',
    })
  }

  // ── Decisions: derived triage items requiring a manager call. ──
  const decisions = []
  const multiDa = retentionWatch.filter(p => p.count >= 2)
  if (multiDa.length > 0) {
    const p = multiDa[0]
    decisions.push({
      id: 'dec-da',
      question: `Escalate ${p.name} (${p.loc || 'location'}) — ${p.count} active disciplinary actions on file?`,
      recommendation: `${p.name} has ${p.count} open disciplinary actions. Progressive-discipline policy triggers a mandatory review once multiple actions are active. Review the record before the next scheduled shift.`,
      evidence: [
        `Active disciplinary actions: ${p.count}`,
        p.latest ? `Most recent issued: ${p.latest}` : 'Issue dates on file',
        `Location: ${p.loc || '—'}`,
      ],
      alternatives: ['Final written warning with a performance plan', 'Schedule a 1:1 before deciding', 'Defer pending manager review'],
      riskLevel: p.count >= 3 ? 'high' : 'medium',
      executeLabel: 'Open Disciplinary', route: '/disciplinary',
    })
  }
  if (gaps.length > 0) {
    decisions.push({
      id: 'dec-coverage',
      question: `Resolve ${gaps.length} open coverage gap${gaps.length > 1 ? 's' : ''} this week?`,
      recommendation: 'Scheduled shifts are below required staffing. Fill the open shifts, request coverage, or adjust the schedule before the shift dates.',
      evidence: gaps.slice(0, 4).map(g => `${g.node_name || g.location || 'Location'} — ${g.shift_date || g.date || 'upcoming'}`),
      alternatives: ['Offer the shifts to available staff', 'Approve overtime for a keyholder', 'Adjust operating hours for the day'],
      riskLevel: gaps.length >= 3 ? 'high' : 'medium',
      executeLabel: 'Fix Schedule', route: '/schedule',
    })
  }
  if (pendingPto > 0) {
    decisions.push({
      id: 'dec-pto',
      question: `Clear ${pendingPto} pending time-off request${pendingPto > 1 ? 's' : ''}?`,
      recommendation: 'Pending PTO requests are unresolved. Review them against current coverage and approve or decline.',
      evidence: [`Pending requests: ${pendingPto}`, `Active headcount: ${headcount}`, `Open coverage gaps: ${gaps.length}`],
      alternatives: ['Approve requests without coverage conflicts', 'Decline requests that collide with gaps', 'Ask for alternate dates'],
      riskLevel: 'low',
      executeLabel: 'Review Requests', route: '/requests',
    })
  }

  return {
    headcount, active: num(hr.active), inactive: num(hr.inactive),
    trainingComplete, trainingOverdue, trainingDueSoon, trainingTotal, trainingPct,
    docsPending, pendingPto,
    openDaCount: openDas.length, overdueFollowups: overdueFollowups.length,
    retentionWatch, attByType, attTotal: att.length,
    sales30, hasSales, forecast, salesCount: num(sales.sale_count), salesUnits: num(sales.total_units),
    scorecard, health, topPerformer, topPerformerLoc, alertsCount,
    announcements: anns.length,
    insights, decisions,
    best: scorecard[0] || null, worst: scorecard.length > 1 ? scorecard[scorecard.length - 1] : null,
  }
}

// ── CHAT: answers strictly from the live model. No fabricated numbers. ─────────
function buildResponse(msg, m, userName) {
  const ql = msg.toLowerCase()
  const first = userName ? `, ${userName.split(' ')[0]}` : ''
  const noData = m.headcount === 0 && !m.hasSales

  const match = (words) => words.some(w => ql.includes(w))

  if (match(['hello', 'hi', 'hey', 'good morning', 'good afternoon'])) {
    if (noData) return `Good ${getTimeOfDay()}${first}. I'm connected to the live platform, but there's no operational data in scope yet — no active headcount, sales, or attendance records. Once your team, schedules, and sales start flowing in, I'll brief you here.`
    return `Good ${getTimeOfDay()}${first}. In scope right now: ${m.headcount} active employee${m.headcount === 1 ? '' : 's'}, ${m.openDaCount} open disciplinary action${m.openDaCount === 1 ? '' : 's'}, ${m.pendingPto} pending time-off request${m.pendingPto === 1 ? '' : 's'}, and ${m.alertsCount} item${m.alertsCount === 1 ? '' : 's'} needing attention today.`
  }
  if (match(['attention', 'priority', 'urgent', 'what needs', 'what should'])) {
    if (m.insights.length === 0) return `Good ${getTimeOfDay()}${first}. Nothing is flagged in scope right now — no coverage gaps, overdue follow-ups, or pending approvals in the live data.`
    const top = m.insights.slice(0, 3).map((i, idx) => `(${idx + 1}) ${i.title}`).join('; ')
    return `Top items from the live data${first}: ${top}. Say the word and I'll point you to the right screen.`
  }
  if (match(['late', 'tardy', 'attendance', 'absent', 'callout'])) {
    if (m.attTotal === 0) return `No attendance events are recorded in scope for this period.`
    const parts = Object.entries(m.attByType).map(([t, n]) => `${n} ${t}`).join(', ')
    return `Attendance events in scope: ${m.attTotal} total (${parts}).`
  }
  if (match(['sales', 'revenue', 'performance'])) {
    if (!m.hasSales) return `No sales are recorded in scope for the last 30 days.`
    return `Last 30 days in scope: ${kFmt(m.sales30)} across ${m.salesCount} transaction${m.salesCount === 1 ? '' : 's'} and ${m.salesUnits} units. Linear run-rate projects about ${kFmt(m.sales30 * 3)} over 90 days.`
  }
  if (match(['staff', 'schedule', 'coverage', 'shift'])) {
    if (m.alertsCount === 0) return `No open coverage gaps in the next 7 days across your scope.`
    return `Coverage: I see ${m.alertsCount} open item${m.alertsCount === 1 ? '' : 's'} in the next 7 days (gaps plus overdue disciplinary follow-ups). Open the schedule to resolve them.`
  }
  if (match(['da', 'disciplinary', 'write', 'warning'])) {
    if (m.openDaCount === 0) return `No open disciplinary actions in scope.`
    const watch = m.retentionWatch[0]
    return `Open disciplinary actions: ${m.openDaCount}. ${m.overdueFollowups} follow-up${m.overdueFollowups === 1 ? '' : 's'} overdue.${watch ? ` Highest count: ${watch.name} with ${watch.count}.` : ''}`
  }
  if (match(['training', 'certification', 'cert', 'compliance'])) {
    if (m.trainingTotal === 0) return `No training assignments are recorded in scope.`
    return `Training: ${m.trainingComplete} complete, ${m.trainingDueSoon} due soon, ${m.trainingOverdue} overdue — ${m.trainingPct}% completion in scope.`
  }
  if (match(['pto', 'time off', 'request', 'vacation'])) {
    return m.pendingPto > 0
      ? `${m.pendingPto} time-off request${m.pendingPto === 1 ? '' : 's'} pending review in scope.`
      : `No pending time-off requests in scope.`
  }
  if (match(['retention', 'risk', 'turnover', 'quit', 'leave'])) {
    if (m.retentionWatch.length === 0) return `No retention signals in the live data — no employees currently carry open disciplinary actions.`
    const top = m.retentionWatch.slice(0, 3).map(p => `${p.name} (${p.count} DA${p.count === 1 ? '' : 's'})`).join(', ')
    return `Retention watch (by active disciplinary actions): ${top}.`
  }
  if (match(['location', 'store', 'underperform', 'best', 'worst'])) {
    if (m.scorecard.length === 0) return `No per-location data in scope yet.`
    const b = m.best, w = m.worst
    return `By computed health score: ${b ? `${b.loc} leads at ${b.score}` : '—'}${w && w.loc !== b?.loc ? `, ${w.loc} is lowest at ${w.score}` : ''}. Scores are derived from real headcount, overdue training, open DAs, and coverage gaps.`
  }
  // Default — honest summary of live scope.
  if (noData) return `I only report what's in the live data${first}. Right now there's no operational data in your scope — no headcount, sales, or attendance yet.`
  return `From the live data in scope${first}: ${m.headcount} active employees, ${m.openDaCount} open disciplinary actions, ${m.pendingPto} pending requests, ${m.alertsCount} items needing attention, and ${m.hasSales ? kFmt(m.sales30) + ' in 30-day sales' : 'no sales recorded yet'}. Ask me about coverage, disciplinary, training, sales, or retention.`
}

const CONTEXT_CHIPS = ['What needs my attention?', "Show me today's coverage", 'Any HR alerts?']
const QUICK_CHIPS = [
  'Which location is underperforming?',
  'Who are our retention risks?',
  'How are sales tracking this week?',
  'Show me staffing status',
  "What's the training situation?",
]

// ── LIVE STATS SIDEBAR (real platform metrics) ────────────────────────────────
function LiveStats({ m, navigate }) {
  const tiles = [
    { label: 'Active Headcount', value: m.headcount, color: 'var(--t-text)', route: '/roster', title: 'Active employees in scope' },
    { label: 'Open Disciplinary', value: m.openDaCount, color: m.openDaCount > 0 ? 'var(--t-danger)' : 'var(--t-success)', alert: m.openDaCount > 0 ? 'red' : null, route: '/disciplinary', title: 'Open disciplinary actions' },
    { label: 'Coverage Gaps 7d', value: m.alertsCount, color: m.alertsCount > 0 ? 'var(--t-warn)' : 'var(--t-success)', alert: m.alertsCount > 2 ? 'amber' : null, route: '/schedule', title: 'Open coverage gaps + overdue follow-ups' },
    { label: 'Pending PTO', value: m.pendingPto, color: m.pendingPto > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)', route: '/requests', title: 'Time-off requests awaiting review' },
    { label: 'Training Overdue', value: m.trainingOverdue, color: m.trainingOverdue > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)', route: '/training-lms', title: 'Overdue training assignments' },
    { label: 'Docs Unacked', value: m.docsPending, color: m.docsPending > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)', route: '/documents', title: 'Unacknowledged documents' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel>Live Platform Stats</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {tiles.map((t, i) => (
          <div key={i} onClick={() => t.route && navigate(t.route)} title={t.title}
            style={{
              background: 'var(--t-surface-2)',
              border: `1px solid ${t.alert === 'red' ? 'var(--t-danger)' : t.alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
              padding: '10px 12px', borderRadius: 0, cursor: t.route ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
            }}>
            {t.alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
            {t.alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.color, lineHeight: 1 }}>{t.value}</div>
            {t.route && <div style={{ fontSize: 9, color: 'var(--t-accent)', marginTop: 3, letterSpacing: '.04em' }}>TAP TO OPEN →</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── TAB 1: EXECUTIVE BRIEFING ─────────────────────────────────────────────────
function ExecutiveBriefing({ m, personName, navigate }) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([])
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text) => {
    const msg = (text || chatInput).trim()
    if (!msg) return
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    // Answers derive synchronously from the already-fetched live model — no
    // artificial latency, no pretend "thinking".
    setMessages(prev => [...prev, { role: 'ai', text: buildResponse(msg, m, personName) }])
  }, [chatInput, personName, m])

  const healthColor = m.health == null ? 'var(--t-text-faint)'
    : m.health >= 80 ? 'var(--t-success)' : m.health >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'

  // Real alerts derived from the model (coverage gaps + overdue DA follow-ups).
  const alerts = []
  if (m.alertsCount > 0) alerts.push({ risk: `${m.alertsCount} coverage/follow-up item${m.alertsCount > 1 ? 's' : ''} need attention`, detail: 'Open shifts short of policy or overdue disciplinary follow-ups', level: 'red', btnLabel: 'Fix Schedule', route: '/schedule' })
  if (m.openDaCount > 0) alerts.push({ risk: `${m.openDaCount} open disciplinary action${m.openDaCount > 1 ? 's' : ''}`, detail: `${m.overdueFollowups} follow-up${m.overdueFollowups === 1 ? '' : 's'} overdue`, level: 'amber', btnLabel: 'View DAs', route: '/disciplinary' })
  if (m.trainingOverdue > 0) alerts.push({ risk: `${m.trainingOverdue} overdue training assignment${m.trainingOverdue > 1 ? 's' : ''}`, detail: m.trainingPct != null ? `${m.trainingPct}% completion in scope` : 'Completion below target', level: 'amber', btnLabel: 'Reassign', route: '/training-lms' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Business Health Card */}
        <div className="card" style={{ padding: '20px 22px', background: 'var(--t-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 }}>AI Executive Briefing — Today</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>Good {getTimeOfDay()}{personName ? `, ${personName.split(' ')[0]}` : ''}.</div>
              <div style={{ fontSize: 13, color: 'var(--t-text-muted)', lineHeight: 1.6, maxWidth: 480 }}>
                {m.headcount === 0 && !m.hasSales
                  ? 'No operational data is in scope yet. As your team, schedules, and sales come online, this briefing fills in from the live platform.'
                  : `In scope: ${m.headcount} active employees, ${m.openDaCount} open disciplinary actions, ${m.alertsCount} coverage items to resolve today${m.hasSales ? `, and ${kFmt(m.sales30)} in 30-day sales` : ''}.`}
              </div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 22px', borderRadius: 0, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 4 }}>Business Health Score</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: healthColor, lineHeight: 1 }}>{m.health == null ? '—' : m.health}</div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>{m.health == null ? 'awaiting live data' : `out of 100 · ${m.health >= 80 ? 'Good' : m.health >= 60 ? 'Fair' : 'Needs Work'}`}</div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="card" style={{ padding: '16px 18px', borderLeft: alerts.length ? '2px solid var(--t-danger)' : '1px solid var(--t-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: alerts.length ? 'var(--t-danger)' : 'var(--t-success)' }}>{alerts.length ? '▼' : '✓'}</span>
            <SectionLabel>Active Risks / Alerts</SectionLabel>
          </div>
          {alerts.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No active risks flagged in the live data.</div>}
          {alerts.map((r, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < alerts.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.level === 'red' ? 'var(--t-danger)' : 'var(--t-warn)', flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.level === 'red' ? 'var(--t-danger)' : 'var(--t-warn)', marginBottom: 2 }}>{r.risk}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{r.detail}</div>
                </div>
              </div>
              <button onClick={() => navigate(r.route)}
                style={{ marginLeft: 16, fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.2)', borderRadius: 0, padding: '3px 10px', cursor: 'pointer', letterSpacing: '.04em' }}
              >{r.btnLabel} →</button>
            </div>
          ))}
        </div>

        {/* Recommended Actions — derived from the same real insights */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <SectionLabel>Recommended Actions Today</SectionLabel>
          {m.insights.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Nothing recommended — no flagged items in the live data.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {m.insights.map((a, i) => {
              const pc = a.category === 'Risk' ? 'var(--t-danger)' : a.category === 'HR' ? '#6496ff' : a.category === 'Sales' ? 'var(--t-accent)' : 'var(--t-warn)'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: pc, flexShrink: 0, minWidth: 70, textTransform: 'uppercase' }}>{a.category}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600, marginBottom: 2 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{a.action}</div>
                  </div>
                  <button onClick={() => navigate(a.route)}
                    style={{ fontSize: 10, fontWeight: 700, color: '#000', background: 'var(--t-accent)', border: 'none', borderRadius: 0, padding: '4px 12px', cursor: 'pointer', flexShrink: 0, letterSpacing: '.04em', whiteSpace: 'nowrap' }}
                  >Open →</button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <SectionLabel>Ask the AI CEO — answers from your live data</SectionLabel>
          {messages.length > 0 && (
            <div style={{ marginBottom: 12, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: msg.role === 'ai' ? 'var(--t-accent)' : 'var(--t-text-muted)', flexShrink: 0, paddingTop: 3, minWidth: 26, fontFamily: 'var(--font-mono)' }}>{msg.role === 'ai' ? 'AI' : 'You'}</span>
                  <span style={{ fontSize: 13, color: msg.role === 'ai' ? 'var(--t-text)' : 'var(--t-text-muted)', lineHeight: 1.65 }}>{msg.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {CONTEXT_CHIPS.map((chip, i) => (
              <button key={i} onClick={() => sendMessage(chip)}
                style={{ background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.25)', borderRadius: 0, padding: '4px 12px', fontSize: 11, color: 'var(--t-accent)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '.02em' }}
              >{chip}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 0, padding: '8px 12px' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask about coverage, disciplinary, training, sales, retention…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--t-text)', fontFamily: 'inherit' }} />
            <button onClick={() => sendMessage()} disabled={!chatInput.trim()}
              style={{ background: chatInput.trim() ? 'var(--t-accent)' : 'var(--t-surface)', color: chatInput.trim() ? '#000' : 'var(--t-text-faint)', border: '1px solid var(--t-line)', borderRadius: 0, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: chatInput.trim() ? 'pointer' : 'default', transition: 'all .15s' }}
            >→</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {QUICK_CHIPS.map((chip, i) => (
              <button key={i} onClick={() => sendMessage(chip)}
                style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 0, padding: '4px 12px', fontSize: 11, color: 'var(--t-text-muted)', cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit' }}
              >{chip}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '16px', position: 'sticky', top: 16 }}>
        <LiveStats m={m} navigate={navigate} />
      </div>
    </div>
  )
}

// ── TAB 2: INSIGHTS DASHBOARD ─────────────────────────────────────────────────
function InsightsDashboard({ m, locationIds, personId, personName, navigate }) {
  // dismissed / created are ephemeral view state — insights regenerate from live data.
  const [dismissed, setDismissed] = useState({})
  const [created, setCreated] = useState({})
  const [taskErr, setTaskErr] = useState({})
  const [filter, setFilter] = useState('All')
  const categories = ['All', 'Sales', 'HR', 'Operations', 'Risk']

  const visible = m.insights.filter(ins => !dismissed[ins.id] && (filter === 'All' || ins.category === filter))

  const acceptTask = async (ins) => {
    // Real write: create a task in user_tasks via the live create_task RPC
    // (signature verified against the DB), then reflect the server result.
    setTaskErr(prev => ({ ...prev, [ins.id]: null }))
    const res = await sb.rpc('create_task', {
      p_title: ins.title,
      p_category: ins.category,
      p_priority: ins.category === 'Risk' ? 'High' : 'Medium',
      p_due_date: iso(Date.now() + 2 * DAY),
      p_description: `${ins.body}\n\nRecommended action: ${ins.action}`,
      p_node_id: locationIds[0] || null,
      p_person_id: personId,
      p_assigned_to: personId,
    })
    if (res.error) {
      setTaskErr(prev => ({ ...prev, [ins.id]: res.error.message || 'Task could not be saved.' }))
    } else {
      setCreated(prev => ({ ...prev, [ins.id]: true }))
    }
  }

  const dismissInsight = (ins) => {
    // View-state filter (insights regenerate from live signals) + a real
    // forensic record of who dismissed what, in the platform audit log.
    setDismissed(prev => ({ ...prev, [ins.id]: true }))
    sb.rpc('write_audit', {
      p_actor_id: personId, p_actor_name: personName || null,
      p_action: 'AI CEO Insight Dismissed', p_target: ins.title,
      p_meta: { insight_id: ins.id, category: ins.category },
    }).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{ background: filter === cat ? 'var(--t-accent)' : 'var(--t-surface-2)', color: filter === cat ? '#000' : 'var(--t-text-muted)', border: `1px solid ${filter === cat ? 'var(--t-accent)' : 'var(--t-line)'}`, padding: '5px 14px', borderRadius: 0, fontSize: 12, fontWeight: filter === cat ? 700 : 500, cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit' }}>
            {cat}
            {cat !== 'All' && <span style={{ marginLeft: 5, fontSize: 10, opacity: .7 }}>{m.insights.filter(i => !dismissed[i.id] && i.category === cat).length}</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <EmptyState>
          {m.insights.length === 0
            ? 'No insights to show — nothing is flagged in the live data for your scope.'
            : 'No active insights in this category.'}
        </EmptyState>
      )}

      {visible.map(ins => (
        <div key={ins.id} className="card" style={{ padding: '18px 20px', borderLeft: ins.category === 'Risk' ? '2px solid var(--t-danger)' : ins.category === 'Sales' ? '2px solid var(--t-accent)' : '1px solid var(--t-line)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CategoryBadge cat={ins.category} />
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono)' }}>from live data</span>
            </div>
            <button onClick={() => dismissInsight(ins)}
              style={{ background: 'none', border: 'none', color: 'var(--t-text-faint)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }} title="Dismiss">×</button>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 8, lineHeight: 1.35 }}>{ins.title}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{ins.body}</div>

          {ins.dataPoints.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 6 }}>Supporting Data</div>
              {ins.dataPoints.map((dp, i) => <DataPoint key={i} text={dp} />)}
            </div>
          )}

          <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px 14px', borderRadius: 0, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>Recommended Action: </span>
            <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{ins.action}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {created[ins.id] ? (
              <span style={{ fontSize: 12, color: 'var(--t-success)', fontWeight: 600 }}>✓ Task Created</span>
            ) : (
              <button onClick={() => acceptTask(ins)}
                style={{ background: 'var(--t-accent)', color: '#000', border: 'none', borderRadius: 0, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >Accept &amp; Create Task</button>
            )}
            <button onClick={() => navigate(ins.route)}
              style={{ background: 'none', border: '1px solid var(--t-accent)', borderRadius: 0, padding: '6px 16px', fontSize: 12, color: 'var(--t-accent)', cursor: 'pointer', fontWeight: 600 }}
            >Open →</button>
            <button onClick={() => dismissInsight(ins)}
              style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 0, padding: '6px 16px', fontSize: 12, color: 'var(--t-text-muted)', cursor: 'pointer' }}
            >Dismiss</button>
            {taskErr[ins.id] && (
              <span style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 600 }}>Not saved: {taskErr[ins.id]}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── TAB 3: PREDICTIONS & FORECASTS (real run-rate + real compliance) ──────────
function PredictionsForecasts({ m }) {
  const [horizon, setHorizon] = useState('30d')
  const horizons = ['30d', '60d', '90d']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Chain sales forecast — linear run-rate from real trailing-30-day sales */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <SectionLabel>Chain-Wide Sales Forecast — Run-Rate</SectionLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {horizons.map(h => (
              <button key={h} onClick={() => setHorizon(h)}
                style={{ background: horizon === h ? 'var(--t-accent)' : 'var(--t-surface-2)', color: horizon === h ? '#000' : 'var(--t-text-muted)', border: `1px solid ${horizon === h ? 'var(--t-accent)' : 'var(--t-line)'}`, padding: '5px 14px', borderRadius: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >{h === '30d' ? '30 Days' : h === '60d' ? '60 Days' : '90 Days'}</button>
            ))}
          </div>
        </div>
        {m.forecast ? (
          <>
            <div style={{ textAlign: 'center', padding: '18px', background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.2)', borderRadius: 0, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--t-accent)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Projected {horizon === '30d' ? '30-Day' : horizon === '60d' ? '60-Day' : '90-Day'} Sales</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--t-accent)' }}>{kFmt(m.forecast[horizon])}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', borderTop: '1px solid var(--t-line)', paddingTop: 10 }}>
              Basis: {kFmt(m.sales30)} of actual sales in the last 30 days ({m.salesCount} transactions). Linear run-rate extrapolation — not a modelled forecast.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', padding: '8px 0' }}>
            No sales are recorded in scope for the last 30 days. A run-rate forecast will appear once sales data is available.
          </div>
        )}
      </div>

      {/* Training compliance — current real numbers, no fabricated projection */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <SectionLabel>Training Compliance — Current</SectionLabel>
        {m.trainingTotal > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Completion in scope</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.trainingPct >= 80 ? 'var(--t-success)' : m.trainingPct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{m.trainingPct}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--t-surface-2)', borderRadius: 0, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${m.trainingPct}%`, height: '100%', background: m.trainingPct >= 80 ? 'var(--t-success)' : m.trainingPct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { label: 'Complete', value: m.trainingComplete, color: 'var(--t-success)' },
                { label: 'Due Soon', value: m.trainingDueSoon, color: 'var(--t-warn)' },
                { label: 'Overdue', value: m.trainingOverdue, color: 'var(--t-danger)' },
              ].map(t => (
                <div key={t.label} style={{ textAlign: 'center', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px', borderRadius: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: t.color, lineHeight: 1 }}>{t.value}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginTop: 4 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No training assignments recorded in scope.</div>
        )}
      </div>

      {/* Per-location health scorecard — real headcount / training / DAs / gaps */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <SectionLabel>Location Health — Live Signals</SectionLabel>
        {m.scorecard.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No per-location data in scope yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                  {['Location', 'Health', 'Headcount', 'Training Overdue', 'Open DAs', 'Coverage Gaps'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 10px', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.scorecard.map(s => {
                  const sc = s.score >= 80 ? 'var(--t-success)' : s.score >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'
                  return (
                    <tr key={s.loc} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--t-text)' }}>{s.loc}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: sc, fontFamily: 'var(--font-mono)' }}>{s.score}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--t-text-muted)' }}>{s.headcount}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: s.trainingOverdue > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{s.trainingOverdue}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: s.openDa > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{s.openDa}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: s.gaps > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{s.gaps}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention watch — real employees carrying open disciplinary actions */}
      <div className="card" style={{ padding: '18px 20px', borderLeft: m.retentionWatch.length ? '2px solid var(--t-danger)' : '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionLabel>Retention Watch — Open Disciplinary Signals</SectionLabel>
          {m.retentionWatch.length > 0 && <span className="badge red">{m.retentionWatch.length} flagged</span>}
        </div>
        {m.retentionWatch.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No retention signals — no employees currently carry open disciplinary actions in scope.</div>
        ) : (
          m.retentionWatch.slice(0, 10).map((emp, i) => {
            const pct = Math.min(100, emp.count * 33)
            return (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < Math.min(10, m.retentionWatch.length) - 1 ? '1px solid var(--t-line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</span>
                    {emp.loc && <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 8 }}>{emp.loc}</span>}
                  </div>
                </div>
                <RiskBar pct={pct} />
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>{emp.count} open disciplinary action{emp.count === 1 ? '' : 's'}{emp.latest ? ` · latest ${emp.latest}` : ''}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── TAB 4: DECISION SUPPORT (derived from live signals) ───────────────────────
function DecisionSupport({ m, personId, personName, navigate }) {
  const [status, setStatus] = useState({}) // session view state; each review is persisted to audit_log
  const [reviewErr, setReviewErr] = useState({})
  const [expanded, setExpanded] = useState(null)

  const pending = m.decisions.filter(d => !status[d.id])
  const actioned = m.decisions.filter(d => status[d.id])

  // Real write: every acknowledge/defer is recorded in the platform audit log
  // (write_audit RPC). The card only moves to "Reviewed" once the server accepts.
  const review = async (dec, action) => {
    setReviewErr(prev => ({ ...prev, [dec.id]: null }))
    const res = await sb.rpc('write_audit', {
      p_actor_id: personId, p_actor_name: personName || null,
      p_action: action === 'acknowledged' ? 'AI CEO Decision Acknowledged' : 'AI CEO Decision Deferred',
      p_target: dec.question,
      p_meta: { decision_id: dec.id, risk_level: dec.riskLevel, evidence: dec.evidence },
    })
    if (res.error) {
      setReviewErr(prev => ({ ...prev, [dec.id]: res.error.message || 'Review could not be recorded.' }))
    } else {
      setStatus(prev => ({ ...prev, [dec.id]: action }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {m.decisions.length === 0 && (
        <EmptyState>No decisions to review — no live signals currently require a call.</EmptyState>
      )}

      {pending.map(dec => (
        <div key={dec.id} className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <RiskBadge level={dec.riskLevel} />
              <span className="badge blue">Needs Review</span>
            </div>
            <button onClick={() => setExpanded(expanded === dec.id ? null : dec.id)}
              style={{ background: 'none', border: '1px solid var(--t-line)', borderRadius: 0, padding: '4px 10px', fontSize: 11, color: 'var(--t-text-muted)', cursor: 'pointer' }}
            >{expanded === dec.id ? 'Less' : 'Details'}</button>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12, lineHeight: 1.4 }}>{dec.question}</div>

          <div style={{ background: 'rgba(0,229,255,.06)', border: '1px solid rgba(0,229,255,.18)', padding: '12px 14px', borderRadius: 0, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--t-accent)', marginBottom: 4 }}>Recommendation</div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.6 }}>{dec.recommendation}</div>
          </div>

          {expanded === dec.id && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 6 }}>Supporting Evidence</div>
                {dec.evidence.map((e, i) => <DataPoint key={i} text={e} />)}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--t-text-faint)', marginBottom: 6 }}>Options</div>
                {dec.alternatives.map((alt, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '6px 10px', background: 'var(--t-surface-2)', borderRadius: 0, marginBottom: 4 }}>{i + 1}. {alt}</div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {dec.executeLabel && (
              <button onClick={() => navigate(dec.route)}
                style={{ background: 'rgba(0,229,255,.10)', border: '1px solid rgba(0,229,255,.3)', borderRadius: 0, padding: '7px 16px', fontSize: 12, color: 'var(--t-accent)', cursor: 'pointer', fontWeight: 700 }}
              >{dec.executeLabel} →</button>
            )}
            <button onClick={() => review(dec, 'acknowledged')}
              style={{ background: 'var(--t-success)', color: '#000', border: 'none', borderRadius: 0, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >✓ Acknowledge</button>
            <button onClick={() => review(dec, 'deferred')}
              style={{ background: 'none', border: '1px solid var(--t-warn)', color: 'var(--t-warn)', borderRadius: 0, padding: '7px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >⏸ Defer</button>
            {reviewErr[dec.id] && (
              <span style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 600 }}>Not recorded: {reviewErr[dec.id]}</span>
            )}
          </div>
        </div>
      ))}

      {actioned.length > 0 && (
        <>
          <SectionLabel>Reviewed This Session</SectionLabel>
          {actioned.map(dec => {
            const c = status[dec.id] === 'acknowledged' ? 'var(--t-success)' : 'var(--t-warn)'
            return (
              <div key={dec.id} className="card" style={{ padding: '14px 18px', opacity: .7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--t-text-muted)', flex: 1 }}>{dec.question}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>{status[dec.id]}</span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── LOCATION SCORECARD (KPI ROW 3) — real by_location signals ─────────────────
function LocationScorecard({ m }) {
  if (m.scorecard.length === 0) {
    return (
      <div className="card" style={{ padding: '16px 18px' }}>
        <SectionLabel>Location Health Scorecard</SectionLabel>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No per-location data in scope yet.</div>
      </div>
    )
  }
  const cols = Math.min(4, m.scorecard.length)
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <SectionLabel>Location Health Scorecard</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 12 }}>
        {m.scorecard.map((s, idx) => {
          const sc = s.score >= 80 ? 'var(--t-success)' : s.score >= 65 ? 'var(--t-warn)' : 'var(--t-danger)'
          const isBest = idx === 0 && m.scorecard.length > 1
          const isWorst = idx === m.scorecard.length - 1 && m.scorecard.length > 1
          return (
            <div key={s.loc} style={{ background: 'var(--t-surface-2)', border: `1px solid ${isBest ? 'rgba(50,220,120,.3)' : isWorst ? 'rgba(255,80,80,.3)' : 'var(--t-line)'}`, borderRadius: 0, padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{s.loc}</span>
                {isBest && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-success)', letterSpacing: '.06em' }}>BEST</span>}
                {isWorst && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-danger)', letterSpacing: '.06em' }}>WATCH</span>}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: sc, lineHeight: 1, marginBottom: 8 }}>{s.score}</div>
              <div style={{ height: 4, background: 'var(--t-surface)', borderRadius: 0, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${s.score}%`, height: '100%', background: sc, borderRadius: 0 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 2 }}>Headcount: <span style={{ color: 'var(--t-text-muted)', fontWeight: 600 }}>{s.headcount}</span></div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 2 }}>Training overdue: <span style={{ color: s.trainingOverdue > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)', fontWeight: 600 }}>{s.trainingOverdue}</span></div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>Open DAs: <span style={{ color: s.openDa > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: 600 }}>{s.openDa}</span></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function AiCeo() {
  const { locationIds } = useScope()
  const { session } = useAuth()
  const navigate = useNavigate()
  const r = session?.person?.role_name || ''
  const personName = session?.person?.full_name || ''
  const personId = session?.person?.id || null

  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  const [tab, setTab] = useState(0)
  const [raw, setRaw] = useState(null)
  const [nodeMap, setNodeMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const scopeKey = locationIds.join(',')

  useEffect(() => {
    let cancelled = false
    if (!locationIds || locationIds.length === 0) {
      setRaw({}); setLoading(false); return
    }
    setLoading(true); setError(false)
    const today = iso(Date.now())
    const from30 = iso(Date.now() - 30 * DAY)
    const weekOut = iso(Date.now() + 7 * DAY)

    Promise.all([
      rpc('hr_list_nodes', {}),
      rpc('hr_dashboard', { p_node_ids: locationIds }),
      rpc('get_sales_summary', { p_date_from: from30, p_date_to: today, p_node_ids: locationIds }),
      rpc('get_pending_pto_count', { p_node_ids: locationIds }),
      rpc('get_disciplinary_actions', { p_node_ids: locationIds }),
      rpc('get_attendance_overview', { p_node_ids: locationIds }),
      rpc('get_coverage_gaps', { p_node_ids: locationIds, p_date_from: today, p_date_to: weekOut }),
      rpc('get_gamification_profiles', { p_node_ids: locationIds }),
      rpc('get_communications', { p_node_ids: locationIds, p_person_id: personId }),
      rpc('get_sales_leaderboard', { p_node_ids: locationIds, p_period: 'all' }),
    ]).then(([nodes, hr, sales, pto, das, att, gaps, gami, comms, leaders]) => {
      if (cancelled) return
      const map = {}
      if (Array.isArray(nodes)) for (const n of nodes) map[n.id] = n.name
      setNodeMap(map)
      // If every core RPC failed (all null), surface an honest error state.
      const allNull = [hr, sales, das, att, gaps].every(x => x == null)
      if (allNull) setError(true)
      setRaw({ hr, sales, pto, das, att, gaps, gami, comms, leaders })
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setError(true); setRaw({}); setLoading(false)
    })
    return () => { cancelled = true }
  }, [scopeKey, personId])

  const m = useMemo(
    () => computeModel(raw || {}, (id) => nodeMap[id]),
    [raw, nodeMap]
  )

  if (!isHR) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 8 }}>Executive Access Only</div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', maxWidth: 320, margin: '0 auto' }}>
            AI CEO is available to HR, Manager, COO, and Owner roles. Contact your administrator for access.
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading AI CEO…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-danger)', marginBottom: 8 }}>Couldn't load executive data</div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 16 }}>The live platform data is temporarily unavailable. No figures are shown rather than estimates.</div>
          <button onClick={() => window.location.reload()} style={{ background: 'var(--t-accent)', color: '#000', border: 'none', borderRadius: 0, padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    )
  }

  const locCount = m.scorecard.length || (locationIds?.length || 0)

  const TABS = [
    { label: 'Executive Briefing', badge: null },
    { label: 'Insights', badge: m.insights.length },
    { label: 'Predictions', badge: null },
    { label: 'Decision Support', badge: m.decisions.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* HEADER */}
      <div className="card" style={{ padding: '18px 22px', position: 'relative' }}>
        <span className="badge green" style={{ position: 'absolute', top: 16, right: 18, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>● live</span>
        <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.02em', marginBottom: 4 }}>AI CEO</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Executive Intelligence · {locCount} location{locCount === 1 ? '' : 's'} in scope · reads live data, acts only with your call</div>
      </div>

      {/* KPI ROW 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KTile label="Business Health" value={m.health == null ? '—' : m.health} sub={m.health == null ? 'awaiting data' : 'out of 100'} color={m.health == null ? 'var(--t-text-faint)' : m.health >= 80 ? 'var(--t-success)' : m.health >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'} />
        <KTile label="Sales Forecast 30d" value={m.hasSales ? kFmt(m.forecast['30d']) : '—'} sub={m.hasSales ? 'run-rate · all in scope' : 'no sales yet'} color={m.hasSales ? 'var(--t-accent)' : 'var(--t-text-faint)'} />
        <KTile label="Retention Watch" value={m.retentionWatch.length} sub="employees with open DAs" color={m.retentionWatch.length > 2 ? 'var(--t-danger)' : m.retentionWatch.length > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={m.retentionWatch.length > 2 ? 'red' : m.retentionWatch.length > 0 ? 'amber' : null} />
        <KTile label="Open Alerts" value={m.alertsCount} sub="coverage + follow-ups" color={m.alertsCount > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={m.alertsCount > 0 ? 'red' : null} />
        <KTile label="Insights" value={m.insights.length} sub="derived from live data" color="var(--t-text)" />
        <KTile label="Decisions" value={m.decisions.length} sub="awaiting your review" color={m.decisions.length > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={m.decisions.length > 1 ? 'amber' : null} />
      </div>

      {/* KPI ROW 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KTile label="Best Location" value={m.best ? m.best.loc : '—'} sub={m.best ? `health ${m.best.score}` : 'no data'} color={m.best ? 'var(--t-success)' : 'var(--t-text-faint)'} />
        <KTile label="Needs Attention" value={m.worst ? m.worst.loc : '—'} sub={m.worst ? `health ${m.worst.score}` : 'no data'} color={m.worst ? 'var(--t-warn)' : 'var(--t-text-faint)'} alert={m.worst ? 'amber' : null} />
        <KTile label="Top Performer" value={m.topPerformer || '—'} sub={m.topPerformerLoc || (m.topPerformer ? '' : 'no sales data')} color={m.topPerformer ? 'var(--t-accent)' : 'var(--t-text-faint)'} />
        <KTile label="Open Disciplinary" value={m.openDaCount} sub={`${m.overdueFollowups} overdue follow-up${m.overdueFollowups === 1 ? '' : 's'}`} color={m.openDaCount > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={m.openDaCount > 0 ? 'red' : null} />
        <KTile label="Pending PTO" value={m.pendingPto} sub="awaiting review" color={m.pendingPto > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)'} />
        <KTile label="Training Complete" value={m.trainingPct == null ? '—' : `${m.trainingPct}%`} sub={m.trainingPct == null ? 'no assignments' : 'in scope'} color={m.trainingPct == null ? 'var(--t-text-faint)' : m.trainingPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} />
      </div>

      {/* KPI ROW 3 */}
      <LocationScorecard m={m} />

      {/* TABS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', overflowX: 'auto' }}>
          {TABS.map((t, i) => (
            <Tab key={i} label={t.label} active={tab === i} onClick={() => setTab(i)} badge={t.badge} />
          ))}
        </div>
        <div style={{ padding: '18px' }}>
          {tab === 0 && <ExecutiveBriefing m={m} personName={personName} navigate={navigate} />}
          {tab === 1 && <InsightsDashboard m={m} locationIds={locationIds} personId={personId} personName={personName} navigate={navigate} />}
          {tab === 2 && <PredictionsForecasts m={m} />}
          {tab === 3 && <DecisionSupport m={m} personId={personId} personName={personName} navigate={navigate} />}
        </div>
      </div>

    </div>
  )
}
