import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ── SHARED COMPONENTS ────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      borderTop: `3px solid ${accent || 'var(--t-accent)'}`,
      padding: '14px 16px', borderRadius: 0, flex: 1, minWidth: 110,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

const INP = { fontSize: 12, padding: '7px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none' }
const BTN = { fontSize: 11, fontWeight: 700, padding: '7px 14px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' }
const GHOST_BTN = { fontSize: 11, fontWeight: 600, padding: '7px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

function FilterBar({ dateFrom, setDateFrom, dateTo, setDateTo, search, setSearch, empId, setEmpId, onRefresh, extraFilters }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>FROM</label>
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INP} />
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>TO</label>
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INP} />
      <input type="text" placeholder="Employee name..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, minWidth: 200 }} />
      <input type="text" placeholder="Employee ID..." value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...INP, width: 130 }} />
      {extraFilters}
      <button style={BTN} onClick={onRefresh}>↺ Refresh</button>
    </div>
  )
}

function PageHeader({ title, sub, isLive, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text)', margin: 0, textTransform: 'uppercase' }}>{title}</h1>
        {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <span style={{ fontSize: 9, fontWeight: 800, padding: '4px 9px', background: isLive ? 'var(--t-success)' : 'var(--t-warn)', color: '#fff', letterSpacing: '.08em', borderRadius: 0 }}>
          {isLive ? 'LIVE' : 'DEMO'}
        </span>
      </div>
    </div>
  )
}

function QuickLinks({ links }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
      {links.map(({ label, to }) => (
        <NavLink key={to} to={to} style={GHOST_BTN}>{label}</NavLink>
      ))}
    </div>
  )
}

function SectionCard({ title, badge, children, action }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text)' }}>{title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {badge && <span style={{ fontSize: 9, padding: '2px 8px', background: 'var(--t-accent)', color: '#fff', fontWeight: 700, letterSpacing: '.06em' }}>{badge}</span>}
          {action}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

// Next 7 calendar days for the weekly coverage grid — real dates, not seeded.
const WEEK_DATES = Array.from({ length: 7 }, (_, i) =>
  new Date(Date.now() + i * 86400000).toISOString().slice(0, 10))
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_END = WEEK_DATES[WEEK_DATES.length - 1]
const COVERAGE_MIN = 1

// Relative "time ago" for the activity feed (real dates in → human string out).
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// Derive a display severity from a disciplinary-action type (display mapping only).
function daSeverity(type) {
  const t = String(type || '').toLowerCase()
  if (/final|suspension|termination/.test(t)) return 'High'
  if (/written|pip/.test(t)) return 'Medium'
  return 'Low'
}

// Normalize a get_roster row into the shape the dashboard renders.
function normEmployee(r) {
  return {
    id:           r.id ?? r.person_id,
    full_name:    r.full_name ?? '—',
    role_name:    r.role_name ?? r.role ?? '—',
    node_name:    r.node_name ?? r.location ?? '—',
    node_id:      r.node_id ?? null,
    is_active:    (r.status ?? r.assignment_status ?? 'active') !== 'inactive',
    hire_date:    r.hire_date ?? null,
    hours_week:   Number(r.hours_week ?? r.hours_30d ?? 0),
    open_das:     Number(r.open_das ?? 0),
    callouts_30d: Number(r.callouts_30d ?? 0),
    training_pct: Number(r.training_pct ?? 0),
    policy_signed: !!r.policy_signed,
    last_review_days: Number(r.last_review_days ?? 0),
  }
}

