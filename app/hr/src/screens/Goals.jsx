import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── Constants ────────────────────────────────────────────────────────────────

const CATS = ['Sales', 'Attendance', 'Training', 'Leadership', 'Personal']

const CAT_COLORS = {
  Sales:      'var(--t-accent)',
  Attendance: 'var(--t-success)',
  Training:   '#7c4dff',
  Leadership: 'var(--t-warn)',
  Personal:   '#ff4d7d',
}

const UNITS = ['dollars', 'count', 'percent', 'shifts', 'score']

const TABS = ['My Goals', 'Team Goals', 'Set Goals', 'Reports']


// ── Helpers ──────────────────────────────────────────────────────────────────

function calcPct(g) {
  const t = parseFloat(g.target)
  const c = parseFloat(g.current)
  if (!t || isNaN(c)) return 0
  // For "zero is goal" metrics (callouts = 0), treat current≤target as 100%
  if (t === 0) return c <= 0 ? 100 : 0
  return Math.min(100, Math.round((c / t) * 100))
}

function deriveStatus(g) {
  if (g.status === 'complete') return 'complete'
  if (g.status === 'overdue')  return 'overdue'
  const p = calcPct(g)
  const due = g.due ? new Date(g.due) : null
  if (due && due < new Date()) return 'overdue'
  if (g.status === 'at-risk' || p < 40) return 'at-risk'
  if (p >= 80) return 'on-track'
  return 'on-track'
}

function statusLabel(s) {
  return { complete:'COMPLETE', 'on-track':'ON TRACK', 'at-risk':'AT RISK', overdue:'OVERDUE', behind:'BEHIND', canceled:'CANCELED' }[s] ?? s.toUpperCase()
}

function statusBadge(s) {
  return { complete:'badge green', 'on-track':'badge blue', 'at-risk':'badge red', overdue:'badge red', behind:'badge amber', canceled:'badge' }[s] ?? 'badge'
}

function barFill(pct) {
  if (pct >= 85) return 'var(--t-success)'
  if (pct >= 55) return 'var(--t-accent)'
  if (pct >= 30) return 'var(--t-warn)'
  return 'var(--t-alert)'
}

function fmtVal(v, unit) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  if (unit === 'dollars') return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (unit === 'percent') return n + '%'
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function daysLeft(due) {
  if (!due) return null
  return Math.ceil((new Date(due) - new Date()) / 86400000)
}

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function thisQuarter() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `${now.getFullYear()}-Q${q}`
}

function isThisWeek(due) {
  if (!due) return false
  const d = new Date(due)
  const now = new Date()
  const diff = (d - now) / 86400000
  return diff >= 0 && diff <= 7
}

function isThisMonth(start) {
  if (!start) return false
  const now = new Date()
  const s = new Date(start)
  return s.getFullYear() === now.getFullYear() && s.getMonth() === now.getMonth()
}

// ── Shared style tokens ──────────────────────────────────────────────────────

const S = {
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    padding: 0,
  },
  cardHead: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--t-line)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  inp: {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  sel: {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 4,
    display: 'block',
  },
  btn: (accent, disabled) => ({
    padding: '7px 14px',
    fontSize: 11,
    fontWeight: 700,
    background: disabled ? 'transparent' : `rgba(${accent},0.10)`,
    border: `1px solid ${disabled ? 'var(--t-line)' : `rgba(${accent},0.30)`}`,
    color: disabled ? 'var(--t-text-faint)' : `rgb(${accent})`,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    opacity: disabled ? 0.5 : 1,
  }),
  tab: (active) => ({
    padding: '9px 18px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    marginBottom: -1,
    transition: 'color 0.15s',
  }),
}

// ── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, height = 5 }) {
  const fill = barFill(pct)
  return (
    <div style={{ height, background: 'var(--t-track,rgba(120,160,220,0.14))', width: '100%', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: fill, transition: 'width 0.5s ease', borderRadius: 2 }} />
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--t-accent)', color: 'var(--t-bg,#070b14)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.36), flexShrink: 0,
      letterSpacing: '0.02em',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Category Badge ────────────────────────────────────────────────────────────

function CatBadge({ cat }) {
  const color = CAT_COLORS[cat] || 'var(--t-text-muted)'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '2px 6px', border: `1px solid ${color}55`,
      color, background: `${color}18`, flexShrink: 0,
    }}>
      {cat}
    </span>
  )
}

// ── KPI Panel (3 rows + location table) ──────────────────────────────────────

