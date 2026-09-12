// HealthScores.jsx — Twisted Growers HR
// Aurora midnight theme · inline styles · CSS token vars · no Tailwind
// 100% real data: composite health scores are computed server-side by the
// get_health_scores(p_node_ids) RPC from live attendance_incidents,
// training_records, disciplinary_records, shifts and compliments — no seeds,
// no localStorage datastore, no fabricated employees.
import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { useFeatureFlag } from '../lib/featureFlags.js'

/* ─────────────────────────────────────────────────────────────────────────────
   METRIC WEIGHTS (display labels — must mirror the RPC's weighting)
───────────────────────────────────────────────────────────────────────────── */
const METRIC_META = [
  { key: 'attendance',  label: 'Attendance',       weight: '30%' },
  { key: 'training',    label: 'Training',         weight: '25%' },
  { key: 'da_free',     label: 'DA-Free Days',     weight: '20%' },
  { key: 'coverage',    label: 'Shift Coverage',   weight: '15%' },
  { key: 'recognition', label: 'Peer Recognition', weight: '10%' },
]

const ini = n => !n ? '??' : n.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()

/* ─────────────────────────────────────────────────────────────────────────────
   MAP a real get_health_scores row → the shape the render code expects.
───────────────────────────────────────────────────────────────────────────── */
function mapHealthRow(r) {
  const num = (v) => Number(v) || 0
  const attendance  = num(r.attendance)
  const recentInc   = num(r.recent_incidents)
  const openDA      = !!r.open_da

  // Trend from real recent signals: recent incidents / open DA drag down;
  // a strong clean score trends up; otherwise flat.
  let trend = '→', trendColor = 'var(--t-text-muted)'
  if (recentInc > 0 || openDA) { trend = '↓'; trendColor = 'var(--t-danger)' }
  else if (num(r.score) >= 80) { trend = '↑'; trendColor = 'var(--t-success)' }

  return {
    idx:        r.person_id,        // stable React key (uuid)
    person_id:  r.person_id,
    node_id:    r.node_id,
    name:       r.full_name || 'Unknown',
    role:       r.role || '—',
    loc:        r.location || '—',
    score:      num(r.score),
    metrics:    METRIC_META.map(m => ({ label: m.label, weight: m.weight, value: num(r[m.key]) })),
    trend,
    trendColor,
    trainingOverdue: !!r.training_overdue,
    openDA,
    openDaCount:     num(r.open_da_count),
    attendance,
    recognitionCount: num(r.recognition_count),
    attendancePoints: num(r.attendance_points),
    recentIncidents:  recentInc,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
function scoreColor(s) {
  return s >= 80 ? 'var(--t-success)' : s >= 65 ? 'var(--t-warn)' : 'var(--t-danger)'
}

function scoreBg(s) {
  return s >= 80 ? 'rgba(29,233,182,.15)' : s >= 65 ? 'rgba(255,179,71,.15)' : 'rgba(255,77,125,.15)'
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function Badge({ type, children }) {
  const map = {
    green:  { bg: 'rgba(29,233,182,.15)',  color: 'var(--t-success)' },
    amber:  { bg: 'rgba(255,179,71,.15)',  color: 'var(--t-warn)'    },
    red:    { bg: 'rgba(255,77,125,.15)',  color: 'var(--t-danger)'  },
    blue:   { bg: 'rgba(59,130,246,.15)',  color: '#60a5fa'          },
    cyan:   { bg: 'rgba(0,229,255,.12)',  color: 'var(--t-accent)'   },
  }
  const s = map[type] || map.blue
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: 0.5,
    }}>
      {children}
    </span>
  )
}

