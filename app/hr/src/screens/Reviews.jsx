import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

// Locations are derived from live org-node names on the loaded rows — never a
// hardcoded fixture. Union of employee + review node_names, sorted.
const locationsFrom = (...lists) => {
  const set = new Set()
  lists.forEach(list => (list || []).forEach(x => { const n = x?.node_name; if (n) set.add(n) }))
  return [...set].sort()
}

const REVIEW_STATUSES = ['draft', 'submitted', 'acknowledged', 'disputed']

const CATEGORIES = [
  { id: 'attendance',   label: 'Attendance & Reliability', weight: 1.2 },
  { id: 'customer',     label: 'Customer Service',          weight: 1.3 },
  { id: 'product',      label: 'Product Knowledge',         weight: 1.0 },
  { id: 'teamwork',     label: 'Teamwork',                  weight: 1.0 },
  { id: 'sales',        label: 'Sales Performance',         weight: 1.3 },
  { id: 'leadership',   label: 'Leadership',                weight: 0.8 },
]

const RAISE_OPTIONS = ['none', 'minimal', 'standard', 'merit']
const PROMOTION_OPTIONS = ['not ready', 'ready in 6mo', 'ready now']
const REVIEW_PERIODS = ['30-Day', '60-Day', '90-Day', 'Annual', 'Mid-Year', 'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHRRole = (r = '') => HR_ROLES.some(x => r.toLowerCase().includes(x))

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const today = () => new Date().toISOString().slice(0, 10)
const daysSince = iso => iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 999

function weightedAvg(scores) {
  let wSum = 0, wTotal = 0
  CATEGORIES.forEach(c => {
    const v = scores[c.id]
    if (v > 0) { wSum += v * c.weight; wTotal += c.weight }
  })
  return wTotal ? wSum / wTotal : 0
}

function scoreColor(s) {
  if (s >= 4.5) return 'var(--t-success)'
  if (s >= 3.0) return 'var(--t-warn)'
  return 'var(--t-danger)'
}

function Stars({ value, size = 14 }) {
  const full = Math.floor(value)
  const half = value - full >= 0.4
  const stars = []
  for (let i = 1; i <= 5; i++) {
    let ch = '☆'
    if (i <= full) ch = '★'
    else if (i === full + 1 && half) ch = '⯨'
    stars.push(
      <span key={i} style={{ fontSize: size, color: i <= full || (i === full + 1 && half) ? scoreColor(value) : 'var(--t-line)', lineHeight: 1 }}>{ch}</span>
    )
  }
  return <span style={{ display: 'inline-flex', gap: 1 }}>{stars}</span>
}

function StatusBadge({ status }) {
  const map = {
    draft:        { cls: 'badge',      label: 'Draft' },
    submitted:    { cls: 'badge blue', label: 'Submitted' },
    acknowledged: { cls: 'badge green',label: 'Acknowledged' },
    disputed:     { cls: 'badge red',  label: 'Disputed' },
  }
  const { cls, label } = map[status] || { cls: 'badge', label: status }
  return <span className={cls}>{label}</span>
}

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{
            fontSize: 24, background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: n <= (hover || value) ? scoreColor(hover || value) : 'var(--t-line)',
            transition: 'color 0.1s',
          }}
        >★</button>
      ))}
      {value > 0 && <span style={{ fontSize: 13, color: 'var(--t-text-muted)', alignSelf: 'center', marginLeft: 4 }}>{value}/5</span>}
    </div>
  )
}

// (Mock employee/review fixtures removed — all data is live via RPCs.)

// ── Computed KPIs (all derived from live review + roster data) ────────────────

function computeKPIs(reviews, employees) {
  const now = new Date()
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Last review per employee
  const lastByEmp = {}
  reviews.forEach(r => {
    const d = new Date(r.created_at)
    if (!lastByEmp[r.person_id] || d > new Date(lastByEmp[r.person_id].created_at)) {
      lastByEmp[r.person_id] = r
    }
  })

  const overdue = employees.filter(e => {
    const last = lastByEmp[e.id]
    if (!last) return true
    return daysSince(last.created_at) > 90
  })

  const dueThisMonth = employees.filter(e => {
    const last = lastByEmp[e.id]
    const hire = new Date(e.hire_date)
    const nextDue = last ? new Date(new Date(last.created_at).getTime() + 90 * 86400000) : hire
    return nextDue >= monthStart && nextDue <= new Date(now.getFullYear(), now.getMonth() + 1, 0)
  })

  const completedThisQ = reviews.filter(r => new Date(r.created_at) >= qStart && r.status !== 'draft')

  const scores = reviews.filter(r => r.overall_score > 0).map(r => r.overall_score)
  const avgScore = scores.length ? (scores.reduce((s, v) => s + v, 0) / scores.length) : 0

  const awaitingMgr = reviews.filter(r => r.status === 'draft').length
  const awaitingAck = reviews.filter(r => r.status === 'submitted').length
  const disputed    = reviews.filter(r => r.status === 'disputed').length
  const pipsActive  = reviews.filter(r => r.pip && r.status !== 'acknowledged').length

  // unique raises pending (submitted reviews with raise rec != none)
  const raisesPending = reviews.filter(r => r.status === 'submitted' && r.raise_rec && r.raise_rec !== 'none').length
  const promosPending = reviews.filter(r => r.promo === 'ready now' && r.status === 'acknowledged').length

  // score distribution
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  scores.forEach(s => { const k = Math.min(5, Math.max(1, Math.round(s))); dist[k]++ })

  const onTrackPct = employees.length
    ? Math.round(((employees.length - overdue.length) / employees.length) * 100)
    : 100

  // By location
  const locations = locationsFrom(employees, reviews)
  const byLoc = {}
  locations.forEach(loc => {
    const locEmps = employees.filter(e => e.node_name === loc)
    const locRevs = reviews.filter(r => r.node_name === loc)
    const locOverdue = locEmps.filter(e => {
      const last = lastByEmp[e.id]
      return !last || daysSince(last.created_at) > 90
    })
    const locScores = locRevs.filter(r => r.overall_score > 0).map(r => r.overall_score)
    const locAvg = locScores.length ? locScores.reduce((s, v) => s + v, 0) / locScores.length : 0
    const locDue = locEmps.filter(e => {
      const last = lastByEmp[e.id]
      const hire = new Date(e.hire_date)
      const nextDue = last ? new Date(new Date(last.created_at).getTime() + 90 * 86400000) : hire
      return nextDue >= monthStart && nextDue <= new Date(now.getFullYear(), now.getMonth() + 1, 0)
    })
    byLoc[loc] = { due: locDue.length, completed: locRevs.filter(r => r.status !== 'draft').length, avg: locAvg, overdue: locOverdue.length }
  })

  // Workforce quality
  const latestScores = Object.values(lastByEmp).filter(r => r.overall_score > 0).map(r => r.overall_score)
  const topPerformers   = latestScores.filter(s => s >= 4.5).length
  const meetsExp        = latestScores.filter(s => s >= 3.0 && s < 4.5).length
  const belowExp        = latestScores.filter(s => s < 3.0).length
  const flightRisk      = reviews.filter(r => r.status === 'disputed').map(r => r.person_id)
  const readyPromo      = reviews.filter(r => r.promo === 'ready now').map(r => r.person_id)

  return {
    dueThisMonth: dueThisMonth.length, overdue: overdue.length,
    completedThisQ: completedThisQ.length, avgScore, dist, onTrackPct,
    awaitingMgr, awaitingAck, disputed, pipsActive, raisesPending, promosPending,
    byLoc, locations, topPerformers, meetsExp, belowExp,
    improvementPlans: pipsActive,
    flightRisk: [...new Set(flightRisk)].length,
    readyPromo: [...new Set(readyPromo)].length,
  }
}

