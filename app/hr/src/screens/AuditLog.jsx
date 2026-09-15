import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'
import { logAudit } from '../lib/audit.js'
import { companyName } from '../lib/config.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function fmtAbsolute(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function isoDate(d) { return d.toISOString().split('T')[0] }

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function downloadCSV(rows, filename) {
  const cols = ['timestamp', 'user', 'role', 'action', 'target', 'location', 'ip', 'result']
  const header = cols.join(',')
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map(r =>
    cols.map(c => escape(c === 'timestamp' ? fmtAbsolute(r.ts) : r[c])).join(',')
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `audit-log-${isoDate(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Drill-down columns for audit events (used by every tile + action row) ──────
const AUDIT_COLS = [
  { key: 'ts', label: 'Timestamp', value: e => fmtAbsolute(e.ts), sortKey: e => e.ts },
  { key: 'user', label: 'User', value: e => e.user },
  { key: 'role', label: 'Role', value: e => e.role },
  { key: 'action', label: 'Action', value: e => e.action },
  { key: 'target', label: 'Target / Object', value: e => e.target },
  { key: 'location', label: 'Location', value: e => e.location },
  { key: 'ip', label: 'IP Address', value: e => e.ip },
  { key: 'result', label: 'Result', value: e => e.result },
]

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into the underlying events' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Action badge color ────────────────────────────────────────────────────────
function actionBadgeClass(action) {
  const map = {
    'Login':              'blue',
    'Logout':             'blue',
    'View Employee':      'purple',
    'Edit Schedule':      'amber',
    'Approve PTO':        'green',
    'Issue DA':           'amber',
    'Change Role':        'amber',
    'View Payroll':       'purple',
    'Export Data':        'purple',
    'Delete Record':      'red',
    'Failed Login':       'red',
    'Permission Violation': 'red',
  }
  return map[action] || 'blue'
}

// ── Security severity ─────────────────────────────────────────────────────────
function securitySeverity(entry, failedLoginCounts) {
  const { action } = entry
  if (action === 'Delete Record') return 'critical'
  if (action === 'Permission Violation') return 'high'
  if (action === 'Export Data') return 'high'
  if (action === 'Change Role') return 'high'
  if (action === 'Failed Login') {
    const count = failedLoginCounts[entry.user] || 0
    if (count >= 6) return 'critical'
    if (count >= 4) return 'high'
    return 'medium'
  }
  return 'medium'
}

function severityColor(sev) {
  if (sev === 'critical') return 'var(--t-danger)'
  if (sev === 'high') return 'var(--t-warn)'
  if (sev === 'medium') return 'var(--t-accent)'
  return 'var(--t-success)'
}

function severityBadgeClass(sev) {
  if (sev === 'critical') return 'badge red'
  if (sev === 'high') return 'badge amber'
  if (sev === 'medium') return 'badge blue'
  return 'badge green'
}

const SECURITY_ACTIONS = new Set([
  'Failed Login', 'Permission Violation', 'Change Role', 'Delete Record', 'Export Data',
])

const PAGE_SIZE = 15

// ── Main Component ────────────────────────────────────────────────────────────
export default function AuditLog() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const r = session?.person?.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  // Tab state
  const [tab, setTab] = useState('live')

  // Live Log filters
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('All')
  const [filterAction, setFilterAction] = useState('All')
  const [filterLocation, setFilterLocation] = useState('All')
  const [filterResult, setFilterResult] = useState('All')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [page, setPage] = useState(0)

  // Refresh state
  const [lastRefreshed, setLastRefreshed] = useState(Date.now())
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Security tab filters
  const [secSeverity, setSecSeverity] = useState('All')
  const [secTimeFilter, setSecTimeFilter] = useState('Last 7d')
  const [dismissedSecIds, setDismissedSecIds] = useState(new Set())

  // Compliance report
  const [reportDateFrom, setReportDateFrom] = useState(isoDate(new Date(Date.now() - 7 * 86400000)))
  const [reportDateTo, setReportDateTo] = useState(isoDate(new Date()))
  const [reportGenerated, setReportGenerated] = useState(false)

  // Data — 100% real, node-scoped, append-only audit_log. Empty = honest empty.
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent = 'var(--t-accent)') => setDrill({ title, subtitle: `${rows.length} event${rows.length === 1 ? '' : 's'} · sortable · export · print`, columns: AUDIT_COLS, rows, accent })

  // Load REAL audit entries from Supabase (append-only log), scoped to the
  // caller's locations. No fallback — an empty log renders honest empty states.
  const loadReal = useCallback(async () => {
    const scope = (locationIds && locationIds.length) ? locationIds : null
    const { data, error } = await sb.rpc('get_audit_log', {
      p_from: null, p_to: null, p_action: null, p_limit: 500, p_node_ids: scope,
    })
    if (error) { setLoadError(true); setLoaded(true); return }
    const rows = Array.isArray(data) ? data : []
    const mapped = rows.map(r => ({
      id: r.id, ts: r.created_at, user: r.actor_name || 'System', role: r.actor_role || '—',
      action: r.action, target: r.target || '—', location: r.node_name || '—',
      ip: (r.meta && r.meta.ip) || '—', result: r.result || 'Success', payload: r.meta || {},
    }))
    setEntries(mapped)
    setLoadError(false)
    setLoaded(true)

    // Persisted forensic dismissals for the Security Events tab.
    const { data: dd } = await sb.rpc('get_audit_dismissals', { p_actor_id: null })
    const ids = Array.isArray(dd) ? dd.map(x => (x && x.event_id) || x).filter(Boolean) : []
    setDismissedSecIds(new Set(ids))
  }, [locationIds])

  // Auto-refresh every 30s (real data)
  useEffect(() => {
    loadReal()
    const interval = setInterval(() => { setLastRefreshed(Date.now()); setSecondsAgo(0); loadReal() }, 30000)
    return () => clearInterval(interval)
  }, [loadReal])

  // Tick seconds-ago counter
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [lastRefreshed])

  const handleRefresh = useCallback(() => {
    setLastRefreshed(Date.now())
    setSecondsAgo(0)
    loadReal()
  }, [loadReal])

  // ── Real writes (Security Events tab) ───────────────────────────────────────
  // Dismiss persists to audit_dismissals; investigate appends a real audit event.
  const dismissSecEvent = useCallback(async (e) => {
    const me = getSession()
    const isUuid = me.id && /^[0-9a-f-]{36}$/i.test(String(me.id))
    setDismissedSecIds(s => { const next = new Set(s); next.add(e.id); return next }) // optimistic
    await sb.rpc('dismiss_audit_event', {
      p_event_id: e.id,
      p_actor_id: isUuid ? me.id : null,
      p_actor_name: me.full_name || me.display_name || null,
      p_reason: null,
    })
    loadReal()
  }, [loadReal])

  const investigateEvent = useCallback((e) => {
    logAudit('Investigate', {
      target: `${e.action} by ${e.user}`,
      node: e.location && e.location !== '—' ? e.location : null,
      meta: { source_event_id: e.id, source_action: e.action, source_user: e.user },
    })
    setTimeout(loadReal, 400) // let the append commit, then reflect it
  }, [loadReal])

  // ── Derived: failed login counts per user ───────────────────────────────────
  const failedLoginCounts = useMemo(() => {
    const counts = {}
    const now = Date.now()
    const DAY = 86400000
    entries.forEach(e => {
      if (e.action === 'Failed Login' && (now - new Date(e.ts).getTime()) < DAY) {
        counts[e.user] = (counts[e.user] || 0) + 1
      }
    })
    return counts
  }, [entries])

  // ── KPI calculations ────────────────────────────────────────────────────────
  const today = isoDate(new Date())
  const todayEntries = useMemo(() => entries.filter(e => e.ts.startsWith(today)), [entries, today])

  const kpiTotalToday = todayEntries.length
  const kpiFailedLogins = Object.values(failedLoginCounts).reduce((a, b) => a + b, 0)
  const kpiAdminToday = todayEntries.filter(e => ['Change Role', 'Delete Record', 'Issue DA'].includes(e.action)).length
  const kpiExportsToday = todayEntries.filter(e => e.action === 'Export Data').length
  const kpiPermViolations = todayEntries.filter(e => e.action === 'Permission Violation').length
  // Real "active sessions" = distinct users who logged in today (no fabrication).
  const kpiActiveSessions = useMemo(() => {
    const set = new Set()
    todayEntries.forEach(e => { if (e.action === 'Login') set.add(e.user) })
    return set.size
  }, [todayEntries])

  const userEventCounts = useMemo(() => {
    const counts = {}
    entries.forEach(e => { counts[e.user] = (counts[e.user] || 0) + 1 })
    return counts
  }, [entries])
  const mostActiveUser = useMemo(() => {
    let top = '', topCount = 0
    Object.entries(userEventCounts).forEach(([u, c]) => { if (c > topCount) { top = u; topCount = c } })
    return { name: top, count: topCount }
  }, [userEventCounts])

  const lastAdminAction = useMemo(() => entries.find(e => ['Change Role', 'Delete Record', 'Issue DA'].includes(e.action)), [entries])
  const lastFailedLogin = useMemo(() => entries.find(e => e.action === 'Failed Login'), [entries])
  const lastExport = useMemo(() => entries.find(e => e.action === 'Export Data'), [entries])

  // ── By-action breakdown (derived from real events; trend = last 7d vs prior 7d)
  const actionBreakdown = useMemo(() => {
    const now = Date.now(); const WEEK = 7 * 86400000
    const total = entries.length || 1
    const actions = [...new Set(entries.map(e => e.action))].sort()
    return actions.map(action => {
      const evs = entries.filter(e => e.action === action)
      const todayCount = evs.filter(e => e.ts.startsWith(today)).length
      const weekCount = evs.filter(e => now - new Date(e.ts).getTime() < WEEK).length
      const priorCount = evs.filter(e => { const d = now - new Date(e.ts).getTime(); return d >= WEEK && d < 2 * WEEK }).length
      const pct = ((evs.length / total) * 100).toFixed(1)
      const trend = weekCount > priorCount ? '↑' : weekCount < priorCount ? '↓' : '→'
      return { action, todayCount, weekCount, pct, trend }
    })
  }, [entries, today])

  // ── Live Log filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterUser !== 'All' && e.user !== filterUser) return false
      if (filterAction !== 'All' && e.action !== filterAction) return false
      if (filterLocation !== 'All' && e.location !== filterLocation) return false
      if (filterResult !== 'All' && e.result !== filterResult) return false
      if (filterDateFrom && e.ts < filterDateFrom) return false
      if (filterDateTo && e.ts.split('T')[0] > filterDateTo) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (![e.user, e.action, e.target, e.location].join(' ').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [entries, filterUser, filterAction, filterLocation, filterResult, filterDateFrom, filterDateTo, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [search, filterUser, filterAction, filterLocation, filterResult, filterDateFrom, filterDateTo])

  const clearFilters = () => {
    setSearch(''); setFilterUser('All'); setFilterAction('All')
    setFilterLocation('All'); setFilterResult('All')
    setFilterDateFrom(''); setFilterDateTo('')
  }

  // Filter options derived from the real events currently loaded.
  const allUsers = useMemo(() => ['All', ...[...new Set(entries.map(e => e.user))].filter(Boolean).sort()], [entries])
  const allActions = useMemo(() => [...new Set(entries.map(e => e.action))].filter(Boolean).sort(), [entries])
  const allLocations = useMemo(() => [...new Set(entries.map(e => e.location))].filter(l => l && l !== '—').sort(), [entries])

  // ── Security events ─────────────────────────────────────────────────────────
  const securityEntries = useMemo(() => {
    const now = Date.now()
    const timeMs = secTimeFilter === 'Last hour' ? 3600000 : secTimeFilter === 'Last 24h' ? 86400000 : 7 * 86400000
    return entries
      .filter(e => SECURITY_ACTIONS.has(e.action))
      .filter(e => now - new Date(e.ts).getTime() < timeMs)
      .filter(e => {
        if (secSeverity === 'All') return true
        return securitySeverity(e, failedLoginCounts) === secSeverity.toLowerCase()
      })
      .filter(e => !dismissedSecIds.has(e.id))
  }, [entries, secSeverity, secTimeFilter, dismissedSecIds, failedLoginCounts])

  const secKpiCriticalToday = useMemo(() => securityEntries.filter(e => securitySeverity(e, failedLoginCounts) === 'critical').length, [securityEntries, failedLoginCounts])
  const secKpiHighToday = useMemo(() => securityEntries.filter(e => securitySeverity(e, failedLoginCounts) === 'high').length, [securityEntries, failedLoginCounts])
  const secKpiFailedLogins = useMemo(() => entries.filter(e => e.action === 'Failed Login').length, [entries])

  // Alert: any user with >5 failed logins in 24h
  const alertUser = useMemo(() => {
    return Object.entries(failedLoginCounts).find(([, c]) => c >= 5)
  }, [failedLoginCounts])

  // ── Compliance data (scoped to the selected report date range) ──────────────
  const reportEntries = useMemo(() => entries.filter(e => {
    const d = e.ts.split('T')[0]
    if (reportDateFrom && d < reportDateFrom) return false
    if (reportDateTo && d > reportDateTo) return false
    return true
  }), [entries, reportDateFrom, reportDateTo])

  const compliancePayrollAccess = useMemo(() => {
    const nonHRRoles = ['Associate', 'Key Holder']
    return reportEntries.filter(e => e.action === 'View Payroll').map(e => ({
      ...e,
      duration: e.payload?.duration_min != null ? `${e.payload.duration_min} min` : '—',
      purpose: e.payload?.purpose || '—',
      flagged: nonHRRoles.includes(e.role),
    }))
  }, [reportEntries])

  const complianceDaRecords = useMemo(() => {
    return reportEntries.filter(e => e.action === 'Issue DA').map(e => ({
      ...e,
      employeeAffected: e.target,
      authorized: ['HR Manager', 'Store Manager', 'COO', 'Admin'].includes(e.role),
    }))
  }, [reportEntries])

  const complianceExports = useMemo(() => {
    return reportEntries.filter(e => e.action === 'Export Data').map(e => ({
      ...e,
      recordCount: e.payload?.recordCount || 0,
      exportType: e.payload?.format || 'CSV',
      destination: e.payload?.destination || 'Local Download',
      authorized: e.payload?.authorized !== false,
      flagged: (e.payload?.recordCount || 0) > 50,
    }))
  }, [reportEntries])

  // Real compliance health = share of reviewed records without a flag.
  const complianceHealth = useMemo(() => {
    const rows = [...compliancePayrollAccess, ...complianceDaRecords, ...complianceExports]
    const flagged = compliancePayrollAccess.filter(r => r.flagged).length
      + complianceDaRecords.filter(r => !r.authorized).length
      + complianceExports.filter(r => r.flagged || !r.authorized).length
    const score = rows.length ? Math.round((1 - flagged / rows.length) * 100) : 100
    const range = reportEntries.map(e => new Date(e.ts).getTime())
    return {
      score, flagged, total: rows.length,
      earliest: range.length ? new Date(Math.min(...range)) : null,
      latest: range.length ? new Date(Math.max(...range)) : null,
      events: reportEntries.length,
    }
  }, [compliancePayrollAccess, complianceDaRecords, complianceExports, reportEntries])

  // ── Non-HR lock screen ──────────────────────────────────────────────────────
  if (!isHR) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t-text)' }}>Access Restricted</div>
        <div style={{ fontSize: 14 }}>Audit Log requires HR Manager, COO, or Admin access.</div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>Audit Log</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{companyName()} — All Locations — Forensic Activity Tracking</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Last refreshed: {secondsAgo}s ago</span>
          <button onClick={() => openDrill('Complete Audit Log (all events)', entries, 'var(--t-accent)')}
            style={{ background: 'rgba(0,229,255,.1)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 6 }}>
            View / Export / Print All
          </button>
          <button onClick={() => downloadCSV(entries, `audit-log-all-${isoDate(new Date())}.csv`)}
            style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6 }}>
            ⤓ Export CSV
          </button>
          <button onClick={() => window.print()}
            style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6 }}>
            🖨 Print
          </button>
          <button
            onClick={handleRefresh}
            style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6 }}
          >
            Refresh
          </button>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {loadError && (
        <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid var(--t-danger)', padding: '10px 16px', fontSize: 12, color: 'var(--t-danger)' }}>
          Unable to load the audit log right now. Showing no events rather than stale data — click Refresh to retry.
        </div>
      )}
      {!loadError && loaded && entries.length === 0 && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 16px', fontSize: 12, color: 'var(--t-text-muted)' }}>
          No audit activity has been recorded for your locations yet. Events appear here automatically as users act across the platform.
        </div>
      )}

      {/* ── KPI Row 1 ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KTile label="Total Events Today" value={kpiTotalToday} sub="All action types" color="var(--t-accent)"
          onClick={() => openDrill("Today's Audit Events", todayEntries)} />
        <KTile
          label="Failed Logins (24h)" value={kpiFailedLogins}
          sub={kpiFailedLogins > 5 ? 'Threshold exceeded' : kpiFailedLogins > 0 ? 'Monitor closely' : 'No failures'}
          color={kpiFailedLogins > 5 ? 'var(--t-danger)' : kpiFailedLogins > 0 ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={kpiFailedLogins > 5 ? 'red' : kpiFailedLogins > 0 ? 'amber' : null}
          onClick={() => openDrill('Failed Logins (last 24h)', entries.filter(e => e.action === 'Failed Login' && Date.now() - new Date(e.ts).getTime() < 86400000), 'var(--t-danger)')}
        />
        <KTile label="Admin Actions Today" value={kpiAdminToday} sub="Role / DA / Delete" color="var(--t-warn)" alert={kpiAdminToday > 2 ? 'amber' : null}
          onClick={() => openDrill("Today's Admin Actions", todayEntries.filter(e => ['Change Role', 'Delete Record', 'Issue DA'].includes(e.action)), 'var(--t-warn)')} />
        <KTile label="Data Exports Today" value={kpiExportsToday} sub="CSV / PDF exports" color="var(--t-accent)"
          onClick={() => openDrill("Today's Data Exports", todayEntries.filter(e => e.action === 'Export Data'))} />
        <KTile
          label="Permission Violations" value={kpiPermViolations}
          sub={kpiPermViolations > 0 ? 'Unauthorized access attempts' : 'None today'}
          color={kpiPermViolations > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={kpiPermViolations > 0 ? 'red' : null}
          onClick={() => openDrill("Today's Permission Violations", todayEntries.filter(e => e.action === 'Permission Violation'), 'var(--t-danger)')}
        />
        <KTile label="Logins Today" value={kpiActiveSessions} sub="Distinct users signed in today" color="var(--t-accent)"
          onClick={() => openDrill('Recent Session Activity (Logins Today)', todayEntries.filter(e => e.action === 'Login' || e.action === 'Logout'))} />
      </div>

      {/* ── KPI Row 2 ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
        <KTile
          label="Most Active User" value={mostActiveUser.name ? mostActiveUser.name.split(' ')[0] : 'None'}
          sub={mostActiveUser.count ? `${mostActiveUser.count} events total` : '—'} color="var(--t-text)"
          onClick={() => openDrill(`All Events — ${mostActiveUser.name}`, entries.filter(e => e.user === mostActiveUser.name))}
        />
        <KTile
          label="Last Admin Action"
          value={lastAdminAction ? lastAdminAction.action.replace(' ', ' ') : 'None'}
          sub={lastAdminAction ? relativeTime(lastAdminAction.ts) : '—'}
          color="var(--t-warn)"
          onClick={() => openDrill('Admin Actions (Role / DA / Delete)', entries.filter(e => ['Change Role', 'Delete Record', 'Issue DA'].includes(e.action)), 'var(--t-warn)')}
        />
        <KTile
          label="Last Failed Login"
          value={lastFailedLogin ? lastFailedLogin.user.split(' ')[0] : 'None'}
          sub={lastFailedLogin ? relativeTime(lastFailedLogin.ts) : 'No failures'}
          color={lastFailedLogin && (Date.now() - new Date(lastFailedLogin.ts).getTime()) < 3600000 ? 'var(--t-danger)' : 'var(--t-text-muted)'}
          alert={lastFailedLogin && (Date.now() - new Date(lastFailedLogin.ts).getTime()) < 3600000 ? 'red' : null}
          onClick={() => openDrill('All Failed Logins', entries.filter(e => e.action === 'Failed Login'), 'var(--t-danger)')}
        />
        <KTile
          label="Last Data Export"
          value={lastExport ? lastExport.user.split(' ')[0] : 'None'}
          sub={lastExport ? relativeTime(lastExport.ts) : '—'}
          color="var(--t-accent)"
          onClick={() => openDrill('All Data Exports', entries.filter(e => e.action === 'Export Data'))}
        />
        <KTile label="Audit Retention" value="7 years" sub="FLSA 29 CFR § 516 policy" color="var(--t-text-muted)"
          onClick={() => openDrill('Full Retained Audit Log (all events)', entries, 'var(--t-text-muted)')} />
        <KTile label="Total Events Logged" value={entries.length} sub="Append-only audit trail" color="var(--t-success)"
          onClick={() => openDrill('Complete Append-Only Audit Log', entries, 'var(--t-success)')} />
      </div>

      {/* ── KPI Row 3: By-action breakdown ────────────────────────────────────── */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Action Breakdown — This Week</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Action Type', 'Events Today', 'Events This Week', '% of Total', 'Trend'].map(col => (
                  <th key={col} style={{ textAlign: 'left', padding: '6px 12px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actionBreakdown.map((row, i) => (
                <tr key={row.action} onClick={() => openDrill(`${row.action} — This Week`, entries.filter(e => e.action === row.action))} title="Click to drill into these events" style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)', cursor: 'pointer' }}>
                  <td style={{ padding: '7px 12px', color: 'var(--t-text)', fontWeight: 500 }}>{row.action} <span style={{ color: 'var(--t-text-faint)', fontSize: 10 }}>›</span></td>
                  <td style={{ padding: '7px 12px', color: row.todayCount > 0 ? 'var(--t-text)' : 'var(--t-text-faint)' }}>{row.todayCount}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--t-text)' }}>{row.weekCount}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--t-text-muted)' }}>{row.pct}%</td>
                  <td style={{ padding: '7px 12px', color: row.trend === '↑' ? 'var(--t-success)' : row.trend === '↓' ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: 700 }}>{row.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tab Bar ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)' }}>
        {[
          { key: 'live', label: 'Live Log' },
          { key: 'security', label: 'Security Events' },
          { key: 'compliance', label: 'Compliance Report' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--t-accent)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'all .15s',
            }}
          >
            {t.label}
            {t.key === 'security' && kpiPermViolations + kpiFailedLogins > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--t-danger)', color: '#fff', borderRadius: 8, fontSize: 9, padding: '1px 5px', fontWeight: 800 }}>
                {kpiPermViolations + kpiFailedLogins}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1 — LIVE LOG
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Filters */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            {/* Search */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Search</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="User, action, target…"
                style={{ padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, borderRadius: 4, outline: 'none' }}
              />
            </div>

            {/* User */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>User</label>
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={selStyle}>
                {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Action</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selStyle}>
                <option value="All">All Actions</option>
                {allActions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Location */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Location</label>
              <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={selStyle}>
                <option value="All">All Locations</option>
                {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>From</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={selStyle} />
            </div>

            {/* Date to */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>To</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={selStyle} />
            </div>

            {/* Result */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Result</label>
              <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={selStyle}>
                <option value="All">All Results</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button onClick={clearFilters} style={btnStyle}>Clear Filters</button>
              <button onClick={() => downloadCSV(filtered, `audit-filtered-${isoDate(new Date())}.csv`)} style={{ ...btnStyle, color: 'var(--t-accent)', borderColor: 'var(--t-accent)' }}>
                Export CSV
              </button>
            </div>
          </div>

          {/* Results count */}
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            Showing <strong style={{ color: 'var(--t-text)' }}>{filtered.length}</strong> of {entries.length} entries
            {filtered.length < entries.length && ' (filtered)'}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--t-surface-2)' }}>
                    {['Timestamp', 'User', 'Role', 'Action', 'Target / Object', 'Location', 'IP Address', 'Result'].map(col => (
                      <th key={col} style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px 12px', color: 'var(--t-text-faint)', fontSize: 13 }}>
                        No entries match the current filters.
                      </td>
                    </tr>
                  ) : pageRows.map((row, i) => (
                    <>
                      <tr
                        key={row.id}
                        onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                        style={{
                          borderBottom: expandedRow === row.id ? 'none' : '1px solid var(--t-line)',
                          background: expandedRow === row.id ? 'var(--t-surface-2)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
                          cursor: 'pointer',
                          transition: 'background .1s',
                        }}
                      >
                        {/* Timestamp */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 11, color: 'var(--t-text)', fontVariantNumeric: 'tabular-nums' }}>{fmtAbsolute(row.ts)}</div>
                          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{relativeTime(row.ts)}</div>
                        </td>
                        {/* User */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 0,
                              background: `hsl(${(row.user.charCodeAt(0) * 17) % 360},55%,40%)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
                            }}>
                              {initials(row.user)}
                            </div>
                            <span style={{ color: 'var(--t-text)', fontWeight: 500 }}>{row.user}</span>
                          </div>
                        </td>
                        {/* Role */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--t-text-muted)', fontSize: 11 }}>{row.role}</td>
                        {/* Action */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span className={`badge ${actionBadgeClass(row.action)}`}>{row.action}</span>
                        </td>
                        {/* Target */}
                        <td style={{ padding: '10px 12px', color: 'var(--t-text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.target}>
                          {row.target}
                        </td>
                        {/* Location */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--t-text-muted)', fontSize: 11 }}>{row.location}</td>
                        {/* IP */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-faint)' }}>{row.ip}</td>
                        {/* Result */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span className={`badge ${row.result === 'Success' ? 'green' : 'red'}`}>{row.result}</span>
                        </td>
                      </tr>
                      {expandedRow === row.id && (
                        <tr key={`${row.id}-expand`} style={{ borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                          <td colSpan={8} style={{ padding: '0 12px 12px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Full Event Payload</div>
                            <pre style={{
                              background: 'var(--t-bg)',
                              border: '1px solid var(--t-line)',
                              padding: '12px 14px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontFamily: 'monospace',
                              color: 'var(--t-accent)',
                              overflowX: 'auto',
                              margin: 0,
                              lineHeight: 1.6,
                            }}>
                              {JSON.stringify({ id: row.id, ts: row.ts, user: row.user, role: row.role, action: row.action, target: row.target, location: row.location, ip: row.ip, result: row.result, payload: row.payload }, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--t-line)' }}>
                <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                  Page {page + 1} of {totalPages} &nbsp;·&nbsp; rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(0)} disabled={page === 0} style={btnStyle}>«</button>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={btnStyle}>‹ Prev</button>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} style={btnStyle}>Next ›</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={btnStyle}>»</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2 — SECURITY EVENTS
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Alert banner */}
          {alertUser && (
            <div style={{
              background: 'rgba(239,68,68,.12)', border: '1px solid var(--t-danger)',
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--t-danger)', fontSize: 13 }}>
                  SECURITY ALERT: {alertUser[0]} has {alertUser[1]} failed login attempts in 24 hours. Account may be compromised.
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                  Recommend immediate password reset and account review.
                </div>
              </div>
            </div>
          )}

          {/* Security KPI tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <KTile label="Critical Events (window)" value={secKpiCriticalToday} sub="Delete / Bulk Export / Violations" color="var(--t-danger)" alert={secKpiCriticalToday > 0 ? 'red' : null} />
            <KTile label="High Severity (window)" value={secKpiHighToday} sub="Permission / Role changes / Exports" color="var(--t-warn)" alert={secKpiHighToday > 2 ? 'amber' : null} />
            <KTile label="Failed Login Attempts" value={secKpiFailedLogins} sub="Total in selected window" color={secKpiFailedLogins > 5 ? 'var(--t-danger)' : 'var(--t-text-muted)'} alert={secKpiFailedLogins > 5 ? 'red' : null} />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Severity</label>
              <select value={secSeverity} onChange={e => setSecSeverity(e.target.value)} style={selStyle}>
                {['All', 'Critical', 'High', 'Medium', 'Low'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Time Window</label>
              <select value={secTimeFilter} onChange={e => setSecTimeFilter(e.target.value)} style={selStyle}>
                {['Last hour', 'Last 24h', 'Last 7d'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <span style={{ fontSize: 12, color: 'var(--t-text-faint)', alignSelf: 'flex-end', paddingBottom: 8 }}>
              {securityEntries.length} events
            </span>
          </div>

          {/* Security event cards */}
          {securityEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--t-text-faint)', fontSize: 13 }}>
              No security events in the selected window.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {securityEntries.map(e => {
                const sev = securitySeverity(e, failedLoginCounts)
                const icon = e.action === 'Failed Login' ? '🔑' : e.action === 'Permission Violation' ? '🛡' : e.action === 'Delete Record' ? '⚠' : e.action === 'Export Data' ? '📤' : '⚠'
                return (
                  <div key={e.id} style={{
                    background: 'var(--t-surface)',
                    border: `1px solid ${sev === 'critical' ? 'var(--t-danger)' : sev === 'high' ? 'var(--t-warn)' : 'var(--t-line)'}`,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}>
                    <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span className={severityBadgeClass(sev)}>{sev.toUpperCase()}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{e.action}</span>
                        <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>by {e.user} ({e.role})</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 6 }}>
                        Target: <span style={{ color: 'var(--t-text)' }}>{e.target}</span> &nbsp;·&nbsp;
                        Location: {e.location} &nbsp;·&nbsp;
                        IP: <span style={{ fontFamily: 'monospace' }}>{e.ip}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{fmtAbsolute(e.ts)} &nbsp;·&nbsp; {relativeTime(e.ts)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => investigateEvent(e)}
                        style={{ ...btnStyle, background: 'rgba(0,229,255,.1)', color: 'var(--t-accent)', borderColor: 'var(--t-accent)', fontSize: 11 }}
                      >
                        Investigate
                      </button>
                      <button
                        onClick={() => dismissSecEvent(e)}
                        style={{ ...btnStyle, fontSize: 11 }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3 — COMPLIANCE REPORT
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === 'compliance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Date range controls */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>From</label>
              <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} style={selStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>To</label>
              <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} style={selStyle} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              {[['Last 7d', 7], ['Last 30d', 30], ['Last 90d', 90]].map(([label, days]) => (
                <button
                  key={label}
                  onClick={() => { setReportDateFrom(isoDate(new Date(Date.now() - days * 86400000))); setReportDateTo(isoDate(new Date())) }}
                  style={{ ...btnStyle, fontSize: 11 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setReportGenerated(true)}
              style={{ ...btnStyle, background: 'rgba(0,229,255,.1)', color: 'var(--t-accent)', borderColor: 'var(--t-accent)', fontWeight: 700 }}
            >
              Generate Report
            </button>
          </div>

          {!reportGenerated ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--t-text-faint)', fontSize: 13 }}>
              Select a date range and click Generate Report to view compliance data.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Compliance health score */}
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Compliance Health</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: complianceHealth.flagged > 0 ? 'var(--t-warn)' : 'var(--t-success)' }}>{complianceHealth.score}%</div>
                    <div>
                      <div style={{ width: 200, height: 8, background: 'var(--t-line)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${complianceHealth.score}%`, height: '100%', background: complianceHealth.flagged > 0 ? 'var(--t-warn)' : 'var(--t-success)', borderRadius: 4 }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>
                        {complianceHealth.total === 0 ? 'No reviewable records in this period' : complianceHealth.flagged === 0 ? 'No items require attention' : `${complianceHealth.flagged} item${complianceHealth.flagged === 1 ? '' : 's'} require attention`}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Events in period: <strong style={{ color: 'var(--t-text)' }}>{complianceHealth.events}</strong></div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12 }}>Earliest–latest: <strong style={{ color: 'var(--t-text)' }}>{complianceHealth.earliest ? `${fmtAbsolute(complianceHealth.earliest.toISOString())} – ${fmtAbsolute(complianceHealth.latest.toISOString())}` : '—'}</strong></div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { if (window.confirm('Print/export compliance report?')) window.print() }} style={{ ...btnStyle, fontSize: 11 }}>Export PDF</button>
                    <button onClick={() => downloadCSV([...compliancePayrollAccess, ...complianceDaRecords, ...complianceExports], `compliance-report-${isoDate(new Date())}.csv`)} style={{ ...btnStyle, fontSize: 11 }}>Export CSV</button>
                  </div>
                </div>
              </div>

              {/* Retention notice */}
              <div style={{ background: 'rgba(0,229,255,.06)', border: '1px solid rgba(0,229,255,.2)', padding: '10px 16px', fontSize: 12, color: 'var(--t-text-muted)' }}>
                Records retained for <strong style={{ color: 'var(--t-text)' }}>7 years</strong> per FLSA requirements (29 CFR § 516). &nbsp;·&nbsp; This is an <strong style={{ color: 'var(--t-text)' }}>append-only</strong> log &nbsp;·&nbsp; {reportEntries.length} event{reportEntries.length === 1 ? '' : 's'} in the selected period.
              </div>

              {/* Section 1: Payroll Data Access */}
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>Payroll Data Access</div>
                  <span className="badge blue">FLSA Compliance</span>
                  {compliancePayrollAccess.some(r => r.flagged) && <span className="badge amber">Flagged Access</span>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2)' }}>
                        {['User', 'Role', 'Accessed At', 'Duration', 'IP', 'Purpose'].map(c => (
                          <th key={c} style={thStyle}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compliancePayrollAccess.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--t-text-faint)', fontSize: 12 }}>No payroll access records in this period.</td></tr>
                      ) : compliancePayrollAccess.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)', background: row.flagged ? 'rgba(245,158,11,.07)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                          <td style={tdStyle}>{row.user} {row.flagged && <span className="badge amber" style={{ fontSize: 9, marginLeft: 4 }}>Non-HR</span>}</td>
                          <td style={tdStyle}>{row.role}</td>
                          <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtAbsolute(row.ts)}</td>
                          <td style={tdStyle}>{row.duration}</td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.ip}</td>
                          <td style={tdStyle}>{row.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Disciplinary Record Modifications */}
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>Disciplinary Record Modifications</div>
                  <span className="badge purple">HR Records</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2)' }}>
                        {['User', 'Action', 'Employee Affected', 'Timestamp', 'Authorized'].map(c => (
                          <th key={c} style={thStyle}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {complianceDaRecords.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--t-text-faint)', fontSize: 12 }}>No DA modifications in this period.</td></tr>
                      ) : complianceDaRecords.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)', background: !row.authorized ? 'rgba(239,68,68,.07)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                          <td style={tdStyle}>{row.user}</td>
                          <td style={tdStyle}><span className="badge amber">{row.action}</span></td>
                          <td style={tdStyle}>{row.employeeAffected}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtAbsolute(row.ts)}</td>
                          <td style={tdStyle}>
                            <span className={`badge ${row.authorized ? 'green' : 'red'}`}>{row.authorized ? 'Yes' : 'No'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Employee PII Export Log */}
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>Employee PII Export Log</div>
                  <span className="badge red">Data Privacy</span>
                  {complianceExports.some(r => r.flagged) && <span className="badge amber">Large Export Warning</span>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2)' }}>
                        {['User', 'Records Exported', 'Export Type', 'Timestamp', 'Destination', 'Authorized'].map(c => (
                          <th key={c} style={thStyle}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {complianceExports.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--t-text-faint)', fontSize: 12 }}>No exports in this period.</td></tr>
                      ) : complianceExports.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)', background: row.flagged ? 'rgba(245,158,11,.07)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                          <td style={tdStyle}>{row.user}</td>
                          <td style={{ ...tdStyle, fontWeight: row.flagged ? 700 : 400, color: row.flagged ? 'var(--t-warn)' : 'var(--t-text)' }}>
                            {row.recordCount} {row.flagged && <span className="badge amber" style={{ fontSize: 9, marginLeft: 4 }}>Large</span>}
                          </td>
                          <td style={tdStyle}>{row.exportType}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtAbsolute(row.ts)}</td>
                          <td style={tdStyle}>{row.destination}</td>
                          <td style={tdStyle}><span className={`badge ${row.authorized ? 'green' : 'red'}`}>{row.authorized ? 'Yes' : 'No'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ── Shared inline style snippets ──────────────────────────────────────────────
const selStyle = {
  padding: '6px 10px',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  fontSize: 12,
  borderRadius: 4,
  outline: 'none',
  cursor: 'pointer',
}

const btnStyle = {
  padding: '6px 12px',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text-muted)',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 700,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  color: 'var(--t-text-muted)',
  borderBottom: '1px solid var(--t-line)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '9px 12px',
  color: 'var(--t-text)',
  fontSize: 12,
}