// ── STYLES ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    background: 'var(--t-bg)', minHeight: '100dvh', padding: '24px 28px', fontFamily: 'inherit',
  },
  kpiBar: {
    display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
  },
  tabBar: {
    display: 'flex', gap: 0, borderBottom: '2px solid var(--t-line)', marginBottom: 20,
  },
  tabBtn: (active) => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
    padding: '9px 20px', border: 'none', borderRadius: 0, cursor: 'pointer',
    background: active ? 'var(--t-accent)' : 'var(--t-surface)',
    color: active ? '#fff' : 'var(--t-text-muted)',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    marginBottom: -2,
    transition: 'background 0.15s, color 0.15s',
  }),
  twoCol: { display: 'grid', gridTemplateColumns: '60% 1fr', gap: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 800,
    letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)',
    borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)',
  },
  td: {
    padding: '9px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)',
    verticalAlign: 'middle',
  },
  badge: (color) => ({
    fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '2px 7px',
    background: color, color: '#fff', borderRadius: 0,
  }),
  alertRow: {
    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0',
    borderBottom: '1px solid var(--t-line)',
  },
  alertDot: (level) => ({
    width: 8, height: 8, borderRadius: 0, flexShrink: 0, marginTop: 4,
    background: level === 'danger' ? 'var(--t-danger)' : 'var(--t-warn)',
  }),
  activityRow: {
    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0',
    borderBottom: '1px solid var(--t-line)',
  },
  activityIcon: (type) => ({
    width: 22, height: 22, borderRadius: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 800,
    background: type === 'success' ? 'var(--t-success)'
               : type === 'danger' ? 'var(--t-danger)'
               : type === 'warn'   ? 'var(--t-warn)'
               : 'var(--t-accent)',
    color: '#fff',
  }),
  quickAction: {
    display: 'block', width: '100%', padding: '12px 16px', marginBottom: 8,
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', fontSize: 12, fontWeight: 600, textAlign: 'left',
    cursor: 'pointer', borderRadius: 0, letterSpacing: '.03em',
    textDecoration: 'none',
  },
  coverageCell: (count) => ({
    flex: 1, textAlign: 'center', padding: '6px 0', fontSize: 12, fontWeight: 700,
    background: count >= COVERAGE_MIN
      ? `rgba(34,197,94,${0.1 + count * 0.06})`
      : 'rgba(239,68,68,0.18)',
    color: count >= COVERAGE_MIN ? 'var(--t-success)' : 'var(--t-danger)',
    borderRight: '1px solid var(--t-line)',
  }),
  empCard: {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    padding: '12px 16px', marginBottom: 8,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  pill: (color) => ({
    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 0,
    background: color, color: '#fff', letterSpacing: '.05em',
  }),
  locSummaryCard: {
    background: 'var(--t-surface)', border: '1px solid var(--t-line)',
    padding: '14px 16px', flex: 1,
  },
  headerRow: {
    display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16,
  },
  select: {
    ...INP, cursor: 'pointer',
  },
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function complianceColor(pct) {
  if (pct >= 92) return 'var(--t-success)'
  if (pct >= 85) return 'var(--t-warn)'
  return 'var(--t-danger)'
}

function daStatusColor(status) {
  if (status === 'Open') return 'var(--t-danger)'
  if (status === 'Resolved') return 'var(--t-success)'
  return 'var(--t-text-muted)'
}

function severityColor(sev) {
  if (sev === 'High') return 'var(--t-danger)'
  if (sev === 'Medium') return 'var(--t-warn)'
  return 'var(--t-text-muted)'
}

function trainingPctColor(pct) {
  if (pct >= 90) return 'var(--t-success)'
  if (pct >= 75) return 'var(--t-warn)'
  return 'var(--t-danger)'
}

// ── EMPTY STATE ──────────────────────────────────────────────────────────────

function EmptyState({ label }) {
  return (
    <div style={{ padding: '22px 12px', textAlign: 'center', fontSize: 12, color: 'var(--t-text-muted)' }}>
      {label}
    </div>
  )
}

// ── TAB: OVERVIEW ────────────────────────────────────────────────────────────

function OverviewTab({ locPerf, activity, alerts }) {
  return (
    <div style={S.twoCol}>
      {/* LEFT COLUMN */}
      <div>
        <SectionCard title="Location Performance" badge={`${locPerf.length} LOCATIONS`}>
          {locPerf.length === 0
            ? <EmptyState label="No location data for the current scope." />
            : (
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Location', 'Headcount', 'On Shift', 'Callouts', 'Active DAs', 'Compliance %'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {locPerf.map((row, i) => (
                    <tr key={row.name} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                      <td style={S.td}>
                        <span style={{ fontWeight: 700, color: 'var(--t-accent)' }}>{row.name}</span>
                      </td>
                      <td style={S.td}>{row.headcount}</td>
                      <td style={S.td}>
                        <span style={S.badge('var(--t-success)')}>{row.onShift}</span>
                      </td>
                      <td style={S.td}>
                        {row.callouts > 0
                          ? <span style={S.badge('var(--t-danger)')}>{row.callouts}</span>
                          : <span style={{ color: 'var(--t-text-muted)' }}>0</span>}
                      </td>
                      <td style={S.td}>
                        {row.activeDAs > 0
                          ? <span style={S.badge('var(--t-warn)')}>{row.activeDAs}</span>
                          : <span style={{ color: 'var(--t-text-muted)' }}>0</span>}
                      </td>
                      <td style={S.td}>
                        <span style={{ fontWeight: 700, color: complianceColor(row.compliance) }}>{row.compliance}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </SectionCard>

        <SectionCard title="Recent Activity" badge={`${activity.length} EVENTS`}>
          {activity.length === 0
            ? <EmptyState label="No recent HR activity in this window." />
            : activity.map((ev, i) => (
              <div key={i} style={S.activityRow}>
                <div style={S.activityIcon(ev.type)}>{ev.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 600 }}>{ev.desc}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2 }}>
                    {ev.emp} &middot; {ev.ago}
                  </div>
                </div>
              </div>
            ))}
        </SectionCard>
      </div>

      {/* RIGHT COLUMN */}
      <div>
        <SectionCard title="Alerts" badge={`${alerts.length} ACTIVE`}>
          {alerts.length === 0
            ? <EmptyState label="No active alerts. All clear." />
            : alerts.map((a, i) => (
              <div key={i} style={{ ...S.alertRow, borderBottom: i < alerts.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                <div style={S.alertDot(a.level)} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: a.level === 'danger' ? 'var(--t-danger)' : 'var(--t-warn)' }}>
                      {a.label}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 600 }}>{a.loc}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.4 }}>{a.desc}</div>
                </div>
              </div>
            ))}
        </SectionCard>

        <SectionCard title="Quick Actions">
          <NavLink to="/pto-requests"  style={S.quickAction}>Approve PTO Requests</NavLink>
          <NavLink to="/disciplinary"  style={S.quickAction}>Issue Disciplinary Action</NavLink>
          <NavLink to="/scheduling"    style={S.quickAction}>View Schedule</NavLink>
          <NavLink to="/employees/new" style={S.quickAction}>Add New Employee</NavLink>
          <NavLink to="/reports"       style={S.quickAction}>Generate HR Report</NavLink>
          <NavLink to="/training"      style={S.quickAction}>View Training Status</NavLink>
        </SectionCard>
      </div>
    </div>
  )
}

// ── TAB: EMPLOYEES ───────────────────────────────────────────────────────────

