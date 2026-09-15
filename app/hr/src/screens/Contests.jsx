import { useState, useEffect, useCallback } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { companyName } from '../lib/config.js'

// All data on this screen is live:
//   get_contests(p_node_ids)                          — contest list
//   get_contest_leaderboard(p_contest_id, p_node_ids) — (rank, person_id, person_name, total_amount, sale_count)
//   get_contest_stats(p_node_ids)                     — participation / eligibility / per-location rollups / winners
//   create_contest(...)                               — new contest (server derives tenant)
//   get_roster(p_node_ids)                            — role names for the eligibility picker
// Nothing is fabricated: missing data renders as an honest empty state or '—'.

// ─── formatters ──────────────────────────────────────────────────────────────

const fmt$ = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmt$K = (n) => {
  const v = Number(n || 0)
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k'
  return '$' + v.toFixed(0)
}
const fmtPct = (n) => Number(n || 0).toFixed(1) + '%'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysLeft(end) {
  const diff = new Date(end + 'T23:59:59') - new Date()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function daysIn(start, end) {
  return Math.max(1, Math.ceil((new Date(end + 'T23:59:59') - new Date(start + 'T00:00:00')) / 86400000))
}

function daysPassed(start) {
  const diff = new Date() - new Date(start + 'T00:00:00')
  return Math.max(0, Math.ceil(diff / 86400000))
}

const todayStr = () => new Date().toISOString().split('T')[0]
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0]

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase() || '?'
}

// ─── constants (labels / option vocabularies only — never data) ──────────────

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

const CONTEST_TYPES = ['Individual', 'Team', 'Location', 'Department']
const CONTEST_CATEGORIES = ['Sales Revenue', 'Units Sold', 'Avg Ticket']

// Metrics the sales backend actually computes (sales_logs: amount + units).
const METRIC_LABELS = {
  revenue: 'Revenue ($)',
  units: 'Units Sold',
  avg_ticket: 'Avg Ticket ($)',
}

const TYPE_BADGE_COLOR = {
  Individual: 'blue',
  Team: 'purple',
  Location: 'accent',
  Department: 'amber',
}
const CAT_BADGE_COLOR = {
  'Sales Revenue': 'green',
  'Units Sold': 'purple',
  'Avg Ticket': 'blue',
}

const AVATAR_COLORS = ['#7c4dff', '#2979ff', '#00e5ff', '#2ad6a0', '#ffb800', '#ff4d7d', '#a29bfe', '#ff6b6b']

// ─── live-data adapters ──────────────────────────────────────────────────────

// get_contests row -> screen shape. Enrichment fields stay null until
// get_contest_stats merges in; the UI shows '—' for anything unknown.
function normalizeContest(row) {
  const t = todayStr()
  return {
    id: row.id,
    name: row.title || '(untitled contest)',
    description: row.description || '',
    metric: row.metric || 'revenue',
    prize_desc: row.prize || '',
    start_date: row.start_date,
    end_date: row.end_date,
    is_active: !!row.is_active,
    status: row.is_active && row.end_date >= t ? 'active' : 'past',
    node_id: row.node_id || null,
    type: null,
    category: null,
    prize_amount: null,
    winner_count: null,
    min_hours: null,
    roles: null,
    budget_code: null,
    node_names: null,
    participants: null,
    total_eligible: null,
    winner: null,
  }
}

function mergeStats(list, statContests) {
  const byId = {}
  for (const s of statContests || []) byId[s.id] = s
  return list.map(c => {
    const s = byId[c.id]
    if (!s) return c
    return {
      ...c,
      type: s.contest_type ?? c.type,
      category: s.category ?? c.category,
      prize_amount: s.prize_amount ?? c.prize_amount,
      winner_count: s.winner_count ?? c.winner_count,
      min_hours: s.min_hours ?? c.min_hours,
      roles: s.roles_eligible ?? c.roles,
      budget_code: s.budget_code ?? c.budget_code,
      node_names: Array.isArray(s.node_names) && s.node_names.length ? s.node_names : c.node_names,
      participants: s.participant_count ?? c.participants,
      total_eligible: s.eligible_count ?? c.total_eligible,
      winner: s.winner ?? c.winner,
    }
  })
}

// get_contest_leaderboard row -> screen shape
function normalizeLbRow(r, i) {
  return {
    rank: r.rank ?? i + 1,
    person_id: r.person_id,
    person_name: r.person_name || 'Unknown',
    total_amount: Number(r.total_amount || 0),
    sale_count: Number(r.sale_count || 0),
    avatar: initials(r.person_name),
  }
}

