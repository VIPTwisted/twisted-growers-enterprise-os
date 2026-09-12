import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── Date utilities ────────────────────────────────────────────────────────────

const _today = new Date()
const fmtIso  = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const TODAY    = fmtIso(_today)
const TOMORROW = fmtIso(addDays(_today, 1))
const WEEK_END = fmtIso(addDays(_today, 7))

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmtDate = (str) => {
  if (!str) return '—'
  const d = new Date(String(str).slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
}

const fmtDateTime = (str) => {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return '—'
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── Live-data mapping (forensic_callouts → gap rows) ──────────────────────────

// Urgency is DERIVED from real fields: short-staffed callouts today are critical,
// short-staffed or near-term ones are high, the rest normal.
function calloutUrgency(c) {
  if (c.covered) return 'normal'
  if (c.short_staffed && c.date <= TODAY) return 'critical'
  if (c.short_staffed || c.date <= TOMORROW) return 'high'
  return 'normal'
}

function mapCallout(c) {
  const g = {
    id:            c.exception_id,
    node:          c.node || '—',
    date:          String(c.callout_date || '').slice(0, 10),
    slot:          c.shift_slot || '—',
    employee:      c.employee || '—',
    employee_id:   c.employee_id || null,
    reason:        c.reason || '',
    type:          c.exception_type || 'callout',
    covered:       !!c.covered,
    covered_by:    c.covered_by || null,
    short_staffed: !!c.short_staffed,
    reported_at:   c.reported_at || null,
  }
  g.status  = g.covered ? 'filled' : 'open'
  g.urgency = calloutUrgency(g)
  return g
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page:       { padding: '0 0 48px 0', minHeight: '100vh', background: 'var(--t-bg, #070b14)' },
  pageHeader: { padding: '20px 24px 16px', borderBottom: '1px solid var(--t-line)' },
  pageTitle:  { fontSize: 20, fontWeight: 800, color: 'var(--t-text)', margin: 0, letterSpacing: '-0.3px' },
  pageSub:    { fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 },
  body:       { padding: '20px 24px' },

  // KPI grid
  kpiGrid: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 16 }),
  kpiTile: (variant) => ({
    background: variant === 'danger'  ? 'rgba(255,77,125,0.07)'
              : variant === 'success' ? 'rgba(42,214,160,0.05)'
              : 'var(--t-surface)',
    border: `1px solid ${variant === 'danger' ? 'rgba(255,77,125,0.25)' : variant === 'success' ? 'rgba(42,214,160,0.18)' : 'var(--t-line)'}`,
    padding: '14px 16px',
  }),
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 },
  kpiValue: (color) => ({ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || 'var(--t-text)' }),
  kpiSub:   { fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 },

  // Section label
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 10 },

  // Location summary table
  locTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 20 },
  th:       { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-text-muted)', borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface)', whiteSpace: 'nowrap' },
  td:       { padding: '10px 14px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', verticalAlign: 'middle' },

  // Tabs
  tabBar: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 },
  tab:    (active) => ({ padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent', letterSpacing: '0.04em', marginBottom: -1 }),

  // Cards
  card:       { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 12 },
  cardHead:   { padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle:  { fontSize: 12, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  cardBody:   { padding: 16 },

  // Gap card
  gapCard: (urgency) => ({
    background: urgency === 'critical' ? 'rgba(255,77,125,0.06)' : urgency === 'high' ? 'rgba(255,179,71,0.04)' : 'var(--t-surface-2)',
    border: `1px solid ${urgency === 'critical' ? 'rgba(255,77,125,0.28)' : urgency === 'high' ? 'rgba(255,179,71,0.22)' : 'var(--t-line)'}`,
    padding: '14px 16px',
    marginBottom: 10,
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 12,
    alignItems: 'start',
  }),
  gapMeta:     { display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--t-text-muted)', marginTop: 6 },
  gapActions:  { display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },

  // Employee card (Find Coverage)
  empCard: (highlight) => ({
    background: highlight ? 'rgba(42,214,160,0.04)' : 'var(--t-surface-2)',
    border: `1px solid ${highlight ? 'rgba(42,214,160,0.18)' : 'var(--t-line)'}`,
    padding: '12px 14px',
    marginBottom: 8,
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 10,
    alignItems: 'center',
  }),
  empName: { fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 3 },
  empMeta: { fontSize: 12, color: 'var(--t-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '3px 12px' },

  // Swap card
  swapCard: { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 16px', marginBottom: 10 },

  // Loc group header
  locGroup: { background: 'var(--t-surface-2)', borderTop: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)', padding: '8px 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-text-faint)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 },

  // Split layout
  split: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' },

  // Buttons
  btn:     { padding: '8px 16px', fontSize: 12, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em' },
  btnSm:   { padding: '6px 12px', fontSize: 11, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em' },
  btnAccent:  { background: 'var(--t-accent)', color: '#000', border: '1px solid var(--t-accent)' },
  btnSuccess: { background: 'rgba(42,214,160,0.15)', color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.28)' },
  btnDanger:  { background: 'rgba(255,77,125,0.14)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.28)' },

  // Form elements
  select:   { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' },
  input:    { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', resize: 'vertical', minHeight: 70 },
  label:    { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 5 },
  formRow:  { marginBottom: 14 },

  // Modal
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal:     { background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' },
  modalHead: { padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle:{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' },
  modalBody: { padding: 20 },
  modalFoot: { padding: '14px 20px', borderTop: '1px solid var(--t-line)', display: 'flex', gap: 8, justifyContent: 'flex-end' },

  // Toast
  toast: (type) => ({
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: type === 'success' ? '#2ad6a0' : type === 'error' ? '#ff4d7d' : 'var(--t-accent)',
    color: type === 'info' ? '#000' : '#fff',
    padding: '12px 20px', fontWeight: 700, fontSize: 13,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  }),

  // Empty / error
  empty:  { padding: '32px 20px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 },
  errBox: { padding: '10px 14px', background: 'rgba(255,77,125,0.12)', border: '1px solid rgba(255,77,125,0.28)', color: '#ff4d7d', fontSize: 12, fontWeight: 600, marginBottom: 12 },

  // Divider
  divider: { height: 1, background: 'var(--t-line)', margin: '14px 0' },
}

// ─── Utility helpers ───────────────────────────────────────────────────────────

function Bdg({ variant, children }) {
  return <span className={`badge ${variant}`}>{children}</span>
}

function urgencyBdg(urgency) {
  if (urgency === 'critical') return <Bdg variant="red">CRITICAL</Bdg>
  if (urgency === 'high')     return <Bdg variant="amber">HIGH</Bdg>
  return <Bdg variant="green">NORMAL</Bdg>
}

function statusBdg(status) {
  if (status === 'open')    return <Bdg variant="red">OPEN</Bdg>
  if (status === 'filling') return <Bdg variant="amber">FILLING</Bdg>
  if (status === 'filled')  return <Bdg variant="green">FILLED</Bdg>
  return <Bdg variant="green">{String(status || '').toUpperCase()}</Bdg>
}

function otRiskBdg(hours) {
  if (hours >= 40) return <Bdg variant="red">OT RISK</Bdg>
  if (hours >= 37) return <Bdg variant="amber">NEAR OT</Bdg>
  return null
}

// Reliability = accepted / (accepted + declined) from the REAL call-attempt log.
function reliabilityScore(accepted, declined) {
  const total = (accepted || 0) + (declined || 0)
  return total === 0 ? 100 : Math.round(((accepted || 0) / total) * 100)
}

const scoreColor = (n) => n >= 80 ? '#2ad6a0' : n >= 50 ? '#ffb800' : '#ff4d7d'

function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const show = useCallback((msg, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ msg, type })
    timerRef.current = setTimeout(() => setToast(null), 3200)
  }, [])
  return { toast, show }
}

// ─── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, valueColor, variant, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined}
      style={{ ...S.kpiTile(variant), cursor: onClick ? 'pointer' : 'default' }}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue(valueColor)}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  )
}

// ─── Drill-down column sets — real rows behind each metric ─────────────────────

const GAP_COLS = [
  { key: 'date', label: 'Date', value: g => fmtDate(g.date), sortKey: g => g.date },
  { key: 'node', label: 'Location', value: g => g.node },
  { key: 'slot', label: 'Shift', value: g => g.slot },
  { key: 'type', label: 'Type', value: g => (g.type || '').replace('_', ' ').toUpperCase() },
  { key: 'employee', label: 'Called Out', value: g => g.employee },
  { key: 'covered_by', label: 'Covered By', value: g => g.covered_by || '—' },
  { key: 'urgency', label: 'Urgency', value: g => (g.urgency || '').toUpperCase() },
  { key: 'status', label: 'Status', value: g => (g.status || '').toUpperCase() },
]
const EMP_COLS = [
  { key: 'name', label: 'Employee', value: e => e.name },
  { key: 'location', label: 'Location', value: e => e.location },
  { key: 'role', label: 'Role', value: e => e.role },
  { key: 'hours_week', label: 'Hrs/Wk', value: e => `${e.hours_week}h`, align: 'right', sortKey: e => e.hours_week },
  { key: 'availability', label: 'Availability', value: e => e.availability },
  { key: 'on_call', label: 'On-Call', value: e => (e.on_call ? 'Yes' : 'No') },
  { key: 'reliability', label: 'Reliability', value: e => `${reliabilityScore(e.accepted, e.declined)}%`, align: 'right', sortKey: e => reliabilityScore(e.accepted, e.declined) },
]
const STAFF_COLS = [
  { key: 'date', label: 'Date', value: r => fmtDate(r.date), sortKey: r => r.date },
  { key: 'node', label: 'Location', value: r => r.node },
  { key: 'required', label: 'Required', value: r => r.required, align: 'right', sortKey: r => r.required },
  { key: 'scheduled', label: 'Scheduled', value: r => r.scheduled, align: 'right', sortKey: r => r.scheduled },
  { key: 'gap', label: 'Gap', value: r => r.gap, align: 'right', sortKey: r => r.gap },
]

// ─── KPI Panel ─────────────────────────────────────────────────────────────────

function KpiPanel({ callouts, staffing, onCallRows, board, employees, locNames, onDrill }) {
  const todayCallouts = callouts.filter(g => g.date === TODAY)
  const openToday     = todayCallouts.filter(g => !g.covered)
  const filledToday   = todayCallouts.filter(g => g.covered)
  const rateToday     = todayCallouts.length === 0 ? 100 : Math.round((filledToday.length / todayCallouts.length) * 100)

  const staffToday      = staffing.filter(r => r.date === TODAY)
  const understaffRows  = staffToday.filter(r => r.gap > 0)
  const overstaffRows   = staffToday.filter(r => r.scheduled > r.required)
  const understaffed    = new Set(understaffRows.map(r => r.node)).size
  const overstaffed     = new Set(overstaffRows.map(r => r.node)).size

  const onCallEmps = employees.filter(e => e.on_call)
  const urgentGaps = callouts.filter(g => !g.covered && (g.urgency === 'critical' || g.urgency === 'high') && g.date >= TODAY && g.date <= TOMORROW)

  const weekGaps   = callouts.filter(g => g.date >= TODAY && g.date <= WEEK_END)
  const wOpen      = weekGaps.filter(g => !g.covered)
  const weekAgo    = fmtIso(addDays(_today, -7))
  const coveredWk  = callouts.filter(g => g.covered && g.date >= weekAgo && g.date <= TODAY)
  const sameDayWk  = weekGaps.filter(g => g.covered)

  const openPosts       = board.filter(b => b.status === 'open')
  const pendingVols     = board.reduce((s, b) => s + (b.volunteers || []).filter(v => String(v.status || 'pending').toLowerCase() === 'pending').length, 0)

  const drillGaps = (title, rows, accent) => onDrill && onDrill({
    title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: GAP_COLS, rows, accent,
  })
  const drillEmps = (title, rows, accent) => onDrill && onDrill({
    title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: EMP_COLS, rows, accent,
  })
  const drillStaff = (title, rows, accent) => onDrill && onDrill({
    title, subtitle: `${rows.length} location-day${rows.length === 1 ? '' : 's'}`, columns: STAFF_COLS, rows, accent,
  })

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={S.sectionLabel}>Live Coverage — Today</div>
      <div style={S.kpiGrid(6)}>
        <KpiTile label="Gaps Right Now"      value={openToday.length}   sub="unfilled callouts today"  valueColor={openToday.length > 0 ? '#ff4d7d' : '#2ad6a0'}  variant={openToday.length > 0 ? 'danger' : 'success'} onClick={() => drillGaps('Gaps Right Now — Unfilled Today', openToday, '#ff4d7d')} />
        <KpiTile label="Coverage Rate Today" value={`${rateToday}%`}    sub="callouts covered"          valueColor={rateToday < 80 ? '#ff4d7d' : '#2ad6a0'} onClick={() => drillGaps("Today's Callouts", todayCallouts, 'var(--t-accent)')} />
        <KpiTile label="Understaffed Locs"   value={understaffed}       sub="below required staffing"   valueColor={understaffed > 0 ? '#ff4d7d' : '#2ad6a0'} variant={understaffed > 0 ? 'danger' : null} onClick={() => drillStaff('Understaffed — Required vs Scheduled (Today)', understaffRows, '#ff4d7d')} />
        <KpiTile label="Overstaffed Locs"    value={overstaffed}        sub="above required staffing"   onClick={() => drillStaff('Overstaffed — Required vs Scheduled (Today)', overstaffRows, 'var(--t-accent)')} />
        <KpiTile label="Available to Cover"  value={onCallRows.length}  sub="on-call roster"            valueColor="var(--t-accent)" onClick={() => drillEmps('Available to Cover — On-Call Roster', onCallEmps, 'var(--t-accent)')} />
        <KpiTile label="Urgent Fills Needed" value={urgentGaps.length}  sub="critical + high next 24h"  valueColor={urgentGaps.length > 0 ? '#ff4d7d' : 'var(--t-text)'} variant={urgentGaps.length > 0 ? 'danger' : null} onClick={() => drillGaps('Urgent Fills — Critical + High (24h)', urgentGaps, '#ff4d7d')} />
      </div>

      <div style={S.sectionLabel}>7-Day Outlook</div>
      <div style={S.kpiGrid(6)}>
        <KpiTile label="Callout Gaps This Week" value={weekGaps.length} sub="today + next 7 days"      onClick={() => drillGaps('Callout Gaps — Next 7 Days', weekGaps, 'var(--t-accent)')} />
        <KpiTile label="Gaps Unfilled"          value={wOpen.length}    sub="still open this week"      valueColor={wOpen.length > 6 ? '#ff4d7d' : 'var(--t-text)'} onClick={() => drillGaps('Unfilled Gaps — This Week', wOpen, '#ff4d7d')} />
        <KpiTile label="Filled This Week"       value={sameDayWk.length} sub="covered in window"        valueColor="#2ad6a0" onClick={() => drillGaps('Filled Gaps — This Week', sameDayWk, '#2ad6a0')} />
        <KpiTile label="Covered Last 7 Days"    value={coveredWk.length} sub="confirmed covers"         valueColor="#2ad6a0" onClick={() => drillGaps('Covered Callouts — Last 7 Days', coveredWk, '#2ad6a0')} />
        <KpiTile label="Swap Posts Open"        value={openPosts.length} sub="on the swap board"        valueColor="var(--t-accent)" />
        <KpiTile label="Volunteers Pending"     value={pendingVols}      sub="awaiting confirmation"    valueColor={pendingVols > 0 ? '#ffb800' : 'var(--t-text)'} />
      </div>

      <div style={S.sectionLabel}>By Location — Today</div>
      <table style={S.locTable}>
        <thead>
          <tr>
            {['Location', 'Open Gaps Today', 'Filled', 'Rate %', 'Staffing Gap', 'On-Call Available'].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {locNames.length === 0 ? (
            <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)' }}>No locations in scope.</td></tr>
          ) : locNames.map((loc, i) => {
            const lg     = todayCallouts.filter(g => g.node === loc)
            const open   = lg.filter(g => !g.covered).length
            const filled = lg.filter(g => g.covered).length
            const rate   = lg.length === 0 ? 100 : Math.round((filled / lg.length) * 100)
            const sGap   = staffToday.filter(r => r.node === loc).reduce((s, r) => s + Math.max(r.gap, 0), 0)
            const onCallHere = onCallRows.filter(r => r.node_name === loc).length
            return (
              <tr key={loc} onClick={() => drillGaps(`${loc} — Today's Callouts`, lg, 'var(--t-accent)')}
                title="Click to drill into records"
                style={{ cursor: 'pointer', ...(i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}) }}>
                <td style={{ ...S.td, fontWeight: 700 }}>{loc}</td>
                <td style={{ ...S.td, color: open > 0 ? '#ff4d7d' : 'var(--t-text)' }}>{open}</td>
                <td style={{ ...S.td, color: '#2ad6a0' }}>{filled}</td>
                <td style={S.td}><span style={{ fontWeight: 700, color: scoreColor(rate) }}>{rate}%</span></td>
                <td style={{ ...S.td, color: sGap > 0 ? '#ff4d7d' : 'var(--t-text)' }}>{sGap > 0 ? `-${sGap}` : '0'}</td>
                <td style={S.td}>{onCallHere}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab 1 — Live Gaps ─────────────────────────────────────────────────────────

function LiveGapsTab({ gaps, locNames, onFindCover, onEscalate, busy }) {
  const [filterLoc, setFilterLoc] = useState('All')

  const open = useMemo(() => {
    let g = gaps
    if (filterLoc !== 'All') g = g.filter(x => x.node === filterLoc)
    return [...g].sort((a, b) => {
      const dd = String(a.date).localeCompare(String(b.date))
      if (dd !== 0) return dd
      const uo = { critical: 0, high: 1, normal: 2 }
      return (uo[a.urgency] ?? 2) - (uo[b.urgency] ?? 2)
    })
  }, [gaps, filterLoc])

  const byLoc = useMemo(() => {
    const map = {}
    open.forEach(g => { (map[g.node] = map[g.node] || []).push(g) })
    return map
  }, [open])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--t-text-muted)', fontWeight: 600 }}>
          {open.length} open gap{open.length !== 1 ? 's' : ''} — uncovered callouts, last 7 + next 7 days
        </span>
        <select style={S.select} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>

      {Object.keys(byLoc).sort().map(loc => {
        const locGaps = byLoc[loc]
        return (
          <div key={loc}>
            <div style={S.locGroup}>
              <span>{loc}</span>
              <Bdg variant={locGaps.some(g => g.urgency === 'critical') ? 'red' : 'amber'}>
                {locGaps.length} gap{locGaps.length !== 1 ? 's' : ''}
              </Bdg>
            </div>
            <div style={{ paddingTop: 12 }}>
              {locGaps.map(gap => (
                <GapCard key={gap.id} gap={gap} onFindCover={onFindCover} onEscalate={onEscalate} busy={busy} />
              ))}
            </div>
          </div>
        )
      })}

      {open.length === 0 && <div style={S.empty}>No open gaps for the selected filter.</div>}
    </div>
  )
}

function GapCard({ gap, onFindCover, onEscalate, busy }) {
  return (
    <div style={S.gapCard(gap.urgency)}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>
            {gap.node} — {gap.slot} Shift
          </span>
          {urgencyBdg(gap.urgency)}
          {statusBdg(gap.status)}
          {gap.short_staffed && <Bdg variant="red">SHORT-STAFFED</Bdg>}
        </div>
        <div style={S.gapMeta}>
          <span><span style={{ color: 'var(--t-text-faint)' }}>Date:</span> {fmtDate(gap.date)}</span>
          <span><span style={{ color: 'var(--t-text-faint)' }}>Called Out:</span> {gap.employee}</span>
          <span><span style={{ color: 'var(--t-text-faint)' }}>Type:</span> {(gap.type || '').replace('_', ' ')}</span>
          {gap.reported_at && <span><span style={{ color: 'var(--t-text-faint)' }}>Reported:</span> {fmtDateTime(gap.reported_at)}</span>}
          {gap.reason && <span style={{ fontStyle: 'italic', color: 'var(--t-text-faint)' }}>{gap.reason}</span>}
        </div>
      </div>
      <div style={S.gapActions}>
        <button style={{ ...S.btnSm, ...S.btnAccent }} onClick={() => onFindCover(gap)}>Find Cover</button>
        <button style={{ ...S.btnSm, ...S.btnDanger }} disabled={!!busy[`esc-${gap.id}`]} onClick={() => onEscalate(gap)}>
          {busy[`esc-${gap.id}`] ? 'Sending…' : 'Escalate'}
        </button>
      </div>
    </div>
  )
}

// ─── Tab 2 — Find Coverage ─────────────────────────────────────────────────────

function FindCoverageTab({ gaps, selectedGap, employees, availDows, onAccept, onDecline, onNotifyAll, onPostToSwapBoard, busy }) {
  const [gapId, setGapId] = useState(selectedGap?.id || '')

  useEffect(() => { if (selectedGap?.id) setGapId(selectedGap.id) }, [selectedGap])

  const currentGap = gaps.find(g => g.id === gapId) || null

  // Rank REAL candidates: on-call first, then same location, availability match,
  // and fewer scheduled hours (OT protection). Every input is live data.
  const ranked = useMemo(() => {
    if (!currentGap) return []
    const dow = new Date(currentGap.date + 'T00:00:00').getDay()
    return employees
      .filter(e => e.id !== currentGap.employee_id)
      .map(e => {
        let score = 0
        const reasons = []
        if (e.on_call) { score -= 40; reasons.push('On-call') }
        if (e.location === currentGap.node) { score -= 20; reasons.push('Same location') }
        else reasons.push('Cross-location')
        if (availDows[e.id]?.has(dow)) { score -= 15; reasons.push(`Available ${DAY_ABBR[dow]}`) }
        score += Math.min(e.hours_week, 60)
        return { ...e, score, reason: reasons.join(' · ') }
      })
      .sort((a, b) => a.score - b.score)
  }, [currentGap, employees, availDows])

  return (
    <div style={S.split}>
      {/* LEFT */}
      <div>
        <div style={S.card}>
          <div style={S.cardHead}><span style={S.cardTitle}>Select Gap</span></div>
          <div style={S.cardBody}>
            <div style={S.formRow}>
              <label style={S.label}>Open Gap</label>
              <select style={{ ...S.select, width: '100%' }} value={gapId} onChange={e => setGapId(e.target.value)}>
                <option value="">— Choose a gap —</option>
                {gaps.map(g => (
                  <option key={g.id} value={g.id}>{g.node} / {g.slot} / {fmtDate(g.date)} — {g.employee}</option>
                ))}
              </select>
            </div>
            {currentGap && (
              <>
                <div style={S.divider} />
                <div style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--t-text-muted)' }}>
                  <div><strong style={{ color: 'var(--t-text)' }}>Location:</strong> {currentGap.node}</div>
                  <div><strong style={{ color: 'var(--t-text)' }}>Date:</strong> {fmtDate(currentGap.date)}</div>
                  <div><strong style={{ color: 'var(--t-text)' }}>Shift:</strong> {currentGap.slot}</div>
                  <div><strong style={{ color: 'var(--t-text)' }}>Called Out:</strong> {currentGap.employee}</div>
                  <div><strong style={{ color: 'var(--t-text)' }}>Type:</strong> {(currentGap.type || '').replace('_', ' ')}</div>
                  <div style={{ marginTop: 4 }}>{urgencyBdg(currentGap.urgency)}</div>
                  {currentGap.reason && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{currentGap.reason}</div>}
                </div>
                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ ...S.btnSm, ...S.btnAccent }} disabled={!!busy[`notify-${currentGap.id}`]} onClick={() => onNotifyAll(currentGap)}>
                    {busy[`notify-${currentGap.id}`] ? 'Sending…' : 'Notify All Available'}
                  </button>
                  <button style={S.btnSm} disabled={!!busy[`post-${currentGap.id}`]} onClick={() => onPostToSwapBoard(currentGap)}>
                    {busy[`post-${currentGap.id}`] ? 'Posting…' : 'Post to Swap Board'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div>
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={S.cardTitle}>Available Employees</span>
            {ranked.length > 0 && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{ranked.length} candidates — priority sorted</span>}
          </div>
          <div style={S.cardBody}>
            {!currentGap ? (
              <div style={S.empty}>Select a gap to see available employees</div>
            ) : ranked.length === 0 ? (
              <div style={S.empty}>No candidates on the roster for this scope</div>
            ) : ranked.map(emp => {
              const acceptKey  = `accept-${currentGap.id}-${emp.id}`
              const declineKey = `decline-${currentGap.id}-${emp.id}`
              return (
                <div key={emp.id} style={S.empCard(emp.on_call && emp.hours_week < 40)}>
                  <div>
                    <div style={S.empName}>{emp.name}</div>
                    <div style={S.empMeta}>
                      <span>{emp.location}</span>
                      <span>{emp.role}</span>
                      <span style={{ color: 'var(--t-text-faint)' }}>{emp.reason}</span>
                      <span><strong style={{ color: 'var(--t-text)' }}>{emp.hours_week}h</strong> this wk</span>
                      {otRiskBdg(emp.hours_week)}
                      {emp.on_call && <Bdg variant="accent">ON-CALL</Bdg>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={{ ...S.btnSm, ...S.btnSuccess }} disabled={!!busy[acceptKey]} onClick={() => onAccept(currentGap, emp)}>
                      {busy[acceptKey] ? 'Saving…' : 'Accept'}
                    </button>
                    <button style={{ ...S.btnSm, ...S.btnDanger }} disabled={!!busy[declineKey]} onClick={() => onDecline(currentGap, emp)}>
                      {busy[declineKey] ? 'Saving…' : 'Decline'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Post Swap Modal ───────────────────────────────────────────────────────────

function PostSwapModal({ locations, onClose, onPost, posting }) {
  const [form, setForm] = useState({
    node_id: locations[0]?.id || '',
    date: TODAY, start: '', end: '', notes: '', compensation: 'regular',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Post New Swap</span>
          <button style={{ ...S.btnSm, fontSize: 16, padding: '2px 10px' }} onClick={onClose}>×</button>
        </div>
        <div style={S.modalBody}>
          <div style={S.formRow}>
            <label style={S.label}>Location</label>
            <select style={{ ...S.select, width: '100%' }} value={form.node_id} onChange={e => set('node_id', e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Date</label>
            <input type="date" style={{ ...S.input, width: '100%' }} value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={S.formRow}>
              <label style={S.label}>Start Time</label>
              <input type="time" style={{ ...S.input, width: '100%' }} value={form.start} onChange={e => set('start', e.target.value)} />
            </div>
            <div style={S.formRow}>
              <label style={S.label}>End Time</label>
              <input type="time" style={{ ...S.input, width: '100%' }} value={form.end} onChange={e => set('end', e.target.value)} />
            </div>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Compensation</label>
            <select style={{ ...S.select, width: '100%' }} value={form.compensation} onChange={e => set('compensation', e.target.value)}>
              <option value="regular">Regular Pay</option>
              <option value="ot">Overtime Pay</option>
              <option value="spiff">Spiff / Bonus</option>
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Notes</label>
            <textarea style={S.textarea} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional details…" />
          </div>
        </div>
        <div style={S.modalFoot}>
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, ...S.btnAccent }} disabled={posting || !form.node_id || !form.date} onClick={() => onPost(form)}>
            {posting ? 'Posting…' : 'Post Swap'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 3 — Swap Board ────────────────────────────────────────────────────────

function SwapBoardTab({ board, locations, locNames, hoursByName, isHR, meId, onPostSwap, onVolunteer, onConfirm, busy, posting }) {
  const [filterLoc,  setFilterLoc]  = useState('All')
  const [filterDate, setFilterDate] = useState('')
  const [showPost,   setShowPost]   = useState(false)

  const visible = useMemo(() =>
    board.filter(s =>
      (filterLoc === 'All' || s.node === filterLoc) &&
      (!filterDate || String(s.shift_date).slice(0, 10) === filterDate)
    ), [board, filterLoc, filterDate])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={S.select} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l}>{l}</option>)}
        </select>
        <input type="date" style={S.input} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <button style={{ ...S.btn, ...S.btnAccent, marginLeft: 'auto' }} onClick={() => setShowPost(true)}>+ Post New Swap</button>
      </div>

      {showPost && (
        <PostSwapModal locations={locations} posting={posting}
          onClose={() => setShowPost(false)}
          onPost={async (form) => { const ok = await onPostSwap(form); if (ok) setShowPost(false) }} />
      )}

      {visible.length === 0
        ? <div style={S.empty}>No swap postings match the current filter.</div>
        : visible.map(swap => {
          const volunteers = swap.volunteers || []
          const iVolunteered = meId && volunteers.some(v => v.person_id === meId)
          return (
            <div key={swap.id} style={S.swapCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>
                      {swap.node || '—'} — {fmtDate(swap.shift_date)}
                    </span>
                    {statusBdg(swap.status)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.8 }}>
                    {(swap.start_time || swap.end_time) && (
                      <span style={{ marginRight: 14 }}><strong style={{ color: 'var(--t-text)' }}>Time:</strong> {fmtTime(swap.start_time)}–{fmtTime(swap.end_time)}</span>
                    )}
                    <span style={{ marginRight: 14 }}><strong style={{ color: 'var(--t-text)' }}>Date:</strong> {fmtDate(swap.shift_date)}</span>
                    {swap.posted_at && <span><strong style={{ color: 'var(--t-text)' }}>Posted:</strong> {fmtDateTime(swap.posted_at)}</span>}
                  </div>
                  {swap.note && <div style={{ fontSize: 12, color: 'var(--t-text-faint)', fontStyle: 'italic', marginTop: 4 }}>{swap.note}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: volunteers.length > 0 ? '#2ad6a0' : 'var(--t-text-faint)' }}>{volunteers.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase' }}>volunteer{volunteers.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              {volunteers.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--t-line)', paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Volunteers</div>
                  {volunteers.map(v => {
                    const hrs = hoursByName[v.name]
                    const approved = String(v.status || '').toLowerCase() === 'approved'
                    return (
                      <div key={v.claim_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 13, color: 'var(--t-text)' }}>
                          {v.name}
                          <span style={{ color: 'var(--t-text-muted)' }}>
                            {' '}— volunteered {fmtDateTime(v.claimed_at)}{hrs != null ? ` · ${hrs}h this wk` : ''}
                          </span>
                          {approved && <span style={{ marginLeft: 6 }}><Bdg variant="green">CONFIRMED</Bdg></span>}
                          {hrs >= 40 && <span style={{ marginLeft: 6 }}><Bdg variant="red">OT RISK</Bdg></span>}
                        </div>
                        {isHR && !approved && swap.status !== 'filled' && (
                          <button style={{ ...S.btnSm, ...S.btnAccent }} disabled={!!busy[`confirm-${v.claim_id}`]} onClick={() => onConfirm(swap, v)}>
                            {busy[`confirm-${v.claim_id}`] ? 'Saving…' : 'Confirm Cover'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {swap.status === 'open' && meId && !iVolunteered && (
                <div style={{ marginTop: 10 }}>
                  <button style={S.btnSm} disabled={!!busy[`vol-${swap.id}`]} onClick={() => onVolunteer(swap)}>
                    {busy[`vol-${swap.id}`] ? 'Saving…' : 'Volunteer for This'}
                  </button>
                </div>
              )}
            </div>
          )
        })
      }
    </div>
  )
}

// ─── Tab 4 — On-Call Roster ────────────────────────────────────────────────────

function OnCallRosterTab({ onCallRows, employees, isHR, onToggleOnCall, onCallNow, busy }) {
  const onCallIds = useMemo(() => new Set(onCallRows.map(r => r.person_id)), [onCallRows])
  const notOnCall = employees.filter(e => !onCallIds.has(e.id))

  const rosterCols = ['Name', 'Location', 'Phone', 'Role', 'Availability', 'Last Called', 'Accepted', 'Declined', 'Reliability', 'Actions']

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: 'var(--t-text-muted)' }}>
        {onCallRows.length} employee{onCallRows.length !== 1 ? 's' : ''} currently on the on-call roster
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>On-Call Roster</span>
          <Bdg variant="accent">{onCallRows.length} Active</Bdg>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{rosterCols.map(c => <th key={c} style={S.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {onCallRows.length === 0 ? (
                <tr><td colSpan={rosterCols.length} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)' }}>No on-call employees configured</td></tr>
              ) : onCallRows.map((r, i) => {
                const emp   = employees.find(e => e.id === r.person_id)
                const score = reliabilityScore(r.accepted, r.declined)
                return (
                  <tr key={r.person_id} style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.full_name}</td>
                    <td style={S.td}>{r.node_name || '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r.phone || '—'}</td>
                    <td style={S.td}>{r.role_name || emp?.role || '—'}</td>
                    <td style={{ ...S.td, fontSize: 12, color: 'var(--t-text-muted)' }}>{emp?.availability || '—'}</td>
                    <td style={{ ...S.td, fontSize: 12 }}>{r.last_called ? fmtDateTime(r.last_called) : '—'}</td>
                    <td style={{ ...S.td, color: '#2ad6a0', fontWeight: 700 }}>{r.accepted}</td>
                    <td style={{ ...S.td, color: '#ff4d7d', fontWeight: 700 }}>{r.declined}</td>
                    <td style={S.td}><span style={{ fontWeight: 700, color: scoreColor(score) }}>{score}%</span></td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...S.btnSm, ...S.btnAccent }} disabled={!!busy[`call-${r.person_id}`]} onClick={() => onCallNow(r)}>
                          {busy[`call-${r.person_id}`] ? 'Logging…' : 'Call Now'}
                        </button>
                        {isHR && (
                          <button style={{ ...S.btnSm, ...S.btnDanger }} disabled={!!busy[`oncall-${r.person_id}`]} onClick={() => onToggleOnCall(r.person_id, false)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isHR && notOnCall.length > 0 && (
        <div style={S.card}>
          <div style={S.cardHead}>
            <span style={S.cardTitle}>Add to On-Call</span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{notOnCall.length} eligible</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Name', 'Location', 'Role', 'Hours/Wk', ''].map((c, ci) => <th key={ci} style={S.th}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {notOnCall.map((emp, i) => (
                  <tr key={emp.id} style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}>
                    <td style={S.td}>{emp.name}</td>
                    <td style={S.td}>{emp.location}</td>
                    <td style={S.td}>{emp.role}</td>
                    <td style={S.td}>{emp.hours_week}h</td>
                    <td style={S.td}>
                      <button style={{ ...S.btnSm, ...S.btnSuccess }} disabled={!!busy[`oncall-${emp.id}`]} onClick={() => onToggleOnCall(emp.id, true, emp.node_id)}>
                        {busy[`oncall-${emp.id}`] ? 'Saving…' : 'Add to On-Call'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 5 — History ───────────────────────────────────────────────────────────

const HISTORY_COLS = [
  { key: 'date', label: 'Date', value: h => fmtDate(h.date), sortKey: h => h.date },
  { key: 'node', label: 'Location', value: h => h.node },
  { key: 'slot', label: 'Shift', value: h => h.slot },
  { key: 'type', label: 'Type', value: h => (h.type || '').replace('_', ' ').toUpperCase() },
  { key: 'employee', label: 'Called Out', value: h => h.employee },
  { key: 'covered_by', label: 'Covered By', value: h => h.covered_by || '—' },
  { key: 'status', label: 'Status', value: h => (h.covered ? 'COVERED' : 'UNCOVERED') },
  { key: 'short_staffed', label: 'Short-Staffed', value: h => (h.short_staffed ? 'Yes' : 'No') },
]

function HistoryTab({ locationIds, locNames, onDrill }) {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState(null)
  const [filterLoc,  setFilterLoc]  = useState('All')
  const [filterStat, setFilterStat] = useState('All')
  const [dateFrom,   setDateFrom]   = useState(fmtIso(addDays(_today, -30)))
  const [dateTo,     setDateTo]     = useState(TODAY)
  const [page,       setPage]       = useState(0)
  const PAGE_SIZE = 20

  // Server-side range fetch — the forensic callout report is the system of record.
  useEffect(() => {
    if (!locationIds || !locationIds.length) { setRows([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setErr(null)
    sb.rpc('forensic_callouts', { p_node_ids: locationIds, p_date_from: dateFrom || null, p_date_to: dateTo || null })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setErr(error.message || 'Failed to load coverage history'); setRows([]) }
        else setRows((data?.callouts || []).map(mapCallout))
        setLoading(false)
      })
      .catch((e) => { if (!cancelled) { setErr(e.message || 'Failed to load coverage history'); setRows([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [locationIds?.join?.(','), dateFrom, dateTo])  // eslint-disable-line

  const filtered = useMemo(() =>
    rows
      .filter(h =>
        (filterLoc  === 'All' || h.node === filterLoc) &&
        (filterStat === 'All' || (filterStat === 'covered' ? h.covered : !h.covered))
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  , [rows, filterLoc, filterStat])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const covered   = filtered.filter(h => h.covered)
  const uncovered = filtered.filter(h => !h.covered)
  const rate      = filtered.length === 0 ? 100 : Math.round((covered.length / filtered.length) * 100)

  const bySlot = useMemo(() => {
    const map = {}
    filtered.forEach(h => {
      const k = h.slot || '—'
      if (!map[k]) map[k] = { count: 0, covered: 0 }
      map[k].count++
      if (h.covered) map[k].covered++
    })
    return Object.entries(map).map(([slot, d]) => ({ slot, count: d.count, covered: d.covered }))
  }, [filtered])

  const drillHistory = (title, drillRows, accent) => onDrill && onDrill({
    title, subtitle: `${drillRows.length} record${drillRows.length === 1 ? '' : 's'} in range`, columns: HISTORY_COLS, rows: drillRows, accent,
  })

  const handleExport = () => {
    const headers = ['Date', 'Location', 'Shift', 'Type', 'Called Out', 'Covered By', 'Status', 'Short-Staffed', 'Reason']
    const csvRows = filtered.map(h => [h.date, h.node, h.slot, h.type, h.employee, h.covered_by || '', h.covered ? 'Covered' : 'Uncovered', h.short_staffed ? 'Yes' : 'No', h.reason])
    const csv     = [headers, ...csvRows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `coverage-history-${TODAY}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={S.select} value={filterLoc} onChange={e => { setFilterLoc(e.target.value); setPage(0) }}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={S.select} value={filterStat} onChange={e => { setFilterStat(e.target.value); setPage(0) }}>
          <option value="All">All Statuses</option>
          <option value="covered">Covered</option>
          <option value="uncovered">Uncovered</option>
        </select>
        <input type="date" style={S.input} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
        <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>to</span>
        <input type="date" style={S.input} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
        <button style={{ ...S.btn, ...S.btnAccent, marginLeft: 'auto' }} onClick={handleExport} disabled={filtered.length === 0}>Export CSV</button>
      </div>

      {err && <div style={S.errBox}>{err}</div>}

      {/* Analytics KPIs — all from real callout records */}
      <div style={S.kpiGrid(4)}>
        <KpiTile label="Total Callouts" value={filtered.length}  sub="in selected range" onClick={() => drillHistory('Callout Events — Selected Range', filtered, 'var(--t-accent)')} />
        <KpiTile label="Covered"        value={covered.length}   sub="coverage confirmed" valueColor="#2ad6a0" onClick={() => drillHistory('Covered Callouts — Selected Range', covered, '#2ad6a0')} />
        <KpiTile label="Uncovered"      value={uncovered.length} sub="no cover found"     valueColor={uncovered.length > 0 ? '#ff4d7d' : 'var(--t-text)'} variant={uncovered.length > 5 ? 'danger' : null} onClick={() => drillHistory('Uncovered Callouts — Selected Range', uncovered, '#ff4d7d')} />
        <KpiTile label="Coverage Rate"  value={`${rate}%`}       sub="of callouts covered" valueColor={scoreColor(rate)} onClick={() => drillHistory('Callout Events — Selected Range', filtered, 'var(--t-accent)')} />
      </div>

      {/* By-shift analytics */}
      {bySlot.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={S.cardHead}><span style={S.cardTitle}>Callouts by Shift</span></div>
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {bySlot.map(s => (
              <div key={s.slot} onClick={() => drillHistory(`${s.slot} Shift — Callout Events`, filtered.filter(h => (h.slot || '—') === s.slot), 'var(--t-accent)')}
                title="Click to drill into records"
                style={{ flex: 1, padding: '14px 16px', borderRight: '1px solid var(--t-line)', minWidth: 120, cursor: 'pointer' }}>
                <div style={S.kpiLabel}>{s.slot} Shift</div>
                <div style={{ ...S.kpiValue('var(--t-accent)'), fontSize: 20 }}>{s.count}</div>
                <div style={S.kpiSub}>{s.covered} covered</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History table */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>Coverage Log — {filtered.length} Records</span>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Page {page + 1} of {totalPages}</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Date', 'Location', 'Shift', 'Type', 'Called Out', 'Covered By', 'Status', 'Short-Staffed', 'Reason'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 32 }}>Loading coverage history…</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 32 }}>No records match the selected filters.</td></tr>
              ) : paged.map((h, i) => (
                <tr key={h.id} style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDate(h.date)}</td>
                  <td style={S.td}>{h.node}</td>
                  <td style={S.td}>{h.slot}</td>
                  <td style={S.td}><Bdg variant={h.type === 'no_show' ? 'red' : 'amber'}>{(h.type || '').replace('_', ' ').toUpperCase()}</Bdg></td>
                  <td style={S.td}>{h.employee}</td>
                  <td style={{ ...S.td, color: h.covered_by ? '#2ad6a0' : 'var(--t-text-faint)', fontWeight: h.covered_by ? 600 : 400 }}>{h.covered_by || '—'}</td>
                  <td style={S.td}>{h.covered ? <Bdg variant="green">COVERED</Bdg> : <Bdg variant="red">UNCOVERED</Bdg>}</td>
                  <td style={S.td}>{h.short_staffed ? <Bdg variant="amber">YES</Bdg> : <span style={{ color: 'var(--t-text-faint)' }}>—</span>}</td>
                  <td style={{ ...S.td, fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--t-line)', flexWrap: 'wrap' }}>
            <button style={S.btnSm} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pg = Math.max(0, Math.min(totalPages - 7, page - 3)) + i
              return (
                <button key={pg} style={{ ...S.btnSm, ...(pg === page ? S.btnAccent : {}) }} onClick={() => setPage(pg)}>{pg + 1}</button>
              )
            })}
            <button style={S.btnSm} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS = ['Live Gaps', 'Find Coverage', 'Swap Board', 'On-Call Roster', 'History']

export default function Coverage() {
  const { session }               = useAuth()
  const { locationIds, locations } = useScope()

  const me       = session?.person || {}
  const roleName = (me.role_name || '').toLowerCase()
  const isHR     = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))

  const [activeTab,   setActiveTab]   = useState(0)
  const [callouts,    setCallouts]    = useState([])
  const [staffing,    setStaffing]    = useState([])
  const [roster,      setRoster]      = useState([])
  const [shiftRows,   setShiftRows]   = useState([])
  const [availRows,   setAvailRows]   = useState([])
  const [onCallRows,  setOnCallRows]  = useState([])
  const [board,       setBoard]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadErr,     setLoadErr]     = useState(null)
  const [busy,        setBusy]        = useState({})
  const [posting,     setPosting]     = useState(false)
  const [selectedGap, setSelectedGap] = useState(null)
  const [drill,       setDrill]       = useState(null)
  const { toast, show: showToast }    = useToast()

  const setBusyKey = (k, v) => setBusy(prev => ({ ...prev, [k]: v }))

  // ── Load everything from the live backend ──────────────────────────────────
  const refresh = useCallback(async (withSpinner = false) => {
    if (!locationIds || !locationIds.length) { setLoading(false); return }
    if (withSpinner) setLoading(true)
    setLoadErr(null)
    const from = fmtIso(addDays(_today, -30))
    const [fc, cg, ro, ss, ta, oc, sw] = await Promise.all([
      sb.rpc('forensic_callouts',   { p_node_ids: locationIds, p_date_from: from, p_date_to: WEEK_END }),
      sb.rpc('get_coverage_gaps',   { p_node_ids: locationIds, p_date_from: TODAY, p_date_to: WEEK_END }),
      sb.rpc('get_roster',          { p_node_ids: locationIds, p_actor: me.id || null }),
      sb.rpc('scope_shifts',        { p_node_ids: locationIds, p_actor: me.id || null }),
      sb.rpc('get_team_availability', { p_node_ids: locationIds }),
      sb.rpc('get_on_call_roster',  { p_node_ids: locationIds }),
      sb.rpc('get_swap_board',      { p_node_ids: locationIds, p_date_from: TODAY }),
    ])
    const firstErr = [fc, cg, ro, ss, ta].map(r => r.error).find(Boolean)
    if (firstErr) setLoadErr(firstErr.message || 'Some coverage data failed to load')
    setCallouts((fc.data?.callouts || []).map(mapCallout))
    setStaffing((cg.data || []).map(r => ({
      node: r.node, node_id: r.node_id, date: String(r.shift_date || '').slice(0, 10),
      required: r.required ?? 0, scheduled: r.scheduled ?? 0, gap: r.gap ?? 0,
    })))
    setRoster(ro.data || [])
    setShiftRows(ss.data || [])
    setAvailRows(ta.data || [])
    // The on-call + swap-board RPCs ship in this feature's migration; until it is
    // applied they error — surface an honest empty state, never fake rows.
    setOnCallRows(oc.error ? [] : (oc.data || []))
    setBoard(sw.error ? [] : (Array.isArray(sw.data) ? sw.data : []))
    setLoading(false)
  }, [locationIds?.join?.(','), me.id])  // eslint-disable-line

  useEffect(() => { refresh(true) }, [refresh])

  // ── Derived, all from live rows ────────────────────────────────────────────

  const nodeIdByName = useMemo(() => {
    const m = {}
    ;(locations || []).forEach(l => { m[l.name] = l.id })
    staffing.forEach(r => { if (r.node && r.node_id) m[r.node] = r.node_id })
    return m
  }, [locations, staffing])

  const locNames = useMemo(() => {
    const s = new Set([
      ...(locations || []).map(l => l.name),
      ...staffing.map(r => r.node),
      ...callouts.map(c => c.node),
    ].filter(Boolean))
    return [...s].sort()
  }, [locations, staffing, callouts])

  // Hours scheduled this week per employee (Sun–Sat), from real shift rows.
  const hoursByName = useMemo(() => {
    const weekStart = fmtIso(addDays(_today, -_today.getDay()))
    const weekEnd   = fmtIso(addDays(_today, 6 - _today.getDay()))
    const m = {}
    shiftRows.forEach(r => {
      const d = String(r.shift_date || '').slice(0, 10)
      if (d < weekStart || d > weekEnd) return
      if (String(r.status || '').toLowerCase() === 'callout') return
      if (!r.start_time || !r.end_time || !r.full_name) return
      const [sh, sm] = String(r.start_time).split(':').map(Number)
      const [eh, em] = String(r.end_time).split(':').map(Number)
      const hrs = (eh + em / 60) - (sh + sm / 60)
      if (hrs > 0) m[r.full_name] = Math.round(((m[r.full_name] || 0) + hrs) * 10) / 10
    })
    return m
  }, [shiftRows])

  // Availability: which weekdays each person is available + a display summary.
  const { availDows, availSummary } = useMemo(() => {
    const dows = {}
    const byPerson = {}
    availRows.forEach(r => {
      if (!r.person_id) return
      ;(byPerson[r.person_id] = byPerson[r.person_id] || []).push(r)
      if (r.available) (dows[r.person_id] = dows[r.person_id] || new Set()).add(r.day_of_week)
    })
    const summary = {}
    Object.entries(byPerson).forEach(([pid, rows]) => {
      const days = [...(dows[pid] || [])].sort((a, b) => a - b)
      summary[pid] = days.length === 0 ? 'Not available' : days.length === 7 ? 'All days' : days.map(d => DAY_ABBR[d]).join(', ')
    })
    return { availDows: dows, availSummary: summary }
  }, [availRows])

  const onCallByPerson = useMemo(() => {
    const m = {}
    onCallRows.forEach(r => { m[r.person_id] = r })
    return m
  }, [onCallRows])

  // Unified employee model — roster + hours + availability + on-call, all live.
  const employees = useMemo(() => roster
    .filter(r => r.is_active !== false)
    .map(r => {
      const oc = onCallByPerson[r.id]
      return {
        id:           r.id,
        name:         r.full_name,
        role:         r.role_name || '—',
        location:     r.node_name || '—',
        node_id:      nodeIdByName[r.node_name] || null,
        hours_week:   hoursByName[r.full_name] ?? 0,
        availability: availSummary[r.id] || '—',
        on_call:      !!oc,
        phone:        oc?.phone || null,
        last_called:  oc?.last_called || null,
        accepted:     oc?.accepted ?? 0,
        declined:     oc?.declined ?? 0,
      }
    }), [roster, onCallByPerson, nodeIdByName, hoursByName, availSummary])

  // Live gaps = uncovered callouts in the actionable window (last 7 → next 7 days).
  const liveGaps = useMemo(() => {
    const from = fmtIso(addDays(_today, -7))
    return callouts.filter(g => !g.covered && g.date >= from && g.date <= WEEK_END)
  }, [callouts])

  // ── Actions — every one is a REAL write, then a server refresh ─────────────

  const handleFindCover = useCallback((gap) => {
    setSelectedGap(gap)
    setActiveTab(1)
  }, [])

  const handleEscalate = useCallback(async (gap) => {
    const key = `esc-${gap.id}`
    setBusyKey(key, true)
    const nodeId = nodeIdByName[gap.node] || null
    const { data, error } = await sb.rpc('post_shift_broadcast', {
      p_author_id:   me.id || null,
      p_title:       `Coverage escalation — ${gap.node} ${gap.slot} ${fmtDate(gap.date)}`,
      p_body:        `${gap.employee} called out (${(gap.type || '').replace('_', ' ')}) for the ${gap.slot} shift on ${fmtDate(gap.date)} at ${gap.node}.${gap.short_staffed ? ' Location is SHORT-STAFFED.' : ''} Coverage needed — respond to your manager.`,
      p_priority:    'URGENT',
      p_node_ids:    nodeId ? [nodeId] : (locationIds || null),
      p_shift:       'All Shifts',
      p_require_ack: true,
      p_pin:         true,
    })
    setBusyKey(key, false)
    if (error || data?.ok === false) showToast(`Escalation failed — ${error?.message || data?.error || 'server error'}`, 'error')
    else showToast(`Escalation broadcast sent — ${gap.node} ${gap.slot}`, 'success')
  }, [me.id, nodeIdByName, locationIds, showToast])

  const handleNotifyAll = useCallback(async (gap) => {
    const key = `notify-${gap.id}`
    setBusyKey(key, true)
    const { data, error } = await sb.rpc('post_shift_broadcast', {
      p_author_id:   me.id || null,
      p_title:       `Coverage needed — ${gap.node} ${gap.slot} ${fmtDate(gap.date)}`,
      p_body:        `A ${gap.slot} shift at ${gap.node} on ${fmtDate(gap.date)} needs coverage (${gap.employee} called out). Contact your manager or volunteer on the Swap Board if you can cover.`,
      p_priority:    'IMPORTANT',
      p_node_ids:    locationIds || null,
      p_shift:       'All Shifts',
      p_require_ack: false,
      p_pin:         false,
    })
    setBusyKey(key, false)
    if (error || data?.ok === false) showToast(`Notification failed — ${error?.message || data?.error || 'server error'}`, 'error')
    else showToast('Coverage notification broadcast to all locations in scope', 'success')
  }, [me.id, locationIds, showToast])

  const handleAccept = useCallback(async (gap, emp) => {
    const key = `accept-${gap.id}-${emp.id}`
    setBusyKey(key, true)
    const { data, error } = await sb.rpc('set_callout_coverage', {
      p_exception_id:   gap.id,
      p_swap_person_id: emp.id,
      p_note:           `Covered by ${emp.name} (accepted via Coverage screen)`,
    })
    if (error || data === false) {
      setBusyKey(key, false)
      showToast(`Not saved — ${error?.message || 'coverage assignment failed'}`, 'error')
      return
    }
    // Feed the reliability log (attempt outcome) — non-blocking on failure.
    await sb.rpc('log_on_call_attempt', {
      p_person_id: emp.id, p_outcome: 'accepted', p_called_by: me.id || null, p_exception_id: gap.id,
    }).catch(() => {})
    setBusyKey(key, false)
    showToast(`${emp.name} confirmed for coverage`, 'success')
    refresh()
  }, [me.id, refresh, showToast])

  const handleDecline = useCallback(async (gap, emp) => {
    const key = `decline-${gap.id}-${emp.id}`
    setBusyKey(key, true)
    const { error } = await sb.rpc('log_on_call_attempt', {
      p_person_id: emp.id, p_outcome: 'declined', p_called_by: me.id || null, p_exception_id: gap.id,
    })
    setBusyKey(key, false)
    if (error) showToast(`Not saved — ${error.message}`, 'error')
    else { showToast(`${emp.name} declined — logged`, 'success'); refresh() }
  }, [me.id, refresh, showToast])

  const handlePostToSwapBoard = useCallback(async (gap) => {
    const key = `post-${gap.id}`
    const nodeId = nodeIdByName[gap.node]
    if (!nodeId) { showToast('Cannot post — unknown location for this gap', 'error'); return }
    setBusyKey(key, true)
    const { error } = await sb.rpc('post_open_shift', {
      p_node_id: nodeId,
      p_date:    gap.date,
      p_start:   null,
      p_end:     null,
      p_note:    `Cover for ${gap.employee} — ${gap.slot} shift callout${gap.reason ? ` (${gap.reason})` : ''}. Posted by ${me.full_name || 'Manager'}.`,
    })
    setBusyKey(key, false)
    if (error) { showToast(`Not posted — ${error.message}`, 'error'); return }
    showToast('Posted to Swap Board', 'success')
    await refresh()
    setActiveTab(2)
  }, [nodeIdByName, me.full_name, refresh, showToast])

  const handlePostSwap = useCallback(async (form) => {
    setPosting(true)
    const comp = form.compensation === 'spiff' ? 'Spiff/bonus' : form.compensation === 'ot' ? 'Overtime pay' : 'Regular pay'
    const { error } = await sb.rpc('post_open_shift', {
      p_node_id: form.node_id,
      p_date:    form.date,
      p_start:   form.start || null,
      p_end:     form.end || null,
      p_note:    `${comp}. ${form.notes || ''}`.trim() + ` Posted by ${me.full_name || 'Manager'}.`,
    })
    setPosting(false)
    if (error) { showToast(`Not posted — ${error.message}`, 'error'); return false }
    showToast('Swap posted to board', 'success')
    refresh()
    return true
  }, [me.full_name, refresh, showToast])

  const handleVolunteer = useCallback(async (post) => {
    if (!me.id) { showToast('Sign in to volunteer', 'error'); return }
    const key = `vol-${post.id}`
    setBusyKey(key, true)
    const { error } = await sb.rpc('volunteer_open_shift', {
      p_shift_id: post.id, p_person_id: me.id, p_note: null,
    })
    setBusyKey(key, false)
    if (error) showToast(`Not saved — ${error.message}`, 'error')
    else { showToast('Volunteered for this swap', 'success'); refresh() }
  }, [me.id, refresh, showToast])

  const handleConfirm = useCallback(async (post, volunteer) => {
    const key = `confirm-${volunteer.claim_id}`
    setBusyKey(key, true)
    const { data, error } = await sb.rpc('review_shift_claim', {
      p_claim_id: volunteer.claim_id, p_action: 'approve', p_reviewer_id: me.id || null,
    })
    setBusyKey(key, false)
    if (error || data?.ok === false) showToast(`Not saved — ${error?.message || data?.error || 'approval failed'}`, 'error')
    else { showToast(`Coverage confirmed — ${volunteer.name}`, 'success'); refresh() }
  }, [me.id, refresh, showToast])

  const handleToggleOnCall = useCallback(async (personId, add, nodeId = null) => {
    const key = `oncall-${personId}`
    setBusyKey(key, true)
    const { error } = await sb.rpc('set_on_call', {
      p_person_id: personId, p_active: add, p_node_id: nodeId,
    })
    setBusyKey(key, false)
    if (error) showToast(`Not saved — ${error.message}`, 'error')
    else {
      const emp = employees.find(e => e.id === personId)
      showToast(`${emp?.name || 'Employee'} ${add ? 'added to' : 'removed from'} on-call roster`, 'success')
      refresh()
    }
  }, [employees, refresh, showToast])

  const handleCallNow = useCallback(async (row) => {
    const key = `call-${row.person_id}`
    setBusyKey(key, true)
    const { error } = await sb.rpc('log_on_call_attempt', {
      p_person_id: row.person_id, p_outcome: 'called', p_called_by: me.id || null,
    })
    setBusyKey(key, false)
    if (error) showToast(`Not logged — ${error.message}`, 'error')
    else { showToast(`Call attempt logged for ${row.full_name}`, 'success'); refresh() }
  }, [me.id, refresh, showToast])

  // Badge counts for tab bar
  const openGapCount  = liveGaps.length
  const openSwapCount = board.filter(s => s.status === 'open').length

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={S.pageTitle}>Coverage Management</div>
            <div style={S.pageSub}>Real-time shift coverage, gap filling, and on-call coordination — Twisted Growers</div>
          </div>
          {isHR && (
            <Bdg variant={openGapCount > 0 ? 'red' : 'green'}>
              {openGapCount > 0 ? `${openGapCount} OPEN GAPS` : 'ALL COVERED'}
            </Bdg>
          )}
        </div>
      </div>

      <div style={S.body}>
        {loadErr && <div style={S.errBox}>{loadErr}</div>}

        {/* KPI Panel */}
        {loading ? (
          <div style={{ ...S.empty, padding: '24px 0' }}>Loading coverage data…</div>
        ) : (!locationIds || !locationIds.length) ? (
          <div style={S.empty}>No locations in scope — sign in with location access to see coverage.</div>
        ) : (
          <KpiPanel
            callouts={callouts}
            staffing={staffing}
            onCallRows={onCallRows}
            board={board}
            employees={employees}
            locNames={locNames}
            onDrill={setDrill}
          />
        )}

        {/* Tab Bar */}
        <div style={S.tabBar}>
          {TABS.map((tab, i) => {
            const badge = i === 0 ? openGapCount : i === 2 ? openSwapCount : 0
            return (
              <button key={tab} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>
                {tab}
                {badge > 0 && (
                  <span style={{ marginLeft: 6, background: i === 2 ? 'rgba(255,179,71,0.2)' : 'rgba(255,77,125,0.2)', color: i === 2 ? '#ffb800' : '#ff4d7d', padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 0 && (
          <LiveGapsTab
            gaps={liveGaps}
            locNames={locNames}
            onFindCover={handleFindCover}
            onEscalate={handleEscalate}
            busy={busy}
          />
        )}
        {activeTab === 1 && (
          <FindCoverageTab
            gaps={liveGaps}
            selectedGap={selectedGap}
            employees={employees}
            availDows={availDows}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onNotifyAll={handleNotifyAll}
            onPostToSwapBoard={handlePostToSwapBoard}
            busy={busy}
          />
        )}
        {activeTab === 2 && (
          <SwapBoardTab
            board={board}
            locations={locations || []}
            locNames={locNames}
            hoursByName={hoursByName}
            isHR={isHR}
            meId={me.id || null}
            onPostSwap={handlePostSwap}
            onVolunteer={handleVolunteer}
            onConfirm={handleConfirm}
            busy={busy}
            posting={posting}
          />
        )}
        {activeTab === 3 && (
          <OnCallRosterTab
            onCallRows={onCallRows}
            employees={employees}
            isHR={isHR}
            onToggleOnCall={handleToggleOnCall}
            onCallNow={handleCallNow}
            busy={busy}
          />
        )}
        {activeTab === 4 && (
          <HistoryTab locationIds={locationIds} locNames={locNames} onDrill={setDrill} />
        )}
      </div>

      {/* Toast */}
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