// ── Section heading style helper ──────────────────────────────────────────────

const S = {
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  sectionHead: {
    fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    padding: '10px 14px', borderBottom: '1px solid var(--t-line)',
    background: 'var(--t-surface-2)',
  },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, marginBottom: 12 },
  input: {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 10px', fontSize: 13,
    width: '100%', boxSizing: 'border-box', outline: 'none',
  },
  select: {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, cursor: 'pointer',
  },
  textarea: {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '8px 10px', fontSize: 13,
    width: '100%', boxSizing: 'border-box', resize: 'vertical', outline: 'none',
    fontFamily: 'inherit',
  },
  kpiBox: {
    background: 'var(--t-surface)', border: '1px solid var(--t-line)',
    padding: '12px 14px', flex: '1 1 120px',
  },
  tab: (active) => ({
    padding: '9px 16px', cursor: 'pointer', fontWeight: active ? 700 : 500,
    fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase',
    border: 'none', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    background: 'none', color: active ? 'var(--t-text)' : 'var(--t-text-muted)',
  }),
}

// ── KPI Panel ─────────────────────────────────────────────────────────────────

function KpiPanel({ kpis }) {
  if (!kpis) return null
  const { dueThisMonth, overdue, completedThisQ, avgScore, dist, onTrackPct,
    awaitingMgr, awaitingAck, disputed, pipsActive, raisesPending, promosPending,
    byLoc, locations, topPerformers, meetsExp, belowExp, improvementPlans, flightRisk, readyPromo } = kpis

  const totalForDist = Object.values(dist).reduce((s, v) => s + v, 0)

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Row 1 — Cycle Health */}
      <div style={{ ...S.sectionHead, marginBottom: 0 }}>Review Cycle Health</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, border: '1px solid var(--t-line)', borderTop: 'none', marginBottom: 12 }}>
        {[
          { label: 'Due This Month', val: dueThisMonth, color: dueThisMonth > 0 ? 'var(--t-warn)' : 'var(--t-text)' },
          { label: 'Overdue (>90d)',  val: overdue,      color: overdue > 0 ? 'var(--t-danger)' : 'var(--t-text)' },
          { label: 'Completed This Q',val: completedThisQ, color: 'var(--t-success)' },
          { label: 'Avg Score',       val: avgScore > 0 ? avgScore.toFixed(1) : '—', color: avgScore > 0 ? scoreColor(avgScore) : 'var(--t-text)' },
          { label: 'On Track %',      val: onTrackPct + '%', color: onTrackPct < 80 ? 'var(--t-warn)' : 'var(--t-success)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ ...S.kpiBox, borderRight: '1px solid var(--t-line)', minWidth: 100 }}>
            <div style={S.label}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.2, marginTop: 4 }}>{val}</div>
          </div>
        ))}
        {/* Score distribution inline */}
        <div style={{ ...S.kpiBox, flex: '2 1 200px', borderRight: '1px solid var(--t-line)' }}>
          <div style={S.label}>Score Distribution</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'flex-end' }}>
            {[5, 4, 3, 2, 1].map(star => {
              const cnt = dist[star] || 0
              const pct = totalForDist ? (cnt / totalForDist) * 100 : 0
              return (
                <div key={star} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 2 }}>{cnt}</div>
                  <div style={{ width: '100%', height: 28, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: scoreColor(star), transition: 'height 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-muted)', marginTop: 2 }}>{'★'.repeat(star)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Row 2 — Action Items */}
      <div style={{ ...S.sectionHead }}>Action Items</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, border: '1px solid var(--t-line)', borderTop: 'none', marginBottom: 12 }}>
        {[
          { label: 'Awaiting Mgr Review', val: awaitingMgr,   color: awaitingMgr > 0 ? 'var(--t-warn)' : 'var(--t-text)' },
          { label: 'Awaiting Emp Ack',    val: awaitingAck,   color: awaitingAck > 0 ? 'var(--t-accent)' : 'var(--t-text)' },
          { label: 'Disputed',            val: disputed,      color: disputed > 0 ? 'var(--t-danger)' : 'var(--t-text)' },
          { label: 'PIPs Active',         val: pipsActive,    color: pipsActive > 0 ? 'var(--t-danger)' : 'var(--t-text)' },
          { label: 'Raises Pending',      val: raisesPending, color: raisesPending > 0 ? 'var(--t-warn)' : 'var(--t-text)' },
          { label: 'Promotions Ready',    val: promosPending, color: promosPending > 0 ? 'var(--t-success)' : 'var(--t-text)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ ...S.kpiBox, borderRight: '1px solid var(--t-line)' }}>
            <div style={S.label}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.2, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Row 3 — By Location */}
      <div style={{ ...S.sectionHead }}>By Location</div>
      <div style={{ border: '1px solid var(--t-line)', borderTop: 'none', marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Location', 'Due', 'Completed', 'Avg Score', 'Overdue'].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', ...S.label, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(locations || []).length === 0 && (
              <tr><td colSpan={5} style={{ padding: '10px 14px', color: 'var(--t-text-muted)' }}>No locations in scope.</td></tr>
            )}
            {(locations || []).map((loc, i) => {
              const d = byLoc[loc] || {}
              return (
                <tr key={loc} style={{ borderTop: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{loc}</td>
                  <td style={{ padding: '8px 14px', color: d.due > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{d.due ?? 0}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--t-success)' }}>{d.completed ?? 0}</td>
                  <td style={{ padding: '8px 14px' }}>
                    {d.avg > 0 ? (
                      <span style={{ color: scoreColor(d.avg), fontWeight: 700 }}>{d.avg.toFixed(1)}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 14px', color: d.overdue > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>
                    {d.overdue ?? 0}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Row 4 — Workforce Quality */}
      <div style={{ ...S.sectionHead }}>Workforce Quality</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, border: '1px solid var(--t-line)', borderTop: 'none', marginBottom: 4 }}>
        {[
          { label: 'Top Performers (4.5+)',    val: topPerformers,    color: 'var(--t-success)' },
          { label: 'Meets Expectations (3-4.4)',val: meetsExp,        color: 'var(--t-warn)' },
          { label: 'Below Expectations (<3)',   val: belowExp,        color: 'var(--t-danger)' },
          { label: 'Improvement Plans',         val: improvementPlans,color: improvementPlans > 0 ? 'var(--t-danger)' : 'var(--t-text)' },
          { label: 'Flight Risk Flagged',       val: flightRisk,      color: flightRisk > 0 ? 'var(--t-danger)' : 'var(--t-text)' },
          { label: 'Ready for Promotion',       val: readyPromo,      color: readyPromo > 0 ? 'var(--t-success)' : 'var(--t-text)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ ...S.kpiBox, borderRight: '1px solid var(--t-line)' }}>
            <div style={S.label}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.2, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Review Detail Side Panel ───────────────────────────────────────────────────

function DetailPanel({ review, onClose, isEmployee, myPersonId, onStatusChange, onRefresh }) {
  const [disputing, setDisputing]     = useState(false)
  const [disputeText, setDisputeText] = useState('')
  const [busy, setBusy]               = useState(false)
  const [err, setErr]                 = useState('')

  const canAck     = isEmployee && review.person_id === myPersonId && review.status === 'submitted'
  const canDispute = isEmployee && review.person_id === myPersonId && review.status === 'submitted'

  async function acknowledge() {
    setBusy(true); setErr('')
    const { error } = await sb.rpc('update_review_status', { p_review_id: review.id, p_status: 'acknowledged', p_dispute_reason: null })
      .catch(e => ({ error: e }))
    setBusy(false)
    if (error) { setErr(error.message || 'Could not acknowledge — not saved.'); return }
    onStatusChange(review.id, 'acknowledged', null)
    onRefresh && onRefresh()
  }

  async function submitDispute() {
    if (!disputeText.trim()) return
    setBusy(true); setErr('')
    const { error } = await sb.rpc('update_review_status', { p_review_id: review.id, p_status: 'disputed', p_dispute_reason: disputeText })
      .catch(e => ({ error: e }))
    setBusy(false)
    if (error) { setErr(error.message || 'Could not file dispute — not saved.'); return }
    onStatusChange(review.id, 'disputed', disputeText)
    setDisputing(false)
    onRefresh && onRefresh()
  }

  function exportPrint() { window.print() }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 460,
      background: 'var(--t-surface)', borderLeft: '1px solid var(--t-line)',
      zIndex: 500, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.35)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', letterSpacing: '0.04em' }}>REVIEW DETAIL</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportPrint} style={{ ...S.select, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>Print</button>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      <div style={{ padding: 18, flex: 1 }}>
        {/* Employee info */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>{review.employee_name}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>
            {review.role_name} · {review.node_name} · Period: {review.period}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={review.status} />
            {review.pip && <span className="badge red">PIP</span>}
            <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{fmt(review.created_at)}</span>
          </div>
        </div>

        {/* Overall score */}
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={S.label}>Overall Score</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor(review.overall_score), lineHeight: 1 }}>
              {review.overall_score.toFixed(1)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>out of 5</div>
          </div>
          <div style={{ flex: 1 }}>
            <Stars value={review.overall_score} size={20} />
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>
              Raise: <strong style={{ color: 'var(--t-text)' }}>{review.raise_rec}</strong> &nbsp;·&nbsp;
              Promo: <strong style={{ color: 'var(--t-text)' }}>{review.promo}</strong>
            </div>
          </div>
        </div>

        {/* Category scores */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 10 }}>Category Scores</div>
          {CATEGORIES.map(cat => {
            const val = (review.scores || {})[cat.id] || 0
            const note = (review.notes || {})[cat.id]
            return (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{cat.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: val > 0 ? scoreColor(val) : 'var(--t-text-muted)' }}>
                    {val > 0 ? `${val}/5` : '—'}
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden', marginBottom: note ? 4 : 0 }}>
                  {val > 0 && <div style={{ height: '100%', width: `${(val / 5) * 100}%`, background: scoreColor(val) }} />}
                </div>
                {note && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontStyle: 'italic', paddingLeft: 4 }}>{note}</div>}
              </div>
            )
          })}
        </div>

        {/* Text sections */}
        {[
          { key: 'overall',  label: 'Overall Comments' },
          { key: 'goals',    label: 'Goals for Next Period' },
        ].map(({ key, label }) => {
          const text = (review.notes || {})[key]
          if (!text) return null
          return (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>{label}</div>
              <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px 12px', fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6 }}>
                {text}
              </div>
            </div>
          )
        })}

        {/* Signature */}
        {review.status === 'acknowledged' && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(42,214,160,0.06)', border: '1px solid var(--t-success)' }}>
            <div style={{ fontSize: 11, color: 'var(--t-success)', fontWeight: 700 }}>ACKNOWLEDGED BY EMPLOYEE</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Digital signature on file · {fmt(review.created_at)}</div>
          </div>
        )}

        {/* Dispute reason */}
        {review.status === 'disputed' && review.dispute_reason && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255,59,48,0.06)', border: '1px solid var(--t-danger)' }}>
            <div style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 700, marginBottom: 4 }}>DISPUTE FILED</div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>{review.dispute_reason}</div>
          </div>
        )}

        {err && <div style={{ color: 'var(--t-danger)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

        {/* Employee actions */}
        {canAck && !disputing && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={acknowledge} disabled={busy} className="btn-approve" style={{ flex: 1 }}>
              {busy ? 'Saving…' : 'Acknowledge Review'}
            </button>
            <button onClick={() => setDisputing(true)} style={{ ...S.select, border: '1px solid var(--t-danger)', color: 'var(--t-danger)', background: 'rgba(255,59,48,0.07)', cursor: 'pointer', fontWeight: 700 }}>
              Dispute
            </button>
          </div>
        )}

        {disputing && (
          <div>
            <div style={{ ...S.label, marginBottom: 6 }}>Dispute Reason</div>
            <textarea
              style={{ ...S.textarea, marginBottom: 8 }}
              rows={3}
              value={disputeText}
              onChange={e => setDisputeText(e.target.value)}
              placeholder="Explain your dispute…"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitDispute} disabled={busy} className="btn-approve" style={{ flex: 1 }}>
                {busy ? 'Submitting…' : 'Submit Dispute'}
              </button>
              <button onClick={() => setDisputing(false)} className="action-btn-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab 1 — All Reviews ───────────────────────────────────────────────────────

function AllReviewsTab({ reviews, employees, isHR, myPersonId, onStatusChange, onRefresh }) {
  const locs = useMemo(() => locationsFrom(reviews, employees), [reviews, employees])
  const [filterLoc,    setFilterLoc]    = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterMinScore, setFilterMinScore] = useState('')
  const [filterMaxScore, setFilterMaxScore] = useState('')
  const [filterName,   setFilterName]   = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [selected,     setSelected]     = useState(null)

  const filtered = useMemo(() => {
    return reviews.filter(r => {
      if (filterLoc !== 'All' && r.node_name !== filterLoc) return false
      if (filterStatus !== 'All' && r.status !== filterStatus) return false
      if (filterMinScore && r.overall_score < parseFloat(filterMinScore)) return false
      if (filterMaxScore && r.overall_score > parseFloat(filterMaxScore)) return false
      if (filterName && !r.employee_name.toLowerCase().includes(filterName.toLowerCase())) return false
      if (filterFrom && r.created_at < filterFrom) return false
      if (filterTo   && r.created_at > filterTo)   return false
      return true
    })
  }, [reviews, filterLoc, filterStatus, filterMinScore, filterMaxScore, filterName, filterFrom, filterTo])

  function handleStatusChange(id, status, disputeReason) {
    onStatusChange(id, status, disputeReason)
    if (selected?.id === id) setSelected(s => ({ ...s, status, dispute_reason: disputeReason }))
  }

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input
          style={{ ...S.input, width: 180 }}
          placeholder="Employee name…"
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
        />
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={S.select}>
          <option value="All">All Locations</option>
          {locs.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={S.select}>
          <option value="All">All Statuses</option>
          {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <input style={{ ...S.input, width: 80 }} placeholder="Min ★" type="number" min="1" max="5" step="0.1"
          value={filterMinScore} onChange={e => setFilterMinScore(e.target.value)} />
        <input style={{ ...S.input, width: 80 }} placeholder="Max ★" type="number" min="1" max="5" step="0.1"
          value={filterMaxScore} onChange={e => setFilterMaxScore(e.target.value)} />
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ ...S.input, width: 140 }} />
        <span style={{ color: 'var(--t-text-muted)', fontSize: 11 }}>to</span>
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ ...S.input, width: 140 }} />
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>{filtered.length} reviews</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">No reviews match the current filters.</div>
      ) : (
        <div style={{ overflowX: 'auto', ...S.card }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Employee', 'Location', 'Role', 'Reviewer', 'Period', 'Score', 'Status', 'Date', ''].map(h => (
                  <th key={h} style={{ ...S.label, padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{
                    borderTop: '1px solid var(--t-line)', cursor: 'pointer',
                    background: selected?.id === r.id ? 'rgba(0,229,255,0.06)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{r.employee_name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{r.node_name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{r.role_name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{r.reviewer_name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{r.period}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stars value={r.overall_score} size={12} />
                      <span style={{ fontWeight: 700, color: scoreColor(r.overall_score), fontSize: 13 }}>{r.overall_score.toFixed(1)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={e => { e.stopPropagation(); setSelected(r) }} className="action-btn-sm">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DetailPanel
          review={selected}
          isEmployee={!isHR}
          myPersonId={myPersonId}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}

// ── Tab 2 — Write Review ──────────────────────────────────────────────────────

function WriteReviewTab({ employees, myPersonId, onSaved }) {
  const emptyScores = () => Object.fromEntries(CATEGORIES.map(c => [c.id, 0]))
  const emptyNotes  = () => Object.fromEntries(CATEGORIES.map(c => [c.id, '']))

  const [form, setForm] = useState({
    person_id: '', period: '90-Day',
    scores: emptyScores(), notes: emptyNotes(),
    overall_comments: '', goals: '', raise_rec: 'none', promo: 'not ready', pip: false,
  })
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  const overall = weightedAvg(form.scores)
  const anyScored = CATEGORIES.some(c => form.scores[c.id] > 0)
  const pipSuggested = CATEGORIES.some(c => form.scores[c.id] > 0 && form.scores[c.id] < 2.5)

  // Only HR reaches this tab; the roster is already scoped to the active nodes.
  const filteredEmps = employees

  function setScore(catId, val) {
    setForm(f => ({ ...f, scores: { ...f.scores, [catId]: val } }))
  }
  function setNote(catId, val) {
    setForm(f => ({ ...f, notes: { ...f.notes, [catId]: val } }))
  }

  async function handleSave(status) {
    if (!form.person_id) { setErr('Select an employee.'); return }
    if (!anyScored) { setErr('Rate at least one category.'); return }
    if (!myPersonId) { setErr('No signed-in reviewer — please sign in again.'); return }
    setErr(''); setSaving(true)

    // node_id is derived server-side from the employee's active assignment
    // (the roster RPC does not expose it).
    const { error } = await sb.rpc('create_performance_review', {
      p_person_id:   form.person_id,
      p_reviewer_id: myPersonId,
      p_period:      form.period,
      p_scores:      form.scores,
      p_overall_score: overall,
      p_notes:       { ...form.notes, overall: form.overall_comments, goals: form.goals },
      p_raise_rec:   form.raise_rec,
      p_promo:       form.promo,
      p_pip:         form.pip,
      p_status:      status,
    }).catch(e => ({ error: e }))

    setSaving(false)
    if (error) {
      setErr(error.message || 'Review was not saved. Please try again.')
      return
    }
    // Real write succeeded — reset the form and let the parent refetch the truth.
    setForm({ person_id: '', period: '90-Day', scores: emptyScores(), notes: emptyNotes(), overall_comments: '', goals: '', raise_rec: 'none', promo: 'not ready', pip: false })
    onSaved()
  }

  const selectedEmp = employees.find(e => e.id === form.person_id)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
      {/* Form */}
      <div>
        <div style={S.card}>
          <div style={S.sectionHead}>Review Info</div>
          <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ ...S.label, marginBottom: 5 }}>Employee *</div>
              <select value={form.person_id} onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))} style={{ ...S.select, width: '100%' }}>
                <option value="">— Select employee —</option>
                {filteredEmps.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} · {e.node_name}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...S.label, marginBottom: 5 }}>Review Period</div>
              <select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} style={{ ...S.select, width: '100%' }}>
                {REVIEW_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Category scores */}
        <div style={S.card}>
          <div style={S.sectionHead}>Category Ratings</div>
          <div style={{ padding: '14px 16px' }}>
            {CATEGORIES.map(cat => (
              <div key={cat.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{cat.label}</span>
                  {form.scores[cat.id] > 0 && form.scores[cat.id] < 2.5 && (
                    <span className="badge red" style={{ fontSize: 10 }}>Low — PIP threshold</span>
                  )}
                </div>
                <StarPicker value={form.scores[cat.id]} onChange={v => setScore(cat.id, v)} />
                <textarea
                  style={{ ...S.textarea, marginTop: 8, fontSize: 12 }}
                  rows={2}
                  placeholder={`Notes for ${cat.label.toLowerCase()}…`}
                  value={form.notes[cat.id]}
                  onChange={e => setNote(cat.id, e.target.value)}
                />
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', textAlign: 'right' }}>
                  {form.notes[cat.id].length}/500 chars
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall + flags */}
        <div style={S.card}>
          <div style={S.sectionHead}>Overall Assessment</div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, marginBottom: 5 }}>Overall Comments</div>
              <textarea style={S.textarea} rows={4} value={form.overall_comments}
                onChange={e => setForm(f => ({ ...f, overall_comments: e.target.value }))}
                placeholder="Summary of this review period…" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, marginBottom: 5 }}>Goals for Next Period</div>
              <textarea style={S.textarea} rows={3} value={form.goals}
                onChange={e => setForm(f => ({ ...f, goals: e.target.value }))}
                placeholder="• Specific goal 1&#10;• Specific goal 2&#10;• Specific goal 3" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 5 }}>Raise Recommendation</div>
                <select value={form.raise_rec} onChange={e => setForm(f => ({ ...f, raise_rec: e.target.value }))} style={{ ...S.select, width: '100%' }}>
                  {RAISE_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 5 }}>Promotion Readiness</div>
                <select value={form.promo} onChange={e => setForm(f => ({ ...f, promo: e.target.value }))} style={{ ...S.select, width: '100%' }}>
                  {PROMOTION_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.pip || pipSuggested}
                onChange={e => setForm(f => ({ ...f, pip: e.target.checked }))} />
              <span style={{ color: 'var(--t-text)' }}>Flag for Performance Improvement Plan (PIP)</span>
              {pipSuggested && <span className="badge amber" style={{ fontSize: 10 }}>Auto-suggested</span>}
            </label>
          </div>
        </div>

        {err && <div style={{ color: 'var(--t-danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => handleSave('draft')} disabled={saving} className="action-btn-sm" style={{ flex: 1, padding: '9px', fontSize: 13, fontWeight: 700 }}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('submitted')} disabled={saving} className="btn-approve" style={{ flex: 2 }}>
            {saving ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div style={{ position: 'sticky', top: 80 }}>
        <div style={S.card}>
          <div style={S.sectionHead}>Live Preview</div>
          <div style={{ padding: 16, fontFamily: 'Georgia, serif' }}>
            {/* Company header */}
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid var(--t-line)', paddingBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '0.08em' }}>TG</div>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.1em' }}>PERFORMANCE REVIEW</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 4 }}>
              <strong>Employee:</strong> {selectedEmp?.full_name || '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 4 }}>
              <strong>Location:</strong> {selectedEmp?.node_name || '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 4 }}>
              <strong>Period:</strong> {form.period}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 12 }}>
              <strong>Date:</strong> {fmt(today())}
            </div>
            {/* Score summary */}
            <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Scores</div>
              {CATEGORIES.map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--t-text)' }}>{cat.label}</span>
                  <span style={{ fontWeight: 700, color: form.scores[cat.id] > 0 ? scoreColor(form.scores[cat.id]) : 'var(--t-text-muted)' }}>
                    {form.scores[cat.id] > 0 ? `${form.scores[cat.id]}/5` : '—'}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--t-line)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}>
                <span style={{ color: 'var(--t-text)' }}>OVERALL</span>
                <span style={{ color: overall > 0 ? scoreColor(overall) : 'var(--t-text-muted)' }}>
                  {overall > 0 ? overall.toFixed(2) : '—'}/5
                </span>
              </div>
            </div>
            {/* Recommendations */}
            <div style={{ fontSize: 11, color: 'var(--t-text)', marginBottom: 4 }}>
              <strong>Raise:</strong> {form.raise_rec} &nbsp;&nbsp; <strong>Promo:</strong> {form.promo}
            </div>
            {/* Signature lines */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--t-line)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 8 }}>
                <span>Manager Signature: ______________</span>
                <span>Date: ________</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)' }}>
                <span>Employee Signature: ______________</span>
                <span>Date: ________</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab 3 — My Review ─────────────────────────────────────────────────────────