function EmployeesTab({ employees, locPerf, search, setSearch }) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return employees.filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.role_name || '').toLowerCase().includes(q) ||
      (e.node_name || '').toLowerCase().includes(q)
    )
  }, [employees, search])

  return (
    <div>
      {/* Location summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {locPerf.length === 0 && <EmptyState label="No locations in scope." />}
        {locPerf.map(loc => (
          <div key={loc.name} style={S.locSummaryCard}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {loc.name}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Staff</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>{loc.headcount}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>On Shift</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-success)' }}>{loc.onShift}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>DAs</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: loc.activeDAs > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{loc.activeDAs}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="All Employees" badge={`${filtered.length} OF ${employees.length}`}>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Filter by name, role, or location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INP, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <table style={S.table}>
          <thead>
            <tr>
              {['#', 'Name', 'Role', 'Location', 'Status', 'Actions'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, i) => (
              <tr key={emp.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                <td style={{ ...S.td, color: 'var(--t-text-faint)', fontSize: 10, width: 32 }}>{i + 1}</td>
                <td style={S.td}>
                  <span style={{ fontWeight: 700 }}>{emp.full_name}</span>
                </td>
                <td style={S.td}>
                  <span style={S.badge(
                    emp.role_name === 'Manager' ? 'var(--t-accent)'
                    : emp.role_name === 'Lead' ? 'var(--t-warn)'
                    : emp.role_name === 'Key Holder' ? '#7c3aed'
                    : 'var(--t-text-muted)'
                  )}>
                    {emp.role_name}
                  </span>
                </td>
                <td style={S.td}>{emp.node_name}</td>
                <td style={S.td}>
                  <span style={S.badge(emp.is_active ? 'var(--t-success)' : 'var(--t-danger)')}>
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={S.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <NavLink to={`/employees/${emp.id}`} style={{ ...GHOST_BTN, padding: '3px 8px', fontSize: 10 }}>View</NavLink>
                    <NavLink to={`/employees/${emp.id}/edit`} style={{ ...GHOST_BTN, padding: '3px 8px', fontSize: 10 }}>Edit</NavLink>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

// ── TAB: SCHEDULING ──────────────────────────────────────────────────────────

function SchedulingTab({ locPerf, coverageGrid, calloutLog }) {
  return (
    <div>
      {/* Coverage metrics — real on-shift vs headcount per location */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {locPerf.length === 0 && <EmptyState label="No coverage data for the current scope." />}
        {locPerf.map(loc => (
          <KpiTile
            key={loc.name}
            label={loc.name}
            value={`${loc.onShift}/${loc.headcount}`}
            sub={loc.callouts > 0 ? `${loc.callouts} callout${loc.callouts === 1 ? '' : 's'}` : 'Full coverage'}
            accent={loc.callouts > 0 ? 'var(--t-warn)' : 'var(--t-success)'}
          />
        ))}
      </div>

      <SectionCard title="Weekly Coverage Grid" badge="7-DAY VIEW">
        {coverageGrid.locations.length === 0
          ? <EmptyState label="No scheduled coverage found for the next 7 days." />
          : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ ...S.table, tableLayout: 'fixed', minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: 130 }}>Location</th>
                      {WEEK_DATES.map(d => (
                        <th key={d} style={{ ...S.th, textAlign: 'center' }}>
                          {DAY_LABELS[new Date(d + 'T00:00:00').getDay()]}
                          <div style={{ fontSize: 8, fontWeight: 600, color: 'var(--t-text-faint)' }}>{d.slice(5)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coverageGrid.locations.map(loc => (
                      <tr key={loc}>
                        <td style={{ ...S.td, fontWeight: 700, color: 'var(--t-accent)' }}>{loc}</td>
                        {WEEK_DATES.map(d => {
                          const cell = coverageGrid.cells[`${loc}|${d}`]
                          if (!cell) {
                            return (
                              <td key={d} style={{ padding: 0, borderBottom: '1px solid var(--t-line)' }}>
                                <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 12, color: 'var(--t-text-faint)', borderRight: '1px solid var(--t-line)' }}>—</div>
                              </td>
                            )
                          }
                          const ok = cell.scheduled >= Math.max(cell.required, COVERAGE_MIN)
                          return (
                            <td key={d} style={{ padding: 0, borderBottom: '1px solid var(--t-line)' }}>
                              <div style={S.coverageCell(ok ? COVERAGE_MIN + 1 : 0)}>
                                {cell.scheduled}{cell.required ? `/${cell.required}` : ''}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 10, color: 'var(--t-text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: 'rgba(34,197,94,0.4)' }} />
                  Adequate coverage (meets required)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: 'rgba(239,68,68,0.3)' }} />
                  Under-coverage (below required)
                </div>
              </div>
            </>
          )}
      </SectionCard>

      <SectionCard title="Callout & Coverage Log" badge={`${calloutLog.length} THIS WINDOW`}>
        {calloutLog.length === 0
          ? <EmptyState label="No callouts reported in this window." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Employee', 'Location', 'Date', 'Type', 'Covered By', 'Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calloutLog.map((c, i) => (
                  <tr key={c.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={S.td}>{c.employee}</td>
                    <td style={S.td}>{c.node}</td>
                    <td style={S.td}>{c.date}</td>
                    <td style={S.td}><span style={S.badge('var(--t-danger)')}>{c.type}</span></td>
                    <td style={S.td}>{c.covered_by || '—'}</td>
                    <td style={S.td}>
                      <span style={S.badge(c.covered ? 'var(--t-success)' : 'var(--t-warn)')}>
                        {c.covered ? 'Covered' : 'Gap'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SectionCard>
    </div>
  )
}

// ── TAB: POLICIES ────────────────────────────────────────────────────────────

function PoliciesTab({ das, fmla, policyStats }) {
  const openDAs = das.filter(d => d.status === 'open')
  const resolvedDAs = das.filter(d => d.status !== 'open')

  return (
    <div>
      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiTile label="Open DAs"        value={openDAs.length}   accent="var(--t-danger)" />
        <KpiTile label="FMLA Active"     value={fmla.length}      accent="var(--t-accent)" />
        <KpiTile label="Policy Sign-Offs" value={policyStats.total ? `${policyStats.signed}/${policyStats.total}` : '—'}
          sub={policyStats.total ? `${policyStats.total - policyStats.signed} pending` : 'no data'} accent="var(--t-warn)" />
        <KpiTile label="Resolved DAs"    value={resolvedDAs.length} accent="var(--t-success)" />
      </div>

      <SectionCard title="Active Disciplinary Actions" badge={`${openDAs.length} OPEN`}
        action={<NavLink to="/disciplinary/new" style={{ ...BTN, padding: '4px 12px', fontSize: 10 }}>+ Issue DA</NavLink>}>
        {das.length === 0
          ? <EmptyState label="No disciplinary actions on record for this scope." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Employee', 'Type', 'Reason', 'Location', 'Date Issued', 'Severity', 'Status', 'Action'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {das.map((da, i) => {
                  const sev = daSeverity(da.type)
                  return (
                    <tr key={da.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{da.person_name}</td>
                      <td style={S.td}>{da.type}</td>
                      <td style={S.td}>{da.description || '—'}</td>
                      <td style={S.td}>{da.node_name}</td>
                      <td style={S.td}>{da.issued_date}</td>
                      <td style={S.td}>
                        <span style={S.badge(severityColor(sev))}>{sev}</span>
                      </td>
                      <td style={S.td}>
                        <span style={S.badge(daStatusColor(da.status === 'open' ? 'Open' : da.status === 'resolved' ? 'Resolved' : 'Closed'))}>
                          {da.status}
                        </span>
                      </td>
                      <td style={S.td}>
                        <NavLink to={`/disciplinary/${da.id}`} style={{ ...GHOST_BTN, padding: '3px 8px', fontSize: 10 }}>View</NavLink>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </SectionCard>

      <SectionCard title="FMLA / Leave Tracker" badge={`${fmla.length} ACTIVE CASES`}>
        {fmla.length === 0
          ? <EmptyState label="No active leave cases for this scope." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Employee', 'Leave Type', 'Start Date', 'Expected Return', 'Actual Return', 'Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fmla.map((c, i) => (
                  <tr key={c.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{c.employeeName}</td>
                    <td style={S.td}>{c.type || '—'}</td>
                    <td style={S.td}>{c.startDate || '—'}</td>
                    <td style={S.td}>{c.expectedReturn || '—'}</td>
                    <td style={S.td}>{c.actualReturn || '—'}</td>
                    <td style={S.td}>
                      <span style={S.badge('var(--t-accent)')}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SectionCard>
    </div>
  )
}

// ── TAB: TRAINING ────────────────────────────────────────────────────────────

function TrainingTab({ trainingByLoc, certs, drills, trainingKpis }) {
  return (
    <div>
      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiTile label="Overall Completion" value={trainingKpis.total ? `${trainingKpis.overallPct}%` : '—'} accent={trainingPctColor(trainingKpis.overallPct)} />
        <KpiTile label="Employees Complete" value={trainingKpis.complete} sub={`out of ${trainingKpis.total}`} accent="var(--t-success)" />
        <KpiTile label="Expiring Certs"    value={certs.length}  accent="var(--t-warn)" />
        <KpiTile label="Upcoming Drills"   value={drills.length} accent="var(--t-accent)" />
        <KpiTile label="Overdue Modules"   value={trainingKpis.overdue} accent="var(--t-danger)" />
      </div>

      <SectionCard title="Completion by Location" badge={`${trainingByLoc.length} LOCATIONS`}>
        {trainingByLoc.length === 0
          ? <EmptyState label="No training records for this scope." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Location', 'Total Staff', 'Completed', '% Complete', 'Overdue Modules'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trainingByLoc.map((row, i) => (
                  <tr key={row.loc} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ ...S.td, fontWeight: 700, color: 'var(--t-accent)' }}>{row.loc}</td>
                    <td style={S.td}>{row.total}</td>
                    <td style={S.td}>{row.complete}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--t-line)', position: 'relative', maxWidth: 80 }}>
                          <div style={{
                            position: 'absolute', top: 0, left: 0, height: '100%', width: `${row.pct}%`,
                            background: trainingPctColor(row.pct), transition: 'width .3s',
                          }} />
                        </div>
                        <span style={{ fontWeight: 700, color: trainingPctColor(row.pct), fontSize: 12, minWidth: 34 }}>
                          {row.pct}%
                        </span>
                      </div>
                    </td>
                    <td style={S.td}>
                      {row.overdue > 0
                        ? <span style={S.badge('var(--t-danger)')}>{row.overdue} overdue</span>
                        : <span style={{ color: 'var(--t-text-muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SectionCard>

      <SectionCard title="Expiring Certifications" badge={`${certs.length} EXPIRING SOON`}>
        {certs.length === 0
          ? <EmptyState label="No certifications expiring soon." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Employee', 'Certification', 'Expiration Date', 'Location', 'Days Left', 'Action'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certs.map((cert, i) => (
                  <tr key={cert.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{cert.employee}</td>
                    <td style={S.td}>{cert.cert}</td>
                    <td style={S.td}>{cert.expiry || '—'}</td>
                    <td style={S.td}>{cert.location}</td>
                    <td style={S.td}>
                      {cert.days_left == null
                        ? <span style={{ color: 'var(--t-text-muted)' }}>—</span>
                        : <span style={S.badge(cert.days_left <= 7 ? 'var(--t-danger)' : cert.days_left <= 14 ? 'var(--t-warn)' : 'var(--t-accent)')}>
                            {cert.days_left}d
                          </span>}
                    </td>
                    <td style={S.td}>
                      <NavLink to="/training" style={{ ...GHOST_BTN, padding: '3px 8px', fontSize: 10 }}>Schedule Renewal</NavLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SectionCard>

      <SectionCard title="Upcoming Training Drills" badge={`${drills.length} SCHEDULED`}>
        {drills.length === 0
          ? <EmptyState label="No training drills scheduled." />
          : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['Training / Drill', 'Scheduled Date', 'Location', 'Mandatory', 'Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drills.map((drill, i) => (
                  <tr key={drill.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{drill.name}</td>
                    <td style={S.td}>{drill.date || '—'}</td>
                    <td style={S.td}>{drill.location}</td>
                    <td style={S.td}>
                      {drill.mandatory
                        ? <span style={S.badge('var(--t-danger)')}>MANDATORY</span>
                        : <span style={S.badge('var(--t-text-muted)')}>Optional</span>}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge('var(--t-accent)')}>Scheduled</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SectionCard>
    </div>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

const HR_EMP_COLS = [
  { key: 'full_name', label: 'Employee', value: r => r.full_name },
  { key: 'role_name', label: 'Role', value: r => r.role_name },
  { key: 'node_name', label: 'Location', value: r => r.node_name },
  { key: 'reason', label: 'Note', value: r => r.reason || (r.is_active ? 'Active' : 'Inactive') },
]
const HR_DA_COLS = [
  { key: 'emp', label: 'Employee', value: r => r.emp },
  { key: 'type', label: 'Type', value: r => r.type },
  { key: 'reason', label: 'Reason', value: r => r.reason },
  { key: 'loc', label: 'Location', value: r => r.loc },
  { key: 'date', label: 'Date', value: r => r.date },
  { key: 'severity', label: 'Severity', value: r => r.severity },
  { key: 'status', label: 'Status', value: r => r.status },
]
const HR_PTO_COLS = [
  { key: 'full_name', label: 'Employee', value: r => r.full_name },
  { key: 'type', label: 'Type', value: r => r.type },
  { key: 'dates', label: 'Dates', value: r => r.dates },
  { key: 'node_name', label: 'Location', value: r => r.node_name },
  { key: 'status', label: 'Status', value: r => r.status },
]
const HR_TRAIN_COLS = [
  { key: 'full_name', label: 'Employee', value: r => r.full_name },
  { key: 'node_name', label: 'Location', value: r => r.node_name },
  { key: 'pct', label: 'Training %', value: r => `${r.pct}%`, align: 'right', sortKey: r => r.pct },
  { key: 'complete', label: 'Complete', value: r => r.complete ? '✓' : '—' },
]
const HR_COMPLIANCE_COLS = [
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'compliance', label: 'Compliance %', value: r => `${r.compliance}%`, align: 'right', sortKey: r => r.compliance },
  { key: 'training', label: 'Training %', value: r => `${r.training}%`, align: 'right', sortKey: r => r.training },
  { key: 'headcount', label: 'Headcount', value: r => r.headcount, align: 'right', sortKey: r => r.headcount },
]

// ── REAL-DATA HELPERS ─────────────────────────────────────────────────────────

const arr = (v) => (Array.isArray(v) ? v : [])
const isoDay = (v) => String(v ?? '').slice(0, 10)
const normName = (s) => String(s ?? '').trim().toLowerCase()

// A training-overview row's certification is "current" unless it is expired/overdue.
const CERT_LAPSED = /^(expired|overdue)$/i
const CERT_SOON = /^(expiring soon|due soon|expiring)$/i

export default function HRDashboard() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const person = session?.person ?? { id: null, full_name: 'Admin', role_name: 'Admin' }
  const nodeIds = useMemo(() => (locationIds?.length ? locationIds : null), [locationIds])

  const [activeTab,  setActiveTab]  = useState('overview')
  const [loaded,     setLoaded]     = useState(false)
  const [loadErr,    setLoadErr]    = useState('')
  const [dateFrom,   setDateFrom]   = useState(MONTH_AGO)
  const [dateTo,     setDateTo]     = useState(TODAY)
  const [search,     setSearch]     = useState('')
  const [empId,      setEmpId]      = useState('')
  const [locFilter,  setLocFilter]  = useState('All')
  const [drill,      setDrill]      = useState(null)

  // ── raw live payloads (all real; empty until first load resolves) ──
  const [raw, setRaw] = useState({
    roster: [], shifts: [], punches: [], overview: [], das: [],
    pending: {}, hr: {}, gaps: [], callouts: [], fmla: [], training: [], hires: [],
  })

  const load = useCallback(async () => {
    const wkStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const results = await Promise.allSettled([
      sb.rpc('get_roster',                { p_node_ids: nodeIds, p_actor: person.id || null }),          // 0
      sb.rpc('scope_shifts',              { p_node_ids: nodeIds, p_actor: person.id || null }),          // 1
      sb.rpc('get_all_time_entries',      { p_node_ids: nodeIds, p_date_from: wkStart, p_date_to: TODAY }), // 2
      sb.rpc('get_attendance_overview',   { p_node_ids: nodeIds }),                                       // 3
      sb.rpc('get_disciplinary_actions',  { p_node_ids: nodeIds }),                                       // 4
      sb.rpc('get_pending_requests',      { p_node_ids: nodeIds }),                                       // 5
      sb.rpc('hr_dashboard',              { p_node_ids: nodeIds }),                                       // 6
      sb.rpc('get_coverage_gaps',         { p_node_ids: nodeIds, p_date_from: TODAY, p_date_to: WEEK_END }), // 7
      sb.rpc('forensic_callouts',         { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }), // 8
      sb.rpc('fmla_cases',                { p_node_ids: nodeIds }),                                       // 9
      sb.rpc('get_training_overview',     { p_node_ids: nodeIds }),                                       // 10
      sb.rpc('get_hires_list',            { p_node_ids: nodeIds }),                                       // 11
    ])
    const val = (i, key) => {
      const r = results[i]
      if (r.status !== 'fulfilled' || r.value?.error) return null
      return key ? (r.value.data?.[key]) : r.value.data
    }
    const anyOk = results.some(r => r.status === 'fulfilled' && !r.value?.error)
    const allFail = results.every(r => r.status !== 'fulfilled' || r.value?.error)
    setRaw({
      roster:   arr(val(0)),
      shifts:   arr(val(1)),
      punches:  arr(val(2)),
      overview: arr(val(3)),
      das:      arr(val(4)),
      pending:  (val(5) && typeof val(5) === 'object') ? val(5) : {},
      hr:       (val(6) && typeof val(6) === 'object') ? val(6) : {},
      gaps:     arr(val(7)),
      callouts: arr(val(8)),
      fmla:     arr(val(9)),
      training: arr(val(10)),
      hires:    arr(val(11)),
    })
    setLoadErr(allFail ? 'Could not reach the HR backend. Showing no data.' : '')
    setLoaded(anyOk)
  }, [nodeIds, person.id, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // ── DERIVED, ALL-REAL VIEW MODELS ──
  const model = useMemo(() => {
    const emps = raw.roster.map(normEmployee)
    const empById = {}; emps.forEach(e => { if (e.id) empById[e.id] = e })
    const empByName = {}; emps.forEach(e => { empByName[normName(e.full_name)] = e })

    // clocked-in-now from real punches (open punch today)
    const inNow = new Set()
    for (const te of raw.punches) {
      if (te?.person_id && te.punched_in_at && !te.punched_out_at && isoDay(te.work_date || te.punched_in_at) === TODAY)
        inNow.add(te.person_id)
    }

    // attendance incidents → callouts today / 30d, per person + location events
    const calloutTodayEmps = []
    const calloutEvents30 = {}
    for (const r of raw.overview) {
      const pid = r.person_id; if (!pid) continue
      let coToday = false
      for (const inc of arr(r.incidents)) {
        if (inc.expired) continue
        const dt = isoDay(inc.date)
        if (inc.type === 'callout') {
          calloutEvents30[pid] = (calloutEvents30[pid] || 0) + 1
          if (dt === TODAY) coToday = true
        }
      }
      if (coToday) {
        const e = empById[pid] || empByName[normName(r.full_name)]
        calloutTodayEmps.push({
          id: pid, full_name: r.full_name || e?.full_name || '—',
          role_name: e?.role_name || '—', node_name: r.location || e?.node_name || '—',
          reason: 'Called out today', is_active: true,
        })
      }
    }

    // disciplinary
    const daRows = raw.das.map(d => ({
      id: d.id, person_id: d.person_id, person_name: d.person_name || '—',
      type: d.type || '—', description: d.description || '', node_name: d.node_name || '—',
      issued_date: isoDay(d.issued_date) || '—', status: d.status || 'open',
    }))
    const openDAs = daRows.filter(d => d.status === 'open')

    // pending PTO
    const ptoAll = arr(raw.pending.time_off)
    const ptoRows = ptoAll.map(r => ({
      id: r.id, full_name: r.person_name || r.full_name || '—', type: r.type || '—',
      dates: `${isoDay(r.start_date)}${r.end_date ? ' → ' + isoDay(r.end_date) : ''}`,
      node_name: r.node_name || '—', status: r.status || 'pending',
    }))

    // new hires (last 30 days)
    const hires = raw.hires.map(h => ({
      id: h.id ?? h.person_id,
      full_name: h.full_name || '—', role_name: h.role || h.role_name || '—',
      node_name: h.location || h.node_name || '—',
      hire_date: isoDay(h.start_date || h.hire_date), is_active: true,
    })).filter(h => !h.hire_date || h.hire_date >= MONTH_AGO)

    // ── training: per-person + per-location from get_training_overview ──
    const byPerson = {}
    for (const t of raw.training) {
      const pid = t.person_id || normName(t.full_name || t.employee)
      if (!pid) continue
      const p = byPerson[pid] || (byPerson[pid] = {
        person_id: t.person_id || null,
        full_name: t.full_name || t.employee || '—',
        node_name: t.location || t.node_name || (empById[t.person_id]?.node_name) || '—',
        total: 0, valid: 0, overdue: 0,
      })
      p.total++
      if (CERT_LAPSED.test(t.cert_status || '')) p.overdue++
      else p.valid++
    }
    const trainingPerPerson = Object.values(byPerson).map(p => ({
      full_name: p.full_name, node_name: p.node_name,
      pct: p.total ? Math.round((p.valid / p.total) * 100) : 0,
      complete: p.total > 0 && p.overdue === 0,
    }))

    // per-location training aggregation
    const locTrain = {}
    for (const p of Object.values(byPerson)) {
      const k = p.node_name || '—'
      const lt = locTrain[k] || (locTrain[k] = { loc: k, total: 0, complete: 0, overdue: 0 })
      lt.total++
      if (p.overdue === 0) lt.complete++
      lt.overdue += p.overdue
    }
    const trainingByLoc = Object.values(locTrain).map(lt => ({
      ...lt, pct: lt.total ? Math.round((lt.complete / lt.total) * 100) : 0,
    })).sort((a, b) => a.loc.localeCompare(b.loc))

    // hr_dashboard authoritative aggregates
    const hr = raw.hr || {}
    const headcount = Number(hr.headcount ?? emps.length) || emps.length
    const trComplete = Number(hr.training_complete ?? 0)
    const trOverdue = Number(hr.training_overdue ?? 0)
    const overallPct = headcount > 0
      ? Math.round((trComplete / headcount) * 100)
      : (trainingPerPerson.length ? Math.round(trainingPerPerson.filter(p => p.complete).length / trainingPerPerson.length * 100) : 0)
    const trainingKpis = { total: headcount, complete: trComplete || trainingPerPerson.filter(p => p.complete).length, overallPct, overdue: trOverdue }

    // expiring certifications (real cert rows with an expiry date, soon/lapsed)
    const certs = raw.training
      .filter(t => t.cert_expires && (CERT_SOON.test(t.cert_status || '') || CERT_LAPSED.test(t.cert_status || '')))
      .map((t, i) => {
        const exp = isoDay(t.cert_expires)
        const daysLeft = exp ? Math.round((new Date(exp + 'T00:00:00').getTime() - Date.now()) / 86400000) : null
        return {
          id: t.id ?? `${t.person_id || ''}-${t.module || i}`,
          employee: t.full_name || t.employee || '—', cert: t.module || t.competency || '—',
          expiry: exp || '—', location: t.location || t.node_name || '—',
          days_left: daysLeft, status: t.cert_status || '',
        }
      })
      .sort((a, b) => (a.days_left ?? 1e9) - (b.days_left ?? 1e9))

    // FMLA / leave — active cases
    const fmla = raw.fmla
      .filter(c => String(c.status || '').toUpperCase() === 'ACTIVE')
      .map(c => ({
        id: c.id, employeeName: c.employeeName || c.full_name || '—', type: c.type || c.leave_type || '—',
        startDate: isoDay(c.startDate || c.start_date), expectedReturn: isoDay(c.expectedReturn || c.expected_return),
        actualReturn: isoDay(c.actualReturn || c.actual_return), status: c.status || 'ACTIVE',
      }))

    // policy sign-offs from docs pending acknowledgement
    const docsPending = Number(hr.docs_pending_ack ?? 0)
    const policyStats = { total: headcount, signed: Math.max(0, headcount - docsPending) }

    // ── per-location performance (Overview + Scheduling) ──
    const locNames = locations?.length
      ? locations.map(l => l.name)
      : Array.from(new Set(emps.map(e => e.node_name).filter(n => n && n !== '—')))
    const trainByLocPct = {}; trainingByLoc.forEach(t => { trainByLocPct[t.loc] = t.pct })
    const locPerf = locNames.map(name => {
      const locEmps = emps.filter(e => e.node_name === name)
      const onShift = locEmps.filter(e => inNow.has(e.id)).length
      const callouts = calloutTodayEmps.filter(c => c.node_name === name).length
      const activeDAs = openDAs.filter(d => d.node_name === name).length
      return { name, headcount: locEmps.length, onShift, callouts, activeDAs, compliance: trainByLocPct[name] ?? 0 }
    })

    // ── weekly coverage grid from real scheduled shifts ──
    const cells = {}
    const gridLocs = new Set()
    for (const s of raw.shifts) {
      const d = isoDay(s.shift_date)
      if (!WEEK_DATES.includes(d)) continue
      const loc = s.node_name || empById[s.person_id]?.node_name || '—'
      if (loc === '—') continue
      gridLocs.add(loc)
      const key = `${loc}|${d}`
      const cell = cells[key] || (cells[key] = { scheduled: 0, required: 0 })
      cell.scheduled++
    }
    const coverageGrid = { locations: Array.from(gridLocs).sort(), cells }

    // callout / coverage log from forensic_callouts
    const calloutLog = raw.callouts.map((c, i) => ({
      id: c.id ?? i, employee: c.employee || '—', node: c.node || '—', date: isoDay(c.date),
      type: (c.type || 'callout').replace(/_/g, ' '), covered_by: c.covered_by || null, covered: !!c.covered,
    }))

    // ── activity feed (real punches today + DAs issued today + callouts + gaps) ──
    const nodeNameById = {}; emps.forEach(e => { if (e.node_id) nodeNameById[e.node_id] = e.node_name })
    const activity = []
    for (const te of raw.punches) {
      if (!te?.person_id || isoDay(te.work_date || te.punched_in_at) !== TODAY) continue
      const e = empById[te.person_id]
      const loc = nodeNameById[te.node_id] || e?.node_name || '—'
      if (te.punched_in_at)
        activity.push({ ts: new Date(te.punched_in_at), type: 'success', icon: '⏱', desc: `Clocked in at ${loc}`, emp: e?.full_name || 'Employee', ago: timeAgo(te.punched_in_at) })
      if (te.punched_out_at)
        activity.push({ ts: new Date(te.punched_out_at), type: 'accent', icon: '⏱', desc: `Clocked out at ${loc}`, emp: e?.full_name || 'Employee', ago: timeAgo(te.punched_out_at) })
    }
    for (const d of daRows.filter(r => r.issued_date === TODAY))
      activity.push({ ts: null, type: 'danger', icon: 'DA', desc: `Disciplinary action issued (${d.type})`, emp: d.person_name, ago: 'today' })
    for (const c of calloutTodayEmps)
      activity.push({ ts: null, type: 'danger', icon: '!', desc: `Called out — needs coverage (${c.node_name})`, emp: c.full_name, ago: 'today' })
    activity.sort((a, b) => (b.ts?.getTime() || 0) - (a.ts?.getTime() || 0))
    const activityTop = activity.slice(0, 12)

    // ── alerts (each backed by real rows) ──
    const gapRows = raw.gaps.filter(g => (g.status || '') !== 'filled')
    const alerts = [
      ...calloutTodayEmps.slice(0, 4).map(c => ({ level: 'danger', label: 'Callout', loc: c.node_name, desc: `${c.full_name} called out today — needs coverage.` })),
      ...gapRows.slice(0, 4).map(g => ({ level: 'warn', label: 'Coverage Gap', loc: g.location || g.node || '—', desc: `${g.shift || 'Shift'} uncovered${g.urgency ? ` · ${g.urgency}` : ''}.` })),
      ...(ptoRows.length > 3 ? [{ level: 'warn', label: 'PTO Backlog', loc: 'All', desc: `${ptoRows.length} time-off requests awaiting review.` }] : []),
      ...(trOverdue > 0 ? [{ level: 'warn', label: 'Training Overdue', loc: 'All', desc: `${trOverdue} employee${trOverdue === 1 ? '' : 's'} with overdue training.` }] : []),
      ...(openDAs.length > 0 ? [{ level: 'danger', label: 'Open DAs', loc: 'All', desc: `${openDAs.length} open disciplinary action${openDAs.length === 1 ? '' : 's'} require review.` }] : []),
      ...(docsPending > 0 ? [{ level: 'warn', label: 'Policy Sign-Offs', loc: 'All', desc: `${docsPending} document acknowledgement${docsPending === 1 ? '' : 's'} pending.` }] : []),
    ]

    const onShiftEmps = emps.filter(e => inNow.has(e.id))
    const overallCompliance = locPerf.length
      ? Math.round(locPerf.reduce((s, l) => s + (l.compliance || 0), 0) / locPerf.length)
      : overallPct

    return {
      emps, onShiftEmps, calloutTodayEmps, openDAs, daRows, ptoRows, hires,
      trainingPerPerson, trainingByLoc, trainingKpis, certs, fmla, policyStats,
      locPerf, coverageGrid, calloutLog, activity: activityTop, alerts, locNames,
      overallCompliance, headcount: emps.length,
    }
  }, [raw, locations])

  // employee list for the Employees tab (respects header/local filters)
  const displayedEmployees = useMemo(() => {
    let list = model.emps
    if (locFilter !== 'All') list = list.filter(e => e.node_name === locFilter)
    if (empId.trim()) list = list.filter(e => String(e.id || '').toLowerCase().includes(empId.toLowerCase()))
    return list
  }, [model.emps, locFilter, empId])

  // drill-down row shapes (all real)
  const daDrillRows = useMemo(() => model.openDAs.map(d => ({
    emp: d.person_name, type: d.type, reason: d.description || '—', loc: d.node_name,
    date: d.issued_date, severity: daSeverity(d.type), status: d.status,
  })), [model.openDAs])
  const complianceDrillRows = useMemo(() => model.locPerf.map(l => ({
    location: l.name, compliance: l.compliance, training: l.compliance, headcount: l.headcount,
  })), [model.locPerf])

  const TABS = [
    { id: 'overview',    label: 'Overview' },
    { id: 'employees',   label: 'Employees' },
    { id: 'scheduling',  label: 'Scheduling' },
    { id: 'policies',    label: 'Policies' },
    { id: 'training',    label: 'Training' },
  ]

  return (
    <div style={S.page}>
      <PageHeader
        title="HR / CEO Command Center"
        sub={`Logged in as ${person.full_name} · ${person.role_name} · ${TODAY}`}
        isLive={loaded && !loadErr}
      >
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={S.select}>
          <option value="All">All Locations</option>
          {model.locNames.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INP} />
        <span style={{ fontSize: 10, color: 'var(--t-text-muted)', alignSelf: 'center' }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INP} />
        <button style={BTN} onClick={load}>↺ Refresh</button>
      </PageHeader>

      {loadErr && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', borderLeft: '3px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
          {loadErr}
        </div>
      )}

      <QuickLinks links={[
        { label: 'Employees',    to: '/employees' },
        { label: 'Scheduling',   to: '/scheduling' },
        { label: 'PTO Requests', to: '/pto-requests' },
        { label: 'Disciplinary', to: '/disciplinary' },
        { label: 'Training',     to: '/training' },
        { label: 'Reports',      to: '/reports' },
        { label: 'Attendance',   to: '/attendance' },
        { label: 'Payroll',      to: '/payroll' },
      ]} />

      {/* KPI BAR — 8 tiles, all drillable to real source records */}
      <div style={S.kpiBar}>
        <KpiTile label="Total Headcount"   value={model.headcount} sub={`${model.locNames.length} location${model.locNames.length === 1 ? '' : 's'}`} accent="var(--t-accent)"
          onClick={()=>setDrill({title:'Total Headcount',subtitle:`${model.headcount} employees`,accent:'var(--t-accent)',columns:HR_EMP_COLS,rows:model.emps})} />
        <KpiTile label="On Shift Now"      value={model.onShiftEmps.length}  sub="clocked in now"   accent="var(--t-success)"
          onClick={()=>setDrill({title:'On Shift Now',subtitle:`${model.onShiftEmps.length} clocked in`,accent:'var(--t-success)',columns:HR_EMP_COLS,rows:model.onShiftEmps})} />
        <KpiTile label="Callouts Today"    value={model.calloutTodayEmps.length}  sub="needs coverage"     accent="var(--t-danger)"
          onClick={()=>setDrill({title:'Callouts Today',subtitle:`${model.calloutTodayEmps.length} called out`,accent:'var(--t-danger)',columns:HR_EMP_COLS,rows:model.calloutTodayEmps})} />
        <KpiTile label="Active DAs"        value={model.openDAs.length}  sub={`${daDrillRows.filter(d=>d.severity==='High').length} high severity`} accent="var(--t-danger)"
          onClick={()=>setDrill({title:'Active Disciplinary Actions',subtitle:`${model.openDAs.length} open`,accent:'var(--t-danger)',columns:HR_DA_COLS,rows:daDrillRows})} />
        <KpiTile label="New Hires 30d"     value={model.hires.length}  sub="last 30 days"   accent="var(--t-success)"
          onClick={()=>setDrill({title:'New Hires — Last 30 Days',subtitle:`${model.hires.length} new hires`,accent:'var(--t-success)',columns:HR_EMP_COLS,rows:model.hires})} />
        <KpiTile label="PTO Pending"       value={model.ptoRows.length}  sub="awaiting approval"   accent="var(--t-warn)"
          onClick={()=>setDrill({title:'PTO Pending Approval',subtitle:`${model.ptoRows.length} requests`,accent:'var(--t-warn)',columns:HR_PTO_COLS,rows:model.ptoRows})} />
        <KpiTile label="Training Complete" value={`${model.trainingKpis.overallPct}%`}   sub={`${model.trainingKpis.complete} of ${model.trainingKpis.total}`} accent="var(--t-success)"
          onClick={()=>setDrill({title:'Training Compliance',subtitle:`${model.trainingKpis.complete}/${model.trainingKpis.total} complete`,accent:'var(--t-success)',columns:HR_TRAIN_COLS,rows:model.trainingPerPerson})} />
        <KpiTile label="Compliance Score"  value={`${model.overallCompliance}%`}   sub="training-current, by location"     accent={complianceColor(model.overallCompliance)}
          onClick={()=>setDrill({title:'Compliance by Location',subtitle:`${model.locNames.length} locations`,accent:'var(--t-success)',columns:HR_COMPLIANCE_COLS,rows:complianceDrillRows})} />
      </div>

      {/* TAB BAR */}
      <div style={S.tabBar}>
        {TABS.map(tab => (
          <button key={tab.id} style={S.tabBtn(activeTab === tab.id)} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT — all fed with real, derived view models */}
      {activeTab === 'overview'   && <OverviewTab locPerf={model.locPerf} activity={model.activity} alerts={model.alerts} />}
      {activeTab === 'employees'  && <EmployeesTab employees={displayedEmployees} locPerf={model.locPerf} search={search} setSearch={setSearch} />}
      {activeTab === 'scheduling' && <SchedulingTab locPerf={model.locPerf} coverageGrid={model.coverageGrid} calloutLog={model.calloutLog} />}
      {activeTab === 'policies'   && <PoliciesTab das={model.daRows} fmla={model.fmla} policyStats={model.policyStats} />}
      {activeTab === 'training'   && <TrainingTab trainingByLoc={model.trainingByLoc} certs={model.certs} drills={[]} trainingKpis={model.trainingKpis} />}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
