import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import DrillDown from '../components/DrillDown.jsx'
import { companyName } from '../lib/config.js'

// ─── constants ────────────────────────────────────────────────────────────────
// Location / role filter options are derived from the LIVE roster at runtime
// (see `locOptions` / `roleOptions` in the main component) — never hardcoded.
const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'attendance',   label: 'Attendance' },
  { id: 'timeoff',      label: 'Time Off' },
  { id: 'training',     label: 'Training' },
  { id: 'performance',  label: 'Performance' },
  { id: 'disciplinary', label: 'Disciplinary' },
  { id: 'payroll',      label: 'Payroll / Hours' },
  { id: 'ct_paid_leave',label: 'CT Paid Leave' },
]

// ─── access control ───────────────────────────────────────────────────────────
function isHRRole(role_name) {
  if (!role_name) return false
  const r = role_name.toLowerCase()
  return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(k => r.includes(k))
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const pct = (a, b) => (!b ? 0 : Math.round((a / b) * 100))
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)) }

function isoDate(d) { return d.toISOString().slice(0, 10) }

function daysAgoFrom(dateStr) {
  if (!dateStr) return 9999
  const t = new Date(String(dateStr).slice(0, 10) + 'T00:00:00').getTime()
  if (!Number.isFinite(t)) return 9999
  return Math.floor((Date.now() - t) / 86400000)
}

function titleCase(s) {
  const v = String(s ?? '').trim()
  if (!v) return '—'
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function defaultDateFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return isoDate(d)
}

function defaultDateTo() { return isoDate(new Date()) }

// Honest-empty dataset — nothing here is invented; all keys start empty and are
// populated exclusively from real RPCs in fetchData().
function emptyData() {
  return {
    employees: [], trainingCourses: [],
    attendance: [], calloutLog: [], lateLog: [], timeOff: [],
    trainingMatrix: [], performance: [], disciplinary: [], payroll: [],
    ctLeave: [], locStats: [], roleStats: [], recentActivity: [],
  }
}

function exportCSV(rows, filename) {
  if (!rows || !rows.length) return
  const keys = Object.keys(rows[0])
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(',')),
  ].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// real .xls (Excel opens native HTML-table format) — no dependency
function exportXLS(rows, filename) {
  if (!rows || !rows.length) return
  const keys = Object.keys(rows[0])
  const th = keys.map(k => `<th style="background:#0b2545;color:#fff;padding:6px 10px;text-align:left">${esc(k)}</th>`).join('')
  const trs = rows.map(r => `<tr>${keys.map(k => `<td style="padding:5px 10px">${esc(r[k])}</td>`).join('')}</tr>`).join('')
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0"><tr>${th}</tr>${trs}</table></body></html>`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }))
  a.download = filename; a.click()
}
// branded board-pack → browser print (Save as PDF = real PDF)
function printReport(title, rows) {
  if (!rows || !rows.length) return
  const keys = Object.keys(rows[0])
  const th = keys.map(k => `<th>${esc(k)}</th>`).join('')
  const trs = rows.map(r => `<tr>${keys.map(k => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('')
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${companyName()} — ${esc(title)}</title>
    <style>@page{margin:16mm}body{font-family:Arial,sans-serif;color:#111}
    .hdr{border-bottom:3px solid #00b4d8;padding-bottom:8px;margin-bottom:14px}
    .brand{font-size:20px;font-weight:900}.sub{color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#0b2545;color:#fff;text-align:left;padding:7px 9px}
    td{padding:6px 9px;border-bottom:1px solid #ddd}</style></head>
    <body><div class="hdr"><div class="brand">{companyName()} — ${esc(title)}</div>
    <div class="sub">${rows.length} records · Generated ${new Date().toLocaleString()}</div></div>
    <table><tr>${th}</tr>${trs}</table></body></html>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 350)
}

const distinct = (rows, key) => Array.from(new Set((rows || []).map(r => r[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)))

// ─── sub-components ───────────────────────────────────────────────────────────

function RateBar({ rate }) {
  const bg = rate >= 90 ? 'var(--t-success)' : rate >= 75 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--t-line)', borderRadius: 3, position: 'relative', minWidth: 60 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${clamp(rate, 0, 100)}%`, background: bg, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: bg, minWidth: 34, textAlign: 'right' }}>{rate}%</span>
    </div>
  )
}

function KpiTile({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 140, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, color: 'var(--t-text-faint)', fontSize: 13 }}>
      Loading…
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 50, gap: 8, color: 'var(--t-text-faint)' }}>
      <div style={{ fontSize: 30, opacity: 0.6 }}>📭</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>No records</div>
      <div style={{ fontSize: 12.5, textAlign: 'center', maxWidth: 360, lineHeight: 1.5 }}>{label}</div>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      {title && (
        <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)' }}>
          {title}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  )
}

function useSortable(rows, defaultKey, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  const toggle = (k) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!rows) return []
    return [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      if (av == null) return 1; if (bv == null) return -1
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const TH = ({ k, label, right }) => (
    <th
      onClick={() => toggle(k)}
      style={{
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        padding: '10px 12px', textAlign: right ? 'right' : 'left',
        fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)',
        textTransform: 'uppercase', letterSpacing: 0.5,
        borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)',
      }}
    >
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
  return { sorted, TH }
}

const TD = ({ children, right, bold, color, nowrap, style: extra }) => (
  <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', color: color || 'var(--t-text)', textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : 400, whiteSpace: nowrap ? 'nowrap' : 'normal', ...extra }}>
    {children}
  </td>
)

function Stars({ score }) {
  const s = Number(score) || 0
  const full = Math.floor(s)
  const half = s - full >= 0.5
  const color = s >= 4.5 ? 'var(--t-success)' : s >= 3.5 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13 }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))} {s.toFixed(1)}
    </span>
  )
}

function Badge({ children, color }) {
  const bg = {
    green: 'var(--t-success)', red: 'var(--t-danger)',
    amber: 'var(--t-warn)', blue: 'var(--t-accent)',
  }[color] || color || 'var(--t-text-faint)'
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: bg + '22', color: bg }}>
      {children}
    </span>
  )
}

