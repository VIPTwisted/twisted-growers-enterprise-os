import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getConfig } from '../lib/config.js'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useNavigate } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// AI HR Assistant — 100% real data.
// Every answer is built from live RPCs (get_my_home, get_week_schedule,
// get_pending_requests, get_incidents, get_performance_reviews,
// get_attendance_overview, get_training_overview, get_employee_manual,
// get_roster, benefits_my_summary, forensic_callouts,
// get_my_assigned_documents, get_my_availability) plus the ai_assist_questions
// log (log_ai_question / get_ai_assist_history / get_ai_assist_stats).
// When a dataset is empty the assistant says so honestly — nothing is invented.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function arr(x) { return Array.isArray(x) ? x : [] }

function mondayISO() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  const hh = parseInt(h, 10)
  if (Number.isNaN(hh)) return String(t)
  const ap = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${(m ?? '00').slice(0, 2)} ${ap}`
}

function fmtD(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : d)
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isMine(row, personId, personName) {
  if (!row) return false
  if (row.person_id && personId && row.person_id === personId) return true
  const pn = (personName || '').trim().toLowerCase()
  return !!pn && (row.full_name || '').trim().toLowerCase() === pn
}

// ── Employee Manual → knowledge-base articles (real rows only) ────────────────
const KB_ICON_BY_CATEGORY = {
  'Time Off': '🏖️', Scheduling: '📅', 'Payroll FAQ': '💳', Payroll: '💳',
  Training: '🎓', 'Code of Conduct': '📜', 'Disciplinary Process': '⚠️',
  Benefits: '💼', 'Emergency Contacts': '🆘', Attendance: '📋', Safety: '🦺',
}

function manualToArticles(rows) {
  if (!Array.isArray(rows)) return []
  const seen = new Set()
  const out = []
  rows.forEach(r => {
    if (!r || r.id == null || seen.has(r.id)) return
    seen.add(r.id)
    let c = {}
    try { c = typeof r.content === 'string' ? JSON.parse(r.content) : (r.content || {}) } catch { c = {} }
    const bodyText = typeof c.body === 'string' ? c.body : (c.body ? JSON.stringify(c.body, null, 2) : '')
    const answer = [c.summary, bodyText].filter(Boolean).join('\n\n')
    out.push({
      id: r.id,
      category: c.category || 'Policy',
      title: c.title || r.name || 'Policy',
      icon: KB_ICON_BY_CATEGORY[c.category] || '📄',
      summary: c.summary || '',
      answer: answer || 'No content has been published for this policy yet. Contact HR for details.',
      requiresAck: !!r.requires_ack,
    })
  })
  return out
}

function articlesMatching(articles, re) {
  return articles.filter(a => re.test(a.category || '') || re.test(a.title || ''))
}

// ── Canned response engine (topics matched by keyword; data always live) ──────
const CANNED = [
  {
    topic: 'schedule', keys: ['schedule', 'shift', 'working', 'this week', 'my hours'],
    icon: '📅', title: 'Your Schedule This Week',
    reply: (ctx) => ({
      type: 'schedule',
      summary: ctx.mySchedule.length
        ? `Here's your published schedule for the week of ${ctx.weekLabel}:`
        : `No published shifts were found for you for the week of ${ctx.weekLabel}.`,
      rows: ctx.mySchedule,
      note: ctx.mySchedule.length
        ? 'Contact your manager to swap or change shifts.'
        : 'If you expect shifts this week, check the Schedule screen or ask your manager.',
    }),
  },
  {
    topic: 'pto', keys: ['pto', 'vacation', 'paid time', 'time off balance', 'how many pto', 'how much pto', 'days do i have'],
    icon: '🏖️', title: 'PTO Balance',
    reply: (ctx) => {
      const lv = ctx.leave
      if (!lv) return {
        type: 'pto',
        summary: `No PTO balance is on file for ${ctx.name} yet.`,
        rows: ctx.openTimeOffCount > 0
          ? [{ label: 'Open Time-Off Requests', value: String(ctx.openTimeOffCount), badge: 'amber' }]
          : [],
        note: 'To request time off, go to the Requests screen. Ask HR to set up your leave balance.',
      }
      const accrued = Number(lv.accrued_hours) || 0
      const used = Number(lv.used_hours) || 0
      const avail = Math.max(0, accrued - used)
      return {
        type: 'pto',
        summary: `PTO summary for ${ctx.name} (plan year ${lv.plan_year ?? new Date().getFullYear()}):`,
        rows: [
          { label: 'Accrued (YTD)', value: `${accrued.toFixed(1)} hrs` },
          { label: 'Used (YTD)', value: `${used.toFixed(1)} hrs` },
          { label: 'Available', value: `${(avail / 8).toFixed(1)} days (${avail.toFixed(1)} hrs)`, highlight: true },
          { label: 'Open Requests', value: String(ctx.openTimeOffCount) },
          ...(lv.last_used_date ? [{ label: 'Last Used', value: fmtD(lv.last_used_date) }] : []),
        ],
        note: 'To request time off, go to the Requests screen.',
      }
    },
  },
  {
    topic: 'training', keys: ['training', 'module', 'courses', 'what training', 'training due', 'overdue'],
    icon: '🎓', title: 'Training Status',
    reply: (ctx) => ({
      type: 'training',
      summary: ctx.myTraining.length
        ? `Training status for ${ctx.name}:`
        : `No training records are on file for ${ctx.name}.`,
      rows: ctx.myTraining,
      note: ctx.myTraining.length
        ? 'Open the Training screen to complete or renew modules.'
        : 'If you believe this is wrong, contact HR or check the Training screen.',
    }),
  },
  {
    topic: 'swap', keys: ['shift swap', 'swap shift', 'how do i request', 'switch shift', 'swap my'],
    icon: '🔄', title: 'How to Request a Shift Swap',
    reply: () => ({
      type: 'steps',
      summary: 'Step-by-step: requesting a shift swap in this app',
      rows: [
        { label: 'Step 1', value: 'Go to Schedule in the navigation' },
        { label: 'Step 2', value: 'Click the shift you want to swap' },
        { label: 'Step 3', value: 'Select "Request Swap" from the menu' },
        { label: 'Step 4', value: 'Choose the employee to swap with' },
        { label: 'Step 5', value: 'Add a note and submit — a manager approves' },
        { label: 'Step 6', value: "You'll get a notification once it's reviewed" },
      ],
      note: 'Both employees must agree and a manager gives final approval.',
    }),
  },
  {
    topic: 'payroll', keys: ['payroll', 'payday', 'when do i get paid', 'pay period', 'pay check', 'direct deposit'],
    icon: '💳', title: 'Payroll Policy',
    reply: (ctx) => ({
      type: 'payroll',
      summary: ctx.payrollArticles.length
        ? 'Published payroll policies for your location:'
        : 'No payroll policy has been published in the Employee Manual yet.',
      rows: ctx.payrollArticles.map(a => ({ label: a.title, value: a.summary || 'View in Employee Manual', badge: 'blue' })),
      note: ctx.payrollArticles.length
        ? 'Open the Employee Manual for the full policy. Pay stubs live in the MyDocs screen.'
        : 'Message HR directly for payroll questions.',
      needsEscalation: ctx.payrollArticles.length === 0,
    }),
  },
  {
    topic: 'contact', keys: ['contact', 'hr contact', 'who do i contact', 'email hr', 'reach hr', 'hr email', 'hr phone'],
    icon: '📞', title: 'HR & Management Contacts',
    reply: (ctx) => ({
      type: 'contact',
      summary: ctx.contacts.length
        ? `Management and HR contacts in scope — ${ctx.loc}:`
        : 'No HR or management contacts were found on the roster in your scope.',
      rows: ctx.contacts,
      note: 'For anything sensitive, message HR directly via the HR Messages screen.',
      needsEscalation: ctx.contacts.length === 0,
    }),
  },
  {
    topic: 'callouts', keys: ['calling out', 'call out', 'callout', 'who called', 'absent today', 'out today'],
    icon: '📵', title: "Today's Callouts",
    reply: (ctx) => ({
      type: 'callouts',
      summary: `Callout report for ${ctx.loc} — ${ctx.todayLabel}:`,
      rows: ctx.calloutsToday.length
        ? ctx.calloutsToday
        : [{ label: 'No callouts recorded today', value: '', badge: 'green' }],
      note: ctx.isHR ? 'Open Coverage to assign replacements.' : 'Contact your manager if you need coverage.',
    }),
  },
  {
    topic: 'oncall', keys: ['on call', 'who is on call', 'on-call', 'key holder', 'manager tonight', 'manager today'],
    icon: '📞', title: 'On-Call / Key Holders Today',
    reply: (ctx) => ({
      type: 'oncall',
      summary: ctx.onCallToday.length
        ? `Key holders on the published schedule — ${ctx.todayLabel}:`
        : `No key holder is on the published schedule for ${ctx.todayLabel}.`,
      rows: ctx.onCallToday,
      note: ctx.onCallToday.length
        ? 'Schedules can change — confirm with your manager for emergencies.'
        : 'Check the Schedule screen or ask your manager who is covering.',
    }),
  },
  {
    topic: 'policy', keys: ['attendance policy', 'late policy', 'tardy', 'absence policy', 'callout policy', 'policy'],
    icon: '📋', title: 'Attendance & Conduct Policies',
    reply: (ctx) => ({
      type: 'policy',
      summary: ctx.attendanceArticles.length
        ? 'Published policies matching your question:'
        : 'No matching policy has been published in the Employee Manual yet.',
      rows: ctx.attendanceArticles.map(a => ({ label: a.title, value: a.summary || 'View in Employee Manual', badge: 'blue' })),
      note: ctx.attendanceArticles.length
        ? 'Open the Employee Manual for the full text.'
        : 'Message HR directly if you need the policy details.',
      needsEscalation: ctx.attendanceArticles.length === 0,
    }),
  },
  // HR-only
  {
    topic: 'attendance_report', hrOnly: true,
    keys: ['attendance pattern', 'attendance report', 'show me attendance', 'late pattern'],
    icon: '📊', title: 'Attendance Events In Scope',
    reply: (ctx) => ({
      type: 'attendance_report',
      summary: ctx.attendanceTotal
        ? `Attendance events recorded in scope — ${ctx.loc}:`
        : `No attendance events are recorded in scope for ${ctx.loc}.`,
      rows: [
        ...Object.entries(ctx.attendanceByType).map(([t, n]) => ({
          label: t.charAt(0).toUpperCase() + t.slice(1),
          value: `${n} event${n === 1 ? '' : 's'}`,
          badge: t === 'ncns' ? 'red' : 'amber',
        })),
        ...(ctx.attendanceTotal ? [{ label: 'Total Events', value: String(ctx.attendanceTotal), highlight: true }] : []),
      ],
      note: 'Open Attendance Forensics for the full drill-down.',
    }),
  },
  {
    topic: 'incidents', hrOnly: true,
    keys: ['open incidents', 'incident report', 'pending incidents', 'active incidents'],
    icon: '🚨', title: 'Open Incidents',
    reply: (ctx) => ({
      type: 'incidents',
      summary: `Open incident reports in scope — ${ctx.loc}:`,
      rows: ctx.openIncidents.length
        ? ctx.openIncidents
        : [{ label: 'No open incidents', value: '', badge: 'green' }],
      note: 'Go to the Incidents screen to update or close reports.',
    }),
  },
  {
    topic: 'reviews', hrOnly: true,
    keys: ['pending review', 'performance review', 'who needs review', 'reviews due'],
    icon: '⭐', title: 'Performance Review Pipeline',
    reply: (ctx) => {
      const c = ctx.reviewCounts
      return {
        type: 'reviews',
        summary: c.total
          ? `Performance reviews in scope — ${ctx.loc}:`
          : `No performance reviews are on record in scope for ${ctx.loc}.`,
        rows: c.total ? [
          { label: 'In Draft (manager working)', value: String(c.draft), badge: c.draft ? 'amber' : 'green' },
          { label: 'Awaiting Employee Ack', value: String(c.submitted), badge: c.submitted ? 'amber' : 'green' },
          { label: 'Disputed', value: String(c.disputed), badge: c.disputed ? 'red' : 'green' },
          { label: 'Acknowledged / Complete', value: String(c.acknowledged), badge: 'green' },
        ] : [],
        note: 'Open the Reviews screen to start or complete a review.',
      }
    },
  },
  {
    topic: 'da_template', hrOnly: true,
    keys: ['da for', 'disciplinary action', 'generate da', 'tardiness', 'write up', 'warning notice'],
    icon: '⚠️', title: 'Disciplinary Action Template',
    reply: (ctx) => ({
      type: 'da_template',
      summary: 'DA template for excessive tardiness (fill in the bracketed fields):',
      template: `DISCIPLINARY ACTION NOTICE

Employee: _______________     Date: ${ctx.todayLabel}
Location: ${ctx.loc}          Manager: ${ctx.name}

INFRACTION: Excessive Tardiness
POLICY REF: [cite the published Attendance policy section]

DESCRIPTION:
The above employee has arrived late to their scheduled shift on [X] occasions
within the past [30/60/90] days, specifically on: [dates].

CORRECTIVE ACTION: [ ] Verbal  [ ] Written Warning  [ ] Final Warning

IMPROVEMENT PLAN:
[State the expected arrival standard and the follow-up review date.]

CONSEQUENCES IF NOT CORRECTED:
Further disciplinary action up to and including termination.

____________________________    ____________________________
Manager Signature / Date        Employee Signature / Date`,
      note: 'Copy this template, fill in the blanks, then file it under Disciplinary Actions.',
    }),
  },
  {
    topic: 'pto_requests', hrOnly: true,
    keys: ['pending pto', 'pending requests', 'approve pto', 'pto request', 'time off request'],
    icon: '✅', title: 'Pending Time-Off Requests',
    reply: (ctx) => ({
      type: 'pto_requests',
      summary: `Time-off requests pending approval in scope — ${ctx.loc}:`,
      rows: ctx.pendingTimeOff.length
        ? ctx.pendingTimeOff
        : [{ label: 'No pending requests', value: '', badge: 'green' }],
      note: 'Open the Requests screen to approve or deny.',
    }),
  },
]

