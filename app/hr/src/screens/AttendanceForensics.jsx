import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

/* ══════════════════════════════════════════════════════════════════════
   Attendance Forensics — 100% real data.

   Source of truth: get_attendance_overview(p_node_ids) → roster + each
   person's real attendance_incidents (tardy | callout | ncns, with dates
   and points). Every metric below is DERIVED from those real incidents —
   nothing is seeded, faked, or randomised. Manager actions (Bradford
   thresholds, employee flags, AI-warning decisions, alert dismissals,
   return-to-work check-ins) persist through the af_* RPCs and refresh
   from the server.  Honest empty states everywhere; no fabrication.
══════════════════════════════════════════════════════════════════════ */

const MS_DAY = 86400000
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseISO(s) { return new Date(String(s).slice(0, 10) + 'T00:00:00') }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / MS_DAY) }
function dowShort(iso) { return DOW[parseISO(iso).getDay()] }
function fmt(d) { return d ? parseISO(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }
function fmtShort(d) { return d ? parseISO(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' }
function isoDaysAgo(now, days) { return new Date(now - days * MS_DAY).toISOString().slice(0, 10) }

/* ── select style ─────────────────────────────────────────────────────── */
const selStyle = {
  background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
  padding: '6px 10px', fontSize: 13, borderRadius: 0,
}

/* ── incident type colours ────────────────────────────────────────────── */
const TYPE_COLORS = { tardy: '#eab308', callout: '#ef4444', ncns: '#7f1d1d', none: 'rgba(120,120,120,.18)' }

/* ── Bradford from an ascending list of absence dates ─────────────────── */
function bradford(absAsc) {
  let spells = 0, prev = null
  for (const d of absAsc) { if (prev === null || daysBetween(prev, d) > 1) spells++; prev = d }
  const days = absAsc.length
  return { spells, days, score: spells * spells * days }
}

/* ── enrich one incident list with running point totals (chronological) ── */
function enrichIncidents(raw) {
  const asc = [...raw].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let running = 0
  const withRun = asc.map(inc => {
    const pts = Number(inc.pts) || 0
    running = Math.max(0, Math.round((running + (inc.expired ? 0 : pts)) * 10) / 10)
    return { ...inc, pts, runningTotal: running }
  })
  return withRun.sort((a, b) => String(b.date).localeCompare(String(a.date))) // newest first
}

/* ── enrich one roster row from the real RPC payload ─────────────────── */
function enrichRow(emp, nowMs) {
  const incidents = enrichIncidents(emp.incidents || [])
  const absAsc = incidents.filter(i => i.type === 'callout' || i.type === 'ncns')
    .map(i => i.date).sort()
  const within = (iso, days) => {
    const t = parseISO(iso).getTime()
    return t <= nowMs && (nowMs - t) <= days * MS_DAY
  }
  const cnt = (type, days) => incidents.filter(i => i.type === type && within(i.date, days)).length
  const tardy90 = cnt('tardy', 90), callout90 = cnt('callout', 90), ncns90 = cnt('ncns', 90)
  const absence90 = callout90 + ncns90

  const abs52 = absAsc.filter(d => within(d, 365))
  const brad = bradford(abs52)

  const dowc = {}
  absAsc.forEach(d => { const k = dowShort(d); dowc[k] = (dowc[k] || 0) + 1 })
  const mostMissedDow = Object.entries(dowc).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

  const recent = absAsc.filter(d => within(d, 45)).length
  const prior = absAsc.filter(d => { const g = Math.round((nowMs - parseISO(d).getTime()) / MS_DAY); return g > 45 && g <= 90 }).length
  const trend = recent < prior ? 'improving' : recent > prior ? 'declining' : 'stable'

  let maxRun = 0, run = 0, prev = null
  for (const d of absAsc) { if (prev !== null && daysBetween(prev, d) === 1) run++; else run = 1; if (run > maxRun) maxRun = run; prev = d }

  const lastIncident = incidents[0]?.date || null
  const lastAbs = absAsc.length ? absAsc[absAsc.length - 1] : null
  const daysSinceAbs = lastAbs ? Math.round((nowMs - parseISO(lastAbs).getTime()) / MS_DAY) : null
  const activePts = Math.round(incidents.filter(i => !i.expired).reduce((s, i) => s + (Number(i.pts) || 0), 0) * 10) / 10

  return {
    ...emp, incidents, absAsc, tardy90, callout90, ncns90, absence90,
    brad, totalAbs: absAsc.length, totalTardy: incidents.filter(i => i.type === 'tardy').length,
    mostMissedDow, trend, maxRun, lastIncident, lastAbs, daysSinceAbs, activePts,
    perfect: absAsc.length === 0,
  }
}

/* ── KPI tile ─────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── generic state / lock panels ──────────────────────────────────────── */
function StatePanel({ icon, title, msg, tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 12,
      background: 'var(--t-surface)', border: `1px solid ${tone === 'error' ? 'var(--t-danger)' : 'var(--t-line)'}` }}>
      <div style={{ fontSize: 34, opacity: .3 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-text)' }}>{title}</div>
      {msg && <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{msg}</div>}
    </div>
  )
}
function LockScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
      <div style={{ fontSize: 40, opacity: .3 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--t-text)' }}>HR Access Required</div>
      <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
        Attendance Forensics is restricted to HR Managers, COO, and Admin roles.
      </div>
    </div>
  )
}

function IncidentBadge({ type }) {
  const cls = type === 'tardy' ? 'badge amber' : 'badge red'
  const label = type === 'ncns' ? 'NCNS' : String(type).toUpperCase()
  const style = type === 'ncns'
    ? { background: 'rgba(127,29,29,.35)', color: '#fca5a5', border: '1px solid #7f1d1d', fontSize: 9, fontWeight: 800 }
    : { fontSize: 9, fontWeight: 700 }
  return <span className={cls} style={style}>{label}</span>
}

/* ══════════════════════════════════════════════════════════════════════
   FORENSIC KPI PANEL — real aggregates over the loaded roster
══════════════════════════════════════════════════════════════════════ */
function ForensicKpiPanel({ roster, thresholds, flagsSet }) {
  const [drill, setDrill] = useState(null)

  const agg = useMemo(() => {
    const n = roster.length || 1
    let ncns90 = 0, callout90 = 0, tardy90 = 0, absence90 = 0, perfectCount = 0
    let bradSum = 0, worst = { name: '—', score: 0 }
    const locData = {}
    const dowCount = {}
    roster.forEach(r => {
      ncns90 += r.ncns90; callout90 += r.callout90; tardy90 += r.tardy90; absence90 += r.absence90
      if (r.perfect) perfectCount++
      bradSum += r.brad.score
      if (r.brad.score > worst.score) worst = { name: r.full_name, score: r.brad.score }
      r.absAsc.forEach(d => { const k = dowShort(d); dowCount[k] = (dowCount[k] || 0) + 1 })
      const loc = r.location || '—'
      const L = locData[loc] || (locData[loc] = { brad: [], ncns90: 0, atRisk: 0, n: 0 })
      L.brad.push(r.brad.score); L.ncns90 += r.ncns90; L.n++
      if (r.brad.score >= thresholds.final_warn) L.atRisk++
    })
    const avgBrad = Math.round(bradSum / n)
    const pendingWarn = roster.filter(r => r.brad.score >= thresholds.warn && r.brad.score < thresholds.final_warn).length
    const flaggedCount = roster.filter(r => flagsSet.has(r.person_id)).length
    const mostMissedDay = Object.entries(dowCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    const locRanked = Object.entries(locData).map(([loc, v]) => ({
      loc, ncns: v.ncns90, atRisk: v.atRisk,
      avgBrad: v.brad.length ? Math.round(v.brad.reduce((s, x) => s + x, 0) / v.brad.length) : 0,
    })).sort((a, b) => b.avgBrad - a.avgBrad)
    const highestRiskLoc = locRanked[0] || null

    // 6-month absence trend from real absence dates
    const nowMs = Date.now()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowMs); d.setMonth(d.getMonth() - i)
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-US', { month: 'short' }) })
    }
    const monthCounts = Object.fromEntries(months.map(m => [m.key, 0]))
    roster.forEach(r => r.absAsc.forEach(d => { const k = String(d).slice(0, 7); if (k in monthCounts) monthCounts[k]++ }))
    const monthly = months.map(m => ({ label: m.label, count: monthCounts[m.key] }))

    return { ncns90, callout90, tardy90, absence90, perfectCount, avgBrad, worst, pendingWarn, flaggedCount, mostMissedDay, locRanked, highestRiskLoc, monthly }
  }, [roster, thresholds, flagsSet])

  const COLS = [
    { key: 'name', label: 'Employee', value: r => r.full_name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'absence90', label: 'Absences 90d', align: 'right', value: r => r.absence90, sortKey: r => r.absence90 },
    { key: 'callout90', label: 'Callouts 90d', align: 'right', value: r => r.callout90, sortKey: r => r.callout90 },
    { key: 'tardy90', label: 'Tardies 90d', align: 'right', value: r => r.tardy90, sortKey: r => r.tardy90 },
    { key: 'ncns90', label: 'NCNS 90d', align: 'right', value: r => r.ncns90, sortKey: r => r.ncns90 },
    { key: 'bradford', label: 'Bradford', align: 'right', value: r => r.brad.score, sortKey: r => r.brad.score },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`,
    columns: COLS, rows: [...rows].sort((a, b) => b.brad.score - a.brad.score), accent,
    messaging: { nameKey: 'full_name', subjectKey: 'full_name' },
  })
  const maxMonth = Math.max(1, ...agg.monthly.map(m => m.count))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        <KTile label="Absence Days 90d" value={agg.absence90} sub="Callout + NCNS"
          color={agg.absence90 > 0 ? 'var(--t-warn)' : 'var(--t-success)'}
          onClick={() => openDrill('Employees With Absences (90d)', roster.filter(r => r.absence90 > 0), 'var(--t-warn)')} />
        <KTile label="NCNS 90d" value={agg.ncns90} sub="No call no show"
          color={agg.ncns90 > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={agg.ncns90 > 0 ? 'red' : null}
          onClick={() => openDrill('Employees With NCNS (90d)', roster.filter(r => r.ncns90 > 0), 'var(--t-danger)')} />
        <KTile label="Callouts 90d" value={agg.callout90} sub="Called out"
          color={agg.callout90 > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={agg.callout90 > 5 ? 'red' : null}
          onClick={() => openDrill('Employees With Callouts (90d)', roster.filter(r => r.callout90 > 0), 'var(--t-danger)')} />
        <KTile label="Tardies 90d" value={agg.tardy90} sub="Late arrivals"
          color={agg.tardy90 > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
          onClick={() => openDrill('Employees With Tardies (90d)', roster.filter(r => r.tardy90 > 0), 'var(--t-warn)')} />
        <KTile label="Perfect Attendance" value={agg.perfectCount} sub="Zero absences on record"
          color="var(--t-success)"
          onClick={() => openDrill('Perfect Attendance (Zero Absences)', roster.filter(r => r.perfect), 'var(--t-success)')} />
        <KTile label="Avg Bradford" value={agg.avgBrad} sub="52-week rolling"
          color={agg.avgBrad > thresholds.final_warn ? 'var(--t-danger)' : agg.avgBrad > thresholds.warn ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={agg.avgBrad > thresholds.warn ? 'amber' : null}
          onClick={() => openDrill('Bradford Score by Employee', roster, 'var(--t-accent)')} />
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        <KTile label="Worst Bradford" value={agg.worst.score} sub={agg.worst.name}
          color="var(--t-danger)" alert={agg.worst.score >= thresholds.final_warn ? 'red' : null}
          onClick={() => openDrill('Highest Bradford Scores', roster.filter(r => r.brad.score >= thresholds.warn), 'var(--t-danger)')} />
        <KTile label="Termination Risk" value={roster.filter(r => r.brad.score >= thresholds.final_warn).length}
          sub={`Bradford ≥ ${thresholds.final_warn}`}
          color="var(--t-danger)" alert={roster.some(r => r.brad.score >= thresholds.final_warn) ? 'red' : null}
          onClick={() => openDrill(`Termination Risk (Bradford ≥ ${thresholds.final_warn})`, roster.filter(r => r.brad.score >= thresholds.final_warn), 'var(--t-danger)')} />
        <KTile label="Most Missed Day" value={agg.mostMissedDay} sub="Absence day of week"
          color="var(--t-warn)" alert={agg.mostMissedDay !== '—' ? 'amber' : null}
          onClick={() => openDrill('Employees With Absences (90d)', roster.filter(r => r.absence90 > 0), 'var(--t-warn)')} />
        <KTile label="Highest Risk Loc" value={agg.highestRiskLoc?.loc || '—'}
          sub={`${agg.highestRiskLoc?.atRisk || 0} at-risk emps`}
          color="var(--t-danger)" alert={agg.highestRiskLoc?.atRisk ? 'red' : null}
          onClick={() => openDrill(agg.highestRiskLoc ? `At-Risk — ${agg.highestRiskLoc.loc}` : 'At-Risk Employees',
            roster.filter(r => r.location === agg.highestRiskLoc?.loc && r.brad.score >= thresholds.final_warn), 'var(--t-danger)')} />
        <KTile label="Pending Warnings" value={agg.pendingWarn} sub={`Bradford ${thresholds.warn}–${thresholds.final_warn}`}
          color="var(--t-warn)" alert={agg.pendingWarn > 0 ? 'amber' : null}
          onClick={() => openDrill(`Pending Warnings (Bradford ${thresholds.warn}–${thresholds.final_warn})`, roster.filter(r => r.brad.score >= thresholds.warn && r.brad.score < thresholds.final_warn), 'var(--t-warn)')} />
        <KTile label="Flagged Employees" value={agg.flaggedCount} sub="Manually flagged"
          color={agg.flaggedCount > 0 ? '#a78bfa' : 'var(--t-text)'}
          onClick={() => openDrill('Flagged Employees', roster.filter(r => flagsSet.has(r.person_id)), 'var(--t-accent)')} />
      </div>

      {/* Row 3 — 6-month absence trend */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
          Absence Trend — Last 6 Months (callouts + NCNS)
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 64 }}>
          {agg.monthly.map((m) => {
            const h = Math.max(4, (m.count / maxMonth) * 60)
            const col = m.count > maxMonth * 0.66 ? 'var(--t-danger)' : m.count > maxMonth * 0.33 ? 'var(--t-warn)' : 'var(--t-accent)'
            return (
              <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: col }}>{m.count}</div>
                <div style={{ width: '100%', height: h, background: col, minHeight: 4 }} />
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{m.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Row 4 — By-location */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', padding: '10px 14px', borderBottom: '1px solid var(--t-line)' }}>
          By-Location Summary
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Location', 'NCNS 90d', 'Avg Bradford', 'At-Risk Count'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agg.locRanked.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No locations in scope.</td></tr>
            )}
            {agg.locRanked.map(row => (
              <tr key={row.loc} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{row.loc}</td>
                <td style={{ padding: '8px 14px', color: row.ncns > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: row.ncns > 0 ? 700 : 400 }}>{row.ncns}</td>
                <td style={{ padding: '8px 14px', fontWeight: 700, color: row.avgBrad > thresholds.final_warn ? 'var(--t-danger)' : row.avgBrad > thresholds.warn ? 'var(--t-warn)' : 'var(--t-success)' }}>{row.avgBrad}</td>
                <td style={{ padding: '8px 14px' }}>
                  {row.atRisk > 0 ? <span className="badge red">{row.atRisk} at risk</span> : <span className="badge green">Clear</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — EMPLOYEE DEEP-DIVE
══════════════════════════════════════════════════════════════════════ */
function TabDeepDive({ roster, nowMs }) {
  const [selectedId, setSelectedId] = useState(roster[0]?.person_id || '')
  const [logPage, setLogPage] = useState(0)
  const PER_PAGE = 20

  useEffect(() => { if (!roster.some(r => r.person_id === selectedId)) setSelectedId(roster[0]?.person_id || '') }, [roster, selectedId])

  const emp = roster.find(r => r.person_id === selectedId) || roster[0]

  // 90-day calendar keyed on real incident dates (hooks run unconditionally)
  const byDate = useMemo(() => {
    const m = {}
    ;(emp?.incidents || []).forEach(i => { const p = { ncns: 3, callout: 2, tardy: 1 }[i.type] || 0; if (!m[i.date] || p > (m[i.date].p || 0)) m[i.date] = { type: i.type, p } })
    return m
  }, [emp])
  const calendar = useMemo(() => Array.from({ length: 90 }, (_, k) => {
    const iso = isoDaysAgo(nowMs, 89 - k)
    return { iso, dow: dowShort(iso), type: byDate[iso]?.type || null }
  }), [byDate, nowMs])

  // averages for comparison (real)
  const companyAvg = useMemo(() => {
    const n = roster.length || 1
    return {
      absence90: Math.round(roster.reduce((s, r) => s + r.absence90, 0) / n),
      callout90: Math.round(roster.reduce((s, r) => s + r.callout90, 0) / n),
      tardy90: Math.round(roster.reduce((s, r) => s + r.tardy90, 0) / n),
      ncns90: Math.round(roster.reduce((s, r) => s + r.ncns90, 0) / n),
    }
  }, [roster])
  const locAvg = useMemo(() => {
    const peers = roster.filter(r => r.location === emp?.location)
    const n = peers.length || 1
    return {
      absence90: Math.round(peers.reduce((s, r) => s + r.absence90, 0) / n),
      callout90: Math.round(peers.reduce((s, r) => s + r.callout90, 0) / n),
      tardy90: Math.round(peers.reduce((s, r) => s + r.tardy90, 0) / n),
      ncns90: Math.round(peers.reduce((s, r) => s + r.ncns90, 0) / n),
    }
  }, [roster, emp?.location])

  // All hooks above run unconditionally; safe to bail out now.
  if (!emp) return <StatePanel icon="📭" title="No employees in scope" msg="No roster is available for your selected locations." />

  const brad = emp.brad
  const bradColor = brad.score > 500 ? 'var(--t-danger)' : brad.score > 200 ? 'var(--t-warn)' : 'var(--t-success)'
  const bradAlert = brad.score > 500 ? 'red' : brad.score > 200 ? 'amber' : null

  const comparisons = [
    { label: 'Absence Days', emp: emp.absence90, loc: locAvg.absence90, co: companyAvg.absence90 },
    { label: 'Callout Days', emp: emp.callout90, loc: locAvg.callout90, co: companyAvg.callout90 },
    { label: 'Tardy Days', emp: emp.tardy90, loc: locAvg.tardy90, co: companyAvg.tardy90 },
    { label: 'NCNS Count', emp: emp.ncns90, loc: locAvg.ncns90, co: companyAvg.ncns90 },
  ]

  const totalPages = Math.max(1, Math.ceil(emp.incidents.length / PER_PAGE))
  const pageRows = emp.incidents.slice(logPage * PER_PAGE, (logPage + 1) * PER_PAGE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Employee</div>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setLogPage(0) }} style={{ ...selStyle, minWidth: 260 }}>
          {roster.map(r => <option key={r.person_id} value={r.person_id}>{r.full_name} — {r.location} ({r.role})</option>)}
        </select>
        <span className="badge blue">{emp.location}</span>
        <span className="badge purple">{emp.role}</span>
      </div>

      {/* 90-day calendar */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
          90-Day Incident Calendar — {emp.full_name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, 1fr)', gap: 3 }}>
          {calendar.map((row, i) => (
            <div key={i} title={`${row.iso} (${row.dow})${row.type ? ' — ' + (row.type === 'ncns' ? 'NCNS' : row.type) : ' — no incident'}`}
              style={{ background: row.type ? TYPE_COLORS[row.type] : TYPE_COLORS.none, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700,
                color: row.type ? '#fff' : 'var(--t-text-faint)' }}>
              {i + 1}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          {[['tardy', 'Tardy'], ['callout', 'Callout'], ['ncns', 'NCNS'], ['none', 'No incident']].map(([k, lbl]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, background: TYPE_COLORS[k] }} />
              <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pattern + Incident Summary + Bradford */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Pattern Analysis</div>
          {[
            { label: 'Most missed day', val: emp.mostMissedDow },
            { label: 'Longest absence run', val: emp.maxRun > 0 ? `${emp.maxRun} day${emp.maxRun === 1 ? '' : 's'}` : '—' },
            { label: 'Days since last absence', val: emp.daysSinceAbs == null ? 'No absences' : `${emp.daysSinceAbs}d` },
            { label: 'Trend', val: emp.trend, color: emp.trend === 'improving' ? 'var(--t-success)' : emp.trend === 'declining' ? 'var(--t-danger)' : 'var(--t-text-muted)' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.color || 'var(--t-text)', textTransform: 'capitalize' }}>{row.val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Incident Summary (90d)</div>
          {[
            { label: 'Tardies', val: emp.tardy90, color: 'var(--t-warn)' },
            { label: 'Callouts', val: emp.callout90, color: 'var(--t-danger)' },
            { label: 'NCNS', val: emp.ncns90, color: '#fca5a5' },
            { label: 'Active points', val: emp.activePts, color: 'var(--t-text)' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--t-surface)', border: `1px solid ${bradAlert === 'red' ? 'var(--t-danger)' : bradAlert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
          {bradAlert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: bradAlert === 'red' ? 'var(--t-danger)' : 'var(--t-warn)' }} />}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Bradford Factor</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: bradColor, marginBottom: 2 }}>{brad.score}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 10 }}>S={brad.spells} · D={brad.days}</div>
          {[
            { label: 'Absence Episodes (S)', val: brad.spells },
            { label: 'Total Absence Days (D)', val: brad.days },
            { label: 'Score (S²×D)', val: brad.score },
            { label: 'Status', val: brad.score > 500 ? 'TERMINATION RISK' : brad.score > 200 ? 'WRITTEN WARNING' : 'MONITOR', color: bradColor },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{row.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: row.color || 'var(--t-text)' }}>{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Comparison: {emp.full_name} vs {emp.location} Avg vs Company Avg (90d)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Metric', 'This Employee', `${emp.location} Avg`, 'Company Avg'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisons.map(row => {
              const worse = row.emp > row.co
              return (
                <tr key={row.label} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{row.label}</td>
                  <td style={{ padding: '9px 14px', fontWeight: 800, color: worse ? 'var(--t-danger)' : 'var(--t-success)' }}>{row.emp}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text)' }}>{row.loc}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)' }}>{row.co}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Incident log */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Incident Log ({emp.incidents.length}) — Page {logPage + 1}/{totalPages}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: logPage === 0 ? 'default' : 'pointer', opacity: logPage === 0 ? .4 : 1 }}>← Prev</button>
            <button disabled={logPage >= totalPages - 1} onClick={() => setLogPage(p => p + 1)}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: logPage >= totalPages - 1 ? 'default' : 'pointer', opacity: logPage >= totalPages - 1 ? .4 : 1 }}>Next →</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Date', 'Day', 'Type', 'Points', 'Expires', 'Status', 'Running Total', 'Recorded By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontWeight: 700, fontSize: 9, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((inc, i) => (
                <tr key={inc.id || i} style={{ borderBottom: '1px solid var(--t-line)', opacity: inc.expired ? .5 : 1 }}>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{inc.date}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--t-text-faint)' }}>{dowShort(inc.date)}</td>
                  <td style={{ padding: '7px 12px' }}><IncidentBadge type={inc.type} /></td>
                  <td style={{ padding: '7px 12px', fontWeight: 800, color: inc.expired ? 'var(--t-text-faint)' : inc.type === 'ncns' ? '#fca5a5' : inc.type === 'callout' ? 'var(--t-danger)' : 'var(--t-warn)' }}>{inc.expired ? '—' : `+${inc.pts}`}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: 'var(--t-text-faint)' }}>{inc.expiry || '—'}</td>
                  <td style={{ padding: '7px 12px' }}>{inc.expired ? <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>EXPIRED</span> : <span style={{ fontSize: 9, color: 'var(--t-success)' }}>ACTIVE</span>}</td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{inc.runningTotal}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--t-accent)', fontWeight: 600 }}>{inc.recorded_by || 'System'}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No attendance incidents on record for {emp.full_name}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — PATTERN ANALYSIS