async function fetchLeaderboard(contestId, nodeIds) {
  const { data, error } = await sb.rpc('get_contest_leaderboard', {
    p_contest_id: contestId,
    p_node_ids: nodeIds,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeLbRow)
}

// ─── styles ───────────────────────────────────────────────────────────────────

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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerLeft: {},
  headerTitle: { fontSize: 20, fontWeight: 800, color: '#00e5ff', letterSpacing: '-0.02em', margin: 0 },
  headerSub: { fontSize: 12, color: 'var(--t-text-muted, #5c6880)', marginTop: 3 },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  body: { padding: '16px 16px 40px' },
  // KPI panel
  kpiSection: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    marginBottom: 10,
    padding: '14px 16px',
  },
  kpiSectionLabel: {
    fontSize: 9, fontWeight: 800, color: '#00e5ff',
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 1,
  },
  kpiTile: { background: '#070b14', padding: '12px 14px' },
  kpiLabel: {
    fontSize: 9, color: 'var(--t-text-faint, #3d4a5c)',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
  },
  kpiVal: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  kpiSub: { fontSize: 10, color: 'var(--t-text-muted, #5c6880)', marginTop: 3 },
  locTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  locTh: {
    textAlign: 'left', padding: '6px 10px', fontSize: 9, fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--t-line, #1e2530)', background: '#070b14',
  },
  locTd: {
    padding: '7px 10px', borderBottom: '1px solid rgba(30,37,48,0.5)',
    color: 'var(--t-text, #e8eaf0)',
  },
  // Tabs
  tabRow: {
    display: 'flex', gap: 0, marginBottom: 16,
    borderBottom: '1px solid var(--t-line, #1e2530)', overflowX: 'auto',
  },
  tabBtn: (active) => ({
    padding: '9px 14px', fontSize: 11, fontWeight: 700,
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid #00e5ff' : '2px solid transparent',
    color: active ? '#00e5ff' : 'var(--t-text-muted, #5c6880)',
    cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
    marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 0.15s',
  }),
  // Cards
  card: {
    background: 'var(--t-surface, #0d1117)',
    border: '1px solid var(--t-line, #1e2530)',
    padding: '14px 16px', marginBottom: 10,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 10, marginBottom: 16,
  },
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--t-text, #e8eaf0)', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: 'var(--t-text-muted, #5c6880)', lineHeight: 1.5, marginBottom: 8 },
  // Tables
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 9, fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--t-line, #1e2530)', background: '#070b14', whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 12px', borderBottom: '1px solid rgba(30,37,48,0.5)',
    color: 'var(--t-text, #e8eaf0)', verticalAlign: 'middle',
  },
  // Buttons
  btn: {
    padding: '8px 16px', fontSize: 12, fontWeight: 700,
    background: '#00e5ff', color: '#070b14', border: 'none', cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  btnGhost: {
    padding: '8px 16px', fontSize: 12, fontWeight: 600,
    background: 'transparent', color: 'var(--t-text-muted, #5c6880)',
    border: '1px solid var(--t-line, #1e2530)', cursor: 'pointer',
  },
  btnSm: {
    padding: '5px 10px', fontSize: 11, fontWeight: 600,
    background: 'transparent', color: '#00e5ff',
    border: '1px solid rgba(0,229,255,0.3)', cursor: 'pointer',
  },
  // Forms
  input: {
    background: '#070b14', border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)', padding: '8px 10px', fontSize: 13,
    width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  },
  select: {
    background: '#070b14', border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)', padding: '8px 10px', fontSize: 13,
    width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  },
  textarea: {
    background: '#070b14', border: '1px solid var(--t-line, #1e2530)',
    color: 'var(--t-text, #e8eaf0)', padding: '8px 10px', fontSize: 13,
    width: '100%', boxSizing: 'border-box', outline: 'none',
    resize: 'vertical', minHeight: 64, fontFamily: 'inherit',
  },
  formField: { marginBottom: 12 },
  formLabel: {
    display: 'block', fontSize: 9, fontWeight: 700,
    color: 'var(--t-text-faint, #3d4a5c)', textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: 5,
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  // Modals
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(7,11,20,0.9)', zIndex: 9000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modalBoxWide: {
    background: 'var(--t-surface, #0d1117)', border: '1px solid var(--t-line, #1e2530)',
    width: '100%', maxWidth: 860, maxHeight: '92vh', overflowY: 'auto',
  },
  modalHdr: {
    padding: '16px 20px', borderBottom: '1px solid var(--t-line, #1e2530)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle: { fontSize: 15, fontWeight: 800, color: '#00e5ff', letterSpacing: '-0.01em' },
  modalBody: { padding: '20px' },
  // Misc
  sectionLabel: {
    fontSize: 9, fontWeight: 800, color: '#00e5ff',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
  },
  progressBg: { height: 4, background: 'rgba(255,255,255,0.06)', marginTop: 6 },
  errBox: {
    background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.25)',
    color: '#ff4d7d', padding: '10px 12px', fontSize: 12, marginBottom: 10,
  },
  successBox: {
    background: 'rgba(42,214,160,0.08)', border: '1px solid rgba(42,214,160,0.25)',
    color: '#2ad6a0', padding: '10px 12px', fontSize: 12, marginBottom: 10,
  },
  emptyState: {
    textAlign: 'center', padding: '36px 16px',
    color: 'var(--t-text-faint, #3d4a5c)', fontSize: 13,
  },
  loader: { textAlign: 'center', padding: '24px', color: '#00e5ff', fontSize: 12, letterSpacing: '0.05em' },
  inlineLabel: { color: 'var(--t-text-faint, #3d4a5c)', fontSize: 11 },
  avatar: (idx) => ({
    width: 28, height: 28, background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
  }),
}

// ─── small helpers ────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  if (!type) return null
  return <span className={`badge ${TYPE_BADGE_COLOR[type] || 'blue'}`}>{type}</span>
}
function CatBadge({ category }) {
  if (!category) return null
  return <span className={`badge ${CAT_BADGE_COLOR[category] || 'accent'}`}>{category}</span>
}

function ContestProgress({ contest }) {
  const total = daysIn(contest.start_date, contest.end_date)
  const passed = daysPassed(contest.start_date)
  const pct = Math.min(100, (passed / total) * 100)
  const remaining = daysLeft(contest.end_date)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-text-muted, #5c6880)', marginBottom: 3 }}>
        <span>Contest progress</span>
        <span style={{ color: remaining <= 3 ? '#ff4d7d' : remaining <= 7 ? '#ffb800' : 'var(--t-text-muted, #5c6880)' }}>
          {remaining}d left
        </span>
      </div>
      <div style={S.progressBg}>
        <div style={{
          height: '100%', width: pct + '%',
          background: pct > 85 ? '#ff4d7d' : pct > 65 ? '#ffb800' : '#00e5ff',
          transition: 'width 0.6s',
        }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 3 }}>
        {fmtDateShort(contest.start_date)} → {fmtDateShort(contest.end_date)}
      </div>
    </div>
  )
}

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

// ─── KPI Panel (all figures derived from live rows) ──────────────────────────