const TOPIC_LABELS = {
  schedule: 'Schedule & Shifts', pto: 'PTO & Time Off', training: 'Training',
  swap: 'Shift Swaps', payroll: 'Payroll', contact: 'Contacts',
  callouts: 'Callouts', oncall: 'On-Call', policy: 'Policies',
  attendance_report: 'Attendance', incidents: 'Incidents', reviews: 'Reviews',
  da_template: 'Disciplinary', pto_requests: 'Approvals', requests: 'Requests',
}

const FALLBACK_REPLY = (q) => ({
  type: 'fallback',
  summary: `I couldn't find a specific answer for: "${q}"`,
  rows: [
    { label: 'Schedule & Shifts', value: 'Ask about "my schedule this week"' },
    { label: 'PTO & Time Off', value: 'Ask "how many PTO days do I have?"' },
    { label: 'Training', value: 'Ask "what training is due?"' },
    { label: 'Policies', value: 'Ask about "attendance policy"' },
    { label: 'Payroll', value: 'Ask "when do I get paid?"' },
    { label: 'Contacts', value: 'Ask "who do I contact about payroll?"' },
  ],
  note: null,
  needsEscalation: true,
})

// ── Prompt sets (UI shortcuts) ────────────────────────────────────────────────
const EMPLOYEE_PROMPTS = [
  { label: "What's my schedule this week?", icon: '📅' },
  { label: 'How many PTO days do I have?', icon: '🏖️' },
  { label: 'What training is due?', icon: '🎓' },
  { label: 'How do I request a shift swap?', icon: '🔄' },
  { label: 'When do I get paid?', icon: '💳' },
  { label: 'Who do I contact about payroll?', icon: '📞' },
]

