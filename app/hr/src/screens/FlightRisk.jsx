// FlightRisk.jsx — retention / flight-risk model: a TRANSPARENT weighted score computed from
// measured signals — callouts and lates (30 d), open disciplinary actions, tenure, pulse mood
// (90 d), training completion, review recency. Shows each factor's contribution.
// EVERY SIGNAL IS A COUNT FROM A TABLE (Bible §12g, 14 Sep 2026): hr.flight_risk_factors() reads
// hr.shift_exceptions / attendance_events / attendance_incidents / disciplinary_records /
// pulse_responses / training_records / performance_reviews and the OS's callouts, attendance
// occurrences, time entries, hire dates and department skills for the people in scope. A signal
// with no record is null, shown as "no record" and scored as such — never a seeded number.
import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function ddl(name, content, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click() }

// weighted model — each factor contributes points (0..weight); sum = risk 0..100.
// A null signal (no record of that kind yet) scores as the neutral value below and is labelled.
const FACTORS = [
  { key: 'callouts', label: 'Callouts (30d)', weight: 22, score: v => Math.min(1, (v ?? 0) / 6) },
  { key: 'lates', label: 'Late arrivals (30d)', weight: 12, score: v => Math.min(1, (v ?? 0) / 5) },
  { key: 'openDAs', label: 'Open disciplinary', weight: 20, score: v => Math.min(1, (v ?? 0) / 2) },
  { key: 'tenureMo', label: 'Short tenure', weight: 14, score: v => v == null ? 0 : v < 3 ? 1 : v < 6 ? 0.6 : v < 12 ? 0.3 : 0 },
  { key: 'pulseAvg', label: 'Low pulse mood', weight: 16, score: v => v == null ? 0.3 : Math.max(0, (4 - v) / 3) },
  { key: 'trainingPct', label: 'Training gap', weight: 8, score: v => v == null ? 0.5 : Math.max(0, (80 - v) / 80) },
  { key: 'reviewDays', label: 'Review overdue', weight: 8, score: v => v == null ? 0.5 : Math.min(1, Math.max(0, v - 90) / 90) },
]
const fmtSignal = (key, v) => v == null ? 'no record' : key === 'tenureMo' ? `${v} mo` : key === 'pulseAvg' ? `${v} / 5` : key === 'trainingPct' ? `${v}%` : key === 'reviewDays' ? `${v} d ago` : String(v)
function computeRisk(e) {
  const parts = FACTORS.map(f => ({ label: f.label, key: f.key, raw: e[f.key], points: +(f.score(e[f.key]) * f.weight).toFixed(1), of: f.weight }))
  const score = Math.round(parts.reduce((s, p) => s + p.points, 0))
  const level = score >= 65 ? 'Critical' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low'
  const top = [...parts].sort((a, b) => b.points - a.points).filter(p => p.points > 1).slice(0, 3).map(p => p.label)
  return { score, level, parts, top }
}

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3, maxWidth: 720 },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 18px', flex: 1, minWidth: 130, cursor: 'pointer' },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 26, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  th: { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--t-text-muted)', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' },
  td: { fontSize: 12, padding: '9px 12px', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' },
  btn: { fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
}

export default function FlightRisk() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [signals, setSignals] = useState(null)   // null = loading
  const [loadError, setLoadError] = useState('')
  const [drill, setDrill] = useState(null)
  const [sel, setSel] = useState(null)

  useEffect(() => {
    let live = true
    setSignals(null); setLoadError('')
    sb.rpc('flight_risk_factors', { p_node_ids: locationIds, p_actor: session?.person?.id || null })
      .then(({ data, error }) => {
        if (!live) return
        if (error) { setLoadError(error.message); setSignals([]); return }
        setSignals(Array.isArray(data) ? data : [])
      })
    return () => { live = false }
  }, [JSON.stringify(locationIds), session?.person?.id])

  const emps = useMemo(() => (signals || []).map(r => {
    const s = {
      callouts: r.callouts_30d, lates: r.lates_30d, openDAs: r.open_das,
      tenureMo: r.tenure_months == null ? null : Number(r.tenure_months),
      pulseAvg: r.pulse_avg == null ? null : Number(r.pulse_avg),
      trainingPct: r.training_pct == null ? null : Number(r.training_pct),
      reviewDays: r.review_days,
    }
    return { id: r.person_id, name: r.full_name, role: r.role_name || 'Associate', loc: r.node_name || '', ...s, ...computeRisk(s) }
  }).sort((a, b) => b.score - a.score), [signals])

  const k = useMemo(() => ({
    critical: emps.filter(e => e.level === 'Critical'),
    high: emps.filter(e => e.level === 'High'),
    avg: emps.length ? Math.round(emps.reduce((s, e) => s + e.score, 0) / emps.length) : 0,
  }), [emps])

  const clr = l => l === 'Critical' ? 'var(--t-danger)' : l === 'High' ? 'var(--t-warn)' : l === 'Medium' ? 'var(--t-accent)' : 'var(--t-success)'
  const COLS = [
    { key: 'name', label: 'Employee', value: e => e.name },
    { key: 'role', label: 'Role', value: e => e.role },
    { key: 'loc', label: 'Department', value: e => e.loc },
    { key: 'score', label: 'Risk Score', value: e => e.score, align: 'right', sortKey: e => e.score },
    { key: 'level', label: 'Level', value: e => e.level },
    { key: 'top', label: 'Top Drivers', value: e => (e.top || []).join(', ') || '—' },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employees · computed retention risk`, columns: COLS, rows, accent, messaging: { nameKey: 'name', subjectKey: 'level' } })

  const expRows = emps.map(e => ({ Employee: e.name, Role: e.role, Location: e.loc, 'Risk Score': e.score, Level: e.level, 'Top Drivers': (e.top || []).join('; '), Callouts30: e.callouts, OpenDAs: e.openDAs, TenureMo: e.tenureMo }))
  const exportCSV = () => { const c = Object.keys(expRows[0]); ddl(`tg-flight-risk-${new Date().toISOString().slice(0, 10)}.csv`, [c.join(','), ...expRows.map(o => c.map(x => JSON.stringify(o[x] ?? '')).join(','))].join('\n'), 'text/csv') }
  const exportXLS = () => { const c = Object.keys(expRows[0]); const th = c.map(x => `<th style="background:#0b2545;color:#fff;padding:6px 10px">${esc(x)}</th>`).join(''); const trs = expRows.map(o => `<tr>${c.map(x => `<td style="padding:5px 10px">${esc(o[x])}</td>`).join('')}</tr>`).join(''); ddl(`tg-flight-risk-${new Date().toISOString().slice(0, 10)}.xls`, `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`, 'application/vnd.ms-excel') }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>Retention / Flight-Risk Model</h1>
          <div style={st.sub}>A computed, weighted score (not a static badge) from measured attendance, discipline, tenure, pulse mood, training and review recency. A factor with no record yet says so. Click any employee to see the factor breakdown.</div>
          {loadError && <div style={{ ...st.sub, color: 'var(--t-danger)' }}>Could not read signals: {loadError}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={st.btn} onClick={exportCSV}>⤓ CSV</button>
          <button style={st.btn} onClick={exportXLS}>⤓ Excel</button>
        </div>
      </div>

      <div style={st.kpiRow}>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-danger)' }} onClick={() => openDrill('Critical Risk', k.critical, 'var(--t-danger)')}>
          <div style={st.kpiLabel}>Critical Risk</div><div style={{ ...st.kpiVal, color: k.critical.length ? 'var(--t-danger)' : 'var(--t-text)' }}>{k.critical.length}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-warn)' }} onClick={() => openDrill('High Risk', k.high, 'var(--t-warn)')}>
          <div style={st.kpiLabel}>High Risk</div><div style={{ ...st.kpiVal, color: k.high.length ? 'var(--t-warn)' : 'var(--t-text)' }}>{k.high.length}</div>
        </div>
        <div style={st.kpi} onClick={() => openDrill('All Employees', emps, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Avg Risk Score</div><div style={st.kpiVal}>{k.avg}</div>
        </div>
        <div style={st.kpi} onClick={() => openDrill('All Employees', emps, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Employees</div><div style={st.kpiVal}>{emps.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 340px' : '1fr', gap: 16 }}>
        <div style={st.card}>
          <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{COLS.map(c => <th key={c.key} style={{ ...st.th, textAlign: c.align || 'left', position: 'sticky', top: 0 }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {signals === null && <tr><td colSpan={COLS.length} style={{ ...st.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>Measuring signals…</td></tr>}
                {signals !== null && emps.length === 0 && <tr><td colSpan={COLS.length} style={{ ...st.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No active people in scope.</td></tr>}
                {emps.map(e => (
                  <tr key={e.id} onClick={() => setSel(e)} style={{ cursor: 'pointer', background: sel?.id === e.id ? 'var(--t-surface-2)' : 'transparent' }}>
                    <td style={{ ...st.td, fontWeight: 600 }}>{e.name}</td>
                    <td style={st.td}>{e.role}</td>
                    <td style={st.td}>{e.loc}</td>
                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 800, color: clr(e.level) }}>{e.score}</td>
                    <td style={st.td}><span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', color: '#fff', background: clr(e.level) }}>{e.level.toUpperCase()}</span></td>
                    <td style={{ ...st.td, color: 'var(--t-text-muted)', fontSize: 11 }}>{(e.top || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {sel && (
          <div style={{ ...st.card, alignSelf: 'start', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div><div style={{ fontSize: 15, fontWeight: 800 }}>{sel.name}</div><div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{sel.role} · {sel.loc}</div></div>
              <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: 'var(--t-text-muted)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0' }}>
              <span style={{ fontSize: 34, fontWeight: 900, color: clr(sel.level) }}>{sel.score}</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', color: '#fff', background: clr(sel.level) }}>{sel.level.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Factor breakdown</div>
            {sel.parts.map(p => (
              <div key={p.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}><span>{p.label} <span style={{ color: p.raw == null ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>· {fmtSignal(p.key, p.raw)}</span></span><span style={{ color: 'var(--t-text-muted)' }}>{p.points} / {p.of}</span></div>
                <div style={{ height: 5, background: 'var(--t-line)' }}><div style={{ height: '100%', width: `${(p.points / p.of) * 100}%`, background: p.points / p.of > 0.6 ? 'var(--t-danger)' : p.points / p.of > 0.3 ? 'var(--t-warn)' : 'var(--t-success)' }} /></div>
              </div>
            ))}
            <button style={{ ...st.btn, width: '100%', marginTop: 10, background: 'var(--t-accent)', color: '#04121a', border: 'none' }} onClick={() => openDrill(`${sel.name} — Retention Risk`, [sel], clr(sel.level))}>Message / action →</button>
          </div>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
