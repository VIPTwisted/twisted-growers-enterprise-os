import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { ScopeProvider, useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { getAllFlags } from '../lib/featureFlags.js'
import { KEY, lsGet } from '../lib/platform.js'
import GreetingModal from './GreetingModal.jsx'
import CommandPalette from './CommandPalette.jsx'
import { fetchPulseFlags } from '../lib/pulse.js'
import { logAudit } from '../lib/audit.js'

/* ── HR top-nav mega-menus ──────────────────────────────────── */
const TOP_NAV = [
  {
    key: 'employee',
    label: 'Employee',
    hub: '/employee-hub',
    paths: ['/employee-hub','/employees','/roster','/org-chart','/employee-360','/probation',
            '/health-scores','/skills-matrix','/attendance-points','/coaching-log',
            '/one-on-ones','/shift-notes','/shift-report'],
    columns: [
      { group: 'DIRECTORY', items: [
        { label: 'Employee Files',     to: '/employees' },
        { label: 'Staff Roster',       to: '/roster' },
        { label: 'Org Chart',          to: '/org-chart',         flag: 'org_chart' },
        { label: 'Employee 360',       to: '/employee-360',      flag: 'employee_360' },
        { label: 'Probation Tracker',  to: '/probation',         flag: 'probation_tracker' },
      ]},
      { group: 'PERFORMANCE', items: [
        { label: 'Health Scores',      to: '/health-scores',     flag: 'health_score' },
        { label: '★ Flight-Risk Model', to: '/flight-risk' },
        { label: '★ 9-Box & Succession', to: '/nine-box' },
        { label: 'Skills Matrix',      to: '/skills-matrix',     flag: 'skills_matrix' },
        { label: 'Attendance Points',  to: '/attendance-points', flag: 'attendance_points' },
        { label: 'Coaching Log',       to: '/coaching-log',      flag: 'coaching_log' },
        { label: '1-on-1 Log',         to: '/one-on-ones',       flag: 'one_on_ones' },
        { label: 'Shift Notes',        to: '/shift-notes',       flag: 'shift_notes' },
        { label: 'Shift Reports',      to: '/shift-report',      flag: 'shift_report' },
      ]},
    ],
  },
  {
    key: 'scheduling',
    label: 'Scheduling',
    hub: '/scheduling-hub',
    paths: ['/scheduling-hub','/schedule-center','/schedule','/cal','/zones','/availability','/bookends',
            '/timeclock','/timeclock-kiosk','/attendance','/callout',
            '/coverage','/shift-marketplace','/ai-schedule',
            '/schedule-builder','/zone-settings','/schedule-audit','/forensic-callouts','/coverage-monitor'],
    columns: [
      { group: 'SCHEDULE', items: [
        { label: '★ Schedule Command Center', to: '/schedule-center' },
        { label: 'Build Schedule',     to: '/schedule-builder' },
        { label: 'Weekly Schedule',    to: '/schedule' },
        { label: 'Calendar View',      to: '/cal' },
        { label: 'AI Scheduler',       to: '/ai-schedule' },
        { label: 'Zone Assignments',   to: '/zones' },
        { label: 'Zones & Settings',   to: '/zone-settings' },
        { label: 'Availability',       to: '/availability' },
      ]},
      { group: 'TIME & ATTENDANCE', items: [
        { label: 'Time Clock',         to: '/timeclock' },
        { label: 'Kiosk Mode',         to: '/timeclock-kiosk',   flag: 'kiosk_mode' },
        { label: 'Shift Bookends',     to: '/bookends' },
        { label: 'Attendance',         to: '/attendance' },
        { label: 'Time-Off Approvals', to: '/time-off-board' },
        { label: 'Schedule Audit / Records', to: '/schedule-audit' },
        { label: 'Attendance Forensics', to: '/forensic-callouts' },
        { label: 'Callout Tracker',    to: '/callout' },
        { label: 'Coverage Board',     to: '/coverage' },
        { label: 'Coverage Monitor',   to: '/coverage-monitor' },
        { label: 'Shift Marketplace',  to: '/shift-marketplace', flag: 'shift_marketplace' },
      ]},
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    hub: '/onboarding-hub',
    paths: ['/onboarding-hub','/onboarding','/ats','/pipeline','/recruiting','/hr-messages','/documents','/app-import','/availability-import','/hiring-planner'],
    columns: [
      { group: 'NEW HIRE SETUP', items: [
        { label: 'Onboarding Board',      to: '/onboarding-board' },
        { label: 'Onboarding Dashboard',  to: '/onboarding' },
        { label: 'New Hire Documents',    to: '/documents' },
        { label: '★ HQ Documents (shared)', to: '/hq-docs' },
        { label: 'App Import',            to: '/app-import' },
      ]},
      { group: 'RECRUITING', items: [
        { label: '★ AI Staffing Planner', to: '/hiring-planner' },
        { label: 'Recruiting Board',      to: '/recruiting' },
        { label: 'Applicant Tracking',    to: '/ats' },
        { label: 'Candidate Pipeline',    to: '/pipeline' },
        { label: 'AI Availability Import', to: '/availability-import' },
        { label: 'HR Messaging',          to: '/hr-messages' },
      ]},
    ],
  },
  {
    key: 'training',
    label: 'Training',
    hub: '/training-hub',
    paths: ['/training-hub','/training','/learning-paths','/training-lms','/academy','/weekly-drills',
            '/training-track','/reviews','/appraisals','/products','/manual','/training-panel'],
    columns: [
      { group: 'COURSES & LMS', items: [
        { label: 'Training & Dev',      to: '/training' },
        { label: 'Learning Paths',      to: '/learning-paths' },
        { label: 'Register Training',   to: '/training-panel' },
        { label: 'Training LMS',        to: '/training-lms' },
        { label: 'TG Academy',         to: '/academy' },
        { label: 'Weekly Drills',       to: '/weekly-drills' },
        { label: 'Progress Tracker',    to: '/training-track' },
      ]},
      { group: 'KNOWLEDGE', items: [
        { label: 'Performance Reviews', to: '/reviews' },
        { label: 'Appraisals',          to: '/appraisals' },
        { label: 'Product Knowledge',   to: '/products' },
        { label: 'Employee Manual',     to: '/manual' },
      ]},
    ],
  },
  {
    key: 'policies',
    label: 'Policies',
    hub: '/policies-hub',
    paths: ['/policies-hub','/policies','/handbook','/disciplinary','/incidents','/attendance-forensics',
            '/exit-interviews','/hr-investigations','/fmla-loa','/workers-comp',
            '/suspensions','/rehires','/ct-compliance','/store-visits','/hr-ops','/cleaning-logs'],
    columns: [
      { group: 'POLICIES & HANDBOOK', items: [
        { label: 'Policies',             to: '/policies' },
        { label: 'Handbook Builder',     to: '/handbook',              flag: 'handbook_builder' },
        { label: 'CT Compliance',        to: '/ct-compliance',         flag: 'ct_compliance' },
        { label: '★ Cert Expirations',   to: '/compliance-expirations' },
        { label: 'HR Operations',        to: '/hr-ops' },
        { label: 'Store Visits',         to: '/store-visits',          flag: 'store_visit_log' },
        { label: 'Cleaning Logs',        to: '/cleaning-logs',         flag: 'cleaning_logs' },
      ]},
      { group: 'DISCIPLINE', items: [
        { label: 'Disciplinary Actions', to: '/disciplinary' },
        { label: 'Incidents',            to: '/incidents' },
        { label: 'Incidents Board',      to: '/incidents-board' },
        { label: 'Attend. Warnings (AI)',to: '/attendance-forensics' },
        { label: 'Suspensions',          to: '/suspensions',           flag: 'suspensions' },
        { label: 'HR Investigations',    to: '/hr-investigations',     flag: 'hr_investigations' },
      ]},
      { group: 'LEAVE & COMPLIANCE', items: [
        { label: 'FMLA / Leave Tracker', to: '/fmla-loa',              flag: 'fmla_loa' },
        { label: 'Workers Comp Log',     to: '/workers-comp',          flag: 'workers_comp' },
        { label: 'Exit Interviews',      to: '/exit-interviews',       flag: 'exit_interviews' },
        { label: 'Rehire Management',    to: '/rehires',               flag: 'rehires' },
      ]},
    ],
  },
  {
    key: 'forms',
    label: 'Forms',
    hub: '/forms-hub',
    paths: ['/forms-hub','/forms','/requests','/direct-deposit','/emergency-contacts'],
    columns: [
      { group: 'FORMS  A – M', items: [
        { label: 'Attendance Warning Form',   to: '/attendance-forensics' },
        { label: 'Coaching Log Entry',         to: '/coaching-log',      flag: 'coaching_log' },
        { label: 'Direct Deposit Change',      to: '/direct-deposit' },
        { label: 'Emergency Contact Form',     to: '/emergency-contacts', flag: 'emergency_contacts' },
        { label: 'Employee Memo',              to: '/hr-messages' },
        { label: 'Employee Separation Form',   to: '/hr-ops' },
        { label: 'Exit Interview Form',        to: '/exit-interviews',   flag: 'exit_interviews' },
        { label: 'FMLA / Leave Request',       to: '/fmla-loa',          flag: 'fmla_loa' },
        { label: 'Incident Report',            to: '/incidents' },
      ]},
      { group: 'FORMS  N – Z', items: [
        { label: 'New Hire Checklist',         to: '/onboarding' },
        { label: 'New Hire Document Packet',   to: '/documents' },
        { label: 'Performance Review Form',    to: '/reviews' },
        { label: 'PTO / Leave Request',        to: '/requests' },
        { label: 'Timesheet Submission',       to: '/forms' },
        { label: 'Verbal Warning Form',        to: '/disciplinary' },
        { label: 'Workers Comp Claim',         to: '/workers-comp',      flag: 'workers_comp' },
        { label: 'Written Warning Form',       to: '/disciplinary' },
      ]},
    ],
  },
]

/* ── sidebar — non-HR items only ────────────────────────────── */
const SIDEBAR_NAV = [
  {
    section: 'MAIN',
    items: [
      { label: 'Dashboard',      to: '/',              end: true },
      { label: 'Experience Hub', to: '/experience' },
      { label: 'Pulse Surveys',  to: '/pulse' },
      { label: 'Insights',       to: '/insights' },
      { label: 'Notifications',  to: '/notifications', flag: 'notifications', badge: 'notif' },
      { label: 'Tasks',          to: '/tasks',         badge: 'tasks' },
      { label: 'Tasks Board',    to: '/tasks-board' },
    ],
  },
  {
    section: 'WORK BOARDS',
    items: [
      { label: 'Command Center',     to: '/command-center' },
      { label: 'Coverage Monitor',   to: '/coverage-monitor' },
      { label: 'Tasks Board',        to: '/tasks-board' },
      { label: 'Recruiting Board',   to: '/recruiting' },
      { label: 'Time-Off Approvals', to: '/time-off-board' },
      { label: 'Incidents Board',    to: '/incidents-board' },
      { label: 'Onboarding Board',   to: '/onboarding-board' },
      { label: 'Help Desk',          to: '/helpdesk' },
      { label: 'e-Sign',             to: '/sign' },
    ],
  },
  {
    section: 'COMMUNICATION',
    items: [
      { label: 'Messages',      to: '/messages' },
      { label: 'Team Chat',     to: '/chat' },
      { label: 'Broadcasts',    to: '/comms' },
      { label: 'Daily Huddle',  to: '/huddle' },
      { label: 'Meetings',      to: '/meetings' },
      { label: 'Compliments',   to: '/compliments' },
    ],
  },
  {
    section: 'MY PORTAL',
    items: [
      { label: 'My Home',            to: '/myhome' },
      { label: 'PTO & Leave',        to: '/requests',          badge: 'pto' },
      { label: 'Timesheets',         to: '/forms' },
      { label: 'Direct Deposit',     to: '/direct-deposit' },
      { label: 'My Documents',       to: '/my-docs' },
      { label: 'My Pay Stubs',       to: '/payroll',           flag: 'payroll_detail' },
      { label: 'Benefits',           to: '/benefits',          flag: 'benefits_admin' },
      { label: 'Spiffs',             to: '/spiffs' },
      { label: 'Merchandise',        to: '/merch' },
      { label: 'Emergency Contacts', to: '/emergency-contacts', flag: 'emergency_contacts' },
      { label: 'My Handbook',        to: '/handbook',          flag: 'handbook_builder' },
    ],
  },
  {
    section: 'HR FILES',
    items: [
      { label: 'HR File Manager',    to: '/doc-manager' },
      { label: 'Secure HR Vault',    to: '/doc-vault' },
      { label: 'Doc Center',         to: '/doc-center' },
      { label: 'Reports',            to: '/reports' },
      { label: 'KPI Dashboard',      to: '/kpi' },
      { label: '★ Labor Budget',     to: '/labor-budget' },
      { label: '★ Benchmarking',     to: '/benchmarking' },
      { label: 'Payroll',            to: '/payroll',           flag: 'payroll_detail' },
    ],
  },
  {
    section: 'BUSINESS',
    items: [
      { label: 'Sales Tracker',     to: '/sales' },
      { label: 'Promotions',        to: '/promotions' },
      { label: 'Inventory',         to: '/inventory' },
      { label: 'Contests',          to: '/contests' },
      { label: 'Goals & Targets',   to: '/goals' },
      { label: 'Leaderboards',      to: '/leaderboards' },
      { label: 'Gamification',      to: '/gamification' },
      { label: 'Cultivation Floor', to: '/cultivation' },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { label: 'Command Center',  to: '/command-center' },
      { label: 'AI CEO Command',  to: '/ai-ceo',        badge: 'critical' },
      { label: 'AI Assistant',    to: '/ai-assist' },
      { label: 'Analytics',       to: '/analytics' },
      { label: 'Audit Log',       to: '/audit' },
      { label: 'Maintenance',     to: '/maintenance' },
    ],
  },
  {
    section: 'ADMIN',
    items: [
      { label: 'Admin Panel',      to: '/admin' },
      { label: 'Timecard Access',  to: '/timecard-access' },
    ],
  },
  {
    section: 'SETTINGS',
    items: [
      { label: 'Settings',         to: '/settings' },
      { label: 'Nav Config',       to: '/nav-config' },
      { label: 'Feature Toggles',  to: '/feature-toggles' },
      { label: 'Integrations',     to: '/integrations' },
      { label: 'Theme Studio',     to: '/theme-studio' },
      { label: 'AI Greeting Approvals', to: '/greetings-admin' },
    ],
  },
]

/* ── live clock ──────────────────────────────────────────────── */
function useClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

/* ── live notification counts ────────────────────────────────── */
function useNotifCounts(locationIds) {
  const [counts, setCounts] = useState({})
  const load = useCallback(() => {
    if (!locationIds.length) return
    Promise.allSettled([
      sb.rpc('get_pending_pto_count',   { p_node_ids: locationIds }),
      sb.rpc('get_pending_tasks_count', { p_node_ids: locationIds }),
      sb.rpc('get_ai_ceo_data',         { p_node_ids: locationIds }),
    ]).then(([pto, tasks, ai]) => {
      const ptoCnt  = pto.status === 'fulfilled'   ? (pto.value?.data ?? 0) : 0
      const taskCnt = tasks.status === 'fulfilled' ? (tasks.value?.data ?? 0) : 0
      const aiData  = ai.status === 'fulfilled'    ? (ai.value?.data) : null
      const critical = aiData?.proposals?.filter(p => p.tier === 1 && p.status === 'pending').length || 0
      setCounts({ pto: Number(ptoCnt), tasks: Number(taskCnt), critical })
    }).catch(() => {})
  }, [locationIds.join(',')])

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])
  return counts
}

