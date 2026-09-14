// LaborBudget.jsx — Budget vs Actual labor dashboard for one week, per department. Consumes
// labor_cost_target_pct / labor_cost_warn_pct from config to show revenue, labor cost, labor %
// of revenue, variance vs target, scheduled vs actual hours and OT cost — color-coded, drillable.
// EVERY FIGURE IS MEASURED (Bible §12g, 14 Sep 2026): hr.labor_budget() counts heads from
// hr.assignments, scheduled hours from hr.shifts and the TG drafter's POSTED lines, actual hours
// from hr.time_punches and the OS clock, wages from hr.wage_history else the OS pay rate (flagged
// "provisional" while the OS holds placeholders), revenue from hr.financial_facts. A missing
// figure shows as "—", never as a number that was not recorded.
import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useConfig } from '../lib/config.js'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

const weekStartOf = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10) }
const shiftWeek = (ws, n) => { const x = new Date(ws + 'T12:00:00'); x.setDate(x.getDate() + n * 7); return x.toISOString().slice(0, 10) }
const fmt$ = n => n == null ? '—' : `$${Math.round(n).toLocaleString()}`
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function ddl(name, content, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click() }

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 18px', flex: 1, minWidth: 150, cursor: 'pointer' },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 26, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  th: { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--t-text-muted)', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' },
  td: { fontSize: 12, padding: '9px 12px', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' },
  btn: { fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
}

export default function LaborBudget() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const config = useConfig()
  const target = config.labor_cost_target_pct ?? 30
  const warn = config.labor_cost_warn_pct ?? 38
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()))
  const [data, setData] = useState(null)   // null = loading
  const [loadError, setLoadError] = useState('')
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    let live = true
    setData(null); setLoadError('')
    sb.rpc('labor_budget', { p_node_ids: locationIds, p_week_start: weekStart })
      .then(({ data: d, error }) => {
        if (!live) return
        if (error) { setLoadError(error.message); setData([]); return }
        setData(Array.isArray(d) ? d : [])
      })
    return () => { live = false }
  }, [JSON.stringify(locationIds), weekStart])

  // per-department budget-vs-actual, every input a measured row
  const rows = useMemo(() => (data || []).map(r => {
    const head = r.head || 0
    const schedHrs = Number(r.sched_hrs) || 0
    const actualHrs = Number(r.actual_hrs) || 0
    const otHrs = Number(r.ot_hrs) || 0
    const avgWage = r.avg_wage == null ? null : Number(r.avg_wage)
    const hrsForCost = actualHrs > 0 ? actualHrs : schedHrs
    const laborCost = avgWage == null ? null : Math.round((hrsForCost - otHrs) * avgWage + otHrs * avgWage * 1.5)
    const otCost = avgWage == null ? null : Math.round(otHrs * avgWage * 1.5)
    const revenue = r.revenue == null ? null : Number(r.revenue)
    const laborPct = revenue && laborCost != null ? +(laborCost / revenue * 100).toFixed(1) : null
    const variance = laborPct == null ? null : +(laborPct - target).toFixed(1)
    const status = laborPct == null ? 'unknown' : laborPct >= warn ? 'over' : laborPct > target ? 'watch' : 'on'
    const budgetCost = revenue == null ? null : Math.round(revenue * target / 100)
    const dollarVar = budgetCost == null || laborCost == null ? null : laborCost - budgetCost
    return { loc: r.node_name, nodeType: r.node_type, head, schedHrs, actualHrs, otHrs, avgWage, wageKnown: r.wage_known, wageProvisional: r.wage_provisional, costBasis: actualHrs > 0 ? 'actual' : 'scheduled', laborCost, revenue, laborPct, variance, status, budgetCost, dollarVar, otCost }
  }), [data, target, warn])

  const totals = useMemo(() => {
    const sum = (k) => rows.some(r => r[k] != null) ? rows.reduce((s, r) => s + (r[k] || 0), 0) : null
    const revenue = sum('revenue'), laborCost = sum('laborCost'), otCost = sum('otCost')
    const pct = revenue && laborCost != null ? +(laborCost / revenue * 100).toFixed(1) : null
    const budget = revenue == null ? null : Math.round(revenue * target / 100)
    return { revenue, laborCost, otCost, pct, budget, dollarVar: budget == null || laborCost == null ? null : laborCost - budget, over: rows.filter(r => r.status === 'over').length,
             heads: rows.reduce((s, r) => s + r.head, 0), provisional: rows.reduce((s, r) => s + (r.wageProvisional || 0), 0), wageKnown: rows.reduce((s, r) => s + (r.wageKnown || 0), 0) }
  }, [rows, target])

  const clr = s => s === 'over' ? 'var(--t-danger)' : s === 'watch' ? 'var(--t-warn)' : s === 'unknown' ? 'var(--t-text-faint)' : 'var(--t-success)'
  const COLS = [
    { key: 'loc', label: 'Department', value: r => r.loc },
    { key: 'head', label: 'Heads', value: r => r.head, align: 'right', sortKey: r => r.head },
    { key: 'revenue', label: 'Revenue', value: r => fmt$(r.revenue), align: 'right', sortKey: r => r.revenue ?? -1 },
    { key: 'laborCost', label: 'Labor Cost', value: r => fmt$(r.laborCost), align: 'right', sortKey: r => r.laborCost ?? -1 },
    { key: 'laborPct', label: 'Labor %', value: r => r.laborPct == null ? '—' : `${r.laborPct}%`, align: 'right', sortKey: r => r.laborPct ?? -1 },
    { key: 'variance', label: 'vs Target (pp)', value: r => r.variance == null ? '—' : `${r.variance > 0 ? '+' : ''}${r.variance}`, align: 'right', sortKey: r => r.variance ?? -999 },
    { key: 'dollarVar', label: '$ vs Budget', value: r => r.dollarVar == null ? '—' : `${r.dollarVar > 0 ? '+' : ''}${fmt$(r.dollarVar)}`, align: 'right', sortKey: r => r.dollarVar ?? -1e12 },
    { key: 'otCost', label: 'OT Cost', value: r => fmt$(r.otCost), align: 'right', sortKey: r => r.otCost ?? -1 },
    { key: 'schedHrs', label: 'Sched Hrs', value: r => `${r.schedHrs}h`, align: 'right', sortKey: r => r.schedHrs },
    { key: 'actualHrs', label: 'Actual Hrs', value: r => `${r.actualHrs}h`, align: 'right', sortKey: r => r.actualHrs },
    { key: 'avgWage', label: 'Avg Wage', value: r => r.avgWage == null ? '—' : `$${r.avgWage}/h${r.wageProvisional ? ' (provisional)' : ''}`, align: 'right', sortKey: r => r.avgWage ?? -1 },
  ]
  const openDrill = (title, rs, accent) => setDrill({ title, subtitle: `${rs.length} departments · week of ${weekStart} · budget vs actual`, columns: COLS, rows: rs, accent })

  const exportRows = rows.map(r => ({ Department: r.loc, Week: weekStart, Heads: r.head, Revenue: r.revenue, 'Labor Cost': r.laborCost, 'Labor %': r.laborPct, 'Target %': target, 'Variance pp': r.variance, '$ vs Budget': r.dollarVar, 'OT Cost': r.otCost, 'Sched Hrs': r.schedHrs, 'Actual Hrs': r.actualHrs, 'Avg Wage': r.avgWage, 'Wage provisional': r.wageProvisional, Status: r.status }))
  const exportCSV = () => { if (!exportRows.length) return; const keys = Object.keys(exportRows[0]); ddl(`tg-labor-budget-${new Date().toISOString().slice(0, 10)}.csv`, [keys.join(','), ...exportRows.map(o => keys.map(k => JSON.stringify(o[k] ?? '')).join(','))].join('\n'), 'text/csv') }
  const exportXLS = () => { if (!exportRows.length) return; const keys = Object.keys(exportRows[0]); const th = keys.map(k => `<th style="background:#0b2545;color:#fff;padding:6px 10px">${esc(k)}</th>`).join(''); const trs = exportRows.map(o => `<tr>${keys.map(k => `<td style="padding:5px 10px">${esc(o[k])}</td>`).join('')}</tr>`).join(''); ddl(`tg-labor-budget-${new Date().toISOString().slice(0, 10)}.xls`, `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`, 'application/vnd.ms-excel') }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>Labor Budget — Actual vs Target</h1>
          <div style={st.sub}>Target labor cost <b style={{ color: 'var(--t-success)' }}>{target}%</b> of revenue · warning at <b style={{ color: 'var(--t-warn)' }}>{warn}%</b> · edit in Settings. Green = on budget · amber = watch · red = over · grey = revenue not recorded for the week.</div>
          {loadError && <div style={{ ...st.sub, color: 'var(--t-danger)' }}>Could not read the labour budget: {loadError}</div>}
          {totals.provisional > 0 && <div style={{ ...st.sub, color: 'var(--t-warn)' }}>{totals.provisional} of {totals.wageKnown} wages are the OS&rsquo;s provisional placeholder rates &mdash; costs are indicative until HR sets real wages.</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={st.btn} onClick={() => setWeekStart(w => shiftWeek(w, -1))} title="Previous week">&lsaquo;</button>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>Week of {weekStart}</span>
          <button style={st.btn} onClick={() => setWeekStart(w => shiftWeek(w, 1))} title="Next week">&rsaquo;</button>
          <button style={st.btn} onClick={exportCSV}>⤓ CSV</button>
          <button style={st.btn} onClick={exportXLS}>⤓ Excel</button>
        </div>
      </div>

      <div style={st.kpiRow}>
        <div style={st.kpi} onClick={() => openDrill('All Locations', rows, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Company Labor %</div>
          <div style={{ ...st.kpiVal, color: clr(totals.pct == null ? 'unknown' : totals.pct >= warn ? 'over' : totals.pct > target ? 'watch' : 'on') }}>{totals.pct == null ? '—' : `${totals.pct}%`}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>target {target}%</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }} onClick={() => openDrill('Budget Variance', rows, 'var(--t-warn)')}>
          <div style={st.kpiLabel}>$ vs Budget</div>
          <div style={{ ...st.kpiVal, color: totals.dollarVar == null ? 'var(--t-text-faint)' : totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }}>{totals.dollarVar > 0 ? '+' : ''}{fmt$(totals.dollarVar)}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>budget {fmt$(totals.budget)}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-warn)' }} onClick={() => openDrill('Overtime Cost', rows.filter(r => r.otCost > 0), 'var(--t-warn)')}>
          <div style={st.kpiLabel}>OT Cost</div><div style={st.kpiVal}>{fmt$(totals.otCost)}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: totals.over ? 'var(--t-danger)' : 'var(--t-success)' }} onClick={() => openDrill('Over-Budget Locations', rows.filter(r => r.status === 'over'), 'var(--t-danger)')}>
          <div style={st.kpiLabel}>Over Budget</div>
          <div style={{ ...st.kpiVal, color: totals.over ? 'var(--t-danger)' : 'var(--t-text)' }}>{totals.over}<span style={{ fontSize: 13, color: 'var(--t-text-faint)' }}> / {rows.length}</span></div>
        </div>
      </div>

      <div style={st.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{COLS.map(c => <th key={c.key} style={{ ...st.th, textAlign: c.align || 'left' }}>{c.label}</th>)}<th style={st.th}>Status</th></tr></thead>
            <tbody>
              {data === null && <tr><td colSpan={COLS.length + 1} style={{ ...st.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>Measuring the week…</td></tr>}
              {data !== null && rows.length === 0 && <tr><td colSpan={COLS.length + 1} style={{ ...st.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No departments in scope.</td></tr>}
              {rows.map(r => (
                <tr key={r.loc} style={{ cursor: 'pointer' }} onClick={() => openDrill(`${r.loc} — Labor Detail`, [r], clr(r.status))}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--t-surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {COLS.map(c => <td key={c.key} style={{ ...st.td, textAlign: c.align || 'left', color: c.key === 'laborPct' || c.key === 'variance' || c.key === 'dollarVar' ? clr(r.status) : 'var(--t-text)', fontWeight: c.key === 'loc' ? 700 : 500 }}>{c.value(r)}</td>)}
                  <td style={st.td}><span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', color: '#fff', background: clr(r.status) }}>{r.status === 'over' ? 'OVER' : r.status === 'watch' ? 'WATCH' : r.status === 'unknown' ? 'NO REVENUE' : 'ON BUDGET'}</span></td>
                </tr>
              ))}
              <tr style={{ background: 'var(--t-surface-2)', fontWeight: 800 }}>
                <td style={st.td}>COMPANY</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{totals.heads}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.revenue)}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.laborCost)}</td>
                <td style={{ ...st.td, textAlign: 'right', color: clr(totals.pct == null ? 'unknown' : totals.pct >= warn ? 'over' : totals.pct > target ? 'watch' : 'on') }}>{totals.pct == null ? '—' : `${totals.pct}%`}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{totals.pct == null ? '—' : (totals.pct - target).toFixed(1)}</td>
                <td style={{ ...st.td, textAlign: 'right', color: totals.dollarVar == null ? 'var(--t-text-faint)' : totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }}>{totals.dollarVar > 0 ? '+' : ''}{fmt$(totals.dollarVar)}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.otCost)}</td>
                <td style={st.td} colSpan={4}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