function KpiPanel({ goals, employees, locations }) {
  const enriched = useMemo(() => goals.map(g => ({ ...g, _pct: calcPct(g), _status: deriveStatus(g) })), [goals])

  const active    = enriched.filter(g => g._status !== 'complete' && g._status !== 'canceled').length
  const compQ     = enriched.filter(g => g._status === 'complete').length
  const onTrack   = enriched.filter(g => g._status === 'on-track').length
  const atRisk    = enriched.filter(g => g._status === 'at-risk').length
  const overdue   = enriched.filter(g => g._status === 'overdue').length
  const avgComp   = enriched.length ? Math.round(enriched.reduce((a, g) => a + g._pct, 0) / enriched.length) : 0

  // Row 2 — performance vs goals
  const salesGoals = enriched.filter(g => g.category === 'Sales' && g.unit === 'dollars')
  const totalTarget = salesGoals.reduce((a, g) => a + parseFloat(g.target || 0), 0)
  const totalCurrent = salesGoals.reduce((a, g) => a + parseFloat(g.current || 0), 0)
  const revenueGoalPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0
  const topAchievers  = enriched.filter(g => g._pct >= 100).length
  const belowTarget   = employees.filter(emp => {
    const empGoals = enriched.filter(g => g.person_id === emp.id)
    if (!empGoals.length) return false
    const avg = empGoals.reduce((a, g) => a + g._pct, 0) / empGoals.length
    return avg < 50
  }).length
  const dueThisWeek   = enriched.filter(g => isThisWeek(g.due)).length
  const createdMonth  = enriched.filter(g => isThisMonth(g.start)).length
  const stretchHit    = enriched.filter(g => g.stretch && g._pct >= 100).length

  // Row 3 — by location
  const locStats = locations.map(loc => {
    const empIds = employees.filter(e => e.location === loc).map(e => e.id)
    const lg = enriched.filter(g => empIds.includes(g.person_id))
    const total = lg.length
    const onT = lg.filter(g => g._status === 'on-track' || g._status === 'complete').length
    const risk = lg.filter(g => g._status === 'at-risk' || g._status === 'overdue').length
    const avg  = total ? Math.round(lg.reduce((a, g) => a + g._pct, 0) / total) : 0
    return { loc, total, onT, risk, avg }
  })

  const Tile = ({ label, val, color, sub }) => (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || 'var(--t-text)', lineHeight: 1 }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Row 1 — Goal Health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1 }}>
        <Tile label="Active Goals"      val={active}     color="var(--t-accent)" />
        <Tile label="Completed Q"       val={compQ}      color="var(--t-success)" />
        <Tile label="On Track %"        val={`${enriched.length ? Math.round(onTrack / enriched.length * 100) : 0}%`} color="var(--t-success)" />
        <Tile label="At Risk"           val={atRisk}     color="var(--t-warn)" />
        <Tile label="Overdue"           val={overdue}    color="var(--t-alert)" />
        <Tile label="Avg Completion"    val={`${avgComp}%`} color="var(--t-text)" />
      </div>

      {/* Row 2 — Performance vs Goals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1 }}>
        <Tile label="Revenue Goal %"    val={`${revenueGoalPct}%`} color={barFill(revenueGoalPct)} sub="sales goals combined" />
        <Tile label="Top Achievers"     val={topAchievers}          color="var(--t-success)" sub="≥100% complete" />
        <Tile label="Below Target"      val={belowTarget}           color="var(--t-alert)"   sub="<50% avg employees" />
        <Tile label="Due This Week"     val={dueThisWeek}           color="var(--t-warn)"    />
        <Tile label="Created This Month" val={createdMonth}         color="var(--t-accent)"  />
        <Tile label="Stretch Goals Hit" val={stretchHit}            color="#7c4dff"          />
      </div>

      {/* Row 3 — By Location */}
      <div style={{ ...S.card }}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>Goal Health by Location</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Location', 'Active Goals', 'On Track', 'At Risk', 'Avg Progress'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locStats.map(({ loc, total, onT, risk, avg }) => (
                <tr key={loc} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{loc}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)' }}>{total}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="badge green">{onT}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={risk > 0 ? 'badge red' : 'badge green'}>{risk}</span>
                  </td>
                  <td style={{ padding: '8px 12px', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}><ProgressBar pct={avg} /></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: barFill(avg), minWidth: 34 }}>{avg}%</span>
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

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({ g, myGoal, onUpdate, onComplete, compact }) {
  const [expanded, setExpanded] = useState(false)
  const pct    = calcPct(g)
  const status = deriveStatus(g)
  const days   = daysLeft(g.due)
  const fill   = barFill(pct)

  return (
    <div style={{
      ...S.card,
      transition: 'border-color 0.15s',
    }}>
      {/* Header row */}
      <div
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(x => !x)}
      >
        {/* Left: title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.3 }}>{g.title}</span>
            {g.stretch && <span style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(124,77,255,0.15)', color: '#7c4dff', border: '1px solid rgba(124,77,255,0.3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>STRETCH</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CatBadge cat={g.category} />
            <span className={statusBadge(status)}>{statusLabel(status)}</span>
            {g.priority === 'High' && <span className="badge red" style={{ fontSize: 9 }}>HIGH PRI</span>}
            {days !== null && status !== 'complete' && (
              <span style={{ fontSize: 10, color: days < 0 ? 'var(--t-alert)' : days < 3 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
              </span>
            )}
          </div>
        </div>
        {/* Right: pct + toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: fill, lineHeight: 1 }}>{pct}%</span>
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
            {fmtVal(g.current, g.unit)} of {fmtVal(g.target, g.unit)}
          </span>
          {g.set_by && <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>Set by: {g.set_by}</span>}
        </div>
        <ProgressBar pct={pct} height={6} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--t-line)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Notes */}
          {g.notes && (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', background: 'var(--t-surface-2)', padding: '8px 10px', borderLeft: '2px solid var(--t-accent)' }}>
              {g.notes}
            </div>
          )}

          {/* Due date + milestones */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span>Start: <strong style={{ color: 'var(--t-text)' }}>{g.start || '—'}</strong></span>
            <span>Due: <strong style={{ color: days !== null && days < 3 && status !== 'complete' ? 'var(--t-alert)' : 'var(--t-text)' }}>{g.due || '—'}</strong></span>
          </div>

          {/* Milestones */}
          {g.milestones && g.milestones.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Milestones</div>
              {g.milestones.map((m, i) => {
                const done = pct >= Math.round(((i + 1) / g.milestones.length) * 100)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: done ? 'var(--t-success)' : 'var(--t-surface-2)', border: `1px solid ${done ? 'var(--t-success)' : 'var(--t-line)'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {done && <span style={{ fontSize: 8, color: 'var(--t-bg,#070b14)', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12, color: done ? 'var(--t-text)' : 'var(--t-text-muted)', textDecoration: done ? 'none' : 'none' }}>{m}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Actions — only on user's own goals or HR view */}
          {(myGoal || onUpdate) && status !== 'complete' && status !== 'canceled' && (
            <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--t-line)', marginTop: 4 }}>
              {onUpdate && (
                <button onClick={(e) => { e.stopPropagation(); onUpdate(g) }} style={S.btn('0,229,255', false)}>
                  Update Progress
                </button>
              )}
              {onComplete && pct >= 95 && (
                <button onClick={(e) => { e.stopPropagation(); onComplete(g) }} style={S.btn('29,233,182', false)}>
                  Mark Complete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── UpdateProgressModal ───────────────────────────────────────────────────────

function UpdateProgressModal({ goal, onSave, onClose }) {
  const [val, setVal]   = useState(String(goal.current ?? ''))
  const [note, setNote] = useState('')
  const valid = val !== '' && !isNaN(parseFloat(val))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,11,20,0.88)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 420, padding: 0 }}>
        <div style={{ ...S.cardHead, background: 'var(--t-surface-2)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', letterSpacing: '0.05em' }}>UPDATE PROGRESS</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t-text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{goal.title}</div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span>Target: <strong style={{ color: 'var(--t-text)' }}>{fmtVal(goal.target, goal.unit)}</strong></span>
            <span>Current: <strong style={{ color: barFill(calcPct(goal)) }}>{fmtVal(goal.current, goal.unit)}</strong></span>
          </div>
          <div>
            <label style={S.label}>New Value *</label>
            <input style={S.inp} type="number" value={val} onChange={e => setVal(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={S.label}>Note (optional)</label>
            <textarea style={{ ...S.inp, resize: 'vertical', minHeight: 64 }} value={note} onChange={e => setNote(e.target.value)} placeholder="Brief update note…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--t-line)' }}>
            <button onClick={onClose} style={S.btn('120,160,220', false)}>Cancel</button>
            <button onClick={() => valid && onSave(goal.id, parseFloat(val), note)} disabled={!valid} style={S.btn('0,229,255', !valid)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SetGoalForm ───────────────────────────────────────────────────────────────

function SetGoalForm({ employees, myId, isHR, onSave, saving }) {
  const EMPTY = {
    person_id: myId,
    category: 'Sales',
    title: '',
    description: '',
    target: '',
    unit: 'dollars',
    start: '',
    due: '',
    priority: 'Medium',
    stretch: false,
    milestone1: '', milestone1_date: '',
    milestone2: '', milestone2_date: '',
    milestone3: '', milestone3_date: '',
    contest_link: '',
  }
  const [form, setForm] = useState(EMPTY)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.title.trim() && form.target && form.due

  return (
    <div style={{ ...S.card, maxWidth: 640 }}>
      <div style={{ ...S.cardHead, background: 'var(--t-surface-2)' }}>
        <span style={S.cardTitle}>Create New Goal</span>
        <span className="badge blue">SET GOALS</span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Assigned to (HR only) */}
        {isHR && (
          <div>
            <label style={S.label}>Assigned To</label>
            <select style={S.sel} value={form.person_id} onChange={e => f('person_id', e.target.value)}>
              <option value={myId}>Myself</option>
              {employees.filter(e => e.id !== myId).map(e => (
                <option key={e.id} value={e.id}>{e.full_name} — {e.location}</option>
              ))}
            </select>
          </div>
        )}

        {/* Category + Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Category</label>
            <select style={S.sel} value={form.category} onChange={e => f('category', e.target.value)}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Priority</label>
            <select style={S.sel} value={form.priority} onChange={e => f('priority', e.target.value)}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
          </div>
        </div>

        {/* Title */}
        <div>
          <label style={S.label}>Goal Title *</label>
          <input style={S.inp} value={form.title} onChange={e => f('title', e.target.value)} placeholder="e.g. Hit $5,000 this month" />
        </div>

        {/* Description */}
        <div>
          <label style={S.label}>What Success Looks Like</label>
          <textarea style={{ ...S.inp, resize: 'vertical', minHeight: 64 }} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Describe exactly how success is measured…" />
        </div>

        {/* Target + Unit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Target Value *</label>
            <input style={S.inp} type="number" value={form.target} onChange={e => f('target', e.target.value)} placeholder="e.g. 5000" />
          </div>
          <div>
            <label style={S.label}>Unit</label>
            <select style={S.sel} value={form.unit} onChange={e => f('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Start Date</label>
            <input style={S.inp} type="date" value={form.start} onChange={e => f('start', e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Due Date *</label>
            <input style={S.inp} type="date" value={form.due} onChange={e => f('due', e.target.value)} />
          </div>
        </div>

        {/* Milestones */}
        <div>
          <label style={S.label}>Milestone Checkpoints (optional)</label>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8, marginBottom: 6 }}>
              <input style={S.inp} value={form[`milestone${i}`]} onChange={e => f(`milestone${i}`, e.target.value)} placeholder={`Milestone ${i} description`} />
              <input style={S.inp} type="date" value={form[`milestone${i}_date`]} onChange={e => f(`milestone${i}_date`, e.target.value)} />
            </div>
          ))}
        </div>

        {/* Contest link + stretch */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={S.label}>Link to Contest / Spiff (optional)</label>
            <input style={S.inp} value={form.contest_link} onChange={e => f('contest_link', e.target.value)} placeholder="Contest name or ID" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
            <input
              type="checkbox"
              id="stretch-chk"
              checked={form.stretch}
              onChange={e => f('stretch', e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#7c4dff', cursor: 'pointer' }}
            />
            <label htmlFor="stretch-chk" style={{ fontSize: 12, color: 'var(--t-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Stretch Goal</label>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--t-line)' }}>
          <button onClick={() => setForm(EMPTY)} style={S.btn('120,160,220', false)}>Reset</button>
          <button
            onClick={() => {
              if (!valid || saving) return
              const milestones = [form.milestone1, form.milestone2, form.milestone3].filter(Boolean)
              onSave({ ...form, milestones })
            }}
            disabled={!valid || saving}
            style={S.btn('0,229,255', !valid || saving)}
          >
            {saving ? 'Saving…' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TeamGoals ─────────────────────────────────────────────────────────────────

function TeamGoals({ goals, employees, locations, myId, onUpdate }) {
  const [locFilter, setLocFilter] = useState('All')
  const [catFilter, setCatFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [nudging, setNudging] = useState(false)

  const enriched = useMemo(() => goals.map(g => ({ ...g, _pct: calcPct(g), _status: deriveStatus(g) })), [goals])

  const empStats = useMemo(() => employees.map(emp => {
    const eg = enriched.filter(g => g.person_id === emp.id)
    const avgPct = eg.length ? Math.round(eg.reduce((a, g) => a + g._pct, 0) / eg.length) : 0
    const atRisk = eg.filter(g => g._status === 'at-risk' || g._status === 'overdue').length
    const onTrack = eg.filter(g => g._status === 'on-track' || g._status === 'complete').length
    return { ...emp, goals: eg, avgPct, atRisk, onTrack, total: eg.length }
  }), [employees, enriched])

  const filtered = useMemo(() => empStats.filter(emp => {
    if (locFilter !== 'All' && emp.location !== locFilter) return false
    if (search.trim() && !emp.full_name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter === 'at-risk' && emp.atRisk === 0) return false
    if (statusFilter === 'on-track' && emp.onTrack === 0) return false
    return true
  }), [empStats, locFilter, search, statusFilter])

  const atRiskCount = empStats.filter(e => e.atRisk > 0).length
  const completions = enriched.filter(g => g._status === 'complete').length
  const totalGoals  = enriched.length
  const onTrackPct  = totalGoals ? Math.round(enriched.filter(g => g._status === 'on-track' || g._status === 'complete').length / totalGoals * 100) : 0

  function exportCSV() {
    const rows = [['Employee', 'Location', 'Role', 'Goal', 'Category', 'Target', 'Current', 'Pct', 'Status', 'Due']]
    empStats.forEach(emp => {
      emp.goals.forEach(g => {
        rows.push([emp.full_name, emp.location, emp.role, g.title, g.category, g.target, g.current, `${g._pct}%`, g._status, g.due || ''])
      })
    })
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `goals-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function nudgeAtRisk() {
    const ids = empStats.filter(e => e.atRisk > 0).map(e => e.id).filter(Boolean)
    if (!ids.length) return
    setNudging(true)
    try {
      const { data, error } = await sb.rpc('goal_nudge', {
        p_person_ids: ids,
        p_from: myId || null,
        p_message: 'Your goals need attention — one or more are at risk of missing target.',
      })
      if (error) throw error
      const n = data?.count ?? ids.length
      alert(`Nudge sent to ${n} at-risk employee${n !== 1 ? 's' : ''}.`)
    } catch (e) {
      alert('Could not send nudges: ' + (e.message || 'unknown error'))
    } finally {
      setNudging(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1 }}>
        {[
          { label: 'Total Goals', val: totalGoals,  color: 'var(--t-accent)' },
          { label: 'On Track %',  val: `${onTrackPct}%`, color: 'var(--t-success)' },
          { label: 'At Risk Emps',val: atRiskCount,  color: 'var(--t-warn)' },
          { label: 'Completions', val: completions,  color: '#7c4dff' },
        ].map(t => (
          <div key={t.label} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: t.color }}>{t.val}</div>
          </div>
        ))}
      </div>

      {/* Filters + bulk actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...S.sel, width: 'auto', minWidth: 130 }} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={{ ...S.sel, width: 'auto', minWidth: 120 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="at-risk">At Risk</option>
          <option value="on-track">On Track</option>
        </select>
        <input style={{ ...S.inp, width: 180 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={nudgeAtRisk} disabled={nudging || atRiskCount === 0} style={S.btn('255,179,71', nudging || atRiskCount === 0)}>
            {nudging ? 'Sending…' : `Nudge ${atRiskCount} At-Risk`}
          </button>
          <button onClick={exportCSV} style={S.btn('0,229,255', false)}>Export CSV</button>
        </div>
      </div>

      {/* Employee cards */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No employees match filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map(emp => (
            <div key={emp.id}>
              {/* Employee mini row */}
              <div
                style={{ ...S.card, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}
              >
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={emp.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{emp.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{emp.location} · {emp.role}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{emp.total} goal{emp.total !== 1 ? 's' : ''}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: barFill(emp.avgPct), lineHeight: 1 }}>{emp.avgPct}%</div>
                      <div style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>avg</div>
                    </div>
                    {emp.atRisk > 0 && <span className="badge red">{emp.atRisk} AT RISK</span>}
                    {emp.atRisk === 0 && emp.total > 0 && <span className="badge green">ON TRACK</span>}
                  </div>
                  <span style={{ color: 'var(--t-text-faint)', fontSize: 12, marginLeft: 4 }}>{expanded === emp.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded goals for this employee */}
              {expanded === emp.id && (
                <div style={{ paddingLeft: 16, borderLeft: '2px solid var(--t-accent)', marginLeft: 8, marginBottom: 4 }}>
                  {emp.goals.length === 0 ? (
                    <div style={{ padding: '12px 14px', color: 'var(--t-text-faint)', fontSize: 12 }}>No goals assigned.</div>
                  ) : emp.goals.filter(g => catFilter === 'All' || g.category === catFilter).map(g => (
                    <GoalCard key={g.id} g={g} myGoal={false} onUpdate={onUpdate} compact />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Reports ───────────────────────────────────────────────────────────────────

function qKeyOf(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`
}
function prevQuarter() {
  const now = new Date()
  let y = now.getFullYear()
  let q = Math.floor(now.getMonth() / 3) + 1 - 1
  if (q < 1) { q = 4; y -= 1 }
  return `${y}-Q${q}`
}

function ReportsTab({ goals, employees }) {
  const enriched = useMemo(() => goals.map(g => ({ ...g, _pct: calcPct(g), _status: deriveStatus(g) })), [goals])

  // Quarter-over-quarter completion, derived from real goal due dates.
  const curQKey   = thisQuarter()
  const prevQKey  = prevQuarter()
  const curGoals  = enriched.filter(g => g.due && qKeyOf(g.due) === curQKey)
  const priorGoals= enriched.filter(g => g.due && qKeyOf(g.due) === prevQKey)
  const currQ     = curGoals.length ? Math.round(curGoals.filter(g => g._status === 'complete').length / curGoals.length * 100) : 0
  const priorQ    = priorGoals.length ? Math.round(priorGoals.filter(g => g._status === 'complete').length / priorGoals.length * 100) : 0
  const hasPrior  = priorGoals.length > 0

  // By category breakdown
  const catStats = CATS.map(cat => {
    const cg = enriched.filter(g => g.category === cat)
    const done = cg.filter(g => g._status === 'complete').length
    const pct  = cg.length ? Math.round(done / cg.length * 100) : 0
    return { cat, total: cg.length, done, pct }
  })

  // Top 10 achievers by avgPct
  const achievers = employees.map(emp => {
    const eg = enriched.filter(g => g.person_id === emp.id)
    const avg = eg.length ? Math.round(eg.reduce((a, g) => a + g._pct, 0) / eg.length) : 0
    return { ...emp, avg, goalCount: eg.length }
  }).filter(e => e.goalCount > 0).sort((a, b) => b.avg - a.avg).slice(0, 10)

  // Expired without completion
  const expired = enriched.filter(g => g._status === 'overdue')

  // Goals driving highest performance improvement (complete stretch goals or high-impact)
  const highImpact = enriched.filter(g => g.stretch && g._status === 'complete')

  function exportReport() {
    const rows = [
      ['Category', 'Total Goals', 'Completed', 'Completion %'],
      ...catStats.map(c => [c.cat, c.total, c.done, `${c.pct}%`]),
      [],
      ['Top Achievers'],
      ['Employee', 'Location', 'Avg Goal %'],
      ...achievers.map(e => [e.full_name, e.location, `${e.avg}%`]),
    ]
    const csv = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `goals-reports-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const Section = ({ title, badge, children }) => (
    <div style={S.card}>
      <div style={{ ...S.cardHead, background: 'var(--t-surface-2)' }}>
        <span style={S.cardTitle}>{title}</span>
        {badge && <span className="badge blue">{badge}</span>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )

  const Bar = ({ pct, label, color }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: color || barFill(pct) }}>{pct}%</span>
      </div>
      <ProgressBar pct={pct} height={8} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={exportReport} style={S.btn('0,229,255', false)}>Export CSV Report</button>
      </div>

      {/* QoQ */}
      <Section title="Quarter-over-Quarter Goal Completion" badge={curQKey}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{prevQKey} (Prior)</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: hasPrior ? barFill(priorQ) : 'var(--t-text-faint)', lineHeight: 1 }}>{hasPrior ? `${priorQ}%` : '—'}</div>
            <div style={{ marginTop: 10 }}><ProgressBar pct={hasPrior ? priorQ : 0} height={10} /></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{curQKey} (Current)</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: curGoals.length ? barFill(currQ) : 'var(--t-text-faint)', lineHeight: 1 }}>{curGoals.length ? `${currQ}%` : '—'}</div>
            <div style={{ marginTop: 10 }}><ProgressBar pct={curGoals.length ? currQ : 0} height={10} /></div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '8px 12px', background: 'var(--t-surface-2)', borderLeft: `3px solid ${!hasPrior ? 'var(--t-line)' : currQ >= priorQ ? 'var(--t-success)' : 'var(--t-alert)'}`, fontSize: 12, color: 'var(--t-text-muted)' }}>
          {!hasPrior
            ? `No goals were due in ${prevQKey} yet — comparison starts once a prior quarter has data.`
            : currQ >= priorQ
              ? `Up ${currQ - priorQ}pp from ${prevQKey} — strong momentum.`
              : `Down ${priorQ - currQ}pp from ${prevQKey} — focus needed on goal pacing.`}
        </div>
      </Section>

      {/* By category */}
      <Section title="Goal Completion by Category">
        {catStats.map(c => (
          <Bar key={c.cat} pct={c.pct} label={`${c.cat} (${c.done}/${c.total})`} color={CAT_COLORS[c.cat]} />
        ))}
      </Section>

      {/* Top 10 achievers */}
      <Section title="Top 10 Goal Achievers" badge="By Avg %">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
              {['#', 'Employee', 'Location', 'Role', 'Avg Goal %'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {achievers.map((emp, i) => (
              <tr key={emp.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                <td style={{ padding: '8px 10px', fontWeight: 900, color: i < 3 ? 'var(--t-accent)' : 'var(--t-text-faint)' }}>#{i + 1}</td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={emp.full_name} size={22} />
                    <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{emp.full_name}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{emp.location}</td>
                <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{emp.role}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: barFill(emp.avg) }}>{emp.avg}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Expired without completion */}
      <Section title="Goals Expired Without Completion" badge={`${expired.length} OVERDUE`}>
        {expired.length === 0 ? (
          <div style={{ color: 'var(--t-success)', fontSize: 13, fontWeight: 700 }}>No expired goals — great discipline!</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                {['Goal', 'Employee', 'Category', 'Progress', 'Overdue By'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expired.map(g => {
                const emp = employees.find(e => e.id === g.person_id)
                const overdueBy = g.due ? Math.abs(Math.ceil((new Date(g.due) - new Date()) / 86400000)) : 0
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--t-text)' }}>{g.title}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{emp?.full_name || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><CatBadge cat={g.category} /></td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80 }}><ProgressBar pct={g._pct} /></div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: barFill(g._pct) }}>{g._pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--t-alert)', fontWeight: 700 }}>{overdueBy}d</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* High-performance stretch goals */}
      <Section title="Stretch Goals Driving Performance" badge={`${highImpact.length} HIT`}>
        {highImpact.length === 0 ? (
          <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No stretch goals completed yet this quarter.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {highImpact.map(g => {
              const emp = employees.find(e => e.id === g.person_id)
              return (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--t-surface-2)', borderLeft: '3px solid var(--t-success)' }}>
                  {emp && <Avatar name={emp.full_name} size={28} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{g.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{emp?.full_name} · {g.category}</div>
                  </div>
                  <span className="badge green">{g._pct}% ACHIEVED</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(124,77,255,0.15)', color: '#7c4dff', border: '1px solid rgba(124,77,255,0.3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>STRETCH</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Goals() {
  const { session }                     = useAuth()
  const { locationIds }                 = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR     = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))
  const myId     = session?.person?.id || null

  const [goals,     setGoals]     = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState(0)
  const [catFilter, setCatFilter] = useState('All')
  const [search,    setSearch]    = useState('')
  const [statusFlt, setStatusFlt] = useState('All')
  const [updateTarget, setUpdateTarget] = useState(null)
  const [saving,    setSaving]    = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  // Goals + roster come straight from the HR brain — no mock fallback. If the
  // backend returns nothing we render honest empty states.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gRes, rRes] = await Promise.all([
        sb.rpc('get_goals',  { p_node_ids: locationIds }),
        sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: myId }),
      ])
      setGoals(Array.isArray(gRes?.data) ? gRes.data : [])
      const roster = Array.isArray(rRes?.data) ? rRes.data : []
      setEmployees(roster.map(r => ({
        id:        r.id ?? r.person_id,
        full_name: r.full_name,
        location:  r.node_name ?? r.location ?? '—',
        role:      r.role_name ?? r.role ?? '',
      })).filter(e => e.id))
    } catch {
      setGoals([])
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [locationIds.join(','), myId])  // eslint-disable-line

  useEffect(() => { load() }, [load])

  // Location list derived from the live roster — no hardcoded store names.
  const locations = useMemo(
    () => [...new Set(employees.map(e => e.location).filter(l => l && l !== '—'))].sort(),
    [employees]
  )

  // ── Enriched ──────────────────────────────────────────────────────────────
  const enriched = useMemo(() => goals.map(g => ({
    ...g, _pct: calcPct(g), _status: deriveStatus(g)
  })), [goals])

  // ── My Goals (Tab 0) ──────────────────────────────────────────────────────
  const myGoals = useMemo(() => {
    let rows = enriched.filter(g => g.person_id === myId)
    if (catFilter !== 'All') rows = rows.filter(g => g.category === catFilter)
    if (statusFlt !== 'All') rows = rows.filter(g => g._status === statusFlt)
    if (search.trim()) rows = rows.filter(g => g.title.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [enriched, myId, catFilter, statusFlt, search])

  // ── Create Goal ───────────────────────────────────────────────────────────
  const handleSetGoal = useCallback(async (form) => {
    setSaving(true)
    try {
      const milestones = (form.milestones && form.milestones.length)
        ? form.milestones
        : [form.milestone1, form.milestone2, form.milestone3].filter(Boolean)
      const { data, error } = await sb.rpc('create_goal', {
        p_person_id:    form.person_id,
        p_category:     form.category,
        p_title:        form.title,
        p_target:       parseFloat(form.target),
        p_unit:         form.unit,
        p_due_date:     form.due || null,
        p_start_date:   form.start || null,
        p_priority:     form.priority,
        p_stretch:      !!form.stretch,
        p_description:  form.description || null,
        p_milestones:   milestones,
        p_contest_link: form.contest_link || null,
        p_set_by:       form.person_id === myId ? 'Self' : (isHR ? 'Manager' : 'Self'),
        p_created_by:   myId,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'create failed')
      await load()
    } catch (e) {
      alert('Could not create goal: ' + (e.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }, [myId, isHR, load])

  // ── Update Progress ───────────────────────────────────────────────────────
  const handleUpdateProgress = useCallback(async (goalId, newVal, note) => {
    try {
      const { data, error } = await sb.rpc('update_goal_progress', { p_goal_id: goalId, p_progress: newVal, p_note: note || null })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'update failed')
      setUpdateTarget(null)
      await load()
    } catch (e) {
      alert('Could not save progress: ' + (e.message || 'unknown error'))
    }
  }, [load])

  // ── Mark Complete ─────────────────────────────────────────────────────────
  const handleComplete = useCallback(async (g) => {
    try {
      const { data, error } = await sb.rpc('goal_set_status', { p_goal_id: g.id, p_status: 'complete' })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'update failed')
      await load()
    } catch (e) {
      alert('Could not mark complete: ' + (e.message || 'unknown error'))
    }
  }, [load])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-sans,inherit)', color: 'var(--t-text)' }}>

      {/* Forensic KPI Panel */}
      {!loading && enriched.length > 0 && <KpiPanel goals={enriched} employees={employees} locations={locations} />}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em' }}>GOALS &amp; TARGETS</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Individual performance goals, team targets, and progress tracking</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 16 }}>
        {TABS.map((t, i) => {
          if (i === 1 && !isHR) return null
          return (
            <button key={t} onClick={() => setTab(i)} style={S.tab(tab === i)}>
              {t}
              {i === 1 && isHR && (() => {
                const ar = enriched.filter(g => g._status === 'at-risk' || g._status === 'overdue').length
                return ar > 0 ? <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--t-alert)', color: '#fff', padding: '1px 5px', fontWeight: 900 }}>{ar}</span> : null
              })()}
            </button>
          )
        })}
      </div>

      {/* ── Tab 0: My Goals ──────────────────────────────────────────────── */}
      {tab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['All', ...CATS].map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 700,
                background: catFilter === c ? `${CAT_COLORS[c] || 'var(--t-accent)'}18` : 'var(--t-surface)',
                border: catFilter === c ? `1px solid ${CAT_COLORS[c] || 'var(--t-accent)'}55` : '1px solid var(--t-line)',
                color: catFilter === c ? (CAT_COLORS[c] || 'var(--t-accent)') : 'var(--t-text-muted)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{c}</button>
            ))}
            <select style={{ ...S.sel, width: 'auto', minWidth: 120, marginLeft: 4 }} value={statusFlt} onChange={e => setStatusFlt(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="on-track">On Track</option>
              <option value="at-risk">At Risk</option>
              <option value="overdue">Overdue</option>
              <option value="complete">Complete</option>
            </select>
            <input style={{ ...S.inp, width: 180, marginLeft: 'auto' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search goals…" />
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading goals…</div>
          ) : myGoals.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
              <div style={{ fontSize: 32, marginBottom: 10, filter: 'grayscale(1)', opacity: 0.5 }}>🎯</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No Goals Found</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
                {(catFilter !== 'All' || search || statusFlt !== 'All') ? (
                  <button onClick={() => { setCatFilter('All'); setSearch(''); setStatusFlt('All') }} style={{ color: 'var(--t-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Clear filters</button>
                ) : 'No goals assigned to you yet. Ask your manager or create one.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 2 }}>
                {myGoals.length} goal{myGoals.length !== 1 ? 's' : ''}
                {(catFilter !== 'All' || search || statusFlt !== 'All') && (
                  <button onClick={() => { setCatFilter('All'); setSearch(''); setStatusFlt('All') }} style={{ marginLeft: 10, fontSize: 11, color: 'var(--t-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear filters
                  </button>
                )}
              </div>
              {myGoals.map(g => (
                <GoalCard
                  key={g.id}
                  g={g}
                  myGoal
                  onUpdate={setUpdateTarget}
                  onComplete={handleComplete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 1: Team Goals (HR/Mgr only) ─────────────────────────────── */}
      {tab === 1 && isHR && (
        <TeamGoals
          goals={enriched}
          employees={employees}
          locations={locations}
          myId={myId}
          onUpdate={setUpdateTarget}
        />
      )}

      {/* ── Tab 2: Set Goals ─────────────────────────────────────────────── */}
      {tab === 2 && (
        <SetGoalForm
          employees={employees}
          myId={myId}
          isHR={isHR}
          onSave={handleSetGoal}
          saving={saving}
        />
      )}

      {/* ── Tab 3: Reports ───────────────────────────────────────────────── */}
      {tab === 3 && (
        <ReportsTab goals={enriched} employees={employees} />
      )}

      {/* Update Progress Modal */}
      {updateTarget && (
        <UpdateProgressModal
          goal={updateTarget}
          onSave={handleUpdateProgress}
          onClose={() => setUpdateTarget(null)}
        />
      )}
    </div>
  )
}
