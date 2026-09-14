import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { saveSynced, hydrate, loadCached } from '../lib/syncStore.js'
import DrillDown from '../components/DrillDown.jsx'

/* ══════════════════════════════════════════════════════════════════════════
   Analytics & Intelligence — 100% real data.

   Reads (all live RPCs, no mock fallbacks anywhere):
     get_analytics_summary(p_node_ids, p_date_from, p_date_to)  KPI matrix
     get_analytics_monthly(p_node_ids, p_months)                trend series
     get_attendance_overview(p_node_ids)                        roster + incidents
     get_disciplinary_actions(p_node_ids)                       DA rows
     get_training_overview(p_node_ids)                          training rows
     get_sales_summary(p_node_ids, from, to)                    daily revenue
     get_all_time_entries(p_node_ids, from, to)                 punch rows
     rehire_list(p_node_ids)                                    separations
     get_hires_list(p_node_ids, from, to)                       hire events

   Insights, anomalies and forecasts are DERIVED (statistics on the rows
   above) — nothing is seeded, faked or randomised. Empty data renders
   honest empty states. Saved report definitions persist through the
   server-backed app_state store (set_app_state / get_app_state RPCs).
   ══════════════════════════════════════════════════════════════════════════ */

// ── FORMATTERS ────────────────────────────────────────────────────────────────
const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = (n) => { const v = parseFloat(n || 0); return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : fmt$(v) }
const fmtPct = (n) => `${parseFloat(n || 0).toFixed(1)}%`
const fmtN = (n) => Number(n || 0).toLocaleString('en-US')
const dash = '—'
const may$ = (v) => (v == null ? dash : fmtK(v))
const mayPct = (v) => (v == null ? dash : fmtPct(v))
const mayN = (v) => (v == null ? dash : fmtN(v))
const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHR = (r = '') => HR_ROLES.some(k => r.toLowerCase().includes(k))

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d }
const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)
const yearStart = (d = new Date()) => new Date(d.getFullYear(), 0, 1)
const weekStartMon = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const card = (extra = {}) => ({
  background: 'var(--t-surface)',
  border: '1px solid var(--t-line)',
  borderRadius: 8,
  padding: '16px 20px',
  ...extra,
})
const sel = (extra = {}) => ({
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  ...extra,
})

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function TrendArrow({ pct, size = 14 }) {
  if (pct == null || pct === 0 || !isFinite(pct)) return <span style={{ color: 'var(--t-text-muted)', fontSize: size }}>→</span>
  const up = pct > 0
  return (
    <span style={{ color: up ? 'var(--t-success)' : 'var(--t-danger)', fontSize: size, fontWeight: 700 }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function KpiTile({ label, value, sub, warn, good, muted, onClick }) {
  const color = warn ? 'var(--t-warn)' : good ? 'var(--t-success)' : muted ? 'var(--t-text-muted)' : 'var(--t-accent)'
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined}
      style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.15, wordBreak: 'break-all' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--t-line)', marginBottom: 20, overflowX: 'auto' }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px',
            fontSize: 13, fontWeight: active === t ? 700 : 500,
            color: active === t ? 'var(--t-accent)' : 'var(--t-text-muted)',
            borderBottom: active === t ? '2px solid var(--t-accent)' : '2px solid transparent',
            marginBottom: -2, whiteSpace: 'nowrap', transition: 'color 0.15s',
          }}
        >{t}</button>
      ))}
    </div>
  )
}

function ConfBadge({ level }) {
  const cls = level === 'high' ? 'badge green' : level === 'medium' ? 'badge amber' : 'badge red'
  return <span className={cls}>{level}</span>
}

function EmptyCard({ children }) {
  return (
    <div style={{ ...card(), textAlign: 'center', padding: 40, color: 'var(--t-text-muted)', fontSize: 13 }}>
      {children}
    </div>
  )
}

// ── DERIVED INSIGHTS (rules over real rows — never invented numbers) ──────────
// incident items from get_attendance_overview: { type: tardy|callout|ncns, date: 'YYYY-MM-DD', pts, ... }
function last30Incidents(attendance, type) {
  const min = iso(daysAgo(30))
  const out = []
  for (const p of attendance || []) {
    const hits = (p.incidents || []).filter(i => i.type === type && (i.date || '') >= min)
    if (hits.length) out.push({ ...p, count: hits.length })
  }
  return out.sort((a, b) => b.count - a.count)
}

function buildInsights(ds) {
  if (!ds || !ds.summary) return []
  const out = []
  let id = 0
  const s = ds.summary
  const locs = ds.locations || []

  const withRev = locs.filter(l => +l.revenue > 0)
  if (withRev.length >= 2) {
    const top = [...withRev].sort((a, b) => b.revenue - a.revenue)[0]
    const share = (top.revenue / Math.max(1, +s.revenue)) * 100
    out.push({ id: ++id, cat: 'Revenue', icon: '📈', trend: 'up', severity: 'green',
      headline: `${top.name} leads MTD revenue at ${fmtK(top.revenue)}`,
      detail: `${top.name} accounts for ${share.toFixed(1)}% of the ${fmtK(s.revenue)} recorded across ${locs.length} locations this period (${fmtN(top.sale_count)} sales logged).` })
  }
  if (s.revenue_goal != null && +s.revenue_goal > 0) {
    const pct = (+s.revenue / +s.revenue_goal) * 100
    out.push({ id: ++id, cat: 'Revenue', icon: '🎯', trend: pct >= 100 ? 'up' : 'down', severity: pct >= 100 ? 'green' : pct >= 85 ? 'amber' : 'red',
      headline: `Revenue is at ${pct.toFixed(1)}% of the ${fmtK(s.revenue_goal)} goal`,
      detail: `MTD revenue of ${fmtK(s.revenue)} vs the aggregate goal recorded in sales goals for this period.` })
  }
  if (+s.labor_hours > 0 && +s.ot_hours > 0) {
    const share = (+s.ot_hours / +s.labor_hours) * 100
    if (share >= 8) out.push({ id: ++id, cat: 'Labor', icon: '💰', trend: 'down', severity: share >= 15 ? 'red' : 'amber',
      headline: `Overtime is ${share.toFixed(1)}% of all clocked hours`,
      detail: `${fmtN(s.ot_hours)} OT hours out of ${fmtN(s.labor_hours)} total hours this period${s.ot_cost != null ? ` (est. ${fmtK(s.ot_cost)} at recorded wages)` : ' (no wage records — cost not estimated)'}.` })
  }
  const trained = locs.filter(l => l.training_pct != null)
  if (trained.length) {
    const worst = [...trained].sort((a, b) => a.training_pct - b.training_pct)[0]
    if (worst.training_pct < 75) out.push({ id: ++id, cat: 'Training', icon: '📚', trend: 'down', severity: worst.training_pct < 50 ? 'red' : 'amber',
      headline: `${worst.name} training compliance at ${fmtPct(worst.training_pct)} — lowest in network`,
      detail: `${fmtN(worst.training_valid)} of ${fmtN(worst.training_total)} training records are current (completed and unexpired) for staff assigned to ${worst.name}.` })
  }
  const repeatTardy = last30Incidents(ds.attendance, 'tardy').filter(p => p.count >= 3)
  if (repeatTardy.length) {
    out.push({ id: ++id, cat: 'Conduct', icon: '🚨', trend: 'down', severity: 'red',
      headline: `${repeatTardy.length} employee${repeatTardy.length === 1 ? ' has' : 's have'} 3+ tardies in 30 days`,
      detail: repeatTardy.slice(0, 4).map(p => `${p.full_name} (${p.count})`).join(', ') + (repeatTardy.length > 4 ? ` and ${repeatTardy.length - 4} more.` : '.') + ' Logged in attendance incidents — review per policy.' })
  }
  // callout spike: current week vs prior-4-week weekly average, per location
  const wkStart = iso(weekStartMon())
  const baseStart = iso(addDays(weekStartMon(), -28))
  const byLoc = {}
  for (const p of ds.attendance || []) {
    for (const i of p.incidents || []) {
      if (i.type !== 'callout') continue
      const d = i.date || ''
      if (d < baseStart) continue
      const k = p.location || dash
      byLoc[k] = byLoc[k] || { cur: 0, base: 0 }
      if (d >= wkStart) byLoc[k].cur += 1; else byLoc[k].base += 1
    }
  }
  for (const [locName, v] of Object.entries(byLoc)) {
    const weeklyAvg = v.base / 4
    if (v.cur >= 3 && weeklyAvg > 0 && v.cur / weeklyAvg >= 2) {
      out.push({ id: ++id, cat: 'Attendance', icon: '⚠️', trend: 'down', severity: 'red',
        headline: `${locName} callouts this week are ${(v.cur / weeklyAvg).toFixed(1)}x the 4-week average`,
        detail: `${v.cur} callouts since ${wkStart} vs a ${weeklyAvg.toFixed(1)}/week baseline. Investigate scheduling or morale drivers.` })
    }
  }
  if (+s.seps_ytd > 0) {
    out.push({ id: ++id, cat: 'Workforce', icon: '🔄', trend: 'down', severity: +s.turnover_pct >= 20 ? 'red' : 'amber',
      headline: `${fmtN(s.seps_ytd)} separation${+s.seps_ytd === 1 ? '' : 's'} YTD (${mayPct(s.turnover_pct)} trailing-12mo turnover)`,
      detail: `Separations recorded against a current headcount of ${fmtN(s.headcount)}. ${fmtN(s.hires_ytd)} hires started YTD.` })
  }
  // attendance trend from the monthly series
  const att = (ds.monthly || []).filter(m => m.attendance_rate != null)
  if (att.length >= 2) {
    const a = att[att.length - 2].attendance_rate, b = att[att.length - 1].attendance_rate
    if (b - a <= -3) out.push({ id: ++id, cat: 'Attendance', icon: '📉', trend: 'down', severity: 'amber',
      headline: `Attendance rate fell ${(a - b).toFixed(1)} pts month-over-month`,
      detail: `${fmtPct(a)} → ${fmtPct(b)}, computed from scheduled shifts vs logged callouts/NCNS.` })
    else if (b - a >= 3) out.push({ id: ++id, cat: 'Attendance', icon: '📈', trend: 'up', severity: 'green',
      headline: `Attendance rate improved ${(b - a).toFixed(1)} pts month-over-month`,
      detail: `${fmtPct(a)} → ${fmtPct(b)}, computed from scheduled shifts vs logged callouts/NCNS.` })
  }
  return out
}