// ─── access restricted ────────────────────────────────────────────────────────
function AccessRestricted() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, gap: 16, color: 'var(--t-text-faint)' }}>
      <div style={{ fontSize: 52 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>Access Restricted</div>
      <div style={{ fontSize: 14, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
        Reports are available to managers and HR staff only.<br />
        Contact your administrator to request access.
      </div>
    </div>
  )
}

// ─── TAB: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  if (loading) return <Spinner />
  const { locStats = [], roleStats = [], recentActivity = [] } = data
  const att = filtered.attendance
  const totalHrs = round1(filtered.payroll.reduce((s, r) => s + r.totalHrs, 0))
  const otHrs = round1(filtered.payroll.reduce((s, r) => s + r.overtimeHrs, 0))
  const avgHrs = filtered.payroll.length ? Math.round(totalHrs / filtered.payroll.length) : 0
  const avgAtt = att.length ? Math.round(att.reduce((s, r) => s + r.attendanceRate, 0) / att.length) : 0
  const totalCallouts = att.reduce((s, r) => s + r.callouts, 0)
  const trainingRows = filtered.trainingMatrix
  const avgTraining = trainingRows.length ? Math.round(trainingRows.reduce((s, r) => s + r.completionRate, 0) / trainingRows.length) : 0
  const openIncidents = filtered.disciplinary.filter(d => d.status === 'Open').length

  const ATT_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'scheduled', label: 'Scheduled', value: r => r.scheduled, align: 'right', sortKey: r => r.scheduled },
    { key: 'present', label: 'Present', value: r => r.present, align: 'right', sortKey: r => r.present },
    { key: 'callouts', label: 'Callouts', value: r => r.callouts, align: 'right', sortKey: r => r.callouts },
    { key: 'attendanceRate', label: 'Rate', value: r => `${r.attendanceRate}%`, align: 'right', sortKey: r => r.attendanceRate },
  ]
  const PAY_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'totalHrs', label: 'Total Hrs', value: r => `${r.totalHrs}h`, align: 'right', sortKey: r => r.totalHrs },
    { key: 'overtimeHrs', label: 'OT Hrs', value: r => `${r.overtimeHrs}h`, align: 'right', sortKey: r => r.overtimeHrs },
    { key: 'totalPay', label: 'Total Pay', value: r => fmt$(r.totalPay), align: 'right', sortKey: r => r.totalPay },
  ]
  const TRN_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'completed', label: 'Completed', value: r => `${r.completed}/${r.assigned}`, align: 'right', sortKey: r => r.completed },
    { key: 'completionRate', label: 'Compliance', value: r => `${r.completionRate}%`, align: 'right', sortKey: r => r.completionRate },
  ]
  const DA_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'type', label: 'Type', value: r => r.type },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'severity', label: 'Severity', value: r => r.severity },
    { key: 'status', label: 'Status', value: r => r.status },
    { key: 'manager', label: 'Manager', value: r => r.manager },
  ]
  const CO_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'reason', label: 'Reason', value: r => r.reason },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const openDrill = (title, columns, rows, accent) => setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI row 1 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Total Active Employees" value={att.length} sub="In filtered scope"
          onClick={() => openDrill('Active Employees', ATT_COLS, att, 'var(--t-accent)')} />
        <KpiTile label="Total Hours This Period" value={`${totalHrs}h`} sub="Clocked hours"
          onClick={() => openDrill('Hours by Employee', PAY_COLS, filtered.payroll, 'var(--t-accent)')} />
        <KpiTile label="Avg Hours / Employee" value={`${avgHrs}h`} sub="This period"
          onClick={() => openDrill('Hours by Employee', PAY_COLS, filtered.payroll, 'var(--t-accent)')} />
        <KpiTile label="OT Hours" value={`${otHrs}h`} sub="Overtime this period" color={otHrs > 40 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Overtime by Employee', PAY_COLS, filtered.payroll.filter(r => r.overtimeHrs > 0), 'var(--t-warn)')} />
      </div>
      {/* KPI row 2 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Callouts This Period" value={totalCallouts} sub="Across all employees" color={totalCallouts > 8 ? 'var(--t-danger)' : 'var(--t-text)'}
          onClick={() => openDrill('Callout Log', CO_COLS, filtered.calloutLog, 'var(--t-danger)')} />
        <KpiTile label="Attendance Rate" value={`${avgAtt}%`} sub="Average this period" color={avgAtt >= 90 ? 'var(--t-success)' : avgAtt >= 75 ? 'var(--t-warn)' : 'var(--t-danger)'}
          onClick={() => openDrill('Attendance by Employee', ATT_COLS, att, 'var(--t-success)')} />
        <KpiTile label="Training Compliance" value={`${avgTraining}%`} sub="Avg completion rate" color={avgTraining >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill('Training Compliance by Employee', TRN_COLS, trainingRows, 'var(--t-success)')} />
        <KpiTile label="Open Incidents" value={openIncidents} sub="Disciplinary actions" color={openIncidents > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          onClick={() => openDrill('Open Disciplinary Actions', DA_COLS, filtered.disciplinary.filter(d => d.status === 'Open'), 'var(--t-danger)')} />
      </div>

      {/* Location breakdown */}
      <SectionCard title="Location Breakdown">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Location', 'Headcount', 'Total Hours', 'OT Hours', 'Callouts', 'Attendance Rate'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locStats.map(loc => (
              <tr key={loc.location}>
                <TD bold>{loc.location}</TD>
                <TD>{loc.headcount}</TD>
                <TD>{loc.totalHrs}h</TD>
                <TD color={loc.otHrs > 10 ? 'var(--t-warn)' : 'var(--t-text)'}>{loc.otHrs}h</TD>
                <TD color={loc.callouts > 3 ? 'var(--t-danger)' : 'var(--t-text)'}>{loc.callouts}</TD>
                <TD style={{ minWidth: 160 }}><RateBar rate={loc.attendanceRate} /></TD>
              </tr>
            ))}
            {locStats.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No location data in this scope</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Role breakdown */}
      <SectionCard title="Role Breakdown">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Role', 'Count', 'Avg Hours', 'Callout Rate'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roleStats.map(r => (
              <tr key={r.role}>
                <TD bold>{r.role}</TD>
                <TD>{r.count}</TD>
                <TD>{r.avgHours}h</TD>
                <TD color={r.calloutRate >= 1 ? 'var(--t-warn)' : 'var(--t-success)'}>{r.calloutRate} avg</TD>
              </tr>
            ))}
            {roleStats.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No role data in this scope</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Recent activity feed */}
      <SectionCard title="Recent Activity">
        <div style={{ padding: '4px 0' }}>
          {recentActivity.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ev.severity === 'danger' ? 'var(--t-danger)' : ev.severity === 'warn' ? 'var(--t-warn)' : 'var(--t-success)' }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--t-text)' }}>{ev.text}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>{ev.date}</div>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No recent activity in this scope</div>
          )}
        </div>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Attendance ──────────────────────────────────────────────────────────
function AttendanceTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const { calloutLog = [], lateLog = [] } = data
  const att = filtered.attendance

  const totalCallouts = att.reduce((s, r) => s + r.callouts, 0)
  const totalLate = att.reduce((s, r) => s + r.lateArrivals, 0)
  const totalAbsent = att.reduce((s, r) => s + r.absent, 0)
  const perfectCount = att.filter(r => r.callouts === 0 && r.absent === 0 && r.lateArrivals === 0).length

  const { sorted: sortedAtt, TH: THAtt } = useSortable(att, 'attendanceRate', 'asc')
  const { sorted: sortedCallouts, TH: THCo } = useSortable(calloutLog, 'date', 'desc')
  const { sorted: sortedLate, TH: THLate } = useSortable(lateLog, 'date', 'desc')

  const highRisk = att.filter(r => r.callouts >= 3 || r.absent >= 3)

  if (loading) return <Spinner />

  const CO_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'reason', label: 'Reason', value: r => r.reason },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const LATE_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'points', label: 'Points', value: r => r.points, align: 'right', sortKey: r => r.points },
    { key: 'pattern', label: 'Pattern', value: r => (r.pattern ? '3+ this period' : '—') },
  ]
  const ATT_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'scheduled', label: 'Scheduled', value: r => r.scheduled, align: 'right', sortKey: r => r.scheduled },
    { key: 'present', label: 'Present', value: r => r.present, align: 'right', sortKey: r => r.present },
    { key: 'absent', label: 'Absent', value: r => r.absent, align: 'right', sortKey: r => r.absent },
    { key: 'callouts', label: 'Callouts', value: r => r.callouts, align: 'right', sortKey: r => r.callouts },
    { key: 'attendanceRate', label: 'Rate', value: r => `${r.attendanceRate}%`, align: 'right', sortKey: r => r.attendanceRate },
  ]
  const openDrill = (title, columns, rows, accent) => setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Total Callouts" value={totalCallouts} sub="This period" color={totalCallouts > 5 ? 'var(--t-danger)' : 'var(--t-text)'}
          onClick={() => openDrill('Callout Log', CO_COLS, calloutLog, 'var(--t-danger)')} />
        <KpiTile label="Total Late Arrivals" value={totalLate} sub="This period" color={totalLate > 5 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Late Arrivals', LATE_COLS, lateLog, 'var(--t-warn)')} />
        <KpiTile label="Total No-Shows" value={totalAbsent} sub="No call / no show"
          onClick={() => openDrill('Employees With No-Shows', ATT_COLS, att.filter(r => r.absent > 0), 'var(--t-accent)')} />
        <KpiTile label="Perfect Attendance" value={perfectCount} sub="Zero callouts/no-shows/late" color="var(--t-success)"
          onClick={() => openDrill('Perfect Attendance', ATT_COLS, att.filter(r => r.callouts === 0 && r.absent === 0 && r.lateArrivals === 0), 'var(--t-success)')} />
      </div>

      {highRisk.length > 0 && (
        <div style={{ background: 'var(--t-danger)11', border: '1px solid var(--t-danger)44', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-danger)', marginBottom: 8 }}>Pattern Detection — High Risk</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {highRisk.map(r => (
              <span key={r.id} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, background: 'var(--t-danger)22', color: 'var(--t-danger)', fontSize: 12, fontWeight: 700 }}>
                {r.name} ({r.callouts} callouts, {r.absent} no-shows)
              </span>
            ))}
          </div>
        </div>
      )}

      <SectionCard title="Callout Log">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <THCo k="name" label="Employee" />
            <THCo k="location" label="Location" />
            <THCo k="role" label="Role" />
            <THCo k="date" label="Date" />
            <THCo k="reason" label="Reason" />
            <THCo k="status" label="Status" />
          </tr></thead>
          <tbody>
            {sortedCallouts.map(r => (
              <tr key={r.id}>
                <TD bold>{r.name}</TD>
                <TD>{r.location}</TD>
                <TD>{r.role}</TD>
                <TD nowrap>{r.date}</TD>
                <TD>{r.reason}</TD>
                <TD><Badge color={r.status === 'Excused' ? 'green' : 'red'}>{r.status}</Badge></TD>
              </tr>
            ))}
            {sortedCallouts.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No callouts in this period</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Late Arrivals">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <THLate k="name" label="Employee" />
            <THLate k="date" label="Date" />
            <THLate k="points" label="Points" />
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>Pattern Flag</th>
          </tr></thead>
          <tbody>
            {sortedLate.map(r => (
              <tr key={r.id}>
                <TD bold>{r.name}</TD>
                <TD nowrap>{r.date}</TD>
                <TD color={r.points > 1 ? 'var(--t-warn)' : 'var(--t-text)'}>{r.points}</TD>
                <TD>{r.pattern ? <Badge color="red">3+ This Period</Badge> : <span style={{ color: 'var(--t-text-faint)' }}>—</span>}</TD>
              </tr>
            ))}
            {sortedLate.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No late arrivals in this period</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Attendance Rate by Employee">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <THAtt k="name" label="Employee" />
            <THAtt k="role" label="Role" />
            <THAtt k="location" label="Location" />
            <THAtt k="scheduled" label="Scheduled" />
            <THAtt k="present" label="Present" />
            <THAtt k="absent" label="No-Show" />
            <THAtt k="callouts" label="Callouts" />
            <THAtt k="lateArrivals" label="Late" />
            <THAtt k="attendanceRate" label="Rate" />
          </tr></thead>
          <tbody>
            {sortedAtt.map(r => (
              <tr key={r.id}>
                <TD bold>{r.name}</TD>
                <TD>{r.role}</TD>
                <TD>{r.location}</TD>
                <TD right>{r.scheduled}</TD>
                <TD right>{r.present}</TD>
                <TD right color={r.absent > 2 ? 'var(--t-danger)' : 'var(--t-text)'}>{r.absent}</TD>
                <TD right color={r.callouts > 1 ? 'var(--t-danger)' : 'var(--t-text)'}>{r.callouts}</TD>
                <TD right color={r.lateArrivals > 2 ? 'var(--t-warn)' : 'var(--t-text)'}>{r.lateArrivals}</TD>
                <TD style={{ minWidth: 160 }}><RateBar rate={r.attendanceRate} /></TD>
              </tr>
            ))}
            {sortedAtt.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No employees in this scope</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Time Off ────────────────────────────────────────────────────────────
function TimeOffTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const rows = filtered.timeOff
  const { sorted, TH } = useSortable(rows, 'requestDate', 'desc')
  if (loading) return <Spinner />

  const total = rows.length
  const approved = rows.filter(r => r.status === 'Approved').length
  const denied = rows.filter(r => r.status === 'Denied').length
  const pending = rows.filter(r => r.status === 'Pending').length
  const totalDaysApproved = rows.filter(r => r.status === 'Approved').reduce((s, r) => s + r.days, 0)

  // by type (real distinct types present)
  const byType = distinct(rows, 'type').map(t => {
    const sub = rows.filter(r => r.type === t)
    return { type: t, count: sub.length, days: sub.reduce((s, r) => s + r.days, 0) }
  })

  // monthly trend
  const monthMap = {}
  rows.forEach(r => {
    const m = (r.requestDate || '').slice(0, 7)
    if (!m) return
    if (!monthMap[m]) monthMap[m] = 0
    monthMap[m]++
  })
  const monthly = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([m, c]) => ({ month: m, count: c }))

  const peakCount = rows.filter(r => r.peakSeason).length

  const TOR_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'type', label: 'Type', value: r => r.type },
    { key: 'requestDate', label: 'Date', value: r => r.requestDate, sortKey: r => r.requestDate },
    { key: 'days', label: 'Days', value: r => r.days, align: 'right', sortKey: r => r.days },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} request${list.length === 1 ? '' : 's'}`, columns: TOR_COLS, rows: list, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Total Requests" value={total} sub="This period"
          onClick={() => openDrill('All Time-Off Requests', rows, 'var(--t-accent)')} />
        <KpiTile label="Approved" value={approved} sub={`${totalDaysApproved} days approved`} color="var(--t-success)"
          onClick={() => openDrill('Approved Requests', rows.filter(r => r.status === 'Approved'), 'var(--t-success)')} />
        <KpiTile label="Denied" value={denied} sub="This period" color={denied > 0 ? 'var(--t-danger)' : 'var(--t-text)'}
          onClick={() => openDrill('Denied Requests', rows.filter(r => r.status === 'Denied'), 'var(--t-danger)')} />
        <KpiTile label="Pending" value={pending} sub="Awaiting decision" color={pending > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Pending Requests', rows.filter(r => r.status === 'Pending'), 'var(--t-warn)')} />
        <KpiTile label="Peak Season Requests" value={peakCount} sub="Last 14 days" color={peakCount > 3 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Peak Season Requests', rows.filter(r => r.peakSeason), 'var(--t-warn)')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="By Request Type">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Type', 'Requests', 'Total Days'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {byType.map(r => (
                <tr key={r.type}>
                  <TD bold>{r.type}</TD>
                  <TD>{r.count}</TD>
                  <TD>{r.days} days</TD>
                </tr>
              ))}
              {byType.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No requests</td></tr>
              )}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Monthly Trend">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Month', 'Requests'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {monthly.map(r => (
                <tr key={r.month}>
                  <TD bold>{r.month}</TD>
                  <TD>{r.count}</TD>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No data</td></tr>
              )}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <SectionCard title="All Requests">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <TH k="name" label="Employee" />
            <TH k="location" label="Location" />
            <TH k="role" label="Role" />
            <TH k="type" label="Type" />
            <TH k="requestDate" label="Date" />
            <TH k="days" label="Days" />
            <TH k="status" label="Status" />
          </tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <TD bold>{r.name}</TD>
                <TD>{r.location}</TD>
                <TD>{r.role}</TD>
                <TD>{r.type}</TD>
                <TD nowrap>{r.requestDate}</TD>
                <TD right>{r.days}</TD>
                <TD>
                  <Badge color={r.status === 'Approved' ? 'green' : r.status === 'Denied' ? 'red' : r.status === 'Pending' ? 'amber' : 'blue'}>
                    {r.status}
                  </Badge>
                </TD>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No time-off requests in this period</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Training ────────────────────────────────────────────────────────────
function TrainingTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const [compFilter, setCompFilter] = useState('all')
  const rows = filtered.trainingMatrix
  const courses = data.trainingCourses || []

  const displayed = useMemo(() => {
    if (compFilter === 'complete') return rows.filter(r => r.completionRate >= 90)
    if (compFilter === 'partial') return rows.filter(r => r.completionRate > 0 && r.completionRate < 90)
    if (compFilter === 'incomplete') return rows.filter(r => r.completionRate === 0)
    return rows
  }, [rows, compFilter])

  // per-course compliance %
  const coursePct = useMemo(() => {
    return courses.map(c => {
      const assigned = rows.filter(r => r.courses[c] && r.courses[c] !== 'not_assigned').length
      const complete = rows.filter(r => r.courses[c] === 'complete').length
      return { course: c, pct: assigned ? pct(complete, assigned) : 0 }
    })
  }, [rows, courses])

  if (loading) return <Spinner />

  function cellStyle(status) {
    if (status === 'complete') return { background: 'var(--t-success)22', color: 'var(--t-success)', fontWeight: 700 }
    if (status === 'pending') return { background: 'var(--t-warn)22', color: 'var(--t-warn)', fontWeight: 700 }
    return { color: 'var(--t-text-faint)' }
  }

  const thBase = { padding: '10px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' }

  const TRN_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'completed', label: 'Completed', value: r => `${r.completed}/${r.assigned}`, align: 'right', sortKey: r => r.completed },
    { key: 'completionRate', label: 'Compliance', value: r => `${r.completionRate}%`, align: 'right', sortKey: r => r.completionRate },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: TRN_COLS, rows: list, accent })
  const avgCompliance = rows.length ? Math.round(rows.reduce((s, r) => s + r.completionRate, 0) / rows.length) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <KpiTile label="Total Employees" value={rows.length} sub="In scope"
          onClick={() => openDrill('Training — All Employees', rows, 'var(--t-accent)')} />
        <KpiTile
          label="Avg Compliance"
          value={rows.length ? `${avgCompliance}%` : '—'}
          sub="Across all courses"
          color={avgCompliance >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill('Training Compliance by Employee', rows, 'var(--t-success)')}
        />
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[['all', 'All'], ['complete', '≥90%'], ['partial', 'Partial'], ['incomplete', '0%']].map(([v, l]) => (
            <button key={v} onClick={() => setCompFilter(v)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--t-line)', background: compFilter === v ? 'var(--t-accent)' : 'var(--t-bg)', color: compFilter === v ? '#000' : 'var(--t-text)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title="Training Compliance Matrix">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', minWidth: 140 }}>Employee</th>
              <th style={{ ...thBase, textAlign: 'left' }}>Location</th>
              {courses.map(c => <th key={c} style={thBase}>{c}</th>)}
              <th style={{ ...thBase }}>Compliance %</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(r => {
              const cr = r.completionRate
              const crColor = cr >= 90 ? 'var(--t-success)' : cr >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'
              return (
                <tr key={r.id}>
                  <td style={{ padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', fontWeight: 700, color: 'var(--t-text)' }}>{r.name}</td>
                  <td style={{ padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>{r.location}</td>
                  {courses.map(c => {
                    const s = r.courses[c]
                    return (
                      <td key={c} style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--t-line)', ...cellStyle(s) }}>
                        {s === 'complete' ? '✓' : s === 'pending' ? '…' : '—'}
                      </td>
                    )
                  })}
                  <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid var(--t-line)', fontWeight: 800, color: crColor }}>{cr}%</td>
                </tr>
              )
            })}
            {displayed.length === 0 && (
              <tr><td colSpan={courses.length + 3} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No employees in this scope</td></tr>
            )}
            {/* course compliance footer */}
            {displayed.length > 0 && (
              <tr style={{ background: 'var(--t-surface-2)' }}>
                <td colSpan={2} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase' }}>Course Compliance %</td>
                {coursePct.map(cp => {
                  const c = cp.pct >= 90 ? 'var(--t-success)' : cp.pct >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'
                  return <td key={cp.course} style={{ padding: '8px', textAlign: 'center', fontWeight: 800, fontSize: 12, color: c }}>{cp.pct}%</td>
                })}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Performance ─────────────────────────────────────────────────────────
function PerformanceTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const rows = filtered.performance
  const { sorted, TH } = useSortable(rows, 'score', 'desc')
  if (loading) return <Spinner />

  const avgScore = rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(2) : 0
  const pending = rows.filter(r => r.status === 'Pending' || r.status === 'Overdue').length
  const overdue90 = rows.filter(r => r.daysAgo >= 90)

  // score distribution buckets
  const dist = [
    { label: '1–2 (Needs Work)', min: 1, max: 2.99, color: 'var(--t-danger)' },
    { label: '3 (Meets Expectations)', min: 3, max: 3.99, color: 'var(--t-warn)' },
    { label: '4–5 (Exceeds)', min: 4, max: 5, color: 'var(--t-success)' },
  ].map(b => ({ ...b, count: rows.filter(r => r.score >= b.min && r.score <= b.max).length }))

  // avg by location (real distinct)
  const byLoc = distinct(rows, 'location').map(loc => {
    const sub = rows.filter(r => r.location === loc)
    return { loc, avg: sub.length ? (sub.reduce((s, r) => s + r.score, 0) / sub.length).toFixed(2) : '—' }
  })

  // avg by role (real distinct)
  const byRole = distinct(rows, 'role').map(role => {
    const sub = rows.filter(r => r.role === role)
    return { role, avg: sub.length ? (sub.reduce((s, r) => s + r.score, 0) / sub.length).toFixed(2) : '—' }
  })

  const PERF_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'reviewer', label: 'Reviewer', value: r => r.reviewer },
    { key: 'score', label: 'Score', value: r => r.score.toFixed(1), align: 'right', sortKey: r => r.score },
    { key: 'status', label: 'Status', value: r => r.status },
    { key: 'reviewDate', label: 'Date', value: r => r.reviewDate, sortKey: r => r.reviewDate },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} review${list.length === 1 ? '' : 's'}`, columns: PERF_COLS, rows: list, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Avg Score" value={`${avgScore} / 5`} sub="All reviews"
          onClick={() => openDrill('All Performance Reviews', rows, 'var(--t-accent)')} />
        <KpiTile label="Reviews Complete" value={rows.filter(r => r.status === 'Complete').length} sub="This period" color="var(--t-success)"
          onClick={() => openDrill('Completed Reviews', rows.filter(r => r.status === 'Complete'), 'var(--t-success)')} />
        <KpiTile label="Pending / Overdue" value={pending} sub="Require action" color={pending > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Pending / Overdue Reviews', rows.filter(r => r.status === 'Pending' || r.status === 'Overdue'), 'var(--t-warn)')} />
        <KpiTile label="Due for Review" value={overdue90.length} sub="No review in 90+ days" color={overdue90.length > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          onClick={() => openDrill('Due for Review (90+ days)', overdue90, 'var(--t-danger)')} />
      </div>

      {rows.length === 0 && (
        <SectionCard><EmptyState label="No performance reviews recorded for employees in this scope yet. Reviews created in the Reviews screen will appear here." /></SectionCard>
      )}

      {rows.length > 0 && <>
      {/* score distribution */}
      <SectionCard title="Score Distribution">
        <div style={{ padding: '16px 20px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {dist.map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 200 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--t-text-faint)', marginBottom: 4 }}>{b.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 8, background: 'var(--t-line)', borderRadius: 4, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${rows.length ? pct(b.count, rows.length) : 0}%`, background: b.color, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 14, color: b.color, minWidth: 24 }}>{b.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="Avg Score by Location">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Location', 'Avg Score'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {byLoc.map(r => (
                <tr key={r.loc}><TD bold>{r.loc}</TD><TD>{r.avg}</TD></tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="Avg Score by Role">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Role', 'Avg Score'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {byRole.map(r => (
                <tr key={r.role}><TD bold>{r.role}</TD><TD>{r.avg}</TD></tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      {overdue90.length > 0 && (
        <SectionCard title="Pending Reviews — No Review in 90+ Days">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Employee', 'Location', 'Role', 'Last Review', 'Days Ago'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {overdue90.map(r => (
                <tr key={r.id}>
                  <TD bold>{r.name}</TD><TD>{r.location}</TD><TD>{r.role}</TD>
                  <TD nowrap>{r.reviewDate}</TD>
                  <TD color="var(--t-danger)" bold>{r.daysAgo} days</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title="All Performance Reviews">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <TH k="name" label="Employee" />
            <TH k="reviewer" label="Reviewer" />
            <TH k="period" label="Period" />
            <TH k="score" label="Score" />
            <TH k="status" label="Status" />
            <TH k="reviewDate" label="Date" />
          </tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <TD bold>{r.name}</TD>
                <TD>{r.reviewer}</TD>
                <TD>{r.period}</TD>
                <TD><Stars score={r.score} /></TD>
                <TD>
                  <Badge color={r.status === 'Complete' ? 'green' : r.status === 'Overdue' ? 'red' : r.status === 'Disputed' ? 'red' : 'amber'}>
                    {r.status}
                  </Badge>
                </TD>
                <TD nowrap>{r.reviewDate}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      </>}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Disciplinary ────────────────────────────────────────────────────────
function DisciplinaryTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const rows = filtered.disciplinary
  const { sorted, TH } = useSortable(rows, 'date', 'desc')
  if (loading) return <Spinner />

  const open = rows.filter(r => r.status === 'Open')
  const byLoc = distinct(rows, 'location').map(loc => ({
    loc, count: rows.filter(r => r.location === loc).length,
  }))
  const byType = distinct(rows, 'type').map(t => ({ type: t, count: rows.filter(r => r.type === t).length }))
  const repeatMap = {}
  rows.forEach(r => { repeatMap[r.name] = (repeatMap[r.name] || 0) + 1 })
  const repeats = Object.entries(repeatMap).filter(([, c]) => c >= 2).map(([n, c]) => ({ name: n, count: c }))
  const repeatNames = new Set(repeats.map(r => r.name))

  const DA_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'type', label: 'Type', value: r => r.type },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'severity', label: 'Severity', value: r => r.severity },
    { key: 'status', label: 'Status', value: r => r.status },
    { key: 'manager', label: 'Manager', value: r => r.manager },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} action${list.length === 1 ? '' : 's'}`, columns: DA_COLS, rows: list, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Total Actions" value={rows.length} sub="This period"
          onClick={() => openDrill('All Disciplinary Actions', rows, 'var(--t-accent)')} />
        <KpiTile label="Open" value={open.length} sub="Unresolved" color={open.length > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          onClick={() => openDrill('Open Disciplinary Actions', open, 'var(--t-danger)')} />
        <KpiTile label="Closed" value={rows.filter(r => r.status === 'Closed').length} sub="Resolved" color="var(--t-success)"
          onClick={() => openDrill('Closed Disciplinary Actions', rows.filter(r => r.status === 'Closed'), 'var(--t-success)')} />
        <KpiTile label="Repeat Offenders" value={repeats.length} sub="2+ actions this period" color={repeats.length > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Repeat Offenders — Actions', rows.filter(r => repeatNames.has(r.name)), 'var(--t-warn)')} />
      </div>

      {repeats.length > 0 && (
        <div style={{ background: 'var(--t-warn)11', border: '1px solid var(--t-warn)44', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-warn)', marginBottom: 8 }}>Repeat Offenders — 2+ Actions This Period</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {repeats.map(r => (
              <span key={r.name} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, background: 'var(--t-warn)22', color: 'var(--t-warn)', fontSize: 12, fontWeight: 700 }}>
                {r.name} ({r.count})
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="By Location">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Location', 'Count'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {byLoc.map(r => (
                <tr key={r.loc}><TD bold>{r.loc}</TD><TD color={r.count > 2 ? 'var(--t-danger)' : 'var(--t-text)'}>{r.count}</TD></tr>
              ))}
              {byLoc.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>None</td></tr>
              )}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="By Action Type">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Type', 'Count'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {byType.map(r => (
                <tr key={r.type}><TD bold>{r.type}</TD><TD>{r.count}</TD></tr>
              ))}
              {byType.length === 0 && (
                <tr><td colSpan={2} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>None</td></tr>
              )}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <SectionCard title={`All Disciplinary Actions${open.length > 0 ? ` — ${open.length} Open` : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <TH k="name" label="Employee" />
            <TH k="type" label="Type" />
            <TH k="date" label="Date" />
            <TH k="severity" label="Severity" />
            <TH k="status" label="Status" />
            <TH k="manager" label="Manager" />
          </tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} style={{ background: r.status === 'Open' ? 'var(--t-danger)08' : 'transparent' }}>
                <TD bold>{r.name}</TD>
                <TD>{r.type}</TD>
                <TD nowrap>{r.date}</TD>
                <TD><Badge color={r.severity === 'High' ? 'red' : r.severity === 'Medium' ? 'amber' : 'blue'}>{r.severity}</Badge></TD>
                <TD><Badge color={r.status === 'Open' ? 'red' : r.status === 'Under Review' ? 'amber' : 'green'}>{r.status}</Badge></TD>
                <TD>{r.manager}</TD>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No disciplinary actions this period</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: Payroll / Hours ─────────────────────────────────────────────────────
function PayrollTab({ data, filtered, loading }) {
  const [drill, setDrill] = useState(null)
  const rows = filtered.payroll
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const totals = useMemo(() => ({
    daily: DAYS.map((_, i) => round1(rows.reduce((s, r) => s + (r.daily[i] || 0), 0))),
    totalHrs: round1(rows.reduce((s, r) => s + r.totalHrs, 0)),
    regularHrs: round1(rows.reduce((s, r) => s + r.regularHrs, 0)),
    overtimeHrs: round1(rows.reduce((s, r) => s + r.overtimeHrs, 0)),
    regularPay: rows.reduce((s, r) => s + r.regularPay, 0),
    otPay: rows.reduce((s, r) => s + r.otPay, 0),
    totalPay: rows.reduce((s, r) => s + r.totalPay, 0),
  }), [rows])

  if (loading) return <Spinner />

  const thBase = { padding: '10px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' }
  const tfBase = { padding: '10px 8px', fontSize: 13, fontWeight: 800, color: 'var(--t-text)', background: 'var(--t-surface-2)', borderTop: '2px solid var(--t-line)', textAlign: 'right' }

  function handleExportPayroll() {
    const csv_rows = rows.map(r => ({
      Employee: r.name, Role: r.role, Location: r.location,
      HourlyRate: r.hourlyRate,
      ...Object.fromEntries(DAYS.map((d, i) => [d, r.daily[i]])),
      RegularHrs: r.regularHrs, OTHrs: r.overtimeHrs, TotalHrs: r.totalHrs,
      RegularPay: r.regularPay.toFixed(2), OTPay: r.otPay.toFixed(2), TotalPay: r.totalPay.toFixed(2),
    }))
    exportCSV(csv_rows, `payroll-${isoDate(new Date())}.csv`)
  }

  const PAY_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'regularHrs', label: 'Regular', value: r => `${r.regularHrs}h`, align: 'right', sortKey: r => r.regularHrs },
    { key: 'overtimeHrs', label: 'OT', value: r => `${r.overtimeHrs}h`, align: 'right', sortKey: r => r.overtimeHrs },
    { key: 'totalHrs', label: 'Total Hrs', value: r => `${r.totalHrs}h`, align: 'right', sortKey: r => r.totalHrs },
    { key: 'totalPay', label: 'Total Pay', value: r => fmt$(r.totalPay), align: 'right', sortKey: r => r.totalPay },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: PAY_COLS, rows: list, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <KpiTile label="Total Hours" value={`${totals.totalHrs}h`} sub="Clocked hours"
          onClick={() => openDrill('Hours by Employee', rows, 'var(--t-accent)')} />
        <KpiTile label="Regular Hours" value={`${totals.regularHrs}h`} sub="≤40/week"
          onClick={() => openDrill('Regular Hours by Employee', rows, 'var(--t-accent)')} />
        <KpiTile label="OT Hours" value={`${totals.overtimeHrs}h`} sub="@1.5x" color={totals.overtimeHrs > 20 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Overtime by Employee', rows.filter(r => r.overtimeHrs > 0), 'var(--t-warn)')} />
        <KpiTile label="Total Est. Pay" value={fmt$(totals.totalPay)} sub="Reg + OT (wage-based)" color="var(--t-success)"
          onClick={() => openDrill('Estimated Pay by Employee', rows, 'var(--t-success)')} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportPayroll}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Export Payroll CSV
          </button>
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Print for Payroll
          </button>
        </div>
      </div>

      <SectionCard title="Employee Hours — Weekly Breakdown">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', minWidth: 140 }}>Employee</th>
              <th style={{ ...thBase, textAlign: 'left' }}>Role</th>
              <th style={{ ...thBase, textAlign: 'left' }}>Location</th>
              {DAYS.map(d => <th key={d} style={thBase}>{d}</th>)}
              <th style={thBase}>Regular</th>
              <th style={{ ...thBase, color: 'var(--t-warn)' }}>OT</th>
              <th style={thBase}>Total Hrs</th>
              <th style={thBase}>Rate</th>
              <th style={thBase}>Reg Pay</th>
              <th style={{ ...thBase, color: 'var(--t-warn)' }}>OT Pay</th>
              <th style={{ ...thBase, color: 'var(--t-success)' }}>Total Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ padding: '9px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{r.name}</td>
                <td style={{ padding: '9px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{r.role}</td>
                <td style={{ padding: '9px 12px', fontSize: 13, borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{r.location}</td>
                {r.daily.map((h, i) => (
                  <td key={i} style={{ padding: '9px 8px', fontSize: 12, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: 'var(--t-text)' }}>{h}h</td>
                ))}
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: 'var(--t-text)', fontWeight: 600 }}>{r.regularHrs}h</td>
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: r.overtimeHrs > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)', fontWeight: r.overtimeHrs > 0 ? 700 : 400 }}>{r.overtimeHrs}h</td>
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', fontWeight: 700, color: 'var(--t-text)' }}>{r.totalHrs}h</td>
                <td style={{ padding: '9px 8px', fontSize: 12, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: 'var(--t-text-faint)' }}>{r.hourlyRate ? fmt$(r.hourlyRate) : '—'}</td>
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: 'var(--t-text)' }}>{fmt$(r.regularPay)}</td>
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', color: r.otPay > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)', fontWeight: r.otPay > 0 ? 700 : 400 }}>{fmt$(r.otPay)}</td>
                <td style={{ padding: '9px 8px', fontSize: 13, borderBottom: '1px solid var(--t-line)', textAlign: 'right', fontWeight: 800, color: 'var(--t-success)' }}>{fmt$(r.totalPay)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={14} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No clocked hours in this period</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
          <tfoot>
            <tr>
              <td style={{ ...tfBase, textAlign: 'left', padding: '10px 12px' }} colSpan={3}>TOTALS</td>
              {totals.daily.map((h, i) => <td key={i} style={tfBase}>{h}h</td>)}
              <td style={tfBase}>{totals.regularHrs}h</td>
              <td style={{ ...tfBase, color: 'var(--t-warn)' }}>{totals.overtimeHrs}h</td>
              <td style={tfBase}>{totals.totalHrs}h</td>
              <td style={tfBase}>—</td>
              <td style={tfBase}>{fmt$(totals.regularPay)}</td>
              <td style={{ ...tfBase, color: 'var(--t-warn)' }}>{fmt$(totals.otPay)}</td>
              <td style={{ ...tfBase, color: 'var(--t-success)' }}>{fmt$(totals.totalPay)}</td>
            </tr>
          </tfoot>
          )}
        </table>
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── TAB: CT Paid Leave ───────────────────────────────────────────────────────
function CTPayLeaveTab({ data, loading }) {
  const enabled = useFeatureFlag('paid_leave')
  const config  = useConfig()
  const [drill, setDrill] = useState(null)

  if (!enabled) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 14 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }
  if (loading) return <Spinner />

  const accrualHours = config.paid_leave_accrual_hours   // e.g. 40
  const minWage      = config.min_wage
  const currency     = '$'

  const rows = data.ctLeave || []

  const totalAccrued  = rows.reduce((s, r) => s + r.accrued, 0)
  const totalUsed     = rows.reduce((s, r) => s + r.used, 0)
  const atMaxCount    = rows.filter(r => r.accrued >= 40).length
  const allCompliant  = rows.every(r => r.balance >= 0)

  const PL_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'hoursWorked', label: 'Hours Worked YTD', value: r => `${r.hoursWorked}h`, align: 'right', sortKey: r => r.hoursWorked },
    { key: 'accrued', label: 'Accrued', value: r => `${r.accrued}h`, align: 'right', sortKey: r => r.accrued },
    { key: 'used', label: 'Used', value: r => `${r.used}h`, align: 'right', sortKey: r => r.used },
    { key: 'balance', label: 'Balance', value: r => `${r.balance}h`, align: 'right', sortKey: r => r.balance },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: PL_COLS, rows: list, accent })

  const thS = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Config display */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10, padding: '12px 18px', fontSize: 13, color: 'var(--t-text-faint)' }}>
        Accrual Rate: 1 hr per <strong style={{ color: 'var(--t-text)' }}>{accrualHours}</strong> hrs worked
        {' | '} Max: <strong style={{ color: 'var(--t-text)' }}>40 hrs/year</strong>
        {' | '} Min Wage: <strong style={{ color: 'var(--t-text)' }}>{currency}{minWage}/hr</strong>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Total Hours Accrued (All Employees)" value={`${round1(totalAccrued)}h`} sub="YTD across all employees"
          onClick={() => openDrill('CT Paid Leave — All Employees (Accrued)', rows, 'var(--t-accent)')} />
        <KpiTile label="Total Hours Used YTD"                value={`${round1(totalUsed)}h`}    sub="Paid leave taken" color="var(--t-warn)"
          onClick={() => openDrill('Paid Leave Used YTD', rows.filter(r => r.used > 0), 'var(--t-warn)')} />
        <KpiTile label="Employees at Max Accrual (40 hrs)"   value={atMaxCount}          sub="At 40-hr cap" color={atMaxCount > 0 ? 'var(--t-accent)' : 'var(--t-text)'}
          onClick={() => openDrill('Employees at Max Accrual (40 hrs)', rows.filter(r => r.accrued >= 40), 'var(--t-accent)')} />
        <KpiTile label="Compliance Status" value={
          <span style={{ display:'inline-block', padding:'3px 10px', fontSize:13, fontWeight:800, background: (allCompliant ? 'var(--t-success)' : 'var(--t-warn)') + '22', color: allCompliant ? 'var(--t-success)' : 'var(--t-warn)' }}>{allCompliant ? 'COMPLIANT' : 'REVIEW'}</span>
        } sub="CT Public Act 19-25"
          onClick={() => openDrill('CT Paid Leave — Compliance Status', rows, 'var(--t-success)')} />
      </div>

      {/* Table */}
      <SectionCard title="Employee CT Paid Leave Tracker">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Employee','Location','Hours Worked YTD','Accrued','Used','Balance','Last Used','Status'].map(h => (
                <th key={h} style={thS}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{r.name}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--t-text)' }}>{r.loc}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--t-text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{r.hoursWorked}h</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: r.accrued >= 40 ? 'var(--t-accent)' : 'var(--t-text)', textAlign: 'right' }}>{r.accrued}h{r.accrued >= 40 ? ' ★' : ''}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--t-warn)', textAlign: 'right' }}>{r.used}h</td>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: r.balance > 0 ? 'var(--t-success)' : r.balance < 0 ? 'var(--t-danger)' : 'var(--t-text)', textAlign: 'right' }}>{r.balance}h</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--t-text)', textAlign: 'right' }}>{r.lastUsed}</td>
                <td style={{ padding: '10px 12px' }}>
                  <Badge color={r.status === 'Compliant' ? 'green' : 'red'}>{r.status}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 26, textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>No paid-leave balances recorded for employees in this scope yet.</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Compliance note */}
      <div style={{ background: 'var(--t-accent)0d', border: '1px solid var(--t-accent)33', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: 'var(--t-text-faint)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--t-accent)', display: 'block', marginBottom: 4 }}>CT Paid Leave Compliance Note</strong>
        Per CT Public Act 19-25, employees accrue 1 hour of paid sick leave per {accrualHours} hours worked, up to 40 hours annually.
        This tracker reflects YTD accruals and usage from recorded leave balances.
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { session } = useAuth()
  const person = session?.person ?? null
  const { locationIds: scopeLocationIds = [] } = useScope?.() ?? {}

  const canView = useMemo(() => isHRRole(person?.role_name), [person])

  const [activeTab, setActiveTab] = useState('overview')
  const [locFilter, setLocFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [empSearch, setEmpSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(emptyData)
  const [dataSource, setDataSource] = useState({ live: false })
  const searchRef = useRef(null)

  // Real fetch from Supabase — every dataset comes from an existing RPC (plus
  // the new get_time_off_report). No mock, no fallback: an empty scope yields
  // an honest empty report.
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const nodeIds = scopeLocationIds.length ? scopeLocationIds : []
      if (!nodeIds.length) { setData(emptyData()); setDataSource({ live: false }); setLoading(false); return }
      const actor = person?.id || getSession().id || null

      const [rosterRes, aoRes, calloutRes, punchRes, trainRes, revRes, daRes, torRes, leaveRes] = await Promise.allSettled([
        sb.rpc('get_roster', { p_node_ids: nodeIds, p_actor: actor }),
        sb.rpc('get_attendance_overview', { p_node_ids: nodeIds }),
        sb.rpc('forensic_callouts', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('get_all_time_entries', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('hr_training_overview', { p_node_ids: nodeIds }),
        sb.rpc('get_reviews_detailed', { p_node_ids: nodeIds }),
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }),
        sb.rpc('get_time_off_report', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('benefits_leave_summary', { p_node_ids: nodeIds }),
      ])
      const val = (r) => (r.status === 'fulfilled' && !r.value?.error) ? (r.value?.data ?? null) : null
      const inRange = (d) => { const s = String(d || '').slice(0, 10); return !!s && s >= dateFrom && s <= dateTo }

      // ── Employee dimension (real roster) ──────────────────────────────────
      const roster = val(rosterRes) || []
      const employees = roster.map((p, i) => ({
        idx: i + 1,
        uuid: p.id ?? p.person_id ?? null,
        name: p.full_name || '—',
        role: p.role_name || p.role || '—',
        location: p.node_name || p.location || '—',
        wage: Number(p.wage) || 0,
      }))
      const empByUuid = new Map(employees.filter(e => e.uuid).map(e => [e.uuid, e]))
      const empByName = new Map(employees.map(e => [e.name, e]))

      // ── Payroll / worked hours (real time punches) ────────────────────────
      const punches = val(punchRes) || []
      const workedDays = new Map()   // key -> Set(work_date)
      const payMap = new Map()       // key -> payroll accumulator
      for (const e of punches) {
        const key = e.person_id || e.full_name
        if (!key) continue
        if (!workedDays.has(key)) workedDays.set(key, new Set())
        const wd = String(e.work_date || '').slice(0, 10)
        if (wd) workedDays.get(key).add(wd)
        if (!payMap.has(key)) {
          const emp = (e.person_id && empByUuid.get(e.person_id)) || empByName.get(e.full_name)
          payMap.set(key, {
            id: key, name: e.full_name || emp?.name || '—',
            role: emp?.role || '—', location: e.node_name || emp?.location || '—',
            hourlyRate: emp?.wage || 0, daily: [0, 0, 0, 0, 0, 0, 0],
          })
        }
        const rec = payMap.get(key)
        const h = Number(e.hours_worked)
        if (Number.isFinite(h) && wd) {
          const dow = (new Date(wd + 'T00:00:00').getDay() + 6) % 7  // Mon=0 … Sun=6
          rec.daily[dow] += h
        }
      }
      const payroll = [...payMap.values()].map(r => {
        const daily = r.daily.map(round1)
        const totalHrs = round1(daily.reduce((s, h) => s + h, 0))
        const regularHrs = round1(Math.min(totalHrs, 40))
        const overtimeHrs = round1(Math.max(0, totalHrs - 40))
        const regularPay = regularHrs * r.hourlyRate
        const otPay = overtimeHrs * r.hourlyRate * 1.5
        return { ...r, daily, totalHrs, regularHrs, overtimeHrs, regularPay, otPay, totalPay: regularPay + otPay }
      }).sort((a, b) => a.name.localeCompare(b.name))

      // ── Callouts (real forensic report) ───────────────────────────────────
      const fc = val(calloutRes) || []
      const calloutLog = fc.map((r, i) => {
        const emp = empByName.get(r.employee)
        return {
          id: r.exception_id || `co-${i}`,
          name: r.employee || '—',
          role: emp?.role || '—',
          location: r.node || emp?.location || '—',
          date: String(r.callout_date || '').slice(0, 10),
          reason: r.reason || (r.exception_type === 'no_show' ? 'No Call/No Show' : 'Callout'),
          status: r.excused ? 'Excused' : 'Unexcused',
        }
      })
      const calloutCountByName = new Map()
      calloutLog.forEach(c => { if (c.name) calloutCountByName.set(c.name, (calloutCountByName.get(c.name) || 0) + 1) })

      // ── Attendance incidents (real attendance overview) ───────────────────
      const ao = val(aoRes) || []
      const lateLog = []
      const attendance = ao.map((pp, i) => {
        const emp = empByUuid.get(pp.person_id) || empByName.get(pp.full_name)
        const incs = (pp.incidents || []).filter(x => inRange(x.date))
        const lateArrivals = incs.filter(x => x.type === 'tardy').length
        const absent = incs.filter(x => x.type === 'ncns').length
        const callouts = calloutCountByName.get(pp.full_name) || incs.filter(x => x.type === 'callout').length
        incs.filter(x => x.type === 'tardy').forEach(x => {
          lateLog.push({
            id: x.id, name: pp.full_name, role: pp.role || emp?.role || '—',
            location: pp.location || emp?.location || '—', date: x.date,
            points: Number(x.pts) || 0, pattern: false,
          })
        })
        const workedKey = pp.person_id || pp.full_name
        const present = (workedDays.get(workedKey)?.size) || 0
        const scheduled = present + callouts + absent
        const attendanceRate = scheduled > 0 ? pct(present, scheduled) : 100
        return {
          id: pp.person_id || `att-${i}`,
          name: pp.full_name || '—', role: pp.role || emp?.role || '—', location: pp.location || emp?.location || '—',
          scheduled, present, absent, callouts, lateArrivals, attendanceRate,
          highRisk: callouts >= 3 || absent >= 3,
        }
      })
      // pattern flag: 3+ late in period for the same employee
      const lateByName = {}
      lateLog.forEach(l => { lateByName[l.name] = (lateByName[l.name] || 0) + 1 })
      lateLog.forEach(l => { l.pattern = (lateByName[l.name] || 0) >= 3 })

      // ── Time off (real, all statuses) ─────────────────────────────────────
      const tor = val(torRes) || []
      const timeOff = tor.map((r, i) => {
        const rd = String(r.request_date || r.start_date || '').slice(0, 10)
        const dAgo = daysAgoFrom(rd)
        return {
          id: r.id || `tor-${i}`,
          name: r.name || '—', role: r.role || '—', location: r.location || '—',
          type: titleCase(r.type), requestDate: rd, days: Number(r.days) || 1,
          status: titleCase(r.status), peakSeason: dAgo >= 0 && dAgo < 14,
        }
      })

      // ── Training compliance matrix (real modules + records) ───────────────
      const trainOv = val(trainRes) || {}
      const modules = trainOv.modules || []
      const trainingCourses = modules.map(m => m.name)
      const trainEmps = trainOv.employees || []
      const trainingMatrix = trainEmps.map((e, i) => {
        const courses = {}
        let completed = 0, assigned = 0
        modules.forEach(m => {
          const rec = (e.records || []).find(r => r.module_id === m.id)
          let st
          if (rec && rec.status === 'complete') st = 'complete'
          else if (m.required || (rec && rec.status && rec.status !== 'not-started')) st = 'pending'
          else st = 'not_assigned'
          courses[m.name] = st
          if (st !== 'not_assigned') assigned++
          if (st === 'complete') completed++
        })
        return {
          id: e.id || `trn-${i}`, name: e.name || '—', role: e.role || '—', location: e.location || '—',
          courses, completed, assigned, completionRate: assigned ? pct(completed, assigned) : 0,
        }
      })

      // ── Performance reviews (real) ────────────────────────────────────────
      const revs = val(revRes) || []
      const performance = revs.map((r, i) => {
        const rd = String(r.created_at || '').slice(0, 10)
        const dAgo = daysAgoFrom(rd)
        const raw = String(r.status || '').toLowerCase()
        let status = raw === 'acknowledged' ? 'Complete' : raw === 'disputed' ? 'Disputed' : 'Pending'
        if (status !== 'Complete' && dAgo >= 90) status = 'Overdue'
        return {
          id: r.id || `rev-${i}`, name: r.employee_name || '—', role: r.role_name || '—', location: r.node_name || '—',
          score: Number(r.overall_score) || 0, prevScore: null, reviewer: r.reviewer_name || 'HR',
          period: r.period || '—', status, reviewDate: rd, daysAgo: dAgo,
        }
      })

      // ── Disciplinary actions (real) ───────────────────────────────────────
      const das = val(daRes) || []
      const sevFor = (t) => { const s = (t || '').toLowerCase(); if (/(terminat|suspen|final)/.test(s)) return 'High'; if (/written/.test(s)) return 'Medium'; return 'Low' }
      const daStatus = (s) => { const x = (s || '').toLowerCase(); if (x === 'active' || x === 'open') return 'Open'; if (x === 'resolved' || x === 'closed') return 'Closed'; if (x.includes('review')) return 'Under Review'; return titleCase(s) }
      const disciplinary = das.map((r, i) => {
        const emp = (r.person_id && empByUuid.get(r.person_id)) || empByName.get(r.person_name)
        return {
          id: r.id || `da-${i}`, name: r.person_name || emp?.name || '—',
          role: emp?.role || '—', location: r.node_name || emp?.location || '—',
          type: titleCase(r.da_type || r.type || 'Warning'),
          date: String(r.da_date || r.date || r.created_at || '').slice(0, 10),
          severity: sevFor(r.da_type || r.type), status: daStatus(r.status),
          manager: r.issuer_name || r.issued_by_name || '—',
        }
      })

      // ── CT paid leave (real accrual balances) ─────────────────────────────
      const leave = val(leaveRes) || []
      const ctLeave = leave.map((r, i) => {
        const accrued = round1(r.accrued)
        const used = round1(r.used)
        const balance = (r.remaining != null) ? round1(r.remaining) : round1(accrued - used)
        return {
          id: r.person_id || `pl-${i}`, name: r.full_name || '—', loc: r.location || '—',
          hoursWorked: Math.round(Number(r.ytd_hours) || 0), accrued, used, balance,
          lastUsed: r.last_used ? String(r.last_used).slice(0, 10) : '—',
          status: balance >= 0 ? 'Compliant' : 'Review',
        }
      })

      // ── Roll-ups (derived from the real per-employee data above) ──────────
      const locNames = Array.from(new Set([...attendance.map(a => a.location), ...payroll.map(p => p.location)].filter(Boolean)))
      const locStats = locNames.map(loc => {
        const emps = attendance.filter(r => r.location === loc)
        const pay = payroll.filter(r => r.location === loc)
        return {
          location: loc, headcount: emps.length,
          totalHrs: round1(pay.reduce((s, r) => s + r.totalHrs, 0)),
          otHrs: round1(pay.reduce((s, r) => s + r.overtimeHrs, 0)),
          callouts: emps.reduce((s, r) => s + r.callouts, 0),
          attendanceRate: emps.length ? Math.round(emps.reduce((s, r) => s + r.attendanceRate, 0) / emps.length) : 0,
        }
      }).sort((a, b) => a.location.localeCompare(b.location))

      const roleNames = Array.from(new Set(attendance.map(a => a.role).filter(Boolean)))
      const roleStats = roleNames.map(role => {
        const emps = attendance.filter(r => r.role === role)
        const pay = payroll.filter(r => r.role === role)
        return {
          role, count: emps.length,
          avgHours: pay.length ? Math.round(pay.reduce((s, r) => s + r.totalHrs, 0) / pay.length) : 0,
          calloutRate: emps.length ? Math.round((emps.reduce((s, r) => s + r.callouts, 0) / emps.length) * 10) / 10 : 0,
        }
      }).sort((a, b) => a.role.localeCompare(b.role))

      const recentActivity = [
        ...calloutLog.slice(0, 5).map(c => ({ type: 'callout', text: `${c.name} — callout (${c.reason})`, date: c.date, severity: 'warn' })),
        ...disciplinary.filter(d => d.status === 'Open').slice(0, 4).map(d => ({ type: 'disciplinary', text: `Open DA — ${d.name} (${d.type})`, date: d.date, severity: 'danger' })),
        ...performance.filter(p => p.status === 'Overdue').slice(0, 4).map(p => ({ type: 'review', text: `Review overdue: ${p.name}`, date: p.reviewDate, severity: 'danger' })),
        ...timeOff.filter(t => t.status === 'Pending').slice(0, 4).map(t => ({ type: 'timeoff', text: `${t.name} — ${t.type} pending`, date: t.requestDate, severity: 'warn' })),
      ].filter(e => e.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10)

      const assembled = {
        employees, trainingCourses,
        attendance, calloutLog, lateLog, timeOff,
        trainingMatrix, performance, disciplinary, payroll,
        ctLeave, locStats, roleStats, recentActivity,
      }
      const anyLive = employees.length || attendance.length || calloutLog.length || timeOff.length ||
        disciplinary.length || payroll.length || trainingMatrix.length || performance.length || ctLeave.length
      setData(assembled)
      setDataSource({ live: !!anyLive })
    } catch (e) {
      console.error('[Reports] load failed:', e?.message || e)
      setData(emptyData())
      setDataSource({ live: false })
    } finally {
      setLoading(false)
    }
  }, [scopeLocationIds, dateFrom, dateTo, person])

  useEffect(() => {
    if (canView) fetchData()
  }, [canView, fetchData])

  // filter option lists derived from the live roster
  const locOptions = useMemo(() => ['All', ...distinct(data.employees, 'location')], [data.employees])
  const roleOptions = useMemo(() => ['All Roles', ...distinct(data.employees, 'role')], [data.employees])

  // global filter applied to each dataset
  const filtered = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    const filterRows = (rows) => {
      if (!rows) return []
      return rows.filter(r => {
        if (locFilter !== 'All' && r.location !== locFilter) return false
        if (roleFilter !== 'All Roles' && r.role !== roleFilter && r.role_name !== roleFilter) return false
        if (q) {
          const name = (r.name || r.full_name || '').toLowerCase()
          if (!name.includes(q)) return false
        }
        return true
      })
    }
    return {
      attendance:     filterRows(data.attendance),
      calloutLog:     filterRows(data.calloutLog),
      lateLog:        filterRows(data.lateLog),
      timeOff:        filterRows(data.timeOff),
      trainingMatrix: filterRows(data.trainingMatrix),
      performance:    filterRows(data.performance),
      disciplinary:   filterRows(data.disciplinary),
      payroll:        filterRows(data.payroll),
    }
  }, [data, locFilter, roleFilter, empSearch])

  function tabRows() {
    const map = {
      overview:     filtered.attendance,
      attendance:   filtered.calloutLog,
      timeoff:      filtered.timeOff,
      training:     filtered.trainingMatrix.map(r => ({ name: r.name, role: r.role, location: r.location, completionRate: r.completionRate })),
      performance:  filtered.performance.map(r => ({ name: r.name, role: r.role, location: r.location, score: r.score, status: r.status, reviewDate: r.reviewDate })),
      disciplinary: filtered.disciplinary,
      payroll:      filtered.payroll.map(r => ({ name: r.name, role: r.role, location: r.location, regularHrs: r.regularHrs, overtimeHrs: r.overtimeHrs, totalHrs: r.totalHrs, regularPay: r.regularPay.toFixed(2), otPay: r.otPay.toFixed(2), totalPay: r.totalPay.toFixed(2) })),
      ct_paid_leave: data.ctLeave.map(r => ({ name: r.name, location: r.loc, hoursWorkedYTD: r.hoursWorked, accrued: r.accrued, used: r.used, balance: r.balance, status: r.status })),
    }
    return map[activeTab] || []
  }
  function handleExportCSV() { exportCSV(tabRows(), `vip-reports-${activeTab}-${isoDate(new Date())}.csv`) }
  function handleExportXLS() { exportXLS(tabRows(), `vip-reports-${activeTab}-${isoDate(new Date())}.xls`) }
  function handleBoardPack() { printReport(`${activeTab.toUpperCase()} Report`, tabRows()) }

  if (!canView) return <AccessRestricted />

  return (
    <div style={{ padding: 20, maxWidth: 1440, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: -0.5 }}>Reports</h1>
            {dataSource.live
              ? <span title="All figures are pulled live from the HR database" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', background: 'var(--t-success)', color: '#04121a', textTransform: 'uppercase' }}>● Live Data</span>
              : <span title="No records for this scope / date range yet" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', background: 'var(--t-surface-2)', color: 'var(--t-text-faint)', border: '1px solid var(--t-line)', textTransform: 'uppercase' }}>No records in scope</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-faint)', marginTop: 4 }}>
            HR analytics · {dateFrom} → {dateTo}
            <span style={{ marginLeft: 8, fontSize: 11 }}>· all datasets <b style={{ color: 'var(--t-success)' }}>live</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExportCSV} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⤓ CSV</button>
          <button onClick={handleExportXLS} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--t-line)', background: 'var(--t-surface)', color: 'var(--t-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⤓ Excel</button>
          <button onClick={handleBoardPack} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--t-accent)', background: 'var(--t-accent)22', color: 'var(--t-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📄 Board Pack (PDF)</button>
        </div>
      </div>

      {/* filter bar — sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--t-bg)', paddingBottom: 12, marginBottom: 4,
      }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* location pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {locOptions.map(loc => (
              <button
                key={loc}
                onClick={() => setLocFilter(loc)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid var(--t-line)',
                  background: locFilter === loc ? 'var(--t-accent)' : 'var(--t-bg)',
                  color: locFilter === loc ? '#000' : 'var(--t-text)',
                  transition: 'all 0.15s',
                }}
              >
                {loc}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--t-line)', flexShrink: 0 }} />

          {/* role dropdown */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', fontSize: 13, cursor: 'pointer' }}
          >
            {roleOptions.map(r => <option key={r}>{r}</option>)}
          </select>

          {/* employee search */}
          <input
            ref={searchRef}
            type="text"
            placeholder="Search employee…"
            value={empSearch}
            onChange={e => setEmpSearch(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', fontSize: 13, minWidth: 160 }}
          />

          <div style={{ width: 1, height: 24, background: 'var(--t-line)', flexShrink: 0 }} />

          {/* date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t-text-faint)' }}>
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', fontSize: 13 }}
            />
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--t-line)', background: 'var(--t-bg)', color: 'var(--t-text)', fontSize: 13 }}
            />
          </div>

          {loading && <span style={{ fontSize: 12, color: 'var(--t-text-faint)', marginLeft: 4 }}>Loading…</span>}
        </div>
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--t-line)', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: activeTab === tab.id ? 'var(--t-accent)' : 'var(--t-text-faint)',
              borderBottom: activeTab === tab.id ? '2px solid var(--t-accent)' : '2px solid transparent',
              marginBottom: -2,
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'timeoff' && (
          <TimeOffTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'training' && (
          <TrainingTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'disciplinary' && (
          <DisciplinaryTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'payroll' && (
          <PayrollTab data={data} filtered={filtered} loading={loading} />
        )}
        {activeTab === 'ct_paid_leave' && (
          <CTPayLeaveTab data={data} loading={loading} />
        )}
      </div>
    </div>
  )
}