══════════════════════════════════════════════════════════════════════ */
function TabPatternAnalysis({ roster, thresholds }) {
  const dowData = useMemo(() => {
    const counts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 }
    roster.forEach(r => r.absAsc.forEach(d => { const k = dowShort(d); if (k in counts) counts[k]++ }))
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ day, count: counts[day] }))
  }, [roster])
  const maxDow = Math.max(1, ...dowData.map(d => d.count))
  const hotDay = [...dowData].sort((a, b) => b.count - a.count)[0]

  const monthData = useMemo(() => {
    const counts = {}
    roster.forEach(r => r.absAsc.forEach(d => { const k = String(d).slice(0, 7); counts[k] = (counts[k] || 0) + 1 }))
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([k, count]) => ({ month: parseISO(k + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), count }))
  }, [roster])
  const maxMonth = Math.max(1, ...monthData.map(m => m.count))

  const locComp = useMemo(() => {
    const byLoc = {}
    roster.forEach(r => {
      const L = byLoc[r.location] || (byLoc[r.location] = { brad: [], ncns: 0, atRisk: 0 })
      L.brad.push(r.brad.score); L.ncns += r.ncns90; if (r.brad.score >= thresholds.final_warn) L.atRisk++
    })
    return Object.entries(byLoc).map(([loc, v]) => {
      const avgBrad = v.brad.length ? Math.round(v.brad.reduce((s, x) => s + x, 0) / v.brad.length) : 0
      return { loc, ncnsSum: v.ncns, avgBrad, atRisk: v.atRisk, status: v.atRisk > 0 ? 'red' : avgBrad > thresholds.warn ? 'amber' : 'green' }
    }).sort((a, b) => b.avgBrad - a.avgBrad)
  }, [roster, thresholds])

  const repeatOffenders = useMemo(() =>
    roster.filter(r => r.brad.score >= thresholds.final_warn).sort((a, b) => b.brad.score - a.brad.score), [roster, thresholds])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
            Absences by Day of Week — Company-wide
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
            {dowData.map(({ day, count }) => {
              const h = Math.max(6, (count / maxDow) * 70)
              const isHot = hotDay && count > 0 && day === hotDay.day
              const col = isHot ? 'var(--t-danger)' : 'var(--t-accent)'
              return (
                <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: col }}>{count}</div>
                  <div style={{ width: '100%', height: h, background: col, border: isHot ? '2px solid var(--t-danger)' : 'none' }} />
                  <div style={{ fontSize: 9, color: isHot ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: isHot ? 800 : 400 }}>{day}</div>
                </div>
              )
            })}
          </div>
          {hotDay && hotDay.count > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-text-muted)', background: 'rgba(239,68,68,.08)', padding: '6px 10px', borderLeft: '3px solid var(--t-danger)' }}>
              <strong style={{ color: 'var(--t-danger)' }}>{hotDay.day}</strong> is the highest-absence day ({hotDay.count})
            </div>
          )}
        </div>

        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
            Absences by Month
          </div>
          {monthData.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '20px 0', textAlign: 'center' }}>No absence history on record.</div>
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
              {monthData.map(({ month, count }) => {
                const h = Math.max(4, (count / maxMonth) * 70)
                const col = count > maxMonth * 0.66 ? 'var(--t-danger)' : count > maxMonth * 0.33 ? 'var(--t-warn)' : 'var(--t-accent)'
                return (
                  <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: col }}>{count}</div>
                    <div style={{ width: '100%', height: h, background: col }} />
                    <div style={{ fontSize: 8, color: 'var(--t-text-muted)' }}>{month}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* By-location */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>By-Location Comparison</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Location', 'NCNS 90d', 'Avg Bradford', 'At-Risk Emps', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locComp.length === 0 && <tr><td colSpan={5} style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No locations in scope.</td></tr>}
            {locComp.map(row => (
              <tr key={row.loc} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{row.loc}</td>
                <td style={{ padding: '9px 14px', fontWeight: row.ncnsSum > 0 ? 700 : 400, color: row.ncnsSum > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{row.ncnsSum}</td>
                <td style={{ padding: '9px 14px', fontWeight: 700, color: row.avgBrad > thresholds.final_warn ? 'var(--t-danger)' : row.avgBrad > thresholds.warn ? 'var(--t-warn)' : 'var(--t-success)' }}>{row.avgBrad}</td>
                <td style={{ padding: '9px 14px', fontWeight: row.atRisk > 0 ? 700 : 400, color: row.atRisk > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{row.atRisk}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span className={`badge ${row.status}`}>{row.status === 'green' ? 'CLEAR' : row.status === 'amber' ? 'MONITOR' : 'AT RISK'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Repeat offenders */}
      {repeatOffenders.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid var(--t-danger)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-danger)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
            Repeat Offenders — Bradford ≥ {thresholds.final_warn} (Termination Risk)
          </div>
          {repeatOffenders.map(r => (
            <div key={r.person_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--t-surface)', border: '1px solid var(--t-danger)', padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: 'var(--t-text)', fontSize: 13 }}>{r.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{r.location} · {r.role}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>Bradford</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-danger)' }}>{r.brad.score}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 40 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>NCNS 90d</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-danger)' }}>{r.ncns90}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — BRADFORD FACTOR REPORT (thresholds + flags persist to backend)
══════════════════════════════════════════════════════════════════════ */
function TabBradfordReport({ roster, thresholds, flagsSet, onSaveThresholds, onToggleFlag }) {
  const [threshEdit, setThreshEdit] = useState({ warn: String(thresholds.warn), finalWarn: String(thresholds.final_warn), termRisk: String(thresholds.term_risk) })
  const [savedMsg, setSavedMsg] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setThreshEdit({ warn: String(thresholds.warn), finalWarn: String(thresholds.final_warn), termRisk: String(thresholds.term_risk) }) }, [thresholds])

  async function saveThresholds() {
    setSaving(true)
    const ok = await onSaveThresholds(parseInt(threshEdit.warn) || 200, parseInt(threshEdit.finalWarn) || 500, parseInt(threshEdit.termRisk) || 900)
    setSaving(false)
    setSavedMsg(ok ? 'Saved!' : 'Save failed')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const bradData = useMemo(() => [...roster].map(r => {
    const status = r.trend === 'improving' ? 'improving' : r.trend === 'declining' ? 'worsening' : 'stable'
    return { r, brad: r.brad, trend: status }
  }).sort((a, b) => b.brad.score - a.brad.score), [roster])

  const summary = useMemo(() => {
    const scores = bradData.map(r => r.brad.score)
    const n = scores.length || 1
    return {
      avg: Math.round(scores.reduce((s, x) => s + x, 0) / n),
      aboveFinal: scores.filter(x => x > thresholds.final_warn).length,
      aboveWarn: scores.filter(x => x > thresholds.warn).length,
      totalDays: bradData.reduce((s, r) => s + r.brad.days, 0),
      mostImproved: bradData.filter(r => r.trend === 'improving').sort((a, b) => a.brad.score - b.brad.score)[0]?.r.full_name || '—',
      mostConcerning: bradData[0]?.r.full_name || '—',
    }
  }, [bradData, thresholds])

  const [drill, setDrill] = useState(null)
  const COLS = [
    { key: 'name', label: 'Employee', value: r => r.r.full_name },
    { key: 'location', label: 'Location', value: r => r.r.location },
    { key: 'role', label: 'Role', value: r => r.r.role },
    { key: 'spells', label: 'S', align: 'right', value: r => r.brad.spells, sortKey: r => r.brad.spells },
    { key: 'days', label: 'D', align: 'right', value: r => r.brad.days, sortKey: r => r.brad.days },
    { key: 'score', label: 'Bradford', align: 'right', value: r => r.brad.score, sortKey: r => r.brad.score },
    { key: 'trend', label: 'Trend', value: r => r.trend },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: COLS, rows, accent })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'rgba(0,229,255,.06)', border: '1px solid var(--t-accent)', padding: '14px 18px' }}>
        <div style={{ fontWeight: 800, color: 'var(--t-accent)', marginBottom: 6, fontSize: 13 }}>Bradford Factor = S² × D</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--t-text)' }}>S</strong> = absence spells · <strong style={{ color: 'var(--t-text)' }}>D</strong> = total days absent (52-week rolling, from real callout/NCNS incidents).&nbsp;
          &gt;{thresholds.term_risk} = <span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>termination risk</span> ·&nbsp;
          {thresholds.final_warn}–{thresholds.term_risk} = <span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>written warning</span> ·&nbsp;
          &lt;{thresholds.warn} = <span style={{ color: 'var(--t-success)', fontWeight: 700 }}>monitor</span>.
        </div>
      </div>

      {/* Thresholds (persisted) */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>Threshold Settings</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[{ label: 'Warning Threshold', key: 'warn' }, { label: 'Final Warning', key: 'finalWarn' }, { label: 'Termination Risk', key: 'termRisk' }].map(({ label, key }) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>{label}</div>
              <input type="number" value={threshEdit[key]} onChange={e => setThreshEdit(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ ...selStyle, width: 80, fontFamily: 'monospace', fontWeight: 700 }} />
            </div>
          ))}
          <button onClick={saveThresholds} disabled={saving}
            style={{ padding: '6px 16px', background: 'var(--t-accent)', color: 'var(--t-bg)', border: 'none', fontWeight: 800, fontSize: 12, cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
            {savedMsg || (saving ? 'Saving…' : 'Save Thresholds')}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        <KTile label="Avg Bradford" value={summary.avg} sub="Company avg"
          color={summary.avg > thresholds.final_warn ? 'var(--t-danger)' : summary.avg > thresholds.warn ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={summary.avg > thresholds.warn ? 'amber' : null}
          onClick={() => openDrill('All Employees — Bradford Scores', bradData, 'var(--t-accent)')} />
        <KTile label={`Score >${thresholds.final_warn}`} value={summary.aboveFinal} sub="Termination risk"
          color="var(--t-danger)" alert={summary.aboveFinal > 0 ? 'red' : null}
          onClick={() => openDrill(`Bradford > ${thresholds.final_warn}`, bradData.filter(r => r.brad.score > thresholds.final_warn), 'var(--t-danger)')} />
        <KTile label={`Score >${thresholds.warn}`} value={summary.aboveWarn} sub="Needs action"
          color="var(--t-warn)" alert={summary.aboveWarn > 0 ? 'amber' : null}
          onClick={() => openDrill(`Bradford > ${thresholds.warn}`, bradData.filter(r => r.brad.score > thresholds.warn), 'var(--t-warn)')} />
        <KTile label="Total Absence Days" value={summary.totalDays} sub="All employees, 52w" color="var(--t-text)"
          onClick={() => openDrill('Employees With Absence Days', bradData.filter(r => r.brad.days > 0), 'var(--t-accent)')} />
        <KTile label="Most Improved" value="↓" sub={summary.mostImproved} color="var(--t-success)"
          onClick={() => openDrill('Improving Employees', bradData.filter(r => r.trend === 'improving'), 'var(--t-success)')} />
        <KTile label="Most Concerning" value="↑" sub={summary.mostConcerning} color="var(--t-danger)" alert="red"
          onClick={() => openDrill('Worsening Employees', bradData.filter(r => r.trend === 'worsening'), 'var(--t-danger)')} />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          All Employees — Sorted by Bradford Score Descending
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Rank', 'Employee', 'Location', 'Role', 'S', 'D', 'Bradford', 'Trend', 'Action', 'Flag'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bradData.length === 0 && <tr><td colSpan={10} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No employees in scope.</td></tr>}
              {bradData.map(({ r, brad, trend }, i) => {
                const borderCol = brad.score > thresholds.final_warn ? 'var(--t-danger)' : brad.score > thresholds.warn ? 'var(--t-warn)' : 'var(--t-success)'
                const isFlagged = flagsSet.has(r.person_id)
                const action = brad.score > thresholds.term_risk ? 'Termination Review' : brad.score > thresholds.final_warn ? 'Final Warning' : brad.score > thresholds.warn ? 'Written Warning' : 'Monitor'
                const actionBadge = brad.score > thresholds.final_warn ? 'badge red' : brad.score > thresholds.warn ? 'badge amber' : 'badge green'
                return (
                  <tr key={r.person_id} style={{ borderBottom: '1px solid var(--t-line)', borderLeft: `4px solid ${borderCol}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: borderCol }}>{i + 1}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>
                      {r.full_name}{isFlagged && <span className="badge purple" style={{ marginLeft: 6, fontSize: 9 }}>FLAGGED</span>}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{r.location}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-faint)' }}>{r.role}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: 'var(--t-text)' }}>{brad.spells}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: 'var(--t-text)' }}>{brad.days}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: borderCol }}>{brad.score}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {trend === 'improving' ? <span style={{ color: 'var(--t-success)', fontSize: 13 }}>↓ improving</span>
                        : trend === 'worsening' ? <span style={{ color: 'var(--t-danger)', fontSize: 13 }}>↑ worsening</span>
                          : <span style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>→ stable</span>}
                    </td>
                    <td style={{ padding: '9px 12px' }}><span className={actionBadge} style={{ fontSize: 10 }}>{action}</span></td>
                    <td style={{ padding: '9px 12px' }}>
                      <button onClick={() => onToggleFlag(r.person_id, r.node_id)}
                        style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          background: isFlagged ? 'rgba(124,58,237,.2)' : 'transparent',
                          border: `1px solid ${isFlagged ? '#7c3aed' : 'var(--t-line)'}`,
                          color: isFlagged ? '#a78bfa' : 'var(--t-text-muted)' }}>
                        {isFlagged ? '★ Flagged' : 'Flag'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Derive AI-warning candidates from real incidents
══════════════════════════════════════════════════════════════════════ */
function buildWarnings(roster, nowMs, thresholds) {
  const out = []
  const within = (iso, days) => { const t = parseISO(iso).getTime(); return t <= nowMs && (nowMs - t) <= days * MS_DAY }
  roster.forEach(r => {
    const tardies14 = r.incidents.filter(i => i.type === 'tardy' && within(i.date, 14)).map(i => i.date).sort().reverse()
    if (tardies14.length >= 3) {
      out.push({ key: `${r.person_id}|LATE_ARRIVAL|${tardies14[0]}`, r, type: 'LATE_ARRIVAL', dates: tardies14,
        rationale: `${tardies14.length} tardies in 14 days`,
        text: `This is your ${tardies14.length}th late-arrival notice in the past 14 days (${tardies14.map(fmtShort).join(', ')}). Per Twisted Growers attendance policy, further late arrivals may result in formal disciplinary action. Please arrive on or before your scheduled shift start time.` })
    }
    const ncns14 = r.incidents.filter(i => i.type === 'ncns' && within(i.date, 14)).map(i => i.date).sort().reverse()
    if (ncns14.length > 0) {
      out.push({ key: `${r.person_id}|NO_SHOW|${ncns14[0]}`, r, type: 'NO_SHOW', dates: [ncns14[0]],
        rationale: `NCNS on ${fmtShort(ncns14[0])}`,
        text: `You were recorded as a No Call No Show on ${fmtShort(ncns14[0])}. Failure to report an absence in advance is a serious attendance violation and is being placed in your personnel file. Please contact your manager immediately.` })
    }
    const callouts30 = r.incidents.filter(i => i.type === 'callout' && within(i.date, 30)).map(i => i.date).sort().reverse()
    if (callouts30.length >= 3) {
      out.push({ key: `${r.person_id}|CALLOUT_PATTERN|${callouts30[0]}`, r, type: 'CALLOUT_PATTERN', dates: callouts30,
        rationale: `${callouts30.length} callouts in 30 days`,
        text: `Our attendance system detected ${callouts30.length} callouts in the past 30 days (${callouts30.map(fmtShort).join(', ')}). This exceeds the company threshold of 3 callouts per 30-day period. Please review the attendance policy and meet with your manager.` })
    }
    if (r.brad.score >= thresholds.final_warn) {
      out.push({ key: `${r.person_id}|ATT_THRESHOLD|${r.lastAbs || 'x'}`, r, type: 'ATT_THRESHOLD', dates: r.lastAbs ? [r.lastAbs] : [],
        rationale: `Bradford ${r.brad.score} ≥ ${thresholds.final_warn}`,
        text: `Your Bradford Factor is ${r.brad.score}, at or above the final-warning threshold of ${thresholds.final_warn} (${r.brad.spells} absence spells over ${r.brad.days} days). This triggers a formal attendance review under the Twisted Growers performance-management process.` })
    }
  })
  return out
}
const WARNING_TYPES = {
  LATE_ARRIVAL: { label: 'LATE ARRIVAL WARNING', severity: 'amber' },
  NO_SHOW: { label: 'NO CALL NO SHOW', severity: 'red' },
  CALLOUT_PATTERN: { label: 'CALLOUT PATTERN WARNING', severity: 'amber' },
  ATT_THRESHOLD: { label: 'BRADFORD THRESHOLD', severity: 'red' },
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — AI WARNINGS (decisions persist; approve creates a real DA record)
══════════════════════════════════════════════════════════════════════ */
function TabAIWarnings({ roster, nowMs, thresholds, warningActions, onDecide }) {
  const allWarnings = useMemo(() => buildWarnings(roster, nowMs, thresholds), [roster, nowMs, thresholds])
  const [editState, setEditState] = useState({})
  const [locFilter, setLocFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('Pending')

  const statusOf = (w) => warningActions[w.key]?.status || 'pending'
  const messageOf = (w) => warningActions[w.key]?.message || w.text

  const locations = useMemo(() => [...new Set(roster.map(r => r.location).filter(Boolean))].sort(), [roster])

  const pendingCount = allWarnings.filter(w => statusOf(w) === 'pending').length
  const approvedCount = allWarnings.filter(w => statusOf(w) === 'approved').length
  const ignoredCount = allWarnings.filter(w => statusOf(w) === 'ignored').length

  const [drill, setDrill] = useState(null)
  const COLS = [
    { key: 'empName', label: 'Employee', value: w => w.r.full_name },
    { key: 'empLoc', label: 'Location', value: w => w.r.location },
    { key: 'type', label: 'Type', value: w => (w.type || '').replace(/_/g, ' ') },
    { key: 'rationale', label: 'Basis', value: w => w.rationale },
    { key: 'status', label: 'Status', value: w => statusOf(w).toUpperCase() },
    { key: 'text', label: 'Message', value: w => messageOf(w) },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} warning${rows.length === 1 ? '' : 's'}`, columns: COLS, rows, accent })

  const filtered = allWarnings.filter(w => {
    if (locFilter !== 'All' && w.r.location !== locFilter) return false
    const typeMap = { 'Late Arrival': 'LATE_ARRIVAL', 'No Show': 'NO_SHOW', 'Callout Pattern': 'CALLOUT_PATTERN', 'Threshold': 'ATT_THRESHOLD' }
    if (typeFilter !== 'All' && w.type !== typeMap[typeFilter]) return false
    const st = statusOf(w)
    if (statusFilter === 'Pending' && st !== 'pending') return false
    if (statusFilter === 'Approved' && st !== 'approved') return false
    if (statusFilter === 'Ignored' && st !== 'ignored') return false
    return true
  })

  const badgeClass = (s) => s === 'red' ? 'badge red' : s === 'amber' ? 'badge amber' : 'badge green'
  const borderColor = (s) => s === 'red' ? 'var(--t-danger)' : s === 'amber' ? 'var(--t-warn)' : 'var(--t-success)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <KTile label="Pending Warnings" value={pendingCount} sub="Awaiting manager action"
          color={pendingCount > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={pendingCount > 3 ? 'amber' : null}
          onClick={() => openDrill('Pending Warnings', allWarnings.filter(w => statusOf(w) === 'pending'), 'var(--t-warn)')} />
        <KTile label="Approved / Sent" value={approvedCount} sub="Disciplinary record created"
          color="var(--t-accent)" onClick={() => openDrill('Approved Warnings', allWarnings.filter(w => statusOf(w) === 'approved'), 'var(--t-accent)')} />
        <KTile label="Ignored" value={ignoredCount} sub="Dismissed by manager"
          color="var(--t-text-muted)" onClick={() => openDrill('Ignored Warnings', allWarnings.filter(w => statusOf(w) === 'ignored'), 'var(--t-text-muted)')} />
        <KTile label="Candidates Total" value={allWarnings.length} sub="Derived from real incidents"
          color="var(--t-text)" onClick={() => openDrill('All Warning Candidates', allWarnings, 'var(--t-accent)')} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Location</span>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={selStyle}>
          {['All', ...locations].map(l => <option key={l}>{l}</option>)}
        </select>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 8 }}>Type</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle}>
          {['All', 'Late Arrival', 'No Show', 'Callout Pattern', 'Threshold'].map(t => <option key={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 8 }}>Status</span>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
          {['Pending', 'Approved', 'Ignored', 'All'].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{filtered.length} warning{filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '28px 20px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          {allWarnings.length === 0 ? 'No policy thresholds are currently breached — no warnings to review.' : 'No warnings match the current filters.'}
        </div>
      )}

      {filtered.map(w => {
        const wType = WARNING_TYPES[w.type]
        const st = statusOf(w)
        const ed = editState[w.key] || { active: false, text: messageOf(w) }
        const isApproved = st === 'approved', isIgnored = st === 'ignored'
        const leftC = isApproved ? 'var(--t-success)' : isIgnored ? 'var(--t-text-faint)' : borderColor(wType.severity)
        const decidedBy = warningActions[w.key]?.decided_by
        return (
          <div key={w.key} style={{ background: 'var(--t-surface)', border: `1px solid ${leftC}`, borderLeft: `4px solid ${leftC}`, opacity: isIgnored ? 0.55 : 1, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isApproved ? 'rgba(34,197,94,.15)' : isIgnored ? 'var(--t-surface-2)' : wType.severity === 'red' ? 'rgba(239,68,68,.15)' : 'rgba(234,179,8,.15)', fontSize: 16, flexShrink: 0 }}>
                {isApproved ? '✓' : isIgnored ? '—' : '!'}
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)' }}>{wType.label}</span>
                  {isApproved ? <span className="badge green" style={{ fontSize: 9 }}>SENT · DA CREATED</span>
                    : isIgnored ? <span className="badge blue" style={{ fontSize: 9 }}>DISMISSED</span>
                      : <span className={badgeClass(wType.severity)} style={{ fontSize: 9 }}>{wType.severity.toUpperCase()}</span>}
                  <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 4 }}>Basis: <strong style={{ color: 'var(--t-text-muted)' }}>{w.rationale}</strong></span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 600, marginBottom: 4 }}>
                  Employee: {w.r.full_name}<span style={{ color: 'var(--t-text-muted)', fontWeight: 400 }}> · {w.r.location} · {w.r.role}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10 }}>
                  Derived from real attendance incidents{w.dates.length ? ` (${w.dates.map(fmtShort).join(', ')})` : ''}
                </div>
                {ed.active ? (
                  <textarea value={ed.text} onChange={e => setEditState(p => ({ ...p, [w.key]: { active: true, text: e.target.value } }))} rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--t-surface-2)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 12, lineHeight: 1.6, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', borderRadius: 0 }} />
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '8px 10px', fontStyle: 'italic' }}>"{messageOf(w)}"</div>
                )}
              </div>
              {!isApproved && !isIgnored && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160, flexShrink: 0 }}>
                  {ed.active ? (
                    <>
                      <button onClick={() => { onDecide(w, 'approved', ed.text); setEditState(p => ({ ...p, [w.key]: { active: false, text: ed.text } })) }}
                        style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer', background: 'rgba(34,197,94,.15)', border: '1px solid var(--t-success)', color: 'var(--t-success)' }}>Send Edited Warning ✓</button>
                      <button onClick={() => setEditState(p => ({ ...p, [w.key]: { active: false, text: messageOf(w) } }))}
                        style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onDecide(w, 'approved', messageOf(w))}
                        style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer', background: 'rgba(34,197,94,.15)', border: '1px solid var(--t-success)', color: 'var(--t-success)' }}>Approve ✓</button>
                      <button onClick={() => setEditState(p => ({ ...p, [w.key]: { active: true, text: messageOf(w) } }))}
                        style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(0,229,255,.1)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)' }}>Edit ✎</button>
                      <button onClick={() => onDecide(w, 'ignored', null)}
                        style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)' }}>Ignore ✗</button>
                    </>
                  )}
                </div>
              )}
              {(isApproved || isIgnored) && (
                <div style={{ alignSelf: 'flex-start', minWidth: 120, textAlign: 'right' }}>
                  {isApproved && <span className="badge green" style={{ fontSize: 10 }}>SENT TO EMPLOYEE</span>}
                  {isIgnored && <button onClick={() => onDecide(w, 'pending', null)} style={{ fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', padding: '3px 8px' }}>Restore</button>}
                </div>
              )}
            </div>
          </div>
        )
      })}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — ALERTS & ACTIONS (derived from real incidents; dismiss persists)