// trend direction counts from the monthly series (real deltas)
function trendCounts(monthly) {
  const keys = ['revenue', 'attendance_rate', 'training_completions', 'labor_hours', 'da_count', 'separations']
  let up = 0, down = 0
  for (const k of keys) {
    const vals = (monthly || []).map(m => m[k]).filter(v => v != null)
    if (vals.length < 2) continue
    const d = vals[vals.length - 1] - vals[vals.length - 2]
    const bad = k === 'da_count' || k === 'separations'
    if (d > 0) (bad ? down++ : up++)
    else if (d < 0) (bad ? up++ : down++)
  }
  return { up, down }
}

// ── DRILL COLUMN DEFS (real per-location rows from get_analytics_summary) ────
const LOC_COLS = [
  { key: 'name', label: 'Location', value: r => r.name },
  { key: 'headcount', label: 'Headcount', value: r => fmtN(r.headcount), align: 'right', sortKey: r => +r.headcount },
  { key: 'revenue', label: 'Revenue', value: r => fmt$(r.revenue), align: 'right', sortKey: r => +r.revenue },
  { key: 'revenue_goal', label: 'Goal', value: r => may$(r.revenue_goal), align: 'right', sortKey: r => +(r.revenue_goal || 0) },
  { key: 'labor_hours', label: 'Labor Hrs', value: r => fmtN(r.labor_hours), align: 'right', sortKey: r => +r.labor_hours },
  { key: 'ot_hours', label: 'OT Hrs', value: r => fmtN(r.ot_hours), align: 'right', sortKey: r => +r.ot_hours },
  { key: 'labor_cost', label: 'Labor Cost', value: r => may$(r.labor_cost), align: 'right', sortKey: r => +(r.labor_cost || 0) },
  { key: 'spiff', label: 'Spiff', value: r => fmt$(r.spiff), align: 'right', sortKey: r => +r.spiff },
  { key: 'attendance_rate', label: 'Attend %', value: r => mayPct(r.attendance_rate), align: 'right', sortKey: r => +(r.attendance_rate || 0) },
  { key: 'training_pct', label: 'Training %', value: r => mayPct(r.training_pct), align: 'right', sortKey: r => +(r.training_pct || 0) },
  { key: 'da_count', label: 'DAs', value: r => fmtN(r.da_count), align: 'right', sortKey: r => +r.da_count },
  { key: 'risk_emp', label: 'Risk Emp', value: r => fmtN(r.risk_emp), align: 'right', sortKey: r => +r.risk_emp },
  { key: 'turnover_pct', label: 'Turnover %', value: r => mayPct(r.turnover_pct), align: 'right', sortKey: r => +(r.turnover_pct || 0) },
]
const INSIGHT_COLS = [
  { key: 'cat', label: 'Category', value: r => r.cat },
  { key: 'severity', label: 'Severity', value: r => r.severity },
  { key: 'trend', label: 'Trend', value: r => r.trend },
  { key: 'headline', label: 'Insight', value: r => r.headline },
  { key: 'detail', label: 'Detail', value: r => r.detail },
]

// ── KPI PANEL ─────────────────────────────────────────────────────────────────
function KpiPanel({ ds, insights, openDrill }) {
  const s = ds.summary || {}
  const locs = ds.locations || []
  const revGoalPct = s.revenue_goal != null && +s.revenue_goal > 0 ? (+s.revenue / +s.revenue_goal) * 100 : null
  const laborPct = s.labor_cost != null && +s.revenue > 0 ? (+s.labor_cost / +s.revenue) * 100 : null
  const tc = trendCounts(ds.monthly)
  const criticals = insights.filter(i => i.severity === 'red')
  const warnings = insights.filter(i => i.severity === 'amber')
  const drillLoc = (title, accent) => openDrill({ title, subtitle: `${locs.length} locations`, columns: LOC_COLS, rows: locs, accent })
  const drillInsights = (title, rows, accent) => openDrill({ title, subtitle: `${rows.length} insight${rows.length === 1 ? '' : 's'}`, columns: INSIGHT_COLS, rows, accent })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
      {/* Row 1 — Business Health */}
      <SectionLabel>Business Health — MTD</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile label="Revenue MTD"      value={fmtK(s.revenue)}    sub={`${fmtN(s.sale_count)} sales · ${locs.length} locations`} good={+s.revenue > 0} muted={+s.revenue === 0} onClick={() => drillLoc('Revenue by Location', 'var(--t-success)')} />
        <KpiTile label="Revenue vs Goal"  value={revGoalPct == null ? dash : fmtPct(revGoalPct)} sub={revGoalPct == null ? 'no revenue goal set' : `goal: ${fmtK(s.revenue_goal)}`} good={revGoalPct != null && revGoalPct >= 100} warn={revGoalPct != null && revGoalPct < 90} muted={revGoalPct == null} onClick={() => drillLoc('Revenue vs Goal by Location', 'var(--t-accent)')} />
        <KpiTile label="Labor Hours MTD"  value={fmtN(s.labor_hours)} sub={`${fmtN(s.ot_hours)} OT hrs`} onClick={() => drillLoc('Labor Hours by Location', 'var(--t-accent)')} />
        <KpiTile label="Labor Cost MTD"   value={may$(s.labor_cost)} sub={s.labor_cost == null ? 'no wage records yet' : laborPct != null ? `${fmtPct(laborPct)} of revenue` : 'hours × recorded wages'} muted={s.labor_cost == null} warn={laborPct != null && laborPct > 35} onClick={() => drillLoc('Labor Cost by Location', 'var(--t-warn)')} />
        <KpiTile label="OT Cost MTD"      value={may$(s.ot_cost)}    sub={s.ot_cost == null ? 'no wage records yet' : 'at 1.5× recorded wage'} muted={s.ot_cost == null} warn={s.ot_cost != null && +s.ot_cost > 0} onClick={() => drillLoc('OT by Location', 'var(--t-warn)')} />
        <KpiTile label="Spiff Payout MTD" value={fmtK(s.spiff)}      sub="incentive spend" good={+s.spiff > 0} muted={+s.spiff === 0} onClick={() => drillLoc('Spiff Payout by Location', 'var(--t-success)')} />
      </div>

      {/* Row 2 — Workforce Health */}
      <SectionLabel>Workforce Health</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile label="Headcount"        value={fmtN(s.headcount)}       sub="active, assigned" onClick={() => drillLoc('Headcount by Location', 'var(--t-accent)')} />
        <KpiTile label="Attendance Rate"  value={mayPct(s.attendance_rate)} sub={s.attendance_rate == null ? 'no shifts scheduled MTD' : `${fmtN(s.callouts)} callouts · ${fmtN(s.ncns)} NCNS`} good={s.attendance_rate >= 90} warn={s.attendance_rate != null && s.attendance_rate < 85} muted={s.attendance_rate == null} onClick={() => drillLoc('Attendance by Location', 'var(--t-accent)')} />
        <KpiTile label="Training Compl."  value={mayPct(s.training_pct)}  sub={s.training_pct == null ? 'no training records' : `${fmtN(s.training_valid)} of ${fmtN(s.training_total)} current`} good={s.training_pct >= 80} warn={s.training_pct != null && s.training_pct < 70} muted={s.training_pct == null} onClick={() => drillLoc('Training by Location', 'var(--t-accent)')} />
        <KpiTile label="Risk Employees"   value={fmtN(s.risk_emp)}        sub="active DA or 3+ incidents" warn={+s.risk_emp > 0} good={+s.risk_emp === 0} onClick={() => drillLoc('Risk Employees by Location', 'var(--t-warn)')} />
        <KpiTile label="Turnover Rate"    value={mayPct(s.turnover_pct)}  sub="trailing 12 months" good={s.turnover_pct != null && s.turnover_pct < 10} warn={s.turnover_pct != null && s.turnover_pct >= 20} muted={s.turnover_pct == null} onClick={() => drillLoc('Turnover by Location', 'var(--t-warn)')} />
        <KpiTile label="Active DAs"       value={fmtN(s.active_das)}      sub={`${fmtN(s.da_count)} issued this period`} warn={+s.active_das > 0} good={+s.active_das === 0} onClick={() => drillLoc('Disciplinary by Location', 'var(--t-warn)')} />
      </div>

      {/* Row 3 — Alerts */}
      <SectionLabel>Alerts Detected</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <KpiTile label="Critical Issues" value={criticals.length} sub="need immediate action" warn={criticals.length > 0} good={criticals.length === 0} onClick={() => drillInsights('Critical Issues', criticals, 'var(--t-danger)')} />
        <KpiTile label="Warnings"        value={warnings.length}  sub="monitor closely" muted onClick={() => drillInsights('Warnings', warnings, 'var(--t-warn)')} />
        <KpiTile label="Trends Up"       value={tc.up}            sub="improving metrics (MoM)" good={tc.up > 0} muted={tc.up === 0} />
        <KpiTile label="Trends Down"     value={tc.down}          sub="declining metrics (MoM)" warn={tc.down > 0} good={tc.down === 0} />
        <KpiTile label="Data Points"     value={fmtN(s.data_points)} sub="records analyzed this period" muted onClick={() => drillLoc('Source Rows by Location', 'var(--t-text-muted)')} />
        <KpiTile label="Last Refreshed"  value={ds.refreshedAt ? ds.refreshedAt.toLocaleTimeString() : dash} sub={ds.refreshedAt ? ds.refreshedAt.toLocaleDateString() : ''} muted />
      </div>
    </div>
  )
}

