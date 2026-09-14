// aiAdvisor.js — the platform's AI operations brain. Analyzes LIVE data across
// every workflow and produces prioritized, role-routed recommendations. It is
// deterministic and explainable (every recommendation cites the real numbers
// behind it) — humans approve every action; the AI never acts on its own.
//
// generateRecommendations(context) -> [{ id, severity, audience[], area, title,
//   detail, action, to, metric, confidence }]

const num = (v) => (typeof v === 'number' ? v : Number(v) || 0)
const lc = (v) => String(v || '').toLowerCase()
const RANK = { crit: 0, warn: 1, info: 2 }

export function generateRecommendations(ctx = {}) {
  const {
    byLoc = [], timeOff = [], incidents = [], applicants = [], tasks = [],
    coverage = [],   // [{ location, date, amCount, pmCount, callouts }]
    otRisk = [],     // [{ name, hours }]
  } = ctx

  const recs = []
  const add = (r) => recs.push({ confidence: 0.82, ...r })

  // ── Staffing & coverage ───────────────────────────────────────────────
  coverage.forEach(c => {
    if (c.callouts > 0) add({ severity: 'crit', audience: ['Manager', 'COO', 'CEO'], area: 'Coverage',
      title: `${c.callouts} callout${c.callouts > 1 ? 's' : ''} at ${c.location} — coverage gap`,
      detail: `${c.location} has ${c.callouts} unfilled callout(s) for ${c.date}. AI recommends assigning an available key holder or associate immediately to protect the shift.`,
      action: 'Assign coverage', to: '/coverage-monitor', metric: `${c.callouts} open` })
    else if ((c.amCount + c.pmCount) === 0) add({ severity: 'warn', audience: ['Manager', 'HR', 'COO'], area: 'Coverage',
      title: `No schedule published for ${c.location}`,
      detail: `${c.location} has zero scheduled shifts for ${c.date}. AI recommends building and publishing a schedule so the store is staffed.`,
      action: 'Build schedule', to: '/schedule-builder', metric: '0 scheduled' })
  })

  // ── Overtime risk ─────────────────────────────────────────────────────
  otRisk.filter(e => num(e.hours) >= 38).forEach(e => add({ severity: num(e.hours) >= 40 ? 'crit' : 'warn', audience: ['Manager', 'CFO', 'COO'], area: 'Labor Cost',
    title: `${e.name} at ${num(e.hours)}h — OT risk`,
    detail: `${e.name} is at ${num(e.hours)} hours this week. AI recommends redistributing remaining shifts to avoid overtime premium and control labor cost.`,
    action: 'Review timecards', to: '/timeclock', metric: `${num(e.hours)}h` }))

  // ── Approvals backlog ─────────────────────────────────────────────────
  if (timeOff.length) add({ severity: timeOff.length > 4 ? 'crit' : 'warn', audience: ['HR', 'COO', 'Manager'], area: 'Approvals',
    title: `${timeOff.length} time-off request${timeOff.length > 1 ? 's' : ''} awaiting approval`,
    detail: `${timeOff.length} pending PTO/leave request(s). Aging requests hurt morale and break coverage planning. AI recommends clearing the queue today.`,
    action: 'Review approvals', to: '/time-off-board', metric: `${timeOff.length} pending` })

  // ── Safety / incidents ────────────────────────────────────────────────
  const openInc = incidents.filter(i => !['closed', 'resolved'].includes(lc(i.status)))
  if (openInc.length) add({ severity: openInc.length > 2 ? 'crit' : 'warn', audience: ['HR', 'CEO', 'COO'], area: 'Safety & Compliance',
    title: `${openInc.length} open incident${openInc.length > 1 ? 's' : ''} need resolution`,
    detail: `${openInc.length} incident report(s) remain open. CT-OSHA and forensic record integrity require timely closure. AI recommends assigning an owner and closing them out.`,
    action: 'Open incidents', to: '/incidents-board', metric: `${openInc.length} open` })

  // ── Training / compliance ─────────────────────────────────────────────
  byLoc.forEach(l => {
    const to = num(l.training_overdue)
    if (to > 0) add({ severity: to > 3 ? 'crit' : 'warn', audience: ['HR', 'CEO', 'Manager'], area: 'Compliance',
      title: `${to} training overdue at ${l.node_name || 'location'}`,
      detail: `${l.node_name || 'This location'} has ${to} employee(s) past their required training deadline — a compliance exposure. AI recommends notifying them and their manager today.`,
      action: 'Open training', to: '/training', metric: `${to} overdue` })
  })

  // ── Hiring pipeline ───────────────────────────────────────────────────
  const offers = applicants.filter(a => lc(a.stage) === 'offer')
  if (offers.length) add({ severity: 'info', audience: ['HR', 'CEO'], area: 'Hiring',
    title: `${offers.length} offer${offers.length > 1 ? 's' : ''} awaiting a decision`,
    detail: `${offers.map(o => o.full_name).filter(Boolean).join(', ') || `${offers.length} candidate(s)`} at offer stage. Delayed offers lose candidates. AI recommends finalizing this week.`,
    action: 'Open recruiting', to: '/recruiting', metric: `${offers.length} offers` })
  const applied = applicants.filter(a => lc(a.stage) === 'applied')
  if (applied.length) add({ severity: 'info', audience: ['HR', 'Manager'], area: 'Hiring',
    title: `${applied.length} new applicant${applied.length > 1 ? 's' : ''} to screen`,
    detail: `${applied.length} applicant(s) haven't been screened yet. AI recommends an initial screen within 48 hours to keep the funnel moving.`,
    action: 'Open recruiting', to: '/recruiting', metric: `${applied.length} new` })

  // ── Task backlog ──────────────────────────────────────────────────────
  const now = Date.now()
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date).getTime() < now && !['completed', 'done', 'complete'].includes(lc(t.status)))
  if (overdueTasks.length) add({ severity: 'warn', audience: ['Manager', 'COO'], area: 'Operations',
    title: `${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} past due`,
    detail: `${overdueTasks.length} open task(s) are past their due date. AI recommends reassigning or closing them to keep operations on track.`,
    action: 'Open tasks', to: '/tasks-board', metric: `${overdueTasks.length} overdue` })

  return recs
    .map((r, i) => ({ id: `${r.area}-${i}`, ...r }))
    .sort((a, b) => (RANK[a.severity] - RANK[b.severity]))
}

export const ADVISOR_ROLES = ['All', 'CEO', 'COO', 'CFO', 'HR', 'Manager']
