import { useState, useEffect, useCallback, useRef } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ─── formatters ────────────────────────────────────────────────────────────────

const fmt$ = (n) => '$' + parseFloat(n || 0).toFixed(2)
const fmt$K = (n) => {
  const v = parseFloat(n || 0)
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k'
  return '$' + v.toFixed(2)
}
const fmtPct = (n) => parseFloat(n || 0).toFixed(1) + '%'
function fmtDate(s) { return s ? s.slice(0, 10) : '—' }
function fmtDateTime(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function weekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10)
}
function monthStart() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function quarterStart() {
  const d = new Date(); const q = Math.floor(d.getMonth() / 3)
  return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`
}
function daysLeft(end) {
  if (!end) return null
  return Math.ceil((new Date(end) - new Date()) / 86400000)
}
function isActive(p) {
  const today = new Date().toISOString().slice(0, 10)
  return p.is_active && (!p.end_date || p.end_date >= today)
}


const CATEGORY_BADGE_COLOR = {
  'Product-specific': 'blue',
  'Revenue threshold': 'purple',
  'Upsell': 'amber',
  'New Customer': 'green',
  'Promotion': 'red',
}

const AVATAR_COLORS = ['#7c4dff', '#2979ff', '#00e5ff', '#2ad6a0', '#ffb800', '#ff4d7d', '#a29bfe', '#ff6b6b']

// ─── styles ────────────────────────────────────────────────────────────────────

const S = {
  page: {
    background: '#070b14',
    minHeight: '100vh',
    color: 'var(--t-text, #e8eaf0)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
  },
  header: {
    background: 'var(--t-surface, #0d1117)',
    borderBottom: '1px solid var(--t-line, #1e2530)',
    padding: '18px 20px 16px',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#00e5ff',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  headerSub: {
    fontSize: 12,
    color: 'var(--t-text-muted, #5c6880)',
    marginTop: 3,
  },
  body: { padding: '16px 16px 40px' },
  // KPI panel
  kpiSection: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    marginBottom: 14,
    padding: '14px 16px',
  },
  kpiSectionLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#00e5ff',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 10,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 1,
    marginBottom: 1,
  },
  kpiTile: {
    background: '#070b14',
    padding: '12px 14px',
  },
  kpiLabel: {
    fontSize: 9,
    color: 'var(--t-text-faint, #3d4a5c)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 5,
  },
  kpiVal: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  kpiSub: { fontSize: 10, color: 'var(--t-text-muted, #5c6880)', marginTop: 3 },
  // Location table in KPI panel
  locTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 8 },
  locTh: {
    textAlign: 'left',
    padding: '6px 10px',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    borderBottom: '1px solid var(--t-line, #1e2530)',
    background: '#070b14',
  },
  locTd: {
    padding: '7px 10px',
    borderBottom: '1px solid rgba(30,37,48,0.5)',
    color: 'var(--t-text, #e8eaf0)',
  },
  // Tabs
  tabRow: {
    display: 'flex',
    gap: 0,
    marginBottom: 16,
    borderBottom: '1px solid var(--t-line, #1e2530)',
    overflowX: 'auto',
  },
  tabBtn: (active) => ({
    padding: '9px 14px',
    fontSize: 11,
    fontWeight: 700,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #00e5ff' : '2px solid transparent',
    color: active ? '#00e5ff' : 'var(--t-text-muted, #5c6880)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: -1,
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  }),
  // Cards
  card: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    padding: '14px 16px',
    marginBottom: 10,
  },
  programCard: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  programCardHeader: {
    padding: '12px 14px 0',
  },
  programGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 1,
    marginBottom: 16,
  },
  // Tables
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    borderBottom: '1px solid var(--t-line, #1e2530)',
    background: '#070b14',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid rgba(30,37,48,0.5)',
    color: 'var(--t-text, #e8eaf0)',
    verticalAlign: 'middle',
  },
  // Buttons
  btn: {
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    background: '#00e5ff',
    color: '#070b14',
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  btnGhost: {
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    background: 'transparent',
    color: 'var(--t-text-muted, #5c6880)',
    border: '1px solid var(--t-line, #1e2530)',
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  btnSm: {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: 'transparent',
    color: '#00e5ff',
    border: '1px solid rgba(0,229,255,0.3)',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: 'transparent',
    color: '#ff4d7d',
    border: '1px solid rgba(255,77,125,0.3)',
    cursor: 'pointer',
  },
  btnSuccess: {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: 'transparent',
    color: '#2ad6a0',
    border: '1px solid rgba(42,214,160,0.3)',
    cursor: 'pointer',
  },
  // Form elements
  input: {
    background: '#070b14',
    border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  select: {
    background: '#070b14',
    border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  textarea: {
    background: '#070b14',
    border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    minHeight: 68,
    fontFamily: 'inherit',
  },
  formField: { marginBottom: 12 },
  formLabel: {
    display: 'block',
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 5,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  // Modals
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(7,11,20,0.88)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHdr: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--t-line, #1e2530)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#00e5ff',
    letterSpacing: '-0.01em',
  },
  modalBody: { padding: '20px' },
  // Misc
  sectionLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: '#00e5ff',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 12,
  },
  progressBg: {
    height: 4,
    background: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  progressFill: (pct, color = '#00e5ff') => ({
    height: '100%',
    width: Math.min(100, pct) + '%',
    background: pct > 85 ? '#ff4d7d' : pct > 65 ? '#ffb800' : color,
    transition: 'width 0.6s ease',
  }),
  errBox: {
    background: 'rgba(255,77,125,0.08)',
    border: '1px solid rgba(255,77,125,0.25)',
    color: '#ff4d7d',
    padding: '10px 12px',
    fontSize: 12,
    marginBottom: 10,
  },
  successBox: {
    background: 'rgba(42,214,160,0.08)',
    border: '1px solid rgba(42,214,160,0.25)',
    color: '#2ad6a0',
    padding: '10px 12px',
    fontSize: 12,
    marginBottom: 10,
  },
  infoBox: {
    background: 'rgba(0,229,255,0.06)',
    border: '1px solid rgba(0,229,255,0.2)',
    color: 'var(--t-text-muted, #5c6880)',
    padding: '10px 12px',
    fontSize: 12,
    marginBottom: 10,
  },
  emptyState: {
    textAlign: 'center',
    padding: '32px 16px',
    color: 'var(--t-text-faint, #3d4a5c)',
    fontSize: 13,
  },
  loader: {
    textAlign: 'center',
    padding: '24px',
    color: '#00e5ff',
    fontSize: 12,
    letterSpacing: '0.05em',
  },
  avatar: (color) => ({
    width: 32,
    height: 32,
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    color: '#fff',
    flexShrink: 0,
  }),
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  const bg = type === 'error' ? '#ff4d7d' : type === 'warn' ? '#ffb800' : '#2ad6a0'
  return (
    <div style={{
      position: 'fixed', top: 18, right: 18, zIndex: 99999,
      background: bg, color: '#000', padding: '11px 20px',
      fontWeight: 700, fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,.6)',
    }}>
      {msg}
    </div>
  )
}

// ─── CategoryBadge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const cls = CATEGORY_BADGE_COLOR[category] || 'blue'
  return <span className={`badge ${cls}`}>{category}</span>
}

// ─── RateDisplay ──────────────────────────────────────────────────────────────

function RateDisplay({ program }) {
  if (program.rate_type === 'per-item') return <>{fmt$(program.rate_amount)}/item</>
  if (program.rate_type === 'percentage') return <>{program.rate_amount}%</>
  if (program.rate_type === 'flat bonus') return <>{fmt$(program.rate_amount)} flat</>
  return <>{fmt$(program.rate_amount)}</>
}

// ─── BudgetBar ────────────────────────────────────────────────────────────────

function BudgetBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-text-muted, #5c6880)', marginBottom: 3 }}>
        <span>{fmt$K(used)} used</span>
        <span>{fmtPct(pct)}</span>
      </div>
      <div style={S.progressBg}>
        <div style={S.progressFill(pct, '#2ad6a0')} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 3 }}>
        {fmt$K(total - used)} remaining of {fmt$K(total)}
      </div>
    </div>
  )
}

// ─── ForensicKpiPanel ─────────────────────────────────────────────────────────

function ForensicKpiPanel({ programs, earnings, topEarners, locationStats, loading }) {
  const activePrograms = programs.filter(isActive)
  const today = new Date().toISOString().slice(0, 10)
  const wStart = weekStart()
  const mStart = monthStart()

  const paidEarnings = earnings.filter(e => e.status === 'paid' || e.status === 'approved')
  const weekEarnings = paidEarnings.filter(e => e.date >= wStart)
  const monthEarnings = paidEarnings.filter(e => e.date >= mStart)
  const pendingEarnings = earnings.filter(e => e.status === 'pending')

  const weekTotal = weekEarnings.reduce((a, e) => a + e.amount, 0)
  const monthTotal = monthEarnings.reduce((a, e) => a + e.amount, 0)
  const totalBudget = activePrograms.reduce((a, p) => a + (p.budget_total || 0), 0)
  const totalUsed = activePrograms.reduce((a, p) => a + (p.budget_used || 0), 0)
  const budgetPct = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0
  const budgetRemaining = totalBudget - totalUsed
  const uniqueEmployees = new Set(monthEarnings.map(e => e.person_id).filter(Boolean)).size
  const avgPerEmployee = uniqueEmployees > 0 ? monthTotal / uniqueEmployees : 0
  const pendingTotal = pendingEarnings.reduce((a, e) => a + e.amount, 0)

  const topWeek = [...topEarners].sort((a, b) => b.week_total - a.week_total)[0]
  const topMonth = [...topEarners].sort((a, b) => b.month_total - a.month_total)[0]
  const monthTxWithSpiff = monthEarnings.length
  const avgPerSpiff = monthTxWithSpiff > 0 ? monthTotal / monthTxWithSpiff : 0
  const mostEligSold = programs.reduce((max, p) => p.sold_count > (max?.sold_count || 0) ? p : max, null)

  if (loading) return <div style={{ ...S.loader, marginBottom: 14 }}>Loading KPIs…</div>

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Row 1 — Spiff Overview */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>Spiff Overview</div>
        <div style={S.kpiRow}>
          {[
            { label: 'Active Programs', val: activePrograms.length, color: '#00e5ff' },
            { label: 'Spiffs Earned This Week', val: weekEarnings.length, color: 'var(--t-text, #e8eaf0)' },
            { label: 'Total Earned This Month', val: fmt$K(monthTotal), color: '#2ad6a0' },
            { label: 'Avg Spiff / Employee', val: fmt$(avgPerEmployee), color: '#2ad6a0' },
            { label: 'Budget Used', val: fmtPct(budgetPct), color: budgetPct > 80 ? '#ff4d7d' : '#ffb800' },
            { label: 'Pending Payouts', val: fmt$K(pendingTotal), color: '#ffb800' },
          ].map(({ label, val, color }) => (
            <div key={label} style={S.kpiTile}>
              <div style={S.kpiLabel}>{label}</div>
              <div style={{ ...S.kpiVal, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2 — Top Performance */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>Top Performance</div>
        <div style={S.kpiRow}>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Top Earner This Week</div>
            <div style={{ ...S.kpiVal, fontSize: 14, color: '#ffb800' }}>{topWeek?.person_name || '—'}</div>
            <div style={S.kpiSub}>{topWeek ? fmt$(topWeek.week_total) : '—'}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Top Earner This Month</div>
            <div style={{ ...S.kpiVal, fontSize: 14, color: '#ffb800' }}>{topMonth?.person_name || '—'}</div>
            <div style={S.kpiSub}>{topMonth ? fmt$(topMonth.month_total) : '—'}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Most Spiff-Eligible Sold</div>
            <div style={{ ...S.kpiVal, fontSize: 13, color: 'var(--t-text, #e8eaf0)', lineHeight: 1.2 }}>
              {mostEligSold?.title?.slice(0, 18) || '—'}
            </div>
            <div style={S.kpiSub}>{mostEligSold ? mostEligSold.sold_count + ' units' : ''}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Budget Remaining</div>
            <div style={{ ...S.kpiVal, color: '#2ad6a0' }}>{fmt$K(budgetRemaining)}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Spiff Entries This Month</div>
            <div style={{ ...S.kpiVal, color: 'var(--t-text, #e8eaf0)' }}>{monthTxWithSpiff}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Avg $ / Spiff</div>
            <div style={{ ...S.kpiVal, color: '#7c4dff' }}>{fmt$(avgPerSpiff)}</div>
          </div>
        </div>
      </div>

      {/* Row 3 — By Location */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>By Location — This Week</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.locTable}>
            <thead>
              <tr>
                {['Location', 'Spiffs This Week', 'Total $', 'Avg / Employee', '% of Spend'].map(h => (
                  <th key={h} style={S.locTh}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationStats.map(row => (
                <tr key={row.location}>
                  <td style={{ ...S.locTd, fontWeight: 700, color: '#00e5ff' }}>{row.location}</td>
                  <td style={S.locTd}>{row.spiffs_week}</td>
                  <td style={{ ...S.locTd, fontWeight: 700, color: '#2ad6a0' }}>{fmt$(row.total_dollar)}</td>
                  <td style={S.locTd}>{fmt$(row.avg_per_employee)}</td>
                  <td style={S.locTd}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#2ad6a0', fontWeight: 700 }}>
                        {fmtPct(row.share_pct)}
                      </span>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', minWidth: 60 }}>
                        <div style={{
                          height: '100%',
                          width: Math.min(100, row.share_pct || 0) + '%',
                          background: '#2ad6a0',
                        }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── ProgramCard ──────────────────────────────────────────────────────────────

function ProgramCard({ program, myEarningsFromProg, onLogSpiff, isHR, onEdit }) {
  const dl = daysLeft(program.end_date)
  const active = isActive(program)
  const budgetPct = program.budget_total > 0 ? (program.budget_used / program.budget_total) * 100 : 0
  const urgent = dl !== null && dl <= 5 && dl >= 0

  return (
    <div style={{
      ...S.programCard,
      borderColor: urgent ? 'rgba(255,184,0,0.3)' : active ? 'var(--t-line, #1e2530)' : 'rgba(30,37,48,0.5)',
      opacity: active ? 1 : 0.65,
    }}>
      {/* Top accent bar */}
      <div style={{
        height: 3,
        background: active
          ? (urgent ? '#ffb800' : 'linear-gradient(90deg, #00e5ff, #7c4dff)')
          : 'var(--t-line, #1e2530)',
      }} />

      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text, #e8eaf0)', lineHeight: 1.3, marginBottom: 4 }}>
              {program.title}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <CategoryBadge category={program.category} />
              {active
                ? <span className="badge green">Active</span>
                : <span className="badge red">Inactive</span>}
              {urgent && <span className="badge amber">{dl}d left</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#2ad6a0', lineHeight: 1 }}>
              <RateDisplay program={program} />
            </div>
            {dl !== null && active && (
              <div style={{ fontSize: 9, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 3 }}>{dl}d left</div>
            )}
          </div>
        </div>

        {/* Description */}
        {program.description && (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted, #5c6880)', lineHeight: 1.5, marginBottom: 8 }}>
            {program.description}
          </div>
        )}

        {/* Meta rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)', marginBottom: 8 }}>
          {program.eligible_products && (
            <div>
              <span style={{ color: 'var(--t-text-muted, #5c6880)', fontWeight: 600 }}>Products: </span>
              {program.eligible_products}
            </div>
          )}
          {(program.cap_daily || program.cap_weekly) && (
            <div>
              <span style={{ color: 'var(--t-text-muted, #5c6880)', fontWeight: 600 }}>Cap: </span>
              {program.cap_daily ? `${program.cap_daily}/day` : ''}
              {program.cap_daily && program.cap_weekly ? ' · ' : ''}
              {program.cap_weekly ? `${program.cap_weekly}/week` : ''}
            </div>
          )}
          <div>
            <span style={{ color: 'var(--t-text-muted, #5c6880)', fontWeight: 600 }}>Dates: </span>
            {fmtDate(program.start_date)} → {program.end_date ? fmtDate(program.end_date) : 'Ongoing'}
          </div>
          {program.eligible_locations && (
            <div>
              <span style={{ color: 'var(--t-text-muted, #5c6880)', fontWeight: 600 }}>Locations: </span>
              {program.eligible_locations}
            </div>
          )}
        </div>

        {/* My earnings from this program */}
        {myEarningsFromProg !== undefined && (
          <div style={{
            background: 'rgba(42,214,160,0.07)',
            border: '1px solid rgba(42,214,160,0.18)',
            padding: '8px 10px',
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 10, color: 'var(--t-text-muted, #5c6880)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              My Earnings
            </span>
            <span style={{ fontWeight: 800, color: '#2ad6a0', fontSize: 15 }}>{fmt$(myEarningsFromProg)}</span>
          </div>
        )}

        {/* Company total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)', marginBottom: 6 }}>
          <span>{program.sold_count || 0} sold company-wide · {program.participants || 0} employees</span>
        </div>

        {/* Budget bar */}
        {program.budget_total > 0 && <BudgetBar used={program.budget_used || 0} total={program.budget_total} />}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {active && (
            <button style={{ ...S.btnSm, flex: 1 }} onClick={() => onLogSpiff(program)}>
              Log Spiff
            </button>
          )}
          {isHR && (
            <button style={S.btnSm} onClick={() => onEdit(program)}>Edit</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab 1 — Active Programs ──────────────────────────────────────────────────

function TabActivePrograms({ programs, myEarnings, onLogSpiff, isHR, onEdit }) {
  const [filterCat, setFilterCat] = useState('all')
  const activeProgs = programs.filter(isActive)
  const filtered = filterCat === 'all' ? activeProgs : activeProgs.filter(p => p.category === filterCat)
  const categories = [...new Set(programs.filter(isActive).map(p => p.category))]

  function myEarningsForProg(progId) {
    return myEarnings
      .filter(e => e.program_id === progId && (e.status === 'paid' || e.status === 'approved'))
      .reduce((a, e) => a + e.amount, 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted, #5c6880)' }}>
          {activeProgs.length} active program{activeProgs.length !== 1 ? 's' : ''}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select
            style={{ ...S.select, width: 'auto', padding: '5px 8px', fontSize: 11 }}
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={S.emptyState}>No active spiff programs match this filter.</div>
      ) : (
        <div style={S.programGrid}>
          {filtered.map(p => (
            <ProgramCard
              key={p.id}
              program={p}
              myEarningsFromProg={myEarningsForProg(p.id)}
              onLogSpiff={onLogSpiff}
              isHR={isHR}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2 — My Earnings ──────────────────────────────────────────────────────

function TabMyEarnings({ earnings }) {
  const wStart = weekStart()
  const mStart = monthStart()
  const qStart = quarterStart()

  const paid = earnings.filter(e => e.status === 'paid' || e.status === 'approved')
  const weekEarned = paid.filter(e => e.date >= wStart).reduce((a, e) => a + e.amount, 0)
  const monthEarned = paid.filter(e => e.date >= mStart).reduce((a, e) => a + e.amount, 0)
  const quarterEarned = paid.filter(e => e.date >= qStart).reduce((a, e) => a + e.amount, 0)
  const allTimeEarned = paid.reduce((a, e) => a + e.amount, 0)

  // Payout history: group by month
  const payoutsByMonth = {}
  paid.forEach(e => {
    const mo = e.date.slice(0, 7)
    payoutsByMonth[mo] = (payoutsByMonth[mo] || 0) + e.amount
  })

  // Weekly bar chart data (last 8 weeks)
  const weekBars = []
  for (let i = 7; i >= 0; i--) {
    const wEnd = new Date()
    wEnd.setDate(wEnd.getDate() - i * 7)
    const wS = new Date(wEnd)
    wS.setDate(wS.getDate() - 6)
    const label = wS.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const wStartStr = wS.toISOString().slice(0, 10)
    const wEndStr = wEnd.toISOString().slice(0, 10)
    const total = paid.filter(e => e.date >= wStartStr && e.date <= wEndStr).reduce((a, e) => a + e.amount, 0)
    weekBars.push({ label, total })
  }
  const maxBar = Math.max(...weekBars.map(b => b.total), 1)

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, marginBottom: 16 }}>
        {[
          { label: 'This Week', val: fmt$(weekEarned), color: '#2ad6a0' },
          { label: 'This Month', val: fmt$(monthEarned), color: '#2ad6a0' },
          { label: 'This Quarter', val: fmt$(quarterEarned), color: '#00e5ff' },
          { label: 'All Time', val: fmt$(allTimeEarned), color: '#7c4dff' },
        ].map(({ label, val, color }) => (
          <div key={label} style={S.kpiTile}>
            <div style={S.kpiLabel}>{label}</div>
            <div style={{ ...S.kpiVal, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Weekly earnings bar chart (text table) */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={S.sectionLabel}>Weekly Earnings — Last 8 Weeks</div>
        {weekBars.every(b => b.total === 0) ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-faint, #3d4a5c)' }}>No earnings data yet.</div>
        ) : (
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80, padding: '0 0 8px' }}>
            {weekBars.map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: '#2ad6a0', fontWeight: 700 }}>
                  {b.total > 0 ? fmt$(b.total) : ''}
                </div>
                <div style={{
                  width: '100%',
                  background: i === weekBars.length - 1 ? '#00e5ff' : '#2ad6a0',
                  height: Math.round((b.total / maxBar) * 56) + 2,
                  minHeight: b.total > 0 ? 4 : 1,
                  opacity: b.total > 0 ? 1 : 0.2,
                }} />
                <div style={{ fontSize: 8, color: 'var(--t-text-faint, #3d4a5c)', textAlign: 'center', lineHeight: 1.2 }}>
                  {b.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Earnings table */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Earnings History</div>
        {earnings.length === 0 ? (
          <div style={S.emptyState}>No spiff entries yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead>
                <tr>
                  {['Date', 'Program', 'Qty', 'Amount', 'Shift', 'Verified By', 'Tx ID', 'Status'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {earnings.slice(0, 60).map(e => (
                  <tr key={e.id}>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted, #5c6880)' }}>{fmtDate(e.date)}</td>
                    <td style={{ ...S.td, fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.program_title}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted, #5c6880)', textAlign: 'center' }}>{e.quantity}</td>
                    <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0' }}>{fmt$(e.amount)}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted, #5c6880)' }}>{e.shift || '—'}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)' }}>{e.verified_by || '—'}</td>
                    <td style={{ ...S.td, fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', fontFamily: 'monospace' }}>{e.transaction_id || '—'}</td>
                    <td style={S.td}>
                      <span className={`badge ${e.status === 'paid' || e.status === 'approved' ? 'green' : e.status === 'pending' ? 'amber' : 'red'}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ ...S.td, fontWeight: 700, textAlign: 'right', color: 'var(--t-text-muted, #5c6880)' }}>
                    Total Paid:
                  </td>
                  <td style={{ ...S.td, fontWeight: 900, fontSize: 15, color: '#2ad6a0' }}>{fmt$(allTimeEarned)}</td>
                  <td colSpan={4} style={S.td} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payout history by month */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Monthly Payout History</div>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>Month</th>
              <th style={S.th}>Total Paid Out</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(payoutsByMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([mo, total]) => (
              <tr key={mo}>
                <td style={{ ...S.td, fontWeight: 600 }}>
                  {new Date(mo + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </td>
                <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0' }}>{fmt$(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── LogSpiffModal ────────────────────────────────────────────────────────────

function LogSpiffModal({ programs, defaultProgram, personId, locationIds, onClose, onLogged, showToast }) {
  const activeProgs = programs.filter(isActive)
  const [selectedId, setSelectedId] = useState(defaultProgram?.id || activeProgs[0]?.id || '')
  const [qty, setQty] = useState(1)
  const [txId, setTxId] = useState('')
  const [notes, setNotes] = useState('')
  const [dateVal, setDateVal] = useState(new Date().toISOString().slice(0, 16))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const selectedProg = activeProgs.find(p => p.id === selectedId)
  const totalEarned = selectedProg ? selectedProg.rate_amount * qty : 0

  async function submit(e) {
    e.preventDefault()
    if (!selectedId) { setError('Select a program.'); return }
    if (qty < 1) { setError('Quantity must be at least 1.'); return }
    if (!personId) { setError('No signed-in employee — cannot log a spiff.'); return }
    setSaving(true)
    setError(null)
    try {
      const { error: rpcErr } = await sb.rpc('log_spiff', {
        p_person_id: personId,
        p_program_id: selectedId,
        p_quantity: qty,
        p_amount: totalEarned,
        p_node_id: locationIds?.[0] || null,
        p_transaction_id: txId || null,
        p_notes: notes || null,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      setSuccess(true)
      onLogged?.()
      showToast(`Spiff logged — ${fmt$(totalEarned)} pending approval`)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err?.message || 'Could not log spiff. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHdr}>
          <div style={S.modalTitle}>Log Spiff Sale</div>
          <button style={{ background: 'none', border: 'none', color: 'var(--t-text-muted, #5c6880)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }} onClick={onClose}>×</button>
        </div>
        <div style={S.modalBody}>
          {success && <div style={S.successBox}>Spiff logged successfully!</div>}
          {error && <div style={S.errBox}>{error}</div>}
          {!success && (
            <form onSubmit={submit}>
              <div style={S.formField}>
                <label style={S.formLabel}>Program *</label>
                <select style={S.select} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                  <option value="">— Select program —</option>
                  {activeProgs.map(p => (
                    <option key={p.id} value={p.id}>{p.title} — {fmt$(p.rate_amount)}/{p.rate_type === 'flat bonus' ? 'flat' : 'item'}</option>
                  ))}
                </select>
              </div>

              {selectedProg && (
                <div style={{
                  background: 'rgba(0,229,255,0.06)',
                  border: '1px solid rgba(0,229,255,0.18)',
                  padding: '10px 14px',
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted, #5c6880)', marginBottom: 4 }}>
                    {selectedProg.description}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)' }}>
                    Rate: <span style={{ color: '#00e5ff', fontWeight: 700 }}>{fmt$(selectedProg.rate_amount)}</span>
                    {selectedProg.cap_daily && ` · Cap: ${selectedProg.cap_daily}/day`}
                    {selectedProg.cap_weekly && `, ${selectedProg.cap_weekly}/week`}
                  </div>
                </div>
              )}

              <div style={S.grid2}>
                <div style={S.formField}>
                  <label style={S.formLabel}>Quantity *</label>
                  <input
                    style={S.input}
                    type="number"
                    min={1}
                    max={99}
                    value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    required
                  />
                </div>
                <div style={S.formField}>
                  <label style={S.formLabel}>Date &amp; Time</label>
                  <input
                    style={S.input}
                    type="datetime-local"
                    value={dateVal}
                    onChange={e => setDateVal(e.target.value)}
                  />
                </div>
              </div>

              <div style={S.formField}>
                <label style={S.formLabel}>Transaction ID (optional)</label>
                <input
                  style={S.input}
                  value={txId}
                  onChange={e => setTxId(e.target.value)}
                  placeholder="e.g. TXN-12345"
                />
              </div>

              <div style={S.formField}>
                <label style={S.formLabel}>Notes (optional)</label>
                <textarea
                  style={S.textarea}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Product name, customer details…"
                />
              </div>

              {/* Preview */}
              {selectedProg && (
                <div style={{
                  background: 'rgba(42,214,160,0.08)',
                  border: '1px solid rgba(42,214,160,0.2)',
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted, #5c6880)' }}>
                    You'll earn for this entry:
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#2ad6a0' }}>
                    {fmt$(totalEarned)}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" style={S.btnGhost} onClick={onClose}>Cancel</button>
                <button
                  type="submit"
                  style={{ ...S.btn, opacity: saving ? 0.6 : 1 }}
                  disabled={saving || !selectedId}
                >
                  {saving ? 'Logging…' : `Log — ${fmt$(totalEarned)}`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ProgramModal (create/edit) ───────────────────────────────────────────────

const BLANK_FORM = {
  title: '',
  description: '',
  category: 'Product-specific',
  rate_type: 'per-item',
  rate_amount: '',
  eligible_products: '',
  cap_daily: '',
  cap_weekly: '',
  budget_total: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  is_active: true,
  eligible_locations: 'All',
  eligible_roles: 'All Staff',
}

function ProgramModal({ program, locationIds, actorId, locations = [], onClose, onSaved, showToast }) {
  const isEdit = !!program
  const [form, setForm] = useState(
    isEdit
      ? {
          title: program.title || '',
          description: program.description || '',
          category: program.category || 'Product-specific',
          rate_type: program.rate_type || 'per-item',
          rate_amount: program.rate_amount || '',
          eligible_products: program.eligible_products || '',
          cap_daily: program.cap_daily || '',
          cap_weekly: program.cap_weekly || '',
          budget_total: program.budget_total || '',
          start_date: program.start_date || new Date().toISOString().slice(0, 10),
          end_date: program.end_date || '',
          is_active: program.is_active !== false,
          eligible_locations: program.eligible_locations || 'All',
          eligible_roles: program.eligible_roles || 'All Staff',
        }
      : { ...BLANK_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.rate_amount || isNaN(parseFloat(form.rate_amount))) { setError('Rate amount is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const { error: rpcErr } = await sb.rpc('upsert_spiff_program', {
        p_id: isEdit ? program.id : null,
        p_title: form.title.trim(),
        p_description: form.description || null,
        p_category: form.category,
        p_rate_type: form.rate_type,
        p_rate_amount: parseFloat(form.rate_amount),
        p_eligible_products: form.eligible_products || null,
        p_cap_daily: form.cap_daily ? parseInt(form.cap_daily) : null,
        p_cap_weekly: form.cap_weekly ? parseInt(form.cap_weekly) : null,
        p_budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
        p_start_date: form.start_date || null,
        p_end_date: form.end_date || null,
        p_is_active: form.is_active,
        p_eligible_locations: form.eligible_locations,
        p_eligible_roles: form.eligible_roles,
        p_node_id: locationIds?.[0] || null,
        p_actor: actorId || null,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      onSaved?.()
      showToast(isEdit ? 'Program updated!' : 'Program created!')
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save program. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHdr}>
          <div style={S.modalTitle}>{isEdit ? 'Edit Program' : 'Create Spiff Program'}</div>
          <button style={{ background: 'none', border: 'none', color: 'var(--t-text-muted, #5c6880)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }} onClick={onClose}>×</button>
        </div>
        <div style={S.modalBody}>
          {error && <div style={S.errBox}>{error}</div>}
          <form onSubmit={submit}>
            <div style={S.formField}>
              <label style={S.formLabel}>Title *</label>
              <input style={S.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Premium Brand Bonus" required />
            </div>

            <div style={S.formField}>
              <label style={S.formLabel}>Description</label>
              <textarea style={S.textarea} value={form.description} onChange={e => set('description', e.target.value)} placeholder="How to earn this spiff, qualifying criteria…" />
            </div>

            <div style={S.grid2}>
              <div style={S.formField}>
                <label style={S.formLabel}>Category</label>
                <select style={S.select} value={form.category} onChange={e => set('category', e.target.value)}>
                  {['Product-specific', 'Revenue threshold', 'Upsell', 'New Customer', 'Promotion'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={S.formField}>
                <label style={S.formLabel}>Rate Type</label>
                <select style={S.select} value={form.rate_type} onChange={e => set('rate_type', e.target.value)}>
                  <option value="per-item">Per Item ($)</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat bonus">Flat Bonus ($)</option>
                </select>
              </div>
            </div>

            <div style={S.grid3}>
              <div style={S.formField}>
                <label style={S.formLabel}>Rate Amount *</label>
                <input style={S.input} type="number" step="0.01" min="0" value={form.rate_amount} onChange={e => set('rate_amount', e.target.value)} placeholder="0.00" required />
              </div>
              <div style={S.formField}>
                <label style={S.formLabel}>Cap / Day</label>
                <input style={S.input} type="number" min="0" value={form.cap_daily} onChange={e => set('cap_daily', e.target.value)} placeholder="No cap" />
              </div>
              <div style={S.formField}>
                <label style={S.formLabel}>Cap / Week</label>
                <input style={S.input} type="number" min="0" value={form.cap_weekly} onChange={e => set('cap_weekly', e.target.value)} placeholder="No cap" />
              </div>
            </div>

            <div style={S.formField}>
              <label style={S.formLabel}>Eligible Products (comma-separated)</label>
              <input style={S.input} value={form.eligible_products} onChange={e => set('eligible_products', e.target.value)} placeholder="e.g. Lelo, We-Vibe, Womanizer" />
            </div>

            <div style={S.formField}>
              <label style={S.formLabel}>Total Budget ($)</label>
              <input style={S.input} type="number" step="0.01" min="0" value={form.budget_total} onChange={e => set('budget_total', e.target.value)} placeholder="Optional" />
            </div>

            <div style={S.grid2}>
              <div style={S.formField}>
                <label style={S.formLabel}>Start Date</label>
                <input style={S.input} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div style={S.formField}>
                <label style={S.formLabel}>End Date</label>
                <input style={S.input} type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            </div>

            <div style={S.grid2}>
              <div style={S.formField}>
                <label style={S.formLabel}>Location Eligibility</label>
                <select style={S.select} value={form.eligible_locations} onChange={e => set('eligible_locations', e.target.value)}>
                  <option value="All">All Locations</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={S.formField}>
                <label style={S.formLabel}>Role Eligibility</label>
                <select style={S.select} value={form.eligible_roles} onChange={e => set('eligible_roles', e.target.value)}>
                  <option value="All Staff">All Staff</option>
                  <option value="Key Holder+">Key Holder+</option>
                  <option value="Manager+">Manager+</option>
                  <option value="Associates Only">Associates Only</option>
                </select>
              </div>
            </div>

            <div style={{ ...S.formField, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="prog-active"
                checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#00e5ff' }}
              />
              <label htmlFor="prog-active" style={{ ...S.formLabel, margin: 0, cursor: 'pointer' }}>
                Active (visible to employees)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" style={S.btnGhost} onClick={onClose}>Cancel</button>
              <button type="submit" style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Program'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 3 — Log Spiff (standalone tab) ──────────────────────────────────────

function TabLogSpiff({ programs, personId, locationIds, onLogged, showToast }) {
  const activeProgs = programs.filter(isActive)
  const [selectedId, setSelectedId] = useState(activeProgs[0]?.id || '')
  const [qty, setQty] = useState(1)
  const [txId, setTxId] = useState('')
  const [dateVal, setDateVal] = useState(new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const selectedProg = activeProgs.find(p => p.id === selectedId)
  const totalEarned = selectedProg ? selectedProg.rate_amount * qty : 0

  async function submit(e) {
    e.preventDefault()
    if (!selectedId) { setError('Select a program.'); return }
    if (qty < 1) { setError('Quantity must be at least 1.'); return }
    if (!personId) { setError('No signed-in employee — cannot log a spiff.'); return }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const { error: rpcErr } = await sb.rpc('log_spiff', {
        p_person_id: personId,
        p_program_id: selectedId,
        p_quantity: qty,
        p_amount: totalEarned,
        p_node_id: locationIds?.[0] || null,
        p_transaction_id: txId || null,
        p_notes: notes || null,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      setSuccess(`Logged ${qty}× ${selectedProg?.title} — ${fmt$(totalEarned)} pending approval`)
      showToast(`Spiff logged — ${fmt$(totalEarned)}`)
      onLogged?.()
      setQty(1)
      setTxId('')
      setNotes('')
    } catch (err) {
      setError(err?.message || 'Could not log spiff. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 540 }}>
      <div style={S.card}>
        <div style={S.sectionLabel}>Log a Spiff Sale</div>
        {error && <div style={S.errBox}>{error}</div>}
        {success && <div style={S.successBox}>{success}</div>}
        <form onSubmit={submit}>
          <div style={S.formField}>
            <label style={S.formLabel}>Program *</label>
            <select style={S.select} value={selectedId} onChange={e => { setSelectedId(e.target.value); setQty(1) }}>
              <option value="">— Select program —</option>
              {activeProgs.map(p => (
                <option key={p.id} value={p.id}>{p.title} — {fmt$(p.rate_amount)}/{p.rate_type === 'flat bonus' ? 'flat' : 'item'}</option>
              ))}
            </select>
          </div>

          {selectedProg && (
            <div style={{ ...S.infoBox, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--t-text, #e8eaf0)', marginBottom: 4 }}>{selectedProg.description}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)' }}>
                Products: {selectedProg.eligible_products || 'All'}
                {selectedProg.cap_daily ? ` · Cap ${selectedProg.cap_daily}/day` : ''}
                {selectedProg.cap_weekly ? ` · ${selectedProg.cap_weekly}/week` : ''}
              </div>
            </div>
          )}

          <div style={S.grid2}>
            <div style={S.formField}>
              <label style={S.formLabel}>Quantity *</label>
              <input
                style={S.input}
                type="number"
                min={1}
                max={99}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                required
              />
            </div>
            <div style={S.formField}>
              <label style={S.formLabel}>Date &amp; Time</label>
              <input style={S.input} type="datetime-local" value={dateVal} onChange={e => setDateVal(e.target.value)} />
            </div>
          </div>

          <div style={S.formField}>
            <label style={S.formLabel}>Transaction ID (optional)</label>
            <input style={S.input} value={txId} onChange={e => setTxId(e.target.value)} placeholder="e.g. TXN-12345" />
          </div>

          <div style={S.formField}>
            <label style={S.formLabel}>Notes (optional)</label>
            <textarea style={S.textarea} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Product sold, customer details…" />
          </div>

          {/* Preview */}
          <div style={{
            background: selectedProg ? 'rgba(42,214,160,0.08)' : 'transparent',
            border: selectedProg ? '1px solid rgba(42,214,160,0.2)' : 'none',
            padding: selectedProg ? '12px 16px' : 0,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'all 0.2s',
          }}>
            {selectedProg ? (
              <>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted, #5c6880)' }}>You'll earn for this entry</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)' }}>Pending manager approval</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#2ad6a0' }}>{fmt$(totalEarned)}</div>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              style={{ ...S.btn, opacity: (saving || !selectedId) ? 0.6 : 1, flex: 1 }}
              disabled={saving || !selectedId}
            >
              {saving ? 'Logging…' : selectedProg ? `Submit — ${fmt$(totalEarned)}` : 'Submit Spiff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab 4 — Manage Programs ──────────────────────────────────────────────────

function TabManagePrograms({ programs, locationIds, actorId, locations, onRefresh, showToast }) {
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCat, setFilterCat] = useState('all')
  const [editProgram, setEditProgram] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toggling, setToggling] = useState(null)

  const filtered = programs.filter(p => {
    const act = isActive(p)
    if (filterStatus === 'active' && !act) return false
    if (filterStatus === 'inactive' && act) return false
    if (filterCat !== 'all' && p.category !== filterCat) return false
    return true
  })

  const categories = [...new Set(programs.map(p => p.category))]

  async function toggleActive(prog) {
    setToggling(prog.id)
    try {
      const { error: rpcErr } = await sb.rpc('set_spiff_program_active', {
        p_id: prog.id,
        p_active: !prog.is_active,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      onRefresh?.()
      showToast(prog.is_active ? 'Program deactivated' : 'Program activated')
    } catch (err) {
      showToast(err?.message || 'Could not update program', 'error')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...S.select, width: 'auto', padding: '5px 8px', fontSize: 11 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select style={{ ...S.select, width: 'auto', padding: '5px 8px', fontSize: 11 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={{ ...S.btn, marginLeft: 'auto' }} onClick={() => setShowCreate(true)}>+ New Program</button>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                {['Title', 'Category', 'Rate', 'Dates', 'Budget', 'Sold', 'Status', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint, #3d4a5c)', padding: 24 }}>
                    No programs match the current filters.
                  </td>
                </tr>
              ) : filtered.map(p => {
                const act = isActive(p)
                const budgetPct = p.budget_total > 0 ? Math.min(100, (p.budget_used / p.budget_total) * 100) : null
                return (
                  <tr key={p.id}>
                    <td style={{ ...S.td, fontWeight: 700, maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      {p.eligible_roles && (
                        <div style={{ fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 2 }}>{p.eligible_roles}</div>
                      )}
                    </td>
                    <td style={S.td}>
                      <CategoryBadge category={p.category} />
                    </td>
                    <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0', whiteSpace: 'nowrap' }}>
                      <RateDisplay program={p} />
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted, #5c6880)', whiteSpace: 'nowrap' }}>
                      {fmtDate(p.start_date)} → {p.end_date ? fmtDate(p.end_date) : '∞'}
                    </td>
                    <td style={{ ...S.td, minWidth: 100 }}>
                      {budgetPct !== null ? (
                        <div>
                          <div style={{ fontSize: 10, color: budgetPct > 80 ? '#ff4d7d' : '#2ad6a0', fontWeight: 700 }}>
                            {fmtPct(budgetPct)}
                          </div>
                          <div style={S.progressBg}>
                            <div style={S.progressFill(budgetPct, '#2ad6a0')} />
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 2 }}>
                            {fmt$K(p.budget_used)} / {fmt$K(p.budget_total)}
                          </div>
                        </div>
                      ) : <span style={{ fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)' }}>—</span>}
                    </td>
                    <td style={{ ...S.td, color: '#00e5ff', fontWeight: 700, textAlign: 'center' }}>{p.sold_count || 0}</td>
                    <td style={S.td}>
                      <span className={`badge ${act ? 'green' : 'red'}`}>{act ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button style={S.btnSm} onClick={() => setEditProgram(p)}>Edit</button>
                        <button
                          style={act ? S.btnDanger : S.btnSuccess}
                          disabled={toggling === p.id}
                          onClick={() => toggleActive(p)}
                        >
                          {toggling === p.id ? '…' : act ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <ProgramModal
          program={null}
          locationIds={locationIds}
          actorId={actorId}
          locations={locations}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); onRefresh?.() }}
          showToast={showToast}
        />
      )}

      {editProgram && (
        <ProgramModal
          program={editProgram}
          locationIds={locationIds}
          actorId={actorId}
          locations={locations}
          onClose={() => setEditProgram(null)}
          onSaved={() => { setEditProgram(null); onRefresh?.() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ─── Tab 5 — Reports ──────────────────────────────────────────────────────────

function TabReports({ programs, earnings, topEarners, locationStats }) {
  const wStart = weekStart()
  const mStart = monthStart()

  const paid = earnings.filter(e => e.status === 'paid' || e.status === 'approved')
  const monthEarned = paid.filter(e => e.date >= mStart).reduce((a, e) => a + e.amount, 0)

  // Top 10 earners this month
  const top10 = topEarners.slice(0, 10)

  // Earnings by program
  const byProg = {}
  programs.forEach(p => { byProg[p.id] = { title: p.title, total: 0, count: 0, budget_total: p.budget_total || 0, budget_used: p.budget_used || 0 } })
  paid.forEach(e => {
    if (byProg[e.program_id]) {
      byProg[e.program_id].total += e.amount
      byProg[e.program_id].count += 1
    }
  })
  const progRows = Object.values(byProg).sort((a, b) => b.total - a.total)

  // Month-over-month trend (last 6 months)
  const momTrend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const moTotal = paid.filter(e => e.date.startsWith(mo)).reduce((a, e) => a + e.amount, 0)
    const moCount = paid.filter(e => e.date.startsWith(mo)).length
    momTrend.push({
      month: new Date(mo + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: moTotal,
      count: moCount,
    })
  }

  // Estimated payroll impact
  const estimatedPayroll = monthEarned
  const estimatedTax = estimatedPayroll * 0.0765
  const totalPayrollImpact = estimatedPayroll + estimatedTax

  function exportCSV() {
    const header = ['Rank', 'Name', 'Location', 'Week Total', 'Month Total', 'Count']
    const rows = top10.map(e => [e.rank, e.person_name, e.location, fmt$(e.week_total), fmt$(e.month_total), e.count_month])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'spiff-report.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Payroll Impact */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={S.sectionLabel}>Estimated Payroll Impact — This Month</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1 }}>
          {[
            { label: 'Spiff Earnings', val: fmt$(estimatedPayroll), color: '#2ad6a0' },
            { label: 'Est. Payroll Tax (7.65%)', val: fmt$(estimatedTax), color: '#ffb800' },
            { label: 'Total Payroll Impact', val: fmt$(totalPayrollImpact), color: '#ff4d7d' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ ...S.kpiTile, border: '1px solid var(--t-line, #1e2530)', padding: '10px 12px' }}>
              <div style={S.kpiLabel}>{label}</div>
              <div style={{ ...S.kpiVal, fontSize: 18, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 10 Earners */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={S.sectionLabel}>Top 10 Earners — This Month</div>
          <button style={S.btnSm} onClick={exportCSV}>Export CSV</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                {['Rank', 'Employee', 'Location', 'Week Earned', 'Month Earned', 'Transactions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top10.map((e, i) => (
                <tr key={e.person_name + i}>
                  <td style={{ ...S.td, fontWeight: 900, color: i === 0 ? '#ffb800' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--t-text-faint, #3d4a5c)', textAlign: 'center', width: 40 }}>
                    {i + 1}
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={S.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                        {e.avatar}
                      </div>
                      <span style={{ fontWeight: 600 }}>{e.person_name}</span>
                    </div>
                  </td>
                  <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted, #5c6880)' }}>{e.location}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{fmt$(e.week_total)}</td>
                  <td style={{ ...S.td, fontWeight: 800, fontSize: 15, color: i === 0 ? '#ffb800' : '#2ad6a0' }}>{fmt$(e.month_total)}</td>
                  <td style={{ ...S.td, color: '#00e5ff', fontWeight: 700, textAlign: 'center' }}>{e.count_month}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Earnings by Program */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Budget Utilization by Program</div>
        {progRows.filter(p => p.budget_total > 0).map(p => {
          const pct = p.budget_total > 0 ? Math.min(100, (p.budget_used / p.budget_total) * 100) : 0
          return (
            <div key={p.title} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text, #e8eaf0)' }}>{p.title}</span>
                <span style={{ fontSize: 11, color: pct > 80 ? '#ff4d7d' : '#2ad6a0', fontWeight: 700 }}>
                  {fmtPct(pct)} — {fmt$K(p.budget_used)} / {fmt$K(p.budget_total)}
                </span>
              </div>
              <div style={S.progressBg}>
                <div style={S.progressFill(pct, '#2ad6a0')} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Earnings by Program Table */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Earnings by Program</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                {['Program', 'Total Earned', 'Entries', 'Budget Used'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {progRows.map(p => (
                <tr key={p.title}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{p.title}</td>
                  <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0' }}>{fmt$(p.total)}</td>
                  <td style={{ ...S.td, color: '#00e5ff', textAlign: 'center' }}>{p.count}</td>
                  <td style={S.td}>
                    {p.budget_total > 0
                      ? <span style={{ color: (p.budget_used / p.budget_total) > 0.8 ? '#ff4d7d' : '#2ad6a0', fontWeight: 700 }}>
                          {fmt$K(p.budget_used)} / {fmt$K(p.budget_total)}
                        </span>
                      : <span style={{ color: 'var(--t-text-faint, #3d4a5c)' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Month-over-month trend */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Month-over-Month Trend</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                {['Month', 'Total Spiff Paid', 'Entries', 'vs Prior Month'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {momTrend.map((row, i) => {
                const prior = i > 0 ? momTrend[i - 1].total : null
                const delta = prior !== null && prior > 0 ? ((row.total - prior) / prior) * 100 : null
                return (
                  <tr key={row.month}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.month}</td>
                    <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0' }}>{fmt$(row.total)}</td>
                    <td style={{ ...S.td, color: '#00e5ff', textAlign: 'center' }}>{row.count}</td>
                    <td style={S.td}>
                      {delta !== null ? (
                        <span style={{ color: delta >= 0 ? '#2ad6a0' : '#ff4d7d', fontWeight: 700 }}>
                          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: 'var(--t-text-faint, #3d4a5c)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Spiffs() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))
  const myPersonId = session?.person?.id
  const locationNames = (locations || []).map(l => l.name).filter(Boolean)

  const [tab, setTab] = useState('programs')
  const [programs, setPrograms] = useState([])
  const [myEarnings, setMyEarnings] = useState([])
  const [coEarnings, setCoEarnings] = useState([])
  const [locationStats, setLocationStats] = useState([])
  const [topEarners, setTopEarners] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [logModal, setLogModal] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const nodes = (locationIds && locationIds.length) ? locationIds : (getSession().nodes || [])
    const wStart = weekStart()
    const mStart = monthStart()
    const dateFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const dateTo = new Date().toISOString().slice(0, 10)
    try {
      const [progsRes, mineRes, coRes, locRes, topRes] = await Promise.all([
        sb.rpc('spiff_programs_enriched', { p_node_ids: nodes }),
        sb.rpc('spiff_earnings_scoped', { p_person_id: myPersonId, p_node_ids: nodes, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('spiff_earnings_scoped', { p_person_id: null, p_node_ids: nodes, p_date_from: dateFrom, p_date_to: dateTo }),
        sb.rpc('spiff_location_stats', { p_node_ids: nodes, p_week_start: wStart, p_month_start: mStart }),
        sb.rpc('spiff_top_earners', { p_node_ids: nodes, p_week_start: wStart, p_month_start: mStart }),
      ])
      const firstErr = [progsRes, mineRes, coRes, locRes, topRes].map(r => r.error).find(Boolean)
      if (firstErr) setLoadError(firstErr.message)
      setPrograms(progsRes.data || [])
      setMyEarnings(mineRes.data || [])
      setCoEarnings(coRes.data || [])
      setLocationStats(locRes.data || [])
      setTopEarners(topRes.data || [])
    } catch (err) {
      setLoadError(err?.message || 'Could not load spiff data.')
      setPrograms([]); setMyEarnings([]); setCoEarnings([]); setLocationStats([]); setTopEarners([])
    } finally {
      setLoading(false)
    }
  }, [locationIds, myPersonId, refreshKey])

  useEffect(() => { load() }, [load])

  const activeCount = programs.filter(isActive).length
  const pendingCount = myEarnings.filter(e => e.status === 'pending').length

  const TABS = [
    { id: 'programs', label: `Active Programs (${activeCount})` },
    { id: 'my-earnings', label: 'My Earnings' },
    { id: 'log', label: '+ Log Spiff' },
    ...(isHR ? [{ id: 'manage', label: 'Manage Programs' }] : []),
    ...(isHR ? [{ id: 'reports', label: 'Reports' }] : []),
  ]

  return (
    <div style={S.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={S.headerTitle}>Spiffs &amp; Incentives</h1>
            <div style={S.headerSub}>
              Sales spiff programs, earnings tracker, and performance incentives
              {locationNames.length ? ` — ${locationNames.join(', ')}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pendingCount > 0 && (
              <div style={{
                background: 'rgba(255,184,0,0.1)',
                border: '1px solid rgba(255,184,0,0.3)',
                color: '#ffb800',
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
              }}>
                {pendingCount} pending
              </div>
            )}
            <button style={S.btn} onClick={() => setTab('log')}>+ Log Spiff</button>
            {isHR && (
              <button style={{ ...S.btn, background: 'transparent', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }} onClick={() => setTab('manage')}>
                Manage Programs
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={S.body}>
        {/* Forensic KPI Panel */}
        <ForensicKpiPanel
          programs={programs}
          earnings={coEarnings}
          topEarners={topEarners}
          locationStats={locationStats}
          loading={loading}
        />

        {/* Tabs */}
        <div style={S.tabRow}>
          {TABS.map(t => (
            <button key={t.id} style={S.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading / error */}
        {loading && <div style={S.loader}>Loading spiff programs…</div>}
        {loadError && <div style={S.errBox}>{loadError}</div>}

        {!loading && (
          <>
            {tab === 'programs' && (
              <TabActivePrograms
                programs={programs}
                myEarnings={myEarnings}
                onLogSpiff={prog => setLogModal(prog)}
                isHR={isHR}
                onEdit={prog => setLogModal(null)}
              />
            )}

            {tab === 'my-earnings' && (
              <TabMyEarnings earnings={myEarnings} />
            )}

            {tab === 'log' && (
              <TabLogSpiff
                programs={programs}
                personId={myPersonId}
                locationIds={locationIds}
                onLogged={() => setRefreshKey(k => k + 1)}
                showToast={showToast}
              />
            )}

            {tab === 'manage' && isHR && (
              <TabManagePrograms
                programs={programs}
                locationIds={locationIds}
                actorId={myPersonId}
                locations={locationNames}
                onRefresh={() => setRefreshKey(k => k + 1)}
                showToast={showToast}
              />
            )}

            {tab === 'reports' && isHR && (
              <TabReports
                programs={programs}
                earnings={coEarnings}
                topEarners={topEarners}
                locationStats={locationStats}
              />
            )}
          </>
        )}
      </div>

      {/* Log Spiff Modal (from card button) */}
      {logModal && (
        <LogSpiffModal
          programs={programs}
          defaultProgram={logModal}
          personId={myPersonId}
          locationIds={locationIds}
          onClose={() => setLogModal(null)}
          onLogged={() => setRefreshKey(k => k + 1)}
          showToast={showToast}
        />
      )}
    </div>
  )
}