function KpiTile({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      padding: '14px 16px', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function FeatureDisabled() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>Feature Not Enabled</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>This feature is not available in your current plan or configuration.</div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   METRIC BAR — pure CSS, no chart libs
───────────────────────────────────────────────────────────────────────────── */
function MetricBar({ label, weight, value }) {
  const c = value >= 80 ? 'var(--t-success)' : value >= 65 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 600 }}>{label}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>{weight}</span>
          <span style={{ fontSize: 11, color: c, fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 28, textAlign: 'right' }}>{value}</span>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${value}%`, background: c,
          transition: 'width .3s ease',
        }} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMPLOYEE SCORE CARD
───────────────────────────────────────────────────────────────────────────── */
function ScoreCard({ emp }) {
  const [hov, setHov] = useState(false)
  const sc = scoreColor(emp.score)
  const bg = scoreBg(emp.score)

  const navTo360 = () => { window.location.hash = '/employee-360' }

  // Data sources for score breakdown panel — all real, from get_health_scores.
  const hasRecognition = (emp.recognitionCount || 0) > 0
  const hasAttInc      = (emp.recentIncidents || 0) > 0 || (emp.attendancePoints || 0) > 0
  const openDaCount    = emp.openDaCount || 0

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--t-surface)',
        border: `1px solid ${hov ? sc : 'var(--t-line)'}`,
        padding: 16,
        transition: 'border-color .15s, box-shadow .15s',
        boxShadow: hov ? '0 4px 20px rgba(0,0,0,.3)' : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0,
            background: bg, border: `2px solid ${sc}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 11, color: sc,
          }}>
            {ini(emp.name)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.name}</div>
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <Badge type="cyan">{emp.loc}</Badge>
              <Badge type="blue">{emp.role}</Badge>
            </div>
          </div>
        </div>
        {/* Score */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: sc, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
            {emp.score}
          </div>
          <div style={{ fontSize: 12, color: emp.trendColor, fontWeight: 700 }}>{emp.trend}</div>
        </div>
      </div>

      {/* 5 metric bars */}
      <div style={{ marginBottom: 12 }}>
        {emp.metrics.map(m => (
          <MetricBar key={m.label} label={m.label} weight={m.weight} value={m.value} />
        ))}
      </div>

      {/* Data Sources panel */}
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10, padding: '6px 8px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 6 }}>Sources:</span>
        <span style={{ color: hasRecognition ? 'var(--t-success)' : 'var(--t-text-faint)' }}>
          {hasRecognition ? `✓ ${emp.recognitionCount} Recognition` : '○ Recognition'}
        </span>
        <span style={{ margin: '0 6px', color: 'var(--t-line)' }}>·</span>
        <span style={{ color: hasAttInc ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>
          {hasAttInc ? '✓' : '○'} Attendance
        </span>
        <span style={{ margin: '0 6px', color: 'var(--t-line)' }}>·</span>
        <span style={{ color: openDaCount > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
          {openDaCount > 0 ? `✓ ${openDaCount} Open DA` : '○ Discipline'}
        </span>
      </div>

      {/* View 360 */}
      <button
        onClick={navTo360}
        style={{
          background: 'transparent',
          border: `1px solid ${hov ? 'var(--t-accent)' : 'var(--t-line)'}`,
          color: hov ? 'var(--t-accent)' : 'var(--t-text-muted)',
          padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          width: '100%', transition: 'border-color .15s, color .15s',
        }}
      >
        View 360 →
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   RISK ALERTS COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function RiskAlerts({ employees }) {
  // At-risk (real threshold): score < 65 AND open DA AND training overdue.
  const displayed = employees.filter(e => e.score < 65 && e.openDA && e.trainingOverdue)

  if (displayed.length === 0) {
    return (
      <div style={{
        background: 'rgba(29,233,182,.06)', border: '1px solid rgba(29,233,182,.3)',
        padding: '20px 24px',
      }}>
        <div style={{ fontSize: 12, color: 'var(--t-success)', fontWeight: 700 }}>
          ✓ No employees currently meet the high-risk threshold.
        </div>
      </div>
    )
  }

  const recommendedActions = emp => {
    const actions = []
    if (emp.score < 50)          actions.push('Urgent performance review required')
    if (emp.openDA)              actions.push('Resolve open disciplinary action')
    if (emp.trainingOverdue)     actions.push('Schedule overdue training session')
    if (emp.attendance < 75)     actions.push('Issue attendance warning')
    if (actions.length === 0)    actions.push('Schedule 1-on-1 coaching session')
    return actions
  }

  const riskFactors = emp => {
    const factors = []
    if (emp.score < 65)          factors.push({ label: `Health Score ${emp.score}`,    color: 'var(--t-danger)' })
    if (emp.openDA)              factors.push({ label: 'Open Disciplinary Action',       color: 'var(--t-danger)' })
    if (emp.trainingOverdue)     factors.push({ label: 'Training Overdue (<65%)',         color: 'var(--t-warn)'   })
    if (emp.attendance < 75)     factors.push({ label: `Attendance ${emp.attendance}%`,   color: 'var(--t-warn)'   })
    return factors
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {displayed.map((emp) => {
        const factors = riskFactors(emp)
        const actions = recommendedActions(emp)
        return (
          <div key={emp.idx} style={{
            background: 'rgba(255,77,125,.04)',
            border: '1px solid rgba(255,77,125,.4)',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              {/* Left: name + info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, flexShrink: 0,
                    background: 'rgba(255,77,125,.15)', border: '2px solid var(--t-danger)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 10, color: 'var(--t-danger)',
                  }}>
                    {ini(emp.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)' }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 1 }}>{emp.role} · {emp.loc}</div>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: 'var(--t-danger)',
                    fontFamily: 'var(--font-mono)', marginLeft: 8,
                  }}>
                    {emp.score}
                  </div>
                </div>

                {/* Risk factors */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                    Risk Factors
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {factors.map((f, i) => (
                      <span key={i} style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px',
                        background: `${f.color}22`, color: f.color,
                        border: `1px solid ${f.color}44`,
                      }}>
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Recommended actions */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                    Recommended Actions
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                    {actions.map((a, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 2 }}>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right: URGENT badge */}
              <div style={{
                background: 'rgba(255,77,125,.12)', border: '1px solid var(--t-danger)',
                padding: '6px 14px', alignSelf: 'flex-start', flexShrink: 0,
                fontSize: 11, fontWeight: 800, color: 'var(--t-danger)', letterSpacing: 1,
              }}>
                URGENT
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function HealthScores() {
  const { session }      = useAuth()
  const { locationIds }  = useScope() || {}
  const ffHealthScore    = useFeatureFlag('health_score')
  const ffRiskAlerts     = useFeatureFlag('risk_alerts')

  const role_name = session?.person?.role_name ?? ''
  const isManager = /ceo|manager|hr|coo|admin|owner/i.test(role_name)

  const [locFilter,   setLocFilter]   = useState('All')
  const [roleFilter,  setRoleFilter]  = useState('All')
  const [rangeFilter, setRangeFilter] = useState('All')
  const [sortBy,      setSortBy]      = useState('score')

  // Real data from Supabase. null = loading, [] = honestly empty, [...] = data.
  const [employees, setEmployees] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const ids = Array.isArray(locationIds) ? locationIds : []
    setLoadError(null)
    if (ids.length === 0) { setEmployees([]); return }
    setEmployees(null) // loading
    ;(async () => {
      const { data, error } = await sb.rpc('get_health_scores', { p_node_ids: ids })
      if (cancelled) return
      if (error) { setLoadError(error.message || 'Failed to load health scores'); setEmployees([]); return }
      const rows = Array.isArray(data) ? data : []
      setEmployees(rows.map(mapHealthRow))
    })()
    return () => { cancelled = true }
  }, [locationIds])

  if (!ffHealthScore) return <FeatureDisabled />
  if (!isManager) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>Managers Only</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Access to Health Scores requires a manager role.</div>
    </div>
  )

  const loading = employees === null
  const ENRICHED_EMPLOYEES = useMemo(() => employees || [], [employees])

  // KPI stats — derived from real data
  const avgScore   = useMemo(() => {
    if (ENRICHED_EMPLOYEES.length === 0) return 0
    const total = ENRICHED_EMPLOYEES.reduce((s, e) => s + e.score, 0)
    return Math.round(total / ENRICHED_EMPLOYEES.length)
  }, [ENRICHED_EMPLOYEES])
  const greenCount = useMemo(() => ENRICHED_EMPLOYEES.filter(e => e.score >= 80).length, [ENRICHED_EMPLOYEES])
  const amberCount = useMemo(() => ENRICHED_EMPLOYEES.filter(e => e.score >= 65 && e.score < 80).length, [ENRICHED_EMPLOYEES])
  const redCount   = useMemo(() => ENRICHED_EMPLOYEES.filter(e => e.score < 65).length, [ENRICHED_EMPLOYEES])

  // Filter option lists derived from the real data itself.
  const uniqueLocs  = useMemo(() => [...new Set(ENRICHED_EMPLOYEES.map(e => e.loc).filter(Boolean))].sort(), [ENRICHED_EMPLOYEES])
  const uniqueRoles = useMemo(() => [...new Set(ENRICHED_EMPLOYEES.map(e => e.role).filter(Boolean))].sort(), [ENRICHED_EMPLOYEES])

  const selInput = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 10px', fontSize: 12,
  }

  const filtered = useMemo(() => {
    let emps = [...ENRICHED_EMPLOYEES]

    if (locFilter  !== 'All') emps = emps.filter(e => e.loc  === locFilter)
    if (roleFilter !== 'All') emps = emps.filter(e => e.role === roleFilter)
    if (rangeFilter === 'green') emps = emps.filter(e => e.score >= 80)
    if (rangeFilter === 'amber') emps = emps.filter(e => e.score >= 65 && e.score < 80)
    if (rangeFilter === 'red')   emps = emps.filter(e => e.score < 65)

    if (sortBy === 'score')    emps.sort((a, b) => b.score - a.score)
    if (sortBy === 'name')     emps.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'location') emps.sort((a, b) => a.loc.localeCompare(b.loc))

    return emps
  }, [ENRICHED_EMPLOYEES, locFilter, roleFilter, rangeFilter, sortBy])

  return (
    <div style={{ padding: '24px 28px', minHeight: '100%', color: 'var(--t-text)' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: 'var(--t-text)' }}>
          EMPLOYEE PERFORMANCE HEALTH SCORES
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
          Composite score — attendance, training, discipline, coverage, recognition
        </div>
      </div>

      {loadError && (
        <div style={{
          background: 'rgba(255,77,125,.06)', border: '1px solid rgba(255,77,125,.4)',
          padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--t-danger)',
        }}>
          Could not load health scores: {loadError}
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiTile
          label="Avg Score (All)"
          value={avgScore}
          color={scoreColor(avgScore)}
        />
        <KpiTile
          label="Green Zone"
          value={greenCount}
          color="var(--t-success)"
          sub="Score ≥ 80"
        />
        <KpiTile
          label="Amber Zone"
          value={amberCount}
          color="var(--t-warn)"
          sub="Score 65–79"
        />
        <KpiTile
          label="Red Zone"
          value={redCount}
          color="var(--t-danger)"
          sub="Score < 65"
        />
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {/* Location pill tabs — derived from live roster locations */}
        <div style={{ display: 'flex', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
          {['All', ...uniqueLocs].map((loc, i) => (
            <button key={loc} onClick={() => setLocFilter(loc)} style={{
              background: locFilter === loc ? 'rgba(0,229,255,.1)' : 'transparent',
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--t-line)' : 'none',
              color: locFilter === loc ? 'var(--t-accent)' : 'var(--t-text-muted)',
              padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              {loc}
            </button>
          ))}
        </div>

        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selInput}>
          <option value="All">All Roles</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={rangeFilter} onChange={e => setRangeFilter(e.target.value)} style={selInput}>
          <option value="All">All Scores</option>
          <option value="green">Green (≥80)</option>
          <option value="amber">Amber (65–79)</option>
          <option value="red">Red (&lt;65)</option>
        </select>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selInput}>
          <option value="score">Sort: Score</option>
          <option value="name">Sort: Name</option>
          <option value="location">Sort: Location</option>
        </select>

        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 4 }}>
          {filtered.length} of {ENRICHED_EMPLOYEES.length} employees
        </span>
      </div>

      {/* Score Cards Grid — 2 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        {loading && (
          <div style={{
            gridColumn: '1/-1', padding: '40px 0',
            textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13,
          }}>
            Loading health scores…
          </div>
        )}
        {!loading && ENRICHED_EMPLOYEES.length === 0 && (
          <div style={{
            gridColumn: '1/-1', padding: '40px 0',
            textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13,
          }}>
            No employees found for the selected location(s).
          </div>
        )}
        {!loading && ENRICHED_EMPLOYEES.length > 0 && filtered.length === 0 && (
          <div style={{
            gridColumn: '1/-1', padding: '40px 0',
            textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13,
          }}>
            No employees match current filters.
          </div>
        )}
        {!loading && filtered.map(emp => (
          <ScoreCard key={emp.idx} emp={emp} />
        ))}
      </div>

      {/* Risk Alerts Section */}
      {ffRiskAlerts && !loading && ENRICHED_EMPLOYEES.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 16, paddingBottom: 12,
            borderBottom: '1px solid var(--t-line)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, color: 'var(--t-danger)', textTransform: 'uppercase' }}>
              Risk Alerts
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: 0.5,
              background: 'rgba(255,77,125,.15)', color: 'var(--t-danger)',
            }}>
              URGENT
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
              Employees where score &lt; 65 + open DA + training overdue
            </span>
          </div>
          <RiskAlerts employees={ENRICHED_EMPLOYEES} />
        </div>
      )}
    </div>
  )
}