const MANAGER_PROMPTS = [
  { label: 'Show me attendance patterns', icon: '📊' },
  { label: 'What are the open incidents?', icon: '🚨' },
  { label: 'Generate DA for excessive tardiness', icon: '⚠️' },
  { label: 'Who has pending time-off requests?', icon: '✅' },
  { label: 'Who needs a performance review?', icon: '⭐' },
  { label: "Who's calling out today?", icon: '📵' },
]

// ── Real action items derived from live datasets ──────────────────────────────
function deriveActionItems(live, isHR, personId, personName) {
  const items = []

  // My training — expired / expiring certifications (get_training_overview)
  const seenMod = new Set()
  arr(live.training).filter(r => isMine(r, personId, personName)).forEach(r => {
    if (!r.module || seenMod.has(r.module)) return
    const st = String(r.cert_status || '').toUpperCase()
    if (st === 'EXPIRED' || st === 'OVERDUE') {
      seenMod.add(r.module)
      items.push({
        id: `trn-${r.module}`, priority: 'high', icon: '🎓',
        title: `Training expired: ${r.module}`,
        detail: r.cert_expires ? `Certification expired ${fmtD(r.cert_expires)}. Renew it in Training.` : 'Certification expired. Renew it in Training.',
        screen: '/training', category: 'Training',
      })
    } else if (st === 'EXPIRING SOON' || st === 'DUE SOON') {
      seenMod.add(r.module)
      items.push({
        id: `trn-${r.module}`, priority: 'medium', icon: '🎓',
        title: `Training expiring soon: ${r.module}`,
        detail: r.cert_expires ? `Certification expires ${fmtD(r.cert_expires)}.` : 'Certification expires soon.',
        screen: '/training', category: 'Training',
      })
    }
  })

  // My assigned documents (get_my_assigned_documents)
  arr(live.myDocs).forEach(d => {
    if (d.status === 'Awaiting Signature') {
      items.push({
        id: `doc-${d.id}`, priority: 'high', icon: '📄',
        title: `Sign: ${d.title}`,
        detail: 'This document is assigned to you and awaiting your signature.',
        screen: '/documents', category: 'Documents',
      })
    } else if (d.status === 'Unread') {
      items.push({
        id: `doc-${d.id}`, priority: 'medium', icon: '📄',
        title: `Read: ${d.title}`,
        detail: 'This document is assigned to you and has not been opened.',
        screen: '/documents', category: 'Documents',
      })
    }
  })

  // Unread announcements (get_my_home)
  arr(live.home?.unread_announcements).forEach(a => {
    items.push({
      id: `ann-${a.id}`, priority: a.requires_ack ? 'high' : 'low', icon: '📢',
      title: `Unread announcement: ${a.title}`,
      detail: a.requires_ack ? 'Acknowledgement is required for this announcement.' : `Posted ${fmtD(a.created_at)}.`,
      screen: '/comms', category: 'Communications',
    })
  })

  // Availability on file (get_my_availability)
  if (live.availKnown && arr(live.myAvail).length === 0) {
    items.push({
      id: 'avail', priority: 'medium', icon: '📅',
      title: 'Submit your availability',
      detail: 'No availability preferences are on file for you. Managers use these to build the schedule.',
      screen: '/availability', category: 'Scheduling',
    })
  }

  if (isHR) {
    const timeOff = arr(live.pending?.time_off)
    if (timeOff.length) {
      const who = timeOff.slice(0, 3).map(r => r.person_name).filter(Boolean).join(', ')
      items.push({
        id: 'hr-pto', priority: 'high', icon: '✅',
        title: `${timeOff.length} pending time-off request${timeOff.length === 1 ? '' : 's'}`,
        detail: who ? `${who} awaiting review.` : 'Requests are awaiting your review.',
        screen: '/requests', category: 'Approvals',
      })
    }
    const swaps = arr(live.pending?.shift_swaps)
    if (swaps.length) {
      items.push({
        id: 'hr-swaps', priority: 'medium', icon: '🔄',
        title: `${swaps.length} shift swap request${swaps.length === 1 ? '' : 's'} pending`,
        detail: 'Swap requests need manager approval.',
        screen: '/requests', category: 'Approvals',
      })
    }
    const openInc = arr(live.incidents).filter(i => String(i.status || '').toLowerCase() !== 'closed')
    if (openInc.length) {
      items.push({
        id: 'hr-inc', priority: 'high', icon: '🚨',
        title: `${openInc.length} open incident report${openInc.length === 1 ? '' : 's'}`,
        detail: 'Open incidents need review, updates, or closure.',
        screen: '/incidents', category: 'Incidents',
      })
    }
    const inFlight = arr(live.reviews).filter(r => r.status === 'draft' || r.status === 'submitted')
    if (inFlight.length) {
      items.push({
        id: 'hr-rev', priority: 'medium', icon: '⭐',
        title: `${inFlight.length} performance review${inFlight.length === 1 ? '' : 's'} in flight`,
        detail: 'Reviews are in draft or awaiting employee acknowledgement.',
        screen: '/reviews', category: 'HR',
      })
    }
  }

  return items
}