══════════════════════════════════════════════════════════════════════ */
function TabAlerts({ roster, thresholds, dismissedSet, onDismiss, onIssueWarning }) {
  const [alertFilter, setAlertFilter] = useState('All')
  const [issuing, setIssuing] = useState(null)

  const alerts = useMemo(() => {
    const list = []
    roster.forEach(r => {
      if (r.brad.score >= thresholds.warn && r.brad.score < thresholds.final_warn) {
        list.push({ key: `warn|${r.person_id}`, r, type: 'At Warning Threshold', severity: 'medium',
          desc: `Bradford ${r.brad.score} has crossed the warning threshold of ${thresholds.warn} (${r.brad.spells} spells over ${r.brad.days} days).` })
      }
      if (r.brad.score >= thresholds.final_warn) {
        list.push({ key: `term|${r.person_id}`, r, type: 'Approaching Termination', severity: 'critical',
          desc: `Bradford ${r.brad.score} is at or above the final-warning threshold of ${thresholds.final_warn}. Immediate management review recommended.` })
      }
      if (r.maxRun >= 3) {
        list.push({ key: `consec|${r.person_id}`, r, type: 'Consecutive Absences', severity: 'high',
          desc: `${r.full_name} has a run of ${r.maxRun} consecutive absence days on record — a serious pattern requiring intervention.` })
      }
      if (r.perfect) {
        list.push({ key: `perfect|${r.person_id}`, r, type: 'Perfect Attendance', severity: 'positive',
          desc: `${r.full_name} has zero callouts and zero NCNS on record. Outstanding attendance.` })
      }
    })
    return list
  }, [roster, thresholds])

  const FILTER_MAP = { All: null, Critical: 'critical', High: 'high', Medium: 'medium', Positive: 'positive' }
  const filtered = alerts.filter(a => {
    if (dismissedSet.has(a.key)) return false
    const f = FILTER_MAP[alertFilter]
    return !f || a.severity === f
  })

  const badgeCls = s => (s === 'critical' || s === 'high') ? 'badge red' : s === 'medium' ? 'badge amber' : s === 'positive' ? 'badge green' : 'badge blue'
  const borderCol = s => (s === 'critical' || s === 'high') ? 'var(--t-danger)' : s === 'medium' ? 'var(--t-warn)' : s === 'positive' ? 'var(--t-success)' : 'var(--t-accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>Filter:</span>
        {['All', 'Critical', 'High', 'Medium', 'Positive'].map(f => (
          <button key={f} onClick={() => setAlertFilter(f)}
            style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0,
              background: alertFilter === f ? 'var(--t-accent)' : 'var(--t-surface-2)', color: alertFilter === f ? 'var(--t-bg)' : 'var(--t-text-muted)',
              border: `1px solid ${alertFilter === f ? 'var(--t-accent)' : 'var(--t-line)'}` }}>{f}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 8 }}>{filtered.length} active alerts</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ color: 'var(--t-text-muted)', fontSize: 13, padding: 24, textAlign: 'center', background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          No alerts matching current filter.
        </div>
      )}

      {filtered.map(alert => {
        const canWarn = alert.severity !== 'positive'
        return (
          <div key={alert.key} style={{ background: 'var(--t-surface)', border: `1px solid ${borderCol(alert.severity)}`, borderLeft: `4px solid ${borderCol(alert.severity)}`, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className={badgeCls(alert.severity)} style={{ fontSize: 10, textTransform: 'uppercase' }}>{alert.severity}</span>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)' }}>{alert.type}</span>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: 12, marginBottom: 4 }}>
                  {alert.r.full_name} — <span style={{ color: 'var(--t-text-muted)', fontWeight: 400 }}>{alert.r.location}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>{alert.desc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                {canWarn && (
                  <button disabled={issuing === alert.key}
                    onClick={async () => { setIssuing(alert.key); const ok = await onIssueWarning(alert.r, alert.type, alert.desc); setIssuing(null); if (ok) onDismiss(alert.key, alert.r.node_id) }}
                    style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,.15)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', borderRadius: 0, opacity: issuing === alert.key ? .6 : 1 }}>
                    {issuing === alert.key ? 'Issuing…' : 'Issue Written Warning'}
                  </button>
                )}
                <button onClick={() => onDismiss(alert.key, alert.r.node_id)}
                  style={{ padding: '4px 12px', fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', borderRadius: 0 }}>
                  Dismiss Alert
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — ABSENCE HEATMAP (52 weeks from real incident dates)
══════════════════════════════════════════════════════════════════════ */
function TabHeatmap({ roster, nowMs }) {
  const flagEnabled = useFeatureFlag('absence_heatmap')
  const [selectedId, setSelectedId] = useState(roster[0]?.person_id || '')
  useEffect(() => { if (!roster.some(r => r.person_id === selectedId)) setSelectedId(roster[0]?.person_id || '') }, [roster, selectedId])
  const emp = roster.find(r => r.person_id === selectedId) || roster[0]

  const byDate = useMemo(() => {
    const m = {}
    if (emp) emp.incidents.forEach(i => { const p = { ncns: 3, callout: 2, tardy: 1 }[i.type] || 0; if (!m[i.date] || p > (m[i.date].p || 0)) m[i.date] = { type: i.type, p } })
    return m
  }, [emp])

  const grid = useMemo(() => {
    const t = new Date(nowMs)
    const startSunday = new Date(t); startSunday.setDate(t.getDate() - t.getDay() - 52 * 7)
    const weeks = []
    for (let w = 0; w < 53; w++) {
      const days = []
      for (let d = 0; d < 7; d++) {
        const cell = new Date(startSunday); cell.setDate(startSunday.getDate() + w * 7 + d)
        const iso = cell.toISOString().slice(0, 10)
        const isFuture = cell.getTime() > nowMs
        days.push({ date: iso, type: isFuture ? null : (byDate[iso]?.type || null), isFuture })
      }
      weeks.push(days)
    }
    return weeks
  }, [byDate, nowMs])

  const insights = useMemo(() => {
    const dowCounts = [0, 0, 0, 0, 0, 0, 0]
    grid.flat().forEach((c, idx) => { if (!c.isFuture && (c.type === 'callout' || c.type === 'ncns')) dowCounts[idx % 7]++ })
    const maxDow = Math.max(...dowCounts)
    const highestDay = DOW[dowCounts.indexOf(maxDow)]
    let streakDay = null, maxStreak = 0
    for (let d = 0; d < 7; d++) {
      let streak = 0, maxS = 0
      for (let w = 0; w < grid.length; w++) {
        const c = grid[w][d]
        if (!c.isFuture && (c.type === 'callout' || c.type === 'ncns')) { streak++; if (streak > maxS) maxS = streak } else streak = 0
      }
      if (maxS > maxStreak) { maxStreak = maxS; streakDay = DOW[d] }
    }
    return { highestDay, hasData: maxDow > 0, streakDay, maxStreak }
  }, [grid])

  if (!flagEnabled) {
    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>FEATURE DISABLED</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Absence Heatmap is not enabled. Enable it in <strong>Feature Toggles</strong>.</div>
      </div>
    )
  }
  if (!emp) return <StatePanel icon="📭" title="No employees in scope" msg="No roster is available for your selected locations." />

  const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const cellColor = (type, isFuture) => isFuture ? 'transparent' : type ? TYPE_COLORS[type] : TYPE_COLORS.none

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Employee</div>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...selStyle, minWidth: 260 }}>
          {roster.map(r => <option key={r.person_id} value={r.person_id}>{r.full_name} — {r.location} ({r.role})</option>)}
        </select>
        <span className="badge blue">{emp.location}</span>
        <span className="badge purple">{emp.role}</span>
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 18px', overflowX: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
          52-Week Absence Heatmap — {emp.full_name}
        </div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 2 }}>
          {DOW_LABELS.map((lbl, i) => <div key={i} style={{ width: 16, textAlign: 'center', fontSize: 8, color: 'var(--t-text-faint)', fontWeight: 700, marginRight: 2 }}>{lbl}</div>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {grid.map((week, w) => (
            <div key={w} style={{ display: 'flex', gap: 2 }}>
              {week.map((cell, d) => (
                <div key={d} title={cell.isFuture ? '' : `${cell.date}${cell.type ? ' — ' + (cell.type === 'ncns' ? 'NCNS' : cell.type) : ' — no incident'}`}
                  style={{ width: 14, height: 14, flexShrink: 0, background: cellColor(cell.type, cell.isFuture), border: cell.isFuture ? '1px dashed var(--t-line)' : '1px solid transparent', borderRadius: 0 }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['none', 'No incident'], ['tardy', 'Tardy'], ['callout', 'Callout'], ['ncns', 'NCNS']].map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 12, background: TYPE_COLORS[k], border: '1px solid rgba(255,255,255,.1)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Pattern Insights</div>
        {!insights.hasData ? (
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>No callout/NCNS history in the 52-week window for {emp.full_name}.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge amber" style={{ fontSize: 9 }}>HIGHEST ABSENCE DAY</span>
              <span style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 700 }}>{insights.highestDay}</span>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>is the most frequent absence day for {emp.full_name}</span>
            </div>
            {insights.maxStreak >= 3 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge red" style={{ fontSize: 9 }}>STREAK DETECTED</span>
                <span style={{ fontSize: 12, color: 'var(--t-danger)', fontWeight: 700 }}>{insights.maxStreak} consecutive {insights.streakDay}s with absences</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB — RETURN TO WORK (pending derived from real recent absences)
══════════════════════════════════════════════════════════════════════ */
function RTWCheckInForm({ item, onComplete }) {
  const [illnessRelated, setIllnessRelated] = useState(item.absence_type === 'Illness')
  const [needsAccom, setNeedsAccom] = useState(false)
  const [accomText, setAccomText] = useState('')
  const [medClearance, setMedClearance] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    setSaving(true)
    const ok = await onComplete(item, { illnessRelated, needsAccom, accomText, medClearance, notes })
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-accent)', padding: '14px 16px', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Return-to-Work Check-In Form</div>
      {[
        { label: 'Was the absence illness-related?', val: illnessRelated, set: setIllnessRelated, on: 'var(--t-success)' },
        { label: 'Does employee need accommodations?', val: needsAccom, set: setNeedsAccom, on: 'var(--t-accent)' },
        { label: 'Medical clearance required?', val: medClearance, set: setMedClearance, on: 'var(--t-warn)' },
      ].map(t => (
        <div key={t.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{t.label}</span>
          <div onClick={() => t.set(v => !v)} style={{ width: 36, height: 20, background: t.val ? t.on : 'var(--t-line)', borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: t.val ? 17 : 3, width: 14, height: 14, background: 'white', borderRadius: '50%', transition: 'left .2s' }} />
          </div>
        </div>
      ))}
      {needsAccom && (
        <input value={accomText} onChange={e => setAccomText(e.target.value)} placeholder="Describe accommodations needed..." style={{ ...selStyle, width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
      )}
      <div>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Manager Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes about this return-to-work check-in..." style={{ ...selStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding: '7px 18px', fontSize: 11, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1, background: 'rgba(34,197,94,.15)', border: '1px solid var(--t-success)', color: 'var(--t-success)', borderRadius: 0 }}>
          {saving ? 'Saving…' : 'Submit RTW Check-In ✓'}
        </button>
      </div>
    </div>
  )
}

function TabReturnToWork({ roster, nowMs, rtwCompleted, onComplete }) {
  const flagEnabled = useFeatureFlag('return_to_work')
  const [openFormId, setOpenFormId] = useState(null)
  const [completedOpen, setCompletedOpen] = useState(false)

  // Pending = most recent callout/NCNS in the last 14 days without a completed RTW covering it
  const pending = useMemo(() => {
    const within = (iso) => { const t = parseISO(iso).getTime(); return t <= nowMs && (nowMs - t) <= 14 * MS_DAY }
    const doneKeys = new Set(rtwCompleted.map(c => `${c.person_id}|${c.callout_date}`))
    const items = []
    roster.forEach(r => {
      const recent = r.incidents.filter(i => (i.type === 'callout' || i.type === 'ncns') && within(i.date))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      if (!recent.length) return
      const inc = recent[0]
      const key = `${r.person_id}|${inc.date}`
      if (doneKeys.has(key)) return
      items.push({
        id: key, person_id: r.person_id, node_id: r.node_id, full_name: r.full_name, location: r.location, role: r.role,
        callout_date: inc.date, return_date: new Date(nowMs).toISOString().slice(0, 10),
        absence_type: inc.type === 'ncns' ? 'NCNS' : 'Callout',
        daysAbsent: recent.filter(x => x.date === inc.date).length || 1,
      })
    })
    return items
  }, [roster, rtwCompleted, nowMs])

  if (!flagEnabled) {
    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>FEATURE DISABLED</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Return-to-Work check-ins are not enabled. Enable in <strong>Feature Toggles</strong>.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
          Pending RTW Check-Ins — {pending.length} awaiting
        </div>
        {pending.length === 0 && (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '20px 18px', color: 'var(--t-success)', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
            ✓ No return-to-work check-ins are currently required.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map(item => {
            const isOpen = openFormId === item.id
            const isNcns = item.absence_type === 'NCNS'
            return (
              <div key={item.id} style={{ background: 'var(--t-surface)', border: `1px solid ${isNcns ? 'var(--t-danger)' : 'var(--t-line)'}`, borderLeft: `4px solid ${isNcns ? 'var(--t-danger)' : 'var(--t-warn)'}`, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)' }}>{item.full_name}</span>
                      <span className="badge blue" style={{ fontSize: 9 }}>{item.location}</span>
                      <span className="badge purple" style={{ fontSize: 9 }}>{item.role}</span>
                      {isNcns && <span className="badge red" style={{ fontSize: 9 }}>NCNS</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                      Absence: <strong style={{ color: 'var(--t-text)' }}>{fmt(item.callout_date)}</strong>
                      &nbsp;·&nbsp;Returning: <strong style={{ color: 'var(--t-text)' }}>{fmt(item.return_date)}</strong>
                      &nbsp;·&nbsp;Type: <strong style={{ color: isNcns ? 'var(--t-danger)' : 'var(--t-warn)' }}>{item.absence_type}</strong>
                    </div>
                  </div>
                  <button onClick={() => setOpenFormId(isOpen ? null : item.id)}
                    style={{ padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap',
                      background: isOpen ? 'rgba(0,229,255,.15)' : 'rgba(234,179,8,.1)', border: `1px solid ${isOpen ? 'var(--t-accent)' : 'var(--t-warn)'}`, color: isOpen ? 'var(--t-accent)' : 'var(--t-warn)' }}>
                    {isOpen ? 'Cancel' : 'Complete RTW Check-In'}
                  </button>
                </div>
                {isOpen && <RTWCheckInForm item={item} onComplete={async (it, form) => { const ok = await onComplete(it, form); if (ok) setOpenFormId(null); return ok }} />}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <button onClick={() => setCompletedOpen(v => !v)}
          style={{ width: '100%', padding: '10px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderRadius: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Completed RTW Check-Ins ({rtwCompleted.length})
          </span>
          <span style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>{completedOpen ? '▲' : '▼'}</span>
        </button>
        {completedOpen && (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: 'none', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                    {['Employee', 'Return Date', 'Absence Type', 'Accommodations', 'Completed By', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rtwCompleted.length === 0 && <tr><td colSpan={6} style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No completed check-ins yet.</td></tr>}
                  {rtwCompleted.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{row.full_name || '—'}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{fmt(row.return_date)}</td>
                      <td style={{ padding: '9px 14px' }}><span className={row.absence_type === 'NCNS' ? 'badge red' : 'badge blue'} style={{ fontSize: 9 }}>{row.absence_type || '—'}</span></td>
                      <td style={{ padding: '9px 14px', color: row.needs_accommodation ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{row.needs_accommodation ? (row.accommodation_note || 'Yes') : 'None'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-accent)', fontWeight: 600 }}>{row.completed_by_name || 'You'}</td>
                      <td style={{ padding: '9px 14px' }}><span className="badge green" style={{ fontSize: 9 }}>COMPLETED</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: 'rgba(0,229,255,.04)', border: '1px solid var(--t-line)', padding: '10px 14px', borderLeft: '3px solid var(--t-accent)' }}>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--t-text)' }}>RTW Policy:</strong> A return-to-work check-in is required for any NCNS incident and for multi-day absences per company policy. Failure to complete a required check-in may be treated as a policy violation.
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'aiwarnings', label: 'AI Warnings' },
  { id: 'deepdive', label: 'Employee Deep-Dive' },
  { id: 'patterns', label: 'Pattern Analysis' },
  { id: 'bradford', label: 'Bradford Factor Report' },
  { id: 'alerts', label: 'Alerts & Actions' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'rtw', label: 'Return to Work' },
]

const DEFAULT_THRESHOLDS = { warn: 200, final_warn: 500, term_risk: 900 }

export default function AttendanceForensics() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [tab, setTab] = useState('aiwarnings')
  const nowMs = useMemo(() => Date.now(), [])

  const role = session?.person?.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => (role || '').toLowerCase().includes(x))

  const [overview, setOverview] = useState(null) // null = loading
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [flags, setFlags] = useState([])
  const [warningActions, setWarningActions] = useState({})
  const [dismissals, setDismissals] = useState([])
  const [rtwCompleted, setRtwCompleted] = useState([])
  const [loadError, setLoadError] = useState('')

  const primaryNode = locationIds?.[0] || null

  const load = useCallback(async () => {
    const nodeIds = locationIds || []
    if (!nodeIds.length) { setOverview([]); setThresholds(DEFAULT_THRESHOLDS); setFlags([]); setWarningActions({}); setDismissals([]); setRtwCompleted([]); setLoadError(''); return }
    setLoadError('')
    const [ov, th, fl, wa, ds, rt] = await Promise.all([
      sb.rpc('get_attendance_overview', { p_node_ids: nodeIds }),
      sb.rpc('af_get_bradford_thresholds', { p_node_ids: nodeIds }),
      sb.rpc('af_get_flags', { p_node_ids: nodeIds }),
      sb.rpc('af_get_warning_actions', { p_node_ids: nodeIds }),
      sb.rpc('af_get_alert_dismissals', { p_node_ids: nodeIds }),
      sb.rpc('af_list_rtw', { p_node_ids: nodeIds }),
    ])
    if (ov.error) { setLoadError(ov.error.message || 'Unable to load attendance records.'); setOverview([]); return }
    setOverview(Array.isArray(ov.data) ? ov.data : [])
    if (!th.error && th.data) setThresholds({ warn: th.data.warn ?? 200, final_warn: th.data.final_warn ?? 500, term_risk: th.data.term_risk ?? 900 })
    setFlags(Array.isArray(fl.data) ? fl.data : [])
    const waMap = {}
    ;(Array.isArray(wa.data) ? wa.data : []).forEach(a => { waMap[a.warning_key] = a })
    setWarningActions(waMap)
    setDismissals(Array.isArray(ds.data) ? ds.data : [])
    setRtwCompleted(Array.isArray(rt.data) ? rt.data : [])
  }, [locationIds])

  useEffect(() => { if (isHR) load() }, [isHR, load])

  const roster = useMemo(() => (Array.isArray(overview) ? overview.map(e => enrichRow(e, nowMs)) : []), [overview, nowMs])
  const flagsSet = useMemo(() => new Set(flags), [flags])
  const dismissedSet = useMemo(() => new Set(dismissals), [dismissals])

  // ── write callbacks (persist, then refresh) ──────────────────────────
  const saveThresholds = useCallback(async (warn, finalWarn, termRisk) => {
    if (!primaryNode) return false
    const s = getSession()
    const { error } = await sb.rpc('af_set_bradford_thresholds', { p_node_id: primaryNode, p_warn: warn, p_final_warn: finalWarn, p_term_risk: termRisk, p_actor: s.id ?? null })
    if (error) return false
    setThresholds({ warn, final_warn: finalWarn, term_risk: termRisk })
    return true
  }, [primaryNode])

  const toggleFlag = useCallback(async (personId, nodeId) => {
    const s = getSession()
    const { error } = await sb.rpc('af_toggle_flag', { p_node_id: nodeId || primaryNode, p_person_id: personId, p_actor: s.id ?? null })
    if (error) return
    setFlags(prev => prev.includes(personId) ? prev.filter(x => x !== personId) : [...prev, personId])
  }, [primaryNode])

  const decideWarning = useCallback(async (w, status, message) => {
    const s = getSession()
    const nodeId = w.r.node_id || primaryNode
    const { error } = await sb.rpc('af_set_warning_action', { p_node_id: nodeId, p_person_id: w.r.person_id, p_warning_key: w.key, p_status: status, p_message: message ?? null, p_actor: s.id ?? null })
    if (error) return
    // Approving a warning creates a real disciplinary record
    if (status === 'approved') {
      await sb.rpc('create_disciplinary_action', {
        p_person_id: w.r.person_id, p_node_id: nodeId,
        p_type: 'written_warning', p_description: message || w.text,
        p_corrective_action: 'Attendance improvement required', p_issued_by_id: s.id ?? null, p_follow_up_date: null,
      })
    }
    setWarningActions(prev => ({ ...prev, [w.key]: { warning_key: w.key, status, message: message ?? prev[w.key]?.message ?? w.text, decided_by: s.id ?? null } }))
  }, [primaryNode])

  const dismissAlert = useCallback(async (alertKey, nodeId) => {
    const s = getSession()
    const { error } = await sb.rpc('af_dismiss_alert', { p_node_id: nodeId || primaryNode, p_alert_key: alertKey, p_actor: s.id ?? null })
    if (error) return
    setDismissals(prev => prev.includes(alertKey) ? prev : [...prev, alertKey])
  }, [primaryNode])

  const issueWarning = useCallback(async (r, type, desc) => {
    const s = getSession()
    const { error } = await sb.rpc('create_disciplinary_action', {
      p_person_id: r.person_id, p_node_id: r.node_id || primaryNode,
      p_type: 'written_warning', p_description: `${type}: ${desc}`,
      p_corrective_action: 'Attendance improvement required', p_issued_by_id: s.id ?? null, p_follow_up_date: null,
    })
    return !error
  }, [primaryNode])

  const completeRtw = useCallback(async (item, form) => {
    const s = getSession()
    const { error } = await sb.rpc('af_complete_rtw', {
      p_node_id: item.node_id || primaryNode, p_person_id: item.person_id,
      p_callout_date: item.callout_date, p_return_date: item.return_date, p_absence_type: item.absence_type,
      p_illness: !!form.illnessRelated, p_needs_accom: !!form.needsAccom, p_accom_note: form.accomText || null,
      p_med_clearance: !!form.medClearance, p_notes: form.notes || null, p_actor: s.id ?? null,
    })
    if (error) return false
    const rt = await sb.rpc('af_list_rtw', { p_node_ids: locationIds || [] })
    if (!rt.error) setRtwCompleted(Array.isArray(rt.data) ? rt.data : [])
    return true
  }, [primaryNode, locationIds])

  if (!isHR) return <div style={{ padding: 24 }}><LockScreen /></div>

  const locCount = new Set(roster.map(r => r.location).filter(Boolean)).size

  return (
    <div style={{ padding: 24, minHeight: '100dvh', background: 'var(--t-bg,#070b14)', color: 'var(--t-text)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.01em' }}>Attendance Forensics</div>
          <span className="badge purple">HR Only</span>
          {overview !== null && <span className="badge blue">{roster.length} Employees</span>}
          {overview !== null && locCount > 0 && <span className="badge blue">{locCount} Location{locCount === 1 ? '' : 's'}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>
          Deep attendance intelligence · Bradford Factor tracking · Pattern analysis · Automated alerts — all from real attendance incidents
        </div>
      </div>

      {loadError ? (
        <StatePanel icon="⚠️" tone="error" title="Couldn't load attendance records" msg={loadError} />
      ) : overview === null ? (
        <StatePanel icon="⏳" title="Loading attendance records…" />
      ) : (
        <>
          <ForensicKpiPanel roster={roster} thresholds={thresholds} flagsSet={flagsSet} />

          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'transparent', border: 'none', borderRadius: 0,
                  borderBottom: `2px solid ${tab === t.id ? 'var(--t-accent)' : 'transparent'}`, color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)', letterSpacing: '.04em' }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'aiwarnings' && <TabAIWarnings roster={roster} nowMs={nowMs} thresholds={thresholds} warningActions={warningActions} onDecide={decideWarning} />}
          {tab === 'deepdive' && <TabDeepDive roster={roster} nowMs={nowMs} />}
          {tab === 'patterns' && <TabPatternAnalysis roster={roster} thresholds={thresholds} />}
          {tab === 'bradford' && <TabBradfordReport roster={roster} thresholds={thresholds} flagsSet={flagsSet} onSaveThresholds={saveThresholds} onToggleFlag={toggleFlag} />}
          {tab === 'alerts' && <TabAlerts roster={roster} thresholds={thresholds} dismissedSet={dismissedSet} onDismiss={dismissAlert} onIssueWarning={issueWarning} />}
          {tab === 'heatmap' && <TabHeatmap roster={roster} nowMs={nowMs} />}
          {tab === 'rtw' && <TabReturnToWork roster={roster} nowMs={nowMs} rtwCompleted={rtwCompleted} onComplete={completeRtw} />}
        </>
      )}
    </div>
  )
}
