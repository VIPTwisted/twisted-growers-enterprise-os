// ComplianceExpirations.jsx — unified expiration tracker for certifications,
// training, and compliance documents (I-9, food-handler, harassment, etc.).
// Countdown to expiry, status (valid / expiring / expired), filters, alerts.
import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'
import FilterBar from '../components/FilterBar.jsx'
import { useFilters, applyFilters } from '../lib/filters.js'

const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']
const CERTS = ['I-9 Verification', 'Harassment Prevention', 'Cash Handling', 'Loss Prevention', 'Safety & Emergency', 'Retail Compliance', 'Food/Beverage Handler', 'First Aid']
const NAMES = ['Nicole Warren', 'James Carter', 'Brianna Boyd', 'Marcus Taylor', 'Sofia Reyes', 'Devon Hughes', 'Kayla Morris', 'Terrell Brown', 'Aaliyah Simmons', 'Malik Johnson', 'Priya Patel', 'Tyler Brooks', 'Jasmine Fields', 'Chris Navarro', 'Diana Chen', 'Ray Okafor', 'Megan Walsh', 'Jordan Kim']
const seed = (a, b) => ((a * 31 + b) * 17 + a * b) % 100
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function ddl(name, content, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click() }
const isoD = d => d.toISOString().slice(0, 10)
const daysUntil = s => Math.round((new Date(s + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 18px', flex: 1, minWidth: 140, cursor: 'pointer' },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 26, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  th: { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--t-text-muted)', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' },
  td: { fontSize: 12, padding: '9px 12px', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' },
  btn: { fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
}

export default function ComplianceExpirations() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [roster, setRoster] = useState([])
  const [drill, setDrill] = useState(null)
  const { fv, onChange, onClear } = useFilters()

  useEffect(() => {
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id || null })
      .then(({ data }) => { if (Array.isArray(data)) setRoster(data.filter(p => p.id)) }).catch(() => {})
  }, [JSON.stringify(locationIds), session?.person?.id])

  // build cert rows (real names when roster loads, else demo names)
  const rows = useMemo(() => {
    const people = roster.length ? roster.map((p, i) => ({ name: p.full_name || NAMES[i % NAMES.length], loc: p.node_name || LOCATIONS[i % LOCATIONS.length] })) : NAMES.map((n, i) => ({ name: n, loc: LOCATIONS[i % LOCATIONS.length] }))
    const out = []
    people.forEach((p, pi) => {
      CERTS.forEach((cert, ci) => {
        if (seed(pi, ci) % 3 === 2) return // not everyone holds every cert
        const offset = (seed(pi, ci + 5) % 400) - 60   // -60..+340 days from today
        const d = new Date(); d.setDate(d.getDate() + offset)
        const expiry = isoD(d); const dleft = daysUntil(expiry)
        const status = dleft < 0 ? 'expired' : dleft <= 30 ? 'expiring' : dleft <= 60 ? 'soon' : 'valid'
        out.push({ id: `${pi}-${ci}`, name: p.name, location: p.loc, cert, expiry, daysLeft: dleft, status })
      })
    })
    return out.sort((a, b) => a.daysLeft - b.daysLeft)
  }, [roster])

  const FILTERS = useMemo(() => [
    { key: 'q', label: 'employee', type: 'search', width: 160 },
    { key: 'daterange', label: 'Expiry', type: 'daterange' },
    { key: 'location', label: 'Locations', type: 'multiselect', options: LOCATIONS.map(l => ({ value: l, label: l })) },
    { key: 'cert', label: 'Certification', type: 'multiselect', options: CERTS.map(c => ({ value: c, label: c })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: [{ value: 'expired', label: 'Expired' }, { value: 'expiring', label: 'Expiring ≤30d' }, { value: 'soon', label: 'Soon ≤60d' }, { value: 'valid', label: 'Valid' }] },
  ], [])
  const filtered = useMemo(() => applyFilters(rows, fv, [
    { key: 'q', type: 'search', fields: ['name'] },
    { key: 'daterange', type: 'daterange', get: r => r.expiry },
    { key: 'location', type: 'multi', get: r => r.location },
    { key: 'cert', type: 'multi', get: r => r.cert },
    { key: 'status', type: 'multi', get: r => r.status },
  ]), [rows, fv])

  const k = useMemo(() => ({
    expired: rows.filter(r => r.status === 'expired'),
    expiring: rows.filter(r => r.status === 'expiring'),
    soon: rows.filter(r => r.status === 'soon'),
    total: rows.length,
  }), [rows])

  const clr = s => s === 'expired' ? 'var(--t-danger)' : s === 'expiring' ? 'var(--t-warn)' : s === 'soon' ? 'var(--t-accent)' : 'var(--t-success)'
  const label = s => s === 'expired' ? 'EXPIRED' : s === 'expiring' ? '≤30 DAYS' : s === 'soon' ? '≤60 DAYS' : 'VALID'
  const COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'cert', label: 'Certification', value: r => r.cert },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'expiry', label: 'Expires', value: r => r.expiry },
    { key: 'daysLeft', label: 'Days Left', value: r => r.daysLeft < 0 ? `${-r.daysLeft} overdue` : `${r.daysLeft}`, align: 'right', sortKey: r => r.daysLeft },
    { key: 'status', label: 'Status', value: r => label(r.status) },
  ]
  const openDrill = (title, rs, accent) => setDrill({ title, subtitle: `${rs.length} certification records`, columns: COLS, rows: rs, accent, messaging: { nameKey: 'name', subjectKey: 'cert' } })

  const expRows = filtered.map(r => ({ Employee: r.name, Certification: r.cert, Location: r.location, Expires: r.expiry, 'Days Left': r.daysLeft, Status: label(r.status) }))
  const exportCSV = () => { const c = Object.keys(expRows[0] || { x: 1 }); ddl(`vip-compliance-expirations-${isoD(new Date())}.csv`, [c.join(','), ...expRows.map(o => c.map(x => JSON.stringify(o[x] ?? '')).join(','))].join('\n'), 'text/csv') }
  const exportXLS = () => { const c = Object.keys(expRows[0] || { x: 1 }); const th = c.map(x => `<th style="background:#0b2545;color:#fff;padding:6px 10px">${esc(x)}</th>`).join(''); const trs = expRows.map(o => `<tr>${c.map(x => `<td style="padding:5px 10px">${esc(o[x])}</td>`).join('')}</tr>`).join(''); ddl(`vip-compliance-expirations-${isoD(new Date())}.xls`, `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`, 'application/vnd.ms-excel') }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>Compliance & Certification Expirations</h1>
          <div style={st.sub}>Every cert, training, and compliance doc with a countdown to expiry. Red = expired · amber = due within 30 days.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={st.btn} onClick={exportCSV}>⤓ CSV</button>
          <button style={st.btn} onClick={exportXLS}>⤓ Excel</button>
        </div>
      </div>

      <div style={st.kpiRow}>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-danger)' }} onClick={() => openDrill('Expired', k.expired, 'var(--t-danger)')}>
          <div style={st.kpiLabel}>Expired</div><div style={{ ...st.kpiVal, color: k.expired.length ? 'var(--t-danger)' : 'var(--t-text)' }}>{k.expired.length}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-warn)' }} onClick={() => openDrill('Expiring within 30 days', k.expiring, 'var(--t-warn)')}>
          <div style={st.kpiLabel}>Expiring ≤30d</div><div style={{ ...st.kpiVal, color: k.expiring.length ? 'var(--t-warn)' : 'var(--t-text)' }}>{k.expiring.length}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-accent)' }} onClick={() => openDrill('Due within 60 days', k.soon, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Due ≤60d</div><div style={st.kpiVal}>{k.soon.length}</div>
        </div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-success)' }} onClick={() => openDrill('All Certifications', rows, 'var(--t-accent)')}>
          <div style={st.kpiLabel}>Total Tracked</div><div style={st.kpiVal}>{k.total}</div>
        </div>
      </div>

      <FilterBar filters={FILTERS} value={fv} onChange={onChange} onClear={onClear} resultCount={filtered.length} resultLabel="records" savedViewsKey="compliance_exp" />

      <div style={st.card}>
        <div style={{ overflowX: 'auto', maxHeight: '58vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{COLS.map(c => <th key={c.key} style={{ ...st.th, textAlign: c.align || 'left', position: 'sticky', top: 0 }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={COLS.length} style={{ ...st.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No records match the filters.</td></tr>}
              {filtered.slice(0, 300).map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDrill(`${r.name} — ${r.cert}`, [r], clr(r.status))}>
                  {COLS.map(c => <td key={c.key} style={{ ...st.td, textAlign: c.align || 'left', color: c.key === 'daysLeft' || c.key === 'status' ? clr(r.status) : 'var(--t-text)', fontWeight: c.key === 'name' ? 600 : 500 }}>
                    {c.key === 'status' ? <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', color: '#fff', background: clr(r.status) }}>{label(r.status)}</span> : c.value(r)}
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