// ── Response card ──────────────────────────────────────────────────────────────
function ResponseCard({ msg }) {
  if (msg.role === 'user') return null
  const d = msg.data
  const badgeSty = {
    green:  { background: 'rgba(42,214,160,0.15)',  color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.3)' },
    amber:  { background: 'rgba(255,184,0,0.15)',   color: '#ffb800', border: '1px solid rgba(255,184,0,0.3)' },
    red:    { background: 'rgba(255,77,125,0.15)',  color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.3)' },
    blue:   { background: 'rgba(41,121,255,0.15)',  color: '#2979ff', border: '1px solid rgba(41,121,255,0.3)' },
    purple: { background: 'rgba(124,77,255,0.15)', color: '#7c4dff', border: '1px solid rgba(124,77,255,0.3)' },
  }

  if (!d) {
    return <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
  }
  return (
    <div>
      {d.summary && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 10 }}>{d.summary}</div>}
      {d.type === 'da_template' && d.template ? (
        <pre style={{ fontSize: 11, color: 'var(--t-text)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--t-line)', padding: '12px 14px', margin: '0 0 10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.7, maxHeight: 320, overflow: 'auto' }}>
          {d.template}
        </pre>
      ) : d.rows && d.rows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 10 }}>
          {d.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{row.day || row.label}</span>
              {(row.value || row.time) ? (
                <span style={
                  row.highlight
                    ? { fontSize: 13, fontWeight: 700, color: 'var(--t-accent)' }
                    : row.badge && badgeSty[row.badge]
                      ? { fontSize: 11, fontWeight: 700, padding: '2px 8px', ...badgeSty[row.badge] }
                      : { fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }
                }>
                  {row.time || row.value}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {d.note && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontStyle: 'italic', marginTop: 4 }}>{d.note}</div>}
    </div>
  )
}

// ── Thinking dots ──────────────────────────────────────────────────────────────
function ThinkingDots() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 380)
    return () => clearInterval(t)
  }, [])
  return <span style={{ fontSize: 14, color: 'var(--t-accent)', letterSpacing: 2, fontWeight: 700 }}>{'.'.repeat(frame + 1).padEnd(3, ' ')}</span>
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 110 }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', padding: '0 20px', flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          background: 'transparent', border: 'none',
          borderBottom: active === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
          color: active === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
          fontSize: 12, fontWeight: 700, padding: '12px 18px', cursor: 'pointer',
          letterSpacing: '.04em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)',
          transition: 'color .15s, border-color .15s',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — CHAT