function ForensicKpiPanel({ contests, locSummary, lbMap }) {
  const active = contests.filter(c => c.status === 'active')
  const past = contests.filter(c => c.status === 'past')

  const knowsAmounts = contests.some(c => c.prize_amount != null)
  const knowsParticipation = contests.some(c => c.participants != null)

  const totalPrizePool = active.reduce((a, c) => a + (c.prize_amount || 0), 0)
  const prizesEnded = past.reduce((a, c) => a + (c.prize_amount || 0), 0)
  const totalParticipants = active.reduce((a, c) => a + (c.participants || 0), 0)
  const totalEligible = active.reduce((a, c) => a + (c.total_eligible || 0), 0)
  const avgParticipation = totalEligible > 0 ? (totalParticipants / totalEligible) * 100 : null
  const endingThisWeek = active.filter(c => daysLeft(c.end_date) <= 7).length

  // Live leaders — first active contest that has real logged sales.
  const leaderContest = active.find(c => (lbMap[c.id] || []).length > 0) || null
  const leaderRows = leaderContest ? lbMap[leaderContest.id] : []
  const leader = leaderRows[0]
  const second = leaderRows[1]
  const gap = leader && second ? leader.total_amount - second.total_amount : null

  const avgScore = leaderRows.length
    ? leaderRows.reduce((a, r) => a + r.total_amount, 0) / leaderRows.length
    : 0
  const underperforming = leaderRows.filter(r => r.total_amount < avgScore).length

  const topLocByWins = [...locSummary]
    .filter(l => (l.wins_this_qtr || 0) > 0)
    .sort((a, b) => (b.wins_this_qtr || 0) - (a.wins_this_qtr || 0))[0] || null

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Row 1 — Contest Health */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>Contest Health</div>
        <div style={S.kpiRow}>
          {[
            { label: 'Active Contests', val: active.length, color: '#00e5ff' },
            { label: 'Participants Enrolled', val: knowsParticipation ? totalParticipants : '—', color: 'var(--t-text, #e8eaf0)' },
            { label: 'Total Prize Pool', val: knowsAmounts ? fmt$K(totalPrizePool) : '—', color: '#ffb800' },
            { label: 'Contests On Record', val: contests.length, color: 'var(--t-text, #e8eaf0)' },
            { label: 'Avg Participation Rate', val: avgParticipation == null ? '—' : fmtPct(avgParticipation), color: '#2ad6a0' },
            { label: 'Prizes (Ended Contests)', val: knowsAmounts ? fmt$K(prizesEnded) : '—', color: '#2ad6a0' },
          ].map(({ label, val, color }) => (
            <div key={label} style={S.kpiTile}>
              <div style={S.kpiLabel}>{label}</div>
              <div style={{ ...S.kpiVal, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2 — Live Performance */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>Live Performance</div>
        <div style={S.kpiRow}>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Leader Today</div>
            <div style={{ ...S.kpiVal, fontSize: 13, color: '#ffb800' }}>{leader ? leader.person_name : '—'}</div>
            <div style={S.kpiSub}>{leader ? fmt$(leader.total_amount) + ' · ' + (leaderContest?.name || '') : 'No sales logged yet'}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Closest Competitor Gap</div>
            <div style={{ ...S.kpiVal, color: gap != null && gap < 50 ? '#ff4d7d' : '#2ad6a0' }}>
              {gap == null ? '—' : fmt$(gap)}
            </div>
            <div style={S.kpiSub}>{second ? second.person_name + ' in 2nd' : ''}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Ending This Week</div>
            <div style={{ ...S.kpiVal, color: endingThisWeek > 0 ? '#ffb800' : 'var(--t-text, #e8eaf0)' }}>
              {endingThisWeek}
            </div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Active vs Ended Prizes</div>
            <div style={{ ...S.kpiVal, fontSize: 14, color: 'var(--t-text, #e8eaf0)' }}>
              {knowsAmounts ? fmt$K(totalPrizePool) + ' / ' + fmt$K(prizesEnded) : '—'}
            </div>
            <div style={S.kpiSub}>active / ended</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Top Location (Wins)</div>
            <div style={{ ...S.kpiVal, fontSize: 13, color: '#00e5ff' }}>{topLocByWins ? topLocByWins.location : '—'}</div>
            <div style={S.kpiSub}>{topLocByWins ? topLocByWins.wins_this_qtr + ' wins this qtr' : 'No wins recorded this qtr'}</div>
          </div>
          <div style={S.kpiTile}>
            <div style={S.kpiLabel}>Below Contest Avg</div>
            <div style={{ ...S.kpiVal, color: underperforming > 8 ? '#ff4d7d' : '#ffb800' }}>
              {leaderRows.length ? underperforming : '—'}
            </div>
            <div style={S.kpiSub}>{leaderRows.length ? 'sellers under the average' : ''}</div>
          </div>
        </div>
      </div>

      {/* Row 3 — By Location */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>By Location</div>
        {locSummary.length === 0 ? (
          <div style={{ ...S.emptyState, padding: '16px' }}>No location activity to report yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.locTable}>
              <thead>
                <tr>
                  {['Location', 'Active', 'Wins This Qtr', 'Sellers (QTD)', 'Avg Sale (QTD)'].map(h => (
                    <th key={h} style={S.locTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locSummary.map(row => (
                  <tr key={row.node_id}>
                    <td style={{ ...S.locTd, fontWeight: 700, color: '#00e5ff' }}>{row.location}</td>
                    <td style={S.locTd}>{row.active ?? 0}</td>
                    <td style={{ ...S.locTd, fontWeight: 700, color: '#2ad6a0' }}>{row.wins_this_qtr ?? 0}</td>
                    <td style={S.locTd}>{row.sellers_qtd ?? 0}</td>
                    <td style={{ ...S.locTd, color: 'var(--t-text, #e8eaf0)', fontWeight: 600 }}>
                      {row.avg_sale_qtd == null ? '—' : fmt$(row.avg_sale_qtd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Contest Card (Active Contests tab) ───────────────────────────────────────

function ContestCard({ contest, lb, myPersonId, onViewLeaderboard, preview = false }) {
  const rows = lb || []
  const top3 = rows.slice(0, 3)
  const myEntry = myPersonId ? rows.find(r => r.person_id === myPersonId) || null : null
  const dl = daysLeft(contest.end_date)
  const urgent = !preview && dl <= 3

  return (
    <div style={{
      background: 'var(--t-surface, #0d1117)',
      border: `1px solid ${urgent ? 'rgba(255,77,125,0.4)' : 'var(--t-line, #1e2530)'}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top accent bar */}
      <div style={{
        height: 3,
        background: urgent
          ? 'linear-gradient(90deg,#ff4d7d,#ffb800)'
          : 'linear-gradient(90deg,#00e5ff,#7c4dff)',
      }} />

      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Title + badges */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text, #e8eaf0)', marginBottom: 6 }}>
            {contest.name}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <TypeBadge type={contest.type} />
            <CatBadge category={contest.category} />
            <span className="badge accent">{METRIC_LABELS[contest.metric] || contest.metric}</span>
            {urgent && <span className="badge red">{dl}d left!</span>}
          </div>
        </div>

        {/* Description */}
        {contest.description && <div style={S.cardDesc}>{contest.description}</div>}

        {/* Prize */}
        <div style={{
          background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)',
          padding: '6px 10px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>🏆</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ffb800' }}>{contest.prize_desc || 'Prize TBD'}</span>
          {contest.winner_count > 1 && (
            <span style={{ fontSize: 10, color: 'var(--t-text-muted)', marginLeft: 4 }}>
              (Top {contest.winner_count} win)
            </span>
          )}
        </div>

        {/* Scope + participants */}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 8, flexWrap: 'wrap' }}>
          <span>
            <span style={S.inlineLabel}>Where: </span>
            {contest.node_names && contest.node_names.length ? contest.node_names.join(', ') : 'All locations'}
          </span>
          <span>
            <span style={S.inlineLabel}>Sellers: </span>
            <span style={{ fontWeight: 700 }}>
              {contest.participants == null ? '—' : contest.participants}
              {contest.total_eligible != null ? '/' + contest.total_eligible : ''}
            </span>
          </span>
        </div>

        {/* Contest time progress */}
        <div style={{ marginBottom: 10 }}>
          <ContestProgress contest={contest} />
        </div>

        {/* My rank if on the board */}
        {myEntry && (
          <div style={{
            background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.18)',
            padding: '7px 10px', marginBottom: 10,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Rank
            </span>
            <span style={{ fontWeight: 900, color: '#00e5ff', fontSize: 15 }}>
              {MEDAL[myEntry.rank] || '#' + myEntry.rank}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
              {fmt$(myEntry.total_amount)}
            </span>
          </div>
        )}

        {/* Top 3 leaders — real logged sales only */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint, #3d4a5c)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Current Leaders
          </div>
          {top3.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t-text-faint, #3d4a5c)', padding: '4px 0' }}>
              No sales logged for this contest yet.
            </div>
          ) : top3.map((r, i) => (
            <div key={r.person_id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
              borderBottom: i < top3.length - 1 ? '1px solid rgba(30,37,48,0.5)' : 'none',
            }}>
              <span style={{ width: 18, fontSize: 14, textAlign: 'center' }}>{MEDAL[r.rank] || r.rank}</span>
              <div style={S.avatar(i)}>{r.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.person_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{r.sale_count} sale{r.sale_count !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#ffb800' : 'var(--t-text)', textAlign: 'right' }}>
                {fmt$(r.total_amount)}
              </div>
            </div>
          ))}
        </div>

        {/* Action */}
        {!preview && (
          <div style={{ marginTop: 'auto' }}>
            <button style={S.btnSm} onClick={() => onViewLeaderboard(contest)}>View Leaderboard</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 1 — Active Contests ──────────────────────────────────────────────────

function TabActiveContests({ contests, lbMap, myPersonId, onViewLeaderboard }) {
  const [filterType, setFilterType] = useState('all')
  const active = contests.filter(c => c.status === 'active')
  const typesPresent = [...new Set(active.map(c => c.type).filter(Boolean))]
  const filtered = filterType === 'all' ? active : active.filter(c => c.type === filterType)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
          {active.length} active contest{active.length !== 1 ? 's' : ''}
        </div>
        {typesPresent.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <select
              style={{ ...S.select, width: 'auto', padding: '5px 8px', fontSize: 11 }}
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              {typesPresent.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <div style={S.emptyState}>
          {active.length === 0 ? 'No active contests right now.' : 'No active contests match this filter.'}
        </div>
      ) : (
        <div style={S.cardGrid}>
          {filtered.map(c => (
            <ContestCard
              key={c.id}
              contest={c}
              lb={lbMap[c.id] || []}
              myPersonId={myPersonId}
              onViewLeaderboard={onViewLeaderboard}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2 — Leaderboard ──────────────────────────────────────────────────────

function TabLeaderboard({ contests, lbMap, myPersonId, locationIds }) {
  const active = contests.filter(c => c.status === 'active')
  const selectable = active.length ? active : contests
  const [selectedId, setSelectedId] = useState(selectable[0]?.id || '')
  const [extraRows, setExtraRows] = useState(null)
  const [loadingLb, setLoadingLb] = useState(false)
  const [lbErr, setLbErr] = useState('')

  const contest = selectable.find(c => c.id === selectedId) || selectable[0] || null

  // Rows come from the shared cache when available; otherwise fetch on demand.
  useEffect(() => {
    if (!contest || lbMap[contest.id]) { setExtraRows(null); return }
    let cancelled = false
    async function load() {
      setLoadingLb(true); setLbErr('')
      try {
        const rows = await fetchLeaderboard(contest.id, locationIds)
        if (!cancelled) setExtraRows(rows)
      } catch (e) {
        if (!cancelled) { setExtraRows([]); setLbErr(e.message || 'Could not load the leaderboard.') }
      }
      if (!cancelled) setLoadingLb(false)
    }
    load()
    return () => { cancelled = true }
  }, [contest?.id, lbMap, locationIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = contest ? (lbMap[contest.id] || extraRows || []) : []
  const leader = rows[0]

  const goldBg = 'rgba(255,184,0,0.08)'
  const silverBg = 'rgba(200,200,220,0.06)'
  const bronzeBg = 'rgba(205,127,50,0.06)'
  function rowBg(rank) {
    if (rank === 1) return goldBg
    if (rank === 2) return silverBg
    if (rank === 3) return bronzeBg
    return 'transparent'
  }

  if (!contest) {
    return <div style={S.emptyState}>No contests to show a leaderboard for.</div>
  }

  return (
    <div>
      {/* Contest selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={S.kpiLabel}>Select Contest</div>
          <select
            style={S.select}
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            {selectable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Contest summary bar */}
      <div style={{ ...S.card, marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{contest.name}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
            <TypeBadge type={contest.type} />
            <CatBadge category={contest.category} />
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={S.kpiLabel}>Metric</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{METRIC_LABELS[contest.metric] || contest.metric}</div>
          </div>
          <div>
            <div style={S.kpiLabel}>Days Left</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: daysLeft(contest.end_date) <= 3 ? '#ff4d7d' : '#ffb800' }}>
              {daysLeft(contest.end_date)}d
            </div>
          </div>
          <div>
            <div style={S.kpiLabel}>Prize</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800' }}>{contest.prize_desc || 'TBD'}</div>
          </div>
          <div>
            <div style={S.kpiLabel}>Sellers</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {contest.participants == null ? '—' : contest.participants}
              {contest.total_eligible != null ? '/' + contest.total_eligible : ''}
            </div>
          </div>
        </div>
      </div>

      {lbErr && <div style={S.errBox}>{lbErr}</div>}
      {loadingLb && <div style={S.loader}>Loading leaderboard…</div>}

      {!loadingLb && rows.length === 0 && !lbErr && (
        <div style={S.emptyState}>No sales have been logged for this contest yet.</div>
      )}

      {/* Top 3 hero row */}
      {rows.length >= 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[rows[1], rows[0], rows[2]].map((r, i) => {
            const isFirst = r.rank === 1
            const colors = [
              { border: '#c0c0d0', bg: silverBg, medal: '🥈' },
              { border: '#ffd700', bg: goldBg, medal: '🥇' },
              { border: '#cd7f32', bg: bronzeBg, medal: '🥉' },
            ]
            const c = colors[i]
            return (
              <div key={r.person_id} style={{
                background: c.bg, border: `1px solid ${c.border}`,
                padding: '12px 14px', textAlign: 'center',
                marginTop: isFirst ? 0 : 10,
              }}>
                <div style={{ fontSize: 24 }}>{c.medal}</div>
                <div style={{
                  ...S.avatar(r.rank - 1), width: 36, height: 36,
                  margin: '6px auto', fontSize: 13,
                }}>{r.avatar}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{r.person_name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>
                  {r.sale_count} sale{r.sale_count !== 1 ? 's' : ''}
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: isFirst ? '#ffb800' : 'var(--t-text)' }}>
                  {fmt$(r.total_amount)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full table */}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr>
                {['Rank', 'Employee', 'Sales Logged', 'Total ($)', 'vs Leader', 'Progress'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const vsLeader = leader ? r.total_amount - leader.total_amount : 0
                const progressPct = leader && leader.total_amount > 0 ? (r.total_amount / leader.total_amount) * 100 : 0
                const myRow = r.person_id === myPersonId
                return (
                  <tr key={r.person_id} style={{
                    background: myRow ? 'rgba(0,229,255,0.06)' : rowBg(r.rank),
                  }}>
                    <td style={S.td}>
                      <span style={{ fontWeight: 900, fontSize: 14 }}>{MEDAL[r.rank] || r.rank}</span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={S.avatar(r.rank - 1)}>{r.avatar}</div>
                        <div>
                          <div style={{ fontWeight: myRow ? 700 : 400 }}>
                            {r.person_name}{myRow ? ' (You)' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={S.td}>{r.sale_count}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: r.rank === 1 ? '#ffb800' : 'var(--t-text)' }}>
                      {fmt$(r.total_amount)}
                    </td>
                    <td style={{ ...S.td, color: vsLeader < 0 ? '#ff4d7d' : '#ffb800', fontWeight: 600 }}>
                      {r.rank === 1 ? <span style={{ color: '#ffb800' }}>Leader</span> : (
                        <>{fmt$(Math.abs(vsLeader))}<span style={{ color: '#ff4d7d' }}> behind</span></>
                      )}
                    </td>
                    <td style={{ ...S.td, minWidth: 90 }}>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ height: '100%', width: progressPct + '%', background: r.rank === 1 ? '#ffb800' : '#00e5ff' }} />
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--t-text-faint)', marginTop: 2 }}>{progressPct.toFixed(0)}% of leader</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3 — Create Contest (HR/Manager only) ──────────────────────────────────

function blankForm(locations) {
  return {
    name: '', description: '', type: 'Individual', category: 'Sales Revenue', metric: 'revenue',
    target: '', prize_amount: '', prize_desc: '', winner_count: 1,
    start_date: todayStr(), end_date: plusDays(21),
    location_ids: locations.map(l => l.id),
    roles: ['All Staff'], min_hours: 0, budget_code: '',
  }
}

function TabCreateContest({ locations, locationIds, myId, onCreated }) {
  const [form, setForm] = useState(() => blankForm(locations))
  const [roleOptions, setRoleOptions] = useState(['All Staff'])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Real role names for the eligibility picker, from the live roster.
  useEffect(() => {
    let cancelled = false
    async function loadRoles() {
      try {
        const { data, error } = await sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: null })
        if (error || cancelled) return
        const names = [...new Set((data || []).map(r => r.role_name).filter(Boolean))].sort()
        if (names.length) setRoleOptions(['All Staff', ...names])
      } catch { /* keep the default option */ }
    }
    loadRoles()
    return () => { cancelled = true }
  }, [locationIds])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleLoc = (id) => set('location_ids', form.location_ids.includes(id)
    ? form.location_ids.filter(l => l !== id) : [...form.location_ids, id])
  const toggleRole = (r) => set('roles', form.roles.includes(r)
    ? form.roles.filter(x => x !== r) : [...form.roles, r])

  // Preview card (no fabricated leaderboard — an empty board is the honest state)
  const preview = {
    ...form,
    id: 'preview',
    status: 'active',
    participants: null, total_eligible: null,
    node_names: locations.filter(l => form.location_ids.includes(l.id)).map(l => l.name),
    prize_desc: form.prize_desc || (form.prize_amount ? fmt$(form.prize_amount) : 'TBD'),
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setErr('Contest name is required.'); return }
    if (!form.start_date || !form.end_date) { setErr('Start and end dates are required.'); return }
    if (new Date(form.end_date) <= new Date(form.start_date)) { setErr('End date must be after start date.'); return }
    if (form.location_ids.length === 0) { setErr('Select at least one location.'); return }

    setSaving(true); setErr('')
    const { error } = await sb.rpc('create_contest', {
      p_name: form.name,
      p_type: form.type,
      p_category: form.category,
      p_metric: form.metric,
      p_target: form.target ? Number(form.target) : null,
      p_prize_amount: form.prize_amount ? Number(form.prize_amount) : 0,
      p_prize_desc: form.prize_desc,
      p_winner_count: form.winner_count,
      p_start_date: form.start_date,
      p_end_date: form.end_date,
      p_node_ids: form.location_ids,
      p_roles: form.roles.join(','),
      p_min_hours: form.min_hours,
      p_budget_code: form.budget_code,
      p_description: form.description,
      p_created_by: myId,
    })
    setSaving(false)
    if (error) {
      setErr(error.message || 'The contest could not be saved.')
      return
    }
    setForm(blankForm(locations))
    onCreated && onCreated()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      {/* Form */}
      <div style={S.card}>
        <div style={{ ...S.sectionLabel, marginBottom: 16 }}>Contest Details</div>
        {err && <div style={S.errBox}>{err}</div>}

        <div style={S.formField}>
          <label style={S.formLabel}>Contest Name *</label>
          <input style={S.input} value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. July Ticket Booster" />
        </div>

        <div style={S.formField}>
          <label style={S.formLabel}>Description</label>
          <textarea style={S.textarea} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="What employees need to do to win…" />
        </div>

        <div style={S.grid2}>
          <div style={S.formField}>
            <label style={S.formLabel}>Type</label>
            <select style={S.select} value={form.type} onChange={e => set('type', e.target.value)}>
              {CONTEST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>Category</label>
            <select style={S.select} value={form.category} onChange={e => set('category', e.target.value)}>
              {CONTEST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={S.grid2}>
          <div style={S.formField}>
            <label style={S.formLabel}>Metric (KPI being measured)</label>
            <select style={S.select} value={form.metric} onChange={e => set('metric', e.target.value)}>
              {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>Target / Goal (optional)</label>
            <input style={S.input} type="number" value={form.target} onChange={e => set('target', e.target.value)}
              placeholder="e.g. 5000 for revenue target" />
          </div>
        </div>

        <div style={{ ...S.sectionLabel, marginTop: 8, marginBottom: 14 }}>Prize</div>
        <div style={S.grid3}>
          <div style={S.formField}>
            <label style={S.formLabel}>Prize Amount ($)</label>
            <input style={S.input} type="number" value={form.prize_amount} onChange={e => set('prize_amount', e.target.value)}
              placeholder="50" />
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>Prize Description</label>
            <input style={S.input} value={form.prize_desc} onChange={e => set('prize_desc', e.target.value)}
              placeholder="$50 Visa + Trophy" />
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>Winners Count</label>
            <select style={S.select} value={form.winner_count} onChange={e => set('winner_count', Number(e.target.value))}>
              <option value={1}>Top 1</option>
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
            </select>
          </div>
        </div>

        <div style={{ ...S.sectionLabel, marginTop: 8, marginBottom: 14 }}>Dates</div>
        <div style={S.grid2}>
          <div style={S.formField}>
            <label style={S.formLabel}>Start Date *</label>
            <input style={S.input} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>End Date *</label>
            <input style={S.input} type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>

        <div style={{ ...S.sectionLabel, marginTop: 8, marginBottom: 14 }}>Eligibility</div>
        <div style={S.formField}>
          <label style={S.formLabel}>Locations Eligible</label>
          {locations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint, #3d4a5c)' }}>
              No locations available in your current scope.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {locations.map(loc => (
                <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.location_ids.includes(loc.id)} onChange={() => toggleLoc(loc.id)} />
                  {loc.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={S.formField}>
          <label style={S.formLabel}>Roles Eligible</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            {roleOptions.map(r => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div style={S.grid2}>
          <div style={S.formField}>
            <label style={S.formLabel}>Min Hours to Qualify</label>
            <input style={S.input} type="number" value={form.min_hours} onChange={e => set('min_hours', Number(e.target.value))}
              placeholder="15" />
          </div>
          <div style={S.formField}>
            <label style={S.formLabel}>Budget Code (optional)</label>
            <input style={S.input} value={form.budget_code} onChange={e => set('budget_code', e.target.value)}
              placeholder="CONTEST-Q3" />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button style={S.btn} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Contest'}
          </button>
          <button style={S.btnGhost} onClick={() => setForm(blankForm(locations))}>Reset</button>
        </div>
      </div>

      {/* Preview */}
      <div>
        <div style={{ ...S.sectionLabel, marginBottom: 10 }}>Preview</div>
        {preview.name ? (
          <ContestCard contest={preview} lb={[]} myPersonId={null} onViewLeaderboard={() => {}} preview />
        ) : (
          <div style={{ ...S.card, color: 'var(--t-text-faint)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            Enter a contest name to see a preview
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 4 — History ──────────────────────────────────────────────────────────

function exportHistoryCSV(past) {
  const headers = ['Name', 'Type', 'Category', 'Metric', 'Start', 'End', 'Winner', 'Winner Location', 'Winning Score', 'Prize', 'Prize ($)', 'Sellers']
  const rows = past.map(c => [
    c.name, c.type || '—', c.category || '—', METRIC_LABELS[c.metric] || c.metric,
    c.start_date, c.end_date,
    c.winner?.person_name || '—', c.winner?.location || '—', c.winner?.score ?? '—',
    c.prize_desc || '—', c.prize_amount ?? '—',
    c.participants ?? '—',
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'contest-history.csv'
  a.click()
}

function TabHistory({ contests }) {
  const past = contests.filter(c => c.status === 'past')
  const [selected, setSelected] = useState(null)

  const byType = {}
  past.forEach(c => { if (c.type) byType[c.type] = (byType[c.type] || 0) + 1 })
  const mostCommonType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]

  const knowsAmounts = past.some(c => c.prize_amount != null)
  const totalPrize = past.reduce((a, c) => a + (c.prize_amount || 0), 0)
  const withEligibility = past.filter(c => c.participants != null && c.total_eligible > 0)
  const avgParticipation = withEligibility.length
    ? withEligibility.reduce((a, c) => a + c.participants / c.total_eligible, 0) / withEligibility.length * 100
    : null
  const totalParticipants = past.reduce((a, c) => a + (c.participants || 0), 0)
  const knowsParticipants = past.some(c => c.participants != null)

  if (past.length === 0) {
    return <div style={S.emptyState}>No past contests on record yet.</div>
  }

  return (
    <div>
      {/* Analytics summary — real rows only */}
      <div style={S.kpiSection}>
        <div style={S.kpiSectionLabel}>History Analytics</div>
        <div style={S.kpiRow}>
          {[
            { label: 'Past Contests', val: past.length, color: '#00e5ff' },
            { label: 'Prize Value (Ended)', val: knowsAmounts ? fmt$K(totalPrize) : '—', color: '#ffb800' },
            { label: 'Avg Participation', val: avgParticipation == null ? '—' : fmtPct(avgParticipation), color: '#2ad6a0' },
            { label: 'Most Common Format', val: mostCommonType ? mostCommonType[0] : '—', color: 'var(--t-text)' },
            { label: 'Total Sellers (all)', val: knowsParticipants ? totalParticipants : '—', color: 'var(--t-text)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={S.kpiTile}>
              <div style={S.kpiLabel}>{label}</div>
              <div style={{ ...S.kpiVal, color, fontSize: 16 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Format breakdown (only when formats are recorded) */}
      {Object.keys(byType).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={S.card}>
            <div style={S.sectionLabel}>Formats Run</div>
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(30,37,48,0.5)' }}>
                <TypeBadge type={type} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{count} contest{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.sectionLabel}>Prize Spend</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
              <div>Prize value of ended contests: <strong style={{ color: '#ffb800' }}>{knowsAmounts ? fmt$K(totalPrize) : '—'}</strong></div>
              <div>Avg participation rate: <strong style={{ color: '#2ad6a0' }}>{avgParticipation == null ? '—' : fmtPct(avgParticipation)}</strong></div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t-text-faint)' }}>
                Figures come straight from contest records and logged sales.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export + table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={S.sectionLabel}>Past Contests</div>
        <button style={S.btnSm} onClick={() => exportHistoryCSV(past)}>Export CSV</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={S.tbl}>
          <thead>
            <tr>
              {['Name', 'Type', 'Period', 'Winner', 'Prize', 'Sellers'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {past.map(c => (
              <tr
                key={c.id}
                style={{ cursor: 'pointer', background: selected?.id === c.id ? 'rgba(0,229,255,0.06)' : 'transparent' }}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
              >
                <td style={{ ...S.td, fontWeight: 600 }}>{c.name}</td>
                <td style={S.td}>{c.type ? <TypeBadge type={c.type} /> : <span style={{ color: 'var(--t-text-faint)' }}>—</span>}</td>
                <td style={{ ...S.td, fontSize: 11 }}>{fmtDateShort(c.start_date)} – {fmtDateShort(c.end_date)}</td>
                <td style={S.td}>
                  {c.winner ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>🥇</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.winner.person_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{c.winner.location || ''}</div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--t-text-faint)' }}>No sales logged</span>
                  )}
                </td>
                <td style={{ ...S.td, fontWeight: 700, color: '#ffb800' }}>{c.prize_desc || '—'}</td>
                <td style={S.td}>
                  {c.participants == null ? '—' : c.participants}
                  {c.total_eligible != null ? '/' + c.total_eligible : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expanded recap */}
      {selected && (
        <div style={{ ...S.card, marginTop: 10, borderColor: 'rgba(0,229,255,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>{selected.name} — Final Recap</div>
              <div style={{ display: 'flex', gap: 5 }}>
                <TypeBadge type={selected.type} />
                <CatBadge category={selected.category} />
              </div>
            </div>
            <button style={S.btnSm} onClick={() => setSelected(null)}>✕ Close</button>
          </div>
          <div style={S.grid2}>
            <div>
              {selected.description && (
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>{selected.description}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div><span style={S.inlineLabel}>Period: </span>{fmtDate(selected.start_date)} – {fmtDate(selected.end_date)}</div>
                <div><span style={S.inlineLabel}>Metric: </span>{METRIC_LABELS[selected.metric] || selected.metric}</div>
                <div>
                  <span style={S.inlineLabel}>Sellers: </span>
                  {selected.participants == null ? '—' : selected.participants}
                  {selected.total_eligible != null ? '/' + selected.total_eligible : ''}
                </div>
                <div><span style={S.inlineLabel}>Prize: </span><span style={{ color: '#ffb800', fontWeight: 700 }}>{selected.prize_desc || '—'}</span></div>
              </div>
            </div>
            <div>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Winner</div>
              {selected.winner ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                  <span style={{ width: 20, fontSize: 13, textAlign: 'center' }}>🥇</span>
                  <div style={S.avatar(0)}>{initials(selected.winner.person_name)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{selected.winner.person_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{selected.winner.location || ''}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800' }}>
                    {selected.metric === 'units'
                      ? selected.winner.score + ' units'
                      : fmt$(selected.winner.score)}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>
                  No sales were logged during this contest, so no winner was recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Leaderboard Modal ────────────────────────────────────────────────────────

function LeaderboardModal({ contest, lb, locationIds, myPersonId, onClose }) {
  const [rows, setRows] = useState(lb || null)
  const [loading, setLoading] = useState(!lb)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (lb) return
    let cancelled = false
    async function load() {
      try {
        const r = await fetchLeaderboard(contest.id, locationIds)
        if (!cancelled) setRows(r)
      } catch (e) {
        if (!cancelled) { setRows([]); setErr(e.message || 'Could not load the leaderboard.') }
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [contest.id, lb, locationIds])

  const list = rows || []
  const leader = list[0]

  const goldBg = 'rgba(255,184,0,0.08)'
  const silverBg = 'rgba(200,200,220,0.06)'
  const bronzeBg = 'rgba(205,127,50,0.06)'
  function rowBg(rank) {
    if (rank === 1) return goldBg
    if (rank === 2) return silverBg
    if (rank === 3) return bronzeBg
    return 'transparent'
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modalBoxWide} onClick={e => e.stopPropagation()}>
        <div style={S.modalHdr}>
          <div>
            <div style={S.modalTitle}>{contest.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>
              {METRIC_LABELS[contest.metric] || contest.metric} · {daysLeft(contest.end_date)}d remaining · {contest.prize_desc || 'Prize TBD'}
            </div>
          </div>
          <button style={S.btnGhost} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          {loading ? (
            <div style={S.loader}>Loading leaderboard…</div>
          ) : err ? (
            <div style={S.errBox}>{err}</div>
          ) : list.length === 0 ? (
            <div style={S.emptyState}>No sales have been logged for this contest yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={S.tbl}>
                <thead>
                  <tr>
                    {['Rank', 'Employee', 'Sales Logged', 'Total ($)', 'vs Leader', 'Progress'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => {
                    const vsLeader = leader ? r.total_amount - leader.total_amount : 0
                    const progressPct = leader && leader.total_amount > 0 ? (r.total_amount / leader.total_amount) * 100 : 0
                    const myRow = r.person_id === myPersonId
                    return (
                      <tr key={r.person_id} style={{ background: myRow ? 'rgba(0,229,255,0.06)' : rowBg(r.rank) }}>
                        <td style={S.td}>
                          <span style={{ fontWeight: 900, fontSize: 15 }}>{MEDAL[r.rank] || r.rank}</span>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={S.avatar(r.rank - 1)}>{r.avatar}</div>
                            <span style={{ fontWeight: myRow ? 700 : 400 }}>{r.person_name}{myRow ? ' (You)' : ''}</span>
                          </div>
                        </td>
                        <td style={S.td}>{r.sale_count}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: r.rank === 1 ? '#ffb800' : 'var(--t-text)' }}>
                          {fmt$(r.total_amount)}
                        </td>
                        <td style={{ ...S.td, color: r.rank === 1 ? '#ffb800' : '#ff4d7d', fontWeight: 600 }}>
                          {r.rank === 1 ? 'Leader' : (
                            <>{fmt$(Math.abs(vsLeader))}<span style={{ fontSize: 10 }}> behind</span></>
                          )}
                        </td>
                        <td style={{ ...S.td, minWidth: 100 }}>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                            <div style={{ height: '100%', width: progressPct + '%', background: r.rank === 1 ? '#ffb800' : '#00e5ff' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Contests() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const myPersonId = session?.person?.id || getSession().id || null
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))

  const TABS = [
    { id: 'active', label: 'Active Contests' },
    { id: 'leaderboard', label: 'Leaderboard' },
    ...(isHR ? [{ id: 'create', label: 'Create Contest' }] : []),
    { id: 'history', label: 'History' },
  ]

  const [tab, setTab] = useState('active')
  const [contests, setContests] = useState([])
  const [locSummary, setLocSummary] = useState([])
  const [lbMap, setLbMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showLeaderboard, setShowLeaderboard] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setLoadErr('')
      try {
        const { data, error } = await sb.rpc('get_contests', { p_node_ids: locationIds })
        if (error) throw error
        let list = (data || []).map(normalizeContest)

        // Enrichment (participation, eligibility, winners, per-location rollup).
        // If unavailable, the base list still renders with honest '—' fields.
        let locRows = []
        const { data: stats, error: statsErr } = await sb.rpc('get_contest_stats', { p_node_ids: locationIds })
        if (!statsErr && stats && Array.isArray(stats.contests)) {
          list = mergeStats(list, stats.contests)
          locRows = Array.isArray(stats.locations) ? stats.locations : []
        }
        if (cancelled) return
        setContests(list)
        setLocSummary(locRows)
        setLoading(false)

        // Leaderboards for active contests — sequential on purpose, so a burst
        // of parallel calls can't exhaust the connection pool.
        const map = {}
        for (const c of list.filter(x => x.status === 'active')) {
          try {
            const rows = await fetchLeaderboard(c.id, locationIds)
            if (cancelled) return
            map[c.id] = rows
            setLbMap({ ...map })
          } catch { /* board stays empty — honest */ }
        }
      } catch (e) {
        if (!cancelled) {
          setContests([]); setLocSummary([]); setLbMap({})
          setLoadErr(e.message || 'Contest data could not be loaded.')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [locationIds, refreshKey])

  function handleCreated() {
    setRefreshKey(k => k + 1)
    setTab('active')
    showToast('Contest created.')
  }

  const activeContests = contests.filter(c => c.status === 'active')
  const locNames = locations.map(l => l.name)

  return (
    <div style={S.page}>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h1 style={S.headerTitle}>Contests</h1>
          <div style={S.headerSub}>
            {locNames.length ? '' + companyName() + ' · ' + locNames.join(' · ') + ' · ' : '' + companyName() + ' · '}{activeContests.length} active
          </div>
        </div>
        <div style={S.headerActions}>
          {isHR && (
            <button style={S.btn} onClick={() => setTab('create')}>
              + Create Contest
            </button>
          )}
        </div>
      </div>

      <div style={S.body}>
        {/* KPI Panel */}
        {!loading && !loadErr && (
          <ForensicKpiPanel contests={contests} locSummary={locSummary} lbMap={lbMap} />
        )}
        {loading && <div style={{ ...S.loader, marginBottom: 14 }}>Loading contest data…</div>}
        {loadErr && <div style={{ ...S.errBox, marginBottom: 14 }}>{loadErr}</div>}

        {/* Tabs */}
        <div style={S.tabRow}>
          {TABS.map(t => (
            <button key={t.id} style={S.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'active' && activeContests.length > 0 && (
                <span style={{
                  marginLeft: 6, background: '#00e5ff', color: '#070b14',
                  fontSize: 9, fontWeight: 900, padding: '1px 5px',
                  borderRadius: 2, verticalAlign: 'middle',
                }}>
                  {activeContests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {!loading && tab === 'active' && (
          <TabActiveContests
            contests={contests}
            lbMap={lbMap}
            myPersonId={myPersonId}
            onViewLeaderboard={setShowLeaderboard}
          />
        )}

        {!loading && tab === 'leaderboard' && (
          <TabLeaderboard
            contests={contests}
            lbMap={lbMap}
            myPersonId={myPersonId}
            locationIds={locationIds}
          />
        )}

        {!loading && tab === 'create' && isHR && (
          <TabCreateContest
            locations={locations}
            locationIds={locationIds}
            myId={myPersonId}
            onCreated={handleCreated}
          />
        )}

        {!loading && tab === 'history' && (
          <TabHistory contests={contests} />
        )}
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          contest={showLeaderboard}
          lb={lbMap[showLeaderboard.id] || null}
          locationIds={locationIds}
          myPersonId={myPersonId}
          onClose={() => setShowLeaderboard(null)}
        />
      )}
    </div>
  )
}