// ── TAB 1: EXECUTIVE SUMMARY ──────────────────────────────────────────────────
const COMPARE_METRICS = [
  { label: 'Revenue',          key: 'revenue',          fmt: v => fmtK(v) },
  { label: 'Transactions',     key: 'sale_count',       fmt: v => fmtN(v) },
  { label: 'Units Sold',       key: 'units',            fmt: v => fmtN(v) },
  { label: 'Labor Hours',      key: 'labor_hours',      fmt: v => fmtN(v) },
  { label: 'OT Hours',         key: 'ot_hours',         fmt: v => fmtN(v) },
  { label: 'Spiff Payout',     key: 'spiff',            fmt: v => fmtK(v) },
  { label: 'Callouts',         key: 'callouts',         fmt: v => fmtN(v) },
  { label: 'Tardies',          key: 'tardies',          fmt: v => fmtN(v) },
  { label: 'Disciplinary',     key: 'da_count',         fmt: v => fmtN(v) },
  { label: 'Attendance %',     key: 'attendance_rate',  fmt: v => mayPct(v) },
]

function ExecSummary({ ds, insights, nodeIds }) {
  const [filter, setFilter] = useState('All')
  const [cmp, setCmp] = useState(null)      // { wk, wkPrev, mo, moPrev }
  const [cmpErr, setCmpErr] = useState('')
  const [cmpLoading, setCmpLoading] = useState(true)
  const cats = ['All', ...new Set(insights.map(i => i.cat))]
  const filtered = filter === 'All' ? insights : insights.filter(i => i.cat === filter)

  useEffect(() => {
    let cancelled = false
    if (!nodeIds?.length) { setCmpLoading(false); return }
    ;(async () => {
      setCmpLoading(true); setCmpErr('')
      try {
        const now = new Date()
        const ranges = {
          wk:     [weekStartMon(now), now],
          wkPrev: [addDays(weekStartMon(now), -7), addDays(weekStartMon(now), -1)],
          mo:     [monthStart(now), now],
          moPrev: [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)],
        }
        const out = {}
        for (const [k, [f, t]] of Object.entries(ranges)) {
          const { data, error } = await sb.rpc('get_analytics_summary', { p_node_ids: nodeIds, p_date_from: iso(f), p_date_to: iso(t) })
          if (error) throw error
          out[k] = data?.summary || {}
        }
        if (!cancelled) setCmp(out)
      } catch (e) {
        if (!cancelled) { setCmpErr(e.message || 'Comparison unavailable'); setCmp(null) }
      } finally {
        if (!cancelled) setCmpLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [nodeIds])

  const pct = (c, p) => (p == null || c == null || +p === 0) ? null : ((+c - +p) / Math.abs(+p)) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            background: filter === c ? 'var(--t-accent)' : 'var(--t-surface-2)',
            color: filter === c ? '#000' : 'var(--t-text)',
            border: '1px solid var(--t-line)', borderRadius: 20,
            padding: '4px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{c}</button>
        ))}
      </div>

      {/* Insight cards — derived from live records */}
      {filtered.length === 0 ? (
        <EmptyCard>No insights detected for this scope — not enough recent activity in the data.</EmptyCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(ins => (
            <div key={ins.id} style={{
              ...card({ padding: '14px 16px' }),
              borderLeft: `3px solid ${ins.severity === 'red' ? 'var(--t-danger)' : ins.severity === 'amber' ? 'var(--t-warn)' : 'var(--t-success)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{ins.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                    {ins.cat}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6, lineHeight: 1.4 }}>{ins.headline}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{ins.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison grid */}
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 14 }}>KPI Comparison — Week vs Prior Week / Month vs Prior Month</div>
        {cmpLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading comparison…</div>
        ) : cmpErr ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-danger)', fontSize: 13 }}>Couldn’t load comparison: {cmpErr}</div>
        ) : !cmp ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No comparison data.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                  {['Metric','This Week','Prior Week','Δ Week','This Month','Prior Month','Δ Month'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Metric' ? 'left' : 'right', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_METRICS.map((m, i) => {
                  const cw = cmp.wk?.[m.key], pw = cmp.wkPrev?.[m.key]
                  const cm = cmp.mo?.[m.key], pm = cmp.moPrev?.[m.key]
                  return (
                    <tr key={m.label} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{m.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text)' }}>{cw == null ? dash : m.fmt(cw)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text-muted)' }}>{pw == null ? dash : m.fmt(pw)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><TrendArrow pct={pct(cw, pw)} size={12} /></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text)' }}>{cm == null ? dash : m.fmt(cm)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text-muted)' }}>{pm == null ? dash : m.fmt(pm)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><TrendArrow pct={pct(cm, pm)} size={12} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 2: TRENDS ─────────────────────────────────────────────────────────────
const TREND_CATS = {
  'Revenue':          { key: 'revenue',              fmt: v => fmtK(v) },
  'Attendance':       { key: 'attendance_rate',      fmt: v => mayPct(v) },
  'Labor Hours':      { key: 'labor_hours',          fmt: v => fmtN(v) },
  'Training':         { key: 'training_completions', fmt: v => fmtN(v) },
  'Disciplinary':     { key: 'da_count',             fmt: v => fmtN(v) },
  'Turnover':         { key: 'separations',          fmt: v => fmtN(v) },
}
const DATE_RANGES = { '3 Months': 3, '6 Months': 6, '1 Year': 12 }

function Trends({ ds, nodeIds }) {
  const [cat, setCat] = useState('Revenue')
  const [range, setRange] = useState('6 Months')
  const [locId, setLocId] = useState('All')
  const [locMonthly, setLocMonthly] = useState(null)
  const [locLoading, setLocLoading] = useState(false)
  const [locErr, setLocErr] = useState('')

  useEffect(() => {
    let cancelled = false
    if (locId === 'All') { setLocMonthly(null); setLocErr(''); return }
    ;(async () => {
      setLocLoading(true); setLocErr('')
      const { data, error } = await sb.rpc('get_analytics_monthly', { p_node_ids: [locId], p_months: 12 })
      if (cancelled) return
      if (error) { setLocErr(error.message || 'Failed to load location trend'); setLocMonthly(null) }
      else setLocMonthly(Array.isArray(data) ? data : [])
      setLocLoading(false)
    })()
    return () => { cancelled = true }
  }, [locId])

  const src = locId === 'All' ? (ds.monthly || []) : (locMonthly || [])
  const def = TREND_CATS[cat]
  const months = DATE_RANGES[range]
  const rows = useMemo(() => {
    const data = src.slice(Math.max(0, src.length - months))
    return data.map((m, i, arr) => {
      const v = m[def.key]
      const prev = i > 0 ? arr[i - 1][def.key] : null
      const pct = (prev != null && v != null && +prev !== 0) ? ((+v - +prev) / Math.abs(+prev)) * 100 : null
      const win = arr.slice(Math.max(0, i - 2), i + 1).map(x => x[def.key]).filter(x => x != null)
      const ma3 = win.length === 3 ? win.reduce((a, b) => a + +b, 0) / 3 : null
      return { month: m.label, ym: m.month, value: v == null ? null : +v, pct, ma3 }
    })
  }, [src, def.key, months])

  const nonNull = rows.filter(r => r.value != null)
  const hasData = nonNull.some(r => r.value !== 0)
  const best = hasData ? Math.max(...nonNull.map(r => r.value)) : null
  const worst = hasData ? Math.min(...nonNull.map(r => r.value)) : null
  const bestMonth = nonNull.find(r => r.value === best)?.month
  const worstMonth = nonNull.find(r => r.value === worst)?.month
  const maxVal = hasData ? best * 1.05 || 1 : 1
  const barColor = (v) => (v === best ? 'var(--t-success)' : v === worst ? 'var(--t-danger)' : 'var(--t-accent)')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, marginRight: 6 }}>CATEGORY</span>
          <select style={sel()} value={cat} onChange={e => setCat(e.target.value)}>
            {Object.keys(TREND_CATS).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, marginRight: 6 }}>RANGE</span>
          <select style={sel()} value={range} onChange={e => setRange(e.target.value)}>
            {Object.keys(DATE_RANGES).map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, marginRight: 6 }}>LOCATION</span>
          <select style={sel()} value={locId} onChange={e => setLocId(e.target.value)}>
            <option value="All">All</option>
            {(ds.locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {locLoading ? <EmptyCard>Loading location trend…</EmptyCard>
       : locErr ? <EmptyCard><span style={{ color: 'var(--t-danger)' }}>{locErr}</span></EmptyCard>
       : !hasData ? <EmptyCard>No {cat.toLowerCase()} activity recorded in this range{locId !== 'All' ? ' for this location' : ''}.</EmptyCard>
       : (
        <>
          {/* Best / worst callout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ ...card({ padding: '12px 16px' }), borderLeft: '3px solid var(--t-success)' }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Best Month</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-success)' }}>{bestMonth} — {def.fmt(best)}</div>
            </div>
            <div style={{ ...card({ padding: '12px 16px' }), borderLeft: '3px solid var(--t-danger)' }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Worst Month</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-danger)' }}>{worstMonth} — {def.fmt(worst)}</div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={card({ padding: '16px 20px' })}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 16 }}>{cat} — {range} Trend</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, overflowX: 'auto' }}>
              {rows.map(r => (
                <div key={r.ym} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '0 0 auto', minWidth: 44 }}>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', fontWeight: 600 }}>
                    {r.value == null ? dash : def.fmt(r.value).replace('$', '').replace('%', '')}
                  </div>
                  <div style={{
                    width: 32, height: r.value == null ? 4 : Math.max(8, (r.value / maxVal) * 110),
                    background: r.value == null ? 'var(--t-surface-2)' : barColor(r.value),
                    borderRadius: '3px 3px 0 0', transition: 'height 0.3s',
                  }} />
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 600 }}>{r.month}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend table */}
          <div style={card()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Trend Table with 3-Month Moving Average</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                    {['Month', 'Value', 'vs. Prior Month', '3-Month Average', 'Signal'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Month' ? 'left' : 'right', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ym} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{r.month}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: r.value === best ? 'var(--t-success)' : r.value === worst ? 'var(--t-danger)' : 'var(--t-text)', fontWeight: r.value === best || r.value === worst ? 700 : 400 }}>
                        {r.value == null ? dash : def.fmt(r.value)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {r.pct == null ? <span style={{ color: 'var(--t-text-faint)' }}>—</span> : <TrendArrow pct={r.pct} size={12} />}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text-muted)' }}>
                        {r.ma3 != null ? def.fmt(r.ma3) : dash}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {r.pct == null ? <span className="badge purple">—</span>
                         : r.pct > 5 ? <span className="badge green">Strong Up</span>
                         : r.pct > 0 ? <span className="badge blue">Up</span>
                         : r.pct < -5 ? <span className="badge red">Alert</span>
                         : r.pct < 0 ? <span className="badge amber">Down</span>
                         : <span className="badge purple">Flat</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── TAB 3: ANOMALY DETECTOR (statistics over real rows) ───────────────────────
function detectAnomalies(ds) {
  const out = []
  let id = 0

  // 1) Daily revenue outliers (z-score over the 90-day daily series)
  const daily = (ds.sales90?.daily || []).map(d => ({ date: d.date, amt: +d.amount }))
  if (daily.length >= 7) {
    const mean = daily.reduce((a, b) => a + b.amt, 0) / daily.length
    const sd = Math.sqrt(daily.reduce((a, b) => a + (b.amt - mean) ** 2, 0) / daily.length)
    if (sd > 0) {
      for (const d of daily) {
        const z = (d.amt - mean) / sd
        if (Math.abs(z) >= 2) {
          out.push({ id: ++id, metric: 'Daily Revenue', loc: 'All in scope', who: d.date,
            detail: `${fmt$(d.amt)} on ${d.date} is ${Math.abs(z).toFixed(1)}σ ${z > 0 ? 'above' : 'below'} the 90-day mean of ${fmt$(mean)}`,
            confidence: Math.abs(z) >= 3 ? 'high' : 'medium',
            cause: z > 0 ? 'Promotion, contest effect, or bulk sale' : 'Short staffing, closure, or missing sales logs',
            action: 'Review the sales log for that day' })
        }
      }
    }
  }

  // 2) Callout spike per location — current week vs prior 4-week weekly average
  const wkStart = iso(weekStartMon())
  const baseStart = iso(addDays(weekStartMon(), -28))
  const co = {}
  for (const p of ds.attendance || []) {
    for (const i of p.incidents || []) {
      if (i.type !== 'callout') continue
      const d = i.date || ''
      if (d < baseStart) continue
      const k = p.location || dash
      co[k] = co[k] || { cur: 0, base: 0 }
      if (d >= wkStart) co[k].cur += 1; else co[k].base += 1
    }
  }
  for (const [locName, v] of Object.entries(co)) {
    const avg = v.base / 4
    if (v.cur >= 3 && avg > 0 && v.cur / avg >= 2) {
      out.push({ id: ++id, metric: 'Callout Rate', loc: locName, who: 'Location',
        detail: `${v.cur} callouts this week vs a ${avg.toFixed(1)}/week 4-week baseline (${(v.cur / avg).toFixed(1)}x)`,
        confidence: v.cur / avg >= 3 ? 'high' : 'medium',
        cause: 'Possible morale event, schedule change, or illness cluster',
        action: 'Investigate root cause with the location manager' })
    }
  }

  // 3) Mon/Fri tardy concentration (last 60 days)
  const min60 = iso(daysAgo(60))
  let tardyTotal = 0, tardyMonFri = 0
  for (const p of ds.attendance || []) {
    for (const i of p.incidents || []) {
      if (i.type !== 'tardy' || (i.date || '') < min60) continue
      tardyTotal += 1
      const dow = new Date(i.date + 'T12:00:00').getDay()
      if (dow === 1 || dow === 5) tardyMonFri += 1
    }
  }
  if (tardyTotal >= 5) {
    const pctMF = (tardyMonFri / tardyTotal) * 100
    if (pctMF >= 60) {
      out.push({ id: ++id, metric: 'Late Arrivals', loc: 'All in scope', who: 'Mon/Fri pattern',
        detail: `${pctMF.toFixed(0)}% of the ${tardyTotal} tardies in the last 60 days fall on Monday or Friday (random ≈ 29%)`,
        confidence: pctMF >= 75 ? 'high' : 'medium',
        cause: 'Extended-weekend behavior or scheduling dissatisfaction',
        action: 'Review schedule structure; consider a policy reminder' })
    }
  }

  // 4) Person-week hours outliers from real punches (last ~5 weeks)
  const pw = {}
  for (const t of ds.timeEntries || []) {
    if (t.hours_worked == null) continue
    const wk = iso(weekStartMon(new Date(t.work_date + 'T12:00:00')))
    const k = `${t.person_id}|${wk}`
    pw[k] = pw[k] || { name: t.full_name, loc: t.node_name, wk, hrs: 0 }
    pw[k].hrs += +t.hours_worked
  }
  for (const v of Object.values(pw)) {
    if (v.hrs > 45) {
      out.push({ id: ++id, metric: 'Weekly Hours', loc: v.loc || dash, who: v.name,
        detail: `${v.hrs.toFixed(1)} clocked hours in the week of ${v.wk}`,
        confidence: v.hrs > 50 ? 'high' : 'medium',
        cause: 'Unplanned OT, shift coverage, or missed punch-out',
        action: 'Verify punches; check OT budget impact' })
    }
  }

  // 5) Any NCNS in the last 14 days is inherently critical
  const min14 = iso(daysAgo(14))
  for (const p of ds.attendance || []) {
    const n = (p.incidents || []).filter(i => i.type === 'ncns' && (i.date || '') >= min14)
    if (n.length) {
      out.push({ id: ++id, metric: 'No-Call-No-Show', loc: p.location || dash, who: p.full_name,
        detail: `${n.length} NCNS in the last 14 days (latest ${n.map(i => i.date).sort().pop()})`,
        confidence: 'high',
        cause: 'Job abandonment risk or personal emergency',
        action: 'Contact employee; apply the attendance policy' })
    }
  }

  return out
}

function AnomalyDetector({ ds }) {
  const [confFilter, setConfFilter] = useState('All')
  const anomalies = useMemo(() => detectAnomalies(ds), [ds])
  const filtered = confFilter === 'All' ? anomalies : anomalies.filter(a => a.confidence === confFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)' }}>Statistical Outlier Detection</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Computed from live sales, attendance and time-clock records (z-scores and baseline ratios)</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700 }}>CONFIDENCE</span>
          {['All', 'high', 'medium', 'low'].map(c => (
            <button key={c} onClick={() => setConfFilter(c)} style={{
              background: confFilter === c ? 'var(--t-accent)' : 'var(--t-surface-2)',
              color: confFilter === c ? '#000' : 'var(--t-text)',
              border: '1px solid var(--t-line)', borderRadius: 4,
              padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
            }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(a => (
          <div key={a.id} style={{
            ...card({ padding: '16px 20px' }),
            borderLeft: `3px solid ${a.confidence === 'high' ? 'var(--t-danger)' : a.confidence === 'medium' ? 'var(--t-warn)' : 'var(--t-text-muted)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 2 }}>{a.metric}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="badge blue">{a.loc}</span>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{a.who}</span>
                </div>
              </div>
              <ConfBadge level={a.confidence} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600, marginBottom: 6 }}>{a.detail}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                <span style={{ fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', fontSize: 10 }}>Likely Cause: </span>{a.cause}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-accent)', fontWeight: 600, textAlign: 'right' }}>
                → {a.action}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyCard>No anomalies detected {confFilter === 'All' ? 'in the current data' : 'at this confidence level'}.</EmptyCard>
      )}
    </div>
  )
}

// ── TAB 4: FORECASTS (linear projection over the real monthly series) ─────────
const FORECAST_METRICS = [
  { label: 'Monthly Revenue',      key: 'revenue',              unit: '$' },
  { label: 'Attendance Rate',      key: 'attendance_rate',      unit: '%' },
  { label: 'Training Completions', key: 'training_completions', unit: '#' },
  { label: 'Labor Hours',          key: 'labor_hours',          unit: '#' },
  { label: 'OT Hours',             key: 'ot_hours',             unit: '#' },
  { label: 'Disciplinary Actions', key: 'da_count',             unit: '#' },
  { label: 'Separations',          key: 'separations',          unit: '#' },
]

function Forecasts({ ds, config }) {
  const [horizon, setHorizon] = useState('30d')
  const fmtF = (v, unit) => (v == null ? dash : unit === '$' ? fmtK(v) : unit === '%' ? fmtPct(v) : (+v).toFixed(1))
  const costPerEmp = config.turnover_cost_per_emp ?? 4000
  const currency = config.currency ?? '$'

  const forecasts = useMemo(() => {
    const out = []
    for (const m of FORECAST_METRICS) {
      const vals = (ds.monthly || []).map(x => x[m.key]).filter(v => v != null).map(Number)
      if (vals.length < 3) continue
      const last3 = vals.slice(-3)
      if (last3.every(v => v === 0)) continue
      const avg = last3.reduce((a, b) => a + b, 0) / 3
      const trend = (last3[2] - last3[0]) / 2
      const conf = avg === 0 ? 'Low' : Math.abs(trend / avg) < 0.05 ? 'High' : Math.abs(trend / avg) < 0.15 ? 'Medium' : 'Low'
      out.push({ label: m.label, unit: m.unit, current: last3[2],
        f30: avg + trend, f60: avg + trend * 2, f90: avg + trend * 3, conf })
    }
    return out
  }, [ds.monthly])

  const s = ds.summary || {}
  const monthlySepRate = +s.seps_12mo / 12 || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 700 }}>FORECAST HORIZON</span>
        {[{ k: '30d', l: '30 Days' }, { k: '60d', l: '60 Days' }, { k: '90d', l: '90 Days' }].map(h => (
          <button key={h.k} onClick={() => setHorizon(h.k)} style={{
            background: horizon === h.k ? 'var(--t-accent)' : 'var(--t-surface-2)',
            color: horizon === h.k ? '#000' : 'var(--t-text)',
            border: '1px solid var(--t-line)', borderRadius: 4,
            padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{h.l}</button>
        ))}
      </div>

      <div style={{ ...card(), fontSize: 12, color: 'var(--t-text-muted)', padding: '10px 16px' }}>
        Projections use a linear trend over the last 3 months of recorded data. Confidence decreases with longer horizons. Not a substitute for operational judgment.
      </div>

      {forecasts.length === 0 ? (
        <EmptyCard>Not enough history to forecast — at least 3 months of recorded activity is required.</EmptyCard>
      ) : (
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 14 }}>Projected KPIs — Next {horizon === '30d' ? '30' : horizon === '60d' ? '60' : '90'} Days</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                  {['Metric','Current','Forecast','Confidence','Trend'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Metric' ? 'left' : 'right', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f, i) => {
                  const fval = horizon === '30d' ? f.f30 : horizon === '60d' ? f.f60 : f.f90
                  const pctChange = f.current !== 0 ? ((fval - f.current) / Math.abs(f.current)) * 100 : null
                  return (
                    <tr key={f.label} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{f.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-text-muted)' }}>{fmtF(f.current, f.unit)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--t-accent)', fontWeight: 700 }}>{fmtF(fval, f.unit)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <span className={f.conf === 'High' ? 'badge green' : f.conf === 'Medium' ? 'badge amber' : 'badge red'}>{f.conf}</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><TrendArrow pct={pctChange} size={12} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Headcount scenario — from real headcount + real trailing separation rate */}
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Headcount Scenario — If the Trailing Separation Rate Continues</div>
        {monthlySepRate === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            No separations recorded in the trailing 12 months — no projected attrition. Current headcount: <strong style={{ color: 'var(--t-text)' }}>{fmtN(s.headcount)}</strong>.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {[
              { label: 'Current Headcount',  value: `${fmtN(s.headcount)} employees`, note: 'active, assigned' },
              { label: 'Projected 30d Loss', value: `~${Math.ceil(monthlySepRate)} employee${Math.ceil(monthlySepRate) === 1 ? '' : 's'}`, note: `${monthlySepRate.toFixed(1)}/mo trailing rate`, warn: true },
              { label: 'Projected 90d Loss', value: `~${Math.ceil(monthlySepRate * 3)} employees`, note: 'if trend holds', warn: true },
              { label: 'Replacement Cost',   value: `${currency}${(costPerEmp * Math.ceil(monthlySepRate * 3)).toLocaleString()}`, note: `@ ${currency}${costPerEmp.toLocaleString()}/hire (configured)`, warn: true },
            ].map(x => (
              <div key={x.label} style={{ ...card({ padding: '12px 14px' }) }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{x.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: x.warn ? 'var(--t-warn)' : 'var(--t-success)' }}>{x.value}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{x.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 5: EXPORT (real rows fetched for the selected range) ──────────────────
function ddDownload(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

const METRIC_COL = {
  'Revenue': 'revenue', 'Sale Count': 'sale_count', 'Labor Hours': 'labor_hours',
  'OT Hours': 'ot_hours', 'Labor Cost': 'labor_cost', 'OT Cost': 'ot_cost',
  'Spiffs': 'spiff', 'Attendance %': 'attendance_rate', 'Training %': 'training_pct',
  'Disciplinary': 'da_count', 'Turnover %': 'turnover_pct', 'Headcount': 'headcount',
  'Risk Employees': 'risk_emp',
}
const ALL_METRICS = Object.keys(METRIC_COL)

function rangeDates(label) {
  const now = new Date()
  switch (label) {
    case 'This Week':    return [weekStartMon(now), now]
    case 'Last Month':   return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)]
    case 'Last 30 Days': return [daysAgo(30), now]
    case 'Last 90 Days': return [daysAgo(90), now]
    case 'YTD':          return [yearStart(now), now]
    case 'This Month':
    default:             return [monthStart(now), now]
  }
}

function buildCSV(metrics, rows) {
  const cols = metrics.filter(m => METRIC_COL[m])
  const head = ['Location', ...cols].join(',')
  const body = rows.map(r => [
    `"${r.name}"`, ...cols.map(m => r[METRIC_COL[m]] ?? ''),
  ].join(',')).join('\n')
  return head + '\n' + body
}
function buildExcel(metrics, rows) {
  const cols = metrics.filter(m => METRIC_COL[m])
  const th = ['Location', ...cols].map(c => `<th style="background:#1a2740;color:#fff;padding:6px 10px;text-align:left">${c}</th>`).join('')
  const trs = rows.map(r => `<tr><td style="padding:5px 10px;font-weight:bold">${r.name}</td>${cols.map(m => `<td style="padding:5px 10px">${r[METRIC_COL[m]] ?? ''}</td>`).join('')}</tr>`).join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0"><tr>${th}</tr>${trs}</table></body></html>`
}
function printBoardPack(metrics, rows, dateRange) {
  const cols = metrics.filter(m => METRIC_COL[m])
  const th = ['Location', ...cols].map(c => `<th>${c}</th>`).join('')
  const trs = rows.map(r => `<tr><td class="loc">${r.name}</td>${cols.map(m => `<td>${r[METRIC_COL[m]] ?? '—'}</td>`).join('')}</tr>`).join('')
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Twisted Growers Board Pack</title>
    <style>@page{margin:18mm}body{font-family:Arial,Helvetica,sans-serif;color:#111}
    .hdr{border-bottom:3px solid #00b4d8;padding-bottom:10px;margin-bottom:16px}
    .brand{font-size:22px;font-weight:900;letter-spacing:-.5px}.sub{color:#555;font-size:12px;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
    th{background:#0b2545;color:#fff;text-align:left;padding:8px 10px}
    td{padding:7px 10px;border-bottom:1px solid #ddd}.loc{font-weight:700}
    .foot{margin-top:20px;font-size:10px;color:#888}</style></head>
    <body><div class="hdr"><div class="brand">Twisted Growers — Executive Board Pack</div>
    <div class="sub">${dateRange} · ${rows.length} location(s) · Generated ${new Date().toLocaleString()}</div></div>
    <table><tr>${th}</tr>${trs}</table>
    <div class="foot">🔒 Live database export. Figures reflect the selected scope and range.</div></body></html>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 350)
}

const LS_SAVED_REPORTS = 'vip_saved_reports'

function ExportTab({ ds, nodeIds }) {
  const [selectedMetrics, setSelectedMetrics] = useState(['Revenue', 'Attendance %', 'Labor Hours', 'Training %'])
  const [dateRange, setDateRange] = useState('This Month')
  const [selectedLocs, setSelectedLocs] = useState(['All'])
  const [format, setFormat] = useState('CSV')
  const [exporting, setExporting] = useState(null)
  const [exportErr, setExportErr] = useState('')
  // saved, reusable report definitions — server-backed app_state store
  const [saved, setSaved] = useState(() => loadCached(LS_SAVED_REPORTS, {}))
  useEffect(() => { hydrate(LS_SAVED_REPORTS).then(v => { if (v && typeof v === 'object') setSaved(v) }) }, [])
  const saveReport = () => {
    const name = window.prompt('Save this report as:')
    if (!name) return
    const next = { ...saved, [name]: { selectedMetrics, selectedLocs, dateRange, format } }
    setSaved(next); saveSynced(LS_SAVED_REPORTS, next)
  }
  const loadReport = (name) => {
    const r = saved[name]; if (!r) return
    setSelectedMetrics(r.selectedMetrics || []); setSelectedLocs(r.selectedLocs || ['All'])
    setDateRange(r.dateRange || 'This Month'); setFormat(r.format || 'CSV')
  }
  const delReport = (name) => { const n = { ...saved }; delete n[name]; setSaved(n); saveSynced(LS_SAVED_REPORTS, n) }

  const locNames = (ds.locations || []).map(l => l.name)
  const toggleMetric = (m) => setSelectedMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  const toggleLoc = (l) => {
    if (l === 'All') { setSelectedLocs(['All']); return }
    setSelectedLocs(prev => {
      const without = prev.filter(x => x !== 'All')
      return without.includes(l) ? without.filter(x => x !== l) : [...without, l]
    })
  }

  // fetch REAL per-location rows for the requested range, then export
  const fetchRows = async (rangeLabel, locFilter) => {
    const [f, t] = rangeDates(rangeLabel)
    const wanted = (locFilter.includes('All') ? ds.locations : ds.locations.filter(l => locFilter.includes(l.name))) || []
    const ids = wanted.map(l => l.id)
    if (!ids.length) throw new Error('No locations selected')
    const { data, error } = await sb.rpc('get_analytics_summary', { p_node_ids: ids, p_date_from: iso(f), p_date_to: iso(t) })
    if (error) throw error
    return data?.locations || []
  }

  const doExport = async (type) => {
    setExporting(type); setExportErr('')
    const stamp = new Date().toISOString().slice(0, 10)
    try {
      if (type === 'custom') {
        const rows = await fetchRows(dateRange, selectedLocs)
        if (format === 'JSON') {
          const cols = selectedMetrics.filter(m => METRIC_COL[m])
          const out = rows.map(r => ({ location: r.name, ...Object.fromEntries(cols.map(m => [m, r[METRIC_COL[m]]])) }))
          ddDownload(`vip-analytics-custom-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json')
        } else if (format === 'Excel') {
          ddDownload(`vip-analytics-custom-${stamp}.xls`, buildExcel(selectedMetrics, rows), 'application/vnd.ms-excel')
        } else if (format === 'PDF') {
          printBoardPack(selectedMetrics, rows, dateRange)
        } else {
          ddDownload(`vip-analytics-custom-${stamp}.csv`, buildCSV(selectedMetrics, rows))
        }
      } else if (type === 'exec-pdf') {
        const rows = await fetchRows('This Month', ['All'])
        printBoardPack(ALL_METRICS, rows, 'This Month')
      } else {
        const presets = {
          'full-csv':    ALL_METRICS,
          'hr-csv':      ['Headcount', 'Training %', 'Disciplinary', 'Risk Employees', 'Attendance %', 'Turnover %'],
          'payroll-csv': ['Headcount', 'Labor Hours', 'OT Hours', 'Labor Cost', 'OT Cost', 'Spiffs'],
          'att-csv':     ['Headcount', 'Attendance %', 'Disciplinary', 'Risk Employees'],
        }
        const rows = await fetchRows(dateRange, ['All'])
        ddDownload(`vip-${type}-${stamp}.csv`, buildCSV(presets[type] || ALL_METRICS, rows))
      }
    } catch (e) {
      setExportErr(e.message || 'Export failed')
    }
    setTimeout(() => setExporting(null), 1200)
  }

  const quickExports = [
    { label: 'Executive Summary', sub: 'All KPIs by location, board-pack PDF', icon: '📊', type: 'exec-pdf' },
    { label: 'Full Data CSV', sub: 'All metrics, all locations, selected date range', icon: '📋', type: 'full-csv' },
    { label: 'HR Compliance Report', sub: 'Training, DAs, risk, attendance', icon: '⚖️', type: 'hr-csv' },
    { label: 'Payroll Summary', sub: 'Hours, OT, labor cost by location', icon: '💰', type: 'payroll-csv' },
    { label: 'Attendance Report', sub: 'Attendance, DAs and risk by location', icon: '📅', type: 'att-csv' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {exportErr && (
        <div style={{ ...card({ padding: '10px 16px' }), borderLeft: '3px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 12, fontWeight: 600 }}>
          Export failed: {exportErr}
        </div>
      )}
      {/* Quick exports */}
      <div>
        <SectionLabel>One-Click Reports</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {quickExports.map(q => (
            <div key={q.type} style={{ ...card({ padding: '14px 16px', cursor: 'pointer' }), display: 'flex', flexDirection: 'column', gap: 6 }}
              onClick={() => doExport(q.type)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{q.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{q.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{q.sub}</div>
                </div>
              </div>
              <button style={{
                marginTop: 6, padding: '6px 12px', borderRadius: 4, border: '1px solid var(--t-line)',
                background: exporting === q.type ? 'var(--t-success)' : 'var(--t-surface-2)',
                color: exporting === q.type ? '#fff' : 'var(--t-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                {exporting === q.type ? '⏳ Exporting…' : 'Export →'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom export builder */}
      <div>
        <SectionLabel>Custom Export Builder</SectionLabel>
        <div style={card()}>
          {/* saved, reusable report definitions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--t-line)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Saved reports</span>
            {Object.keys(saved).length === 0 && <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>None yet — build one and save it.</span>}
            {Object.keys(saved).map(n => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '3px 4px 3px 10px', fontSize: 11 }}>
                <button onClick={() => loadReport(n)} style={{ background: 'none', border: 'none', color: 'var(--t-accent)', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>{n}</button>
                <button onClick={() => delReport(n)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--t-text-faint)', cursor: 'pointer' }}>×</button>
              </span>
            ))}
            <button onClick={saveReport} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '5px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-accent)', cursor: 'pointer' }}>★ Save current</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {/* Metric picker */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Metrics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_METRICS.map(m => (
                  <button key={m} onClick={() => toggleMetric(m)} style={{
                    background: selectedMetrics.includes(m) ? 'var(--t-accent)' : 'var(--t-surface-2)',
                    color: selectedMetrics.includes(m) ? '#000' : 'var(--t-text)',
                    border: '1px solid var(--t-line)', borderRadius: 20,
                    padding: '3px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>{m}</button>
                ))}
              </div>
            </div>
            {/* Location picker — real locations in scope */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Locations</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['All', ...locNames].map(l => (
                  <button key={l} onClick={() => toggleLoc(l)} style={{
                    background: selectedLocs.includes(l) ? 'var(--t-accent)' : 'var(--t-surface-2)',
                    color: selectedLocs.includes(l) ? '#000' : 'var(--t-text)',
                    border: '1px solid var(--t-line)', borderRadius: 20,
                    padding: '3px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Date range + format */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, marginBottom: 6 }}>DATE RANGE</div>
              <select style={sel()} value={dateRange} onChange={e => setDateRange(e.target.value)}>
                {['This Week','This Month','Last Month','Last 30 Days','Last 90 Days','YTD'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, marginBottom: 6 }}>FORMAT</div>
              <select style={sel()} value={format} onChange={e => setFormat(e.target.value)}>
                {['CSV','PDF','Excel','JSON'].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={() => doExport('custom')} style={{
              padding: '8px 24px', background: 'var(--t-accent)', color: '#000',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}>
              {exporting === 'custom' ? '⏳ Exporting…' : `Export ${format} →`}
            </button>
          </div>

          {/* Selected summary */}
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--t-surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--t-text-muted)' }}>
            <strong style={{ color: 'var(--t-text)' }}>Export preview:</strong>{' '}
            {selectedMetrics.length} metrics × {selectedLocs.includes('All') ? `all ${locNames.length}` : selectedLocs.length} location(s) × {dateRange} → {format} (fetched live at export time)
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 6: TURNOVER ───────────────────────────────────────────────────────────
function TurnoverTab({ ds, nodeIds, config }) {
  const enabled = useFeatureFlag('turnover_cost')
  const costPerEmp = config.turnover_cost_per_emp ?? 4000
  const currency = config.currency ?? '$'
  const [drill, setDrill] = useState(null)
  const [hires, setHires] = useState(null)
  const [hiresErr, setHiresErr] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!enabled || !nodeIds?.length) return
    ;(async () => {
      const { data, error } = await sb.rpc('get_hires_list', { p_node_ids: nodeIds })
      if (cancelled) return
      if (error) { setHiresErr(error.message || 'Failed to load hires'); setHires([]) }
      else setHires(Array.isArray(data) ? data : [])
    })()
    return () => { cancelled = true }
  }, [enabled, nodeIds])

  if (!enabled) {
    return (
      <div style={{ ...card(), padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }

  const s = ds.summary || {}
  const yStart = iso(yearStart())
  const sepRows = (ds.seps || []).filter(r => (r.sep_date || '') >= yStart)
  const allSepRows = ds.seps || []
  const hireRows = hires || []
  const ytdSeps = +s.seps_ytd || sepRows.length
  const ytdHires = +s.hires_ytd || 0
  const netChange = ytdHires - ytdSeps
  const totalCost = ytdSeps * costPerEmp

  const reasons = {}
  for (const r of sepRows.length ? sepRows : allSepRows) {
    const k = r.sep_reason || 'Unrecorded'
    reasons[k] = (reasons[k] || 0) + 1
  }
  const reasonCounts = Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
  const reasonTotal = reasonCounts.reduce((a, b) => a + b.count, 0)

  const SEP_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'location', label: 'Location', value: r => r.location || dash },
    { key: 'sep_date', label: 'Last Day', value: r => r.sep_date || dash },
    { key: 'sep_reason', label: 'Reason', value: r => r.sep_reason || 'Unrecorded' },
    { key: 'rehire_status', label: 'Rehire Status', value: r => r.rehire_status || dash },
    { key: 'cost', label: 'Est. Cost', value: () => `${currency}${costPerEmp.toLocaleString()}`, align: 'right', sortKey: () => costPerEmp },
  ]
  const HIRE_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name },
    { key: 'location', label: 'Location', value: r => r.location || dash },
    { key: 'start_date', label: 'Start Date', value: r => r.start_date || dash },
    { key: 'role', label: 'Role', value: r => r.role || dash },
    { key: 'source', label: 'Status', value: r => r.source === 'employee' ? (r.still_active ? 'Active' : 'Inactive') : r.source.replace('intake_', 'Intake: ') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <KpiTile label="YTD Separations" value={fmtN(ytdSeps)} sub="from separation records" warn={ytdSeps > 0} good={ytdSeps === 0}
          onClick={() => setDrill({ title: 'YTD Separations', subtitle: `${sepRows.length} records`, columns: SEP_COLS, rows: sepRows, accent: 'var(--t-warn)' })} />
        <KpiTile label="YTD New Hires" value={fmtN(ytdHires)} sub="first assignment starts" good={ytdHires > 0} muted={ytdHires === 0}
          onClick={() => setDrill({ title: 'YTD New Hires', subtitle: `${hireRows.length} records`, columns: HIRE_COLS, rows: hireRows, accent: 'var(--t-success)' })} />
        <KpiTile label="Net Headcount Change" value={`${netChange >= 0 ? '+' : ''}${netChange}`} sub="hires − separations, YTD" good={netChange >= 0} warn={netChange < 0} />
        <KpiTile label="Est. Turnover Cost" value={`${currency}${totalCost.toLocaleString()}`} sub={`@ ${currency}${costPerEmp.toLocaleString()}/separation (configured)`} warn={totalCost > 0} good={totalCost === 0}
          onClick={() => setDrill({ title: 'Est. Turnover Cost — Separation Detail', subtitle: `${sepRows.length} separations × ${currency}${costPerEmp.toLocaleString()}`, columns: SEP_COLS, rows: sepRows, accent: 'var(--t-warn)' })} />
      </div>

      {hiresErr && <div style={{ fontSize: 12, color: 'var(--t-danger)' }}>Hire list unavailable: {hiresErr}</div>}

      {/* Separation log */}
      <div style={card()}>
        <SectionLabel>Separation Log</SectionLabel>
        {allSepRows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
            No separations recorded. Separations logged in Rehire Management appear here.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                  {['Employee', 'Location', 'Last Day', 'Reason', 'Rehire Status', 'Est. Cost'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Employee' ? 'left' : 'center', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSepRows.map((r, i) => (
                  <tr key={r.id || i} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{r.name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>{r.location || dash}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>{r.sep_date || dash}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text)' }}>{r.sep_reason || 'Unrecorded'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span className={r.rehire_status === 'eligible' ? 'badge green' : r.rehire_status === 'conditional' ? 'badge amber' : 'badge red'}>{r.rehire_status || dash}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-warn)', fontWeight: 700 }}>
                      {currency}{costPerEmp.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Turnover by reason */}
      <div style={card()}>
        <SectionLabel>Turnover by Reason</SectionLabel>
        {reasonCounts.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--t-text-muted)', fontSize: 12 }}>No separation reasons recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reasonCounts.map(({ reason, count }) => {
              const pct = Math.round((count / reasonTotal) * 100)
              return (
                <div key={reason} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t-text)', fontWeight: 600 }}>
                    <span>{reason}</span>
                    <span style={{ color: 'var(--t-text-muted)' }}>{count} of {reasonTotal} — {pct}%</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--t-surface-2)', borderRadius: 0, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--t-accent)', opacity: 0.75 + (count / reasonTotal) * 0.25 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── TAB 7: WRITE-UP TRENDS (grouped live DA rows) ─────────────────────────────
function WriteUpTrendsTab({ ds }) {
  const enabled = useFeatureFlag('writeup_trends')
  const [drill, setDrill] = useState(null)

  const das90 = useMemo(() => {
    const min = iso(daysAgo(90))
    return (ds.das || []).filter(d => (d.da_date || '') >= min)
  }, [ds.das])

  const byIssuer = useMemo(() => {
    const g = {}
    for (const d of das90) {
      const k = d.issuer_name || 'Unrecorded issuer'
      g[k] = g[k] || { name: k, total: 0, verbal: 0, written: 0, final: 0, other: 0, resolved: 0, locs: new Set() }
      g[k].total += 1
      const t = (d.da_type || '').toLowerCase()
      if (t.includes('verbal')) g[k].verbal += 1
      else if (t.includes('written')) g[k].written += 1
      else if (t.includes('final') || t.includes('term')) g[k].final += 1
      else g[k].other += 1
      if (d.status && d.status !== 'active') g[k].resolved += 1
      if (d.node_id) g[k].locs.add(d.node_id)
    }
    return Object.values(g).map(r => ({ ...r, loc: `${r.locs.size} location${r.locs.size === 1 ? '' : 's'}`, resolvedPct: r.total ? Math.round((r.resolved / r.total) * 100) : 0 })).sort((a, b) => b.total - a.total)
  }, [das90])

  const byType = useMemo(() => {
    const now45 = iso(daysAgo(45)), prev90 = iso(daysAgo(90))
    const g = {}
    for (const d of das90) {
      const k = d.da_type || 'unspecified'
      g[k] = g[k] || { type: k, count: 0, recent: 0, prior: 0 }
      g[k].count += 1
      if ((d.da_date || '') >= now45) g[k].recent += 1
      else if ((d.da_date || '') >= prev90) g[k].prior += 1
    }
    return Object.values(g).map(v => ({ ...v, trend: v.recent > v.prior ? '↑' : v.recent < v.prior ? '↓' : '→' })).sort((a, b) => b.count - a.count)
  }, [das90])

  const byLocation = useMemo(() => {
    const nameById = Object.fromEntries((ds.locations || []).map(l => [l.id, l.name]))
    const g = {}
    for (const d of das90) {
      const k = nameById[d.node_id] || dash
      g[k] = (g[k] || 0) + 1
    }
    return Object.entries(g).map(([loc, count]) => ({ loc, count })).sort((a, b) => b.count - a.count)
  }, [das90, ds.locations])

  if (!enabled) {
    return (
      <div style={{ ...card(), padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }

  const totalDAs = das90.length
  const totalResolved = das90.filter(d => d.status && d.status !== 'active').length
  const resolvedPct = totalDAs ? Math.round((totalResolved / totalDAs) * 100) : null
  const topType = byType[0]?.type
  const topLoc = byLocation[0]?.loc

  const MGR_COLS = [
    { key: 'name', label: 'Issued By', value: r => r.name },
    { key: 'loc', label: 'Scope', value: r => r.loc },
    { key: 'total', label: 'Total DAs', value: r => r.total, align: 'right', sortKey: r => r.total },
    { key: 'verbal', label: 'Verbal', value: r => r.verbal, align: 'right', sortKey: r => r.verbal },
    { key: 'written', label: 'Written', value: r => r.written, align: 'right', sortKey: r => r.written },
    { key: 'final', label: 'Final/Term', value: r => r.final, align: 'right', sortKey: r => r.final },
    { key: 'resolvedPct', label: 'Resolved %', value: r => `${r.resolvedPct}%`, align: 'right', sortKey: r => r.resolvedPct },
  ]
  const TYPE_COLS = [
    { key: 'type', label: 'Action Type', value: r => r.type },
    { key: 'count', label: 'Count', value: r => r.count, align: 'right', sortKey: r => r.count },
    { key: 'pct', label: '% of Total', value: r => totalDAs ? `${((r.count / totalDAs) * 100).toFixed(1)}%` : dash, align: 'right', sortKey: r => r.count },
    { key: 'trend', label: 'Trend', value: r => r.trend, align: 'center' },
  ]
  const DA_COLS = [
    { key: 'person_name', label: 'Employee', value: r => r.person_name },
    { key: 'da_type', label: 'Type', value: r => r.da_type },
    { key: 'da_date', label: 'Date', value: r => r.da_date },
    { key: 'status', label: 'Status', value: r => r.status },
    { key: 'issuer_name', label: 'Issued By', value: r => r.issuer_name || dash },
    { key: 'description', label: 'Description', value: r => r.description },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <KpiTile label="Total DAs — 90 Days" value={fmtN(totalDAs)} sub="last 90 days" warn={totalDAs > 0} good={totalDAs === 0}
          onClick={() => setDrill({ title: 'Disciplinary Actions — 90 Days', subtitle: `${totalDAs} records`, columns: DA_COLS, rows: das90, accent: 'var(--t-warn)' })} />
        <KpiTile label="Most Issued Type" value={topType || dash} sub="by volume" muted
          onClick={() => setDrill({ title: 'DAs by Action Type', subtitle: `${byType.length} types`, columns: TYPE_COLS, rows: byType, accent: 'var(--t-accent)' })} />
        <KpiTile label="Highest Volume Location" value={topLoc || dash} sub="90-day period" warn={!!topLoc} muted={!topLoc}
          onClick={() => setDrill({ title: 'DA Volume by Issuer', subtitle: `${byIssuer.length} issuers`, columns: MGR_COLS, rows: byIssuer, accent: 'var(--t-warn)' })} />
        <KpiTile label="Resolution Rate" value={resolvedPct == null ? dash : `${resolvedPct}%`} sub={`${totalResolved} of ${totalDAs} closed`} good={resolvedPct >= 70} muted={resolvedPct == null}
          onClick={() => setDrill({ title: 'Resolution by Issuer', subtitle: `${byIssuer.length} issuers`, columns: MGR_COLS, rows: byIssuer, accent: 'var(--t-accent)' })} />
      </div>

      {totalDAs === 0 ? (
        <EmptyCard>No disciplinary actions recorded in the last 90 days for this scope.</EmptyCard>
      ) : (
        <>
          {/* DAs by issuer */}
          <div style={card()}>
            <SectionLabel>DAs by Issuer — Last 90 Days</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                    {['Issued By', 'Scope', 'Total DAs', 'Verbal', 'Written', 'Final/Term', 'Resolved %'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Issued By' ? 'left' : 'center', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byIssuer.map((r, i) => {
                    const isHigh = r.total >= 8
                    const rowBg = isHigh ? 'rgba(255,59,48,0.08)' : i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)'
                    return (
                      <tr key={r.name} style={{ background: rowBg, borderBottom: '1px solid var(--t-line)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)' }}>
                          {r.name}
                          {isHigh && <div style={{ fontSize: 10, color: 'var(--t-danger)', fontWeight: 600, marginTop: 2 }}>High volume — review management approach</div>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>{r.loc}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: isHigh ? 'var(--t-danger)' : 'var(--t-text)' }}>{r.total}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text)' }}>{r.verbal}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text)' }}>{r.written}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text)' }}>{r.final}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: r.resolvedPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)', fontWeight: 600 }}>{r.resolvedPct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DAs by action type */}
          <div style={card()}>
            <SectionLabel>DAs by Action Type — Last 90 Days</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                    {['Type', 'Count', '% of Total', 'Trend (45d vs prior 45d)'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Type' ? 'left' : 'center', color: 'var(--t-text-muted)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byType.map((v, i) => {
                    const pct = totalDAs ? ((v.count / totalDAs) * 100).toFixed(1) : '0.0'
                    const trendColor = v.trend === '↑' ? 'var(--t-danger)' : v.trend === '↓' ? 'var(--t-success)' : 'var(--t-text-muted)'
                    return (
                      <tr key={v.type} style={{ background: i % 2 === 0 ? 'var(--t-surface)' : 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)', textTransform: 'capitalize' }}>{v.type}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text)', fontWeight: 700 }}>{v.count}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>{pct}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontSize: 15, color: trendColor }}>{v.trend}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── TAB 8: SCORECARDS (per-location, from live metrics) ───────────────────────
const MGR_ROLE = /manager|gm\b|general manager|supervisor|lead/i

function ScorecardsTab({ ds }) {
  const enabled = useFeatureFlag('manager_scorecards')

  const cards = useMemo(() => {
    const das90min = iso(daysAgo(90))
    const dasByNode = {}
    for (const d of ds.das || []) {
      if ((d.da_date || '') < das90min) continue
      dasByNode[d.node_id] = (dasByNode[d.node_id] || 0) + 1
    }
    const mgrsByNode = {}
    for (const p of ds.attendance || []) {
      if (MGR_ROLE.test(p.role || '')) {
        mgrsByNode[p.node_id] = mgrsByNode[p.node_id] || []
        mgrsByNode[p.node_id].push(p.full_name)
      }
    }
    return (ds.locations || []).map(l => {
      const att = l.attendance_rate      // may be null
      const trn = l.training_pct         // may be null
      const das = dasByNode[l.id] || 0
      const otShare = +l.labor_hours > 0 ? (+l.ot_hours / +l.labor_hours) * 100 : null
      const daScore = Math.max(0, 100 - das * 20)
      const coScore = Math.max(0, 100 - (+l.callouts || 0) * 10)
      const otScore = otShare == null ? null : Math.max(0, 100 - otShare * 5)
      const parts = [
        { v: att,     w: 0.25 }, { v: trn, w: 0.25 }, { v: daScore, w: 0.2 },
        { v: coScore, w: 0.15 }, { v: otScore, w: 0.15 },
      ].filter(p => p.v != null)
      const wSum = parts.reduce((a, p) => a + p.w, 0)
      const overall = wSum > 0 ? Math.round(parts.reduce((a, p) => a + p.v * p.w, 0) / wSum) : null
      const scoreColor = overall == null ? 'var(--t-text-muted)' : overall >= 85 ? 'var(--t-success)' : overall >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'
      const dot = (v, lo, hi, invert = false) => {
        if (v == null) return 'var(--t-text-muted)'
        const good = invert ? v <= hi : v >= hi
        const mid = invert ? v <= lo : v >= lo
        return good ? 'var(--t-success)' : mid ? 'var(--t-warn)' : 'var(--t-danger)'
      }
      return {
        node_id: l.id, name: l.name,
        managers: mgrsByNode[l.id] || [],
        overall, scoreColor,
        metrics: [
          { label: 'Attendance Rate (MTD)',     display: mayPct(att), dot: dot(att, 85, 92) },
          { label: 'Training Compliance',       display: mayPct(trn), dot: dot(trn, 70, 85) },
          { label: 'DAs Issued (90d)',          display: fmtN(das),   dot: das === 0 ? 'var(--t-success)' : das <= 2 ? 'var(--t-warn)' : 'var(--t-danger)' },
          { label: 'Callouts (MTD)',            display: fmtN(l.callouts), dot: +l.callouts === 0 ? 'var(--t-success)' : +l.callouts <= 3 ? 'var(--t-warn)' : 'var(--t-danger)' },
          { label: 'OT Share of Hours',         display: otShare == null ? dash : fmtPct(otShare), dot: dot(otShare, 12, 8, true) },
          { label: 'Headcount',                 display: fmtN(l.headcount), dot: 'var(--t-text-muted)' },
        ],
      }
    })
  }, [ds])

  if (!enabled) {
    return (
      <div style={{ ...card(), padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }

  if (!cards.length) return <EmptyCard>No locations in scope.</EmptyCard>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionLabel>Location / Manager Scorecards — Live Metrics</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <div key={c.node_id} style={{ ...card({ padding: 0 }), overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                  {c.managers.length ? c.managers.join(', ') : 'No manager-role assignment on roster'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: c.scoreColor, lineHeight: 1 }}>{c.overall == null ? dash : c.overall}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>/ 100</div>
              </div>
            </div>

            {/* Metric rows */}
            <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {c.metrics.map(met => (
                <div key={met.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: met.dot, flexShrink: 0 }} />
                    <span style={{ color: 'var(--t-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{met.label}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--t-text)', marginLeft: 8, flexShrink: 0 }}>{met.display}</span>
                </div>
              ))}
            </div>

            {/* Card footer */}
            <div style={{ padding: '8px 18px', borderTop: '1px solid var(--t-line)', fontSize: 10, color: 'var(--t-text-faint)', fontWeight: 600 }}>
              Last updated: {ds.refreshedAt ? ds.refreshedAt.toLocaleString() : dash}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ROOT COMPONENT ────────────────────────────────────────────────────────────
export default function Analytics() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const config = useConfig()
  const role = session?.person?.role_name || ''
  const [tab, setTab] = useState('Executive Summary')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [ds, setDs] = useState(null)
  const [drill, setDrill] = useState(null)

  const TABS = ['Executive Summary', 'Trends', 'Anomaly Detector', 'Forecasts', 'Export', 'Turnover', 'Write-Up Trends', 'Scorecards']

  const nodeIds = useMemo(() => {
    if (locationIds && locationIds.length) return locationIds
    return getSession().nodes || []
  }, [locationIds])

  const load = useCallback(async () => {
    if (!nodeIds.length) { setErr('No locations in scope for your login.'); setLoading(false); setDs(null); return }
    setLoading(true); setErr('')
    try {
      const now = new Date(); const t = iso(now)
      // batched (≤4 concurrent) to respect the connection pool
      const [sumRes, monRes, attRes, daRes] = await Promise.all([
        sb.rpc('get_analytics_summary', { p_node_ids: nodeIds, p_date_from: iso(monthStart(now)), p_date_to: t }),
        sb.rpc('get_analytics_monthly', { p_node_ids: nodeIds, p_months: 12 }),
        sb.rpc('get_attendance_overview', { p_node_ids: nodeIds }),
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }),
      ])
      const [trainRes, salesRes, timeRes, sepRes] = await Promise.all([
        sb.rpc('get_training_overview', { p_node_ids: nodeIds }),
        sb.rpc('get_sales_summary', { p_node_ids: nodeIds, p_date_from: iso(daysAgo(90)), p_date_to: t }),
        sb.rpc('get_all_time_entries', { p_node_ids: nodeIds, p_date_from: iso(daysAgo(35)), p_date_to: t }),
        sb.rpc('rehire_list', { p_node_ids: nodeIds }),
      ])
      if (sumRes.error) throw sumRes.error
      const payload = sumRes.data || {}
      if (payload.ok === false) throw new Error(payload.error || 'Analytics summary unavailable')
      setDs({
        summary:     payload.summary || null,
        locations:   payload.locations || [],
        monthly:     (!monRes.error && Array.isArray(monRes.data)) ? monRes.data : [],
        attendance:  (!attRes.error && Array.isArray(attRes.data)) ? attRes.data : [],
        das:         (!daRes.error && Array.isArray(daRes.data)) ? daRes.data : [],
        training:    (!trainRes.error && Array.isArray(trainRes.data)) ? trainRes.data : [],
        sales90:     (!salesRes.error && salesRes.data) ? salesRes.data : { daily: [] },
        timeEntries: (!timeRes.error && Array.isArray(timeRes.data)) ? timeRes.data : [],
        seps:        (!sepRes.error && Array.isArray(sepRes.data)) ? sepRes.data : [],
        refreshedAt: new Date(),
      })
    } catch (e) {
      setErr(e?.message || 'Failed to load analytics data')
      setDs(null)
    } finally {
      setLoading(false)
    }
  }, [nodeIds])

  useEffect(() => { load() }, [load])

  const insights = useMemo(() => buildInsights(ds), [ds])

  if (!isHR(role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>HR Access Required</div>
        <div style={{ fontSize: 13 }}>Analytics is restricted to HR Manager and above.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>📊</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>Analytics &amp; Intelligence</h1>
            <span className="badge purple">HR / Executive</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            Enterprise reporting hub — trends, anomalies, forecasts and insights
            {ds?.locations?.length ? ` across ${ds.locations.length} location${ds.locations.length === 1 ? '' : 's'}` : ''} (live data)
          </div>
        </div>
        <button onClick={load} style={{
          background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
          color: 'var(--t-accent)', borderRadius: 6, padding: '8px 16px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ ...card({ marginBottom: 24 }), textAlign: 'center', padding: 32, color: 'var(--t-text-muted)' }}>
          Loading analytics data…
        </div>
      ) : err || !ds ? (
        <div style={{ ...card({ marginBottom: 24 }), textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-danger)', marginBottom: 6 }}>Couldn’t load analytics</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14 }}>{err || 'No data returned for this scope.'}</div>
          <button onClick={load} style={{
            background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-accent)',
            borderRadius: 6, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Retry</button>
        </div>
      ) : (
        <>
          <KpiPanel ds={ds} insights={insights} openDrill={setDrill} />

          {/* Tab navigation */}
          <TabBar tabs={TABS} active={tab} onSelect={setTab} />

          {/* Tab content */}
          {tab === 'Executive Summary' && <ExecSummary ds={ds} insights={insights} nodeIds={nodeIds} />}
          {tab === 'Trends'           && <Trends ds={ds} nodeIds={nodeIds} />}
          {tab === 'Anomaly Detector' && <AnomalyDetector ds={ds} />}
          {tab === 'Forecasts'        && <Forecasts ds={ds} config={config} />}
          {tab === 'Export'           && <ExportTab ds={ds} nodeIds={nodeIds} />}
          {tab === 'Turnover'         && <TurnoverTab ds={ds} nodeIds={nodeIds} config={config} />}
          {tab === 'Write-Up Trends'  && <WriteUpTrendsTab ds={ds} />}
          {tab === 'Scorecards'       && <ScorecardsTab ds={ds} />}
        </>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