// ─────────────────────────────────────────────────────────────────────────────
function ChatTab({ isHR, personId, personName, primaryLoc, live, articles, aiStats, aiHistory, onLogQuestion, myOpenHigh, navigate }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    const now = new Date()
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
    setMessages([{
      role: 'assistant', id: 'welcome',
      content: `${greeting}, ${personName.split(' ')[0]}! I'm your ${getConfig().company_name || 'company'} HR Assistant.\n\nI answer from your live HR data — schedules, PTO, policies, callouts, training, and more.${isHR ? '\n\nAs a manager, you also have access to team attendance, incidents, approvals, and DA templates.' : ''}\n\nWhat can I help you with today?`,
      data: null,
    }])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live answer context — built ONLY from fetched datasets. Empty stays empty.
  const buildCtx = useCallback(() => {
    const now = new Date()
    const ws = new Date(now); ws.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const todayISO = now.toISOString().slice(0, 10)

    const mySchedule = arr(live.weekShifts)
      .filter(r => isMine(r, personId, personName))
      .sort((a, b) => String(a.shift_date).localeCompare(String(b.shift_date)))
      .map(r => {
        const dt = new Date(`${String(r.shift_date).slice(0, 10)}T00:00:00`)
        const day = Number.isNaN(dt.getTime()) ? String(r.shift_date) : DAY_ABBR[dt.getDay()]
        const time = [fmtTime(r.start_time), fmtTime(r.end_time)].filter(Boolean).join(' – ') || 'Scheduled'
        return { day, time: r.node_name ? `${time} · ${r.node_name}` : time }
      })

    const statusBadge = (st) => st === 'EXPIRED' || st === 'OVERDUE' ? 'red'
      : st === 'EXPIRING SOON' || st === 'DUE SOON' ? 'amber'
      : st === 'CURRENT' || st === 'COMPLETE' || st === 'COMPLETED' ? 'green' : undefined
    const myTraining = []
    const seenMod = new Set()
    arr(live.training).filter(r => isMine(r, personId, personName)).forEach(r => {
      if (!r.module || seenMod.has(r.module)) return
      seenMod.add(r.module)
      const st = String(r.cert_status || '').toUpperCase()
      const value = r.cert_expires ? `${st || 'ON FILE'} — expires ${fmtD(r.cert_expires)}`
        : r.completed_at ? `${st || 'COMPLETED'} — ${fmtD(r.completed_at)}` : (st || 'On file')
      myTraining.push({ label: r.module, value, badge: statusBadge(st) })
    })

    const contacts = arr(live.roster)
      .filter(p => /(hr|manager|lead|key|admin|owner|ceo|coo)/i.test(p.role_name || p.role || ''))
      .slice(0, 8)
      .map(p => ({
        label: p.role_name || p.role || 'Staff',
        value: [p.full_name, p.phone].filter(Boolean).join(' · ') || '—',
      }))

    const calloutsToday = arr(live.calloutsToday).map(c => ({
      label: c.full_name ?? c.person_name ?? c.employee_name ?? 'Employee',
      value: c.reason ?? c.type ?? 'Called out',
      badge: 'amber',
    }))

    const onCallToday = arr(live.weekShifts)
      .filter(r => String(r.shift_date).slice(0, 10) === todayISO)
      .filter(r => r.keyholder_eligible === true || /key/i.test(r.role_name || ''))
      .map(r => ({
        label: 'Key Holder',
        value: `${r.full_name || '—'} · ${[fmtTime(r.start_time), fmtTime(r.end_time)].filter(Boolean).join(' – ')}`,
      }))

    const attendanceByType = {}
    for (const e of arr(live.attendance)) {
      const t = (e.type || 'event').toLowerCase()
      attendanceByType[t] = (attendanceByType[t] || 0) + 1
    }

    const sevBadge = (s) => /critical|major/i.test(s || '') ? 'red' : 'amber'
    const openIncidents = arr(live.incidents)
      .filter(i => String(i.status || '').toLowerCase() !== 'closed')
      .slice(0, 12)
      .map(i => ({ label: i.title ?? i.type ?? i.category ?? 'Incident', value: i.status ?? 'Open', badge: sevBadge(i.severity) }))

    const reviews = arr(live.reviews)
    const reviewCounts = {
      total: reviews.length,
      draft: reviews.filter(r => r.status === 'draft').length,
      submitted: reviews.filter(r => r.status === 'submitted').length,
      disputed: reviews.filter(r => r.status === 'disputed').length,
      acknowledged: reviews.filter(r => r.status === 'acknowledged').length,
    }

    const pendingTimeOff = arr(live.pending?.time_off).map(r => ({
      label: r.person_name ?? 'Employee',
      value: [fmtD(r.start_date), fmtD(r.end_date)].join(' → '),
      badge: 'amber',
    }))

    return {
      name: personName, loc: primaryLoc, isHR,
      weekLabel: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      todayLabel: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      mySchedule,
      leave: live.leave,
      openTimeOffCount: Number(live.home?.open_requests?.time_off_count) || 0,
      myTraining,
      payrollArticles: articlesMatching(articles, /pay|payroll|deposit|wage/i),
      attendanceArticles: articlesMatching(articles, /attendance|conduct|late|tardy|absence|schedul/i),
      contacts,
      calloutsToday,
      onCallToday,
      attendanceByType,
      attendanceTotal: arr(live.attendance).length,
      openIncidents,
      reviewCounts,
      pendingTimeOff,
    }
  }, [live, articles, personId, personName, primaryLoc, isHR])

  const matchCanned = useCallback((q) => {
    const ql = q.toLowerCase()
    for (const entry of CANNED) {
      if (entry.hrOnly && !isHR) continue
      if (entry.keys.some(k => ql.includes(k))) return entry
    }
    return null
  }, [isHR])

  const isTimeOffRequest = (q) => {
    const ql = q.toLowerCase()
    return ['request time off', 'submit pto', 'request pto', 'put in for time off'].some(k => ql.includes(k))
  }

  const send = useCallback(async (text) => {
    const q = (text || input).trim()
    if (!q || thinking) return
    setInput('')
    setEscalated(false)
    setMessages(m => [...m, { role: 'user', id: Date.now(), content: q, data: null }])
    setThinking(true)

    let aiMsg
    let topic = null
    let answered = true
    if (isTimeOffRequest(q)) {
      topic = 'requests'
      aiMsg = {
        role: 'assistant', id: Date.now() + 1,
        content: 'To request time off, head to the Requests screen — you can submit PTO, personal days, or unpaid leave from there.',
        data: { type: 'redirect', summary: null, rows: [{ label: 'Go to Requests Screen', value: '→', badge: 'blue' }], note: null, action: () => navigate('/requests') },
      }
    } else {
      const match = matchCanned(q)
      if (match) {
        topic = match.topic
        aiMsg = { role: 'assistant', id: Date.now() + 1, content: match.title, icon: match.icon, data: match.reply(buildCtx()) }
        if (aiMsg.data?.needsEscalation) setEscalated(true)
      } else {
        answered = false
        aiMsg = { role: 'assistant', id: Date.now() + 1, content: "I don't have a direct answer for that.", data: FALLBACK_REPLY(q) }
        setEscalated(true)
      }
    }

    setMessages(m => [...m, aiMsg])
    setThinking(false)
    onLogQuestion(q, topic, answered)
  }, [input, thinking, matchCanned, buildCtx, navigate, onLogQuestion])

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const clearChat = () => {
    setMessages([])
    setEscalated(false)
    const now = new Date()
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
    setTimeout(() => setMessages([{ role: 'assistant', id: 'clear', content: `${greeting}! Chat cleared. What can I help you with?`, data: null }]), 40)
  }

  const prompts = isHR ? MANAGER_PROMPTS : EMPLOYEE_PROMPTS

  // Platform KPIs — real ai_assist_questions stats; '—' until data exists.
  const kpiQuestionsToday = aiStats ? String(aiStats.questions_today ?? 0) : '—'
  const kpiAnswerRate = aiStats && aiStats.answer_rate_pct != null ? `${aiStats.answer_rate_pct}%` : '—'
  const kpiTopTopic = aiStats?.top_topic ? (TOPIC_LABELS[aiStats.top_topic] || aiStats.top_topic) : '—'
  const kpiAskers = aiStats ? String(aiStats.askers_week ?? 0) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* KPI strip — live platform + personal metrics */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--t-line)', flexShrink: 0, overflowX: 'auto' }}>
        <KTile label="Questions Today" value={kpiQuestionsToday} color="var(--t-accent)" sub="platform total" />
        <KTile label="Answer Rate" value={kpiAnswerRate} color="var(--t-success)" sub="answered, 7 days" />
        <KTile label="Knowledge Articles" value={articles.length} color="var(--t-text-muted)" sub="employee manual" />
        <KTile label="Most Asked" value={kpiTopTopic} color="var(--t-text)" sub="this week" />
        <KTile label="My Open Items" value={myOpenHigh} color={myOpenHigh > 3 ? 'var(--t-danger)' : myOpenHigh > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={myOpenHigh > 3 ? 'red' : myOpenHigh > 0 ? 'amber' : undefined} sub="high priority" />
        <KTile label="Askers This Week" value={kpiAskers} color="var(--t-text-muted)" sub="unique people" />
      </div>

      {/* Chat layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '210px 1fr', overflow: 'hidden', minHeight: 0 }}>
        {/* Left sidebar */}
        <div style={{ borderRight: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ padding: '14px 14px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
              {isHR ? 'Manager Prompts' : 'Quick Questions'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {prompts.map((p, i) => (
                <button key={i} onClick={() => send(p.label)} disabled={thinking} style={{ textAlign: 'left', background: 'transparent', border: '1px solid var(--t-line)', padding: '7px 9px', cursor: thinking ? 'not-allowed' : 'pointer', fontSize: 11, color: 'var(--t-text-muted)', fontFamily: 'var(--font-sans)', lineHeight: 1.4, opacity: thinking ? 0.45 : 1, display: 'flex', gap: 7, alignItems: 'flex-start', transition: 'border-color .15s, color .15s' }}
                  onMouseEnter={e => { if (!thinking) { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-text)' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text-muted)' }}>
                  <span style={{ flexShrink: 0, fontSize: 13, lineHeight: 1.2 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--t-line)', margin: '0 14px', flexShrink: 0 }} />

          {/* Recent — real persisted history from get_ai_assist_history */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>Recent</div>
            {arr(aiHistory).slice(0, 15).map((h, i) => (
              <div key={h.id || i} onClick={() => setInput(h.question)} style={{ fontSize: 11, color: 'var(--t-text-faint)', padding: '5px 0', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 6, lineHeight: 1.4 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--t-text-muted)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--t-text-faint)'}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.question}</span>
                <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--t-text-faint)' }}>
                  {h.created_at ? new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
            {arr(aiHistory).length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>No history yet</div>}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Header */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span className="badge green" style={{ fontSize: 10 }}>Online</span>
            {messages.length > 1 && (
              <button onClick={clearChat} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg, i) => (
              <div key={msg.id || i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'user' ? 'linear-gradient(135deg, var(--t-accent), #2979ff)' : 'linear-gradient(135deg, #7c4dff, var(--t-accent))', fontSize: msg.role === 'user' ? 12 : 14, fontWeight: 700, color: '#fff' }}>
                  {msg.role === 'user' ? (personName[0] || 'U') : (msg.icon || '🤖')}
                </div>
                <div style={{ maxWidth: '75%', minWidth: 80 }}>
                  {msg.role === 'assistant' && msg.data && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>{msg.content}</div>
                  )}
                  <div style={{ padding: '10px 14px', background: msg.role === 'user' ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', border: msg.role === 'user' ? '1px solid rgba(0,229,255,0.25)' : '1px solid var(--t-line)', borderLeft: msg.role === 'assistant' ? '3px solid var(--t-accent)' : undefined }}>
                    {msg.role === 'user'
                      ? <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6 }}>{msg.content}</div>
                      : <ResponseCard msg={msg} />}
                    {msg.data?.action && (
                      <button onClick={msg.data.action} style={{ marginTop: 10, background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.4)', color: 'var(--t-accent)', fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        Go to Requests →
                      </button>
                    )}
                  </div>
                  {msg.data?.needsEscalation && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => navigate('/hr-messages')} style={{ background: 'rgba(255,77,125,0.1)', border: '1px solid rgba(255,77,125,0.4)', color: '#ff4d7d', fontSize: 11, fontWeight: 700, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>📬</span><span>Ask HR Directly</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #7c4dff, var(--t-accent))', fontSize: 14 }}>🤖</div>
                <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', borderLeft: '3px solid var(--t-accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Looking that up</span>
                  <ThinkingDots />
                </div>
              </div>
            )}

            {escalated && !thinking && (
              <div style={{ padding: '12px 16px', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-warn)' }}>Can't find an answer?</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Send to HR for a reply within 1 business day.</div>
                </div>
                <button onClick={() => navigate('/hr-messages')} style={{ background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.4)', color: 'var(--t-warn)', fontSize: 12, fontWeight: 700, padding: '7px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Ask HR</button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--t-line)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {prompts.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => send(p.label)} disabled={thinking} style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.2)', color: 'var(--t-accent)', fontSize: 10, fontWeight: 600, padding: '4px 10px', cursor: thinking ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: thinking ? 0.45 : 1, display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span>{p.icon}</span><span>{p.label}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Ask about schedule, PTO, training, policies…"
                disabled={thinking}
                style={{ flex: 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 13, padding: '9px 12px', fontFamily: 'var(--font-sans)', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--t-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--t-line)'}
              />
              <button onClick={() => send()} disabled={thinking || !input.trim()} style={{ background: thinking || !input.trim() ? 'rgba(0,229,255,0.1)' : 'linear-gradient(135deg, var(--t-accent), #2979ff)', border: 'none', color: thinking || !input.trim() ? 'var(--t-text-muted)' : '#000', fontSize: 13, fontWeight: 700, padding: '9px 20px', cursor: thinking || !input.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                {thinking ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — KNOWLEDGE BASE (live get_employee_manual rows)
// ─────────────────────────────────────────────────────────────────────────────
function KnowledgeBaseTab({ articles, loading, loadError, onAskAi, navigate }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [category, setCategory] = useState('All')

  const categories = ['All', ...Array.from(new Set(articles.map(a => a.category)))]

  const filtered = articles.filter(a => {
    const matchCat = category === 'All' || a.category === category
    const q = search.toLowerCase()
    const matchQ = !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.answer.toLowerCase().includes(q)
    return matchCat && matchQ
  })

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Loading knowledge base…
      </div>
    )
  }

  if (loadError && articles.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-danger)', marginBottom: 6 }}>Couldn't load the knowledge base</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>The employee manual could not be fetched. Try again or contact HR.</div>
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>📄</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 6 }}>No published articles yet</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)', marginBottom: 16 }}>Policies published to the Employee Manual will appear here automatically.</div>
        <button onClick={() => navigate('/manual')} style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: 'var(--t-accent)', fontSize: 11, fontWeight: 700, padding: '7px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
        Open Employee Manual
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search knowledge base…"
          style={{ flex: 1, minWidth: 200, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, padding: '8px 12px', fontFamily: 'var(--font-sans)' }}
          onFocus={e => e.target.style.borderColor = 'var(--t-accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--t-line)'}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{ background: category === c ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${category === c ? 'rgba(0,229,255,0.5)' : 'var(--t-line)'}`, color: category === c ? 'var(--t-accent)' : 'var(--t-text-faint)', fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: category === c ? 700 : 400 }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 14 }}>
        {filtered.length} article{filtered.length !== 1 ? 's' : ''} {category !== 'All' ? `in ${category}` : ''}
        {search && ` matching "${search}"`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {filtered.map(article => (
          <div key={article.id} style={{ background: 'var(--t-surface)', border: `1px solid ${expanded === article.id ? 'rgba(0,229,255,0.4)' : 'var(--t-line)'}`, transition: 'border-color .15s' }}>
            {/* Header */}
            <div
              onClick={() => setExpanded(expanded === article.id ? null : article.id)}
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{article.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', marginBottom: 3 }}>{article.title}</div>
                  {article.summary && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{article.summary}</div>}
                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    <span className="badge blue" style={{ fontSize: 9 }}>{article.category}</span>
                    {article.requiresAck && <span className="badge amber" style={{ fontSize: 9 }}>Ack Required</span>}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 14, color: 'var(--t-text-faint)', flexShrink: 0, marginTop: 2, transition: 'transform .2s', transform: expanded === article.id ? 'rotate(180deg)' : 'none' }}>▾</span>
            </div>

            {/* Expanded body */}
            {expanded === article.id && (
              <div style={{ borderTop: '1px solid var(--t-line)', padding: '16px 16px 12px' }}>
                <pre style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', lineHeight: 1.7, margin: 0 }}>
                  {article.answer}
                </pre>
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  <button
                    onClick={onAskAi}
                    style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: 'var(--t-accent)', fontSize: 11, fontWeight: 700, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>🤖</span><span>Ask AI about this</span>
                  </button>
                  <button
                    onClick={() => navigate('/manual')}
                    style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 11, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >
                    View in Manual
                  </button>
                  <button
                    onClick={() => setExpanded(null)}
                    style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', fontSize: 11, padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 6 }}>No articles found</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Try a different search term or category.</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — MY ACTION ITEMS (derived from live datasets only)
// ─────────────────────────────────────────────────────────────────────────────
function ActionItemsTab({ items, loading, navigate }) {
  const [dismissed, setDismissed] = useState([])

  const activeItems = items.filter(i => !dismissed.includes(i.id))
  const highPriority = activeItems.filter(i => i.priority === 'high')
  const mediumPriority = activeItems.filter(i => i.priority === 'medium')
  const lowPriority = activeItems.filter(i => i.priority === 'low')

  function dismiss(id) { setDismissed(prev => [...prev, id]) }

  const priorityConfig = {
    high:   { color: 'var(--t-danger)', bg: 'rgba(255,77,125,0.07)',  border: 'rgba(255,77,125,0.25)', label: 'High Priority' },
    medium: { color: 'var(--t-warn)',   bg: 'rgba(255,184,0,0.07)',   border: 'rgba(255,184,0,0.25)',  label: 'Medium Priority' },
    low:    { color: 'var(--t-accent)', bg: 'rgba(0,229,255,0.05)',   border: 'rgba(0,229,255,0.2)',   label: 'Low Priority' },
  }

  function ItemGroup({ title, items: groupItems, priority }) {
    if (groupItems.length === 0) return null
    const cfg = priorityConfig[priority]
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 3, height: 18, background: cfg.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.07em' }}>{title}</span>
          <span style={{ fontSize: 10, color: cfg.color, background: `${cfg.color}20`, padding: '1px 7px', border: `1px solid ${cfg.color}40` }}>{groupItems.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groupItems.map(item => (
            <div key={item.id} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 10 }}>{item.detail}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate(item.screen)}
                    style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}40`, color: cfg.color, fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <span>→</span><span>Go There</span>
                  </button>
                  <button
                    onClick={() => dismiss(item.id)}
                    style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', fontSize: 11, padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >
                    Dismiss
                  </button>
                  <span className="badge purple" style={{ fontSize: 9, display: 'flex', alignItems: 'center' }}>{item.category}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Checking your live HR data…
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {/* KPI Strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Total Open Items" value={activeItems.length} color={activeItems.length > 3 ? 'var(--t-danger)' : activeItems.length > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={activeItems.length > 3 ? 'red' : activeItems.length > 0 ? 'amber' : undefined} />
        <KTile label="High Priority" value={highPriority.length} color="var(--t-danger)" alert={highPriority.length > 0 ? 'red' : undefined} sub="needs attention" />
        <KTile label="Medium Priority" value={mediumPriority.length} color="var(--t-warn)" />
        <KTile label="Low Priority" value={lowPriority.length} color="var(--t-accent)" />
        <KTile label="Dismissed" value={dismissed.length} color="var(--t-text-faint)" sub="this session" />
      </div>

      {activeItems.length === 0 ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-success)', marginBottom: 6 }}>All caught up!</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No open action items found in your live HR data.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
              Action Items
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t-text-muted)', marginLeft: 8 }}>Derived from your live HR data</span>
            </div>
            <button onClick={() => setDismissed(items.map(i => i.id))} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', fontSize: 11, padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              Dismiss All
            </button>
          </div>

          <ItemGroup title="High Priority" items={highPriority} priority="high" />
          <ItemGroup title="Medium Priority" items={mediumPriority} priority="medium" />
          <ItemGroup title="Low Priority" items={lowPriority} priority="low" />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_LIVE = {
  loading: true, error: false, home: null, weekShifts: [],
  pending: { time_off: [], shift_swaps: [], open_shifts: [] },
  incidents: [], reviews: [], attendance: [], training: [],
  manual: [], manualError: false, roster: [], leave: null,
  calloutsToday: [], myDocs: [], myAvail: [], availKnown: false,
}

export default function AiAssist() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const navigate = useNavigate()

  const roleName    = (session?.person?.role_name || '').toLowerCase()
  const isHR        = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))
  const personId    = session?.person?.id
  const personName  = session?.person?.full_name || session?.person?.preferred_name || 'Employee'
  const primaryLoc  = locations?.[0]?.name || getConfig().company_name || 'the company'

  const [tab, setTab] = useState('chat')
  const [live, setLive] = useState(EMPTY_LIVE)
  const [aiStats, setAiStats] = useState(null)
  const [aiHistory, setAiHistory] = useState([])

  const nodeKey = JSON.stringify(locationIds || [])

  // ── Load every live dataset the assistant answers from ─────────────────────
  useEffect(() => {
    if (!personId) return
    let cancelled = false
    const ids = Array.isArray(locationIds) && locationIds.length ? locationIds : null
    const todayISO = new Date().toISOString().slice(0, 10)
    const settle = (p) => Promise.resolve(p)
      .then(r => (r?.error ? { error: r.error } : { data: r?.data }))
      .catch(e => ({ error: e }))

    Promise.all([
      settle(sb.rpc('get_my_home',                { p_person_id: personId })),
      settle(sb.rpc('get_week_schedule',          { p_node_ids: ids, p_week_start: mondayISO(), p_actor: personId })),
      settle(sb.rpc('get_pending_requests',       { p_node_ids: ids })),
      settle(sb.rpc('get_incidents',              { p_node_ids: ids })),
      settle(sb.rpc('get_performance_reviews',    { p_node_ids: ids })),
      settle(sb.rpc('get_attendance_overview',    { p_node_ids: ids })),
      settle(sb.rpc('get_training_overview',      { p_node_ids: ids })),
      settle(sb.rpc('get_employee_manual',        { p_node_ids: ids })),
      settle(sb.rpc('get_roster',                 { p_node_ids: ids })),
      settle(sb.rpc('benefits_my_summary',        { p_person_id: personId })),
      settle(sb.rpc('forensic_callouts',          { p_node_ids: ids, p_date_from: todayISO, p_date_to: todayISO })),
      settle(sb.rpc('get_my_assigned_documents',  { p_person_id: personId })),
      settle(sb.rpc('get_my_availability',        { p_person_id: personId, p_node_id: ids ? ids[0] : null })),
    ]).then((results) => {
      if (cancelled) return
      const [home, week, pending, incidents, reviews, attendance, training, manual, roster, benefits, callouts, myDocs, myAvail] = results
      const failures = results.filter(r => r.error).length
      setLive({
        loading: false,
        error: failures === results.length,
        home: home.data && typeof home.data === 'object' ? home.data : null,
        weekShifts: arr(week.data),
        pending: pending.data && typeof pending.data === 'object'
          ? pending.data
          : { time_off: [], shift_swaps: [], open_shifts: [] },
        incidents: arr(incidents.data),
        reviews: arr(reviews.data),
        attendance: arr(attendance.data),
        training: arr(training.data),
        manual: arr(manual.data),
        manualError: !!manual.error,
        roster: arr(roster.data),
        leave: benefits.data?.leave || null,
        calloutsToday: arr(callouts.data?.callouts),
        myDocs: arr(myDocs.data),
        myAvail: arr(myAvail.data),
        availKnown: !myAvail.error,
      })
    })
    return () => { cancelled = true }
  }, [personId, nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI usage stats + persisted question history ─────────────────────────────
  const refreshAiMeta = useCallback(() => {
    if (!personId) return
    const ids = Array.isArray(locationIds) && locationIds.length ? locationIds : null
    sb.rpc('get_ai_assist_stats', { p_node_ids: ids })
      .then(({ data, error }) => { if (!error && data) setAiStats(data) })
      .catch(() => {})
    sb.rpc('get_ai_assist_history', { p_person_id: personId, p_limit: 20 })
      .then(({ data, error }) => { if (!error && Array.isArray(data)) setAiHistory(data) })
      .catch(() => {})
  }, [personId, nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refreshAiMeta() }, [refreshAiMeta])

  const logQuestion = useCallback((question, topic, answered) => {
    if (!personId || !question) return
    const ids = Array.isArray(locationIds) && locationIds.length ? locationIds : null
    sb.rpc('log_ai_question', {
      p_person_id: personId,
      p_node_id: ids ? ids[0] : null,
      p_question: question,
      p_topic: topic,
      p_answered: !!answered,
    })
      .then(({ error }) => {
        if (error) { console.warn('log_ai_question failed:', error.message); return }
        refreshAiMeta()
      })
      .catch(e => console.warn('log_ai_question failed:', e?.message))
  }, [personId, nodeKey, refreshAiMeta]) // eslint-disable-line react-hooks/exhaustive-deps

  const articles = useMemo(() => manualToArticles(live.manual), [live.manual])
  const actionItems = useMemo(
    () => deriveActionItems(live, isHR, personId, personName),
    [live, isHR, personId, personName],
  )
  const myOpenHigh = actionItems.filter(i => i.priority === 'high').length

  const TABS = [
    { id: 'chat',    label: 'Chat' },
    { id: 'kb',      label: 'Knowledge Base' },
    { id: 'actions', label: 'My Action Items' },
  ]

  return (
    <div style={{ background: 'var(--t-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--t-line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>AI HR Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3 }}>
              {primaryLoc} · {roleName || 'Employee'} · {personName}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {live.loading
              ? <span className="badge amber" style={{ fontSize: 10 }}>Loading live data…</span>
              : live.error
                ? <span className="badge red" style={{ fontSize: 10 }}>Live data unavailable</span>
                : <span className="badge green" style={{ fontSize: 10 }}>Online</span>}
            {isHR && <span className="badge purple" style={{ fontSize: 10 }}>Manager View</span>}
          </div>
        </div>
      </div>

      {live.error && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--t-line)', background: 'rgba(255,77,125,0.06)', fontSize: 12, color: 'var(--t-danger)', flexShrink: 0 }}>
          The HR backend could not be reached — answers, KPIs, and action items are unavailable rather than estimated. Try reloading.
        </div>
      )}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat' && (
          <ChatTab
            isHR={isHR}
            personId={personId}
            personName={personName}
            primaryLoc={primaryLoc}
            live={live}
            articles={articles}
            aiStats={aiStats}
            aiHistory={aiHistory}
            onLogQuestion={logQuestion}
            myOpenHigh={myOpenHigh}
            navigate={navigate}
          />
        )}
        {tab === 'kb' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <KnowledgeBaseTab
              articles={articles}
              loading={live.loading}
              loadError={live.manualError}
              onAskAi={() => setTab('chat')}
              navigate={navigate}
            />
          </div>
        )}
        {tab === 'actions' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <ActionItemsTab items={actionItems} loading={live.loading} navigate={navigate} />
          </div>
        )}
      </div>
    </div>
  )
}