/* ── alert ticker data ───────────────────────────────────────── */
function useAlerts(locationIds) {
  const [alerts, setAlerts] = useState([])
  useEffect(() => {
    if (!locationIds.length) return
    sb.rpc('get_ai_ceo_data', { p_node_ids: locationIds })
      .then(({ data }) => {
        if (!data) return
        const props = data.proposals || []
        const critical = props.filter(p => p.tier === 1 && p.status === 'pending')
        const warn = props.filter(p => p.tier === 2 && p.status === 'pending')
        setAlerts([
          ...critical.slice(0, 3).map(p => ({ text: p.title || 'Critical alert', node: p.node_name })),
          ...warn.slice(0, 2).map(p => ({ text: p.title || 'Alert', node: p.node_name })),
        ])
      })
      .catch(() => {})
  }, [locationIds.join(',')])
  return alerts
}

/* ── scope selector ──────────────────────────────────────────── */
function ScopeSelector() {
  const { scope, setScope, locations, isExec } = useScope()
  // Functional for everyone, execs included. Execs are entitled to all locations
  // (RLS-safe) — narrowing is just a view preference that every page follows.
  return (
    <select value={scope || 'ALL'} onChange={e => setScope(e.target.value)}
      title="Viewing scope — changes what every page shows"
      style={{ minWidth: 0, width: '100%', fontSize: 11, padding: '6px 8px' }}>
      {locations.length > 1 && (
        <option value="ALL">All Locations ({locations.length}){isExec ? ' · Full Access' : ''}</option>
      )}
      {locations.map(n => (
        <option key={n.id} value={n.id}>{n.name}</option>
      ))}
    </select>
  )
}

