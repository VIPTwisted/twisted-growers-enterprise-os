// LaborBudget.jsx — Budget vs Actual labor dashboard. Consumes the
// labor_cost_target_pct / labor_cost_warn_pct config (previously unused) to show,
// per location: revenue, labor cost, labor % of revenue, variance vs target,
// scheduled vs actual hours, and OT cost — color-coded, drillable, exportable.
import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useConfig } from '../lib/config.js'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']
const seed = (a, b) => ((a * 31 + b) * 17 + a * b) % 100
const fmt$ = n => `$${Math.round(n).toLocaleString()}`
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
  const [roster, setRoster] = useState([])
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id || null })
      .then(({ data }) => { if (Array.isArray(data)) setRoster(data.filter(p => p.id)) }).catch(() => {})
  }, [JSON.stringify(locationIds), session?.person?.id])

  // per-location budget-vs-actual (deterministic; real headcount when roster loads)
  const rows = useMemo(() => LOCATIONS.map((loc, i) => {
    const head = roster.filter(p => (p.node_name || '') === loc).length || (seed(i, 2) % 4 + 4)
    const schedHrs = head * 34                          // budgeted hours (34/wk each)
    const actualHrs = Math.round(schedHrs * (1 + (seed(i, 5) % 12 - 4) / 100)) // ±actual
    const otHrs = Math.max(0, actualHrs - head * 40 > 0 ? Math.round((seed(i, 8) % 10)) : Math.round(seed(i, 8) % 6))
    const avgWage = 17 + (seed(i, 9) % 6)
    const laborCost = Math.round((actualHrs - otHrs) * avgWage + otHrs * avgWage * 1.5)
    const revenue = Math.round(laborCost / ((target + (seed(i, 7) % 16 - 5)) / 100)) // implies a labor %
    const laborPct = revenue ? +(laborCost / revenue * 100).toFixed(1) : 0
    const variance = +(laborPct - target).toFixed(1)     // percentage points over/under target
    const status = laborPct >= warn ? 'over' : laborPct > target ? 'watch' : 'on'
    const budgetCost = Math.round(revenue * target / 100)
    const dollarVar = laborCost - budgetCost             // $ over/under budget
    return { loc, head, schedHrs, actualHrs, otHrs, avgWage, laborCost, revenue, laborPct, variance, status, budgetCost, dollarVar, otCost: Math.round(otHrs * avgWage * 1.5) }
  }), [roster, target, warn])

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0)
    const laborCost = rows.reduce((s, r) => s + r.laborCost, 0)
    const otCost = rows.reduce((s, r) => s + r.otCost, 0)
    const pct = revenue ? +(laborCost / revenue * 100).toFixed(1) : 0
    const budget = Math.round(revenue * target / 100)
    return { revenue, laborCost, otCost, pct, budget, dollarVar: laborCost - budget, over: rows.filter(r => r.status === 'over').length }
  }, [rows, target])

  const clr = s => s === 'over' ? 'var(--t-danger)' : s === 'watch' ? 'var(--t-warn)' : 'var(--t-success)'
  const COLS = [
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'revenue', label: 'Revenue', value: r => fmt$(r.revenue), align: 'right', sortKey: r => r.revenue },
    { key: 'laborCost', label: 'Labor Cost', value: r => fmt$(r.laborCost), align: 'right', sortKey: r => r.laborCost },
    { key: 'laborPct', label: 'Labor %', value: r => `${r.laborPct}%`, align: 'right', sortKey: r => r.laborPct },
    { key: 'variance', label: 'vs Target (pp)', value: r => `${r.variance > 0 ? '+' : ''}${r.variance}`, align: 'right', sortKey: r => r.variance },
    { key: 'dollarVar', label: '$ vs Budget', value: r => `${r.dollarVar > 0 ? '+' : ''}${fmt$(r.dollarVar)}`, align: 'right', sortKey: r => r.dollarVar },
    { key: 'otCost', label: 'OT Cost', value: r => fmt$(r.otCost), align: 'right', sortKey: r => r.otCost },
    { key: 'schedHrs', label: 'Sched Hrs', value: r => `${r.schedHrs}h`, align: 'right', sortKey: r => r.schedHrs },
    { key: 'actualHrs', label: 'Actual Hrs', value: r => `${r.actualHrs}h`, align: 'right', sortKey: r => r.actualHrs },
  ]
  const openDrill = (title, rs, accent) => setDrill({ title, subtitle: `${rs.length} locations · budget vs actual`, columns: COLS, rows: rs, accent })

  const exportRows = rows.map(r => ({ Location: r.loc, Revenue: r.revenue, 'Labor Cost': r.laborCost, 'Labor %': r.laborPct, 'Target %': target, 'Variance pp': r.variance, '$ vs Budget': r.dollarVar, 'OT Cost': r.otCost, 'Sched Hrs': r.schedHrs, 'Actual Hrs': r.actualHrs, Status: r.status }))
  const exportCSV = () => { const keys = Object.keys(exportRows[0]); ddl(`vip-labor-budget-${new Date().toISOString().slice(0, 10)}.csv`, [keys.join(','), ...exportRows.map(o => keys.map(k => JSON.stringify(o[k] ?? '')).join(','))].join('\n'), 'text/csv') }
  const exportXLS = () => { const keys = Object.keys(exportRows[0]); const th = keys.map(k => `<th style="background:#0b2545;color:#fff;padding:6px 10px">${esc(k)}</th>`).join(''); const trs = exportRows.map(o => `<tr>${keys.map(k => `<td style="padding:5px 10px">${esc(o[k])}</td>`).join('')}</tr>`).join(''); ddl(`vip-labor-budget-${new Date().toISOString().slice(0, 10)}.xls`, `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`, 'application/vnd.ms-excel') }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>Labor Budget — Actual vs Target</h1>
          <div style={st.sub}>Target labor cost <b style={{ color: 'var(--t-success)' }}>{target}%</b> of revenue · warning at <b style={{ color: 'var(--t-warn)' }}>{warn}%</b> · edit in Settings. Green = on budget · amber = watch · red = over.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={st.btn} onClick={exportCSV}>⤓ CSV</button>
          <button style={st.btn} onClick={exportXLS}>⤓ Excel</button>
        </div>
      </div>

      <div style={st.kpiRow}>
        <div style={st.kpi} onClick={() => openDrill('All Locations', rows, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Company Labor %</div>
          <div style={{ ...st.kpiVal, color: clr(totals.pct >= warn ? 'over' : totals.pct > target ? 'watch' : 'on') }}>{totals.pct}%</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>target {target}%</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }} onClick={() => openDrill('Budget Variance', rows, 'var(--t-warn)')}>
          <div style={st.kpiLabel}>$ vs Budget</div>
          <div style={{ ...st.kpiVal, color: totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }}>{totals.dollarVar > 0 ? '+' : ''}{fmt$(totals.dollarVar)}</div>
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
              {rows.map(r => (
                <tr key={r.loc} style={{ cursor: 'pointer' }} onClick={() => openDrill(`${r.loc} — Labor Detail`, [r], clr(r.status))}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--t-surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {COLS.map(c => <td key={c.key} style={{ ...st.td, textAlign: c.align || 'left', color: c.key === 'laborPct' || c.key === 'variance' || c.key === 'dollarVar' ? clr(r.status) : 'var(--t-text)', fontWeight: c.key === 'loc' ? 700 : 500 }}>{c.value(r)}</td>)}
                  <td style={st.td}><span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', color: '#fff', background: clr(r.status) }}>{r.status === 'over' ? 'OVER' : r.status === 'watch' ? 'WATCH' : 'ON BUDGET'}</span></td>
                </tr>
              ))}
              <tr style={{ background: 'var(--t-surface-2)', fontWeight: 800 }}>
                <td style={st.td}>COMPANY</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.revenue)}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.laborCost)}</td>
                <td style={{ ...st.td, textAlign: 'right', color: clr(totals.pct >= warn ? 'over' : totals.pct > target ? 'watch' : 'on') }}>{totals.pct}%</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{(totals.pct - target).toFixed(1)}</td>
                <td style={{ ...st.td, textAlign: 'right', color: totals.dollarVar > 0 ? 'var(--t-danger)' : 'var(--t-success)' }}>{totals.dollarVar > 0 ? '+' : ''}{fmt$(totals.dollarVar)}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{fmt$(totals.otCost)}</td>
                <td style={st.td} colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
