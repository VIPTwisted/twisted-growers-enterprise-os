// Payroll.jsx — payroll as the OS records it.
//
// PAYROLL'S SYSTEM OF RECORD IS THE OS FINANCE LANE (Bible §6, §12g): pay periods, pay runs
// and pay-run lines (280E cost classes), pay rates, earning and deduction codes all live in
// public.*. The clone's screen invented rates, deductions, hours, stub history, YTD and
// PAID/PROCESSING statuses from a seed for whoever was on the roster. This screen shows
// only what is recorded — hr.payroll_summary() — and says so where nothing is:
//   • the current pay period (public.pay_periods) or "no pay period set"
//   • each person's hours in that period (hr.time_punches + the OS clock), their rate
//     (hr.wage_history, else the OS rate — flagged provisional while the OS holds placeholders)
//     and the indicative gross those two make; deductions and net come only from a pay run
//   • pay runs recorded in the OS, with their lines for the people in scope
// Nothing here is a pay stub until the OS Finance lane runs payroll.
import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

const money = (n) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hrs = (n) => n == null ? '—' : `${Number(n).toFixed(1)}h`

function FeatureDisabled() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
      <div style={{ fontSize: 40, opacity: 0.4 }}>🚫</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)' }}>Feature Disabled</div>
      <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Enable "Payroll Detail" in Feature Toggles to access this page.</div>
    </div>
  )
}

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', flex: 1, minWidth: 150 }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