/* ── global location switcher (always visible in the top bar) ──── */
// The single source of truth for "which location am I looking at". Appears on
// EVERY page so you always know — and can change — the active location context.
// Custom dropdown (not a native <select>) so it matches the dark theme and the
// RoleSwitcher beside it instead of rendering a washed-out OS popup.
function LocationSwitcher() {
  const { scope, setScope, locations, isAllScope } = useScope()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  if (!locations || locations.length <= 1) return null

  const val = scope || 'ALL'
  const curLabel = val === 'ALL' ? 'All Locations' : (locations.find(l => l.id === val)?.name || 'Location')
  const pick = (v) => { setScope(v); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} title="Location scope — changes what every page shows"
        style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 0,
          background: isAllScope ? 'var(--t-surface-2)' : 'rgba(0,229,255,.12)',
          border: `1px solid ${isAllScope ? 'var(--t-line)' : 'var(--t-accent)'}`,
          color: 'var(--t-text)', fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', letterSpacing: '.02em', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12 }}>📍</span>
        <span style={{ color: isAllScope ? 'var(--t-text)' : 'var(--t-accent)' }}>{curLabel}</span>
        <span style={{ color: 'var(--t-text-faint)' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 240, borderRadius: 0, background: 'var(--t-bg)', border: '1px solid var(--t-line)', boxShadow: '0 12px 40px rgba(0,0,0,.6)', zIndex: 9999 }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>Viewing location</div>
            {[{ id: 'ALL', name: `All Locations (${locations.length})` }, ...locations].map(n => {
              const active = val === n.id
              return (
                <div key={n.id} onClick={() => pick(n.id)}
                  style={{ padding: '9px 12px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: active ? 'var(--t-surface-2)' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--t-surface-2)'} onMouseLeave={e => e.currentTarget.style.background = active ? 'var(--t-surface-2)' : 'transparent'}>
                  <span style={{ fontSize: 12, lineHeight: 1 }}>{n.id === 'ALL' ? '🌐' : '📍'}</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--t-accent)' : 'var(--t-text)', flex: 1 }}>{n.name}{active ? ' ✓' : ''}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ── alert ticker ────────────────────────────────────────────── */
function AlertTicker() {
  const { locationIds } = useScope()
  const alerts = useAlerts(locationIds)
  return (
    <div className="ticker">
      <div className="ticker-lbl">
        <div className="live-dot" />
        ALERTS
      </div>
      <div className="ticker-items">
        {alerts.length === 0 ? (
          <span className="ticker-item ok">All systems nominal</span>
        ) : (
          alerts.map((a, i) => (
            <span key={i} className="ticker-item">
              <strong>{a.node ? `[${a.node}] ` : ''}</strong>{a.text}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

/* ── inline alert (lives inside the top bar, not its own row) ──── */
function AlertInline() {
  const { locationIds } = useScope()
  const alerts = useAlerts(locationIds)
  const none = alerts.length === 0
  const accent = none ? 'var(--t-success)' : 'var(--t-alert, var(--t-danger))'
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, margin: '0 18px', overflow: 'hidden' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: none ? 'var(--t-text-muted)' : accent, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}` }} />
        ALERTS
      </span>
      <span style={{ fontSize: 12, color: none ? 'var(--t-text-faint)' : 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {none ? 'All systems nominal' : alerts.map(a => `${a.node ? `[${a.node}] ` : ''}${a.text}`).join('   ·   ')}
      </span>
    </div>
  )
}

/* ── count badge ──────────────────────────────────────────────── */
function CountBadge({ count }) {
  if (!count) return null
  return <span className="sb-count">{count > 99 ? '99+' : count}</span>
}

/* ── HR top nav (mega-menu bar) ──────────────────────────────── */
function HRTopNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(null)
  const [infraFlags, setInfraFlags] = useState(() => getAllFlags())
  const navRef = useRef(null)

  useEffect(() => {
    const h = () => setInfraFlags(getAllFlags())
    window.addEventListener('vip_flags_changed', h)
    return () => window.removeEventListener('vip_flags_changed', h)
  }, [])

  useEffect(() => {
    const handler = e => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setOpen(null) }, [location.pathname])

  const isCatActive = paths => paths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'))

  const barS = {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '0 4px', background: 'var(--t-surface)',
    borderBottom: '1px solid var(--t-line)',
    height: 42, position: 'relative', zIndex: 200, flexShrink: 0,
  }
  const labelS = (active, isOpen) => ({
    height: 38, padding: '0 12px 0 16px',
    background: isOpen ? 'var(--t-accent)' : 'transparent',
    border: 'none', borderRadius: 0,
    borderBottom: active && !isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: isOpen ? '#fff' : active ? 'var(--t-accent)' : 'var(--t-text)',
    fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
    cursor: 'pointer', whiteSpace: 'nowrap',
  })
  const caretS = (active, isOpen) => ({
    height: 38, padding: '0 10px 0 4px',
    background: isOpen ? 'var(--t-accent)' : 'transparent',
    border: 'none', borderLeft: '1px solid var(--t-line)',
    borderBottom: active && !isOpen ? '2px solid var(--t-accent)' : '2px solid transparent',
    borderRadius: 0,
    color: isOpen ? '#fff' : active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    fontSize: 7, cursor: 'pointer',
  })
  const dropdownS = numCols => ({
    position: 'absolute', top: '100%', left: 0,
    background: 'var(--t-bg)', border: '1px solid var(--t-line)',
    borderTop: '2px solid var(--t-accent)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    zIndex: 9999, display: 'flex', minWidth: numCols * 210,
  })
  const colS = last => ({
    minWidth: 210, flex: 1,
    borderRight: last ? 'none' : '1px solid var(--t-line)',
  })
  const colHdrS = {
    padding: '9px 14px 6px', fontSize: 9, fontWeight: 800,
    letterSpacing: '.12em', color: 'var(--t-accent)', textTransform: 'uppercase',
    borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)',
  }
  const linkS = isAct => ({
    display: 'block', padding: '8px 14px', fontSize: 12,
    color: isAct ? 'var(--t-accent)' : 'var(--t-text)',
    background: isAct ? 'var(--t-surface-2)' : 'transparent',
    textDecoration: 'none', fontWeight: isAct ? 700 : 400,
    borderLeft: isAct ? '2px solid var(--t-accent)' : '2px solid transparent',
    letterSpacing: '.01em',
  })
  const hrBtnS = {
    height: 30, padding: '0 14px', marginLeft: 8,
    background: 'var(--t-accent)', border: 'none', borderRadius: 0,
    color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
    textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div ref={navRef} style={barS}>
      {TOP_NAV.map(cat => {
        const active = isCatActive(cat.paths)
        const isOpen = open === cat.key
        return (
          <div key={cat.key} style={{ position: 'relative', display: 'flex' }}>
            {/* Label → navigate to hub dashboard */}
            <button style={labelS(active, isOpen)} onClick={() => { setOpen(null); navigate(cat.hub) }}>
              {cat.label}
            </button>
            {/* Caret → toggle dropdown */}
            <button style={caretS(active, isOpen)} onClick={() => setOpen(isOpen ? null : cat.key)}>
              {isOpen ? '▲' : '▼'}
            </button>

            {isOpen && (
              <div style={dropdownS(cat.columns.length)}>
                {cat.columns.map((col, ci) => (
                  <div key={ci} style={colS(ci === cat.columns.length - 1)}>
                    <div style={colHdrS}>{col.group}</div>
                    {col.items
                      .filter(item => !item.flag || infraFlags[item.flag] !== false)
                      .map(item => (
                        <NavLink key={item.to + item.label} to={item.to}
                          style={({ isActive }) => linkS(isActive)}>
                          {item.label}
                        </NavLink>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* HR / CEO Master Dashboard */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}>
        <button style={hrBtnS} onClick={() => navigate('/hr-dashboard')}>
          HR / CEO Dashboard
        </button>
      </div>
    </div>
  )
}

/* ── sidebar ──────────────────────────────────────────────────── */
function Sidebar() {
  const { session, logout } = useAuth()
  const { locationIds } = useScope()
  const counts = useNotifCounts(locationIds)
  const [collapsed, setCollapsed] = useState({})
  const [infraFlags, setInfraFlags] = useState(() => getAllFlags())
  const [notifBadge, setNotifBadge] = useState(() => {
    const notifs = lsGet(KEY.notifications(), [])
    const unread = notifs.filter(n => !n.read).length
    return unread || 7
  })

  useEffect(() => {
    const h = () => setInfraFlags(getAllFlags())
    window.addEventListener('vip_flags_changed', h)
    return () => window.removeEventListener('vip_flags_changed', h)
  }, [])

  useEffect(() => {
    const h = () => {
      const notifs = lsGet(KEY.notifications(), [])
      setNotifBadge(notifs.filter(n => !n.read).length || 0)
    }
    window.addEventListener('vip_notification_added', h)
    return () => window.removeEventListener('vip_notification_added', h)
  }, [])

  const initials = session.person.full_name
    ? session.person.full_name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
    : (session.person.login_id?.slice(0, 2).toUpperCase() || 'VP')

  const badgeVal = key => {
    if (key === 'pto')      return counts.pto || 0
    if (key === 'tasks')    return counts.tasks || 0
    if (key === 'critical') return counts.critical || 0
    if (key === 'notif')    return notifBadge
    return 0
  }

  const toggleSection = sec => setCollapsed(prev => ({ ...prev, [sec]: !prev[sec] }))

  return (
    <aside className="sidebar">
      {/* user block */}
      <div className="sb-user">
        <div className="sb-avatar" style={{ borderRadius: 0 }}>{initials}</div>
        <div className="sb-user-info">
          <div className="sb-user-name">{session.person.full_name || session.person.login_id}</div>
          <div className="sb-user-sub">{session.person.login_id}</div>
        </div>
      </div>

      {/* location scope */}
      <div className="sb-scope">
        <ScopeSelector />
      </div>

      {/* collapse controls */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 12px 2px' }}>
        <button
          onClick={() => setCollapsed(Object.fromEntries(SIDEBAR_NAV.map(s => [s.section, true])))}
          style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', padding: '4px 0', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' }}
        >COLLAPSE ALL</button>
        <button
          onClick={() => setCollapsed({})}
          style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', padding: '4px 0', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' }}
        >EXPAND ALL</button>
      </div>

      {/* nav */}
      <nav className="sb-nav">
        {SIDEBAR_NAV.map(sec => {
          const isCollapsed = !!collapsed[sec.section]
          return (
            <div key={sec.section} className="sb-section">
              <div
                className="sb-section-hdr"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => toggleSection(sec.section)}
              >
                <span>{sec.section}</span>
                <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 6 }}>{isCollapsed ? '▶' : '▼'}</span>
              </div>
              {!isCollapsed && sec.items
                .filter(item => !item.flag || infraFlags[item.flag] !== false)
                .map(item => {
                  const cnt = item.badge ? badgeVal(item.badge) : 0
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={!!item.end}
                      className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                    >
                      <span className="sb-item-label">{item.label}</span>
                      <CountBadge count={cnt} />
                    </NavLink>
                  )
                })}
            </div>
          )
        })}
      </nav>

      {/* sign out */}
      <div className="sb-footer">
        <button className="sb-logout" onClick={logout}>Sign Out</button>
      </div>
    </aside>
  )
}

/* ── top bar ──────────────────────────────────────────────────── */
// The company name in the top bar is a ROW (hr.company_branding via get_company_branding),
// read once per load; the fallback is the locked fact, never the clone's name.
let BRAND_CACHE = null
function useBranding() {
  const [brand, setBrand] = useState(BRAND_CACHE)
  useEffect(() => {
    if (BRAND_CACHE) return undefined
    let live = true
    sb.rpc('get_company_branding').then(({ data }) => { if (live && data) { BRAND_CACHE = data; setBrand(data) } })
    return () => { live = false }
  }, [])
  return brand
}

function TopBar() {
  const brand = useBranding()
  const now = useClock()
  const { locations } = useScope()
  const locCount = locations?.length || 0
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="topbar-logo">TG</div>
        <div>
          <div className="topbar-name">{brand?.company_display_name || 'TWISTED GROWERS'}</div>
          <div className="topbar-sub">{locCount} Location{locCount === 1 ? '' : 's'}</div>
        </div>
      </div>
      <AlertInline />
      <div className="topbar-clock" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LocationSwitcher />
        <RoleSwitcher />
        <TopBarActions />
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>{timeStr}</span>
          <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 8 }}>{dateStr}</span>
        </div>
      </div>
    </div>
  )
}

/* ── role switcher (admin: test as any role) ──────────────────────────── */
// Fully-defined test users. Selecting one swaps the session (role + name + scope)
// and reloads so every gate, scope, and feature flag reflects that role.
// Preview the platform as another role — the admin's own name and nodes, only the role gate changes.
// Every entry is a real Twisted Growers role (hr.roles); nobody fictional is impersonated.
const TEST_USERS = [
  { key: 'admin',   label: 'Admin / Owner',    role_name: 'Admin/Owner',      scope: 'all',    color: '#7c4dff' },
  { key: 'ceo',     label: 'CEO',              role_name: 'CEO',              scope: 'all',    color: '#ffd60a' },
  { key: 'cfo',     label: 'CFO',              role_name: 'CFO',              scope: 'all',    color: '#e2bd63' },
  { key: 'hr',      label: 'HR Manager',       role_name: 'HR Manager',       scope: 'all',    color: '#00e5ff' },
  { key: 'dh',      label: 'Department Head',  role_name: 'Department Head',  scope: 'single', color: '#1de9b6' },
  { key: 'lead',    label: 'Lead',             role_name: 'Lead',             scope: 'single', color: '#2df26a' },
  { key: 'kh',      label: 'Key Holder',       role_name: 'Key Holder',       scope: 'single', color: '#ff9500' },
  { key: 'assoc',   label: 'Associate',        role_name: 'Associate',        scope: 'single', color: '#34c759' },
]

function RoleSwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  let cur = {}
  try { cur = JSON.parse(sessionStorage.getItem('vip_session') || '{}') } catch { /* */ }
  const curRole = cur?.person?.role_name || ''
  const isExecNow = /admin|owner|ceo|coo|cfo|president|chief/i.test(curRole)
  const hasBackup = (() => { try { return !!sessionStorage.getItem('vip_session_admin') } catch { return false } })()
  // visible to execs/admins (or while impersonating, so you can always switch back)
  if (!isExecNow && !hasBackup) return null

  const activeKey = TEST_USERS.find(u => u.role_name.toLowerCase() === curRole.toLowerCase())?.key
    || (!hasBackup && isExecNow ? 'admin' : null)

  const switchTo = (u) => {
    try {
      // preserve the real admin session the first time we impersonate
      const backup = sessionStorage.getItem('vip_session_admin')
      const base = backup ? JSON.parse(backup) : cur
      if (!backup) sessionStorage.setItem('vip_session_admin', JSON.stringify(cur))

      const allNodes = base?.nodes || cur?.nodes || []
      const locs = allNodes.filter(n => n.node_type === 'location')
      const nodes = u.scope === 'single' && locs.length ? [locs[0]] : allNodes
      const basePerson = base?.person || cur?.person || {}
      const person = {
        ...basePerson,
        role_name: u.role_name,
      }
      if (u.key === 'admin' && backup) {
        // reset to the real admin session
        sessionStorage.setItem('vip_session', backup)
        sessionStorage.removeItem('vip_session_admin')
      } else {
        sessionStorage.setItem('vip_session', JSON.stringify({ person, nodes }))
      }
      logAudit('Test-As Role Switch', { target: u.role_name })
      window.location.reload()
    } catch (_) { /* */ }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} title="Test as another role"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(124,77,255,.12)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', letterSpacing: '.02em' }}>
        <span style={{ fontSize: 12 }}>🧪</span>
        <span>Test as: <b style={{ color: 'var(--t-accent)' }}>{curRole || 'Admin'}</b></span>
        <span style={{ color: 'var(--t-text-faint)' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 240, background: 'var(--t-bg)', border: '1px solid var(--t-line)', boxShadow: '0 12px 40px rgba(0,0,0,.6)', zIndex: 9999 }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>Test as role</div>
            {TEST_USERS.map(u => (
              <div key={u.key} onClick={() => switchTo(u)}
                style={{ padding: '9px 12px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: activeKey === u.key ? 'var(--t-surface-2)' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--t-surface-2)'} onMouseLeave={e => e.currentTarget.style.background = activeKey === u.key ? 'var(--t-surface-2)' : 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{u.label}{activeKey === u.key ? ' ✓' : ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{u.scope === 'all' ? 'all locations' : '1 location'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── top-bar alert + message icons (drilldownable + actionable) ────────── */
function sessionPerson() { try { return JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person || {} } catch { return {} } }
const isMgr = r => /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i.test(r || '')

function buildTopAlerts(person) {
  const alerts = [], messages = []
  const me = person?.full_name || ''
  const mgr = isMgr(person?.role_name)
  try {
    // low-mood pulse escalations → managers/HR/COO
    if (mgr) {
      const flags = JSON.parse(localStorage.getItem('vip_pulse_flags') || '[]')
      flags.slice(0, 15).forEach(f => alerts.push({ id: f.id, icon: '😟', title: `${f.person_name} is feeling ${f.mood_label}`, detail: f.note || 'No reason given', at: f.at, to: '/insights' }))
    }
    // coverage requests targeting me → my messages
    const cov = JSON.parse(localStorage.getItem('vip_coverage_requests') || '[]')
    cov.forEach(r => (r.recipients || []).forEach(rc => {
      if (rc.id === person?.id && rc.status === 'pending') messages.push({ id: r.id + rc.id, icon: '📣', title: `Cover ${r.shift} at ${r.location}?`, detail: r.message || '', at: r.created_at, to: '/schedule-center' })
    }))
    // task messages addressed to me
    const tm = JSON.parse(localStorage.getItem('vip_task_messages') || '{}')
    Object.values(tm).flat().forEach(m => { if (m.to === me) messages.push({ id: m.id, icon: m.kind === 'praise' ? '🎉' : m.kind === 'urgent' ? '⏰' : '💬', title: m.body, detail: `from ${m.from}`, at: m.at, to: '/tasks' }) })
  } catch (_) {}
  const byTime = (a, b) => new Date(b.at || 0) - new Date(a.at || 0)
  return { alerts: alerts.sort(byTime).slice(0, 20), messages: messages.sort(byTime).slice(0, 20) }
}

function TopBarActions() {
  const nav = useNavigate()
  const person = sessionPerson()
  const [open, setOpen] = useState(null) // 'alerts' | 'messages'
  const [data, setData] = useState({ alerts: [], messages: [] })
  useEffect(() => {
    const refresh = async () => {
      const base = buildTopAlerts(person)
      // merge DURABLE (cross-device) low-mood pulse flags from Supabase
      if (isMgr(person?.role_name)) {
        try {
          const dbFlags = await fetchPulseFlags()
          const seen = new Set(base.alerts.map(a => a.id))
          const label = { 1: 'Rough', 2: 'Meh', 3: 'Okay' }
          dbFlags.forEach(f => {
            const id = f.id || `${f.person_id}-${f.created_at}`
            if (seen.has(id)) return
            seen.add(id)
            base.alerts.push({ id, icon: '😟', title: `${f.person_name || 'Employee'} is feeling ${f.mood_label || label[f.mood] || 'low'}`, detail: f.note || 'No reason given', at: f.created_at || f.at, to: '/insights' })
          })
          base.alerts.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
        } catch (_) {}
      }
      setData({ alerts: base.alerts.slice(0, 20), messages: base.messages })
    }
    refresh()
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const IconBtn = ({ kind, glyph, count }) => (
    <button onClick={() => setOpen(o => o === kind ? null : kind)} title={kind === 'alerts' ? 'Alerts' : 'Messages'}
      style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 4 }}>
      {glyph}
      {count > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, padding: '0 3px', background: 'var(--t-danger)', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>}
    </button>
  )
  const list = open === 'alerts' ? data.alerts : open === 'messages' ? data.messages : []

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      <IconBtn kind="alerts" glyph="🔔" count={data.alerts.length} />
      <IconBtn kind="messages" glyph="✉️" count={data.messages.length} />
      {open && (
        <>
          <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 340, maxHeight: 420, overflowY: 'auto', background: 'var(--t-bg)', border: '1px solid var(--t-line)', boxShadow: '0 12px 40px rgba(0,0,0,.6)', zIndex: 9999 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text)' }}>
              {open === 'alerts' ? 'Alerts' : 'Messages'} ({list.length})
            </div>
            {list.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--t-text-faint)' }}>Nothing right now. 🎉</div>}
            {list.map(item => (
              <div key={item.id} onClick={() => { setOpen(null); nav(item.to) }}
                style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', display: 'flex', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--t-surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', marginTop: 2 }}>{item.at ? new Date(item.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} · tap to open ↗</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ── shell ────────────────────────────────────────────────────── */
export default function Shell({ children }) {
  return (
    <ScopeProvider>
      <div className="app">
        {/* AI login briefing — fires on every login, over any landing page */}
        <GreetingModal person={sessionPerson()} />
        {/* global Cmd/Ctrl-K command palette */}
        <CommandPalette />
        <TopBar />
        <div className="app-body">
          <Sidebar />
          <div className="app-content">
            <main>{children}</main>
          </div>
        </div>
      </div>
    </ScopeProvider>
  )
}