function MyReviewTab({ reviews, myPersonId, onStatusChange, onRefresh }) {
  const myReviews = useMemo(() =>
    reviews.filter(r => r.person_id === myPersonId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [reviews, myPersonId]
  )
  const [expanded, setExpanded] = useState(null)
  const [disputing, setDisputing] = useState(null)
  const [disputeText, setDisputeText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function acknowledge(review) {
    setBusy(review.id); setErr('')
    const { error } = await sb.rpc('update_review_status', { p_review_id: review.id, p_status: 'acknowledged', p_dispute_reason: null })
      .catch(e => ({ error: e }))
    setBusy(null)
    if (error) { setErr(error.message || 'Could not acknowledge — not saved.'); return }
    onStatusChange(review.id, 'acknowledged', null)
    onRefresh && onRefresh()
  }

  async function submitDispute(review) {
    if (!disputeText.trim()) return
    setBusy(review.id); setErr('')
    const { error } = await sb.rpc('update_review_status', { p_review_id: review.id, p_status: 'disputed', p_dispute_reason: disputeText })
      .catch(e => ({ error: e }))
    setBusy(null)
    if (error) { setErr(error.message || 'Could not file dispute — not saved.'); return }
    onStatusChange(review.id, 'disputed', disputeText)
    setDisputing(null)
    setDisputeText('')
    onRefresh && onRefresh()
  }

  if (!myReviews.length) {
    return <div className="empty-state">No reviews on file for your account yet.</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
          Your performance review history — {myReviews.length} review{myReviews.length !== 1 ? 's' : ''} on file.
        </div>
      </div>
      {err && <div style={{ color: 'var(--t-danger)', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {myReviews.map(r => {
        const isOpen = expanded === r.id
        return (
          <div key={r.id} style={{ ...S.card, marginBottom: 10 }}>
            <div
              onClick={() => setExpanded(isOpen ? null : r.id)}
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <Stars value={r.overall_score} size={14} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(r.overall_score) }}>{r.overall_score.toFixed(1)}</span>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>/ {r.period}</span>
                  <StatusBadge status={r.status} />
                  {r.pip && <span className="badge red">PIP</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                  Reviewed by {r.reviewer_name} · {fmt(r.created_at)}
                </div>
              </div>
              <div style={{ fontSize: 18, color: 'var(--t-text-muted)' }}>{isOpen ? '▲' : '▼'}</div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--t-line)', padding: '14px 16px' }}>
                {/* Category scores */}
                <div style={{ marginBottom: 14 }}>
                  {CATEGORIES.map(cat => {
                    const val = (r.scores || {})[cat.id] || 0
                    const note = (r.notes || {})[cat.id]
                    return (
                      <div key={cat.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                          <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{cat.label}</span>
                          <span style={{ fontWeight: 700, color: val > 0 ? scoreColor(val) : 'var(--t-text-muted)' }}>{val > 0 ? `${val}/5` : '—'}</span>
                        </div>
                        <div style={{ height: 5, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden' }}>
                          {val > 0 && <div style={{ height: '100%', width: `${(val / 5) * 100}%`, background: scoreColor(val) }} />}
                        </div>
                        {note && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3, fontStyle: 'italic' }}>{note}</div>}
                      </div>
                    )
                  })}
                </div>
                {(r.notes?.overall) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...S.label, marginBottom: 4 }}>Overall Comments</div>
                    <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6, background: 'var(--t-surface-2)', padding: '10px 12px', border: '1px solid var(--t-line)' }}>{r.notes.overall}</div>
                  </div>
                )}
                {(r.notes?.goals) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...S.label, marginBottom: 4 }}>Goals</div>
                    <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6, background: 'var(--t-surface-2)', padding: '10px 12px', border: '1px solid var(--t-line)' }}>{r.notes.goals}</div>
                  </div>
                )}
                {r.status === 'disputed' && r.dispute_reason && (
                  <div style={{ padding: '10px 12px', background: 'rgba(255,59,48,0.06)', border: '1px solid var(--t-danger)', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 700, marginBottom: 3 }}>YOUR DISPUTE</div>
                    <div style={{ fontSize: 12, color: 'var(--t-text)' }}>{r.dispute_reason}</div>
                  </div>
                )}

                {/* Actions */}
                {r.status === 'submitted' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => acknowledge(r)} disabled={!!busy} className="btn-approve" style={{ flex: 1 }}>
                      {busy === r.id ? 'Saving…' : 'Acknowledge'}
                    </button>
                    {disputing !== r.id && (
                      <button onClick={() => setDisputing(r.id)} style={{ ...S.select, border: '1px solid var(--t-danger)', color: 'var(--t-danger)', background: 'rgba(255,59,48,0.07)', cursor: 'pointer', fontWeight: 700 }}>
                        Dispute
                      </button>
                    )}
                  </div>
                )}
                {disputing === r.id && (
                  <div style={{ marginTop: 10 }}>
                    <textarea style={{ ...S.textarea, marginBottom: 8 }} rows={3} value={disputeText}
                      onChange={e => setDisputeText(e.target.value)} placeholder="Reason for dispute…" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => submitDispute(r)} disabled={!!busy} className="btn-approve" style={{ flex: 1 }}>Submit Dispute</button>
                      <button onClick={() => { setDisputing(null); setDisputeText('') }} className="action-btn-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab 4 — Schedule ──────────────────────────────────────────────────────────

function ScheduleTab({ employees, reviews }) {
  const [scheduleOverrides, setScheduleOverrides] = useState({})

  const schedule = useMemo(() => {
    const lastByEmp = {}
    reviews.forEach(r => {
      const d = new Date(r.created_at)
      if (!lastByEmp[r.person_id] || d > new Date(lastByEmp[r.person_id].created_at)) {
        lastByEmp[r.person_id] = r
      }
    })

    return employees.map(e => {
      const last = lastByEmp[e.id]
      const hire = new Date(e.hire_date)
      const lastDate = last ? new Date(last.created_at) : hire
      const override = scheduleOverrides[e.id]
      const nextDue = override ? new Date(override) : new Date(lastDate.getTime() + 90 * 86400000)
      const daysLeft = Math.floor((nextDue - Date.now()) / 86400000)
      const status = last?.status === 'acknowledged' && daysLeft > 0 ? 'complete'
        : daysLeft < 0 ? 'overdue'
        : daysLeft <= 7 ? 'due-soon'
        : 'upcoming'
      return { ...e, lastReview: last, nextDue, daysLeft, status }
    }).sort((a, b) => a.nextDue - b.nextDue)
  }, [employees, reviews, scheduleOverrides])

  const COLOR_MAP = { overdue: 'var(--t-danger)', 'due-soon': 'var(--t-warn)', upcoming: 'var(--t-accent)', complete: 'var(--t-success)' }
  const LABEL_MAP = { overdue: 'Overdue', 'due-soon': 'Due This Week', upcoming: 'Upcoming', complete: 'Complete' }


  function setOverride(empId, dateStr) {
    setScheduleOverrides(s => ({ ...s, [empId]: dateStr }))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(LABEL_MAP).map(([key, label]) => {
            const cnt = schedule.filter(s => s.status === key).length
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-text-muted)' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_MAP[key] }} />
                <span>{label}: <strong style={{ color: COLOR_MAP[key] }}>{cnt}</strong></span>
              </div>
            )
          })}
        </div>
        <button disabled className="btn-approve" style={{ opacity: 0.45, cursor: 'not-allowed' }} title="Bulk scheduling is not yet available">
          Schedule All Due <span style={{ color: 'var(--t-text-muted)', fontWeight: 400 }}>(not yet available)</span>
        </button>
      </div>

      <div style={{ ...S.card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Employee', 'Location', 'Role', 'Last Review', 'Next Due', 'Days Left', 'Status', 'Override Date'].map(h => (
                <th key={h} style={{ ...S.label, padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map(row => (
              <tr key={row.id} style={{ borderTop: '1px solid var(--t-line)' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{row.full_name}</td>
                <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{row.node_name}</td>
                <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{row.role_name}</td>
                <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{row.lastReview ? fmt(row.lastReview.created_at) : 'Never'}</td>
                <td style={{ padding: '9px 12px', color: 'var(--t-text)' }}>{fmt(row.nextDue.toISOString())}</td>
                <td style={{ padding: '9px 12px', fontWeight: 700, color: COLOR_MAP[row.status] }}>
                  {row.daysLeft < 0 ? `${Math.abs(row.daysLeft)}d overdue` : `${row.daysLeft}d`}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: COLOR_MAP[row.status] }}>
                    {LABEL_MAP[row.status]}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <input
                    type="date"
                    style={{ ...S.input, width: 140, fontSize: 11 }}
                    value={scheduleOverrides[row.id] || ''}
                    onChange={e => setOverride(row.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab 5 — Reports ───────────────────────────────────────────────────────────

function ReportsTab({ reviews, employees }) {
  const locs = useMemo(() => locationsFrom(reviews, employees), [reviews, employees])

  function exportCSV() {
    const cols = ['Employee', 'Location', 'Role', 'Reviewer', 'Period', 'Overall Score', 'Status', 'Raise Rec', 'Promo', 'PIP', 'Date']
    const rows = reviews.map(r => [
      r.employee_name, r.node_name, r.role_name, r.reviewer_name, r.period,
      r.overall_score.toFixed(2), r.status, r.raise_rec || '', r.promo || '', r.pip ? 'Yes' : 'No', r.created_at
    ])
    const csv = [cols, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `reviews-${today()}.csv` })
    a.click(); URL.revokeObjectURL(a.href)
  }

  // Avg score by location
  const byLoc = useMemo(() => {
    const map = {}
    locs.forEach(loc => {
      const rs = reviews.filter(r => r.node_name === loc && r.overall_score > 0)
      map[loc] = rs.length ? rs.reduce((s, r) => s + r.overall_score, 0) / rs.length : 0
    })
    return map
  }, [reviews, locs])

  // Avg score by role
  const byRole = useMemo(() => {
    const map = {}
    reviews.forEach(r => {
      if (!r.role_name || !r.overall_score) return
      if (!map[r.role_name]) map[r.role_name] = []
      map[r.role_name].push(r.overall_score)
    })
    const out = {}
    Object.entries(map).forEach(([k, v]) => { out[k] = v.reduce((s, x) => s + x, 0) / v.length })
    return out
  }, [reviews])

  // Score trend by quarter per location — quarters derived from real periods.
  const qTrend = useMemo(() => {
    const quarters = [...new Set(
      reviews.map(r => r.period).filter(p => /^Q[1-4]\s+\d{4}$/.test(p || ''))
    )].sort((a, b) => {
      const [, aq, ay] = a.match(/^Q([1-4])\s+(\d{4})$/)
      const [, bq, by] = b.match(/^Q([1-4])\s+(\d{4})$/)
      return (ay - by) || (aq - bq)
    })
    const trend = {}
    locs.forEach(loc => {
      trend[loc] = {}
      quarters.forEach(q => {
        const rs = reviews.filter(r => r.node_name === loc && r.period === q && r.overall_score > 0)
        trend[loc][q] = rs.length ? rs.reduce((s, r) => s + r.overall_score, 0) / rs.length : null
      })
    })
    return { quarters, trend }
  }, [reviews, locs])

  // Raise impact — rough estimate $0.25/hr raise × 40hr/wk
  const raiseImpact = useMemo(() => {
    const map = { minimal: 0.15, standard: 0.35, merit: 0.75 }
    return reviews
      .filter(r => r.status === 'submitted' && r.raise_rec && r.raise_rec !== 'none')
      .reduce((s, r) => s + (map[r.raise_rec] || 0) * 40 * 52, 0)
  }, [reviews])

  // Promotion pipeline
  const promoPipeline = useMemo(() =>
    reviews.filter(r => (r.promo === 'ready now' || r.promo === 'ready in 6mo') && r.status === 'acknowledged')
  , [reviews])

  // Compliance %
  const compliancePct = useMemo(() => {
    const now = Date.now()
    const compliant = employees.filter(e => {
      const lastRev = reviews.filter(r => r.person_id === e.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      if (!lastRev) return false
      return daysSince(lastRev.created_at) <= 90
    })
    return employees.length ? Math.round((compliant.length / employees.length) * 100) : 0
  }, [employees, reviews])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={exportCSV} className="action-btn-sm">Export CSV</button>
      </div>

      {/* Score dist histogram */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={S.sectionHead}>Score Distribution</div>
        <div style={{ padding: '14px 16px', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead><tr style={{ background: 'var(--t-surface-2)' }}>
              {['Stars', 'Count', 'Bar', '%'].map(h => <th key={h} style={{ ...S.label, padding: '7px 12px', textAlign: 'left' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[5, 4, 3, 2, 1].map(star => {
                const cnt = reviews.filter(r => Math.round(r.overall_score) === star).length
                const pct = reviews.length ? (cnt / reviews.length) * 100 : 0
                return (
                  <tr key={star} style={{ borderTop: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '7px 12px', color: scoreColor(star), fontWeight: 700 }}>{'★'.repeat(star)}</td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-text)', fontWeight: 700 }}>{cnt}</td>
                    <td style={{ padding: '7px 12px', width: '60%' }}>
                      <div style={{ height: 14, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: scoreColor(star), transition: 'width 0.4s' }} />
                      </div>
                    </td>
                    <td style={{ padding: '7px 12px', color: 'var(--t-text-muted)' }}>{pct.toFixed(0)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Avg by location + role */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={S.card}>
          <div style={S.sectionHead}>Avg Score by Location</div>
          <div style={{ padding: '10px 16px' }}>
            {locs.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No locations in scope.</div>}
            {locs.map(loc => (
              <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--t-text)', width: 100, flexShrink: 0 }}>{loc}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(byLoc[loc] / 5) * 100}%`, background: scoreColor(byLoc[loc]) }} />
                </div>
                <span style={{ fontWeight: 700, color: scoreColor(byLoc[loc]), fontSize: 13, width: 32, textAlign: 'right' }}>
                  {byLoc[loc] > 0 ? byLoc[loc].toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <div style={S.sectionHead}>Avg Score by Role</div>
          <div style={{ padding: '10px 16px' }}>
            {Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, avg]) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--t-text)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(avg / 5) * 100}%`, background: scoreColor(avg) }} />
                </div>
                <span style={{ fontWeight: 700, color: scoreColor(avg), fontSize: 13, width: 32, textAlign: 'right' }}>{avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QoQ trend */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={S.sectionHead}>Score Trend — Quarter over Quarter</div>
        <div style={{ padding: '14px 16px', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead><tr style={{ background: 'var(--t-surface-2)' }}>
              <th style={{ ...S.label, padding: '7px 12px', textAlign: 'left' }}>Location</th>
              {qTrend.quarters.map(q => <th key={q} style={{ ...S.label, padding: '7px 12px', textAlign: 'left' }}>{q}</th>)}
              <th style={{ ...S.label, padding: '7px 12px', textAlign: 'left' }}>Trend</th>
            </tr></thead>
            <tbody>
              {locs.map(loc => {
                const vals = qTrend.quarters.map(q => qTrend.trend[loc][q])
                const [q1, q2] = vals
                const trend = q1 && q2 ? (q2 > q1 ? '▲' : q2 < q1 ? '▼' : '→') : '—'
                const trendColor = q1 && q2 ? (q2 > q1 ? 'var(--t-success)' : q2 < q1 ? 'var(--t-danger)' : 'var(--t-text-muted)') : 'var(--t-text-muted)'
                return (
                  <tr key={loc} style={{ borderTop: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{loc}</td>
                    {vals.map((v, i) => (
                      <td key={i} style={{ padding: '9px 12px', fontWeight: 700, color: v ? scoreColor(v) : 'var(--t-text-muted)' }}>
                        {v ? v.toFixed(1) : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '9px 12px', fontWeight: 800, fontSize: 16, color: trendColor }}>{trend}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raise impact + promotion pipeline + compliance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div style={S.card}>
          <div style={S.sectionHead}>Raise $ Impact (Est.)</div>
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--t-warn)' }}>${raiseImpact.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>Annual labor cost delta from pending raise recs</div>
          </div>
        </div>
        <div style={S.card}>
          <div style={S.sectionHead}>Promotion Pipeline</div>
          <div style={{ padding: '10px 14px' }}>
            {promoPipeline.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t-text-muted)', padding: '8px 0' }}>No employees currently flagged ready.</div>
            ) : promoPipeline.map(r => (
              <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{r.employee_name}</span>
                <span className={r.promo === 'ready now' ? 'badge green' : 'badge amber'} style={{ fontSize: 10 }}>{r.promo}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <div style={S.sectionHead}>Review Cycle Compliance</div>
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: compliancePct >= 80 ? 'var(--t-success)' : 'var(--t-danger)' }}>
              {compliancePct}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>of employees reviewed within 90-day cycle</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',      label: 'All Reviews' },
  { id: 'write',    label: 'Write Review' },
  { id: 'mine',     label: 'My Review' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'reports',  label: 'Reports' },
]

export default function Reviews() {
  const { locationIds } = useScope()
  const { session }     = useAuth()

  const myPersonId = session?.person?.id
  const roleName   = session?.person?.role_name || ''
  const isHR       = isHRRole(roleName)

  const [tab,       setTab]       = useState('all')
  const [reviews,   setReviews]   = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadErr,   setLoadErr]   = useState('')

  const load = useCallback(() => {
    if (!locationIds.length) { setReviews([]); setEmployees([]); setLoading(false); return }
    setLoading(true); setLoadErr('')
    Promise.all([
      sb.rpc('get_reviews_detailed', { p_node_ids: locationIds }),
      sb.rpc('get_roster',           { p_node_ids: locationIds }),
    ]).then(([rv, emps]) => {
      if (rv.error)   throw rv.error
      if (emps.error) throw emps.error
      // Roster → employee list. get_roster returns no node_id / hire_date;
      // effective_from (assignment start) is the tenure anchor for the cycle math.
      const roster = (Array.isArray(emps.data) ? emps.data : []).map(e => ({
        id: e.id,
        full_name: e.full_name,
        role_name: e.role_name || '—',
        node_name: e.node_name || '—',
        hire_date: e.effective_from || null,
        is_active: e.is_active,
      }))
      const empById = Object.fromEntries(roster.map(e => [e.id, e]))
      // Normalise review rows + enrich any missing display fields from roster.
      const rows = (Array.isArray(rv.data) ? rv.data : []).map(r => {
        const emp = empById[r.person_id]
        return {
          ...r,
          overall_score: Number(r.overall_score) || 0,
          scores: (r.scores && typeof r.scores === 'object') ? r.scores : {},
          notes:  (r.notes  && typeof r.notes  === 'object') ? r.notes  : {},
          pip: !!r.pip,
          employee_name: r.employee_name || emp?.full_name || '—',
          node_name:     r.node_name     || emp?.node_name || '—',
          role_name:     r.role_name     || emp?.role_name || '—',
          reviewer_name: r.reviewer_name || 'HR',
        }
      })
      setReviews(rows)
      setEmployees(roster)
      setLoading(false)
    }).catch((e) => {
      setReviews([]); setEmployees([])
      setLoadErr(e?.message || 'Unable to load performance reviews.')
      setLoading(false)
    })
  }, [locationIds.join(',')])

  useEffect(() => { load() }, [load])

  function handleStatusChange(reviewId, newStatus, disputeReason) {
    setReviews(prev => prev.map(r =>
      r.id === reviewId ? { ...r, status: newStatus, dispute_reason: disputeReason ?? r.dispute_reason } : r
    ))
  }

  // A review was written — refetch the truth from the server, then land on the list.
  function handleSaved() {
    load()
    setTab('all')
  }

  const kpis = useMemo(() => computeKPIs(reviews, employees), [reviews, employees])

  if (loading) return <div className="loader">Loading performance reviews…</div>

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 3 }}>Performance Reviews</div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            90-day review cycles · {employees.length} employees across {kpis.locations?.length || 0} locations
          </div>
        </div>
        {isHR && (
          <button onClick={() => setTab('write')} className="btn-approve">+ Write Review</button>
        )}
      </div>

      {loadErr && (
        <div className="empty-state" style={{ color: 'var(--t-danger)', marginBottom: 16 }}>
          {loadErr}
        </div>
      )}

      {/* KPI Panel */}
      <KpiPanel kpis={kpis} />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 18 }}>
        {TABS.filter(t => isHR || t.id !== 'write').map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.tab(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'all' && (
        <AllReviewsTab
          reviews={reviews}
          employees={employees}
          isHR={isHR}
          myPersonId={myPersonId}
          onStatusChange={handleStatusChange}
          onRefresh={load}
        />
      )}
      {tab === 'write' && isHR && (
        <WriteReviewTab
          employees={employees}
          myPersonId={myPersonId}
          onSaved={handleSaved}
        />
      )}
      {tab === 'mine' && (
        <MyReviewTab
          reviews={reviews}
          myPersonId={myPersonId}
          onStatusChange={handleStatusChange}
          onRefresh={load}
        />
      )}
      {tab === 'schedule' && (
        <ScheduleTab reviews={reviews} employees={employees} />
      )}
      {tab === 'reports' && (
        <ReportsTab reviews={reviews} employees={employees} />
      )}
    </>
  )
}