const th = { padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' }
const td = { padding: '9px 12px', fontSize: 12, borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }
const card = { background: 'var(--t-surface)', border: '1px solid var(--t-line)' }

export default function Payroll() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const flagEnabled = useFeatureFlag('payroll_detail')
  const person = session?.person || {}
  const roleName = person.role_name || ''
  const isManager = /admin|owner|coo|ceo|cfo|hr|manager|head|lead/i.test(roleName)

  const [data, setData] = useState(null)   // null = loading
  const [error, setError] = useState('')
  const [drill, setDrill] = useState(null)
  const [tab, setTab] = useState('period')

  useEffect(() => {
    let live = true
    setData(null); setError('')
    sb.rpc('payroll_summary', { p_node_ids: locationIds || null, p_person_id: isManager ? null : (person.id || null) })
      .then(({ data: d, error: e }) => {
        if (!live) return
        if (e) { setError(e.message); setData({ people: [], pay_runs: [] }); return }
        setData(d || { people: [], pay_runs: [] })
      })
    return () => { live = false }
  }, [JSON.stringify(locationIds), person.id, isManager])

  const people = data?.people || []
  const runs = data?.pay_runs || []
  const period = data?.current_period || null
  const totals = useMemo(() => ({
    heads: people.length,
    hours: people.reduce((s, p) => s + (Number(p.hours_period) || 0), 0),
    ot: people.reduce((s, p) => s + (Number(p.ot_period) || 0), 0),
    gross: people.some(p => p.indicative_gross != null) ? people.reduce((s, p) => s + (Number(p.indicative_gross) || 0), 0) : null,
    provisional: people.filter(p => p.rate_provisional).length,
    noRate: people.filter(p => p.rate == null).length,
  }), [people])

  if (!flagEnabled) return <FeatureDisabled />

  const PEOPLE_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name },
    { key: 'role_name', label: 'Role', value: r => r.role_name || '—' },
    { key: 'node_name', label: 'Department', value: r => r.node_name || '—' },
    { key: 'rate', label: 'Rate', value: r => r.rate == null ? '—' : `$${Number(r.rate).toFixed(2)}/h${r.rate_provisional ? ' (provisional)' : ''}`, align: 'right' },
    { key: 'hours_period', label: 'Hours', value: r => hrs(r.hours_period), align: 'right' },
    { key: 'ot_period', label: 'OT', value: r => hrs(r.ot_period), align: 'right' },
    { key: 'indicative_gross', label: 'Indicative gross', value: r => money(r.indicative_gross), align: 'right' },
  ]
  const RUN_COLS = [
    { key: 'run_no', label: 'Run', value: r => r.run_no || r.id.slice(0, 8) },
    { key: 'period', label: 'Period', value: r => `${r.period_start || '—'} → ${r.period_end || '—'}` },
    { key: 'pay_date', label: 'Pay date', value: r => r.pay_date || '—' },
    { key: 'status', label: 'Status', value: r => r.status || '—' },
    { key: 'gross', label: 'Gross', value: r => money(r.gross), align: 'right' },
    { key: 'deductions', label: 'Deductions', value: r => money(r.deductions), align: 'right' },
    { key: 'net', label: 'Net', value: r => money(r.net), align: 'right' },
    { key: 'lines', label: 'Lines (in scope)', value: r => r.lines_in_scope, align: 'right' },
  ]

  return (
    <div style={{ padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' }}>Payroll</h1>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3, maxWidth: 760 }}>
            Payroll is run in the OS (Finance › Pay Runs, 280E cost classes). This page shows the current pay period, each person&rsquo;s recorded hours and rate, and the pay runs the OS has recorded. Nothing here is a pay stub until a pay run exists.
          </div>
          {error && <div style={{ fontSize: 11, color: 'var(--t-danger)', marginTop: 4 }}>Could not read payroll: {error}</div>}
          {totals.provisional > 0 && <div style={{ fontSize: 11, color: 'var(--t-warn)', marginTop: 4 }}>{totals.provisional} of {totals.heads} rates are the OS&rsquo;s provisional placeholders &mdash; indicative gross is indicative until HR sets real wages.</div>}
        </div>
        <a href="/#pay_runs" style={{ fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-accent)', textDecoration: 'none' }}>Open OS › Pay Runs →</a>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
        <KTile label="Pay period" value={period ? `${period.start} → ${period.end}` : '—'} sub={period ? `pay date ${period.pay_date || '—'} · ${period.frequency || ''}` : 'no pay period set in the OS (Finance › Pay Periods)'} color={period ? 'var(--t-accent)' : 'var(--t-text-muted)'} />
        <KTile label="People" value={data === null ? '…' : totals.heads} sub="in scope with a person record" onClick={() => setDrill({ title: 'People in scope', subtitle: `${people.length} people`, columns: PEOPLE_COLS, rows: people, accent: 'var(--t-accent)' })} />
        <KTile label="Hours this period" value={hrs(totals.hours)} sub={`${hrs(totals.ot)} overtime · from recorded punches`} />
        <KTile label="Indicative gross" value={money(totals.gross)} sub={totals.noRate > 0 ? `${totals.noRate} without a rate` : 'hours × rate (OT × 1.5)'} alert={totals.provisional > 0 ? 'amber' : undefined} />
        <KTile label="Pay runs recorded" value={data === null ? '…' : runs.length} sub={runs.length ? `latest ${runs[0].status || ''} ${runs[0].pay_date || ''}` : 'none yet in the OS'} color={runs.length ? 'var(--t-success)' : 'var(--t-text-muted)'} onClick={() => setDrill({ title: 'Pay runs', subtitle: `${runs.length} recorded`, columns: RUN_COLS, rows: runs, accent: 'var(--t-success)' })} />
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 16 }}>
        {[['period', 'This period'], ['runs', 'Pay runs']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: 'none', border: 'none', borderBottom: tab === k ? '2px solid var(--t-accent)' : '2px solid transparent', color: tab === k ? 'var(--t-accent)' : 'var(--t-text-muted)', padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {tab === 'period' && (
        <div style={card}>
          <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{PEOPLE_COLS.map(c => <th key={c.key} style={{ ...th, textAlign: c.align || 'left', position: 'sticky', top: 0 }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data === null && <tr><td colSpan={PEOPLE_COLS.length} style={{ ...td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>Reading the period…</td></tr>}
                {data !== null && people.length === 0 && <tr><td colSpan={PEOPLE_COLS.length} style={{ ...td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No people in scope.</td></tr>}
                {people.map(r => (
                  <tr key={r.person_id}>
                    {PEOPLE_COLS.map(c => <td key={c.key} style={{ ...td, textAlign: c.align || 'left', color: c.key === 'rate' && r.rate_provisional ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: c.key === 'full_name' ? 600 : 500 }}>{c.value(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <div style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{RUN_COLS.map(c => <th key={c.key} style={{ ...th, textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data !== null && runs.length === 0 && <tr><td colSpan={RUN_COLS.length} style={{ ...td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No pay run has been recorded in the OS yet. When Finance runs payroll (OS › Finance › Pay Runs) the runs and their lines appear here.</td></tr>}
                {runs.map(r => (
                  <tr key={r.id}>
                    {RUN_COLS.map(c => <td key={c.key} style={{ ...td, textAlign: c.align || 'left' }}>{c.value(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
